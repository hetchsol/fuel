"""
Tank Volume Movement Calculation Service

Implements ALL Excel calculation formulas from Daily Station Stock Movement Reconciliation spreadsheet.
Covers columns D-BF including:
- Nozzle readings (D-AE)
- Tank dip readings (AF-AH)
- Tank volume readings (AI-AL)
- Tank movement calculation (AM)
- Total dispensed calculations (AN, AO)
- Variance analysis (AP, AQ)
- Financial calculations (AR-AW)
- Loss percentage (BF)

Main Formula (Column AM): =IF(AL>0, IF(AK>0, (AK-AL)+(AI-AJ), AI-AL), 0)
"""

from typing import Optional, Dict, List, Tuple
from ..models.models import NozzleReadingDetail


def get_pass_threshold() -> float:
    """Get the current PASS threshold from settings (in percentage)."""
    try:
        from ..api.v1.settings import validation_thresholds
        return validation_thresholds.get("pass_threshold", 0.5)
    except:
        return 0.5  # Default fallback


def get_warning_threshold() -> float:
    """Get the current WARNING threshold from settings (in percentage)."""
    try:
        from ..api.v1.settings import validation_thresholds
        return validation_thresholds.get("warning_threshold", 1.0)
    except:
        return 1.0  # Default fallback


def determine_variance_status(variance_percent: float) -> str:
    """
    Determine validation status based on variance percentage and configurable thresholds.

    Args:
        variance_percent: Absolute variance percentage

    Returns:
        'PASS', 'WARNING', or 'FAIL'
    """
    pass_threshold = get_pass_threshold()
    warning_threshold = get_warning_threshold()

    if variance_percent <= pass_threshold:
        return 'PASS'
    elif variance_percent <= warning_threshold:
        return 'WARNING'
    else:
        return 'FAIL'


def calculate_tank_volume_movement_v2(
    opening_volume: float,
    closing_volume: float,
    deliveries: List = None
) -> float:
    """
    Calculate tank volume movement with multiple deliveries support (NEW SIMPLIFIED FORMULA).

    Formula: Tank Movement = (Opening - Closing) + Sum(All Deliveries)

    This formula treats all deliveries as additions to available fuel.
    The volume dispensed equals: opening + total_delivered - closing

    Args:
        opening_volume: Tank level at start of shift (liters)
        closing_volume: Tank level at end of shift (liters)
        deliveries: List of DeliveryReference objects (optional)

    Returns:
        Total volume dispensed from tank (liters)

    Examples:
        >>> # No delivery
        >>> calculate_tank_volume_movement_v2(10000, 8000, [])
        2000.0  # Simple: 10000 - 8000

        >>> # Single delivery
        >>> delivery = type('obj', (object,), {'volume_delivered': 15000})()
        >>> calculate_tank_volume_movement_v2(10000, 18000, [delivery])
        7000.0  # (10000 - 18000) + 15000 = -8000 + 15000

        >>> # Multiple deliveries
        >>> d1 = type('obj', (object,), {'volume_delivered': 10000})()
        >>> d2 = type('obj', (object,), {'volume_delivered': 8000})()
        >>> calculate_tank_volume_movement_v2(5000, 15000, [d1, d2])
        8000.0  # (5000 - 15000) + 18000 = -10000 + 18000
    """
    if closing_volume <= 0:
        return 0.0

    # Base movement (can be negative if deliveries occurred)
    base_movement = opening_volume - closing_volume

    # Add all delivery volumes
    if deliveries and len(deliveries) > 0:
        total_delivered = sum(d.volume_delivered for d in deliveries)
        return base_movement + total_delivered

    # No deliveries - simple subtraction
    return base_movement


def calculate_tank_volume_movement(
    opening_volume: float,
    closing_volume: float,
    before_offload: Optional[float] = None,
    after_offload: Optional[float] = None,
    deliveries: List = None
) -> float:
    """
    Calculate tank volume movement (fuel dispensed from tank) - BACKWARD COMPATIBLE WRAPPER.

    Decision Logic:
    1. If deliveries list provided → use NEW simplified formula
    2. If before/after_offload provided → use OLD two-period formula (legacy)
    3. Otherwise → simple subtraction (no delivery)

    This ensures existing historical data continues to work correctly
    while new submissions use the improved formula.

    Replicates Excel formula for legacy support:
    =IF(AL>0, IF(AK>0, (AK-AL)+(AI-AJ), AI-AL), 0)

    Args:
        opening_volume: AI - Opening tank level (start of day)
        closing_volume: AL - Closing tank level (end of day)
        before_offload: AJ - Level before delivery (optional, legacy)
        after_offload: AK - Level after delivery (optional, legacy)
        deliveries: List of DeliveryReference objects (optional, new format)

    Returns:
        Total volume dispensed from tank (liters)

    Examples:
        >>> # No delivery
        >>> calculate_tank_volume_movement(26887.21, 25117.64)
        1769.57

        >>> # Legacy single delivery (old format)
        >>> calculate_tank_volume_movement(10000, 8000, 5000, 12000)
        9000.0  # (10000-5000) + (12000-8000) = 5000 + 4000

        >>> # New format with multiple deliveries
        >>> d1 = type('obj', (object,), {'volume_delivered': 10000})()
        >>> d2 = type('obj', (object,), {'volume_delivered': 8000})()
        >>> calculate_tank_volume_movement(5000, 15000, deliveries=[d1, d2])
        8000.0  # New formula: (5000 - 15000) + 18000
    """
    # NEW FORMAT: Multiple deliveries
    if deliveries and len(deliveries) > 0:
        return calculate_tank_volume_movement_v2(opening_volume, closing_volume, deliveries)

    # Scenario 3: No valid closing reading
    if closing_volume <= 0:
        return 0.0

    # LEGACY FORMAT: Single delivery with two-period calculation
    if after_offload and after_offload > 0:
        # Check if before_offload is recorded
        if before_offload and before_offload > 0:
            # Two-period calculation
            period1 = opening_volume - before_offload  # Sales before delivery
            period2 = after_offload - closing_volume    # Sales after delivery
            return period1 + period2
        else:
            # No before reading, use after as new starting point
            return after_offload - closing_volume

    # Scenario 1: No delivery
    return opening_volume - closing_volume


def calculate_delivery_volume(
    before_offload: float,
    after_offload: float
) -> float:
    """
    Calculate actual volume delivered.

    Args:
        before_offload: Tank level before delivery
        after_offload: Tank level after delivery

    Returns:
        Volume delivered (liters)
    """
    return after_offload - before_offload


def validate_tank_readings(
    opening: float,
    closing: float,
    before_offload: Optional[float] = None,
    after_offload: Optional[float] = None,
    tank_capacity: Optional[float] = None
) -> Dict[str, any]:
    """
    Validate tank readings for logical consistency.

    Args:
        opening: Opening tank volume
        closing: Closing tank volume
        before_offload: Volume before delivery (optional)
        after_offload: Volume after delivery (optional)
        tank_capacity: Maximum tank capacity (optional)

    Returns:
        dict with:
            - valid: bool
            - status: str (PASS, WARNING, FAIL)
            - errors: List[str]
            - warnings: List[str]
    """
    errors = []
    warnings = []

    # Basic validations
    if opening < 0:
        errors.append("Opening volume cannot be negative")
    if closing < 0:
        errors.append("Closing volume cannot be negative")

    # Tank capacity checks
    if tank_capacity:
        if opening > tank_capacity:
            errors.append(f"Opening volume ({opening}L) exceeds tank capacity ({tank_capacity}L)")
        if closing > tank_capacity:
            errors.append(f"Closing volume ({closing}L) exceeds tank capacity ({tank_capacity}L)")

    # Delivery validations
    if before_offload is not None or after_offload is not None:
        # If one is provided, both should be
        if before_offload is None or after_offload is None:
            errors.append("Both before and after offload readings required for delivery")
        elif before_offload < 0 or after_offload < 0:
            errors.append("Delivery readings cannot be negative")
        elif after_offload <= before_offload:
            errors.append(
                f"After offload volume ({after_offload}L) must be greater than "
                f"before offload ({before_offload}L)"
            )
        else:
            # Valid delivery - additional checks
            if before_offload > opening:
                warnings.append(
                    f"Before offload ({before_offload}L) is greater than opening ({opening}L). "
                    "This suggests sales occurred before delivery reading was taken."
                )

            if closing > after_offload:
                errors.append(
                    f"Closing volume ({closing}L) cannot exceed after offload ({after_offload}L)"
                )

            if tank_capacity and after_offload > tank_capacity:
                errors.append(
                    f"After offload volume ({after_offload}L) exceeds tank capacity ({tank_capacity}L)"
                )

            # Check for unusually large delivery
            delivery = after_offload - before_offload
            if tank_capacity and delivery > tank_capacity * 0.9:
                warnings.append(
                    f"Large delivery detected ({delivery}L is {delivery/tank_capacity*100:.1f}% of tank capacity)"
                )

    # No delivery scenario validations
    else:
        # Closing should typically be less than opening
        if closing > opening:
            errors.append(
                f"Closing volume ({closing}L) is greater than opening ({opening}L) "
                "without a delivery recorded"
            )

        # Check for reasonable daily consumption
        if opening > 0:
            consumption = opening - closing
            consumption_percent = (consumption / opening) * 100

            if consumption_percent > 95:
                warnings.append(
                    f"Very high consumption: {consumption_percent:.1f}% of opening volume. "
                    "Tank may need refilling soon."
                )
            elif consumption_percent < 0:
                errors.append("Negative consumption detected without delivery record")

    # Determine status
    if errors:
        status = "FAIL"
        valid = False
    elif warnings:
        status = "WARNING"
        valid = True
    else:
        status = "PASS"
        valid = True

    return {
        'valid': valid,
        'status': status,
        'errors': errors,
        'warnings': warnings
    }


def validate_multiple_deliveries(
    deliveries: List,
    opening_volume: float,
    closing_volume: float,
    tank_capacity: float
) -> Dict[str, any]:
    """
    Validate multiple deliveries for logical consistency.

    Checks:
    1. Each delivery: after_volume > before_volume
    2. No delivery exceeds tank capacity
    3. Deliveries in chronological order (by time)
    4. Volume sequence consistency (optional warnings)
    5. Calculated volume matches stated volume

    Args:
        deliveries: List of DeliveryReference objects
        opening_volume: Tank level at start of shift
        closing_volume: Tank level at end of shift
        tank_capacity: Maximum tank capacity

    Returns:
        {
            'valid': bool,
            'status': 'PASS'|'WARNING'|'FAIL',
            'errors': List[str],
            'warnings': List[str]
        }
    """
    errors = []
    warnings = []

    if not deliveries or len(deliveries) == 0:
        return {'valid': True, 'status': 'PASS', 'errors': [], 'warnings': []}

    # Sort deliveries by time
    sorted_deliveries = sorted(deliveries, key=lambda d: d.delivery_time)

    for i, delivery in enumerate(sorted_deliveries):
        delivery_num = i + 1

        # Validation 1: After must be greater than before
        if delivery.after_volume <= delivery.before_volume:
            errors.append(
                f"Delivery {delivery_num} ({delivery.delivery_time}): "
                f"After volume ({delivery.after_volume}L) must be greater than "
                f"before volume ({delivery.before_volume}L)"
            )

        # Validation 2: Tank capacity check
        if delivery.after_volume > tank_capacity:
            errors.append(
                f"Delivery {delivery_num}: After volume ({delivery.after_volume}L) "
                f"exceeds tank capacity ({tank_capacity}L)"
            )

        # Validation 3: Calculated volume matches stated volume
        calculated_vol = delivery.after_volume - delivery.before_volume
        if abs(calculated_vol - delivery.volume_delivered) > 0.1:
            warnings.append(
                f"Delivery {delivery_num}: Calculated volume ({calculated_vol:.2f}L) "
                f"differs from stated volume ({delivery.volume_delivered:.2f}L)"
            )

        # Validation 4: Check sequence consistency with previous delivery
        if i > 0:
            prev_delivery = sorted_deliveries[i - 1]
            # Allow 100L tolerance for sales between deliveries
            if delivery.before_volume > prev_delivery.after_volume + 100:
                warnings.append(
                    f"Delivery {delivery_num}: Starts at {delivery.before_volume}L but "
                    f"previous delivery ended at {prev_delivery.after_volume}L. "
                    f"This suggests significant sales between deliveries."
                )

    # Validation 5: Check first delivery alignment with opening
    if abs(sorted_deliveries[0].before_volume - opening_volume) > 100:
        warnings.append(
            f"First delivery before-volume ({sorted_deliveries[0].before_volume}L) "
            f"differs from opening volume ({opening_volume}L) by "
            f"{abs(sorted_deliveries[0].before_volume - opening_volume):.2f}L. "
            f"This suggests sales occurred before the first delivery was recorded."
        )

    # Validation 6: Check last delivery alignment with closing
    last_delivery = sorted_deliveries[-1]
    if last_delivery.after_volume > closing_volume:
        # This means sales happened after the delivery
        expected_sales = last_delivery.after_volume - closing_volume
        warnings.append(
            f"Last delivery ended at {last_delivery.after_volume}L but "
            f"closing is {closing_volume}L, indicating {expected_sales:.2f}L "
            f"were dispensed after the last delivery."
        )

    valid = len(errors) == 0
    status = 'FAIL' if errors else ('WARNING' if warnings else 'PASS')

    return {
        'valid': valid,
        'status': status,
        'errors': errors,
        'warnings': warnings
    }


def calculate_variance(
    tank_movement: float,
    nozzle_sales: float,
    tolerance_percent: float = 0.5
) -> Dict[str, any]:
    """
    Calculate variance between tank movement and nozzle readings.

    Args:
        tank_movement: Volume dispensed according to tank readings
        nozzle_sales: Volume dispensed according to nozzle readings
        tolerance_percent: Acceptable variance percentage (default 0.5%)

    Returns:
        dict with:
            - variance: float (nozzle_sales - tank_movement)
            - variance_percent: float
            - status: str (PASS, WARNING, FAIL)
            - message: str
    """
    variance = nozzle_sales - tank_movement

    # Avoid division by zero
    if tank_movement == 0:
        return {
            'variance': variance,
            'variance_percent': 0.0,
            'variance_liters': variance,
            'status': 'WARNING',
            'message': 'Cannot calculate variance percentage (tank movement is zero)'
        }

    variance_percent = (abs(variance) / tank_movement) * 100

    # Determine status
    if variance_percent <= tolerance_percent:
        status = 'PASS'
        message = f'Variance within acceptable range ({variance_percent:.2f}%)'
    elif variance_percent <= tolerance_percent * 2:
        status = 'WARNING'
        if variance > 0:
            message = f'Nozzles show {abs(variance):.2f}L more than tank ({variance_percent:.2f}%)'
        else:
            message = f'Tank shows {abs(variance):.2f}L more than nozzles ({variance_percent:.2f}%) - Possible leak'
    else:
        status = 'FAIL'
        if variance > 0:
            message = f'HIGH VARIANCE: Nozzles exceed tank by {abs(variance):.2f}L ({variance_percent:.2f}%)'
        else:
            message = f'CRITICAL: Tank exceeds nozzles by {abs(variance):.2f}L ({variance_percent:.2f}%) - Check for leaks'

    return {
        'variance': variance,
        'variance_percent': variance_percent,
        'variance_liters': variance,
        'status': status,
        'message': message
    }


def detect_anomalies(
    readings: List[Dict],
    lookback_days: int = 7
) -> List[Dict[str, any]]:
    """
    Detect anomalies in tank readings over time.

    Args:
        readings: List of daily readings with tank_volume_movement
        lookback_days: Number of days to analyze for patterns

    Returns:
        List of detected anomalies with descriptions
    """
    if len(readings) < 2:
        return []

    anomalies = []

    # Calculate average daily movement
    movements = [r.get('tank_volume_movement', 0) for r in readings]
    avg_movement = sum(movements) / len(movements)

    # Check for unusual spikes or drops
    for i, reading in enumerate(readings):
        movement = reading.get('tank_volume_movement', 0)

        # Spike detection (more than 150% of average)
        if movement > avg_movement * 1.5 and avg_movement > 0:
            anomalies.append({
                'date': reading.get('date'),
                'type': 'HIGH_CONSUMPTION',
                'severity': 'WARNING',
                'message': f'Unusually high consumption: {movement:.2f}L vs average {avg_movement:.2f}L',
                'value': movement
            })

        # Drop detection (less than 50% of average)
        elif movement < avg_movement * 0.5 and avg_movement > 0:
            anomalies.append({
                'date': reading.get('date'),
                'type': 'LOW_CONSUMPTION',
                'severity': 'INFO',
                'message': f'Unusually low consumption: {movement:.2f}L vs average {avg_movement:.2f}L',
                'value': movement
            })

    # Check for consistent losses (variance always negative)
    if len(readings) >= 3:
        variances = [r.get('electronic_vs_tank_variance', 0) for r in readings[-lookback_days:]]
        negative_count = sum(1 for v in variances if v < -50)  # More than 50L loss

        if negative_count >= len(variances) * 0.7:  # 70% of days show losses
            anomalies.append({
                'type': 'CONSISTENT_LOSS',
                'severity': 'CRITICAL',
                'message': f'Consistent tank losses detected over {len(variances)} days - Possible leak',
                'value': sum(variances)
            })

    return anomalies


# ===== NEW EXCEL FORMULA CALCULATIONS =====

def calculate_total_electronic_dispensed(nozzle_readings: List[NozzleReadingDetail]) -> float:
    """
    Calculate total electronic volume dispensed from all nozzles.
    Excel Column AN: =AB4+U4+N4+G4 (sum of all nozzle electronic movements)

    Args:
        nozzle_readings: List of nozzle readings

    Returns:
        Total electronic volume dispensed
    """
    return sum(n.electronic_movement for n in nozzle_readings)


def calculate_total_mechanical_dispensed(nozzle_readings: List[NozzleReadingDetail]) -> float:
    """
    Calculate total mechanical volume dispensed from all nozzles.
    Excel Column AO: =AE4+X4+Q4+J4 (sum of all nozzle mechanical movements)

    Args:
        nozzle_readings: List of nozzle readings

    Returns:
        Total mechanical volume dispensed
    """
    return sum(n.mechanical_movement for n in nozzle_readings)


def calculate_electronic_vs_tank(total_electronic: float, tank_movement: float) -> Dict[str, float]:
    """
    Calculate variance between electronic sales and tank movement.
    Excel Column AP: =AN4-AM4

    Args:
        total_electronic: Total electronic volume dispensed (Column AN)
        tank_movement: Tank volume movement (Column AM)

    Returns:
        Dictionary with variance and percentage
    """
    variance = total_electronic - tank_movement

    # Calculate percentage
    if tank_movement > 0:
        percent = (variance / tank_movement) * 100
    else:
        percent = 0.0

    return {
        'variance': variance,
        'percent': percent,
        'absolute': abs(variance)
    }


def calculate_mechanical_vs_tank(total_mechanical: float, tank_movement: float) -> Dict[str, float]:
    """
    Calculate variance between mechanical sales and tank movement.
    Excel Column AQ: =AO4-AM4

    Args:
        total_mechanical: Total mechanical volume dispensed (Column AO)
        tank_movement: Tank volume movement (Column AM)

    Returns:
        Dictionary with variance and percentage
    """
    variance = total_mechanical - tank_movement

    # Calculate percentage
    if tank_movement > 0:
        percent = (variance / tank_movement) * 100
    else:
        percent = 0.0

    return {
        'variance': variance,
        'percent': percent,
        'absolute': abs(variance)
    }


def calculate_financial_data(
    total_electronic: float,
    total_mechanical: float,
    price_per_liter: float,
    actual_cash: Optional[float] = None
) -> Dict[str, float]:
    """
    Calculate financial data for the day.

    Excel Columns:
    - AR: Sale Price per Litre
    - AS: Expected Amount (Electronic) = AR * AN
    - AT: Actual Amount to Bank
    - AU: Difference = AT - AS
    - AV: Cumulative Electronic - Sold = (AN + AO) / 2

    Args:
        total_electronic: Total electronic volume
        total_mechanical: Total mechanical volume
        price_per_liter: Price per liter
        actual_cash: Actual cash banked (optional)

    Returns:
        Dictionary with all financial calculations
    """
    # AS: Expected Amount (Electronic)
    expected_amount_electronic = total_electronic * price_per_liter

    # Expected Amount (Mechanical)
    expected_amount_mechanical = total_mechanical * price_per_liter

    # Average expected
    expected_amount_avg = (expected_amount_electronic + expected_amount_mechanical) / 2

    # AU: Difference
    cash_difference = None
    if actual_cash is not None:
        cash_difference = actual_cash - expected_amount_electronic

    # AV: Cumulative Volume Sold (average of electronic and mechanical)
    cumulative_volume = (total_electronic + total_mechanical) / 2

    return {
        'price_per_liter': price_per_liter,
        'expected_amount_electronic': expected_amount_electronic,
        'expected_amount_mechanical': expected_amount_mechanical,
        'expected_amount_average': expected_amount_avg,
        'actual_cash_banked': actual_cash,
        'cash_difference': cash_difference,
        'cumulative_volume_sold': cumulative_volume
    }


def calculate_loss_percent(electronic_variance: float, tank_movement: float) -> float:
    """
    Calculate loss percentage.
    Excel Column BF: =IF(AM4=0,0,AP4/AM4)

    Args:
        electronic_variance: Electronic vs Tank variance (Column AP)
        tank_movement: Tank volume movement (Column AM)

    Returns:
        Loss percentage
    """
    if tank_movement == 0:
        return 0.0

    return (electronic_variance / tank_movement) * 100


def calculate_pump_averages(
    nozzle_readings: List[NozzleReadingDetail],
    price_per_liter: float
) -> Dict[str, Dict[str, float]]:
    """
    Calculate per-pump averages.

    Excel Columns:
    - AY: Pump 1 Average - litres = (G4+J4)/2 + (N4+Q4)/2
    - AZ: Pump 2 Average - litres = (U4+X4)/2 + (AB4+AE4)/2
    - BA: Pump 1 Average - ZMW = AY4 * AR4
    - BB: Pump 2 Average - ZMW = AZ4 * AR4

    Args:
        nozzle_readings: List of nozzle readings
        price_per_liter: Price per liter

    Returns:
        Dictionary with pump averages
    """
    # Group nozzles by pump (assuming nozzle IDs contain pump number)
    pump_groups = {}

    for nozzle in nozzle_readings:
        # Extract pump number from nozzle_id (e.g., "1A" -> pump "1")
        pump_num = nozzle.nozzle_id[0] if nozzle.nozzle_id else "0"

        if pump_num not in pump_groups:
            pump_groups[pump_num] = []

        pump_groups[pump_num].append(nozzle)

    # Calculate averages per pump
    pump_averages = {}

    for pump_num, nozzles in pump_groups.items():
        # Average of electronic and mechanical for all nozzles on this pump
        total_volume = 0
        for nozzle in nozzles:
            avg_volume = (nozzle.electronic_movement + nozzle.mechanical_movement) / 2
            total_volume += avg_volume

        pump_averages[f"pump_{pump_num}"] = {
            'volume_liters': total_volume,
            'amount_zmw': total_volume * price_per_liter
        }

    return pump_averages


def comprehensive_daily_calculation(
    nozzle_readings: List[NozzleReadingDetail],
    tank_movement: float,
    price_per_liter: float,
    actual_cash: Optional[float] = None
) -> Dict[str, any]:
    """
    Perform all Excel calculations for a daily reading.

    This replicates all formulas from columns D-BF in the Excel spreadsheet.

    Args:
        nozzle_readings: List of all nozzle readings for the day
        tank_movement: Calculated tank volume movement (Column AM)
        price_per_liter: Sale price per liter (Column AR)
        actual_cash: Actual cash banked (Column AT), optional

    Returns:
        Dictionary with all calculated values matching Excel structure
    """
    # Column AN: Total Electronic Dispensed
    total_electronic = calculate_total_electronic_dispensed(nozzle_readings)

    # Column AO: Total Mechanical Dispensed
    total_mechanical = calculate_total_mechanical_dispensed(nozzle_readings)

    # Column AP: Electronic VS Tank
    electronic_vs_tank = calculate_electronic_vs_tank(total_electronic, tank_movement)

    # Column AQ: Mechanical VS Tank
    mechanical_vs_tank = calculate_mechanical_vs_tank(total_mechanical, tank_movement)

    # Columns AR-AW: Financial Data
    financial = calculate_financial_data(
        total_electronic,
        total_mechanical,
        price_per_liter,
        actual_cash
    )

    # Column BF: Loss Percent
    loss_percent = calculate_loss_percent(electronic_vs_tank['variance'], tank_movement)

    # Columns AY-BB: Pump Averages
    pump_averages = calculate_pump_averages(nozzle_readings, price_per_liter)

    return {
        # Nozzle totals
        'total_electronic_dispensed': total_electronic,
        'total_mechanical_dispensed': total_mechanical,

        # Variance analysis
        'electronic_vs_tank_variance': electronic_vs_tank['variance'],
        'electronic_vs_tank_percent': electronic_vs_tank['percent'],
        'mechanical_vs_tank_variance': mechanical_vs_tank['variance'],
        'mechanical_vs_tank_percent': mechanical_vs_tank['percent'],

        # Financial
        **financial,

        # Loss
        'loss_percent': loss_percent,

        # Pump averages
        'pump_averages': pump_averages,

        # Status indicators - using configurable thresholds from settings
        'has_discrepancy': abs(electronic_vs_tank['percent']) > get_pass_threshold() or abs(mechanical_vs_tank['percent']) > get_pass_threshold(),
        'variance_status': determine_variance_status(abs(electronic_vs_tank['percent']))
    }
