"""
Audit Log API — read-only access to the audit trail (supervisor/owner)
"""
from fastapi import APIRouter, Depends
from typing import Optional
from .auth import require_supervisor_or_owner, get_station_context
from ...services.audit_service import get_audit_log

router = APIRouter()


@router.get("/", dependencies=[Depends(require_supervisor_or_owner)])
def list_audit_entries(
    action: Optional[str] = None,
    entity_type: Optional[str] = None,
    performed_by: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    limit: int = 200,
    ctx: dict = Depends(get_station_context),
):
    """
    Retrieve filtered audit log entries (newest first).
    Requires supervisor or owner role.
    """
    return get_audit_log(
        station_id=ctx["station_id"],
        action=action,
        entity_type=entity_type,
        performed_by=performed_by,
        start_date=start_date,
        end_date=end_date,
        limit=limit,
    )
