"""
Complements test_remove_reconciliation_line_items.py: a manager can now
correct a single POS receipt or credit sale in place (account, amount,
volume, reference) instead of only being able to remove it and add a fresh
one.
"""
import app.api.v1.attendant_handover as ah
from app.database.storage import get_station_storage


def test_edit_pos_receipt_item_updates_in_place(client, owner_headers, monkeypatch):
    handover = {
        "handover_id": "HO-1", "date": "2026-09-17", "shift_type": "Day",
        "review_status": "submitted",
        "total_expected": 1000.0, "actual_cash": 500.0, "credit_sales": 0.0,
        "pos_breakdown": [{"id": "item-1", "type_id": "visa", "type_name": "Visa", "amount": 300.0}],
        "pos_receipts": 300.0,
    }
    ah._recalculate_reconciliation(handover, {})
    handovers = {"HO-1": handover}
    monkeypatch.setattr(ah, "_load_handovers", lambda sid: handovers)
    monkeypatch.setattr(ah, "_save_handovers", lambda data, sid: handovers.update(data))
    monkeypatch.setattr(ah, "load_station_json", lambda sid, fn, default=None: {})

    res = client.patch("/api/v1/handover/HO-1/pos-receipts/item-1", headers=owner_headers, json={
        "type_id": "visa", "type_name": "Visa", "amount": 350.0, "reference": "SLIP-99",
    })

    assert res.status_code == 200
    data = res.json()
    assert data["pos_breakdown"][0]["amount"] == 350.0
    assert data["pos_breakdown"][0]["reference"] == "SLIP-99"
    assert data["pos_receipts"] == 350.0

    adjustments = handover["reconciliation_adjustments"]
    assert adjustments[-1]["type"] == "pos_receipt_edited"
    assert adjustments[-1]["amount"] == 50.0  # 350 - 300


def test_edit_pos_receipt_item_404_for_unknown_id(client, owner_headers, monkeypatch):
    handover = {
        "handover_id": "HO-1", "date": "2026-09-17", "shift_type": "Day",
        "review_status": "submitted", "pos_breakdown": [{"id": "item-1", "amount": 100.0}],
    }
    monkeypatch.setattr(ah, "_load_handovers", lambda sid: {"HO-1": handover})
    monkeypatch.setattr(ah, "load_station_json", lambda sid, fn, default=None: {})

    res = client.patch("/api/v1/handover/HO-1/pos-receipts/does-not-exist", headers=owner_headers, json={
        "type_id": "visa", "type_name": "Visa", "amount": 100.0,
    })
    assert res.status_code == 404


def test_edit_pos_receipt_item_blocked_once_approved(client, owner_headers, monkeypatch):
    handover = {
        "handover_id": "HO-1", "date": "2026-09-17", "shift_type": "Day",
        "review_status": "approved", "pos_breakdown": [{"id": "item-1", "amount": 100.0}],
    }
    monkeypatch.setattr(ah, "_load_handovers", lambda sid: {"HO-1": handover})

    res = client.patch("/api/v1/handover/HO-1/pos-receipts/item-1", headers=owner_headers, json={
        "type_id": "visa", "type_name": "Visa", "amount": 100.0,
    })
    assert res.status_code == 400


def test_edit_credit_sale_item_reprices_and_updates_balance(client, owner_headers, monkeypatch):
    storage = get_station_storage("ST001")
    storage["accounts"]["ACC-A"] = {"account_id": "ACC-A", "current_balance": 500.0, "credit_limit": 5000.0}
    storage["accounts"]["ACC-B"] = {"account_id": "ACC-B", "current_balance": 0.0, "credit_limit": 5000.0}
    storage["credit_sales"] = [
        {"sale_id": "CS-HO-HO-1-0", "account_id": "ACC-A", "amount": 150.0, "volume": 15.0,
         "fuel_type": "Diesel", "voided": False},
    ]
    storage["fuel_settings"] = {"diesel_price_per_liter": 10.0, "petrol_price_per_liter": 12.0}

    handover = {
        "handover_id": "HO-1", "date": "2026-09-17", "shift_type": "Day",
        "review_status": "submitted",
        "total_expected": 1000.0, "actual_cash": 850.0,
        "credit_sale_details": [
            {"sale_id": "CS-HO-HO-1-0", "account_id": "ACC-A", "account_name": "Account A",
             "fuel_type": "Diesel", "volume": 15.0, "price_per_liter": 10.0, "amount": 150.0,
             "source": "handover"},
        ],
        "credit_sales": 150.0, "pos_receipts": 0.0,
    }
    ah._recalculate_reconciliation(handover, storage)
    handovers = {"HO-1": handover}
    monkeypatch.setattr(ah, "_load_handovers", lambda sid: handovers)
    monkeypatch.setattr(ah, "_save_handovers", lambda data, sid: handovers.update(data))
    monkeypatch.setattr(ah, "load_station_json", lambda sid, fn, default=None: {})
    monkeypatch.setattr(ah, "save_station_storage", lambda sid: None)

    # Correct: wrong account (should be ACC-B) and wrong volume (should be 20L, not 15L)
    res = client.patch("/api/v1/handover/HO-1/credit-sales/CS-HO-HO-1-0", headers=owner_headers, json={
        "account_id": "ACC-B", "account_name": "Account B", "fuel_type": "Diesel",
        "volume": 20.0, "price_per_liter": 0, "amount": 0,
    })

    assert res.status_code == 200
    data = res.json()
    new_amount = 20.0 * 10.0  # volume * resolved diesel price
    assert data["credit_sale_details"][0]["amount"] == new_amount
    assert data["credit_sale_details"][0]["account_id"] == "ACC-B"
    assert data["credit_sales"] == new_amount

    # Old account (ACC-A) has just this K150 sale's contribution reversed
    # off its current balance (500), landing at 350 — not reset to some
    # other baseline, since other sales could also be on that balance.
    assert storage["accounts"]["ACC-A"]["current_balance"] == 500.0 - 150.0
    # New account (ACC-B) charged the freshly resolved amount.
    assert storage["accounts"]["ACC-B"]["current_balance"] == new_amount
    assert storage["credit_sales"][0]["account_id"] == "ACC-B"
    assert storage["credit_sales"][0]["amount"] == new_amount

    adjustments = handover["reconciliation_adjustments"]
    assert adjustments[-1]["type"] == "credit_sale_edited"


def test_edit_credit_sale_item_rejected_charge_leaves_original_account_untouched(client, owner_headers, monkeypatch):
    storage = get_station_storage("ST001")
    storage["accounts"]["ACC-A"] = {"account_id": "ACC-A", "current_balance": 500.0, "credit_limit": 5000.0}
    storage["accounts"]["ACC-C"] = {"account_id": "ACC-C", "current_balance": 4990.0, "credit_limit": 5000.0}
    storage["credit_sales"] = [
        {"sale_id": "CS-HO-HO-1-0", "account_id": "ACC-A", "amount": 150.0, "volume": 15.0,
         "fuel_type": "Diesel", "voided": False},
    ]
    storage["fuel_settings"] = {"diesel_price_per_liter": 10.0}

    handover = {
        "handover_id": "HO-1", "date": "2026-09-17", "shift_type": "Day",
        "review_status": "submitted",
        "credit_sale_details": [
            {"sale_id": "CS-HO-HO-1-0", "account_id": "ACC-A", "account_name": "Account A",
             "fuel_type": "Diesel", "volume": 15.0, "price_per_liter": 10.0, "amount": 150.0},
        ],
        "credit_sales": 150.0,
    }
    handovers = {"HO-1": handover}
    monkeypatch.setattr(ah, "_load_handovers", lambda sid: handovers)
    monkeypatch.setattr(ah, "load_station_json", lambda sid, fn, default=None: {})

    # ACC-C only has K10 of headroom (4990 + 0 overdraft vs 5000 limit) — a
    # 20L diesel sale at K10/L (K200) must be rejected, and ACC-A's reversal
    # must be undone rather than left applied with nothing charged anywhere.
    res = client.patch("/api/v1/handover/HO-1/credit-sales/CS-HO-HO-1-0", headers=owner_headers, json={
        "account_id": "ACC-C", "account_name": "Account C", "fuel_type": "Diesel",
        "volume": 20.0, "price_per_liter": 0, "amount": 0,
    })

    assert res.status_code == 400
    assert storage["accounts"]["ACC-A"]["current_balance"] == 500.0
    assert storage["accounts"]["ACC-C"]["current_balance"] == 4990.0
    assert storage["credit_sales"][0]["account_id"] == "ACC-A"
