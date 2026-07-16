# -*- coding: utf-8 -*-
"""
Force-close specific stale pre-go-live handovers.

Targets:
  2026-06-05 Night  Christabel Namonje
  2026-06-05 Night  Ruth Nkhoma
  2026-06-05 Night  Peter Mukuka
  2026-06-05 Day    Sharon Mulemwa
  2026-06-06 Day    Precious Bwalya

Usage:
    python close_old_shifts.py          # dry run
    python close_old_shifts.py --write  # commit to DB
"""

import psycopg
import json
import sys
from datetime import datetime

DATABASE_URL = (
    "postgresql://neondb_owner:npg_oeZLy1qKk2Aj@ep-lively-sky-anjdm2jr-pooler"
    ".c-6.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
)

# (date, shift_type, partial name match)
TARGETS = [
    ("2026-06-05", "Night", "christabel"),
    ("2026-06-05", "Night", "ruth"),
    ("2026-06-05", "Night", "peter"),
    ("2026-06-05", "Day",   "sharon"),
    ("2026-06-06", "Day",   "precious"),
]

NOW = datetime.now().isoformat()
NOTE = "Pre-go-live shift. Closed retroactively — go-live date 2026-06-06."
dry_run = "--write" not in sys.argv

with psycopg.connect(DATABASE_URL) as conn:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT data FROM station_files "
            "WHERE station_id='ST001' AND filename='attendant_handovers.json'"
        )
        handovers = cur.fetchone()[0]

matched = []
for ho_id, ho in handovers.items():
    date      = ho.get("date", "")
    stype     = ho.get("shift_type", "")
    name      = (ho.get("attendant_name") or "").lower()
    phase     = ho.get("phase", "")
    rev_status = ho.get("review_status", "")

    # Already closed — skip
    if phase == "completed" and rev_status == "approved":
        continue

    for t_date, t_shift, t_name in TARGETS:
        if date == t_date and stype == t_shift and t_name in name:
            matched.append((ho_id, ho, t_name))
            break

if not matched:
    print("No matching open handovers found.")
    sys.exit(0)

print(f"{'Handover ID':<45} {'Date':<12} {'Shift':<8} {'Attendant':<25} {'Phase'}")
print("-" * 100)
for ho_id, ho, _ in matched:
    print(f"{ho_id:<45} {ho.get('date',''):<12} {ho.get('shift_type',''):<8} "
          f"{ho.get('attendant_name',''):<25} {ho.get('phase','')}")

print(f"\nTotal: {len(matched)} handover(s) will be force-closed.")

# Check for targets not matched
found_names = {t for _, _, t in matched}
missing = [t for _, _, t in TARGETS if t not in found_names]
if missing:
    print(f"WARNING — no handover found for: {missing}")

if dry_run:
    print("\n[DRY RUN] Pass --write to commit.")
    sys.exit(0)

for ho_id, ho, _ in matched:
    ho["phase"]           = "completed"
    ho["status"]          = "submitted"
    ho["review_status"]   = "approved"
    ho["notes"]           = NOTE
    ho["supervisor_review"] = {
        "action":           "approve",
        "note":             NOTE,
        "reviewed_by":      "system",
        "reviewed_by_name": "System (retroactive close)",
        "reviewed_at":      NOW,
    }
    if not ho.get("phase_2_completed_at"):
        ho["phase_2_completed_at"] = NOW

with psycopg.connect(DATABASE_URL) as conn:
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE station_files SET data = %s::jsonb, updated_at = NOW() "
            "WHERE station_id='ST001' AND filename='attendant_handovers.json'",
            (json.dumps(handovers),)
        )
    conn.commit()

print(f"\nClosed {len(matched)} handover(s). [DONE]")
