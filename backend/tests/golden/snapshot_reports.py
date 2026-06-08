#!/usr/bin/env python3
"""
Golden-master snapshot harness for report endpoints.
Phase 0 of Reports_Simplification_Plan.md - the safety net.

READ-ONLY against real data: it boots the FastAPI app in FILE mode against an
ISOLATED temp storage directory seeded from a frozen fixture (a real ST001
backup), logs in as the default owner, calls every report / reconciliation /
export endpoint over a fixed input matrix, normalizes run-volatile fields
(timestamps), and snapshots the responses.

  python snapshot_reports.py --update   # capture / refresh the golden baseline
  python snapshot_reports.py            # compare a fresh run to the baseline

Determinism check: run --update once, then run with no args - it must report
"0 diffs". (Each process run rebuilds an isolated temp store from the fixture,
so runs are independent and reproducible.)

Nothing here touches the real backend/storage dir, the live DB, or the network.
"""
import os
import sys
import json
import tempfile
import argparse

HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.abspath(os.path.join(HERE, "..", ".."))
FIXTURE = os.path.join(HERE, "fixture_ST001.json")
GOLDEN_DIR = os.path.join(HERE, "baseline")
STATION = "ST001"
PREFIX = "/api/v1"

# ---------------------------------------------------------------- file mode
os.environ.pop("DATABASE_URL", None)
os.environ["SEED_DEFAULT_USERS"] = "true"
os.environ["TESTING"] = "1"
sys.path.insert(0, BACKEND)

# Redirect all per-station file IO to an isolated temp dir (never touch real storage).
_tmp = tempfile.mkdtemp(prefix="golden_store_")
import app.database.station_files as sf
sf.STORAGE_ROOT = _tmp

with open(FIXTURE, encoding="utf-8") as f:
    FX = json.load(f)

# Seed the temp station_files from the fixture.
_st_dir = os.path.join(_tmp, "stations", STATION)
os.makedirs(_st_dir, exist_ok=True)
for _fn, _data in (FX.get("station_files") or {}).items():
    with open(os.path.join(_st_dir, _fn), "w", encoding="utf-8") as f:
        json.dump(_data, f)

# Inject in-memory storage + station registry from the fixture.
import app.database.storage as storage_mod
storage_mod.STATIONS_STORAGE[STATION] = FX["station_storage"]
storage_mod.STORAGE = FX["station_storage"]
from app.database.stations_registry import STATIONS
STATIONS[STATION] = FX.get("station") or {
    "station_id": STATION, "name": "Fixture", "location": "", "status": "active",
}

from fastapi.testclient import TestClient
from app.main import app

# Pin "now" so now-relative endpoints (e.g. /discrepancies uses now()-lookback)
# are stable across calendar time, not just within a single day. Applied every
# run, so update and check always agree.
import importlib
from datetime import datetime as _dt


class _FrozenNow(_dt):
    @classmethod
    def now(cls, tz=None):
        return _dt(2026, 6, 8, 12, 0, 0, tzinfo=tz)


for _name in ("discrepancies", "tank_readings", "reconciliation", "reports",
              "sales_reports", "daily_close_off"):
    try:
        _m = importlib.import_module(f"app.api.v1.{_name}")
        if hasattr(_m, "datetime"):
            _m.datetime = _FrozenNow
    except Exception:
        pass

client = TestClient(app)  # no context manager -> startup not fired (we seeded manually)

_r = client.post(f"{PREFIX}/auth/login", json={"username": "owner1", "password": "owner123"})
assert _r.status_code == 200, f"login failed: {_r.status_code} {_r.text}"
H = {"Authorization": f"Bearer {_r.json()['access_token']}", "X-Station-Id": STATION}

# ---------------------------------------------------------------- derive inputs
STORAGE = FX["station_storage"]
shifts = STORAGE.get("shifts", {}) or {}
SHIFT_IDS = sorted(shifts.keys())
DATES = sorted({s.get("date") for s in shifts.values() if s.get("date")})
TANKS = sorted((STORAGE.get("tanks") or {}).keys())
D0 = DATES[0] if DATES else "2026-01-01"
D1 = DATES[-1] if DATES else "2026-12-31"
SHIFT0 = SHIFT_IDS[0] if SHIFT_IDS else "none"
TANK0 = TANKS[0] if TANKS else "none"
try:
    YEAR, MONTH = int(D0[:4]), int(D0[5:7])
except Exception:
    YEAR, MONTH = 2026, 1

# ---------------------------------------------------------------- normalization
# Run-volatile keys whose value changes between runs and must be blanked so the
# diff reflects logic, not the clock. The determinism check (run twice) flags any
# we miss; add them here. Also blanks any key ending in "_at" and "timestamp".
VOLATILE = {
    "generated_at", "server_time", "as_of", "run_at", "now", "current_time",
    "report_generated_at", "date_generated", "timestamp", "last_updated",
}


def normalize(obj):
    if isinstance(obj, dict):
        out = {}
        for k, v in obj.items():
            if k in VOLATILE or k.endswith("_at"):
                out[k] = "<TS>"
            else:
                out[k] = normalize(v)
        return out
    if isinstance(obj, list):
        return [normalize(x) for x in obj]
    return obj


def body_of(resp):
    ct = resp.headers.get("content-type", "")
    if "application/json" in ct:
        try:
            return normalize(resp.json())
        except Exception:
            return resp.text
    return resp.text  # csv / other text


def get(path, params=None):
    r = client.get(f"{PREFIX}{path}", headers=H, params=params or {})
    return {"status": r.status_code, "body": body_of(r)}


# ---------------------------------------------------------------- endpoint matrix
def build_matrix():
    snaps = {}

    def cap(label, path, params=None):
        snaps[label] = get(path, params)

    # Logs first (read-only; before any side-effecting analytics) ------------
    cap("audit", "/audit/", {"limit": 200})
    cap("notifications", "/notifications/", {"limit": 200})

    # Advanced reports (reports.py) -----------------------------------------
    cap("reports_staff_list", "/reports/staff/list")
    cap("reports_staff_all", "/reports/staff/all", {"start_date": D0, "end_date": D1})
    cap("reports_nozzle_list", "/reports/nozzle/list")
    cap("reports_nozzle_all", "/reports/nozzle/all", {"start_date": D0, "end_date": D1})
    cap("reports_island_list", "/reports/island/list")
    cap("reports_island_all", "/reports/island/all", {"start_date": D0, "end_date": D1})
    cap("reports_product_list", "/reports/product/list")
    cap("reports_product_all", "/reports/product/all", {"start_date": D0, "end_date": D1})
    cap("reports_custom", "/reports/custom", {"start_date": D0, "end_date": D1})
    cap("reports_daily", "/reports/daily", {"date": D0})
    cap("reports_monthly", "/reports/monthly", {"year": YEAR, "month": MONTH})
    cap("reports_date_range", "/reports/date-range", {"start_date": D0, "end_date": D1})

    # one derived per-entity report (exercises same service via {id} route)
    sl = snaps["reports_staff_list"]["body"]
    names = sl.get("staff_names") if isinstance(sl, dict) else None
    if names:
        cap("reports_staff_one", f"/reports/staff/{names[0]}", {"start_date": D0, "end_date": D1})
    nl = snaps["reports_nozzle_list"]["body"]
    nids = nl.get("nozzle_ids") if isinstance(nl, dict) else None
    if nids:
        cap("reports_nozzle_one", f"/reports/nozzle/{nids[0]}", {"start_date": D0, "end_date": D1})

    # Sales reports (sales_reports.py) --------------------------------------
    cap("sales_reports_daily", f"/sales-reports/daily/{D0}")
    cap("sales_reports_summary", "/sales-reports/summary")

    # Reconciliation (reconciliation.py) ------------------------------------
    cap("recon_date", f"/reconciliation/date/{D0}")
    cap("recon_month", f"/reconciliation/summary/month/{YEAR}/{MONTH}")
    cap("recon_discrepancies", "/reconciliation/discrepancies/analysis")
    cap("recon_threeway_daily", f"/reconciliation/three-way/daily-summary/{D0}")
    cap("recon_threeway_config", "/reconciliation/three-way/config")
    cap("recon_shift", f"/reconciliation/shift/{SHIFT0}")
    cap("recon_tank_analysis", f"/reconciliation/shift/{SHIFT0}/tank-analysis")

    # Tank readings / movement (tank_readings.py) ---------------------------
    for t in TANKS:
        cap(f"tank_readings_{t}", f"/tank-readings/readings/{t}", {"start_date": D0, "end_date": D1})
        cap(f"tank_movement_{t}", f"/tank-readings/movement/{t}", {"start_date": D0, "end_date": D1})

    # Discrepancies / anomalies (discrepancies.py) --------------------------
    cap("discrepancies_30", "/discrepancies", {"lookback_days": 30})
    cap("discrepancies_3650", "/discrepancies", {"lookback_days": 3650})

    # Daily close-off (daily_close_off.py) ----------------------------------
    cap("close_off_summary", "/daily-close-off/summary", {"date": D0})
    cap("close_off_history", "/daily-close-off/history", {"limit": 30})

    # Inventory / stock / daily-entry surfaces ------------------------------
    cap("tanks_levels", "/tanks/levels")
    cap("lpg_entries", "/lpg-daily/entries")
    cap("lpg_acc_entries", "/lpg-daily/accessories/entries")
    cap("lpg_acc_inventory", "/lpg-daily/accessories/inventory")
    cap("lub_entries", "/lubricants-daily/entries")
    cap("lub_products", "/lubricants-daily/products")
    cap("stores_dashboard", "/stores/dashboard")
    cap("stores_movements", "/stores/movements")
    cap("validated_readings", "/validated-readings")

    # Exports (exports.py) - request CSV (deterministic text; XLSX zips embed mtimes)
    cap("export_tank_readings", "/exports/tank-readings", {"format": "csv"})
    cap("export_sales", "/exports/sales", {"format": "csv"})
    cap("export_reconciliation", "/exports/reconciliation", {"format": "csv"})

    return snaps


def safe(label):
    return "".join(c if c.isalnum() or c in "-_" else "_" for c in label)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--update", action="store_true", help="write/refresh the golden baseline")
    args = ap.parse_args()

    snaps = build_matrix()
    os.makedirs(GOLDEN_DIR, exist_ok=True)

    if args.update:
        # clear stale baseline files, then write fresh
        for fn in os.listdir(GOLDEN_DIR):
            if fn.endswith(".json"):
                os.remove(os.path.join(GOLDEN_DIR, fn))
        for label, snap in snaps.items():
            with open(os.path.join(GOLDEN_DIR, safe(label) + ".json"), "w", encoding="utf-8") as f:
                json.dump(snap, f, indent=2, sort_keys=True, default=str)
        statuses = {}
        for s in snaps.values():
            statuses[s["status"]] = statuses.get(s["status"], 0) + 1
        print(f"BASELINE WRITTEN: {len(snaps)} endpoints -> {GOLDEN_DIR}")
        print("status breakdown:", dict(sorted(statuses.items())))
        non200 = {lbl: s["status"] for lbl, s in snaps.items() if s["status"] != 200}
        if non200:
            print("non-200 endpoints:", non200)
        return

    # compare mode
    diffs, missing = [], []
    for label, snap in snaps.items():
        gp = os.path.join(GOLDEN_DIR, safe(label) + ".json")
        if not os.path.exists(gp):
            missing.append(label)
            continue
        with open(gp, encoding="utf-8") as f:
            golden = json.load(f)
        cur = json.loads(json.dumps(snap, sort_keys=True, default=str))
        if cur != golden:
            diffs.append(label)
    extra = [fn[:-5] for fn in os.listdir(GOLDEN_DIR)
             if fn.endswith(".json") and fn[:-5] not in {safe(l) for l in snaps}]
    print(f"compared {len(snaps)} endpoints against baseline")
    print(f"  diffs:   {len(diffs)} {diffs if diffs else ''}")
    print(f"  missing: {len(missing)} {missing if missing else ''}")
    print(f"  extra in baseline: {len(extra)} {extra if extra else ''}")
    if diffs or missing:
        sys.exit(1)
    print("OK - no behavioural diff vs baseline")


if __name__ == "__main__":
    main()
