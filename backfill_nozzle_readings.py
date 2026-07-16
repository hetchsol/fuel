# -*- coding: utf-8 -*-
"""
Backfill nozzle readings in station_storage from the most recent
approved handover per nozzle in attendant_handovers.json.

This fixes the stale nozzle state caused by save_station_storage not
being called after _update_nozzle_state, so carry-forward autofill
gives attendants correct opening readings from the last real submission.

Usage:
    python backfill_nozzle_readings.py          # dry run
    python backfill_nozzle_readings.py --write  # commit
"""

import psycopg, json, sys

DB = (
    "postgresql://neondb_owner:npg_oeZLy1qKk2Aj@ep-lively-sky-anjdm2jr-pooler"
    ".c-6.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
)

dry_run = "--write" not in sys.argv

with psycopg.connect(DB) as conn:
    with conn.cursor() as cur:
        cur.execute("SELECT data FROM station_files WHERE station_id='ST001' AND filename='attendant_handovers.json'")
        handovers = cur.fetchone()[0]
        cur.execute("SELECT data FROM station_storage WHERE station_id='ST001'")
        storage = cur.fetchone()[0]

# Find most-recent closing per nozzle across all submitted handovers
best = {}  # nozzle_id -> {sort_key, date, shift_type, elec, mech, attendant}
for hid, h in handovers.items():
    if not isinstance(h, dict):
        continue
    date = h.get('date', '')
    shift_type = h.get('shift_type', '')
    sort_key = (date, 'A' if shift_type == 'Day' else 'B')
    for ns in h.get('nozzle_summaries', []):
        nid = ns.get('nozzle_id')
        if not nid or ns.get('closing_reading') is None:
            continue
        prev = best.get(nid)
        if prev is None or sort_key > prev['sort_key']:
            best[nid] = {
                'sort_key': sort_key,
                'date': date,
                'shift_type': shift_type,
                'elec': ns.get('closing_reading'),
                'mech': ns.get('mechanical_closing'),
                'attendant': h.get('attendant_name'),
            }

print("=" * 70)
print("NOZZLE READING BACKFILL")
print("=" * 70)
print()

# Update nozzle objects in station_storage
updated = 0
for isl_id, island in storage.get('islands', {}).items():
    ps = island.get('pump_station', {})
    for nozzle in ps.get('nozzles', []):
        nid = nozzle.get('nozzle_id')
        if nid not in best:
            print(f"  {nid}: no handover data found — skipping")
            continue
        b = best[nid]
        old_elec = nozzle.get('electronic_reading')
        old_mech = nozzle.get('mechanical_reading')
        new_elec = b['elec']
        new_mech = b['mech']
        print(f"  {nid}:")
        print(f"    electronic: {old_elec} -> {new_elec}  (from {b['date']} {b['shift_type']} | {b['attendant']})")
        print(f"    mechanical: {old_mech} -> {new_mech}")
        if not dry_run:
            nozzle['electronic_reading'] = new_elec
            nozzle['mechanical_reading'] = new_mech
        updated += 1

print()
if dry_run:
    print(f"[DRY RUN] Would update {updated} nozzles. Pass --write to commit.")
else:
    with psycopg.connect(DB) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE station_storage SET data = %s::jsonb, updated_at = NOW() WHERE station_id='ST001'",
                (json.dumps(storage),)
            )
        conn.commit()
    print(f"[DONE] Updated {updated} nozzles in station_storage.")
    print("The Jun 13 Night shift will now show correct opening readings when attendants start.")
    print("As each subsequent handover is submitted, carry-forward will persist automatically.")
