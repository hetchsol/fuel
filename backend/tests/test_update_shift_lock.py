"""
PUT /shifts/{shift_id} is the roster-edit endpoint (date/shift_type/
attendants/assignments only). It used to check only status == "inactive"
before allowing an edit, and always merged the client-supplied `status`
straight into the stored record. The edit form hardcodes status: "active"
in every request regardless of the shift's real status, so editing a
reconciled shift's roster silently reset it back to "active" — undoing
Daily Close-Off's lock. Fixed to use the shared assert_shift_editable gate
and to never let this endpoint change status at all.
"""
from datetime import datetime

from app.database.storage import get_station_storage


def _create_shift(client, owner_headers, shift_id, today):
    res = client.post("/api/v1/shifts/", headers=owner_headers, json={
        "shift_id": shift_id, "date": today, "shift_type": "Day",
        "attendants": [], "assignments": [], "status": "active",
    })
    assert res.status_code == 200


def test_editing_a_reconciled_shift_is_rejected(client, owner_headers):
    today = datetime.now().strftime("%Y-%m-%d")
    shift_id = f"{today}-ReconciledEditTest"
    _create_shift(client, owner_headers, shift_id, today)

    get_station_storage("ST001")["shifts"][shift_id]["status"] = "reconciled"

    res = client.put(f"/api/v1/shifts/{shift_id}", headers=owner_headers, json={
        "shift_id": shift_id, "date": today, "shift_type": "Day",
        "attendants": ["Someone"], "assignments": [], "status": "active",
    })

    assert res.status_code == 403
    assert get_station_storage("ST001")["shifts"][shift_id]["status"] == "reconciled"


def test_editing_a_completed_shift_roster_does_not_reset_its_status(client, owner_headers):
    today = datetime.now().strftime("%Y-%m-%d")
    shift_id = f"{today}-CompletedEditTest"
    _create_shift(client, owner_headers, shift_id, today)

    get_station_storage("ST001")["shifts"][shift_id]["status"] = "completed"

    res = client.put(f"/api/v1/shifts/{shift_id}", headers=owner_headers, json={
        "shift_id": shift_id, "date": today, "shift_type": "Day",
        "attendants": ["Someone"], "assignments": [], "status": "active",
    })

    assert res.status_code == 200
    assert res.json()["status"] == "completed"
    assert get_station_storage("ST001")["shifts"][shift_id]["status"] == "completed"


def test_editing_an_active_shift_still_works(client, owner_headers):
    today = datetime.now().strftime("%Y-%m-%d")
    shift_id = f"{today}-ActiveEditTest"
    _create_shift(client, owner_headers, shift_id, today)

    res = client.put(f"/api/v1/shifts/{shift_id}", headers=owner_headers, json={
        "shift_id": shift_id, "date": today, "shift_type": "Night",
        "attendants": ["Someone"], "assignments": [], "status": "active",
    })

    assert res.status_code == 200
    assert res.json()["shift_type"] == "Night"
    assert res.json()["status"] == "active"
