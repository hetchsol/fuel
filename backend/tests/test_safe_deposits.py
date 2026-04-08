"""
Tests for safe deposit tracking.
"""
from datetime import datetime
import uuid


def _unique_shift_id():
    return f"DEP-{uuid.uuid4().hex[:8]}"


def test_record_deposit(client, owner_headers):
    """Can record a safe deposit during an active shift."""
    today = datetime.now().strftime("%Y-%m-%d")
    shift_id = _unique_shift_id()

    client.post("/api/v1/shifts/", headers=owner_headers, json={
        "shift_id": shift_id, "date": today, "shift_type": "Day",
        "attendants": [], "assignments": [], "status": "active",
    })

    res = client.post("/api/v1/safe-deposits/", headers=owner_headers, json={
        "shift_id": shift_id, "amount": 1500.00, "time": "09:30", "note": "Test",
    })
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    assert data["my_total"] == 1500.00
    assert data["my_count"] == 1


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
    """Can retrieve own deposits for a shift."""
    today = datetime.now().strftime("%Y-%m-%d")
    shift_id = _unique_shift_id()

    client.post("/api/v1/shifts/", headers=owner_headers, json={
        "shift_id": shift_id, "date": today, "shift_type": "Day",
        "attendants": [], "assignments": [], "status": "active",
    })

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
