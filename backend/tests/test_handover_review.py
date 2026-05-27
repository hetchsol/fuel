"""
Tests for handover review (P0-3): approving a FLAGGED handover requires a
written justification note; clean (submitted) handovers do not.

Handover storage is monkeypatched so the test stays isolated (no real station
files, notifications, or audit entries are written).
"""
import app.api.v1.attendant_handover as ah


def _isolate(monkeypatch, handovers):
    """Point the review endpoint at an in-memory handovers dict and stub side effects."""
    monkeypatch.setattr(ah, "_load_handovers", lambda sid: handovers)
    monkeypatch.setattr(ah, "_save_handovers", lambda data, sid: None)
    # No closed-off days.
    monkeypatch.setattr(ah, "load_station_json", lambda sid, fn, default=None: {})
    # Stub side effects unrelated to the guard under test.
    monkeypatch.setattr(ah, "create_notification", lambda *a, **k: None)
    monkeypatch.setattr(ah, "log_audit_event", lambda *a, **k: None)
    monkeypatch.setattr(ah, "advance_shift_on_approval", lambda *a, **k: False)


def _handover(review_status):
    return {
        "handover_id": "HO-1",
        "shift_id": "S1",
        "date": "2026-05-27",
        "phase": "completed",
        "review_status": review_status,
        "attendant_id": "A",
        "attendant_name": "Att A",
    }


def test_approve_flagged_without_note_is_rejected(client, owner_headers, monkeypatch):
    handovers = {"HO-1": _handover("flagged")}
    _isolate(monkeypatch, handovers)

    res = client.post("/api/v1/handover/review", headers=owner_headers,
                      json={"handover_id": "HO-1", "action": "approve"})
    assert res.status_code == 400
    assert "flagged" in res.json()["detail"].lower()
    assert handovers["HO-1"]["review_status"] == "flagged"  # unchanged


def test_approve_flagged_with_note_succeeds(client, owner_headers, monkeypatch):
    handovers = {"HO-1": _handover("flagged")}
    _isolate(monkeypatch, handovers)

    res = client.post("/api/v1/handover/review", headers=owner_headers, json={
        "handover_id": "HO-1", "action": "approve",
        "supervisor_note": "Verified shortage with attendant; deducted from float.",
    })
    assert res.status_code == 200
    assert handovers["HO-1"]["review_status"] == "approved"
    assert handovers["HO-1"]["supervisor_review"]["note"]


def test_approve_clean_handover_needs_no_note(client, owner_headers, monkeypatch):
    handovers = {"HO-1": _handover("submitted")}
    _isolate(monkeypatch, handovers)

    res = client.post("/api/v1/handover/review", headers=owner_headers,
                      json={"handover_id": "HO-1", "action": "approve"})
    assert res.status_code == 200
    assert handovers["HO-1"]["review_status"] == "approved"


def test_blank_note_does_not_satisfy_flagged_approve(client, owner_headers, monkeypatch):
    handovers = {"HO-1": _handover("flagged")}
    _isolate(monkeypatch, handovers)

    res = client.post("/api/v1/handover/review", headers=owner_headers,
                      json={"handover_id": "HO-1", "action": "approve", "supervisor_note": "   "})
    assert res.status_code == 400
    assert handovers["HO-1"]["review_status"] == "flagged"
