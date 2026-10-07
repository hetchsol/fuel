#!/usr/bin/env python3
"""
Read-only diagnostic: where does the LPG opening count come from?

Before Forecourt go-live, each LPG size's opening count is taken from:
  1. the closing count on the most recent live handover that has LPG rows
  2. else the Forecourt count on the Stores page for that cylinder item
  3. else 0
This prints each of those sources from the live system, plus the latest LPG
Daily Entry records for comparison, so you can see which one is in use and
why it reads 0.

Does not change anything - GET requests only.

Usage:
    python diagnose_lpg_opening.py
    python diagnose_lpg_opening.py --station ST001

Uses only the Python standard library - no pip install needed.
"""
import argparse
import getpass
import json
import sys
import urllib.error
import urllib.request

BASE_URL = "https://fuel-api-wpdj.onrender.com/api/v1"


def _request(method, path, token=None, station=None, body=None, timeout=60):
    req = urllib.request.Request(f"{BASE_URL}{path}", method=method,
                                 data=json.dumps(body).encode() if body is not None else None)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    if station:
        req.add_header("X-Station-Id", station)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, {"detail": raw}


def _is_live(h):
    if h.get("review_status") in ("voided", "superseded"):
        return False
    return not (h.get("superseded_by") or h.get("phase") == "readings_superseded")


def main():
    parser = argparse.ArgumentParser(description="Where does the LPG opening count come from? (read-only)")
    parser.add_argument("--station", default="ST001", help="Station ID (default: ST001)")
    args = parser.parse_args()

    username = input("Username: ").strip()
    password = getpass.getpass("Password: ")
    print("Logging in...", flush=True)
    status, data = _request("POST", "/auth/login", body={"username": username, "password": password})
    if status != 200:
        print(f"Login failed: {data.get('detail', data)}")
        sys.exit(1)
    token = data["access_token"]
    print(f"Logged in as {data.get('user', {}).get('username')} ({data.get('user', {}).get('role')})\n")

    # --- Source 1: handovers with LPG rows ---
    status, handovers = _request("GET", "/handover/entries", token=token, station=args.station)
    if status != 200:
        print(f"Failed to fetch handovers: {handovers.get('detail', handovers)}")
        sys.exit(1)
    with_lpg = [h for h in handovers if ((h.get("stock_snapshot") or {}).get("lpg_cylinders"))]
    print(f"=== Source 1: handovers with LPG rows ({len(with_lpg)} of {len(handovers)} handovers) ===")
    picked = next((h for h in with_lpg if _is_live(h)), None)
    for h in with_lpg[:8]:
        rows = h["stock_snapshot"]["lpg_cylinders"]
        figures = ", ".join(f"{r.get('size_kg')}kg {r.get('closing_full', 0)}F/{r.get('closing_empty', 0)}E" for r in rows)
        tag = "  <- USED" if h is picked else ("" if _is_live(h) else "  (not live, skipped)")
        print(f"  {h.get('date')} {h.get('shift_type', ''):5} {h.get('attendant_name', ''):20} "
              f"{h.get('review_status', ''):10} closing: {figures}{tag}")
    if not with_lpg:
        print("  None. No attendant has ever submitted LPG on a shift handover, so source 1 is empty.")
    print()

    # --- Source 2: Stores cylinder items ---
    status, items = _request("GET", "/stores/items", token=token, station=args.station)
    print("=== Source 2: Stores page cylinder counts ===")
    if status != 200:
        print(f"  Unavailable: {items.get('detail', items)}")
    else:
        cyl = sorted((i for i in items if str(i.get("category", "")).startswith("cylinder_")),
                     key=lambda i: i.get("item_key", ""))
        if not cyl:
            print("  No cylinder items in the Stores catalog.")
        for i in cyl:
            print(f"  {i.get('item_key'):24} stores={i.get('stores', 0):g}  forecourt={i.get('forecourt', 0):g}")
    print()

    # --- For comparison: LPG Daily Entry records ---
    status, entries = _request("GET", "/lpg-daily/entries", token=token, station=args.station)
    print("=== For comparison: latest LPG Daily Entry records ===")
    if status != 200:
        print(f"  Unavailable: {entries.get('detail', entries) if isinstance(entries, dict) else entries}")
    else:
        rows = entries if isinstance(entries, list) else list((entries or {}).values())
        rows.sort(key=lambda e: (e.get("date", ""), e.get("shift_type", "")), reverse=True)
        if not rows:
            print("  None.")
        for e in rows[:3]:
            print(f"  {e.get('date')} {e.get('shift_type', '')}  entry_id={e.get('entry_id')}")
            for r in (e.get("cylinder_rows") or e.get("rows") or e.get("product_rows") or [])[:8]:
                print("    " + ", ".join(f"{k}={v}" for k, v in r.items()
                                         if k in ("size_kg", "opening_full", "closing_full", "closing_empty",
                                                  "opening_balance", "closing_balance", "balance")))
    print()

    if picked:
        print("RESULT: openings come from source 1, the handover marked USED above.")
    else:
        print("RESULT: no live handover has LPG rows, so openings fall to source 2 (Stores), else 0.")


if __name__ == "__main__":
    main()
