# Reports golden-master net (Phase 0)

Safety net for the Reports simplification (see `Reports_Simplification_Plan.md`).
It pins the **current output of every report / reconciliation / export endpoint**
so any later refactor can be proven to leave behaviour unchanged.

## How it works

`snapshot_reports.py` boots the FastAPI app in **file mode** against an **isolated
temp directory** seeded from a frozen fixture (`fixture_ST001.json`, a real ST001
backup), logs in as the default owner, calls a fixed matrix of report endpoints,
**normalizes run-volatile fields** (timestamps), and snapshots each response into
`baseline/`.

It does NOT touch `backend/storage`, the live database, or the network.

## Usage

```
cd backend
python tests/golden/snapshot_reports.py --update   # capture / refresh baseline
python tests/golden/snapshot_reports.py            # compare a run to baseline (exit 1 on diff)
```

Workflow during a refactor:
1. `--update` once on the current code -> the baseline = "current correct behaviour".
2. Make a change.
3. Run with no args. **0 diffs = behaviour unchanged.** A diff is either an
   intended `[CHANGES-NUMBER]` item (review, then re-bless with `--update`) or a
   regression (fix before merge).

Determinism is verified: `--update` then a plain run reports `0 diffs`.

## Coverage (47 endpoints; 43 return data)

Covered with real data:
- `/reports/*` (staff, nozzle, island, product, daily, monthly, date-range, custom)
- `/sales-reports/*`
- `/reconciliation/date`, `/summary/month`, `/discrepancies/analysis`,
  `/three-way/daily-summary`, `/shift/{id}/tank-analysis`
- `/tank-readings/readings/*`, `/tank-readings/movement/*` (petrol & diesel)
- `/discrepancies` (anomaly detection, clock-pinned - see below)
- `/daily-close-off/*`, `/audit`, `/notifications`
- `/lpg-daily/*`, `/lubricants-daily/*`, `/stores/*`, `/tanks/levels`, `/validated-readings`
- `/exports/tank-readings`, `/exports/sales`, `/exports/reconciliation` (CSV)

The tank-readings plane is populated by `enrich_fixture.py` (run once), which POSTs
deterministic readings through the real `/tank-readings/readings` endpoint and
merges the computed `tank_readings.json` into the fixture. So B3 (reconciliation
engine), B4 (anomaly module) and B5 (teardown) targets are now exercised.

**Clock pin:** `/discrepancies` filters by `now() - lookback_days`, so the harness
pins `datetime.now()` to a fixed instant (in the same set of modules) so the
baseline is stable across calendar time, not just within one day.

Four recorded non-200s are genuine current behaviour, intentionally pinned:
- `discrepancies` with `lookback_days=3650` -> 422 (bound is `le=90`).
- `/reconciliation/three-way/config` -> 404 (route shadowed by `/three-way/{reading_id}`).
- `/reconciliation/shift/{shift_id}` -> 404 (endpoint keys by reconciliation id, not shift id).
- `/tank-readings/movement/TANK-DIESEL-2` -> 404 (14,000 L tank has no seeded readings / no calibration).

## Fixture provenance & sensitivity

`fixture_ST001.json` is a copy of `backup_ST001_20260605-145228.json` (the rich
pre-reset ST001 snapshot: 22 shifts, 4 handovers, readings, reconciliations, daily
entries). It contains **real operational data** (staff names, sales figures).
Decide before committing whether to (a) commit as-is, (b) anonymise it, or
(c) gitignore it and regenerate locally. No credentials are present.
