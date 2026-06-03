"""
Phase C — per-SKU re-order levels on lubricant + LPG-accessory catalogs.

Verifies:
- A SKU with no re-order level (default 0) fires NO LOW_STOCK alert (today's
  silent behaviour preserved).
- A SKU with reorder_level set fires a LOW_STOCK notification when the
  daily-submit balance falls at/below that level.
- The pricing PUT endpoint accepts reorder_level alongside selling_price.
"""
import pytest

import app.api.v1.lubricants_daily as lub
import app.api.v1.lpg_daily as lpg


@pytest.fixture
def caught(monkeypatch):
    """Capture create_notification calls + stub the catalogs to in-memory dicts
    so tests are hermetic and don't depend on the seeded default product list."""
    bucket: list = []
    monkeypatch.setattr(lub, "create_notification", lambda **k: bucket.append(k))
    monkeypatch.setattr(lpg, "create_notification", lambda **k: bucket.append(k))

    # In-memory lubricant catalog seeded with our test SKUs.
    lub_catalog = [
        {"product_code": "TEST-LUB-DEFAULT", "description": "Test Default Lub",
         "category": "Engine Oil", "selling_price": 100.0},
        {"product_code": "TEST-LUB-REORDER", "description": "Test Reorder Lub",
         "category": "Engine Oil", "selling_price": 100.0},
        {"product_code": "TEST-LUB-NEG", "description": "Test Neg Lub",
         "category": "Engine Oil", "selling_price": 100.0},
    ]
    monkeypatch.setattr(lub, "load_product_catalog", lambda sid: lub_catalog)
    def _save_lub(sid, c):
        lub_catalog.clear()
        lub_catalog.extend(c)
    monkeypatch.setattr(lub, "save_product_catalog", _save_lub)

    lpg_catalog = [
        {"product_code": "TEST-ACC-DEFAULT", "description": "Test Default Acc",
         "selling_price": 50.0},
        {"product_code": "TEST-ACC-REORDER", "description": "Test Reorder Acc",
         "selling_price": 50.0},
        {"product_code": "TEST-ACC-NEG", "description": "Test Neg Acc",
         "selling_price": 50.0},
    ]
    monkeypatch.setattr(lpg, "load_accessories_catalog", lambda sid: lpg_catalog)
    def _save_lpg(sid, c):
        lpg_catalog.clear()
        lpg_catalog.extend(c)
    monkeypatch.setattr(lpg, "save_accessories_catalog", _save_lpg)
    return bucket


# ── Lubricants ─────────────────────────────────────────────────────

def test_lubricants_default_catalog_fires_no_low_stock(client, owner_headers, caught):
    # Use a unique product code so the catalog doesn't already have a reorder_level set.
    code = "TEST-LUB-DEFAULT"
    client.put("/api/v1/lubricants-daily/products/pricing", headers=owner_headers,
               json=[{"product_code": code, "selling_price": 100.0}])
    res = client.post("/api/v1/lubricants-daily/entry", headers=owner_headers, json={
        "date": "2026-06-01", "location": "Island 3", "recorded_by": "owner1",
        "product_rows": [{
            "product_code": code, "description": "Test Default Lub",
            "category": "Engine Oil", "selling_price": 100.0,
            "opening_stock": 1, "additions": 0, "sold_or_drawn": 1,
        }],
    })
    assert res.status_code == 200, res.text
    assert all(c.get("type") != "LOW_STOCK" for c in caught)


def test_lubricants_reorder_level_fires_low_stock(client, owner_headers, monkeypatch):
    """End-to-end: configure a re-order level on a real catalog SKU, submit an
    entry whose balance lands below it, capture the LOW_STOCK notification."""
    captured: list = []
    monkeypatch.setattr(lub, "create_notification", lambda **k: captured.append(k))

    # Use a real product from DEFAULT_PRODUCTS (the in-memory seed) so the
    # PUT actually persists — the endpoint only updates existing entries.
    target = lub.DEFAULT_PRODUCTS[0]
    code = target["product_code"]

    # Configure a re-order level via the pricing PUT (phase C addition).
    res = client.put("/api/v1/lubricants-daily/products/pricing", headers=owner_headers,
                     json=[{"product_code": code, "reorder_level": 5}])
    assert res.status_code == 200, res.text

    # Submit an entry whose balance lands at 4 (below the level).
    res = client.post("/api/v1/lubricants-daily/entry", headers=owner_headers, json={
        "date": "2026-06-01", "location": "Island 3", "recorded_by": "owner1",
        "product_rows": [{
            "product_code": code, "description": target.get("description", code),
            "category": target.get("category", "Engine Oil"),
            "selling_price": target.get("selling_price", 100.0),
            "opening_stock": 10, "additions": 0, "sold_or_drawn": 6,
        }],
    })
    assert res.status_code == 200, res.text
    low = [c for c in captured if c.get("type") == "LOW_STOCK" and c.get("entity_id") == code]
    assert low, f"expected LOW_STOCK for {code}; got {captured}"
    assert "balance 4" in low[0].get("message", "")
    assert "re-order level 5" in low[0].get("message", "")


def test_lubricants_pricing_put_rejects_negative_reorder_level(client, owner_headers):
    res = client.put("/api/v1/lubricants-daily/products/pricing", headers=owner_headers,
                     json=[{"product_code": "TEST-LUB-NEG", "selling_price": 50.0,
                            "reorder_level": -1}])
    assert res.status_code == 400


# ── LPG accessories ────────────────────────────────────────────────

def test_lpg_accessories_default_no_low_stock(client, owner_headers, caught):
    code = "TEST-ACC-DEFAULT"
    client.put("/api/v1/lpg-daily/accessories/pricing", headers=owner_headers,
               json=[{"product_code": code, "selling_price": 50.0}])
    res = client.post("/api/v1/lpg-daily/accessories/entry", headers=owner_headers, json={
        "date": "2026-06-01", "recorded_by": "owner1",
        "product_rows": [{
            "product_code": code, "description": "Test Default Acc",
            "selling_price": 50.0,
            "opening_stock": 1, "additions": 0, "sold": 1,
        }],
    })
    assert res.status_code == 200, res.text
    assert all(c.get("type") != "LOW_STOCK" for c in caught)


def test_lpg_accessories_reorder_level_fires_low_stock(client, owner_headers, monkeypatch):
    captured: list = []
    monkeypatch.setattr(lpg, "create_notification", lambda **k: captured.append(k))

    target = lpg.DEFAULT_LPG_ACCESSORIES[0]
    code = target["product_code"]

    res = client.put("/api/v1/lpg-daily/accessories/pricing", headers=owner_headers,
                     json=[{"product_code": code, "reorder_level": 3}])
    assert res.status_code == 200, res.text

    res = client.post("/api/v1/lpg-daily/accessories/entry", headers=owner_headers, json={
        "date": "2026-06-01", "recorded_by": "owner1",
        "product_rows": [{
            "product_code": code, "description": target.get("description", code),
            "selling_price": target.get("selling_price", 50.0),
            "opening_stock": 8, "additions": 0, "sold": 6,
        }],
    })
    assert res.status_code == 200, res.text
    low = [c for c in captured if c.get("type") == "LOW_STOCK" and c.get("entity_id") == code]
    assert low, f"expected LOW_STOCK for {code}; got {captured}"


def test_lpg_accessories_pricing_put_rejects_negative_reorder_level(client, owner_headers):
    res = client.put("/api/v1/lpg-daily/accessories/pricing", headers=owner_headers,
                     json=[{"product_code": "TEST-ACC-NEG", "selling_price": 50.0,
                            "reorder_level": -2}])
    assert res.status_code == 400
