"""
Shift-start stock count: the attendant confirms or corrects the system count,
mid-shift Stores issues become additions, a manager resolves differences, and
going live freezes pre-existing handovers' stock effect.

All persistence is replaced by an in-memory dict so these tests never touch
the station files on disk.
"""
import pytest
from fastapi import HTTPException

from app.services import stock_service as svc
from app.services.shift_validation import validate_unique_category_assignment
from app.api.v1 import attendant_handover as ah
from app.models.models import ShiftStockSnapshot

ST = "ST_TEST_OSC"


@pytest.fixture
def mem(monkeypatch):
    files: dict = {}

    def load(station_id, name, default=None):
        import copy
        return copy.deepcopy(files.get((station_id, name), default))

    def save(station_id, name, data):
        import copy
        files[(station_id, name)] = copy.deepcopy(data)

    monkeypatch.setattr(svc, "load_station_json", load)
    monkeypatch.setattr(svc, "save_station_json", save)
    monkeypatch.setattr(ah, "load_station_json", load)
    monkeypatch.setattr(ah, "save_station_json", save)
    monkeypatch.setattr(svc, "log_audit_event", lambda **k: None)
    monkeypatch.setattr(svc, "create_notification", lambda **k: None)
    monkeypatch.setattr(ah, "create_notification", lambda **k: None)
    return files


def _item(category, code, stores=0, forecourt=0):
    svc.upsert_item(ST, category, code, f"{category} {code}")
    items = svc.load_items(ST)
    key = f"{category}:{code}"
    items[key]["stores"] = stores
    items[key]["forecourt"] = forecourt
    svc.save_items(ST, items)
    return key


# ── category assignment rule ────────────────────────────────────────

def test_one_attendant_per_category():
    validate_unique_category_assignment([
        {"attendant_name": "A", "assigned_lpg": True},
        {"attendant_name": "B", "assigned_accessories": True},
    ])
    clash = [
        {"attendant_name": "A", "assigned_lpg": True},
        {"attendant_name": "B", "assigned_lpg": True},
    ]
    with pytest.raises(ValueError, match="LPG"):
        validate_unique_category_assignment(clash)
    # A shift saved with the clash before the rule existed can still be edited
    validate_unique_category_assignment(clash, existing=clash)
    with pytest.raises(ValueError, match="Accessories"):
        validate_unique_category_assignment(
            clash + [{"attendant_name": "A", "assigned_accessories": True},
                     {"attendant_name": "B", "assigned_accessories": True}],
            existing=clash)


# ── additions ───────────────────────────────────────────────────────

def test_additions_count_manager_movements_only(mem):
    oil = _item("lubricant", "OIL1", stores=10, forecourt=2)
    full = _item("cylinder_full", "9kg", stores=5, forecourt=3)
    empty = _item("cylinder_empty", "9kg", forecourt=4)

    svc.issue(ST, oil, 4, "mgr")                        # +4
    svc.return_to_store(ST, oil, 1, "mgr")              # -1
    svc.record_sale(ST, oil, 2, ref="HO-x")             # attendant sale: not an addition
    svc.adjust(ST, oil, "forecourt", 9, "mgr", "count")  # correction: not an addition
    svc.issue(ST, full, 2, "mgr")                       # +2
    svc.return_to_supplier(ST, empty, 3, "forecourt", "Afrox", "", "mgr")  # -3 empties

    adds = svc.forecourt_additions(ST, "2000-01-01T00:00:00")
    assert adds == {oil: 3, full: 2, empty: -3}

    # Nothing after the window closes counts
    assert svc.forecourt_additions(ST, "2000-01-01T00:00:00", "2000-01-02T00:00:00") == {}


# ── resolving a count difference ────────────────────────────────────

def _variance(live=True, system=8, counted=6):
    vid = "OSV-SH1-U1-cylinder_full:9kg"
    svc.save_opening_variances(ST, {vid: {
        "variance_id": vid, "shift_id": "SH1", "attendant_name": "Att",
        "item_key": "cylinder_full:9kg", "label": "9kg full",
        "system_qty": system, "counted_qty": counted, "forecourt_live": live, "status": "pending",
    }})
    return vid


def test_resolve_moves_forecourt_by_confirmed_minus_system(mem):
    key = _item("cylinder_full", "9kg", forecourt=5)  # 3 sold since the count was taken
    vid = _variance(system=8, counted=6)

    with pytest.raises(HTTPException):
        svc.resolve_opening_variance(ST, vid, None, "previous_shift", "", "mgr")  # note required

    v = svc.resolve_opening_variance(ST, vid, None, "previous_shift", "Two missing at handover", "mgr")
    assert v["status"] == "resolved" and v["confirmed_qty"] == 6
    assert svc.load_items(ST)[key]["forecourt"] == 3  # 5 + (6 - 8), sales since then kept

    with pytest.raises(HTTPException):
        svc.resolve_opening_variance(ST, vid, None, "previous_shift", "again", "mgr")


def test_manager_recount_overrides_attendant_count(mem):
    key = _item("cylinder_full", "9kg", forecourt=8)
    vid = _variance(system=8, counted=6)
    v = svc.resolve_opening_variance(ST, vid, 8, "this_attendant", "Recounted, all 8 there", "mgr")
    assert v["responsibility"] == "this_attendant"
    assert svc.load_items(ST)[key]["forecourt"] == 8  # system was right; nothing moves


def test_resolve_before_go_live_does_not_move_stock(mem):
    key = _item("cylinder_full", "9kg", forecourt=5)
    vid = _variance(live=False)
    svc.resolve_opening_variance(ST, vid, None, "stores_error", "noted", "mgr")
    assert svc.load_items(ST)[key]["forecourt"] == 5


# ── forward-only after go-live ──────────────────────────────────────

def _go_live():
    svc.save_station_json(ST, svc.SETTINGS_FILE, {"forecourt_live_since": "2026-10-08T14:00:00"})


def test_before_go_live_handovers_move_stock_as_before(mem):
    key = _item("lubricant", "OIL1", forecourt=10)
    h = {"handover_id": "HO-1", "stock_snapshot": {"lubricants": [{"product_code": "OIL1", "sold": 3}]}}
    assert svc.apply_handover_sales(ST, h)["applied"] is True
    assert svc.load_items(ST)[key]["forecourt"] == 7


def test_pre_go_live_handover_never_moves_live_stock(mem):
    key = _item("lubricant", "OIL1", forecourt=10)
    _go_live()
    # A historical record, untouched by go-live: no counts_live on it
    old = {"handover_id": "HO-old", "stock_snapshot": {"lubricants": [{"product_code": "OIL1", "sold": 3}]}}
    assert svc.apply_handover_sales(ST, old)["applied"] is False   # late approval
    old["stock_applied"] = True
    assert svc.reverse_handover_sales(ST, old)["reversed"] is False  # void / supersede
    assert svc.load_items(ST)[key]["forecourt"] == 10
    assert "stock_applied" in old and "counts_live" not in old       # record not stamped

    new = {"handover_id": "HO-new", "counts_live": True,
           "stock_snapshot": {"lubricants": [{"product_code": "OIL1", "sold": 3}]}}
    assert svc.apply_handover_sales(ST, new)["applied"] is True
    assert svc.load_items(ST)[key]["forecourt"] == 7


def test_daily_entry_correction_before_go_live_date_moves_nothing(mem):
    key = _item("lubricant", "OIL1", forecourt=10)
    _go_live()
    svc.sync_forecourt_deltas(ST, {key: 1}, {key: 4}, entry_date="2026-10-07")
    assert svc.load_items(ST)[key]["forecourt"] == 10
    svc.sync_forecourt_deltas(ST, {key: 1}, {key: 4}, entry_date="2026-10-09")
    assert svc.load_items(ST)[key]["forecourt"] == 7


def test_shift_counts_live_is_decided_by_when_the_shift_started(mem):
    _go_live()
    ah._save_opening_verifications({
        "OLD-U1": {"verified_at": "2026-10-08T06:00:00"},
        "NEW-U1": {"verified_at": "2026-10-08T14:05:00", "stock_opening": {"live": True}},
        "NOSTOCK-U1": {"verified_at": "2026-10-08T14:05:00"},
    }, ST)
    assert ah._shift_counts_live(ST, {}, "OLD", "U1") is False      # resubmitted correction of an old shift
    assert ah._shift_counts_live(ST, {}, "NEW", "U1") is True
    assert ah._shift_counts_live(ST, {}, "NOSTOCK", "U1") is True
    assert ah._shift_counts_live(ST, {}, "MISSING", "U1") is False
    assert ah._shift_counts_live(ST, {"is_retrospective": True, "date": "2026-10-07"}, "R", "U1") is False
    assert ah._shift_counts_live(ST, {"is_retrospective": True, "date": "2026-10-09"}, "R", "U1") is True


# ── recording the shift-start count ─────────────────────────────────

SYSTEM = {
    "lpg_cylinders": [{"size_kg": 9, "opening_full": 8, "opening_empty": 2, "source": "forecourt"}],
    "accessories": [{"product_code": "REG", "description": "Regulator", "opening_stock": 5}],
    "lubricants": [],
    "previous_handovers": {"lpg": "HO-prev"},
    "previous_attendants": {"lpg": "Prev Att"},
}
SHIFT = {"shift_id": "SH1", "date": "2026-10-08", "shift_type": "Day"}
CTX = {"user_id": "U1", "full_name": "Att One"}


@pytest.fixture
def system(monkeypatch, mem):
    monkeypatch.setattr(ah, "_compute_stock_opening", lambda *a, **k: SYSTEM)
    monkeypatch.setattr(ah, "forecourt_live_since", lambda s: "2026-10-01T00:00:00")
    return mem


def test_no_stock_category_needs_no_count(system):
    assert ah._record_stock_count(ST, {}, SHIFT, {"assigned_lpg": False}, None, CTX, "t") is None


def test_count_is_required_for_assigned_category(system):
    with pytest.raises(HTTPException, match="Confirm the opening stock count"):
        ah._record_stock_count(ST, {}, SHIFT, {"assigned_lpg": True}, None, CTX, "t")
    with pytest.raises(HTTPException, match="9kg"):
        ah._record_stock_count(ST, {}, SHIFT, {"assigned_lpg": True}, {"lpg_cylinders": []}, CTX, "t")


def test_matching_count_is_a_confirmation(system):
    block = ah._record_stock_count(
        ST, {}, SHIFT, {"assigned_lpg": True},
        {"lpg_cylinders": [{"size_kg": 9, "counted_full": 8, "counted_empty": 2}]}, CTX, "t")
    assert block["differences"] == 0 and block["live"] is True
    assert block["lpg"] == [{"size_kg": 9, "system_full": 8, "system_empty": 2, "counted_full": 8, "counted_empty": 2}]
    assert svc.load_opening_variances(ST) == {}


def test_difference_needs_note_and_opens_review(system):
    counts = {"lpg_cylinders": [{"size_kg": 9, "counted_full": 7, "counted_empty": 2}],
              "accessories": [{"product_code": "REG", "counted": 5}]}
    assignment = {"assigned_lpg": True, "assigned_accessories": True}
    with pytest.raises(HTTPException, match="Add a note"):
        ah._record_stock_count(ST, {}, SHIFT, assignment, counts, CTX, "t")

    block = ah._record_stock_count(ST, {}, SHIFT, assignment, {**counts, "note": "one short"}, CTX, "t")
    assert block["differences"] == 1
    (v,) = svc.load_opening_variances(ST).values()
    assert v["item_key"] == "cylinder_full:9kg"
    assert (v["system_qty"], v["counted_qty"], v["difference"]) == (8, 7, -1)
    assert v["previous_handover_id"] == "HO-prev" and v["status"] == "pending"


def test_negative_or_fractional_count_rejected(system):
    for bad in (-1, 1.5, "x"):
        with pytest.raises(HTTPException):
            ah._record_stock_count(
                ST, {}, SHIFT, {"assigned_lpg": True},
                {"lpg_cylinders": [{"size_kg": 9, "counted_full": bad, "counted_empty": 2}], "note": "n"}, CTX, "t")


# ── stamping the submission ─────────────────────────────────────────

def test_submission_uses_confirmed_count_and_server_additions(mem):
    oil = _item("lubricant", "OIL1", stores=10, forecourt=0)
    ah._save_opening_verifications({"SH1-U1": {
        "verified_at": "2000-01-01T00:00:00",
        "stock_opening": {"live": True,
                          "lpg": [{"size_kg": 9, "system_full": 8, "system_empty": 2, "counted_full": 7, "counted_empty": 2}],
                          "accessories": [], "lubricants": [{"product_code": "OIL1", "system": 0, "counted": 0}]},
    }}, ST)
    svc.issue(ST, oil, 6, "mgr")

    snap = ShiftStockSnapshot(**{
        "lpg_cylinders": [{"size_kg": 9, "opening_full": 99, "opening_empty": 99, "additions": 50,
                           "closing_full": 7, "closing_empty": 2}],
        "lubricants": [{"product_code": "OIL1", "description": "Oil", "opening_stock": 40, "additions": 0,
                        "sold": 4, "closing_stock": 2}],
    })
    flags = ah._stamp_stock_opening(snap, ST, "SH1", "U1")
    assert flags == []
    lpg, lub = snap.lpg_cylinders[0], snap.lubricants[0]
    assert (lpg.opening_full, lpg.opening_empty, lpg.additions) == (7, 2, 0)   # browser values replaced
    assert (lub.opening_stock, lub.additions) == (0, 6)

    # The additions window closes at first submission
    until = ah._load_opening_verifications(ST)["SH1-U1"]["additions_until"]
    assert until
    svc.issue(ST, oil, 1, "mgr")
    ah._stamp_stock_opening(snap, ST, "SH1", "U1")
    assert snap.lubricants[0].additions == 6


def test_shift_started_before_counts_keeps_old_behaviour(mem):
    ah._save_opening_verifications({"SH1-U1": {"verified_at": "2000-01-01T00:00:00"}}, ST)
    snap = ShiftStockSnapshot(**{"accessories": [{"product_code": "REG", "description": "R", "opening_stock": 5}]})
    assert ah._stamp_stock_opening(snap, ST, "SH1", "U1") == []
    assert snap.accessories[0].opening_stock == 5


# ── manager view of one attendant's opening ─────────────────────────

def test_attendant_opening_view(system, monkeypatch):
    import asyncio
    monkeypatch.setattr(ah, "_load_enter_readings", lambda st: {
        "AR-SH1-U1-O": {"nozzle_readings": [{"nozzle_id": "N1", "electronic_reading": 100.5, "mechanical_reading": 99.0}]}})
    monkeypatch.setattr(ah, "_find_previous_shift_readings", lambda *a: {"N2": {"electronic": 50.0, "mechanical": 49.0}})
    monkeypatch.setattr(ah, "get_nozzle", lambda nid, storage=None: {"nozzle_id": nid, "display_label": nid})
    monkeypatch.setattr(ah, "_get_fuel_type", lambda nid, storage=None: "Diesel")
    monkeypatch.setattr(ah, "get_active_handover", lambda *a, **k: None)
    storage = {"shifts": {"SH1": {"date": "2026-10-08", "shift_type": "Day", "assignments": [
        {"attendant_id": "U1", "attendant_name": "Att One", "nozzle_ids": ["N1", "N2"], "assigned_lpg": True}]}},
        "islands": {}}
    ctx = {"station_id": ST, "storage": storage}

    # Before the attendant starts: system figures, not started
    out = asyncio.run(ah.get_attendant_opening("SH1", "U1", ctx))
    assert out["started"] is False and out["stock_count_confirmed"] is False
    assert [(n["nozzle_id"], n["electronic"], n["source"]) for n in out["nozzles"]] == [
        ("N1", 100.5, "attendant_entry"), ("N2", 50.0, "previous_shift")]
    assert [(s["label"], s["system"]) for s in out["stock"]] == [("9kg full", 8), ("9kg empty", 2)]

    # After a count with a difference
    ah._record_stock_count(ST, storage, {**storage["shifts"]["SH1"], "shift_id": "SH1"}, {"assigned_lpg": True},
                           {"lpg_cylinders": [{"size_kg": 9, "counted_full": 7, "counted_empty": 2}], "note": "short"},
                           CTX, "2000-01-01T00:00:00")
    block = svc.load_opening_variances(ST)
    # verify-opening stores the count on the verification record like this
    ah._save_opening_verifications({"SH1-U1": {"verified_at": "2000-01-01T00:00:00", "stock_opening": {
        "live": True, "note": "short",
        "lpg": [{"size_kg": 9, "system_full": 8, "system_empty": 2, "counted_full": 7, "counted_empty": 2}],
        "accessories": [], "lubricants": []}}}, ST)
    out = asyncio.run(ah.get_attendant_opening("SH1", "U1", ctx))
    assert out["started"] is True and out["stock_count_confirmed"] is True
    full = out["stock"][0]
    assert (full["system"], full["counted"], full["review"]["status"]) == (8, 7, "pending")
    assert out["stock"][1]["review"] is None
    assert len(block) == 1

    with pytest.raises(HTTPException):
        asyncio.run(ah.get_attendant_opening("SH1", "NOBODY", ctx))
