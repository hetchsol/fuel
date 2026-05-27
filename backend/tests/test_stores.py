"""
Tests for the Stores/Stock service and API (Phase 1).

Service logic runs against an in-memory store (monkeypatched persistence) so no
real station files are touched. API tests cover the manager/owner gate.
"""
import pytest
from fastapi import HTTPException

from app.services import stock_service as svc


@pytest.fixture
def mem(monkeypatch):
    """In-memory items + movements, wired into the service's persistence layer."""
    state = {"items": {}, "moves": []}
    monkeypatch.setattr(svc, "load_items", lambda sid: state["items"])
    monkeypatch.setattr(svc, "save_items", lambda sid, items: state.update(items=items))
    monkeypatch.setattr(svc, "load_movements", lambda sid: state["moves"])
    monkeypatch.setattr(svc, "save_station_json",
                        lambda sid, fn, data: state.update(moves=data))
    monkeypatch.setattr(svc, "log_audit_event", lambda **k: None)
    monkeypatch.setattr(svc, "create_notification", lambda **k: None)
    # Seed one item to act on.
    svc.upsert_item("ST", "cylinder_full", "9kg", "9kg cylinder (full)",
                    unit="cylinder", reorder_level=5)
    return state


KEY = "cylinder_full:9kg"


def test_receive_then_issue_moves_between_bins(mem):
    svc.receive("ST", KEY, 20, "owner1")
    item = svc.issue("ST", KEY, 8, "owner1")
    assert item["stores"] == 12
    assert item["forecourt"] == 8
    types = [m["type"] for m in mem["moves"]]
    assert types == ["receive", "issue"]


def test_issue_more_than_stores_is_rejected(mem):
    svc.receive("ST", KEY, 3, "owner1")
    with pytest.raises(HTTPException) as e:
        svc.issue("ST", KEY, 5, "owner1")
    assert e.value.status_code == 400
    assert svc.load_items("ST")[KEY]["stores"] == 3  # unchanged


def test_receive_requires_positive_qty(mem):
    for bad in (0, -2):
        with pytest.raises(HTTPException) as e:
            svc.receive("ST", KEY, bad, "owner1")
        assert e.value.status_code == 400


def test_damage_requires_note_and_enough_stock(mem):
    svc.receive("ST", KEY, 4, "owner1")
    with pytest.raises(HTTPException):           # no note
        svc.damage("ST", KEY, 1, "stores", "owner1", "")
    with pytest.raises(HTTPException):           # more than on hand
        svc.damage("ST", KEY, 9, "stores", "owner1", "leak")
    item = svc.damage("ST", KEY, 1, "stores", "owner1", "leaking valve")
    assert item["stores"] == 3


def test_adjust_sets_bin_and_requires_reason(mem):
    with pytest.raises(HTTPException):
        svc.adjust("ST", KEY, "stores", 10, "owner1", "")
    item = svc.adjust("ST", KEY, "stores", 10, "owner1", "physical count")
    assert item["stores"] == 10
    adj = [m for m in mem["moves"] if m["type"] == "adjust"][-1]
    assert adj["qty"] == 10  # delta from 0 -> 10


def test_record_sale_clamps_and_is_lenient(mem):
    svc.receive("ST", KEY, 10, "owner1")
    svc.issue("ST", KEY, 6, "owner1")            # forecourt = 6
    svc.record_sale("ST", KEY, 4, ref="2026-05-27")
    assert svc.load_items("ST")[KEY]["forecourt"] == 2
    svc.record_sale("ST", KEY, 99, ref="2026-05-27")   # clamps at 0
    assert svc.load_items("ST")[KEY]["forecourt"] == 0
    assert svc.record_sale("ST", "nope:nope", 1) is None  # unknown item -> no-op


def test_dashboard_flags_reorder(mem):
    svc.receive("ST", KEY, 4, "owner1")          # reorder_level 5, stores 4 -> needs reorder
    dash = svc.dashboard("ST")
    row = next(r for r in dash["items"] if r["item_key"] == KEY)
    assert row["needs_reorder"] is True
    assert dash["summary"]["reorder_count"] == 1


# ── API gating ──────────────────────────────────────────────────────

def test_apply_handover_sales_decrements_forecourt_and_returns_empties(mem):
    # Catalog: a lubricant, an LPG accessory, and 9kg full/empty cylinders, all
    # stocked at the forecourt.
    for cat, code, name in [
        ("lubricant", "LUB-1", "Engine Oil 1L"),
        ("lpg_accessory", "ACC-1", "Regulator"),
        ("cylinder_full", "9kg", "9kg (full)"),
        ("cylinder_empty", "9kg", "9kg (empty)"),
    ]:
        svc.upsert_item("ST", cat, code, name)
    for key, qty in [("lubricant:LUB-1", 10), ("lpg_accessory:ACC-1", 10),
                     ("cylinder_full:9kg", 10), ("cylinder_empty:9kg", 2)]:
        svc.receive("ST", key, qty, "owner1")
        svc.issue("ST", key, qty, "owner1")  # all to forecourt

    handover = {"handover_id": "HO-1", "stock_snapshot": {
        "lubricants": [{"product_code": "LUB-1", "sold": 3}],
        "accessories": [{"product_code": "ACC-1", "sold": 2}],
        "lpg_cylinders": [{"size_kg": 9, "sold_refill": 4, "sold_with_cylinder": 1}],
    }}
    res = svc.apply_handover_sales("ST", handover, "owner1")
    items = svc.load_items("ST")
    assert items["lubricant:LUB-1"]["forecourt"] == 7          # 10 - 3
    assert items["lpg_accessory:ACC-1"]["forecourt"] == 8      # 10 - 2
    assert items["cylinder_full:9kg"]["forecourt"] == 5        # 10 - (4 refill + 1 with-cyl)
    assert items["cylinder_empty:9kg"]["forecourt"] == 6       # 2 + 4 empties returned by refills
    assert res["applied"] is True
    assert res["sales_applied"] == 3 and res["empty_returns_applied"] == 1
    assert handover["stock_applied"] is True


def test_apply_handover_sales_is_idempotent(mem):
    svc.upsert_item("ST", "lubricant", "LUB-1", "Oil")
    svc.receive("ST", "lubricant:LUB-1", 10, "owner1")
    svc.issue("ST", "lubricant:LUB-1", 10, "owner1")
    handover = {"handover_id": "HO-9", "stock_snapshot": {"lubricants": [{"product_code": "LUB-1", "sold": 4}]}}
    svc.apply_handover_sales("ST", handover, "owner1")
    assert svc.load_items("ST")["lubricant:LUB-1"]["forecourt"] == 6
    # Second call must be a no-op (already applied).
    res = svc.apply_handover_sales("ST", handover, "owner1")
    assert res["applied"] is False
    assert svc.load_items("ST")["lubricant:LUB-1"]["forecourt"] == 6


def test_dashboard_forbidden_for_attendant(client, staff_headers):
    if staff_headers is None:
        pytest.skip("attendant account unavailable")
    res = client.get("/api/v1/stores/dashboard", headers=staff_headers)
    assert res.status_code == 403


def test_dashboard_ok_for_owner(client, owner_headers):
    res = client.get("/api/v1/stores/dashboard", headers=owner_headers)
    assert res.status_code == 200
    body = res.json()
    assert "items" in body and "summary" in body and "reorder_alerts" in body
