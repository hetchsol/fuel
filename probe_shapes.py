#!/usr/bin/env python3
"""READ-ONLY: dump exact shapes the importer must match - one full nozzle object,
the tank_calibrations.json record format, and the container type of each
station_files entry (so the reset empties them with the right type)."""
import os, sys, json
STATION_ID = "ST001"
DB = os.getenv("DATABASE_URL") or sys.exit("set DATABASE_URL")
import psycopg

def as_obj(v):
    if isinstance(v, (dict, list)): return v
    try: return json.loads(v)
    except Exception: return v

conn = psycopg.connect(DB, connect_timeout=20); cur = conn.cursor()
storage = as_obj(cur.execute("SELECT data FROM station_storage WHERE station_id=%s", (STATION_ID,)).fetchone()[0])

print("=== FULL nozzle object (ISL-001 / first nozzle) ===")
isl1 = storage["islands"]["ISL-001"]
print(json.dumps(isl1, indent=2)[:2500])

print("\n=== FULL tank object (TANK-PETROL) ===")
print(json.dumps(storage["tanks"]["TANK-PETROL"], indent=2))

print("\n=== tank_calibrations.json (structure; keys + first few chart points) ===")
row = cur.execute("SELECT data FROM station_files WHERE station_id=%s AND filename='tank_calibrations.json'", (STATION_ID,)).fetchone()
cal = as_obj(row[0]) if row else None
if isinstance(cal, dict):
    print("top-level keys:", list(cal.keys()))
    for k, v in cal.items():
        if isinstance(v, dict):
            print(f"  [{k}] keys: {list(v.keys())}")
            chart = v.get("chart") or v.get("data") or {}
            if isinstance(chart, dict):
                items = list(chart.items())[:3]
                print(f"      chart sample: {items}  (total {len(chart)} pts)")
        else:
            print(f"  [{k}] -> {type(v).__name__}")
else:
    print(type(cal).__name__, str(cal)[:500])

print("\n=== station_files container types (for correct empty value) ===")
for fn, data in cur.execute("SELECT filename, data FROM station_files WHERE station_id=%s ORDER BY filename", (STATION_ID,)).fetchall():
    o = as_obj(data)
    print(f"  {fn:34s} {type(o).__name__}")
conn.close()
