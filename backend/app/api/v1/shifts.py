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
from ...database.storage import STORAGE
from .auth import get_current_user, require_supervisor_or_owner

router = APIRouter()

# Use central storage
shifts_data = STORAGE['shifts']
readings_data = STORAGE['readings']

# Sample attendants from the spreadsheet
attendants_list = ["Violet", "Shaka", "Trevor", "Chileshe", "Matthew", "Mubanga", "Isabel", "Prosper"]

@router.post("/", dependencies=[Depends(require_supervisor_or_owner)])
def create_shift(shift: Shift, current_user: dict = Depends(get_current_user)):
    """
    Create a new shift with attendant assignments (supervisor/owner only)
    """
    # Validate assignments if present
    if shift.assignments:
        validate_shift_assignments([a.dict() for a in shift.assignments])

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
def get_all_shifts():
    """
    Get all shifts
    """
    return [Shift(**shift) for shift in shifts_data.values()]

@router.get("/{shift_id}", response_model=Shift)
def get_shift(shift_id: str):
    """
    Get specific shift details
    """
    if shift_id not in shifts_data:
        raise HTTPException(status_code=404, detail="Shift not found")

    return Shift(**shifts_data[shift_id])

@router.get("/date/{date}")
def get_shifts_by_date(date: str):
    """
    Get shifts for a specific date (YYYY-MM-DD)
    Returns both Day and Night shifts
    """
    date_shifts = [
        Shift(**shift) for shift in shifts_data.values()
        if shift["date"] == date
    ]
    return date_shifts

@router.get("/current/active")
def get_current_shift():
    """
    Get the currently active shift based on time
    """
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
def submit_dual_reading(reading: DualReading):
    """
    Submit dual reading (Electronic + Mechanical) for a nozzle
    """
    # Validate foreign keys (nozzle_id, shift_id)
    validate_create('readings', reading.dict())

    readings_data.append(reading.dict())
    return reading

@router.get("/{shift_id}/readings")
def get_shift_readings(shift_id: str):
    """
    Get all readings for a specific shift
    """
    shift_readings = [
        DualReading(**r) for r in readings_data
        if r["shift_id"] == shift_id
    ]
    return shift_readings

@router.get("/{shift_id}/nozzle/{nozzle_id}/summary")
def get_nozzle_shift_summary(shift_id: str, nozzle_id: str):
    """
    Get summary for a specific nozzle during a shift
    Calculates opening, closing, and movement for both electronic and mechanical
    """
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
def complete_shift(shift_id: str):
    """
    Mark shift as completed
    """
    if shift_id not in shifts_data:
        raise HTTPException(status_code=404, detail="Shift not found")

    shifts_data[shift_id]["status"] = "completed"
    return {"status": "success", "shift_id": shift_id, "new_status": "completed"}

@router.put("/{shift_id}/reconcile")
def reconcile_shift(shift_id: str):
    """
    Mark shift as reconciled (after banking and cash verification)
    """
    if shift_id not in shifts_data:
        raise HTTPException(status_code=404, detail="Shift not found")

    shifts_data[shift_id]["status"] = "reconciled"
    return {"status": "success", "shift_id": shift_id, "new_status": "reconciled"}

@router.put("/{shift_id}", response_model=Shift, dependencies=[Depends(require_supervisor_or_owner)])
def update_shift(shift_id: str, shift: Shift, current_user: dict = Depends(get_current_user)):
    """
    Update shift assignments (supervisor/owner only)
    """
    if shift_id not in shifts_data:
        raise HTTPException(status_code=404, detail="Shift not found")

    # Validate assignments if present
    if shift.assignments:
        validate_shift_assignments([a.dict() for a in shift.assignments])

    # Update attendants list for backward compatibility
    if shift.assignments:
        shift.attendants = [a.attendant_name for a in shift.assignments]

    # Update shift
    shifts_data[shift_id] = shift.dict()

    return shift


@router.post("/{shift_id}/tank-dip-reading", dependencies=[Depends(require_supervisor_or_owner)])
def record_tank_dip_reading(shift_id: str, reading: TankDipReading, current_user: dict = Depends(get_current_user)):
    """
    Record tank dip reading (opening or closing) for a shift
    Converts dip measurement (cm) to volume (liters) using tank conversion factor
    """
    if shift_id not in shifts_data:
        raise HTTPException(status_code=404, detail="Shift not found")

    # Validate tank exists
    from ...database.storage import STORAGE
    from ...config import TANK_CONVERSION_FACTOR

    tanks = STORAGE.get('tanks', {})
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
def get_shift_tank_dip_readings(shift_id: str):
    """
    Get all tank dip readings for a shift
    """
    if shift_id not in shifts_data:
        raise HTTPException(status_code=404, detail="Shift not found")

    shift = shifts_data[shift_id]
    return shift.get('tank_dip_readings', [])

