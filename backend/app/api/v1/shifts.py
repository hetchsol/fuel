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
from ...services.shift_validation import validate_shift_assignments
from .auth import get_current_user, require_supervisor_or_owner, require_owner, get_station_context

router = APIRouter()

# Sample attendants from the spreadsheet
attendants_list = ["Violet", "Shaka", "Trevor", "Chileshe", "Matthew", "Mubanga", "Isabel", "Prosper"]

@router.post("/", dependencies=[Depends(require_supervisor_or_owner)])
def create_shift(shift: Shift, ctx: dict = Depends(get_station_context)):
    """
    Create a new shift with attendant assignments (supervisor/owner only)
    """
    storage = ctx["storage"]
    shifts_data = storage['shifts']
    readings_data = storage['readings']
    current_user = ctx

    # Validate assignments if present
    if shift.assignments:
        try:
            validate_shift_assignments([a.dict() for a in shift.assignments])
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

    # Populate metadata
    shift.created_by = current_user['user_id']
    shift.created_at = datetime.now().isoformat()

    # Populate backward-compatible attendants list
    if shift.assignments:
        shift.attendants = [a.attendant_name for a in shift.assignments]

    # Validate foreign keys
    validate_create('shifts', shift.dict())

    if shift.shift_id in shifts_data:
        raise HTTPException(status_code=400, detail="Shift already exists")

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

    # Debug output
    print(f"DEBUG: Returning shift_dict with keys: {list(shift_dict.keys())}")
    print(f"DEBUG: assignments value: {shift_dict.get('assignments')}")
    print(f"DEBUG: shift_dict: {shift_dict}")

    return JSONResponse(content=shift_dict)

@router.get("/", response_model=List[Shift])
def get_all_shifts(ctx: dict = Depends(get_station_context)):
    """
    Get all shifts
    """
    storage = ctx["storage"]
    shifts_data = storage['shifts']
    readings_data = storage['readings']

    return [Shift(**shift) for shift in shifts_data.values()]

@router.get("/{shift_id}", response_model=Shift)
def get_shift(shift_id: str, ctx: dict = Depends(get_station_context)):
    """
    Get specific shift details
    """
    storage = ctx["storage"]
    shifts_data = storage['shifts']
    readings_data = storage['readings']

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
    shifts_data = storage['shifts']
    readings_data = storage['readings']

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
    shifts_data = storage['shifts']
    readings_data = storage['readings']

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
    shifts_data = storage['shifts']
    readings_data = storage['readings']

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
    shifts_data = storage['shifts']
    readings_data = storage['readings']

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
    shifts_data = storage['shifts']
    readings_data = storage['readings']

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
def get_attendants():
    """
    Get list of all attendants
    """
    return {"attendants": attendants_list}

@router.put("/{shift_id}/complete")
def complete_shift(shift_id: str, ctx: dict = Depends(get_station_context)):
    """
    Mark shift as completed
    """
    storage = ctx["storage"]
    shifts_data = storage['shifts']
    readings_data = storage['readings']

    if shift_id not in shifts_data:
        raise HTTPException(status_code=404, detail="Shift not found")

    shifts_data[shift_id]["status"] = "completed"
    return {"status": "success", "shift_id": shift_id, "new_status": "completed"}

@router.put("/{shift_id}/reconcile")
def reconcile_shift(shift_id: str, ctx: dict = Depends(get_station_context)):
    """
    Mark shift as reconciled (after banking and cash verification)
    """
    storage = ctx["storage"]
    shifts_data = storage['shifts']
    readings_data = storage['readings']

    if shift_id not in shifts_data:
        raise HTTPException(status_code=404, detail="Shift not found")

    shifts_data[shift_id]["status"] = "reconciled"
    return {"status": "success", "shift_id": shift_id, "new_status": "reconciled"}

@router.put("/{shift_id}/deactivate", dependencies=[Depends(require_supervisor_or_owner)])
def deactivate_shift(shift_id: str, ctx: dict = Depends(get_station_context)):
    """
    Deactivate a shift (supervisor/owner only).
    Only active shifts can be deactivated.
    """
    storage = ctx["storage"]
    shifts_data = storage['shifts']

    if shift_id not in shifts_data:
        raise HTTPException(status_code=404, detail="Shift not found")

    current_status = shifts_data[shift_id].get("status", "active")
    if current_status != "active":
        raise HTTPException(
            status_code=400,
            detail=f"Only active shifts can be deactivated. Current status: {current_status}"
        )

    shifts_data[shift_id]["status"] = "inactive"
    return {"status": "success", "shift_id": shift_id, "new_status": "inactive"}

@router.delete("/{shift_id}", dependencies=[Depends(require_owner)])
def delete_shift(shift_id: str, ctx: dict = Depends(get_station_context)):
    """
    Delete an inactive shift (owner only).
    Only inactive shifts can be deleted.
    """
    storage = ctx["storage"]
    shifts_data = storage['shifts']

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
    return {"status": "success", "shift_id": shift_id, "message": "Shift deleted permanently"}

@router.put("/{shift_id}", response_model=Shift, dependencies=[Depends(require_supervisor_or_owner)])
def update_shift(shift_id: str, shift: Shift, ctx: dict = Depends(get_station_context)):
    """
    Update shift assignments (supervisor/owner only)
    """
    storage = ctx["storage"]
    shifts_data = storage['shifts']
    readings_data = storage['readings']
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

    # Update attendants list for backward compatibility
    if shift.assignments:
        shift.attendants = [a.attendant_name for a in shift.assignments]

    # Update shift
    shifts_data[shift_id] = shift.dict()

    return shift


@router.post("/{shift_id}/tank-dip-reading", dependencies=[Depends(require_supervisor_or_owner)])
def record_tank_dip_reading(shift_id: str, reading: TankDipReading, ctx: dict = Depends(get_station_context)):
    """
    Record tank dip reading (opening or closing) for a shift
    Converts dip measurement (cm) to volume (liters) using tank conversion factor
    """
    storage = ctx["storage"]
    shifts_data = storage['shifts']
    readings_data = storage['readings']
    current_user = ctx

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
    shifts_data = storage['shifts']
    readings_data = storage['readings']

    if shift_id not in shifts_data:
        raise HTTPException(status_code=404, detail="Shift not found")

    shift = shifts_data[shift_id]
    return shift.get('tank_dip_readings', [])
