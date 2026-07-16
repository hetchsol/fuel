# -*- coding: utf-8 -*-
"""
Import tank dip readings from Excel into ST001 shift records.

Covers: 2026-06-06 to 2026-06-11 (Day + Night), 3 tanks per shift.
All figures (dip cm and volume L) taken verbatim from the spreadsheet.

Usage:
    python import_dips.py          # dry run
    python import_dips.py --write  # commit to DB
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
EXCEL_PATH = r"C:\Projects\Fuel\dips 6 to 11.xlsx"

TANK_MAP = {
    "petrol tank 1":  "TANK-PETROL",
    "diesel tank 12": "TANK-DIESEL-2",   # typo in spreadsheet for "Diesel Tank 2"
    "diesel tank 1":  "TANK-DIESEL",
}

dry_run = "--write" not in sys.argv


def parse_date_shift(raw):
    """'06/06/26    DAY' -> ('2026-06-06', 'Day')"""
    raw = raw.strip()
    m = re.match(r"(\d{2})/(\d{2})/(\d{2})\s+(DAY|NIGHT)", raw, re.I)
    if not m:
        return None, None
    dd, mm, yy, shift = m.groups()
    date = f"20{yy}-{mm}-{dd}"
    return date, shift.capitalize()


def tank_id(product_name):
    key = product_name.lower().strip()
    for prefix, tid in TANK_MAP.items():
        if key.startswith(prefix):
            return tid
    return None


# Parse Excel
wb = openpyxl.load_workbook(EXCEL_PATH, data_only=True)
ws = wb.active

shifts_data = {}   # shift_id -> [dip_entry, ...]
current_date = None
current_shift = None

for row in ws.iter_rows(min_row=2, values_only=True):
    cols = row[1:]   # skip col A (always None)
    if not any(v is not None for v in cols):
        continue
    date_cell, product, o_dip, o_vol, c_dip, c_vol = cols[:6]

    # Header rows
    if date_cell in ("DATE", None) and product in ("PRODUCT", None):
        continue
    if product in ("Dip ", "Volume", None) and date_cell is None:
        continue

    if date_cell is not None:
        d, s = parse_date_shift(str(date_cell))
        if d:
            current_date, current_shift = d, s

    if product and current_date:
        tid = tank_id(str(product))
        if tid and o_dip is not None:
            sid = f"{current_date}-{current_shift}"
            if sid not in shifts_data:
                shifts_data[sid] = []
            shifts_data[sid].append({
                "tank_id":               tid,
                "opening_dip_cm":        float(o_dip),
                "opening_volume_liters": float(o_vol),
                "closing_dip_cm":        float(c_dip),
                "closing_volume_liters": float(c_vol),
            })

# Load DB
with psycopg.connect(DATABASE_URL) as conn:
    with conn.cursor() as cur:
        cur.execute("SELECT data FROM station_storage WHERE station_id='ST001'")
        storage = cur.fetchone()[0]

db_shifts = storage.get("shifts", {})

# Preview
print("=" * 72)
print("DIP IMPORT PREVIEW  (all figures verbatim from Excel)")
print("=" * 72)

missing_shifts = []
for sid in sorted(shifts_data.keys()):
    entries = shifts_data[sid]
    existing = db_shifts.get(sid, {}).get("tank_dip_readings", [])
    action = "OVERWRITE" if existing else "CREATE"
    print(f"\n  [{action}] {sid}  ({len(entries)} tanks)")
    for e in entries:
        print(f"    {e['tank_id']:<16}  open={e['opening_dip_cm']}cm/{e['opening_volume_liters']}L"
              f"  close={e['closing_dip_cm']}cm/{e['closing_volume_liters']}L")
    if sid not in db_shifts:
        missing_shifts.append(sid)

if missing_shifts:
    print(f"\nWARNING — these shift records don't exist in DB: {missing_shifts}")

print(f"\nTotal: {len(shifts_data)} shifts, "
      f"{sum(len(v) for v in shifts_data.values())} tank-shift entries.")

if dry_run:
    print("\n[DRY RUN] Pass --write to commit.")
    sys.exit(0)

# Write
for sid, entries in shifts_data.items():
    if sid not in db_shifts:
        print(f"SKIP — shift {sid} not found in DB")
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

print(f"\nWritten dip readings for {len(shifts_data)} shifts. [DONE]")
