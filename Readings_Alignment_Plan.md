# Readings Alignment & Auto-Population - Plan

**Status:** Plan only - not executed. For review/sign-off.
**Date:** 2026-06-08
**Goal:** Make nozzle meter readings and tank dip readings behave as **one value
entered once, reflected everywhere** - never re-entered per role, page, or
endpoint. Opening values are always **derived** (carried forward from the prior
shift's closing, plus calibration), never typed. Tanks get **size-based names**
(auto-generated, editable). All dip->volume uses the **same calibration**.

Built from three read-only investigations (frontend touchpoints, backend reading
lineage/carry-forward, tank naming + calibration).

## Risk legend
- **[SAFE]** - output-preserving; provable via the golden-master net / tests.
- **[CHANGES-NUMBER]** - intentionally changes a stored/displayed value to the
  correct one (corrects an existing inconsistency); reviewed, never silent.
- **[NEEDS-VERIFY]** - depends on an assumption (orphan unused, data shape);
  gated on verification before shipping.

---

## 1. The core requirements (restated for sign-off)

1. **Dips carry forward per tank:** a tank's closing dip = that same tank's
   opening dip in the immediately following shift (Day -> Night -> next Day).
2. **Nozzles carry forward per nozzle:** a nozzle's closing reading = its opening
   reading in the next shift.
3. **No manual opening entry:** opening dip, opening volume, and nozzle opening
   readings are auto-filled and read-only (manager/owner override only).
4. **Calibration drives volume:** opening dip(cm) -> Tank Level Opening(L) and
   closing dip(cm) -> Tank Level Closing(L), via that tank's calibration chart.
   Closing volume populates the instant a closing dip is entered.
5. **Size-based tank names:** auto "Petrol Tank 1 - 30,000 L" / "Diesel Tank 1 -
   30,000 L" / "Diesel Tank 2 - 14,000 L", editable in Infrastructure; the two
   diesel tanks must never be confused.
6. **One source of truth:** an entry at one point reflects everywhere it belongs;
   no re-entry by role/endpoint/page.

---

## 2. Why it's "not working well" - findings

### 2.1 The same reading lives in many stores, written by parallel pipelines

**Nozzle readings** can land in up to **six** stores via **two** pipelines that
don't cross-update:
- `attendant_readings.json` (`AR-{shift}-{user}-O/-C`) - enter-readings raw
  (`enter_readings.py:340-349,407-417`)
- `storage['islands'].nozzles[].electronic_reading/mechanical_reading` - live
  "last reading" pointer (`attendant_handover.py:631-637`, `enter_readings.py:421-425`)
- `attendant_handovers.json.nozzle_summaries[]` - opening/closing/volume
  (`attendant_handover.py:1096,1118`)
- `storage['readings']` - reports feed (`enter_readings.py:430-443`)
- `tank_readings.json.nozzle_readings[]` - a **third, independent** copy typed by
  a supervisor on Daily Tank Reading (`tank_readings.py:567,644`)
- `validated_readings.json` - legacy standalone

There are **two separate attendant capture paths** for the same readings:
`/enter-readings` and `/my-shift` (handover). The handover even **merges** sources
(prefers enter-readings for some nozzles, form values for others -
`attendant_handover.py:158-191`), so `nozzle_summaries` can mix provenance.
`tank_readings.json.nozzle_readings` is **never reconciled** against the handover.

**Tank dips** live in **two co-equal stores** with **different field names**:
- `storage['shifts'][sid].tank_dip_readings` -> `opening_volume_liters` / `closing_volume_liters`
- `tank_readings.json` -> `opening_volume` / `closing_volume`
Each read path synthesizes one from the other on the fly; no writer keeps them in
sync (`reconciliation.py:198-209`, `tank_readings.py:749-777`).

Plus dips can be entered in **three UI places**: Shifts modal, Daily Tank Reading,
and the Dashboard `TankCard` - each writing different stores.

### 2.2 The two-diesel-tank confusion (the real bug)

Most carry-forward matchers are actually **strict by tank_id / nozzle_id** and are
safe (previous-shift `tank_readings.py:849-860`; attendant-last `:930`; handover
opening from islands by nozzle_id; `_update_nozzle_state`; enter-readings seeding
`enter_readings.py:121-126`). The breakage is in the **fallbacks**:

- **Fuel-type pooling:** when nozzle->tank mapping is missing, shift-summary /
  reconciliation infer fuel by `"DIESEL" in tank_id.upper()` and **pool both
  diesel tanks' nozzle sales into one bucket** (`enter_readings.py:659-675`,
  `tank_readings.py` shift-summary, `reconciliation.py:233`). Two diesel tanks
  collapse into one.
- **Calibration fuel-type fallback:** `dip_conversion._resolve_calibration`
  falls back to a same-fuel sibling's chart (`dip_conversion.py:136-163`), so a
  diesel tank with no uploaded chart silently uses the other diesel tank's curve
  -> wrong volumes. New tanks are even **created with a cloned sibling chart**
  (`tanks.py:481-497`).
- **Dip carry-forward not per-tank-validated:** `previous-dip-readings` copies the
  whole previous shift's dip list (`shifts.py:615-653`) with no check that the
  same set of tanks was covered -> silent gaps for a tank the prior shift missed.

### 2.3 Dip->volume is inconsistent (flat factor vs calibration)

- **Calibrated (correct):** only the Daily Tank Reading path
  (`tank_readings.py:333,337` via `dip_to_volume`).
- **Flat factor 785.4 L/cm (wrong for cylindrical tanks):** the Dashboard dip
  endpoint (`tanks.py:379-385`) and the **Shifts dip path** (`shifts.py:514,517`)
  - and the Shifts path **feeds reconciliation tank movement**
  (`reconciliation.py:236-240`). So the **same dip yields different volumes**
  depending on which screen recorded it.
- Closing dip does **not** auto-convert on the frontend; `closing_volume` is typed
  manually (`daily-tank-reading.tsx:83`). Backend only converts when volume is
  `None`, so a corrected closing dip with a stale volume won't refresh
  (`tank_readings.py:331-337`).

### 2.4 Opening values are manually editable

Opening nozzle readings and dips are auto-fetched but remain **editable / re-enterable**
(`daily-tank-reading.tsx:882-891`; my-shift opening editable). Three different
auto-fill sources for nozzle openings can conflict.

### 2.5 Tank labelling is inconsistent (no name field)

No `display_name` exists. Tanks are shown ~14 different ways (raw `tank_id`,
`"{fuel} Tank"`, `"{fuel} Tank {N}"`, `"{tank_id} ({fuel})"`...), and the per-fuel
index is **re-derived independently in 4 pages** (`index.tsx`, `inventory.tsx`,
`fuel-operations.tsx`, `tank-readings-report.tsx`) - fragile and unstable.

---

## 3. Target model - one source of truth

### 3.1 Nozzle readings
- **Canonical:** the attendant's submitted reading (one capture path). Converge
  `/enter-readings` and `/my-shift` onto a single store of per-nozzle
  opening+closing (electronic+mechanical). **[NEEDS-VERIFY]** which path stays.
- **`storage['islands'].nozzles[].*_reading` = derived pointer** (last closing),
  written only from the canonical store; never read as sales truth.
- **`attendant_handovers.json.nozzle_summaries`, `tank_readings.json.nozzle_readings`,
  `storage['readings']` = derived** from the canonical store (strict per
  `nozzle_id`, per-tank via `get_nozzle_ids_for_tank`). Remove the dual-source
  merge in `_process_nozzle_readings`.
- **Opening = previous shift's closing for that nozzle**, fetched, **read-only**.

### 3.2 Tank dips
- **Canonical:** `storage['shifts'][sid].tank_dip_readings` (one writer).
  `tank_readings.json` dip fields become **derived**; unify on one volume field
  name (`*_volume_liters`).
- **Opening dip = previous shift's closing dip for that tank** (strict per
  `tank_id`), read-only; **opening volume** derived from opening dip via
  calibration.
- **Closing volume = calibration(closing dip)**, computed the moment the closing
  dip is entered (frontend live + backend on save), always recomputed when the
  dip changes.

### 3.3 Tank naming
- Add optional **`display_name`** to the tank object + `FuelTankLevel` model;
  **`tank_id` unchanged** (it's the FK everywhere - `tanks.py`(100 refs),
  `tank_readings.py`(73), `islands.py`(60), calibrations, reconciliation...).
- **Auto-generate** server-side: one helper computes `"{fuel} Tank {stableIndex} -
  {capacity:,} L"` from a stable per-fuel index (sorted tank_id). Set on create,
  refresh capacity portion on capacity change **if not customised**.
- **Editable:** new `PUT /tanks/{tank_id}/name` (mirror island rename); persisted.
- Return `display_name` from `/tanks/levels`; render it at **all** label sites;
  delete the 4 duplicated client-side index computations.

### 3.4 Calibration everywhere
- Replace the flat `TANK_CONVERSION_FACTOR` with `dip_to_volume(tank_id, dip)` in
  `tanks.py:379-385` and `shifts.py:514,517`; deprecate `config.py:185-208`.
- **Guard the fuel-type fallback** so two diesel tanks can't silently share a
  curve: require a per-tank chart (or surface "using default/cloned chart" and
  block reconciliation on it). Stop auto-cloning a sibling chart silently on
  create, or mark it provisional.
- **Kill fuel-type pooling** in shift-summary/reconciliation: always resolve
  nozzle->tank strictly; if mapping is missing, surface an error rather than pool
  two diesel tanks together.
- Surface the **calibration upload UI** on Infrastructure (endpoint exists at
  `tank_calibrations.py:84`, but no frontend caller today).

---

## 4. The "enter once, reflect everywhere" matrix

| Reading | Entered by (single point) | Auto-derived everywhere else |
|---|---|---|
| Nozzle opening (elec+mech) | nobody - carried from prior closing | my-shift, enter-readings, daily-tank-reading, handover, reports |
| Nozzle closing (elec+mech) | attendant once (canonical path) | islands pointer, handover summary, tank_readings nozzle block, reports, reconciliation |
| Tank opening dip + volume | nobody - carried from prior closing dip + calibration | daily-tank-reading, shifts, reconciliation, dashboard |
| Tank closing dip | supervisor/attendant once | closing volume (calibration), tank movement, reconciliation, reports |
| Tank closing volume | nobody - calibration(closing dip) | everywhere volume is shown |
| Tank name | auto + editable once (Infrastructure) | every dropdown, report, export, notification |

Rule enforced in code: **opening fields are read-only** (manager/owner override,
audited - reuse the dip-edit pattern already shipped).

---

## 5. Plan (phased, each verified against the net)

### Phase A - Tank naming [SAFE]
- A1 add `display_name` (model + tank object) + auto-name helper. [SAFE]
- A2 `PUT /tanks/{id}/name` + Infrastructure edit field. [SAFE]
- A3 surface `display_name` from `/tanks/levels`; render at all label sites;
  remove duplicated index logic. [SAFE] (display-only)

### Phase B - Calibration consistency [CHANGES-NUMBER]
- B1 replace flat factor with `dip_to_volume` in `tanks.py` + `shifts.py`. This
  changes dip-derived volumes to the calibrated (correct) value -> moves
  reconciliation tank-movement numbers. [CHANGES-NUMBER]
- B2 closing dip always (re)derives closing volume; frontend live-convert on
  entry. [CHANGES-NUMBER for any stale stored volume]
- B3 guard/remove the fuel-type calibration fallback + silent chart cloning;
  stop fuel-type pooling of the two diesel tanks. [CHANGES-NUMBER] (corrects the
  two-diesel-tank figures) + [NEEDS-VERIFY] (ensure all nozzles are tank-mapped)
- B4 expose calibration upload UI. [SAFE]

### Phase C - Carry-forward correctness [CHANGES-NUMBER]
- C1 make dip carry-forward strict per `tank_id` and validate the tank set
  (`previous-dip-readings`). [CHANGES-NUMBER where it currently gaps/mismatches]
- C2 unify the dip stores (shifts canonical; tank_readings derived; one volume
  field name). [CHANGES-NUMBER] + [NEEDS-VERIFY]
- C3 collapse nozzle stores to one canonical; islands/handover/tank_readings/reports
  become derived; remove the dual-source merge. [CHANGES-NUMBER] + [NEEDS-VERIFY]

### Phase D - Opening read-only + single capture
- D1 make opening dip/volume + nozzle opening read-only auto-filled, override for
  manager/owner. [SAFE] (UI) - the values were already auto-fetched.
- D2 converge `/enter-readings` and `/my-shift` onto one capture path (or make one
  strictly derive from the other). [NEEDS-VERIFY] - biggest structural change.

Order: A (safe, visible win, fixes naming/confusion) -> B (calibration truth) ->
C (carry-forward + store unification) -> D (read-only + capture convergence).

---

## 6. Safety net

The reports golden net (`backend/tests/golden`) already covers
`tank-readings/readings`, `movement`, three-way, reconciliation, and the reports.
Before Phase B/C:
- **Extend the fixture/matrix** to exercise carry-forward explicitly: two
  consecutive shifts on the same tank, two diesel tanks, a closing-dip change.
- Capture baseline; every [SAFE] step must show **0 diffs**; every
  [CHANGES-NUMBER] step's diff is reviewed and re-blessed (so the two-diesel-tank
  correction and calibration change are visible and intentional).
- Add focused unit tests for `dip_to_volume` per tank and for carry-forward
  matching strictly by tank_id/nozzle_id.

---

## 7. Open decisions (sign-off before building)

1. **Canonical nozzle store:** keep both `/enter-readings` and `/my-shift` (one
   derives from the other), or retire one capture path? (Affects Phase C3/D2.)
2. **Canonical dip store:** confirm `storage['shifts'].tank_dip_readings` as the
   single writer and `tank_readings.json` dips become derived (vs the reverse).
3. **Missing per-tank calibration:** for a tank with no uploaded chart, block
   conversion (force upload) or allow a clearly-flagged provisional curve?
4. **Opening override:** who may override a read-only opening - manager+owner
   (like the dip edit), or owner only?
5. **Name format:** confirm "Diesel Tank 2 - 14,000 L" exact format + thousands
   separator, and whether editing the name should also be allowed to change the
   shown capacity text.
