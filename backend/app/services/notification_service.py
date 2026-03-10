"""
Notification Service
Stores notifications to a per-station notifications.json file.
All calls are wrapped so a notification failure never blocks the main operation.
"""
import json
import os
import uuid
from datetime import datetime, timedelta
from typing import Optional, List
from ..database.station_files import load_station_json, save_station_json


def _load_notifications(station_id: str) -> List[dict]:
    """Load notifications from station-specific storage."""
    return load_station_json(station_id, "notifications.json", default=[])


def _save_notifications(station_id: str, data: List[dict]):
    """Save notifications to station-specific storage."""
    save_station_json(station_id, "notifications.json", data)


def create_notification(
    station_id: str,
    type: str,
    severity: str,
    title: str,
    message: str,
    entity_type: str,
    entity_id: str = "",
    created_by: str = "system",
):
    """
    Create a notification with 24-hour deduplication.

    Skips if the same type+entity_id combination exists within the last 24 hours.
    Wrapped in try/except so failures never block callers.
    """
    try:
        notifications = _load_notifications(station_id)
        now = datetime.now()
        cutoff = (now - timedelta(hours=24)).isoformat()

        # 24-hour deduplication: skip if same type+entity_id exists within 24h
        for n in notifications:
            if (
                n.get("type") == type
                and n.get("entity_id") == entity_id
                and n.get("timestamp", "") >= cutoff
            ):
                return None

        notification = {
            "id": f"NOTIF-{uuid.uuid4().hex[:8]}",
            "timestamp": now.isoformat(),
            "type": type,
            "severity": severity,
            "title": title,
            "message": message,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "read": False,
            "read_at": None,
            "created_by": created_by,
        }

        notifications.append(notification)
        _save_notifications(station_id, notifications)

        # Send email notification (never blocks — email_service handles errors)
        from .email_service import send_notification_email
        send_notification_email(station_id, notification)

        return notification
    except Exception as exc:
        print(f"[notification] WARNING: failed to create notification: {exc}")
        return None


def get_notifications(
    station_id: str,
    severity: Optional[str] = None,
    type: Optional[str] = None,
    read: Optional[bool] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    limit: int = 100,
) -> List[dict]:
    """
    Retrieve filtered notifications (newest first).
    """
    notifications = _load_notifications(station_id)

    if severity:
        notifications = [n for n in notifications if n.get("severity") == severity]
    if type:
        notifications = [n for n in notifications if n.get("type") == type]
    if read is not None:
        notifications = [n for n in notifications if n.get("read") == read]
    if start_date:
        notifications = [n for n in notifications if n.get("timestamp", "") >= start_date]
    if end_date:
        end_prefix = end_date + "T23:59:59"
        notifications = [n for n in notifications if n.get("timestamp", "") <= end_prefix]

    # Newest first
    notifications.sort(key=lambda n: n.get("timestamp", ""), reverse=True)

    return notifications[:limit]


def get_unread_count(station_id: str) -> int:
    """Return the count of unread notifications."""
    notifications = _load_notifications(station_id)
    return sum(1 for n in notifications if not n.get("read"))


def mark_as_read(station_id: str, notification_id: str) -> Optional[dict]:
    """Mark a single notification as read. Returns the updated notification or None."""
    notifications = _load_notifications(station_id)
    for n in notifications:
        if n.get("id") == notification_id:
            n["read"] = True
            n["read_at"] = datetime.now().isoformat()
            _save_notifications(station_id, notifications)
            return n
    return None


def mark_all_as_read(station_id: str) -> int:
    """Mark all unread notifications as read. Returns the count of newly marked."""
    notifications = _load_notifications(station_id)
    now = datetime.now().isoformat()
    count = 0
    for n in notifications:
        if not n.get("read"):
            n["read"] = True
            n["read_at"] = now
            count += 1
    if count > 0:
        _save_notifications(station_id, notifications)
    return count
