"""
P2-7: every shift-status mutation logs an audit event. complete/reconcile are
covered indirectly elsewhere; this pins deactivate and delete (previously silent).
"""
import uuid
from datetime import datetime

import app.api.v1.shifts as shifts_mod


def _make_shift(client, owner_headers, suffix):
    today = datetime.now().strftime("%Y-%m-%d")
    shift_id = f"{today}-{suffix}-{uuid.uuid4().hex[:6]}"
    res = client.post("/api/v1/shifts/", headers=owner_headers, json={
        "shift_id": shift_id, "date": today, "shift_type": "Day",
        "attendants": [], "assignments": [], "status": "active",
    })
    assert res.status_code == 200, res.text
    return shift_id


def test_deactivate_logs_audit(client, owner_headers, monkeypatch):
    events = []
    monkeypatch.setattr(shifts_mod, "log_audit_event", lambda **k: events.append(k))
    shift_id = _make_shift(client, owner_headers, "DeactAudit")

    res = client.put(f"/api/v1/shifts/{shift_id}/deactivate", headers=owner_headers)
    assert res.status_code == 200
    deact = [e for e in events if e["action"] == "shift_deactivated"]
    assert deact and deact[0]["entity_id"] == shift_id
    assert deact[0]["details"]["previous_status"] == "active"


def test_delete_logs_audit(client, owner_headers, monkeypatch):
    events = []
    monkeypatch.setattr(shifts_mod, "log_audit_event", lambda **k: events.append(k))
    shift_id = _make_shift(client, owner_headers, "DelAudit")
    client.put(f"/api/v1/shifts/{shift_id}/deactivate", headers=owner_headers)

    res = client.delete(f"/api/v1/shifts/{shift_id}", headers=owner_headers)
    assert res.status_code == 200
    assert "shift_deleted" in [e["action"] for e in events]
