"""
Owner Settings API - Fuel pricing and allowable losses
Station-aware: all data lives in ctx["storage"]
"""
from fastapi import APIRouter, Depends
from ...models.models import FuelSettings, SystemSettings, ValidationThresholds
from .auth import get_station_context

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
    storage['fuel_settings']["diesel_price_per_liter"] = settings.diesel_price_per_liter
    storage['fuel_settings']["petrol_price_per_liter"] = settings.petrol_price_per_liter
    storage['fuel_settings']["diesel_allowable_loss_percent"] = settings.diesel_allowable_loss_percent
    storage['fuel_settings']["petrol_allowable_loss_percent"] = settings.petrol_allowable_loss_percent

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
    storage['system_settings']["business_name"] = settings.business_name
    storage['system_settings']["license_key"] = settings.license_key
    storage['system_settings']["contact_email"] = settings.contact_email
    storage['system_settings']["contact_phone"] = settings.contact_phone
    storage['system_settings']["license_expiry_date"] = settings.license_expiry_date
    storage['system_settings']["station_location"] = settings.station_location
    # software_version is read-only, not updated from request

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
    storage = ctx["storage"]
    storage['validation_thresholds']["pass_threshold"] = thresholds.pass_threshold
    storage['validation_thresholds']["warning_threshold"] = thresholds.warning_threshold
    storage['validation_thresholds']["meter_discrepancy_threshold"] = thresholds.meter_discrepancy_threshold

    return {
        "status": "success",
        "message": "Validation thresholds updated successfully",
        "thresholds": storage['validation_thresholds']
    }
