import React from 'react'
import { useTheme } from '../contexts/ThemeContext'

// One figure the attendant has to confirm at shift start.
export interface CountLine {
  key: string          // e.g. "lpg:9:full", "acc:ACC-B", "lub:SHL-4L"
  group: 'LPG' | 'Accessories' | 'Lubricants'
  label: string
  system: number
}

interface Props {
  lines: CountLine[]
  counts: Record<string, string>
  onCountChange: (key: string, value: string) => void
  note: string
  onNoteChange: (value: string) => void
  consent: boolean
  onConsentChange: (value: boolean) => void
  fromForecourt: boolean
}

export const countLineState = (line: CountLine, value: string | undefined) => {
  if (value === undefined || value === '') return 'missing' as const
  const n = Number(value)
  if (!Number.isInteger(n) || n < 0) return 'invalid' as const
  return n === line.system ? 'match' as const : 'differs' as const
}

/**
 * Shift-start stock count. For every item the attendant is responsible for,
 * the system count is shown and the attendant either confirms it ("Correct")
 * or types what they physically counted. A difference needs a note and goes
 * to a manager for review; the attendant's count is their opening either way.
 */
export default function OpeningStockCount({
  lines, counts, onCountChange, note, onNoteChange, consent, onConsentChange, fromForecourt,
}: Props) {
  const { theme } = useTheme()
  const groups = (['LPG', 'Accessories', 'Lubricants'] as const)
    .map(g => ({ group: g, rows: lines.filter(l => l.group === g) }))
    .filter(g => g.rows.length > 0)
  const states = lines.map(l => countLineState(l, counts[l.key]))
  const remaining = states.filter(s => s === 'missing' || s === 'invalid').length
  const differing = lines.filter((l, i) => states[i] === 'differs')

  return (
    <div className="rounded-lg shadow overflow-hidden" style={{ backgroundColor: theme.cardBg, borderColor: theme.border, borderWidth: 1 }}>
      <div className="p-4" style={{ borderBottomColor: theme.border, borderBottomWidth: 1 }}>
        <div className="font-semibold text-sm" style={{ color: theme.textPrimary }}>Opening stock count</div>
        <p className="text-xs mt-1" style={{ color: theme.textSecondary }}>
          Count what is physically on the forecourt. Press Correct if it matches the system,
          or type the number you counted.
          {fromForecourt
            ? ' The system count includes stock the manager issued since the last shift.'
            : ' The system count is the previous shift\'s closing count.'}
        </p>
      </div>

      {groups.map(({ group, rows }) => (
        <div key={group}>
          <div className="px-4 py-2 text-xs font-semibold uppercase" style={{ backgroundColor: theme.background, color: theme.textSecondary }}>
            {group}
          </div>
          {rows.map(line => {
            const value = counts[line.key] ?? ''
            const state = countLineState(line, counts[line.key])
            const borderColor = state === 'differs' ? 'var(--color-status-warning)'
              : state === 'invalid' ? 'var(--color-status-error)'
              : state === 'match' ? 'var(--color-status-success)' : theme.border
            return (
              <div key={line.key} className="px-4 py-2 flex flex-wrap items-center gap-x-3 gap-y-1"
                style={{ borderTopColor: theme.border, borderTopWidth: 1 }}>
                <span className="flex-1 min-w-[10rem] text-sm" style={{ color: theme.textPrimary }}>{line.label}</span>
                <span className="text-xs w-24" style={{ color: theme.textSecondary }}>
                  System: <span className="font-mono" style={{ color: theme.textPrimary }}>{line.system}</span>
                </span>
                <button type="button"
                  onClick={() => onCountChange(line.key, String(line.system))}
                  className="px-3 py-1.5 text-xs font-semibold rounded border"
                  style={state === 'match'
                    ? { backgroundColor: 'var(--color-status-success)', color: '#fff', borderColor: 'var(--color-status-success)' }
                    : { backgroundColor: theme.background, color: theme.textPrimary, borderColor: theme.border }}>
                  Correct
                </button>
                <input
                  type="number" min={0} step={1} inputMode="numeric"
                  aria-label={`Counted ${line.label}`}
                  placeholder="Count"
                  value={value}
                  onChange={e => onCountChange(line.key, e.target.value)}
                  className="w-20 px-2 py-1.5 text-sm font-mono rounded border"
                  style={{ backgroundColor: theme.background, color: theme.textPrimary, borderColor, borderWidth: state === 'missing' ? 1 : 2 }}
                />
                {state === 'differs' && (
                  <span className="text-xs w-full sm:w-auto" style={{ color: 'var(--color-status-warning)' }}>
                    {Number(value) > line.system ? 'More' : 'Less'} than system by {Math.abs(Number(value) - line.system)}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      ))}

      <div className="p-4 space-y-3" style={{ borderTopColor: theme.border, borderTopWidth: 1 }}>
        {differing.length > 0 && (
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-status-warning)' }}>
              Explain the difference ({differing.map(l => l.label).join(', ')})
            </label>
            <textarea
              rows={2}
              value={note}
              onChange={e => onNoteChange(e.target.value)}
              placeholder="e.g. Only 7 x 9kg full on the rack, 8 shown by the system"
              className="w-full px-3 py-2 text-sm rounded border"
              style={{ backgroundColor: theme.background, color: theme.textPrimary, borderColor: 'var(--color-status-warning)' }}
            />
            <p className="text-xs mt-1" style={{ color: theme.textSecondary }}>
              Your count becomes your opening stock. A manager will review the difference.
            </p>
          </div>
        )}
        <label className="flex items-start gap-2 text-sm cursor-pointer" style={{ color: theme.textPrimary }}>
          <input type="checkbox" className="mt-0.5" checked={consent} onChange={e => onConsentChange(e.target.checked)} />
          <span>I counted this stock myself and the figures above are what I am taking over.</span>
        </label>
        {remaining > 0 && (
          <p className="text-xs" style={{ color: theme.textSecondary }}>
            {remaining} {remaining === 1 ? 'item still needs' : 'items still need'} a count.
          </p>
        )}
      </div>
    </div>
  )
}
