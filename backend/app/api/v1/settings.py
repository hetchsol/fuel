"""
Owner Settings API - Fuel pricing and allowable losses
Station-aware: all data lives in ctx["storage"]
"""
import re
import json
import os
from fastapi import APIRouter, Depends, HTTPException
from ...models.models import FuelSettings, SystemSettings, ValidationThresholds, EmailSettings
from .auth import get_station_context
from ...services.audit_service import log_audit_event
from ...services.notification_service import create_notification
from ...database.station_files import get_station_file

router = APIRouter()


@router.get("/fuel", response_model=FuelSettings)
def get_fuel_settings(ctx: dict = Depends(get_station_context)):
    """
    Get current fuel pricing and allowable loss settings
    """
    storage = ctx["storage"]
    return FuelSettings(**storage['fuel_settings'])

@router.put("/fuel")
def update_fuel_settings(settings: FuelSettings, ctx: dict = Depends(get_station_context)):
    """
    Update fuel pricing and allowable loss settings
    """
    storage = ctx["storage"]
    old_settings = dict(storage['fuel_settings'])
    storage['fuel_settings']["diesel_price_per_liter"] = settings.diesel_price_per_liter
    storage['fuel_settings']["petrol_price_per_liter"] = settings.petrol_price_per_liter
    storage['fuel_settings']["diesel_allowable_loss_percent"] = settings.diesel_allowable_loss_percent
    storage['fuel_settings']["petrol_allowable_loss_percent"] = settings.petrol_allowable_loss_percent

    log_audit_event(
        station_id=ctx["station_id"],
        action="price_change",
        performed_by=ctx["username"],
        entity_type="fuel_settings",
        details={"old": old_settings, "new": dict(storage['fuel_settings'])},
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
        "settings": storage['fuel_settings']
    }

@router.get("/system", response_model=SystemSettings)
def get_system_settings(ctx: dict = Depends(get_station_context)):
    """
    Get current system/business information and license details
    """
    storage = ctx["storage"]
    return SystemSettings(**storage['system_settings'])

@router.put("/system")
def update_system_settings(settings: SystemSettings, ctx: dict = Depends(get_station_context)):
    """
    Update system/business information (software_version is read-only)
    """
    storage = ctx["storage"]
    old_settings = dict(storage['system_settings'])
    storage['system_settings']["business_name"] = settings.business_name
    storage['system_settings']["license_key"] = settings.license_key
    storage['system_settings']["contact_email"] = settings.contact_email
    storage['system_settings']["contact_phone"] = settings.contact_phone
    storage['system_settings']["license_expiry_date"] = settings.license_expiry_date
    storage['system_settings']["station_location"] = settings.station_location
    # software_version is read-only, not updated from request

    log_audit_event(
        station_id=ctx["station_id"],
        action="settings_update",
        performed_by=ctx["username"],
        entity_type="system_settings",
        details={"old": old_settings, "new": dict(storage['system_settings'])},
    )

    return {
        "status": "success",
        "message": "System settings updated successfully",
        "settings": storage['system_settings']
    }

@router.get("/validation-thresholds", response_model=ValidationThresholds)
def get_validation_thresholds(ctx: dict = Depends(get_station_context)):
    """
    Get current validation thresholds for variance analysis
    """
    storage = ctx["storage"]
    return ValidationThresholds(**storage['validation_thresholds'])

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
    old_thresholds = dict(storage['validation_thresholds'])
    storage['validation_thresholds']["pass_threshold"] = thresholds.pass_threshold
    storage['validation_thresholds']["warning_threshold"] = thresholds.warning_threshold
    storage['validation_thresholds']["meter_discrepancy_threshold"] = thresholds.meter_discrepancy_threshold

    log_audit_event(
        station_id=ctx["station_id"],
        action="threshold_update",
        performed_by=ctx["username"],
        entity_type="validation_thresholds",
        details={"old": old_thresholds, "new": dict(storage['validation_thresholds'])},
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
        "thresholds": storage['validation_thresholds']
    }


# ── Email Settings ────────────────────────────────────────────

def _load_email_settings(station_id: str) -> dict:
    filepath = get_station_file(station_id, "email_settings.json")
    if not os.path.exists(filepath):
        return {"enabled": False, "from_address": "NextStop <onboarding@resend.dev>", "recipients": []}
    try:
        with open(filepath, "r") as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError):
        return {"enabled": False, "from_address": "NextStop <onboarding@resend.dev>", "recipients": []}


def _save_email_settings(station_id: str, data: dict):
    filepath = get_station_file(station_id, "email_settings.json")
    with open(filepath, "w") as f:
        json.dump(data, f, indent=2)


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
