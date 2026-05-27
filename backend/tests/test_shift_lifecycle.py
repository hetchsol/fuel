"""
Tests for the shift status lifecycle (P0-1 / P0-2):
  - active → completed → reconciled ordering
  - role gating on /complete and /reconcile (supervisor or above)
  - edit-lock guard on locked (reconciled / inactive) shifts

Service-level transition logic (advance_shift_on_approval,
reconcile_shifts_for_date, assert_shift_editable) is covered directly here too.
"""
import uuid
from datetime import datetime

import pytest
from fastapi import HTTPException

from app.services import shift_status


def _make_shift(client, owner_headers, suffix):
    today = datetime.now().strftime("%Y-%m-%d")
    shift_id = f"{today}-{suffix}-{uuid.uuid4().hex[:6]}"
    res = client.post("/api/v1/shifts/", headers=owner_headers, json={
        "shift_id": shift_id, "date": today, "shift_type": "Day",
        "attendants": [], "assignments": [], "status": "active",
    })
    assert res.status_code == 200, res.text
    return shift_id


# ── Endpoint guards (P0-2) ─────────────────────────────────────────

def test_complete_requires_supervisor_or_above(client, owner_headers, staff_headers):
    """An attendant (role 'user') cannot complete a shift."""
    if staff_headers is None:
        pytest.skip("attendant account unavailable")
    shift_id = _make_shift(client, owner_headers, "RoleGate")
    res = client.put(f"/api/v1/shifts/{shift_id}/complete", headers=staff_headers)
    assert res.status_code == 403


def test_reconcile_requires_completed_first(client, owner_headers):
    """A still-active shift cannot be reconciled (ordering enforced)."""
    shift_id = _make_shift(client, owner_headers, "Ordering")
    res = client.put(f"/api/v1/shifts/{shift_id}/reconcile", headers=owner_headers)
    assert res.status_code == 400


def test_complete_then_reconcile_succeeds(client, owner_headers):
    """Owner can complete an active shift, then reconcile the completed shift."""
    shift_id = _make_shift(client, owner_headers, "Happy")

    res = client.put(f"/api/v1/shifts/{shift_id}/complete", headers=owner_headers)
    assert res.status_code == 200
    assert res.json()["new_status"] == "completed"

    res = client.put(f"/api/v1/shifts/{shift_id}/reconcile", headers=owner_headers)
    assert res.status_code == 200
    assert res.json()["new_status"] == "reconciled"


def test_cannot_reconcile_a_reconciled_shift(client, owner_headers):
    """A reconciled (locked) shift rejects further status changes with 403."""
    shift_id = _make_shift(client, owner_headers, "Locked")
    client.put(f"/api/v1/shifts/{shift_id}/complete", headers=owner_headers)
    client.put(f"/api/v1/shifts/{shift_id}/reconcile", headers=owner_headers)

    res = client.put(f"/api/v1/shifts/{shift_id}/reconcile", headers=owner_headers)
    assert res.status_code == 403
    res = client.put(f"/api/v1/shifts/{shift_id}/complete", headers=owner_headers)
    assert res.status_code == 403


# ── Service logic (P0-1) ───────────────────────────────────────────

def test_assert_shift_editable():
    for ok in ("active", "completed", "auto-closed"):
        shift_status.assert_shift_editable({"status": ok})  # no raise
    shift_status.assert_shift_editable(None)  # missing -> treated as active
    for locked in ("reconciled", "inactive"):
        with pytest.raises(HTTPException) as exc:
            shift_status.assert_shift_editable({"status": locked})
        assert exc.value.status_code == 403


def test_advance_shift_on_approval(monkeypatch):
    monkeypatch.setattr(shift_status, "save_station_storage", lambda sid: None)

    def with_handovers(hs):
        monkeypatch.setattr(shift_status, "load_station_json",
                            lambda sid, f, default=None: hs)

    # all approved -> completed
    storage = {"shifts": {"S": {"status": "active"}}}
    with_handovers({"a": {"shift_id": "S", "review_status": "approved"},
                    "b": {"shift_id": "S", "review_status": "approved"}})
    assert shift_status.advance_shift_on_approval("S", "ST", storage, "u") is True
    assert storage["shifts"]["S"]["status"] == "completed"

    # one pending -> stays active
    storage = {"shifts": {"S": {"status": "active"}}}
    with_handovers({"a": {"shift_id": "S", "review_status": "approved"},
                    "b": {"shift_id": "S", "review_status": "submitted"}})
    assert shift_status.advance_shift_on_approval("S", "ST", storage, "u") is False
    assert storage["shifts"]["S"]["status"] == "active"

    # locked shift untouched
    storage = {"shifts": {"S": {"status": "reconciled"}}}
    with_handovers({"a": {"shift_id": "S", "review_status": "approved"}})
    assert shift_status.advance_shift_on_approval("S", "ST", storage, "u") is False
    assert storage["shifts"]["S"]["status"] == "reconciled"


def test_multi_attendant_does_not_complete_until_all_approved(monkeypatch):
    """Approving attendant A must NOT complete a shift while B is still working."""
    monkeypatch.setattr(shift_status, "save_station_storage", lambda sid: None)

    def with_handovers(hs):
        monkeypatch.setattr(shift_status, "load_station_json",
                            lambda sid, f, default=None: hs)

    # Shift assigned to A and B. Only A has submitted + been approved.
    storage = {"shifts": {"S": {
        "status": "active",
        "assignments": [{"attendant_id": "A"}, {"attendant_id": "B"}],
    }}}
    with_handovers({"hA": {"shift_id": "S", "attendant_id": "A", "review_status": "approved"}})
    assert shift_status.advance_shift_on_approval("S", "ST", storage, "u") is False
    assert storage["shifts"]["S"]["status"] == "active", "must stay active while B outstanding"

    # Now B's handover is approved too → shift completes.
    with_handovers({
        "hA": {"shift_id": "S", "attendant_id": "A", "review_status": "approved"},
        "hB": {"shift_id": "S", "attendant_id": "B", "review_status": "approved"},
    })
    assert shift_status.advance_shift_on_approval("S", "ST", storage, "u") is True
    assert storage["shifts"]["S"]["status"] == "completed"


def test_multi_attendant_returned_handover_blocks_completion(monkeypatch):
    """A returned (not-yet-redone) handover blocks shift completion."""
    monkeypatch.setattr(shift_status, "save_station_storage", lambda sid: None)
    monkeypatch.setattr(shift_status, "load_station_json", lambda sid, f, default=None: {
        "hA": {"shift_id": "S", "attendant_id": "A", "review_status": "approved"},
        "hB": {"shift_id": "S", "attendant_id": "B", "review_status": "returned"},
    })
    storage = {"shifts": {"S": {
        "status": "active",
        "assignments": [{"attendant_id": "A"}, {"attendant_id": "B"}],
    }}}
    assert shift_status.advance_shift_on_approval("S", "ST", storage, "u") is False
    assert storage["shifts"]["S"]["status"] == "active"


def test_reconcile_shifts_for_date(monkeypatch):
    monkeypatch.setattr(shift_status, "save_station_storage", lambda sid: None)
    storage = {"shifts": {
        "A": {"status": "completed"}, "B": {"status": "active"},
        "C": {"status": "reconciled"}, "D": {"status": "inactive"},
    }}
    changed = shift_status.reconcile_shifts_for_date(
        ["A", "B", "C", "D", "MISSING"], "ST", storage, "u")
    assert set(changed) == {"A", "B"}
    assert storage["shifts"]["A"]["status"] == "reconciled"
    assert storage["shifts"]["B"]["status"] == "reconciled"
    assert storage["shifts"]["C"]["status"] == "reconciled"  # already, untouched
    assert storage["shifts"]["D"]["status"] == "inactive"    # locked, untouched
