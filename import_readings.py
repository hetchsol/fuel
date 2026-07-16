# -*- coding: utf-8 -*-
"""
Import nozzle readings from Excel into ST001 attendant handovers.

All figures (volume sold, revenue) are taken directly from the spreadsheet.
Nothing is recomputed. Meter readings, volumes, and cash match the Excel 1:1.

Usage:
    python import_readings.py          # dry run — prints what will be written
    python import_readings.py --write  # executes the write to Neon DB
"""

import psycopg
import json
import openpyxl
import unicodedata
import re
import sys
from datetime import datetime
from collections import defaultdict

DATABASE_URL = (
    "postgresql://neondb_owner:npg_oeZLy1qKk2Aj@ep-lively-sky-anjdm2jr-pooler"
    ".c-6.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
)
EXCEL_PATH = r"C:\Users\Purchase Requisition\Downloads\6 To 11 reading.xlsx"
IMPORT_NOTE = "Imported from Excel: 6 To 11 reading.xlsx"


def norm(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", s.lower().strip())


# ---------------------------------------------------------------------------
# Step 1: Load Excel exactly as-is
# ---------------------------------------------------------------------------
def load_excel(path):
    wb = openpyxl.load_workbook(path, data_only=True)
    ws = wb.active
    rows = []
    for row in ws.iter_rows(min_row=2, values_only=True):
        if not any(v is not None for v in row):
            continue
        if row[1] == "Date":
            continue
        (date_val, shift, salesperson, _product, nozzle_label,
         elec_open, mech_open, elec_close, mech_close,
         vol_sold, expected_cash) = row[1:]
        if not isinstance(date_val, datetime):
            continue
        rows.append({
            "date":          date_val.strftime("%Y-%m-%d"),
            "shift":         (shift or "").strip(),
            "name":          (salesperson or "").strip(),
            "nozzle_label":  (nozzle_label or "").strip(),
            # meter readings — stored exactly as in spreadsheet
            "elec_open":     float(elec_open)    if elec_open    is not None else 0.0,
            "mech_open":     float(mech_open)    if mech_open    is not None else 0.0,
            "elec_close":    float(elec_close)   if elec_close   is not None else 0.0,
            "mech_close":    float(mech_close)   if mech_close   is not None else 0.0,
            # volume and cash taken verbatim from Excel — no recomputation
            "vol_sold":      float(vol_sold)      if vol_sold      is not None else 0.0,
            "expected_cash": float(expected_cash) if expected_cash is not None else 0.0,
        })
    return rows


# ---------------------------------------------------------------------------
# Step 2: Apply known typo corrections (meter readings only)
#         vol_sold and expected_cash for these rows are already correct
#         in the Excel (vol_sold=0/None, cash=0 for the Sharon row;
#         vol_sold=254.923, cash=6921.15945 for the Chishimba row).
# ---------------------------------------------------------------------------
def apply_corrections(rows):
    for r in rows:
        # Jun 7 Night Sharon 2A: elec_close typo 2,903,312.835 -> 290,312.835
        if (r["date"] == "2026-06-07" and r["shift"] == "Night"
                and r["nozzle_label"] == "2A" and r["elec_close"] > 2_000_000):
            r["elec_close"] = 290312.835

        # Jun 8 Day Chishimba 2A: elec_open carried the same typo
        if (r["date"] == "2026-06-08" and r["shift"] == "Day"
                and r["nozzle_label"] == "2A" and r["elec_open"] > 2_000_000):
            r["elec_open"] = 290312.835


# ---------------------------------------------------------------------------
# Step 3: Build handovers and any missing shifts
# ---------------------------------------------------------------------------
def build_import(xl_rows, storage, handovers, db_users):

    # --- Name -> (staff_id, full_name) ---
    name_map = {}
    for uid, full_name, username in db_users:
        for key in [norm(full_name or ""), norm(username or "")]:
            if key:
                name_map[key] = (uid, full_name or username)
        if full_name:
            first = norm(full_name).split()[0]
            if first not in name_map:
                name_map[first] = (uid, full_name)
    # Christabel: Excel has "christable" / "CHRISTABLE" (missing second 'l')
    christabel = name_map.get("christabel namonje") or name_map.get("christabel")
    if christabel:
        name_map["christable"] = christabel

    # --- Nozzle maps ---
    islands = storage.get("islands", {})
    nozzle_id_map  = {}   # display_label -> nozzle_id  (e.g. "1A" -> "ISL1-A")
    nozzle_fuel_map = {}  # nozzle_id -> fuel_type
    nozzle_isl_map  = {}  # nozzle_id -> island_id
    for isl_id, isl in islands.items():
        for n in isl.get("pump_station", {}).get("nozzles", []):
            label = n.get("display_label", "").strip()
            nid   = n["nozzle_id"]
            nozzle_id_map[label]   = nid
            nozzle_fuel_map[nid]   = n["fuel_type"]
            nozzle_isl_map[nid]    = isl_id

    shifts_db = storage.get("shifts", {})

    # Existing handover lookup: (date, shift_type, staff_id) -> ho_id
    ho_index = {
        (h.get("date"), h.get("shift_type"), h.get("attendant_id")): hid
        for hid, h in handovers.items()
    }

    # --- Group Excel rows by (date, shift, staff_id) after name normalisation ---
    groups   = defaultdict(list)
    unmapped = []
    for r in xl_rows:
        staff = name_map.get(norm(r["name"]))
        if not staff:
            unmapped.append(r["name"])
            continue
        groups[(r["date"], r["shift"], staff[0], staff[1])].append(r)

    now_iso          = datetime.now().isoformat()
    new_handovers    = {}
    shifts_to_create = {}

    for (date, shift, staff_id, full_name), rows in sorted(groups.items()):
        shift_id = f"{date}-{shift}"

        nozzle_summaries = []
        for r in rows:
            nid = nozzle_id_map.get(r["nozzle_label"])
            if not nid:
                continue
            fuel_type = nozzle_fuel_map[nid]

            eo, ec = r["elec_open"], r["elec_close"]
            mo, mc = r["mech_open"], r["mech_close"]

            # Use Excel figures verbatim
            vol_sold      = r["vol_sold"]       # exactly as on the sheet
            revenue       = r["expected_cash"]  # exactly as on the sheet

            mech_vol  = round(mc - mo, 4)
            dev_L     = round(abs(vol_sold - mech_vol), 4)
            dev_pct   = round(dev_L / vol_sold * 100, 4) if vol_sold > 0 else 0.0

            nozzle_summaries.append({
                "nozzle_id":               nid,
                "fuel_type":               fuel_type,
                "opening_reading":         eo,
                "closing_reading":         ec,
                "volume_sold":             vol_sold,
                "mechanical_opening":      mo,
                "mechanical_closing":      mc,
                "mechanical_volume":       mech_vol,
                "price_per_liter":         None,   # not available per-row from spreadsheet
                "revenue":                 revenue,
                "meter_deviation_liters":  dev_L,
                "meter_deviation_percent": dev_pct,
                "meter_deviation_flagged": False,
                "pre_change_price":        None,
                "post_change_price":       None,
                "pre_change_volume":       None,
                "post_change_volume":      None,
                "changeover_reading":      None,
                "changeover_estimated":    None,
                "pre_change_revenue":      None,
                "post_change_revenue":     None,
            })

        # Handover-level revenue = sum of per-nozzle cash, straight from Excel
        fuel_revenue    = round(sum(s["revenue"] for s in nozzle_summaries), 4)
        existing_ho_id  = ho_index.get((date, shift, staff_id))
        ho_id           = existing_ho_id or f"HO-{date}-{shift}-{staff_id}-000000"

        handover = {
            "handover_id":           ho_id,
            "date":                  date,
            "shift_id":              shift_id,
            "shift_type":            shift,
            "attendant_id":          staff_id,
            "attendant_name":        full_name,
            "phase":                 "completed",
            "status":                "submitted",
            "review_status":         "approved",
            "nozzle_summaries":      nozzle_summaries,
            "fuel_revenue":          fuel_revenue,
            "expected_cash":         fuel_revenue,
            "actual_cash":           0.0,
            "difference":            0.0,
            "pos_receipts":          0.0,
            "lpg_sales":             0.0,
            "credit_sales":          0.0,
            "accessory_sales":       0.0,
            "lubricant_sales":       0.0,
            "total_expected":        fuel_revenue,
            "total_accounted":       0.0,
            "notes":                 IMPORT_NOTE,
            "created_at":            now_iso,
            "stock_applied":         False,
            "auto_flag_reasons":     None,
            "stale_notified":        False,
            "supervisor_review": {
                "action":           "approve",
                "note":             "Bulk import approved",
                "reviewed_by":      "STF001",
                "reviewed_by_name": "Ian Nkunika",
                "reviewed_at":      now_iso,
            },
            "credit_sale_details":   None,
            "phase_1_completed_at":  now_iso,
            "phase_2_completed_at":  None,
            "stock_snapshot":        None,
        }
        new_handovers[ho_id] = handover

        # Build missing shifts
        if shift_id not in shifts_db and shift_id not in shifts_to_create:
            shifts_to_create[shift_id] = {
                "shift_id":         shift_id,
                "date":             date,
                "shift_type":       shift,
                "status":           "completed",
                "attendants":       [],
                "assignments":      [],
                "created_at":       now_iso,
                "created_by":       "STF001",
                "start_time":       None,
                "end_time":         None,
                "auto_closed":      False,
                "auto_closed_at":   None,
                "auto_close_reason": None,
                "completed_at":     now_iso,
                "tank_dip_readings": [],
            }
        if shift_id in shifts_to_create:
            s    = shifts_to_create[shift_id]
            nids = [nozzle_id_map[r["nozzle_label"]]
                    for r in rows if r["nozzle_label"] in nozzle_id_map]
            isl_ids = sorted(set(nozzle_isl_map[nid] for nid in nids))
            if full_name not in s["attendants"]:
                s["attendants"].append(full_name)
            s["assignments"].append({
                "attendant_id":          staff_id,
                "attendant_name":        full_name,
                "nozzle_ids":            nids,
                "island_ids":            isl_ids,
                "assigned_lpg":          False,
                "assigned_lubricants":   False,
                "assigned_accessories":  False,
            })

    return new_handovers, shifts_to_create, unmapped, ho_index


# ---------------------------------------------------------------------------
# Step 4: Print preview
# ---------------------------------------------------------------------------
def print_preview(new_handovers, shifts_to_create, unmapped, ho_index):
    print("=" * 72)
    print("IMPORT PREVIEW  (vol_sold and revenue taken verbatim from Excel)")
    print("=" * 72)
    for ho_id, ho in sorted(new_handovers.items()):
        action = "OVERWRITE" if ho_id in ho_index.values() else "CREATE"
        ns     = ho["nozzle_summaries"]
        print(f"\n  [{action}] {ho_id}")
        print(f"           total_revenue={ho['fuel_revenue']}")
        for s in ns:
            print(f"           {s['nozzle_id']}({s['fuel_type'][0]}): "
                  f"{s['opening_reading']} -> {s['closing_reading']}  "
                  f"sold={s['volume_sold']}  cash={s['revenue']}")

    print(f"\nShifts to create: {list(shifts_to_create.keys())}")
    if unmapped:
        print(f"WARNING — still unmapped names: {set(unmapped)}")
    print(f"\nTotal handovers to write: {len(new_handovers)}")


# ---------------------------------------------------------------------------
# Step 5: Write to DB (only when --write is passed)
# ---------------------------------------------------------------------------
def write_to_db(new_handovers, shifts_to_create, storage, handovers):
    handovers.update(new_handovers)
    storage["shifts"].update(shifts_to_create)

    with psycopg.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE station_files "
                "SET data = %s::jsonb, updated_at = NOW() "
                "WHERE station_id = 'ST001' AND filename = 'attendant_handovers.json'",
                (json.dumps(handovers),)
            )
            cur.execute(
                "UPDATE station_storage "
                "SET data = %s::jsonb, updated_at = NOW() "
                "WHERE station_id = 'ST001'",
                (json.dumps(storage),)
            )
        conn.commit()
    print(f"Written: {len(new_handovers)} handovers, "
          f"{len(shifts_to_create)} new shifts.")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    dry_run = "--write" not in sys.argv

    xl_rows = load_excel(EXCEL_PATH)
    apply_corrections(xl_rows)

    with psycopg.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT data FROM station_storage WHERE station_id='ST001'")
            storage = cur.fetchone()[0]
            cur.execute(
                "SELECT data FROM station_files "
                "WHERE station_id='ST001' AND filename='attendant_handovers.json'"
            )
            handovers = cur.fetchone()[0]
            cur.execute(
                "SELECT user_id, full_name, username FROM users WHERE station_id='ST001'"
            )
            db_users = cur.fetchall()

    new_handovers, shifts_to_create, unmapped, ho_index = build_import(
        xl_rows, storage, handovers, db_users
    )
    print_preview(new_handovers, shifts_to_create, unmapped, ho_index)

    if dry_run:
        print("\n[DRY RUN] Pass --write to commit to the database.")
    else:
        write_to_db(new_handovers, shifts_to_create, storage, handovers)
        print("[DONE]")
