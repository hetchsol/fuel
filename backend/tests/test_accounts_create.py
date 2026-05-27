"""
Creating credit accounts is manager/owner only, auto-IDs, persists, and audits.
"""
import pytest


def _account_payload(name="Volcano Mining", **over):
    body = {
        "account_id": "",            # let the server generate it
        "account_name": name,
        "account_type": "Corporate",
        "credit_limit": 50000,
        "current_balance": 0,
    }
    body.update(over)
    return body


def test_owner_can_create_account(client, owner_headers):
    res = client.post("/api/v1/accounts/", headers=owner_headers, json=_account_payload())
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["account_id"].startswith("ACC-")
    assert data["account_name"] == "Volcano Mining"
    assert data["current_balance"] == 0

    # It is retrievable in the listing.
    listed = client.get("/api/v1/accounts/", headers=owner_headers).json()
    assert any(a["account_id"] == data["account_id"] for a in listed)


def test_attendant_cannot_create_account(client, staff_headers):
    if staff_headers is None:
        pytest.skip("attendant account unavailable")
    res = client.post("/api/v1/accounts/", headers=staff_headers, json=_account_payload("Blocked Co"))
    assert res.status_code == 403


def test_account_name_required(client, owner_headers):
    res = client.post("/api/v1/accounts/", headers=owner_headers, json=_account_payload(name="   "))
    assert res.status_code == 400
