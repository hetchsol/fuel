"""
Tests for safe deposit tracking.

Deposits are bound to a rostered attendant: an attendant records their own,
and a supervisor/manager/owner records one for a rostered attendant.
"""
from datetime import datetime
import uuid

from app.database.storage import get_station_storage


def _unique_shift_id():
    return f"DEP-{uuid.uuid4().hex[:8]}"


def _active_shift(client, owner_headers, roster):
    """Create an active shift, then put `roster` on it directly (skips user-role validation)."""
    today = datetime.now().strftime("%Y-%m-%d")
    shift_id = _unique_shift_id()
    client.post("/api/v1/shifts/", headers=owner_headers, json={
        "shift_id": shift_id, "date": today, "shift_type": "Day",
        "attendants": [], "assignments": [], "status": "active",
    })
    get_station_storage("ST001")["shifts"][shift_id]["assignments"] = roster
    return shift_id


def test_record_deposit(client, owner_headers):
    """The owner records a deposit for a rostered attendant; it belongs to that attendant."""
    shift_id = _active_shift(client, owner_headers, [{"attendant_id": "ATT-DEP", "attendant_name": "Dep Attendant"}])

    # Without saying whose deposit it is, it is refused
    res = client.post("/api/v1/safe-deposits/", headers=owner_headers, json={
        "shift_id": shift_id, "amount": 1500.00, "note": "Test",
    })
    assert res.status_code == 400

    res = client.post("/api/v1/safe-deposits/", headers=owner_headers, json={
        "shift_id": shift_id, "amount": 1500.00, "note": "Test", "attendant_id": "ATT-DEP",
    })
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    assert data["my_total"] == 1500.00
    assert data["my_count"] == 1
    assert data["deposit"]["attendant_id"] == "ATT-DEP"
    assert data["deposit"]["recorded_by_id"] == "O001"


def test_deposit_for_attendant_not_on_roster(client, owner_headers):
    shift_id = _active_shift(client, owner_headers, [{"attendant_id": "ATT-DEP", "attendant_name": "Dep Attendant"}])
    res = client.post("/api/v1/safe-deposits/", headers=owner_headers, json={
        "shift_id": shift_id, "amount": 500.00, "attendant_id": "SOMEONE-ELSE",
    })
    assert res.status_code == 403


def test_deposit_on_nonexistent_shift(client, owner_headers):
    """Cannot deposit on a shift that doesn't exist."""
    res = client.post("/api/v1/safe-deposits/", headers=owner_headers, json={
        "shift_id": "FAKE-SHIFT-999", "amount": 500.00, "time": "10:00",
    })
    assert res.status_code == 404


def test_deposit_zero_amount(client, owner_headers):
    """Cannot deposit zero or negative amount."""
    today = datetime.now().strftime("%Y-%m-%d")
    shift_id = _unique_shift_id()

    client.post("/api/v1/shifts/", headers=owner_headers, json={
        "shift_id": shift_id, "date": today, "shift_type": "Day",
        "attendants": [], "assignments": [], "status": "active",
    })

    res = client.post("/api/v1/safe-deposits/", headers=owner_headers, json={
        "shift_id": shift_id, "amount": 0, "time": "10:00",
    })
    assert res.status_code == 422


def test_get_my_deposits(client, owner_headers):
    """Someone on the roster sees their own deposits."""
    shift_id = _active_shift(client, owner_headers, [{"attendant_id": "O001", "attendant_name": "Owner On Roster"}])

    client.post("/api/v1/safe-deposits/", headers=owner_headers, json={
        "shift_id": shift_id, "amount": 1000.00, "time": "08:00",
    })
    client.post("/api/v1/safe-deposits/", headers=owner_headers, json={
        "shift_id": shift_id, "amount": 2000.00, "time": "09:15",
    })

    res = client.get(f"/api/v1/safe-deposits/{shift_id}/my-deposits", headers=owner_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["count"] == 2
    assert data["total"] == 3000.00
