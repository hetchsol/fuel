"""
GET /accounts/sales/account/{account_id} only ever returned one account's
entire history with no way to filter it. GET /accounts/sales searches
across every account with date/shift/attendant/fuel_type filters, enriching
each result with attendant/shift_type looked up via the handover that
created it (credit sale records don't carry those directly).
"""
import app.api.v1.attendant_handover as ah
from app.database.storage import get_station_storage


def _seed(monkeypatch):
    storage = get_station_storage("ST001")
    storage["accounts"] = {
        "ACC-A": {"account_id": "ACC-A", "account_name": "Alpha Transport"},
        "ACC-B": {"account_id": "ACC-B", "account_name": "Beta Logistics"},
    }
    storage["credit_sales"] = [
        {"sale_id": "CS-1", "account_id": "ACC-A", "shift_id": "2026-09-17-Day", "date": "2026-09-17",
         "fuel_type": "Diesel", "volume": 100.0, "amount": 1000.0,
         "invoice_number": "Handover HO-1", "voided": False},
        {"sale_id": "CS-2", "account_id": "ACC-B", "shift_id": "2026-09-17-Night", "date": "2026-09-17",
         "fuel_type": "Petrol", "volume": 50.0, "amount": 600.0,
         "invoice_number": "Handover HO-2", "voided": False},
        {"sale_id": "CS-3", "account_id": "ACC-A", "shift_id": "2026-09-16-Day", "date": "2026-09-16",
         "fuel_type": "Diesel", "volume": 80.0, "amount": 800.0,
         "invoice_number": "Handover HO-3", "voided": False},
        {"sale_id": "CS-VOIDED", "account_id": "ACC-A", "shift_id": "2026-09-17-Day", "date": "2026-09-17",
         "fuel_type": "Diesel", "volume": 10.0, "amount": 100.0,
         "invoice_number": "Handover HO-1", "voided": True},
    ]
    handovers = {
        "HO-1": {"attendant_id": "STF001", "attendant_name": "Precious Bwalya", "shift_type": "Day"},
        "HO-2": {"attendant_id": "STF002", "attendant_name": "Sharon Mulemwa", "shift_type": "Night"},
        "HO-3": {"attendant_id": "STF001", "attendant_name": "Precious Bwalya", "shift_type": "Day"},
    }
    monkeypatch.setattr(ah, "_load_handovers", lambda sid: handovers)
    return storage


def test_returns_all_non_voided_sales_enriched(client, owner_headers, monkeypatch):
    _seed(monkeypatch)

    res = client.get("/api/v1/accounts/sales", headers=owner_headers)
    assert res.status_code == 200
    data = res.json()
    sale_ids = {s["sale_id"] for s in data}
    assert sale_ids == {"CS-1", "CS-2", "CS-3"}  # voided one excluded

    cs1 = next(s for s in data if s["sale_id"] == "CS-1")
    assert cs1["account_name"] == "Alpha Transport"
    assert cs1["attendant_name"] == "Precious Bwalya"
    assert cs1["shift_type"] == "Day"
    assert "voided" not in cs1


def test_filter_by_date(client, owner_headers, monkeypatch):
    _seed(monkeypatch)
    res = client.get("/api/v1/accounts/sales?date=2026-09-16", headers=owner_headers)
    assert {s["sale_id"] for s in res.json()} == {"CS-3"}


def test_filter_by_date_range(client, owner_headers, monkeypatch):
    _seed(monkeypatch)
    res = client.get("/api/v1/accounts/sales?from_date=2026-09-17&to_date=2026-09-17", headers=owner_headers)
    assert {s["sale_id"] for s in res.json()} == {"CS-1", "CS-2"}


def test_filter_by_shift_type(client, owner_headers, monkeypatch):
    _seed(monkeypatch)
    res = client.get("/api/v1/accounts/sales?shift_type=Night", headers=owner_headers)
    assert {s["sale_id"] for s in res.json()} == {"CS-2"}


def test_filter_by_attendant(client, owner_headers, monkeypatch):
    _seed(monkeypatch)
    res = client.get("/api/v1/accounts/sales?attendant_id=STF001", headers=owner_headers)
    assert {s["sale_id"] for s in res.json()} == {"CS-1", "CS-3"}


def test_filter_by_fuel_type(client, owner_headers, monkeypatch):
    _seed(monkeypatch)
    res = client.get("/api/v1/accounts/sales?fuel_type=petrol", headers=owner_headers)  # case-insensitive
    assert {s["sale_id"] for s in res.json()} == {"CS-2"}


def test_filter_by_account_id(client, owner_headers, monkeypatch):
    _seed(monkeypatch)
    res = client.get("/api/v1/accounts/sales?account_id=ACC-B", headers=owner_headers)
    assert {s["sale_id"] for s in res.json()} == {"CS-2"}


def test_combined_filters(client, owner_headers, monkeypatch):
    _seed(monkeypatch)
    res = client.get(
        "/api/v1/accounts/sales?account_id=ACC-A&date=2026-09-17&fuel_type=Diesel",
        headers=owner_headers,
    )
    assert {s["sale_id"] for s in res.json()} == {"CS-1"}
