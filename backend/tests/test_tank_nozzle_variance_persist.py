"""
_compute_tank_nozzle_variance writes its derived per-tank figures back onto
tank_readings.json as a side effect (Three-Way Reconciliation reads those
persisted values directly). That's correct for a real submission event
(Phase 1/2, retro-entry) but wrong for a read-only lookup like the Daily
Close-Off "Investigate" view, which must not silently rewrite historical
dip records — including for an already closed/reconciled day — every time
someone looks. persist=False must skip the write while still returning the
same computed numbers.
"""
import app.api.v1.attendant_handover as ah
import app.services.tank_movement as tank_movement


def _setup(monkeypatch):
    handover = {
        "shift_id": "S1", "attendant_id": "A1", "phase": "completed", "actual_cash": 1000.0,
        "nozzle_summaries": [
            {"nozzle_id": "N1", "volume_sold": 220.0, "mechanical_volume": 220.0, "price_per_liter": 10.0},
        ],
    }
    tank_readings_db = {
        "R1": {
            "tank_id": "TANK1", "date": "2026-09-17", "shift_type": "Day",
            "opening_volume": 1000.0, "closing_volume": 800.0,
            "opening_calibration_version": "v1", "closing_calibration_version": "v1",
        },
    }
    saved = []

    def fake_load_station_json(sid, fn, default=None):
        if fn == "tank_readings.json":
            return tank_readings_db
        if fn == "tank_deliveries.json":
            return {}
        return default if default is not None else {}

    monkeypatch.setattr(ah, "_get_shift_submission_status",
                         lambda *a, **k: {"all_submitted": True})
    monkeypatch.setattr(ah, "_load_handovers", lambda sid: {"HO-1": handover})
    monkeypatch.setattr(ah, "get_tank_id_for_nozzle", lambda nid, **kw: "TANK1")
    monkeypatch.setattr(ah, "load_station_json", fake_load_station_json)
    monkeypatch.setattr(ah, "save_station_json", lambda sid, fn, data: saved.append((sid, fn, data)))
    # calibration "current" so the variance isn't suppressed by a stale/missing chart
    import app.services.dip_conversion as dip_conversion
    monkeypatch.setattr(dip_conversion, "calibration_status_for_dip", lambda *a, **k: "current")
    # Pin the math so status is deterministically FAIL/tank_readings_changed=True
    monkeypatch.setattr(tank_movement, "calculate_tank_volume_movement_v2", lambda *a, **k: 200.0)
    monkeypatch.setattr(tank_movement, "calculate_variance", lambda movement, nozzle_total: {
        "variance": nozzle_total - movement, "variance_percent": 10.0,
    })
    monkeypatch.setattr(tank_movement, "determine_variance_status", lambda pct: "FAIL")

    shift = {"date": "2026-09-17", "shift_type": "Day"}
    storage = {"shifts": {"S1": shift}}
    return storage, saved


def test_default_persists_like_before(monkeypatch):
    storage, saved = _setup(monkeypatch)

    flags, details = ah._compute_tank_nozzle_variance("ST001", "S1", storage)

    assert "tank_nozzle_variance" in flags
    assert details["tanks"]["TANK1"]["status"] == "FAIL"
    assert len(saved) == 1
    assert saved[0][1] == "tank_readings.json"


def test_persist_false_returns_same_data_without_writing(monkeypatch):
    storage, saved = _setup(monkeypatch)

    flags, details = ah._compute_tank_nozzle_variance("ST001", "S1", storage, persist=False)

    assert "tank_nozzle_variance" in flags
    assert details["tanks"]["TANK1"]["status"] == "FAIL"
    assert details["tanks"]["TANK1"]["tank_movement"] == 200.0
    assert details["tanks"]["TANK1"]["nozzle_total"] == 220.0
    assert saved == [], "persist=False must never write to tank_readings.json"
