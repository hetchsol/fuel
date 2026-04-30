"""
Safe Deposit Tracking API

Informational tracking of cash deposits into the safe during shifts.
Attendants record deposits; supervisors/managers monitor compliance.
This data is purely informational — it does NOT feed into handover
calculations, reconciliation, or any other financial logic.
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
import uuid

from .auth import get_current_user, get_station_context, require_supervisor_or_owner
from ...database.station_files import load_station_json, save_station_json
from ...services.notification_service import create_notification

router = APIRouter()

# Thresholds (hardcoded for now — can move to settings later)
DEPOSIT_INTERVAL_MINUTES = 60
DEPOSIT_THRESHOLD_AMOUNT = 1500


class DepositInput(BaseModel):
    shift_id: str
    amount: float = Field(..., gt=0)
    time: str  # HH:MM format — attendant enters the time of deposit
    note: Optional[str] = ""


def _load_deposits(station_id: str) -> dict:
    return load_station_json(station_id, 'safe_deposits.json', default={})


def _save_deposits(station_id: str, data: dict):
    save_station_json(station_id, 'safe_deposits.json', data)


@router.post("/")
def record_deposit(deposit: DepositInput, ctx: dict = Depends(get_station_context)):
    """Record a cash deposit into the safe. Any authenticated user on an active shift."""
    station_id = ctx["station_id"]
    storage = ctx["storage"]
    shifts_data = storage.get('shifts', {})

    # Validate shift exists and is active
    if deposit.shift_id not in shifts_data:
        raise HTTPException(status_code=404, detail="Shift not found")
    shift = shifts_data[deposit.shift_id]
    if shift.get("status") != "active":
        raise HTTPException(status_code=400, detail="Shift is not active")

    deposits_db = _load_deposits(station_id)

    if deposit.shift_id not in deposits_db:
        deposits_db[deposit.shift_id] = {"shift_id": deposit.shift_id, "deposits": []}

    # Build full timestamp from shift date + attendant-entered time
    shift = shifts_data[deposit.shift_id]
    shift_date = shift.get("date", datetime.now().strftime("%Y-%m-%d"))
    deposit_timestamp = f"{shift_date}T{deposit.time}:00"

    deposit_record = {
        "deposit_id": f"DEP-{uuid.uuid4().hex[:8]}",
        "attendant_id": ctx["user_id"],
        "attendant_name": ctx["full_name"],
        "amount": deposit.amount,
        "time": deposit.time,
        "timestamp": deposit_timestamp,
        "recorded_at": datetime.now().isoformat(),
        "note": deposit.note or "",
    }

    deposits_db[deposit.shift_id]["deposits"].append(deposit_record)
    _save_deposits(station_id, deposits_db)

    # Calculate running total for this attendant
    my_deposits = [d for d in deposits_db[deposit.shift_id]["deposits"]
                   if d["attendant_id"] == ctx["user_id"]]
    total = sum(d["amount"] for d in my_deposits)

    return {
        "status": "success",
        "deposit": deposit_record,
        "my_count": len(my_deposits),
        "my_total": total,
    }


@router.get("/{shift_id}")
def get_shift_deposits(shift_id: str, ctx: dict = Depends(require_supervisor_or_owner)):
    """Get all deposits for a shift, grouped by attendant. Supervisor/Manager/Owner only."""
    station_id = ctx["station_id"]
    storage = ctx["storage"]
    shifts_data = storage.get('shifts', {})

    deposits_db = _load_deposits(station_id)
    shift_deposits = deposits_db.get(shift_id, {}).get("deposits", [])

    # Group by attendant
    by_attendant = {}
    for d in shift_deposits:
        aid = d["attendant_id"]
        if aid not in by_attendant:
            by_attendant[aid] = {
                "attendant_id": aid,
                "attendant_name": d["attendant_name"],
                "deposits": [],
                "count": 0,
                "total": 0.0,
                "last_deposit_time": None,
                "overdue": False,
            }
        by_attendant[aid]["deposits"].append(d)
        by_attendant[aid]["count"] += 1
        by_attendant[aid]["total"] += d["amount"]
        by_attendant[aid]["last_deposit_time"] = d["timestamp"]

    # Check overdue status — gap between consecutive deposits > 1 hour
    now = datetime.now()
    shift = shifts_data.get(shift_id, {})
    if shift.get("status") == "active":
        # Ensure all assigned attendants are in the list
        for assignment in shift.get("assignments", []):
            aid = assignment.get("attendant_id", "")
            aname = assignment.get("attendant_name", "")
            if aid not in by_attendant:
                # No deposits yet — only mark overdue if shift has been active long enough
                shift_start = shift.get("created_at")
                minutes_on_shift = 0
                if shift_start:
                    try:
                        minutes_on_shift = (now - datetime.fromisoformat(shift_start)).total_seconds() / 60
                    except (ValueError, KeyError):
                        pass
                by_attendant[aid] = {
                    "attendant_id": aid,
                    "attendant_name": aname,
                    "deposits": [],
                    "count": 0,
                    "total": 0.0,
                    "last_deposit_time": None,
                    "overdue": minutes_on_shift > DEPOSIT_INTERVAL_MINUTES,
                    "max_gap_minutes": None,
                }

        # Calculate gaps between consecutive deposits and from last deposit to now
        for aid, info in by_attendant.items():
            deposits = sorted(info["deposits"], key=lambda d: d.get("timestamp", ""))
            max_gap = 0
            if len(deposits) >= 2:
                for i in range(1, len(deposits)):
                    try:
                        t1 = datetime.fromisoformat(deposits[i - 1]["timestamp"])
                        t2 = datetime.fromisoformat(deposits[i]["timestamp"])
                        gap = (t2 - t1).total_seconds() / 60
                        max_gap = max(max_gap, gap)
                    except (ValueError, KeyError):
                        pass
            # Gap from last deposit to now
            if deposits:
                try:
                    last_dt = datetime.fromisoformat(deposits[-1]["timestamp"])
                    gap_to_now = (now - last_dt).total_seconds() / 60
                    max_gap = max(max_gap, gap_to_now)
                except (ValueError, KeyError):
                    pass

            if deposits:
                info["overdue"] = max_gap > DEPOSIT_INTERVAL_MINUTES
            else:
                # No deposits — use shift start time as reference
                shift_start = shift.get("created_at")
                if shift_start:
                    try:
                        minutes_on_shift = (now - datetime.fromisoformat(shift_start)).total_seconds() / 60
                        info["overdue"] = minutes_on_shift > DEPOSIT_INTERVAL_MINUTES
                    except (ValueError, KeyError):
                        info["overdue"] = False
                else:
                    info["overdue"] = False
            info["max_gap_minutes"] = round(max_gap, 1) if deposits else None

        # Create notifications for overdue attendants
        for aid, info in by_attendant.items():
            if info["overdue"]:
                gap_msg = f" (gap: {info['max_gap_minutes']} min)" if info.get('max_gap_minutes') else ""
                create_notification(
                    station_id=station_id,
                    type="DEPOSIT_OVERDUE",
                    severity="warning",
                    title="Safe Deposit Overdue",
                    message=f"{info['attendant_name']} has a deposit gap exceeding {DEPOSIT_INTERVAL_MINUTES} minutes{gap_msg}",
                    entity_type="safe_deposit",
                    entity_id=f"{shift_id}-{aid}",
                    created_by="system",
                )

    return {
        "shift_id": shift_id,
        "attendants": list(by_attendant.values()),
        "total_deposits": len(shift_deposits),
        "total_amount": sum(d["amount"] for d in shift_deposits),
    }


@router.get("/{shift_id}/my-deposits")
def get_my_deposits(shift_id: str, ctx: dict = Depends(get_station_context)):
    """Get current user's deposits for a shift."""
    station_id = ctx["station_id"]
    user_id = ctx["user_id"]

    deposits_db = _load_deposits(station_id)
    shift_deposits = deposits_db.get(shift_id, {}).get("deposits", [])

    my_deposits = [d for d in shift_deposits if d["attendant_id"] == user_id]
    total = sum(d["amount"] for d in my_deposits)

    # Check if overdue — gap between consecutive deposits or from last deposit to now
    # Only overdue if attendant has been on shift longer than the threshold
    overdue = False
    max_gap = 0
    now = datetime.now()
    sorted_deps = sorted(my_deposits, key=lambda d: d.get("timestamp", ""))
    if len(sorted_deps) >= 2:
        for i in range(1, len(sorted_deps)):
            try:
                t1 = datetime.fromisoformat(sorted_deps[i - 1]["timestamp"])
                t2 = datetime.fromisoformat(sorted_deps[i]["timestamp"])
                gap = (t2 - t1).total_seconds() / 60
                max_gap = max(max_gap, gap)
            except (ValueError, KeyError):
                pass
    if sorted_deps:
        try:
            last_dt = datetime.fromisoformat(sorted_deps[-1]["timestamp"])
            gap_to_now = (now - last_dt).total_seconds() / 60
            max_gap = max(max_gap, gap_to_now)
        except (ValueError, KeyError):
            pass
        overdue = max_gap > DEPOSIT_INTERVAL_MINUTES
    else:
        # No deposits yet — only overdue if shift has been active for longer than the threshold
        storage = ctx["storage"]
        shift = storage.get('shifts', {}).get(shift_id, {})
        shift_start = shift.get("created_at")
        if shift_start:
            try:
                start_dt = datetime.fromisoformat(shift_start)
                minutes_on_shift = (now - start_dt).total_seconds() / 60
                overdue = minutes_on_shift > DEPOSIT_INTERVAL_MINUTES
            except (ValueError, KeyError):
                overdue = False
        else:
            overdue = False

    return {
        "shift_id": shift_id,
        "deposits": my_deposits,
        "count": len(my_deposits),
        "total": total,
        "overdue": overdue,
        "threshold_minutes": DEPOSIT_INTERVAL_MINUTES,
        "threshold_amount": DEPOSIT_THRESHOLD_AMOUNT,
    }
