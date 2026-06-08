#!/usr/bin/env python3
"""
One-time fixture enrichment for the readings-alignment work. Builds a
deterministic scenario that exercises the parts the simpler fixture missed:

  * THREE tanks with readings, including BOTH diesel tanks (TANK-DIESEL 30,000 L
    and TANK-DIESEL-2 14,000 L) - so the fuel-type pooling bug is exercised.
  * TANK-DIESEL-2 gets its own calibration chart (distinct from TANK-DIESEL).
  * TWO consecutive shifts on one date (Day then Night) - so closing->opening
    carry-forward is real and per-tank.

It boots the app in file mode against an isolated temp store seeded from the
current fixture (minus any prior tank_readings), POSTs the scenario through the
real /tank-readings/readings endpoint, then merges the computed tank_readings.json
and the TANK-DIESEL-2 calibration into fixture_ST001.json.

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

# A distinct calibration chart for the 14,000 L diesel tank (linear-ish, 0..200cm).
DIESEL2_CHART = {round(d, 1): round(d / 200.0 * 14000.0, 2) for d in range(0, 201, 10)}

# Ensure the fixture's tank_calibrations.json has a TANK-DIESEL-2 chart (so the
# tank is "calibrated" - required once force-upload lands).
files = FX.setdefault("station_files", {})
cal = files.setdefault("tank_calibrations.json", {})
cal["TANK-DIESEL-2"] = {
    "tank_id": "TANK-DIESEL-2",
    "chart": {str(k): v for k, v in DIESEL2_CHART.items()},
    "point_count": len(DIESEL2_CHART),
    "uploaded_at": "2026-06-08T00:00:00",
    "uploaded_by": "fixture",
}

# Seed temp station_files from the fixture, but start tank_readings fresh.
_st_dir = os.path.join(_tmp, "stations", STATION)
os.makedirs(_st_dir, exist_ok=True)
for _fn, _data in files.items():
    payload = {} if _fn == "tank_readings.json" else _data
    with open(os.path.join(_st_dir, _fn), "w", encoding="utf-8") as f:
        json.dump(payload, f)

import app.database.storage as storage_mod
storage_mod.STATIONS_STORAGE[STATION] = FX["station_storage"]
storage_mod.STORAGE = FX["station_storage"]
from app.database.stations_registry import STATIONS
STATIONS[STATION] = FX.get("station") or {"station_id": STATION, "name": "Fixture", "status": "active"}

# Register the TANK-DIESEL-2 calibration so dip_to_volume works for it during POSTs.
from app.services.dip_conversion import register_tank_calibration
register_tank_calibration("TANK-DIESEL-2", DIESEL2_CHART, capacity=14000)

from fastapi.testclient import TestClient
from app.main import app
client = TestClient(app)
r = client.post(f"{PREFIX}/auth/login", json={"username": "owner1", "password": "owner123"})
assert r.status_code == 200, r.text
H = {"Authorization": f"Bearer {r.json()['access_token']}", "X-Station-Id": STATION}

shifts = FX["station_storage"].get("shifts", {})
dates = sorted({s.get("date") for s in shifts.values() if s.get("date")})
D0 = dates[0] if dates else "2026-04-11"


def nz(nid, eo, mo, mov=500):
    return {
        "nozzle_id": nid, "attendant": "Katongo",
        "electronic_opening": eo, "electronic_closing": eo + mov, "electronic_movement": mov,
        "mechanical_opening": mo, "mechanical_closing": mo + mov + 5, "mechanical_movement": mov + 5,
    }


# (tank, shift_type, open_dip, close_dip, price, [nozzles]) - one date, Day then
# Night, all three tanks. Night opening dip = Day closing dip (carry-forward).
PLAN = [
    ("TANK-PETROL",   "Day",   150.0, 120.0, 30.0, [nz("ISL1-A", 1200.0, 1200.0)]),
    ("TANK-DIESEL",   "Day",   120.0,  95.0, 28.5, [nz("ISL2-A", 2940155.092, 2945755.0)]),
    ("TANK-DIESEL-2", "Day",   100.0,  80.0, 28.5, [nz("ISL1-B", 2100.0, 2100.0)]),
    ("TANK-PETROL",   "Night", 120.0,  95.0, 30.0, [nz("ISL1-A", 1700.0, 1705.0)]),
    ("TANK-DIESEL",   "Night",  95.0,  72.0, 28.5, [nz("ISL2-A", 2940655.092, 2946260.0)]),
    ("TANK-DIESEL-2", "Night",  80.0,  60.0, 28.5, [nz("ISL1-B", 2600.0, 2605.0)]),
]

for tank, shift_type, od, cd, price, nzs in PLAN:
    payload = {
        "tank_id": tank, "date": D0, "shift_type": shift_type,
        "opening_dip_cm": od, "closing_dip_cm": cd, "after_delivery_dip_cm": None,
        "opening_volume": None, "closing_volume": None,
        "nozzle_readings": nzs, "deliveries": [],
        "delivery_occurred": False,
        "price_per_liter": price, "actual_cash_banked": None,
        "customer_allocations": [], "recorded_by": "O001", "notes": "golden fixture seed",
    }
    resp = client.post(f"{PREFIX}/tank-readings/readings", headers=H, json=payload)
    print(f"POST {tank:14s} {shift_type:5s}: {resp.status_code}", "" if resp.status_code == 200 else resp.text[:300])

tr_path = os.path.join(_st_dir, "tank_readings.json")
if not os.path.exists(tr_path):
    print("ERROR: no tank_readings.json produced - check POST errors above")
    sys.exit(1)
with open(tr_path, encoding="utf-8") as f:
    tank_readings = json.load(f)
print(f"captured tank_readings.json: {len(tank_readings)} records")

FX["station_files"]["tank_readings.json"] = tank_readings
with open(FIXTURE, "w", encoding="utf-8") as f:
    json.dump(FX, f, indent=2, default=str)
print(f"fixture updated: {FIXTURE}")
