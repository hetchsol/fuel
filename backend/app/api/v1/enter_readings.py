"""
Enter Readings API — Dual meter (electronic + mechanical) readings entry
Attendants record opening/closing readings for assigned nozzles each shift.
"""
from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime
import json
import os
from ...models.models import (
    AttendantReadingsInput, NozzleDualReadingEntry, UserRole
)
from ...config import get_fuel_price
from ...database.storage import get_nozzle
from .auth import get_current_user, get_station_context
from ...database.station_files import get_station_file

router = APIRouter()


# ── helpers ──────────────────────────────────────────────

def _load_readings(station_id: str) -> dict:
    filepath = get_station_file(station_id, 'attendant_readings.json')
    if os.path.exists(filepath):
        with open(filepath, 'r') as f:
            return json.load(f)
    return {}


def _save_readings(data: dict, station_id: str):
    filepath = get_station_file(station_id, 'attendant_readings.json')
    with open(filepath, 'w') as f:
        json.dump(data, f, indent=2)


def _get_assigned_nozzle_ids(assignment: dict, islands_data: dict) -> list:
    """Derive nozzle IDs from an assignment (nozzle_ids or island_ids)."""
    nozzle_ids = list(assignment.get("nozzle_ids", []))
    if not nozzle_ids:
        for isl_id in assignment.get("island_ids", []):
            island = islands_data.get(isl_id, {})
            ps = island.get("pump_station")
            if ps:
                for nozzle in ps.get("nozzles", []):
                    nozzle_ids.append(nozzle["nozzle_id"])
    return nozzle_ids


def _is_supervisor_or_owner(role) -> bool:
    role_str = role.value if isinstance(role, UserRole) else str(role)
    return role_str in [UserRole.SUPERVISOR.value, UserRole.OWNER.value]


def _find_previous_shift_readings(shift: dict, user_id: str, storage: dict, station_id: str) -> dict:
    """
    Try to auto-fill opening readings from the previous shift's closing.
    Night shift -> same-date Day shift closing
    Day shift  -> previous-date Night shift closing
    Falls back to nozzle's current electronic/mechanical reading.
    Returns {nozzle_id: {electronic, mechanical}} or empty.
    """
    readings_db = _load_readings(station_id)
    shifts_data = storage.get('shifts', {})
    current_date = shift.get("date", "")
    current_type = shift.get("shift_type", "")

    # Determine what previous shift to look for
    prev_date = current_date
    prev_type = "Day"
    if current_type == "Day":
        # Previous shift is the Night shift of the day before
        try:
            from datetime import timedelta
            dt = datetime.strptime(current_date, "%Y-%m-%d")
            prev_date = (dt - timedelta(days=1)).strftime("%Y-%m-%d")
        except Exception:
            return {}
        prev_type = "Night"
    else:
        # Night shift — previous is same-date Day
        prev_type = "Day"

    # Find that previous shift
    prev_shift_id = None
    for sid, s in shifts_data.items():
        if s.get("date") == prev_date and s.get("shift_type") == prev_type:
            prev_shift_id = sid
            break

    if not prev_shift_id:
        return {}

    # Look for this user's closing record in that shift
    closing_key = f"AR-{prev_shift_id}-{user_id}-C"
    record = readings_db.get(closing_key)
    if not record:
        return {}

    result = {}
    for nr in record.get("nozzle_readings", []):
        result[nr["nozzle_id"]] = {
            "electronic": nr["electronic_reading"],
            "mechanical": nr["mechanical_reading"],
        }
    return result


# ── endpoints ────────────────────────────────────────────

@router.get("/my-shift")
async def get_my_shift_readings(ctx: dict = Depends(get_station_context)):
    """
    Find the current user's active shift and return nozzle info
    with auto-filled opening readings (electronic + mechanical).
    """
    storage = ctx["storage"]
    user_id = ctx["user_id"]
    user_name = ctx["full_name"]
    role = ctx["role"]
    station_id = ctx["station_id"]
    shifts_data = storage.get('shifts', {})
    islands_data = storage.get('islands', {})

    # Find active shift with assignment matching this user
    my_shift = None
    my_assignment = None
    for shift_id, shift in shifts_data.items():
        if shift.get("status") != "active":
            continue
        for assignment in shift.get("assignments", []):
            if assignment.get("attendant_id") == user_id or \
               assignment.get("attendant_name", "").lower() == user_name.lower():
                my_shift = shift
                my_assignment = assignment
                break
        if my_shift:
            break

    if not my_shift:
        return {"found": False, "message": "No active shift assigned to you"}

    shift_id = my_shift.get("shift_id", "")
    assigned_nozzle_ids = _get_assigned_nozzle_ids(my_assignment, islands_data)

    # Check existing submissions
    readings_db = _load_readings(station_id)
    opening_key = f"AR-{shift_id}-{user_id}-O"
    closing_key = f"AR-{shift_id}-{user_id}-C"
    opening_submitted = opening_key in readings_db
    closing_submitted = closing_key in readings_db

    # Auto-fill from previous shift closing
    prev_readings = _find_previous_shift_readings(my_shift, user_id, storage, station_id)

    # If opening already submitted, use those values for reference
    opening_record = readings_db.get(opening_key, {})
    opening_map = {}
    if opening_record:
        for nr in opening_record.get("nozzle_readings", []):
            opening_map[nr["nozzle_id"]] = {
                "electronic": nr["electronic_reading"],
                "mechanical": nr["mechanical_reading"],
            }

    # If closing already submitted, capture those too
    closing_record = readings_db.get(closing_key, {})
    closing_map = {}
    if closing_record:
        for nr in closing_record.get("nozzle_readings", []):
            closing_map[nr["nozzle_id"]] = {
                "electronic": nr["electronic_reading"],
                "mechanical": nr["mechanical_reading"],
            }

    editable = _is_supervisor_or_owner(role)

    nozzle_details = []
    for nozzle_id in assigned_nozzle_ids:
        nozzle = get_nozzle(nozzle_id, storage=storage)
        if not nozzle:
            continue
        fuel_type = nozzle.get("fuel_type", "Diesel")

        # Find parent island for fuel_type_abbrev / display_label
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

        # Determine opening values
        if opening_submitted and nozzle_id in opening_map:
            elec_open = opening_map[nozzle_id]["electronic"]
            mech_open = opening_map[nozzle_id]["mechanical"]
        elif nozzle_id in prev_readings:
            elec_open = prev_readings[nozzle_id]["electronic"]
            mech_open = prev_readings[nozzle_id]["mechanical"]
        else:
            elec_open = nozzle.get("electronic_reading", 0) or 0
            mech_open = nozzle.get("mechanical_reading", 0) or 0

        detail = {
            "nozzle_id": nozzle_id,
            "fuel_type": fuel_type,
            "display_label": nozzle.get("display_label"),
            "fuel_type_abbrev": fuel_type_abbrev,
            "electronic_opening": elec_open,
            "mechanical_opening": mech_open,
            "editable": editable,
        }

        # Add closing values if submitted
        if closing_submitted and nozzle_id in closing_map:
            detail["electronic_closing"] = closing_map[nozzle_id]["electronic"]
            detail["mechanical_closing"] = closing_map[nozzle_id]["mechanical"]

        nozzle_details.append(detail)

    return {
        "found": True,
        "shift": {
            "shift_id": shift_id,
            "date": my_shift.get("date"),
            "shift_type": my_shift.get("shift_type"),
            "status": my_shift.get("status"),
        },
        "assignment": {
            "attendant_id": my_assignment.get("attendant_id"),
            "attendant_name": my_assignment.get("attendant_name"),
            "island_ids": my_assignment.get("island_ids", []),
            "nozzle_ids": assigned_nozzle_ids,
        },
        "nozzles": nozzle_details,
        "opening_submitted": opening_submitted,
        "closing_submitted": closing_submitted,
    }


@router.post("/submit")
async def submit_readings(data: AttendantReadingsInput, ctx: dict = Depends(get_station_context)):
    """
    Submit Opening or Closing dual readings for the current user's assigned nozzles.
    """
    storage = ctx["storage"]
    station_id = ctx["station_id"]
    user_id = ctx["user_id"]
    user_name = ctx["full_name"]
    role = ctx["role"]
    shifts_data = storage.get('shifts', {})
    islands_data = storage.get('islands', {})

    # Validate shift
    shift = shifts_data.get(data.shift_id)
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found")
    if shift.get("status") != "active":
        raise HTTPException(status_code=400, detail="Shift is not active")

    # Find user's assignment
    my_assignment = None
    for assignment in shift.get("assignments", []):
        if assignment.get("attendant_id") == user_id or \
           assignment.get("attendant_name", "").lower() == user_name.lower():
            my_assignment = assignment
            break
    if not my_assignment:
        raise HTTPException(status_code=403, detail="You are not assigned to this shift")

    allowed_nozzle_ids = set(_get_assigned_nozzle_ids(my_assignment, islands_data))

    # Validate all nozzle IDs in request belong to this user
    for nr in data.nozzle_readings:
        if nr.nozzle_id not in allowed_nozzle_ids:
            raise HTTPException(
                status_code=400,
                detail=f"Nozzle {nr.nozzle_id} is not in your assignment"
            )

    readings_db = _load_readings(station_id)
    reading_type = data.reading_type  # "Opening" or "Closing"

    if reading_type == "Opening":
        key = f"AR-{data.shift_id}-{user_id}-O"

        # Block re-submission of opening unless supervisor
        if key in readings_db and not _is_supervisor_or_owner(role):
            raise HTTPException(status_code=400, detail="Opening readings already submitted")

        # For regular users: validate opening values match previous closing
        if not _is_supervisor_or_owner(role):
            prev_readings = _find_previous_shift_readings(shift, user_id, storage, station_id)
            for nr in data.nozzle_readings:
                if nr.nozzle_id in prev_readings:
                    prev = prev_readings[nr.nozzle_id]
                    if abs(nr.electronic_reading - prev["electronic"]) > 0.01 or \
                       abs(nr.mechanical_reading - prev["mechanical"]) > 0.01:
                        raise HTTPException(
                            status_code=400,
                            detail=f"Opening readings for {nr.nozzle_id} must match previous closing values"
                        )

        record = {
            "shift_id": data.shift_id,
            "user_id": user_id,
            "user_name": user_name,
            "reading_type": "Opening",
            "nozzle_readings": [nr.dict() for nr in data.nozzle_readings],
            "notes": data.notes,
            "submitted_at": datetime.now().isoformat(),
        }
        readings_db[key] = record
        _save_readings(readings_db, station_id)

        return {"status": "success", "message": "Opening readings submitted", "key": key}

    elif reading_type == "Closing":
        opening_key = f"AR-{data.shift_id}-{user_id}-O"
        closing_key = f"AR-{data.shift_id}-{user_id}-C"

        # Opening must be submitted first
        if opening_key not in readings_db:
            raise HTTPException(status_code=400, detail="Opening readings must be submitted before closing")

        # Block re-submission unless supervisor
        if closing_key in readings_db and not _is_supervisor_or_owner(role):
            raise HTTPException(status_code=400, detail="Closing readings already submitted")

        # Validate closing >= opening
        opening_record = readings_db[opening_key]
        opening_map = {}
        for onr in opening_record.get("nozzle_readings", []):
            opening_map[onr["nozzle_id"]] = onr

        for nr in data.nozzle_readings:
            opening_nr = opening_map.get(nr.nozzle_id)
            if opening_nr:
                if nr.electronic_reading < opening_nr["electronic_reading"]:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Electronic closing for {nr.nozzle_id} must be >= opening ({opening_nr['electronic_reading']})"
                    )
                if nr.mechanical_reading < opening_nr["mechanical_reading"]:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Mechanical closing for {nr.nozzle_id} must be >= opening ({opening_nr['mechanical_reading']})"
                    )

        record = {
            "shift_id": data.shift_id,
            "user_id": user_id,
            "user_name": user_name,
            "reading_type": "Closing",
            "nozzle_readings": [nr.dict() for nr in data.nozzle_readings],
            "notes": data.notes,
            "submitted_at": datetime.now().isoformat(),
        }
        readings_db[closing_key] = record
        _save_readings(readings_db, station_id)

        # Update nozzle state in islands data
        for nr in data.nozzle_readings:
            nozzle = get_nozzle(nr.nozzle_id, storage=storage)
            if nozzle:
                nozzle["electronic_reading"] = nr.electronic_reading
                nozzle["mechanical_reading"] = nr.mechanical_reading

        # Push per-nozzle reading records to storage['readings'] for reports
        for nr in data.nozzle_readings:
            opening_nr = opening_map.get(nr.nozzle_id, {})
            storage.setdefault('readings', []).append({
                "reading_id": f"R-{data.shift_id}-{nr.nozzle_id}-{user_id}",
                "nozzle_id": nr.nozzle_id,
                "shift_id": data.shift_id,
                "attendant": user_name,
                "reading_type": "Closing",
                "electronic_opening": opening_nr.get("electronic_reading", 0),
                "electronic_closing": nr.electronic_reading,
                "electronic_movement": round(nr.electronic_reading - opening_nr.get("electronic_reading", 0), 3),
                "mechanical_opening": opening_nr.get("mechanical_reading", 0),
                "mechanical_closing": nr.mechanical_reading,
                "mechanical_movement": round(nr.mechanical_reading - opening_nr.get("mechanical_reading", 0), 3),
                "timestamp": datetime.now().isoformat(),
            })

        return {"status": "success", "message": "Closing readings submitted", "key": closing_key}

    else:
        raise HTTPException(status_code=400, detail="reading_type must be 'Opening' or 'Closing'")


@router.get("/my-summary")
async def get_my_summary(ctx: dict = Depends(get_station_context)):
    """
    Per-nozzle dispensed calculations for the current user's active shift.
    """
    storage = ctx["storage"]
    user_id = ctx["user_id"]
    user_name = ctx["full_name"]
    station_id = ctx["station_id"]
    shifts_data = storage.get('shifts', {})
    islands_data = storage.get('islands', {})

    # Find active shift
    my_shift = None
    my_assignment = None
    for shift_id, shift in shifts_data.items():
        if shift.get("status") != "active":
            continue
        for assignment in shift.get("assignments", []):
            if assignment.get("attendant_id") == user_id or \
               assignment.get("attendant_name", "").lower() == user_name.lower():
                my_shift = shift
                my_assignment = assignment
                break
        if my_shift:
            break

    if not my_shift:
        raise HTTPException(status_code=404, detail="No active shift found")

    shift_id = my_shift.get("shift_id", "")
    readings_db = _load_readings(station_id)
    opening_key = f"AR-{shift_id}-{user_id}-O"
    closing_key = f"AR-{shift_id}-{user_id}-C"

    opening_record = readings_db.get(opening_key)
    closing_record = readings_db.get(closing_key)

    if not opening_record or not closing_record:
        raise HTTPException(status_code=400, detail="Both opening and closing readings are required for summary")

    opening_map = {}
    for nr in opening_record.get("nozzle_readings", []):
        opening_map[nr["nozzle_id"]] = nr

    nozzle_summaries = []
    total_electronic_dispensed = 0
    total_mechanical_dispensed = 0

    for nr in closing_record.get("nozzle_readings", []):
        nozzle_id = nr["nozzle_id"]
        opening_nr = opening_map.get(nozzle_id, {})

        elec_open = opening_nr.get("electronic_reading", 0)
        elec_close = nr["electronic_reading"]
        mech_open = opening_nr.get("mechanical_reading", 0)
        mech_close = nr["mechanical_reading"]

        elec_dispensed = round(elec_close - elec_open, 3)
        mech_dispensed = round(mech_close - mech_open, 3)
        average = round((elec_dispensed + mech_dispensed) / 2, 3)
        discrepancy_pct = 0.0
        if average > 0:
            discrepancy_pct = round(abs(elec_dispensed - mech_dispensed) / average * 100, 2)

        nozzle_obj = get_nozzle(nozzle_id, storage=storage)
        fuel_type = nozzle_obj.get("fuel_type", "Diesel") if nozzle_obj else "Diesel"

        nozzle_summaries.append({
            "nozzle_id": nozzle_id,
            "fuel_type": fuel_type,
            "electronic_opening": elec_open,
            "electronic_closing": elec_close,
            "electronic_dispensed": elec_dispensed,
            "mechanical_opening": mech_open,
            "mechanical_closing": mech_close,
            "mechanical_dispensed": mech_dispensed,
            "average_dispensed": average,
            "discrepancy_percent": discrepancy_pct,
        })

        total_electronic_dispensed += elec_dispensed
        total_mechanical_dispensed += mech_dispensed

    total_average = round((total_electronic_dispensed + total_mechanical_dispensed) / 2, 3)
    total_discrepancy_pct = 0.0
    if total_average > 0:
        total_discrepancy_pct = round(
            abs(total_electronic_dispensed - total_mechanical_dispensed) / total_average * 100, 2
        )

    return {
        "shift_id": shift_id,
        "user_id": user_id,
        "user_name": user_name,
        "nozzle_summaries": nozzle_summaries,
        "totals": {
            "electronic_dispensed": round(total_electronic_dispensed, 3),
            "mechanical_dispensed": round(total_mechanical_dispensed, 3),
            "average_dispensed": total_average,
            "discrepancy_percent": total_discrepancy_pct,
        },
    }


@router.get("/shift/{shift_id}/summary")
async def get_shift_summary(shift_id: str, ctx: dict = Depends(get_station_context)):
    """
    Supervisor-only: All attendants' summaries for a shift, with tank dip comparison.
    """
    role = ctx["role"]
    if not _is_supervisor_or_owner(role):
        raise HTTPException(status_code=403, detail="Supervisors and owners only")

    storage = ctx["storage"]
    station_id = ctx["station_id"]
    shifts_data = storage.get('shifts', {})
    islands_data = storage.get('islands', {})

    shift = shifts_data.get(shift_id)
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found")

    readings_db = _load_readings(station_id)
    attendant_results = []

    for assignment in shift.get("assignments", []):
        att_id = assignment.get("attendant_id", "")
        att_name = assignment.get("attendant_name", "")
        opening_key = f"AR-{shift_id}-{att_id}-O"
        closing_key = f"AR-{shift_id}-{att_id}-C"

        opening_record = readings_db.get(opening_key)
        closing_record = readings_db.get(closing_key)

        status = "pending"
        if opening_record and closing_record:
            status = "complete"
        elif opening_record:
            status = "opening_only"

        nozzle_summaries = []
        if opening_record and closing_record:
            opening_map = {}
            for nr in opening_record.get("nozzle_readings", []):
                opening_map[nr["nozzle_id"]] = nr

            for nr in closing_record.get("nozzle_readings", []):
                nid = nr["nozzle_id"]
                onr = opening_map.get(nid, {})
                elec_d = round(nr["electronic_reading"] - onr.get("electronic_reading", 0), 3)
                mech_d = round(nr["mechanical_reading"] - onr.get("mechanical_reading", 0), 3)
                avg = round((elec_d + mech_d) / 2, 3)
                disc = round(abs(elec_d - mech_d) / avg * 100, 2) if avg > 0 else 0

                nozzle_obj = get_nozzle(nid, storage=storage)
                ft = nozzle_obj.get("fuel_type", "Diesel") if nozzle_obj else "Diesel"

                nozzle_summaries.append({
                    "nozzle_id": nid,
                    "fuel_type": ft,
                    "electronic_dispensed": elec_d,
                    "mechanical_dispensed": mech_d,
                    "average_dispensed": avg,
                    "discrepancy_percent": disc,
                })

        attendant_results.append({
            "attendant_id": att_id,
            "attendant_name": att_name,
            "status": status,
            "nozzle_summaries": nozzle_summaries,
        })

    # Aggregate by fuel type
    diesel_total = 0.0
    petrol_total = 0.0
    for ar in attendant_results:
        for ns in ar["nozzle_summaries"]:
            if ns["fuel_type"] == "Diesel":
                diesel_total += ns["average_dispensed"]
            else:
                petrol_total += ns["average_dispensed"]

    # Tank dip comparison
    tank_dips = shift.get("tank_dip_readings", [])
    reconciliation = []
    for dip in tank_dips:
        tank_id = dip.get("tank_id", "")
        opening_vol = dip.get("opening_volume_liters") or 0
        closing_vol = dip.get("closing_volume_liters") or 0
        tank_movement = round(opening_vol - closing_vol, 3) if opening_vol and closing_vol else 0

        fuel_type = "Diesel" if "DIESEL" in tank_id.upper() else "Petrol"
        nozzle_total = diesel_total if fuel_type == "Diesel" else petrol_total

        variance = round(nozzle_total - tank_movement, 3) if tank_movement else 0
        variance_pct = round(abs(variance) / tank_movement * 100, 2) if tank_movement > 0 else 0

        if variance_pct <= 0.5:
            verdict = "PASS"
        elif variance_pct <= 1.0:
            verdict = "WARNING"
        else:
            verdict = "FAIL"

        reconciliation.append({
            "tank_id": tank_id,
            "fuel_type": fuel_type,
            "tank_movement": tank_movement,
            "nozzle_total": round(nozzle_total, 3),
            "variance": variance,
            "variance_percent": variance_pct,
            "verdict": verdict,
        })

    return {
        "shift_id": shift_id,
        "date": shift.get("date"),
        "shift_type": shift.get("shift_type"),
        "attendants": attendant_results,
        "fuel_totals": {
            "diesel": round(diesel_total, 3),
            "petrol": round(petrol_total, 3),
        },
        "reconciliation": reconciliation,
    }


@router.get("/shift/{shift_id}/attendant/{attendant_id}")
async def get_attendant_readings(shift_id: str, attendant_id: str, ctx: dict = Depends(get_station_context)):
    """
    Supervisor-only: Get a single attendant's opening + closing records for a shift.
    """
    role = ctx["role"]
    if not _is_supervisor_or_owner(role):
        raise HTTPException(status_code=403, detail="Supervisors and owners only")

    station_id = ctx["station_id"]
    readings_db = _load_readings(station_id)

    opening_key = f"AR-{shift_id}-{attendant_id}-O"
    closing_key = f"AR-{shift_id}-{attendant_id}-C"

    return {
        "shift_id": shift_id,
        "attendant_id": attendant_id,
        "opening": readings_db.get(opening_key),
        "closing": readings_db.get(closing_key),
    }
