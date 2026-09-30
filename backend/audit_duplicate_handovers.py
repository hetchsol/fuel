#!/usr/bin/env python3
"""
Phase 5 (backfill) of the duplicate-handover remediation: find every
(shift_id, attendant_id) pair with more than one non-voided handover -
the historical backlog that predates the write-time guard added to
submit_readings/submit_handover/manager_retro_entry (see
resolve_resubmission in app/services/handover_lookup.py).

For each such group:
  - "unambiguous": exactly one non-voided handover is approved, the rest
    are not. Proposes keeping the approved one and marking the rest
    superseded via POST /handover/backfill-supersede.
  - "ambiguous": anything else (no approved handover in the group, or more
    than one) - never auto-resolved. Printed for manual review only.

Always downloads a full station backup (GET /backup/download) before
--apply does anything, saved locally next to this script.

Read-only by default (dry run). Nothing is written to attendant_handovers.json
until --apply is passed, and even then only for groups classified
unambiguous - ambiguous groups are always left for a human.

Usage:
    python audit_duplicate_handovers.py                      # dry run, all stations you can see
    python audit_duplicate_handovers.py --station ST001       # dry run, one station
    python audit_duplicate_handovers.py --station ST001 --apply   # backfill after confirmation

Uses only the Python standard library - no pip install needed.
"""
import argparse
import getpass
import gzip
import json
import sys
import urllib.error
import urllib.request
from datetime import datetime

BASE_URL = "https://fuel-api-wpdj.onrender.com/api/v1"
RESOLVED_STATUSES = ("approved", "voided")


def _request(method, path, token=None, station=None, body=None, timeout=120):
    url = f"{BASE_URL}{path}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    if station:
        req.add_header("X-Station-Id", station)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
            return resp.status, (json.loads(raw) if raw else {})
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, {"detail": raw.decode(errors="replace")}


def login():
    username = input("Owner username: ").strip()
    password = getpass.getpass("Password: ")
    status, data = _request("POST", "/auth/login", body={"username": username, "password": password})
    if status != 200:
        print(f"Login failed: {data.get('detail', data)}")
        sys.exit(1)
    role = data.get("user", {}).get("role")
    if role != "owner":
        print(f"Logged in as role '{role}', not 'owner'. Backfill is owner-only - aborting.")
        sys.exit(1)
    print(f"Logged in as {data.get('user', {}).get('username')} (owner)\n")
    return data["access_token"]


def fetch_all_handovers(token, station):
    status, data = _request("GET", "/handover/entries", token=token, station=station)
    if status != 200:
        print(f"Failed to fetch handovers for {station}: {data.get('detail', data)}")
        sys.exit(1)
    return data


def group_by_pair(handovers):
    groups = {}
    for h in handovers:
        key = (h.get("shift_id"), h.get("attendant_id"))
        if not key[0] or not key[1]:
            continue
        groups.setdefault(key, []).append(h)
    return groups


def classify(group):
    """
    Returns ("unambiguous", keep_id, [supersede_ids]) or ("ambiguous", None, []).
    Voided entries are excluded entirely from consideration - they're
    already resolved and need no backfill.
    """
    non_voided = [h for h in group if h.get("review_status") != "voided"]
    if len(non_voided) <= 1:
        return "unambiguous", None, []  # not actually a duplicate once voided ones are excluded

    approved = [h for h in non_voided if h.get("review_status") == "approved"]
    if len(approved) != 1:
        return "ambiguous", None, []

    keeper = approved[0]
    others = [h for h in non_voided if h.get("handover_id") != keeper.get("handover_id")]
    return "unambiguous", keeper.get("handover_id"), [h.get("handover_id") for h in others]


def download_backup(token, station, out_dir="."):
    print(f"Downloading a full backup of {station} before making any changes...", flush=True)
    url = f"{BASE_URL}/backup/download"
    req = urllib.request.Request(url, method="GET")
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("X-Station-Id", station)
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            raw = resp.read()
    except urllib.error.HTTPError as e:
        print(f"Backup download failed: {e.code} {e.read().decode(errors='replace')}")
        sys.exit(1)
    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    path = f"{out_dir}/pre_backfill_backup_{station}_{ts}.json.gz"
    try:
        json.loads(gzip.decompress(raw))
        with open(path, "wb") as f:
            f.write(raw)
    except Exception:
        # Not gzip - save the raw payload directly, still under a .json name.
        path = f"{out_dir}/pre_backfill_backup_{station}_{ts}.json"
        with open(path, "wb") as f:
            f.write(raw)
    print(f"Backup saved to {path}\n")
    return path


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--station", default="ST001", help="Station ID (default: ST001)")
    parser.add_argument("--apply", action="store_true",
                         help="Actually backfill unambiguous groups. Without this, dry run only.")
    args = parser.parse_args()

    token = login()
    handovers = fetch_all_handovers(token, args.station)
    print(f"Fetched {len(handovers)} handover(s) for {args.station}.\n")

    groups = group_by_pair(handovers)
    duplicate_groups = {k: v for k, v in groups.items() if len(v) > 1}

    if not duplicate_groups:
        print("No (shift_id, attendant_id) pair has more than one handover. Nothing to do.")
        return

    unambiguous = []
    ambiguous = []
    for (shift_id, attendant_id), group in duplicate_groups.items():
        verdict, keep_id, supersede_ids = classify(group)
        if verdict == "unambiguous" and keep_id is None:
            continue  # only voided duplicates - already resolved, not real backlog
        entry = {
            "shift_id": shift_id, "attendant_id": attendant_id, "group": group,
            "keep_id": keep_id, "supersede_ids": supersede_ids,
        }
        (unambiguous if verdict == "unambiguous" else ambiguous).append(entry)

    print(f"=== {len(unambiguous)} unambiguous group(s) (one approved handover, rest are not) ===")
    for e in unambiguous:
        print(f"  shift={e['shift_id']}  attendant={e['attendant_id']}")
        print(f"    KEEP:      {e['keep_id']} (approved)")
        for sid in e["supersede_ids"]:
            other = next(h for h in e["group"] if h.get("handover_id") == sid)
            print(f"    SUPERSEDE: {sid} (review_status={other.get('review_status')!r}, "
                  f"created_at={other.get('created_at')})")
    print()

    print(f"=== {len(ambiguous)} ambiguous group(s) - NOT auto-resolved, needs manual review ===")
    for e in ambiguous:
        print(f"  shift={e['shift_id']}  attendant={e['attendant_id']}")
        for h in e["group"]:
            print(f"    {h.get('handover_id')}  review_status={h.get('review_status')!r}  "
                  f"created_at={h.get('created_at')}")
    print()

    if not args.apply:
        print("Dry run only - nothing was changed. Re-run with --apply to backfill the unambiguous groups above.")
        return

    if not unambiguous:
        print("Nothing unambiguous to apply. Ambiguous groups must be resolved by hand (Handover Review / Void).")
        return

    download_backup(token, args.station)

    print(f"About to backfill {len(unambiguous)} unambiguous group(s), marking "
          f"{sum(len(e['supersede_ids']) for e in unambiguous)} handover(s) superseded.")
    print("This does NOT touch the kept (approved) handover's figures, stock, or credit sales -")
    print("it only marks the orphan(s) as no longer canonical and re-checks shift completion.")
    confirm = input("\nType BACKFILL to confirm: ").strip()
    if confirm != "BACKFILL":
        print("Not confirmed. Aborting - nothing was changed.")
        return

    reason = input("Reason (recorded in the audit trail for every record touched): ").strip()
    if not reason:
        reason = "Historical duplicate handover predating the auto-supersede guard (bulk backfill)."
        print(f"Using default reason: {reason}")

    succeeded, failed = [], []
    for e in unambiguous:
        status, result = _request("POST", "/handover/backfill-supersede", token=token, station=args.station, body={
            "shift_id": e["shift_id"],
            "attendant_id": e["attendant_id"],
            "keep_handover_id": e["keep_id"],
            "supersede_handover_ids": e["supersede_ids"],
            "reason": reason,
        })
        if status == 200:
            succeeded.append((e, result))
        else:
            failed.append((e, status, result))

    print(f"\nDone. Backfilled: {len(succeeded)}")
    for e, result in succeeded:
        advanced = " -> shift now completed" if result.get("shift_advanced_to_completed") else ""
        print(f"  {e['shift_id']} / {e['attendant_id']}{advanced}")
    if failed:
        print(f"Failed: {len(failed)}")
        for e, status, result in failed:
            print(f"  {e['shift_id']} / {e['attendant_id']}: {status} {result.get('detail', result)}")


if __name__ == "__main__":
    main()
