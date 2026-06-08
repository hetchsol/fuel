#!/usr/bin/env python3
"""
One-time fixture enrichment: add a deterministic `tank_readings.json` to
fixture_ST001.json so the tank-readings plane (three-way daily-summary,
tank-movement, anomaly /discrepancies, tank-readings export) is exercised by the
golden net. See the coverage gap note in README.md.

It boots the app in file mode against an isolated temp store seeded from the
current fixture, POSTs a few deterministic daily tank readings through the real
`/tank-readings/readings` endpoint (so the records carry the genuine computed
shape - movement, variances, embedded 3-way recon), reads back the resulting
tank_readings.json, and merges it into fixture_ST001.json.

Run once:  python tests/golden/enrich_fixture.py
Then re-baseline:  python tests/golden/snapshot_reports.py --update
"""
import os
import sys
import json
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.abspath(os.path.join(HERE, "..", ".."))
FIXTURE = os.path.join(HERE, "fixture_ST001.json")
STATION = "ST001"
PREFIX = "/api/v1"

os.environ.pop("DATABASE_URL", None)
os.environ["SEED_DEFAULT_USERS"] = "true"
os.environ["TESTING"] = "1"
sys.path.insert(0, BACKEND)

_tmp = tempfile.mkdtemp(prefix="enrich_store_")
import app.database.station_files as sf
sf.STORAGE_ROOT = _tmp

with open(FIXTURE, encoding="utf-8") as f:
    FX = json.load(f)

_st_dir = os.path.join(_tmp, "stations", STATION)
os.makedirs(_st_dir, exist_ok=True)
for _fn, _data in (FX.get("station_files") or {}).items():
    with open(os.path.join(_st_dir, _fn), "w", encoding="utf-8") as f:
        json.dump(_data, f)

import app.database.storage as storage_mod
storage_mod.STATIONS_STORAGE[STATION] = FX["station_storage"]
storage_mod.STORAGE = FX["station_storage"]
from app.database.stations_registry import STATIONS
STATIONS[STATION] = FX.get("station") or {"station_id": STATION, "name": "Fixture", "status": "active"}

from fastapi.testclient import TestClient
from app.main import app
client = TestClient(app)
r = client.post(f"{PREFIX}/auth/login", json={"username": "owner1", "password": "owner123"})
assert r.status_code == 200, r.text
H = {"Authorization": f"Bearer {r.json()['access_token']}", "X-Station-Id": STATION}

# Two dates derived from the fixture's shifts (deterministic).
shifts = FX["station_storage"].get("shifts", {})
dates = sorted({s.get("date") for s in shifts.values() if s.get("date")})
D0 = dates[0] if dates else "2026-04-10"
D1 = dates[-1] if dates and len(dates) > 1 else "2026-04-11"


def nozzles(*items):
    """Build NozzleReadingDetail rows: (nozzle_id, elec_open, mech_open) -> +500 movement."""
    out = []
    for nid, eo, mo in items:
        out.append({
            "nozzle_id": nid, "attendant": "Katongo",
            "electronic_opening": eo, "electronic_closing": eo + 500, "electronic_movement": 500,
            "mechanical_opening": mo, "mechanical_closing": mo + 505, "mechanical_movement": 505,
        })
    return out


# Deterministic readings: petrol + diesel, two dates each. Dips chosen within the
# calibrated range of each tank's chart.
PLAN = [
    # tank, date, opening_dip, closing_dip, price, nozzle rows
    ("TANK-PETROL", D0, 150.0, 120.0, 30.0, nozzles(("ISL1-A", 1200.0, 1200.0), ("ISL4-A", 117740.87, 1579867.0))),
    ("TANK-PETROL", D1, 120.0, 95.0, 30.0, nozzles(("ISL1-A", 1700.0, 1705.0), ("ISL4-A", 118240.87, 1580372.0))),
    ("TANK-DIESEL", D0, 120.0, 95.0, 28.5, nozzles(("ISL2-A", 2940155.092, 2945755.0), ("ISL3-A", 2867850.227, 2873450.0))),
    ("TANK-DIESEL", D1, 95.0, 72.0, 28.5, nozzles(("ISL2-A", 2940655.092, 2946260.0), ("ISL3-A", 2868350.227, 2873955.0))),
]

for tank, date, od, cd, price, nz in PLAN:
    payload = {
        "tank_id": tank, "date": date, "shift_type": "Day",
        "opening_dip_cm": od, "closing_dip_cm": cd, "after_delivery_dip_cm": None,
        "opening_volume": None, "closing_volume": None,
        "nozzle_readings": nz, "deliveries": [],
        "delivery_occurred": False,
        "price_per_liter": price, "actual_cash_banked": None,
        "customer_allocations": [], "recorded_by": "O001", "notes": "golden fixture seed",
    }
    resp = client.post(f"{PREFIX}/tank-readings/readings", headers=H, json=payload)
    print(f"POST {tank} {date}: {resp.status_code}", "" if resp.status_code == 200 else resp.text[:300])

# Read back the computed tank_readings.json (and deliveries) from the temp store.
tr_path = os.path.join(_st_dir, "tank_readings.json")
if not os.path.exists(tr_path):
    print("ERROR: no tank_readings.json produced - check POST errors above")
    sys.exit(1)
with open(tr_path, encoding="utf-8") as f:
    tank_readings = json.load(f)
n = len(tank_readings) if isinstance(tank_readings, (list, dict)) else 0
print(f"captured tank_readings.json: {n} records")

# Merge into the fixture and save.
FX.setdefault("station_files", {})["tank_readings.json"] = tank_readings
with open(FIXTURE, "w", encoding="utf-8") as f:
    json.dump(FX, f, indent=2, default=str)
print(f"fixture updated: {FIXTURE}")
