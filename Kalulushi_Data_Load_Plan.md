# Kalulushi Station - Live Data Load Plan

**Status:** Plan only - NOT executed. Needs sign-off + the inputs in Section 9.
**Date:** 2026-06-05
**Goal:** Fuse live data into the Kalulushi station with **100% accuracy**:
- previous shift's **closing readings** become this shift's **opening readings**,
- **tank dip readings** + **dip-to-volume calibration** for the 3 tanks,
- the real **station layout** (3 islands, 6 nozzles),
- and first **remove all current test readings and stock values**.

This is **live, destructive** work, so the rule is: **back up, dry-run, apply,
then verify against the source (100% match)** - nothing runs without sign-off.

---

## 1. What is already confirmed (from the files + code)

- **Calibration source:** `DIP CHAT (1).xlsx`, 3 sheets = 3 tanks. Each sheet is a
  strapping table, dip in **0.1 cm steps**, layout `(blank, Dip, Volume)`:
  - **Petrol 1** - petrol, ~2,216 points, max calibrated **30,500 L** at 222.5 cm
  - **Diesel 2** - diesel, ~2,211 points, max calibrated **30,500 L** at 222 cm
  - **Diesel 3** - diesel, ~889 points, max calibrated **7,067 L** at 89.9 cm
  (Rows past the calibrated max have blank volume and will be ignored.)
- **Layout:** 3 islands - Island 1 = 2 petrol nozzles; Island 2 = 1 petrol + 1
  diesel; Island 3 = 2 diesel nozzles (6 nozzles total).
- **How the system stores each piece** (so the script targets the right place):
  - **Calibration** -> per-station `tank_calibrations.json` as `{tank_id: {chart:
    {dip_cm: volume_L}, ...}}`; converted by linear interpolation
    (`dip_conversion.dip_to_volume`). Upload endpoint exists
    (`POST /tank-calibrations/upload`) but expects dip in column A / volume in
    column B - our sheets have a leading blank column, so the script will realign.
  - **Opening nozzle readings** -> `islands.json` nozzle fields
    `electronic_reading` / `mechanical_reading`. With no prior shift, the first
    shift's **opening = these stored values**, so setting them to the live closing
    readings is exactly right.
  - **Tank dips/levels** -> the day's tank reading / shift dip; volume derived from
    calibration.
  - **Stock** -> LPG/lubricant/accessory daily opening balances and Stores stock.

---

## 2. Recommended approach: a verifiable script (not manual)

Manual entry is infeasible (about 6,650 calibration points across 3 tanks) and
error-prone. We use **one Python script** with three modes:

1. **`--backup`** - copy the station's storage first (always).
2. **`--dry-run`** - read the source, show exactly what WOULD change (counts, a
   sample, and the full diff), write nothing.
3. **`--apply`** - perform the load, then immediately **`--verify`** (read back and
   assert every value equals the source; fail loudly on any mismatch).

It is **idempotent** (safe to re-run) and prints a per-phase verification report.

---

## 3. WHERE it runs (must decide first - Section 9, Q1)

- **If the live data goes into the Render (hosted) instance:** the script must use
  the **REST API** against the live URL (with owner credentials). Render's disk is
  ephemeral, so direct JSON edits would not persist - the API path (which also
  writes to the database, if configured) is the only safe route. We must also
  confirm how that instance persists data (Postgres vs files).
- **If it runs on a local / self-hosted instance:** the script can write the
  station's JSON storage **directly** (backend stopped), which is simplest and
  exact, or use the local API.

This choice changes the script's write path; everything else is the same.

---

## 4. Phase 0 - Back up, then clear test readings & stock

1. **Back up** the Kalulushi station storage folder (and/or DB rows) to a
   timestamped copy. No further step proceeds without this.
2. **Clear test transactional data** for Kalulushi only:
   - shifts, attendant readings, handovers, opening verifications
   - tank readings, deliveries, sales/readings, reconciliations
   - LPG / lubricant / accessory daily entries
3. **Reset stock values** (LPG cylinders, lubricants, accessories, Stores/forecourt
   balances) to the live opening figures (Phase 5) - or to zero if you prefer to
   start clean and let the first counts establish them (Section 9, Q7).
4. **Keep** (do not wipe): the station record, islands/nozzles config, tanks,
   settings, users, product catalogs, accounts.

A precise "clear list" vs "keep list" will be confirmed before running.

---

## 5. Phase 1 - Station & infrastructure (CONFIRMED layout)

**Calibration source:** `DIP CHAT (1) (1).xlsx` (Downloads) - 3 sheets, full
range; petrol verified exact (49.8 cm -> 5071 L).

**Tanks (3):**
| Tank | Fuel | Capacity | Calibration sheet | Feeds nozzles |
|---|---|---|---|---|
| Petrol tank | Petrol | ~30,500 L (calib max) | "Petrol 1" (verified) | Island 1A, 1B, 2A |
| Tank 2 | Diesel | 30,000 L | "Diesel 2" (max 30,500 L - good match) | Island 3A, 3B |
| Tank 3 | Diesel | **14,000 L** | "Diesel 3" - **CAPACITY MISMATCH** (the available table maxes at ~30,500 L, an older copy at ~7,067 L; neither matches a 14,000 L tank) | Island 2B |

**Confirmed nozzle -> tank mapping (the 6 nozzles):**
- Island 1A petrol -> Petrol tank
- Island 1B petrol -> Petrol tank
- Island 2A petrol -> Petrol tank
- Island 2B diesel -> **Tank 3 (14,000 L)**
- Island 3A diesel -> **Tank 2 (30,000 L)**
- Island 3B diesel -> **Tank 2 (30,000 L)**

**Open calibration item:** we do not yet have a strapping table that matches the
**14,000 L Tank 3**. The "Diesel 3" sheets on hand calibrate to ~30,500 L (this
file) or ~7,067 L (older file) - neither is a 14,000 L tank. The correct Tank 3
table is required before its dip can be converted accurately.

---

## 6. Phase 2 - Tank calibrations (3 strapping tables)

- For each sheet in `DIP CHAT (1).xlsx`, read `(Dip, Volume)` (realigning for the
  leading blank column), drop rows with blank volume, sort by dip, and load as the
  tank's `chart`.
- Map sheets to tanks: `Petrol 1 -> petrol tank`, `Diesel 2`/`Diesel 3 -> the two
  diesel tanks` (Section 9, Q8 to confirm exact tank ids).
- **Verify:** point counts (Petrol 1 ~2,216; Diesel 2 ~2,211; Diesel 3 ~889) and
  spot-check several dips convert to the exact source volume.

---

## 7. Phase 3 - Opening readings (closing -> opening)

- For each of the 6 nozzles, set `electronic_reading` and `mechanical_reading` in
  `islands.json` to the **live previous-shift closing values** (Section 9, Q5).
- Because there is no prior shift after the reset, these become the **opening
  readings** for the first live shift automatically.
- **Verify:** read each nozzle back; assert it equals the source exactly.

---

## 8. Phase 4 & 5 - Opening tank dips and opening stock

- **Dips (Q6):** set each tank's current **dip (cm)**; the system converts to
  volume via the new calibration. Verify the converted volume matches expectation.
- **Stock (Q7):** load live opening **LPG cylinders (by size)**, **lubricants**,
  and **accessories**, or set to zero. Verify balances.

**Final verification:** a single report asserting calibration point counts,
nozzle readings, dips/volumes, and stock all equal the source - any mismatch
aborts and points to the exact field.

---

## 9. Inputs and decisions needed before we run

1. **Environment:** live **Render** instance (use the API; confirm persistence) or
   a **local/self-hosted** instance (direct file load)? Provide the URL + owner
   login if it is the API.
2. **Station:** the Kalulushi **station_id** - does it already exist (with the test
   data to clear), or should we create it?
3. **Tanks:** confirm the 3 tank IDs/names and **capacities** (use the calibration
   maxima ~30,500 / ~30,500 / ~7,067 L, or give nominal values).
4. **Nozzle-to-tank mapping (critical):** which tank feeds each of the 6 nozzles -
   especially which diesel nozzles draw from **Diesel 2** vs **Diesel 3**.
5. **Closing readings:** the electronic + mechanical closing reading for **each of
   the 6 nozzles** (file or table).
6. **Tank dips:** the current **dip (cm)** for each of the 3 tanks.
7. **Opening stock:** load live LPG/lubricant/accessory opening balances (provide
   them), or reset stock to **zero**?
8. **Calibration mapping:** confirm `DIP CHAT (1).xlsx` is the source and the sheet
   to-tank mapping (Petrol 1 / Diesel 2 / Diesel 3).

## 10. Order of operations (once inputs are in)

1. Back up. 2. Dry-run the full load and review the diff. 3. On sign-off: clear
test data (Phase 0), build/confirm infra (Phase 1), load calibrations (Phase 2),
set opening readings (Phase 3), set dips (Phase 4) and stock (Phase 5). 4. Run
verification; confirm 100% match. 5. Spot-check in the UI (open a shift; opening
readings and dip-derived volumes should match the source).
