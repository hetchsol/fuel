"""
Manager tools: the daily to-do list and requests for owner approval.

To-do: one list of what is waiting on the manager at this station - handovers
to approve, shift-start count differences, card machine checks, missing tank
dips, days not closed off or banked, and LPG empties differences. Read-only:
each item links to the page where the work is done.

Requests: a manager asks the owner to carry out an owner-only action (void an
attendant's entry, approve an overdraft). The owner approves, which runs the
action as the owner through the same code the owner's own button uses, or
declines with a reason. Nothing changes until the owner approves.
"""
import uuid
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from .auth import get_station_context, require_manager_or_owner, require_owner
from ...database.station_files import load_station_json, save_station_json
from ...services.audit_service import log_audit_event
from ...services.handover_lookup import is_handover_canonical
from ...services.notification_service import create_notification
from ...services import stock_service as stock

router = APIRouter()

REQUESTS_FILE = "approval_requests.json"
REQUEST_TYPES = ("void_handover", "overdraft")


def _role(ctx: dict) -> str:
    r = ctx.get("role")
    return r.value if hasattr(r, "value") else str(r)


# ── to-do list ──────────────────────────────────────────────────────

def _section(key: str, title: str, link: str, items: list, severity: str = "warning") -> dict:
    return {"key": key, "title": title, "link": link, "count": len(items), "severity": severity, "items": items}


def todo_data(station_id: str, storage: dict, days: int = 7, today: Optional[str] = None) -> dict:
    from .attendant_handover import _load_handovers, _shift_pos_check, _missing_tank_dips

    today = today or datetime.now().strftime("%Y-%m-%d")
    since = (datetime.strptime(today, "%Y-%m-%d") - timedelta(days=days)).strftime("%Y-%m-%d")
    handovers = [h for h in _load_handovers(station_id).values() if is_handover_canonical(h)]
    shifts = [s for s in (storage.get("shifts") or {}).values()
              if since <= (s.get("date") or "") <= today and not s.get("is_retrospective")]
    shifts.sort(key=lambda s: (s.get("date", ""), s.get("shift_type", "")), reverse=True)

    def _who(h):
        return f"{h.get('attendant_name') or h.get('attendant_id')}, {h.get('date')} {h.get('shift_type', '')}".strip()

    # 1. Handovers waiting for approval (same rule as the review page's pending list)
    pending = [h for h in handovers
               if h.get("review_status", "submitted") in ("submitted", "flagged", "returned")
               and h.get("phase", "completed") == "completed"]
    pending.sort(key=lambda h: h.get("created_at", ""))
    approve = [{"label": _who(h), "detail": {"flagged": "Flagged", "returned": "Returned, waiting for the attendant"}
                .get(h.get("review_status"), "Submitted"), "ref": h.get("handover_id")} for h in pending]

    # 2. Shift-start count differences not yet resolved
    variances = [v for v in stock.load_opening_variances(station_id).values() if v.get("status") == "pending"]
    variances.sort(key=lambda v: v.get("created_at", ""))
    counts = [{"label": f"{v.get('label') or v.get('item_key')}: system {v.get('system_qty', 0):g}, "
                        f"counted {v.get('counted_qty', 0):g}",
               "detail": f"{v.get('attendant_name', '')}, {v.get('date', '')} {v.get('shift_type', '')}".strip(),
               "ref": v.get("variance_id")} for v in variances]

    # 3. Card machine totals not entered, or not matching the slips
    machine = []
    for s in shifts:
        try:
            chk = _shift_pos_check(station_id, storage, s["shift_id"])
        except Exception:
            continue
        if chk["status"] == "mismatch":
            machine.append({"label": f"{s.get('date')} {s.get('shift_type', '')}",
                            "detail": f"Machine and slips differ by K{chk['difference']:,.2f}", "ref": s["shift_id"]})
        elif chk["status"] == "not_entered" and chk["slips_total"] > 0 and chk["all_closed"]:
            machine.append({"label": f"{s.get('date')} {s.get('shift_type', '')}",
                            "detail": f"Machine total not entered (slips K{chk['slips_total']:,.2f})", "ref": s["shift_id"]})

    # 4. Tank dips missing on shifts that have ended
    dips = []
    for s in shifts:
        if s.get("status") == "active":
            continue
        try:
            missing = _missing_tank_dips(station_id, s.get("date", ""), s.get("shift_type", ""), storage)
        except Exception:
            continue
        if missing:
            names = [(storage.get("tanks", {}).get(t) or {}).get("name") or t for t in missing]
            dips.append({"label": f"{s.get('date')} {s.get('shift_type', '')}",
                         "detail": "Missing: " + ", ".join(names), "ref": s["shift_id"]})

    # 5. Days with closed shifts not closed off, or closed off without a bank deposit
    close_offs = load_station_json(station_id, "daily_close_offs.json", default={}) or {}
    days_with_cash = sorted({h.get("date") for h in handovers
                             if h.get("phase") == "completed" and h.get("review_status") != "voided"
                             and since <= (h.get("date") or "") < today}, reverse=True)
    banking = []
    for d in days_with_cash:
        rec = close_offs.get(d)
        if not rec:
            banking.append({"label": d, "detail": "Day not closed off", "ref": d})
        elif not (rec.get("bank_deposit") or {}).get("amount"):
            banking.append({"label": d, "detail": "Closed off, bank deposit not recorded", "ref": d})

    # 6. LPG empties differences on handovers still waiting for approval
    empties = []
    for h in pending:
        diffs = [f"{r.get('size_kg')}kg {r.get('empty_variance'):+g}"
                 for r in ((h.get("stock_snapshot") or {}).get("lpg_cylinders") or [])
                 if r.get("empty_variance")]
        if diffs:
            empties.append({"label": _who(h), "detail": "Empties expected minus counted: " + ", ".join(diffs),
                            "ref": h.get("handover_id")})

    sections = [
        _section("approve", "Handovers to approve", "/handover-review", approve),
        _section("counts", "Shift-start count differences", "/stores", counts),
        _section("card_machine", "Card machine checks", "/handover-review", machine, "error"),
        _section("dips", "Tank dips missing", "/tank-dips", dips, "error"),
        _section("banking", "Days not closed off or banked", "/daily-close-off", banking, "error"),
        _section("lpg_empties", "LPG empties differences", "/handover-review", empties),
    ]
    return {"today": today, "since": since, "days": days,
            "total": sum(s["count"] for s in sections), "sections": sections}


@router.get("/todo", dependencies=[Depends(require_manager_or_owner)])
def manager_todo(days: int = Query(7, ge=1, le=31), ctx: dict = Depends(get_station_context)):
    return todo_data(ctx["station_id"], ctx["storage"], days)


# ── requests for owner approval ─────────────────────────────────────

class RequestInput(BaseModel):
    type: str
    reason: str
    # void_handover
    shift_id: Optional[str] = None
    attendant_id: Optional[str] = None
    attendant_name: Optional[str] = None
    handover_id: Optional[str] = None
    # overdraft
    account_id: Optional[str] = None
    amount: Optional[float] = None


class DecisionInput(BaseModel):
    note: Optional[str] = None


def load_requests(station_id: str) -> dict:
    return load_station_json(station_id, REQUESTS_FILE, default={}) or {}


def save_requests(station_id: str, data: dict):
    save_station_json(station_id, REQUESTS_FILE, data)


def _describe(station_id: str, storage: dict, data: RequestInput) -> tuple:
    """Validate a new request against the live data. Returns (target_key, summary, payload)."""
    if data.type == "void_handover":
        from .attendant_handover import _load_handovers
        if not data.shift_id or not data.attendant_id:
            raise HTTPException(status_code=400, detail="Pick the attendant's entry to void.")
        live = [h for hid, h in _load_handovers(station_id).items()
                if h.get("shift_id") == data.shift_id and h.get("attendant_id") == data.attendant_id
                and h.get("review_status") != "voided" and (not data.handover_id or hid == data.handover_id)]
        if not live:
            raise HTTPException(status_code=404, detail="No entry to void for this attendant on this shift.")
        h = live[0]
        name = data.attendant_name or h.get("attendant_name") or data.attendant_id
        which = "this entry" if data.handover_id else ("all their entries" if len(live) > 1 else "their entry")
        summary = f"Void {name}'s {which} for {h.get('date')} {h.get('shift_type', '')}".strip()
        payload = {"shift_id": data.shift_id, "attendant_id": data.attendant_id,
                   "attendant_name": name, "handover_id": data.handover_id,
                   "date": h.get("date"), "shift_type": h.get("shift_type")}
        return f"void:{data.shift_id}:{data.attendant_id}:{data.handover_id or '*'}", summary, payload

    if data.type == "overdraft":
        acct = (storage.get("accounts") or {}).get(data.account_id or "")
        if not acct:
            raise HTTPException(status_code=404, detail="Account not found.")
        if data.amount is None or data.amount < 0:
            raise HTTPException(status_code=400, detail="Enter the overdraft amount, 0 or more.")
        amount = round(data.amount, 2)
        current = acct.get("approved_overdraft", 0.0) or 0.0
        summary = (f"Overdraft of K{amount:,.2f} for {acct.get('account_name')}" if amount
                   else f"Clear the overdraft for {acct.get('account_name')}")
        payload = {"account_id": data.account_id, "account_name": acct.get("account_name"),
                   "amount": amount, "current_overdraft": current}
        return f"overdraft:{data.account_id}", summary, payload

    raise HTTPException(status_code=400, detail=f"type must be one of {REQUEST_TYPES}.")


@router.post("/requests", dependencies=[Depends(require_manager_or_owner)])
def create_request(data: RequestInput, ctx: dict = Depends(get_station_context)):
    station_id = ctx["station_id"]
    if not (data.reason or "").strip():
        raise HTTPException(status_code=400, detail="A reason is required.")
    target, summary, payload = _describe(station_id, ctx["storage"], data)
    requests = load_requests(station_id)
    if any(r.get("target") == target and r.get("status") == "pending" for r in requests.values()):
        raise HTTPException(status_code=409, detail="A request for this is already waiting for the owner.")

    rid = f"REQ-{datetime.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:6]}"
    req = {
        "request_id": rid, "type": data.type, "status": "pending", "target": target,
        "summary": summary, "reason": data.reason.strip(), "payload": payload,
        "requested_by": ctx.get("username"), "requested_by_name": ctx.get("full_name") or ctx.get("username"),
        "requested_at": datetime.now().isoformat(),
    }
    requests[rid] = req
    save_requests(station_id, requests)
    log_audit_event(station_id=station_id, action="approval_request_created", performed_by=ctx.get("username", ""),
                    entity_type="approval_request", entity_id=rid,
                    details={"type": data.type, "summary": summary, "reason": req["reason"]})
    create_notification(station_id=station_id, type="APPROVAL_REQUESTED", severity="warning",
                        title="Approval requested",
                        message=f"{req['requested_by_name']} asks: {summary}. Reason: {req['reason']}",
                        entity_type="approval_request", entity_id=rid, created_by=ctx.get("username", "system"))
    return req


@router.get("/requests", dependencies=[Depends(require_manager_or_owner)])
def list_requests(status: Optional[str] = None, limit: int = Query(100, ge=1, le=500),
                  ctx: dict = Depends(get_station_context)):
    rows = list(load_requests(ctx["station_id"]).values())
    if status:
        rows = [r for r in rows if r.get("status") == status]
    rows.sort(key=lambda r: (r.get("status") != "pending", r.get("requested_at", "")), reverse=False)
    pending = [r for r in rows if r.get("status") == "pending"]
    done = sorted((r for r in rows if r.get("status") != "pending"),
                  key=lambda r: r.get("decided_at") or r.get("requested_at", ""), reverse=True)
    return (pending + done)[:limit]


def _decide(station_id: str, rid: str) -> tuple:
    requests = load_requests(station_id)
    req = requests.get(rid)
    if not req:
        raise HTTPException(status_code=404, detail="Request not found.")
    if req.get("status") != "pending":
        raise HTTPException(status_code=400, detail=f"This request is already {req.get('status')}.")
    return requests, req


async def _execute(req: dict, ctx: dict):
    p = req["payload"]
    if req["type"] == "void_handover":
        from .attendant_handover import void_handover, VoidHandoverInput
        note = f"{req['reason']} (requested by {req['requested_by_name']}, {req['request_id']})"
        return await void_handover(VoidHandoverInput(shift_id=p["shift_id"], attendant_id=p["attendant_id"],
                                                     handover_id=p.get("handover_id"), note=note), ctx=ctx)
    if req["type"] == "overdraft":
        from .accounts import approve_overdraft
        return await approve_overdraft(p["account_id"], p["amount"], ctx=ctx)
    raise HTTPException(status_code=400, detail="Unknown request type.")


@router.post("/requests/{rid}/approve", dependencies=[Depends(require_owner)])
async def approve_request(rid: str, data: DecisionInput = DecisionInput(), ctx: dict = Depends(get_station_context)):
    """Runs the requested action as the owner. If the action itself fails (for
    example the day has since been closed off), the request stays pending and
    the reason is returned, so the owner can sort it out and approve again."""
    station_id = ctx["station_id"]
    _, req = _decide(station_id, rid)
    result = await _execute(req, ctx)
    requests, req = _decide(station_id, rid)   # reload: the action may have saved other files
    req.update({"status": "approved", "decided_by": ctx.get("username"),
                "decided_by_name": ctx.get("full_name") or ctx.get("username"),
                "decided_at": datetime.now().isoformat(), "decision_note": (data.note or "").strip() or None})
    save_requests(station_id, requests)
    log_audit_event(station_id=station_id, action="approval_request_approved", performed_by=ctx.get("username", ""),
                    entity_type="approval_request", entity_id=rid,
                    details={"type": req["type"], "summary": req["summary"], "requested_by": req["requested_by"]})
    create_notification(station_id=station_id, type="APPROVAL_DECIDED", severity="info",
                        title="Request approved", message=f"Approved: {req['summary']}",
                        entity_type="approval_request", entity_id=rid, created_by=ctx.get("username", "system"))
    return {"request": req, "result": result}


@router.post("/requests/{rid}/decline", dependencies=[Depends(require_owner)])
def decline_request(rid: str, data: DecisionInput, ctx: dict = Depends(get_station_context)):
    station_id = ctx["station_id"]
    if not (data.note or "").strip():
        raise HTTPException(status_code=400, detail="Say why the request is declined.")
    requests, req = _decide(station_id, rid)
    req.update({"status": "declined", "decided_by": ctx.get("username"),
                "decided_by_name": ctx.get("full_name") or ctx.get("username"),
                "decided_at": datetime.now().isoformat(), "decision_note": data.note.strip()})
    save_requests(station_id, requests)
    log_audit_event(station_id=station_id, action="approval_request_declined", performed_by=ctx.get("username", ""),
                    entity_type="approval_request", entity_id=rid,
                    details={"type": req["type"], "summary": req["summary"], "note": req["decision_note"]})
    create_notification(station_id=station_id, type="APPROVAL_DECIDED", severity="warning",
                        title="Request declined", message=f"Declined: {req['summary']}. {req['decision_note']}",
                        entity_type="approval_request", entity_id=rid, created_by=ctx.get("username", "system"))
    return req


@router.post("/requests/{rid}/cancel", dependencies=[Depends(require_manager_or_owner)])
def cancel_request(rid: str, ctx: dict = Depends(get_station_context)):
    station_id = ctx["station_id"]
    requests, req = _decide(station_id, rid)
    if req.get("requested_by") != ctx.get("username") and _role(ctx) != "owner":
        raise HTTPException(status_code=403, detail="Only the person who asked can withdraw this request.")
    req.update({"status": "withdrawn", "decided_by": ctx.get("username"),
                "decided_by_name": ctx.get("full_name") or ctx.get("username"),
                "decided_at": datetime.now().isoformat()})
    save_requests(station_id, requests)
    log_audit_event(station_id=station_id, action="approval_request_withdrawn", performed_by=ctx.get("username", ""),
                    entity_type="approval_request", entity_id=rid, details={"summary": req["summary"]})
    return req
