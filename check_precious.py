# -*- coding: utf-8 -*-
"""Check Precious Bwalya's handover records for 2026-06-06 Day."""
import psycopg, json, sys

DATABASE_URL = (
    "postgresql://neondb_owner:npg_oeZLy1qKk2Aj@ep-lively-sky-anjdm2jr-pooler"
    ".c-6.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
)

with psycopg.connect(DATABASE_URL) as conn:
    with conn.cursor() as cur:
        cur.execute("SELECT data FROM station_files WHERE station_id='ST001' AND filename='attendant_handovers.json'")
        handovers = cur.fetchone()[0]

hits = [(hid, h) for hid, h in handovers.items()
        if "precious" in (h.get("attendant_name") or "").lower()]

if not hits:
    print("No handovers found for Precious.")
    sys.exit(0)

for hid, h in sorted(hits, key=lambda x: x[1].get("date","")):
    print(f"\n{'='*60}")
    print(f"ID:     {hid}")
    print(f"Date:   {h.get('date')}  Shift: {h.get('shift_type')}")
    print(f"Phase:  {h.get('phase')}  Status: {h.get('status')}  Review: {h.get('review_status')}")
    print(f"Revenue:{h.get('fuel_revenue')}  Notes: {(h.get('notes') or '')[:80]}")
    ns = h.get("nozzle_summaries", [])
    if ns:
        print(f"\n  {'Nozzle':<10} {'ElecOpen':>12} {'ElecClose':>12} {'VolSold':>10} {'Revenue':>12}")
        print(f"  {'-'*60}")
        for s in ns:
            print(f"  {s.get('nozzle_id',''):<10} "
                  f"{s.get('opening_reading',0):>12.3f} "
                  f"{s.get('closing_reading',0):>12.3f} "
                  f"{s.get('volume_sold',0):>10.3f} "
                  f"{s.get('revenue',0):>12.4f}")
    else:
        print("  (no nozzle summaries)")
