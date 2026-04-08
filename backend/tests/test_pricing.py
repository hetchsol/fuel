"""
Tests for LPG and lubricant pricing endpoints.
"""


def test_get_lpg_pricing(client, owner_headers):
    """Can read LPG cylinder pricing."""
    res = client.get("/api/v1/lpg-daily/pricing", headers=owner_headers)
    assert res.status_code == 200
    data = res.json()
    assert "prices" in data or "sizes" in data


def test_update_lpg_pricing(client, owner_headers):
    """Can update LPG cylinder prices."""
    res = client.put("/api/v1/lpg-daily/pricing", headers=owner_headers, json={
        "prices": {
            "3": {"price_refill": 150, "price_full_cylinder": 480},
            "6": {"price_refill": 300, "price_full_cylinder": 850},
            "9": {"price_refill": 450, "price_full_cylinder": 1250},
            "19": {"price_refill": 940, "price_full_cylinder": 2140},
            "45": {"price_refill": 2210, "price_full_cylinder": 3910},
            "48": {"price_refill": 2360, "price_full_cylinder": 4060},
        }
    })
    assert res.status_code == 200


def test_lpg_pricing_allows_zero(client, owner_headers):
    """LPG pricing allows zero (not-yet-configured state)."""
    res = client.put("/api/v1/lpg-daily/pricing", headers=owner_headers, json={
        "prices": {
            "3": {"price_refill": 0, "price_full_cylinder": 0},
            "6": {"price_refill": 0, "price_full_cylinder": 0},
            "9": {"price_refill": 0, "price_full_cylinder": 0},
            "19": {"price_refill": 0, "price_full_cylinder": 0},
            "45": {"price_refill": 0, "price_full_cylinder": 0},
            "48": {"price_refill": 0, "price_full_cylinder": 0},
        }
    })
    assert res.status_code == 200


def test_lpg_pricing_rejects_negative(client, owner_headers):
    """LPG pricing rejects negative values."""
    res = client.put("/api/v1/lpg-daily/pricing", headers=owner_headers, json={
        "prices": {
            "3": {"price_refill": -10, "price_full_cylinder": 480},
            "6": {"price_refill": 300, "price_full_cylinder": 850},
            "9": {"price_refill": 450, "price_full_cylinder": 1250},
            "19": {"price_refill": 940, "price_full_cylinder": 2140},
            "45": {"price_refill": 2210, "price_full_cylinder": 3910},
            "48": {"price_refill": 2360, "price_full_cylinder": 4060},
        }
    })
    assert res.status_code == 400


def test_get_lubricant_products(client, owner_headers):
    """Can read lubricant product catalog."""
    res = client.get("/api/v1/lubricants-daily/products/Island 3", headers=owner_headers)
    assert res.status_code == 200
    data = res.json()
    assert "products" in data


def test_get_lpg_accessories_pricing(client, owner_headers):
    """Can read LPG accessories pricing."""
    res = client.get("/api/v1/lpg-daily/accessories/pricing", headers=owner_headers)
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)
