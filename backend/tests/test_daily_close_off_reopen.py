"""
Daily Close-Off used to bank a day the instant every handover it happened to
know about was approved — with no way to notice a whole shift that was never
even started (the Night shift on 8 August 2026: the Day shift closed, the day
got banked, and the Night shift could no longer be closed at all — the day
was locked). Two things fix that:

1. close_day now requires both a Day and a Night shift on record, both
   genuinely 'completed' — not just "whatever handovers exist are approved".
2. A new /reopen endpoint lets the owner (any time) or a manager (within 4
   hours of the original close) unlock a closed day so the omitted shift can
   still be closed and approved, then the day re-banked with both shifts
   consolidated. Only the genuinely incomplete shift is reverted — a shift
   that was already fully and correctly closed is left alone, stays locked,
   and its tank dips stay locked too.
"""
from datetime import datetime, timedelta

import app.api.v1.daily_close_off as dco
import app.api.v1.tank_readings as tr
import app.services.shift_status as ss
from app.database.storage import get_station_storage


# ── _shift_fully_approved (unit) ────────────────────────────────────────

def test_fully_approved_when_every_assigned_attendant_approved(monkeypatch):
    shift = {"assignments": [{"attendant_id": "A1"}, {"attendant_id": "A2"}]}
    handovers = {
        "H1": {"shift_id": "S1", "attendant_id": "A1", "review_status": "approved"},
        "H2": {"shift_id": "S1", "attendant_id": "A2", "review_status": "approved"},
    }
    monkeypatch.setattr(ss, "load_station_json", lambda sid, fn, default=None: handovers)

    assert ss._shift_fully_approved(shift, "S1", "ST001", {}) is True


def test_not_fully_approved_with_a_pending_attendant(monkeypatch):
    shift = {"assignments": [{"attendant_id": "A1"}, {"attendant_id": "A2"}]}
    handovers = {
        "H1": {"shift_id": "S1", "attendant_id": "A1", "review_status": "approved"},
        "H2": {"shift_id": "S1", "attendant_id": "A2", "review_status": "submitted"},
    }
    monkeypatch.setattr(ss, "load_station_json", lambda sid, fn, default=None: handovers)

    assert ss._shift_fully_approved(shift, "S1", "ST001", {}) is False


def test_not_fully_approved_when_no_handovers_exist_at_all(monkeypatch):
    monkeypatch.setattr(ss, "load_station_json", lambda sid, fn, default=None: {})

    assert ss._shift_fully_approved({"assignments": []}, "S1", "ST001", {}) is False


def test_fallback_true_with_no_assignments_recorded(monkeypatch):
    handovers = {"H1": {"shift_id": "S1", "attendant_id": "A1", "review_status": "approved"}}
    monkeypatch.setattr(ss, "load_station_json", lambda sid, fn, default=None: handovers)

    assert ss._shift_fully_approved({}, "S1", "ST001", {}) is True


# ── unreconcile_shifts_for_date (unit) ──────────────────────────────────

def test_unreconcile_only_touches_reconciled_shifts(monkeypatch):
    monkeypatch.setattr(ss, "save_station_storage", lambda *a, **k: None)
    monkeypatch.setattr(ss, "log_audit_event", lambda *a, **k: None)
    storage = {"shifts": {
        "S1": {"status": "reconciled"},
        "S2": {"status": "completed"},
    }}

    changed = ss.unreconcile_shifts_for_date(["S1", "S2", "S-missing"], "ST001", storage, "owner1")

    assert changed == ["S1"]
    assert storage["shifts"]["S1"]["status"] == "active"
    assert "reopened_at" in storage["shifts"]["S1"]
    assert storage["shifts"]["S2"]["status"] == "completed"  # untouched — wasn't 'reconciled'


# ── HTTP fixtures/helpers ───────────────────────────────────────────────

def _isolate_close_off(monkeypatch):
    """Keep close-off/handover/reopen-log storage in memory only. Real
    shift storage (get_station_storage) is left untouched so tests can seed
    and inspect it directly — that's the part these endpoints actually need
    to interact with for real."""
    close_offs = {}
    handovers = {}
    reopen_log = []

    monkeypatch.setattr(dco, "_load_close_offs", lambda sid: close_offs)
    monkeypatch.setattr(dco, "_save_close_offs", lambda sid, data: None)
    monkeypatch.setattr(dco, "_load_handovers", lambda sid: handovers)
    monkeypatch.setattr(dco, "_save_handovers", lambda sid, data: None)
    monkeypatch.setattr(dco, "_load_reopen_log", lambda sid: reopen_log)
    monkeypatch.setattr(dco, "_save_reopen_log", lambda sid, data: None)
    monkeypatch.setattr(dco, "log_audit_event", lambda *a, **k: None)
    monkeypatch.setattr(dco, "create_notification", lambda *a, **k: None)
    # _shift_fully_approved (called from shift_status.py, not daily_close_off.py)
    # reads handovers via its own load_station_json import — point it at the
    # same in-memory dict, or it'll silently fall through to the real on-disk
    # file and see none of what this test seeded.
    monkeypatch.setattr(
        ss, "load_station_json",
        lambda sid, fn, default=None: handovers if fn == ss.HANDOVERS_FILE else (default if default is not None else {})
    )
    return close_offs, handovers, reopen_log


def _role_headers(client, create_staff, username, role):
    create_staff(username, f"Test {role.title()}", role, password="test1234")
    res = client.post("/api/v1/auth/login", json={"username": username, "password": "test1234"})
    assert res.status_code == 200, res.text
    token = res.json()["access_token"]
    return {"Authorization": f"Bearer {token}", "X-Station-Id": "ST001", "Content-Type": "application/json"}


def _seed_shift(date, shift_type, status, shift_id):
    get_station_storage("ST001")["shifts"][shift_id] = {
        "shift_id": shift_id, "date": date, "shift_type": shift_type, "status": status,
    }


def _seed_handover(handovers, handover_id, shift_id, date, shift_type, review_status="approved", **extra):
    h = {
        "handover_id": handover_id, "shift_id": shift_id, "date": date, "shift_type": shift_type,
        "review_status": review_status, "attendant_name": "Att", "attendant_id": "A1",
        "fuel_revenue": 1000.0, "lpg_sales": 0, "lubricant_sales": 0, "accessory_sales": 0,
        "credit_sales": 0, "total_expected": 1000.0, "expected_cash": 1000.0, "actual_cash": 1000.0,
        "pos_receipts": 0,
    }
    h.update(extra)
    handovers[handover_id] = h
    return h


# ── close_day: two-shift gate (Section 0) ───────────────────────────────

def test_close_day_rejects_missing_night_shift(client, create_staff, monkeypatch):
    close_offs, handovers, _ = _isolate_close_off(monkeypatch)
    headers = _role_headers(client, create_staff, "owner_gate_1", "owner")
    date = "2026-08-08"
    _seed_shift(date, "Day", "completed", "SHIFT-G1-DAY")
    _seed_handover(handovers, "H-G1-DAY", "SHIFT-G1-DAY", date, "Day")

    res = client.post("/api/v1/daily-close-off/close", headers=headers, json={
        "date": date, "bank_deposit_amount": 1000.0,
    })
    assert res.status_code == 400
    assert "Night" in res.json()["detail"]


def test_close_day_rejects_auto_closed_shift(client, create_staff, monkeypatch):
    close_offs, handovers, _ = _isolate_close_off(monkeypatch)
    headers = _role_headers(client, create_staff, "owner_gate_2", "owner")
    date = "2026-08-09"
    _seed_shift(date, "Day", "completed", "SHIFT-G2-DAY")
    _seed_shift(date, "Night", "auto-closed", "SHIFT-G2-NIGHT")
    _seed_handover(handovers, "H-G2-DAY", "SHIFT-G2-DAY", date, "Day")

    res = client.post("/api/v1/daily-close-off/close", headers=headers, json={
        "date": date, "bank_deposit_amount": 1000.0,
    })
    assert res.status_code == 400
    assert "Night" in res.json()["detail"]
    assert "auto-closed" in res.json()["detail"]


def test_close_day_succeeds_and_consolidates_only_the_two_verified_shifts(client, create_staff, monkeypatch):
    close_offs, handovers, _ = _isolate_close_off(monkeypatch)
    headers = _role_headers(client, create_staff, "owner_gate_3", "owner")
    date = "2026-08-10"
    _seed_shift(date, "Day", "completed", "SHIFT-G3-DAY")
    _seed_shift(date, "Night", "completed", "SHIFT-G3-NIGHT")
    _seed_handover(handovers, "H-G3-DAY", "SHIFT-G3-DAY", date, "Day", actual_cash=1000.0, expected_cash=1000.0)
    _seed_handover(handovers, "H-G3-NIGHT", "SHIFT-G3-NIGHT", date, "Night", actual_cash=500.0, expected_cash=500.0)
    # Stray handover shares the date but belongs to neither verified shift —
    # must not inflate the banked total.
    _seed_handover(handovers, "H-G3-STRAY", "SHIFT-OTHER", date, "Day", actual_cash=9999.0, expected_cash=9999.0)

    res = client.post("/api/v1/daily-close-off/close", headers=headers, json={
        "date": date, "bank_deposit_amount": 1500.0,
    })
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["summary"]["total_actual_cash"] == 1500.0
    assert sorted(data["handover_ids"]) == ["H-G3-DAY", "H-G3-NIGHT"]


# ── POST /reopen: validation & authorization ────────────────────────────

def test_reopen_requires_nonblank_reason(client, create_staff, monkeypatch):
    close_offs, handovers, _ = _isolate_close_off(monkeypatch)
    headers = _role_headers(client, create_staff, "owner_reopen_1", "owner")
    close_offs["2026-08-11"] = {"date": "2026-08-11", "handover_ids": [], "closed_at": datetime.now().isoformat()}

    res = client.post("/api/v1/daily-close-off/reopen", headers=headers, json={
        "date": "2026-08-11", "reason": "   ",
    })
    assert res.status_code == 400


def test_reopen_rejects_a_date_that_is_not_closed(client, create_staff, monkeypatch):
    _isolate_close_off(monkeypatch)
    headers = _role_headers(client, create_staff, "owner_reopen_2", "owner")

    res = client.post("/api/v1/daily-close-off/reopen", headers=headers, json={
        "date": "2026-08-12", "reason": "test",
    })
    assert res.status_code == 400


def test_supervisor_forbidden_from_reopen_endpoint(client, create_staff, monkeypatch):
    _isolate_close_off(monkeypatch)
    headers = _role_headers(client, create_staff, "sup_reopen_1", "supervisor")

    res = client.post("/api/v1/daily-close-off/reopen", headers=headers, json={
        "date": "2026-08-13", "reason": "test",
    })
    assert res.status_code == 403


def test_manager_can_reopen_within_4_hours(client, create_staff, monkeypatch):
    close_offs, handovers, _ = _isolate_close_off(monkeypatch)
    headers = _role_headers(client, create_staff, "mgr_reopen_1", "manager")
    date = "2026-08-14"
    closed_at = (datetime.now() - timedelta(hours=1)).isoformat()
    close_offs[date] = {"date": date, "handover_ids": [], "closed_at": closed_at, "summary": {}}

    res = client.post("/api/v1/daily-close-off/reopen", headers=headers, json={
        "date": date, "reason": "Night shift was omitted",
    })
    assert res.status_code == 200, res.text
    assert date not in close_offs


def test_manager_blocked_past_4_hours(client, create_staff, monkeypatch):
    close_offs, handovers, _ = _isolate_close_off(monkeypatch)
    headers = _role_headers(client, create_staff, "mgr_reopen_2", "manager")
    date = "2026-08-15"
    closed_at = (datetime.now() - timedelta(hours=5)).isoformat()
    close_offs[date] = {"date": date, "handover_ids": [], "closed_at": closed_at, "summary": {}}

    res = client.post("/api/v1/daily-close-off/reopen", headers=headers, json={
        "date": date, "reason": "Night shift was omitted",
    })
    assert res.status_code == 403
    assert date in close_offs  # untouched


def test_owner_can_reopen_regardless_of_elapsed_time(client, create_staff, monkeypatch):
    close_offs, handovers, _ = _isolate_close_off(monkeypatch)
    headers = _role_headers(client, create_staff, "owner_reopen_3", "owner")
    date = "2026-08-16"
    closed_at = (datetime.now() - timedelta(days=3)).isoformat()
    close_offs[date] = {"date": date, "handover_ids": [], "closed_at": closed_at, "summary": {}}

    res = client.post("/api/v1/daily-close-off/reopen", headers=headers, json={
        "date": date, "reason": "Correcting an old closure",
    })
    assert res.status_code == 200, res.text
    assert date not in close_offs


# ── POST /reopen: the motivating scenario ───────────────────────────────

def test_reopen_only_reverts_the_omitted_shift_leaves_the_complete_one_locked(client, create_staff, monkeypatch):
    """
    8 August 2026 Night, in miniature: the Day shift was fully approved and
    genuinely closed; the Night shift never had a handover at all, so the
    original close-off record only ever referenced the Day shift. Reopening
    must discover and revert the Night shift anyway (it can't rely on
    handover_ids, which never mentioned it) while leaving the Day shift's
    'reconciled' status — and therefore its tank dips — untouched.
    """
    close_offs, handovers, reopen_log = _isolate_close_off(monkeypatch)
    headers = _role_headers(client, create_staff, "owner_reopen_4", "owner")
    date = "2026-08-17"

    _seed_shift(date, "Day", "reconciled", "SHIFT-R4-DAY")
    day_handover = _seed_handover(handovers, "H-R4-DAY", "SHIFT-R4-DAY", date, "Day",
                                   review_status="approved", day_closed=True)
    _seed_shift(date, "Night", "reconciled", "SHIFT-R4-NIGHT")  # never had a handover

    close_offs[date] = {
        "date": date,
        "handover_ids": ["H-R4-DAY"],
        "closed_at": datetime.now().isoformat(),
        "summary": {"total_actual_cash": 1000.0},
    }

    res = client.post("/api/v1/daily-close-off/reopen", headers=headers, json={
        "date": date, "reason": "Night shift was never closed before the day was banked",
    })
    assert res.status_code == 200, res.text
    data = res.json()

    # The omitted Night shift is discovered and reverted...
    assert "SHIFT-R4-NIGHT" in data["shifts_reverted"]
    assert get_station_storage("ST001")["shifts"]["SHIFT-R4-NIGHT"]["status"] == "active"

    # ...but the Day shift, already fully approved, is left exactly as it was.
    assert "SHIFT-R4-DAY" not in data["shifts_reverted"]
    assert get_station_storage("ST001")["shifts"]["SHIFT-R4-DAY"]["status"] == "reconciled"

    # The day itself is unlocked either way.
    assert date not in close_offs
    assert day_handover["day_closed"] is False
    assert day_handover["reopen_history"][0]["reason"] == "Night shift was never closed before the day was banked"

    # Archived for history even though the live key is gone.
    assert reopen_log[0]["prior_record"]["handover_ids"] == ["H-R4-DAY"]


def test_dip_edit_blocked_on_complete_shift_but_allowed_on_reverted_one(client, create_staff, monkeypatch):
    """
    End-to-end proof that reopening actually does something: after reopen,
    tank dip submission for the Day shift (left 'reconciled') still 403s,
    while the Night shift (reverted to 'active') accepts the same call.
    """
    saved = {}

    def fake_load(sid, fn, default=None):
        return saved.get(fn, default if default is not None else {})

    def fake_save(sid, fn, data):
        saved[fn] = data

    monkeypatch.setattr(tr, "load_station_json", fake_load)
    monkeypatch.setattr(tr, "save_station_json", fake_save)
    monkeypatch.setattr(tr, "ensure_calibration_loaded", lambda *a, **k: True)
    import app.services.dip_conversion as dip_conversion
    import app.database.storage as storage_module
    monkeypatch.setattr(dip_conversion, "dip_to_volume", lambda tank_id, dip_cm: (dip_cm or 0) * 10)
    monkeypatch.setattr(dip_conversion, "get_calibration_version", lambda tank_id: "v1")
    monkeypatch.setattr(storage_module, "save_station_storage", lambda *a, **k: None)

    headers = _role_headers(client, create_staff, "owner_dip_gate_1", "owner")
    date = "2026-08-18"
    _seed_shift(date, "Day", "reconciled", "SHIFT-DG1-DAY")
    _seed_shift(date, "Night", "active", "SHIFT-DG1-NIGHT")

    res_day = client.post("/api/v1/tank-readings/dips", headers=headers, params={
        "tank_id": "TANK1", "date": date, "shift_type": "Day",
        "recorded_by": "owner_dip_gate_1", "closing_dip_cm": 90.0,
    })
    assert res_day.status_code == 403

    res_night = client.post("/api/v1/tank-readings/dips", headers=headers, params={
        "tank_id": "TANK1", "date": date, "shift_type": "Night",
        "recorded_by": "owner_dip_gate_1", "closing_dip_cm": 90.0,
    })
    assert res_night.status_code == 200, res_night.text
