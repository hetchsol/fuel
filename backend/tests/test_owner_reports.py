"""
Owner reports: attendant scorecard, payment totals by provider, stock losses.
All data is in memory; nothing on disk is read or written.
"""
import copy

import pytest

from app.api.v1 import owner_reports as rep
from app.api.v1 import attendant_handover as ah
from app.services import stock_service as svc
from app.services import safe_deposit_service as deps

ST = "ST_TEST_REP"


@pytest.fixture
def mem(monkeypatch):
    files: dict = {}

    def load(station_id, name, default=None):
        return copy.deepcopy(files.get((station_id, name), default))

    def save(station_id, name, data):
        files[(station_id, name)] = copy.deepcopy(data)

    for mod in (rep, svc, deps):
        monkeypatch.setattr(mod, "load_station_json", load)
        if hasattr(mod, "save_station_json"):
            monkeypatch.setattr(mod, "save_station_json", save)
    monkeypatch.setattr(svc, "log_audit_event", lambda **k: None)
    monkeypatch.setattr(rep, "is_handover_canonical", lambda h: not h.get("superseded_by"))
    monkeypatch.setattr(rep, "load_lubricant_catalog", lambda st: [
        {"product_code": "OIL1", "description": "Engine Oil 1L", "selling_price": 100}])
    monkeypatch.setattr(rep, "load_accessories_catalog", lambda st: [
        {"product_code": "REG", "description": "Regulator", "selling_price": 250}])
    monkeypatch.setattr(rep, "load_lpg_pricing", lambda st: {})
    monkeypatch.setattr(rep, "get_pricing_for_size", lambda size, db: {
        "size_kg": size, "price_refill": 400, "price_with_cylinder": 1000})
    return files


def ho(hid, att, name, date, diff=0.0, **extra):
    return {"handover_id": hid, "shift_id": f"{date}-Day", "date": date, "shift_type": "Day",
            "attendant_id": att, "attendant_name": name, "phase": "completed", "review_status": "approved",
            "total_expected": 5000, "difference": diff, **extra}


STORAGE = {"shifts": {"2026-10-08-Day": {"date": "2026-10-08", "shift_type": "Day", "assignments": [
    {"attendant_id": "A", "attendant_name": "Att A"}, {"attendant_id": "B", "attendant_name": "Att B"}]}},
    "fuel_settings": {"cash_shortage_threshold": 500}}
CTX = {"station_id": ST, "storage": STORAGE}


def test_scorecard(mem):
    mem[(ST, "attendant_handovers.json")] = {
        "H1": ho("H1", "A", "Att A", "2026-10-08", -700, auto_flag_reasons=["cash_shortage", "LPG 9kg filled: variance 1"],
                 stock_snapshot={"lubricants": [{"product_code": "OIL1", "variance": 2, "unit_price": 100}]}),
        "H2": ho("H2", "B", "Att B", "2026-10-08", 50),
        "HV": ho("HV", "A", "Att A", "2026-10-08", -9999, review_status="voided"),   # left out
        "HS": ho("HS", "A", "Att A", "2026-10-08", -9999, superseded_by="H1"),      # left out
        "HO": ho("HO", "A", "Att A", "2026-09-01", -100),                            # out of range
    }
    mem[(ST, "opening_stock_variances.json")] = {
        "v1": {"date": "2026-10-08", "attendant_id": "A", "attendant_name": "Att A", "responsibility": "this_attendant"},
        "v2": {"date": "2026-10-08", "attendant_id": "A", "attendant_name": "Att A", "status": "pending"}}
    mem[(ST, "safe_deposits.json")] = {"2026-10-08-Day": {"deposits": [
        {"attendant_id": "A", "attendant_name": "Att A", "amount": 1000},
        {"attendant_id": "A", "attendant_name": "Att A", "amount": 300, "voided": True},
        {"attendant_id": "B", "attendant_name": "Att B", "amount": 200,
         "reassignments": [{"from_attendant_id": "A", "from_attendant_name": "Att A"}]}]}}
    mem[(ST, "notifications.json")] = [{"type": "DEPOSIT_OVERDUE", "entity_id": "2026-10-08-Day-B"}]

    out = rep.attendant_scorecard("2026-10-01", "2026-10-31", CTX)
    a, b = out["attendants"]                       # biggest shortfall first
    assert (a["attendant_id"], a["shifts_closed"], a["cash_short"], a["net_cash"]) == ("A", 1, 700, -700)
    assert a["shifts_short_over_threshold"] == 1
    assert (a["stock_short_units"], a["stock_short_value"]) == (2, 200)
    assert (a["count_differences"], a["count_differences_their_responsibility"]) == (2, 1)
    assert a["flags"] == {"cash_shortage": 1, "stock_difference": 1}
    assert (a["deposits"], a["deposit_total"], a["deposits_voided"], a["deposits_moved_away"]) == (1, 1000, 1, 1)
    assert (b["cash_over"], b["deposits"], b["overdue_reminders"]) == (50, 1, 1)


def test_payment_totals(mem, monkeypatch):
    monkeypatch.setattr(ah, "_pos_rules", lambda st: ({"pos"}, {}))
    monkeypatch.setattr(ah, "_shift_pos_check", lambda st, storage, sid: {
        "status": "match", "slips_total": 1500, "machine_total": 1500, "difference": 0})
    mem[(ST, "attendant_handovers.json")] = {
        "H1": ho("H1", "A", "Att A", "2026-10-08", pos_breakdown=[
            {"type_id": "pos", "type_name": "POS", "bank": "ZANACO", "reference": "R1", "amount": 500},
            {"type_id": "pos", "type_name": "POS", "bank": None, "reference": "R2", "amount": 1000},
            {"type_id": "momo_mtn", "type_name": "MoMo (MTN)", "bank": "ZANACO", "reference": "", "amount": 80}]),
        "HV": ho("HV", "B", "Att B", "2026-10-08", review_status="voided", pos_breakdown=[
            {"type_id": "pos", "type_name": "POS", "reference": "X", "amount": 999}]),
    }
    out = rep.payment_totals("2026-10-01", "2026-10-31", CTX)
    by = {b["label"]: b for b in out["by_type"]}
    assert by["POS (bank not specified)"]["amount"] == 1000
    assert by["POS (ZANACO)"]["amount"] == 500
    assert by["MoMo (MTN)"] == {"label": "MoMo (MTN)", "amount": 80, "slips": 1, "without_reference": 1}  # bank ignored off-card
    assert len(out["slips"]) == 3
    assert out["card_checks"][0]["status"] == "match"


def test_stock_losses(mem):
    mem[(ST, "stock_movements.json")] = [
        {"timestamp": "2026-10-08T09:00:00", "type": "damage", "item_key": "lubricant:OIL1", "qty": 1},
        {"timestamp": "2026-10-08T10:00:00", "type": "adjust", "item_key": "lubricant:OIL1", "qty": -3, "note": "Stock take ST-1"},
        {"timestamp": "2026-10-08T11:00:00", "type": "adjust", "item_key": "lubricant:OIL1", "qty": 1, "note": "Shift-start count"},
        {"timestamp": "2026-10-08T12:00:00", "type": "adjust", "item_key": "lubricant:OIL1", "qty": -50, "note": "Forecourt go-live: last shift closing count"},
        {"timestamp": "2026-10-08T13:00:00", "type": "sale", "item_key": "lubricant:OIL1", "qty": 9},
    ]
    mem[(ST, "attendant_handovers.json")] = {
        "H1": ho("H1", "A", "Att A", "2026-10-08", stock_snapshot={
            "lubricants": [{"product_code": "OIL1", "damaged": 1, "variance": 2}],
            "lpg_cylinders": [{"size_kg": 9, "variance": 1, "empty_variance": 0}]}),
    }
    out = rep.stock_losses("2026-10-01", "2026-10-31", CTX)
    rows = {r["item_key"]: r for r in out["rows"]}
    oil = rows["lubricant:OIL1"]
    assert (oil["written_off"], oil["count_corrections_lost"], oil["found"]) == (2, 3, 1)  # go-live and sales left out
    assert (oil["lost_value"], oil["found_value"], oil["net_lost_value"]) == (500, 100, 400)
    assert (oil["closing_shortfall"], oil["closing_shortfall_value"]) == (2, 200)        # reported, not added
    cyl = rows["cylinder_full:9kg"]
    assert (cyl["lost"], cyl["closing_shortfall_value"]) == (0, 1000)
    assert out["months"] == [{"month": "2026-10", "lost_value": 500, "found_value": 100,
                              "net_lost_value": 400, "closing_shortfall_value": 1200}]
