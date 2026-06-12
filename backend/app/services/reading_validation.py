"""
Reading Validation Service
Validates mechanical, electronic, and dip readings for consistency
"""

from datetime import datetime
from typing import Tuple
import uuid




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


def validate_reading(
    mechanical_reading: float,
    electronic_reading: float,
    dip_reading_liters: float,
    allowable_discrepancy_percent: float = 0.03
) -> Tuple[str, float, str]:
    """
    Validate that three readings are within allowable discrepancy

    Args:
        mechanical_reading: Mechanical meter reading
        electronic_reading: Electronic meter reading
        dip_reading_liters: Tank dip reading (already converted to liters)
        allowable_discrepancy_percent: Maximum allowable discrepancy (default 0.03%)

    Returns:
        Tuple of (status, max_discrepancy, message)
        - status: PASS, WARNING, or FAIL
        - max_discrepancy: Maximum discrepancy percentage found
        - message: Human-readable validation message
    """
    # Calculate discrepancies between all three readings
    disc_mech_elec = calculate_discrepancy_percent(mechanical_reading, electronic_reading)
    disc_mech_dip = calculate_discrepancy_percent(mechanical_reading, dip_reading_liters)
    disc_elec_dip = calculate_discrepancy_percent(electronic_reading, dip_reading_liters)

    # Find maximum discrepancy
    max_discrepancy = max(disc_mech_elec, disc_mech_dip, disc_elec_dip)

    # Determine validation status
    if max_discrepancy <= allowable_discrepancy_percent:
        status = "PASS"
        message = f"All readings match within acceptable tolerance ({max_discrepancy:.4f}% ≤ {allowable_discrepancy_percent}%)"
    elif max_discrepancy <= (allowable_discrepancy_percent * 2):
        status = "WARNING"
        message = f"Readings discrepancy ({max_discrepancy:.4f}%) exceeds tolerance ({allowable_discrepancy_percent}%) but within warning range"
    else:
        status = "FAIL"
        message = f"Readings discrepancy ({max_discrepancy:.4f}%) significantly exceeds tolerance ({allowable_discrepancy_percent}%). Investigation required."

    return status, max_discrepancy, message


def create_validated_reading(
    shift_id: str,
    tank_id: str,
    reading_type: str,
    mechanical_reading: float,
    electronic_reading: float,
    dip_reading_cm: float,
    recorded_by: str,
    notes: str = None,
    station_id: str = None,
) -> dict:
    """
    Create a validated reading record with full validation.
    Dip-to-volume uses the uploaded calibration chart for the tank.
    """
    from .dip_conversion import dip_to_volume
    from ..api.v1.tank_calibrations import ensure_calibration_loaded
    if station_id:
        ensure_calibration_loaded(tank_id, station_id)
    dip_reading_liters = dip_to_volume(tank_id, dip_reading_cm)

    # Calculate all discrepancies
    disc_mech_elec = calculate_discrepancy_percent(mechanical_reading, electronic_reading)
    disc_mech_dip = calculate_discrepancy_percent(mechanical_reading, dip_reading_liters)
    disc_elec_dip = calculate_discrepancy_percent(electronic_reading, dip_reading_liters)

    # Validate readings
    status, max_discrepancy, message = validate_reading(
        mechanical_reading,
        electronic_reading,
        dip_reading_liters
    )

    # Generate unique ID
    reading_id = f"VR-{datetime.now().strftime('%Y%m%d')}-{str(uuid.uuid4())[:8].upper()}"

    # Create validated reading record
    validated_reading = {
        "reading_id": reading_id,
        "shift_id": shift_id,
        "tank_id": tank_id,
        "reading_type": reading_type,
        "mechanical_reading": mechanical_reading,
        "electronic_reading": electronic_reading,
        "dip_reading_cm": dip_reading_cm,
        "dip_reading_liters": dip_reading_liters,
        "recorded_by": recorded_by,
        "timestamp": datetime.now().isoformat(),
        "validation_status": status,
        "discrepancy_mech_elec_percent": disc_mech_elec,
        "discrepancy_mech_dip_percent": disc_mech_dip,
        "discrepancy_elec_dip_percent": disc_elec_dip,
        "max_discrepancy_percent": max_discrepancy,
        "validation_message": message,
        "notes": notes or ""
    }

    return validated_reading
