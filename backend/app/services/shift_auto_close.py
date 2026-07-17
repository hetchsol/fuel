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

        # Staleness timeout bypasses the normal close flow entirely, so it
        # can't be gated on dips the way submit_closing/complete_shift are —
        # flag it instead so a manager has to explicitly clear the gap
        # rather than the shift silently sitting there as "final".
        missing_tanks = _missing_dip_tanks(station_id, shift, storage)
        if missing_tanks:
            shift["dip_review_required"] = True
            shift["dip_review_missing_tanks"] = missing_tanks
        else:
            shift.pop("dip_review_required", None)
            shift.pop("dip_review_missing_tanks", None)

        print(f"[auto-close] {station_id}/{shift_id}: active for {age}, auto-closed"
              f"{' (missing dips: ' + ', '.join(missing_tanks) + ')' if missing_tanks else ''}")

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
                shift = shifts_data[sid]
                if shift.get("dip_review_required"):
                    create_notification(
                        station_id=station_id,
                        type="SHIFT_AUTO_CLOSED_MISSING_DIPS",
                        severity="critical",
                        title="Auto-Closed Shift Missing Tank Dips",
                        message=(
                            f"Shift {sid} was auto-closed without complete tank dips for "
                            f"{', '.join(shift.get('dip_review_missing_tanks', []))}. "
                            f"Record the dips before this shift can be reconciled."
                        ),
                        entity_type="shift",
                        entity_id=sid,
                    )
                else:
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


def _missing_dip_tanks(station_id: str, shift: dict, storage: dict) -> list:
    """Human-readable labels for tanks missing a complete dip on the shift's date."""
    shift_date = shift.get("date", "")
    if not shift_date:
        return []
    from ..api.v1.attendant_handover import _missing_tank_dips
    missing_ids = _missing_tank_dips(station_id, shift_date, storage)
    tanks_data = storage.get("tanks", {})
    return [
        tanks_data.get(t, {}).get("fuel_type") or tanks_data.get(t, {}).get("name") or t
        for t in missing_ids
    ]


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
