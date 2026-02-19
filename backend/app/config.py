"""
Centralized Configuration for Fuel Management System

This module contains all system-wide constants and configuration values.
All modules should import from here rather than defining their own constants.
"""

# ============================================================================
# FUEL PRICING (ZMW per liter)
# ============================================================================
# NOTE: These prices should match what's in the settings API
# If you need to change prices, update via the settings API endpoint
# These are default/initial values

DIESEL_PRICE_PER_LITER = 26.98  # ZMW per liter
PETROL_PRICE_PER_LITER = 29.92  # ZMW per liter

# ============================================================================
# ALLOWABLE LOSS PERCENTAGES
# ============================================================================
# Maximum acceptable fuel loss during delivery and operations
# Values are in percentage (e.g., 0.3 = 0.3%)

DIESEL_ALLOWABLE_LOSS_PERCENT = 0.3  # 0.3% allowable loss for diesel
PETROL_ALLOWABLE_LOSS_PERCENT = 0.5  # 0.5% allowable loss for petrol

# ============================================================================
# SYSTEM/BUSINESS INFORMATION
# ============================================================================
# Default values for business/license information
# These can be updated at runtime via the settings API

BUSINESS_NAME = "Fuel Management System"
LICENSE_KEY = "DEMO-LICENSE-2025"
CONTACT_EMAIL = ""
CONTACT_PHONE = ""
LICENSE_EXPIRY_DATE = ""  # YYYY-MM-DD format
SOFTWARE_VERSION = "1.0.0"
STATION_LOCATION = ""

# ============================================================================
# TOLERANCE VALUES FOR READINGS
# ============================================================================
# Used for validating fuel readings and detecting discrepancies

TOLERANCE_ABSOLUTE = 0.2  # Absolute tolerance for readings
TOLERANCE_PERCENT = 0.05   # Percentage tolerance (5%)

# ============================================================================
# TANK SPECIFICATIONS
# ============================================================================
# Physical tank parameters

# Tank conversion factor: liters per centimeter of dip reading
# This is based on the tank's diameter and shape
# For a cylindrical tank with diameter ~100cm, ~785.4 liters per cm
TANK_CONVERSION_FACTOR = 785.4  # liters per cm

# Default tank capacities (can be overridden in tank_data)
DIESEL_TANK_CAPACITY = 20000.0  # liters
PETROL_TANK_CAPACITY = 25000.0  # liters

# ============================================================================
# TANK IDS
# ============================================================================
# Standardized tank identifiers used throughout the system

TANK_ID_DIESEL = "TANK-DIESEL"
TANK_ID_PETROL = "TANK-PETROL"

# ============================================================================
# FUEL TYPES
# ============================================================================
# Standardized fuel type names

FUEL_TYPE_DIESEL = "Diesel"
FUEL_TYPE_PETROL = "Petrol"

# ============================================================================
# BUSINESS RULES
# ============================================================================

# Low stock warning threshold (percentage)
LOW_STOCK_THRESHOLD_PERCENT = 25.0

# Critical stock threshold (percentage)
CRITICAL_STOCK_THRESHOLD_PERCENT = 10.0

# ============================================================================
# API CONFIGURATION
# ============================================================================

# Default pagination limit for list endpoints
DEFAULT_PAGE_LIMIT = 100

# Maximum number of flags/discrepancies to return
MAX_FLAGS_RETURN = 50

# ============================================================================
# VAT / LEVY CONSTANTS (Zambia)
# ============================================================================

VAT_RATE = 0.16              # 16% VAT
FUEL_LEVY_PER_LITER = 1.44   # ZMW levy deduction per liter
VAT_INCLUSIVE_DIVISOR = 1.16  # 1 + VAT_RATE

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================


def get_fuel_price(fuel_type: str) -> float:
    """
    Get price per liter for a given fuel type

    Args:
        fuel_type: "Diesel" or "Petrol"

    Returns:
        Price per liter in ZMW

    Raises:
        ValueError: If fuel type is unknown
    """
    fuel_type_upper = fuel_type.upper()
    if "DIESEL" in fuel_type_upper:
        return DIESEL_PRICE_PER_LITER
    elif "PETROL" in fuel_type_upper or "GASOLINE" in fuel_type_upper:
        return PETROL_PRICE_PER_LITER
    else:
        raise ValueError(f"Unknown fuel type: {fuel_type}")


def get_allowable_loss_percent(fuel_type: str) -> float:
    """
    Get allowable loss percentage for a given fuel type

    Args:
        fuel_type: "Diesel" or "Petrol"

    Returns:
        Allowable loss percentage

    Raises:
        ValueError: If fuel type is unknown
    """
    fuel_type_upper = fuel_type.upper()
    if "DIESEL" in fuel_type_upper:
        return DIESEL_ALLOWABLE_LOSS_PERCENT
    elif "PETROL" in fuel_type_upper or "GASOLINE" in fuel_type_upper:
        return PETROL_ALLOWABLE_LOSS_PERCENT
    else:
        raise ValueError(f"Unknown fuel type: {fuel_type}")


def get_tank_id(fuel_type: str) -> str:
    """
    Get standard tank ID for a given fuel type

    Args:
        fuel_type: "Diesel" or "Petrol"

    Returns:
        Tank ID string

    Raises:
        ValueError: If fuel type is unknown
    """
    fuel_type_upper = fuel_type.upper()
    if "DIESEL" in fuel_type_upper:
        return TANK_ID_DIESEL
    elif "PETROL" in fuel_type_upper or "GASOLINE" in fuel_type_upper:
        return TANK_ID_PETROL
    else:
        raise ValueError(f"Unknown fuel type: {fuel_type}")


def convert_dip_to_volume(dip_reading_cm: float) -> float:
    """
    Convert dip reading in centimeters to volume in liters

    Args:
        dip_reading_cm: Dip reading in centimeters

    Returns:
        Volume in liters
    """
    return dip_reading_cm * TANK_CONVERSION_FACTOR


def convert_volume_to_dip(volume_liters: float) -> float:
    """
    Convert volume in liters to dip reading in centimeters

    Args:
        volume_liters: Volume in liters

    Returns:
        Dip reading in centimeters
    """
    return volume_liters / TANK_CONVERSION_FACTOR


def resolve_fuel_price(fuel_type: str, storage: dict = None) -> float:
    """
    Resolve the current fuel price from runtime settings, falling back to config constants.

    Priority:
    1. storage['fuel_settings'] (set via Settings API at runtime)
    2. Config constants (DIESEL_PRICE_PER_LITER / PETROL_PRICE_PER_LITER)

    Args:
        fuel_type: "Diesel" or "Petrol"
        storage: Runtime storage dict (from station context)

    Returns:
        Price per liter in ZMW
    """
    # Try runtime settings first
    if storage:
        fuel_settings = storage.get('fuel_settings')
        if fuel_settings:
            fuel_type_upper = fuel_type.upper()
            if "DIESEL" in fuel_type_upper:
                price = fuel_settings.get('diesel_price_per_liter')
                if price is not None:
                    return float(price)
            elif "PETROL" in fuel_type_upper or "GASOLINE" in fuel_type_upper:
                price = fuel_settings.get('petrol_price_per_liter')
                if price is not None:
                    return float(price)

    # Fall back to config constants
    return get_fuel_price(fuel_type)
