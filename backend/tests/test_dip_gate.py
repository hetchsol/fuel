"""
The manager is on-site at shift close, so an attendant's handover submission
(POST /submit-readings, phase -> readings_verified) is blocked until the
manager has recorded the closing tank dip for every tank the attendant's
nozzles draw from. This also fixes a bug where the dip-completeness check
matched by date only, so a Day-shift dip silently satisfied a Night-shift
check on the same date.
"""
import app.api.v1.attendant_handover as ah


class _AlwaysContains(dict):
    """Stand-in for the opening-verifications store — bypasses the unrelated
    'start your shift first' gate regardless of the real shift/user id."""
    def __contains__(self, key):
        return True


# ── _missing_dips_for_tanks / _missing_tank_dips: shift_type scoping ──

def test_day_dip_does_not_satisfy_night_check_same_date(monkeypatch):
    tank_readings = {
        "R1": {"tank_id": "TANK1", "date": "2026-08-05", "shift_type": "Day",
               "opening_dip_cm": 100.0, "closing_dip_cm": 90.0},
    }
    monkeypatch.setattr(ah, "load_station_json", lambda sid, fn, default=None: tank_readings)

    day_missing = ah._missing_dips_for_tanks("ST001", "2026-08-05", "Day", ["TANK1"], storage={})
    night_missing = ah._missing_dips_for_tanks("ST001", "2026-08-05", "Night", ["TANK1"], storage={})

    assert day_missing == []
    assert night_missing == ["TANK1"]


def test_missing_tank_dips_is_shift_type_scoped(monkeypatch):
    tank_readings = {
        "R1": {"tank_id": "TANK1", "date": "2026-08-05", "shift_type": "Day",
               "opening_dip_cm": 100.0, "closing_dip_cm": 90.0},
    }
    monkeypatch.setattr(ah, "load_station_json", lambda sid, fn, default=None: tank_readings)
    storage = {"tanks": {"TANK1": {"fuel_type": "Diesel"}}}

    assert ah._missing_tank_dips("ST001", "2026-08-05", "Day", storage) == []
    assert ah._missing_tank_dips("ST001", "2026-08-05", "Night", storage) == ["TANK1"]


def test_require_dips_complete_raises_with_shift_type_in_message(monkeypatch):
    monkeypatch.setattr(ah, "load_station_json", lambda sid, fn, default=None: {})
    storage = {"tanks": {"TANK1": {"fuel_type": "Diesel"}}}

    try:
        ah._require_dips_complete("ST001", "2026-08-05", "Night", storage)
        assert False, "expected HTTPException"
    except Exception as exc:
        assert exc.status_code == 409  # distinguishes "missing dips" from other 400s at the call sites
        assert "Night" in exc.detail
        assert "Diesel" in exc.detail


def test_missing_dips_for_tanks_only_checks_requested_tanks(monkeypatch):
    # TANK2 has no dip at all, but the attendant's nozzles only touch TANK1 —
    # TANK2 must not show up as "missing" for this attendant's gate.
    tank_readings = {
        "R1": {"tank_id": "TANK1", "date": "2026-08-05", "shift_type": "Day",
               "closing_dip_cm": 90.0},
    }
    monkeypatch.setattr(ah, "load_station_json", lambda sid, fn, default=None: tank_readings)

    missing = ah._missing_dips_for_tanks(
        "ST001", "2026-08-05", "Day", ["TANK1"], storage={}, require_opening=False)
    assert missing == []


# ── POST /submit-readings: blocked until the manager's closing dip exists ──

def test_submit_readings_blocked_without_manager_closing_dip(client, staff_headers, monkeypatch):
    if not staff_headers:
        import pytest
        pytest.skip("attendant seed unavailable")

    shift = {"date": "2026-08-05", "shift_type": "Day", "status": "active", "assignments": []}
    monkeypatch.setattr(ah, "_validate_shift_and_assignment",
                         lambda shift_id, ctx, storage: (shift, {"attendant_id": ctx["user_id"]}, {"N1"}))
    monkeypatch.setattr(ah, "get_tank_id_for_nozzle", lambda nid, **kw: "TANK1")
    # No dip records at all for this station -> the gate must fire.
    monkeypatch.setattr(ah, "load_station_json", lambda sid, fn, default=None: {})

    res = client.post("/api/v1/handover/submit-readings", headers=staff_headers, json={
        "shift_id": "SHIFT-TEST-1",
        "nozzle_readings": [
            {"nozzle_id": "N1", "opening_reading": 100.0, "closing_reading": 150.0,
             "mechanical_opening": 0, "mechanical_closing": 0},
        ],
    })
    assert res.status_code == 400
    assert "closing tank dip" in res.json()["detail"].lower()


def test_submit_readings_succeeds_once_dip_recorded_and_surfaces_variance(client, staff_headers, monkeypatch):
    if not staff_headers:
        import pytest
        pytest.skip("attendant seed unavailable")

    shift = {"date": "2026-08-05", "shift_type": "Day", "status": "active", "assignments": []}

    def fake_load_station_json(sid, fn, default=None):
        if fn == 'tank_readings.json':
            return {"R1": {"tank_id": "TANK1", "date": "2026-08-05", "shift_type": "Day",
                            "closing_dip_cm": 120.0}}
        return default if default is not None else {}

    monkeypatch.setattr(ah, "_validate_shift_and_assignment",
                         lambda shift_id, ctx, storage: (shift, {"attendant_id": ctx["user_id"]}, {"N1"}))
    monkeypatch.setattr(ah, "get_tank_id_for_nozzle", lambda nid, **kw: "TANK1")
    monkeypatch.setattr(ah, "load_station_json", fake_load_station_json)
    monkeypatch.setattr(ah, "save_station_json", lambda *a, **k: None)
    monkeypatch.setattr(ah, "_load_handovers", lambda sid: {})
    monkeypatch.setattr(ah, "_save_handovers", lambda data, sid: None)
    monkeypatch.setattr(ah, "_load_opening_verifications", lambda sid: _AlwaysContains())
    monkeypatch.setattr(ah, "_process_nozzle_readings", lambda *a, **k: ([], 0.0))
    monkeypatch.setattr(ah, "_process_stock_snapshot", lambda *a, **k: (0, 0, 0, None, []))
    monkeypatch.setattr(ah, "_compute_phase1_flags", lambda *a, **k: [])
    # Stand in for the real reconciliation — proves submit_readings wires its
    # result into the response rather than only checking that the dip exists.
    monkeypatch.setattr(ah, "_compute_tank_nozzle_variance",
                         lambda *a, **k: (["tank_nozzle_variance"], {}))
    monkeypatch.setattr(ah, "_update_nozzle_state", lambda *a, **k: None)
    monkeypatch.setattr(ah, "save_station_storage", lambda *a, **k: None)
    monkeypatch.setattr(ah, "_feed_daily_entries", lambda *a, **k: None)
    monkeypatch.setattr(ah, "log_audit_event", lambda *a, **k: None)
    monkeypatch.setattr(ah, "create_notification", lambda *a, **k: None)

    res = client.post("/api/v1/handover/submit-readings", headers=staff_headers, json={
        "shift_id": "SHIFT-TEST-1",
        "nozzle_readings": [
            {"nozzle_id": "N1", "opening_reading": 100.0, "closing_reading": 150.0,
             "mechanical_opening": 0, "mechanical_closing": 0},
        ],
    })
    assert res.status_code == 200
    data = res.json()
    assert data["phase"] == "readings_verified"
    assert "tank_nozzle_variance" in (data.get("auto_flag_reasons") or [])
