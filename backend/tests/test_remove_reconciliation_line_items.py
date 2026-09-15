"""
Before this, the only way to react to a wrongly entered POS receipt or
credit sale (added via patch_pos_receipts/patch_credit_sales) was to add
another one on top of it — there was no way to remove the mistake, so both
the wrong and the corrected entry counted, silently inflating the
reconciliation and, for credit sales, double-charging the customer's
account. These two endpoints let a manager/owner remove one specific item
by its server-generated id instead.
"""
import app.api.v1.attendant_handover as ah
from app.database.storage import get_station_storage


def test_delete_pos_receipt_item_removes_just_that_one(client, owner_headers, monkeypatch):
    handover = {
        "handover_id": "HO-1", "date": "2026-09-15", "shift_type": "Day",
        "review_status": "submitted",
        "total_expected": 1000.0, "actual_cash": 500.0, "credit_sales": 0.0,
        "pos_breakdown": [
            {"id": "item-1", "type_id": "visa", "type_name": "Visa", "amount": 300.0},
            {"id": "item-2", "type_id": "mtn", "type_name": "MTN Money", "amount": 200.0},
        ],
        "pos_receipts": 500.0,
    }
    ah._recalculate_reconciliation(handover, {})
    handovers = {"HO-1": handover}
    monkeypatch.setattr(ah, "_load_handovers", lambda sid: handovers)
    monkeypatch.setattr(ah, "_save_handovers", lambda data, sid: handovers.update(data))
    monkeypatch.setattr(ah, "load_station_json", lambda sid, fn, default=None: {})

    res = client.delete("/api/v1/handover/HO-1/pos-receipts/item-1", headers=owner_headers)

    assert res.status_code == 200
    data = res.json()
    assert [e["id"] for e in data["pos_breakdown"]] == ["item-2"]
    assert data["pos_receipts"] == 200.0
    assert data["difference"] == round(500.0 + 200.0 - 1000.0, 2)  # actual_cash + remaining pos - expected

    adjustments = handover["reconciliation_adjustments"]
    assert len(adjustments) == 1
    assert adjustments[0]["type"] == "pos_receipt_removed"
    assert adjustments[0]["amount"] == -300.0


def test_delete_pos_receipt_item_404_for_unknown_id(client, owner_headers, monkeypatch):
    handover = {
        "handover_id": "HO-1", "date": "2026-09-15", "shift_type": "Day",
        "review_status": "submitted", "pos_breakdown": [{"id": "item-1", "amount": 100.0}],
    }
    handovers = {"HO-1": handover}
    monkeypatch.setattr(ah, "_load_handovers", lambda sid: handovers)
    monkeypatch.setattr(ah, "load_station_json", lambda sid, fn, default=None: {})

    res = client.delete("/api/v1/handover/HO-1/pos-receipts/does-not-exist", headers=owner_headers)
    assert res.status_code == 404


def test_delete_pos_receipt_item_blocked_once_approved(client, owner_headers, monkeypatch):
    handover = {
        "handover_id": "HO-1", "date": "2026-09-15", "shift_type": "Day",
        "review_status": "approved", "pos_breakdown": [{"id": "item-1", "amount": 100.0}],
    }
    monkeypatch.setattr(ah, "_load_handovers", lambda sid: {"HO-1": handover})

    res = client.delete("/api/v1/handover/HO-1/pos-receipts/item-1", headers=owner_headers)
    assert res.status_code == 400


def test_delete_credit_sale_item_reverses_account_balance(client, owner_headers, monkeypatch):
    storage = get_station_storage("ST001")
    storage["accounts"]["ACC-TEST-1"] = {"account_id": "ACC-TEST-1", "current_balance": 500.0, "credit_limit": 5000.0}
    storage["credit_sales"] = [
        {"sale_id": "CS-HO-HO-1-0", "account_id": "ACC-TEST-1", "amount": 150.0, "voided": False},
    ]

    handover = {
        "handover_id": "HO-1", "date": "2026-09-15", "shift_type": "Day",
        "review_status": "submitted",
        "total_expected": 1000.0, "actual_cash": 850.0,
        "credit_sale_details": [
            {"sale_id": "CS-HO-HO-1-0", "account_id": "ACC-TEST-1", "account_name": "Test Co", "amount": 150.0},
        ],
        "credit_sales": 150.0, "pos_receipts": 0.0,
    }
    ah._recalculate_reconciliation(handover, storage)
    handovers = {"HO-1": handover}
    monkeypatch.setattr(ah, "_load_handovers", lambda sid: handovers)
    monkeypatch.setattr(ah, "_save_handovers", lambda data, sid: handovers.update(data))
    monkeypatch.setattr(ah, "load_station_json", lambda sid, fn, default=None: {})
    monkeypatch.setattr(ah, "save_station_storage", lambda sid: None)

    res = client.delete("/api/v1/handover/HO-1/credit-sales/CS-HO-HO-1-0", headers=owner_headers)

    assert res.status_code == 200
    data = res.json()
    assert data["credit_sale_details"] == []
    assert data["credit_sales"] == 0.0

    # Post-paid account: process_credit_sale would have increased the balance
    # by the sale amount, so reversing it must decrease it back by the same.
    assert storage["accounts"]["ACC-TEST-1"]["current_balance"] == 500.0 - 150.0
    assert storage["credit_sales"][0]["voided"] is True

    adjustments = handover["reconciliation_adjustments"]
    assert len(adjustments) == 1
    assert adjustments[0]["type"] == "credit_sale_removed"
    assert adjustments[0]["amount"] == -150.0


def test_delete_credit_sale_item_404_when_ledger_record_missing(client, owner_headers, monkeypatch):
    handover = {
        "handover_id": "HO-1", "date": "2026-09-15", "shift_type": "Day",
        "review_status": "submitted",
        "credit_sale_details": [{"sale_id": "CS-HO-HO-1-0", "account_id": "ACC-X", "amount": 50.0}],
    }
    storage = get_station_storage("ST001")
    storage["credit_sales"] = []  # ledger record missing/already reversed
    monkeypatch.setattr(ah, "_load_handovers", lambda sid: {"HO-1": handover})
    monkeypatch.setattr(ah, "load_station_json", lambda sid, fn, default=None: {})

    res = client.delete("/api/v1/handover/HO-1/credit-sales/CS-HO-HO-1-0", headers=owner_headers)
    assert res.status_code == 404
