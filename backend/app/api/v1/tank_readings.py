"""
Tank Volume Readings API - Column AM Implementation

Endpoints for recording and retrieving tank volume readings with delivery tracking.
Implements Excel Column AM logic for calculating tank volume movement.
"""

from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import JSONResponse
from fastapi.encoders import jsonable_encoder
from typing import List, Optional
from datetime import datetime, date
import uuid

from ...models.models import (
    TankVolumeReadingInput,
    TankVolumeReadingOutput,
    TankDeliveryInput,
    TankDeliveryOutput,
    TankMovementSummary,
    DeliveryReference
)
from ...services.tank_movement import (
    calculate_tank_volume_movement,
    calculate_delivery_volume,
    validate_tank_readings,
    validate_multiple_deliveries,
    calculate_variance,
    detect_anomalies
)
from ...api.v1.auth import get_current_user

router = APIRouter()

# In-memory storage (replace with database in production)
tank_readings_db = {}
tank_deliveries_db = {}

# Tank configuration (should come from database)
TANK_CONFIG = {
    "TANK-DIESEL": {
        "fuel_type": "Diesel",
        "capacity": 50000  # 50,000 liters
    },
    "TANK-PETROL": {
        "fuel_type": "Petrol",
        "capacity": 50000  # 50,000 liters
    }
}


# ===== HELPER FUNCTIONS FOR MULTIPLE DELIVERIES SUPPORT =====

def is_time_in_shift(time_str: str, start_time: str, end_time: str, shift_type: str) -> bool:
    """
    Check if a time falls within the shift range.

    Handles wraparound for Night shift (18:00-06:00 next day).

    Args:
        time_str: Time to check (HH:MM format)
        start_time: Shift start time (HH:MM)
        end_time: Shift end time (HH:MM)
        shift_type: "Day" or "Night"

    Returns:
        True if time falls within shift range

    Examples:
        >>> is_time_in_shift("10:30", "06:00", "18:00", "Day")
        True
        >>> is_time_in_shift("20:00", "06:00", "18:00", "Day")
        False
        >>> is_time_in_shift("22:00", "18:00", "06:00", "Night")
        True
    """
    from datetime import datetime

    try:
        time_obj = datetime.strptime(time_str, '%H:%M').time()
        start_obj = datetime.strptime(start_time, '%H:%M').time()
        end_obj = datetime.strptime(end_time, '%H:%M').time()
    except ValueError:
        return False

    if shift_type == 'Night' and end_time < start_time:
        # Wraparound case: Night shift (18:00-06:00)
        return time_obj >= start_obj or time_obj < end_obj
    else:
        # Normal case: Day shift (06:00-18:00)
        return start_obj <= time_obj < end_obj


def find_and_link_deliveries(
    tank_id: str,
    date: str,
    shift_type: str
) -> List[DeliveryReference]:
    """
    Automatically find standalone deliveries that match this tank reading.

    Matching Criteria:
    - Same tank_id
    - Same date
    - Time falls within shift range (Day: 06:00-18:00, Night: 18:00-06:00)
    - Not already linked to another reading

    Args:
        tank_id: Tank identifier
        date: Date string (YYYY-MM-DD)
        shift_type: "Day" or "Night"

    Returns:
        List of matched deliveries as DeliveryReference objects, sorted by time
    """
    matched_deliveries = []

    # Define shift time ranges
    shift_ranges = {
        'Day': ('06:00', '18:00'),
        'Night': ('18:00', '06:00')  # Wraps to next day
    }

    start_time, end_time = shift_ranges.get(shift_type, ('00:00', '23:59'))

    # Search unlinked deliveries in tank_deliveries_db
    for delivery_id, delivery_data in tank_deliveries_db.items():
        # Check basic criteria
        if (delivery_data['tank_id'] == tank_id and
            delivery_data['date'] == date and
            not delivery_data.get('linked_reading_id')):  # Not already linked

            # Check if delivery time falls within shift
            delivery_time = delivery_data['time']
            if is_time_in_shift(delivery_time, shift_type):
                # Create DeliveryReference from standalone delivery
                ref = DeliveryReference(
                    delivery_id=delivery_id,
                    volume_delivered=delivery_data['actual_volume_delivered'],
                    delivery_time=delivery_data['time'],
                    supplier=delivery_data['supplier'],
                    invoice_number=delivery_data.get('invoice_number'),
                    before_volume=delivery_data['volume_before'],
                    after_volume=delivery_data['volume_after']
                )
                matched_deliveries.append(ref)

    # Sort by time (earliest first)
    matched_deliveries.sort(key=lambda d: d.delivery_time)

    return matched_deliveries


@router.post("/readings", response_model=TankVolumeReadingOutput, response_model_exclude_unset=False, response_model_exclude_defaults=False, response_model_exclude_none=False)
def submit_tank_reading(
    reading_input: TankVolumeReadingInput,
    current_user: dict = Depends(get_current_user)
):
    """
    Submit comprehensive daily tank volume readings matching Excel structure (Columns D-BF).

    Captures:
    - Tank dip readings in centimeters (AF, AG, AH)
    - Individual nozzle readings with attendants (D-AE)
    - Delivery information (if applicable)
    - Financial data (price, actual cash)

    Calculates ALL Excel formulas:
    - Tank movement (AM)
    - Total electronic/mechanical dispensed (AN, AO)
    - Variances (AP, AQ)
    - Financial reconciliation (AR-AW)
    - Pump averages (AY-BB)
    - Loss percentage (BF)
    """
    from ...services.dip_conversion import dip_to_volume, validate_dip_reading
    from ...services.tank_movement import comprehensive_daily_calculation

    # Get tank configuration
    if reading_input.tank_id not in TANK_CONFIG:
        raise HTTPException(status_code=404, detail=f"Tank {reading_input.tank_id} not found")

    tank_config = TANK_CONFIG[reading_input.tank_id]

    # Validate dip readings
    dip_validation_opening = validate_dip_reading(reading_input.tank_id, reading_input.opening_dip_cm)
    dip_validation_closing = validate_dip_reading(reading_input.tank_id, reading_input.closing_dip_cm)

    all_errors = []
    all_warnings = []

    if not dip_validation_opening['valid']:
        all_errors.extend(dip_validation_opening['errors'])
    all_warnings.extend(dip_validation_opening.get('warnings', []))

    if not dip_validation_closing['valid']:
        all_errors.extend(dip_validation_closing['errors'])
    all_warnings.extend(dip_validation_closing.get('warnings', []))

    # Convert dip readings to volumes if not provided
    opening_volume = reading_input.opening_volume
    if opening_volume is None:
        opening_volume = dip_to_volume(reading_input.tank_id, reading_input.opening_dip_cm)

    closing_volume = reading_input.closing_volume
    if closing_volume is None:
        closing_volume = dip_to_volume(reading_input.tank_id, reading_input.closing_dip_cm)

    # ===== HANDLE MULTIPLE DELIVERIES (NEW FEATURE) =====
    deliveries = []

    # OPTION 1: Deliveries provided inline (new format from UI)
    if reading_input.deliveries and len(reading_input.deliveries) > 0:
        deliveries = reading_input.deliveries

    # OPTION 2: Legacy single delivery (backward compatibility)
    elif reading_input.delivery_occurred and reading_input.after_offload_volume:
        # Convert old format to new format
        before_vol = reading_input.before_offload_volume
        after_vol = reading_input.after_offload_volume

        # Convert after_delivery_dip_cm if provided
        if reading_input.after_delivery_dip_cm and after_vol is None:
            after_vol = dip_to_volume(reading_input.tank_id, reading_input.after_delivery_dip_cm)

        if before_vol and after_vol:
            legacy_delivery = DeliveryReference(
                delivery_id=None,  # Generated ID for inline delivery
                volume_delivered=after_vol - before_vol,
                delivery_time=reading_input.delivery_time or "12:00",
                supplier=reading_input.supplier or "Unknown",
                invoice_number=reading_input.invoice_number,
                before_volume=before_vol,
                after_volume=after_vol
            )
            deliveries.append(legacy_delivery)

    # OPTION 3: Auto-link standalone deliveries by date/tank/shift
    else:
        auto_linked = find_and_link_deliveries(
            tank_id=reading_input.tank_id,
            date=reading_input.date,
            shift_type=reading_input.shift_type
        )
        if auto_linked:
            deliveries = auto_linked
            all_warnings.append(f"Auto-linked {len(auto_linked)} standalone delivery(s) to this reading")

    # Validate multiple deliveries
    if deliveries and len(deliveries) > 0:
        delivery_validation = validate_multiple_deliveries(
            deliveries=deliveries,
            opening_volume=opening_volume,
            closing_volume=closing_volume,
            tank_capacity=tank_config['capacity']
        )

        all_errors.extend(delivery_validation['errors'])
        all_warnings.extend(delivery_validation['warnings'])

        if delivery_validation['errors']:
            raise HTTPException(
                status_code=400,
                detail={
                    "message": "Invalid delivery configuration",
                    "errors": all_errors,
                    "warnings": all_warnings
                }
            )

    # Legacy: Handle old single delivery volumes (for backward compatibility with old calculations)
    before_offload_volume = reading_input.before_offload_volume
    after_offload_volume = reading_input.after_offload_volume

    if reading_input.delivery_occurred and reading_input.after_delivery_dip_cm:
        if after_offload_volume is None:
            after_offload_volume = dip_to_volume(reading_input.tank_id, reading_input.after_delivery_dip_cm)

    # Validate volume readings (legacy validation still runs)
    validation = validate_tank_readings(
        opening=opening_volume,
        closing=closing_volume,
        before_offload=before_offload_volume,
        after_offload=after_offload_volume,
        tank_capacity=tank_config['capacity']
    )

    all_errors.extend(validation['errors'])
    all_warnings.extend(validation.get('warnings', []))

    if all_errors:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "Invalid tank readings",
                "errors": all_errors,
                "warnings": all_warnings
            }
        )

    # Calculate tank volume movement with BACKWARD COMPATIBLE formula
    tank_movement = calculate_tank_volume_movement(
        opening_volume=opening_volume,
        closing_volume=closing_volume,
        before_offload=before_offload_volume,  # Legacy
        after_offload=after_offload_volume,    # Legacy
        deliveries=deliveries if deliveries else None  # New format
    )

    # Calculate totals for new fields
    total_delivery_volume = sum(d.volume_delivered for d in deliveries) if deliveries else 0.0
    delivery_count = len(deliveries) if deliveries else 0

    # Legacy: Calculate single delivery volume (for backward compatibility display)
    delivery_volume = None
    if reading_input.delivery_occurred and before_offload_volume and after_offload_volume:
        delivery_volume = calculate_delivery_volume(before_offload_volume, after_offload_volume)
    elif total_delivery_volume > 0:
        delivery_volume = total_delivery_volume

    # Perform comprehensive Excel calculations
    price = reading_input.price_per_liter or 0.0
    calculations = comprehensive_daily_calculation(
        nozzle_readings=reading_input.nozzle_readings,
        tank_movement=tank_movement,
        price_per_liter=price,
        actual_cash=reading_input.actual_cash_banked
    )

    # Handle customer allocations (DIESEL ONLY - Columns AR-BB)
    allocation_balance_check = None
    total_customer_revenue = None

    if reading_input.customer_allocations and len(reading_input.customer_allocations) > 0:
        from ...services import customer_service

        # Validate allocations
        allocations_list = [alloc.dict() for alloc in reading_input.customer_allocations]
        total_electronic = calculations['total_electronic_dispensed']

        allocation_validation = customer_service.validate_allocations(
            allocations_list,
            total_electronic
        )

        if not allocation_validation['valid']:
            all_warnings.append(allocation_validation['message'])

        allocation_balance_check = allocation_validation['difference']

        # Calculate customer revenue breakdown
        revenue_data = customer_service.calculate_customer_revenue(allocations_list)
        total_customer_revenue = revenue_data['total_revenue']

    # Determine validation status
    if calculations['variance_status'] == 'FAIL':
        validation_status = 'FAIL'
    elif calculations['variance_status'] == 'WARNING' or all_warnings:
        validation_status = 'WARNING'
    else:
        validation_status = 'PASS'

    # Generate reading ID
    reading_id = f"TR-{reading_input.tank_id}-{reading_input.date}-{uuid.uuid4().hex[:8]}"

    # Create comprehensive output
    output = TankVolumeReadingOutput(
        reading_id=reading_id,
        tank_id=reading_input.tank_id,
        fuel_type=tank_config['fuel_type'],
        date=reading_input.date,
        shift_type=reading_input.shift_type,

        # Tank dip readings
        opening_dip_cm=reading_input.opening_dip_cm,
        closing_dip_cm=reading_input.closing_dip_cm,
        after_delivery_dip_cm=reading_input.after_delivery_dip_cm,

        # Tank volume readings
        opening_volume=opening_volume,
        closing_volume=closing_volume,
        before_offload_volume=before_offload_volume,
        after_offload_volume=after_offload_volume,

        # Nozzle readings
        nozzle_readings=reading_input.nozzle_readings,

        # Tank movement (Column AM)
        tank_volume_movement=tank_movement,

        # Calculated totals from nozzles (Columns AN, AO)
        total_electronic_dispensed=calculations['total_electronic_dispensed'],
        total_mechanical_dispensed=calculations['total_mechanical_dispensed'],

        # Variance analysis (Columns AP, AQ)
        electronic_vs_tank_variance=calculations['electronic_vs_tank_variance'],
        mechanical_vs_tank_variance=calculations['mechanical_vs_tank_variance'],
        electronic_vs_tank_percent=calculations['electronic_vs_tank_percent'],
        mechanical_vs_tank_percent=calculations['mechanical_vs_tank_percent'],

        # Financial data (Columns AR-AW)
        price_per_liter=calculations.get('price_per_liter'),
        expected_amount_electronic=calculations.get('expected_amount_electronic'),
        expected_amount_mechanical=calculations.get('expected_amount_mechanical'),
        actual_cash_banked=calculations.get('actual_cash_banked'),
        cash_difference=calculations.get('cash_difference'),
        cumulative_volume_sold=calculations.get('cumulative_volume_sold'),

        # Loss percentage (Column BF)
        loss_percent=calculations['loss_percent'],

        # Customer allocations (DIESEL ONLY - Columns AR-BB)
        customer_allocations=reading_input.customer_allocations,
        allocation_balance_check=allocation_balance_check,
        total_customer_revenue=total_customer_revenue,

        # Pump averages (Columns AY-BB)
        pump_averages=calculations.get('pump_averages'),

        # NEW: Multiple deliveries support
        deliveries=deliveries,
        total_delivery_volume=total_delivery_volume,
        delivery_count=delivery_count,

        # DEPRECATED: Delivery information (kept for backward compatibility)
        delivery_occurred=len(deliveries) > 0 or reading_input.delivery_occurred,
        delivery_volume=delivery_volume,
        delivery_time=deliveries[0].delivery_time if deliveries else reading_input.delivery_time,
        supplier=deliveries[0].supplier if deliveries else reading_input.supplier,
        invoice_number=deliveries[0].invoice_number if deliveries else reading_input.invoice_number,

        # Validation
        validation_status=validation_status,
        validation_messages=all_warnings,
        has_discrepancy=calculations['has_discrepancy'],

        # Metadata
        recorded_by=reading_input.recorded_by,
        created_at=datetime.now().isoformat(),
        notes=reading_input.notes
    )

    # Store in database - include all fields even if they're defaults/None
    # Use model_dump for Pydantic v2
    output_dict = output.model_dump(mode='json', exclude_unset=False, exclude_defaults=False, exclude_none=False)
    tank_readings_db[reading_id] = output_dict

    # Update linked deliveries with reading_id (NEW FEATURE)
    for delivery in deliveries:
        if delivery.delivery_id and delivery.delivery_id in tank_deliveries_db:
            tank_deliveries_db[delivery.delivery_id]['linked_reading_id'] = reading_id

    # Return JSONResponse to ensure all fields are included
    return JSONResponse(content=jsonable_encoder(output_dict))


@router.get("/readings/{tank_id}")
def get_tank_readings(
    tank_id: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Get tank readings for a specific tank, optionally filtered by date range.
    """
    # Filter readings by tank_id - return raw dicts to preserve all fields
    readings = [
        r
        for r in tank_readings_db.values()
        if r['tank_id'] == tank_id
    ]

    # Filter by date range if provided
    if start_date:
        readings = [r for r in readings if r['date'] >= start_date]
    if end_date:
        readings = [r for r in readings if r['date'] <= end_date]

    # Sort by date (newest first)
    readings.sort(key=lambda x: x['date'], reverse=True)

    # Return JSONResponse to ensure all fields are included
    return JSONResponse(content=jsonable_encoder(readings))


@router.get("/readings/{tank_id}/latest", response_model=TankVolumeReadingOutput)
def get_latest_reading(
    tank_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Get the most recent reading for a tank.
    """
    readings = [
        TankVolumeReadingOutput(**r)
        for r in tank_readings_db.values()
        if r['tank_id'] == tank_id
    ]

    if not readings:
        raise HTTPException(status_code=404, detail="No readings found for this tank")

    # Sort by date and return latest
    readings.sort(key=lambda x: x.date, reverse=True)
    return readings[0]


@router.post("/deliveries", response_model=TankDeliveryOutput)
def record_delivery(
    delivery_input: TankDeliveryInput,
    current_user: dict = Depends(get_current_user)
):
    """
    Record a fuel delivery to a tank.

    This creates a delivery record and validates the delivery volume.
    """
    # Get tank configuration
    if delivery_input.tank_id not in TANK_CONFIG:
        raise HTTPException(status_code=404, detail=f"Tank {delivery_input.tank_id} not found")

    tank_config = TANK_CONFIG[delivery_input.tank_id]

    # Validate delivery volumes
    if delivery_input.volume_after <= delivery_input.volume_before:
        raise HTTPException(
            status_code=400,
            detail="After delivery volume must be greater than before delivery volume"
        )

    if delivery_input.volume_after > tank_config['capacity']:
        raise HTTPException(
            status_code=400,
            detail=f"After delivery volume ({delivery_input.volume_after}L) exceeds tank capacity ({tank_config['capacity']}L)"
        )

    # Calculate actual delivery
    actual_volume = delivery_input.volume_after - delivery_input.volume_before

    # Calculate variance if expected volume provided
    delivery_variance = None
    variance_percent = None
    validation_status = "PASS"
    validation_message = "Delivery recorded successfully"

    if delivery_input.expected_volume:
        delivery_variance = actual_volume - delivery_input.expected_volume
        variance_percent = (abs(delivery_variance) / delivery_input.expected_volume) * 100

        if abs(variance_percent) > 2.0:  # More than 2% variance
            validation_status = "WARNING"
            if delivery_variance > 0:
                validation_message = f"Received {delivery_variance:.2f}L MORE than expected ({variance_percent:.2f}% variance)"
            else:
                validation_message = f"Received {abs(delivery_variance):.2f}L LESS than expected ({variance_percent:.2f}% variance)"
        elif abs(variance_percent) > 5.0:  # More than 5% variance
            validation_status = "FAIL"
            validation_message = f"CRITICAL: Delivery variance of {variance_percent:.2f}% - Investigation required"

    # Generate delivery ID
    delivery_id = f"DEL-{delivery_input.tank_id}-{delivery_input.date}-{uuid.uuid4().hex[:8]}"

    # Create output
    output = TankDeliveryOutput(
        delivery_id=delivery_id,
        tank_id=delivery_input.tank_id,
        fuel_type=tank_config['fuel_type'],
        date=delivery_input.date,
        time=delivery_input.time,
        volume_before=delivery_input.volume_before,
        volume_after=delivery_input.volume_after,
        actual_volume_delivered=actual_volume,
        expected_volume=delivery_input.expected_volume,
        delivery_variance=delivery_variance,
        variance_percent=variance_percent,
        supplier=delivery_input.supplier,
        invoice_number=delivery_input.invoice_number,
        temperature=delivery_input.temperature,
        validation_status=validation_status,
        validation_message=validation_message,
        linked_reading_id=None,  # NEW: Initially unlinked, available for auto-linking
        recorded_by=delivery_input.recorded_by,
        created_at=datetime.now().isoformat(),
        notes=delivery_input.notes
    )

    # Store in database with linked_reading_id field
    delivery_dict = output.dict()
    delivery_dict['linked_reading_id'] = None  # Explicitly set for auto-linking
    tank_deliveries_db[delivery_id] = delivery_dict

    return output


@router.get("/deliveries/{tank_id}", response_model=List[TankDeliveryOutput])
def get_tank_deliveries(
    tank_id: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    date: Optional[str] = None,           # NEW: Specific date filter
    shift_type: Optional[str] = None,     # NEW: Shift filter ("Day" or "Night")
    unlinked_only: bool = False,          # NEW: Only unlinked deliveries
    current_user: dict = Depends(get_current_user)
):
    """
    Get delivery records for a specific tank with advanced filtering.

    NEW Query Parameters:
    - date: Filter to specific date (YYYY-MM-DD)
    - shift_type: Filter to "Day" or "Night" shift
    - unlinked_only: If true, only return deliveries not linked to readings
    """
    # Filter deliveries by tank_id
    deliveries = [
        TankDeliveryOutput(**d)
        for d in tank_deliveries_db.values()
        if d['tank_id'] == tank_id
    ]

    # Filter by date range if provided
    if start_date:
        deliveries = [d for d in deliveries if d.date >= start_date]
    if end_date:
        deliveries = [d for d in deliveries if d.date <= end_date]

    # NEW: Specific date filter
    if date:
        deliveries = [d for d in deliveries if d.date == date]

    # NEW: Shift filter
    if shift_type:
        shift_ranges = {
            'Day': ('06:00', '18:00'),
            'Night': ('18:00', '06:00')
        }
        start_time, end_time = shift_ranges.get(shift_type, ('00:00', '23:59'))
        deliveries = [
            d for d in deliveries
            if is_time_in_shift(d.time, start_time, end_time, shift_type)
        ]

    # NEW: Unlinked only filter
    if unlinked_only:
        deliveries = [
            d for d in deliveries
            if not tank_deliveries_db.get(d.delivery_id, {}).get('linked_reading_id')
        ]

    # Sort by date and time (newest first)
    deliveries.sort(key=lambda x: (x.date, x.time), reverse=True)

    return deliveries


@router.get("/movement/{tank_id}", response_model=TankMovementSummary)
def get_tank_movement_summary(
    tank_id: str,
    start_date: str,
    end_date: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Get summary of tank movement over a date range.

    Includes:
    - Total volume dispensed
    - Total deliveries
    - Variance analysis
    - Anomaly detection
    """
    # Get tank configuration
    if tank_id not in TANK_CONFIG:
        raise HTTPException(status_code=404, detail=f"Tank {tank_id} not found")

    tank_config = TANK_CONFIG[tank_id]

    # Get readings for date range
    readings = [
        r for r in tank_readings_db.values()
        if r['tank_id'] == tank_id and start_date <= r['date'] <= end_date
    ]

    if not readings:
        raise HTTPException(status_code=404, detail="No readings found for specified date range")

    # Get deliveries for date range
    deliveries = [
        d for d in tank_deliveries_db.values()
        if d['tank_id'] == tank_id and start_date <= d['date'] <= end_date
    ]

    # Calculate totals
    total_volume_dispensed = sum(r['tank_volume_movement'] for r in readings)
    total_deliveries = sum(d['actual_volume_delivered'] for d in deliveries)
    total_electronic_sales = sum(r.get('total_electronic_sales', 0) for r in readings if r.get('total_electronic_sales'))
    total_mechanical_sales = sum(r.get('total_mechanical_sales', 0) for r in readings if r.get('total_mechanical_sales'))

    # Calculate averages
    num_days = len(readings)
    average_daily_movement = total_volume_dispensed / num_days if num_days > 0 else 0

    # Calculate variances
    total_electronic_variance = sum(r.get('electronic_vs_tank_variance', 0) for r in readings if r.get('electronic_vs_tank_variance'))
    total_mechanical_variance = sum(r.get('total_mechanical_sales', 0) for r in readings if r.get('total_mechanical_sales'))

    avg_variance_percent = 0
    if total_volume_dispensed > 0 and total_electronic_sales > 0:
        avg_variance_percent = (abs(total_electronic_variance) / total_volume_dispensed) * 100

    # Detect anomalies
    anomalies = detect_anomalies(readings, lookback_days=7)

    # Determine overall status
    loss_detected = total_electronic_variance < -100  # More than 100L total loss
    estimated_loss = abs(total_electronic_variance) if loss_detected else None

    if avg_variance_percent > 2.0 or loss_detected:
        overall_status = "CRITICAL"
    elif avg_variance_percent > 1.0 or len(anomalies) > 0:
        overall_status = "WARNING"
    else:
        overall_status = "GOOD"

    return TankMovementSummary(
        tank_id=tank_id,
        fuel_type=tank_config['fuel_type'],
        start_date=start_date,
        end_date=end_date,
        total_volume_dispensed=total_volume_dispensed,
        total_deliveries=total_deliveries,
        total_electronic_sales=total_electronic_sales,
        total_mechanical_sales=total_mechanical_sales,
        average_daily_movement=average_daily_movement,
        total_electronic_variance=total_electronic_variance,
        total_mechanical_variance=total_mechanical_variance,
        average_variance_percent=avg_variance_percent,
        number_of_days=num_days,
        number_of_deliveries=len(deliveries),
        overall_status=overall_status,
        loss_detected=loss_detected,
        estimated_loss_volume=estimated_loss
    )


@router.get("/variance/{tank_id}/{date}")
def analyze_daily_variance(
    tank_id: str,
    date: str,
    nozzle_electronic_total: float,
    nozzle_mechanical_total: float,
    current_user: dict = Depends(get_current_user)
):
    """
    Analyze variance between tank movement and nozzle readings for a specific day.

    This compares:
    - Tank Movement (Column AM) vs Electronic Total (Column AN)
    - Tank Movement (Column AM) vs Mechanical Total (Column AO)
    """
    # Find reading for this date
    reading = None
    for r in tank_readings_db.values():
        if r['tank_id'] == tank_id and r['date'] == date:
            reading = r
            break

    if not reading:
        raise HTTPException(status_code=404, detail=f"No reading found for {tank_id} on {date}")

    tank_movement = reading['tank_volume_movement']

    # Calculate electronic variance (Column AP = AN - AM)
    electronic_variance = calculate_variance(
        tank_movement=tank_movement,
        nozzle_sales=nozzle_electronic_total,
        tolerance_percent=0.5
    )

    # Calculate mechanical variance
    mechanical_variance = calculate_variance(
        tank_movement=tank_movement,
        nozzle_sales=nozzle_mechanical_total,
        tolerance_percent=0.5
    )

    return {
        "date": date,
        "tank_id": tank_id,
        "tank_volume_movement": tank_movement,
        "electronic": {
            "total_sales": nozzle_electronic_total,
            **electronic_variance
        },
        "mechanical": {
            "total_sales": nozzle_mechanical_total,
            **mechanical_variance
        },
        "recommendation": _get_variance_recommendation(electronic_variance, mechanical_variance)
    }


def _get_variance_recommendation(electronic_var: dict, mechanical_var: dict) -> str:
    """Generate recommendation based on variance analysis."""
    e_status = electronic_var['status']
    m_status = mechanical_var['status']

    if e_status == 'PASS' and m_status == 'PASS':
        return "All readings are within acceptable range. No action required."
    elif e_status == 'FAIL' or m_status == 'FAIL':
        if electronic_var['variance'] < -100 or mechanical_var['variance'] < -100:
            return "URGENT: Significant loss detected. Check for leaks, theft, or meter calibration issues."
        else:
            return "High variance detected. Verify nozzle meters and tank dip stick calibration."
    else:
        return "Monitor variance. Consider meter calibration if pattern continues."
