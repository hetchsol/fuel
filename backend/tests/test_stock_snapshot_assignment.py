"""
An attendant not assigned to LPG/Lubricants/Accessories must not be able to submit
(and thereby silently overwrite) stock data for that product line — mirroring the
existing per-nozzle assignment check in _process_nozzle_readings. Supervisors/managers/
owners closing their own personal shift are exempt, matching the existing UI behavior.
"""
import pytest
from fastapi import HTTPException

import app.api.v1.attendant_handover as ah
from app.models.models import ShiftStockSnapshot, LPGStockLineItem, LubricantStockLineItem, AccessoryStockLineItem


def _lpg_snapshot():
    return ShiftStockSnapshot(lpg_cylinders=[
        LPGStockLineItem(size_kg=9, opening_full=10, opening_empty=2, closing_full=8, closing_empty=4, sold_refill=2),
    ])


def _lubricant_snapshot():
    return ShiftStockSnapshot(lubricants=[
        LubricantStockLineItem(product_code="EO-15W40-4L", description="15W-40 Engine Oil 4L",
                                opening_stock=10, sold=2, closing_stock=8),
    ])


def _accessory_snapshot():
    return ShiftStockSnapshot(accessories=[
        AccessoryStockLineItem(product_code="ACC-HOSE", description="Gas Hose",
                                opening_stock=5, sold=1, closing_stock=4),
    ])


def test_unassigned_attendant_lpg_submission_rejected():
    assignment = {"assigned_lpg": False, "assigned_lubricants": False, "assigned_accessories": False}
    with pytest.raises(HTTPException) as exc:
        ah._process_stock_snapshot(_lpg_snapshot(), "ST001", {}, assignment, "user")
    assert exc.value.status_code == 400
    assert "LPG" in exc.value.detail


def test_unassigned_attendant_lubricants_submission_rejected():
    assignment = {"assigned_lpg": False, "assigned_lubricants": False, "assigned_accessories": False}
    with pytest.raises(HTTPException) as exc:
        ah._process_stock_snapshot(_lubricant_snapshot(), "ST001", {}, assignment, "user")
    assert exc.value.status_code == 400
    assert "Lubricants" in exc.value.detail


def test_unassigned_attendant_accessories_submission_rejected():
    assignment = {"assigned_lpg": False, "assigned_lubricants": False, "assigned_accessories": False}
    with pytest.raises(HTTPException) as exc:
        ah._process_stock_snapshot(_accessory_snapshot(), "ST001", {}, assignment, "user")
    assert exc.value.status_code == 400
    assert "Accessories" in exc.value.detail


def test_assigned_attendant_lpg_submission_succeeds():
    assignment = {"assigned_lpg": True, "assigned_lubricants": False, "assigned_accessories": False}
    lpg_sales, lub_sales, acc_sales, enriched, flags = ah._process_stock_snapshot(
        _lpg_snapshot(), "ST001", {}, assignment, "user")
    assert enriched is not None
    assert len(enriched["lpg_cylinders"]) == 1


def test_supervisor_bypasses_assignment_check():
    # A supervisor's own personal-shift assignment record has never been required to carry
    # these flags — the frontend has always shown/submitted these sections for non-attendants
    # regardless. role != "user" must skip enforcement entirely.
    assignment = {"assigned_lpg": False, "assigned_lubricants": False, "assigned_accessories": False}
    lpg_sales, lub_sales, acc_sales, enriched, flags = ah._process_stock_snapshot(
        _lpg_snapshot(), "ST001", {}, assignment, "supervisor")
    assert enriched is not None
    assert len(enriched["lpg_cylinders"]) == 1


def test_empty_categories_never_raise_when_not_assigned():
    # No rows submitted for any category, and not assigned to any — nothing to violate.
    assignment = {"assigned_lpg": False, "assigned_lubricants": False, "assigned_accessories": False}
    lpg_sales, lub_sales, acc_sales, enriched, flags = ah._process_stock_snapshot(
        ShiftStockSnapshot(), "ST001", {}, assignment, "user")
    assert enriched is not None
    assert enriched["lpg_cylinders"] == []


def test_assigned_attendant_missing_lpg_submission_rejected():
    # Assigned to LPG but the submission's lpg_cylinders list is empty — must be rejected,
    # the same way a nozzle reading missing from an assigned nozzle set is rejected.
    assignment = {"assigned_lpg": True, "assigned_lubricants": False, "assigned_accessories": False}
    with pytest.raises(HTTPException) as exc:
        ah._process_stock_snapshot(ShiftStockSnapshot(), "ST001", {}, assignment, "user")
    assert exc.value.status_code == 400
    assert "Missing LPG" in exc.value.detail


def test_assigned_attendant_missing_lubricants_submission_rejected():
    assignment = {"assigned_lpg": False, "assigned_lubricants": True, "assigned_accessories": False}
    with pytest.raises(HTTPException) as exc:
        ah._process_stock_snapshot(ShiftStockSnapshot(), "ST001", {}, assignment, "user")
    assert exc.value.status_code == 400
    assert "Missing Lubricants" in exc.value.detail


def test_assigned_attendant_missing_accessories_submission_rejected():
    assignment = {"assigned_lpg": False, "assigned_lubricants": False, "assigned_accessories": True}
    with pytest.raises(HTTPException) as exc:
        ah._process_stock_snapshot(ShiftStockSnapshot(), "ST001", {}, assignment, "user")
    assert exc.value.status_code == 400
    assert "Missing Accessories" in exc.value.detail


def test_assigned_attendant_missing_submission_rejected_even_when_snapshot_is_none():
    # stock_snapshot itself can be omitted entirely (it's Optional at the model level) —
    # the missing-submission check must still fire, not just when an empty list is sent.
    assignment = {"assigned_lpg": True, "assigned_lubricants": False, "assigned_accessories": False}
    with pytest.raises(HTTPException) as exc:
        ah._process_stock_snapshot(None, "ST001", {}, assignment, "user")
    assert exc.value.status_code == 400
    assert "Missing LPG" in exc.value.detail


def test_confirmed_no_sales_still_satisfies_the_completeness_check():
    # The "Confirm No Sales" flow in my-shift.tsx sets closing == opening but keeps every
    # row present — a quiet shift must not be indistinguishable from a skipped submission.
    assignment = {"assigned_lpg": True, "assigned_lubricants": False, "assigned_accessories": False}
    quiet_snapshot = ShiftStockSnapshot(lpg_cylinders=[
        LPGStockLineItem(size_kg=9, opening_full=10, opening_empty=2, closing_full=10, closing_empty=2),
    ])
    lpg_sales, lub_sales, acc_sales, enriched, flags = ah._process_stock_snapshot(
        quiet_snapshot, "ST001", {}, assignment, "user")
    assert enriched is not None
    assert len(enriched["lpg_cylinders"]) == 1


def test_supervisor_missing_stock_not_rejected():
    # role != "user" skips the completeness check too, same as the assignment-mismatch check.
    assignment = {"assigned_lpg": True, "assigned_lubricants": True, "assigned_accessories": True}
    lpg_sales, lub_sales, acc_sales, enriched, flags = ah._process_stock_snapshot(
        None, "ST001", {}, assignment, "supervisor")
    assert enriched is None
