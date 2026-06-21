"""
Daily Close-Off API
Allows the station owner to review, reconcile, and formally close each day.
Locking prevents further edits to handovers for that date.
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional
from datetime import datetime
from pydantic import BaseModel

from .auth import get_station_context, require_manager_or_owner
from ...database.station_files import load_station_json, save_station_json
from ...services.audit_service import log_audit_event
from ...services.notification_service import create_notification
from ...services.shift_status import reconcile_shifts_for_date

router = APIRouter()

CLOSE_OFF_FILE = "daily_close_offs.json"
HANDOVERS_FILE = "attendant_handovers.json"


def _load_close_offs(station_id: str) -> dict:
    return load_station_json(station_id, CLOSE_OFF_FILE, default={})


def _save_close_offs(station_id: str, data: dict):
    save_station_json(station_id, CLOSE_OFF_FILE, data)


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
    unapproved = [h for h in date_handovers if h.get("review_status") != "approved"]

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
    Owner only. All handovers for the date must be approved.
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

    # Load handovers for the date
    all_handovers = _load_handovers(station_id)
    date_handovers = {
        hid: h for hid, h in all_handovers.items()
        if h.get("date") == data.date
    }

    if not date_handovers:
        raise HTTPException(status_code=400, detail=f"No handovers found for {data.date}.")

    # Verify all are approved
    unapproved = [
        h.get("handover_id", hid)
        for hid, h in date_handovers.items()
        if h.get("review_status") != "approved"
    ]
    if unapproved:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot close day. {len(unapproved)} handover(s) not yet approved: {', '.join(unapproved[:5])}"
        )

    approved_list = list(date_handovers.values())
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
