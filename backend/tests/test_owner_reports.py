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


# ── the other owner tools ───────────────────────────────────────────

def test_fuel_losses(mem, monkeypatch):
    import app.services.tank_movement as tm
    monkeypatch.setattr(tm, "get_pass_threshold", lambda: 0.5)
    monkeypatch.setattr(tm, "get_warning_threshold", lambda: 1.0)
    mem[(ST, "tank_readings.json")] = {
        "r1": {"tank_id": "T1", "date": "2026-10-06", "shift_type": "Day", "tank_volume_movement": 1000,
               "total_electronic_dispensed": 990, "price_per_liter": 30},          # 1% loss -> warning
        "r2": {"tank_id": "T1", "date": "2026-10-07", "shift_type": "Day", "tank_volume_movement": 1000,
               "total_electronic_dispensed": 980, "price_per_liter": 30},          # 2% -> over
        "r3": {"tank_id": "T1", "date": "2026-10-08", "shift_type": "Day"},        # not worked out: skipped
    }
    storage = {"tanks": {"T1": {"name": "Diesel Tank", "fuel_type": "Diesel"}}}
    out = rep.fuel_losses_data(ST, storage, "2026-10-01", "2026-10-31")
    (t,) = out["tanks"]
    assert (t["loss_litres"], t["loss_percent"], t["loss_value"], t["shifts"], t["shifts_over"]) == (30, 1.5, 900, 2, 1)
    assert [s["status"] for s in out["shifts"]] == ["over", "warning"]
    assert out["weeks"][0]["week_start"] == "2026-10-05"


def test_credit_exposure(mem):
    storage = {"accounts": {
        "P1": {"account_name": "Post Co", "account_type": "Post-Paid", "current_balance": 1500, "credit_limit": 1000},
        "Q1": {"account_name": "Pre Co", "account_type": "Pre-Paid", "current_balance": 0, "opening_balance": 500},
    }, "credit_sales": [
        {"account_id": "P1", "date": "2026-10-01", "amount": 1000},
        {"account_id": "P1", "date": "2026-07-01", "amount": 800},
        {"account_id": "P1", "date": "2026-06-01", "amount": 999, "voided": True},
    ]}
    mem[(ST, "audit_log.json")] = [{"action": "account_payment", "entity_id": "P1", "timestamp": "2026-09-01T10:00:00"}]
    out = rep.credit_exposure_data(ST, storage, today="2026-10-08")
    p, q = out["accounts"]
    assert (p["status"], p["owed"], p["available"], p["last_payment"]) == ("over_limit", 1500, -500, "2026-09-01")
    assert p["aging"] == {"0-30": 1000, "31-60": 0, "61-90": 0, "90+": 500}     # newest sales are the unpaid ones
    assert p["oldest_unpaid_days"] == 99
    assert q["status"] == "empty"


def test_banking(mem):
    mem[(ST, "attendant_handovers.json")] = {
        "H1": ho("H1", "A", "Att A", "2026-10-07", actual_cash=3000),
        "H2": ho("H2", "A", "Att A", "2026-10-08", actual_cash=2000),
    }
    mem[(ST, "daily_close_offs.json")] = {"2026-10-07": {"summary": {"total_actual_cash": 3000},
                                                        "bank_deposit": {"amount": 2900, "reference": "DEP1"}}}
    out = rep.banking_data(ST, "2026-10-01", "2026-10-31")
    d8, d7 = out["days"]
    assert (d7["gap"], d7["running_gap"], d7["reference"]) == (-100, -100, "DEP1")
    assert (d8["closed"], d8["banked"], d8["gap"], d8["running_gap"]) == (False, None, -2000, -2100)
    assert out["days_not_closed"] == 1


def test_reorder(mem):
    mem[(ST, "stock_items.json")] = {
        "lubricant:OIL1": {"item_key": "lubricant:OIL1", "name": "Engine Oil 1L", "category": "lubricant",
                           "stores": 4, "forecourt": 2, "reorder_level": 5, "reorder_qty": 12},
        "lpg_accessory:REG": {"item_key": "lpg_accessory:REG", "name": "Regulator", "category": "lpg_accessory",
                              "stores": 50, "forecourt": 5, "reorder_level": 5, "reorder_qty": 10},
        "cylinder_empty:9kg": {"item_key": "cylinder_empty:9kg", "category": "cylinder_empty", "stores": 0, "forecourt": 9},
    }
    mem[(ST, "stock_movements.json")] = [
        {"timestamp": "2026-10-01T09:00:00", "type": "sale", "item_key": "lubricant:OIL1", "qty": 28},
        {"timestamp": "2026-10-01T09:00:00", "type": "sale", "item_key": "lpg_accessory:REG", "qty": 2},
    ]
    out = rep.reorder_data(ST, days=28, cover_days=14, today="2026-10-08")
    oil, reg = out["items"]
    assert (oil["per_day"], oil["days_cover"], oil["suggested_order"], oil["suggested_value"]) == (1.0, 6.0, 12, 1200)
    assert reg["suggested_order"] == 0
    assert all(not i["item_key"].startswith("cylinder_empty") for i in out["items"])


def test_sensitive_actions(mem):
    mem[(ST, "audit_log.json")] = [
        {"timestamp": "2026-10-08T09:00:00", "action": "handover_voided", "performed_by": "owner1", "entity_id": "H1"},
        {"timestamp": "2026-10-08T10:00:00", "action": "stock_adjust", "performed_by": "mgr", "entity_id": "lubricant:OIL1"},
        {"timestamp": "2026-10-08T11:00:00", "action": "handover_submit", "performed_by": "att", "entity_id": "H2"},
        {"timestamp": "2026-09-01T11:00:00", "action": "user_delete", "performed_by": "owner1", "entity_id": "U9"},
    ]
    out = rep.sensitive_actions_data(ST, "2026-10-01", "2026-10-31")
    assert [(e["action"], e["group"]) for e in out] == [("stock_adjust", "Stock"), ("handover_voided", "Handovers")]


def test_station_comparison(mem, monkeypatch):
    from app.database import stations_registry
    import app.database.storage as storage_mod
    monkeypatch.setattr(ah, "_pos_rules", lambda st: (set(), {}))
    monkeypatch.setattr(stations_registry, "list_stations", lambda: [
        {"station_id": ST, "name": "Kalulushi"}, {"station_id": "OFF", "name": "Closed", "status": "disabled"},
        {"station_id": "TST", "name": "Test", "is_test_station": True}])
    monkeypatch.setattr(storage_mod, "get_station_storage", lambda sid: {"shifts": {}, "accounts": {}})
    mem[(ST, "attendant_handovers.json")] = {"H1": ho("H1", "A", "Att A", "2026-10-08", -200, actual_cash=100)}
    out = rep.station_comparison(None, None, {"station_id": ST, "storage": {}})
    (row,) = out["stations"]
    assert (row["name"], row["shifts"], row["net_cash"], row["days_not_closed"]) == ("Kalulushi", 1, -200, 1)
