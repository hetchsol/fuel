"""
Manager tools: the to-do list and requests for owner approval.

Persistence is in memory so these tests never touch the station files on disk.
"""
import asyncio

import pytest
from fastapi import HTTPException

from app.api.v1 import manager_tools as mt
from app.api.v1 import attendant_handover as ah
from app.api.v1 import accounts as acc
from app.services import stock_service as svc

ST = "ST_TEST_MGR"


@pytest.fixture
def mem(monkeypatch):
    files: dict = {}

    def load(station_id, name, default=None):
        import copy
        return copy.deepcopy(files.get((station_id, name), default))

    def save(station_id, name, data):
        import copy
        files[(station_id, name)] = copy.deepcopy(data)

    for mod in (mt, ah, svc):
        monkeypatch.setattr(mod, "load_station_json", load)
        monkeypatch.setattr(mod, "save_station_json", save)
    monkeypatch.setattr(mt, "log_audit_event", lambda **k: None)
    monkeypatch.setattr(mt, "create_notification", lambda **k: None)
    monkeypatch.setattr(acc, "log_audit_event", lambda **k: None)
    monkeypatch.setattr(acc, "save_station_storage", lambda station_id: None)
    return files


def _ctx(role="manager", username="mgr", storage=None):
    return {"station_id": ST, "role": role, "username": username, "full_name": username.title(),
            "user_id": f"U-{username}", "storage": storage if storage is not None else {}}


def _handover(hid, **kw):
    h = {"handover_id": hid, "shift_id": "SH1", "attendant_id": "A1", "attendant_name": "Ann",
         "date": "2026-10-08", "shift_type": "Day", "phase": "completed", "review_status": "submitted",
         "created_at": "2026-10-08T18:00:00"}
    h.update(kw)
    return h


# ── to-do ───────────────────────────────────────────────────────────

def test_todo_lists_pending_handovers_counts_banking_and_empties(mem):
    mem[(ST, "attendant_handovers.json")] = {
        "H1": _handover("H1", stock_snapshot={"lpg_cylinders": [{"size_kg": 9, "empty_variance": 2}]}),
        "H2": _handover("H2", attendant_id="A2", attendant_name="Ben", review_status="approved"),
        "H3": _handover("H3", attendant_id="A3", review_status="voided"),
    }
    mem[(ST, "opening_stock_variances.json")] = {
        "OSV-1": {"variance_id": "OSV-1", "label": "9kg full", "system_qty": 8, "counted_qty": 7,
                  "attendant_name": "Ann", "date": "2026-10-08", "shift_type": "Day", "status": "pending"},
        "OSV-2": {"variance_id": "OSV-2", "status": "resolved"},
    }
    out = mt.todo_data(ST, {"shifts": {}}, days=7, today="2026-10-09")
    s = {x["key"]: x for x in out["sections"]}
    assert s["approve"]["count"] == 1 and s["approve"]["items"][0]["ref"] == "H1"
    assert s["counts"]["count"] == 1 and "system 8" in s["counts"]["items"][0]["label"]
    assert s["banking"]["count"] == 1 and s["banking"]["items"][0]["detail"] == "Day not closed off"
    assert s["lpg_empties"]["count"] == 1 and "9kg +2" in s["lpg_empties"]["items"][0]["detail"]


def test_todo_banking_clears_once_deposit_recorded(mem):
    mem[(ST, "attendant_handovers.json")] = {"H1": _handover("H1", review_status="approved")}
    mem[(ST, "daily_close_offs.json")] = {"2026-10-08": {"bank_deposit": {"amount": 5000}}}
    out = mt.todo_data(ST, {"shifts": {}}, days=7, today="2026-10-09")
    assert out["total"] == 0


# ── requests ────────────────────────────────────────────────────────

def _accounts():
    return {"accounts": {"AC1": {"account_id": "AC1", "account_name": "Haulage Ltd", "approved_overdraft": 0.0}}}


def test_overdraft_request_runs_only_on_owner_approval(mem):
    storage = _accounts()
    req = mt.create_request(mt.RequestInput(type="overdraft", reason="Fleet top-up late", account_id="AC1",
                                            amount=2500), ctx=_ctx(storage=storage))
    assert req["status"] == "pending"
    assert storage["accounts"]["AC1"]["approved_overdraft"] == 0.0

    out = asyncio.run(mt.approve_request(req["request_id"], mt.DecisionInput(), ctx=_ctx("owner", "own", storage)))
    assert out["request"]["status"] == "approved"
    assert storage["accounts"]["AC1"]["approved_overdraft"] == 2500.0


def test_duplicate_pending_request_refused(mem):
    storage = _accounts()
    data = mt.RequestInput(type="overdraft", reason="x", account_id="AC1", amount=100)
    mt.create_request(data, ctx=_ctx(storage=storage))
    with pytest.raises(HTTPException) as e:
        mt.create_request(data, ctx=_ctx(storage=storage))
    assert e.value.status_code == 409


def test_reason_required(mem):
    with pytest.raises(HTTPException):
        mt.create_request(mt.RequestInput(type="overdraft", reason=" ", account_id="AC1", amount=1),
                          ctx=_ctx(storage=_accounts()))


def test_void_request_calls_owner_void_with_requester_in_note(mem, monkeypatch):
    mem[(ST, "attendant_handovers.json")] = {"H1": _handover("H1")}
    calls = []

    async def fake_void(data, ctx):
        calls.append((data, ctx["username"]))
        return {"status": "success"}

    monkeypatch.setattr(ah, "void_handover", fake_void)
    req = mt.create_request(mt.RequestInput(type="void_handover", reason="Duplicate submission",
                                            shift_id="SH1", attendant_id="A1", handover_id="H1"), ctx=_ctx())
    assert "Ann" in req["summary"]
    asyncio.run(mt.approve_request(req["request_id"], mt.DecisionInput(), ctx=_ctx("owner", "own")))
    data, who = calls[0]
    assert who == "own" and data.handover_id == "H1"
    assert "requested by Mgr" in data.note


def test_failed_action_leaves_request_pending(mem, monkeypatch):
    mem[(ST, "attendant_handovers.json")] = {"H1": _handover("H1")}

    async def closed_day(data, ctx):
        raise HTTPException(status_code=400, detail="Day closed off")

    monkeypatch.setattr(ah, "void_handover", closed_day)
    req = mt.create_request(mt.RequestInput(type="void_handover", reason="dup", shift_id="SH1",
                                            attendant_id="A1"), ctx=_ctx())
    with pytest.raises(HTTPException):
        asyncio.run(mt.approve_request(req["request_id"], mt.DecisionInput(), ctx=_ctx("owner", "own")))
    assert mt.load_requests(ST)[req["request_id"]]["status"] == "pending"


def test_decline_needs_note_and_cancel_only_by_requester(mem):
    storage = _accounts()
    req = mt.create_request(mt.RequestInput(type="overdraft", reason="x", account_id="AC1", amount=1),
                            ctx=_ctx(storage=storage))
    with pytest.raises(HTTPException):
        mt.decline_request(req["request_id"], mt.DecisionInput(note=""), ctx=_ctx("owner", "own"))
    with pytest.raises(HTTPException) as e:
        mt.cancel_request(req["request_id"], ctx=_ctx(username="other"))
    assert e.value.status_code == 403
    out = mt.decline_request(req["request_id"], mt.DecisionInput(note="Not this month"), ctx=_ctx("owner", "own"))
    assert out["status"] == "declined"
    assert storage["accounts"]["AC1"]["approved_overdraft"] == 0.0
