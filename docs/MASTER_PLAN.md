# Fuel Management System — Master Plan & Known Issues
_Last updated: 2026-06-11_

---

## Completed Work (this sprint)

| # | Title | Commit | Status |
|---|-------|--------|--------|
| 10 | Unified review queue (nozzle readings + financial handovers) | `5647e59` | Done |
| 11 | LPG pricing — remove editor from `lpg-daily.tsx`; canonical edit in `stores.tsx` only | `c2848b8` | Done |
| 2a | Delivery consolidation — single write path to `tank_deliveries.json`, manager+ role gates, write-through for inline deliveries | `f38d044` | Done |
| 2b | Dip-based delivery recording — replace volume inputs with dip cm inputs, calibration lookup, sequence guard, three-way recon | `1f0bba8` | Done |

---

## Open Issues

### Issue 3 — (details needed)
_From earlier analysis: relates to manager menu._

### Issue 4 — (details needed)
_From earlier analysis: relates to close shift workflow._

### Issue 5 — (details needed)
_From earlier analysis: relates to close shift workflow._

> These three were identified in a prior session but their full scope was not captured before context ran out. Confirm scope with user when resuming.

---

## Infrastructure / Operational Items

### TANK-DIESEL-2 Calibration (Kalulushi — ST001)
**Status:** Provisional — wrong strapping table loaded.

- Tank is 14,000 L but the only available table either maxes at ~30,500 L or 7,067 L.
- Current level (1,820 L) is fine — set from owner's stated volume, not from dip.
- **Future dip → volume conversions on TANK-DIESEL-2 will be wrong** until correct table is loaded.
- Owner said: "use what we have, we will make a correction later."

**When correct table arrives:**
1. Update `DIP CHAT (1) (1).xlsx` with the correct `Diesel 3` sheet (14,000 L table)
2. Run `python kalulushi_import.py --dry-run` to verify
3. `python logout_all.py` (prevents in-memory cache overwrite)
4. `python kalulushi_import.py --apply --yes`
5. Owner logs in → triggers `reload_station_from_db` (memory = DB)
6. `python kalulushi_import.py --verify-only`

**Critical deployment note:** DO NOT restart the server after a direct DB edit while the app is running. The shutdown hook flushes the stale in-memory station_storage over your DB change. Always follow the logout → apply → owner-login sequence. See `memory/project_kalulushi_golive.md` for full detail.

### Neon DB Password
The `neondb_owner` password was visible in chat on 2026-06-05. **Rotate it.**

---

## Architecture Reference

### Role Hierarchy
```
user (attendant) -> supervisor -> manager -> owner
```

### Canonical Data Stores
| Store | File key | Purpose |
|-------|----------|---------|
| Nozzle readings | `attendant_readings.json` | Raw opening/closing nozzle reads; keyed `AR-{shift_id}-{user_id}-O/C` |
| Financial handovers | `attendant_handovers.json` | Cash/credit handover data; keyed `HO-{shift_id}-{user_id}-{HHMMSS}` |
| Fuel deliveries | `tank_deliveries.json` | All delivery records; keyed `DEL-{tank}-{date}-{hash8}` |
| Daily tank readings | `tank_readings.json` | Tank readings with linked delivery refs |
| LPG pricing | `stores.tsx` / stores API | Edited by manager+ only |

### Shift Lifecycle
```
active -> completed -> reconciled
         (all attendants approved)  (Daily Close-Off / banking)
```
- `auto-closed` at 20:00 if still active
- `reconciled` and `inactive` are locked (read-only)
- Attendant readings submission requires container shift to be `active`

### Delivery Recording (post Issue 2b)
- **Input:** `before_delivery_dip_cm`, `after_delivery_dip_cm` (cm), `invoice_volume_liters`, `flowmeter_volume`, `supplier`, `invoice_number`
- **System derives:** `volume_before`, `volume_after` via `dip_to_volume()` in `services/dip_conversion.py`
- **Guards:** after_dip > before_dip; volume_after <= capacity; sequence guard against last delivery's after-volume (0.5%/10L tolerance)
- **Reconciliation:** three-way (dip-actual vs invoice vs flowmeter) via `compute_delivery_recon()`
- **Calibration preview:** `GET /api/v1/tank-calibrations/{tank_id}/convert?dip_cm=X` on blur in UI
- **Role gate:** manager+ only on all delivery endpoints

### Tank Volume Movement Formula
```
movement = (opening_volume - closing_volume) + sum(actual_delivered_N)
```
Where each `actual_delivered_N = volume_after_N - volume_before_N` (dip-derived).

---

## Key Files

| File | Purpose |
|------|---------|
| `backend/app/models/models.py` | Pydantic models — `TankDeliveryInput`, `TankDeliveryOutput`, `DeliveryReference` |
| `backend/app/api/v1/tank_readings.py` | `record_delivery`, `submit_tank_reading` |
| `backend/app/api/v1/tank_calibrations.py` | Calibration upload, `GET /{tank_id}/convert` |
| `backend/app/services/dip_conversion.py` | `dip_to_volume()`, `validate_dip_reading()` |
| `backend/app/services/tank_movement.py` | `calculate_tank_volume_movement_v2()` |
| `frontend/pages/fuel-operations.tsx` | Delivery form (manager+) with live dip preview |
| `frontend/pages/daily-tank-reading.tsx` | Tank reading form with linked delivery display |
| `frontend/pages/handover-review.tsx` | Unified review queue (handovers + ER readings) |
| `frontend/components/Layout.tsx` | Nav definitions — MANAGER_NAV, DEFAULT_NAV |
| `kalulushi_import.py` | Kalulushi data importer (--dry-run / --apply / --verify-only) |
| `logout_all.py` | Clear all sessions before live DB edits |

---

## Flow Chart PDFs (this folder)
- `delivery_flow_single.pdf` — Single delivery: guards, calibration lookup, three-way recon
- `delivery_flow_multi.pdf` — Four deliveries in one shift: sequence chain, sales periods, closing reconciliation
