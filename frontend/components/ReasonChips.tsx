// Preset "reason" buttons that fill an adjacent note field with one tap.
//
// This is a pure UX convenience for the many places the app requires a
// free-text justification (flagged-handover approval/return, damage reasons,
// stock variance notes, meter-deviation notes). Tapping a chip sets the note
// to a sensible default that the user can still edit. It does NOT change any
// validation: the note remains required/non-empty exactly as before, and the
// stored text is whatever ends up in the field. Removing this component leaves
// the underlying textarea behaving exactly as it does today.

interface ReasonChipsProps {
  /** Preset reason strings to offer. */
  presets: readonly string[]
  /** Current note value — used to highlight the active chip. */
  value: string
  /** Called with the chosen preset; wire this to your existing note setter. */
  onSelect: (text: string) => void
  className?: string
}

// Common preset sets, grouped by where they are used. Hard-coded for v1
// (see Manager_Flow_Simplification_Plan.md §13 — manager-editable presets are a
// possible later refinement).
export const REASON_PRESETS = {
  approveFlagged: [
    'Counted twice — confirmed correct',
    'Within agreed tolerance',
    'Attendant float error, recovered',
    'Discussed with attendant — acceptable',
  ],
  returnHandover: [
    'Cash count does not match — please recount',
    'Meter reading looks wrong — re-check pump',
    'Missing safe deposit slip',
    'Stock variance unexplained — add a note',
  ],
  damage: [
    'Damaged in handling',
    'Damaged on arrival',
    'Leaking / faulty unit',
    'Expired stock',
  ],
  adjust: [
    'Physical count correction',
    'Inventory error',
    'Previously miscounted',
  ],
  variance: [
    'Counted twice — confirmed',
    'Inventory error',
    'Given as sample',
    'Damaged during shift',
  ],
} as const

export default function ReasonChips({ presets, value, onSelect, className }: ReasonChipsProps) {
  if (!presets || presets.length === 0) return null
  return (
    <div className={`flex flex-wrap gap-1.5 ${className || ''}`}>
      {presets.map(preset => {
        const active = value.trim() === preset
        return (
          <button
            key={preset}
            type="button"
            onClick={() => onSelect(preset)}
            className="px-2 py-0.5 text-[11px] rounded-full border transition-colors"
            style={{
              backgroundColor: active ? 'var(--color-action-primary)' : 'transparent',
              color: active ? '#fff' : 'var(--color-text-secondary)',
              borderColor: active ? 'var(--color-action-primary)' : 'var(--color-border)',
            }}
          >
            {preset}
          </button>
        )
      })}
    </div>
  )
}
