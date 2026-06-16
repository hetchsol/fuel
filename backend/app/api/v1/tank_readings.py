"""
Tank Volume Readings API - Column AM Implementation

Endpoints for recording and retrieving tank volume readings with delivery tracking.
Implements Excel Column AM logic for calculating tank volume movement.
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import JSONResponse
from fastapi.encoders import jsonable_encoder
from typing import List, Optional
from datetime import datetime, date
import uuid
import json
import os

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
    detect_anomalies,
    calculate_delivery_vat
)
from ...services.delivery_timeline import (
    calculate_inter_delivery_sales,
    validate_delivery_sequence
)
from ...services.reconciliation_service import (
    get_reconciliation_summary_for_shift
)
from ...api.v1.auth import get_current_user
from .auth import get_station_context
from .tank_calibrations import ensure_calibration_loaded
from ...database.station_files import load_station_json, save_station_json
from ...services.notification_service import create_notification

router = APIRouter()


def load_tank_readings(station_id: str) -> dict:
    """Load tank readings from station-specific storage"""
    return load_station_json(station_id, 'tank_readings.json', default={})


def save_tank_readings(tank_readings_db: dict, station_id: str):
    """Save tank readings to station-specific storage"""
    save_station_json(station_id, 'tank_readings.json', tank_readings_db)


def load_tank_deliveries(station_id: str) -> dict:
    """Load tank deliveries from station-specific storage"""
    return load_station_json(station_id, 'tank_deliveries.json', default={})


def save_tank_deliveries(tank_deliveries_db: dict, station_id: str):
    """Save tank deliveries to station-specific storage"""
    save_station_json(station_id, 'tank_deliveries.json', tank_deliveries_db)


# ===== TANK DIPS — LIGHTWEIGHT UPSERT =====

@router.post("/dips")
def record_tank_dips(
    tank_id: str,
    date: str,
    shift_type: str,
    recorded_by: str,
    opening_dip_cm: Optional[float] = None,
    closing_dip_cm: Optional[float] = None,
    delivery_supplier: Optional[str] = None,
    delivery_invoice_number: Optional[str] = None,
    delivery_time: Optional[str] = None,
    delivery_volume_liters: Optional[float] = None,
    ctx: dict = Depends(get_station_context),
):
    """
    Manager+ only. Create or update dip readings for a single tank/date/shift.
    When closing dip exceeds opening dip a delivery is required and written to
    tank_deliveries.json in the same request — one path, one save.
    """
    from ...services.dip_conversion import dip_to_volume
    from ...database.storage import save_station_storage

    role = ctx.get("role", "")
    if role not in ("manager", "owner"):
        raise HTTPException(status_code=403, detail="Only managers and owners can record tank dip readings.")

    station_id = ctx["station_id"]
    storage = ctx["storage"]
    ensure_calibration_loaded(tank_id, station_id)
    tank_readings_db = load_tank_readings(station_id)

    # Find existing record for this tank/date/shift
    existing_id = next(
        (rid for rid, r in tank_readings_db.items()
         if r.get("tank_id") == tank_id
         and r.get("date") == date
         and r.get("shift_type", "").lower() == shift_type.lower()),
        None
    )

    opening_volume = dip_to_volume(tank_id, opening_dip_cm) if opening_dip_cm is not None else None
    closing_volume = dip_to_volume(tank_id, closing_dip_cm) if closing_dip_cm is not None else None

    if (opening_volume is not None and closing_volume is not None
            and closing_volume > opening_volume
            and not delivery_supplier):
        raise HTTPException(
            status_code=400,
            detail="A delivery must be recorded when the closing dip exceeds the opening dip.",
        )

    now = datetime.utcnow().isoformat()

    if existing_id:
        rec = tank_readings_db[existing_id]
        if opening_dip_cm is not None:
            rec["opening_dip_cm"] = opening_dip_cm
            rec["opening_volume"] = opening_volume
        if closing_dip_cm is not None:
            rec["closing_dip_cm"] = closing_dip_cm
            rec["closing_volume"] = closing_volume
        rec["recorded_by"] = recorded_by
        rec["updated_at"] = now
        reading_id = existing_id
    else:
        reading_id = str(uuid.uuid4())
        tank_readings_db[reading_id] = {
            "reading_id": reading_id,
            "tank_id": tank_id,
            "date": date,
            "shift_type": shift_type,
            "opening_dip_cm": opening_dip_cm,
            "opening_volume": opening_volume,
            "closing_dip_cm": closing_dip_cm,
            "closing_volume": closing_volume,
            "recorded_by": recorded_by,
            "created_at": now,
            "updated_at": now,
            "nozzle_readings": [],
            "deliveries": [],
        }

    # Write or update delivery record when supplier is provided
    delivery_id = tank_readings_db[reading_id].get("delivery_id")
    if delivery_supplier:
        tank_deliveries_db = load_tank_deliveries(station_id)
        vol_delivered = (
            delivery_volume_liters
            if delivery_volume_liters is not None
            else round((closing_volume or 0) - (opening_volume or 0), 1)
        )
        fuel_type = storage.get("tanks", {}).get(tank_id, {}).get("fuel_type", "")
        if delivery_id and delivery_id in tank_deliveries_db:
            d = tank_deliveries_db[delivery_id]
            d["supplier"] = delivery_supplier
            d["invoice_number"] = delivery_invoice_number
            d["time"] = delivery_time or d.get("time", "12:00")
            d["actual_volume_delivered"] = vol_delivered
            d["volume_before"] = opening_volume
            d["volume_after"] = closing_volume
            d["updated_at"] = now
        else:
            delivery_id = f"DEL-{tank_id}-{date}-{uuid.uuid4().hex[:8]}"
            tank_deliveries_db[delivery_id] = {
                "delivery_id": delivery_id,
                "tank_id": tank_id,
                "fuel_type": fuel_type,
                "date": date,
                "time": delivery_time or "12:00",
                "before_delivery_dip_cm": opening_dip_cm,
                "after_delivery_dip_cm": closing_dip_cm,
                "volume_before": opening_volume,
                "volume_after": closing_volume,
                "actual_volume_delivered": vol_delivered,
                "supplier": delivery_supplier,
                "invoice_number": delivery_invoice_number,
                "flowmeter_volume": None,
                "invoice_volume_liters": None,
                "expected_volume": None,
                "delivery_variance": None,
                "variance_percent": None,
                "temperature": None,
                "validation_status": "PASS",
                "validation_message": "Recorded via tank dip entry",
                "linked_reading_id": reading_id,
                "recorded_by": recorded_by,
                "created_at": now,
            }
        tank_readings_db[reading_id]["delivery_id"] = delivery_id
        save_tank_deliveries(tank_deliveries_db, station_id)

    # Keep tank.current_level in sync only when the dip is for today — retrospective
    # entries must not overwrite the live level with historical data.
    today = datetime.utcnow().strftime("%Y-%m-%d")
    if closing_volume is not None and date == today:
        tank_data = storage.get("tanks", {})
        if tank_id in tank_data:
            tank_data[tank_id]["current_level"] = closing_volume
            tank_data[tank_id]["last_updated"] = now

    save_tank_readings(tank_readings_db, station_id)
    save_station_storage(station_id)

    rec = tank_readings_db[reading_id]
    return {
        "reading_id": reading_id,
        "tank_id": tank_id,
        "date": date,
        "shift_type": shift_type,
        "opening_dip_cm": rec.get("opening_dip_cm"),
        "opening_volume": rec.get("opening_volume"),
        "closing_dip_cm": rec.get("closing_dip_cm"),
        "closing_volume": rec.get("closing_volume"),
        "delivery_id": delivery_id,
    }


@router.get("/dips")
def get_tank_dips(
    date: str,
    shift_type: str,
    ctx: dict = Depends(get_station_context),
):
    """Return dip records for all tanks for a given date/shift."""
    tank_readings_db = load_tank_readings(ctx["station_id"])
    results = [
        {
            "tank_id": r.get("tank_id"),
            "opening_dip_cm": r.get("opening_dip_cm"),
            "opening_volume": r.get("opening_volume"),
            "closing_dip_cm": r.get("closing_dip_cm"),
            "closing_volume": r.get("closing_volume"),
            "recorded_by": r.get("recorded_by"),
            "updated_at": r.get("updated_at") or r.get("created_at"),
            "delivery_id": r.get("delivery_id"),
        }
        for r in tank_readings_db.values()
        if r.get("date") == date and r.get("shift_type", "").lower() == shift_type.lower()
        and (r.get("opening_dip_cm") is not None or r.get("closing_dip_cm") is not None)
    ]
    return results


# ===== DELIVERY THREE-WAY RECONCILIATION =====

def compute_delivery_recon(expected_volume, flowmeter_volume, tank_dip_change):
    """
    Compute delivery three-way reconciliation: Invoice vs Flowmeter vs Tank Dip.
    Returns dict of recon fields, or dict of Nones if insufficient data.
    """
    if expected_volume is None or flowmeter_volume is None or tank_dip_change is None or tank_dip_change <= 0:
        return {
            "recon_invoice_vs_flowmeter": None,
            "recon_flowmeter_vs_tank": None,
            "recon_invoice_vs_tank": None,
            "recon_status": None,
            "recon_outlier": None,
        }

    inv_vs_flow = round(expected_volume - flowmeter_volume, 2)
    flow_vs_tank = round(flowmeter_volume - tank_dip_change, 2)
    inv_vs_tank = round(expected_volume - tank_dip_change, 2)

    # Percentage variances (relative to expected_volume as baseline)
    baseline = expected_volume if expected_volume > 0 else 1
    inv_flow_pct = abs(inv_vs_flow) / baseline * 100
    flow_tank_pct = abs(flow_vs_tank) / baseline * 100
    inv_tank_pct = abs(inv_vs_tank) / baseline * 100

    # Tolerance thresholds (matching existing delivery variance thresholds)
    MINOR_PCT = 2.0
    INVESTIGATION_PCT = 5.0

    max_pct = max(inv_flow_pct, flow_tank_pct, inv_tank_pct)
    if max_pct <= MINOR_PCT:
        status = "BALANCED"
    elif max_pct <= INVESTIGATION_PCT:
        status = "VARIANCE_MINOR"
    else:
        status = "VARIANCE_INVESTIGATION"

    # Pattern matching: identify the outlier source
    outlier = None
    if status != "BALANCED":
        inv_flow_ok = inv_flow_pct <= MINOR_PCT
        flow_tank_ok = flow_tank_pct <= MINOR_PCT
        inv_tank_ok = inv_tank_pct <= MINOR_PCT

        if inv_flow_ok and not flow_tank_ok and not inv_tank_ok:
            outlier = "TANK"       # Invoice & Flowmeter agree, Tank differs
        elif flow_tank_ok and not inv_flow_ok and not inv_tank_ok:
            outlier = "INVOICE"    # Flowmeter & Tank agree, Invoice differs
        elif inv_tank_ok and not inv_flow_ok and not flow_tank_ok:
            outlier = "FLOWMETER"  # Invoice & Tank agree, Flowmeter differs
        else:
            outlier = "MULTIPLE"

    return {
        "recon_invoice_vs_flowmeter": inv_vs_flow,
        "recon_flowmeter_vs_tank": flow_vs_tank,
        "recon_invoice_vs_tank": inv_vs_tank,
        "recon_status": status,
        "recon_outlier": outlier,
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
    shift_type: str,
    tank_deliveries_db: dict
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
        tank_deliveries_db: Deliveries database dict

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
            if is_time_in_shift(delivery_time, start_time, end_time, shift_type):
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


def get_previous_reading_cumulatives(
    tank_readings_db: dict,
    tank_id: str,
    current_date: str,
    current_shift_type: str
) -> dict:
    """
    Find the most recent reading for the same tank before the current date/shift
    and return its running totals (default 0 if no previous reading).

    Sort order: date desc, Night(1) > Day(0).
    """
    shift_order = {"Night": 1, "Day": 0}
    current_sort_key = (current_date, shift_order.get(current_shift_type, 0))

    candidates = []
    for r in tank_readings_db.values():
        if r.get('tank_id') != tank_id:
            continue
        r_key = (r['date'], shift_order.get(r.get('shift_type', 'Day'), 0))
        if r_key < current_sort_key:
            candidates.append((r_key, r))

    if not candidates:
        return {
            'running_total_volume_sold': 0.0,
            'running_total_variance': 0.0,
            'running_total_tank_movement': 0.0,
        }

    # Get the most recent one
    candidates.sort(key=lambda x: x[0], reverse=True)
    prev = candidates[0][1]

    return {
        'running_total_volume_sold': prev.get('running_total_volume_sold', 0.0) or 0.0,
        'running_total_variance': prev.get('running_total_variance', 0.0) or 0.0,
        'running_total_tank_movement': prev.get('running_total_tank_movement', 0.0) or 0.0,
    }


@router.post("/readings", response_model=TankVolumeReadingOutput, response_model_exclude_unset=False, response_model_exclude_defaults=False, response_model_exclude_none=False)
def submit_tank_reading(
    reading_input: TankVolumeReadingInput,
    ctx: dict = Depends(get_station_context)
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

    station_id = ctx["station_id"]
    storage = ctx["storage"]
    role = ctx.get("role", "")
    ensure_calibration_loaded(reading_input.tank_id, station_id)
    tank_readings_db = load_tank_readings(station_id)
    tank_deliveries_db = load_tank_deliveries(station_id)

    # Only owners may overwrite an existing record (historical correction).
    # Supervisors and other roles can still create new records for the current shift.
    existing_for_upsert = next(
        (rid for rid, r in tank_readings_db.items()
         if r.get('tank_id') == reading_input.tank_id
         and r.get('date') == reading_input.date
         and r.get('shift_type', '').lower() == reading_input.shift_type.lower()),
        None
    )
    existing_record = tank_readings_db.get(existing_for_upsert, {}) if existing_for_upsert else {}
    existing_is_complete = bool(existing_record.get('nozzle_readings'))
    if existing_for_upsert and existing_is_complete and role != "owner":
        raise HTTPException(
            status_code=403,
            detail="Only the owner can update an existing tank reading record."
        )

    # Dip consistency: if a dip-only record from the Tank Dips page exists,
    # submitted values must match (within float tolerance) or be absent.
    DIP_FLOAT_TOLERANCE_CM = 0.01
    if existing_for_upsert:
        stored_opening = existing_record.get('opening_dip_cm')
        stored_closing = existing_record.get('closing_dip_cm')

        opening_mismatch = (
            stored_opening is not None
            and reading_input.opening_dip_cm is not None
            and abs(stored_opening - reading_input.opening_dip_cm) > DIP_FLOAT_TOLERANCE_CM
        )
        closing_mismatch = (
            stored_closing is not None
            and reading_input.closing_dip_cm is not None
            and abs(stored_closing - reading_input.closing_dip_cm) > DIP_FLOAT_TOLERANCE_CM
        )

        if opening_mismatch or closing_mismatch:
            raise HTTPException(
                status_code=409,
                detail={
                    "message": "Dip values conflict with the record on the Tank Dips page.",
                    "stored": {
                        "opening_dip_cm": stored_opening,
                        "closing_dip_cm": stored_closing,
                    },
                    "submitted": {
                        "opening_dip_cm": reading_input.opening_dip_cm,
                        "closing_dip_cm": reading_input.closing_dip_cm,
                    },
                    "instruction": (
                        "Correct the dip on the Tank Dips page first, or submit "
                        "with the values shown there."
                    ),
                }
            )

    # Get tank configuration from runtime storage
    tanks = storage.get('tanks', {})
    if reading_input.tank_id not in tanks:
        raise HTTPException(status_code=404, detail=f"Tank {reading_input.tank_id} not found")

    tank_config = tanks[reading_input.tank_id]

    # Guard: every dip conversion needs an uploaded calibration chart for this tank.
    try:
        dip_validation_opening = validate_dip_reading(reading_input.tank_id, reading_input.opening_dip_cm)
        dip_validation_closing = validate_dip_reading(reading_input.tank_id, reading_input.closing_dip_cm)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    all_errors = []
    all_warnings = []

    if not dip_validation_opening['valid']:
        all_errors.extend(dip_validation_opening['errors'])
    all_warnings.extend(dip_validation_opening.get('warnings', []))

    if not dip_validation_closing['valid']:
        all_errors.extend(dip_validation_closing['errors'])
    all_warnings.extend(dip_validation_closing.get('warnings', []))

    # Convert dip readings to volumes if not provided
    try:
        opening_volume = reading_input.opening_volume
        if opening_volume is None:
            opening_volume = dip_to_volume(reading_input.tank_id, reading_input.opening_dip_cm)

        closing_volume = reading_input.closing_volume
        if closing_volume is None:
            closing_volume = dip_to_volume(reading_input.tank_id, reading_input.closing_dip_cm)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    # ===== HANDLE MULTIPLE DELIVERIES (NEW FEATURE) =====
    deliveries = []

    # OPTION 1: Deliveries provided inline (new format from UI)
    # Write-through: any delivery without a delivery_id gets a canonical DEL-* record in
    # tank_deliveries.json so that store is always the single source of truth.
    if reading_input.deliveries and len(reading_input.deliveries) > 0:
        resolved = []
        for d in reading_input.deliveries:
            if not d.delivery_id:
                new_del_id = f"DEL-{reading_input.tank_id}-{reading_input.date}-{uuid.uuid4().hex[:8]}"
                tank_deliveries_db[new_del_id] = {
                    "delivery_id": new_del_id,
                    "tank_id": reading_input.tank_id,
                    "fuel_type": tank_config.get("fuel_type", ""),
                    "date": reading_input.date,
                    "time": d.delivery_time,
                    "before_delivery_dip_cm": d.before_delivery_dip_cm,
                    "after_delivery_dip_cm": d.after_delivery_dip_cm,
                    "volume_before": d.before_volume,
                    "volume_after": d.after_volume,
                    "actual_volume_delivered": d.volume_delivered,
                    "supplier": d.supplier,
                    "invoice_number": d.invoice_number,
                    "flowmeter_volume": d.flowmeter_volume,
                    "invoice_volume_liters": None,
                    "expected_volume": None,
                    "delivery_variance": None,
                    "variance_percent": None,
                    "temperature": None,
                    "validation_status": "PASS",
                    "validation_message": "Recorded via daily reading submission",
                    "linked_reading_id": None,
                    "recorded_by": reading_input.recorded_by,
                    "created_at": datetime.now().isoformat(),
                    "notes": reading_input.notes,
                }
                resolved.append(DeliveryReference(
                    delivery_id=new_del_id,
                    volume_delivered=d.volume_delivered,
                    delivery_time=d.delivery_time,
                    supplier=d.supplier,
                    invoice_number=d.invoice_number,
                    before_volume=d.before_volume,
                    after_volume=d.after_volume,
                    flowmeter_volume=d.flowmeter_volume,
                    before_delivery_dip_cm=d.before_delivery_dip_cm,
                    after_delivery_dip_cm=d.after_delivery_dip_cm,
                ))
            else:
                resolved.append(d)
        deliveries = resolved

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
            shift_type=reading_input.shift_type,
            tank_deliveries_db=tank_deliveries_db
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

    # Validate volume readings (supports both legacy and new multi-delivery format)
    validation = validate_tank_readings(
        opening=opening_volume,
        closing=closing_volume,
        before_offload=before_offload_volume,
        after_offload=after_offload_volume,
        tank_capacity=tank_config['capacity'],
        deliveries=deliveries  # Pass new format deliveries list
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

    # Calculate inter-delivery sales timeline
    delivery_timeline = None
    if deliveries and len(deliveries) > 0:
        deliveries_dict = [d.dict() for d in deliveries]
        delivery_timeline = calculate_inter_delivery_sales(
            deliveries=deliveries_dict,
            opening_volume=opening_volume,
            closing_volume=closing_volume
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

    # Calculate three-way reconciliation (Tank, Nozzle, Cash)
    reconciliation = get_reconciliation_summary_for_shift({
        'tank_volume_movement': tank_movement,
        'total_electronic_dispensed': calculations['total_electronic_dispensed'],
        'total_mechanical_dispensed': calculations['total_mechanical_dispensed'],
        'actual_cash_banked': calculations.get('actual_cash_banked'),
        'price_per_liter': calculations.get('price_per_liter', 0)
    }, storage=ctx["storage"])

    # Calculate delivery VAT (Gap 2)
    delivery_vat_amount = None
    delivery_net_price = None
    delivery_vat_per_liter = None
    if total_delivery_volume > 0 and price > 0:
        from ...config import resolve_vat_rate, resolve_fuel_levy
        _vat_rate = resolve_vat_rate(storage)
        _levy = resolve_fuel_levy(storage)
        vat_result = calculate_delivery_vat(total_delivery_volume, price, levy=_levy, vat_rate=_vat_rate, vat_divisor=1 + _vat_rate)
        delivery_vat_amount = vat_result['vat_amount']
        delivery_net_price = vat_result['net_price_per_liter']
        delivery_vat_per_liter = vat_result['vat_per_liter']

    # Calculate cross-shift cumulative running totals (Gap 3)
    prev_cumulatives = get_previous_reading_cumulatives(
        tank_readings_db, reading_input.tank_id,
        reading_input.date, reading_input.shift_type
    )
    per_shift_volume_sold = calculations.get('cumulative_volume_sold', 0.0) or 0.0  # (AN+AO)/2
    per_shift_variance = calculations.get('electronic_vs_tank_variance', 0.0) or 0.0  # AP
    per_shift_tank_movement = tank_movement  # AM

    running_total_volume_sold = prev_cumulatives['running_total_volume_sold'] + per_shift_volume_sold
    running_total_variance = prev_cumulatives['running_total_variance'] + per_shift_variance
    running_total_tank_movement = prev_cumulatives['running_total_tank_movement'] + per_shift_tank_movement
    running_loss_percent = (
        (running_total_variance / running_total_tank_movement * 100)
        if running_total_tank_movement != 0 else 0.0
    )

    # Upsert: reuse the existing reading_id if one already exists for this
    # tank + date + shift so that re-submitting edits the record in place
    # rather than creating a duplicate entry.
    existing_id = next(
        (rid for rid, r in tank_readings_db.items()
         if r.get('tank_id') == reading_input.tank_id
         and r.get('date') == reading_input.date
         and r.get('shift_type', '').lower() == reading_input.shift_type.lower()),
        None
    )
    reading_id = existing_id or f"TR-{reading_input.tank_id}-{reading_input.date}-{uuid.uuid4().hex[:8]}"

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

        # Delivery VAT (Gap 2)
        delivery_vat_amount=delivery_vat_amount,
        delivery_net_price=delivery_net_price,
        delivery_vat_per_liter=delivery_vat_per_liter,

        # Cross-shift cumulative running totals (Gap 3)
        running_total_volume_sold=round(running_total_volume_sold, 2),
        running_total_variance=round(running_total_variance, 2),
        running_total_tank_movement=round(running_total_tank_movement, 2),
        running_loss_percent=round(running_loss_percent, 4),

        # Pump averages (Columns AY-BB)
        pump_averages=calculations.get('pump_averages'),

        # NEW: Multiple deliveries support
        deliveries=deliveries,
        total_delivery_volume=total_delivery_volume,
        delivery_count=delivery_count,

        # Inter-delivery sales timeline
        delivery_timeline=delivery_timeline,

        # Three-way reconciliation report
        reconciliation=reconciliation,

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
    save_tank_readings(tank_readings_db, station_id)  # Persist to file

    # Update linked deliveries with reading_id (NEW FEATURE)
    for delivery in deliveries:
        if delivery.delivery_id and delivery.delivery_id in tank_deliveries_db:
            tank_deliveries_db[delivery.delivery_id]['linked_reading_id'] = reading_id

    if deliveries:
        save_tank_deliveries(tank_deliveries_db, station_id)  # Persist linked delivery updates

    # --- Notifications ---
    from ...services.naming_convention import compute_tank_display_name
    tank_name = compute_tank_display_name(reading_input.tank_id, tanks)
    # Tank level checks
    tank_capacity = tank_config.get('capacity', 0)
    if tank_capacity > 0 and closing_volume is not None:
        level_pct = (closing_volume / tank_capacity) * 100
        if level_pct < 10:
            create_notification(
                station_id=station_id,
                type="TANK_LEVEL_CRITICAL",
                severity="critical",
                title="Critical Tank Level",
                message=f"{tank_name} is at {level_pct:.1f}% capacity ({closing_volume:.0f}L / {tank_capacity:.0f}L)",
                entity_type="tank",
                entity_id=reading_input.tank_id,
            )
        elif level_pct < 25:
            create_notification(
                station_id=station_id,
                type="TANK_LEVEL_LOW",
                severity="medium",
                title="Low Tank Level",
                message=f"{tank_name} is at {level_pct:.1f}% capacity ({closing_volume:.0f}L / {tank_capacity:.0f}L)",
                entity_type="tank",
                entity_id=reading_input.tank_id,
            )

    # High variance
    if validation_status == 'FAIL':
        create_notification(
            station_id=station_id,
            type="HIGH_VARIANCE",
            severity="high",
            title="High Variance Detected",
            message=f"{tank_name} on {reading_input.date} ({reading_input.shift_type}): Variance exceeds warning threshold",
            entity_type="tank",
            entity_id=reading_input.tank_id,
        )

    # Delivery loss check
    if deliveries and total_delivery_volume > 0:
        from ...config import get_allowable_loss_percent
        fuel_type = tank_config.get('fuel_type', 'Diesel')
        allowable_pct = get_allowable_loss_percent(fuel_type)
        # Simple loss estimation from tank movement vs delivery
        for d in deliveries:
            if d.volume_delivered > 0 and d.before_volume and d.after_volume:
                measured = d.after_volume - d.before_volume
                loss = d.volume_delivered - measured
                loss_pct = (loss / d.volume_delivered * 100) if d.volume_delivered > 0 else 0
                if loss_pct > allowable_pct:
                    create_notification(
                        station_id=station_id,
                        type="DELIVERY_LOSS_EXCESSIVE",
                        severity="high",
                        title="Excessive Delivery Loss",
                        message=f"Delivery to {tank_name}: Loss {loss:.1f}L ({loss_pct:.2f}%) exceeds allowable {allowable_pct}%",
                        entity_type="delivery",
                        entity_id=reading_id,
                    )

        # Delivery received notification
        create_notification(
            station_id=station_id,
            type="DELIVERY_RECEIVED",
            severity="medium",
            title="Delivery Recorded",
            message=f"{fuel_type} delivery of {total_delivery_volume:.0f}L recorded for {tank_name}",
            entity_type="delivery",
            entity_id=reading_id,
        )

    # Return JSONResponse to ensure all fields are included
    return JSONResponse(content=jsonable_encoder(output_dict))


def _enrich_tank_record(r: dict, deliveries_db: dict, tanks: dict) -> None:
    """Normalize a tank reading record — fill in derived fields missing from simple dip records."""
    o_vol = r.get('opening_volume') or r.get('opening_volume_liters') or 0
    c_vol = r.get('closing_volume') or r.get('closing_volume_liters') or 0

    if r.get('tank_volume_movement') is None:
        r['tank_volume_movement'] = round(o_vol - c_vol, 3)

    for field, default in [
        ('total_electronic_dispensed', 0.0),
        ('total_mechanical_dispensed', 0.0),
        ('electronic_vs_tank_variance', 0.0),
        ('mechanical_vs_tank_variance', 0.0),
        ('electronic_vs_tank_percent', 0.0),
        ('mechanical_vs_tank_percent', 0.0),
        ('expected_amount_electronic', 0.0),
        ('price_per_liter', 0.0),
        ('loss_percent', 0.0),
    ]:
        if r.get(field) is None:
            r[field] = default

    if not r.get('validation_status'):
        r['validation_status'] = 'PASS'
    if r.get('nozzle_readings') is None:
        r['nozzle_readings'] = []
    if r.get('deliveries') is None:
        r['deliveries'] = []
    if not r.get('fuel_type'):
        r['fuel_type'] = tanks.get(r.get('tank_id', ''), {}).get('fuel_type', '')

    delivery_id = r.get('delivery_id')
    if delivery_id and not r['deliveries']:
        d = deliveries_db.get(delivery_id)
        if d:
            r['deliveries'] = [{
                'delivery_id': d.get('delivery_id', ''),
                'supplier': d.get('supplier', ''),
                'volume_delivered': d.get('actual_volume_delivered', 0),
                'delivery_time': d.get('time', ''),
                'invoice_number': d.get('invoice_number'),
            }]


@router.get("/dip-ledger")
def get_dip_ledger(
    start_date: str = Query(..., description="Start date (YYYY-MM-DD)"),
    end_date: str = Query(..., description="End date (YYYY-MM-DD)"),
    ctx: dict = Depends(get_station_context),
):
    """Return all tanks' dip records for the given date range, normalized."""
    tank_readings_db = load_tank_readings(ctx["station_id"])
    deliveries_db = load_tank_deliveries(ctx["station_id"])
    tanks = ctx["storage"].get("tanks", {})

    records = [
        dict(r)
        for r in tank_readings_db.values()
        if start_date <= r.get('date', '') <= end_date
        and (r.get('opening_dip_cm') is not None or r.get('closing_dip_cm') is not None)
    ]
    for r in records:
        _enrich_tank_record(r, deliveries_db, tanks)

    shift_order = {'Day': 0, 'Night': 1}
    records.sort(
        key=lambda x: (x.get('date', ''), shift_order.get(x.get('shift_type', ''), 0)),
        reverse=True,
    )
    return JSONResponse(content=jsonable_encoder(records))


@router.get("/readings/{tank_id}")
def get_tank_readings(
    tank_id: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    ctx: dict = Depends(get_station_context)
):
    """
    Get tank readings for a specific tank, optionally filtered by date range.
    """
    tank_readings_db = load_tank_readings(ctx["station_id"])

    # Filter readings by tank_id - return raw dicts to preserve all fields
    readings = [
        dict(r)
        for r in tank_readings_db.values()
        if r['tank_id'] == tank_id
    ]

    # Fallback: if no tank_readings entries, build from shift dip readings
    if not readings:
        storage = ctx["storage"]
        shifts_data = storage.get('shifts', {})
        for shift_id, shift in shifts_data.items():
            for dip in shift.get('tank_dip_readings', []):
                if dip.get('tank_id') != tank_id:
                    continue
                reading_entry = {
                    "reading_id": f"DIP-{shift_id}-{tank_id}",
                    "tank_id": tank_id,
                    "date": shift.get("date", ""),
                    "shift_type": shift.get("shift_type", ""),
                    "shift_id": shift_id,
                    "opening_dip_cm": dip.get("opening_dip_cm"),
                    "closing_dip_cm": dip.get("closing_dip_cm"),
                    "opening_volume": dip.get("opening_volume_liters"),
                    "closing_volume": dip.get("closing_volume_liters"),
                    "recorded_by": dip.get("recorded_by", ""),
                    "created_at": dip.get("recorded_at", ""),
                }
                readings.append(reading_entry)

    # Filter by date range if provided
    if start_date:
        readings = [r for r in readings if r.get('date', '') >= start_date]
    if end_date:
        readings = [r for r in readings if r.get('date', '') <= end_date]

    # Normalize: fill in derived fields for dip-only records
    deliveries_db = load_tank_deliveries(ctx["station_id"])
    tanks = ctx["storage"].get("tanks", {})
    for r in readings:
        _enrich_tank_record(r, deliveries_db, tanks)

    # Sort by date (newest first)
    readings.sort(key=lambda x: x.get('date', ''), reverse=True)

    # Return JSONResponse to ensure all fields are included
    return JSONResponse(content=jsonable_encoder(readings))


@router.get("/readings/{tank_id}/latest", response_model=TankVolumeReadingOutput)
def get_latest_reading(
    tank_id: str,
    ctx: dict = Depends(get_station_context)
):
    """
    Get the most recent reading for a tank.
    """
    tank_readings_db = load_tank_readings(ctx["station_id"])

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


@router.get("/readings/{tank_id}/by-shift")
def get_reading_by_shift(
    tank_id: str,
    date: str,
    shift_type: str,
    ctx: dict = Depends(get_station_context)
):
    """
    Return the saved tank reading for a specific tank + date + shift, or 404.
    Used by the frontend to detect and load an existing record when the user
    selects a date/shift combination that has already been entered.
    """
    tank_readings_db = load_tank_readings(ctx["station_id"])
    for reading in tank_readings_db.values():
        if (reading.get('tank_id') == tank_id
                and reading.get('date') == date
                and reading.get('shift_type', '').lower() == shift_type.lower()):
            return JSONResponse(content=jsonable_encoder(reading))
    raise HTTPException(status_code=404, detail="No reading found for this tank/date/shift")


@router.get("/readings/{tank_id}/previous-shift")
def get_previous_shift_closing(
    tank_id: str,
    current_date: str,
    shift_type: str,
    ctx: dict = Depends(get_station_context)
):
    """
    Get closing readings from the previous shift to auto-populate opening readings.

    Logic:
    - If current shift is Night: Get Day shift from same date
    - If current shift is Day: Get Night shift from previous day

    Returns the previous shift's closing values that become the new shift's opening values.
    """
    from datetime import datetime, timedelta

    tank_readings_db = load_tank_readings(ctx["station_id"])

    # Determine which previous shift to look for
    if shift_type.lower() == 'night':
        # Night shift: look for Day shift from same date
        target_date = current_date
        target_shift = 'Day'
    else:
        # Day shift: look for Night shift from previous day
        prev_date = datetime.strptime(current_date, '%Y-%m-%d') - timedelta(days=1)
        target_date = prev_date.strftime('%Y-%m-%d')
        target_shift = 'Night'

    # Find the matching reading
    matching_readings = [
        r for r in tank_readings_db.values()
        if r['tank_id'] == tank_id
        and r['date'] == target_date
        and r.get('shift_type', '').lower() == target_shift.lower()
    ]

    if not matching_readings:
        # Try to find the most recent reading for this tank as fallback
        all_readings = [
            r for r in tank_readings_db.values()
            if r['tank_id'] == tank_id
        ]

        if not all_readings:
            raise HTTPException(
                status_code=404,
                detail=f"No previous readings found for {tank_id}. Please enter opening values manually."
            )

        # Sort by date and shift (Night comes after Day on same date)
        def sort_key(r):
            shift_order = 1 if r.get('shift_type', '').lower() == 'night' else 0
            return (r['date'], shift_order)

        all_readings.sort(key=sort_key, reverse=True)
        previous_reading = all_readings[0]
    else:
        previous_reading = matching_readings[0]

    # Extract the closing values to become opening values
    previous_closing = {
        "found": True,
        "source_date": previous_reading['date'],
        "source_shift": previous_reading.get('shift_type', 'Unknown'),
        "source_reading_id": previous_reading.get('reading_id', ''),

        # Tank dip and volume - these become the new opening values.
        # Accept both field name conventions: tank_readings.json uses 'closing_volume';
        # shift dip records use 'closing_volume_liters'. Normalise to opening_volume.
        "opening_dip_cm": previous_reading.get('closing_dip_cm', 0),
        "opening_volume": previous_reading.get('closing_volume') or previous_reading.get('closing_volume_liters', 0),

        # Nozzle readings - closing values become opening values
        "nozzle_readings": []
    }

    # Build a lookup table: display_label → internal_nozzle_id and vice-versa,
    # scoped to the tank's fuel type so mixed-fuel islands don't cross-contaminate.
    from ...services.naming_convention import resolve_nozzle_display_to_internal
    islands_data = ctx["storage"].get("islands", {})
    tanks_data = ctx["storage"].get("tanks", {})
    tank_fuel = (tanks_data.get(tank_id) or {}).get("fuel_type", "")

    # Two maps for bidirectional resolution:
    #   display_label → internal_id  (for entries that stored display labels)
    #   internal_id   → display_label (for entries that stored internal IDs)
    display_to_internal: dict = {}
    internal_to_display: dict = {}
    for isl in islands_data.values():
        ps = isl.get("pump_station") or {}
        for nz in ps.get("nozzles", []):
            if tank_fuel and nz.get("fuel_type") != tank_fuel:
                continue
            nid = nz.get("nozzle_id", "")
            lbl = nz.get("display_label") or ""
            if nid and lbl:
                display_to_internal[lbl] = nid
                internal_to_display[nid] = lbl

    # Extract nozzle closing readings
    for nozzle in previous_reading.get('nozzle_readings', []):
        stored_id = nozzle.get('nozzle_id', '')
        # Resolve the counterpart ID regardless of which format was stored
        if stored_id in display_to_internal:
            # Stored as display label (e.g. "1A") — resolve to internal
            internal_id = display_to_internal[stored_id]
        elif stored_id in internal_to_display:
            # Stored as internal ID (e.g. "ISL001-N1-A") — normalise display label
            internal_id = stored_id
            stored_id = internal_to_display[stored_id]  # return display label as nozzle_id
        else:
            internal_id = None

        previous_closing["nozzle_readings"].append({
            "nozzle_id": stored_id,
            "internal_nozzle_id": internal_id,
            "attendant": nozzle.get('attendant', ''),
            "electronic_opening": nozzle.get('electronic_closing', 0),
            "mechanical_opening": nozzle.get('mechanical_closing', 0)
        })

    return previous_closing


@router.get("/attendant-last-readings")
def get_attendant_last_readings(
    attendant_name: str,
    tank_id: Optional[str] = None,
    ctx: dict = Depends(get_station_context),
):
    """
    Get the most recent nozzle readings for a specific attendant.
    Searches tank_readings for the last entry where this attendant was assigned.
    Returns their closing readings (electronic + mechanical) per nozzle.
    """
    station_id = ctx["station_id"]
    tank_readings_db = load_tank_readings(station_id)

    # Collect all nozzle readings for this attendant across all tank reading entries
    attendant_nozzles = []

    for reading in tank_readings_db.values():
        if tank_id and reading.get('tank_id') != tank_id:
            continue
        entry_date = reading.get('date', '')
        shift_type = reading.get('shift_type', '')
        shift_order = 1 if shift_type.lower() == 'night' else 0

        for nozzle in reading.get('nozzle_readings', []):
            if nozzle.get('attendant', '').lower() == attendant_name.lower():
                attendant_nozzles.append({
                    "nozzle_id": nozzle.get('nozzle_id', ''),
                    "electronic_closing": nozzle.get('electronic_closing', 0),
                    "mechanical_closing": nozzle.get('mechanical_closing', 0),
                    "electronic_opening": nozzle.get('electronic_opening', 0),
                    "mechanical_opening": nozzle.get('mechanical_opening', 0),
                    "date": entry_date,
                    "shift_type": shift_type,
                    "sort_key": (entry_date, shift_order),
                })

    if not attendant_nozzles:
        # Fallback: check handover data
        from .attendant_handover import _load_handovers
        handovers = _load_handovers(station_id)

        for ho in handovers.values():
            if ho.get('attendant_name', '').lower() != attendant_name.lower():
                continue
            ho_date = ho.get('date', '')
            ho_shift = ho.get('shift_type', '')
            shift_order = 1 if ho_shift.lower() == 'night' else 0

            for ns in ho.get('nozzle_summaries', []):
                attendant_nozzles.append({
                    "nozzle_id": ns.get('nozzle_id', ''),
                    "electronic_closing": ns.get('closing_reading', 0),
                    "mechanical_closing": ns.get('mechanical_closing', 0),
                    "electronic_opening": ns.get('opening_reading', 0),
                    "mechanical_opening": ns.get('mechanical_opening', 0),
                    "date": ho_date,
                    "shift_type": ho_shift,
                    "sort_key": (ho_date, shift_order),
                })

    if not attendant_nozzles:
        return {
            "found": False,
            "message": f"No previous readings found for attendant '{attendant_name}'.",
            "nozzle_readings": [],
        }

    # Sort by date+shift descending to get most recent first
    attendant_nozzles.sort(key=lambda x: x['sort_key'], reverse=True)

    # Get the most recent date+shift combo
    latest_key = attendant_nozzles[0]['sort_key']
    latest_nozzles = [n for n in attendant_nozzles if n['sort_key'] == latest_key]

    # Clean up sort_key before returning
    for n in latest_nozzles:
        del n['sort_key']

    return {
        "found": True,
        "attendant_name": attendant_name,
        "source_date": latest_nozzles[0]['date'],
        "source_shift": latest_nozzles[0]['shift_type'],
        "nozzle_readings": latest_nozzles,
    }


@router.post("/deliveries", response_model=TankDeliveryOutput)
def record_delivery(
    delivery_input: TankDeliveryInput,
    ctx: dict = Depends(get_station_context)
):
    """
    Record a fuel delivery to a tank.

    This creates a delivery record and validates the delivery volume.
    """
    role = ctx.get("role", "")
    if role not in ("manager", "owner"):
        raise HTTPException(status_code=403, detail="Only managers and owners can record fuel deliveries.")

    station_id = ctx["station_id"]
    storage = ctx["storage"]
    tank_deliveries_db = load_tank_deliveries(station_id)

    # Get tank configuration from runtime storage
    tanks = storage.get('tanks', {})
    if delivery_input.tank_id not in tanks:
        raise HTTPException(status_code=404, detail=f"Tank {delivery_input.tank_id} not found")

    tank_config = tanks[delivery_input.tank_id]
    ensure_calibration_loaded(delivery_input.tank_id, station_id)

    # Derive volumes from dip readings via calibration chart
    try:
        volume_before = dip_to_volume(delivery_input.tank_id, delivery_input.before_delivery_dip_cm)
        volume_after  = dip_to_volume(delivery_input.tank_id, delivery_input.after_delivery_dip_cm)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    # Hard rejects
    if delivery_input.after_delivery_dip_cm <= delivery_input.before_delivery_dip_cm:
        raise HTTPException(
            status_code=400,
            detail="After-delivery dip must be greater than before-delivery dip"
        )
    if volume_after > tank_config['capacity']:
        raise HTTPException(
            status_code=400,
            detail=f"After-delivery volume ({volume_after:.0f}L) exceeds tank capacity ({tank_config['capacity']:.0f}L)"
        )

    # Sequence guard: before-dip volume must not be lower than last delivery's after-volume
    existing = [v for v in tank_deliveries_db.values()
                if v.get('tank_id') == delivery_input.tank_id and v.get('date') == delivery_input.date]
    if existing:
        last = max(existing, key=lambda x: x.get('time', ''))
        last_after_vol = last.get('volume_after', 0) or 0
        tolerance = max(last_after_vol * 0.005, 10)  # 0.5% or 10L floor
        if volume_before < last_after_vol - tolerance:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Before-delivery dip converts to {volume_before:.0f}L, which is lower than the "
                    f"last delivery's after-dip ({last_after_vol:.0f}L). "
                    f"Check dip reading or delivery order."
                )
            )

    # Calculate actual delivery
    actual_volume = volume_after - volume_before

    # Calculate variance if invoice volume provided
    delivery_variance = None
    variance_percent = None
    validation_status = "PASS"
    validation_message = "Delivery recorded successfully"

    if delivery_input.invoice_volume_liters:
        delivery_variance = actual_volume - delivery_input.invoice_volume_liters
        variance_percent = (abs(delivery_variance) / delivery_input.invoice_volume_liters) * 100

        if abs(variance_percent) > 5.0:
            validation_status = "FAIL"
            validation_message = f"CRITICAL: Delivery variance of {variance_percent:.2f}% - Investigation required"
        elif abs(variance_percent) > 2.0:
            validation_status = "WARNING"
            if delivery_variance > 0:
                validation_message = f"Received {delivery_variance:.2f}L MORE than invoice ({variance_percent:.2f}% variance)"
            else:
                validation_message = f"Received {abs(delivery_variance):.2f}L LESS than invoice ({variance_percent:.2f}% variance)"

    # Compute delivery three-way reconciliation (Invoice vs Flowmeter vs Tank Dip)
    recon = compute_delivery_recon(
        expected_volume=delivery_input.invoice_volume_liters,
        flowmeter_volume=delivery_input.flowmeter_volume,
        tank_dip_change=actual_volume,
    )

    # Generate delivery ID
    delivery_id = f"DEL-{delivery_input.tank_id}-{delivery_input.date}-{uuid.uuid4().hex[:8]}"

    # Create output
    output = TankDeliveryOutput(
        delivery_id=delivery_id,
        tank_id=delivery_input.tank_id,
        fuel_type=tank_config['fuel_type'],
        date=delivery_input.date,
        time=delivery_input.time,
        before_delivery_dip_cm=delivery_input.before_delivery_dip_cm,
        after_delivery_dip_cm=delivery_input.after_delivery_dip_cm,
        volume_before=volume_before,
        volume_after=volume_after,
        actual_volume_delivered=actual_volume,
        invoice_volume_liters=delivery_input.invoice_volume_liters,
        expected_volume=delivery_input.invoice_volume_liters,  # recon compat
        delivery_variance=delivery_variance,
        variance_percent=variance_percent,
        supplier=delivery_input.supplier,
        invoice_number=delivery_input.invoice_number,
        flowmeter_volume=delivery_input.flowmeter_volume,
        temperature=delivery_input.temperature,
        validation_status=validation_status,
        validation_message=validation_message,
        **recon,
        linked_reading_id=None,
        recorded_by=delivery_input.recorded_by,
        created_at=datetime.now().isoformat(),
        notes=delivery_input.notes
    )

    # Store in database
    delivery_dict = output.dict()
    tank_deliveries_db[delivery_id] = delivery_dict
    save_tank_deliveries(tank_deliveries_db, station_id)

    # Update tank current_level to reflect the delivery
    tanks_data = storage.get('tanks', {})
    if delivery_input.tank_id in tanks_data:
        tanks_data[delivery_input.tank_id]["current_level"] = volume_after
        tanks_data[delivery_input.tank_id]["last_updated"] = datetime.now().isoformat()

    return output


@router.get("/deliveries/{tank_id}", response_model=List[TankDeliveryOutput])
def get_tank_deliveries(
    tank_id: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    date: Optional[str] = None,
    shift_type: Optional[str] = None,
    unlinked_only: bool = False,
    ctx: dict = Depends(get_station_context)
):
    """Get delivery records for a specific tank with optional filtering."""
    role = ctx.get("role", "")
    if role not in ("manager", "owner"):
        raise HTTPException(status_code=403, detail="Only managers and owners can view fuel delivery records.")

    tank_deliveries_db = load_tank_deliveries(ctx["station_id"])

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
    ctx: dict = Depends(get_station_context)
):
    """
    Get summary of tank movement over a date range.

    Includes:
    - Total volume dispensed
    - Total deliveries
    - Variance analysis
    - Anomaly detection
    """
    tank_readings_db = load_tank_readings(ctx["station_id"])
    tank_deliveries_db = load_tank_deliveries(ctx["station_id"])

    # Get tank configuration from runtime storage
    tanks = ctx["storage"].get('tanks', {})
    if tank_id not in tanks:
        raise HTTPException(status_code=404, detail=f"Tank {tank_id} not found")

    tank_config = tanks[tank_id]

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

    # Create notifications for detected anomalies
    for anomaly in anomalies:
        a_type = anomaly.get("type", "")
        if a_type == "CONSISTENT_LOSS":
            create_notification(
                station_id=ctx["station_id"],
                type="CONSISTENT_LOSS",
                severity="critical",
                title="Consistent Tank Loss",
                message=anomaly.get("message", f"Consistent loss detected for {tank_id}"),
                entity_type="tank",
                entity_id=tank_id,
            )
        elif a_type == "HIGH_CONSUMPTION":
            create_notification(
                station_id=ctx["station_id"],
                type="HIGH_CONSUMPTION",
                severity="high",
                title="High Consumption Detected",
                message=anomaly.get("message", f"High consumption detected for {tank_id}"),
                entity_type="tank",
                entity_id=tank_id,
            )

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
    ctx: dict = Depends(get_station_context)
):
    """
    Analyze variance between tank movement and nozzle readings for a specific day.

    This compares:
    - Tank Movement (Column AM) vs Electronic Total (Column AN)
    - Tank Movement (Column AM) vs Mechanical Total (Column AO)
    """
    tank_readings_db = load_tank_readings(ctx["station_id"])

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


@router.get("/readings/{reading_id}/timeline")
def get_delivery_timeline(reading_id: str, ctx: dict = Depends(get_station_context)):
    """
    Get delivery timeline for a specific reading showing sales between deliveries.

    Returns comprehensive timeline showing:
    - Shift opening
    - Sales before each delivery
    - Each delivery event
    - Sales between deliveries
    - Sales after last delivery
    - Shift closing

    Useful for understanding exactly when fuel was delivered and sold during the shift.
    """
    tank_readings_db = load_tank_readings(ctx["station_id"])

    # Find the reading
    reading = None
    for r in tank_readings_db.values():
        if r['reading_id'] == reading_id:
            reading = r
            break

    if not reading:
        raise HTTPException(status_code=404, detail=f"Reading {reading_id} not found")

    # Check if timeline already calculated
    if reading.get('delivery_timeline'):
        return reading['delivery_timeline']

    # Calculate timeline if not already present
    deliveries = reading.get('deliveries', [])
    opening_volume = reading.get('opening_volume') or reading.get('opening_volume_liters', 0)
    closing_volume = reading.get('closing_volume') or reading.get('closing_volume_liters', 0)

    timeline = calculate_inter_delivery_sales(
        deliveries=deliveries,
        opening_volume=opening_volume,
        closing_volume=closing_volume
    )

    return timeline
