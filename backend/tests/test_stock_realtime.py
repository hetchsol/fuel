"""
Non-fuel stock (lubricants, LPG cylinders, accessories) moves when the
attendant SUBMITS, not when a manager approves — so stock on hand is real time.

Pins:
  - submit-readings applies the snapshot to Stores straight away;
  - a resubmission that supersedes a live prior attempt credits the prior's
    stock back before applying its own (no double count);
  - redo-readings credits it back;
  - approval afterwards is a no-op for stock (idempotent);
  - per-handover Daily Entry baselines add up, and survive manual edits;
  - empty cylinders can be handed back to the supplier, never below zero.
"""
import pytest
from fastapi import HTTPException

import app.api.v1.attendant_handover as ah
from app.services import stock_service as svc
from tests.test_handover_resubmission import _AlwaysEqual, _base_patches, _submit_readings

SNAPSHOT = {"lpg_cylinders": [{"size_kg": 9, "sold_refill": 2, "sold_with_cylinder": 1}],
            "accessories": [], "lubricants": []}


def _track_stock(monkeypatch):
    calls = []

    def fake_apply(station_id, handover, performed_by="system"):
        if handover.get("stock_applied"):
            return {"applied": False}
        calls.append(("apply", handover.get("handover_id")))
        handover["stock_applied"] = True
        return {"applied": True}

    def fake_reverse(station_id, handover, performed_by="system"):
        if not handover.get("stock_applied"):
            return {"reversed": False}
        calls.append(("reverse", handover.get("handover_id")))
        handover["stock_applied"] = False
        return {"reversed": True}

    monkeypatch.setattr(ah, "apply_handover_sales", fake_apply)
    monkeypatch.setattr(ah, "reverse_handover_sales", fake_reverse)
    monkeypatch.setattr(ah, "_mark_daily_entries_stores_applied", lambda *a, **k: None)
    monkeypatch.setattr(ah, "_clear_daily_entries_stores_applied", lambda *a, **k: None)
    monkeypatch.setattr(ah, "_process_stock_snapshot", lambda *a, **k: (0, 0, 0, SNAPSHOT, []))
    return calls


def test_stock_is_applied_at_submission(client, staff_headers, monkeypatch):
    if not staff_headers:
        pytest.skip("attendant seed unavailable")
    saved = {}
    _base_patches(monkeypatch, {}, saved)
    calls = _track_stock(monkeypatch)

    res = _submit_readings(client, staff_headers)
    assert res.status_code == 200, res.text
    new_id = res.json()["handover_id"]
    assert calls == [("apply", new_id)]
    assert saved["data"][new_id]["stock_applied"] is True


def test_resubmission_reverses_the_superseded_attempts_stock_first(client, staff_headers, monkeypatch):
    if not staff_headers:
        pytest.skip("attendant seed unavailable")
    handovers = {
        "HO-PRIOR": {"handover_id": "HO-PRIOR", "shift_id": "SHIFT-TEST-1", "attendant_id": _AlwaysEqual(),
                     "review_status": "returned", "phase": "completed", "created_at": "2026-08-05T08:00:00",
                     "stock_snapshot": SNAPSHOT, "stock_applied": True},
    }
    saved = {}
    _base_patches(monkeypatch, handovers, saved)
    calls = _track_stock(monkeypatch)

    res = _submit_readings(client, staff_headers)
    assert res.status_code == 200, res.text
    new_id = res.json()["handover_id"]
    assert calls == [("reverse", "HO-PRIOR"), ("apply", new_id)]
    assert saved["data"]["HO-PRIOR"]["stock_applied"] is False


def test_redo_readings_credits_stock_back(client, owner_headers, monkeypatch):
    handovers = {
        "HO-1": {"handover_id": "HO-1", "shift_id": "S1", "attendant_id": "X",
                 "review_status": "submitted", "phase": "readings_verified",
                 "stock_snapshot": SNAPSHOT, "stock_applied": True},
    }
    monkeypatch.setattr(ah, "_load_handovers", lambda sid: handovers)
    monkeypatch.setattr(ah, "_save_handovers", lambda data, sid: None)
    monkeypatch.setattr(ah, "log_audit_event", lambda *a, **k: None)
    calls = _track_stock(monkeypatch)

    res = client.post("/api/v1/handover/redo-readings", headers=owner_headers, json={"handover_id": "HO-1"})
    assert res.status_code == 200, res.text
    assert calls == [("reverse", "HO-1")]
    assert handovers["HO-1"]["stock_applied"] is False


def test_apply_is_idempotent_so_approval_does_not_double_count(monkeypatch):
    calls = []
    monkeypatch.setattr(svc, "record_sale", lambda sid, k, q, by="system", ref="": calls.append(("sale", k, q)) or {})
    monkeypatch.setattr(svc, "record_forecourt_return", lambda sid, k, q, by="system", ref="": calls.append(("ret", k, q)) or {})
    handover = {"handover_id": "HO-1", "stock_snapshot": SNAPSHOT}
    svc.apply_handover_sales("ST", handover)          # at submission
    svc.apply_handover_sales("ST", handover)          # at approval
    assert calls == [("sale", "cylinder_full:9kg", 3), ("ret", "cylinder_empty:9kg", 2)]


# ── Daily Entry baselines ───────────────────────────────────────────

def test_entry_baseline_sums_every_shifts_share_and_removes_one_cleanly():
    entry = {}
    ah._set_entry_contribution(entry, "HO-DAY", {"lubricant:A": 3})
    ah._set_entry_contribution(entry, "HO-NIGHT", {"lubricant:A": 2, "lubricant:B": 1})
    assert entry["stores_applied"] == {"lubricant:A": 5, "lubricant:B": 1}
    ah._set_entry_contribution(entry, "HO-DAY", None)
    assert entry["stores_applied"] == {"lubricant:A": 2, "lubricant:B": 1}


def test_legacy_entry_baseline_is_kept_as_its_own_share():
    entry = {"stores_applied": {"lubricant:A": 4}}
    ah._set_entry_contribution(entry, "HO-NEW", {"lubricant:A": 1})
    assert entry["stores_applied"] == {"lubricant:A": 5}
    assert entry["stores_applied_by_handover"]["_legacy"] == {"lubricant:A": 4}


def test_voiding_a_pre_breakdown_handover_subtracts_only_its_share():
    # Shared accessories entry from before the breakdown: Day (3) + Night (2) lumped together.
    entry = {"stores_applied": {"lpg_accessory:REG": 5}}
    ah._remove_entry_contribution(entry, "HO-DAY-OLD", {"lpg_accessory:REG": 3})
    assert entry["stores_applied"] == {"lpg_accessory:REG": 2}      # Night's share survives

    # Same, after a newer handover has added its own breakdown row.
    entry = {"stores_applied": {"lubricant:A": 4}}
    ah._set_entry_contribution(entry, "HO-NEW", {"lubricant:A": 1})
    ah._remove_entry_contribution(entry, "HO-OLD", {"lubricant:A": 4})
    assert entry["stores_applied"] == {"lubricant:A": 1}


def test_manual_save_keeps_the_breakdown_adding_up():
    by_ho = {"HO-DAY": {"lubricant:A": 3}, "HO-NIGHT": {"lubricant:A": 2}}
    rebased = svc.rebase_manual_contribution(by_ho, {"lubricant:A": 6})
    assert rebased["HO-DAY"] == {"lubricant:A": 3}
    assert rebased["_manual"] == {"lubricant:A": 1}
    # Voiding Day later removes exactly its share, leaving manual + night.
    entry = {"stores_applied_by_handover": rebased}
    ah._set_entry_contribution(entry, "HO-DAY", None)
    assert entry["stores_applied"] == {"lubricant:A": 3}
    assert svc.rebase_manual_contribution(None, {"x": 1}) is None


# ── empties back to the supplier ────────────────────────────────────

@pytest.fixture
def empties(monkeypatch):
    state = {"items": {}, "moves": []}
    monkeypatch.setattr(svc, "load_items", lambda sid: state["items"])
    monkeypatch.setattr(svc, "save_items", lambda sid, items: state.update(items=items))
    monkeypatch.setattr(svc, "load_movements", lambda sid: state["moves"])
    monkeypatch.setattr(svc, "save_station_json", lambda sid, fn, data: state.update(moves=data))
    monkeypatch.setattr(svc, "log_audit_event", lambda **k: None)
    monkeypatch.setattr(svc, "create_notification", lambda **k: None)
    svc.upsert_item("ST", "cylinder_empty", "9kg", "9kg cylinder (empty)", unit="cylinder")
    svc.upsert_item("ST", "cylinder_full", "9kg", "9kg cylinder (full)", unit="cylinder")
    state["items"]["cylinder_empty:9kg"]["forecourt"] = 7
    return state


def test_return_to_supplier_decrements_empties_and_logs_it(empties):
    item = svc.return_to_supplier("ST", "cylinder_empty:9kg", 5, "forecourt", "Gas Co", "DN-881", "mgr1")
    assert item["forecourt"] == 2
    move = empties["moves"][-1]
    assert move["type"] == "return_to_supplier"
    assert move["ref"] == "DN-881" and "Gas Co" in move["note"]
    assert svc.dashboard("ST")["summary"]["empties_on_hand"] == {"9kg": 2}


def test_return_to_supplier_cannot_go_below_zero_or_touch_full_cylinders(empties):
    with pytest.raises(HTTPException):
        svc.return_to_supplier("ST", "cylinder_empty:9kg", 8, "forecourt", "Gas Co", "", "mgr1")
    with pytest.raises(HTTPException):
        svc.return_to_supplier("ST", "cylinder_empty:9kg", 1.5, "forecourt", "Gas Co", "", "mgr1")
    with pytest.raises(HTTPException):
        svc.return_to_supplier("ST", "cylinder_empty:9kg", 1, "forecourt", "  ", "", "mgr1")
    with pytest.raises(HTTPException):
        svc.return_to_supplier("ST", "cylinder_full:9kg", 1, "forecourt", "Gas Co", "", "mgr1")
    assert empties["items"]["cylinder_empty:9kg"]["forecourt"] == 7


def test_return_to_supplier_is_manager_plus(client, staff_headers):
    if not staff_headers:
        pytest.skip("attendant seed unavailable")
    res = client.post("/api/v1/stores/return-to-supplier", headers=staff_headers,
                      json={"item_key": "cylinder_empty:9kg", "qty": 1, "supplier": "Gas Co"})
    assert res.status_code == 403
