"""
One-off diagnostic: the Lubricants tab on Stores/Stock is showing a count of 0 for
Kalulushi (station ST001) despite the catalog historically having ~86 products, and
newly-added items aren't showing up either. This script checks production directly:
  1. What does GET /lubricants-daily/products/pricing actually return right now?
  2. Does POST /stores/items (adding a test item) succeed?
  3. Does that test item then show up in the GET response?
  4. Does it show up in GET /stores/dashboard (the separate stock_items ledger)?

This isolates whether the problem is: the read endpoint, the write endpoint, a
station-id mismatch, or something else. It only ever ADDS one clearly-marked test
item (product_code TEST-DIAG-<timestamp>) — nothing existing is touched. Delete the
test item afterward from Stores/Stock's Lubricants tab (Edit -> there is no delete
in the UI for lubricants currently, so use DELETE /stores/items/{item_key} — this
script offers to do that cleanup automatically at the end).

Usage:
    export DIAG_USER=<manager username>
    export DIAG_PASS=<manager password>
    python diagnose_lubricant_catalog.py
"""
import os
import sys
import time

import requests

API_BASE = os.environ.get("DIAG_API_BASE", "https://fuel-api-wpdj.onrender.com")


class ApiClient:
    def __init__(self, base_url):
        self.base_url = base_url.rstrip("/")
        self.session = requests.Session()

    def login(self, username, password):
        r = self.session.post(f"{self.base_url}/api/v1/auth/login",
                               json={"username": username, "password": password}, timeout=30)
        r.raise_for_status()
        body = r.json()
        token = body["access_token"]
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        return body.get("user", {})

    def get(self, path, station_id=None, **kw):
        headers = {"X-Station-Id": station_id} if station_id else {}
        r = self.session.get(f"{self.base_url}{path}", headers=headers, timeout=30, **kw)
        return r

    def post(self, path, station_id=None, json=None):
        headers = {"X-Station-Id": station_id} if station_id else {}
        r = self.session.post(f"{self.base_url}{path}", headers=headers, json=json, timeout=30)
        return r

    def delete(self, path, station_id=None):
        headers = {"X-Station-Id": station_id} if station_id else {}
        r = self.session.delete(f"{self.base_url}{path}", headers=headers, timeout=30)
        return r


def main():
    username = os.environ.get("DIAG_USER")
    password = os.environ.get("DIAG_PASS")
    if not username or not password:
        print("Set DIAG_USER and DIAG_PASS environment variables first.")
        sys.exit(1)

    client = ApiClient(API_BASE)
    user = client.login(username, password)
    station_id = user.get("station_id") or user.get("current_station_id")
    print(f"Logged in as: {user.get('full_name') or username} (role={user.get('role')})")
    print(f"Resolved station_id from login response: {station_id!r}")
    print()

    # --- Step 1: what does the catalog GET return right now? ---
    print("=" * 70)
    print("STEP 1: GET /api/v1/lubricants-daily/products/pricing")
    r = client.get("/api/v1/lubricants-daily/products/pricing", station_id=station_id)
    print(f"  status: {r.status_code}")
    if r.ok:
        catalog = r.json()
        print(f"  catalog type: {type(catalog).__name__}, count: {len(catalog) if isinstance(catalog, list) else 'N/A'}")
        if isinstance(catalog, list) and catalog:
            print(f"  first entry: {catalog[0]}")
        elif isinstance(catalog, list):
            print("  catalog is an EMPTY LIST.")
        else:
            print(f"  unexpected body: {catalog}")
    else:
        print(f"  body: {r.text[:500]}")
    print()

    # --- Step 2: also check the Stores/Stock dashboard (separate ledger) ---
    print("=" * 70)
    print("STEP 2: GET /api/v1/stores/dashboard (checking for existing lubricant: items)")
    r2 = client.get("/api/v1/stores/dashboard", station_id=station_id)
    print(f"  status: {r2.status_code}")
    if r2.ok:
        dash = r2.json()
        items = dash.get("items", []) if isinstance(dash, dict) else []
        lub_items = [i for i in items if i.get("category") == "lubricant"]
        print(f"  total stock_items entries: {len(items)}")
        print(f"  of those, category=='lubricant': {len(lub_items)}")
        if lub_items:
            print(f"  sample: {lub_items[0]}")
    else:
        print(f"  body: {r2.text[:500]}")
    print()

    # --- Step 3: add a clearly-marked test item ---
    test_code = f"TEST-DIAG-{int(time.time())}"
    print("=" * 70)
    print(f"STEP 3: POST /api/v1/stores/items (test_code={test_code})")
    r3 = client.post("/api/v1/stores/items", station_id=station_id, json={
        "category": "lubricant",
        "product_code": test_code,
        "name": "DIAGNOSTIC TEST ITEM - safe to delete",
        "unit": "L",
        "reorder_level": 0,
        "selling_price": 1.23,
        "sub_category": "Other",
        "unit_size": "1L",
    })
    print(f"  status: {r3.status_code}")
    print(f"  body: {r3.text[:500]}")
    print()

    # --- Step 4: immediately re-check the catalog GET ---
    print("=" * 70)
    print("STEP 4: GET /api/v1/lubricants-daily/products/pricing again, right after the POST")
    r4 = client.get("/api/v1/lubricants-daily/products/pricing", station_id=station_id)
    found_in_catalog = False
    if r4.ok:
        catalog2 = r4.json()
        count2 = len(catalog2) if isinstance(catalog2, list) else 0
        found_in_catalog = isinstance(catalog2, list) and any(p.get("product_code") == test_code for p in catalog2)
        print(f"  status: {r4.status_code}, count now: {count2}")
        print(f"  test item found in catalog: {found_in_catalog}")
    else:
        print(f"  status: {r4.status_code}, body: {r4.text[:500]}")
    print()

    # --- Step 5: check the stock_items ledger too ---
    print("=" * 70)
    print("STEP 5: GET /api/v1/stores/dashboard again, right after the POST")
    r5 = client.get("/api/v1/stores/dashboard", station_id=station_id)
    found_in_ledger = False
    if r5.ok:
        dash2 = r5.json()
        items2 = dash2.get("items", []) if isinstance(dash2, dict) else []
        found_in_ledger = any(i.get("product_code") == test_code for i in items2)
        print(f"  status: {r5.status_code}, total items: {len(items2)}")
        print(f"  test item found in stock_items ledger: {found_in_ledger}")
    else:
        print(f"  status: {r5.status_code}, body: {r5.text[:500]}")
    print()

    # --- Summary ---
    print("=" * 70)
    print("SUMMARY")
    print(f"  POST /stores/items succeeded (HTTP {r3.status_code}): {r3.ok}")
    print(f"  Test item appears in catalog (products/pricing) immediately after: {found_in_catalog}")
    print(f"  Test item appears in stock_items ledger (dashboard) immediately after: {found_in_ledger}")
    if r3.ok and not found_in_catalog:
        print()
        print("  ==> The write reports success but does not round-trip into the catalog read.")
        print("      This points to a server-side persistence/read issue, not a UI problem.")
    elif r3.ok and found_in_catalog:
        print()
        print("  ==> Round-tripped correctly. The earlier missing entries were likely updates")
        print("      to already-existing product codes rather than a persistence bug.")

    # --- Cleanup ---
    if r3.ok:
        print()
        ans = input(f"Delete the test item ({test_code}) now? [y/N] ").strip().lower()
        if ans == "y":
            item_key = f"lubricant:{test_code}"
            rd = client.delete(f"/api/v1/stores/items/{item_key}", station_id=station_id)
            print(f"  DELETE status: {rd.status_code}, body: {rd.text[:300]}")
        else:
            print(f"  Left in place. Delete manually later: item_key = lubricant:{test_code}")


if __name__ == "__main__":
    main()
