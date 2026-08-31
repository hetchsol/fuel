"""
Daily Close-Off API
Allows the station owner to review, reconcile, and formally close each day.
Locking prevents further edits to handovers for that date.
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional
from datetime import datetime, timedelta
from pydantic import BaseModel

from .auth import get_station_context, require_manager_or_owner
from ...database.station_files import load_station_json, save_station_json
from ...services.audit_service import log_audit_event
from ...services.notification_service import create_notification
from ...services.shift_status import (
    reconcile_shifts_for_date,
    unreconcile_shifts_for_date,
    _shift_fully_approved,
    describe_unresolved_attendants,
    advance_shift_on_approval,
)

router = APIRouter()

CLOSE_OFF_FILE = "daily_close_offs.json"
HANDOVERS_FILE = "attendant_handovers.json"
REOPEN_LOG_FILE = "daily_close_off_reopen_log.json"

MANAGER_REOPEN_WINDOW = timedelta(hours=4)


def _load_close_offs(station_id: str) -> dict:
    return load_station_json(station_id, CLOSE_OFF_FILE, default={})


def _save_close_offs(station_id: str, data: dict):
    save_station_json(station_id, CLOSE_OFF_FILE, data)


def _load_reopen_log(station_id: str) -> list:
    return load_station_json(station_id, REOPEN_LOG_FILE, default=[])


def _save_reopen_log(station_id: str, data: list):
    save_station_json(station_id, REOPEN_LOG_FILE, data)


def _load_handovers(station_id: str) -> dict:
    return load_station_json(station_id, HANDOVERS_FILE, default={})


def _save_handovers(station_id: str, data: dict):
    save_station_json(station_id, HANDOVERS_FILE, data)


def _aggregate_handovers(handovers: list) -> dict:
    """Compute aggregate totals from a list of approved handover dicts."""
    fuel_revenue = sum(h.get("fuel_revenue", 0) for h in handovers)
    lpg_sales = sum(h.get("lpg_sales", 0) for h in handovers)
    lubricant_sales = sum(h.get("lubricant_sales", 0) for h in handovers)
    accessory_sales = sum(h.get("accessory_sales", 0) for h in handovers)
    total_revenue = fuel_revenue + lpg_sales + lubricant_sales + accessory_sales
    credit_sales = sum(h.get("credit_sales", 0) for h in handovers)
    total_expected_cash = sum(h.get("expected_cash", 0) for h in handovers)
    total_actual_cash = sum(h.get("actual_cash", 0) for h in handovers)
    total_pos_receipts = sum(h.get("pos_receipts", 0) for h in handovers)
    net_variance = total_expected_cash - total_actual_cash - total_pos_receipts

    return {
        "fuel_revenue": round(fuel_revenue, 2),
        "lpg_sales": round(lpg_sales, 2),
        "lubricant_sales": round(lubricant_sales, 2),
        "accessory_sales": round(accessory_sales, 2),
        "total_revenue": round(total_revenue, 2),
        "credit_sales": round(credit_sales, 2),
        "total_expected_cash": round(total_expected_cash, 2),
        "total_actual_cash": round(total_actual_cash, 2),
        "total_pos_receipts": round(total_pos_receipts, 2),
        "net_variance": round(net_variance, 2),
        "shift_count": len(handovers),
    }


# ── GET /diagnose ─────────────────────────────────────────────
@router.get("/diagnose", dependencies=[Depends(require_manager_or_owner)])
async def diagnose_close_off(
    date: str = Query(..., description="Date in YYYY-MM-DD format"),
    ctx: dict = Depends(get_station_context),
):
    """
    Raw, unsummarized dump of everything relevant to closing this date —
    every shift record matching the date (any type, any status, including
    duplicates the close flow would otherwise silently pick between) and
    every handover referencing each one (any phase/status, including
    superseded). No interpretation beyond flagging what's resolved, so
    nothing gets silently filtered out the way a targeted check could miss
    an unanticipated case. Meant to make "why can't I close this day"
    answerable by looking, not by guessing from the error message.
    """
    station_id = ctx["station_id"]
    storage = ctx["storage"]

    shifts_for_date = [
        (sid, s) for sid, s in storage.get("shifts", {}).items()
        if s.get("date") == date
    ]
    all_handovers = _load_handovers(station_id)
    resolved_statuses = ("approved", "voided")

    shift_type_counts: dict = {}
    shifts_out = []
    for sid, s in shifts_for_date:
        shift_type = s.get("shift_type", "unknown")
        shift_type_counts[shift_type] = shift_type_counts.get(shift_type, 0) + 1

        assignments = s.get("assignments", [])
        shift_handovers = [h for h in all_handovers.values() if h.get("shift_id") == sid]
        assigned_ids = {a.get("attendant_id") for a in assignments if a.get("attendant_id")}
        resolved_ids = {h.get("attendant_id") for h in shift_handovers
                        if h.get("review_status") in resolved_statuses
                        and h.get("phase") != "readings_superseded"}

        shifts_out.append({
            "shift_id": sid,
            "shift_type": shift_type,
            "status": s.get("status"),
            "created_at": s.get("created_at"),
            "assignments": [
                {"attendant_id": a.get("attendant_id"), "attendant_name": a.get("attendant_name")}
                for a in assignments
            ],
            "fully_approved": bool(assigned_ids) and assigned_ids.issubset(resolved_ids),
            "handovers": [
                {
                    "handover_id": hid,
                    "attendant_id": h.get("attendant_id"),
                    "attendant_name": h.get("attendant_name"),
                    "phase": h.get("phase"),
                    "review_status": h.get("review_status"),
                    "created_at": h.get("created_at"),
                    "resolved": h.get("review_status") in resolved_statuses,
                    "superseded": h.get("phase") == "readings_superseded",
                }
                for hid, h in all_handovers.items() if h.get("shift_id") == sid
            ],
        })

    duplicate_types = [t for t, count in shift_type_counts.items() if count > 1]

    return {
        "date": date,
        "already_closed": date in _load_close_offs(station_id),
        "shift_type_counts": shift_type_counts,
        "duplicate_shift_types": duplicate_types,
        "shifts": shifts_out,
    }


# ── POST /recompute-shift ────────────────────────────────────
class RecomputeShiftInput(BaseModel):
    shift_id: str


@router.post("/recompute-shift", dependencies=[Depends(require_manager_or_owner)])
async def recompute_shift(data: RecomputeShiftInput, ctx: dict = Depends(get_station_context)):
    """
    Re-run the completion check for one shift against its CURRENT data,
    without requiring a fresh approval/void to trigger it.

    advance_shift_on_approval only ever fires reactively, at the moment a
    handover gets approved or voided. If a shift's underlying data changes
    afterward in a way that would newly satisfy completion (e.g. its
    assignments list was corrected or cleared out-of-band, after every
    handover was already approved), nothing re-triggers the check — the
    shift can sit at 'auto-closed' forever even though _shift_fully_approved
    would already return True if asked. This is that ask, on demand.

    A no-op (returns advanced: false) if the shift isn't actually fully
    approved yet, or is already past the pre-completion states — never
    forces a transition that wouldn't happen naturally.
    """
    station_id = ctx["station_id"]
    storage = ctx["storage"]
    shifts_data = storage.get("shifts", {})
    shift = shifts_data.get(data.shift_id)
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found")

    before_status = shift.get("status")
    advanced = advance_shift_on_approval(data.shift_id, station_id, storage, ctx["username"])

    if advanced:
        log_audit_event(
            station_id=station_id,
            action="shift_recomputed",
            performed_by=ctx["username"],
            entity_type="shift",
            entity_id=data.shift_id,
            details={"previous_status": before_status, "new_status": shift.get("status")},
        )

    return {
        "advanced": advanced,
        "status": shift.get("status"),
        "blockers": describe_unresolved_attendants(shift, data.shift_id, station_id, storage) if not advanced else [],
    }


# ── GET /summary ──────────────────────────────────────────────
@router.get("/summary", dependencies=[Depends(require_manager_or_owner)])
async def get_close_off_summary(
    date: str = Query(..., description="Date in YYYY-MM-DD format"),
    ctx: dict = Depends(get_station_context),
):
    """
    Get daily close-off summary for a given date.
    Shows approved handovers, unapproved handovers, totals, and close-off status.
    Owner only.
    """
    station_id = ctx["station_id"]

    # Check if already closed
    close_offs = _load_close_offs(station_id)
    already_closed = date in close_offs
    close_off_record = close_offs.get(date) if already_closed else None

    # Load all handovers for this date
    all_handovers = _load_handovers(station_id)
    date_handovers = [h for h in all_handovers.values() if h.get("date") == date]

    approved = [h for h in date_handovers if h.get("review_status") == "approved"]
    # Voided handovers are resolved (excluded from sales, don't block the
    # shift-completion requirement) — they must not show up here as if they
    # still need someone to approve them.
    unapproved = [h for h in date_handovers if h.get("review_status") not in ("approved", "voided")]

    # Identify flagged handovers (approved but had auto-flags)
    flagged_ids = [
        h.get("handover_id", "")
        for h in approved
        if h.get("auto_flag_reasons")
    ]

    # Build approved summaries for the table
    approved_summaries = []
    for h in approved:
        approved_summaries.append({
            "handover_id": h.get("handover_id"),
            "attendant_name": h.get("attendant_name", ""),
            "shift_type": h.get("shift_type", ""),
            "shift_id": h.get("shift_id", ""),
            "fuel_revenue": h.get("fuel_revenue", 0),
            "lpg_sales": h.get("lpg_sales", 0),
            "lubricant_sales": h.get("lubricant_sales", 0),
            "accessory_sales": h.get("accessory_sales", 0),
            "total_expected": h.get("total_expected", 0),
            "credit_sales": h.get("credit_sales", 0),
            "expected_cash": h.get("expected_cash", 0),
            "actual_cash": h.get("actual_cash", 0),
            "pos_receipts": h.get("pos_receipts", 0),
            "difference": round(
                h.get("expected_cash", 0) - h.get("actual_cash", 0) - h.get("pos_receipts", 0), 2
            ),
            "auto_flag_reasons": h.get("auto_flag_reasons", []),
        })

    unapproved_summaries = []
    for h in unapproved:
        unapproved_summaries.append({
            "handover_id": h.get("handover_id"),
            "attendant_name": h.get("attendant_name", ""),
            "shift_type": h.get("shift_type", ""),
            "review_status": h.get("review_status", "submitted"),
            "status": h.get("status", "submitted"),
        })

    totals = _aggregate_handovers(approved)

    return {
        "date": date,
        "already_closed": already_closed,
        "close_off_record": close_off_record,
        "approved_handovers": approved_summaries,
        "unapproved_handovers": unapproved_summaries,
        "totals": totals,
        "flagged_handover_ids": flagged_ids,
    }


# ── POST /close ──────────────────────────────────────────────
class CloseOffInput(BaseModel):
    date: str
    bank_deposit_amount: float
    deposit_reference: Optional[str] = ""
    owner_notes: Optional[str] = ""


@router.post("/close", dependencies=[Depends(require_manager_or_owner)])
async def close_day(
    data: CloseOffInput,
    ctx: dict = Depends(get_station_context),
):
    """
    Close off a day: lock handovers, record bank deposit, create audit trail.
    Owner only. Both the Day and Night shift for the date must be recorded
    and fully closed (all handovers approved) before the day can be banked.
    """
    station_id = ctx["station_id"]
    now = datetime.now()

    # Block future dates
    if data.date > now.strftime("%Y-%m-%d"):
        raise HTTPException(status_code=400, detail="Cannot close off a future date.")

    # Check not already closed
    close_offs = _load_close_offs(station_id)
    if data.date in close_offs:
        raise HTTPException(status_code=400, detail=f"Day {data.date} is already closed.")

    # Require both the Day and Night shift for this date to be recorded and
    # genuinely, cleanly closed (status 'completed' — not 'active', and
    # deliberately not 'auto-closed', which is a 20-hour stale-shift timeout
    # fallback rather than a real all-attendants-approved completion). The
    # handover-approval check further below only sees what exists, never what's
    # missing — this is what catches a whole shift that was never even started.
    shifts_for_date = [
        (sid, s) for sid, s in ctx["storage"].get("shifts", {}).items()
        if s.get("date") == data.date
    ]

    def _matches(shift_type_label: str):
        return [pair for pair in shifts_for_date if pair[1].get("shift_type", "").lower() == shift_type_label]

    for label, matches_key in (("Day", "day"), ("Night", "night")):
        matches = _matches(matches_key)
        # More than one shift record for the same date+type is never valid —
        # picking "the first one" (previous behavior) risks silently operating
        # on a stray/empty duplicate while the real shift (with all the actual
        # assignments and approved handovers) sits at a different shift_id,
        # both blocking the status gate below AND excluding the real handovers
        # from the banked total if it somehow got past that gate.
        if len(matches) > 1:
            descriptions = [
                f"{sid} (status: {s.get('status', 'unknown')}, "
                f"{len(s.get('assignments', []))} assignment(s))"
                for sid, s in matches
            ]
            raise HTTPException(
                status_code=400,
                detail=f"Cannot close day: found {len(matches)} {label} shift records for "
                       f"{data.date}, not 1 — {'; '.join(descriptions)}. Deactivate the stray "
                       "one (reactivate first if it's auto-closed) before closing the day.",
            )

    day_entry = next(iter(_matches("day")), None)
    night_entry = next(iter(_matches("night")), None)
    for label, entry in (("Day", day_entry), ("Night", night_entry)):
        if entry is None:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot close day: {label} shift has not been recorded for {data.date}.",
            )
        # 'inactive' (deactivated) satisfies this gate too — a mistake/duplicate
        # shift that was deactivated (with nothing left to void) no longer needs
        # to be completed for the day to close.
        if entry[1].get("status") not in ("completed", "inactive"):
            blockers = describe_unresolved_attendants(entry[1], entry[0], station_id, ctx["storage"])
            detail = (
                f"Cannot close day: {label} shift is not yet fully closed "
                f"(status: {entry[1].get('status', 'unknown')})."
            )
            if blockers:
                detail += " Blocking: " + "; ".join(blockers) + "."
            raise HTTPException(status_code=400, detail=detail)
    day_shift_id, night_shift_id = day_entry[0], night_entry[0]

    # Load handovers for the date — scoped to exactly the two verified shifts,
    # not a blanket date match, so a stray/duplicate handover sharing the date
    # can't inflate or dilute the banked total.
    all_handovers = _load_handovers(station_id)
    date_handovers = {
        hid: h for hid, h in all_handovers.items()
        if h.get("shift_id") in (day_shift_id, night_shift_id)
    }

    if not date_handovers:
        raise HTTPException(status_code=400, detail=f"No handovers found for {data.date}.")

    # Verify all are resolved — approved, or voided out of the picture entirely.
    unapproved = [
        h.get("handover_id", hid)
        for hid, h in date_handovers.items()
        if h.get("review_status") not in ("approved", "voided")
    ]
    if unapproved:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot close day. {len(unapproved)} handover(s) not yet approved: {', '.join(unapproved[:5])}"
        )

    # Voided handovers are resolved but must never contribute to the banked
    # total — only actually-approved ones feed the aggregate.
    approved_list = [h for h in date_handovers.values() if h.get("review_status") == "approved"]
    totals = _aggregate_handovers(approved_list)

    # Compute deposit variance
    deposit_variance = round(data.bank_deposit_amount - totals["total_actual_cash"], 2)

    flagged_ids = [
        h.get("handover_id", "")
        for h in approved_list
        if h.get("auto_flag_reasons")
    ]

    # Build close-off record
    close_off_record = {
        "date": data.date,
        "status": "closed",
        "handover_ids": list(date_handovers.keys()),
        "shift_count": len(date_handovers),
        "summary": totals,
        "flagged_handover_ids": flagged_ids,
        "bank_deposit": {
            "amount": data.bank_deposit_amount,
            "variance": deposit_variance,
            "reference": data.deposit_reference or "",
        },
        "closed_by": ctx.get("username", ""),
        "closed_by_name": ctx.get("full_name", ""),
        "closed_at": now.isoformat(),
        "owner_notes": data.owner_notes or "",
    }

    # Save close-off
    close_offs[data.date] = close_off_record
    _save_close_offs(station_id, close_offs)

    # Lock handovers
    for hid in date_handovers:
        all_handovers[hid]["day_closed"] = True
        all_handovers[hid]["day_closed_at"] = now.isoformat()
    _save_handovers(station_id, all_handovers)

    # Reconcile the shifts behind this day's handovers (final lock after banking).
    # NOTE: Stores forecourt stock is updated per-shift when each handover is
    # approved (see attendant_handover.review_handover / batch_approve), not here.
    shift_ids = [h.get("shift_id") for h in date_handovers.values() if h.get("shift_id")]
    reconcile_shifts_for_date(shift_ids, station_id, ctx["storage"], ctx.get("username", ""))

    # Auto-backup on every close
    try:
        from .backup import trigger_auto_backup
        trigger_auto_backup(station_id, triggered_by=ctx.get("username", "system"))
    except Exception:
        pass  # Never block main operation

    # Audit trail
    try:
        log_audit_event(
            station_id=station_id,
            action="daily_close_off",
            performed_by=ctx.get("username", ""),
            entity_type="daily_close_off",
            entity_id=data.date,
            details={
                **totals,
                "bank_deposit": data.bank_deposit_amount,
                "deposit_variance": deposit_variance,
                "deposit_reference": data.deposit_reference or "",
                "handover_count": len(date_handovers),
            },
            notes=data.owner_notes,
        )
    except Exception:
        pass  # Never block main operation

    # Notification
    try:
        variance_str = f"K{abs(deposit_variance):,.2f}"
        variance_label = "over" if deposit_variance > 0 else "short" if deposit_variance < 0 else "exact"
        create_notification(
            station_id=station_id,
            type="DAY_CLOSED",
            severity="info",
            title=f"Day Closed: {data.date}",
            message=f"Day {data.date} closed by {ctx.get('full_name', '')}. "
                    f"{len(date_handovers)} shift(s), revenue K{totals['total_revenue']:,.2f}, "
                    f"deposit {variance_label} by {variance_str}.",
            entity_type="daily_close_off",
            entity_id=data.date,
            created_by=ctx.get("username", ""),
        )
    except Exception:
        pass  # Never block main operation

    return close_off_record


# ── POST /reopen ─────────────────────────────────────────────
class ReopenDayInput(BaseModel):
    date: str
    reason: str


@router.post("/reopen", dependencies=[Depends(require_manager_or_owner)])
async def reopen_day(
    data: ReopenDayInput,
    ctx: dict = Depends(get_station_context),
):
    """
    Reopen a closed day so an omitted/incomplete shift can still be closed
    and approved, then the day re-banked with both shifts consolidated.

    Owners may reopen any closed day at any time. Managers may only reopen
    within 4 hours of the original closure — past that, only the owner can.

    Never touches an already-approved handover's cash/POS/reading data (that
    stays permanently locked regardless — see review_handover's "Cannot
    modify an approved handover" guard). Only shifts that turn out to still
    be genuinely incomplete are reverted to editable; a shift that was
    already fully and correctly closed is left alone and stays locked.
    """
    station_id = ctx["station_id"]
    now = datetime.now()

    reason = (data.reason or "").strip()
    if not reason:
        raise HTTPException(status_code=400, detail="A reason is required to reopen a closed day.")

    close_offs = _load_close_offs(station_id)
    prior_record = close_offs.get(data.date)
    if prior_record is None:
        raise HTTPException(status_code=400, detail=f"Day {data.date} is not closed.")

    is_manager = ctx.get("role") == "manager"
    if is_manager:
        closed_at_str = prior_record.get("closed_at")
        closed_at = None
        if closed_at_str:
            try:
                closed_at = datetime.fromisoformat(closed_at_str)
            except ValueError:
                closed_at = None
        if closed_at is None or (now - closed_at) > MANAGER_REOPEN_WINDOW:
            raise HTTPException(
                status_code=403,
                detail="This day was closed more than 4 hours ago — only the owner can reopen it now.",
            )

    # Everything below only mutates once validation has fully passed, and the
    # actual unlock (popping close_offs, last) happens only after every other
    # write has already succeeded — so a failure partway through leaves the
    # day still looking closed rather than falsely looking reopened.
    handover_ids = prior_record.get("handover_ids", [])
    all_handovers = _load_handovers(station_id)
    storage = ctx["storage"]
    shifts_data = storage.get("shifts", {})

    # Discover candidate shifts by date, not by prior_record["handover_ids"] —
    # a shift that was completely omitted (the motivating case: a shift with
    # zero handovers at all) is never referenced by any handover_id, so it
    # would otherwise be invisible here and never get reverted.
    incomplete_shift_ids = [
        sid for sid, s in shifts_data.items()
        if s.get("date") == data.date
        and not _shift_fully_approved(s, sid, station_id, storage)
    ]

    # Archive the prior closure before anything else changes — full history
    # survives even though the live daily_close_offs.json key is about to go.
    reopen_log = _load_reopen_log(station_id)
    reopen_log.append({
        "date": data.date,
        "reason": reason,
        "reopened_by": ctx.get("username", ""),
        "reopened_by_name": ctx.get("full_name", ""),
        "reopened_at": now.isoformat(),
        "prior_record": prior_record,
    })
    _save_reopen_log(station_id, reopen_log)

    # Revert only the genuinely incomplete shift(s) — a shift that was already
    # fully approved is left at 'reconciled', so its dips/deliveries stay
    # locked and its data surface stays untouched.
    reverted = unreconcile_shifts_for_date(
        incomplete_shift_ids, station_id, storage, ctx.get("username", "")
    )

    # Clear the day-lock stamp on affected handovers (informational only —
    # nothing reads it as a gate, close_offs membership below is what actually
    # unlocks handover work) and leave a traceable marker on each.
    for hid in handover_ids:
        h = all_handovers.get(hid)
        if not h:
            continue
        h["day_closed"] = False
        h.pop("day_closed_at", None)
        h.setdefault("reopen_history", []).append({
            "reason": reason,
            "reopened_by": ctx.get("username", ""),
            "reopened_by_name": ctx.get("full_name", ""),
            "reopened_at": now.isoformat(),
        })
    _save_handovers(station_id, all_handovers)

    # The actual unlock: every day-lock guard in attendant_handover.py checks
    # plain membership in this dict, so popping the date re-opens all of them.
    del close_offs[data.date]
    _save_close_offs(station_id, close_offs)

    # Audit trail
    try:
        log_audit_event(
            station_id=station_id,
            action="daily_close_off_reopen",
            performed_by=ctx.get("username", ""),
            entity_type="daily_close_off",
            entity_id=data.date,
            details={
                "reason": reason,
                "prior_summary": prior_record.get("summary"),
                "handover_count": len(handover_ids),
                "shift_ids_reverted": reverted,
            },
            notes=reason,
        )
    except Exception:
        pass  # Never block main operation

    # Notification — severity reflects how exceptional the path taken was.
    try:
        create_notification(
            station_id=station_id,
            type="DAY_REOPENED",
            severity="medium" if is_manager else "high",
            title=f"Day Reopened: {data.date}",
            message=f"{ctx.get('full_name', '')} reopened {data.date} for correction. Reason: {reason}",
            entity_type="daily_close_off",
            entity_id=data.date,
            created_by=ctx.get("username", ""),
        )
    except Exception:
        pass  # Never block main operation

    return {
        "status": "success",
        "date": data.date,
        "shifts_reverted": reverted,
    }


# ── GET /history ──────────────────────────────────────────────
@router.get("/history", dependencies=[Depends(require_manager_or_owner)])
async def get_close_off_history(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    limit: int = Query(default=30, le=365),
    ctx: dict = Depends(get_station_context),
):
    """
    Get close-off history, sorted descending by date. Owner only.
    """
    station_id = ctx["station_id"]
    close_offs = _load_close_offs(station_id)

    records = list(close_offs.values())

    if start_date:
        records = [r for r in records if r.get("date", "") >= start_date]
    if end_date:
        records = [r for r in records if r.get("date", "") <= end_date]

    records.sort(key=lambda r: r.get("date", ""), reverse=True)
    return records[:limit]
