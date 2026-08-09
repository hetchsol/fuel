"""
Owner-only bulk administrative closure for a stuck Awaiting Closing backlog:
no cash/dip verification, expected figures carried forward, permanently
marked distinguishable from a real reconciliation. Never mutates a handover
that isn't actually awaiting closing, and a stale id in the batch is skipped
rather than aborting the rest.
"""
import app.api.v1.attendant_handover as ah


def _handover(phase="readings_verified", **overrides):
    base = {
        "handover_id": "HO-1", "shift_id": "S1", "date": "2026-07-01", "shift_type": "Day",
        "attendant_id": "A1", "attendant_name": "Att A", "phase": phase,
        "total_expected": 1000.0, "credit_sales": 0, "lpg_sales": 0, "lubricant_sales": 0,
        "accessory_sales": 0, "nozzle_summaries": [],
    }
    base.update(overrides)
    return base


def _isolate(monkeypatch, handovers):
    monkeypatch.setattr(ah, "_load_handovers", lambda sid: handovers)
    monkeypatch.setattr(ah, "_save_handovers", lambda data, sid: None)
    monkeypatch.setattr(ah, "apply_handover_sales", lambda *a, **k: None)
    monkeypatch.setattr(ah, "_create_reconciliation", lambda *a, **k: None)
    monkeypatch.setattr(ah, "advance_shift_on_approval", lambda *a, **k: True)
    monkeypatch.setattr(ah, "log_audit_event", lambda *a, **k: None)
    monkeypatch.setattr(ah, "create_notification", lambda *a, **k: None)


# ── admin_override_close (unit) ─────────────────────────────────────────

def test_marks_handover_with_expected_figures_and_override_stamp(monkeypatch):
    handovers = {"HO-1": _handover()}
    _isolate(monkeypatch, handovers)

    closed, skipped = ah.admin_override_close("ST001", ["HO-1"], "Historical backlog cleanup", "owner1", "Owner One", {"shifts": {}})

    assert closed == ["HO-1"]
    assert skipped == []
    h = handovers["HO-1"]
    assert h["phase"] == "completed"
    assert h["review_status"] == "approved"
    assert h["difference"] == 0
    assert h["actual_cash"] == h["expected_cash"] == 1000.0
    assert h["admin_override"]["reason"] == "Historical backlog cleanup"
    assert h["admin_override"]["overridden_by"] == "owner1"
    assert "[Administrative override]" in h["supervisor_review"]["note"]


def test_skips_unknown_handover_without_raising(monkeypatch):
    handovers = {}
    _isolate(monkeypatch, handovers)

    closed, skipped = ah.admin_override_close("ST001", ["HO-missing"], "reason", "owner1", "Owner One", {"shifts": {}})

    assert closed == []
    assert skipped == [{"handover_id": "HO-missing", "reason": "Handover not found"}]


def test_skips_handover_not_in_readings_verified_phase(monkeypatch):
    handovers = {"HO-1": _handover(phase="completed")}
    _isolate(monkeypatch, handovers)

    closed, skipped = ah.admin_override_close("ST001", ["HO-1"], "reason", "owner1", "Owner One", {"shifts": {}})

    assert closed == []
    assert skipped[0]["handover_id"] == "HO-1"
    assert "phase=completed" in skipped[0]["reason"]


def test_one_bad_id_does_not_abort_the_rest_of_the_batch(monkeypatch):
    handovers = {"HO-1": _handover(handover_id="HO-1"), "HO-3": _handover(handover_id="HO-3", shift_id="S3")}
    _isolate(monkeypatch, handovers)

    closed, skipped = ah.admin_override_close(
        "ST001", ["HO-1", "HO-missing", "HO-3"], "reason", "owner1", "Owner One", {"shifts": {}})

    assert sorted(closed) == ["HO-1", "HO-3"]
    assert len(skipped) == 1
    assert skipped[0]["handover_id"] == "HO-missing"


# ── HTTP endpoint ────────────────────────────────────────────────────────

def test_endpoint_forbidden_for_manager(client, create_staff):
    create_staff("mgr_override_1", "Test Manager", "manager", password="test1234")
    res = client.post("/api/v1/auth/login", json={"username": "mgr_override_1", "password": "test1234"})
    headers = {"Authorization": f"Bearer {res.json()['access_token']}", "X-Station-Id": "ST001", "Content-Type": "application/json"}

    res = client.post("/api/v1/handover/admin-override-close", headers=headers,
                       json={"handover_ids": ["HO-1"], "reason": "test"})
    assert res.status_code == 403


def test_endpoint_requires_nonblank_reason(client, owner_headers):
    res = client.post("/api/v1/handover/admin-override-close", headers=owner_headers,
                       json={"handover_ids": ["HO-1"], "reason": "   "})
    assert res.status_code == 400


def test_endpoint_succeeds_for_owner_and_notifies(client, owner_headers, monkeypatch):
    notified = []
    monkeypatch.setattr(ah, "create_notification", lambda **k: notified.append(k))
    monkeypatch.setattr(ah, "admin_override_close", lambda sid, ids, reason, by, by_name, storage: (["HO-1"], []))

    res = client.post("/api/v1/handover/admin-override-close", headers=owner_headers,
                       json={"handover_ids": ["HO-1"], "reason": "Historical backlog cleanup"})
    assert res.status_code == 200
    data = res.json()
    assert data["closed"] == ["HO-1"]
    assert data["skipped"] == []
    assert len(notified) == 1
    assert notified[0]["type"] == "HANDOVER_ADMIN_OVERRIDE_CLOSE"
