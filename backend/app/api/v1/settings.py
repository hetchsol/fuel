"""
Owner Settings API - Fuel pricing and allowable losses
Station-aware: all data lives in ctx["storage"]
"""
import re
import json
import os
from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime
from ...models.models import (
    FuelSettings, SystemSettings, ValidationThresholds, EmailSettings,
    TaxLevySettings, StockAlertSettings, ReconciliationToleranceSettings,
    ScheduledPriceChange,
)
from .auth import get_station_context, require_manager_or_owner, require_owner
from ...services.audit_service import log_audit_event
from ...services.notification_service import create_notification
from ...database.station_files import load_station_json, save_station_json

router = APIRouter()


@router.get("/fuel", response_model=FuelSettings)
def get_fuel_settings(ctx: dict = Depends(get_station_context)):
    """
    Get current fuel pricing and allowable loss settings
    """
    storage = ctx["storage"]
    return FuelSettings(**storage.setdefault('fuel_settings', {}))

@router.put("/fuel")
def update_fuel_settings(settings: FuelSettings, ctx: dict = Depends(get_station_context)):
    """
    Update fuel pricing and allowable loss settings
    """
    storage = ctx["storage"]
    old_settings = dict(storage.setdefault('fuel_settings', {}))
    storage.setdefault('fuel_settings', {})["diesel_price_per_liter"] = settings.diesel_price_per_liter
    storage.setdefault('fuel_settings', {})["petrol_price_per_liter"] = settings.petrol_price_per_liter
    storage.setdefault('fuel_settings', {})["diesel_allowable_loss_percent"] = settings.diesel_allowable_loss_percent
    storage.setdefault('fuel_settings', {})["petrol_allowable_loss_percent"] = settings.petrol_allowable_loss_percent
    storage.setdefault('fuel_settings', {})["nozzle_allowable_loss_liters"] = settings.nozzle_allowable_loss_liters

    log_audit_event(
        station_id=ctx["station_id"],
        action="price_change",
        performed_by=ctx["username"],
        entity_type="fuel_settings",
        details={"old": old_settings, "new": dict(storage.setdefault('fuel_settings', {}))},
    )

    changes = []
    if old_settings.get("diesel_price_per_liter") != settings.diesel_price_per_liter:
        changes.append(f"Diesel: {old_settings.get('diesel_price_per_liter')} -> {settings.diesel_price_per_liter}")
    if old_settings.get("petrol_price_per_liter") != settings.petrol_price_per_liter:
        changes.append(f"Petrol: {old_settings.get('petrol_price_per_liter')} -> {settings.petrol_price_per_liter}")
    if changes:
        create_notification(
            station_id=ctx["station_id"],
            type="FUEL_PRICE_CHANGE",
            severity="high",
            title="Fuel Price Changed",
            message="Price updated: " + ", ".join(changes),
            entity_type="settings",
            entity_id="fuel_settings",
            created_by=ctx["username"],
        )

    return {
        "status": "success",
        "message": "Settings updated successfully",
        "settings": storage.setdefault('fuel_settings', {})
    }

@router.get("/fuel/scheduled-prices")
def get_scheduled_prices(ctx: dict = Depends(get_station_context)):
    """Get all scheduled price changes for this station."""
    station_id = ctx["station_id"]
    scheduled = load_station_json(station_id, 'scheduled_price_changes.json', default=[])
    # Also sync with storage
    ctx["storage"]["scheduled_price_changes"] = scheduled
    return {"scheduled_prices": scheduled}


@router.post("/fuel/schedule-price", dependencies=[Depends(require_manager_or_owner)])
def schedule_price_change(data: ScheduledPriceChange, ctx: dict = Depends(get_station_context)):
    """Schedule a future price change. Owner/manager only."""
    station_id = ctx["station_id"]
    now = datetime.now()

    # Validate effective_time format
    effective_time = data.effective_time or "00:00"
    try:
        hour, minute = map(int, effective_time.split(":"))
        if not (0 <= hour <= 23 and 0 <= minute <= 59):
            raise ValueError
    except (ValueError, AttributeError):
        raise HTTPException(status_code=400, detail="effective_time must be in HH:MM 24-hour format")

    # Build the full effective datetime for comparison
    effective_dt = datetime.strptime(f"{data.effective_date} {effective_time}", "%Y-%m-%d %H:%M")
    if effective_dt <= now:
        raise HTTPException(status_code=400, detail="Effective date and time must be in the future")

    if data.fuel_type not in ("Diesel", "Petrol"):
        raise HTTPException(status_code=400, detail="fuel_type must be 'Diesel' or 'Petrol'")

    scheduled = load_station_json(station_id, 'scheduled_price_changes.json', default=[])

    # Prevent duplicate for same fuel_type + date + time
    for entry in scheduled:
        if (entry.get("fuel_type") == data.fuel_type
                and entry.get("effective_date") == data.effective_date
                and entry.get("effective_time", "00:00") == effective_time
                and not entry.get("applied")):
            raise HTTPException(status_code=400, detail=f"A price change for {data.fuel_type} on {data.effective_date} at {effective_time} is already scheduled")

    entry = {
        "fuel_type": data.fuel_type,
        "new_price_per_liter": data.new_price_per_liter,
        "effective_date": data.effective_date,
        "effective_time": effective_time,
        "old_price_per_liter": None,
        "created_by": ctx.get("user_id"),
        "created_at": now.isoformat(),
        "applied": False,
        "applied_at": None,
    }
    scheduled.append(entry)
    save_station_json(station_id, 'scheduled_price_changes.json', scheduled)
    ctx["storage"]["scheduled_price_changes"] = scheduled

    log_audit_event(
        station_id=station_id, action="price_change_scheduled",
        performed_by=ctx["username"], entity_type="fuel_settings",
        details={"fuel_type": data.fuel_type, "new_price": data.new_price_per_liter, "effective_date": data.effective_date, "effective_time": effective_time},
    )

    return {"status": "success", "message": f"{data.fuel_type} price K{data.new_price_per_liter} scheduled for {data.effective_date} at {effective_time}", "entry": entry}


@router.delete("/fuel/scheduled-price/{index}", dependencies=[Depends(require_manager_or_owner)])
def cancel_scheduled_price(index: int, ctx: dict = Depends(get_station_context)):
    """Cancel a pending (unapplied) scheduled price change. Owner/manager only."""
    station_id = ctx["station_id"]
    scheduled = load_station_json(station_id, 'scheduled_price_changes.json', default=[])

    if index < 0 or index >= len(scheduled):
        raise HTTPException(status_code=404, detail="Scheduled price not found")

    entry = scheduled[index]
    if entry.get("applied"):
        raise HTTPException(status_code=400, detail="Cannot cancel an already-applied price change")

    removed = scheduled.pop(index)
    save_station_json(station_id, 'scheduled_price_changes.json', scheduled)
    ctx["storage"]["scheduled_price_changes"] = scheduled

    log_audit_event(
        station_id=station_id, action="price_change_cancelled",
        performed_by=ctx["username"], entity_type="fuel_settings",
        details={"fuel_type": removed["fuel_type"], "new_price": removed["new_price_per_liter"], "effective_date": removed["effective_date"], "effective_time": removed.get("effective_time", "00:00")},
    )

    return {"status": "success", "message": "Scheduled price change cancelled"}


@router.get("/business-info")
def get_business_info(ctx: dict = Depends(get_station_context)):
    """Get business details for report headers. Returns raw data without validation."""
    sys = ctx["storage"].get('system_settings', {})
    return {
        "business_name": sys.get("business_name", ""),
        "station_location": sys.get("station_location", ""),
        "contact_phone": sys.get("contact_phone", ""),
        "contact_email": sys.get("contact_email", ""),
    }


@router.get("/system", response_model=SystemSettings)
def get_system_settings(ctx: dict = Depends(get_station_context)):
    """
    Get current system/business information and license details
    """
    storage = ctx["storage"]
    return SystemSettings(**storage.setdefault('system_settings', {}))

@router.put("/system")
def update_system_settings(settings: SystemSettings, ctx: dict = Depends(get_station_context)):
    """
    Update system/business information (software_version is read-only)
    """
    storage = ctx["storage"]
    old_settings = dict(storage.setdefault('system_settings', {}))
    storage.setdefault('system_settings', {})["business_name"] = settings.business_name
    storage.setdefault('system_settings', {})["license_key"] = settings.license_key
    storage.setdefault('system_settings', {})["contact_email"] = settings.contact_email
    storage.setdefault('system_settings', {})["contact_phone"] = settings.contact_phone
    storage.setdefault('system_settings', {})["license_expiry_date"] = settings.license_expiry_date
    storage.setdefault('system_settings', {})["station_location"] = settings.station_location
    storage.setdefault('system_settings', {})["setup_completed"] = settings.setup_completed
    # software_version is read-only, not updated from request

    log_audit_event(
        station_id=ctx["station_id"],
        action="settings_update",
        performed_by=ctx["username"],
        entity_type="system_settings",
        details={"old": old_settings, "new": dict(storage.setdefault('system_settings', {}))},
    )

    return {
        "status": "success",
        "message": "System settings updated successfully",
        "settings": storage.setdefault('system_settings', {})
    }

@router.get("/validation-thresholds", response_model=ValidationThresholds)
def get_validation_thresholds(ctx: dict = Depends(get_station_context)):
    """
    Get current validation thresholds for variance analysis
    """
    storage = ctx["storage"]
    return ValidationThresholds(**storage.setdefault('validation_thresholds', {}))

@router.put("/validation-thresholds")
def update_validation_thresholds(thresholds: ValidationThresholds, ctx: dict = Depends(get_station_context)):
    """
    Update validation thresholds for variance analysis (Owner only)

    These thresholds determine when readings are marked as PASS, WARNING, or FAIL:
    - PASS: variance <= pass_threshold
    - WARNING: pass_threshold < variance <= warning_threshold
    - FAIL: variance > warning_threshold
    """
    if thresholds.pass_threshold >= thresholds.warning_threshold:
        raise HTTPException(status_code=422, detail="pass_threshold must be less than warning_threshold")

    storage = ctx["storage"]
    old_thresholds = dict(storage.setdefault('validation_thresholds', {}))
    storage.setdefault('validation_thresholds', {})["pass_threshold"] = thresholds.pass_threshold
    storage.setdefault('validation_thresholds', {})["warning_threshold"] = thresholds.warning_threshold
    storage.setdefault('validation_thresholds', {})["meter_discrepancy_threshold"] = thresholds.meter_discrepancy_threshold

    log_audit_event(
        station_id=ctx["station_id"],
        action="threshold_update",
        performed_by=ctx["username"],
        entity_type="validation_thresholds",
        details={"old": old_thresholds, "new": dict(storage.setdefault('validation_thresholds', {}))},
    )

    create_notification(
        station_id=ctx["station_id"],
        type="THRESHOLD_CHANGE",
        severity="medium",
        title="Validation Thresholds Updated",
        message=f"Pass: {thresholds.pass_threshold}%, Warning: {thresholds.warning_threshold}%",
        entity_type="settings",
        entity_id="validation_thresholds",
        created_by=ctx["username"],
    )

    return {
        "status": "success",
        "message": "Validation thresholds updated successfully",
        "thresholds": storage.setdefault('validation_thresholds', {})
    }


# ── Email Settings ────────────────────────────────────────────

def _load_email_settings(station_id: str) -> dict:
    default = {"enabled": False, "from_address": "NextStop <onboarding@resend.dev>", "recipients": []}
    return load_station_json(station_id, "email_settings.json", default=default)


def _save_email_settings(station_id: str, data: dict):
    save_station_json(station_id, "email_settings.json", data)


EMAIL_REGEX = re.compile(r"^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$")


@router.get("/email")
def get_email_settings(ctx: dict = Depends(get_station_context)):
    """Get current email notification settings"""
    return _load_email_settings(ctx["station_id"])


@router.put("/email")
def update_email_settings(settings: EmailSettings, ctx: dict = Depends(get_station_context)):
    """Update email notification settings (Owner only)"""
    # Validate email addresses
    for email in settings.recipients:
        if not EMAIL_REGEX.match(email):
            raise HTTPException(status_code=422, detail=f"Invalid email address: {email}")

    old_settings = _load_email_settings(ctx["station_id"])
    new_settings = {
        "enabled": settings.enabled,
        "from_address": settings.from_address,
        "recipients": settings.recipients,
    }
    _save_email_settings(ctx["station_id"], new_settings)

    log_audit_event(
        station_id=ctx["station_id"],
        action="email_settings_update",
        performed_by=ctx["username"],
        entity_type="email_settings",
        details={"old": old_settings, "new": new_settings},
    )

    return {
        "status": "success",
        "message": "Email settings updated successfully",
        "settings": new_settings,
    }


@router.post("/email/test")
def send_test_email(ctx: dict = Depends(get_station_context)):
    """Send a test email to verify configuration"""
    from ...services.email_service import send_test_email as _send_test
    result = _send_test(ctx["station_id"])
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("message", "Test email failed"))
    return result


# ── Tax & Levy Settings ─────────────────────────────────────

@router.get("/tax-levy")
def get_tax_levy_settings(ctx: dict = Depends(get_station_context)):
    """Get current VAT rate and fuel levy settings"""
    storage = ctx["storage"]
    return TaxLevySettings(**storage.setdefault('tax_levy_settings', {}))


@router.put("/tax-levy")
def update_tax_levy_settings(settings: TaxLevySettings, ctx: dict = Depends(get_station_context)):
    """Update VAT rate and fuel levy settings"""
    storage = ctx["storage"]
    old_settings = dict(storage.setdefault('tax_levy_settings', {}))
    storage['tax_levy_settings'] = {
        "vat_rate": settings.vat_rate,
        "fuel_levy_per_liter": settings.fuel_levy_per_liter,
    }

    log_audit_event(
        station_id=ctx["station_id"],
        action="tax_levy_update",
        performed_by=ctx["username"],
        entity_type="tax_levy_settings",
        details={"old": old_settings, "new": storage['tax_levy_settings']},
    )

    return {
        "status": "success",
        "message": "Tax & levy settings updated successfully",
        "settings": storage['tax_levy_settings'],
    }


# ── Stock Alert Settings ────────────────────────────────────

@router.get("/stock-alerts")
def get_stock_alert_settings(ctx: dict = Depends(get_station_context)):
    """Get current stock alert threshold settings"""
    storage = ctx["storage"]
    return StockAlertSettings(**storage.setdefault('stock_alert_settings', {}))


@router.put("/stock-alerts")
def update_stock_alert_settings(settings: StockAlertSettings, ctx: dict = Depends(get_station_context)):
    """Update stock alert threshold settings"""
    if settings.critical_stock_threshold_percent >= settings.low_stock_threshold_percent:
        raise HTTPException(
            status_code=422,
            detail="Critical threshold must be less than low stock threshold"
        )

    storage = ctx["storage"]
    old_settings = dict(storage.setdefault('stock_alert_settings', {}))
    storage['stock_alert_settings'] = {
        "low_stock_threshold_percent": settings.low_stock_threshold_percent,
        "critical_stock_threshold_percent": settings.critical_stock_threshold_percent,
    }

    log_audit_event(
        station_id=ctx["station_id"],
        action="stock_alert_update",
        performed_by=ctx["username"],
        entity_type="stock_alert_settings",
        details={"old": old_settings, "new": storage['stock_alert_settings']},
    )

    return {
        "status": "success",
        "message": "Stock alert settings updated successfully",
        "settings": storage['stock_alert_settings'],
    }


# ── Reconciliation Tolerance Settings ───────────────────────

@router.get("/reconciliation-tolerances")
def get_reconciliation_tolerance_settings(ctx: dict = Depends(get_station_context)):
    """Get current reconciliation tolerance settings"""
    storage = ctx["storage"]
    return ReconciliationToleranceSettings(**storage.setdefault('reconciliation_tolerance_settings', {}))


@router.put("/reconciliation-tolerances")
def update_reconciliation_tolerance_settings(settings: ReconciliationToleranceSettings, ctx: dict = Depends(get_station_context)):
    """Update reconciliation tolerance settings"""
    mode = settings.volume_tolerance_mode
    if mode not in ("percentage", "fixed", "hybrid", "tiered"):
        raise HTTPException(status_code=422, detail="volume_tolerance_mode must be 'percentage', 'fixed', 'hybrid', or 'tiered'")

    # Mode-conditional validation
    if mode == "fixed":
        if settings.volume_tolerance_minor >= settings.volume_tolerance_investigation:
            raise HTTPException(status_code=422, detail="Volume minor tolerance must be less than investigation tolerance")
    elif mode == "percentage":
        if settings.percent_tolerance_minor >= settings.percent_tolerance_investigation:
            raise HTTPException(status_code=422, detail="Percent minor tolerance must be less than investigation tolerance")
    elif mode == "hybrid":
        if settings.percent_tolerance_minor >= settings.percent_tolerance_investigation:
            raise HTTPException(status_code=422, detail="Percent minor tolerance must be less than investigation tolerance")
        if settings.volume_cap_minor > 0 and settings.volume_cap_investigation > 0:
            if settings.volume_cap_minor >= settings.volume_cap_investigation:
                raise HTTPException(status_code=422, detail="Volume cap minor must be less than volume cap investigation")
    elif mode == "tiered":
        if not settings.volume_tiers or len(settings.volume_tiers) == 0:
            raise HTTPException(status_code=422, detail="Tiered mode requires at least one volume tier")
        prev_up_to = 0
        for i, tier in enumerate(settings.volume_tiers):
            if tier.up_to_liters <= prev_up_to:
                raise HTTPException(status_code=422, detail=f"Tier {i+1}: up_to_liters must be greater than previous tier ({prev_up_to}L)")
            if tier.tolerance_minor >= tier.tolerance_investigation:
                raise HTTPException(status_code=422, detail=f"Tier {i+1}: minor tolerance must be less than investigation tolerance")
            prev_up_to = tier.up_to_liters

    # Cash validation (always applies)
    if settings.cash_tolerance_minor >= settings.cash_tolerance_investigation:
        raise HTTPException(status_code=422, detail="Cash minor tolerance must be less than investigation tolerance")

    storage = ctx["storage"]
    old_settings = dict(storage.setdefault('reconciliation_tolerance_settings', {}))

    storage['reconciliation_tolerance_settings'] = {
        "volume_tolerance_mode": mode,
        "volume_tolerance_minor": settings.volume_tolerance_minor,
        "volume_tolerance_investigation": settings.volume_tolerance_investigation,
        "volume_cap_minor": settings.volume_cap_minor,
        "volume_cap_investigation": settings.volume_cap_investigation,
        "percent_tolerance_minor": settings.percent_tolerance_minor,
        "percent_tolerance_investigation": settings.percent_tolerance_investigation,
        "volume_tiers": [t.model_dump() for t in settings.volume_tiers] if settings.volume_tiers else [],
        "cash_tolerance_minor": settings.cash_tolerance_minor,
        "cash_tolerance_investigation": settings.cash_tolerance_investigation,
        "min_volume_for_percent": settings.min_volume_for_percent,
    }

    log_audit_event(
        station_id=ctx["station_id"],
        action="reconciliation_tolerance_update",
        performed_by=ctx["username"],
        entity_type="reconciliation_tolerance_settings",
        details={"old": old_settings, "new": storage['reconciliation_tolerance_settings']},
    )

    return {
        "status": "success",
        "message": "Reconciliation tolerance settings updated successfully",
        "settings": storage['reconciliation_tolerance_settings'],
    }
