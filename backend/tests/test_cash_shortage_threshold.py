"""
Tests for the configurable cash-shortage threshold (P1-4).

The threshold defaults to 500 ZMW but is read per-station from
fuel_settings.cash_shortage_threshold, so a high-volume station can raise it
(and a small one can lower it) without code changes.
"""
from app.api.v1.attendant_handover import _cash_shortage_threshold, _compute_auto_flags


def test_threshold_defaults_to_500():
    assert _cash_shortage_threshold({}) == 500
    assert _cash_shortage_threshold({"fuel_settings": {}}) == 500


def test_threshold_reads_from_settings():
    storage = {"fuel_settings": {"cash_shortage_threshold": 1500}}
    assert _cash_shortage_threshold(storage) == 1500


def test_default_flags_700_shortage():
    # 700 over the default 500 threshold -> flagged
    flags, status = _compute_auto_flags(-700, [], False, {})
    assert "cash_shortage" in flags
    assert status == "flagged"


def test_raised_threshold_does_not_flag_700():
    storage = {"fuel_settings": {"cash_shortage_threshold": 1000}}
    flags, status = _compute_auto_flags(-700, [], False, storage)
    assert "cash_shortage" not in flags
    assert status == "submitted"


def test_lowered_threshold_flags_300():
    storage = {"fuel_settings": {"cash_shortage_threshold": 200}}
    flags, _ = _compute_auto_flags(-300, [], False, storage)
    assert "cash_shortage" in flags


def test_overage_also_flags():
    # Symmetric: a large cash *overage* flags too (abs difference).
    flags, _ = _compute_auto_flags(800, [], False, {})
    assert "cash_shortage" in flags
