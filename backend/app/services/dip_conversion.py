"""
Tank Dip to Volume Conversion Service

Converts physical dip stick readings (in centimeters) to fuel volume (in liters).
Uses tank calibration charts/formulas specific to each tank.
"""

from typing import Dict, Optional
import math


# Tank Calibration Data
# In production, this should come from a database with actual tank calibration charts
TANK_CALIBRATION = {
    "TANK-DIESEL": {
        "type": "cylindrical_horizontal",
        "capacity": 50000,  # liters
        "diameter": 250,  # cm (estimated)
        "length": 1000,  # cm (estimated)
        "calibration_chart": {
            # Actual calibration data extracted from Excel
            0: 0,
            75.0: 10054.98,
            80.2: 11080.78,
            83.9: 11802.6,
            88.7: 12771.84,
            91.4: 13311.54,
            93.7: 13780.42,
            96.5: 14355.88,
            97.2: 14498.48,
            99.8: 15038.73,
            107.3: 16554.32,
            108.0: 16696.72,
            126.7: 20708.91,
            139.1: 23410.96,
            151.7: 26216.3,
            152.1: 26323.62,
            157.7: 27528.21,
            164.3: 28964.73,
            168.2: 29823.23,
            169.0: 29994.13,
            173.1: 30890.9,
            175.0: 31326.63,
            179.2: 32229.68,
            183.6: 33170.68,
            190.0: 34532.1,
            195.1: 35600.26,
            196.0: 35787.76,
            200.4: 36694.03,
            204.7: 37577.34,
            210.0: 38667.58,
            211.5: 38970.46,
            220: 40000  # Estimated max
        }
    },
    "TANK-PETROL": {
        "type": "cylindrical_horizontal",
        "capacity": 50000,  # liters
        "diameter": 250,  # cm (estimated)
        "length": 1000,  # cm (estimated)
        "calibration_chart": {
            # Actual calibration data extracted from Excel
            0: 0,
            11.0: 570.7,
            13.4: 778.67,
            25.1: 2011.16,
            35.5: 3336.68,
            41.4: 4177.05,
            50.1: 5474.78,
            57.7: 6688.29,
            64.9: 7888.87,
            69.7: 8717.06,
            80.5: 10637.87,
            80.6: 10656.13,
            86.5: 11733.09,
            91.3: 12629.47,
            94.0: 13134.19,
            97.5: 13853.24,
            101.1: 14483.93,
            105.0: 15234.64,
            113.9: 16945.0,
            114.2: 17003.83,
            119.8: 18114.77,
            120.1: 18175.47,
            124.6: 19054.41,
            125.7: 19268.73,
            129.9: 20091.03,
            130.3: 20171.31,
            135.8: 21252.46,
            143.6: 22809.31,
            148.5: 23773.07,
            155.4: 25117.64,
            164.5: 26887.21,
            170: 28000,  # Estimated
            180: 30000   # Estimated max
        }
    }
}


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
    if tank_id not in TANK_CALIBRATION:
        raise ValueError(f"Unknown tank: {tank_id}")

    config = TANK_CALIBRATION[tank_id]
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
            # Beyond maximum - use capacity
            return float(config["capacity"])

    # Linear interpolation
    lower_volume = chart[lower_dip]
    upper_volume = chart[upper_dip]

    # Interpolate
    ratio = (dip_cm - lower_dip) / (upper_dip - lower_dip)
    volume = lower_volume + (ratio * (upper_volume - lower_volume))

    return round(volume, 2)


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
    if tank_id not in TANK_CALIBRATION:
        raise ValueError(f"Unknown tank: {tank_id}")

    config = TANK_CALIBRATION[tank_id]
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
    if tank_id not in TANK_CALIBRATION:
        return {
            'valid': False,
            'errors': [f"Unknown tank: {tank_id}"]
        }

    config = TANK_CALIBRATION[tank_id]
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
    if tank_id not in TANK_CALIBRATION:
        raise ValueError(f"Unknown tank: {tank_id}")
    return float(TANK_CALIBRATION[tank_id]["capacity"])


def get_tank_calibration_chart(tank_id: str) -> Dict[float, float]:
    """
    Get the calibration chart for a tank.

    Returns:
        Dictionary mapping dip (cm) to volume (liters)
    """
    if tank_id not in TANK_CALIBRATION:
        raise ValueError(f"Unknown tank: {tank_id}")
    return TANK_CALIBRATION[tank_id]["calibration_chart"]


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
