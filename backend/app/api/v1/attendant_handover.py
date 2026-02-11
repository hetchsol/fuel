"""
Attendant Shift Handover API
Allows attendants to submit closing readings and cash handover at end of shift
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import List
from datetime import datetime
import json
import os
from ...models.models import (
    HandoverInput, HandoverOutput,
    HandoverNozzleReadingInput, HandoverNozzleReadingSummary
)
from ...config import get_fuel_price
from ...database.storage import get_nozzle
from .auth import get_current_user, require_supervisor_or_owner, get_station_context
from ...database.station_files import get_station_file

router = APIRouter()


def _load_handovers(station_id: str) -> dict:
    filepath = get_station_file(station_id, 'attendant_handovers.json')
    if os.path.exists(filepath):
        with open(filepath, 'r') as f:
            return json.load(f)
    return {}


def _save_handovers(data: dict, station_id: str):
    filepath = get_station_file(station_id, 'attendant_handovers.json')
    with open(filepath, 'w') as f:
        json.dump(data, f, indent=2)


def _get_fuel_type(nozzle_id: str, storage: dict = None) -> str:
    """Determine fuel type by looking up nozzle data from storage"""
    nozzle = get_nozzle(nozzle_id, storage=storage)
    if nozzle:
        return nozzle.get("fuel_type", "") or "Diesel"
    return "Diesel"


@router.get("/my-shift")
async def get_my_shift(ctx: dict = Depends(get_station_context)):
    """
    Find the current user's active shift and return shift info
    with assigned nozzles and their last known readings.
    """
    storage = ctx["storage"]
    user_id = ctx["user_id"]
    user_name = ctx["full_name"]
    shifts_data = storage.get('shifts', {})
    islands_data = storage.get('islands', {})

    # Search active shifts for one with an assignment matching this user
    my_shift = None
    my_assignment = None

    for shift_id, shift in shifts_data.items():
        if shift.get("status") != "active":
            continue
        assignments = shift.get("assignments", [])
        for assignment in assignments:
            # Match by attendant_id (user_id) or attendant_name
            if assignment.get("attendant_id") == user_id or \
               assignment.get("attendant_name", "").lower() == user_name.lower():
                my_shift = shift
                my_assignment = assignment
                break
        if my_shift:
            break

    if not my_shift:
        return {"found": False, "message": "No active shift assigned to you"}

    # Build nozzle info with current electronic readings as opening readings
    assigned_nozzle_ids = my_assignment.get("nozzle_ids", [])
    assigned_island_ids = my_assignment.get("island_ids", [])

    # If nozzle_ids is empty but island_ids is set, collect all nozzles from those islands
    if not assigned_nozzle_ids and assigned_island_ids:
        for isl_id in assigned_island_ids:
            island = islands_data.get(isl_id, {})
            ps = island.get("pump_station")
            if ps:
                for nozzle in ps.get("nozzles", []):
                    assigned_nozzle_ids.append(nozzle["nozzle_id"])

    nozzle_details = []
    for nozzle_id in assigned_nozzle_ids:
        nozzle = get_nozzle(nozzle_id, storage=storage)
        if nozzle:
            fuel_type = _get_fuel_type(nozzle_id, storage=storage)
            price = get_fuel_price(fuel_type)
            # Find parent island for fuel_type_abbrev
            fuel_type_abbrev = None
            for isl in islands_data.values():
                ps = isl.get("pump_station")
                if ps:
                    for nz in ps.get("nozzles", []):
                        if nz.get("nozzle_id") == nozzle_id:
                            fuel_type_abbrev = isl.get("fuel_type_abbrev")
                            break
                    if fuel_type_abbrev:
                        break
            nozzle_details.append({
                "nozzle_id": nozzle_id,
                "fuel_type": fuel_type,
                "opening_reading": nozzle.get("electronic_reading", 0) or 0,
                "price_per_liter": price,
                "status": nozzle.get("status", "Active"),
                "display_label": nozzle.get("display_label"),
                "fuel_type_abbrev": fuel_type_abbrev,
            })

    return {
        "found": True,
        "shift": {
            "shift_id": my_shift.get("shift_id"),
            "date": my_shift.get("date"),
            "shift_type": my_shift.get("shift_type"),
            "status": my_shift.get("status"),
        },
        "assignment": {
            "attendant_id": my_assignment.get("attendant_id"),
            "attendant_name": my_assignment.get("attendant_name"),
            "island_ids": assigned_island_ids,
            "nozzle_ids": assigned_nozzle_ids,
        },
        "nozzles": nozzle_details,
    }


@router.post("/submit", response_model=HandoverOutput)
async def submit_handover(data: HandoverInput, ctx: dict = Depends(get_station_context)):
    """
    Submit shift handover with closing nozzle readings, other sales, and actual cash.
    Computes volumes, revenue, expected cash, and difference.
    """
    storage = ctx["storage"]
    station_id = ctx["station_id"]
    shifts_data = storage.get('shifts', {})

    # Validate shift exists and is active
    shift = shifts_data.get(data.shift_id)
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found")
    if shift.get("status") != "active":
        raise HTTPException(status_code=400, detail="Shift is not active")

    # Find user's assignment in this shift
    user_id = ctx["user_id"]
    user_name = ctx["full_name"]
    my_assignment = None
    for assignment in shift.get("assignments", []):
        if assignment.get("attendant_id") == user_id or \
           assignment.get("attendant_name", "").lower() == user_name.lower():
            my_assignment = assignment
            break

    if not my_assignment:
        raise HTTPException(status_code=403, detail="You are not assigned to this shift")

    # Build allowed nozzle set
    allowed_nozzle_ids = set(my_assignment.get("nozzle_ids", []))
    if not allowed_nozzle_ids:
        # Derive from island_ids
        islands_data = storage.get('islands', {})
        for isl_id in my_assignment.get("island_ids", []):
            island = islands_data.get(isl_id, {})
            ps = island.get("pump_station")
            if ps:
                for nozzle in ps.get("nozzles", []):
                    allowed_nozzle_ids.add(nozzle["nozzle_id"])

    # Validate all submitted nozzle_ids belong to this user's assignment
    for reading in data.nozzle_readings:
        if reading.nozzle_id not in allowed_nozzle_ids:
            raise HTTPException(
                status_code=400,
                detail=f"Nozzle {reading.nozzle_id} is not in your assignment"
            )

    # Process each nozzle reading
    nozzle_summaries = []
    fuel_revenue = 0.0

    for reading in data.nozzle_readings:
        fuel_type = _get_fuel_type(reading.nozzle_id, storage=storage)
        volume = reading.closing_reading - reading.opening_reading

        if volume < 0:
            raise HTTPException(
                status_code=400,
                detail=f"Closing reading for {reading.nozzle_id} is less than opening reading"
            )

        price = get_fuel_price(fuel_type)
        revenue = round(volume * price, 2)
        fuel_revenue += revenue

        nozzle_summaries.append(HandoverNozzleReadingSummary(
            nozzle_id=reading.nozzle_id,
            fuel_type=fuel_type,
            opening_reading=reading.opening_reading,
            closing_reading=reading.closing_reading,
            volume_sold=round(volume, 3),
            price_per_liter=price,
            revenue=revenue,
        ))

    fuel_revenue = round(fuel_revenue, 2)
    total_expected = round(fuel_revenue + data.lpg_sales + data.lubricant_sales + data.accessory_sales, 2)
    expected_cash = round(total_expected - data.credit_sales, 2)
    difference = round(data.actual_cash - expected_cash, 2)

    # Generate handover ID
    handovers = _load_handovers(station_id)
    handover_id = f"HO-{data.shift_id}-{user_id}-{datetime.now().strftime('%H%M%S')}"

    handover_output = HandoverOutput(
        handover_id=handover_id,
        shift_id=data.shift_id,
        attendant_id=user_id,
        attendant_name=user_name,
        date=shift.get("date", ""),
        shift_type=shift.get("shift_type", ""),
        nozzle_summaries=nozzle_summaries,
        fuel_revenue=fuel_revenue,
        lpg_sales=data.lpg_sales,
        lubricant_sales=data.lubricant_sales,
        accessory_sales=data.accessory_sales,
        total_expected=total_expected,
        credit_sales=data.credit_sales,
        expected_cash=expected_cash,
        actual_cash=data.actual_cash,
        difference=difference,
        status="submitted",
        notes=data.notes,
        created_at=datetime.now().isoformat(),
    )

    # Save handover
    handovers[handover_id] = handover_output.dict()
    _save_handovers(handovers, station_id)

    # Update nozzle electronic readings in islands data
    for reading in data.nozzle_readings:
        nozzle = get_nozzle(reading.nozzle_id, storage=storage)
        if nozzle:
            nozzle["electronic_reading"] = reading.closing_reading

    return handover_output


@router.get("/entries")
async def list_handovers(
    shift_id: str = None,
    date: str = None,
    ctx: dict = Depends(get_station_context),
):
    """
    List handover entries. Regular users see only their own; supervisors/owners see all.
    """
    handovers = _load_handovers(ctx["station_id"])
    results = list(handovers.values())

    # Filter by role: regular users see only their own
    if ctx["role"] == "user":
        results = [h for h in results if h.get("attendant_id") == ctx["user_id"]]

    # Optional filters
    if shift_id:
        results = [h for h in results if h.get("shift_id") == shift_id]
    if date:
        results = [h for h in results if h.get("date") == date]

    # Sort by created_at descending
    results.sort(key=lambda h: h.get("created_at", ""), reverse=True)

    return results


@router.delete("/{handover_id}/reopen")
async def reopen_handover(
    handover_id: str,
    ctx: dict = Depends(get_station_context),
):
    """
    Reopen a submitted handover for correction (supervisor/owner only).
    """
    # Check supervisor/owner role
    from ...models.models import UserRole
    role = ctx["role"]
    role_str = role.value if isinstance(role, UserRole) else str(role)
    if role_str not in [UserRole.SUPERVISOR.value, UserRole.OWNER.value]:
        raise HTTPException(
            status_code=403,
            detail="Access forbidden. This endpoint is restricted to supervisors and owners only."
        )

    station_id = ctx["station_id"]
    handovers = _load_handovers(station_id)

    if handover_id not in handovers:
        raise HTTPException(status_code=404, detail="Handover not found")

    handover = handovers[handover_id]
    if handover.get("status") == "reopened":
        raise HTTPException(status_code=400, detail="Handover is already reopened")

    handover["status"] = "reopened"
    _save_handovers(handovers, station_id)

    return {"status": "success", "message": f"Handover {handover_id} reopened for correction"}
