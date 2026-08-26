import { useState, useEffect } from 'react'
import { useTheme } from '../contexts/ThemeContext'
import LoadingSpinner from './LoadingSpinner'
import { loadTankDips, saveTankDips, TankInfo, TankDipState, TankDeliveryInfo } from '../lib/tankDips'
import { authFetch, getHeaders, BASE } from '../lib/api'

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

  // Closing > opening always means a delivery on the backend's terms (it
  // rejects the save otherwise) — ask up front rather than let the manager
  // hit that as a save-time error. 'yes' needs delivery details captured
  // before it can save; 'no' blocks save entirely since there's genuinely
  // nothing valid to submit until the readings themselves are corrected.
  const [deliveryAnswers, setDeliveryAnswers] = useState<Record<string, 'yes' | 'no'>>({})
  const [deliveryDetails, setDeliveryDetails] = useState<Record<string, TankDeliveryInfo>>({})
  const [deliveryModalTank, setDeliveryModalTank] = useState<string | null>(null)
  const [waterAlertThresholdCm, setWaterAlertThresholdCm] = useState(2.0)

  // Snapshot of whether every tank already had both dips on file the moment
  // this modal opened — not recomputed from the live form state, so it can't
  // flicker as the user types. When true, the dialog opens on a read-only
  // Confirm/Edit choice instead of the full editable form: without this,
  // reopening this modal for an already-complete shift (e.g. the "check
  // first" pre-flight, or a retry after some unrelated field changed) forced
  // the manager to re-answer the delivery question and re-submit unchanged
  // data every single time, which is what made it feel like an endless loop.
  const [initiallyComplete, setInitiallyComplete] = useState(false)
  const [editRequested, setEditRequested] = useState(false)
  const showEditForm = editRequested || !initiallyComplete

  const isDelegate = userRole === 'supervisor'

  const inputStyle = {
    backgroundColor: theme.background,
    color: theme.textPrimary,
    borderColor: theme.border,
  }

  useEffect(() => {
    authFetch(`${BASE}/settings/stock-alerts`, { headers: getHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.water_alert_threshold_cm != null) setWaterAlertThresholdCm(data.water_alert_threshold_cm) })
      .catch(() => {})
  }, [])

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
      setDeliveryAnswers({})
      setDeliveryDetails({})
      setInitiallyComplete(result.allComplete)
      setEditRequested(false)
      setLoading(false)
    }).catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, shiftType])

  const updateDip = (tankId: string, patch: Partial<TankDipState>) => {
    setDips(prev => ({ ...prev, [tankId]: { ...prev[tankId], ...patch } }))
    // Either reading changing invalidates a prior delivery answer for this
    // tank — the scenario it was answered for may no longer apply.
    setDeliveryAnswers(prev => {
      if (!(tankId in prev)) return prev
      const next = { ...prev }
      delete next[tankId]
      return next
    })
  }

  const requiresDelivery = (tankId: string): boolean => {
    const d = dips[tankId]
    if (!d || d.closing_dip_cm === '' || d.opening_dip_cm == null) return false
    const open = parseFloat(d.opening_dip_cm)
    const close = parseFloat(d.closing_dip_cm)
    return Number.isFinite(open) && Number.isFinite(close) && close > open
  }

  const allDipsEntered = tanks.every(t => {
    const d = dips[t.tank_id]
    return (d?.closing_dip_cm || '') !== '' && !!d?.opening_dip_cm
  })
  const deliveriesResolved = tanks.every(t => {
    if (!requiresDelivery(t.tank_id)) return true
    return deliveryAnswers[t.tank_id] === 'yes' && !!deliveryDetails[t.tank_id]?.supplier?.trim()
  })
  const canContinue = allDipsEntered && deliveriesResolved && (!isDelegate || delegateReason.trim() !== '')

  const handleSave = async () => {
    if (!canContinue) return
    setSaving(true)
    setError('')
    try {
      await saveTankDips(date, shiftType, tanks, dips, isDelegate ? delegateReason.trim() : undefined, deliveryDetails)
      onSaved()
    } catch (err: any) {
      setError(err.message || 'Failed to save tank dips')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <LoadingSpinner text="Loading tanks..." />

  if (!showEditForm) {
    return (
      <div>
        <div className="rounded-lg p-3 mb-3 text-sm" style={{ backgroundColor: 'var(--color-status-success-light)', color: 'var(--color-status-success)', borderWidth: 1, borderColor: 'var(--color-status-success)' }}>
          Tank dips for this shift are already recorded.
        </div>
        <div className="space-y-1.5 mb-4">
          {tanks.map(tank => {
            const dip = dips[tank.tank_id]
            return (
              <div key={tank.tank_id} className="flex items-center justify-between text-sm p-2 rounded"
                style={{ backgroundColor: theme.background }}>
                <span style={{ color: theme.textPrimary }}>{tank.display_name || tank.fuel_type}</span>
                <span className="font-mono text-xs flex items-center gap-2" style={{ color: theme.textSecondary }}>
                  Opening {dip?.opening_dip_cm} cm &rarr; Closing {dip?.closing_dip_cm} cm
                  {dip?.water_dip_cm !== '' && dip?.water_dip_cm != null && (
                    <span style={dip.water_flagged ? { color: 'var(--color-status-error)', fontWeight: 600 } : undefined}>
                      | Water {dip.water_dip_cm}cm{dip.water_flagged ? ' (ALERT)' : ''}
                    </span>
                  )}
                </span>
              </div>
            )
          })}
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={() => setEditRequested(true)}
            className="px-4 py-2 text-sm rounded" style={{ color: theme.textSecondary, borderWidth: 1, borderColor: theme.border }}>
            Edit
          </button>
          <button onClick={onSaved}
            className="px-5 py-2.5 rounded-lg text-sm font-semibold text-white"
            style={{ backgroundColor: theme.primary }}>
            Confirm — {continueLabel || 'Continue'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      {error && (
        <div className="rounded-lg p-3 mb-4 text-sm" style={{ backgroundColor: 'var(--color-status-error-light)', color: 'var(--color-status-error)', borderWidth: 1, borderColor: 'var(--color-status-error)' }}>
          {error}
        </div>
      )}
      <div className="space-y-3">
        {tanks.map(tank => {
          const dip = dips[tank.tank_id] || { opening_dip_cm: null, opening_resolved: false, closing_dip_cm: '', already_recorded: false, water_dip_cm: '', water_flagged: false }
          const needsDelivery = requiresDelivery(tank.tank_id)
          const answer = deliveryAnswers[tank.tank_id]
          const delivery = deliveryDetails[tank.tank_id]
          return (
            <div key={tank.tank_id}>
              <div className="flex items-center gap-3">
                <div className="flex-1 text-sm font-medium" style={{ color: theme.textPrimary }}>
                  {tank.display_name || tank.fuel_type}
                </div>
                {dip.opening_resolved ? (
                  <div className="text-xs text-right" style={{ color: theme.textSecondary, minWidth: 90 }}>
                    Opening: {dip.opening_dip_cm} cm
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={0}
                      step="0.1"
                      value={dip.opening_dip_cm ?? ''}
                      onChange={e => updateDip(tank.tank_id, { opening_dip_cm: e.target.value || null })}
                      placeholder="opening cm"
                      className="w-28 px-2 py-1.5 rounded border text-sm text-right font-mono"
                      style={inputStyle}
                    />
                    <span className="text-xs" style={{ color: theme.textSecondary }}>cm</span>
                  </div>
                )}
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
                      onChange={e => updateDip(tank.tank_id, { closing_dip_cm: e.target.value, already_recorded: dips[tank.tank_id]?.already_recorded || false })}
                      placeholder="closing cm"
                      className="w-28 px-2 py-1.5 rounded border text-sm text-right font-mono"
                      style={inputStyle}
                    />
                    <span className="text-xs" style={{ color: theme.textSecondary }}>cm</span>
                  </div>
                  {(() => {
                    const waterVal = parseFloat(dip.water_dip_cm)
                    const overThreshold = dip.water_dip_cm !== '' && Number.isFinite(waterVal) && waterVal >= waterAlertThresholdCm
                    return (
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min={0}
                          step="0.1"
                          value={dip.water_dip_cm}
                          onChange={e => updateDip(tank.tank_id, { water_dip_cm: e.target.value })}
                          placeholder="water cm"
                          title="Water-finding paste reading at the tank bottom"
                          className="w-24 px-2 py-1.5 rounded border text-sm text-right font-mono"
                          style={overThreshold
                            ? { backgroundColor: 'var(--color-status-error-light)', color: 'var(--color-status-error)', borderColor: 'var(--color-status-error)' }
                            : inputStyle}
                        />
                        <span className="text-xs" style={{ color: overThreshold ? 'var(--color-status-error)' : theme.textSecondary }}>
                          cm water
                        </span>
                      </div>
                    )
                  })()}
                </div>
              </div>

              {dip.water_dip_cm !== '' && parseFloat(dip.water_dip_cm) >= waterAlertThresholdCm && (
                <div className="mt-1.5 p-2.5 rounded text-xs font-medium" style={{ backgroundColor: 'var(--color-status-error-light)', color: 'var(--color-status-error)' }}>
                  Water detected at {dip.water_dip_cm}cm — at or above the {waterAlertThresholdCm}cm alert threshold for {tank.display_name || tank.fuel_type}.
                  Pump out and re-check before continuing to dispense from this tank.
                </div>
              )}

              {needsDelivery && !answer && (
                <div className="mt-1.5 ml-0 p-2.5 rounded text-xs" style={{ backgroundColor: 'var(--color-status-warning-light)', color: 'var(--color-status-warning)' }}>
                  <div className="font-medium mb-1.5">
                    Closing dip is higher than opening for {tank.display_name || tank.fuel_type} — was there a delivery?
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setDeliveryModalTank(tank.tank_id)}
                      className="px-3 py-1 rounded text-xs font-semibold text-white"
                      style={{ backgroundColor: 'var(--color-status-warning)' }}>
                      Yes — record it
                    </button>
                    <button type="button" onClick={() => setDeliveryAnswers(prev => ({ ...prev, [tank.tank_id]: 'no' }))}
                      className="px-3 py-1 rounded text-xs font-medium"
                      style={{ borderWidth: 1, borderColor: 'var(--color-status-warning)' }}>
                      No
                    </button>
                  </div>
                </div>
              )}

              {needsDelivery && answer === 'yes' && delivery?.supplier && (
                <div className="mt-1.5 p-2 rounded text-xs flex items-center justify-between"
                  style={{ backgroundColor: 'var(--color-status-success-light)', color: 'var(--color-status-success)' }}>
                  <span>Delivery recorded: {delivery.supplier}{delivery.volume ? ` — ${delivery.volume} L` : ''}</span>
                  <button type="button" onClick={() => setDeliveryModalTank(tank.tank_id)} className="underline font-medium">Edit</button>
                </div>
              )}

              {needsDelivery && answer === 'no' && (
                <div className="mt-1.5 p-2.5 rounded text-xs" style={{ backgroundColor: 'var(--color-status-error-light)', color: 'var(--color-status-error)' }}>
                  <div className="font-medium mb-1">
                    No delivery — these readings can't be saved as entered. Suggested next steps:
                  </div>
                  <ul className="list-disc ml-4 space-y-0.5">
                    <li>Re-take the physical dip for both opening and closing on this tank.</li>
                    <li>Check whether the previous shift's closing dip (carried forward as this shift's opening) was recorded correctly.</li>
                    <li>If a delivery did happen but wasn't logged yet, switch this to "Yes" and record it.</li>
                    <li>If it still doesn't resolve, contact the manager/owner before closing this shift.</li>
                  </ul>
                  <button type="button" onClick={() => setDeliveryAnswers(prev => { const n = { ...prev }; delete n[tank.tank_id]; return n })}
                    className="underline font-medium mt-1.5">
                    Actually, there was a delivery
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {tanks.some(t => !dips[t.tank_id]?.opening_resolved) && (
        <div className="text-xs mt-3" style={{ color: theme.textSecondary }}>
          Opening dip could not be carried forward automatically for one or more tanks (no previous shift record found) — enter it directly.
        </div>
      )}

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

      <div className="mt-4 flex justify-end gap-2">
        {initiallyComplete && (
          <button onClick={() => setEditRequested(false)}
            className="px-4 py-2 text-sm rounded" style={{ color: theme.textSecondary, borderWidth: 1, borderColor: theme.border }}>
            Cancel
          </button>
        )}
        <button
          onClick={handleSave}
          disabled={!canContinue || saving}
          className="px-5 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ backgroundColor: canContinue ? theme.primary : '#9ca3af' }}>
          {saving ? 'Saving...' : (continueLabel || 'Continue')}
        </button>
      </div>

      {deliveryModalTank && (
        <DeliveryModal
          theme={theme}
          tankLabel={tanks.find(t => t.tank_id === deliveryModalTank)?.display_name
            || tanks.find(t => t.tank_id === deliveryModalTank)?.fuel_type || ''}
          initial={deliveryDetails[deliveryModalTank]}
          onClose={() => setDeliveryModalTank(null)}
          onSave={info => {
            setDeliveryDetails(prev => ({ ...prev, [deliveryModalTank]: info }))
            setDeliveryAnswers(prev => ({ ...prev, [deliveryModalTank]: 'yes' }))
            setDeliveryModalTank(null)
          }}
        />
      )}
    </div>
  )
}

function DeliveryModal({ theme, tankLabel, initial, onClose, onSave }: {
  theme: any
  tankLabel: string
  initial?: TankDeliveryInfo
  onClose: () => void
  onSave: (info: TankDeliveryInfo) => void
}) {
  const [supplier, setSupplier] = useState(initial?.supplier || '')
  const [invoice, setInvoice] = useState(initial?.invoice || '')
  const [time, setTime] = useState(initial?.time || new Date().toTimeString().slice(0, 5))
  const [volume, setVolume] = useState(initial?.volume || '')
  const inputStyle = { backgroundColor: theme.background, color: theme.textPrimary, borderColor: theme.border }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="rounded-lg shadow-xl w-full max-w-sm p-4 space-y-3"
        style={{ backgroundColor: theme.cardBg, borderColor: theme.border, borderWidth: 1 }}
        onClick={e => e.stopPropagation()}>
        <div className="font-semibold text-sm" style={{ color: theme.textPrimary }}>
          Record Delivery — {tankLabel}
        </div>
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: theme.textSecondary }}>Supplier *</label>
          <input type="text" value={supplier} onChange={e => setSupplier(e.target.value)}
            className="w-full px-3 py-2 rounded border text-sm" style={inputStyle} autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: theme.textSecondary }}>Invoice Number</label>
            <input type="text" value={invoice} onChange={e => setInvoice(e.target.value)}
              className="w-full px-3 py-2 rounded border text-sm" style={inputStyle} />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: theme.textSecondary }}>Time</label>
            <input type="time" value={time} onChange={e => setTime(e.target.value)}
              className="w-full px-3 py-2 rounded border text-sm" style={inputStyle} />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: theme.textSecondary }}>
            Volume Delivered (liters) — optional, calculated from the dip change if left blank
          </label>
          <input type="number" min={0} step="1" value={volume} onChange={e => setVolume(e.target.value)}
            className="w-full px-3 py-2 rounded border text-sm text-right font-mono" style={inputStyle} />
        </div>
        <div className="flex gap-2 justify-end pt-1">
          <button onClick={onClose}
            className="px-4 py-2 text-sm rounded" style={{ color: theme.textSecondary, borderWidth: 1, borderColor: theme.border }}>
            Cancel
          </button>
          <button onClick={() => onSave({ supplier: supplier.trim(), invoice: invoice.trim(), time, volume: volume.trim() })}
            disabled={!supplier.trim()}
            className="px-4 py-2 text-sm font-semibold rounded text-white disabled:opacity-50"
            style={{ backgroundColor: 'var(--color-action-primary)' }}>
            Save Delivery
          </button>
        </div>
      </div>
    </div>
  )
}
