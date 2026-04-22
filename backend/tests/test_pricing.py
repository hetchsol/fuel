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


# ===== LPG trade (upgrade / downgrade) math =====

def _set_lpg_prices(client, owner_headers):
    """Set a known price table for deterministic trade math."""
    res = client.put("/api/v1/lpg-daily/pricing", headers=owner_headers, json={
        "prices": {
            # deposit = full - refill; e.g. 3kg deposit = 477-147 = 330
            "3":  {"price_refill": 147, "price_full_cylinder": 477},
            "6":  {"price_refill": 200, "price_full_cylinder": 700},
            "9":  {"price_refill": 300, "price_full_cylinder": 950},
            "19": {"price_refill": 650, "price_full_cylinder": 2100},
            "45": {"price_refill": 1500, "price_full_cylinder": 4500},
            "48": {"price_refill": 1600, "price_full_cylinder": 4800},
        }
    })
    assert res.status_code == 200


def _zero_rows():
    return [
        {"size_kg": s, "opening_balance": 0, "opening_empty": 0, "receipts": 0,
         "sold_refill": 0, "sold_with_cylinder": 0, "closing_empty": 0}
        for s in (3, 6, 9, 19, 45, 48)
    ]


def test_lpg_upgrade_charge_includes_full_new_gas_plus_deposit_diff(client, owner_headers):
    """
    Per LPG Recon spec: upgrade charge = price_refill[to] + (deposit[to] - deposit[from]).
    3kg -> 6kg with the reference prices above: 200 + (500 - 330) = 370 per trade.
    """
    _set_lpg_prices(client, owner_headers)
    res = client.post("/api/v1/lpg-daily/entry", headers=owner_headers, json={
        "date": "2099-01-01", "shift_type": "Day",
        "salesperson": "tester", "recorded_by": "tester",
        "cylinder_rows": _zero_rows(),
        "trades": [{"from_size_kg": 3, "to_size_kg": 6, "quantity": 1}],
    })
    assert res.status_code == 200, res.text
    out = res.json()
    assert len(out["trades"]) == 1
    assert out["trades"][0]["price_difference"] == 370
    assert out["trades"][0]["trade_type"] == "upgrade"
    assert out["total_trade_revenue"] == 370
    # Trade revenue rolls into the shift grand total (previously it was excluded).
    assert out["grand_total_value"] == 370


def test_lpg_upgrade_grand_total_combines_refills_new_issues_and_trades(client, owner_headers):
    """Grand total must include refill, new-issue, and upgrade revenue together."""
    _set_lpg_prices(client, owner_headers)
    rows = _zero_rows()
    # 5 refills of 6kg (5 * 200 = 1000), 1 new-issue 9kg (1 * 950 = 950)
    for r in rows:
        if r["size_kg"] == 6:
            r["sold_refill"] = 5
        if r["size_kg"] == 9:
            r["sold_with_cylinder"] = 1
    res = client.post("/api/v1/lpg-daily/entry", headers=owner_headers, json={
        "date": "2099-01-02", "shift_type": "Day",
        "salesperson": "tester", "recorded_by": "tester",
        "cylinder_rows": rows,
        "trades": [{"from_size_kg": 3, "to_size_kg": 6, "quantity": 3}],
    })
    assert res.status_code == 200, res.text
    out = res.json()
    # 1000 refill + 950 new-issue + (3 * 370) upgrade = 3060
    assert out["total_trade_revenue"] == 3 * 370
    assert out["grand_total_value"] == 1000 + 950 + 3 * 370


def test_lpg_traded_in_does_not_inflate_filled_balance(client, owner_headers):
    """
    Previously `balance = opening + receipts + traded_in - sold_refill - sold_with_cylinder - traded_out`
    double-counted returned empties into filled stock. traded_in must not touch filled balance.
    """
    _set_lpg_prices(client, owner_headers)
    rows = _zero_rows()
    for r in rows:
        r["opening_balance"] = 10
        r["opening_empty"] = 0
    res = client.post("/api/v1/lpg-daily/entry", headers=owner_headers, json={
        "date": "2099-01-03", "shift_type": "Day",
        "salesperson": "tester", "recorded_by": "tester",
        "cylinder_rows": rows,
        "trades": [{"from_size_kg": 3, "to_size_kg": 6, "quantity": 2}],
    })
    assert res.status_code == 200, res.text
    out = res.json()
    by_size = {r["size_kg"]: r for r in out["cylinder_rows"]}
    # 3kg: traded_in=2 but filled balance is unchanged (still 10), not 12.
    assert by_size[3]["traded_in"] == 2
    assert by_size[3]["balance"] == 10
    # 6kg: traded_out=2 leaves as filled, so filled drops from 10 to 8.
    assert by_size[6]["traded_out"] == 2
    assert by_size[6]["balance"] == 8


def test_lpg_downgrade_charge_uses_same_formula(client, owner_headers):
    """
    Downgrade (6kg -> 3kg): price_refill[3] + (deposit[3] - deposit[6]) = 147 + (330 - 500) = -23.
    Negative price_difference means the station owes the customer.
    """
    _set_lpg_prices(client, owner_headers)
    res = client.post("/api/v1/lpg-daily/entry", headers=owner_headers, json={
        "date": "2099-01-04", "shift_type": "Day",
        "salesperson": "tester", "recorded_by": "tester",
        "cylinder_rows": _zero_rows(),
        "trades": [{"from_size_kg": 6, "to_size_kg": 3, "quantity": 1}],
    })
    assert res.status_code == 200, res.text
    out = res.json()
    assert out["trades"][0]["trade_type"] == "downgrade"
    assert out["trades"][0]["price_difference"] == -23
