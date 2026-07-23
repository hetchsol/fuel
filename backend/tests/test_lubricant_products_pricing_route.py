"""
Regression test for a route-ordering bug: GET /lubricants-daily/products/{location}
was registered before GET /lubricants-daily/products/pricing, so FastAPI matched
every request to .../products/pricing against the {location} catch-all first (with
location="pricing"), which then 400'd with "Location must be 'Island 3' or 'Buffer'".

This made the Stores/Stock Lubricants tab and Lubricants Daily's "Edit Prices" modal
silently show zero products in production -- the frontend parses the 400 body as
JSON without checking status, sees it isn't an array, and quietly falls back to [].
"""


def test_products_pricing_is_not_shadowed_by_location_route(client, owner_headers):
    r = client.get("/api/v1/lubricants-daily/products/pricing", headers=owner_headers)
    assert r.status_code == 200, r.text
    assert isinstance(r.json(), list)


def test_products_location_route_still_works(client, owner_headers):
    r = client.get("/api/v1/lubricants-daily/products/Island 3", headers=owner_headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["location"] == "Island 3"


def test_products_location_route_rejects_invalid_location(client, owner_headers):
    r = client.get("/api/v1/lubricants-daily/products/not-a-real-place", headers=owner_headers)
    assert r.status_code == 400
    assert "Island 3" in r.json()["detail"]
