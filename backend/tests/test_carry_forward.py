"""
Opening-reading carry-forward must be keyed by nozzle_id, not by attendant —
a meter reading belongs to the nozzle, not to whoever was assigned to it.
Covers both copies of _find_previous_shift_readings (attendant_handover.py,
the one the live app actually calls, and enter_readings.py's identical twin).
"""
import app.api.v1.attendant_handover as ah
import app.api.v1.enter_readings as er

STORAGE = {
    "shifts": {
        "2026-07-21-Night": {"date": "2026-07-21", "shift_type": "Night"},
    }
}

CURRENT_SHIFT = {"date": "2026-07-22", "shift_type": "Day"}


def _closing_record(attendant_id, nozzle_id, electronic, mechanical, submitted_at="2026-07-21T22:00:00"):
    return {
        "submitted_at": submitted_at,
        "nozzle_readings": [
            {"nozzle_id": nozzle_id, "electronic_reading": electronic, "mechanical_reading": mechanical}
        ],
    }


def test_resolves_regardless_of_which_attendant_closed_it(monkeypatch):
    # Eric Shaka (STF013) closed the nozzle last night; today's shift assigns a
    # completely different attendant to it. The lookup must not care whose
    # attendant_id is embedded in the previous shift's closing record key —
    # this is the exact bug being fixed (previously keyed by the *current*
    # shift's attendant, so a changed assignment silently found nothing).
    readings_db = {
        "AR-2026-07-21-Night-STF013-C": _closing_record("STF013", "ISL1-A", 500.0, 400.0),
    }
    monkeypatch.setattr(ah, "_load_enter_readings", lambda sid: readings_db)

    result = ah._find_previous_shift_readings(CURRENT_SHIFT, STORAGE, "ST001")
    assert result == {"ISL1-A": {"electronic": 500.0, "mechanical": 400.0}}


def test_no_previous_shift_returns_empty(monkeypatch):
    monkeypatch.setattr(ah, "_load_enter_readings", lambda sid: {})
    storage = {"shifts": {}}

    result = ah._find_previous_shift_readings(CURRENT_SHIFT, storage, "ST001")
    assert result == {}


def test_conflicting_closings_keeps_the_later_one(monkeypatch):
    readings_db = {
        "AR-2026-07-21-Night-STF013-C": _closing_record(
            "STF013", "ISL1-A", 500.0, 400.0, submitted_at="2026-07-21T20:00:00"),
        "AR-2026-07-21-Night-STF014-C": _closing_record(
            "STF014", "ISL1-A", 510.0, 405.0, submitted_at="2026-07-21T22:30:00"),
    }
    monkeypatch.setattr(ah, "_load_enter_readings", lambda sid: readings_db)

    result = ah._find_previous_shift_readings(CURRENT_SHIFT, STORAGE, "ST001")
    assert result == {"ISL1-A": {"electronic": 510.0, "mechanical": 405.0}}


def test_enter_readings_twin_has_the_same_fix(monkeypatch):
    readings_db = {
        "AR-2026-07-21-Night-STF013-C": _closing_record("STF013", "ISL1-A", 500.0, 400.0),
    }
    monkeypatch.setattr(er, "_load_readings", lambda sid: readings_db)

    result = er._find_previous_shift_readings(CURRENT_SHIFT, STORAGE, "ST001")
    assert result == {"ISL1-A": {"electronic": 500.0, "mechanical": 400.0}}
