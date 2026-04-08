"""
Tests for station management and health check.
"""


def test_health_endpoint(client):
    """Health check returns ok."""
    res = client.get("/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] in ["ok", "degraded"]
    assert "version" in data


def test_list_stations(client, owner_headers):
    """Can list stations (including disabled)."""
    res = client.get("/api/v1/stations/?include_disabled=true", headers=owner_headers)
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)
    # In test env, stations may or may not be seeded
    # Just verify the endpoint works and returns a list


def test_create_and_get_station(client, owner_headers):
    """Can create a new station and retrieve it."""
    res = client.post("/api/v1/stations/", headers=owner_headers, json={
        "station_id": "ST999",
        "name": "Test Station 999",
        "location": "Test Location",
    })
    assert res.status_code == 200
    data = res.json()
    assert data["station_id"] == "ST999"

    # Get it back
    res2 = client.get("/api/v1/stations/ST999", headers=owner_headers)
    assert res2.status_code == 200
    assert res2.json()["name"] == "Test Station 999"


def test_station_not_found(client, owner_headers):
    """Getting a non-existent station returns 404."""
    res = client.get("/api/v1/stations/NONEXISTENT", headers=owner_headers)
    assert res.status_code == 404
