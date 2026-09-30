"""
Tests for the resubmission guard added to POST /submit-readings and
POST /submit (Phase 2 of the duplicate-handover remediation): a second
submission for a (shift_id, attendant_id) pair that already has a handover
must be rejected outright if the prior one is approved, and auto-superseded
(with lineage recorded) if the prior one is unresolved/returned - never
silently create an untracked orphan the way it did before.

Heavily monkeypatched, same pattern as test_dip_gate.py's submit-readings
tests, since submit_readings/submit_handover pull in tank dips, nozzle
processing, and stock snapshots that aren't what's under test here.
"""
import app.api.v1.attendant_handover as ah


class _AlwaysContains(dict):
    """Stand-in for the opening-verifications store."""
    def __contains__(self, key):
        return True


class _AlwaysEqual:
    """Matches any attendant_id - the test doesn't know the real user_id
    the auth token resolves to, only that resolve_resubmission must match
    the fake prior handover against it."""
    def __eq__(self, other):
        return True

    def __hash__(self):
        return 0


def _base_patches(monkeypatch, handovers, saved):
    shift = {"date": "2026-08-05", "shift_type": "Day", "status": "active", "assignments": []}

    def fake_load_station_json(sid, fn, default=None):
        if fn == 'tank_readings.json':
            return {"R1": {"tank_id": "TANK1", "date": "2026-08-05", "shift_type": "Day",
                            "closing_dip_cm": 120.0}}
        return default if default is not None else {}

    def fake_save_handovers(data, sid):
        saved["data"] = data

    monkeypatch.setattr(ah, "_validate_shift_and_assignment",
                         lambda shift_id, ctx, storage: (shift, {"attendant_id": ctx["user_id"]}, {"N1"}))
    monkeypatch.setattr(ah, "get_tank_id_for_nozzle", lambda nid, **kw: "TANK1")
    monkeypatch.setattr(ah, "load_station_json", fake_load_station_json)
    monkeypatch.setattr(ah, "save_station_json", lambda *a, **k: None)
    monkeypatch.setattr(ah, "_load_handovers", lambda sid: handovers)
    monkeypatch.setattr(ah, "_save_handovers", fake_save_handovers)
    monkeypatch.setattr(ah, "_load_opening_verifications", lambda sid: _AlwaysContains())
    monkeypatch.setattr(ah, "_process_nozzle_readings", lambda *a, **k: ([], 0.0))
    monkeypatch.setattr(ah, "_process_stock_snapshot", lambda *a, **k: (0, 0, 0, None, []))
    monkeypatch.setattr(ah, "_compute_phase1_flags", lambda *a, **k: [])
    monkeypatch.setattr(ah, "_compute_tank_nozzle_variance", lambda *a, **k: ([], {}))
    monkeypatch.setattr(ah, "_update_nozzle_state", lambda *a, **k: None)
    monkeypatch.setattr(ah, "save_station_storage", lambda *a, **k: None)
    monkeypatch.setattr(ah, "_feed_daily_entries", lambda *a, **k: None)
    monkeypatch.setattr(ah, "log_audit_event", lambda *a, **k: None)
    monkeypatch.setattr(ah, "create_notification", lambda *a, **k: None)


def _submit_readings(client, staff_headers):
    return client.post("/api/v1/handover/submit-readings", headers=staff_headers, json={
        "shift_id": "SHIFT-TEST-1",
        "nozzle_readings": [
            {"nozzle_id": "N1", "opening_reading": 100.0, "closing_reading": 150.0,
             "mechanical_opening": 0, "mechanical_closing": 0},
        ],
    })


def test_rejects_resubmission_when_prior_handover_is_approved(client, staff_headers, monkeypatch):
    if not staff_headers:
        import pytest
        pytest.skip("attendant seed unavailable")

    handovers = {
        "HO-PRIOR": {
            "shift_id": "SHIFT-TEST-1", "attendant_id": _AlwaysEqual(),
            "review_status": "approved", "phase": "completed",
            "created_at": "2026-08-05T08:00:00",
        },
    }
    saved = {}
    _base_patches(monkeypatch, handovers, saved)

    res = _submit_readings(client, staff_headers)
    assert res.status_code == 409
    detail = res.json()["detail"]
    assert detail["error"] == "handover_already_approved"
    assert detail["existing_handover_id"] == "HO-PRIOR"
    assert "approved handover" in detail["message"].lower()
    assert "void it first" in detail["message"].lower()
    # Nothing should have been saved - the rejection happens before any write.
    assert "data" not in saved


def test_requires_manual_redo_when_prior_is_still_pre_close(client, staff_headers, monkeypatch):
    if not staff_headers:
        import pytest
        pytest.skip("attendant seed unavailable")

    handovers = {
        "HO-PRIOR": {
            "shift_id": "SHIFT-TEST-1", "attendant_id": _AlwaysEqual(),
            "review_status": "submitted", "phase": "readings_verified",
            "created_at": "2026-08-05T08:00:00",
        },
    }
    saved = {}
    _base_patches(monkeypatch, handovers, saved)

    res = _submit_readings(client, staff_headers)
    assert res.status_code == 409
    assert "redo-readings" in res.json()["detail"].lower()
    assert "data" not in saved


def test_auto_supersedes_a_returned_prior_handover(client, staff_headers, monkeypatch):
    if not staff_headers:
        import pytest
        pytest.skip("attendant seed unavailable")

    handovers = {
        "HO-PRIOR": {
            "shift_id": "SHIFT-TEST-1", "attendant_id": _AlwaysEqual(),
            "review_status": "returned", "phase": "completed",
            "created_at": "2026-08-05T08:00:00", "attempt_number": 1,
        },
    }
    saved = {}
    _base_patches(monkeypatch, handovers, saved)

    res = _submit_readings(client, staff_headers)
    assert res.status_code == 200
    new_handover_id = res.json()["handover_id"]

    saved_handovers = saved["data"]
    prior = saved_handovers["HO-PRIOR"]
    assert prior["review_status"] == "superseded"
    assert prior["pre_superseded_review_status"] == "returned"
    assert prior["superseded_by"] == new_handover_id

    new_handover = saved_handovers[new_handover_id]
    assert new_handover["supersedes"] == "HO-PRIOR"
    assert new_handover["attempt_number"] == 2


def test_first_ever_submission_has_no_lineage(client, staff_headers, monkeypatch):
    if not staff_headers:
        import pytest
        pytest.skip("attendant seed unavailable")

    saved = {}
    _base_patches(monkeypatch, {}, saved)

    res = _submit_readings(client, staff_headers)
    assert res.status_code == 200
    new_handover_id = res.json()["handover_id"]
    new_handover = saved["data"][new_handover_id]
    assert new_handover["supersedes"] is None
    assert new_handover["attempt_number"] == 1
