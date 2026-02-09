"""
Sales Calculator Service
Calculates daily sales from opening and closing readings
"""

from datetime import datetime
import uuid
from typing import Tuple


# Fuel pricing (should be loaded from settings/database in production)
FUEL_PRICES = {
    "Diesel": 25.50,  # Per liter
    "Petrol": 27.00   # Per liter
}

ALLOWABLE_DISCREPANCY_PERCENT = 0.03  # 0.03%


def calculate_discrepancy_percent(value1: float, value2: float) -> float:
    """
    Calculate percentage discrepancy between two values

    Args:
        value1: First value
        value2: Second value

    Returns:
        Percentage difference (always positive)
    """
    if value1 == 0 and value2 == 0:
        return 0.0

    # Use the average as the baseline for percentage calculation
    avg = (value1 + value2) / 2
    if avg == 0:
        return 0.0

    difference = abs(value1 - value2)
    percent_diff = (difference / avg) * 100

    return round(percent_diff, 4)


def validate_readings(
    mechanical_volume: float,
    electronic_volume: float,
    allowable_percent: float = ALLOWABLE_DISCREPANCY_PERCENT
) -> Tuple[str, str]:
    """
    Validate that mechanical and electronic readings match within tolerance

    Args:
        mechanical_volume: Volume from mechanical reading
        electronic_volume: Volume from electronic reading
        allowable_percent: Maximum allowable discrepancy percentage

    Returns:
        Tuple of (status, message)
        - status: PASS or FAIL
        - message: Human-readable validation message
    """
    discrepancy = calculate_discrepancy_percent(mechanical_volume, electronic_volume)

    if discrepancy <= allowable_percent:
        status = "PASS"
        message = f"Readings match within tolerance ({discrepancy:.4f}% ≤ {allowable_percent}%)"
    else:
        status = "FAIL"
        message = f"Readings discrepancy ({discrepancy:.4f}%) exceeds allowable limit ({allowable_percent}%). Sale cannot be processed."

    return status, message


def get_fuel_price(fuel_type: str) -> float:
    """
    Get unit price for fuel type

    Args:
        fuel_type: Type of fuel (Diesel or Petrol)

    Returns:
        Unit price per liter
    """
    if fuel_type not in FUEL_PRICES:
        raise ValueError(f"Unknown fuel type: {fuel_type}. Must be 'Diesel' or 'Petrol'")

    return FUEL_PRICES[fuel_type]


def calculate_sale(
    shift_id: str,
    fuel_type: str,
    mechanical_opening: float,
    mechanical_closing: float,
    electronic_opening: float,
    electronic_closing: float
) -> dict:
    """
    Calculate daily sale from opening and closing readings

    Args:
        shift_id: ID of the shift
        fuel_type: Type of fuel (Diesel or Petrol)
        mechanical_opening: Mechanical opening reading
        mechanical_closing: Mechanical closing reading
        electronic_opening: Electronic opening reading
        electronic_closing: Electronic closing reading

    Returns:
        Dictionary with sale calculation details
    """
    # Calculate volumes
    mechanical_volume = mechanical_closing - mechanical_opening
    electronic_volume = electronic_closing - electronic_opening

    # Validate readings
    discrepancy_percent = calculate_discrepancy_percent(mechanical_volume, electronic_volume)
    validation_status, validation_message = validate_readings(mechanical_volume, electronic_volume)

    # Calculate average volume (use this for sale if validation passes)
    average_volume = (mechanical_volume + electronic_volume) / 2

    # Get fuel price
    try:
        unit_price = get_fuel_price(fuel_type)
    except ValueError as e:
        raise ValueError(str(e))

    # Calculate total amount
    # Only calculate if validation passes, otherwise set to 0
    total_amount = average_volume * unit_price if validation_status == "PASS" else 0.0

    # Generate sale ID
    sale_id = f"SALE-{datetime.now().strftime('%Y%m%d')}-{str(uuid.uuid4())[:8].upper()}"

    # Create sale record
    sale = {
        "sale_id": sale_id,
        "shift_id": shift_id,
        "fuel_type": fuel_type,
        "mechanical_opening": mechanical_opening,
        "mechanical_closing": mechanical_closing,
        "electronic_opening": electronic_opening,
        "electronic_closing": electronic_closing,
        "mechanical_volume": mechanical_volume,
        "electronic_volume": electronic_volume,
        "discrepancy_percent": discrepancy_percent,
        "validation_status": validation_status,
        "average_volume": average_volume,
        "unit_price": unit_price,
        "total_amount": round(total_amount, 2),
        "validation_message": validation_message
    }

    return sale
