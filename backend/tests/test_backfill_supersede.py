"""
Tests for POST /handover/backfill-supersede (Phase 5 of the duplicate-
handover remediation) - the owner-only cleanup action for historical
duplicate handovers that predate the auto-supersede guard on submission
(resolve_resubmission), so they have no lineage link between them.

Same fixture shape as test_void_handover_scoping.py (the real Sharon
Mulemwa case this whole remediation traces back to): one approved handover
sitting alongside a stray "returned" orphan from an accidental resubmission.
"""
import app.api.v1.attendant_handover as ah


def _isolate(monkeypatch, handovers, advance_calls):
    monkeypatch.setattr(ah, "_load_handovers", lambda sid: handovers)
    monkeypatch.setattr(ah, "_save_handovers", lambda data, sid: handovers.update(data))
    monkeypatch.setattr(ah, "load_station_json", lambda sid, fn, default=None: {})
    monkeypatch.setattr(ah, "log_audit_event", lambda *a, **k: None)
    monkeypatch.setattr(ah, "advance_shift_on_approval",
                         lambda shift_id, sid, storage, performed_by: advance_calls.append(shift_id) or True)


def _handovers_fixture():
    return {
        "HO-APPROVED": {
            "handover_id": "HO-APPROVED",
            "shift_id": "S1",
            "date": "2026-08-24",
            "phase": "completed",
            "review_status": "approved",
            "attendant_id": "STF009",
            "attendant_name": "Sharon Mulemwa",
            "created_at": "2026-08-24T10:08:55",
        },
        "HO-DUPLICATE": {
            "handover_id": "HO-DUPLICATE",
            "shift_id": "S1",
            "date": "2026-08-24",
            "phase": "completed",
            "review_status": "returned",
            "status": "reopened",
            "attendant_id": "STF009",
            "attendant_name": "Sharon Mulemwa",
            "created_at": "2026-08-24T19:23:18",
        },
    }


def test_backfill_marks_the_orphan_superseded_and_links_it(client, owner_headers, monkeypatch):
    handovers = _handovers_fixture()
    advance_calls = []
    _isolate(monkeypatch, handovers, advance_calls)

    res = client.post("/api/v1/handover/backfill-supersede", headers=owner_headers, json={
        "shift_id": "S1",
        "attendant_id": "STF009",
        "keep_handover_id": "HO-APPROVED",
        "supersede_handover_ids": ["HO-DUPLICATE"],
        "reason": "Historical duplicate predating auto-supersede",
    })

    assert res.status_code == 200, res.text
    body = res.json()
    assert body["superseded_handover_ids"] == ["HO-DUPLICATE"]
    assert body["kept_handover_id"] == "HO-APPROVED"
    assert body["shift_advanced_to_completed"] is True

    assert handovers["HO-DUPLICATE"]["review_status"] == "superseded"
    assert handovers["HO-DUPLICATE"]["pre_superseded_review_status"] == "returned"
    assert handovers["HO-DUPLICATE"]["superseded_by"] == "HO-APPROVED"
    # The kept handover must be completely untouched.
    assert handovers["HO-APPROVED"]["review_status"] == "approved"
    assert "superseded_by" not in handovers["HO-APPROVED"]
    assert advance_calls == ["S1"]


def test_already_voided_ids_are_skipped_not_reprocessed(monkeypatch, client, owner_headers):
    handovers = _handovers_fixture()
    handovers["HO-DUPLICATE"]["review_status"] = "voided"
    advance_calls = []
    _isolate(monkeypatch, handovers, advance_calls)

    res = client.post("/api/v1/handover/backfill-supersede", headers=owner_headers, json={
        "shift_id": "S1",
        "attendant_id": "STF009",
        "keep_handover_id": "HO-APPROVED",
        "supersede_handover_ids": ["HO-DUPLICATE"],
        "reason": "Already voided, nothing to do",
    })

    assert res.status_code == 400
    assert "already voided" in res.json()["detail"].lower()
    assert handovers["HO-DUPLICATE"]["review_status"] == "voided"  # unchanged, not overwritten to "superseded"


def test_rejects_keeper_in_supersede_list(client, owner_headers, monkeypatch):
    handovers = _handovers_fixture()
    advance_calls = []
    _isolate(monkeypatch, handovers, advance_calls)

    res = client.post("/api/v1/handover/backfill-supersede", headers=owner_headers, json={
        "shift_id": "S1",
        "attendant_id": "STF009",
        "keep_handover_id": "HO-APPROVED",
        "supersede_handover_ids": ["HO-APPROVED"],
        "reason": "nonsense input",
    })

    assert res.status_code == 400
    assert handovers["HO-APPROVED"]["review_status"] == "approved"


def test_unknown_handover_id_404s_without_touching_anything(client, owner_headers, monkeypatch):
    handovers = _handovers_fixture()
    advance_calls = []
    _isolate(monkeypatch, handovers, advance_calls)

    res = client.post("/api/v1/handover/backfill-supersede", headers=owner_headers, json={
        "shift_id": "S1",
        "attendant_id": "STF009",
        "keep_handover_id": "HO-APPROVED",
        "supersede_handover_ids": ["HO-NOT-REAL"],
        "reason": "typo'd id",
    })

    assert res.status_code == 404
    assert handovers["HO-APPROVED"]["review_status"] == "approved"
    assert handovers["HO-DUPLICATE"]["review_status"] == "returned"
    assert advance_calls == []


def test_blocked_when_day_already_closed_off(client, owner_headers, monkeypatch):
    handovers = _handovers_fixture()
    advance_calls = []
    _isolate(monkeypatch, handovers, advance_calls)
    monkeypatch.setattr(ah, "load_station_json",
                         lambda sid, fn, default=None: {"2026-08-24": {}} if fn == "daily_close_offs.json" else {})

    res = client.post("/api/v1/handover/backfill-supersede", headers=owner_headers, json={
        "shift_id": "S1",
        "attendant_id": "STF009",
        "keep_handover_id": "HO-APPROVED",
        "supersede_handover_ids": ["HO-DUPLICATE"],
        "reason": "should be blocked",
    })

    assert res.status_code == 400
    assert "closed off" in res.json()["detail"].lower()
    assert handovers["HO-DUPLICATE"]["review_status"] == "returned"
    assert advance_calls == []
