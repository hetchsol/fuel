"""
_find_previous_shift_readings (opening-reading carry-forward, Phase 3 of the
duplicate-handover remediation) must not carry forward a previous shift's
closing reading that's been voided, superseded, or manually excluded - that
reading was flagged or reversed as wrong, and using it as the next shift's
opening would propagate the bad number forward.
"""
import app.api.v1.enter_readings as er


def _readings_db(prev_record):
    return {"AR-PREV-Night-ATT1-C": prev_record}


def _shifts():
    return {
        "PREV-Night": {"date": "2026-09-16", "shift_type": "Night"},
        "CUR-Day": {"date": "2026-09-17", "shift_type": "Day"},
    }


def test_current_previous_closing_is_carried_forward(monkeypatch):
    record = {
        "submitted_at": "2026-09-16T22:00:00",
        "nozzle_readings": [{"nozzle_id": "N1", "electronic_reading": 500.0, "mechanical_reading": 499.0}],
    }
    monkeypatch.setattr(er, "_load_readings", lambda sid: _readings_db(record))
    storage = {"shifts": _shifts()}
    shift = {"date": "2026-09-17", "shift_type": "Day"}

    result = er._find_previous_shift_readings(shift, storage, "ST001")
    assert result == {"N1": {"electronic": 500.0, "mechanical": 499.0}}


def test_voided_previous_closing_is_not_carried_forward(monkeypatch):
    record = {
        "submitted_at": "2026-09-16T22:00:00", "voided": True,
        "nozzle_readings": [{"nozzle_id": "N1", "electronic_reading": 500.0, "mechanical_reading": 499.0}],
    }
    monkeypatch.setattr(er, "_load_readings", lambda sid: _readings_db(record))
    storage = {"shifts": _shifts()}
    shift = {"date": "2026-09-17", "shift_type": "Day"}

    result = er._find_previous_shift_readings(shift, storage, "ST001")
    assert result == {}


def test_superseded_previous_closing_is_not_carried_forward(monkeypatch):
    record = {
        "submitted_at": "2026-09-16T22:00:00", "superseded": True,
        "nozzle_readings": [{"nozzle_id": "N1", "electronic_reading": 500.0, "mechanical_reading": 499.0}],
    }
    monkeypatch.setattr(er, "_load_readings", lambda sid: _readings_db(record))
    storage = {"shifts": _shifts()}
    shift = {"date": "2026-09-17", "shift_type": "Day"}

    result = er._find_previous_shift_readings(shift, storage, "ST001")
    assert result == {}


def test_excluded_from_checks_previous_closing_is_not_carried_forward(monkeypatch):
    record = {
        "submitted_at": "2026-09-16T22:00:00", "excluded_from_checks": True,
        "nozzle_readings": [{"nozzle_id": "N1", "electronic_reading": 500.0, "mechanical_reading": 499.0}],
    }
    monkeypatch.setattr(er, "_load_readings", lambda sid: _readings_db(record))
    storage = {"shifts": _shifts()}
    shift = {"date": "2026-09-17", "shift_type": "Day"}

    result = er._find_previous_shift_readings(shift, storage, "ST001")
    assert result == {}
