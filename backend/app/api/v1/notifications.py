"""
Notifications API
All endpoints restricted to supervisor/owner roles.
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional
from .auth import get_station_context, require_supervisor_or_owner
from ...services.notification_service import (
    get_notifications,
    get_unread_count,
    mark_as_read,
    mark_all_as_read,
)

router = APIRouter()


@router.get("/")
def list_notifications(
    severity: Optional[str] = None,
    type: Optional[str] = None,
    read: Optional[bool] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    limit: int = Query(default=100, le=500),
    ctx: dict = Depends(get_station_context),
    _user: dict = Depends(require_supervisor_or_owner),
):
    """List notifications with optional filters."""
    return get_notifications(
        station_id=ctx["station_id"],
        severity=severity,
        type=type,
        read=read,
        start_date=start_date,
        end_date=end_date,
        limit=limit,
    )


@router.get("/unread-count")
def unread_count(
    ctx: dict = Depends(get_station_context),
    _user: dict = Depends(require_supervisor_or_owner),
):
    """Return the number of unread notifications (polled by bell icon)."""
    return {"count": get_unread_count(ctx["station_id"])}


@router.patch("/{notification_id}/read")
def mark_notification_read(
    notification_id: str,
    ctx: dict = Depends(get_station_context),
    _user: dict = Depends(require_supervisor_or_owner),
):
    """Mark a single notification as read."""
    result = mark_as_read(ctx["station_id"], notification_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Notification not found")
    return result


@router.patch("/mark-all-read")
def mark_all_notifications_read(
    ctx: dict = Depends(get_station_context),
    _user: dict = Depends(require_supervisor_or_owner),
):
    """Mark all unread notifications as read."""
    count = mark_all_as_read(ctx["station_id"])
    return {"count": count}
