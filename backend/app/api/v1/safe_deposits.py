"""
Safe Deposit Tracking API

Cash deposits into the safe during shifts, bound to the attendant who made
them. Attendants record their own; a supervisor/manager recording at the safe
picks the attendant from the shift roster. A deposit counts only towards its
own attendant's shift close (see safe_deposit_service), is refused once that
attendant's handover is closed, and can be voided or moved to the right
attendant by a manager while both handovers are still open.
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
import uuid

from .auth import get_current_user, get_station_context, require_supervisor_or_owner, require_manager_or_owner
from ...database.station_files import load_station_json, save_station_json
from ...services.notification_service import create_notification
from ...services.audit_service import log_audit_event
from ...services.handover_lookup import get_active_handover
from ...services import safe_deposit_service as deps

router = APIRouter()

# Thresholds (hardcoded for now — can move to settings later)
DEPOSIT_INTERVAL_MINUTES = 60      # Attendant reminder interval
DEPOSIT_THRESHOLD_AMOUNT = 1500    # Cash cap before deposit expected
SUPERVISOR_NOTIFY_INTERVAL_MINUTES = 120  # Supervisor re-notification interval


class DepositInput(BaseModel):
    shift_id: str
    amount: float = Field(..., gt=0)
    note: Optional[str] = ""
    # Supervisor/manager/owner recording at the safe on an attendant's behalf.
    # Attendants always record for themselves; this is ignored for them.
    attendant_id: Optional[str] = None


class DepositVoidInput(BaseModel):
    reason: str


class DepositReassignInput(BaseModel):
    attendant_id: str
    reason: str


_PRIVILEGED = ("supervisor", "manager", "owner")


def _load_deposits(station_id: str) -> dict:
    return deps.load_deposits(station_id)


def _save_deposits(station_id: str, data: dict):
    deps.save_deposits(station_id, data)


def _role(ctx: dict) -> str:
    role = ctx.get("role", "")
    return getattr(role, "value", role) or ""


def _roster_entry(shift: dict, attendant_id: str) -> Optional[dict]:
    return next((a for a in shift.get("assignments", []) or [] if a.get("attendant_id") == attendant_id), None)


def _require_open_for_deposits(station_id: str, shift_id: str, attendant_id: str, name: str):
    """A deposit can only be added to (or moved onto/off) an attendant whose cash close hasn't happened."""
    h = get_active_handover(station_id, shift_id, attendant_id)
    if h and h.get("phase") == "completed" and h.get("review_status") != "voided":
        raise HTTPException(
            status_code=400,
            detail=f"{name}'s shift is already closed, so this deposit can no longer count towards it.")


@router.post("/")
def record_deposit(deposit: DepositInput, ctx: dict = Depends(get_station_context)):
    """
    Record a cash deposit into the safe, bound to one rostered attendant.
    Attendants record their own. A supervisor/manager/owner may record one
    for a rostered attendant (attendant_id); they are stored as recorded_by.
    """
    station_id = ctx["station_id"]
    storage = ctx["storage"]
    shifts_data = storage.get('shifts', {})

    # Validate shift exists and is active
    if deposit.shift_id not in shifts_data:
        raise HTTPException(status_code=404, detail="Shift not found")
    shift = shifts_data[deposit.shift_id]
    if shift.get("status") != "active":
        raise HTTPException(status_code=400, detail="Shift is not active")

    privileged = _role(ctx) in _PRIVILEGED
    target_id = deposit.attendant_id if (privileged and deposit.attendant_id) else ctx["user_id"]
    entry = _roster_entry(shift, target_id)
    if not entry:
        if target_id == ctx["user_id"] and privileged:
            raise HTTPException(status_code=400, detail="Choose the attendant this deposit belongs to.")
        raise HTTPException(status_code=403, detail="Only an attendant on this shift's roster can make a deposit.")
    target_name = entry.get("attendant_name") or (ctx["full_name"] if target_id == ctx["user_id"] else target_id)
    _require_open_for_deposits(station_id, deposit.shift_id, target_id, target_name)

    deposits_db = _load_deposits(station_id)

    if deposit.shift_id not in deposits_db:
        deposits_db[deposit.shift_id] = {"shift_id": deposit.shift_id, "deposits": []}

    now_dt = datetime.now()
    deposit_record = {
        "deposit_id": f"DEP-{uuid.uuid4().hex[:8]}",
        "attendant_id": target_id,
        "attendant_name": target_name,
        "recorded_by_id": ctx["user_id"],
        "recorded_by_name": ctx["full_name"],
        "amount": deposit.amount,
        "time": now_dt.strftime("%H:%M"),
        "timestamp": now_dt.isoformat(),
        "recorded_at": now_dt.isoformat(),
        "note": deposit.note or "",
    }

    deposits_db[deposit.shift_id]["deposits"].append(deposit_record)
    _save_deposits(station_id, deposits_db)

    # Running total for the attendant the deposit belongs to
    my_deposits = deps.attendant_deposits(station_id, deposit.shift_id, target_id)
    total = sum(d["amount"] for d in my_deposits)

    return {
        "status": "success",
        "deposit": deposit_record,
        "my_count": len(my_deposits),
        "my_total": total,
    }


@router.get("/{shift_id}")
def get_shift_deposits(shift_id: str, ctx: dict = Depends(get_station_context)):
    """Get all deposits for a shift, grouped by attendant. Supervisor/Manager/Owner only."""
    role = ctx.get("role", "")
    if role not in ["supervisor", "manager", "owner"]:
        raise HTTPException(status_code=403, detail="Access restricted to supervisors, managers, and owners.")
    station_id = ctx["station_id"]
    storage = ctx["storage"]
    shifts_data = storage.get('shifts', {})

    all_rows = deps.shift_deposits(station_id, shift_id, include_voided=True)
    shift_deposits = [d for d in all_rows if deps.is_live(d)]
    voided = [d for d in all_rows if not deps.is_live(d)]

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

    # Overdue logic for supervisor view
    # - Attendant overdue = last deposit (or shift start) > 60 min ago
    # - Supervisor notification = first at 60 min after shift start, then every 2 hours
    #   Only for attendants who have NOT deposited
    now = datetime.now()
    shift = shifts_data.get(shift_id, {})
    shift_start = shift.get("created_at")
    shift_start_dt = None
    if shift_start:
        try:
            shift_start_dt = datetime.fromisoformat(shift_start)
        except (ValueError, KeyError):
            pass

    if shift.get("status") == "active":
        # Ensure all assigned attendants are in the list
        for assignment in shift.get("assignments", []):
            aid = assignment.get("attendant_id", "")
            aname = assignment.get("attendant_name", "")
            if aid not in by_attendant:
                by_attendant[aid] = {
                    "attendant_id": aid,
                    "attendant_name": aname,
                    "deposits": [],
                    "count": 0,
                    "total": 0.0,
                    "last_deposit_time": None,
                    "overdue": False,
                    "minutes_since_last_deposit": None,
                }

        # Calculate overdue for each attendant
        for aid, info in by_attendant.items():
            sorted_deps = sorted(info["deposits"], key=lambda d: d.get("recorded_at", ""))
            if sorted_deps:
                # Has deposits — overdue if last deposit > 60 min ago
                try:
                    last_dt = datetime.fromisoformat(sorted_deps[-1]["recorded_at"])
                    gap = (now - last_dt).total_seconds() / 60
                    info["overdue"] = gap > DEPOSIT_INTERVAL_MINUTES
                    info["minutes_since_last_deposit"] = round(gap, 1)
                except (ValueError, KeyError):
                    info["overdue"] = False
            else:
                # No deposits — overdue if shift has been running > 60 min
                if shift_start_dt:
                    minutes_on_shift = (now - shift_start_dt).total_seconds() / 60
                    info["overdue"] = minutes_on_shift > DEPOSIT_INTERVAL_MINUTES
                    info["minutes_since_last_deposit"] = round(minutes_on_shift, 1)
                else:
                    info["overdue"] = False

        # Supervisor notifications — only for attendants with NO deposits
        # First notification at 60 min after shift start, then every 2 hours
        # Deduplicate: check last notification time for this attendant+shift
        from ...database.station_files import load_station_json as _load_json
        existing_notifs = _load_json(station_id, 'notifications.json', default=[])

        for aid, info in by_attendant.items():
            if not info["overdue"]:
                continue

            entity_id = f"{shift_id}-{aid}"

            # Find the most recent DEPOSIT_OVERDUE notification for this attendant+shift
            last_notif_time = None
            for n in existing_notifs:
                if n.get("type") == "DEPOSIT_OVERDUE" and n.get("entity_id") == entity_id:
                    try:
                        notif_dt = datetime.fromisoformat(n.get("created_at", ""))
                        if last_notif_time is None or notif_dt > last_notif_time:
                            last_notif_time = notif_dt
                    except (ValueError, KeyError):
                        pass

            # Determine if we should send a new notification
            should_notify = False
            if last_notif_time is None:
                # Never notified — send if shift > 60 min old
                if shift_start_dt and (now - shift_start_dt).total_seconds() / 60 > DEPOSIT_INTERVAL_MINUTES:
                    should_notify = True
            else:
                # Already notified — only re-notify every 2 hours
                minutes_since_notif = (now - last_notif_time).total_seconds() / 60
                if minutes_since_notif >= SUPERVISOR_NOTIFY_INTERVAL_MINUTES:
                    should_notify = True

            if should_notify:
                mins = info.get("minutes_since_last_deposit") or 0
                hrs = int(mins) // 60
                rem = int(mins) % 60
                time_str = f"{hrs}h {rem}m" if hrs > 0 else f"{rem}m"
                if info["count"] > 0:
                    msg = (f"{info['attendant_name']} has not deposited in the last {time_str} "
                           f"(expected every {DEPOSIT_INTERVAL_MINUTES} min or at K{DEPOSIT_THRESHOLD_AMOUNT:,} cap)")
                else:
                    msg = (f"{info['attendant_name']} has not made any safe deposit since shift started {time_str} ago "
                           f"(expected every {DEPOSIT_INTERVAL_MINUTES} min or at K{DEPOSIT_THRESHOLD_AMOUNT:,} cap)")
                create_notification(
                    station_id=station_id,
                    type="DEPOSIT_OVERDUE",
                    severity="warning",
                    title="Safe Deposit Overdue",
                    message=msg,
                    entity_type="safe_deposit",
                    entity_id=entity_id,
                    created_by="system",
                )

    return {
        "shift_id": shift_id,
        "attendants": list(by_attendant.values()),
        "total_deposits": len(shift_deposits),
        "total_amount": sum(d["amount"] for d in shift_deposits),
        "voided": voided,
    }


@router.get("/{shift_id}/my-deposits")
def get_my_deposits(shift_id: str, ctx: dict = Depends(get_station_context)):
    """Get current user's deposits for a shift."""
    station_id = ctx["station_id"]
    user_id = ctx["user_id"]

    my_deposits = deps.attendant_deposits(station_id, shift_id, user_id)
    total = sum(d["amount"] for d in my_deposits)

    # Attendant overdue: remind every hour
    # Reference point = last deposit time, or shift start if no deposits
    overdue = False
    now = datetime.now()
    storage = ctx["storage"]
    shift = storage.get('shifts', {}).get(shift_id, {})
    shift_start = shift.get("created_at")

    sorted_deps = sorted(my_deposits, key=lambda d: d.get("recorded_at", ""))
    if sorted_deps:
        # Has deposits — check time since last deposit (server recorded time)
        try:
            last_dt = datetime.fromisoformat(sorted_deps[-1]["recorded_at"])
            minutes_since_last = (now - last_dt).total_seconds() / 60
            overdue = minutes_since_last > DEPOSIT_INTERVAL_MINUTES
        except (ValueError, KeyError):
            overdue = False
    else:
        # No deposits — check time since shift start
        if shift_start:
            try:
                minutes_on_shift = (now - datetime.fromisoformat(shift_start)).total_seconds() / 60
                overdue = minutes_on_shift > DEPOSIT_INTERVAL_MINUTES
            except (ValueError, KeyError):
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


def _find_deposit(station_id: str, shift_id: str, deposit_id: str):
    db = _load_deposits(station_id)
    rows = (db.get(shift_id) or {}).get("deposits", [])
    d = next((x for x in rows if x.get("deposit_id") == deposit_id), None)
    if not d:
        raise HTTPException(status_code=404, detail="Deposit not found")
    if not deps.is_live(d):
        raise HTTPException(status_code=400, detail="This deposit has already been voided.")
    return db, d


@router.post("/{shift_id}/{deposit_id}/void", dependencies=[Depends(require_manager_or_owner)])
def void_deposit(shift_id: str, deposit_id: str, data: DepositVoidInput, ctx: dict = Depends(get_station_context)):
    """Void a wrongly recorded deposit (manager/owner), while its attendant's shift is still open."""
    if not data.reason.strip():
        raise HTTPException(status_code=400, detail="A reason is required.")
    station_id = ctx["station_id"]
    db, d = _find_deposit(station_id, shift_id, deposit_id)
    _require_open_for_deposits(station_id, shift_id, d["attendant_id"], d.get("attendant_name") or d["attendant_id"])
    d.update({"voided": True, "voided_by": ctx["username"], "voided_at": datetime.now().isoformat(),
              "void_reason": data.reason.strip()})
    _save_deposits(station_id, db)
    log_audit_event(station_id=station_id, action="safe_deposit_void", performed_by=ctx["username"],
                    entity_type="safe_deposit", entity_id=deposit_id,
                    details={"shift_id": shift_id, "attendant_id": d["attendant_id"], "amount": d["amount"]},
                    notes=data.reason.strip())
    return {"status": "success", "deposit": d}


@router.post("/{shift_id}/{deposit_id}/reassign", dependencies=[Depends(require_manager_or_owner)])
def reassign_deposit(shift_id: str, deposit_id: str, data: DepositReassignInput,
                     ctx: dict = Depends(get_station_context)):
    """
    Move a deposit recorded against the wrong attendant to the right one
    (manager/owner). Both attendants' shifts must still be open.
    """
    if not data.reason.strip():
        raise HTTPException(status_code=400, detail="A reason is required.")
    station_id = ctx["station_id"]
    shift = ctx["storage"].get("shifts", {}).get(shift_id)
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found")
    entry = _roster_entry(shift, data.attendant_id)
    if not entry:
        raise HTTPException(status_code=400, detail="That attendant is not on this shift.")
    db, d = _find_deposit(station_id, shift_id, deposit_id)
    if d["attendant_id"] == data.attendant_id:
        raise HTTPException(status_code=400, detail="The deposit already belongs to that attendant.")
    _require_open_for_deposits(station_id, shift_id, d["attendant_id"], d.get("attendant_name") or d["attendant_id"])
    _require_open_for_deposits(station_id, shift_id, data.attendant_id, entry.get("attendant_name") or data.attendant_id)
    before = {"attendant_id": d["attendant_id"], "attendant_name": d.get("attendant_name")}
    d.setdefault("reassignments", []).append({
        **{f"from_{k}": v for k, v in before.items()},
        "by": ctx["username"], "at": datetime.now().isoformat(), "reason": data.reason.strip(),
    })
    d["attendant_id"] = data.attendant_id
    d["attendant_name"] = entry.get("attendant_name") or data.attendant_id
    _save_deposits(station_id, db)
    log_audit_event(station_id=station_id, action="safe_deposit_reassign", performed_by=ctx["username"],
                    entity_type="safe_deposit", entity_id=deposit_id,
                    details={"shift_id": shift_id, "from": before["attendant_id"], "to": data.attendant_id,
                             "amount": d["amount"]},
                    notes=data.reason.strip())
    return {"status": "success", "deposit": d}
