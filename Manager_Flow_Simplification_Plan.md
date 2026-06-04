# Manager / Daily-Operations Flow Simplification — Master Plan

**Status:** Phase 1 in progress (items 4 + 5) on branch
`simplify/reason-chips-active-defaults`. Remaining items not started.
**Date:** 2026-06-03
**Scope:** Make the manager's (and the supervisors/attendants they oversee)
**daily operational chain** easier to run — fewer screens to bounce between,
less repeated context, less re-entry of data the system already holds —
**without changing any business logic, validation gate, calculation, stored
record, audit event, or role restriction.** This is a *presentation,
sequencing, navigation, and defaults* effort only.

**Why now.** The daily process is one continuous chain:

```
open shift → tank dips → attendant readings (double-entry) → supervisor verify
→ shift closing (cash) → handover approve → daily tank reading → daily close-off
```

…but in the code each link is an isolated page that re-asks for date+shift,
data that already exists on one page must be hand-pulled into the next via
buttons people forget to click, and nothing tells the manager where the day
stands or what's next. The friction is the **disconnection between screens**,
not the individual forms. This plan threads them together.

## 1. The items

| # | Simplification | Sits on top of | Risk |
|---|---|---|---|
| 1 | **"Today" daily-operations launchpad** — one live checklist of the day's chain with deep links | existing status endpoints (read-only) | Lowest |
| 2 | **Shared working day + shift context** — pick once, every page reads it | `Shift_Selection_Across_App_Plan.md` (dependency) | Low |
| 3 | **Auto-sync banners** — replace manual "Pull from…" / "Load Previous Shift" buttons with automatic, editable carry-over | existing carry-over loaders | Low |
| 4 | **Reason chips** — preset buttons that fill the many mandatory free-text notes | existing required-note validation | Lowest |
| 5 | **"Active only" defaults** on long stock forms | existing "show only changed" filter | Lowest |
| 6 | **Forward navigation** — "Next →" at the end of each step | launchpad's step-status logic | Lowest |
| 7 | **Single Stores action modal** — one modal, action selector, same fields | existing receive/issue/damage/adjust endpoints | Low |
| 8 | **Per-page polish** — repeat-last-shift, remember last date/shift/location, clearer two-step submit | existing forms | Low |

## 2. Cross-cutting "no-break" guarantees

These hold for **every item** in this plan:

1. **No business logic touched.** Volume/deviation/double-entry/reconciliation
   math, `_compute_auto_flags`, `_process_stock_snapshot`, variance formulas,
   shift-status transitions, expected/actual-cash computation, deposit variance
   — all read-only in this work. Not one formula edited.
2. **No validation gate weakened.** Every required note stays required and
   non-empty; every submit-blocking check (double-entry verified, stock-out,
   all-handovers-approved-before-close, etc.) stays exactly as it is. Reason
   chips only *fill* a field that is still validated identically.
3. **Every control stays.** Blind double-entry, flagged-handover justification,
   return reasons, day-lock irreversibility, owner-only stock-take approval,
   role gating — all preserved byte-for-byte.
4. **Existing records, reports, and audit events are unchanged.** We add
   navigation/status surfaces and shortcuts; we never alter a stored record's
   shape, a report's contents, or which audit events fire. Defaults reproduce
   today's saved data exactly.
5. **Frontend-first, additive on the backend if at all.** Most items are pure
   frontend. Where a backend touch is considered (item 1), it is a **new,
   read-only aggregation endpoint** or — preferred — **client-side composition
   of existing endpoints**, never a change to an existing contract.
6. **Independent and reversible.** Each item ships on its own and can be
   reverted without affecting the others. None blocks the daily chain if rolled
   back — the underlying pages still work standalone exactly as today.
7. **Server remains the source of truth.** All shortcuts are UX conveniences;
   the server re-validates everything on submit as it does today.

---

## 3. Item 1 — "Today" daily-operations launchpad (highest leverage)

> **Implemented (2026-06-04, v1).** `frontend/components/DayChecklist.tsx`
> created and mounted on the dashboard (`index.tsx`) for manager/owner only. It
> composes three read-only GETs client-side — `/shifts/`, `/handover/review-queue`,
> `/daily-close-off/summary` (plus `/shifts/{id}/tank-dip-readings` for the dip
> step) — into a 4-step chain checklist (shift → dips → handovers → close) with a
> deep link per step. It deliberately avoids `/shifts/current/active` (that GET
> *creates* a shift as a side effect); it issues only GETs and mutates nothing.
> **Deferred to item 2:** links don't yet carry `date`/`shift_id` through to the
> target pages (those pages don't consume a date query yet) — plain links for now.


**Today.** There is no single view of the day's progress. The manager must open
Shifts, then My Shift / Handover Review, then Daily Tank Reading, then Daily
Close-Off in turn to discover what's done and what's outstanding, re-selecting
date/shift on each. Status data exists but is scattered across pages.

**Change.** A read-only launchpad (a card on the dashboard `index.tsx`, or a
small `pages/today.tsx`) that renders the day's chain as a checklist, each row
fed by data the app already returns:

> ✅ Shift open (2 attendants) · ✅ Tank dips recorded · ⚠️ 1 of 3 handovers
> verified · ⛔ Day not closed — *bank deposit pending*

- Each row deep-links to the right page **with the working date/shift already
  applied** (uses item 2; degrades gracefully to a plain link without it).
- Sources, composed client-side: `/shifts/` (active shift + assignments),
  `/handover/review-queue` (pending / flagged / awaiting-closing / approved
  counts — already returned, see `handover-review.tsx:144-151`),
  `/daily-close-off/summary?date=` (`already_closed`, `unapproved_handovers`,
  `approved_handovers`), tank-dip presence from the shift record.
- Pure read overlay: it issues the same GETs the pages already issue and writes
  nothing.

**Files:** `frontend/pages/index.tsx` (or new `frontend/pages/today.tsx`),
`frontend/components/` (new `DayChecklist.tsx`), `frontend/components/Layout.tsx`
(optional nav link). Backend: **none** if composed client-side; otherwise one
**new** read-only `GET /day-status?date=` that fans out to the above — no
existing endpoint altered.

**Stays untouched:** every page it links to; all underlying status logic. It
only reads and routes.

**Tests:**
- Renders correct ✅/⚠️/⛔ states for: no shift, shift open, partial handover
  approval, all approved-not-closed, closed. (Frontend, mocked responses.)
- Each row's link carries the right `date` / `shift_id` query params.
- Issues only GETs (no mutation) — assert no POST/PATCH fired.

---

## 4. Item 2 — Shared working day + shift context

> **Implemented (2026-06-04, UX slice).** Frontend-only: `contexts/WorkingDayContext.tsx`
> (`WorkingDayProvider` + `useWorkingDay`) holds the working date + shift type,
> backed by **sessionStorage** (survives reloads within the session, resets next
> session so the app never opens on a stale past date). Wired into the
> **single-day** pages so the day is picked once and carried across navigation:
> dashboard (`index.tsx`), `daily-close-off`, `daily-tank-reading`, `lpg-daily`,
> `lubricants-daily`. Each still owns its picker and the user can override it on
> any page. Because the dashboard date *is* the working day, the launchpad's
> Close-off link now lands on the same day automatically (no query param needed).
>
> **Deliberately NOT wired:** `handover-review` (its date filter defaults to
> "all days" — a single-day default would hide unapproved/stale handovers from
> prior days, a safety regression); and the shift-*selection* pages
> (`my-shift`, `shift-closing`, `enter-readings`), which belong to the larger
> `Shift_Selection_Across_App_Plan.md`. This item does NOT implement that plan's
> backend (resolve_target_shift / assert_shift_editable / /shifts/selectable).
>
> **Known interaction (see §13):** viewing a *past* day's close-off history sets
> the working day to that date, which then carries to the data-entry pages. The
> date is always visible on each page; sessionStorage reset mitigates it.


**Today.** `enter-readings`, `my-shift`, `shift-closing`, `daily-tank-reading`,
`handover-review`, `lpg-daily`, `lubricants-daily` each own a date/shift picker
that resets on navigation, so the manager re-selects the same day repeatedly.

**Change.** Persist the in-focus **working date + shift** (localStorage-backed
React context) and have each page initialise its existing picker from it (with a
per-page override still allowed). This is the simplification layer on top of the
already-specced selected-shift context.

> **Dependency.** This item *is* the UX consumer of
> `Shift_Selection_Across_App_Plan.md` §4.3 (`SelectedShiftProvider` /
> `useSelectedShift`). Land that plan's context first, or land a minimal
> date+shift slice of it here. Do **not** duplicate the selector logic — extend
> it. The "no-break" rules of that plan (attendants unchanged, additive APIs,
> reconciled write-lock) carry over verbatim.

**Files:** `frontend/contexts/` (reuse/extend the selected-shift context),
the date/shift picker init in each listed page. Backend: none beyond what
`Shift_Selection_Across_App_Plan.md` already specifies.

**Stays untouched:** each page's own logic and submit path; attendant flows
(per the dependency plan). Only the *initial value* of an existing picker
changes, and the user can still change it.

**Tests:**
- Set day/shift on the launchpad → open My Shift → picker pre-selected; change
  it there → reflected on next page.
- Attendant: no shared selector, behaviour identical to today.
- Per-page override still works and persists for the session.

---

## 5. Item 3 — Auto-sync banners (kill the forgettable buttons)

> **Implemented (2026-06-04).** Investigation found two of the three loaders
> *already* auto-run on load with provenance banners: the shift-dip pull
> (`fetchShiftDipReadings`, banner "Dip readings pulled from Shift…" + "Clear &
> enter manually") and the previous-shift opening carry-over
> (`fetchPreviousShiftData`, auto-fetched when opening values are empty). The one
> genuinely manual, forgettable loader was **Pull from Enter Readings**
> (`fetchFromEnterReadings`) — now auto-run once per tank/date/shift via a guarded
> effect, but **only while closing readings are still untouched** so it never
> clobbers in-progress edits, and **silent** when there's nothing to pull. The
> banner now reads "synced from attendant submissions (HH:MM) — edit any field as
> needed" with an **Undo** that restores the pre-pull nozzle snapshot. Also fixed
> the manual button, which passed the click event as the new `auto` arg. All
> loader logic and the submit payload are byte-for-byte unchanged.


**Today.** Cross-page carry-over already exists but is hidden behind manual
buttons that are easy to forget: `daily-tank-reading.tsx:381` "Pull from Enter
Readings" and `:1119` "Load Previous Shift"; opening-dip auto-fill on
`shifts.tsx:266`. Tank dips are entered on **both** `shifts.tsx:1194` and
`daily-tank-reading.tsx` — inviting double entry.

**Change.**
- Run the existing carry-over loaders **automatically on page load** and show an
  editable banner: *"Nozzle readings synced from attendant submission (2:14pm) —
  edit if needed"* with an **Undo** that restores the empty/manual state.
- Where a value already exists in another source (e.g. a tank dip recorded on
  the Shifts page), show it **read-only** with provenance — *"Opening dip 142cm
  recorded on Shifts page at 06:10"* — instead of an empty field. Both records
  are still written exactly as today; we only stop prompting a second entry.

**Files:** `frontend/pages/daily-tank-reading.tsx` (auto-invoke the existing
pull/load handlers on mount; add banner + undo), `frontend/pages/shifts.tsx`
(dip provenance display). No new data; reuses existing fetched values.

**Stays untouched:** the carry-over computations and the editability of every
field (Undo returns to the exact manual state). No endpoint changes.

**Tests:**
- On load with a prior submission present, nozzle rows pre-fill and the banner
  shows; Undo clears them to the manual baseline.
- With no prior data, no banner, form identical to today.
- Submitted payload with auto-synced values == payload a user would have
  produced by clicking the old button (regression on the request body).

---

## 6. Item 4 — Reason chips for mandatory notes (shared component)

> **Implemented (2026-06-03).** `frontend/components/ReasonChips.tsx` created and
> wired into the three roomy **modal** textareas — handover approve
> (`REASON_PRESETS.approveFlagged`), handover return (`returnHandover`), and the
> Stores damage/adjust reason (`damage`/`adjust`). The validation gates are
> untouched (empty note still blocks submit). **Deferred:** the narrow per-row
> inline note inputs in `enter-readings`, `lpg-daily`, `lubricants-daily` — chips
> below a `w-40` table-cell textarea balloon row height; a `<datalist>` of the
> same presets is the better fit for those and is a fast-follow.


**Today.** Mandatory free-text justification is demanded in many high-frequency
places, each typed by hand: meter-deviation notes (`enter-readings.tsx:647`),
stock/LPG/lubricant variance notes, damage reasons (`lpg-daily.tsx:664`,
`lubricants-daily.tsx:551`, `stores.tsx:363`), and flagged-handover approval /
return notes (`handover-review.tsx:601`, `:567`).

**Change.** A shared `<ReasonChips />` component renders a few preset buttons
above the existing textarea ("Counted twice — confirmed", "Damaged in handling",
"Inventory error", "Within agreed tolerance", + free text). Clicking one fills
the textarea, which stays fully editable.

**Files:** `frontend/components/ReasonChips.tsx` (new), wired into the pages
above. Presets per context can live in a small constant map.

**Stays untouched:** the note is **still required, still validated non-empty,
still stored verbatim and audited.** Chips are a keyboard shortcut on an
unchanged control — the submit-disable logic (e.g. `handover-review.tsx:616`)
is untouched.

**Tests:**
- Empty note still blocks submit (no regression on the gate).
- Clicking a chip fills the field; editing after still works; stored text equals
  the field value.

---

## 7. Item 5 — "Active only" defaults on long stock forms

> **Revised + implemented (2026-06-03).** The original "default *show only
> changed* ON" is **harmful**: that filter keys off user-entered
> `additions`/`sold_or_drawn` (`lubricants-daily.tsx:172`), and carried-forward
> opening stock is *not* "changed" — so defaulting it ON hides **every row on a
> blank entry form**. Per the user's call, the goal is met instead by
> **collapsing the existing category accordions by default** (`lubricants-daily.tsx`
> now seeds `collapsedCategories` with all categories on product load): the page
> opens short, the user expands the category they need, no rows are hidden behind
> a filter and no submit/total semantics change. `lpg-daily` (6 sizes) and
> `my-shift` (no category accordions) are out of scope — the pattern doesn't fit.


**Today.** `lpg-daily` renders all 6 cylinder sizes and `lubricants-daily` the
full catalog by category every shift; the attendant scrolls past mostly-zero
rows. Lubricants already has a "show only changed" checkbox
(`lubricants-daily.tsx:388`) that defaults **off**.

**Change.** Default the "show only changed/active" filter **on** for
`lubricants-daily`, and add the equivalent collapse to `lpg-daily` and the
My Shift stock tables. Rows are collapsed, never removed — a one-click "show all"
reveals everything, and any row with activity stays visible.

**Files:** `frontend/pages/lubricants-daily.tsx`, `frontend/pages/lpg-daily.tsx`,
`frontend/pages/my-shift.tsx`.

**Stays untouched:** all rows still exist and submit identically; nothing is
hidden permanently; totals span every row as today.

**Tests:**
- Default view hides zero-activity rows; "show all" reveals them.
- A row that gets activity appears automatically.
- Submitted payload identical whether rows were collapsed or not.

---

## 8. Item 6 — Forward navigation ("Next →")

> **Implemented (2026-06-04).** Contextual "Next →" links added to the
> dead-end result/completion states, following the day's chain:
> - `shift-closing` result card → **"Next: Handover Review →"** (always, once a
>   shift is closed — a manager reviews next).
> - `handover-review` → **"Next: Daily Close-Off →"**, shown only when the day is
>   fully reviewed (`pending===0 && flagged===0 && awaiting===0 && approvedToday>0`),
>   reusing the page's existing summary state.
> - `daily-tank-reading` submit-success banner → **"Next: Three-Way Reconciliation →"**.
>
> All are plain `next/link` navigations — no logic, data, or submit behaviour
> changes; they only surface the next step the manager would otherwise navigate
> to by hand.


**Today.** `shift-closing.tsx` and `daily-tank-reading.tsx` dead-end on a result
screen; the manager must navigate manually to the next step. Approving the last
handover doesn't suggest closing the day.

**Change.** Add a contextual "Next: …" link at the end of each step, driven by
the same step-status the launchpad (item 1) computes — e.g. after shift closing,
"Next: Handover Review →"; after the final approval, "Next: Daily Close-Off →".

**Files:** `frontend/pages/shift-closing.tsx`, `frontend/pages/daily-tank-reading.tsx`,
`frontend/pages/handover-review.tsx`. Reuses the item-1 status helper.

**Stays untouched:** submission results and their display; this only adds an
onward link.

**Tests:**
- The "Next" target matches the first incomplete step for the day.
- Hidden/disabled when nothing is outstanding.

---

## 9. Item 7 — Single Stores action modal

**Today.** Stores has five separate modals (Receive / Issue / Damage / Adjust /
Add-Edit), each a distinct button per row (`stores.tsx:186`), so the manager
hunts for the right one.

**Change.** Collapse Receive / Issue / Damage / Adjust into **one modal with an
action selector** at the top; the form shows exactly the fields that action
needs (identical to today's per-modal fields) and posts to the **same
endpoint**. Add/Edit-Item stays separate (different intent).

**Files:** `frontend/pages/stores.tsx` (consolidate the modal; same handlers,
same payloads).

**Stays untouched:** each action's fields, validation (damage/adjust reason
required, adjust as absolute count), and endpoint. Only the chrome merges.

**Tests:**
- Each action from the unified modal posts the same body as today's separate
  modal (regression per action).
- Required reason still gates Damage and Adjust.

---

## 10. Item 8 — Per-page polish

**Today.** Shift creation re-selects attendants/nozzles from scratch each day
(though *editing* pre-populates — `shifts.tsx:363`). LPG/lubricants remember the
salesperson (`lpg-daily.tsx:67`) but not date/shift/location. My Shift's two-step
"Proceed to Review" → "Submit Readings" reads as one step, so attendants think
they're done after step one.

**Change.**
- **Repeat last shift**: a "Use last shift's layout" option on the Shifts create
  modal that pre-loads yesterday's same-shift attendant/nozzle assignment as an
  editable starting point (reuses the existing edit-prefill path; same
  validation `shifts.tsx:519`).
- **Remember last date/shift/location** for `lpg-daily` and `lubricants-daily`
  for the session (mirrors the existing salesperson persistence).
- **Clearer two-step submit** on `my-shift.tsx`: relabel step one "Review before
  submitting" and show "Step 2 of 2 — submit" so the second action is obvious.
  Both steps and their logic are unchanged.

**Files:** `frontend/pages/shifts.tsx`, `frontend/pages/lpg-daily.tsx`,
`frontend/pages/lubricants-daily.tsx`, `frontend/pages/my-shift.tsx`.

**Stays untouched:** shift validation/uniqueness rules; the two distinct submit
phases (state change vs backend submit); pricing/oversell guards.

**Tests:**
- Repeat-last-shift produces an editable layout that still passes all create
  validations; user edits before submit work.
- Remembered date/shift/location can be overridden and persist for the session.
- Relabelled submit still requires the same completion conditions.

---

## 11. Phasing (independent, reversible)

Ordered by leverage-over-risk. Each ships standalone.

1. **Item 4 (Reason chips)** + **Item 5 (Active-only defaults)** — smallest,
   touch many pages, immediate daily relief, near-zero risk. Good first PR.
2. **Item 1 (Today launchpad)** — the unifying win; read-only, no logic.
3. **Item 3 (Auto-sync banners)** — removes the forgettable buttons.
4. **Item 6 (Forward navigation)** — depends on item 1's status helper.
5. **Item 2 (Shared day/shift context)** — **gated on
   `Shift_Selection_Across_App_Plan.md`** landing (or a minimal date+shift slice
   of it). Highest coordination cost, so sequenced after the standalone wins.
6. **Item 7 (Single Stores modal)** + **Item 8 (Per-page polish)** — polish pass.

## 12. Relationship to existing plans

- **`Shift_Selection_Across_App_Plan.md`** — *dependency* for item 2; provides
  the cross-page selected-shift context and its no-break guarantees. This plan
  consumes it for UX, not the reverse.
- **`Stores_Dashboard_Plan.md`** — item 7 must stay consistent with the Stores
  dashboard structure; confirm the unified modal fits any tabs added there.
- **`Stock_SOP_Closing_Gap_Plan.md`** (Phases A–D) — items here are purely
  presentational and do not interact with that plan's damages / stock-take /
  reorder / GRN logic; the reason-chips (item 4) simply make its required
  damage/variance notes faster to enter.

## 13. Open questions

1. **Launchpad home (item 1):** embed as a card on the existing dashboard
   `index.tsx`, or a dedicated `today.tsx` with a top nav link? Plan leans to a
   dashboard card first (zero new route), promotable to its own page later.
2. **Launchpad data (item 1):** client-side composition of existing GETs (zero
   backend, preferred) vs one new read-only `GET /day-status`? Plan defaults to
   client-side; revisit only if the fan-out is too chatty.
3. **Shared-context scope (item 2):** wait for the full
   `Shift_Selection_Across_App_Plan.md`, or ship a minimal date+shift-only slice
   now and let the larger plan supersede it? Needs a sequencing decision.
4. **Reason-chip presets (item 4):** who curates the preset lists per context —
   hard-coded constants, or manager-editable in Settings later? Plan defaults to
   hard-coded constants for v1.
5. **Multi-station:** none of these items are station-specific, but confirm the
   shared-context persistence (item 2) clears on station switch (the dependency
   plan already specifies this).
