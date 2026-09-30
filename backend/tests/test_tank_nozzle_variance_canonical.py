"""
_compute_tank_nozzle_variance must gather each attendant's nozzle_summaries
from their CANONICAL handover only (Phase 3 of the duplicate-handover
remediation). Before this, it built {attendant_id: nozzle_summaries} by
iterating every handover for the shift with a plain dict assignment, so
whichever handover for an attendant happened to be iterated last silently
won - including a stray superseded/voided orphan with wrong numbers. This
was found live: nearly every handover in production carried a
tank_nozzle_variance flag, and this was the mechanism.
"""
import app.api.v1.attendant_handover as ah
import app.services.tank_movement as tank_movement


def _setup(monkeypatch, handovers):
    tank_readings_db = {
        "R1": {
            "tank_id": "TANK1", "date": "2026-09-17", "shift_type": "Day",
            "opening_volume": 1000.0, "closing_volume": 800.0,
            "opening_calibration_version": "v1", "closing_calibration_version": "v1",
        },
    }

    def fake_load_station_json(sid, fn, default=None):
        if fn == "tank_readings.json":
            return tank_readings_db
        if fn == "tank_deliveries.json":
            return {}
        return default if default is not None else {}

    monkeypatch.setattr(ah, "_get_shift_submission_status",
                         lambda *a, **k: {"all_submitted": True})
    monkeypatch.setattr(ah, "_load_handovers", lambda sid: handovers)
    monkeypatch.setattr(ah, "get_tank_id_for_nozzle", lambda nid, **kw: "TANK1")
    monkeypatch.setattr(ah, "load_station_json", fake_load_station_json)
    monkeypatch.setattr(ah, "save_station_json", lambda *a, **k: None)
    import app.services.dip_conversion as dip_conversion
    monkeypatch.setattr(dip_conversion, "calibration_status_for_dip", lambda *a, **k: "current")
    monkeypatch.setattr(tank_movement, "calculate_tank_volume_movement_v2", lambda *a, **k: 200.0)

    captured_nozzle_total = {}

    def fake_calculate_variance(movement, nozzle_total):
        captured_nozzle_total["value"] = nozzle_total
        return {"variance": nozzle_total - movement, "variance_percent": 0.0}

    monkeypatch.setattr(tank_movement, "calculate_variance", fake_calculate_variance)
    monkeypatch.setattr(tank_movement, "determine_variance_status", lambda pct: "PASS")

    shift = {"date": "2026-09-17", "shift_type": "Day"}
    storage = {"shifts": {"S1": shift}}
    return storage, captured_nozzle_total


def _nozzle_summary(volume):
    return [{"nozzle_id": "N1", "volume_sold": volume, "mechanical_volume": volume, "price_per_liter": 10.0}]


def test_uses_the_approved_handovers_volume_not_a_later_returned_orphan(monkeypatch):
    # The real, correct submission - approved with real sales.
    approved = {
        "shift_id": "S1", "attendant_id": "A1", "phase": "completed",
        "review_status": "approved", "actual_cash": 1000.0,
        "created_at": "2026-09-17T10:00:00",
        "nozzle_summaries": _nozzle_summary(220.0),
    }
    # A later accidental resubmission with garbage numbers, returned by a
    # supervisor - must NOT be the one that feeds the tank-wide sum just
    # because it's more recent.
    returned_orphan = {
        "shift_id": "S1", "attendant_id": "A1", "phase": "completed",
        "review_status": "returned", "actual_cash": 5000.0,
        "created_at": "2026-09-17T19:00:00",
        "nozzle_summaries": _nozzle_summary(9999.0),
    }
    handovers = {"HO-EARLY": approved, "HO-LATE": returned_orphan}
    storage, captured = _setup(monkeypatch, handovers)

    ah._compute_tank_nozzle_variance("ST001", "S1", storage)

    assert captured["value"] == 220.0, (
        "tank-wide nozzle total must come from the approved handover, not the returned orphan"
    )


def test_voided_handover_does_not_contribute_to_the_tank_total(monkeypatch):
    voided = {
        "shift_id": "S1", "attendant_id": "A1", "phase": "completed",
        "review_status": "voided", "actual_cash": 1000.0,
        "created_at": "2026-09-17T10:00:00",
        "nozzle_summaries": _nozzle_summary(220.0),
    }
    handovers = {"HO-1": voided}
    storage, captured = _setup(monkeypatch, handovers)

    ah._compute_tank_nozzle_variance("ST001", "S1", storage)

    # No canonical handover at all for A1 (only a voided one) - nothing
    # should be summed for this attendant.
    assert captured.get("value", 0.0) == 0.0


def test_dict_iteration_order_does_not_matter(monkeypatch):
    # Same as the first test but with the orphan inserted BEFORE the
    # approved record, to prove this isn't accidentally still working only
    # because of insertion order.
    approved = {
        "shift_id": "S1", "attendant_id": "A1", "phase": "completed",
        "review_status": "approved", "actual_cash": 1000.0,
        "created_at": "2026-09-17T10:00:00",
        "nozzle_summaries": _nozzle_summary(220.0),
    }
    returned_orphan = {
        "shift_id": "S1", "attendant_id": "A1", "phase": "completed",
        "review_status": "returned", "actual_cash": 5000.0,
        "created_at": "2026-09-17T19:00:00",
        "nozzle_summaries": _nozzle_summary(9999.0),
    }
    handovers = {"HO-LATE": returned_orphan, "HO-EARLY": approved}
    storage, captured = _setup(monkeypatch, handovers)

    ah._compute_tank_nozzle_variance("ST001", "S1", storage)

    assert captured["value"] == 220.0
