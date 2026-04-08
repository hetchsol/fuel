"""
Tests for settings endpoints — fuel pricing, tax, thresholds.
"""


def test_get_fuel_settings(client, owner_headers):
    """Can read fuel settings."""
    # Ensure settings exist by writing first
    client.put("/api/v1/settings/fuel", headers=owner_headers, json={
        "diesel_price_per_liter": 23.25,
        "petrol_price_per_liter": 26.61,
        "diesel_allowable_loss_percent": 0.3,
        "petrol_allowable_loss_percent": 0.5,
        "nozzle_allowable_loss_liters": 0.8,
    })
    res = client.get("/api/v1/settings/fuel", headers=owner_headers)
    assert res.status_code == 200
    data = res.json()
    assert "diesel_price_per_liter" in data
    assert "petrol_price_per_liter" in data


def test_update_fuel_settings(client, owner_headers):
    """Owner can update fuel prices."""
    res = client.put("/api/v1/settings/fuel", headers=owner_headers, json={
        "diesel_price_per_liter": 25.50,
        "petrol_price_per_liter": 28.00,
        "diesel_allowable_loss_percent": 0.3,
        "petrol_allowable_loss_percent": 0.5,
        "nozzle_allowable_loss_liters": 0.8,
    })
    assert res.status_code == 200

    # Verify the change persisted
    res2 = client.get("/api/v1/settings/fuel", headers=owner_headers)
    data = res2.json()
    assert data["diesel_price_per_liter"] == 25.50
    assert data["petrol_price_per_liter"] == 28.00


def test_get_system_settings(client, owner_headers):
    """Can read system settings."""
    # Ensure settings exist
    client.put("/api/v1/settings/system", headers=owner_headers, json={
        "business_name": "Test Station",
        "license_key": "TEST-KEY",
        "contact_email": "",
        "contact_phone": "",
        "license_expiry_date": "",
        "station_location": "",
        "setup_completed": False,
    })
    res = client.get("/api/v1/settings/system", headers=owner_headers)
    assert res.status_code == 200
    data = res.json()
    assert "business_name" in data
    assert "setup_completed" in data


def test_get_tax_levy(client, owner_headers):
    """Can read tax/levy settings."""
    res = client.get("/api/v1/settings/tax-levy", headers=owner_headers)
    assert res.status_code == 200
    data = res.json()
    assert "vat_rate" in data
    assert "fuel_levy_per_liter" in data


def test_get_validation_thresholds(client, owner_headers):
    """Can read validation thresholds."""
    res = client.get("/api/v1/settings/validation-thresholds", headers=owner_headers)
    assert res.status_code == 200
    data = res.json()
    assert "pass_threshold" in data
    assert "warning_threshold" in data


def test_get_stock_alerts(client, owner_headers):
    """Can read stock alert settings."""
    res = client.get("/api/v1/settings/stock-alerts", headers=owner_headers)
    assert res.status_code == 200
    data = res.json()
    assert "low_stock_threshold_percent" in data


def test_get_recon_tolerances(client, owner_headers):
    """Can read reconciliation tolerances."""
    res = client.get("/api/v1/settings/reconciliation-tolerances", headers=owner_headers)
    assert res.status_code == 200
    data = res.json()
    assert "volume_tolerance_minor" in data
    assert "cash_tolerance_minor" in data
