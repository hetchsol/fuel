#!/usr/bin/env python3
"""
Read-only: compare what is stored in the DB against the expected
calibration spreadsheets for ST001.

Run with DATABASE_URL set, e.g.:
  $env:DATABASE_URL="postgres://..."; python check_calibrations.py
"""
import os, sys, json
DB = os.getenv("DATABASE_URL")
if not DB:
    sys.exit("Set DATABASE_URL first.")

try:
    import psycopg
except ImportError:
    sys.exit('pip install "psycopg[binary]"')

try:
    import openpyxl
except ImportError:
    sys.exit("pip install openpyxl")

STATION_ID = "ST001"

# What we expect: tank_id -> (spreadsheet file, expected spot checks [(dip, vol)])
EXPECTED = {
    "TANK-DIESEL":   ("Diesel Tank 1 - 30000L.xlsx",  [(1, 7.7),   (100, None), (222, 30412.5), (223.4, 30500)]),
    "TANK-DIESEL-2": ("Diesel Tank 2 - 14000L.xlsx",  [(1, 4),     (100, None), (182.2, 14000)]),
    "TANK-PETROL":   ("Petrol Tank 1 - 30000L.xlsx",  [(1, 66.7),  (100, None), (222, None),    (222.5, 30500)]),
}

def load_xlsx_chart(path):
    wb = openpyxl.load_workbook(path, data_only=True, read_only=True)
    ws = wb.worksheets[0]
    chart = {}
    for row in ws.iter_rows(values_only=True):
        if not row or len(row) < 2: continue
        d, v = row[0], row[1]
        if isinstance(d, (int, float)) and isinstance(v, (int, float)):
            chart[float(d)] = float(v)
    return chart

def lookup(chart, dip):
    if dip in chart:
        return chart[dip]
    dips = sorted(chart)
    for i in range(len(dips)-1):
        if dips[i] <= dip <= dips[i+1]:
            lo, hi = dips[i], dips[i+1]
            r = (dip - lo) / (hi - lo)
            return chart[lo] + r * (chart[hi] - chart[lo])
    return None

conn = psycopg.connect(DB, connect_timeout=20)
cur = conn.cursor()

row = cur.execute(
    "SELECT data FROM station_files WHERE station_id=%s AND filename='tank_calibrations.json'",
    (STATION_ID,)
).fetchone()

if not row:
    print("No tank_calibrations.json found for ST001.")
    conn.close(); sys.exit(1)

db_cals = row[0] if isinstance(row[0], dict) else json.loads(row[0])
print(f"Tanks in DB calibration store: {list(db_cals.keys())}\n")

for tank_id, (xlsx_file, spot_checks) in EXPECTED.items():
    print(f"{'='*60}")
    print(f"Tank: {tank_id}  (expected file: {xlsx_file})")

    db_entry = db_cals.get(tank_id)
    if not db_entry:
        print("  DB: NO CALIBRATION STORED")
        continue

    db_chart_raw = db_entry.get("chart", {})
    db_chart = {float(k): v for k, v in db_chart_raw.items()}
    db_pts = len(db_chart)
    db_max_dip = max(db_chart) if db_chart else 0
    db_max_vol = max(db_chart.values()) if db_chart else 0
    print(f"  DB  : {db_pts} pts  dip range 1-{db_max_dip:.1f}  max_vol={db_max_vol:.1f}  uploaded_by={db_entry.get('uploaded_by')}")

    # Load expected xlsx
    try:
        xlsx_chart = load_xlsx_chart(xlsx_file)
        xlsx_pts = len(xlsx_chart)
        xlsx_max_dip = max(xlsx_chart)
        print(f"  XLSX: {xlsx_pts} pts  dip range 1-{xlsx_max_dip:.1f}")
    except Exception as e:
        print(f"  XLSX: could not load ({e})")
        xlsx_chart = {}

    # Spot checks
    print(f"  Spot checks:")
    for dip, expected_vol in spot_checks:
        db_vol = lookup(db_chart, float(dip))
        xlsx_vol = lookup(xlsx_chart, float(dip)) if xlsx_chart else None
        db_str = f"{db_vol:.1f}" if db_vol is not None else "n/a"
        xlsx_str = f"{xlsx_vol:.1f}" if xlsx_vol is not None else "n/a"
        match = "OK" if (db_vol is not None and xlsx_vol is not None and abs(db_vol - xlsx_vol) < 1) else "MISMATCH"
        if expected_vol is not None:
            exact = "OK" if (db_vol is not None and abs(db_vol - expected_vol) < 1) else f"WRONG (expected {expected_vol})"
            print(f"    {dip:6.1f} cm -> DB={db_str:10s}  XLSX={xlsx_str:10s}  exact={exact}")
        else:
            print(f"    {dip:6.1f} cm -> DB={db_str:10s}  XLSX={xlsx_str:10s}  {match}")

print()
conn.close()
print("Done (read-only).")
