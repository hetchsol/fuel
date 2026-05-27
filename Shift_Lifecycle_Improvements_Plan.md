# Shift Closing / Review / Lifecycle — Improvements Plan

**Status:** P0-1, P0-2, P0-3 implemented (2026-05-27). P1, P2 still to do.
**Date:** 2026-05-27
**Scope:** The shift-closing → review → shift-status workflow (attendant Phase 1/2,
manager review, shift lifecycle, daily close-off). Grounded against current code.

## 0. Problem summary

The operational "closing" happens entirely at the **handover** level (Phase 2
financial reconciliation + manager approval). The **shift's own status**
lifecycle (`active → completed → reconciled`) is declared in the model
(`models.py:234`) and has endpoints (`PUT /shifts/{id}/complete`,
`/reconcile`) — **but nothing in the UI ever calls them**, and the daily
close-off doesn't set them either. So a shift's status never leaves `active`
until the 20-hour auto-close (`shift_auto_close.py:43`, `main.py:145`) or a
manual deactivate.

That single gap cascades into correctness, security, and UX problems, and it
breaks the **Shift Selection plan** (which locks editing at `reconciled` — a
state the app currently never reaches).

Priority key: **P0** = correctness/integrity/security (do first); **P1** =
workflow quality; **P2** = polish.

---

## P0-1 — Make the shift lifecycle real (wire up `completed` / `reconciled`) — ✅ IMPLEMENTED 2026-05-27

**Done:** new `app/services/shift_status.py` with `advance_shift_on_approval`
and `reconcile_shifts_for_date` (editable → `reconciled` at close-off). Wired
into `attendant_handover.review_handover` (approve branch) and
`daily_close_off.close_day`. Both persist via `save_station_storage` and emit
audit events. Covered by `tests/test_shift_lifecycle.py`.

**Per-attendant completion rule (domain):** a shift may have several attendants,
each closing their **own handover individually** (own verification + cash
handover + approval, scoped to their own nozzles). Approving attendant A must
**never** close out B or C. So `advance_shift_on_approval` only flips the
*container* shift to `completed` once **every assigned attendant** has an
approved handover (compares `shift.assignments[].attendant_id` to approved
handovers); a returned/in-progress handover blocks completion. Shifts with no
recorded assignments fall back to "all handovers approved."


**Problem.** `complete_shift` (`shifts.py:274`) and `reconcile_shift`
(`shifts.py:298`) are never invoked from the frontend (verified: no call to
`/complete` or `/reconcile` anywhere in `frontend/`). Shift `status` is only
ever set to `active`, `inactive`, or `auto-closed`. The `completed`/`reconciled`
states are effectively dead.

**Proposed change** (auto-transition on handover state, no new manual button):
- When **all** handovers for a shift reach `review_status == "approved"`, flip
  the shift `status` to `completed`.
- On **Daily Close-Off** (`/daily-close-off/close`), flip every shift for that
  date to `reconciled` (the day is already locked there, so this is the natural
  finalization point).
- Implement as a small helper `maybe_advance_shift_status(shift_id, storage)`
  called from `review_handover` (on approve) and from the daily-close-off
  handler.

**Files:** `app/api/v1/attendant_handover.py` (review path),
`app/api/v1/daily_close_off.py`, a new helper (e.g. in a service).

**Why first:** every other lifecycle improvement and the Shift Selection plan's
read-only lock depend on these states actually being reached.

**Tests:** approving the last handover of a shift → shift `completed`;
daily close-off → shifts `reconciled`; partial approval → still `active`.

---

## P0-2 — Guardrails on the shift-status endpoints — ✅ IMPLEMENTED 2026-05-27

**Done:** `/shifts/{id}/complete` and `/reconcile` now require
`require_supervisor_or_owner`; both persist via `save_station_storage` and log
audit events (`reconcile` previously logged none). `reconcile` enforces ordering
(must be `completed`/`auto-closed` first → else 400) and `assert_shift_editable`
(reconciled/inactive → 403). `submit-closing` now calls `assert_shift_editable`
on the target shift, closing the hole where a privileged user could rewrite a
finalized shift's closing. Covered by `tests/test_shift_lifecycle.py`.


**Problem.** Compared to `deactivate_shift` (`shifts.py:313`, gated with
`require_supervisor_or_owner`):
- `complete_shift` (`:274`) and `reconcile_shift` (`:298`) have **no role
  gate** — any authenticated user, including an attendant, can call them.
- `reconcile_shift` writes status with **no audit log** (whereas
  `complete_shift` logs one) and **no precondition** (a shift can be reconciled
  even if its handovers aren't approved).

**Proposed change:**
- Add `dependencies=[Depends(require_supervisor_or_owner)]` (or manager+) to both.
- Add `log_audit_event(... action="shift_reconcile" ...)` to `reconcile_shift`.
- Add status preconditions: `reconcile` requires `completed` (or all handovers
  approved); `complete` requires the shift not already `reconciled`/`inactive`.
- Add the Shift Selection plan's `assert_shift_editable` to `submit-closing`
  (`:1011`) — today it accepts a privileged user against *any* handover with **no
  shift-status check** (confirmed at `:1031–1036`), so a reconciled shift's
  closing can still be overwritten. See [[Shift_Selection_Across_App_Plan]].

**Files:** `app/api/v1/shifts.py`, `app/api/v1/attendant_handover.py`.

**Tests:** attendant calling `/complete` or `/reconcile` → 403; reconcile before
approval → 400; reconcile emits an audit entry; submit-closing on a reconciled
shift → 403.

---

## P0-3 — Require justification when approving a *flagged* handover — ✅ IMPLEMENTED 2026-05-27

**Done:** `review_handover` now rejects (400) an `approve` action on a `flagged`
handover unless a non-blank `supervisor_note` is provided; the note is stored on
the review record and audit event. `batch_approve` already skipped non-`submitted`
handovers, so flagged items can't be batch-approved (no change needed there) —
and it now also triggers the P0-1 auto-complete for affected shifts. Frontend
`handover-review.tsx`: clicking **Approve** on a flagged row opens a required-note
modal; clean handovers still approve in one click. Covered by
`tests/test_handover_review.py`.


**Problem.** In `review_handover` (`:1434`), **Return** requires a mandatory note
(`:1446`) but **Approve** requires nothing (`:1474`). A `flagged` handover (cash
shortage > threshold, or a meter deviation) can be one-click approved with no
recorded reason — exactly the case that most needs an audit trail.

**Proposed change:** if `handover.review_status == "flagged"`, require a non-empty
`supervisor_note` on approve; store it on the review record and in the audit
event. Unflagged handovers keep one-click approve.

**Files:** `app/api/v1/attendant_handover.py` (review), `handover-review.tsx`
(prompt for a note when approving a flagged row).

**Tests:** approve flagged without note → 400; approve flagged with note →
success, note persisted; approve unflagged without note → success.

---

## P1-4 — Make the cash-shortage threshold configurable

**Problem.** The `K500` cash-shortage threshold is **hardcoded in four places**
(`attendant_handover.py:393, 1057, 1117, 1275`), while comparable thresholds are
already per-station settings: `validation_thresholds.meter_discrepancy_threshold`
(`:191, :783`) and `fuel_settings.nozzle_allowable_loss_liters` (`:397, :411,
:784`). Inconsistent, and wrong for stations of different sizes (currency: ZMW).

**Proposed change:** read `storage.get('fuel_settings', {}).get(
'cash_shortage_threshold', 500)` in all four spots; expose it in the settings UI
alongside the existing thresholds. Default 500 preserves current behaviour.

**Files:** `app/api/v1/attendant_handover.py`, settings model + settings page.

**Tests:** with threshold set to 1000, a K700 shortage does not flag; with 200 it
does; default unchanged.

---

## P1-5 — Close the Phase-1 → Phase-2 gap (unreconciled readings)

**Problem.** Handovers stuck in `phase == "readings_verified"` (Phase 1 done,
Phase 2 closing never submitted) are only **counted** as `stale_readings_count`
after 4h (`:1417–1423`) — nothing escalates them, and they don't appear as rows
anywhere. This is where revenue silently goes unreconciled.

**Proposed change:**
- Emit a notification when a handover sits in `readings_verified` past the
  threshold (reuse the existing notification + auto-close scan).
- Surface stale Phase-1 handovers as **actionable rows** (link straight to the
  shift-closing page) in `handover-review.tsx`, not just a count.

**Files:** `app/services/shift_auto_close.py` or a new scan, `attendant_handover.py`
(review-queue payload), `handover-review.tsx`.

**Tests:** a >4h Phase-1 handover produces a notification and appears as an
actionable row; a fresh one does not.

---

## P1-6 — Single pipeline view for managers

**Problem.** `review-queue` only returns `phase == "completed"` handovers
(`:1402`); the rest of the funnel (Phase-1 pending → awaiting closing → in review
→ approved) isn't visible in one place.

**Proposed change:** a status board on `handover-review.tsx` grouping handovers by
stage (Phase-1 pending / awaiting closing / in review / flagged / approved today),
so "what still needs me?" is answerable at a glance. Backend can extend the
review-queue payload with the extra buckets (additive).

**Files:** `attendant_handover.py` (review-queue payload — additive),
`handover-review.tsx`.

**Tests:** counts per bucket match seeded data; flagged sorts first within
in-review.

---

## P2-7 — Cleanups surfaced during analysis

- **Audit consistency:** ensure every shift-status mutation
  (`complete`/`reconcile`/`deactivate`/auto-close) logs an audit event with a
  consistent `action` name. (`reconcile` currently logs none.)
- **`render.yaml` drift (deploy):** the blueprint references
  `fuel-frontend.onrender.com`, but the live frontend is `fuel-frontend-4wef`
  and `CORS_ORIGINS` points at the wrong URL; the old `fuel-frontend` Vite
  service is dead weight. Reconcile the blueprint with the real services.

---

## Relationship to the Shift Selection plan

P0-1 and P0-2 are **prerequisites** for [[Shift_Selection_Across_App_Plan]]:
- That plan locks editing at `reconciled`; P0-1 makes `reconciled` reachable.
- That plan adds `assert_shift_editable`; P0-2 is where it gets wired into
  `submit-closing` and the shift-status endpoints.
- Recommend sequencing **P0-1 + P0-2 before** the Shift Selection implementation,
  or merging them into its Phase 1.

## Phasing

1. ~~**P0-1, P0-2** — lifecycle wiring + endpoint guards + `assert_shift_editable`
   (unblocks the Shift Selection plan).~~ ✅ Done 2026-05-27.
2. ~~**P0-3** — flagged-approval note.~~ ✅ Done 2026-05-27.
3. **P1-4, P1-5, P1-6** — configurable threshold, stale-readings escalation,
   pipeline view.
4. **P2-7** — audit consistency + deploy/blueprint cleanup.

## Open questions — RESOLVED (2026-05-27)

- ~~Reconciled-on-approval vs. on-close-off?~~ **Completed on approval, reconciled
  on daily close-off** (two-stage). A shift becomes `completed` when all its
  handovers are approved; it only becomes `reconciled` at Daily Close-Off.
- ~~`complete`/`reconcile` role gate?~~ **Supervisor or above**
  (`require_supervisor_or_owner`) for both, matching `deactivate_shift`.
- ~~Auto-advance vs. manual?~~ **Fully automatic** — no new buttons; the
  transitions fire internally on approval and on close-off.
