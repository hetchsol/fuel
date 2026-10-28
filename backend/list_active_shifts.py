#!/usr/bin/env python3
"""
Read-only diagnostic: list every shift still marked "active" at each station,
who is assigned to it, and where each attendant's handover stands, so a shift
left open (and showing up instead of the current one) can be found and closed.

Flags:
  - OLDER THAN CURRENT: an active shift that is before the shift running now
    (Zambia time). These are the ones to finish off and close.
  - attendants assigned to more than one active shift at the same station.
  - per shift, which attendants are still blocking it from completing.

Does not change anything: it logs in, then sends GET requests only, to
endpoints that only read (/stations/, /shifts/, /handover/entries). It never
calls /shifts/current/active, which creates a shift record when none exists.

Usage:
    python list_active_shifts.py                  # every station you can see
    python list_active_shifts.py --station ST001  # one station

Uses only the Python standard library — no pip install needed.
"""
import argparse
import getpass
import json
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

BASE_URL = "https://fuel-api-wpdj.onrender.com/api/v1"

SHIFT_TYPE_ORDER = {"Day": 0, "Night": 1}
RESOLVED = ("approved", "voided")
CAT = timezone(timedelta(hours=2))  # Zambia, no daylight saving


def _request(method, path, token=None, station=None, timeout=60):
    url = f"{BASE_URL}{path}"
    req = urllib.request.Request(url, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    if station:
        req.add_header("X-Station-Id", station)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, {"detail": raw}


def _login():
    username = input("Username: ").strip()
    password = getpass.getpass("Password: ")
    print("Logging in...", flush=True)
    req = urllib.request.Request(
        f"{BASE_URL}/auth/login", method="POST",
        data=json.dumps({"username": username, "password": password}).encode(),
    )
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            status, data = resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        print(f"Login failed: {e.read().decode()}")
        sys.exit(1)
    if status != 200:
        print(f"Login failed: {data.get('detail', data)}")
        sys.exit(1)
    user = data.get("user", {})
    print(f"Logged in as {user.get('username')} ({user.get('role')})\n")
    return data["access_token"], user


def _current_shift():
    """The shift running now in Zambia: Night after midnight belongs to yesterday."""
    now = datetime.now(CAT)
    shift_type = "Day" if 6 <= now.hour < 18 else "Night"
    shift_date = now - timedelta(days=1) if now.hour < 6 else now
    return shift_date.strftime("%Y-%m-%d"), shift_type


def _recency(shift):
    return (shift.get("date") or "", SHIFT_TYPE_ORDER.get(shift.get("shift_type"), -1))


def _report_station(station_id, name, token, current_key):
    title = f"{name} ({station_id})" if name else station_id
    print("=" * 72)
    print(f"Station: {title}")
    print("=" * 72)

    status, shifts = _request("GET", "/shifts/", token=token, station=station_id)
    if status != 200:
        print(f"  Could not read shifts: {shifts.get('detail', shifts)}\n")
        return
    active = sorted((s for s in shifts if s.get("status") == "active"), key=_recency, reverse=True)
    if not active:
        print("  No active shifts.\n")
        return

    status, handovers = _request("GET", "/handover/entries", token=token, station=station_id)
    if status != 200:
        print(f"  Could not read handovers: {handovers.get('detail', handovers)}")
        handovers = []

    print(f"  {len(active)} active shift(s), newest first:\n")
    per_attendant = {}
    for s in active:
        sid = s.get("shift_id")
        flag = ""
        if _recency(s) < current_key:
            flag = "   <-- OLDER THAN CURRENT, still open"
        elif _recency(s) == current_key:
            flag = "   (current shift)"
        print(f"  {sid}  [{s.get('shift_type')}, {s.get('date')}]{flag}")

        assignments = s.get("assignments") or []
        if not assignments:
            print("      No attendants assigned.")
        shift_handovers = [h for h in handovers if h.get("shift_id") == sid]
        blocking = []
        for a in assignments:
            aid, aname = a.get("attendant_id"), a.get("attendant_name") or a.get("attendant_id")
            per_attendant.setdefault(aname, []).append(sid)
            mine = [h for h in shift_handovers if h.get("attendant_id") == aid]
            if not mine:
                state = "no handover yet"
                blocking.append(aname)
            else:
                states = sorted({str(h.get("review_status")) for h in mine})
                state = "handover " + ", ".join(states)
                if not any(h.get("review_status") in RESOLVED for h in mine):
                    blocking.append(aname)
            print(f"      {aname}: {state}")
        if blocking:
            print(f"      Holding this shift open: {', '.join(blocking)}")
        elif assignments:
            print("      Every assigned attendant is approved or voided, yet the shift is still active.")
        print()

    multi = {n: ids for n, ids in per_attendant.items() if len(ids) > 1}
    if multi:
        print("  Attendants on more than one active shift:")
        for n, ids in multi.items():
            print(f"      {n}: {', '.join(ids)}")
        print()


def main():
    parser = argparse.ArgumentParser(description="List active shifts per station (read-only).")
    parser.add_argument("--station", help="Only this station ID (default: every station you can see)")
    args = parser.parse_args()

    token, user = _login()
    cur_date, cur_type = _current_shift()
    current_key = (cur_date, SHIFT_TYPE_ORDER[cur_type])
    print(f"Shift running now (Zambia time): {cur_type}, {cur_date}\n")

    if args.station:
        stations = [{"station_id": args.station, "name": ""}]
    else:
        status, stations = _request("GET", "/stations/", token=token)
        if status != 200 or not isinstance(stations, list) or not stations:
            own = user.get("station_id")
            if not own:
                print("Could not list stations; run again with --station <ID>.")
                sys.exit(1)
            stations = [{"station_id": own, "name": ""}]

    for st in stations:
        _report_station(st.get("station_id"), st.get("name"), token, current_key)


if __name__ == "__main__":
    main()
