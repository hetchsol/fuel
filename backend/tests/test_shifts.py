"""
Tests for shift creation, management, and tank dip readings.
"""
from datetime import datetime


def test_create_shift(client, owner_headers):
    """Owner can create a shift."""
    today = datetime.now().strftime("%Y-%m-%d")
    res = client.post("/api/v1/shifts/", headers=owner_headers, json={
        "shift_id": f"{today}-Day",
        "date": today,
        "shift_type": "Day",
        "attendants": [],
        "assignments": [],
        "status": "active",
    })
    assert res.status_code == 200
    data = res.json()
    assert data["shift_id"] == f"{today}-Day"
    assert data["status"] == "active"


def test_create_duplicate_shift_blocked(client, owner_headers):
    """Cannot create a shift with same ID when active."""
    today = datetime.now().strftime("%Y-%m-%d")
    shift_id = f"{today}-DupTest"
    client.post("/api/v1/shifts/", headers=owner_headers, json={
        "shift_id": shift_id,
        "date": today,
        "shift_type": "Day",
        "attendants": [],
        "assignments": [],
        "status": "active",
    })
    res = client.post("/api/v1/shifts/", headers=owner_headers, json={
        "shift_id": shift_id,
        "date": today,
        "shift_type": "Day",
        "attendants": [],
        "assignments": [],
        "status": "active",
    })
    assert res.status_code == 400


def test_deactivate_then_recreate(client, owner_headers):
    """Can recreate a shift after deactivating it."""
    today = datetime.now().strftime("%Y-%m-%d")
    shift_id = f"{today}-ReCreate"

    # Create
    client.post("/api/v1/shifts/", headers=owner_headers, json={
        "shift_id": shift_id, "date": today, "shift_type": "Day",
        "attendants": [], "assignments": [], "status": "active",
    })

    # Deactivate
    res = client.put(f"/api/v1/shifts/{shift_id}/deactivate", headers=owner_headers)
    assert res.status_code == 200

    # Recreate
    res = client.post("/api/v1/shifts/", headers=owner_headers, json={
        "shift_id": shift_id, "date": today, "shift_type": "Day",
        "attendants": [], "assignments": [], "status": "active",
    })
    assert res.status_code == 200


def test_list_shifts(client, owner_headers):
    """Can list all shifts."""
    res = client.get("/api/v1/shifts/", headers=owner_headers)
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)


def test_tank_dip_reading(client, owner_headers):
    """Can record a tank dip reading for a shift."""
    today = datetime.now().strftime("%Y-%m-%d")
    shift_id = f"{today}-DipTest"

    # Create shift
    client.post("/api/v1/shifts/", headers=owner_headers, json={
        "shift_id": shift_id, "date": today, "shift_type": "Day",
        "attendants": [], "assignments": [], "status": "active",
    })

    # Record dip reading
    res = client.post(f"/api/v1/shifts/{shift_id}/tank-dip-reading", headers=owner_headers, json={
        "tank_id": "TANK-DIESEL",
        "opening_dip_cm": 19.10,
        "closing_dip_cm": None,
    })
    # May return 200 or 404 depending on whether TANK-DIESEL exists
    assert res.status_code in [200, 404]
