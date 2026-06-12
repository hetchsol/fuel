"""
Tank Dip to Volume Conversion Service

Converts physical dip stick readings (in centimeters) to fuel volume (in liters).
Uses tank calibration charts/formulas specific to each tank.
"""

from typing import Dict, Optional
import math
import logging

logger = logging.getLogger(__name__)

# Dynamic calibration registry for tanks added at runtime
_dynamic_calibrations: Dict[str, dict] = {}


def register_tank_calibration(tank_id: str, chart_data: Dict[float, float], capacity: float = 50000, diameter: float = 250, length: float = 1000):
    """
    Register a calibration chart for a new tank at runtime.
    This is used when a new tank is created and we clone the calibration from a sibling tank.
    """
    _dynamic_calibrations[tank_id] = {
        "type": "cylindrical_horizontal",
        "capacity": capacity,
        "diameter": diameter,
        "length": length,
        "calibration_chart": dict(chart_data),
    }
    logger.info(f"Registered dynamic calibration for tank {tank_id}")


def _resolve_calibration(tank_id: str) -> dict:
    """
    Resolve calibration config for a tank_id from the in-memory registry.
    Raises ValueError if not loaded — callers must call ensure_calibration_loaded first.
    """
    if tank_id in _dynamic_calibrations:
        return _dynamic_calibrations[tank_id]
    raise ValueError(
        f"No calibration chart found for tank '{tank_id}'. "
        f"Upload a chart via Admin > Settings > Tank Calibration."
    )


def dip_to_volume(tank_id: str, dip_cm: float) -> float:
    """
    Convert dip stick reading (cm) to fuel volume (liters).

    Args:
        tank_id: Tank identifier (e.g., "TANK-DIESEL")
        dip_cm: Dip stick reading in centimeters

    Returns:
        Fuel volume in liters

    Example:
        >>> dip_to_volume("TANK-DIESEL", 164.5)
        26887.21
    """
    config = _resolve_calibration(tank_id)
    chart = config["calibration_chart"]

    # Handle edge cases
    if dip_cm <= 0:
        return 0.0

    # If exact match in calibration chart
    if dip_cm in chart:
        return float(chart[dip_cm])

    # Linear interpolation between calibration points
    sorted_dips = sorted(chart.keys())

    # Find bounding points
    lower_dip = None
    upper_dip = None

    for i in range(len(sorted_dips) - 1):
        if sorted_dips[i] <= dip_cm <= sorted_dips[i + 1]:
            lower_dip = sorted_dips[i]
            upper_dip = sorted_dips[i + 1]
            break

    if lower_dip is None:
        # Extrapolate if beyond range
        if dip_cm < sorted_dips[0]:
            return 0.0
        else:
            # Beyond chart max — return the chart's maximum recorded volume
            return float(chart[sorted_dips[-1]])

    # Linear interpolation
    lower_volume = chart[lower_dip]
    upper_volume = chart[upper_dip]

    # Interpolate
    ratio = (dip_cm - lower_dip) / (upper_dip - lower_dip)
    volume = lower_volume + (ratio * (upper_volume - lower_volume))

    return volume


def volume_to_dip(tank_id: str, volume_liters: float) -> float:
    """
    Convert fuel volume (liters) to approximate dip stick reading (cm).

    Args:
        tank_id: Tank identifier
        volume_liters: Fuel volume in liters

    Returns:
        Approximate dip reading in centimeters

    Note: This is an inverse operation and may not be exact due to tank geometry
    """
    config = _resolve_calibration(tank_id)
    chart = config["calibration_chart"]

    if volume_liters <= 0:
        return 0.0

    if volume_liters >= config["capacity"]:
        return float(max(chart.keys()))

    # Find bounding volumes in chart
    sorted_dips = sorted(chart.keys())

    for i in range(len(sorted_dips) - 1):
        lower_dip = sorted_dips[i]
        upper_dip = sorted_dips[i + 1]
        lower_volume = chart[lower_dip]
        upper_volume = chart[upper_dip]

        if lower_volume <= volume_liters <= upper_volume:
            # Linear interpolation
            ratio = (volume_liters - lower_volume) / (upper_volume - lower_volume)
            dip = lower_dip + (ratio * (upper_dip - lower_dip))
            return round(dip, 1)

    return 0.0


def calculate_cylindrical_horizontal_volume(
    diameter_cm: float,
    length_cm: float,
    dip_cm: float
) -> float:
    """
    Calculate volume in a horizontal cylindrical tank from dip reading.

    This uses the exact geometric formula for a cylindrical tank lying horizontally.

    Args:
        diameter_cm: Tank diameter in cm
        length_cm: Tank length in cm
        dip_cm: Dip stick reading in cm (height of fuel)

    Returns:
        Volume in liters

    Formula:
        For a horizontal cylinder with fuel height h:
        V = L * [R² * arccos((R-h)/R) - (R-h) * sqrt(2*R*h - h²)]
        Where R = radius, h = height (dip), L = length
    """
    radius = diameter_cm / 2
    height = dip_cm

    # Handle edge cases
    if height <= 0:
        return 0.0
    if height >= diameter_cm:
        # Tank is full
        return (math.pi * radius ** 2 * length_cm) / 1000  # Convert cm³ to liters

    # Calculate cross-sectional area using circular segment formula
    theta = 2 * math.acos((radius - height) / radius)  # Central angle in radians
    area = (radius ** 2 / 2) * (theta - math.sin(theta))  # Cross-sectional area in cm²

    # Volume = area * length, convert cm³ to liters
    volume_liters = (area * length_cm) / 1000

    return round(volume_liters, 2)


def validate_dip_reading(tank_id: str, dip_cm: float) -> Dict[str, any]:
    """
    Validate that a dip reading is reasonable for the tank.

    Args:
        tank_id: Tank identifier
        dip_cm: Dip reading in centimeters

    Returns:
        dict with validation results
    """
    try:
        config = _resolve_calibration(tank_id)
    except ValueError:
        return {
            'valid': False,
            'errors': [f"Unknown tank: {tank_id}"]
        }

    max_dip = max(config["calibration_chart"].keys())
    errors = []
    warnings = []

    if dip_cm < 0:
        errors.append("Dip reading cannot be negative")

    if dip_cm > max_dip:
        errors.append(f"Dip reading ({dip_cm}cm) exceeds maximum ({max_dip}cm)")

    if dip_cm < max_dip * 0.1:
        warnings.append(f"Low fuel level: {dip_cm}cm - Tank needs refilling soon")

    return {
        'valid': len(errors) == 0,
        'errors': errors,
        'warnings': warnings
    }


def get_tank_capacity(tank_id: str) -> float:
    """Get total capacity of a tank in liters."""
    config = _resolve_calibration(tank_id)
    return float(config["capacity"])


def get_tank_calibration_chart(tank_id: str) -> Dict[float, float]:
    """
    Get the calibration chart for a tank.

    Returns:
        Dictionary mapping dip (cm) to volume (liters)
    """
    config = _resolve_calibration(tank_id)
    return config["calibration_chart"]


# Example usage and testing
if __name__ == "__main__":
    # Test conversions
    tank_id = "TANK-DIESEL"

    print("=== Dip to Volume Conversion Tests ===")
    test_dips = [0, 50, 100, 150, 164.5, 200]

    for dip in test_dips:
        volume = dip_to_volume(tank_id, dip)
        print(f"Dip: {dip}cm → Volume: {volume:,.2f}L")

    print("\n=== Volume to Dip Conversion Tests ===")
    test_volumes = [0, 12500, 25000, 37500, 26887.21, 50000]

    for vol in test_volumes:
        dip = volume_to_dip(tank_id, vol)
        print(f"Volume: {vol:,.2f}L → Dip: {dip}cm")

    print("\n=== Validation Tests ===")
    test_readings = [164.5, -5, 250, 15]

    for reading in test_readings:
        result = validate_dip_reading(tank_id, reading)
        print(f"Dip {reading}cm: Valid={result['valid']}, Errors={result['errors']}, Warnings={result['warnings']}")
