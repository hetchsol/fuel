"""
Shift Auto-Close Service
Finds shifts that have been active for more than STALE_HOURS and marks
them as 'auto-closed' with a reason and timestamp.
"""
from datetime import datetime, timedelta

STALE_HOURS = 20


def check_and_close_stale_shifts(storage: dict, station_id: str) -> list:
    """
    Scan all shifts in *storage* for ones that are still 'active' but
    older than STALE_HOURS.  Returns a list of shift_ids that were closed.
    """
    shifts_data = storage.get("shifts", {})
    now = datetime.now()
    closed_ids = []

    for shift_id, shift in shifts_data.items():
        if shift.get("status") != "active":
            continue

        # Determine shift start from date+shift_type (authoritative),
        # fall back to created_at if date is missing.
        shift_start = _estimate_start(shift)
        if shift_start is None:
            created_at = shift.get("created_at")
            if created_at:
                try:
                    shift_start = datetime.fromisoformat(created_at)
                except (ValueError, TypeError):
                    pass

        if shift_start is None:
            continue

        age = now - shift_start
        if age <= timedelta(hours=STALE_HOURS):
            continue

        # Mark as auto-closed
        shift["status"] = "auto-closed"
        shift["auto_closed"] = True
        shift["auto_close_reason"] = (
            f"Shift was active for {age.total_seconds() / 3600:.1f} hours "
            f"(threshold: {STALE_HOURS}h). Auto-closed on server startup."
        )
        shift["auto_closed_at"] = now.isoformat()
        closed_ids.append(shift_id)

        print(f"[auto-close] {station_id}/{shift_id}: active for {age}, auto-closed")

    # Audit logging (graceful if Phase 2 not present)
    if closed_ids:
        try:
            from .audit_service import log_audit_event
            for sid in closed_ids:
                log_audit_event(
                    station_id=station_id,
                    action="shift_auto_close",
                    performed_by="system",
                    entity_type="shift",
                    entity_id=sid,
                    details={"reason": shifts_data[sid].get("auto_close_reason")},
                )
        except Exception:
            pass
        try:
            from .notification_service import create_notification
            for sid in closed_ids:
                create_notification(
                    station_id=station_id,
                    type="SHIFT_AUTO_CLOSED",
                    severity="critical",
                    title="Shift Auto-Closed",
                    message=f"Shift {sid} was active for over {STALE_HOURS} hours and was automatically closed",
                    entity_type="shift",
                    entity_id=sid,
                )
        except Exception:
            pass

    return closed_ids


def _estimate_start(shift: dict):
    """Estimate shift start from date + shift_type when created_at is missing."""
    date_str = shift.get("date")
    if not date_str:
        return None
    try:
        base = datetime.strptime(date_str, "%Y-%m-%d")
    except (ValueError, TypeError):
        return None

    shift_type = shift.get("shift_type", "")
    if shift_type in ("Day", "day"):
        return base.replace(hour=6, minute=0)
    elif shift_type in ("Night", "night"):
        return base.replace(hour=18, minute=0)
    return base.replace(hour=6, minute=0)
