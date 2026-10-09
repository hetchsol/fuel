"""
Empty LPG cylinders at shift close: refills and trade-ins bring empties back,
so a close with either must carry an empties count. Without either, an
uncounted row is taken as the expected figure, never as 0.

Persistence is in memory so these tests never touch the station files on disk.
"""
import pytest
from fastapi import HTTPException

from app.api.v1 import attendant_handover as ah
from app.models.models import ShiftStockSnapshot

ST = "ST_TEST_EMPTIES"


@pytest.fixture
def mem(monkeypatch):
    files: dict = {}

    def load(station_id, name, default=None):
        import copy
        return copy.deepcopy(files.get((station_id, name), default))

    def save(station_id, name, data):
        import copy
        files[(station_id, name)] = copy.deepcopy(data)

    monkeypatch.setattr(ah, "load_station_json", load)
    monkeypatch.setattr(ah, "save_station_json", save)
    monkeypatch.setattr(ah, "load_lubricant_catalog", lambda station_id: [])
    return files


def _process(row, trades=None):
    snap = ShiftStockSnapshot(lpg_cylinders=[row], lpg_trades=trades or [])
    _, _, _, enriched, flags = ah._process_stock_snapshot(snap, ST, {}, None, "supervisor")
    return enriched["lpg_cylinders"][0], flags


def _row(**kw):
    base = {"size_kg": 9, "opening_full": 10, "opening_empty": 4}
    base.update(kw)
    return base


def test_refills_without_empties_count_refused(mem):
    with pytest.raises(HTTPException) as e:
        _process(_row(sold_refill=3, closing_full=7))
    assert e.value.status_code == 400
    assert "9kg empty" in e.value.detail


def test_trade_in_without_empties_count_refused(mem):
    trades = [{"from_size_kg": 9, "to_size_kg": 6, "quantity": 1}]
    with pytest.raises(HTTPException):
        _process(_row(closing_full=10), trades)


def test_counted_empties_match_expected(mem):
    row, flags = _process(_row(sold_refill=3, closing_full=7, closing_empty=7))
    assert row["closing_empty"] == 7
    assert row["expected_closing_empty"] == 7
    assert row["empty_variance"] == 0
    assert not [f for f in flags if "empty" in f]


def test_counted_empties_short_flags_variance(mem):
    row, flags = _process(_row(sold_refill=3, closing_full=7, closing_empty=5))
    assert row["empty_variance"] == 2
    assert any("9kg empty: variance 2" in f for f in flags)


def test_uncounted_quiet_row_carries_expected_not_zero(mem):
    row, flags = _process(_row(closing_full=10))
    assert row["closing_empty"] == 4
    assert row["empty_variance"] == 0
    assert not [f for f in flags if "empty" in f]


def test_explicit_zero_is_a_count(mem):
    row, flags = _process(_row(sold_refill=2, closing_full=8, closing_empty=0))
    assert row["closing_empty"] == 0
    assert row["empty_variance"] == 6
