"""
One-off migration: copy any tank dip data still sitting in Shift.tank_dip_readings
(the dead "System 1") into tank_readings.json (the real, actually-used "System 2"),
before System 1 is removed from the codebase. See:
  C:\\Users\\Purchase Requisition\\.claude\\plans\\snoopy-pondering-sun.md

Only ever ADDS a System-2 record where none already exists for that
tank_id/date/shift_type — never overwrites real data. Anything skipped because a
System-2 record already exists is logged for manual review, not silently dropped.

Requires an OWNER-level login (only owner accounts can switch station context via
X-Station-Id; this script needs to scan every station).

Usage:
    export MIGRATE_OWNER_USER=<owner username>
    export MIGRATE_OWNER_PASS=<owner password>
    python migrate_shift_dips_to_tank_readings.py                # dry run (default)
    python migrate_shift_dips_to_tank_readings.py --apply         # actually write
"""
import os
import sys
import argparse

import requests

API_BASE = os.environ.get("MIGRATE_API_BASE", "https://fuel-api-wpdj.onrender.com")


class ApiClient:
    def __init__(self, base_url):
        self.base_url = base_url.rstrip("/")
        self.session = requests.Session()

    def login(self, username, password):
        r = self.session.post(f"{self.base_url}/api/v1/auth/login",
                               json={"username": username, "password": password}, timeout=30)
        r.raise_for_status()
        token = r.json()["access_token"]
        self.session.headers.update({"Authorization": f"Bearer {token}"})

    def get(self, path, station_id=None, **kw):
        headers = {"X-Station-Id": station_id} if station_id else {}
        r = self.session.get(f"{self.base_url}{path}", headers=headers, timeout=30, **kw)
        r.raise_for_status()
        return r.json()

    def post(self, path, station_id=None, params=None):
        headers = {"X-Station-Id": station_id} if station_id else {}
        r = self.session.post(f"{self.base_url}{path}", headers=headers, params=params, timeout=30)
        if not r.ok:
            raise RuntimeError(f"POST {path} ({station_id}) -> {r.status_code}: {r.text}")
        return r.json()


def find_orphaned_dips(client, station_id):
    """Return [(shift, dip_entry), ...] for every Shift.tank_dip_readings entry
    in this station that has no corresponding System-2 record yet."""
    shifts = client.get("/api/v1/shifts/", station_id=station_id)
    orphaned = []
    for shift in shifts:
        dips = shift.get("tank_dip_readings") or []
        if not dips:
            continue
        date = shift.get("date")
        shift_type = shift.get("shift_type")
        existing = client.get(f"/api/v1/tank-readings/dips?date={date}&shift_type={shift_type}",
                               station_id=station_id)
        existing_tank_ids = {r.get("tank_id") for r in existing if r.get("opening_dip_cm") is not None
                              or r.get("closing_dip_cm") is not None}
        for dip in dips:
            tank_id = dip.get("tank_id")
            if tank_id in existing_tank_ids:
                print(f"  [{station_id}] SKIP {shift['shift_id']} / {tank_id}: "
                      f"System-2 record already exists for this tank/date/shift — leaving it untouched.")
                continue
            orphaned.append((shift, dip))
    return orphaned


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="Actually write data (default is dry-run)")
    args = parser.parse_args()

    username = os.environ.get("MIGRATE_OWNER_USER")
    password = os.environ.get("MIGRATE_OWNER_PASS")
    if not username or not password:
        print("Set MIGRATE_OWNER_USER and MIGRATE_OWNER_PASS environment variables first.")
        sys.exit(1)

    client = ApiClient(API_BASE)
    client.login(username, password)

    stations = client.get("/api/v1/stations/?include_disabled=true")
    print(f"Scanning {len(stations)} station(s) for orphaned Shift.tank_dip_readings...")

    all_orphaned = []
    for station in stations:
        station_id = station["station_id"]
        orphaned = find_orphaned_dips(client, station_id)
        for shift, dip in orphaned:
            all_orphaned.append((station_id, shift, dip))
            print(f"  [{station_id}] {shift['shift_id']} / {dip['tank_id']}: "
                  f"opening={dip.get('opening_dip_cm')} closing={dip.get('closing_dip_cm')} "
                  f"recorded_by={dip.get('recorded_by')} -> needs migrating")

    if not all_orphaned:
        print("\nNothing to migrate — every Shift.tank_dip_readings entry already has a matching System-2 record.")
        return

    print(f"\n{len(all_orphaned)} dip record(s) need migrating.")
    if not args.apply:
        print("Dry run complete. Re-run with --apply to write these into tank_readings.json.")
        return

    for station_id, shift, dip in all_orphaned:
        client.post("/api/v1/tank-readings/dips", station_id=station_id, params={
            "tank_id": dip["tank_id"],
            "date": shift["date"],
            "shift_type": shift["shift_type"],
            "recorded_by": dip.get("recorded_by") or "migration-script",
            "opening_dip_cm": dip.get("opening_dip_cm"),
            "closing_dip_cm": dip.get("closing_dip_cm"),
        })
        print(f"  [{station_id}] migrated {shift['shift_id']} / {dip['tank_id']}")

    print("\nDone.")


if __name__ == "__main__":
    main()
