# -*- coding: utf-8 -*-
"""
DEFINITIVE dip readings import for Jun 6-11 2026.

Writes to BOTH storage locations:
  1. station_files / tank_readings.json  -- what the History tab and /dips API reads
  2. station_storage shifts.tank_dip_readings -- what stock reports read

Steps:
  - Removes ALL existing Jun 6-11 entries from tank_readings.json (clears duplicates)
  - Writes 36 clean entries (12 shifts x 3 tanks) from the uncalibrated spreadsheet,
    volumes derived from system calibration charts

Usage:
    python import_dips_final.py          # dry run
    python import_dips_final.py --write  # commit to DB
"""

import psycopg
import json
import openpyxl
import re
import sys
import uuid
from datetime import datetime

DATABASE_URL = (
    "postgresql://neondb_owner:npg_oeZLy1qKk2Aj@ep-lively-sky-anjdm2jr-pooler"
    ".c-6.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
)
EXCEL_PATH = r"C:\Projects\Fuel\dips 6 to 11_uncaliburated.xlsx"

TANK_MAP = {
    "petrol tank 1":  "TANK-PETROL",
    "diesel tank 2":  "TANK-DIESEL-2",
    "diesel tank 12": "TANK-DIESEL-2",
    "diesel tank 1":  "TANK-DIESEL",
}

dry_run = "--write" not in sys.argv
NOW = datetime.now().isoformat()
TARGET_DATES = {f"2026-06-{d:02d}" for d in range(6, 12)}


# ---------------------------------------------------------------------------
# Calibration interpolation
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
            return round(chart[lo] + ratio * (chart[hi] - chart[lo]), 1)
    return float(chart[sorted_dips[-1]])


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
        cur.execute(
            "SELECT data FROM station_files "
            "WHERE station_id='ST001' AND filename='tank_readings.json'"
        )
        row = cur.fetchone()
        tank_readings = row[0] if row else {}

# Build calibration charts
charts = {}
for tank_id, cal in calibrations.items():
    charts[tank_id] = {float(k): float(v) for k, v in cal.get("chart", {}).items()}

missing_cals = [t for t in ["TANK-PETROL", "TANK-DIESEL", "TANK-DIESEL-2"]
                if t not in charts or not charts[t]]
if missing_cals:
    print(f"ERROR — no calibration chart for: {missing_cals}")
    sys.exit(1)

# ---------------------------------------------------------------------------
# Parse Excel
# ---------------------------------------------------------------------------
wb = openpyxl.load_workbook(EXCEL_PATH, data_only=True)
ws = wb.active

xl_entries = []    # (date, shift_type, tank_id, o_dip, o_vol, c_dip, c_vol)
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
        xl_entries.append((current_date, current_shift, tid,
                           float(o_dip), o_vol, float(c_dip), c_vol))

# ---------------------------------------------------------------------------
# Preview
# ---------------------------------------------------------------------------
existing_to_remove = {rid: r for rid, r in tank_readings.items()
                      if r.get("date", "") in TARGET_DATES}
print("=" * 72)
print("DIP IMPORT (DEFINITIVE) — writing to tank_readings.json + shifts")
print("=" * 72)
print(f"\nRemoving {len(existing_to_remove)} existing Jun 6-11 entries from tank_readings.json")
print(f"Writing {len(xl_entries)} clean entries\n")

by_shift = {}
for date, shift, tid, o_dip, o_vol, c_dip, c_vol in xl_entries:
    sid = f"{date}-{shift}"
    by_shift.setdefault(sid, []).append((tid, o_dip, o_vol, c_dip, c_vol))

for sid in sorted(by_shift.keys()):
    entries = by_shift[sid]
    print(f"  {sid}  ({len(entries)} tanks)")
    for tid, o_dip, o_vol, c_dip, c_vol in entries:
        print(f"    {tid:<16}  open {o_dip:>6.1f}cm -> {o_vol:>9.1f}L  "
              f"close {c_dip:>6.1f}cm -> {c_vol:>9.1f}L")

print(f"\nTotal: {len(by_shift)} shifts, {len(xl_entries)} entries.")

if dry_run:
    print("\n[DRY RUN] Pass --write to commit.")
    sys.exit(0)

# ---------------------------------------------------------------------------
# Write
# ---------------------------------------------------------------------------
# 1. Clean tank_readings.json
for rid in existing_to_remove:
    del tank_readings[rid]

# 2. Add clean entries to tank_readings.json
for date, shift, tid, o_dip, o_vol, c_dip, c_vol in xl_entries:
    rid = f"dip-import-{date}-{shift}-{tid}"
    tank_readings[rid] = {
        "reading_id":      rid,
        "tank_id":         tid,
        "date":            date,
        "shift_type":      shift,
        "opening_dip_cm":  o_dip,
        "opening_volume":  o_vol,
        "closing_dip_cm":  c_dip,
        "closing_volume":  c_vol,
        "recorded_by":     "import",
        "created_at":      NOW,
        "updated_at":      NOW,
        "nozzle_readings": [],
        "deliveries":      [],
    }

# 3. Also update shifts.tank_dip_readings in station_storage
db_shifts = storage.get("shifts", {})
for sid, entries in by_shift.items():
    if sid not in db_shifts:
        continue
    db_shifts[sid]["tank_dip_readings"] = [
        {
            "tank_id":               tid,
            "opening_dip_cm":        o_dip,
            "opening_volume_liters": o_vol,
            "closing_dip_cm":        c_dip,
            "closing_volume_liters": c_vol,
        }
        for tid, o_dip, o_vol, c_dip, c_vol in entries
    ]

with psycopg.connect(DATABASE_URL) as conn:
    with conn.cursor() as cur:
        # station_files — no in-memory cache, immediately visible to API
        cur.execute(
            "UPDATE station_files SET data = %s::jsonb, updated_at = NOW() "
            "WHERE station_id='ST001' AND filename='tank_readings.json'",
            (json.dumps(tank_readings),)
        )
        # station_storage — cached in backend memory, takes effect after owner reload
        cur.execute(
            "UPDATE station_storage SET data = %s::jsonb, updated_at = NOW() "
            "WHERE station_id='ST001'",
            (json.dumps(storage),)
        )
    conn.commit()

print(f"\nWritten {len(xl_entries)} entries to tank_readings.json.")
print(f"Updated {len(by_shift)} shifts in station_storage.")
print("[DONE]")
print("\nNOTE: History tab is live immediately. Stock reports will reflect")
print("the new data after the owner logs out and back in (backend reload).")
