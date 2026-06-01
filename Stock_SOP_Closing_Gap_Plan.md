# Stock-handling vs SOP — Closing the Gap Plan

**Status:** Plan only — not implemented.
**Date:** 2026-06-01
**Scope:** Bring lubricants / LPG cylinders / LPG accessories / general
accessories closer to standard fuel-station SOPs **without** changing how the
existing daily-entry, handover, and reconciliation flows behave today.

## 1. The four items

| # | Gap (from the SOP comparison) | Sits on top of |
|---|---|---|
| A | Damages handled inconsistently across categories | `lubricants_daily`, `lpg_daily` accessory rows, handover snapshot |
| B | No formal stock-take vs system reconciliation flow | Stores `adjust` primitive |
| C | No per-SKU reorder levels in legacy modules | `lubricant_products.json`, lpg accessories catalog |
| D | No supplier / GRN provenance on receive | Stores `receive` + legacy `additions`/`receipts` |

## 2. Cross-cutting "no-break" guarantees

These hold for **all four items**:

1. **Schema changes are additive-only.** New fields are `Optional` or have
   defaults; nothing is renamed or removed. Legacy records validate unchanged.
2. **Existing endpoints keep their contracts.** New request fields are optional;
   new response fields are extra (clients that ignore them are unaffected).
3. **Default values reproduce today's behaviour byte-for-byte.** If a user (or
   an attendant client) submits without the new fields, the row, the variance
   computation, the audit trail, the notification, and the reconciliation math
   are identical to what they are today.
4. **No business logic in the variance / reconciliation paths is touched.** The
   `_compute_auto_flags`, `_process_stock_snapshot`, `_validate_shift_and_assignment`,
   shift-status, and stores-on-approval paths are read-only in this work.
5. **Phased, independent rollout.** Each item ships and is reversible on its own;
   later items don't depend on earlier ones beyond the model fields they add.
6. **Tests pin the unchanged behaviour first.** Each phase adds a regression
   test that submits a payload **without** the new fields and asserts the
   response and audit are identical to today's.

---

## 3. A — Consistent damages (highest value, smallest change)

**Today.** Lubricants and LPG accessories have NO `damaged` field at the daily
module level — damages exist only inside the per-shift handover snapshot
(`AccessoryStockLineItem`, `LubricantStockLineItem`). LPG cylinders track
`damaged` in the daily row already (`LPGStockLineItem`). General accessories
have no standalone catalog.

**Change.**
- Add to `LubricantDailyRow` (`models.py`) and the LPG-accessory daily row:
  - `damaged: int = 0`
  - `damage_note: Optional[str] = None`
- Add to the *parent* daily-entry record (one per submission):
  - `damage_status: str = "none"` ("none" | "pending" | "approved")
  - `damage_authorised_by: Optional[str] = None`
  - `damage_authorised_at: Optional[str] = None`
- **Validation:** if any row has `damaged > 0`, `damage_note` is required and
  the entry is saved with `damage_status="pending"`.
- **New endpoint** (manager/owner):
  `POST /lubricants-daily/{entry_id}/authorise-damage` and
  `POST /lpg-daily/{entry_id}/authorise-damage` — sets `damage_status="approved"`,
  records `damage_authorised_by` + timestamp, logs audit `action="damage_authorise"`.
- **No change** to variance computation: damages flow into the existing
  `expected_closing = opening - sold - damaged` formulas exactly as the
  LPG-cylinder model already does. For lubricants/lpg-accessories, the default
  `damaged=0` means today's formula `expected = opening + additions - sold` is
  preserved when no damage is recorded.

**Files:** `backend/app/models/models.py`, `backend/app/api/v1/lubricants_daily.py`,
`backend/app/api/v1/lpg_daily.py`, `backend/tests/test_*_damages.py`,
`frontend/pages/lubricants-daily.tsx`, `frontend/pages/lpg-daily.tsx`.

**Stays untouched:** the handover snapshot's existing damage capture; the
reconciliation math; the daily submission endpoint signatures (`damaged` and
`damage_note` are optional).

**Tests:**
- Submit a daily entry without any damage fields → identical response to today,
  no audit `damage_authorise` event, `damage_status` defaults to `"none"`.
- Submit with `damaged>0` and no note → 400.
- Submit with `damaged>0` and a note → saved as `pending`; manager calls
  authorise → `approved` + audit event recorded.

---

## 4. B — Stock-take vs system reconciliation flow

**Today.** Stores already has `adjust(item_key, bin, new_qty, reason)` — that's
the count-correction primitive. There's no UI flow that frames a periodic
count, no audit trail tying a set of adjustments to a single count event, and
no manager sign-off for material variances.

**Change** (entirely additive — sits on top of `adjust`).
- New per-station file: `stock_takes.json`. Each session:
  ```
  { take_id, date, scope: "all" | [item_key...], status: "draft"|"submitted"|"approved",
    lines: [{ item_key, system_qty_at_open, counted_qty, variance, note }],
    started_by, started_at, submitted_by, submitted_at,
    approved_by, approved_at, total_variance_value? }
  ```
- New endpoints under `/stores/stock-takes` (manager/owner):
  - `POST /` create draft.
  - `GET /` list, `GET /{id}` detail.
  - `PATCH /{id}/lines` upsert counted quantities.
  - `POST /{id}/submit` — for each line with `variance ≠ 0`, calls
    `stock_service.adjust(... reason=f"Stock take {date}", ref=take_id)`,
    flips status to `"submitted"`. **All adjustments use the existing
    movement ledger and reorder-notification path** — no separate write-path.
  - `POST /{id}/approve` (owner) — sets status `"approved"`, audit.
- **Concurrency:** while a take is `draft`/`submitted`, capture `system_qty_at_open`
  per line at create-time; do **not** lock the bin. Other movements still flow
  through normally. The take records what was on file when the count started so
  variance is reproducible.

**Files:** `backend/app/api/v1/stores.py` (extend) or new `stock_takes.py`,
`backend/app/services/stock_service.py` (no change), `frontend/pages/stores.tsx`
(new tab) or `frontend/pages/stock-takes.tsx`.

**Stays untouched:** every existing Stores movement (`receive` / `issue` /
`damage` / `adjust`) keeps its current contract. Daily modules untouched.

**Tests:**
- Create take, count a few lines, submit → corresponding `adjust` movements
  appear with `ref=take_id` and `reason` mentioning the take date.
- An item not included in the take is unaffected.
- Approve flips status; second approve is a no-op or 400.

---

## 5. C — Per-SKU reorder levels in legacy modules

**Today.** Lubricants and LPG accessories use a **station-wide percentage
threshold** (`StockAlertSettings.low_stock_threshold_percent` / `critical`),
which can hide a critical SKU behind healthy averages. The Stores subsystem
already has per-SKU `reorder_level` per item.

**Change.**
- Add `reorder_level: int = 0` to:
  - Each row of `lubricant_products.json` (and the editable pricing payload
    that supervisors use today).
  - Each LPG accessory catalog row.
- Low-stock detection becomes:
  - If `reorder_level > 0`: trigger `LOW_STOCK` when `balance <= reorder_level`.
  - Else (default 0): **fall back to today's percentage logic**, byte-for-byte.
- `LOW_STOCK` notifications already exist (from the Stores work) — reuse, no
  new channel.

**Files:** `backend/app/api/v1/lubricants_daily.py` (catalog endpoints + the
balance-check that fires alerts), `backend/app/api/v1/lpg_daily.py`,
`backend/app/models/models.py` (LubricantProduct, LPG accessory item),
`frontend/pages/lubricants-daily.tsx` (pricing-edit modal), settings.

**Stays untouched:** the global `StockAlertSettings` thresholds — kept as the
**fallback** so any SKU left at 0 behaves exactly as today.

**Tests:**
- SKU with `reorder_level=0` and current balance below the global percentage →
  `LOW_STOCK` fires (today's behaviour).
- SKU with `reorder_level=5` and balance=4 → `LOW_STOCK` fires (new behaviour).
- SKU with `reorder_level=5` and balance=8 → no alert (overrides today's global
  percentage when explicit per-SKU is set).

---

## 6. D — Suppliers + GRN provenance on receive

**Today.** Receiving stock is just an `additions` or `receipts` number in a
daily entry, or the Stores `receive` movement with a free-text note. No
supplier, no delivery-note reference, no invoice match.

**Change.**
- **New model** `Supplier`: `supplier_id`, `name`, `contact_person`, `phone`,
  `email`, `address`, `is_active=True`. Per-station `suppliers.json`.
- **New CRUD** under `/suppliers` (manager/owner).
- **Extend `ReceiveInput` (Stores):** add optional `supplier_id`,
  `delivery_note_ref`, `invoice_ref`. Already takes `unit_cost`. Each receive
  movement records them on the ledger entry.
- **Legacy daily flows:** add optional `supplier_id` + `delivery_note_ref` to
  the per-row `additions` schema — the row already exists, we add metadata
  alongside. No change to the addition's quantity effect.
- **No PO/invoice match cycle** in scope here — that's a bigger workflow. We're
  only adding **provenance**, which is the SOP minimum.

**Files:** `backend/app/api/v1/suppliers.py` (new), `backend/app/models/models.py`,
`backend/app/api/v1/stores.py` (extend `ReceiveInput`),
`backend/app/api/v1/lubricants_daily.py` and `lpg_daily.py` (optional new fields
on additions rows), `frontend/pages/suppliers.tsx` (new),
`frontend/pages/stores.tsx` (receive modal: supplier dropdown + delivery-note
input).

**Stays untouched:** the quantity math on every receive/addition; the existing
Stores receive endpoint when called without supplier (still records the
movement, supplier just `null`).

**Tests:**
- Stores `receive` without supplier → identical behaviour to today.
- Stores `receive` with `supplier_id="SUP-1"` → movement ledger row carries
  supplier id, delivery-note ref, invoice ref.
- Supplier CRUD smoke tests + role gating (attendant/supervisor 403, manager OK).

---

## 7. Phasing (independent, reversible)

Each item ships standalone; nothing later depends on something earlier landing.

1. **Phase A — Damages consistency.** Lowest risk, immediate SOP win. Touches
   two models + two endpoints + two UI pages + the audit chain.
2. **Phase B — Stock-take flow.** Pure addition on top of Stores. Zero legacy
   surface touched.
3. **Phase C — Per-SKU reorder levels.** Two catalogs + low-stock check
   branches. Falls back to today's behaviour when `reorder_level=0`.
4. **Phase D — Suppliers + GRN.** Largest of the four (new CRUD + UI) but
   entirely additive metadata; never affects quantity computation.

## 8. Open questions

- **Damage authorisation flow:** should `damage_status="pending"` BLOCK the
  daily submission from being approved at close-off, or only surface as a
  flag the manager can resolve? (Plan assumes flag-only — non-blocking.)
- **Stock-take scope:** is it always station-wide, or do you want category /
  SKU-filtered takes (e.g. "today: lubricants only")?
- **Per-SKU vs global thresholds:** when a SKU has `reorder_level > 0`, should
  the global `StockAlertSettings` percentage still also apply (whichever
  triggers first), or does the per-SKU value fully override? (Plan assumes
  override.)
- **Supplier scope:** one supplier list per station (per the existing
  per-station storage pattern), or a shared registry across all stations?
- **Approval thresholds for damages / stock-takes:** should a value-based
  threshold (e.g. variance > K10 000) require *owner* sign-off, not just
  manager? (Mirrors P0-3 flagged-handover note pattern.)
