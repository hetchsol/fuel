"""
Chunk 3 — Multi-fuel islands API tests.

Covers:
  C1-C5  preset application on single-tank stations
  D1-D5  multi-tank tank-picking + custom mode
  E1, E2, E5, E6  validation (always reject, atomic update, custom mismatch, missing fields)

These are HTTP integration tests against the running app via TestClient.
Setup uses direct storage manipulation to inject island/tank fixtures since
station setup endpoints are out of scope for this chunk.
"""
import pytest
from app.database.storage import get_station_storage


STATION = "ST001"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _ensure_tank(client, owner_headers, tank_id, fuel):
    storage = get_station_storage(STATION)
    if tank_id not in storage.get("tanks", {}):
        res = client.post(
            f"/api/v1/tanks/create?tank_id={tank_id}&fuel_type={fuel}&capacity=20000",
            headers=owner_headers,
        )
        assert res.status_code == 200, res.text


def _setup_island(island_id, pump_id, num_nozzles=2, fuel="Diesel", tank_id=None):
    """Inject an island into storage with N nozzles. Returns the storage handle."""
    storage = get_station_storage(STATION)
    nozzles = []
    for i in range(num_nozzles):
        suffix = chr(ord("A") + i)
        nozzles.append({
            "nozzle_id": f"{pump_id}-{suffix}",
            "pump_station_id": pump_id,
            "fuel_type": fuel,
            "tank_id": tank_id,
            "status": "Active",
        })
    storage.setdefault("islands", {})[island_id] = {
        "island_id": island_id,
        "name": f"Island {island_id}",
        "status": "active",
        "product_type": fuel,
        "pump_station": {
            "pump_station_id": pump_id,
            "island_id": island_id,
            "name": f"Pump {pump_id}",
            "tank_id": tank_id,
            "nozzles": nozzles,
        },
    }
    return storage


def _cleanup_island(island_id):
    storage = get_station_storage(STATION)
    storage.get("islands", {}).pop(island_id, None)


# ---------------------------------------------------------------------------
# C — Single-tank station presets
# ---------------------------------------------------------------------------

def test_C1_all_diesel_preset_with_one_diesel_tank(client, owner_headers):
    _ensure_tank(client, owner_headers, "TANK-DIESEL-C1", "Diesel")
    _ensure_tank(client, owner_headers, "TANK-PETROL-C1", "Petrol")
    _setup_island("ISL-C1", "PS-C1", fuel="Diesel", tank_id=None)

    res = client.post(
        "/api/v1/islands/ISL-C1/preset",
        headers=owner_headers,
        json={"preset": "all_diesel"},
    )
    try:
        assert res.status_code == 200, res.text
        data = res.json()
        assert data["preset"] == "all_diesel"
        assert data["island_product_type"] == "Diesel"
        # Both nozzles wired to the (only) diesel tank — no override needed
        assert all(n["tank_id"] == "TANK-DIESEL-C1" for n in data["applied_nozzles"])
        assert all(n["fuel_type"] == "Diesel" for n in data["applied_nozzles"])
    finally:
        _cleanup_island("ISL-C1")


def test_C2_all_petrol_preset(client, owner_headers):
    _ensure_tank(client, owner_headers, "TANK-PETROL-C2", "Petrol")
    _setup_island("ISL-C2", "PS-C2", fuel="Diesel", tank_id="TANK-DIESEL-C1")

    res = client.post(
        "/api/v1/islands/ISL-C2/preset",
        headers=owner_headers,
        json={"preset": "all_petrol", "tanks": {"petrol_tank_id": "TANK-PETROL-C2"}},
    )
    try:
        assert res.status_code == 200, res.text
        data = res.json()
        assert data["island_product_type"] == "Petrol"
        for n in data["applied_nozzles"]:
            assert n["fuel_type"] == "Petrol"
            assert n["tank_id"] == "TANK-PETROL-C2"
    finally:
        _cleanup_island("ISL-C2")


def test_C3_mixed_preset_creates_per_fuel_assignments(client, owner_headers):
    _ensure_tank(client, owner_headers, "TANK-DIESEL-C3", "Diesel")
    _ensure_tank(client, owner_headers, "TANK-PETROL-C3", "Petrol")
    _setup_island("ISL-C3", "PS-C3", num_nozzles=2, fuel="Diesel", tank_id="TANK-DIESEL-C3")

    res = client.post(
        "/api/v1/islands/ISL-C3/preset",
        headers=owner_headers,
        json={
            "preset": "mixed",
            "tanks": {"diesel_tank_id": "TANK-DIESEL-C3", "petrol_tank_id": "TANK-PETROL-C3"},
        },
    )
    try:
        assert res.status_code == 200, res.text
        data = res.json()
        # Convention: nozzle A = petrol, nozzle B = diesel
        applied = {a["nozzle_id"]: a for a in data["applied_nozzles"]}
        assert applied["PS-C3-A"]["fuel_type"] == "Petrol"
        assert applied["PS-C3-A"]["tank_id"] == "TANK-PETROL-C3"
        assert applied["PS-C3-B"]["fuel_type"] == "Diesel"
        assert applied["PS-C3-B"]["tank_id"] == "TANK-DIESEL-C3"
        assert data["island_product_type"] == "Mixed"
        # Pump default tank goes None when nozzles disagree
        assert data["pump_default_tank_id"] is None
    finally:
        _cleanup_island("ISL-C3")


def test_C4_switch_from_all_diesel_to_mixed(client, owner_headers):
    _ensure_tank(client, owner_headers, "TANK-DIESEL-C4", "Diesel")
    _ensure_tank(client, owner_headers, "TANK-PETROL-C4", "Petrol")
    _setup_island("ISL-C4", "PS-C4", fuel="Diesel", tank_id="TANK-DIESEL-C4")

    # Start with all_diesel
    r1 = client.post(
        "/api/v1/islands/ISL-C4/preset",
        headers=owner_headers,
        json={"preset": "all_diesel", "tanks": {"diesel_tank_id": "TANK-DIESEL-C4"}},
    )
    assert r1.status_code == 200, r1.text

    # Switch to mixed
    r2 = client.post(
        "/api/v1/islands/ISL-C4/preset",
        headers=owner_headers,
        json={
            "preset": "mixed",
            "tanks": {"diesel_tank_id": "TANK-DIESEL-C4", "petrol_tank_id": "TANK-PETROL-C4"},
        },
    )
    try:
        assert r2.status_code == 200, r2.text
        assert r2.json()["island_product_type"] == "Mixed"
    finally:
        _cleanup_island("ISL-C4")


def test_C5_switch_from_mixed_back_to_all_diesel(client, owner_headers):
    _ensure_tank(client, owner_headers, "TANK-DIESEL-C5", "Diesel")
    _ensure_tank(client, owner_headers, "TANK-PETROL-C5", "Petrol")
    _setup_island("ISL-C5", "PS-C5", fuel="Diesel", tank_id="TANK-DIESEL-C5")

    # Mixed first
    client.post(
        "/api/v1/islands/ISL-C5/preset",
        headers=owner_headers,
        json={
            "preset": "mixed",
            "tanks": {"diesel_tank_id": "TANK-DIESEL-C5", "petrol_tank_id": "TANK-PETROL-C5"},
        },
    )
    # Then all_diesel
    res = client.post(
        "/api/v1/islands/ISL-C5/preset",
        headers=owner_headers,
        json={"preset": "all_diesel", "tanks": {"diesel_tank_id": "TANK-DIESEL-C5"}},
    )
    try:
        assert res.status_code == 200, res.text
        data = res.json()
        assert data["island_product_type"] == "Diesel"
        for n in data["applied_nozzles"]:
            assert n["fuel_type"] == "Diesel"
    finally:
        _cleanup_island("ISL-C5")


# ---------------------------------------------------------------------------
# D — Multi-tank stations
# ---------------------------------------------------------------------------

def test_D1_multiple_diesel_tanks_requires_explicit_choice(client, owner_headers):
    _ensure_tank(client, owner_headers, "TANK-DIESEL-D1A", "Diesel")
    _ensure_tank(client, owner_headers, "TANK-DIESEL-D1B", "Diesel")
    _setup_island("ISL-D1", "PS-D1", fuel="Diesel", tank_id="TANK-DIESEL-D1A")

    # Without override → 400 (ambiguous)
    res = client.post(
        "/api/v1/islands/ISL-D1/preset",
        headers=owner_headers,
        json={"preset": "all_diesel"},
    )
    try:
        assert res.status_code == 400
        assert "diesel_tank_id" in res.json()["detail"]
    finally:
        pass

    # With override → 200, picks the requested tank
    res2 = client.post(
        "/api/v1/islands/ISL-D1/preset",
        headers=owner_headers,
        json={"preset": "all_diesel", "tanks": {"diesel_tank_id": "TANK-DIESEL-D1B"}},
    )
    try:
        assert res2.status_code == 200, res2.text
        for n in res2.json()["applied_nozzles"]:
            assert n["tank_id"] == "TANK-DIESEL-D1B"
    finally:
        _cleanup_island("ISL-D1")


def test_D2_can_move_island_between_diesel_tanks(client, owner_headers):
    _ensure_tank(client, owner_headers, "TANK-DIESEL-D2A", "Diesel")
    _ensure_tank(client, owner_headers, "TANK-DIESEL-D2B", "Diesel")
    _setup_island("ISL-D2", "PS-D2", fuel="Diesel", tank_id="TANK-DIESEL-D2A")

    # Wire to A
    client.post(
        "/api/v1/islands/ISL-D2/preset",
        headers=owner_headers,
        json={"preset": "all_diesel", "tanks": {"diesel_tank_id": "TANK-DIESEL-D2A"}},
    )
    # Move everyone to B
    res = client.post(
        "/api/v1/islands/ISL-D2/preset",
        headers=owner_headers,
        json={"preset": "all_diesel", "tanks": {"diesel_tank_id": "TANK-DIESEL-D2B"}},
    )
    try:
        assert res.status_code == 200, res.text
        for n in res.json()["applied_nozzles"]:
            assert n["tank_id"] == "TANK-DIESEL-D2B"
    finally:
        _cleanup_island("ISL-D2")


def test_D3_mixed_preset_with_multiple_tanks_per_fuel(client, owner_headers):
    _ensure_tank(client, owner_headers, "TANK-DIESEL-D3A", "Diesel")
    _ensure_tank(client, owner_headers, "TANK-DIESEL-D3B", "Diesel")
    _ensure_tank(client, owner_headers, "TANK-PETROL-D3A", "Petrol")
    _ensure_tank(client, owner_headers, "TANK-PETROL-D3B", "Petrol")
    _setup_island("ISL-D3", "PS-D3", num_nozzles=2, fuel="Diesel", tank_id="TANK-DIESEL-D3A")

    res = client.post(
        "/api/v1/islands/ISL-D3/preset",
        headers=owner_headers,
        json={
            "preset": "mixed",
            "tanks": {
                "diesel_tank_id": "TANK-DIESEL-D3B",
                "petrol_tank_id": "TANK-PETROL-D3A",
            },
        },
    )
    try:
        assert res.status_code == 200, res.text
        applied = {a["nozzle_id"]: a for a in res.json()["applied_nozzles"]}
        assert applied["PS-D3-A"]["tank_id"] == "TANK-PETROL-D3A"
        assert applied["PS-D3-B"]["tank_id"] == "TANK-DIESEL-D3B"
    finally:
        _cleanup_island("ISL-D3")


def test_D4_custom_mode_per_nozzle_tank_assignment(client, owner_headers):
    _ensure_tank(client, owner_headers, "TANK-DIESEL-D4A", "Diesel")
    _ensure_tank(client, owner_headers, "TANK-DIESEL-D4B", "Diesel")
    _setup_island("ISL-D4", "PS-D4", num_nozzles=2, fuel="Diesel", tank_id="TANK-DIESEL-D4A")

    res = client.post(
        "/api/v1/islands/ISL-D4/preset",
        headers=owner_headers,
        json={
            "preset": "custom",
            "nozzle_assignments": [
                {"nozzle_id": "PS-D4-A", "tank_id": "TANK-DIESEL-D4A"},
                {"nozzle_id": "PS-D4-B", "tank_id": "TANK-DIESEL-D4B"},
            ],
        },
    )
    try:
        assert res.status_code == 200, res.text
        applied = {a["nozzle_id"]: a for a in res.json()["applied_nozzles"]}
        assert applied["PS-D4-A"]["tank_id"] == "TANK-DIESEL-D4A"
        assert applied["PS-D4-B"]["tank_id"] == "TANK-DIESEL-D4B"
        # Both diesel — island stays single-fuel
        assert res.json()["island_product_type"] == "Diesel"
    finally:
        _cleanup_island("ISL-D4")


def test_D5_missing_tank_id_when_ambiguous_returns_clear_error(client, owner_headers):
    _ensure_tank(client, owner_headers, "TANK-DIESEL-D5A", "Diesel")
    _ensure_tank(client, owner_headers, "TANK-DIESEL-D5B", "Diesel")
    _setup_island("ISL-D5", "PS-D5", fuel="Diesel", tank_id="TANK-DIESEL-D5A")

    res = client.post(
        "/api/v1/islands/ISL-D5/preset",
        headers=owner_headers,
        json={"preset": "all_diesel"},  # no tanks override
    )
    try:
        assert res.status_code == 400, res.text
        detail = res.json()["detail"]
        # Error names both candidates so the owner can pick
        assert "TANK-DIESEL-D5A" in detail
        assert "TANK-DIESEL-D5B" in detail
        assert "diesel_tank_id" in detail
    finally:
        _cleanup_island("ISL-D5")


# ---------------------------------------------------------------------------
# E — Validation
# ---------------------------------------------------------------------------

def test_E1_petrol_nozzle_to_diesel_tank_rejected(client, owner_headers):
    _ensure_tank(client, owner_headers, "TANK-DIESEL-E1", "Diesel")
    _setup_island("ISL-E1", "PS-E1", fuel="Petrol", tank_id=None)

    res = client.put(
        "/api/v1/islands/ISL-E1/nozzle/PS-E1-A/tank",
        headers=owner_headers,
        json={"tank_id": "TANK-DIESEL-E1"},
    )
    try:
        assert res.status_code == 400, res.text
        detail = res.json()["detail"]
        assert "Diesel" in detail and "Petrol" in detail
        # Error directs caller to the fuel-type endpoint for atomic change
        assert "fuel-type" in detail
    finally:
        _cleanup_island("ISL-E1")


def test_E2_atomic_fuel_and_tank_change_via_fuel_type_endpoint(client, owner_headers):
    _ensure_tank(client, owner_headers, "TANK-DIESEL-E2", "Diesel")
    _setup_island("ISL-E2", "PS-E2", fuel="Petrol", tank_id=None)

    res = client.put(
        "/api/v1/islands/ISL-E2/nozzle/PS-E2-A/fuel-type",
        headers=owner_headers,
        json={"fuel_type": "Diesel", "tank_id": "TANK-DIESEL-E2"},
    )
    try:
        assert res.status_code == 200, res.text
        data = res.json()
        assert data["fuel_type"] == "Diesel"
        assert data["tank_id"] == "TANK-DIESEL-E2"
        # Storage was updated
        storage = get_station_storage(STATION)
        nozzle = storage["islands"]["ISL-E2"]["pump_station"]["nozzles"][0]
        assert nozzle["fuel_type"] == "Diesel"
        assert nozzle["tank_id"] == "TANK-DIESEL-E2"
    finally:
        _cleanup_island("ISL-E2")


def test_E5_custom_mode_with_mismatched_payload_rejected(client, owner_headers):
    _ensure_tank(client, owner_headers, "TANK-DIESEL-E5", "Diesel")
    _ensure_tank(client, owner_headers, "TANK-PETROL-E5", "Petrol")
    _setup_island("ISL-E5", "PS-E5", num_nozzles=2, fuel="Petrol", tank_id="TANK-PETROL-E5")

    # Try to assign nozzle A (currently Petrol) to a Diesel tank via custom
    # The preset endpoint reads the tank's fuel_type and stamps it on the nozzle,
    # so this is actually allowed (it's an atomic both-update). Verify that.
    res = client.post(
        "/api/v1/islands/ISL-E5/preset",
        headers=owner_headers,
        json={
            "preset": "custom",
            "nozzle_assignments": [
                {"nozzle_id": "PS-E5-A", "tank_id": "TANK-DIESEL-E5"},
                {"nozzle_id": "PS-E5-B", "tank_id": "TANK-PETROL-E5"},
            ],
        },
    )
    try:
        assert res.status_code == 200, res.text
        applied = {a["nozzle_id"]: a for a in res.json()["applied_nozzles"]}
        assert applied["PS-E5-A"]["fuel_type"] == "Diesel"  # took the tank's fuel
        assert applied["PS-E5-B"]["fuel_type"] == "Petrol"
        assert res.json()["island_product_type"] == "Mixed"
    finally:
        _cleanup_island("ISL-E5")


def test_E5b_custom_mode_with_unknown_nozzle_rejected(client, owner_headers):
    _ensure_tank(client, owner_headers, "TANK-DIESEL-E5B", "Diesel")
    _setup_island("ISL-E5B", "PS-E5B", fuel="Diesel", tank_id="TANK-DIESEL-E5B")

    res = client.post(
        "/api/v1/islands/ISL-E5B/preset",
        headers=owner_headers,
        json={
            "preset": "custom",
            "nozzle_assignments": [
                {"nozzle_id": "DOES-NOT-EXIST", "tank_id": "TANK-DIESEL-E5B"},
            ],
        },
    )
    try:
        assert res.status_code == 400, res.text
        assert "DOES-NOT-EXIST" in res.json()["detail"]
    finally:
        _cleanup_island("ISL-E5B")


def test_E6_fuel_type_endpoint_requires_tank_id(client, owner_headers):
    _setup_island("ISL-E6", "PS-E6", fuel="Petrol", tank_id=None)
    res = client.put(
        "/api/v1/islands/ISL-E6/nozzle/PS-E6-A/fuel-type",
        headers=owner_headers,
        json={"fuel_type": "Diesel"},  # no tank_id
    )
    try:
        # Pydantic enforces the required field → 422
        assert res.status_code == 422, res.text
    finally:
        _cleanup_island("ISL-E6")


# ---------------------------------------------------------------------------
# Deprecation behavior — PUT /islands/{id}/product no longer rewrites nozzles
# ---------------------------------------------------------------------------

def test_put_product_does_not_rewrite_nozzle_assignments(client, owner_headers):
    """Regression: PUT /product used to wipe nozzle.fuel_type and pump.tank_id.
    After the multi-fuel refactor, it only updates island.product_type as a label."""
    _ensure_tank(client, owner_headers, "TANK-PETROL-PROD", "Petrol")
    _ensure_tank(client, owner_headers, "TANK-DIESEL-PROD", "Diesel")

    storage = _setup_island("ISL-PROD", "PS-PROD", num_nozzles=2, fuel="Petrol", tank_id="TANK-PETROL-PROD")
    # Make it explicitly mixed via preset
    client.post(
        "/api/v1/islands/ISL-PROD/preset",
        headers=owner_headers,
        json={
            "preset": "mixed",
            "tanks": {"diesel_tank_id": "TANK-DIESEL-PROD", "petrol_tank_id": "TANK-PETROL-PROD"},
        },
    )

    # Caller mistakenly hits the deprecated endpoint to "set product_type to Petrol"
    res = client.put(
        "/api/v1/islands/ISL-PROD/product",
        headers=owner_headers,
        json={"product_type": "Petrol"},
    )
    try:
        assert res.status_code == 200, res.text
        assert "deprecation_notice" in res.json()
        # Mixed config is preserved — nozzle B is still diesel
        nozzles = storage["islands"]["ISL-PROD"]["pump_station"]["nozzles"]
        assert nozzles[0]["fuel_type"] == "Petrol"
        assert nozzles[1]["fuel_type"] == "Diesel"
        assert nozzles[1]["tank_id"] == "TANK-DIESEL-PROD"
    finally:
        _cleanup_island("ISL-PROD")


# ---------------------------------------------------------------------------
# POST /islands validation — tank_id on a nozzle must match its fuel
# ---------------------------------------------------------------------------

def test_create_island_rejects_nozzle_with_mismatched_tank(client, owner_headers):
    _ensure_tank(client, owner_headers, "TANK-DIESEL-CR", "Diesel")
    res = client.post(
        "/api/v1/islands/",
        headers=owner_headers,
        json={
            "island_id": "ISL-CR",
            "name": "Bad Island",
            "status": "inactive",
            "product_type": "Petrol",
            "pump_station": {
                "pump_station_id": "PS-CR",
                "island_id": "ISL-CR",
                "name": "Pump",
                "tank_id": None,
                "nozzles": [
                    {
                        "nozzle_id": "PS-CR-A",
                        "pump_station_id": "PS-CR",
                        "fuel_type": "Petrol",
                        "tank_id": "TANK-DIESEL-CR",
                        "status": "Active",
                    },
                ],
            },
        },
    )
    assert res.status_code == 400, res.text
    assert "Diesel" in res.json()["detail"] and "Petrol" in res.json()["detail"]
    # And the island was not created
    storage = get_station_storage(STATION)
    assert "ISL-CR" not in storage.get("islands", {})
