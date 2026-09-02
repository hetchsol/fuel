"""
GET /handover/stock-opening auto-populates each shift's LPG/accessories/lubricants
opening stock from the closing values of a prior handover. It must resolve each
category against its own most recent contributing handover independently — a
single "most recent handover with any stock_snapshot" pointer would skip a
category's true last closing whenever a more recent handover only covered a
different category (e.g. one attendant assigned solely to LPG, the next solely
to Accessories), silently falling back to Stores/catalog defaults instead.
"""
import app.api.v1.attendant_handover as ah


def test_stock_opening_resolves_each_category_independently(client, staff_headers, monkeypatch):
    if not staff_headers:
        import pytest
        pytest.skip("attendant seed unavailable")

    # Oldest first: H1 carries LPG only, H2 (more recent) accessories only,
    # H3 (most recent of all) lubricants only. None of the three is the
    # single "most recent snapshot" for every category.
    handovers = {
        "H1": {
            "created_at": "2026-08-01T08:00:00",
            "stock_snapshot": {
                "lpg_cylinders": [{"size_kg": 9, "closing_full": 7, "closing_empty": 3}],
                "accessories": [],
                "lubricants": [],
            },
        },
        "H2": {
            "created_at": "2026-08-02T08:00:00",
            "stock_snapshot": {
                "lpg_cylinders": [],
                "accessories": [{"product_code": "ACC-HOSE", "closing_stock": 2}],
                "lubricants": [],
            },
        },
        "H3": {
            "created_at": "2026-08-03T08:00:00",
            "stock_snapshot": {
                "lpg_cylinders": [],
                "accessories": [],
                "lubricants": [{"product_code": "EO-15W40-4L", "closing_stock": 5}],
            },
        },
    }
    monkeypatch.setattr(ah, "_load_handovers", lambda sid: handovers)
    monkeypatch.setattr(ah, "load_stock_items", lambda sid: {})
    monkeypatch.setattr(ah, "load_lpg_pricing", lambda sid: {})
    monkeypatch.setattr(ah, "load_lubricant_catalog", lambda sid: [
        {"product_code": "EO-15W40-4L", "description": "15W-40 Engine Oil 4L",
         "selling_price": 0, "category": "Oil"},
    ])
    monkeypatch.setattr(ah, "load_lubricant_daily", lambda sid: {})

    res = client.get("/api/v1/handover/stock-opening", headers=staff_headers)
    assert res.status_code == 200
    data = res.json()

    lpg9 = next(c for c in data["lpg_cylinders"] if c["size_kg"] == 9)
    assert lpg9["opening_full"] == 7, "LPG opening must come from H1's closing, not fall back to 0"

    acc = next(a for a in data["accessories"] if a["product_code"] == "ACC-HOSE")
    assert acc["opening_stock"] == 2, "Accessory opening must come from H2's closing, not fall back to 0"

    lub = next(l for l in data["lubricants"] if l["product_code"] == "EO-15W40-4L")
    assert lub["opening_stock"] == 5, "Lubricant opening must come from H3's closing"
