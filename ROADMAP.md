# Fuel Station Management System — Improvement Roadmap

## Overview

This roadmap addresses the highest-priority improvements identified in the system review. All changes are **additive** — no existing API responses change shape, no stored data becomes invalid, and each phase is independently deployable.

### What's excluded (too risky or too large right now)
- **Database migration** — massive scope, high risk, defer to future
- **JWT token migration** — would invalidate all existing sessions
- **Offline/service worker support** — complex, defer
- **Previous shift auto-populate** — already fully implemented
- **Notification system** — medium priority, defer

---

## Phase 1: Security Hardening

**Priority:** Critical | **Risk:** Low | **Breaking Changes:** None

### 1A. Auth guards on unprotected user management endpoints

**File:** `backend/app/api/v1/auth.py`

Currently, these 5 endpoints have zero authentication — anyone who knows the URL can call them:

| Endpoint | Required Guard |
|----------|---------------|
| `GET /auth/users` | `require_owner` |
| `POST /auth/users` | `require_owner` |
| `PUT /auth/users/{username}` | `require_owner` |
| `DELETE /auth/users/{username}` | `require_owner` |
| `GET /auth/staff` | `get_current_user` (any logged-in user) |

The pattern is already used in `shifts.py`. The frontend `users.tsx` page already sends auth headers via `authFetch()`, so no frontend changes are needed.

### 1B. Restrict CORS

**File:** `backend/app/main.py`

Current state: `allow_origins=["*"]` with `allow_credentials=True` — any website can make authenticated requests to the API.

Fix: Replace with environment-variable-driven origin list:
```python
ALLOWED_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",")
```

### 1C. Input validation — Pydantic Field constraints on financial models

**File:** `backend/app/models/models.py`

All financial fields currently accept ANY float value — negative prices, unlimited cash amounts, etc. Add `Field()` constraints:

| Model | Field | Constraint |
|-------|-------|-----------|
| `FuelSettings` | `diesel_price_per_liter` | `gt=0, le=1000` |
| `FuelSettings` | `petrol_price_per_liter` | `gt=0, le=1000` |
| `FuelSettings` | `diesel_allowable_loss_percent` | `ge=0, le=5.0` |
| `FuelSettings` | `petrol_allowable_loss_percent` | `ge=0, le=5.0` |
| `ValidationThresholds` | `pass_threshold` | `ge=0, le=10.0` |
| `ValidationThresholds` | `warning_threshold` | `ge=0, le=20.0` |
| `SaleIn` | all meter readings | `ge=0` |
| `HandoverInput` | `actual_cash`, all sales fields | `ge=0` |
| `HandoverNozzleReadingInput` | `opening_reading`, `closing_reading` | `ge=0` |
| `CustomerAllocation` | `volume`, `amount` | `ge=0` |
| `CustomerAllocation` | `price_per_liter` | `gt=0, le=1000` |

Invalid data returns a 422 response, which the frontend already handles.

### 1D. Settings cross-field validation

**File:** `backend/app/api/v1/settings.py`

In `update_validation_thresholds()`: reject if `pass_threshold >= warning_threshold` (logically invalid).

### Verification
- `GET /auth/users` without token → 401
- `GET /auth/users` with user-role token → 403
- `GET /auth/users` with owner-role token → 200
- Submit negative fuel price → 422
- App works normally at localhost:3000; requests from unknown origins are rejected

---

## Phase 2: Audit Trail

**Priority:** Critical | **Risk:** Low | **Breaking Changes:** None (purely additive)

### 2A. Audit service

**New file:** `backend/app/services/audit_service.py`

Core functions:
- `log_audit_event(station_id, action, performed_by, entity_type, entity_id, details, notes)` — appends an entry to the log
- `get_audit_log(station_id, action?, entity_type?, performed_by?, start_date?, end_date?, limit?)` — retrieves filtered entries

Storage: `audit_log.json` per station, following the same pattern as `tank_readings.json`.

All audit calls are wrapped in try/except so that a failure to write the audit log never blocks the main operation.

### 2B. Audit API endpoint

**New file:** `backend/app/api/v1/audit.py`

| Endpoint | Access | Description |
|----------|--------|-------------|
| `GET /audit/` | Supervisor/Owner | Retrieve filtered audit log entries |

Supports query filters: `action`, `entity_type`, `performed_by`, `start_date`, `end_date`, `limit`.

### 2C. Register router

**File:** `backend/app/api/v1/__init__.py` — add `audit.router` with prefix `/audit`

### 2D. Instrument existing endpoints

Add `log_audit_event()` calls to these operations:

| File | Operation | Action Logged |
|------|-----------|--------------|
| `settings.py` | `update_fuel_settings()` | `price_change` — captures old and new values |
| `settings.py` | `update_system_settings()` | `settings_update` |
| `settings.py` | `update_validation_thresholds()` | `threshold_update` |
| `auth.py` | `create_user()` | `user_create` |
| `auth.py` | `update_user()` | `user_update` — captures what changed |
| `auth.py` | `delete_user()` | `user_delete` |
| `shifts.py` | `create_shift()` | `shift_create` |
| `shifts.py` | `complete_shift()` | `shift_complete` |
| `attendant_handover.py` | submit handover | `handover_submit` |

### Verification
- Change fuel price via settings API
- `GET /audit/?entity_type=fuel_settings` returns the change with old/new values
- `storage/stations/ST001/audit_log.json` file is created and contains entries

---

## Phase 3: Server-Side Route Protection

**Priority:** High | **Risk:** Low-Medium | **Breaking Changes:** One-time re-login required

### 3A. Next.js middleware

**New file:** `frontend/middleware.ts`

Next.js middleware runs on the server before the page is rendered. Currently, all route protection is client-side (Layout.tsx checks localStorage). The middleware adds server-side enforcement:

- Checks for `accessToken` cookie (middleware cannot read localStorage)
- Maps routes to required roles, mirroring `Layout.tsx` allNavItems (lines 62-116)
- Unauthenticated requests → redirect to `/login?redirect=...`
- Wrong role → redirect to `/?unauthorized=1`
- Public routes (`/login`), static assets, and API routes are excluded

Role-to-route mapping:

| Routes | Allowed Roles |
|--------|--------------|
| `/settings`, `/users`, `/stations`, `/infrastructure` | owner |
| `/daily-tank-reading`, `/tank-movement`, `/stock-movement`, `/lpg-daily`, `/lubricants-daily` | supervisor, owner |
| `/inventory`, `/sales`, `/accounts` | supervisor, owner |
| `/three-way-reconciliation`, `/tank-analysis`, `/reconciliation` | supervisor, owner |
| `/reports`, `/tank-readings-report`, `/advanced-reports` | supervisor, owner |
| `/`, `/my-shift`, `/shifts`, `/enter-readings`, `/readings` | all authenticated |

### 3B. Set cookies on login

**File:** `frontend/pages/login.tsx`

After setting localStorage, also set cookies so the middleware can read them:
```typescript
document.cookie = `accessToken=${data.access_token}; path=/; SameSite=Lax`
document.cookie = `user=${encodeURIComponent(JSON.stringify(data.user))}; path=/; SameSite=Lax`
```

### 3C. Clear cookies on logout

**File:** `frontend/components/Layout.tsx`

In `handleLogout()`, expire both cookies alongside clearing localStorage.

### Impact Note
Existing sessions only have localStorage tokens — no cookies. After deploying this phase, all users will need to log in once to establish the cookie. This is acceptable and expected.

### Verification
- Clear cookies and localStorage, navigate to `/settings` → redirect to `/login?redirect=/settings`
- Log in as `user1`, navigate to `/settings` → redirect to `/?unauthorized=1`
- Log in as `owner1`, navigate to `/settings` → loads normally
- Log out, navigate to `/shifts` → redirect to login

---

## Phase 4: Export Capabilities (CSV + Excel)

**Priority:** High | **Risk:** Low | **Breaking Changes:** None (new endpoints only)

### 4A. Export service

**New file:** `backend/app/services/export_service.py`

Uses `openpyxl` (already installed v3.1.5) and stdlib `csv`:

- `tank_readings_to_excel(readings, station_name)` — styled workbook with headers, auto-column-widths
- `tank_readings_to_csv(readings)` — standard CSV output
- `sales_to_excel(sales, station_name)` — sales-specific columns
- `reconciliation_to_excel(recon_data, station_name)` — reconciliation-specific columns

### 4B. Export API endpoints

**New file:** `backend/app/api/v1/exports.py`

| Endpoint | Filters | Output |
|----------|---------|--------|
| `GET /exports/tank-readings` | `format` (csv/excel), `tank_id`, `start_date`, `end_date` | CSV or XLSX download |
| `GET /exports/sales` | `format`, `start_date`, `end_date` | CSV or XLSX download |
| `GET /exports/reconciliation` | `format`, `start_date`, `end_date` | CSV or XLSX download |

All require supervisor or owner role. Returns `StreamingResponse` with download content-disposition headers.

### 4C. Register router

**File:** `backend/app/api/v1/__init__.py` — add `exports.router` with prefix `/exports`

### 4D. Frontend export buttons

Add export buttons (CSV + Excel) to these pages:
- `frontend/pages/tank-readings-report.tsx`
- `frontend/pages/reconciliation.tsx`
- `frontend/pages/reports.tsx`

Download pattern: `authFetch()` → response blob → `URL.createObjectURL()` → programmatic `<a>` click → file downloads.

### Verification
- `GET /exports/tank-readings?format=csv` with auth → CSV file downloads
- `GET /exports/tank-readings?format=excel` with auth → XLSX file downloads
- Open downloaded Excel file → data matches what the JSON API returns
- Test with date range filters → filtered results only

---

## Phase 5: Shift Auto-Close

**Priority:** High | **Risk:** Low | **Breaking Changes:** None (Optional fields)

### 5A. Auto-close service

**New file:** `backend/app/services/shift_auto_close.py`

- `check_and_close_stale_shifts(storage, station_id)` — finds all shifts active for more than 14 hours
- Sets status to `auto-closed` with reason and timestamp
- Logs to audit trail if Phase 2 is implemented (graceful fallback with try/except ImportError)

### 5B. Startup hook + on-demand endpoint

**File:** `backend/app/main.py`

Call `check_and_close_stale_shifts()` during server `startup()` for all stations. Stale shifts are cleaned up automatically on restart.

**File:** `backend/app/api/v1/shifts.py`

Add `POST /shifts/check-stale` (supervisor/owner) for on-demand stale shift detection.

### 5C. Model + frontend updates

**File:** `backend/app/models/models.py`

Add Optional fields to Shift model (None defaults — existing data loads without error):
- `auto_closed: Optional[bool] = None`
- `auto_close_reason: Optional[str] = None`
- `auto_closed_at: Optional[str] = None`

**File:** `frontend/pages/shifts.tsx`

Show "Auto-Closed" badge (amber/warning color) with auto-close reason text when `shift.auto_closed` is true.

### Verification
- Create a shift with a date 2 days in the past, leave status as "active"
- Restart the server → check logs for auto-close message
- `GET /shifts/` → the shift shows `status: "auto-closed"` with `auto_closed: true`
- View shifts page in browser → auto-closed badge appears with reason

---

## Summary

| Phase | What | Priority | Risk | Dependencies |
|-------|------|----------|------|-------------|
| 1 | Security Hardening | Critical | Low | None |
| 2 | Audit Trail | Critical | Low | None |
| 3 | Server-Side Route Protection | High | Low-Med | None |
| 4 | Export Capabilities | High | Low | None |
| 5 | Shift Auto-Close | High | Low | Benefits from Phase 2 |

Each phase is independently deployable. Recommended implementation order: 1 → 2 → 3 → 4 → 5.

Phase 5 benefits from Phase 2 being completed first (auto-close events get audit logged), but it works without it.

---

## Files Changed Per Phase

### Phase 1 (3 existing files)
- `backend/app/api/v1/auth.py`
- `backend/app/main.py`
- `backend/app/models/models.py`
- `backend/app/api/v1/settings.py`

### Phase 2 (2 new files, 5 existing files)
- `backend/app/services/audit_service.py` *(new)*
- `backend/app/api/v1/audit.py` *(new)*
- `backend/app/api/v1/__init__.py`
- `backend/app/api/v1/settings.py`
- `backend/app/api/v1/auth.py`
- `backend/app/api/v1/shifts.py`
- `backend/app/api/v1/attendant_handover.py`

### Phase 3 (1 new file, 2 existing files)
- `frontend/middleware.ts` *(new)*
- `frontend/pages/login.tsx`
- `frontend/components/Layout.tsx`

### Phase 4 (2 new files, 4 existing files)
- `backend/app/services/export_service.py` *(new)*
- `backend/app/api/v1/exports.py` *(new)*
- `backend/app/api/v1/__init__.py`
- `frontend/pages/tank-readings-report.tsx`
- `frontend/pages/reconciliation.tsx`
- `frontend/pages/reports.tsx`

### Phase 5 (1 new file, 3 existing files)
- `backend/app/services/shift_auto_close.py` *(new)*
- `backend/app/main.py`
- `backend/app/api/v1/shifts.py`
- `backend/app/models/models.py`
- `frontend/pages/shifts.tsx`
