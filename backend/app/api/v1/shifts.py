"""
Shift Management API
Handles Day and Night shifts, attendant assignments, and dual meter readings
"""
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import JSONResponse
from fastapi.encoders import jsonable_encoder
from typing import List
from datetime import datetime
from ...models.models import Shift, ShiftType, DualReading, NozzleShiftSummary, TankDipReading
from ...services.relationship_validation import validate_create, validate_delete_operation
from ...services.shift_validation import validate_shift_assignments, derive_island_ids_from_nozzles
from .auth import get_current_user, require_supervisor_or_owner, require_owner, get_station_context
from ...services.audit_service import log_audit_event
from ...services.shift_auto_close import check_and_close_stale_shifts
from ...services.shift_status import assert_shift_editable
from ...database.storage import save_station_storage
from ...database.db import DATABASE_URL

router = APIRouter()


def _get_attendants_from_db(station_id: str = None) -> list:
    """Query attendant names from DB (users with role 'user' or 'supervisor')."""
    if DATABASE_URL:
        from ...database.db import db_get_all_users
        users = db_get_all_users()
        return [
            u["full_name"] for u in users
            if u["role"] in ("user", "supervisor")
            and (station_id is None or u.get("station_id") == station_id)
        ]
    # Fallback: in-memory users from auth module
    from .auth import users_db
    return [
        u["full_name"] for u in users_db.values()
        if u["role"] in ("user", "supervisor")
        and (station_id is None or u.get("station_id") == station_id)
    ]


@router.post("/check-stale", dependencies=[Depends(require_supervisor_or_owner)])
def check_stale_shifts(ctx: dict = Depends(get_station_context)):
    """
    On-demand check for stale shifts (active > 20 hours) and stale Phase-1
    readings (awaiting closing > 4 hours). Supervisor/owner only.
    """
    closed = check_and_close_stale_shifts(ctx["storage"], ctx["station_id"])
    from .attendant_handover import notify_stale_readings
    stale_readings_notified = notify_stale_readings(ctx["station_id"])
    return {
        "checked": True,
        "auto_closed_count": len(closed),
        "auto_closed_shift_ids": closed,
        "stale_readings_notified": stale_readings_notified,
    }


@router.post("/", dependencies=[Depends(require_supervisor_or_owner)])
def create_shift(shift: Shift, ctx: dict = Depends(get_station_context)):
    """
    Create a new shift with attendant assignments (supervisor/owner only)
    """
    storage = ctx["storage"]
    shifts_data = storage.get('shifts', {})
    readings_data = storage.get('readings', [])
    current_user = ctx

    # Validate assignments if present
    if shift.assignments:
        try:
            validate_shift_assignments([a.dict() for a in shift.assignments])
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

    # Auto-derive island_ids from nozzle assignments (nozzle-first flexibility)
    if shift.assignments:
        for a in shift.assignments:
            if a.nozzle_ids:
                a.island_ids = derive_island_ids_from_nozzles(a.nozzle_ids)

    # Populate metadata
    shift.created_by = current_user['user_id']
    shift.created_at = datetime.now().isoformat()

    # Populate backward-compatible attendants list
    if shift.assignments:
        shift.attendants = [a.attendant_name for a in shift.assignments]

    # Validate foreign keys
    validate_create('shifts', shift.dict())

    if shift.shift_id in shifts_data:
        existing_status = shifts_data[shift.shift_id].get("status", "active")
        if existing_status != "inactive":
            raise HTTPException(status_code=400, detail="Shift already exists and is still active. Deactivate it first.")

    # Manually construct response to ensure all fields are included
    shift_dict = {
        "shift_id": shift.shift_id,
        "date": shift.date,
        "shift_type": shift.shift_type,
        "attendants": shift.attendants,
        "assignments": [a.dict() for a in shift.assignments] if shift.assignments else [],
        "start_time": shift.start_time,
        "end_time": shift.end_time,
        "status": shift.status,
        "created_by": shift.created_by,
        "created_at": shift.created_at
    }

    shifts_data[shift.shift_id] = shift_dict

    log_audit_event(
        station_id=ctx["station_id"],
        action="shift_create",
        performed_by=ctx["username"],
        entity_type="shift",
        entity_id=shift.shift_id,
        details={"date": shift.date, "shift_type": shift_dict.get("shift_type"), "attendants": shift.attendants},
    )

    return JSONResponse(content=shift_dict)

@router.get("/", response_model=List[Shift])
def get_all_shifts(ctx: dict = Depends(get_station_context)):
    """
    Get all shifts
    """
    storage = ctx["storage"]
    shifts_data = storage.get('shifts', {})
    readings_data = storage.get('readings', [])

    return [Shift(**shift) for shift in shifts_data.values()]

@router.get("/{shift_id}", response_model=Shift)
def get_shift(shift_id: str, ctx: dict = Depends(get_station_context)):
    """
    Get specific shift details
    """
    storage = ctx["storage"]
    shifts_data = storage.get('shifts', {})
    readings_data = storage.get('readings', [])

    if shift_id not in shifts_data:
        raise HTTPException(status_code=404, detail="Shift not found")

    return Shift(**shifts_data[shift_id])

@router.get("/date/{date}")
def get_shifts_by_date(date: str, ctx: dict = Depends(get_station_context)):
    """
    Get shifts for a specific date (YYYY-MM-DD)
    Returns both Day and Night shifts
    """
    storage = ctx["storage"]
    shifts_data = storage.get('shifts', {})
    readings_data = storage.get('readings', [])

    date_shifts = [
        Shift(**shift) for shift in shifts_data.values()
        if shift["date"] == date
    ]
    return date_shifts

@router.get("/current/active")
def get_current_shift(ctx: dict = Depends(get_station_context)):
    """
    Get the currently active shift based on time
    """
    storage = ctx["storage"]
    shifts_data = storage.get('shifts', {})
    readings_data = storage.get('readings', [])

    now = datetime.now()
    hour = now.hour
    date_str = now.strftime("%Y-%m-%d")

    # Determine shift type based on hour (6 AM to 6 PM = Day, 6 PM to 6 AM = Night)
    shift_type = ShiftType.DAY if 6 <= hour < 18 else ShiftType.NIGHT

    # Look for matching active shift
    for shift in shifts_data.values():
        if shift["date"] == date_str and shift["shift_type"] == shift_type and shift["status"] == "active":
            return Shift(**shift)

    # Create new shift if none exists
    shift_id = f"{date_str}-{shift_type.value}"
    new_shift = Shift(
        shift_id=shift_id,
        date=date_str,
        shift_type=shift_type,
        attendants=[],
        status="active"
    )
    shifts_data[shift_id] = new_shift.dict()
    return new_shift

@router.post("/readings", response_model=DualReading)
def submit_dual_reading(reading: DualReading, ctx: dict = Depends(get_station_context)):
    """
    Submit dual reading (Electronic + Mechanical) for a nozzle
    """
    storage = ctx["storage"]
    shifts_data = storage.get('shifts', {})
    readings_data = storage.get('readings', [])

    # Validate foreign keys (nozzle_id, shift_id)
    validate_create('readings', reading.dict())

    readings_data.append(reading.dict())
    return reading

@router.get("/{shift_id}/readings")
def get_shift_readings(shift_id: str, ctx: dict = Depends(get_station_context)):
    """
    Get all readings for a specific shift
    """
    storage = ctx["storage"]
    shifts_data = storage.get('shifts', {})
    readings_data = storage.get('readings', [])

    shift_readings = [
        DualReading(**r) for r in readings_data
        if r["shift_id"] == shift_id
    ]
    return shift_readings

@router.get("/{shift_id}/nozzle/{nozzle_id}/summary")
def get_nozzle_shift_summary(shift_id: str, nozzle_id: str, ctx: dict = Depends(get_station_context)):
    """
    Get summary for a specific nozzle during a shift
    Calculates opening, closing, and movement for both electronic and mechanical
    """
    storage = ctx["storage"]
    shifts_data = storage.get('shifts', {})
    readings_data = storage.get('readings', [])

    nozzle_readings = [
        r for r in readings_data
        if r["shift_id"] == shift_id and r["nozzle_id"] == nozzle_id
    ]

    if not nozzle_readings:
        raise HTTPException(status_code=404, detail="No readings found for this nozzle in this shift")

    opening_reading = next((r for r in nozzle_readings if r["reading_type"] == "Opening"), None)
    closing_reading = next((r for r in nozzle_readings if r["reading_type"] == "Closing"), None)

    if not opening_reading or not closing_reading:
        raise HTTPException(status_code=400, detail="Both opening and closing readings required")

    electronic_movement = closing_reading["electronic_reading"] - opening_reading["electronic_reading"]
    mechanical_movement = closing_reading["mechanical_reading"] - opening_reading["mechanical_reading"]
    discrepancy = electronic_movement - mechanical_movement

    summary = NozzleShiftSummary(
        nozzle_id=nozzle_id,
        shift_id=shift_id,
        attendant=opening_reading["attendant"],
        electronic_opening=opening_reading["electronic_reading"],
        electronic_closing=closing_reading["electronic_reading"],
        electronic_movement=electronic_movement,
        mechanical_opening=opening_reading["mechanical_reading"],
        mechanical_closing=closing_reading["mechanical_reading"],
        mechanical_movement=mechanical_movement,
        discrepancy=discrepancy
    )

    return summary

@router.get("/attendants/list")
def get_attendants(ctx: dict = Depends(get_station_context)):
    """
    Get list of all attendants for the current station (dynamically from users DB)
    """
    return {"attendants": _get_attendants_from_db(ctx.get("station_id"))}

@router.put("/{shift_id}/complete", dependencies=[Depends(require_supervisor_or_owner)])
def complete_shift(shift_id: str, ctx: dict = Depends(get_station_context)):
    """
    Mark shift as completed. Supervisor/owner only.

    Note: the normal path advances a shift to 'completed' automatically once all
    its handovers are approved (see services.shift_status). This endpoint is a
    manual override and is guarded the same way.
    """
    storage = ctx["storage"]
    shifts_data = storage.get('shifts', {})

    if shift_id not in shifts_data:
        raise HTTPException(status_code=404, detail="Shift not found")

    # Cannot complete a shift that is already locked (reconciled / inactive).
    assert_shift_editable(shifts_data[shift_id])

    shifts_data[shift_id]["status"] = "completed"
    shifts_data[shift_id]["completed_at"] = datetime.now().isoformat()
    save_station_storage(ctx["station_id"])

    log_audit_event(
        station_id=ctx["station_id"],
        action="shift_completed",
        performed_by=ctx["username"],
        entity_type="shift",
        entity_id=shift_id,
        details={"trigger": "manual"},
    )

    return {"status": "success", "shift_id": shift_id, "new_status": "completed"}

@router.put("/{shift_id}/reconcile", dependencies=[Depends(require_supervisor_or_owner)])
def reconcile_shift(shift_id: str, ctx: dict = Depends(get_station_context)):
    """
    Mark shift as reconciled (after banking and cash verification).
    Supervisor/owner only. A shift must be 'completed' (or 'auto-closed') first,
    enforcing the active → completed → reconciled ordering.

    Note: the normal path reconciles a date's shifts automatically at Daily
    Close-Off (see services.shift_status.reconcile_shifts_for_date). This
    endpoint is a manual override.
    """
    storage = ctx["storage"]
    shifts_data = storage.get('shifts', {})

    if shift_id not in shifts_data:
        raise HTTPException(status_code=404, detail="Shift not found")

    # Block re-reconciling a locked shift, and enforce ordering.
    assert_shift_editable(shifts_data[shift_id])
    current_status = shifts_data[shift_id].get("status", "active")
    if current_status not in ("completed", "auto-closed"):
        raise HTTPException(
            status_code=400,
            detail=f"Shift must be completed before it can be reconciled (current status: {current_status}).",
        )

    shifts_data[shift_id]["status"] = "reconciled"
    shifts_data[shift_id]["reconciled_at"] = datetime.now().isoformat()
    save_station_storage(ctx["station_id"])

    log_audit_event(
        station_id=ctx["station_id"],
        action="shift_reconciled",
        performed_by=ctx["username"],
        entity_type="shift",
        entity_id=shift_id,
        details={"trigger": "manual"},
    )

    return {"status": "success", "shift_id": shift_id, "new_status": "reconciled"}

@router.put("/{shift_id}/deactivate", dependencies=[Depends(require_supervisor_or_owner)])
def deactivate_shift(shift_id: str, ctx: dict = Depends(get_station_context)):
    """
    Deactivate a shift (supervisor/owner only).
    Only active shifts can be deactivated.
    """
    storage = ctx["storage"]
    shifts_data = storage.get('shifts', {})

    if shift_id not in shifts_data:
        raise HTTPException(status_code=404, detail="Shift not found")

    current_status = shifts_data[shift_id].get("status", "active")
    if current_status != "active":
        raise HTTPException(
            status_code=400,
            detail=f"Only active shifts can be deactivated. Current status: {current_status}"
        )

    shifts_data[shift_id]["status"] = "inactive"
    save_station_storage(ctx["station_id"])

    log_audit_event(
        station_id=ctx["station_id"],
        action="shift_deactivated",
        performed_by=ctx["username"],
        entity_type="shift",
        entity_id=shift_id,
        details={"previous_status": current_status},
    )

    return {"status": "success", "shift_id": shift_id, "new_status": "inactive"}

@router.delete("/{shift_id}", dependencies=[Depends(require_owner)])
def delete_shift(shift_id: str, ctx: dict = Depends(get_station_context)):
    """
    Delete an inactive shift (owner only).
    Only inactive shifts can be deleted.
    """
    storage = ctx["storage"]
    shifts_data = storage.get('shifts', {})

    if shift_id not in shifts_data:
        raise HTTPException(status_code=404, detail="Shift not found")

    current_status = shifts_data[shift_id].get("status", "active")
    if current_status != "inactive":
        raise HTTPException(
            status_code=400,
            detail=f"Only inactive shifts can be deleted. Deactivate the shift first. Current status: {current_status}"
        )

    # Check for dependent records before deleting
    validate_delete_operation('shifts', shift_id, storage=storage)

    del shifts_data[shift_id]
    save_station_storage(ctx["station_id"])

    log_audit_event(
        station_id=ctx["station_id"],
        action="shift_deleted",
        performed_by=ctx["username"],
        entity_type="shift",
        entity_id=shift_id,
        details={"previous_status": current_status},
    )

    return {"status": "success", "shift_id": shift_id, "message": "Shift deleted permanently"}

@router.put("/{shift_id}", response_model=Shift, dependencies=[Depends(require_supervisor_or_owner)])
def update_shift(shift_id: str, shift: Shift, ctx: dict = Depends(get_station_context)):
    """
    Update shift assignments (supervisor/owner only)
    """
    storage = ctx["storage"]
    shifts_data = storage.get('shifts', {})
    readings_data = storage.get('readings', [])
    current_user = ctx

    if shift_id not in shifts_data:
        raise HTTPException(status_code=404, detail="Shift not found")

    # Reject updates to inactive shifts
    if shifts_data[shift_id].get("status") == "inactive":
        raise HTTPException(status_code=400, detail="Cannot update an inactive shift")

    # Validate assignments if present
    if shift.assignments:
        try:
            validate_shift_assignments([a.dict() for a in shift.assignments])
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

    # Auto-derive island_ids from nozzle assignments (nozzle-first flexibility)
    if shift.assignments:
        for a in shift.assignments:
            if a.nozzle_ids:
                a.island_ids = derive_island_ids_from_nozzles(a.nozzle_ids)

    # Update attendants list for backward compatibility
    if shift.assignments:
        shift.attendants = [a.attendant_name for a in shift.assignments]

    # Update shift
    shifts_data[shift_id] = shift.dict()

    return shift


@router.post("/{shift_id}/tank-dip-reading", dependencies=[Depends(require_supervisor_or_owner)])
def record_tank_dip_reading(shift_id: str, reading: TankDipReading, ctx: dict = Depends(get_station_context), current_user: dict = Depends(get_current_user)):
    """
    Record tank dip reading (opening or closing) for a shift
    Converts dip measurement (cm) to volume (liters) using tank conversion factor
    Supervisors and owners can record; regular users have read-only access.
    """

    storage = ctx["storage"]
    shifts_data = storage.get('shifts', {})
    readings_data = storage.get('readings', [])

    if shift_id not in shifts_data:
        raise HTTPException(status_code=404, detail="Shift not found")

    # Validate tank exists
    from ...config import TANK_CONVERSION_FACTOR

    tanks = storage.get('tanks', {})
    if reading.tank_id not in tanks:
        raise HTTPException(status_code=404, detail=f"Tank {reading.tank_id} not found")

    shift = shifts_data[shift_id]

    # Initialize tank_dip_readings if not exists
    if 'tank_dip_readings' not in shift:
        shift['tank_dip_readings'] = []

    # Find existing reading for this tank or create new one
    existing_reading = None
    for idx, r in enumerate(shift['tank_dip_readings']):
        if r['tank_id'] == reading.tank_id:
            existing_reading = idx
            break

    # Convert dip to volume
    if reading.opening_dip_cm is not None:
        reading.opening_volume_liters = reading.opening_dip_cm * TANK_CONVERSION_FACTOR
    if reading.closing_dip_cm is not None:
        reading.closing_volume_liters = reading.closing_dip_cm * TANK_CONVERSION_FACTOR

    # Add audit fields
    reading.recorded_at = datetime.now().isoformat()
    reading.recorded_by = ctx.get("user_id", "")

    reading_dict = reading.dict()

    if existing_reading is not None:
        # Update existing reading
        shift['tank_dip_readings'][existing_reading] = reading_dict
    else:
        # Add new reading
        shift['tank_dip_readings'].append(reading_dict)

    return {
        "status": "success",
        "message": f"Tank dip reading recorded for {reading.tank_id}",
        "shift_id": shift_id,
        "reading": reading_dict
    }


@router.get("/{shift_id}/tank-dip-readings")
def get_shift_tank_dip_readings(shift_id: str, ctx: dict = Depends(get_station_context)):
    """
    Get all tank dip readings for a shift
    """
    storage = ctx["storage"]
    shifts_data = storage.get('shifts', {})

    if shift_id not in shifts_data:
        raise HTTPException(status_code=404, detail="Shift not found")

    shift = shifts_data[shift_id]
    return shift.get('tank_dip_readings', [])


@router.get("/{shift_id}/previous-dip-readings")
def get_previous_dip_readings(shift_id: str, ctx: dict = Depends(get_station_context)):
    """
    Get closing dip readings from the previous shift to auto-populate opening values.
    Logic: If current is Night → get Day of same date. If Day → get Night of previous day.
    Falls back to the most recent completed shift with dip readings.
    """
    from datetime import timedelta

    storage = ctx["storage"]
    shifts_data = storage.get('shifts', {})

    if shift_id not in shifts_data:
        raise HTTPException(status_code=404, detail="Shift not found")

    current_shift = shifts_data[shift_id]
    current_date = current_shift.get("date", "")
    current_type = current_shift.get("shift_type", "Day")

    # Determine the target previous shift
    if current_type == "Night":
        target_date = current_date
        target_type = "Day"
    else:
        try:
            prev = datetime.strptime(current_date, "%Y-%m-%d") - timedelta(days=1)
            target_date = prev.strftime("%Y-%m-%d")
        except ValueError:
            target_date = current_date
        target_type = "Night"

    # Search for target shift
    previous_dips = []
    found_shift_id = None

    # First try exact match
    for sid, s in shifts_data.items():
        if sid == shift_id:
            continue
        if s.get("date") == target_date and s.get("shift_type") == target_type:
            dips = s.get("tank_dip_readings", [])
            if dips:
                previous_dips = dips
                found_shift_id = sid
                break

    # Fallback: most recent shift with dip readings
    if not previous_dips:
        candidates = []
        for sid, s in shifts_data.items():
            if sid == shift_id:
                continue
            dips = s.get("tank_dip_readings", [])
            if not dips:
                continue
            shift_order = 1 if s.get("shift_type") == "Night" else 0
            candidates.append((s.get("date", ""), shift_order, sid, dips))

        candidates.sort(reverse=True)
        # Filter to only shifts before current
        current_order = 1 if current_type == "Night" else 0
        for date_str, order, sid, dips in candidates:
            if date_str < current_date or (date_str == current_date and order < current_order):
                previous_dips = dips
                found_shift_id = sid
                break

    if not previous_dips:
        return {"found": False, "message": "No previous dip readings found", "readings": []}

    # Map closing values → opening values for auto-populate
    auto_populate = []
    for dip in previous_dips:
        if dip.get("closing_dip_cm") is not None:
            auto_populate.append({
                "tank_id": dip["tank_id"],
                "opening_dip_cm": dip["closing_dip_cm"],
                "opening_volume_liters": dip.get("closing_volume_liters"),
            })

    prev_shift = shifts_data.get(found_shift_id, {})
    return {
        "found": True,
        "source_shift_id": found_shift_id,
        "source_date": prev_shift.get("date", ""),
        "source_shift_type": prev_shift.get("shift_type", ""),
        "readings": auto_populate,
    }
