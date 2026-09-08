"""
A manager can add a POS receipt or credit sale to a handover any time before
approval (see patch_pos_receipts/patch_credit_sales), which recomputes
`difference` from the same actual_cash already entered. Without a record of
that, the difference just looks different later with no trace of why - a
manager can correctly say "my cash entry was right" while the number that
ends up on Daily Close-Off has moved for an unrelated reason.

_record_reconciliation_adjustment pairs the before/after difference with who
did it and when, on the handover itself, so it survives into the review
queue and Daily Close-Off summary.
"""
import app.api.v1.attendant_handover as ah


def test_records_before_and_after_difference():
    handover = {"total_expected": 1000.0, "actual_cash": 1000.0, "pos_receipts": 0.0, "credit_sales": 0.0}
    ah._recalculate_reconciliation(handover, {})
    assert handover["difference"] == 0.0

    difference_before = handover["difference"]
    handover["credit_sales"] = 150.0
    ah._recalculate_reconciliation(handover, {})
    ah._record_reconciliation_adjustment(
        handover, "credit_sale", "1 credit sale(s) added", 150.0, difference_before, "manager1",
    )

    assert handover["difference"] == 150.0
    adjustments = handover["reconciliation_adjustments"]
    assert len(adjustments) == 1
    entry = adjustments[0]
    assert entry["type"] == "credit_sale"
    assert entry["amount"] == 150.0
    assert entry["difference_before"] == 0.0
    assert entry["difference_after"] == 150.0
    assert entry["performed_by"] == "manager1"
    assert "performed_at" in entry


def test_multiple_adjustments_append_rather_than_overwrite():
    handover = {"total_expected": 1000.0, "actual_cash": 1000.0, "pos_receipts": 0.0, "credit_sales": 0.0}
    ah._recalculate_reconciliation(handover, {})

    difference_before = handover["difference"]
    handover["pos_receipts"] = 50.0
    ah._recalculate_reconciliation(handover, {})
    ah._record_reconciliation_adjustment(
        handover, "pos_receipt", "1 POS receipt(s) added", 50.0, difference_before, "manager1",
    )

    difference_before = handover["difference"]
    handover["credit_sales"] = 20.0
    ah._recalculate_reconciliation(handover, {})
    ah._record_reconciliation_adjustment(
        handover, "credit_sale", "1 credit sale(s) added", 20.0, difference_before, "manager1",
    )

    assert len(handover["reconciliation_adjustments"]) == 2
    assert handover["reconciliation_adjustments"][0]["difference_after"] == 50.0
    assert handover["reconciliation_adjustments"][1]["difference_before"] == 50.0
    assert handover["reconciliation_adjustments"][1]["difference_after"] == 70.0


def test_close_off_summary_surfaces_adjustment_history(client, owner_headers, monkeypatch):
    handover = {
        "handover_id": "HO-ADJ-1", "date": "2026-09-08", "shift_type": "Day", "shift_id": "S1",
        "attendant_name": "Jane", "review_status": "approved",
        "fuel_revenue": 1000.0, "lpg_sales": 0, "lubricant_sales": 0, "accessory_sales": 0,
        "total_expected": 1000.0, "credit_sales": 150.0,
        "expected_cash": 850.0, "actual_cash": 1000.0, "pos_receipts": 0.0,
        "reconciliation_adjustments": [{
            "type": "credit_sale", "description": "1 credit sale(s) added", "amount": 150.0,
            "difference_before": 0.0, "difference_after": 150.0,
            "performed_by": "manager1", "performed_at": "2026-09-08T10:00:00",
        }],
    }
    import app.api.v1.daily_close_off as dco
    monkeypatch.setattr(dco, "_load_close_offs", lambda sid: {})
    monkeypatch.setattr(dco, "_load_handovers", lambda sid: {"HO-ADJ-1": handover})
    monkeypatch.setattr(dco, "_aggregate_handovers", lambda approved: {})

    res = client.get("/api/v1/daily-close-off/summary?date=2026-09-08", headers=owner_headers)
    assert res.status_code == 200
    data = res.json()
    row = data["approved_handovers"][0]
    assert len(row["reconciliation_adjustments"]) == 1
    assert row["reconciliation_adjustments"][0]["performed_by"] == "manager1"
