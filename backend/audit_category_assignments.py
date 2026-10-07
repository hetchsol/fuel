#!/usr/bin/env python3
"""
Read-only audit before the shift-start stock count goes live.

1. Shifts where one stock category (LPG, Lubricants, Accessories) is assigned
   to more than one attendant. The roster now refuses to save these, so any
   still-active shift listed here must be fixed on the Shifts page first, or
   its next edit will be rejected.
2. The Forecourt go-live preview: each item's current Forecourt count next to
   the last shift's closing count it would be set to.

Does not change anything: GET requests plus a dry_run=true go-live preview.

Usage:
    python audit_category_assignments.py
    python audit_category_assignments.py --station ST001

Uses only the Python standard library - no pip install needed.
"""
import argparse
import getpass
import json
import sys
import urllib.error
import urllib.request

BASE_URL = "https://fuel-api-wpdj.onrender.com/api/v1"
CATEGORIES = (("assigned_lpg", "LPG"), ("assigned_lubricants", "Lubricants"), ("assigned_accessories", "Accessories"))


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


def main():
    parser = argparse.ArgumentParser(description="Audit stock category assignments (read-only).")
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

    # --- 1. Double category assignments ---
    status, shifts = _request("GET", "/shifts/", token=token, station=args.station)
    if status != 200:
        print(f"Failed to fetch shifts: {shifts.get('detail', shifts)}")
        sys.exit(1)

    clashes = []
    for s in shifts:
        assignments = s.get("assignments") or []
        for flag, label in CATEGORIES:
            holders = [a.get("attendant_name") or a.get("attendant_id") for a in assignments if a.get(flag)]
            if len(holders) > 1:
                clashes.append((s, label, holders))

    print(f"=== Stock categories held by more than one attendant ({len(clashes)} found in {len(shifts)} shifts) ===")
    for s, label, holders in sorted(clashes, key=lambda c: c[0].get("date", "")):
        print(f"  {s.get('date')} {s.get('shift_type'):5}  shift_id={s.get('shift_id')}  "
              f"status={s.get('status')!r}  {label}: {', '.join(holders)}")
    active = [c for c in clashes if c[0].get("status") == "active"]
    if active:
        print(f"\n  ACTION: {len(active)} active shift(s) above must be fixed on the Shifts page before go-live.")
    print()

    # --- 2. Go-live preview ---
    status, preview = _request("POST", "/stores/forecourt-go-live", token=token, station=args.station,
                               body={"source": "last_closing", "dry_run": True})
    if status != 200:
        print(f"Go-live preview unavailable: {preview.get('detail', preview)}")
        print("(Needs the new backend deployed, and an owner login.)")
        return
    rows = preview.get("rows", [])
    print("=== Forecourt go-live preview (source: last shift closing) ===")
    print(f"  {'Item':40} {'Forecourt now':>14} {'Last closing':>13}  From")
    for r in rows:
        now = r.get("forecourt_now")
        mark = "" if now is not None and abs((now or 0) - (r.get("last_closing") or 0)) < 1e-9 else "  <- changes"
        print(f"  {str(r.get('name'))[:40]:40} {('not set up' if now is None else f'{now:g}'):>14} "
              f"{r.get('last_closing', 0):>13g}  {r.get('handover_id') or r.get('closing_source')}{mark}")


if __name__ == "__main__":
    main()
