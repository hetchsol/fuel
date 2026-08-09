import { useState, useEffect } from 'react'
import { useTheme } from '../contexts/ThemeContext'
import LoadingSpinner from './LoadingSpinner'
import { loadTankDips, saveTankDips, TankInfo, TankDipState } from '../lib/tankDips'

interface TankDipsCaptureProps {
  date: string
  shiftType: string
  userRole: string
  onSaved: () => void
  continueLabel?: string
}

export default function TankDipsCapture({ date, shiftType, userRole, onSaved, continueLabel }: TankDipsCaptureProps) {
  const { theme } = useTheme()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [tanks, setTanks] = useState<TankInfo[]>([])
  const [dips, setDips] = useState<Record<string, TankDipState>>({})
  const [delegateReason, setDelegateReason] = useState('')

  const isDelegate = userRole === 'supervisor'

  const inputStyle = {
    backgroundColor: theme.background,
    color: theme.textPrimary,
    borderColor: theme.border,
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    loadTankDips(date, shiftType).then(result => {
      if (cancelled) return
      if (result.tanks.length === 0) {
        // Nothing to gate on — don't make the user click through an empty step.
        onSaved()
        return
      }
      setTanks(result.tanks)
      setDips(result.dips)
      setLoading(false)
    }).catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, shiftType])

  const allDipsEntered = tanks.every(t => (dips[t.tank_id]?.closing_dip_cm || '') !== '')
  const canContinue = allDipsEntered && (!isDelegate || delegateReason.trim() !== '')

  const handleSave = async () => {
    if (!canContinue) return
    setSaving(true)
    setError('')
    try {
      await saveTankDips(date, shiftType, tanks, dips, isDelegate ? delegateReason.trim() : undefined)
      onSaved()
    } catch (err: any) {
      setError(err.message || 'Failed to save tank dips')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <LoadingSpinner text="Loading tanks..." />

  return (
    <div>
      {error && (
        <div className="rounded-lg p-3 mb-4 text-sm" style={{ backgroundColor: 'var(--color-status-error-light)', color: 'var(--color-status-error)', borderWidth: 1, borderColor: 'var(--color-status-error)' }}>
          {error}
        </div>
      )}
      <div className="space-y-3">
        {tanks.map(tank => {
          const dip = dips[tank.tank_id] || { opening_dip_cm: null, closing_dip_cm: '', already_recorded: false }
          return (
            <div key={tank.tank_id} className="flex items-center gap-3">
              <div className="flex-1 text-sm font-medium" style={{ color: theme.textPrimary }}>
                {tank.display_name || tank.fuel_type}
              </div>
              <div className="text-xs text-right" style={{ color: theme.textSecondary, minWidth: 90 }}>
                Opening: {dip.opening_dip_cm != null ? `${dip.opening_dip_cm} cm` : '—'}
              </div>
              <div className="flex items-center gap-2">
                {dip.already_recorded && dip.closing_dip_cm !== '' && (
                  <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--color-status-success-light)', color: 'var(--color-status-success)' }}>
                    Recorded
                  </span>
                )}
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={0}
                    step="0.1"
                    value={dip.closing_dip_cm}
                    onChange={e => setDips(prev => ({ ...prev, [tank.tank_id]: { ...prev[tank.tank_id], closing_dip_cm: e.target.value, already_recorded: prev[tank.tank_id]?.already_recorded || false } }))}
                    placeholder="closing cm"
                    className="w-28 px-2 py-1.5 rounded border text-sm text-right font-mono"
                    style={inputStyle}
                  />
                  <span className="text-xs" style={{ color: theme.textSecondary }}>cm</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {isDelegate && (
        <div className="mt-4 pt-4" style={{ borderTopColor: theme.border, borderTopWidth: 1 }}>
          <label className="block text-xs font-medium mb-1" style={{ color: theme.textSecondary }}>
            Reason the manager is unavailable (required — logged, and the owner is notified)
          </label>
          <textarea
            value={delegateReason}
            onChange={e => setDelegateReason(e.target.value)}
            placeholder="e.g. Manager off-site attending to a supplier delivery at another station"
            rows={2}
            className="w-full px-3 py-2 rounded border text-sm"
            style={inputStyle}
          />
        </div>
      )}

      <div className="mt-4 flex justify-end">
        <button
          onClick={handleSave}
          disabled={!canContinue || saving}
          className="px-5 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ backgroundColor: canContinue ? theme.primary : '#9ca3af' }}>
          {saving ? 'Saving...' : (continueLabel || 'Continue')}
        </button>
      </div>
    </div>
  )
}
