"""
Safe deposits bound to their attendant, one slip per non-cash payment with a
required reference, and the shared card machine checked once per shift.

All persistence is replaced by an in-memory dict, so these tests never touch
the station files on disk.
"""
import copy

import pytest
from fastapi import HTTPException

from app.api.v1 import safe_deposits as sd
from app.api.v1 import attendant_handover as ah
from app.api.v1 import settings as st
from app.services import safe_deposit_service as deps

ST = "ST_TEST_DEP"


@pytest.fixture
def mem(monkeypatch):
    files: dict = {}

    def load(station_id, name, default=None):
        return copy.deepcopy(files.get((station_id, name), default))

    def save(station_id, name, data):
        files[(station_id, name)] = copy.deepcopy(data)

    for mod in (deps, ah, st):
        monkeypatch.setattr(mod, "load_station_json", load)
        monkeypatch.setattr(mod, "save_station_json", save)
    monkeypatch.setattr(sd, "log_audit_event", lambda **k: None)
    monkeypatch.setattr(st, "log_audit_event", lambda **k: None)
    monkeypatch.setattr(ah, "create_notification", lambda **k: None)
    monkeypatch.setattr(ah, "log_audit_event", lambda **k: None)
    return files


HANDOVERS: dict = {}


@pytest.fixture
def roster(mem, monkeypatch):
    HANDOVERS.clear()
    monkeypatch.setattr(sd, "get_active_handover", lambda station, shift, att, handovers=None:
                        HANDOVERS.get(att))
    return {"shifts": {"SH1": {"status": "active", "date": "2026-10-08", "shift_type": "Day", "assignments": [
        {"attendant_id": "A", "attendant_name": "Att A"},
        {"attendant_id": "B", "attendant_name": "Att B"},
    ]}}}


def ctx(storage, user_id, role="user", name=None):
    return {"station_id": ST, "storage": storage, "user_id": user_id, "full_name": name or f"Att {user_id}",
            "role": role, "username": user_id.lower()}


# ── recording ───────────────────────────────────────────────────────

def test_attendant_records_own_deposit_only(roster):
    out = sd.record_deposit(sd.DepositInput(shift_id="SH1", amount=1000, attendant_id="B"), ctx(roster, "A"))
    d = out["deposit"]
    assert (d["attendant_id"], d["recorded_by_id"]) == ("A", "A")   # attendant_id ignored for attendants
    assert out["my_total"] == 1000


def test_off_roster_user_cannot_deposit(roster):
    with pytest.raises(HTTPException) as e:
        sd.record_deposit(sd.DepositInput(shift_id="SH1", amount=500), ctx(roster, "Z"))
    assert e.value.status_code == 403


def test_supervisor_must_pick_rostered_attendant(roster):
    with pytest.raises(HTTPException) as e:
        sd.record_deposit(sd.DepositInput(shift_id="SH1", amount=500), ctx(roster, "SUP", "supervisor", "Sup"))
    assert "Choose the attendant" in e.value.detail
    out = sd.record_deposit(sd.DepositInput(shift_id="SH1", amount=500, attendant_id="B"),
                            ctx(roster, "SUP", "supervisor", "Sup"))
    d = out["deposit"]
    assert (d["attendant_id"], d["attendant_name"], d["recorded_by_name"]) == ("B", "Att B", "Sup")


def test_no_deposit_after_attendant_closed(roster):
    HANDOVERS["A"] = {"phase": "completed", "review_status": "submitted"}
    with pytest.raises(HTTPException, match="already closed"):
        sd.record_deposit(sd.DepositInput(shift_id="SH1", amount=500), ctx(roster, "A"))
    HANDOVERS["A"] = {"phase": "completed", "review_status": "voided"}   # voided entry: still open
    sd.record_deposit(sd.DepositInput(shift_id="SH1", amount=500), ctx(roster, "A"))


def test_each_attendant_counts_only_their_own(roster):
    sd.record_deposit(sd.DepositInput(shift_id="SH1", amount=3000), ctx(roster, "A"))
    sd.record_deposit(sd.DepositInput(shift_id="SH1", amount=2000), ctx(roster, "B"))
    assert deps.attendant_deposit_summary(ST, "SH1", "A")["total"] == 3000
    assert deps.attendant_deposit_summary(ST, "SH1", "B")["total"] == 2000


# ── corrections ─────────────────────────────────────────────────────

def test_void_and_move(roster):
    a1 = sd.record_deposit(sd.DepositInput(shift_id="SH1", amount=1000), ctx(roster, "A"))["deposit"]
    a2 = sd.record_deposit(sd.DepositInput(shift_id="SH1", amount=700), ctx(roster, "A"))["deposit"]
    mgr = ctx(roster, "M", "manager", "Mgr")

    with pytest.raises(HTTPException):
        sd.void_deposit("SH1", a1["deposit_id"], sd.DepositVoidInput(reason=" "), mgr)
    sd.void_deposit("SH1", a1["deposit_id"], sd.DepositVoidInput(reason="Entered twice"), mgr)
    assert deps.attendant_deposit_summary(ST, "SH1", "A")["total"] == 700
    with pytest.raises(HTTPException, match="already been voided"):
        sd.void_deposit("SH1", a1["deposit_id"], sd.DepositVoidInput(reason="again"), mgr)

    sd.reassign_deposit("SH1", a2["deposit_id"], sd.DepositReassignInput(attendant_id="B", reason="B's cash"), mgr)
    assert deps.attendant_deposit_summary(ST, "SH1", "A")["total"] == 0
    assert deps.attendant_deposit_summary(ST, "SH1", "B")["total"] == 700


def test_move_refused_onto_closed_attendant(roster):
    a = sd.record_deposit(sd.DepositInput(shift_id="SH1", amount=500), ctx(roster, "A"))["deposit"]
    HANDOVERS["B"] = {"phase": "completed", "review_status": "approved"}
    with pytest.raises(HTTPException, match="already closed"):
        sd.reassign_deposit("SH1", a["deposit_id"], sd.DepositReassignInput(attendant_id="B", reason="x"),
                            ctx(roster, "M", "manager"))


# ── POS settings ────────────────────────────────────────────────────

def test_pos_settings_move_to_single_pos_type_once(mem):
    mem[(ST, "pos_settings.json")] = {"payment_types": [
        {"type_id": "visa", "name": "Visa", "is_active": True},
        {"type_id": "momo_mtn", "name": "MoMo (MTN)", "is_active": True},
    ], "variance_threshold": 5.0}
    data = st._load_pos_settings(ST)
    types = {t["type_id"]: t for t in data["payment_types"]}
    assert types["pos"]["is_active"] and types["pos"]["is_terminal"]
    assert not types["visa"]["is_active"] and types["visa"]["is_terminal"]
    assert types["momo_mtn"]["is_active"] and not types["momo_mtn"].get("is_terminal")
    assert data["banks"] == st.DEFAULT_POS_BANKS

    # The owner re-enables Visa: it stays enabled
    saved = mem[(ST, "pos_settings.json")]
    saved["payment_types"][1]["is_active"] = True
    mem[(ST, "pos_settings.json")] = saved
    assert any(t["type_id"] == "visa" and t["is_active"] for t in st._load_pos_settings(ST)["payment_types"])


# ── slips ───────────────────────────────────────────────────────────

RULES = ({"pos"}, {"zanaco": "ZANACO", "fnb": "FNB"})


def test_slip_needs_reference():
    with pytest.raises(HTTPException, match="slip reference"):
        ah._clean_pos_item({"type_id": "pos", "type_name": "POS", "amount": 300}, ST, RULES)
    ok = ah._clean_pos_item({"type_id": "pos", "type_name": "POS", "amount": 300, "reference": " R1 "}, ST, RULES)
    assert ok["reference"] == "R1"
    # Editing an old slip that never had a reference stays allowed
    old = ah._clean_pos_item({"type_id": "pos", "amount": 300}, ST, RULES, require_reference=False)
    assert old["reference"] is None


def test_bank_from_list_card_types_only():
    d = ah._clean_pos_item({"type_id": "pos", "amount": 1, "reference": "R", "bank": "zanaco"}, ST, RULES)
    assert d["bank"] == "ZANACO"
    with pytest.raises(HTTPException, match="not on this station"):
        ah._clean_pos_item({"type_id": "pos", "amount": 1, "reference": "R", "bank": "Zanco"}, ST, RULES)
    momo = ah._clean_pos_item({"type_id": "momo_mtn", "amount": 1, "reference": "R", "bank": "ZANACO"}, ST, RULES)
    assert momo["bank"] is None


# ── shift card machine check ────────────────────────────────────────

def test_machine_total_checked_against_all_attendants(mem, monkeypatch):
    monkeypatch.setattr(ah, "_pos_rules", lambda station: RULES)
    monkeypatch.setattr(st, "_load_pos_settings", lambda station: {"variance_threshold": 5.0})
    monkeypatch.setattr(ah, "is_handover_canonical", lambda h: True)
    monkeypatch.setattr(ah, "_load_handovers", lambda station: {
        "HA": {"shift_id": "SH1", "attendant_id": "A", "attendant_name": "Att A", "phase": "completed",
               "pos_breakdown": [{"type_id": "pos", "amount": 1000, "bank": "ZANACO"},
                                 {"type_id": "pos", "amount": 2000, "bank": None},
                                 {"type_id": "momo_mtn", "amount": 400}]},
        "HB": {"shift_id": "SH1", "attendant_id": "B", "attendant_name": "Att B", "phase": "completed",
               "pos_breakdown": [{"type_id": "pos", "amount": 4000, "bank": "FNB"}]},
        "HX": {"shift_id": "SH1", "attendant_id": "C", "review_status": "voided",
               "pos_breakdown": [{"type_id": "pos", "amount": 999}]},
    })
    storage = {"shifts": {"SH1": {"status": "active", "date": "2026-10-08", "shift_type": "Day"}}}

    c = ah._shift_pos_check(ST, storage, "SH1")
    assert c["slips_total"] == 7000 and c["status"] == "not_entered" and c["all_closed"]
    assert {a["attendant_id"]: a["slips_total"] for a in c["attendants"]} == {"A": 3000, "B": 4000}

    import asyncio
    c = asyncio.run(ah.put_shift_machine_totals("SH1", ah.MachineTotalsInput(entries=[
        ah.MachineTotalEntry(bank="zanaco", amount=3000), ah.MachineTotalEntry(bank="FNB", amount=4000)]),
        {"station_id": ST, "storage": storage, "username": "mgr"}))
    assert c["status"] == "match" and c["machine_total"] == 7000
    assert [e["bank"] for e in c["machine_entries"]] == ["ZANACO", "FNB"]

    c = asyncio.run(ah.put_shift_machine_totals("SH1", ah.MachineTotalsInput(entries=[
        ah.MachineTotalEntry(amount=6500)]), {"station_id": ST, "storage": storage, "username": "mgr"}))
    assert c["status"] == "mismatch" and c["difference"] == 500


def test_slip_reference_cutoff_set_once_and_kept(mem):
    first = st._load_pos_settings(ST)["slip_references_required_from"]
    assert first
    saved = mem[(ST, "pos_settings.json")]
    saved["slip_references_required_from"] = "2026-10-08"
    mem[(ST, "pos_settings.json")] = saved
    assert st._load_pos_settings(ST)["slip_references_required_from"] == "2026-10-08"   # not reset on load
    st.update_pos_settings(
        st.POSSettingsInput(payment_types=[{"type_id": "pos", "name": "POS", "is_terminal": True}]),
        {"station_id": ST, "username": "owner"})
    assert mem[(ST, "pos_settings.json")]["slip_references_required_from"] == "2026-10-08"  # kept on save
