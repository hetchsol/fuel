#!/usr/bin/env python3
"""
READ-ONLY inspection of the live Kalulushi station (ST001) in the Render
PostgreSQL database. Writes nothing - it only reads and prints structure so the
import script can be built with 100% accuracy against the real data.

Run it where DATABASE_URL points at the Render Postgres:
  - On the Render `fuel-api` shell (DATABASE_URL already set), or
  - Locally with the external connection string:
        # PowerShell:   $env:DATABASE_URL="postgres://...":  ; python inspect_kalulushi.py
        # bash:         DATABASE_URL="postgres://..." python inspect_kalulushi.py

Needs psycopg v3:  pip install "psycopg[binary]"
"""
import os
import sys
import json

STATION_ID = "ST001"

DB = os.getenv("DATABASE_URL")
if not DB:
    sys.exit("ERROR: set DATABASE_URL to the Render Postgres connection string first.")

try:
    import psycopg
except ImportError:
    sys.exit('ERROR: psycopg not installed. Run:  pip install "psycopg[binary]"')


def as_obj(v):
    """station_storage/station_files columns are jsonb; psycopg returns dict/list,
    but tolerate a JSON string just in case."""
    if isinstance(v, (dict, list)):
        return v
    if isinstance(v, str):
        try:
            return json.loads(v)
        except Exception:
            return v
    return v


def main():
    conn = psycopg.connect(DB, connect_timeout=20)
    cur = conn.cursor()

    print("=" * 70)
    print("ALL STATIONS (confirm ST001 is Kalulushi)")
    print("=" * 70)
    for sid, data in cur.execute("SELECT station_id, data FROM stations ORDER BY station_id").fetchall():
        d = as_obj(data) or {}
        print(f"  {sid:8s}  name={d.get('name')!r}  status={d.get('status')!r}  location={d.get('location')!r}")

    print("\n" + "=" * 70)
    print(f"STATION_STORAGE for {STATION_ID} (top-level keys)")
    print("=" * 70)
    row = cur.execute("SELECT data FROM station_storage WHERE station_id=%s", (STATION_ID,)).fetchone()
    storage = as_obj(row[0]) if row else {}
    if not storage:
        print("  (no station_storage row found)")
    for k, v in storage.items():
        if isinstance(v, dict):
            print(f"  {k:32s} dict  ({len(v)} keys)")
        elif isinstance(v, list):
            print(f"  {k:32s} list  ({len(v)} items)")
        else:
            print(f"  {k:32s} {type(v).__name__} = {v!r}")

    # Tanks
    print("\n" + "-" * 70)
    print("TANKS")
    print("-" * 70)
    for tid, t in (storage.get("tanks") or {}).items():
        print(f"  {tid:16s} fuel={t.get('fuel_type'):8s} capacity={t.get('capacity')} level={t.get('current_level')}")

    # Islands + nozzles (the critical part for opening readings)
    print("\n" + "-" * 70)
    print("ISLANDS / NOZZLES  (nozzle_id, label, fuel, tank, elec_reading, mech_reading)")
    print("-" * 70)
    for iid, isl in (storage.get("islands") or {}).items():
        print(f"  Island {iid}  name={isl.get('name')!r}  status={isl.get('status')!r}")
        ps = isl.get("pump_station") or {}
        for n in ps.get("nozzles", []):
            print(f"      {n.get('nozzle_id'):14s} label={n.get('display_label')!r:8} "
                  f"fuel={str(n.get('fuel_type')):8s} tank={str(n.get('tank_id')):16s} "
                  f"elec={n.get('electronic_reading')} mech={n.get('mechanical_reading')}")

    # Per-station files (what holds the test data to clear)
    print("\n" + "=" * 70)
    print(f"STATION_FILES for {STATION_ID} (filename -> record count)")
    print("=" * 70)
    for fn, data in cur.execute(
        "SELECT filename, data FROM station_files WHERE station_id=%s ORDER BY filename", (STATION_ID,)
    ).fetchall():
        o = as_obj(data)
        n = len(o) if isinstance(o, (dict, list)) else "?"
        print(f"  {fn:34s} {n} records")

    conn.close()
    print("\nDone (read-only - nothing was modified).")


if __name__ == "__main__":
    main()
