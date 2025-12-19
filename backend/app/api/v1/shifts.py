"""
Shift Management API
Handles Day and Night shifts, attendant assignments, and dual meter readings
"""
from fastapi import APIRouter, HTTPException
from typing import List
from datetime import datetime
from ...models.models import Shift, ShiftType, DualReading, NozzleShiftSummary
from ...services.relationship_validation import validate_create, validate_delete_operation
from ...database.storage import STORAGE

router = APIRouter()

# Use central storage
shifts_data = STORAGE['shifts']
readings_data = STORAGE['readings']

# Sample attendants from the spreadsheet
attendants_list = ["Violet", "Shaka", "Trevor", "Chileshe", "Matthew", "Mubanga", "Isabel", "Prosper"]

@router.post("/", response_model=Shift)
def create_shift(shift: Shift):
    """
    Create a new shift (Day or Night)
    """
    # Validate foreign keys
    validate_create('shifts', shift.dict())

    if shift.shift_id in shifts_data:
        raise HTTPException(status_code=400, detail="Shift already exists")

    shifts_data[shift.shift_id] = shift.dict()
    return shift

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
