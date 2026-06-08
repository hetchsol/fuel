# Reports - A-Z Review & Simplification Plan

**Status:** Plan only - not executed. For review/sign-off.
**Date:** 2026-06-08
**Goal:** Review every report/analytics/reconciliation surface across all roles,
map what feeds into each and what each feeds into, and propose a way to simplify
them **without changing the numbers, logic, or outputs** - only how they are
sourced and surfaced.

Method: two read-only sweeps of the codebase - one over the Next.js frontend
(pages + role nav + middleware), one over the FastAPI backend (endpoints + data
sources). Findings are consolidated below.

## Risk legend (applied per item)

- **[SAFE]** - pure refactor or presentation change; outputs are identical, no
  logic altered. Proven by the golden-master test net (Section 9).
- **[CHANGES-NUMBER]** - intentionally alters a value because it corrects an
  existing inconsistency. The change is made deliberately and is visible as a diff
  against the baseline; never silent.
- **[NEEDS-VERIFY]** - could break something if an assumption is wrong (e.g. an
  "orphan" is actually read somewhere). Gated on verification before it ships.

---

## 1. Roles

Four roles. Reports are for the top three only.

- **Attendant** (`user`): no reports; auto-redirected to `/my-shift`.
- **Supervisor**: reconciliation + reports (read), operational entry.
- **Manager**: same reports (leaner 4-group menu) + admin.
- **Owner**: same reports + owner-only admin (Stations, Infrastructure).

---

## 2. A-Z inventory of report-like surfaces

"Report-like" = any page that presents aggregated / analytical / reconciliation
/ log data (not raw data entry). 13 pages + dashboards.

| # | Surface (route) | Question it answers | Roles | Key inputs | Backend source | Export |
|---|---|---|---|---|---|---|
| 1 | Sales Reports (`/reports`) | Sales by product/volume/revenue over a range | sup/mgr/own | date range | `/reports/date-range`, `/sales-reports/daily` | CSV/XLSX/PDF |
| 2 | Advanced Reports (`/advanced-reports`) | 7 cuts: staff, nozzle, island, product, custom, daily, monthly | sup/mgr/own | type + filters + dates | `/reports/{staff,nozzle,island,product,custom,daily,monthly}` | CSV/XLSX/PDF |
| 3 | Tank Readings & Monitor (`/tank-readings-report`) | Raw tank readings; owner "Validated" tab | sup/mgr/own (validated: own) | date range, tank | `/tank-readings/readings/{tank}` | CSV/XLSX/PDF |
| 4 | Three-Way Reconciliation (`/three-way-reconciliation`) | Tank vs nozzle vs cash per day | sup/mgr/own | date | `/reconciliation/three-way/daily-summary/{date}`, `/patterns` | yes |
| 5 | Tank Analysis (`/tank-analysis`) | Dip movement vs elec/mech sales per shift | sup/mgr/own | shift | `/reconciliation/shift/{id}/tank-analysis` | yes |
| 6 | Shift Reconciliation (`/reconciliation`) | Per-shift cash + inventory (Excel summary) | sup/mgr/own | date | `/reconciliation/date/{date}` | yes |
| 7 | Anomaly Alerts (`/alerts`) | Consumption/loss/variance anomalies | sup/mgr/own | lookback days | `/discrepancies?lookback_days` | yes |
| 8 | Notifications (`/notifications`) | System notification log | sup/mgr/own | severity/type/read/date | `/notifications` | view-only |
| 9 | Audit Log (`/audit`) | Change log (prices, users, approvals...) | mgr/own | action/entity/user/date | `/audit` | CSV/XLSX/PDF |
| 10 | Dashboard (`/`) | Live tanks + daily summary + flags | sup/mgr/own | date | `/daily`, `/flags`, `/tanks/levels` | view-only |
| 11 | Daily Close-Off (`/daily-close-off`) | Day totals + deposit variance, lock day | mgr/own | date, deposit | `/daily-close-off/summary`,`/history` | view-only |
| 12 | Inventory / Tank Levels (`/inventory`) | Tank %, LPG/accessory, lubricant stock | sup/mgr/own | tab | `/tanks/levels`, `/lpg-daily/...`, `/lubricants-daily/...` | CSV/XLSX |
| 13 | Stores Dashboard (`/stores`) | Two-bin stock + reorder + movements | mgr/own | filters | `/stores/dashboard`,`/movements` | (stock) |

Plus `/readings-monitor` = a redirect alias to `/tank-readings-report?tab=validated`.

**Per-role report menu today**

- **Supervisor / Owner** (DEFAULT_NAV): a **Reconciliation** group (#4,5,6) and a
  separate **Reports** group (#1,2,3,7,8). Owner also has Audit under Admin.
- **Manager** (MANAGER_NAV): all of #1-8 collapsed into one **Reports** group;
  Audit under Admin; Daily Close-Off under Day.

So the same 8 analytical pages are grouped **two different ways** depending on
role (Reconciliation+Reports for sup/owner vs one Reports list for manager).

---

## 3. Data lineage - what feeds in, what feeds out

### 3.1 The core problem: two parallel "source of truth" planes

After the handover refactor there are **two data planes** that reports read from
inconsistently:

- **Plane A - `attendant_handovers.json`** (the intended source of truth). The
  two-phase handover freezes nozzle `volume_sold`/`revenue`, then Phase-2 fans
  out to reconciliations, daily entry files, credit sales, and stores stock.
- **Plane B - legacy** `storage['readings']`, `sales.json`, `tank_readings.json`,
  `validated_readings.json`. Older capture/calc paths still read by several
  reports.

`reports.py:_load_readings_from_handovers` bridges A->B by flattening handovers
into the legacy "reading" shape. This bridge - and its **second, duplicate copy**
in `sales_reports.py:_load_fuel_sales_from_handovers` - is the central mess.

### 3.2 Three layers

```
(a) RAW CAPTURE                     (b) INTERMEDIATE                 (c) REPORTS / EXPORTS
-----------------------------------------------------------------------------------------
nozzle readings (elec+mech) ----+-> attendant_handovers.json --+--> /reports/* (staff,nozzle,
  via handover Phase 1          |     (frozen sales+revenue)    |     island,product,daily,monthly,
  (+ legacy storage['readings'])|                               |     custom)
                                |                               +--> /sales-reports/*
tank dip readings --------------+-> tank_readings.json ---------+--> /reconciliation/three-way/*
  (tank_readings.py             |     (+ embedded 3-way recon,  |--> /tank-readings/movement,variance
   + storage[shifts].dips)      |      Excel calcs)             |--> /discrepancies (/alerts)
                                |                               +--> /exports/tank-readings
fuel deliveries ---------------> tank_deliveries.json ----------+
                                |
cash / safe deposits ----------> safe_deposits.json
                                |
handover Phase 2 fans out to:   +-> reconciliations.json -------+--> /reconciliation/* (shift,date,
  reconciliations.json          |                               |     month,discrepancies)
  lpg_daily_entries.json        +-> daily_close_offs.json ------+--> /daily-close-off/*
  lpg_accessories_daily.json    |
  lubricant_daily_entries.json -+-> (also a primary capture) ---+--> /lpg-daily, /lubricants-daily
  credit_sales, stores stock    |
                                |
legacy sales ------------------> sales.json -------------------+--> /reports/date-range  (!)
                                |                               +--> /exports/sales       (!)
validated readings ------------> validated_readings.json -------+--> /validated-readings/* (orphan)
triggers ----------------------> notifications.json, audit_log.json --> /notifications, /audit
```

The `(!)` lines are the inconsistency: **`/reports/date-range` and `/exports/sales`
read `sales.json`, while every other report reads handover-derived data.** For the
same date these can disagree.

### 3.3 What each report feeds INTO (consumers)

- **Three-Way / Tank Analysis / Shift Reconciliation** -> the manager/owner's
  decision to **approve handovers** and **close the day** (Daily Close-Off).
- **Daily Close-Off** -> locks handovers, writes deposit variance, audit + a
  notification. Terminal for the day.
- **Anomaly Alerts / Notifications** -> attention triggers; no downstream data.
- **Sales/Advanced/Tank Readings reports + Exports** -> external/manual use
  (accounting, owner review). Terminal.
- **Audit Log** -> oversight. Terminal.

So the reconciliation trio is the only analytical cluster that **feeds a workflow
step**; the rest are read/export endpoints.

---

## 4. Findings - duplication & inconsistency (highest value first)

1. **Two handover-flatten implementations.** `reports.py:_load_readings_from_handovers`
   and `sales_reports.py:_load_fuel_sales_from_handovers` produce near-identical
   sale records from the same file.
2. **Four "daily fuel total" paths, mixed sources.** `/reports/daily` (handover),
   `/sales-reports/daily/{date}` (handover, 2nd impl), `/sales/date/{date}`
   (`sales.json`), `/reports/date-range` (`sales.json` + storage lists). They can
   disagree - a **correctness risk**, not just clutter.
3. **3-way reconciliation computed three ways.** Inline at write
   (`tank_readings.py`, stored in the reading), lazily at read
   (`reconciliation.py` three-way endpoints), and a third independent tank-vs-sales
   variance in `/reconciliation/shift/{id}/tank-analysis` (reads `storage['shifts']`
   /`storage['sales']` instead of `tank_readings.json`).
4. **Reconciliation revenue aggregated in 4 places.** handover `_create_reconciliation`,
   `/reconciliation/calculate/{id}`, `daily_close_off._aggregate_handovers`,
   `/reconciliation/summary/month` + `/reports/monthly`.
5. **Anomaly/variance detection duplicated** between `/tank-readings/movement/{tank}`
   and `/discrepancies` (same `detect_anomalies`, different scope).
6. **Orphaned planes.** `validated_readings.json` is written but read by no report;
   `storage['readings']` + legacy `shifts.py:/readings` largely superseded by
   handovers.
7. **`sales.json` vs handover sales.** Exports + `/reports/date-range` use
   `sales.json`; everything else uses handovers. If handovers are canonical, these
   should switch.
8. **Mixed-provenance daily entries.** `lpg_daily_entries.json` etc. are both a
   primary capture surface and a handover-derived artifact; rows can be
   "Auto-generated from handover ...". Provenance is implicit.

**Frontend-side**

9. **Same 8 pages grouped two ways** by role (Reconciliation+Reports vs one
   Reports). Cognitive overhead; nothing is actually different.
10. **Three reconciliation pages** (#4,5,6) answer one question - "did fuel and
    cash balance?" - from three angles, as three separate pages.
11. **Three reporting pages** (#1,2,3) overlap: Sales Reports is essentially one
    more "type" alongside Advanced Reports' seven; Tank Readings is a fourth view.
12. **Two attention inboxes** (#7 Alerts, #8 Notifications) - anomalies vs
    notifications largely overlap.
13. **Exports are CSV/XLSX only** server-side, but several pages advertise "PDF"
    (client-side). Inconsistent promise.

---

## 5. Simplification plan

### 5.1 Principles (non-negotiable, matches prior work)

- **Numbers don't change.** Every consolidation must return byte-identical (or
  provably equivalent) outputs; this is a plumbing + presentation change.
- **One source of truth = handovers (Plane A).** Everything sales/recon-derived
  resolves to handover data through one shared loader.
- **Additive then subtractive.** Introduce shared services first (no behaviour
  change), switch callers, then retire the orphaned planes last.
- **Each step reversible and independently shippable.**

### 5.2 Backend consolidation (invisible to users)

- **B1. One sales loader.** Replace the two handover-flatten functions with a
  single `handover_sales` service used by `/reports/*` and `/sales-reports/*`.
  **[SAFE]** - pure refactor; same output (proven by the net).
- **B2. One daily-aggregation service.** Route `/reports/daily`,
  `/sales-reports/daily`, `/reports/date-range`, `/reports/monthly`, and
  `/daily-close-off` totals through it, reading the canonical handover source so
  all "daily totals" agree.
  **[CHANGES-NUMBER]** - corrects finding #2; `/reports/date-range` (and any path
  that currently reads `sales.json`) will move to the consistent figure.
- **B3. One reconciliation engine.** Compute 3-way once (at handover/reading
  write), store it, and have all read endpoints (three-way, tank-analysis,
  shift recon) return the stored result. Remove the duplicate lazy/inline recomputes
  and the divergent tank-analysis variance path.
  **[CHANGES-NUMBER]** - where the three current computations differ, the unified
  one becomes canonical; differences surface as reviewed diffs. (The
  store-once/read-many plumbing itself is **[SAFE]** when the three already agree.)
- **B4. One anomaly module.** `/discrepancies` and `/tank-readings/movement`
  share a single detector; per-tank vs all-tank is just a scope parameter.
  **[SAFE]** - same detector, same thresholds; scope is a parameter.
- **B5. Retire orphans** once B1-B4 land and nothing reads them:
  `validated_readings.json`, `storage['readings']`, legacy `shifts.py:/readings`;
  switch `/exports/sales` + `/reports/date-range` off `sales.json` (or retire
  `sales.json` if it is no longer a write path - confirm first).
  **[NEEDS-VERIFY]** - safe only after grep + a deprecation-warning release prove
  the planes are unread; the export source switch is **[CHANGES-NUMBER]**.
- **B6. Make daily-entry provenance explicit** (a `source: handover|manual` flag)
  so LPG/lubricant reports can show/segment it.
  **[SAFE]** - additive field; existing reads ignore it until used.

### 5.3 User-facing consolidation (fewer, clearer surfaces)

Target: collapse 8 analytical pages into **3 clusters**, identical for every role,
each with internal tabs instead of separate menu items.

- **R1. "Reconciliation" (one page, tabs).** Merge #6 Shift Reconciliation
  (default tab: cash/day), #4 Three-Way, #5 Tank Analysis. One date/shift picker,
  three tabs.
  **[SAFE]** - same endpoints/data behind tabs; old routes become redirects.
- **R2. "Reports" (one page, type selector).** Fold #1 Sales Reports and #3 Tank
  Readings into #2 Advanced Reports as additional report types.
  **[SAFE]** - same endpoints; menu shrinks, features don't.
- **R3. "Alerts" (one inbox).** Merge #7 Anomaly Alerts and #8 Notifications into
  one severity-sorted inbox with a source filter (anomaly vs system).
  **[SAFE]** - both endpoints already exist; presentation merge.
- **R4. Same grouping for all roles** (Reconciliation, Reports, Alerts, Audit).
  **[SAFE]** - nav definition only.
- **R5. Unify export promise.** Add server-side PDF, or relabel to CSV/Excel
  everywhere; don't show "PDF" where only CSV/XLSX exist.
  **[SAFE]** if relabel; **[NEEDS-VERIFY]** if adding PDF generation (new code).

Net: a role goes from "Reconciliation (3) + Reports (5)" = 8 menu items to
**Reconciliation + Reports + Alerts = 3**, with the same capabilities behind tabs.

### 5.4 Phasing

1. **Phase 0 - safety net (Section 9).** Build the golden-master harness and
   capture the baseline. Changes nothing. **[SAFE]**
2. **Phase 1 - SAFE backend (B1, B4, B6) + SAFE UI (R1-R4).** Net stays green;
   pure consolidation.
3. **Phase 2 - canonical source (B2) + one recon engine (B3).** The intended
   **[CHANGES-NUMBER]** work; diffs reviewed and re-blessed before shipping.
4. **Phase 3 - retire orphans (B5), export source switch, optional PDF (R5).**
   **[NEEDS-VERIFY]**; gated on the deprecation pass.

Each phase ships alone and is reversible.

---

## 6. Quick wins (low risk, high clarity)

- De-duplicate the **two handover-flatten functions** into one. **[SAFE]**
- Merge **Alerts + Notifications** into one inbox. **[SAFE]**
- Add **redirects** for any merged routes so existing links keep working. **[SAFE]**
- Make `/reports/date-range` + `/exports/sales` read the **same** source as the
  rest (kills the same-date disagreement). **[CHANGES-NUMBER]** - smallest fix for
  the biggest correctness risk; do it once the net can show the diff.

---

## 7. Risks & validation

- **Risk:** a consolidation silently changes a number. **Mitigation:** the
  golden-master net (Section 9) - any output change fails the check until it is
  reviewed and intended.
- **Risk:** an "orphan" is actually read somewhere. **Mitigation:** grep + a
  release that logs a deprecation warning before deletion (B5).
- **Risk:** a UI merge hides a report a role relied on. **Mitigation:** keep every
  capability as a tab/type; only the menu shrinks, not the features.

---

## 8. Open decisions (need sign-off before building)

1. **Canonical sales source:** confirm handovers replace `sales.json` entirely, or
   must `sales.json` remain (e.g. an external integration writes it)?
2. **Validated readings:** safe to retire the `validated_readings` plane, or is the
   owner "Validated" tab a required compliance view to preserve?
3. **Cluster shape:** 3 clusters (Reconciliation / Reports / Alerts), or keep them
   separate and only merge within each?
4. **Same nav for all roles** vs keep the manager's distinct 4-group layout.
5. **PDF exports:** add server-side PDF, or standardise on CSV/Excel only?

---

## 9. The safety net - how we guarantee logic/functionality is unchanged

This is the mechanism that makes "implement without altering behaviour" verifiable
rather than a promise. Build it FIRST, before any refactor.

- **Frozen dataset.** Seed a deterministic local fixture (e.g. via
  `seed_simulation.py`) or a read-only copy of a station's data. Never test against
  live. All outputs are measured against this fixed input.
- **Snapshot harness (read-only).** A script that calls every report / reconciliation
  / export endpoint with a fixed matrix of inputs (each date range, tank, shift,
  staff, nozzle, island, lookback) and writes each JSON response to disk,
  normalizing volatile fields (timestamps, generated ids).
- **Baseline capture.** Run it twice; confirm the two runs are identical (proves
  determinism); commit the "golden" outputs. This defines current correct behaviour.
- **Refactor under the net.** After each change, re-run and diff against golden:
  - **Zero diff** = behaviour provably unchanged (covers all **[SAFE]** items).
  - **Diff** = stop; either it is an intended **[CHANGES-NUMBER]** item (review,
    approve, re-bless the baseline) or an accidental regression (fix before merge).
- **UI coverage.** Page merges reuse the same API calls, so the net already covers
  the data; UI risk is wiring only - covered by a short manual smoke test plus
  route redirects.

**Recommended start:** Phase 0 (build harness + capture baseline) and Phase 1
(SAFE-only consolidation). Treat [CHANGES-NUMBER] and [NEEDS-VERIFY] work as
separate, explicitly-approved phases.
