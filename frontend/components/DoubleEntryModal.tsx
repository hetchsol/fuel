import { useState } from 'react'
import { useTheme } from '../contexts/ThemeContext'

interface DoubleEntryModalProps {
  /** Heading, e.g. "LSD 1A — Electronic Closing". */
  title: string
  /** Optional unit suffix shown next to the input, e.g. "L". */
  unit?: string
  /** Minimum acceptable value (e.g. the opening reading). Enforced on step 1. */
  minValue?: number
  /** Called with the confirmed reading (the raw text the attendant typed) once
   *  both blind entries match 100%. */
  onConfirm: (value: string) => void
  /** Called when the attendant dismisses without confirming. */
  onCancel: () => void
}

/**
 * Blind double-entry (double-keying) prompt for a single numeric reading.
 *
 * Step 1: the attendant types the reading; on Next the value is held in memory
 * and the field is cleared. Step 2: they re-enter the same reading with the
 * first entry hidden from the screen. The two entries must be numerically equal
 * (100% match) for the reading to be accepted — `10` and `010.0` count as a
 * match; any difference discards both entries and restarts at step 1.
 *
 * This component captures a value only; it performs no business logic. The
 * confirmed reading is handed back verbatim via `onConfirm` so downstream
 * computations behave exactly as they did with direct typing.
 */
export default function DoubleEntryModal({ title, unit, minValue, onConfirm, onCancel }: DoubleEntryModalProps) {
  const { theme } = useTheme()
  const [phase, setPhase] = useState<'first' | 'second'>('first')
  // Held in memory between the two steps; NEVER rendered during step 2 so the
  // re-entry stays blind.
  const [firstValue, setFirstValue] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [error, setError] = useState('')

  const handleNext = () => {
    const trimmed = input.trim()
    if (trimmed === '' || isNaN(Number(trimmed))) {
      setError('Enter a valid number.')
      return
    }
    if (minValue != null && Number(trimmed) < minValue) {
      setError(`Reading must be at least ${minValue}.`)
      return
    }
    setFirstValue(trimmed)
    setInput('')
    setError('')
    setPhase('second')
  }

  const handleConfirm = () => {
    const trimmed = input.trim()
    if (trimmed === '' || isNaN(Number(trimmed))) {
      setError('Enter a valid number.')
      return
    }
    if (firstValue != null && Number(trimmed) === Number(firstValue)) {
      onConfirm(trimmed)
      return
    }
    // Mismatch — discard both entries and restart the blind cycle.
    setError("Entries didn't match. Please enter the reading again.")
    setFirstValue(null)
    setInput('')
    setPhase('first')
  }

  const startOver = () => {
    setFirstValue(null)
    setInput('')
    setError('')
    setPhase('first')
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-sm rounded-lg shadow-lg p-5"
        style={{ backgroundColor: theme.cardBg, borderColor: theme.border, borderWidth: 1 }}
      >
        <h3 className="text-base font-bold mb-1" style={{ color: theme.textPrimary }}>{title}</h3>
        <p className="text-sm font-medium mb-3" style={{ color: theme.textSecondary }}>
          {phase === 'first'
            ? 'Entry 1 of 2 — type the reading'
            : 'Entry 2 of 2 — type it again to confirm (first entry hidden)'}
        </p>

        <div className="flex items-center gap-2">
          <input
            // `key` forces a fresh, empty field when switching phases so the
            // first entry can never linger on screen.
            key={phase}
            type="number"
            step="0.001"
            inputMode="decimal"
            autoFocus
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                if (phase === 'first') handleNext()
                else handleConfirm()
              }
            }}
            placeholder="0.000"
            className="flex-1 px-4 py-3 rounded border text-right font-mono text-2xl"
            style={{ backgroundColor: theme.background, color: theme.textPrimary, borderColor: theme.border }}
          />
          {unit && <span className="text-sm" style={{ color: theme.textSecondary }}>{unit}</span>}
        </div>

        {error && (
          <p className="text-xs mt-2" style={{ color: 'var(--color-status-error)' }}>{error}</p>
        )}

        <div className="flex justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={onCancel}
            className="px-5 py-3 rounded text-base"
            style={{ backgroundColor: theme.border, color: theme.textSecondary }}
          >
            Cancel
          </button>
          {phase === 'first' ? (
            <button
              type="button"
              onClick={handleNext}
              className="px-5 py-3 rounded text-base font-semibold text-white"
              style={{ backgroundColor: theme.primary }}
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              onClick={handleConfirm}
              className="px-5 py-3 rounded text-base font-semibold text-white"
              style={{ backgroundColor: theme.primary }}
            >
              Confirm
            </button>
          )}
        </div>

        {phase === 'second' && (
          <button
            type="button"
            onClick={startOver}
            className="mt-2 text-xs underline"
            style={{ color: theme.textSecondary }}
          >
            Start over
          </button>
        )}
      </div>
    </div>
  )
}
