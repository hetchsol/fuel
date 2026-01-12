"""
Owner Settings API - Fuel pricing and allowable losses
"""
from fastapi import APIRouter
from ...models.models import FuelSettings, SystemSettings, ValidationThresholds
from ...config import (
    DIESEL_PRICE_PER_LITER,
    PETROL_PRICE_PER_LITER,
    DIESEL_ALLOWABLE_LOSS_PERCENT,
    PETROL_ALLOWABLE_LOSS_PERCENT,
    BUSINESS_NAME,
    LICENSE_KEY,
    CONTACT_EMAIL,
    CONTACT_PHONE,
    LICENSE_EXPIRY_DATE,
    SOFTWARE_VERSION,
    STATION_LOCATION
)

router = APIRouter()

# In-memory settings (in production, this would be in a database)
# Initialize with values from centralized config
fuel_settings = {
    "diesel_price_per_liter": DIESEL_PRICE_PER_LITER,
    "petrol_price_per_liter": PETROL_PRICE_PER_LITER,
    "diesel_allowable_loss_percent": DIESEL_ALLOWABLE_LOSS_PERCENT,
    "petrol_allowable_loss_percent": PETROL_ALLOWABLE_LOSS_PERCENT,
}

# System/business information settings (in production, would be in database)
# Initialize with values from centralized config
system_settings = {
    "business_name": BUSINESS_NAME,
    "license_key": LICENSE_KEY,
    "contact_email": CONTACT_EMAIL,
    "contact_phone": CONTACT_PHONE,
    "license_expiry_date": LICENSE_EXPIRY_DATE,
    "software_version": SOFTWARE_VERSION,
    "station_location": STATION_LOCATION,
}

# Validation thresholds (in production, would be in database)
validation_thresholds = {
    "pass_threshold": 0.5,  # PASS if variance <= 0.5%
    "warning_threshold": 1.0,  # WARNING if variance <= 1.0%, else FAIL
}

@router.get("/fuel", response_model=FuelSettings)
def get_fuel_settings():
    """
    Get current fuel pricing and allowable loss settings
    """
    return FuelSettings(**fuel_settings)

@router.put("/fuel")
def update_fuel_settings(settings: FuelSettings):
    """
    Update fuel pricing and allowable loss settings
    """
    fuel_settings["diesel_price_per_liter"] = settings.diesel_price_per_liter
    fuel_settings["petrol_price_per_liter"] = settings.petrol_price_per_liter
    fuel_settings["diesel_allowable_loss_percent"] = settings.diesel_allowable_loss_percent
    fuel_settings["petrol_allowable_loss_percent"] = settings.petrol_allowable_loss_percent

    return {
        "status": "success",
        "message": "Settings updated successfully",
        "settings": fuel_settings
    }

@router.get("/system", response_model=SystemSettings)
def get_system_settings():
    """
    Get current system/business information and license details
    """
    return SystemSettings(**system_settings)

@router.put("/system")
def update_system_settings(settings: SystemSettings):
    """
    Update system/business information (software_version is read-only)
    """
    system_settings["business_name"] = settings.business_name
    system_settings["license_key"] = settings.license_key
    system_settings["contact_email"] = settings.contact_email
    system_settings["contact_phone"] = settings.contact_phone
    system_settings["license_expiry_date"] = settings.license_expiry_date
    system_settings["station_location"] = settings.station_location
    # software_version is read-only, not updated from request

    return {
        "status": "success",
        "message": "System settings updated successfully",
        "settings": system_settings
    }

@router.get("/validation-thresholds", response_model=ValidationThresholds)
def get_validation_thresholds():
    """
    Get current validation thresholds for variance analysis
    """
    return ValidationThresholds(**validation_thresholds)

@router.put("/validation-thresholds")
def update_validation_thresholds(thresholds: ValidationThresholds):
    """
    Update validation thresholds for variance analysis (Owner only)

    These thresholds determine when readings are marked as PASS, WARNING, or FAIL:
    - PASS: variance <= pass_threshold
    - WARNING: pass_threshold < variance <= warning_threshold
    - FAIL: variance > warning_threshold
    """
    validation_thresholds["pass_threshold"] = thresholds.pass_threshold
    validation_thresholds["warning_threshold"] = thresholds.warning_threshold

    return {
        "status": "success",
        "message": "Validation thresholds updated successfully",
        "thresholds": validation_thresholds
    }
