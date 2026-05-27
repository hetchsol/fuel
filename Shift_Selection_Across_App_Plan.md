# Shift Selection for Supervisor / Manager / Owner — Plan

**Status:** Plan only — not implemented.
**Date:** 2026-05-26 (revised 2026-05-27 after grounding against current code)

## 1. Goal

Let **Supervisor, Manager, and Owner** select any **current or past** shift and
process it across every shift-scoped surface of the app — not just their own
currently-active assigned shift. Attendants are unchanged.

## 2. Confirmed decisions

| Decision | Choice |
|---|---|
| Past-shift editing | **Edit until reconciled** — `active`, `completed`, `auto-closed` are editable; once **`reconciled`** a shift is **read-only**. (`inactive`/cancelled also read-only.) |
| Surfaces | **Everywhere a shift applies** — one consistent selector + a shift kept "in focus" across pages. |
| Approach | **Detailed plan first** (this doc) with explicit remedial measures so nothing breaks. |
| Roles | Supervisor + Manager + Owner get the selector. **Attendant flows stay exactly as today.** |

## 3. Current state (grounded)

- `GET /shifts/` already returns **all** shifts; `GET /shifts/{id}` returns one. No
  status filter, no role gate.
- Shift-scoped data loaders are restricted to the caller's **own active assigned**
  shift:
  - `GET /handover/my-shifts` — active + assigned only (`attendant_handover.py:633`).
  - `GET /handover/my-shift` — active + assigned, optional `shift_id` (`:661`).
  - `GET /enter-readings/my-shift` — active + assigned.
  - Writes: `/handover/submit-readings`, `/handover/submit-closing`,
    `/enter-readings/submit` — all active-only, no reconciled guard.
- Shift `status` lifecycle: `active` → `completed` (`/shifts/{id}/complete`) →
  `reconciled` (`/shifts/{id}/reconcile`); plus `inactive` (deactivate) and
  `auto-closed` (stale > 20h). **No endpoint currently blocks writing to a
  reconciled shift.**
- Frontend selectors already exist (partial): `my-shift.tsx`, `shift-closing.tsx`
  (from `/handover/my-shifts`, shown only when >1 active shift); `enter-readings.tsx`
  supervisor section (from `/shifts/`).
- Role helpers exist: backend `require_supervisor_or_owner` / `require_manager_or_owner`
  / `require_owner`; frontend `isSupervisorOrAbove` / `isManagerOrAbove`.

### Which surfaces are actually shift-scoped

| Page | Shift-scoped? | Gets selector? |
|---|---|---|
| my-shift.tsx (Readings Verification) | Yes | **Yes** |
| shift-closing.tsx (Close Shift) | Yes | **Yes** |
| enter-readings.tsx (Enter Readings) | Yes | **Yes** |
| handover-review.tsx | Per-shift review queue | Yes (filter by shift) |
| daily-tank-reading.tsx | date + shift_type (not shift_id) | Optional — selector sets date+type |
| shifts.tsx | Already lists all shifts | Already covered |
| fuel-operations, lpg-daily, lubricants-daily, inventory, sales, accounts, daily-close-off | **No** — date/category/period scoped | **No** (would be meaningless) |

> Important "no-break" note: the non-shift-scoped pages are intentionally left
> alone. Forcing a shift selector onto them would change their meaning and risk
> regressions for no benefit. If a shift-context filter is genuinely wanted on a
> specific one, it's a separate, explicit follow-up.

## 4. Architecture

### 4.1 Backend — refactor the existing resolver, don't bolt one on

> **Grounded correction.** The real write-gate today is the existing shared helper
> `_validate_shift_and_assignment` (`attendant_handover.py:57–88`). It does three
> things: 404 if the shift is missing; **400 if `status != "active"`** (`:63–64`);
> **403 if the caller has no matching assignment** (`:75–76`); and it returns
> `allowed_nozzle_ids` **derived from the caller's own assignment**. So enabling
> elevated past-shift editing is *not* "add a new guard beside it" — this helper
> itself must become role-aware. `resolve_target_shift` **replaces the front half**
> of `_validate_shift_and_assignment`; the active-only and assignment checks apply
> to **attendants only**.

Add a single helper used by every shift-scoped endpoint:

```
resolve_target_shift(ctx, shift_id) -> { shift, editable: bool, read_only: bool, allowed_nozzle_ids: set }
```

Rules:
- **Attendant (`user`)**: ignore elevated paths. Resolve only the caller's own
  **active assigned** shift (today's behavior verbatim — active-only 400,
  assignment 403, `allowed_nozzle_ids` from their assignment). `shift_id` may only
  refer to one of their own active shifts.
- **Supervisor / Manager / Owner**: may resolve **any** shift by `shift_id`,
  regardless of assignment or status.
  - `editable = status in {active, completed, auto-closed}`
  - `read_only = status in {reconciled, inactive}`
  - **Nozzle scope:** since an elevated user editing another's shift has *no*
    assignment, `allowed_nozzle_ids` = **all nozzles in the target shift** (union
    of every assignment's nozzles, falling back to island-derived nozzles), not an
    assignment-derived subset. `_process_nozzle_readings` filters writes by this
    set, so it must be widened for elevated edits or legitimate writes get dropped.
- If `shift_id` is omitted, behavior is **identical to today** for everyone
  (no change to the default path).

### 4.2 Backend — reconciled/locked write guard (new safety net)

A shared guard `assert_shift_editable(shift)` raises **403** if the shift is
`reconciled` or `inactive`. Wired into every write endpoint
(`submit-readings`, `submit-closing`, `enter-readings/submit`, `redo-readings`,
tank-dip writes, etc.).

> **Grounded correction.** The earlier claim that this "changes nothing today"
> is **wrong for `submit-closing`** (`attendant_handover.py:1011`). That endpoint
> already lets supervisor/manager/owner submit closing for *any* handover
> (`:1031–1036`) with **no shift-status check at all** — so today a privileged
> user can already submit-closing against a handover whose shift is `reconciled`.
> Adding `assert_shift_editable` there **will** change behavior: it closes a real
> existing hole. This is a point *in favour* of the guard — the safety net is
> needed now, not only after past-shift selection ships. For the attendant
> readings path (which goes through `_validate_shift_and_assignment`'s active-only
> check) the guard is genuinely redundant today and changes nothing.

### 4.3 Frontend — "selected shift" context

A lightweight React context (mirroring how `stationId` is kept in
`localStorage`) holds the **in-focus shift_id** for elevated users, so a shift
selected on one page stays selected as they move between pages. Cleared on
logout/station switch. Attendants never populate it.

### 4.4 Frontend — shared `ShiftSelector` + read-only mode

- `ShiftSelector` dropdown: lists **Current** and **Past** shifts (grouped),
  each labelled `date — Day/Night — status` with an "editable / view-only" badge.
  Visible only to Supervisor+.
- When the selected shift is `read_only`, the page renders inputs disabled,
  hides submit buttons, and shows a "Reconciled — view only" banner. Reuses the
  existing rendering; only `disabled`/visibility flags are added.

## 5. Backend changes (all additive / backward-compatible)

1. **New** `GET /shifts/selectable` — Supervisor+ only; returns current + past
   shifts with `{ shift_id, date, shift_type, status, editable, attendants[] }`.
   Attendants calling it get only their own active shift(s). (Keeps the existing
   `/handover/my-shifts` untouched for attendant flows.)
2. **Extend** `GET /handover/my-shift` and `GET /enter-readings/my-shift`: when
   caller is Supervisor+ **and** a `shift_id` is supplied, resolve via
   `resolve_target_shift` (any status/assignment) and include `read_only` in the
   response. No `shift_id` ⇒ unchanged.
3. **Add** `assert_shift_editable` to all shift write endpoints (§4.2).
4. **Audit**: when an elevated user reads/writes a shift that is not their own
   active assignment, emit an audit event via the **existing** audit service —
   `log_audit_event(station_id, action="shift_process_override", performed_by,
   entity_type="shift", entity_id=shift_id, details={...})`
   (`backend/app/services/audit_service.py`). No new audit infrastructure is
   needed; this is a cheap wire-up.
5. No response-shape changes to existing fields; only **new** optional fields
   (`read_only`, `editable`) are added.

## 6. Frontend changes

1. Add `SelectedShiftProvider` context + `useSelectedShift()` hook.
2. Build `ShiftSelector` (Supervisor+), backed by `/shifts/selectable`.
3. Wire selector + read-only mode into: `my-shift.tsx`, `shift-closing.tsx`,
   `enter-readings.tsx`. Each already has a partial selector — replace the
   active-only source with `/shifts/selectable` for elevated roles, keep the
   attendant path as-is.
4. `handover-review.tsx`: allow filtering the queue by the selected shift.
5. (Optional) `daily-tank-reading.tsx`: a selector that sets `date` +
   `shift_type` from the chosen shift, since it's date/type-scoped.
6. Read-only rendering: a small `useReadOnlyShift(read_only)` helper to disable
   inputs and hide submit actions consistently.

## 7. Edit-until-reconciled enforcement (status matrix)

| Status | Elevated can open? | Editable? | UI |
|---|---|---|---|
| active | Yes | Yes | normal |
| completed | Yes | Yes | normal + "completed" note |
| auto-closed | Yes | Yes | normal + "auto-closed" note |
| reconciled | Yes | **No** | read-only banner, inputs disabled |
| inactive | Yes | **No** | read-only banner |

Enforced in **two layers**: backend `assert_shift_editable` (authoritative) +
frontend read-only mode (UX). Attendants: unchanged (active assigned only).

## 8. Remedial measures — guarantee no break in functionality/logic

1. **Default path is unchanged for the attendant readings flow.** Every elevated
   behaviour is gated behind *(role ≥ supervisor)* **and** *(explicit shift_id
   selection)*. With no selection, those endpoints/pages behave exactly as today.
   *Exception:* `submit-closing` already accepts privileged users with no status
   check, so `assert_shift_editable` there is a deliberate behavior change that
   closes an existing hole (see §4.2) — not a no-op.
2. **Attendants fully unchanged.** Their loaders, gating, and submit flows are
   not touched; `/handover/my-shifts` keeps its active+assigned semantics.
3. **Additive APIs only.** New endpoint + new optional params + new optional
   response fields. No existing field renamed or removed → existing callers keep
   working.
4. **Reconciled/inactive write-lock** (new) protects finalized data from the
   newly-possible past-shift edits — server-side 403 is the source of truth,
   mirrored by the read-only UI.
5. **Calculation logic reused verbatim.** Volume, deviation, double-entry,
   reconciliation math are unchanged; only *which shift's data* is loaded/written
   changes. No formula edits.
6. **Audit trail** for every elevated cross-shift/past-shift action, for
   accountability.
7. **Regression test suite** (see §9) pinning the unchanged behaviours.
8. **Staged rollout / kill switch.** Put the cross-page selector behind a system
   setting (default on) so it can be disabled instantly without a redeploy if an
   issue surfaces.
9. **Concurrency rule.** If an elevated user edits a shift an attendant is also
   working, the elevated write is allowed (edit-until-reconciled) and audited;
   document this precedence so it isn't a surprise.

## 9. Testing plan

Backend:
- Attendant: `/handover/my-shift` with another user's `shift_id` ⇒ still resolves
  only their own active shift (no change).
- Supervisor: load a `completed` and an `auto-closed` shift ⇒ success, `editable=true`.
- Supervisor: load a `reconciled` shift ⇒ success, `read_only=true`.
- Write to a `reconciled` shift via every write endpoint ⇒ **403**.
- Write to a `completed` shift as supervisor ⇒ allowed + audit event recorded.
- `/shifts/selectable`: attendant sees only own active; supervisor sees all.

Frontend:
- Selector hidden for attendants; visible for supervisor+.
- Selecting a reconciled shift disables inputs + hides submit.
- Selected shift persists across My Shift → Close Shift → Enter Readings.

## 10. Phasing

1. Backend: `resolve_target_shift`, `assert_shift_editable`, `/shifts/selectable`,
   extend the two `my-shift` loaders, audit + tests.
2. Frontend: context + `ShiftSelector` + read-only mode on the 3 core pages.
3. handover-review filter + optional daily-tank-reading selector.
4. Kill-switch setting + regression pass.

## 11. Open questions / out of scope

- **Non-shift-scoped pages** (inventory, sales, fuel-ops, lpg/lubricants daily,
  accounts, daily-close-off) are out of scope — they aren't bound to one shift.
  Confirm none of these specifically needs a shift filter.
- ~~Should **auto-closed** shifts be editable?~~ **Resolved (2026-05-27): yes,
  editable.** `auto-closed` is a first-class status distinct from `reconciled`
  (`models.py:234`), so editable-until-reconciled applies. Note: a shift can
  auto-close *mid-edit* (auto-close runs at startup `main.py:145` and via
  `/check-stale`) — this does **not** break an in-progress elevated edit, since
  `auto-closed` remains editable.
- Should elevated edits to a past shift **re-open** any already-approved handover,
  or create a correction record? (Affects review-queue interplay.)
- **Double-entry interplay (new).** Blind double-entry now lives on the
  `submit-closing` path (recent work). When an elevated user edits a *past*
  shift's closing readings, does blind double-entry **re-trigger** (requiring two
  independent entries again), or is the elevated correction a **single
  authoritative override** that bypasses re-entry? Decide before wiring
  `submit-closing` into the elevated path.
