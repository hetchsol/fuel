"""
Every credit sale is bound to the attendant who made it, so it can never be
counted in another attendant's handover.

Before this, a handover pulled in every already-recorded credit sale that
shared its shift, so a sale entered for attendant A on a two-attendant shift
also landed in attendant B's handover. These tests pin the gate:
  - handover processing only pulls in the attendant's own sales;
  - the Accounts credit sale endpoint demands a real shift + rostered attendant
    and refuses once that attendant's handover is approved;
  - historical sales are never rewritten (no backfill / reassignment).
"""
import pytest

import app.api.v1.attendant_handover as ah
from app.database.storage import get_station_storage

SHIFT = "2026-10-01-Day"
SOLO_SHIFT = "2026-10-01-Night"


def _seed(monkeypatch, handovers=None):
    storage = get_station_storage("ST001")
    storage["accounts"] = {
        "ACC-A": {"account_id": "ACC-A", "account_name": "Alpha Transport", "balance": 0,
                  "default_price_per_liter": 25.0, "account_type": "postpaid", "credit_limit": 1_000_000},
    }
    storage["shifts"] = {
        SHIFT: {"shift_id": SHIFT, "date": "2026-10-01", "shift_type": "Day", "status": "active",
                "attendants": ["Ann", "Ben"],
                "assignments": [{"attendant_id": "ATT-A", "attendant_name": "Ann"},
                                {"attendant_id": "ATT-B", "attendant_name": "Ben"}]},
        SOLO_SHIFT: {"shift_id": SOLO_SHIFT, "date": "2026-10-01", "shift_type": "Night", "status": "active",
                     "attendants": ["Ann"],
                     "assignments": [{"attendant_id": "ATT-A", "attendant_name": "Ann"}]},
    }
    storage["credit_sales"] = []
    handovers = handovers if handovers is not None else {}
    monkeypatch.setattr(ah, "_load_handovers", lambda sid: handovers)
    monkeypatch.setattr(ah, "_save_handovers", lambda data, sid: handovers.update(data))
    return storage, handovers


def _sale(sale_id, shift_id=SHIFT, amount=100.0, **extra):
    return {"sale_id": sale_id, "account_id": "ACC-A", "shift_id": shift_id, "date": "2026-10-01",
            "fuel_type": "Diesel", "volume": amount / 25, "amount": amount, "voided": False, **extra}


# ── handover processing ─────────────────────────────────────────────

def test_handover_only_pulls_in_its_own_attendants_sales(monkeypatch):
    storage, _ = _seed(monkeypatch, handovers={
        "HO-B-1": {"handover_id": "HO-B-1", "attendant_id": "ATT-B", "attendant_name": "Ben"},
    })
    storage["credit_sales"] = [
        _sale("CS-STAMPED-A", attendant_id="ATT-A", amount=100),
        _sale("CS-STAMPED-B", attendant_id="ATT-B", amount=200),
        _sale("CS-HO-HO-B-1-0", amount=300),          # legacy, created by Ben's handover
        _sale("CS-LOOSE", amount=400),                 # legacy, two-attendant shift: unassigned
    ]

    total_a, details_a, _, _ = ah._process_credit_sales([], storage, SHIFT, "ST001", "ATT-A")
    total_b, details_b, _, _ = ah._process_credit_sales([], storage, SHIFT, "ST001", "ATT-B")

    assert {d["sale_id"] for d in details_a} == {"CS-STAMPED-A"}
    assert total_a == 100
    assert {d["sale_id"] for d in details_b} == {"CS-STAMPED-B", "CS-HO-HO-B-1-0"}
    assert total_b == 500


def test_unbound_sale_on_a_single_attendant_shift_belongs_to_that_attendant(monkeypatch):
    storage, _ = _seed(monkeypatch)
    storage["credit_sales"] = [_sale("CS-LOOSE", shift_id=SOLO_SHIFT, amount=150)]
    total, details, _, _ = ah._process_credit_sales([], storage, SOLO_SHIFT, "ST001", "ATT-A")
    assert total == 150 and details[0]["sale_id"] == "CS-LOOSE"


# ── Accounts credit sale endpoint ───────────────────────────────────

def _post_sale(client, headers, **overrides):
    body = {"sale_id": "client-chosen", "account_id": "ACC-A", "shift_id": SHIFT, "date": "1999-01-01",
            "fuel_type": "Diesel", "volume": 10, "amount": 1, "attendant_id": "ATT-A"}
    body.update(overrides)
    return client.post("/api/v1/accounts/sales", headers=headers, json=body)


def test_sale_without_attendant_is_rejected(client, owner_headers, monkeypatch):
    _seed(monkeypatch)
    res = _post_sale(client, owner_headers, attendant_id=None)
    assert res.status_code == 400
    assert "attendant" in res.json()["detail"].lower()


def test_sale_on_unknown_shift_is_rejected(client, owner_headers, monkeypatch):
    _seed(monkeypatch)
    res = _post_sale(client, owner_headers, shift_id="SHIFT-2026-10-01")
    assert res.status_code == 400
    assert "shift" in res.json()["detail"].lower()


def test_sale_for_attendant_not_on_the_shift_is_rejected(client, owner_headers, monkeypatch):
    _seed(monkeypatch)
    res = _post_sale(client, owner_headers, attendant_id="ATT-ZZZ")
    assert res.status_code == 400


def test_sale_is_stamped_with_attendant_and_shift_date(client, owner_headers, monkeypatch):
    storage, _ = _seed(monkeypatch)
    res = _post_sale(client, owner_headers)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["attendant_id"] == "ATT-A"
    assert body["attendant_name"] == "Ann"
    assert body["date"] == "2026-10-01"          # the shift's date, not the client's
    assert body["sale_id"] != "client-chosen"
    assert body["amount"] == 250.0               # 10 L at the account's rate
    assert storage["credit_sales"][-1]["attendant_id"] == "ATT-A"


def test_sale_refused_once_attendants_handover_is_approved(client, owner_headers, monkeypatch):
    _seed(monkeypatch, handovers={
        "HO-A": {"handover_id": "HO-A", "shift_id": SHIFT, "attendant_id": "ATT-A",
                 "review_status": "approved", "phase": "completed"},
    })
    res = _post_sale(client, owner_headers)
    assert res.status_code == 400
    assert "approved" in res.json()["detail"].lower()


def test_sale_is_added_to_a_closed_but_unapproved_handover(client, owner_headers, monkeypatch):
    _, handovers = _seed(monkeypatch, handovers={
        "HO-A": {"handover_id": "HO-A", "shift_id": SHIFT, "attendant_id": "ATT-A", "attendant_name": "Ann",
                 "review_status": "submitted", "phase": "completed",
                 "total_expected": 1000.0, "actual_cash": 1000.0, "pos_receipts": 0.0,
                 "credit_sales": 0.0, "credit_sale_details": [], "difference": 0.0},
        "HO-B": {"handover_id": "HO-B", "shift_id": SHIFT, "attendant_id": "ATT-B", "attendant_name": "Ben",
                 "review_status": "submitted", "phase": "completed",
                 "credit_sales": 0.0, "credit_sale_details": []},
    })
    res = _post_sale(client, owner_headers)
    assert res.status_code == 200, res.text
    assert handovers["HO-A"]["credit_sales"] == 250.0
    assert len(handovers["HO-A"]["credit_sale_details"]) == 1
    assert handovers["HO-B"]["credit_sales"] == 0.0     # never leaks to the co-attendant


def test_attendant_cannot_record_a_sale_for_someone_else(client, staff_headers, monkeypatch):
    if not staff_headers:
        pytest.skip("attendant seed unavailable")
    _seed(monkeypatch)
    res = _post_sale(client, staff_headers, attendant_id="ATT-B")
    assert res.status_code == 403


def test_no_backfill_or_reassignment_endpoints_exist(client, owner_headers):
    # Binding applies from rollout onward; historical sales are left as they are.
    assert client.post("/api/v1/accounts/sales/backfill-attendants", headers=owner_headers).status_code in (404, 405)
    assert client.post("/api/v1/accounts/sales/CS-1/assign-attendant", headers=owner_headers,
                       json={"attendant_id": "X", "reason": "r"}).status_code in (404, 405)


# ── cross-attendant duplicates ──────────────────────────────────────

def _item(**kw):
    from app.models.models import HandoverCreditSaleItem
    base = {"account_id": "ACC-A", "account_name": "Alpha Transport", "fuel_type": "Diesel", "volume": 10}
    base.update(kw)
    return HandoverCreditSaleItem(**base)


def test_coupon_already_recorded_by_another_attendant_is_refused(monkeypatch):
    storage, _ = _seed(monkeypatch)
    storage["credit_sales"] = [_sale("CS-A", attendant_id="ATT-A", attendant_name="Ann", coupon_serial="C0045")]
    total, _, new_items, dups = ah._process_credit_sales([_item(coupon_serial="c0045")], storage, SHIFT, "ST001", "ATT-B")
    assert new_items == [] and total == 0
    assert "Ann" in dups[0]["reason"] and "C0045" in dups[0]["reason"]


def test_coupon_is_single_use_across_shifts_too(monkeypatch):
    storage, _ = _seed(monkeypatch)
    storage["credit_sales"] = [_sale("CS-A", shift_id=SOLO_SHIFT, attendant_id="ATT-A", coupon_serial="C9")]
    _, _, new_items, dups = ah._process_credit_sales([_item(coupon_serial="C9")], storage, SHIFT, "ST001", "ATT-B")
    assert new_items == [] and len(dups) == 1


def test_couponless_same_client_and_fuel_on_shift_is_refused_across_attendants(monkeypatch):
    storage, _ = _seed(monkeypatch)
    storage["credit_sales"] = [_sale("CS-A", attendant_id="ATT-A")]
    _, _, new_items, dups = ah._process_credit_sales([_item()], storage, SHIFT, "ST001", "ATT-B")
    assert new_items == [] and len(dups) == 1
    # A different coupon is a different trip and goes through.
    _, _, new_items, _ = ah._process_credit_sales([_item(coupon_serial="C1")], storage, SHIFT, "ST001", "ATT-B")
    assert len(new_items) == 1


def test_accounts_endpoint_refuses_a_duplicate_coupon(client, owner_headers, monkeypatch):
    storage, _ = _seed(monkeypatch)
    storage["credit_sales"] = [_sale("CS-A", attendant_id="ATT-A", attendant_name="Ann", coupon_serial="C0045")]
    res = _post_sale(client, owner_headers, attendant_id="ATT-B", coupon_serial="C0045", vehicle_reg="ABZ 1")
    assert res.status_code == 409
    assert "Ann" in res.json()["detail"]
    assert len(storage["credit_sales"]) == 1


def test_pos_reference_on_another_attendants_handover_is_refused(client, owner_headers, monkeypatch):
    handovers = {
        "HO-A": {"handover_id": "HO-A", "shift_id": SHIFT, "date": "2026-10-01", "attendant_id": "ATT-A",
                 "attendant_name": "Ann", "review_status": "submitted", "phase": "completed",
                 "pos_breakdown": [{"id": "p1", "type_id": "VISA", "type_name": "Visa", "amount": 500, "reference": "SLIP-77"}]},
        "HO-B": {"handover_id": "HO-B", "shift_id": SHIFT, "date": "2026-10-01", "attendant_id": "ATT-B",
                 "attendant_name": "Ben", "review_status": "submitted", "phase": "completed",
                 "pos_breakdown": [], "pos_receipts": 0, "total_expected": 0, "actual_cash": 0,
                 "credit_sales": 0, "difference": 0},
        "HO-OLD": {"handover_id": "HO-OLD", "shift_id": SHIFT, "date": "2026-10-01", "attendant_id": "ATT-A",
                   "review_status": "voided", "phase": "completed",
                   "pos_breakdown": [{"id": "p9", "reference": "SLIP-99", "type_id": "VISA", "amount": 1}]},
    }
    _seed(monkeypatch, handovers=handovers)
    monkeypatch.setattr(ah, "load_station_json", lambda sid, fn, default=None: default if default is not None else {})

    res = client.patch("/api/v1/handover/HO-B/pos-receipts", headers=owner_headers, json={"pos_items": [
        {"type_id": "VISA", "type_name": "Visa", "amount": 500, "reference": " slip-77 "}]})
    assert res.status_code == 409
    assert "Ann" in str(res.json()["detail"])

    # A voided handover's slip doesn't block, and a fresh slip goes through.
    ok = client.patch("/api/v1/handover/HO-B/pos-receipts", headers=owner_headers, json={"pos_items": [
        {"type_id": "VISA", "type_name": "Visa", "amount": 1, "reference": "SLIP-99"}]})
    assert ok.status_code == 200, ok.text
    assert handovers["HO-B"]["pos_receipts"] == 1


def test_pos_conflict_ignores_the_item_being_edited():
    handovers = {"HO-A": {"date": "D", "review_status": "submitted",
                          "pos_breakdown": [{"id": "p1", "reference": "R1"}]}}
    assert ah._pos_reference_conflict(handovers, "D", "r1") is not None
    assert ah._pos_reference_conflict(handovers, "D", "R1", exclude_handover_id="HO-A", exclude_item_id="p1") is None
    assert ah._pos_reference_conflict(handovers, "OTHER-DAY", "R1") is None
    assert ah._pos_reference_conflict(handovers, "D", "") is None
