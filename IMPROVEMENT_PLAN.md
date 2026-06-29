# Fuel Management System — Full Improvement Plan

**Goal:** Raise all quality dimensions to 9.9/10 without breaking existing logic, functionality, or disturbing live data at Kalulushi (ST001).

**Guiding principle:** Every phase is safe to run on the live system. No phase breaks existing API contracts or wipes data. Each phase can be rolled back independently.

---

## Current vs Target Ratings

| Dimension | Now | Target |
|---|---|---|
| Architecture | 6/10 | 9.9/10 |
| Code quality | 7/10 | 9.8/10 |
| Functionality | 8.5/10 | 9.9/10 |
| User experience | 6.5/10 | 9.8/10 |
| Security | 5/10 | 9.9/10 |
| Scalability | 3/10 | 9.5/10 |
| Business value | 9/10 | 9.9/10 |

---

## Sequencing Overview

```
Phase 0  — Backup feature        (1-2 days)   ← do immediately, protects live data
Phase 1  — Test suite to 80%     (2-3 weeks)  ← safety net for refactoring
Phase 3  — Security hardening    (3-5 days)   ← independent, no structural risk
Phase 4  — API quality           (1 week)     ← pagination + error codes + codegen
Phase 5  — Frontend quality      (2 weeks)    ← depends on Phase 4 types
Phase 2  — Persistence migration (3-4 weeks)  ← biggest change, last structural phase
Phase 6  — Scalability           (1 week)     ← after Phase 2
Phase 7  — UX polish             (2-3 weeks)  ← parallel with Phase 6
Phase 8  — DevOps                (1 week)     ← caps everything off
```

**Total estimated timeline: ~12 weeks of active development** (single developer). Phases 0, 3, 4, 5 can run in parallel with each other after Phase 1 is done.

---

## Phase 0 — Backup System
**Priority: Immediate — do this before any structural changes.**

This protects the live data before anything else is touched.

### On-demand backup (in-app)
- Add a "Backup & Restore" section to the Settings page (manager/owner only)
- **Download Backup:** server exports all station data (shifts, readings, tank_readings, reconciliations, accounts, payroll runs, settings, calibrations) as a single timestamped `.json.gz` file downloadable to the user's machine
- **Upload & Restore:** manager uploads a previous backup file; server validates its structure then restores it (with confirmation warning that this overwrites current data)

### Scheduled automatic backup
- On every day close-off (when manager submits the daily close), the server automatically writes a snapshot to a `backups/` directory
- If `BACKUP_BUCKET_URL` env var is set, also pushes to S3/cloud storage
- Retention: keep last 30 daily snapshots, then weekly for 1 year
- Health endpoint (`/health`) reports last successful backup time

### PostgreSQL-level backup
- Add a `pg_dump` wrapper endpoint (owner-only) that triggers a `.sql.gz` dump of the full database
- True disaster-recovery path — restores the entire DB including user accounts and sessions

---

## Phase 1 — Test Suite to 80%+ Coverage
**Why before Phase 2:** The test suite is the safety net for the persistence migration. Do not touch the DB layer until tests can catch regressions.

### What exists
- 20 pytest files, ~20-30% coverage (auth, basic CRUD, handover workflow, pricing, safe deposits)
- Zero frontend tests

### Backend tests to add

| Area | Tests to write |
|---|---|
| `reconciliation_service.py` | All 4 tolerance modes (percentage/fixed/hybrid/tiered), edge cases (zero movement, delivery mid-shift) |
| `payroll_calculator.py` | PAYE bands, NAPSA ceiling, WCF rate, advance deductions, overtime multipliers |
| `tank_movement.py` | Inter-delivery sales timeline, multiple deliveries per shift, delivery variance |
| `dip_conversion.py` | Calibration table lookup, interpolation, out-of-range dip values |
| `reporting.py` | Daily summary totals, export data shape |
| `shift_auto_close.py` | Stale shift detection, auto-close trigger at 20h boundary |
| `validation_engine.py` | Foreign key violations, relationship constraint failures |
| `reading_validation.py` | Tolerance thresholds, discrepancy detection |

### Frontend tests to add
- Jest + React Testing Library setup
- TankCard rendering, DayChecklist state, handover form submission, login flow, role-based page guards

### CI/CD (GitHub Actions)
- On every push: run `pytest --cov` — enforce ≥80% coverage gate
- Run `tsc --noEmit` (TypeScript compile check)
- Block merges to `main` if tests or type-check fail

---

## Phase 2 — Persistence Layer Migration
**Biggest impact on Architecture score (6 → 9.9). Highest risk — do after Phases 0 and 1.**

### The problem
One giant JSONB blob per station is loaded into RAM at startup, mutated in memory, and flushed synchronously on every write. No indexing, no foreign key constraints, no referential integrity at the DB level. Single-connection psycopg3 client with manual reconnect fails under any real concurrency.

### Migration strategy — zero downtime, backward-safe

**Step 2a: Alembic migrations**
- Create `backend/alembic/` with `env.py` and initial version files
- Define proper relational schema:
  - `shifts` (shift_id PK, station_id, date, shift_type, status, ...)
  - `attendant_handovers` (handover_id PK, shift_id FK, attendant_id FK, ...)
  - `nozzle_readings` (reading_id PK, handover_id FK, nozzle_id FK, ...)
  - `tank_readings` (reading_id PK, shift_id FK, tank_id FK, ...)
  - `tank_deliveries` (delivery_id PK, tank_id FK, ...)
  - `credit_sales` (sale_id PK, handover_id FK, account_id FK, ...)
  - `lpg_daily_entries`, `lubricant_daily_entries`, `daily_close_offs`
  - `payroll_runs`, `payslips`, `salary_advances`, `leave_requests`, `attendance_records`
  - `audit_log` (proper persistent table, not in-memory)

**Step 2b: Dual-write transition**
- Deploy a version that writes to BOTH the existing JSONB blob AND the new tables
- All reads still come from JSONB (no user-visible change)
- Run one-time back-fill script: populate new tables from existing JSONB data
- Verify row counts and checksums match before proceeding

**Step 2c: Switch reads to new tables**
- Deploy a version that reads from new tables, writes to both
- Run for 1-2 weeks in parallel at Kalulushi to verify correctness

**Step 2d: Remove JSONB blob**
- Final deploy removes in-memory dict and the flush middleware
- `station_storage` table archived (not dropped) as final safety net

### Connection pooling (same phase)
- Replace the single global `_conn` with `psycopg.pool.ConnectionPool` (min 2, max 10 connections)
- Immediately enables multiple Uvicorn workers (currently impossible due to in-memory state)

---

## Phase 3 — Security Hardening
**Independent of Phases 2 and 4 — can run in parallel after Phase 1.**

| Issue | Fix |
|---|---|
| Auth tokens in `localStorage` (XSS risk) | Switch to `HttpOnly; Secure; SameSite=Strict` cookies. Backend sets cookie on login; frontend removes `Authorization` header logic entirely |
| No CSRF protection | Add CSRF double-submit cookie (`X-CSRF-Token` header, validated server-side on all mutations) |
| Seed credentials hardcoded (`owner123`) | Replace with `SEED_INITIAL_PASSWORD` env var; document that it must be set in production and changed on first login |
| Rate limiting only on auth endpoint | Add `slowapi` middleware — 100 req/min per IP on general endpoints, 5/min on `/auth/login` |
| Session logout incomplete | `DELETE /api/v1/auth/logout` deletes the session row in DB and clears the cookie server-side |
| Audit trail in in-memory store (can be wiped) | Migrate audit log to proper `audit_log` table (from Phase 2) |

---

## Phase 4 — API Quality

**Pagination**
- Every list endpoint gets `?page=1&limit=50` query params
- Critical for: shifts, readings, audit log, payroll runs as data accumulates over months/years

**Structured error codes**
- Replace `{"detail": "message string"}` with `{"error_code": "SHIFT_ALREADY_CLOSED", "message": "..."}`
- Allows the frontend to handle specific errors programmatically without brittle string matching

**Auto-generated TypeScript types**
- Use `openapi-typescript` to generate `frontend/lib/api-types.ts` from FastAPI's `/openapi.json`
- Add type generation step to CI pipeline — types always in sync with backend
- Eliminates current manual interface duplication and drift between Python models and TypeScript interfaces

**API versioning**
- Document that `/api/v2/` will be introduced for breaking changes
- `/api/v1/` stays indefinitely for the live station during any transition

---

## Phase 5 — Frontend Code Quality
**Depends on Phase 4 (auto-generated types).**

| Issue | Fix |
|---|---|
| `any` types throughout | Enable `"strict": true` in `tsconfig.json`; replace `any` with generated types from Phase 4 |
| `my-shift.tsx` is ~6,000 lines | Split into: `NozzleReadingForm`, `StockSnapshotForm`, `HandoverFinancialForm`, `ShiftSummaryCard` — each individually testable |
| No loading skeletons | Add `<Skeleton />` component; wire to SWR `isLoading` state on all data-dependent sections |
| No error boundary | Add `<ErrorBoundary>` at page level with a "Something went wrong — reload" fallback |
| No frontend tests | Jest + React Testing Library; test form validation, role-based rendering, API error handling |

---

## Phase 6 — Scalability
**After Phase 2 (proper tables + connection pool).**

- **Multiple Uvicorn workers:** `uvicorn app.main:app --workers 4` — impossible today due to in-memory state, trivial after Phase 2
- **Async DB operations:** Migrate to `psycopg` async API throughout (`await conn.execute(...)`) — currently synchronous DB calls block the async event loop
- **Pagination everywhere** (from Phase 4) prevents O(N) memory scans on large datasets
- **Read-heavy caching:** `functools.lru_cache` or Redis for settings, calibration tables, and fuel prices — rarely change but read on every request
- **Index critical columns:**
  - `shifts(station_id, date)`
  - `handovers(shift_id)`
  - `nozzle_readings(nozzle_id, shift_id)`
  - `audit_log(station_id, created_at)`

---

## Phase 7 — UX Polish
**Can run in parallel with Phase 6.**

- **Guided task flows:** A shift checklist wizard — Step 1: open shift → Step 2: enter readings → Step 3: submit handover — instead of navigating between 4 separate pages manually
- **PDF payslips:** `jsPDF` is already installed; wire `payroll_calculator.py` output to a styled PDF template (employee name, period, gross/deductions/net breakdown, statutory rates used)
- **PWA support:** Add `next-pwa` (service worker + manifest). Attendants install on their phones; works with poor connectivity. Cache current shift data locally; sync when back online
- **Mobile-first improvements:** Forecourt is used on phones. Key pages (`my-shift`, `readings`, `handover`) need touch-friendly input sizing and offline form caching
- **Notifications badge:** Show unread count on nav icon; clicking opens a slide-over panel instead of navigating to `/notifications`

---

## Phase 8 — Observability & DevOps
**Caps everything off.**

- **Full CI/CD pipeline:** GitHub Actions — test → lint → type-check → build → deploy to Render on merge to `main`
- **Alembic in CI:** Migration check ensures every PR that touches models also includes a migration file
- **Performance metrics:** Response-time histogram per endpoint (Prometheus or StatsD); alert if p95 > 1 second
- **Log aggregation:** Ship JSON logs to Render's built-in log drain or Papertrail
- **Uptime monitoring:** External ping (BetterUptime or UptimeRobot) on `/health`; SMS alert to owner if down
- **Sentry source maps:** Upload frontend source maps to Sentry so JS errors show original TypeScript, not minified bundles

---

## Notes

- The Kalulushi live station (ST001) must remain operational throughout. Every phase is designed to be deployed incrementally without a maintenance window.
- Phase 2 (persistence migration) is the only phase with non-trivial rollback complexity. The dual-write step (2b) is the safety valve — if anything looks wrong, stay on JSONB reads until confident.
- Business logic in service files (`reconciliation_service.py`, `payroll_calculator.py`, `tank_movement.py`, etc.) is clean and well-isolated. It survives the Phase 2 refactor mostly intact — only the storage access layer changes.
