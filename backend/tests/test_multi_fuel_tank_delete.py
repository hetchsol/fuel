"""
Chunk 2 — Tank-delete guard tests.

These verify that DELETE /api/v1/tanks/{tank_id} blocks when the tank is
referenced by either a pump_station.tank_id (legacy path) or a nozzle.tank_id
(new path), and surfaces the offending entities in the error message.

Covers Test Matrix entries E3 and E4 from Multi_Fuel_Nozzles_Plan.html §10.
"""
from app.database.storage import get_station_storage


STATION = "ST001"


def _ensure_tank(client, owner_headers, tank_id="TANK-DIESEL-DEL", fuel="Diesel"):
    """Create a tank for the test if it doesn't already exist; return its id."""
    storage = get_station_storage(STATION)
    if tank_id not in storage.get("tanks", {}):
        res = client.post(
            f"/api/v1/tanks/create?tank_id={tank_id}&fuel_type={fuel}&capacity=20000",
            headers=owner_headers,
        )
        assert res.status_code == 200, res.text
    return tank_id


def _add_island(storage, island_id, pump_id, pump_tank_id, nozzles):
    """Inject an island into station storage with the given nozzle config."""
    storage.setdefault("islands", {})[island_id] = {
        "island_id": island_id,
        "name": f"Island {island_id}",
        "status": "active",
        "product_type": "Diesel",
        "pump_station": {
            "pump_station_id": pump_id,
            "island_id": island_id,
            "name": f"Pump {pump_id}",
            "tank_id": pump_tank_id,
            "nozzles": nozzles,
        },
    }


def _remove_island(storage, island_id):
    storage.get("islands", {}).pop(island_id, None)


# ---------------------------------------------------------------------------
# E3 — Block deletion when a nozzle.tank_id references the tank
# ---------------------------------------------------------------------------

def test_delete_blocked_by_nozzle_tank_id(client, owner_headers):
    tank_id = "TANK-DIESEL-NZTEST"
    _ensure_tank(client, owner_headers, tank_id, "Diesel")

    storage = get_station_storage(STATION)
    _add_island(
        storage,
        island_id="ISL-NZTEST",
        pump_id="PS-NZTEST",
        pump_tank_id=None,  # pump doesn't reference the tank — only the nozzle does
        nozzles=[
            {"nozzle_id": "NZ-NZTEST-A", "fuel_type": "Diesel", "tank_id": tank_id, "status": "Active"},
        ],
    )

    try:
        res = client.delete(f"/api/v1/tanks/{tank_id}", headers=owner_headers)
        assert res.status_code == 400, res.text
        detail = res.json()["detail"]
        # The error message names the offending nozzle so the operator can find it
        assert "NZ-NZTEST-A" in detail
        assert "ISL-NZTEST" in detail
        assert "Nozzles" in detail
        # And does NOT mention pumps (since no pump references this tank)
        assert "Pump stations" not in detail
    finally:
        _remove_island(storage, "ISL-NZTEST")


# ---------------------------------------------------------------------------
# E4 — Existing pump-level guard still fires (regression)
# ---------------------------------------------------------------------------

def test_delete_blocked_by_pump_station_tank_id(client, owner_headers):
    tank_id = "TANK-DIESEL-PUTEST"
    _ensure_tank(client, owner_headers, tank_id, "Diesel")

    storage = get_station_storage(STATION)
    _add_island(
        storage,
        island_id="ISL-PUTEST",
        pump_id="PS-PUTEST",
        pump_tank_id=tank_id,  # pump references the tank, no nozzle.tank_id
        nozzles=[
            {"nozzle_id": "NZ-PUTEST-A", "fuel_type": "Diesel", "status": "Active"},
        ],
    )

    try:
        res = client.delete(f"/api/v1/tanks/{tank_id}", headers=owner_headers)
        assert res.status_code == 400, res.text
        detail = res.json()["detail"]
        assert "PS-PUTEST" in detail
        assert "ISL-PUTEST" in detail
        assert "Pump stations" in detail
    finally:
        _remove_island(storage, "ISL-PUTEST")


# ---------------------------------------------------------------------------
# Combined — Both pump and nozzle reference the tank
# ---------------------------------------------------------------------------

def test_delete_error_lists_both_pumps_and_nozzles(client, owner_headers):
    tank_id = "TANK-DIESEL-BOTHTEST"
    _ensure_tank(client, owner_headers, tank_id, "Diesel")

    storage = get_station_storage(STATION)
    _add_island(
        storage,
        island_id="ISL-BOTHTEST",
        pump_id="PS-BOTHTEST",
        pump_tank_id=tank_id,
        nozzles=[
            {"nozzle_id": "NZ-BOTHTEST-A", "fuel_type": "Diesel", "tank_id": tank_id, "status": "Active"},
        ],
    )

    try:
        res = client.delete(f"/api/v1/tanks/{tank_id}", headers=owner_headers)
        assert res.status_code == 400, res.text
        detail = res.json()["detail"]
        assert "Pump stations" in detail
        assert "Nozzles" in detail
        assert "PS-BOTHTEST" in detail
        assert "NZ-BOTHTEST-A" in detail
    finally:
        _remove_island(storage, "ISL-BOTHTEST")


# ---------------------------------------------------------------------------
# Cleanup path — Once nothing references the tank, delete succeeds
# ---------------------------------------------------------------------------

def test_delete_succeeds_after_references_removed(client, owner_headers):
    tank_id = "TANK-DIESEL-OKTEST"
    _ensure_tank(client, owner_headers, tank_id, "Diesel")

    storage = get_station_storage(STATION)
    _add_island(
        storage,
        island_id="ISL-OKTEST",
        pump_id="PS-OKTEST",
        pump_tank_id=None,
        nozzles=[
            {"nozzle_id": "NZ-OKTEST-A", "fuel_type": "Diesel", "tank_id": tank_id, "status": "Active"},
        ],
    )

    # First attempt is blocked
    res = client.delete(f"/api/v1/tanks/{tank_id}", headers=owner_headers)
    assert res.status_code == 400, res.text

    # Clear the nozzle's tank_id
    storage["islands"]["ISL-OKTEST"]["pump_station"]["nozzles"][0]["tank_id"] = None

    # Now delete works
    res = client.delete(f"/api/v1/tanks/{tank_id}", headers=owner_headers)
    assert res.status_code == 200, res.text
    assert tank_id not in storage.get("tanks", {})

    _remove_island(storage, "ISL-OKTEST")


# ---------------------------------------------------------------------------
# 404 path preserved
# ---------------------------------------------------------------------------

def test_delete_unknown_tank_returns_404(client, owner_headers):
    res = client.delete("/api/v1/tanks/TANK-DOES-NOT-EXIST", headers=owner_headers)
    assert res.status_code == 404
