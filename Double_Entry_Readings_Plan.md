# Double-Entry (Blind Re-Key) for Closing Meter Readings — Plan

**Status:** Plan only — not implemented.
**Date:** 2026-05-26

## 1. Goal

Reduce mis-keyed pump readings by forcing the attendant to enter each
**closing meter reading twice, blind**. The first value is hidden from the
screen and held in memory; a prompt then asks the attendant to re-enter the
same reading. The two entries must match **100%** before the reading is
accepted. If they don't match, both are discarded and the attendant re-enters
from scratch until they agree.

This is the classic "blind double-keying" data-quality control. Its value
comes entirely from the second entry being **blind** — the attendant must not
be able to see entry #1 while typing entry #2.

## 2. Scope (confirmed decisions)

| Decision | Choice |
|---|---|
| Which readings | **Closing readings only** — electronic closing + mechanical closing per nozzle. Opening is carried from the previous shift; changeover (price-change) reading is out of scope for v1. |
| On-screen flow | **Per-reading blind re-prompt** — type a reading → it disappears → prompt to re-enter that one value → compare. |
| Mismatch handling | **Re-enter until it matches** — discard both, show "didn't match", repeat the enter-twice cycle for that reading. No proceed-with-flag, no hard cap. |
| Other readings | **Nozzle meter readings only** — tank dip readings are NOT included in v1. |

## 3. Where this lives today

Primary entry surface: **`frontend/pages/my-shift.tsx`** — the attendant's
"Readings Verification" step (Step 1 of the wizard). Per nozzle, in a table,
the attendant currently types directly into:

- **Electronic closing** — `row.closing_reading` → `updateClosingReading(nozzle_id, value)`
- **Mechanical closing** — `row.mechanical_closing` → `updateMechClosing(nozzle_id, value)`

Continue-to-Step-2 is gated by `allClosingsEntered` and `allMechEntered`
(every closing value non-empty).

Second surface (confirmed in scope): **`frontend/pages/enter-readings.tsx`**
also captures `electronic_closing` / `mechanical_closing`, and attendants use
it too. The same component is reused there with identical rules (see §9).

## 4. UX flow (per closing reading)

The closing-reading cells become **tap-to-enter buttons** rather than free
text inputs. Tapping one opens the **Double-Entry modal**:

```
┌─────────────────────────────────────────┐
│  LSD 1A — Electronic Closing             │
│  Step 1 of 2: Enter the reading          │
│                                          │
│        [   ____________  ] L             │
│                                          │
│                 [ Next → ]   [ Cancel ]  │
└─────────────────────────────────────────┘
        │  attendant types 48213.500, taps Next
        ▼   (value stored in memory; input cleared)
┌─────────────────────────────────────────┐
│  LSD 1A — Electronic Closing             │
│  Step 2 of 2: Re-enter to confirm        │
│  (first entry is hidden)                 │
│                                          │
│        [   ____________  ] L             │
│                                          │
│               [ Confirm ]    [ Cancel ]  │
└─────────────────────────────────────────┘
        │
        ├── entries equal → ✓ accepted, modal closes, cell shows
        │                    the value with a green check
        │
        └── entries differ → "Entries didn't match. Please enter
                              again." → discard both → back to Step 1
```

After acceptance, the table cell displays the confirmed value with a ✓ and a
small "Re-do" affordance. Tapping Re-do clears the verification and reopens the
modal at Step 1 (changing a reading requires double-entering again).

## 5. Definition of "100% match"

Compare the **canonical numeric value**, not the raw keystrokes, so harmless
formatting differences are not false mismatches:

- Accept when `Number(entry1) === Number(entry2)` and both are valid finite
  numbers (e.g. `010.0` and `10` match; `48213.5` and `48213.50` match).
- This treats two **identical readings** as a match regardless of leading
  zeros / trailing decimal zeros.

(If you'd prefer strict character-for-character matching, that's a one-line
change — but numeric equality is the safer default for meter values.)

## 6. Basic validation inside the modal

To avoid double-entering an obviously invalid value, Step 1 enforces:

- Must be a valid number.
- Must be **≥ the opening reading** for that nozzle/meter (same rule the table
  shows inline today). If it fails, show the message in the modal and stay on
  Step 1.

Deviation/loss threshold flags (electronic-vs-mechanical) are **unchanged** —
they continue to be computed after the value is committed, exactly as today.

## 7. Component design — `DoubleEntryModal`

New reusable component: `frontend/components/DoubleEntryModal.tsx`.

**Props**
- `title: string` — e.g. `"LSD 1A — Electronic Closing"`
- `unit?: string` — e.g. `"L"`
- `minValue?: number` — opening reading, for the ≥ check
- `onConfirm: (value: number) => void`
- `onCancel: () => void`

**Internal state**
- `phase: 'first' | 'second'`
- `firstValue: string | null` (held in memory; never rendered in phase 2)
- `input: string` (current field)
- `error: string`

**Behavior**
- `phase === 'first'`: bind `input`; on Next → validate → `firstValue = input`,
  `input = ''`, `phase = 'second'`.
- `phase === 'second'`: render with `firstValue` **not shown**; on Confirm →
  if `Number(input) === Number(firstValue)` call `onConfirm(Number(input))`;
  else set error, `firstValue = null`, `input = ''`, `phase = 'first'`.
- Cancel → `onCancel()` (cell stays unverified).
- Mobile: `inputMode="decimal"`, large tap targets, autofocus each phase.

The blind property is structural: `firstValue` is only ever used for the
comparison; it is never placed in a rendered element.

## 8. Changes in `my-shift.tsx`

1. **Data model** — extend `NozzleRow` with verification flags:
   - `closing_verified: boolean`
   - `mech_closing_verified: boolean`
   (Initialize `false`; reset to `false` whenever the corresponding value is
   cleared/re-done.)

2. **Cells** — replace the two closing `<input>`s with buttons:
   - Empty/unverified → "Enter" button (opens modal at Step 1).
   - Verified → value + ✓ + "Re-do" link.
   - On `onConfirm(value)`: set `closing_reading`/`mechanical_closing` and the
     matching `*_verified = true`.

3. **Modal wiring** — single modal instance driven by state such as
   `activeEntry: { nozzleId, field: 'electronic' | 'mechanical' } | null`.

4. **Gating** — strengthen the existing gates so Continue requires *verified*,
   not merely non-empty:
   - `allClosingsEntered` → every row `closing_verified === true`.
   - `allMechEntered` → every row `mech_closing_verified === true`.

5. **Submit** — unchanged payload shape; it already sends `closing_reading`
   (and mechanical). No new required backend fields.

## 9. Reuse on `enter-readings.tsx` (confirmed in scope)

Attendants enter closing readings on this page too, so it gets the same
treatment: apply `DoubleEntryModal` to its `electronic_closing` /
`mechanical_closing` inputs with identical gating, verification flags, and
"verified before continue/submit" rules. Same component, same behavior as
`my-shift.tsx`.

## 10. Backend

**No change required for v1.** Double-entry is a client-side capture control;
the server still receives the final, confirmed closing readings.

*Optional (future):* record an audit signal per reading — e.g.
`double_entry_mismatch_count` — so supervisors can see which readings took
several tries. Not part of this plan unless requested.

## 11. Edge cases

- **Cancel mid-entry** → reading stays unverified; Continue stays disabled.
- **Re-do a verified reading** → clears verification; must double-enter again.
- **Opening edited after closing verified** → if opening changes, re-run the
  ≥ opening check; if now invalid, surface the existing inline error (value
  stays as entered; attendant fixes via Re-do).
- **Price-change (changeover) shift** → changeover reading is out of scope for
  v1 and continues to use the normal single input.
- **Browser refresh** → in-memory first entry is lost (expected); attendant
  re-enters. Confirmed values persist only once committed to `nozzleRows`
  state like today (no new persistence).

## 12. Out of scope (v1)

- Tank dip double-entry (Daily Tank Reading page).
- Opening / changeover reading double-entry.
- Any "proceed with flag after N tries" path (we re-enter until match).
- Backend audit counters.

## 13. Test plan

Component tests for `DoubleEntryModal`:
- Step 1 → Step 2 transition hides first value.
- Matching second entry calls `onConfirm` with the numeric value.
- Non-matching entry resets to Step 1 and shows the mismatch message.
- `010.0` vs `10` is treated as a match; `10` vs `11` is a mismatch.
- Value below `minValue` is rejected at Step 1.

Page-level (my-shift):
- Continue disabled until all closing electronic + mechanical are *verified*.
- Re-do clears verification and re-disables Continue.

## 14. Effort / files touched

- **New:** `frontend/components/DoubleEntryModal.tsx`
- **Edit:** `frontend/pages/my-shift.tsx` (cells, state flags, gating)
- **Edit:** `frontend/pages/enter-readings.tsx` (reuse modal — same as my-shift)
- **Backend:** none for v1
- Rough size: ~1 new component + focused edits to 2 pages. No data-model or
  API changes.
