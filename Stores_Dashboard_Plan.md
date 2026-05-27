# Stores / Stock Dashboard — Plan

**Status:** Phases 1–3 implemented 2026-05-27 (backend, dashboard UI,
reconciliation linkage). Phase 4 (inter-station) deferred.
**Audience:** Manager and Owner only.

## 1. Confirmed decisions

| Decision | Choice |
|---|---|
| Items in scope | Lubricants, LPG accessories, **full cylinders**, **empty cylinders**, general (forecourt-sellable) accessories. Fuel stays in tanks/deliveries. |
| Integration | **Stores tier above** the existing forecourt flows. Existing lubricants/LPG/accessory daily modules remain the **sales-recording** UI; Stores is the inventory source of truth. |
| Multi-station | **Per-station only for now.** Inter-station transfers (owner) deferred to a later phase (model leaves room for it). |
| Roles | All stores operations: **manager or owner** (`require_manager_or_owner`). |

## 2. Model — two bins per item

Each stock item tracks two bins:
- **`stores`** — backroom / warehouse quantity.
- **`forecourt`** — quantity on the sales floor.

Movements (audited via `log_audit_event`, ledgered in `stock_movements.json`):
- **receive**: external → `stores` (`+stores`)
- **issue**: `stores` → `forecourt` (`-stores`, `+forecourt`)
- **damage**: bin → write-off (`-bin`), reason required
- **adjust**: set a bin to a counted value (physical count correction), reason required
- **sale**: `forecourt` → out (`-forecourt`) — fed from daily-sales reconciliation (Phase 3)
- **transfer**: station → station (deferred)

`item_key = "{category}:{product_code}"`; categories: `lubricant`, `lpg_accessory`,
`cylinder_full`, `cylinder_empty`, `accessory`.

**Re-order:** each item has `reorder_level` (+ optional `reorder_qty`). An item is
flagged `needs_reorder` when `stores <= reorder_level`; a `LOW_STOCK` notification
fires when an issue/damage crosses the threshold.

## 3. Storage (per station, dedicated JSON — matches daily modules)
- `stock_items.json` — catalog + current balances (`{item_key: {category, product_code, name, unit, stores, forecourt, reorder_level, reorder_qty, unit_cost}}`).
- `stock_movements.json` — append-only movement ledger.

## 4. Backend (Phase 1) — `app/services/stock_service.py` + `app/api/v1/stores.py`
Endpoints (prefix `/stores`, all `require_manager_or_owner`):
- `GET /stores/dashboard` — items with both bins + `needs_reorder`, summary counts, reorder alerts, recent movements.
- `GET /stores/items`, `POST /stores/items` — list / upsert a catalog item (+ reorder levels).
- `POST /stores/receive`, `/issue`, `/damage`, `/adjust` — movements (validated, guarded against negative balances).
- `GET /stores/movements` — filtered ledger.
- `POST /stores/seed-catalog` — import item definitions (names) from the existing lubricant / LPG-accessory catalogs + cylinder sizes, with zero balances (convenience).

## 5. Frontend (Phase 2) — `frontend/pages/stores.tsx`
Manager/owner-gated dashboard: stores vs. forecourt columns per item, reorder
alerts, and action buttons (Receive / Issue to forecourt / Record damage /
Adjust / Manage item). Movement history view.

## 6. Reconciliation linkage (Phase 3)
On Daily Close-Off, decrement each item's `forecourt` bin by the quantities sold
that day (from the LPG/lubricant/accessory daily entries + handover snapshots),
recording `sale` movements — so after reconciliation the dashboard shows the
true remaining forecourt stock and surfaces replenish-from-stores needs.

## 7. Deferred
- Inter-station transfers + owner cross-station aggregated dashboard.
- Supplier/PO management, costing/valuation reports.

## 8. Phasing
1. ~~**Backend foundation** (service, endpoints, tests).~~ ✅ Done — `stock_service.py`,
   `stores.py` (9 endpoints), `tests/test_stores.py` (9 tests).
2. ~~Frontend dashboard + action modals.~~ ✅ Done — `stores.tsx` (summary cards,
   reorder alerts, items table, receive/issue/damage/adjust/add-item modals,
   movement history); nav link under Inventory & Sales (manager/owner).
3. ~~Reconciliation sale-decrement linkage.~~ ✅ Done — **per-shift, on handover
   approval** (not at day close). `apply_handover_sales(station_id, handover)`
   runs in `attendant_handover.review_handover` (approve) and `batch_approve`:
   decrements the forecourt bin (lubricants, LPG accessories, full cylinders =
   refills + with-cylinder sales) and returns empties for refills
   (`cylinder_empty` += refills). Idempotent via the handover's `stock_applied`
   flag; lenient (clamps at zero, skips unknown items). Covered in
   `tests/test_stores.py`.
   *Note:* the generic `accessory` category has no auto-sales feed (handover
   "accessories" map to LPG accessories) — tracked manually for now.
4. (Later) inter-station transfers + cross-station view.
