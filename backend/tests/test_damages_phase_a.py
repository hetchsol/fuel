"""
Phase A — consistent damages across daily modules.

Two halves to every test set: (1) regression — submitting WITHOUT damage fields
must look exactly like today; (2) new behaviour — damaged > 0 requires a note,
flips damage_status to pending, reduces balance, and is authorised by manager+.
"""
import pytest


# ── Lubricants ────────────────────────────────────────────────────

def _lubricant_payload(damaged=0, note=None):
    return {
        "date": "2026-06-01",
        "location": "Island 3",
        "recorded_by": "owner1",
        "product_rows": [
            {"product_code": "LUB-1", "description": "Engine Oil 1L",
             "category": "Engine Oil", "selling_price": 100.0,
             "opening_stock": 10, "additions": 5, "sold_or_drawn": 4,
             "damaged": damaged, "damage_note": note},
        ],
    }


def test_lubricants_submit_without_damages_behaves_as_before(client, owner_headers):
    res = client.post("/api/v1/lubricants-daily/entry", headers=owner_headers,
                      json=_lubricant_payload())
    assert res.status_code == 200, res.text
    body = res.json()
    # Default damage_status preserves response shape — "none" when nothing is damaged.
    assert body["damage_status"] == "none"
    assert body["product_rows"][0]["damaged"] == 0
    # Balance math unchanged: 10 + 5 - 4 = 11.
    assert body["product_rows"][0]["balance"] == 11


def test_lubricants_damaged_without_note_is_400(client, owner_headers):
    res = client.post("/api/v1/lubricants-daily/entry", headers=owner_headers,
                      json=_lubricant_payload(damaged=2, note=""))
    assert res.status_code == 400


def test_lubricants_damage_authorisation_flow(client, owner_headers):
    res = client.post("/api/v1/lubricants-daily/entry", headers=owner_headers,
                      json=_lubricant_payload(damaged=2, note="dropped box"))
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["damage_status"] == "pending"
    # Balance accounts for damage: 10 + 5 - 4 - 2 = 9.
    assert body["product_rows"][0]["balance"] == 9
    entry_id = body["entry_id"]

    # Authorise.
    res = client.post(f"/api/v1/lubricants-daily/{entry_id}/authorise-damage",
                      headers=owner_headers)
    assert res.status_code == 200, res.text
    after = res.json()
    assert after["damage_status"] == "approved"
    assert after["damage_authorised_by"]

    # Second authorise is a no-op (already approved).
    res = client.post(f"/api/v1/lubricants-daily/{entry_id}/authorise-damage",
                      headers=owner_headers)
    assert res.status_code == 400


def test_lubricants_authorise_forbidden_for_attendant(client, owner_headers, staff_headers):
    if staff_headers is None:
        pytest.skip("attendant account unavailable")
    res = client.post("/api/v1/lubricants-daily/entry", headers=owner_headers,
                      json=_lubricant_payload(damaged=1, note="leak"))
    entry_id = res.json()["entry_id"]
    res = client.post(f"/api/v1/lubricants-daily/{entry_id}/authorise-damage",
                      headers=staff_headers)
    assert res.status_code == 403


# ── LPG accessories ──────────────────────────────────────────────

def _accessory_payload(damaged=0, note=None):
    return {
        "date": "2026-06-01",
        "recorded_by": "owner1",
        "product_rows": [
            {"product_code": "ACC-REG", "description": "Regulator",
             "selling_price": 250.0, "opening_stock": 8, "additions": 2,
             "sold": 3, "damaged": damaged, "damage_note": note},
        ],
    }


def test_lpg_accessories_submit_without_damages_behaves_as_before(client, owner_headers):
    res = client.post("/api/v1/lpg-daily/accessories/entry", headers=owner_headers,
                      json=_accessory_payload())
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["damage_status"] == "none"
    # 8 + 2 - 3 = 7.
    assert body["product_rows"][0]["balance"] == 7


def test_lpg_accessories_damaged_requires_note(client, owner_headers):
    res = client.post("/api/v1/lpg-daily/accessories/entry", headers=owner_headers,
                      json=_accessory_payload(damaged=1, note=""))
    assert res.status_code == 400


def test_lpg_accessories_damage_authorisation_flow(client, owner_headers):
    res = client.post("/api/v1/lpg-daily/accessories/entry", headers=owner_headers,
                      json=_accessory_payload(damaged=2, note="cracked dial"))
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["damage_status"] == "pending"
    assert body["product_rows"][0]["balance"] == 5   # 8 + 2 - 3 - 2
    entry_id = body["entry_id"]

    res = client.post(f"/api/v1/lpg-daily/accessories/{entry_id}/authorise-damage",
                      headers=owner_headers)
    assert res.status_code == 200, res.text
    assert res.json()["damage_status"] == "approved"
