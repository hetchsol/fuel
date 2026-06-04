import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useTheme } from '../contexts/ThemeContext'
import LoadingSpinner from '../components/LoadingSpinner'
import { getHeaders, authFetch } from '../lib/api'

const BASE = '/api/v1'

function getAuthHeaders() {
  return { 'Content-Type': 'application/json', ...getHeaders() }
}

const fmtZMW = (v: number) => `K${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

interface CreditItem {
  account_id: string
  account_name: string
  fuel_type: string
  volume: string
  price_per_liter: number
  amount: number
}

export default function ShiftClosing() {
  const { theme } = useTheme()
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Shift selection
  const [availableShifts, setAvailableShifts] = useState<any[]>([])
  const [selectedShiftId, setSelectedShiftId] = useState<string>('')

  // Phase 1 data
  const [handover, setHandover] = useState<any>(null)
  const [shiftInfo, setShiftInfo] = useState<any>(null)

  // Phase 2 inputs
  const [actualCash, setActualCash] = useState('')
  const [posReceipts, setPosReceipts] = useState('')
  const [notes, setNotes] = useState('')

  // Credit sales
  const [creditAccounts, setCreditAccounts] = useState<any[]>([])
  const [creditItems, setCreditItems] = useState<CreditItem[]>([])
  const [fuelPrices, setFuelPrices] = useState<Record<string, number>>({ Diesel: 0, Petrol: 0 })

  // Safe deposit info (display only)
  const [safeDepositTotal, setSafeDepositTotal] = useState(0)

  // Result
  const [result, setResult] = useState<any>(null)

  const inputStyle = {
    backgroundColor: theme.background,
    color: theme.textPrimary,
    borderColor: theme.border,
  }

  // Fetch available shifts
  useEffect(() => {
    authFetch(`${BASE}/handover/my-shifts`, { headers: getAuthHeaders() })
      .then(r => r.ok ? r.json() : { shifts: [] })
      .then(data => {
        const shifts = data.shifts || []
        setAvailableShifts(shifts)
        if (shifts.length === 1) {
          // Single shift: auto-select; loadData() runs via the selectedShiftId
          // effect and clears the spinner itself.
          setSelectedShiftId(shifts[0].shift_id)
        } else {
          // 0 shifts (nothing to close) or 2+ (awaiting a dropdown pick): there's
          // no shift to auto-load, so stop the spinner rather than hang forever.
          if (shifts.length === 0) setError('No active shift found.')
          setLoading(false)
        }
      })
      .catch(() => { setLoading(false) })
  }, [])

  useEffect(() => {
    if (selectedShiftId) loadData(selectedShiftId)
  }, [selectedShiftId])

  const loadData = async (shiftId: string) => {
    setLoading(true)
    setError('')
    setSuccess('')
    setHandover(null)
    setResult(null)
    try {
      const shiftRes = await authFetch(`${BASE}/handover/my-shift?shift_id=${encodeURIComponent(shiftId)}`, { headers: getAuthHeaders() })
      const shiftData = await shiftRes.json()

      if (!shiftData.found) {
        setError('No active shift found.')
        setLoading(false)
        return
      }

      setShiftInfo(shiftData.shift)

      if (!shiftData.readings_verified_handover) {
        setError('No verified readings found. Complete your readings at the forecourt first.')
        setLoading(false)
        return
      }

      setHandover(shiftData.readings_verified_handover)

      // Load credit accounts
      const creditRes = await authFetch(`${BASE}/handover/credit-accounts`, { headers: getAuthHeaders() })
      if (creditRes.ok) {
        const creditData = await creditRes.json()
        setCreditAccounts(creditData.accounts || [])
        setFuelPrices(creditData.fuel_prices || { Diesel: 0, Petrol: 0 })
      }

      // Load safe deposits total
      if (shiftData.shift?.shift_id) {
        try {
          const depRes = await authFetch(`${BASE}/safe-deposits/${shiftData.shift.shift_id}`, { headers: getAuthHeaders() })
          if (depRes.ok) {
            const depData = await depRes.json()
            setSafeDepositTotal(depData.total_amount || 0)
          }
        } catch {}
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  // Computed values
  const actualCashVal = parseFloat(actualCash) || 0
  const posReceiptsVal = parseFloat(posReceipts) || 0
  const creditItemsTotal = creditItems.reduce((sum, i) => sum + (i.amount || 0), 0)
  const creditVal = creditItemsTotal || 0
  const totalExpected = handover?.total_expected || 0
  const totalAccounted = actualCashVal + posReceiptsVal + creditVal
  const difference = totalAccounted - totalExpected

  const canSubmit = actualCash !== '' && !submitting

  const handleSubmit = async () => {
    if (!handover) return
    setSubmitting(true)
    setError('')

    try {
      const res = await authFetch(`${BASE}/handover/submit-closing`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          handover_id: handover.handover_id,
          actual_cash: actualCashVal,
          pos_receipts: posReceiptsVal,
          credit_sales: creditVal,
          credit_sale_items: creditItems.map(i => ({
            account_id: i.account_id,
            account_name: i.account_name,
            fuel_type: i.fuel_type,
            volume: parseFloat(i.volume) || 0,
          })),
          notes: notes || null,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || 'Failed to submit shift closing')
      }

      const data = await res.json()
      setResult(data)
      setSuccess('Shift closing submitted successfully!')
    } catch (err: any) {
      setError(err.message || 'Submission failed')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <LoadingSpinner text="Loading shift data..." />

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: theme.textPrimary }}>Close Shift</h1>
            <p className="text-sm mt-1" style={{ color: theme.textSecondary }}>
              {result ? 'Shift closing submitted' : 'Financial reconciliation — verify cash, POS, and credit sales'}
            </p>
          </div>
          {availableShifts.length > 1 && (
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: theme.textSecondary }}>Active Shift</label>
              <select
                value={selectedShiftId}
                onChange={e => setSelectedShiftId(e.target.value)}
                className="px-3 py-2 rounded-lg border text-sm font-medium"
                style={{ backgroundColor: theme.cardBg, color: theme.textPrimary, borderColor: theme.border }}>
                <option value="">-- Select Shift --</option>
                {availableShifts.map((s: any) => (
                  <option key={s.shift_id} value={s.shift_id}>
                    {s.date} — {s.shift_type} Shift
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg p-3 mb-4 text-sm" style={{ backgroundColor: 'var(--color-status-error-light)', color: 'var(--color-status-error)', borderWidth: 1, borderColor: 'var(--color-status-error)' }}>
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg p-3 mb-4 text-sm" style={{ backgroundColor: 'var(--color-status-success-light)', color: 'var(--color-status-success)', borderWidth: 1, borderColor: 'var(--color-status-success)' }}>
          {success}
        </div>
      )}

      {/* No handover — redirect message */}
      {!handover && !loading && (
        <div className="rounded-lg shadow p-6 text-center" style={{ backgroundColor: theme.cardBg, borderColor: theme.border, borderWidth: 1 }}>
          <p className="text-sm" style={{ color: theme.textSecondary }}>Complete your readings at the forecourt first.</p>
        </div>
      )}

      {/* Result display */}
      {result && (
        <div className="rounded-lg shadow p-6 mb-6" style={{ backgroundColor: theme.cardBg, borderColor: 'var(--color-status-success)', borderWidth: 2 }}>
          <h2 className="text-lg font-bold mb-4" style={{ color: theme.textPrimary }}>Shift Closing Summary</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 text-sm">
            <div>
              <span className="text-xs" style={{ color: theme.textSecondary }}>Handover ID</span>
              <div className="font-mono font-medium" style={{ color: theme.textPrimary }}>{result.handover_id}</div>
            </div>
            <div>
              <span className="text-xs" style={{ color: theme.textSecondary }}>Total Expected</span>
              <div className="font-mono font-medium" style={{ color: theme.textPrimary }}>{fmtZMW(result.total_expected)}</div>
            </div>
            <div>
              <span className="text-xs" style={{ color: theme.textSecondary }}>Total Accounted</span>
              <div className="font-mono font-medium" style={{ color: theme.textPrimary }}>{fmtZMW(result.total_accounted || 0)}</div>
            </div>
            <div>
              <span className="text-xs" style={{ color: theme.textSecondary }}>Difference</span>
              <div className="font-mono font-bold" style={{ color: result.difference >= 0 ? 'var(--color-status-success)' : 'var(--color-status-error)' }}>
                {result.difference >= 0 ? '+' : ''}{fmtZMW(result.difference)}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
            <div>
              <span className="text-xs" style={{ color: theme.textSecondary }}>Cash</span>
              <div className="font-mono" style={{ color: theme.textPrimary }}>{fmtZMW(result.actual_cash)}</div>
            </div>
            <div>
              <span className="text-xs" style={{ color: theme.textSecondary }}>POS Receipts</span>
              <div className="font-mono" style={{ color: theme.textPrimary }}>{fmtZMW(result.pos_receipts || 0)}</div>
            </div>
            <div>
              <span className="text-xs" style={{ color: theme.textSecondary }}>Credit Sales</span>
              <div className="font-mono" style={{ color: theme.textPrimary }}>{fmtZMW(result.credit_sales)}</div>
            </div>
          </div>
          {result.auto_flag_reasons && result.auto_flag_reasons.length > 0 && (
            <div className="mt-4 rounded-lg p-3 text-sm" style={{ backgroundColor: 'var(--color-status-warning-light)', color: 'var(--color-status-warning)', borderWidth: 1, borderColor: 'var(--color-status-warning)' }}>
              <span className="font-semibold">Flags:</span> {result.auto_flag_reasons.join(', ')}
            </div>
          )}
          {/* Next step in the day's chain (item 6) */}
          <div className="mt-5 pt-4 flex items-center justify-between" style={{ borderTopColor: theme.border, borderTopWidth: 1 }}>
            <span className="text-sm" style={{ color: theme.textSecondary }}>Shift closed. A manager now reviews the handover.</span>
            <Link href="/handover-review"
              className="px-4 py-2 text-sm font-medium rounded-lg text-white"
              style={{ backgroundColor: 'var(--color-action-primary)' }}>
              Next: Handover Review →
            </Link>
          </div>
        </div>
      )}

      {/* Main form — only when handover exists and no result yet */}
      {handover && !result && (
        <>
          {/* Phase 1 Summary (read-only) */}
          <div className="rounded-lg shadow p-4 mb-6" style={{ backgroundColor: theme.cardBg, borderColor: theme.border, borderWidth: 1 }}>
            <h2 className="text-sm font-semibold mb-3 uppercase tracking-wide" style={{ color: theme.textSecondary }}>
              Verified Readings Summary
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div>
                <span className="text-xs" style={{ color: theme.textSecondary }}>Shift</span>
                <div className="font-medium" style={{ color: theme.textPrimary }}>
                  {shiftInfo?.date} — {shiftInfo?.shift_type}
                </div>
              </div>
              <div>
                <span className="text-xs" style={{ color: theme.textSecondary }}>Fuel Revenue</span>
                <div className="font-mono font-medium" style={{ color: theme.textPrimary }}>{fmtZMW(handover.fuel_revenue || 0)}</div>
              </div>
              <div>
                <span className="text-xs" style={{ color: theme.textSecondary }}>LPG Sales</span>
                <div className="font-mono" style={{ color: theme.textPrimary }}>{fmtZMW(handover.lpg_sales || 0)}</div>
              </div>
              <div>
                <span className="text-xs" style={{ color: theme.textSecondary }}>Lub + Acc Sales</span>
                <div className="font-mono" style={{ color: theme.textPrimary }}>{fmtZMW((handover.lubricant_sales || 0) + (handover.accessory_sales || 0))}</div>
              </div>
            </div>
            <div className="mt-3 pt-3 flex justify-between items-center text-sm" style={{ borderTopColor: theme.border, borderTopWidth: 1 }}>
              <span className="font-bold" style={{ color: theme.textPrimary }}>Total Expected</span>
              <span className="font-mono font-bold text-lg" style={{ color: theme.primary }}>{fmtZMW(totalExpected)}</span>
            </div>

            {/* Phase 1 flags */}
            {handover.auto_flag_reasons && handover.auto_flag_reasons.length > 0 && (
              <div className="mt-3 rounded-lg p-2 text-xs" style={{ backgroundColor: 'var(--color-status-warning-light)', color: 'var(--color-status-warning)', borderWidth: 1, borderColor: 'var(--color-status-warning)' }}>
                Readings flags: {handover.auto_flag_reasons.join(', ')}
              </div>
            )}
          </div>

          {/* Safe Deposit Info (display only) */}
          {safeDepositTotal > 0 && (
            <div className="rounded-lg shadow p-3 mb-6 flex justify-between items-center text-sm" style={{ backgroundColor: theme.cardBg, borderColor: theme.border, borderWidth: 1 }}>
              <span style={{ color: theme.textSecondary }}>Safe deposits recorded during shift:</span>
              <span className="font-mono font-semibold" style={{ color: theme.textPrimary }}>{fmtZMW(safeDepositTotal)}</span>
            </div>
          )}

          {/* Financial Input Form */}
          <div className="rounded-lg shadow p-4 mb-6" style={{ backgroundColor: theme.cardBg, borderColor: theme.border, borderWidth: 1 }}>
            <h2 className="text-sm font-semibold mb-4 uppercase tracking-wide" style={{ color: theme.textSecondary }}>
              Cash Reconciliation
            </h2>

            <div className="space-y-4">
              {/* Cash */}
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: theme.textSecondary }}>
                  Cash (Safe + Hand) — ZMW
                </label>
                <input type="number" min={0} step="0.01" value={actualCash}
                  onChange={e => setActualCash(e.target.value)} placeholder="0.00"
                  className="w-full px-3 py-2 rounded border text-sm text-right text-lg font-mono"
                  style={inputStyle} />
              </div>

              {/* POS Receipts */}
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: theme.textSecondary }}>
                  POS Receipts Total — ZMW
                </label>
                <input type="number" min={0} step="0.01" value={posReceipts}
                  onChange={e => setPosReceipts(e.target.value)} placeholder="0.00"
                  className="w-full px-3 py-2 rounded border text-sm text-right font-mono"
                  style={inputStyle} />
              </div>

              {/* Credit Sales */}
              {creditAccounts.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-medium uppercase" style={{ color: theme.textSecondary }}>Credit Sales</label>
                    <button type="button" onClick={() => setCreditItems(prev => [...prev, {
                      account_id: creditAccounts[0]?.account_id || '',
                      account_name: creditAccounts[0]?.account_name || '',
                      fuel_type: 'Diesel',
                      volume: '',
                      price_per_liter: creditAccounts[0]?.default_price_per_liter || fuelPrices.Diesel,
                      amount: 0,
                    }])}
                      className="px-2 py-1 text-xs font-medium rounded text-white"
                      style={{ backgroundColor: theme.primary }}>
                      + Add
                    </button>
                  </div>
                  {creditItems.length === 0 && (
                    <div className="text-xs py-2 text-center" style={{ color: theme.textSecondary }}>No credit sales — tap Add to record one</div>
                  )}
                  {creditItems.map((item, idx) => {
                    const acct = creditAccounts.find((a: any) => a.account_id === item.account_id)
                    const resolvedPrice = acct?.default_price_per_liter || fuelPrices[item.fuel_type as 'Diesel'|'Petrol'] || 0
                    const vol = parseFloat(item.volume) || 0
                    const amt = Math.round(vol * resolvedPrice * 100) / 100
                    if (item.price_per_liter !== resolvedPrice || item.amount !== amt) {
                      const updated = [...creditItems]
                      updated[idx] = { ...item, price_per_liter: resolvedPrice, amount: amt }
                      setCreditItems(updated)
                    }
                    return (
                      <div key={idx} className="grid grid-cols-12 gap-1 items-end mb-1">
                        <div className="col-span-4">
                          {idx === 0 && <div className="text-[10px] mb-0.5" style={{ color: theme.textSecondary }}>Account</div>}
                          <select value={item.account_id} onChange={e => {
                            const a = creditAccounts.find((x: any) => x.account_id === e.target.value)
                            const updated = [...creditItems]
                            updated[idx] = { ...item, account_id: e.target.value, account_name: a?.account_name || '' }
                            setCreditItems(updated)
                          }} className="w-full px-1 py-1.5 rounded border text-xs" style={inputStyle}>
                            {creditAccounts.map((a: any) => <option key={a.account_id} value={a.account_id}>{a.account_name}</option>)}
                          </select>
                        </div>
                        <div className="col-span-2">
                          {idx === 0 && <div className="text-[10px] mb-0.5" style={{ color: theme.textSecondary }}>Fuel</div>}
                          <select value={item.fuel_type} onChange={e => {
                            const updated = [...creditItems]
                            updated[idx] = { ...item, fuel_type: e.target.value }
                            setCreditItems(updated)
                          }} className="w-full px-1 py-1.5 rounded border text-xs" style={inputStyle}>
                            <option value="Diesel">Diesel</option>
                            <option value="Petrol">Petrol</option>
                          </select>
                        </div>
                        <div className="col-span-2">
                          {idx === 0 && <div className="text-[10px] mb-0.5" style={{ color: theme.textSecondary }}>Vol (L)</div>}
                          <input type="number" min={0} step="0.01" value={item.volume}
                            onChange={e => {
                              const updated = [...creditItems]
                              updated[idx] = { ...item, volume: e.target.value }
                              setCreditItems(updated)
                            }}
                            placeholder="0" className="w-full px-1 py-1.5 rounded border text-xs text-right font-mono" style={inputStyle} />
                        </div>
                        <div className="col-span-1">
                          {idx === 0 && <div className="text-[10px] mb-0.5" style={{ color: theme.textSecondary }}>K/L</div>}
                          <div className="px-1 py-1.5 text-xs font-mono text-right" style={{ color: theme.textSecondary }}>{resolvedPrice.toFixed(2)}</div>
                        </div>
                        <div className="col-span-2">
                          {idx === 0 && <div className="text-[10px] mb-0.5" style={{ color: theme.textSecondary }}>Amount</div>}
                          <div className="px-1 py-1.5 text-xs font-mono text-right font-medium" style={{ color: theme.textPrimary }}>{fmtZMW(amt)}</div>
                        </div>
                        <div className="col-span-1 flex justify-center">
                          {idx === 0 && <div className="text-[10px] mb-0.5 invisible">X</div>}
                          <button type="button" onClick={() => setCreditItems(prev => prev.filter((_, i) => i !== idx))}
                            className="text-xs px-1 py-1" style={{ color: 'var(--color-status-error)' }}>X</button>
                        </div>
                      </div>
                    )
                  })}
                  {creditItems.length > 0 && (
                    <div className="flex justify-between text-xs font-semibold pt-1 mt-1" style={{ borderTopColor: theme.border, borderTopWidth: 1 }}>
                      <span style={{ color: theme.textSecondary }}>Credit Total</span>
                      <span className="font-mono" style={{ color: theme.textPrimary }}>{fmtZMW(creditItemsTotal)}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: theme.textSecondary }}>
                  Notes (optional)
                </label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)}
                  placeholder="Any remarks..."
                  rows={2}
                  className="w-full px-3 py-2 rounded border text-sm"
                  style={inputStyle} />
              </div>
            </div>
          </div>

          {/* Reconciliation Summary */}
          {actualCash !== '' && (
            <div className="rounded-lg shadow p-4 mb-6" style={{ backgroundColor: theme.cardBg, borderColor: theme.border, borderWidth: 1 }}>
              <h2 className="text-sm font-semibold mb-3 uppercase tracking-wide" style={{ color: theme.textSecondary }}>
                Reconciliation
              </h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span style={{ color: theme.textSecondary }}>Cash (Safe + Hand)</span>
                  <span className="font-mono" style={{ color: theme.textPrimary }}>{fmtZMW(actualCashVal)}</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: theme.textSecondary }}>+ POS Receipts</span>
                  <span className="font-mono" style={{ color: theme.textPrimary }}>{fmtZMW(posReceiptsVal)}</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: theme.textSecondary }}>+ Credit Sales</span>
                  <span className="font-mono" style={{ color: theme.textPrimary }}>{fmtZMW(creditVal)}</span>
                </div>
                <div className="flex justify-between pt-2" style={{ borderTopColor: theme.border, borderTopWidth: 1 }}>
                  <span className="font-semibold" style={{ color: theme.textPrimary }}>Total Accounted</span>
                  <span className="font-mono font-semibold" style={{ color: theme.textPrimary }}>{fmtZMW(totalAccounted)}</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: theme.textSecondary }}>Total Expected</span>
                  <span className="font-mono" style={{ color: theme.primary }}>{fmtZMW(totalExpected)}</span>
                </div>
              </div>

              <div className="mt-4 rounded-lg p-4 text-center"
                style={{
                  backgroundColor: difference >= 0 ? 'var(--color-status-success-light)' : 'var(--color-status-error-light)',
                  borderWidth: 2,
                  borderColor: difference >= 0 ? 'var(--color-status-success)' : 'var(--color-status-error)',
                }}>
                <div className="text-xs uppercase tracking-wide mb-1"
                  style={{ color: difference >= 0 ? 'var(--color-status-success)' : 'var(--color-status-error)' }}>
                  {difference >= 0 ? 'Surplus' : 'Shortage'}
                </div>
                <div className="text-2xl font-bold font-mono"
                  style={{ color: difference >= 0 ? 'var(--color-status-success)' : 'var(--color-status-error)' }}>
                  {difference >= 0 ? '+' : ''}{fmtZMW(difference)} ZMW
                </div>
              </div>
            </div>
          )}

          {/* Submit */}
          <div className="flex justify-end mb-6">
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="px-6 py-3 rounded-lg text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: canSubmit ? theme.primary : '#9ca3af' }}>
              {submitting ? 'Submitting...' : 'Submit Shift Closing'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
