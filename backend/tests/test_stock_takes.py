"""
Phase B — stock-take sessions on top of the Stores `adjust` primitive.

Verifies the create → update → submit → approve lifecycle, that submission
emits real adjust movements (bins really shift), and the manager/owner gating.
"""
import pytest

from app.services import stock_service as svc


# ── service-level (no API, no auth) ──────────────────────────────

@pytest.fixture
def mem(monkeypatch):
    state = {"items": {}, "moves": [], "takes": {}}
    monkeypatch.setattr(svc, "load_items", lambda sid: state["items"])
    monkeypatch.setattr(svc, "save_items", lambda sid, items: state.update(items=items))
    monkeypatch.setattr(svc, "load_movements", lambda sid: state["moves"])
    monkeypatch.setattr(svc, "load_takes", lambda sid: state["takes"])
    monkeypatch.setattr(svc, "save_takes", lambda sid, ts: state.update(takes=ts))
    # _record_movement and adjust call save_station_json directly.
    def _save(sid, fn, data):
        if fn == svc.MOVEMENTS_FILE: state["moves"] = data
        elif fn == svc.TAKES_FILE: state["takes"] = data
        elif fn == svc.ITEMS_FILE: state["items"] = data
    monkeypatch.setattr(svc, "save_station_json", _save)
    monkeypatch.setattr(svc, "log_audit_event", lambda **k: None)
    monkeypatch.setattr(svc, "create_notification", lambda **k: None)
    # Seed two items with known balances.
    svc.upsert_item("ST", "lubricant", "LUB-1", "Oil 1L")
    svc.upsert_item("ST", "accessory", "ACC-1", "Wiper")
    svc.receive("ST", "lubricant:LUB-1", 20, "owner1")
    svc.receive("ST", "accessory:ACC-1", 5, "owner1")
    return state


def test_create_take_snapshots_baselines(mem):
    take = svc.create_stock_take("ST", bin="stores", performed_by="mgr")
    assert take["status"] == "draft"
    by_key = {ln["item_key"]: ln for ln in take["lines"]}
    assert by_key["lubricant:LUB-1"]["system_qty_at_open"] == 20
    assert by_key["accessory:ACC-1"]["system_qty_at_open"] == 5


def test_update_lines_and_variance(mem):
    take = svc.create_stock_take("ST", bin="stores", performed_by="mgr")
    take = svc.upsert_stock_take_lines("ST", take["take_id"], [
        {"item_key": "lubricant:LUB-1", "counted_qty": 18, "note": "short by 2"},
        {"item_key": "accessory:ACC-1", "counted_qty": 5},
    ])
    by_key = {ln["item_key"]: ln for ln in take["lines"]}
    assert by_key["lubricant:LUB-1"]["counted_qty"] == 18
    assert by_key["lubricant:LUB-1"]["variance"] == -2
    assert by_key["accessory:ACC-1"]["variance"] == 0


def test_submit_applies_adjust_to_bin(mem):
    take = svc.create_stock_take("ST", bin="stores", performed_by="mgr")
    svc.upsert_stock_take_lines("ST", take["take_id"], [
        {"item_key": "lubricant:LUB-1", "counted_qty": 18, "note": "short"},
    ])
    take = svc.submit_stock_take("ST", take["take_id"], performed_by="mgr")
    assert take["status"] == "submitted"
    # Bin reflects the counted value.
    assert svc.load_items("ST")["lubricant:LUB-1"]["stores"] == 18
    # An adjust movement was recorded with the stock-take id in its reason.
    moves = svc.load_movements("ST")
    last_adjust = [m for m in moves if m["type"] == "adjust"][-1]
    assert last_adjust["item_key"] == "lubricant:LUB-1"
    assert take["take_id"] in last_adjust.get("note", "")


def test_lines_with_no_count_are_skipped(mem):
    take = svc.create_stock_take("ST", bin="stores", performed_by="mgr")
    # Count only ONE item.
    svc.upsert_stock_take_lines("ST", take["take_id"], [
        {"item_key": "lubricant:LUB-1", "counted_qty": 25, "note": "found extra"},
    ])
    svc.submit_stock_take("ST", take["take_id"], performed_by="mgr")
    # Counted item adjusted.
    assert svc.load_items("ST")["lubricant:LUB-1"]["stores"] == 25
    # Uncounted item untouched.
    assert svc.load_items("ST")["accessory:ACC-1"]["stores"] == 5


def test_approve_only_after_submit(mem):
    take = svc.create_stock_take("ST", bin="stores", performed_by="mgr")
    # Cannot approve a draft.
    from fastapi import HTTPException
    with pytest.raises(HTTPException):
        svc.approve_stock_take("ST", take["take_id"], "owner1")
    svc.submit_stock_take("ST", take["take_id"], "mgr")
    take = svc.approve_stock_take("ST", take["take_id"], "owner1")
    assert take["status"] == "approved"
    assert take["approved_by"] == "owner1"


# ── API gating ────────────────────────────────────────────────────

def test_list_takes_forbidden_for_attendant(client, staff_headers):
    if staff_headers is None:
        pytest.skip("attendant account unavailable")
    res = client.get("/api/v1/stores/stock-takes", headers=staff_headers)
    assert res.status_code == 403


def test_approve_requires_owner_not_manager(client, owner_headers, create_staff):
    # Owner creates a manager and uses their credentials.
    create_staff("mgr_phaseb", "Phase B Mgr", "manager")
    login = client.post("/api/v1/auth/login",
                        json={"username": "mgr_phaseb", "password": "test1234"})
    if login.status_code != 200:
        pytest.skip("could not provision manager")
    mgr_headers = {"Authorization": f"Bearer {login.json()['access_token']}",
                   "X-Station-Id": "ST001", "Content-Type": "application/json"}

    # Manager creates and submits a take (needs a catalog item).
    client.post("/api/v1/stores/items", headers=owner_headers, json={
        "category": "accessory", "product_code": "ACC-B", "name": "Phase B item",
    })
    res = client.post("/api/v1/stores/stock-takes", headers=mgr_headers,
                      json={"bin": "stores"})
    assert res.status_code == 200, res.text
    take_id = res.json()["take_id"]
    client.post(f"/api/v1/stores/stock-takes/{take_id}/submit", headers=mgr_headers)

    # Manager cannot approve.
    res = client.post(f"/api/v1/stores/stock-takes/{take_id}/approve",
                      headers=mgr_headers)
    assert res.status_code == 403
    # Owner can.
    res = client.post(f"/api/v1/stores/stock-takes/{take_id}/approve",
                      headers=owner_headers)
    assert res.status_code == 200
