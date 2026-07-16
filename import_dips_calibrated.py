# -*- coding: utf-8 -*-
"""
Import tank dip readings from the uncalibrated spreadsheet.
Volumes are computed from the system calibration charts (linear interpolation).

Usage:
    python import_dips_calibrated.py          # dry run
    python import_dips_calibrated.py --write  # commit to DB
"""

import psycopg
import json
import openpyxl
import re
import sys
from datetime import datetime

DATABASE_URL = (
    "postgresql://neondb_owner:npg_oeZLy1qKk2Aj@ep-lively-sky-anjdm2jr-pooler"
    ".c-6.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
)
EXCEL_PATH = r"C:\Projects\Fuel\dips 6 to 11_uncaliburated.xlsx"

TANK_MAP = {
    "petrol tank 1":  "TANK-PETROL",
    "diesel tank 2":  "TANK-DIESEL-2",
    "diesel tank 12": "TANK-DIESEL-2",   # typo variant
    "diesel tank 1":  "TANK-DIESEL",
}

dry_run = "--write" not in sys.argv


# ---------------------------------------------------------------------------
# Calibration interpolation (mirrors backend dip_to_volume)
# ---------------------------------------------------------------------------
def dip_to_volume(chart: dict, dip_cm: float) -> float:
    if dip_cm <= 0:
        return 0.0
    sorted_dips = sorted(chart.keys())
    if dip_cm in chart:
        return float(chart[dip_cm])
    for i in range(len(sorted_dips) - 1):
        lo, hi = sorted_dips[i], sorted_dips[i + 1]
        if lo <= dip_cm <= hi:
            ratio = (dip_cm - lo) / (hi - lo)
            return chart[lo] + ratio * (chart[hi] - chart[lo])
    if dip_cm < sorted_dips[0]:
        return 0.0
    return float(chart[sorted_dips[-1]])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def parse_date_shift(raw):
    m = re.match(r"(\d{2})/(\d{2})/(\d{2})\s+(DAY|NIGHT)", raw.strip(), re.I)
    if not m:
        return None, None
    dd, mm, yy, shift = m.groups()
    return f"20{yy}-{mm}-{dd}", shift.capitalize()


def resolve_tank(product_name):
    key = product_name.lower().strip()
    for prefix, tid in sorted(TANK_MAP.items(), key=lambda x: -len(x[0])):
        if key.startswith(prefix):
            return tid
    return None


# ---------------------------------------------------------------------------
# Load DB
# ---------------------------------------------------------------------------
with psycopg.connect(DATABASE_URL) as conn:
    with conn.cursor() as cur:
        cur.execute("SELECT data FROM station_storage WHERE station_id='ST001'")
        storage = cur.fetchone()[0]
        cur.execute(
            "SELECT data FROM station_files "
            "WHERE station_id='ST001' AND filename='tank_calibrations.json'"
        )
        row = cur.fetchone()
        calibrations = row[0] if row else {}

# Build float-keyed charts per tank
charts = {}
for tank_id, cal in calibrations.items():
    charts[tank_id] = {float(k): float(v) for k, v in cal.get("chart", {}).items()}

missing_cals = []
for tid in ["TANK-PETROL", "TANK-DIESEL", "TANK-DIESEL-2"]:
    if tid not in charts or not charts[tid]:
        missing_cals.append(tid)
if missing_cals:
    print(f"ERROR — no calibration chart found for: {missing_cals}")
    print("Upload calibration charts via Admin > Settings > Tank Calibration first.")
    sys.exit(1)

# ---------------------------------------------------------------------------
# Parse Excel
# ---------------------------------------------------------------------------
wb = openpyxl.load_workbook(EXCEL_PATH, data_only=True)
ws = wb.active

shifts_data = {}
current_date = current_shift = None

for row in ws.iter_rows(values_only=True):
    cols = row[1:]
    if not any(v is not None for v in cols):
        continue
    date_cell = cols[0]
    product   = cols[1] if len(cols) > 1 else None
    o_dip     = cols[2] if len(cols) > 2 else None
    c_dip     = cols[3] if len(cols) > 3 else None

    if date_cell in ("DATE", None) and product in ("PRODUCT", None):
        continue
    if product in ("Dip ", None) and date_cell is None:
        continue

    if date_cell is not None:
        d, s = parse_date_shift(str(date_cell))
        if d:
            current_date, current_shift = d, s

    if product and current_date and o_dip is not None:
        tid = resolve_tank(str(product))
        if not tid:
            continue
        chart = charts[tid]
        o_vol = round(dip_to_volume(chart, float(o_dip)), 1)
        c_vol = round(dip_to_volume(chart, float(c_dip)), 1) if c_dip is not None else 0.0

        sid = f"{current_date}-{current_shift}"
        if sid not in shifts_data:
            shifts_data[sid] = []
        shifts_data[sid].append({
            "tank_id":               tid,
            "opening_dip_cm":        float(o_dip),
            "opening_volume_liters": o_vol,
            "closing_dip_cm":        float(c_dip) if c_dip is not None else 0.0,
            "closing_volume_liters": c_vol,
        })

# ---------------------------------------------------------------------------
# Preview
# ---------------------------------------------------------------------------
db_shifts = storage.get("shifts", {})

print("=" * 78)
print("DIP IMPORT — volumes computed from system calibration charts")
print("=" * 78)

missing_shifts = []
for sid in sorted(shifts_data.keys()):
    entries = shifts_data[sid]
    existing = db_shifts.get(sid, {}).get("tank_dip_readings", [])
    action = "OVERWRITE" if existing else "CREATE"
    print(f"\n  [{action}] {sid}")
    for e in entries:
        print(f"    {e['tank_id']:<16}  "
              f"open  {e['opening_dip_cm']:>6.1f}cm -> {e['opening_volume_liters']:>9.1f}L   "
              f"close {e['closing_dip_cm']:>6.1f}cm -> {e['closing_volume_liters']:>9.1f}L")
    if sid not in db_shifts:
        missing_shifts.append(sid)

if missing_shifts:
    print(f"\nWARNING — shift records not in DB: {missing_shifts}")

print(f"\nTotal: {len(shifts_data)} shifts, "
      f"{sum(len(v) for v in shifts_data.values())} tank entries.")

if dry_run:
    print("\n[DRY RUN] Pass --write to commit.")
    sys.exit(0)

# ---------------------------------------------------------------------------
# Write
# ---------------------------------------------------------------------------
for sid, entries in shifts_data.items():
    if sid not in db_shifts:
        print(f"SKIP — {sid} not in DB")
        continue
    db_shifts[sid]["tank_dip_readings"] = entries

with psycopg.connect(DATABASE_URL) as conn:
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE station_storage SET data = %s::jsonb, updated_at = NOW() "
            "WHERE station_id = 'ST001'",
            (json.dumps(storage),)
        )
    conn.commit()

print(f"\nWritten calibrated dip readings for {len(shifts_data)} shifts. [DONE]")
