"""
Enter Readings API — Dual meter (electronic + mechanical) readings entry
Attendants record opening/closing readings for assigned nozzles each shift.
"""
from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime
import json
import os
from ...models.models import (
    AttendantReadingsInput, NozzleDualReadingEntry, UserRole, SupervisorReviewInput
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


def _get_meter_discrepancy_threshold(storage: dict) -> float:
    return storage.get('validation_thresholds', {}).get('meter_discrepancy_threshold', 0.5)


def _load_tank_readings_db(station_id: str) -> dict:
    """Load tank_readings.json safely, handling empty/list/dict formats."""
    filepath = get_station_file(station_id, 'tank_readings.json')
    if os.path.exists(filepath):
        try:
            with open(filepath, 'r') as f:
                data = json.load(f)
            # tank_readings.json should be a dict keyed by reading_id
            # but may be [] if never written to — treat as empty
            if isinstance(data, dict):
                return data
        except (json.JSONDecodeError, IOError):
            pass
    return {}


def _find_tank_reading(tank_readings_db: dict, tank_id: str, date: str, shift_type: str) -> dict | None:
    """Find the most recent tank reading matching tank_id + date + shift_type."""
    best = None
    for tr_id, tr in tank_readings_db.items():
        if not isinstance(tr, dict):
            continue
        if (tr.get("tank_id") == tank_id and
                tr.get("date") == date and
                tr.get("shift_type") == shift_type):
            if not best or (tr.get("created_at", "") > best.get("created_at", "")):
                best = tr
    return best


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

    # Extract review status and return note from closing record
    review_status = None
    return_note = None
    if closing_record:
        review_status = closing_record.get("review_status", "submitted")
        supervisor_review = closing_record.get("supervisor_review")
        if supervisor_review and review_status == "returned":
            return_note = supervisor_review.get("overall_note", "")

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
        "review_status": review_status,
        "return_note": return_note,
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

        # Block re-submission unless supervisor OR returned status
        existing_closing = readings_db.get(closing_key)
        if existing_closing and not _is_supervisor_or_owner(role):
            review_status = existing_closing.get("review_status", "submitted")
            if review_status == "returned":
                pass  # Allow re-submission when returned
            else:
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

        # Discrepancy validation: require note when elec vs mech discrepancy exceeds threshold
        threshold = _get_meter_discrepancy_threshold(storage)
        for nr in data.nozzle_readings:
            opening_nr = opening_map.get(nr.nozzle_id)
            if opening_nr:
                elec_dispensed = nr.electronic_reading - opening_nr.get("electronic_reading", 0)
                mech_dispensed = nr.mechanical_reading - opening_nr.get("mechanical_reading", 0)
                avg_dispensed = (elec_dispensed + mech_dispensed) / 2
                if avg_dispensed > 0:
                    disc = abs(elec_dispensed - mech_dispensed) / avg_dispensed * 100
                    if disc > threshold and not nr.note:
                        raise HTTPException(
                            status_code=400,
                            detail=f"Nozzle {nr.nozzle_id} has {disc:.2f}% discrepancy (threshold: {threshold}%). A note explaining the discrepancy is required."
                        )

        record = {
            "shift_id": data.shift_id,
            "user_id": user_id,
            "user_name": user_name,
            "reading_type": "Closing",
            "nozzle_readings": [nr.dict() for nr in data.nozzle_readings],
            "notes": data.notes,
            "submitted_at": datetime.now().isoformat(),
            "review_status": "submitted",
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

    # Load tank_readings.json for delivery-adjusted tank movement
    tank_readings_db = _load_tank_readings_db(station_id)

    # Tank dip comparison — use delivery-adjusted movement when available
    tank_dips = shift.get("tank_dip_readings", [])
    shift_date = shift.get("date", "")
    shift_type = shift.get("shift_type", "")
    reconciliation = []
    for dip in tank_dips:
        tank_id = dip.get("tank_id", "")

        # Look up the matching daily tank reading for delivery-adjusted values
        matched = _find_tank_reading(tank_readings_db, tank_id, shift_date, shift_type)

        if matched:
            tank_movement = round(matched.get("tank_volume_movement", 0), 3)
            delivery_count = matched.get("delivery_count", 0)
            total_delivery_volume = round(matched.get("total_delivery_volume", 0), 3)
            fuel_type = matched.get("fuel_type", "Diesel" if "DIESEL" in tank_id.upper() else "Petrol")
            data_source = "tank_reading"
        else:
            # Fallback: simple dip formula (no delivery data available)
            opening_vol = dip.get("opening_volume_liters") or 0
            closing_vol = dip.get("closing_volume_liters") or 0
            tank_movement = round(opening_vol - closing_vol, 3) if opening_vol and closing_vol else 0
            delivery_count = 0
            total_delivery_volume = 0
            fuel_type = "Diesel" if "DIESEL" in tank_id.upper() else "Petrol"
            data_source = "dip_only"

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
            "delivery_count": delivery_count,
            "total_delivery_volume": total_delivery_volume,
            "data_source": data_source,
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


@router.get("/shift/{shift_id}/nozzle-readings-for-tank")
async def get_nozzle_readings_for_tank(
    shift_id: str,
    tank_id: str,
    ctx: dict = Depends(get_station_context),
):
    """
    Aggregate all attendant nozzle readings for a shift, filtered by tank fuel type.
    Returns data in a format compatible with the daily tank reading nozzle section,
    so supervisors can auto-populate instead of re-entering readings manually.
    """
    role = ctx["role"]
    if not _is_supervisor_or_owner(role):
        raise HTTPException(status_code=403, detail="Supervisors and owners only")

    storage = ctx["storage"]
    station_id = ctx["station_id"]
    islands_data = storage.get('islands', {})

    # Determine target fuel type from tank_id
    target_fuel = "Diesel" if "DIESEL" in tank_id.upper() else "Petrol"

    readings_db = _load_readings(station_id)

    # Collect all opening and closing records for this shift
    opening_prefix = f"AR-{shift_id}-"
    openings = {}  # nozzle_id -> {electronic, mechanical, attendant}
    closings = {}  # nozzle_id -> {electronic, mechanical}

    for key, record in readings_db.items():
        if not key.startswith(opening_prefix):
            continue
        if record.get("shift_id") != shift_id:
            continue

        attendant_name = record.get("user_name", "")
        is_opening = key.endswith("-O")
        is_closing = key.endswith("-C")

        for nr in record.get("nozzle_readings", []):
            nid = nr["nozzle_id"]

            # Filter by fuel type — look up nozzle to check
            nozzle_obj = get_nozzle(nid, storage=storage)
            nozzle_fuel = nozzle_obj.get("fuel_type", "") if nozzle_obj else ""
            if nozzle_fuel != target_fuel:
                continue

            if is_opening:
                openings[nid] = {
                    "electronic": nr.get("electronic_reading", 0),
                    "mechanical": nr.get("mechanical_reading", 0),
                    "attendant": attendant_name,
                }
            elif is_closing:
                closings[nid] = {
                    "electronic": nr.get("electronic_reading", 0),
                    "mechanical": nr.get("mechanical_reading", 0),
                }

    # Build display_label lookup from islands
    nozzle_labels = {}
    for isl in islands_data.values():
        ps = isl.get("pump_station")
        if ps:
            for nz in ps.get("nozzles", []):
                nozzle_labels[nz["nozzle_id"]] = nz.get("display_label", nz["nozzle_id"])

    # Pair opening + closing for each nozzle
    all_nozzle_ids = set(openings.keys()) | set(closings.keys())
    result = []
    for nid in sorted(all_nozzle_ids):
        o = openings.get(nid, {})
        c = closings.get(nid, {})
        elec_open = o.get("electronic", 0)
        elec_close = c.get("electronic", 0)
        mech_open = o.get("mechanical", 0)
        mech_close = c.get("mechanical", 0)
        elec_movement = round(elec_close - elec_open, 3) if c else 0
        mech_movement = round(mech_close - mech_open, 3) if c else 0

        result.append({
            "nozzle_id": nozzle_labels.get(nid, nid),
            "internal_nozzle_id": nid,
            "attendant": o.get("attendant", ""),
            "electronic_opening": elec_open,
            "electronic_closing": elec_close if c else None,
            "electronic_movement": elec_movement,
            "mechanical_opening": mech_open,
            "mechanical_closing": mech_close if c else None,
            "mechanical_movement": mech_movement,
            "has_closing": bool(c),
        })

    return {
        "shift_id": shift_id,
        "tank_id": tank_id,
        "fuel_type": target_fuel,
        "nozzle_count": len(result),
        "nozzle_readings": result,
    }


@router.get("/shift/{shift_id}/review-queue")
async def get_review_queue(shift_id: str, ctx: dict = Depends(get_station_context)):
    """
    Supervisor/Owner: Get all attendants' closing readings for review with discrepancy analysis.
    """
    role = ctx["role"]
    if not _is_supervisor_or_owner(role):
        raise HTTPException(status_code=403, detail="Supervisors and owners only")

    storage = ctx["storage"]
    station_id = ctx["station_id"]
    shifts_data = storage.get('shifts', {})

    shift = shifts_data.get(shift_id)
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found")

    readings_db = _load_readings(station_id)
    threshold = _get_meter_discrepancy_threshold(storage)

    attendant_reviews = []
    for assignment in shift.get("assignments", []):
        att_id = assignment.get("attendant_id", "")
        att_name = assignment.get("attendant_name", "")
        opening_key = f"AR-{shift_id}-{att_id}-O"
        closing_key = f"AR-{shift_id}-{att_id}-C"

        opening_record = readings_db.get(opening_key)
        closing_record = readings_db.get(closing_key)

        if not closing_record:
            continue  # Only show attendants who have submitted closing readings

        opening_map = {}
        if opening_record:
            for nr in opening_record.get("nozzle_readings", []):
                opening_map[nr["nozzle_id"]] = nr

        review_status = closing_record.get("review_status", "submitted")
        supervisor_review = closing_record.get("supervisor_review")
        submitted_at = closing_record.get("submitted_at", "")

        nozzle_details = []
        has_discrepancy = False
        for nr in closing_record.get("nozzle_readings", []):
            nid = nr["nozzle_id"]
            onr = opening_map.get(nid, {})
            elec_dispensed = round(nr["electronic_reading"] - onr.get("electronic_reading", 0), 3)
            mech_dispensed = round(nr["mechanical_reading"] - onr.get("mechanical_reading", 0), 3)
            avg_dispensed = (elec_dispensed + mech_dispensed) / 2
            disc_pct = round(abs(elec_dispensed - mech_dispensed) / avg_dispensed * 100, 2) if avg_dispensed > 0 else 0
            exceeds = disc_pct > threshold

            if exceeds:
                has_discrepancy = True

            nozzle_obj = get_nozzle(nid, storage=storage)
            ft = nozzle_obj.get("fuel_type", "Diesel") if nozzle_obj else "Diesel"

            nozzle_details.append({
                "nozzle_id": nid,
                "fuel_type": ft,
                "electronic_dispensed": elec_dispensed,
                "mechanical_dispensed": mech_dispensed,
                "discrepancy_percent": disc_pct,
                "exceeds_threshold": exceeds,
                "attendant_note": nr.get("note"),
            })

        attendant_reviews.append({
            "attendant_id": att_id,
            "attendant_name": att_name,
            "review_status": review_status,
            "has_discrepancy": has_discrepancy,
            "submitted_at": submitted_at,
            "nozzle_details": nozzle_details,
            "supervisor_review": supervisor_review,
        })

    return {
        "shift_id": shift_id,
        "date": shift.get("date"),
        "shift_type": shift.get("shift_type"),
        "meter_discrepancy_threshold": threshold,
        "attendants": attendant_reviews,
    }


@router.post("/review")
async def review_readings(data: SupervisorReviewInput, ctx: dict = Depends(get_station_context)):
    """
    Supervisor: Approve or return an attendant's closing readings.
    """
    role = ctx["role"]
    user_id = ctx["user_id"]
    user_name = ctx["full_name"]
    role_str = role.value if isinstance(role, UserRole) else str(role)
    if role_str != UserRole.SUPERVISOR.value:
        raise HTTPException(status_code=403, detail="Only supervisors can review readings")

    if data.action not in ("approve", "return"):
        raise HTTPException(status_code=400, detail="Action must be 'approve' or 'return'")

    if data.action == "return" and not data.overall_note:
        raise HTTPException(status_code=400, detail="A reason (overall_note) is required when returning readings")

    storage = ctx["storage"]
    station_id = ctx["station_id"]
    readings_db = _load_readings(station_id)

    closing_key = f"AR-{data.shift_id}-{data.attendant_id}-C"
    closing_record = readings_db.get(closing_key)
    if not closing_record:
        raise HTTPException(status_code=404, detail="No closing readings found for this attendant")

    current_status = closing_record.get("review_status", "submitted")
    if current_status == "approved":
        raise HTTPException(status_code=400, detail="These readings have already been approved")

    # Safety check: if approving and there are discrepancies without notes
    if data.action == "approve":
        threshold = _get_meter_discrepancy_threshold(storage)
        opening_key = f"AR-{data.shift_id}-{data.attendant_id}-O"
        opening_record = readings_db.get(opening_key, {})
        opening_map = {}
        for nr in opening_record.get("nozzle_readings", []):
            opening_map[nr["nozzle_id"]] = nr

        for nr in closing_record.get("nozzle_readings", []):
            onr = opening_map.get(nr["nozzle_id"], {})
            elec_dispensed = nr["electronic_reading"] - onr.get("electronic_reading", 0)
            mech_dispensed = nr["mechanical_reading"] - onr.get("mechanical_reading", 0)
            avg_dispensed = (elec_dispensed + mech_dispensed) / 2
            if avg_dispensed > 0:
                disc = abs(elec_dispensed - mech_dispensed) / avg_dispensed * 100
                if disc > threshold and not nr.get("note"):
                    raise HTTPException(
                        status_code=400,
                        detail=f"Cannot approve: nozzle {nr['nozzle_id']} has {disc:.2f}% discrepancy without an attendant note"
                    )

    # Update the record
    new_status = "approved" if data.action == "approve" else "returned"
    closing_record["review_status"] = new_status
    closing_record["supervisor_review"] = {
        "reviewed_by": user_id,
        "reviewed_by_name": user_name,
        "reviewed_at": datetime.now().isoformat(),
        "action": data.action,
        "overall_note": data.overall_note,
    }

    readings_db[closing_key] = closing_record
    _save_readings(readings_db, station_id)

    return {
        "status": "success",
        "message": f"Readings {new_status} successfully",
        "review_status": new_status,
    }
