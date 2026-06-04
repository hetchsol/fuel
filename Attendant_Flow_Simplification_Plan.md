# Attendant Usability Simplification — Master Plan

**Status:** Phase 1 (items 1 + 3) implemented on branch `simplify/attendant-flow`. Remaining items not started.
**Date:** 2026-06-04
**Scope:** Make the **attendant** (`role === 'user'`) experience easier end-to-end —
clearer wayfinding, an obvious step sequence, a shorter form on a forecourt
phone, and visible status — **without changing any business logic, validation
gate, calculation, stored record, the blind double-entry control, the two-phase
(readings → closing) model, the approve/return/redo lifecycle, or role gating.**
Presentation, navigation, sequencing, defaults, and guidance only.

**Why now.** The attendant flow is functionally solid (auto-filled openings/stock,
"No Sales" shortcuts, inline variance detection, searchable lubricants,
collapsible sections, mid-shift deposits). The friction is in **wayfinding,
step-clarity, form length on a phone, and status feedback** — not the data rules.
This plan targets exactly those, reusing patterns already shipped for managers
(`Manager_Flow_Simplification_Plan.md`: launchpad checklist, "Next →" links,
open-short collapse).

## 1. The items

| # | Simplification | Risk |
|---|---|---|
| 1 | **Attendant landing card** — "start / continue your shift" with the single next action | Low |
| 2 | **One canonical reading-entry page + attendant-friendly nav** (gated on the open question) | Low |
| 3 | **Step clarity + "Next: Close Shift →"** — make the 2 steps and the readings→closing hop obvious | Lowest |
| 4 | **Open-short stock sections + "what's left to submit" checklist** | Lowest |
| 5 | **Double-entry keying polish** (keep the control, smooth the taps) | Low |
| 6 | **Loud "Returned — redo" status** (landing + in-page) | Lowest |
| 7 | **Safe-deposit "Now" + inline overdue banner** (de-mixed from the supervisor bell) | Low |

## 2. Cross-cutting "no-break" guarantees

Hold for **every item**:

1. **No business logic touched** — volume/deviation/variance/cash math,
   `canProceedToReview` blockers, `_compute_auto_flags`, handover/closing
   submission, shift-status — all read-only here.
2. **The blind double-entry control stays exactly as it is.** Items that touch it
   (5) change only labels, focus, and touch-target size — never the
   enter-twice-and-match requirement.
3. **Every submit-blocking validation and mandatory note stays.** Variance notes,
   deviation notes, "sold ≤ opening", all-closings-verified — unchanged.
4. **The two-phase model is preserved.** Readings (forecourt, `/handover/submit-readings`)
   then closing (office, `/handover/submit-closing`) remain distinct; we only make
   the hop between them visible.
5. **Approve / return / redo lifecycle unchanged** — we surface status more loudly,
   not alter it.
6. **Role gating unchanged** (`middleware.ts` + `Layout.tsx` role arrays). Nav
   changes only affect what an attendant is *steered to*, never their permissions.
7. **Frontend-only, additive.** Where status is needed (items 1, 6) it is composed
   from existing endpoints (`/handover/my-shifts`, `/handover/my-shift`,
   handover `review_status`) — no new contracts, no payload changes.

---

## 3. Item 1 — Attendant landing card (highest leverage)

> **Implemented (2026-06-04).** `frontend/components/AttendantShiftCard.tsx` —
> read-only card composing `/handover/my-shift` + `/handover/entries` into the
> attendant's single next action (no shift / enter readings / close shift /
> redo if returned / awaiting review / approved), mounted on `index.tsx` for
> `role === 'user'`. GETs only; links into existing pages.


**Today.** Attendants land on the generic Dashboard (`index.tsx`): tank cards,
daily summary, discrepancies, stat cards — all read-only and manager-oriented.
The Today's Flow launchpad is manager/owner-only (`index.tsx:~106`). There is no
obvious "begin / continue my shift" action; the attendant must know to go
My Shift → Readings Verification (2–3 clicks).

**Change.** An attendant-only card at the top of the dashboard (reuse the
`DayChecklist` shell) showing **their** active shift and the **single next
action**, derived from their handover `review_status`:
- no readings yet → **"Enter shift readings →"** (`/my-shift`)
- mid-entry / verified-not-closed → **"Continue / Close shift →"**
- returned → **"⚠ Returned — redo readings →"** (loud)
- approved → **"Shift submitted — approved ✓"** (done)

**Files:** `frontend/pages/index.tsx` (render the card when `role === 'user'`),
new `frontend/components/AttendantShiftCard.tsx`. Reads `/handover/my-shifts` +
`/handover/my-shift` (already used by the attendant pages).

**Stays untouched:** the dashboard's existing cards for other roles; all shift
logic — the card only reads status and links.

**Tests:** renders correct next-action for each `review_status`; only GETs;
hidden for non-attendants.

---

## 4. Item 2 — One canonical reading-entry page + attendant-friendly nav

**Today.** An attendant sees **two** reading-entry routes that hit **different
backends**: My Shift → **"Readings Verification"** (`/my-shift` → `/handover/*`)
and Operations → **"Enter Readings"** (`/enter-readings` → `/enter-readings/*`),
plus a read-only **Shifts** link and a disabled **OCR** item
(`Layout.tsx:316,324,325,327`). "Readings Verification" is supervisor language;
the duplication is confusing.

**Change (gated on §9 open question).** Expose the **one** canonical entry point
to attendants and hide the other *for that role*; relabel it to attendant
language (e.g. **"My Shift Readings"**). Recommended canonical = the
**handover** path (`/my-shift`), since it is the one wired to handover review,
shift closing, and daily close-off. Drop the read-only Shifts link and the
disabled OCR item from the attendant's menu.

**Files:** `frontend/components/Layout.tsx` (attendant nav labels/visibility —
roles arrays unchanged; only which items render for `user`).

**Stays untouched:** both pages keep working and keep their current roles/routes;
nothing is deleted — the attendant is simply steered to one. Supervisors’ nav
unaffected.

**Tests:** attendant sees a single, clearly-named readings entry; supervisor nav
unchanged; direct URLs to either page still load.

---

## 5. Item 3 — Step clarity + "Next: Close Shift →"

> **Implemented (2026-06-04).** Step indicator relabelled "Step 1 · Enter readings"
> / "Step 2 · Review & submit" (`my-shift.tsx`), and a prominent "Next: Close
> Shift →" link added to the readings-verified banner. No change to the two-step
> logic, submit calls, or `canProceedToReview`.


**Today.** Step 1 → Step 2 uses "Review My Entries →" then a confirm modal then
"Submit Readings" — the two distinct actions read as one, and after submitting,
the success banner only says "proceed to the office for shift closing"
(`my-shift.tsx:~1668, ~1906, ~1992`) with **no direct link** to `/shift-closing`.

**Change.** Label the phases **"Step 1 of 2 — Enter readings"** / **"Step 2 of 2 —
Review & submit"**, and add a direct **"Next: Close Shift →"** button on the
readings-submitted banner (the same pattern shipped for managers, item 6 of the
manager plan).

**Files:** `frontend/pages/my-shift.tsx`.

**Stays untouched:** the two submit actions and their endpoints; the confirm
modal; `canProceedToReview`.

**Tests:** the "Next" button appears only after a successful readings submit and
routes to `/shift-closing`; step labels don't alter gating.

---

## 6. Item 4 — Open-short stock sections + "what's left" checklist

**Today.** Nozzles + LPG + Accessories + Lubricants stack into a long scroll on a
forecourt phone. The only "what's blocking submit" signal is the disabled
button's changing text (`my-shift.tsx:~1675`).

**Change.**
- Default-**collapse** the stock sections (LPG/Accessories/Lubricants); keep
  **Nozzles open** (the core task) — expand on demand (same non-destructive
  collapse used for lubricant categories in the manager work).
- Add a small **sticky "to submit" checklist** that lists the live blockers
  ("2 closings left", "1 deviation note", "explain LPG variance") sourced from the
  existing `canProceedToReview` computation — so the attendant isn't hunting.

**Files:** `frontend/pages/my-shift.tsx`.

**Stays untouched:** all rows/fields and the "No Sales" shortcuts; the blocker
logic is read, not changed — nothing new can be submitted.

**Tests:** collapsed sections still submit identically; checklist items map
exactly to the existing blockers and clear as they're satisfied.

---

## 7. Item 5 — Double-entry keying polish (keep the control)

**Today.** Blind double-entry on each nozzle closing (electronic *and*
mechanical) is a deliberate accuracy control (`DoubleEntryModal.tsx`) — ~4 modal
cycles per nozzle.

**Change (control unchanged).** Bigger touch targets, explicit **"Entry 1 of 2 /
2 of 2"** labels, autofocus + Enter-to-advance (already partly present), and
tighter modal copy. The enter-twice-and-must-match behaviour is **not** altered.

**Files:** `frontend/components/DoubleEntryModal.tsx` (+ minor copy in
`my-shift.tsx` / `enter-readings.tsx` where it's invoked).

**Stays untouched:** validation, matching comparison, min-value guard, re-do link.

**Tests:** mismatch still rejects and resets; match still confirms; min-value
guard intact.

---

## 8. Item 6 — Loud "Returned — redo" status

**Today.** A returned handover shows only as an in-page banner + "Redo Readings"
inside `/my-shift` (`my-shift.tsx:~919`); easy to miss, and the supervisor's note
isn't prominent.

**Change.** Surface "⚠ Returned — action needed" on the landing card (item 1),
and in `/my-shift` show the supervisor's return note prominently beside a clear
**Redo readings** CTA.

**Files:** `frontend/pages/my-shift.tsx`, `frontend/components/AttendantShiftCard.tsx`.

**Stays untouched:** the redo endpoint and the form-reset behaviour.

**Tests:** returned status appears on landing + in-page with the note; redo still
resets to Step 1.

---

## 9. Item 7 — Safe-deposit "Now" + inline overdue banner

**Today.** The deposit time field pre-fills "now" but goes stale; the **overdue**
alert lives in the notification bell mixed with supervisor notifications that
attendants can't open (`Layout.tsx:~462`, `my-shift.tsx:927-996`).

**Change.** A **"Now"** tap to reset the time field to the current time, and an
**inline deposit-overdue banner on the attendant's own workspace** (the bell
stays for supervisors). Optionally point the attendant's overdue indicator at the
deposit section rather than `/notifications`.

**Files:** `frontend/pages/my-shift.tsx`, `frontend/components/Layout.tsx`
(attendant overdue indicator target only).

**Stays untouched:** deposit recording, the 1-hour overdue rule, totals, the
POST `/safe-deposits/` call.

**Tests:** "Now" sets current time; overdue banner shows on the workspace for
attendants; deposit submit unchanged.

---

## 10. Phasing (independent, reversible)

1. **Item 1 (landing card) + Item 3 (step clarity + Next link)** — biggest
   "where do I go / am I done?" win, zero logic change. First PR.
2. **Item 4 (open-short + checklist) + Item 6 (returned status)** — shorter form,
   visible rework.
3. **Item 7 (deposits/bell) + Item 5 (double-entry polish)** — polish.
4. **Item 2 (canonical reading page + nav labels)** — **gated on §9**; highest
   coordination, so last.

## 11. Relationship to existing plans

- **`Manager_Flow_Simplification_Plan.md`** — this reuses its shipped patterns
  (the `DayChecklist`/launchpad shell for item 1, "Next →" links for item 3,
  non-destructive collapse for item 4). Same no-break philosophy.
- **`Shift_Selection_Across_App_Plan.md`** — unrelated to attendants (attendants
  keep their own active-assigned shift); no dependency.

## 12. Open questions

1. **Canonical reading-entry page for attendants (decides item 2):** is
   `/my-shift` (handover pipeline) the single live entry point, with
   `/enter-readings` (its own `/enter-readings/*` pipeline + supervisor review)
   now secondary/legacy — or are both intentionally in use? Plan **recommends
   `/my-shift` as canonical** and hiding `/enter-readings` from the attendant menu,
   but this needs confirmation before touching nav.
2. **Landing (item 1):** add an attendant card to the existing dashboard
   (recommended, zero new route) vs. redirect attendants from `/` straight to
   `/my-shift`?
3. **Dashboard content for attendants:** keep the read-only tank/summary/
   discrepancy cards, or trim them to declutter the attendant's home?
