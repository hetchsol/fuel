"""
Shift status lifecycle helpers.

Centralizes the shift status model (active → completed → reconciled, plus
auto-closed / inactive) and the edit-lock guard, so the rules live in one place
instead of being scattered across endpoints.

Transitions (all automatic — there is no manual "close shift" button):
  - active / auto-closed  → completed   when every handover for the shift is approved
  - editable states       → reconciled  at Daily Close-Off (after banking)

`reconciled` and `inactive` are terminal/locked: no further writes are allowed.
"""
from datetime import datetime

from fastapi import HTTPException

from ..database.station_files import load_station_json
from ..database.storage import save_station_storage
from .audit_service import log_audit_event

HANDOVERS_FILE = "attendant_handovers.json"

# Statuses that may still be edited (writes allowed).
EDITABLE_STATUSES = {"active", "completed", "auto-closed"}
# Statuses that lock a shift from further writes.
LOCKED_STATUSES = {"reconciled", "inactive"}


def assert_shift_editable(shift: dict):
    """
    Raise 403 if the shift is in a locked (read-only) state.

    Safe to call with a missing/partial shift dict — defaults to 'active'
    (editable), so it never blocks the existing active-only flows.
    """
    status = (shift or {}).get("status", "active")
    if status in LOCKED_STATUSES:
        raise HTTPException(
            status_code=403,
            detail=f"Shift is {status} and can no longer be edited.",
        )


def advance_shift_on_approval(shift_id: str, station_id: str, storage: dict,
                              performed_by: str = "") -> bool:
    """
    Advance the container shift to 'completed' — but only once EVERY assigned
    attendant has an approved handover.

    A shift may have several attendants (A, B, C), each closing their own
    handover individually (own verification + cash handover + approval, scoped to
    their own nozzles). Approving attendant A must NOT close out B or C, so this
    only completes the shift when all assigned attendants are accounted for.

    No-op (returns False) if the shift is missing, not in an advanceable state
    (active/auto-closed), has any non-approved handover, or still has an assigned
    attendant without an approved handover. Returns True when status changed.
    """
    if not shift_id:
        return False
    shifts_data = storage.get("shifts", {})
    shift = shifts_data.get(shift_id)
    if not shift:
        return False
    # Only advance from a pre-completion state; never touch a locked shift.
    if shift.get("status") not in ("active", "auto-closed"):
        return False

    handovers = load_station_json(station_id, HANDOVERS_FILE, default={})
    shift_handovers = [h for h in handovers.values() if h.get("shift_id") == shift_id]
    if not shift_handovers:
        return False
    # Any handover not yet approved (e.g. returned and being redone) blocks completion.
    if any(h.get("review_status") != "approved" for h in shift_handovers):
        return False

    # Every assigned attendant must have an approved handover. Approving one
    # attendant never completes the shift while a co-attendant is still working.
    assigned_ids = {a.get("attendant_id") for a in shift.get("assignments", [])
                    if a.get("attendant_id")}
    if assigned_ids:
        approved_ids = {h.get("attendant_id") for h in shift_handovers
                        if h.get("review_status") == "approved"}
        if not assigned_ids.issubset(approved_ids):
            return False
    # (Shift with no recorded assignments → fall back to "all handovers approved".)

    shift["status"] = "completed"
    shift["completed_at"] = datetime.now().isoformat()
    save_station_storage(station_id)
    try:
        log_audit_event(
            station_id=station_id,
            action="shift_completed",
            performed_by=performed_by,
            entity_type="shift",
            entity_id=shift_id,
            details={"trigger": "all_attendants_approved",
                     "handover_count": len(shift_handovers),
                     "assigned_attendants": len(assigned_ids)},
        )
    except Exception:
        pass  # Never let audit logging block the transition
    return True


def reconcile_shifts_for_date(shift_ids, station_id: str, storage: dict,
                              performed_by: str = "") -> list:
    """
    Mark the given shifts 'reconciled' (called at Daily Close-Off, after
    banking). Only advances shifts currently in an editable state; never
    downgrades an already-locked shift. Returns the shift_ids actually changed.
    """
    shifts_data = storage.get("shifts", {})
    now = datetime.now().isoformat()
    changed = []
    for sid in set(shift_ids):
        shift = shifts_data.get(sid)
        if not shift:
            continue
        if shift.get("status") in EDITABLE_STATUSES:
            shift["status"] = "reconciled"
            shift["reconciled_at"] = now
            changed.append(sid)
    if changed:
        save_station_storage(station_id)
        try:
            log_audit_event(
                station_id=station_id,
                action="shift_reconciled",
                performed_by=performed_by,
                entity_type="shift",
                entity_id=",".join(changed),
                details={"reconciled_shift_ids": changed, "trigger": "daily_close_off"},
            )
        except Exception:
            pass  # Never let audit logging block the close-off
    return changed
