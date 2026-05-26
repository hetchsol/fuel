"""
Tests for renaming an island's display name.

Endpoint: PUT /api/v1/islands/{island_id}/name  (Manager/Owner only)

These confirm the rename is purely a display-name change and is correctly
role-gated. They do NOT exercise naming-convention / reconciliation logic,
which the endpoint intentionally leaves untouched.
"""
from app.database.storage import get_station_storage


STATION = "ST001"


def _setup_island(island_id="ISL-RENAME", pump_id="PS-RENAME", name="Original Name"):
    storage = get_station_storage(STATION)
    storage.setdefault("islands", {})[island_id] = {
        "island_id": island_id,
        "name": name,
        "status": "active",
        "product_type": "Diesel",
        "pump_station": {
            "pump_station_id": pump_id,
            "island_id": island_id,
            "name": f"Pump {pump_id}",
            "tank_id": None,
            "nozzles": [
                {
                    "nozzle_id": f"{pump_id}-A",
                    "pump_station_id": pump_id,
                    "fuel_type": "Diesel",
                    "tank_id": None,
                    "status": "Active",
                    "display_label": "1A",
                    "fuel_type_abbrev": "LSD",
                }
            ],
        },
        "display_number": 1,
        "fuel_type_abbrev": "LSD",
    }
    return storage


def _cleanup(island_id="ISL-RENAME"):
    get_station_storage(STATION).get("islands", {}).pop(island_id, None)


def test_owner_can_rename_island(client, owner_headers):
    _setup_island()
    try:
        res = client.put(
            "/api/v1/islands/ISL-RENAME/name",
            headers=owner_headers,
            json={"name": "Forecourt North"},
        )
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["name"] == "Forecourt North"
        assert body["old_name"] == "Original Name"

        # Persisted: GET reflects the new name
        got = client.get("/api/v1/islands/ISL-RENAME", headers=owner_headers)
        assert got.status_code == 200
        assert got.json()["name"] == "Forecourt North"
    finally:
        _cleanup()


def test_rename_leaves_display_fields_untouched(client, owner_headers):
    """Renaming must not disturb computed labels or product type."""
    _setup_island()
    try:
        client.put(
            "/api/v1/islands/ISL-RENAME/name",
            headers=owner_headers,
            json={"name": "Anything"},
        )
        got = client.get("/api/v1/islands/ISL-RENAME", headers=owner_headers).json()
        assert got["product_type"] == "Diesel"
        assert got["display_number"] == 1
        assert got["fuel_type_abbrev"] == "LSD"
        assert got["pump_station"]["nozzles"][0]["display_label"] == "1A"
    finally:
        _cleanup()


def test_attendant_cannot_rename_island(client, owner_headers, staff_headers):
    assert staff_headers is not None, "staff fixture failed to provision"
    _setup_island()
    try:
        res = client.put(
            "/api/v1/islands/ISL-RENAME/name",
            headers=staff_headers,
            json={"name": "Hacked Name"},
        )
        assert res.status_code == 403, res.text
        # Name is unchanged
        got = client.get("/api/v1/islands/ISL-RENAME", headers=owner_headers).json()
        assert got["name"] == "Original Name"
    finally:
        _cleanup()


def test_empty_name_rejected(client, owner_headers):
    _setup_island()
    try:
        res = client.put(
            "/api/v1/islands/ISL-RENAME/name",
            headers=owner_headers,
            json={"name": "   "},
        )
        assert res.status_code == 400, res.text
    finally:
        _cleanup()


def test_name_is_trimmed(client, owner_headers):
    _setup_island()
    try:
        res = client.put(
            "/api/v1/islands/ISL-RENAME/name",
            headers=owner_headers,
            json={"name": "  Bay 3  "},
        )
        assert res.status_code == 200, res.text
        assert res.json()["name"] == "Bay 3"
    finally:
        _cleanup()


def test_rename_missing_island_404(client, owner_headers):
    res = client.put(
        "/api/v1/islands/NO-SUCH-ISLAND/name",
        headers=owner_headers,
        json={"name": "Whatever"},
    )
    assert res.status_code == 404, res.text
