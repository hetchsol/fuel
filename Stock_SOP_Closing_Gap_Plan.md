# Stock-handling vs SOP — Closing the Gap Plan

**Status:** Phases A, B, C implemented. Phase D is the remaining master plan.
**Date:** 2026-06-01 (Phase D expanded 2026-06-03)
**Commits:**
- Phase A backend `fd374bd`, frontend `c3578bc`
- Phase B backend `0591c3e`, frontend `f06d1c6`
- Phase C end-to-end `7a250d9`
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

## 3. A — Consistent damages (highest value, smallest change) — ✅ IMPLEMENTED (`fd374bd` + `c3578bc`)

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

## 4. B — Stock-take vs system reconciliation flow — ✅ IMPLEMENTED (`0591c3e` + `f06d1c6`)

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

## 5. C — Per-SKU reorder levels in legacy modules — ✅ IMPLEMENTED (`7a250d9`)

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

## 6. D — Suppliers + GRN provenance on receive — ⬜ MASTER PLAN (pending)

**Today.** Receiving stock is just an `additions` or `receipts` number in a
daily entry, or the Stores `receive` movement with a free-text note. No
supplier, no delivery-note reference, no invoice match — so stock has no
provenance and there's nothing to reconcile against supplier statements.

**Goal.** Add the SOP minimum — a Goods Received Note (GRN) provenance chain:
every "added" unit is traceable to a supplier + delivery note + invoice.
A full PO → GRN → invoice match cycle is **out of scope** here; that's a
separate (bigger) plan.

### 6.1 Data model

**`Supplier`** (per-station, `suppliers.json`):
- `supplier_id: str` — server-generated, `SUP-{timestamp}-{rand}`
- `name: str` — required, **unique per station** (case-insensitive)
- `contact_person: Optional[str]`
- `phone: Optional[str]`
- `email: Optional[str]`
- `address: Optional[str]`
- `tax_id: Optional[str]` — TPIN for ZRA compliance (Zambia-specific)
- `is_active: bool = True`
- `notes: Optional[str]`
- `created_by`, `created_at`, `updated_by`, `updated_at`

**GRN metadata** attached to receive movements / daily-entry additions:
- `supplier_id: Optional[str]` — soft reference to a Supplier
- `delivery_note_ref: Optional[str]` — the supplier's delivery-note number
- `invoice_ref: Optional[str]` — invoice number
- `unit_cost: Optional[float]` — already exists on Stores `receive`; expose on
  legacy daily additions too
- `condition_note: Optional[str]` — e.g. "1 carton dented on arrival"

### 6.2 Endpoints

**New `/suppliers` router** (`backend/app/api/v1/suppliers.py`, manager/owner):
- `POST /suppliers` — create. Validates unique name; server generates id.
- `GET /suppliers?active_only=true` — list (default active-only).
- `GET /suppliers/{id}` — detail.
- `PUT /suppliers/{id}` — update fields.
- `POST /suppliers/{id}/deactivate` — soft-delete (`is_active=False`); historical
  references remain valid, new receives can't pick this one.
- `POST /suppliers/{id}/reactivate` — for when a supplier returns.

**Extend existing endpoints (additive — every new field is `Optional`):**
- Stores `POST /stores/receive` — accept `supplier_id`, `delivery_note_ref`,
  `invoice_ref`, `condition_note`. Movement ledger entry records them.
- Lubricants `POST /lubricants-daily/entry` — add **entry-level** (not per-row)
  `supplier_id`, `delivery_note_ref`, `invoice_ref`, `unit_cost`. A delivery
  typically spans multiple SKUs from one supplier in one session.
- LPG cylinders `POST /lpg-daily/entry` — same entry-level fields.
- LPG accessories `POST /lpg-daily/accessories/entry` — same.

**Server-side validation** (consistent across all flows):
- When `supplier_id` is provided, it must exist and be `is_active=True`
  → otherwise **400** with a clear message.
- Free text fields trimmed; empty `""` treated as `None`.

### 6.3 Frontend

**New page `frontend/pages/suppliers.tsx`** (manager/owner only):
- Table: name, contact, phone, status (Active / Inactive).
- "Add Supplier" button → modal with name + optional fields.
- Inline **Edit** + **Deactivate / Reactivate** actions.
- Search / filter by name.
- Nav link added under **Administration** in `components/Layout.tsx`.

**Stores receive modal** (existing `pages/stores.tsx`):
- Supplier dropdown (fetched from `/suppliers?active_only=true`, default
  blank = "no supplier").
- Delivery-note ref, invoice-ref, condition-note inputs (optional).
- All fields submit blank by default → existing behaviour preserved.

**Daily-entry pages** (`lubricants-daily.tsx`, `lpg-daily.tsx`):
- A small "Receipt source" panel appears when any row has `additions > 0`.
  Contains: Supplier dropdown + Delivery Note Ref + Invoice Ref + unit-cost
  (optional). Submit only includes them when filled.
- Same panel layout for cylinders + accessories pages, sharing a small
  `<ReceiptSource />` component to keep markup consistent.

### 6.4 Sub-phasing (each ships and is reversible on its own)

1. **D.1 — Suppliers CRUD backend.** New `suppliers.py` + per-station
   `suppliers.json` + role gating + uniqueness validation + tests. Nothing
   in the existing flows consumes it yet → zero risk to live behaviour.
2. **D.2 — Stores `receive` GRN extension.** Add the optional fields to
   `ReceiveInput`; lookup supplier on submit; record on the movement entry.
   Frontend Stores receive modal gains the new inputs.
3. **D.3 — Suppliers admin page + nav link.** Pure frontend; now managers
   can curate the list before depending on it elsewhere.
4. **D.4 — Legacy daily modules GRN extension.** Add entry-level optional
   supplier/delivery-note/invoice/unit-cost fields to the three daily
   submits; render the `<ReceiptSource />` panel on the three pages.

The phases are intentionally ordered so the **Suppliers list exists before
any flow can require one**, preventing a "stuck workflow" during rollout.

### 6.5 Stays untouched

- **Quantity math** on every receive/addition stays bit-for-bit unchanged —
  GRN metadata is record-keeping only, never affects balances.
- **Existing endpoints when called without the new fields**: identical
  response shape, identical movement ledger entries, identical audit log
  (with the new fields just absent).
- **Existing notification dedup** (24h) and audit patterns reused — no new
  channels.
- **No renames, no removals**. Pure additive.

### 6.6 Tests

Backend:
- Supplier CRUD smoke: create, get, update, deactivate, list with
  `?active_only` filter, role gating (attendant/supervisor 403, manager OK).
- Duplicate name (case-insensitive) on create → 400.
- Stores `receive` **without** supplier → identical response + identical
  ledger entry as today (regression).
- Stores `receive` **with** supplier metadata → movement ledger carries
  supplier_id + delivery_note_ref + invoice_ref + condition_note.
- Stores `receive` with **unknown** supplier_id → 400.
- Stores `receive` with **inactive** supplier_id → 400.
- Daily lubricant entry without supplier → identical response (regression).
- Daily lubricant entry with valid supplier → entry stored with GRN fields.
- Daily lubricant entry with unknown supplier → 400.

Frontend:
- `tsc --noEmit` clean.
- Suppliers page: create → appears in list; deactivate → status updates;
  cannot pick from dropdown after deactivation.

### 6.7 Files touched

Backend:
- `backend/app/api/v1/suppliers.py` (new)
- `backend/app/api/v1/__init__.py` (router registration)
- `backend/app/models/models.py` (`Supplier` model)
- `backend/app/api/v1/stores.py` (extend `ReceiveInput` + movement payload)
- `backend/app/services/stock_service.py` (add GRN fields to `receive()`'s
  movement record — additive only)
- `backend/app/api/v1/lubricants_daily.py` (entry-level GRN fields,
  supplier validation on submit)
- `backend/app/api/v1/lpg_daily.py` (same, for cylinder + accessory entries)
- `backend/tests/test_suppliers.py` (new)
- `backend/tests/test_grn_receive.py` (new)

Frontend:
- `frontend/pages/suppliers.tsx` (new)
- `frontend/components/Layout.tsx` (nav link)
- `frontend/pages/stores.tsx` (receive modal extension)
- `frontend/pages/lubricants-daily.tsx` (`<ReceiptSource />` panel)
- `frontend/pages/lpg-daily.tsx` (panel for cylinders + accessories)
- `frontend/components/ReceiptSource.tsx` (new shared component)

---

## 7. Phasing (independent, reversible)

Each item ships standalone; nothing later depends on something earlier landing.

1. ~~**Phase A — Damages consistency.**~~ ✅ Done — `fd374bd` / `c3578bc`.
2. ~~**Phase B — Stock-take flow.**~~ ✅ Done — `0591c3e` / `f06d1c6`.
3. ~~**Phase C — Per-SKU reorder levels.**~~ ✅ Done — `7a250d9`.
4. **Phase D — Suppliers + GRN.** ⬜ Master plan above. Largest of the four
   (new CRUD + UI) but entirely additive metadata; never affects quantity
   computation. Sub-phased D.1 → D.4 so the Suppliers list exists before
   any receive flow can require one.

## 8. Open questions

**Resolved during implementation:**
- ~~Damage authorisation flow~~ — defaulted to **flag-only, non-blocking** in
  Phase A (close-off proceeds even if `damage_status="pending"`).
- ~~Stock-take scope~~ — Phase B supports both station-wide and scoped takes
  via the optional `scope_item_keys` parameter on `POST /stores/stock-takes`.
- ~~Per-SKU vs global thresholds~~ — Phase C **fully overrides** the global
  percentage when a per-SKU `reorder_level > 0` is set (per the plan).
- ~~Approval thresholds for damages / stock-takes~~ — kept simple: any
  manager+ can authorise damages; only owner can approve stock takes.
  Value-based escalation is a future refinement.

**Open for Phase D:**
1. **Supplier scope:** one supplier list **per station** (matches existing
   storage pattern), or a **shared registry** across all stations? Plan
   defaults to per-station. A shared registry would need a new top-level
   storage area and a sync mechanism, which is a bigger change.
2. **Soft vs hard delete:** keep deactivated suppliers in storage for
   historical lookup, or remove? Plan defaults to **soft delete** via
   `is_active=False` so old GRN references stay resolvable.
3. **Mandatory once configured:** should adding the first Supplier make
   `supplier_id` **required** on subsequent receives? Plan defaults to
   **always optional** so today's zero-friction receive is preserved.
4. **TPIN (`tax_id`) field:** include on Supplier for ZRA compliance? Plan
   defaults to **yes, optional** (Zambia-specific but doesn't hurt elsewhere).
5. **Per-row vs per-entry supplier** on legacy daily flows: a delivery
   usually spans multiple SKUs from one supplier. Plan defaults to
   **per-entry**; per-row override can be added later if a real case appears.
6. **Cost-of-goods downstream:** `unit_cost` on receive now enables margin
   reporting later. Out of scope here, but the field is included so the
   data is captured.
