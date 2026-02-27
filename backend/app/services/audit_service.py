"""
Audit Trail Service
Appends audit events to a per-station audit_log.json file.
All calls are wrapped so a logging failure never blocks the main operation.
"""
import json
import os
from datetime import datetime
from typing import Optional, List
from ..database.station_files import get_station_file


def log_audit_event(
    station_id: str,
    action: str,
    performed_by: str,
    entity_type: str,
    entity_id: str = "",
    details: Optional[dict] = None,
    notes: Optional[str] = None,
):
    """
    Append an audit entry to storage/stations/{station_id}/audit_log.json.

    Args:
        station_id:   e.g. "ST001"
        action:       e.g. "price_change", "user_create", "shift_create"
        performed_by: username or user_id of the actor
        entity_type:  e.g. "fuel_settings", "user", "shift"
        entity_id:    identifier of the affected entity
        details:      dict with old/new values or other context
        notes:        free-text note
    """
    try:
        filepath = get_station_file(station_id, "audit_log.json")
        entries: List[dict] = []
        if os.path.exists(filepath):
            with open(filepath, "r") as f:
                entries = json.load(f)

        entry = {
            "timestamp": datetime.now().isoformat(),
            "action": action,
            "performed_by": performed_by,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "details": details,
            "notes": notes,
        }
        entries.append(entry)

        with open(filepath, "w") as f:
            json.dump(entries, f, indent=2)
    except Exception as exc:
        # Never let audit logging break the main operation
        print(f"[audit] WARNING: failed to write audit log: {exc}")


def get_audit_log(
    station_id: str,
    action: Optional[str] = None,
    entity_type: Optional[str] = None,
    performed_by: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    limit: int = 200,
) -> List[dict]:
    """
    Retrieve filtered audit log entries (newest first).

    All filter parameters are optional.  Dates are compared as ISO-string
    prefixes against the timestamp field (YYYY-MM-DD).
    """
    filepath = get_station_file(station_id, "audit_log.json")
    if not os.path.exists(filepath):
        return []

    with open(filepath, "r") as f:
        entries: List[dict] = json.load(f)

    # Apply filters
    if action:
        entries = [e for e in entries if e.get("action") == action]
    if entity_type:
        entries = [e for e in entries if e.get("entity_type") == entity_type]
    if performed_by:
        entries = [e for e in entries if e.get("performed_by") == performed_by]
    if start_date:
        entries = [e for e in entries if e.get("timestamp", "") >= start_date]
    if end_date:
        # Include the full end day
        end_prefix = end_date + "T23:59:59"
        entries = [e for e in entries if e.get("timestamp", "") <= end_prefix]

    # Newest first
    entries.sort(key=lambda e: e.get("timestamp", ""), reverse=True)

    return entries[:limit]
