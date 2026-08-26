"""
Regression test for the 12-hour handover auto-close fallback
(auto_close_stale_handovers): a Phase-1 handover left "awaiting closing"
past HANDOVER_AUTO_CLOSE_HOURS gets administratively closed (expected
figures carried forward, not a real cash/dip verification) exactly like a
manual admin override would, and fires one station-wide notification.

Side-effecting collaborators (stock sync, reconciliation record, shift
advance, audit log) are stubbed so the test stays isolated — same style as
tests/test_void_handover_scoping.py.
"""
from datetime import datetime, timedelta

import app.api.v1.attendant_handover as ah


def _rv(hours_ago, shift_id, name, hid=None):
    """A readings_verified (Phase-1) handover that completed `hours_ago`."""
    ts = (datetime.now() - timedelta(hours=hours_ago)).isoformat()
    return {
        "handover_id": hid or f"HO-{name}", "shift_id": shift_id, "attendant_id": name,
        "attendant_name": name, "date": "2026-05-27", "shift_type": "Day",
        "phase": "readings_verified", "phase_1_completed_at": ts, "created_at": ts,
        "total_expected": 1000.0, "credit_sales": 0, "nozzle_summaries": [],
    }


def _isolate(monkeypatch, handovers):
    monkeypatch.setattr(ah, "_load_handovers", lambda sid: handovers)
    monkeypatch.setattr(ah, "_save_handovers", lambda data, sid: handovers.update(data))
    monkeypatch.setattr(ah, "apply_handover_sales", lambda *a, **k: None)
    monkeypatch.setattr(ah, "_mark_daily_entries_stores_applied", lambda *a, **k: None)
    monkeypatch.setattr(ah, "_create_reconciliation", lambda *a, **k: None)
    monkeypatch.setattr(ah, "advance_shift_on_approval", lambda *a, **k: False)
    monkeypatch.setattr(ah, "log_audit_event", lambda *a, **k: None)


def test_auto_closes_only_past_the_12h_threshold(monkeypatch):
    handovers = {
        "HO-A": _rv(13, "S1", "A"),   # past 12h -> auto-closed
        "HO-B": _rv(1, "S2", "B"),    # fresh -> untouched
        "HO-C": {"phase": "completed", "review_status": "approved"},  # not phase-1
    }
    notes = []
    _isolate(monkeypatch, handovers)
    monkeypatch.setattr(ah, "create_notification", lambda **k: notes.append(k))

    closed = ah.auto_close_stale_handovers("ST001", storage={})

    assert closed == ["HO-A"]
    assert handovers["HO-A"]["phase"] == "completed"
    assert handovers["HO-A"]["review_status"] == "approved"
    assert handovers["HO-A"]["difference"] == 0
    assert handovers["HO-A"]["admin_override"]["overridden_by"] == "system"
    assert "over 12 hours" in handovers["HO-A"]["admin_override"]["reason"]
    # Untouched — still mid-window, no notification-worthy action taken on it.
    assert handovers["HO-B"]["phase"] == "readings_verified"

    assert len(notes) == 1
    assert notes[0]["type"] == "HANDOVER_AUTO_CLOSED"
    assert notes[0]["severity"] == "critical"
    assert "HO-A" in notes[0]["message"]


def test_nothing_past_threshold_closes_nothing_and_stays_silent(monkeypatch):
    handovers = {"HO-B": _rv(1, "S2", "B")}
    notes = []
    _isolate(monkeypatch, handovers)
    monkeypatch.setattr(ah, "create_notification", lambda **k: notes.append(k))

    assert ah.auto_close_stale_handovers("ST001", storage={}) == []
    assert handovers["HO-B"]["phase"] == "readings_verified"
    assert notes == []
