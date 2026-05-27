"""
Tests for P1-5/P1-6: the review-queue surfaces Phase-1 handovers awaiting
closing (with a stale flag), and notify_stale_readings escalates stale ones once.
"""
from datetime import datetime, timedelta

import app.api.v1.attendant_handover as ah


def _rv(hours_ago, shift_id, name):
    """A readings_verified (Phase-1) handover that completed `hours_ago`."""
    ts = (datetime.now() - timedelta(hours=hours_ago)).isoformat()
    return {
        "handover_id": f"HO-{name}", "shift_id": shift_id, "attendant_name": name,
        "date": "2026-05-27", "shift_type": "Day",
        "phase": "readings_verified", "phase_1_completed_at": ts,
        "created_at": ts,
    }


def test_review_queue_reports_awaiting_closing(client, owner_headers, monkeypatch):
    handovers = {
        "HO-A": _rv(6, "S1", "A"),     # stale (>4h)
        "HO-B": _rv(1, "S2", "B"),     # awaiting, not stale
        "HO-C": {  # in-review (Phase 2 done)
            "handover_id": "HO-C", "shift_id": "S3", "attendant_name": "C",
            "date": "2026-05-27", "shift_type": "Day",
            "phase": "completed", "review_status": "submitted",
            "created_at": datetime.now().isoformat(),
        },
    }
    monkeypatch.setattr(ah, "_load_handovers", lambda sid: handovers)

    res = client.get("/api/v1/handover/review-queue", headers=owner_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["awaiting_closing"] == 2
    assert data["stale_readings_count"] == 1
    assert data["pending"] == 1
    rows = {r["handover_id"]: r for r in data["awaiting_closing_handovers"]}
    assert rows["HO-A"]["is_stale"] is True
    assert rows["HO-B"]["is_stale"] is False
    assert rows["HO-A"]["hours_waiting"] >= 4


def test_notify_stale_readings_is_deduped(monkeypatch):
    handovers = {
        "HO-A": _rv(6, "S1", "A"),   # stale -> notify
        "HO-B": _rv(1, "S2", "B"),   # fresh -> skip
        "HO-C": {"phase": "completed", "review_status": "approved"},  # not phase-1
    }
    notes = []
    monkeypatch.setattr(ah, "_load_handovers", lambda sid: handovers)
    monkeypatch.setattr(ah, "_save_handovers", lambda data, sid: None)
    monkeypatch.setattr(ah, "create_notification", lambda **k: notes.append(k))

    assert ah.notify_stale_readings("ST001") == 1
    assert handovers["HO-A"]["stale_notified"] is True
    assert "stale_notified" not in handovers["HO-B"]
    assert notes and notes[0]["type"] == "STALE_READINGS"

    # Second scan: already notified -> no new notifications.
    assert ah.notify_stale_readings("ST001") == 0
