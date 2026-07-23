import { useState, useEffect, useCallback } from 'react'
import { useWorkingDay } from '../contexts/WorkingDayContext'
import { getHeaders, authFetch } from '../lib/api'
import toast from 'react-hot-toast'

const BASE = '/api/v1'
const LPG_SIZES = [3, 6, 9, 19, 45, 48]

interface CylinderRow {
  size_kg: number
  opening_balance: number
  opening_empty: number
  receipts: number
  traded_in: number
  traded_out: number
  sold_refill: number
  sold_with_cylinder: number
  damaged: number
  damage_note: string
  balance: number
  closing_count: number
  closing_empty: number
  closing_empty_override: boolean
  value_refill: number
  value_with_cylinder: number
  total_value: number
}

interface Pricing {
  size_kg: number
  price_refill: number
  price_with_cylinder: number
}

interface CylinderTrade {
  from_size_kg: number
  to_size_kg: number
  quantity: number
  price_difference: number
  trade_type: string
}

const fmt = (v: number) =>
  `K${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function LPGDaily() {
  const [user, setUser] = useState<any>(null)
  const { date, setDate, shiftType, setShiftType } = useWorkingDay()
  const [salesperson, setSalesperson] = useState(() => {
    if (typeof window !== 'undefined') {
      const ud = localStorage.getItem('user')
      if (ud) return JSON.parse(ud).full_name || ''
    }
    return ''
  })
  const [pricing, setPricing] = useState<Pricing[]>([])
  const [cylinderRows, setCylinderRows] = useState<CylinderRow[]>(
    LPG_SIZES.map(s => ({
      size_kg: s, opening_balance: 0, opening_empty: 0, receipts: 0,
      traded_in: 0, traded_out: 0, sold_refill: 0, sold_with_cylinder: 0,
      damaged: 0, damage_note: '', balance: 0, closing_count: 0,
      closing_empty: 0, closing_empty_override: false,
      value_refill: 0, value_with_cylinder: 0, total_value: 0,
    }))
  )
  const [trades, setTrades] = useState<CylinderTrade[]>([])
  const [actualPopulation, setActualPopulation] = useState('')
  const [loading, setLoading] = useState(false)
  const [entries, setEntries] = useState<any[]>([])

  const canManageStock = ['supervisor', 'manager', 'owner'].includes(user?.role)
  const canManage = ['manager', 'owner'].includes(user?.role)
  const lpgPricesConfigured = pricing.some(p => p.price_refill > 0 || p.price_with_cylinder > 0)

  useEffect(() => {
    const ud = localStorage.getItem('user')
    if (ud) setUser(JSON.parse(ud))
  }, [])

  const fetchPricing = useCallback(() => {
    authFetch(`${BASE}/lpg-daily/pricing`, { headers: { ...getHeaders(), 'Content-Type': 'application/json' } })
      .then(r => r.json())
      .then(data => setPricing(data.sizes || []))
      .catch(() => {})
  }, [])

  useEffect(() => { fetchPricing() }, [fetchPricing])

  const fetchPreviousShift = useCallback(() => {
    authFetch(`${BASE}/lpg-daily/previous-shift?current_date=${date}&shift_type=${shiftType}`, {
      headers: { ...getHeaders(), 'Content-Type': 'application/json' },
    })
      .then(r => r.json())
      .then(data => {
        if (data.found && data.cylinder_balances) {
          const emptyBals = data.cylinder_empty_balances || {}
          setCylinderRows(prev => prev.map(row => ({
            ...row,
            opening_balance: data.cylinder_balances[row.size_kg] ?? row.opening_balance,
            opening_empty: emptyBals[row.size_kg] ?? row.opening_empty,
          })))
        }
      })
      .catch(() => {})
  }, [date, shiftType])

  useEffect(() => { fetchPreviousShift() }, [fetchPreviousShift])

  useEffect(() => {
    authFetch(`${BASE}/lpg-daily/entries?date=${date}`, { headers: { ...getHeaders(), 'Content-Type': 'application/json' } })
      .then(r => r.json())
      .then(data => setEntries(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [date])

  // Trade maps
  const tradedInMap: Record<number, number> = {}
  const tradedOutMap: Record<number, number> = {}
  for (const s of LPG_SIZES) { tradedInMap[s] = 0; tradedOutMap[s] = 0 }
  for (const t of trades) {
    tradedInMap[t.from_size_kg] = (tradedInMap[t.from_size_kg] || 0) + t.quantity
    tradedOutMap[t.to_size_kg] = (tradedOutMap[t.to_size_kg] || 0) + t.quantity
  }

  // Recalculate cylinder rows when inputs change.
  // Quantity fields (balance, closing_empty) never depend on pricing having loaded —
  // only the revenue fields (value_refill etc.) do, so they fall back to 0 without a
  // price rather than freezing the whole row's quantities at their initial values.
  useEffect(() => {
    setCylinderRows(prev => prev.map(row => {
      const p = pricing.find(pr => pr.size_kg === row.size_kg)
      const t_in = tradedInMap[row.size_kg] || 0
      const t_out = tradedOutMap[row.size_kg] || 0
      // traded_in cylinders are empties returned by the customer, not full stock
      const balance = row.opening_balance + row.receipts - row.sold_refill - row.sold_with_cylinder - t_out - (row.damaged || 0)
      // closing_empty: each refill brings back an empty shell; each trade-in also returns an empty shell
      const closing_empty = row.closing_empty_override
        ? row.closing_empty
        : row.opening_empty + row.sold_refill + t_in
      return {
        ...row,
        traded_in: t_in,
        traded_out: t_out,
        balance,
        closing_empty,
        value_refill: p ? p.price_refill * row.sold_refill : 0,
        value_with_cylinder: p ? p.price_with_cylinder * row.sold_with_cylinder : 0,
        total_value: p ? p.price_refill * row.sold_refill + p.price_with_cylinder * row.sold_with_cylinder : 0,
      }
    }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    pricing,
    trades,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    cylinderRows.map(r => `${r.opening_balance}-${r.opening_empty}-${r.receipts}-${r.sold_refill}-${r.sold_with_cylinder}-${r.damaged}-${r.closing_empty_override}`).join(','),
  ])

  const updateCylinder = (sizeKg: number, field: string, value: number) =>
    setCylinderRows(prev => prev.map(r => r.size_kg === sizeKg ? { ...r, [field]: value } : r))

  const updateCylinderStr = (sizeKg: number, field: string, value: string) =>
    setCylinderRows(prev => prev.map(r => r.size_kg === sizeKg ? { ...r, [field]: value } : r))

  const overrideClosingEmpty = (sizeKg: number, value: number) =>
    setCylinderRows(prev => prev.map(r => r.size_kg === sizeKg ? { ...r, closing_empty: value, closing_empty_override: true } : r))

  const resetClosingEmpty = (sizeKg: number) =>
    setCylinderRows(prev => prev.map(r => r.size_kg === sizeKg ? { ...r, closing_empty_override: false } : r))

  const addTrade = () =>
    setTrades(prev => [...prev, { from_size_kg: 3, to_size_kg: 6, quantity: 1, price_difference: 0, trade_type: 'upgrade' }])

  const removeTrade = (i: number) =>
    setTrades(prev => prev.filter((_, idx) => idx !== i))

  const updateTrade = (i: number, field: string, value: any) =>
    setTrades(prev => prev.map((t, idx) => {
      if (idx !== i) return t
      const updated = { ...t, [field]: value }
      const fromP = pricing.find(p => p.size_kg === updated.from_size_kg)
      const toP = pricing.find(p => p.size_kg === updated.to_size_kg)
      if (fromP && toP) {
        updated.price_difference = toP.price_refill - fromP.price_refill
        updated.trade_type = updated.to_size_kg > updated.from_size_kg ? 'upgrade' : 'downgrade'
      }
      return updated
    }))

  // Summary figures
  const grandTotal = cylinderRows.reduce((s, r) => s + r.total_value, 0)
  const totalFull = cylinderRows.reduce((s, r) => s + r.balance, 0)
  const totalEmpties = cylinderRows.reduce((s, r) => s + r.closing_empty, 0)
  const bookPopulation = totalFull + totalEmpties
  const popDiff = actualPopulation !== '' ? bookPopulation - parseInt(actualPopulation) : null
  const totalTradeRevenue = trades.reduce((s, t) => s + t.price_difference * t.quantity, 0)
  const oversellRows = cylinderRows.filter(r => r.balance < 0)

  const handleSubmit = async () => {
    if (!salesperson.trim()) { toast.error('Enter salesperson name'); return }
    setLoading(true)
    try {
      const validTrades = trades.filter(t => t.from_size_kg !== t.to_size_kg && t.quantity > 0)
      const cylRes = await authFetch(`${BASE}/lpg-daily/entry`, {
        method: 'POST',
        headers: { ...getHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date, shift_type: shiftType, salesperson,
          cylinder_rows: cylinderRows.map(r => ({
            size_kg: r.size_kg,
            opening_balance: r.opening_balance,
            opening_empty: r.opening_empty,
            receipts: r.receipts,
            sold_refill: r.sold_refill,
            sold_with_cylinder: r.sold_with_cylinder,
            damaged: r.damaged || 0,
            damage_note: r.damage_note || null,
            closing_empty: r.closing_empty,
          })),
          trades: validTrades.length > 0 ? validTrades.map(t => ({
            from_size_kg: t.from_size_kg, to_size_kg: t.to_size_kg, quantity: t.quantity,
          })) : null,
          book_cylinder_population: bookPopulation,
          actual_cylinder_population: actualPopulation !== '' ? parseInt(actualPopulation) : null,
          recorded_by: user?.user_id || 'unknown',
        }),
      })
      if (!cylRes.ok) { const e = await cylRes.json(); throw new Error(e.detail || 'Failed to submit LPG entry') }

      toast.success('LPG entry submitted')
      setTrades([])
      const fresh = await authFetch(`${BASE}/lpg-daily/entries?date=${date}`, { headers: { ...getHeaders(), 'Content-Type': 'application/json' } })
      if (fresh.ok) setEntries(await fresh.json())
    } catch (err: any) {
      toast.error(err.message || 'Submission failed')
    } finally {
      setLoading(false)
    }
  }

  const authoriseDamage = async (entryId: string) => {
    try {
      const res = await authFetch(`${BASE}/lpg-daily/${entryId}/authorise-damage`, {
        method: 'POST', headers: { ...getHeaders(), 'Content-Type': 'application/json' },
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.detail) }
      toast.success('Damage authorised')
      const fresh = await authFetch(`${BASE}/lpg-daily/entries?date=${date}`, { headers: { ...getHeaders(), 'Content-Type': 'application/json' } })
      if (fresh.ok) setEntries(await fresh.json())
    } catch (err: any) { toast.error(err.message) }
  }

  const cellInput = (value: number, onChange: (v: number) => void, extraClass = '') => (
    <input
      type="number" min={0} value={value}
      onChange={e => onChange(parseInt(e.target.value) || 0)}
      className={`w-16 px-1.5 py-1 rounded border border-surface-border bg-surface-bg text-content-primary text-xs text-right focus:outline-none focus:border-action-primary ${extraClass}`}
    />
  )

  return (
    <div>
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-content-primary">LPG Operations</h1>
        <p className="text-sm text-content-secondary mt-1">Shift-level cylinder sales and stock tracking</p>
      </div>

      {/* Date / Shift / Salesperson */}
      <div className="bg-surface-card rounded-lg border border-surface-border p-4 mb-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium text-content-secondary mb-1">Date</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="w-full px-3 py-2 rounded border border-surface-border bg-surface-bg text-content-primary text-sm focus:outline-none focus:border-action-primary" />
        </div>
        <div>
          <label className="block text-xs font-medium text-content-secondary mb-1">Shift</label>
          <select value={shiftType} onChange={e => setShiftType(e.target.value as 'Day' | 'Night')}
            className="w-full px-3 py-2 rounded border border-surface-border bg-surface-bg text-content-primary text-sm focus:outline-none focus:border-action-primary">
            <option value="Day">Day Shift</option>
            <option value="Night">Night Shift</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-content-secondary mb-1">Salesperson</label>
          <input type="text" value={salesperson} onChange={e => setSalesperson(e.target.value)}
            placeholder="Name"
            className="w-full px-3 py-2 rounded border border-surface-border bg-surface-bg text-content-primary text-sm focus:outline-none focus:border-action-primary" />
        </div>
      </div>

      {/* Summary strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <div className="bg-surface-card rounded-lg border border-surface-border p-4">
              <p className="text-xs text-content-secondary mb-1">Total Revenue</p>
              <p className="text-2xl font-bold text-action-primary">{fmt(grandTotal)}</p>
            </div>
            <div className="bg-surface-card rounded-lg border border-surface-border p-4">
              <p className="text-xs text-content-secondary mb-1">Full Cylinders</p>
              <p className={`text-2xl font-bold ${totalFull < 0 ? 'text-status-error' : 'text-content-primary'}`}>{totalFull}</p>
              <p className="text-xs text-content-secondary mt-0.5">Closing stock, all sizes</p>
            </div>
            <div className="bg-surface-card rounded-lg border border-surface-border p-4">
              <p className="text-xs text-content-secondary mb-1">Empty Cylinders</p>
              <p className="text-2xl font-bold text-content-primary">{totalEmpties}</p>
              <p className="text-xs text-content-secondary mt-0.5">On hand at shift end</p>
            </div>
            <div className="bg-surface-card rounded-lg border border-surface-border p-4">
              <p className="text-xs text-content-secondary mb-1">Population (Full + Empty)</p>
              <div className="flex items-baseline gap-2 mb-2">
                <p className="text-xl font-bold text-content-primary">{bookPopulation}</p>
                <p className="text-xs text-content-secondary">book</p>
              </div>
              {canManage ? (
                <div className="flex items-center gap-2">
                  <input type="number" min={0} value={actualPopulation}
                    onChange={e => setActualPopulation(e.target.value)}
                    placeholder="Actual"
                    className="w-24 px-2 py-1 rounded border border-surface-border bg-surface-bg text-content-primary text-sm focus:outline-none focus:border-action-primary" />
                  {popDiff !== null && (
                    <span className={`text-sm font-bold ${popDiff !== 0 ? 'text-status-error' : 'text-status-success'}`}>
                      {popDiff > 0 ? `+${popDiff}` : popDiff}
                    </span>
                  )}
                </div>
              ) : (
                <p className="text-xs text-content-secondary">Full + empty on hand</p>
              )}
            </div>
          </div>

          {!lpgPricesConfigured && (
            <div className="mb-4 p-3 rounded-lg text-sm text-status-error border border-status-error bg-status-error/10">
              LPG pricing not configured. Ask a manager to set prices in Stores / Stock.
            </div>
          )}

          {/* Cylinder table — one row per size instead of one tall card per size */}
          <div className="bg-surface-card rounded-lg border border-surface-border overflow-hidden mb-6">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-surface-bg border-b border-surface-border">
                    {[
                      { label: 'Size', align: 'text-left' },
                      { label: 'Opening', align: 'text-left' },
                      { label: 'Received', align: 'text-left' },
                      { label: 'Sold Refill', align: 'text-left' },
                      { label: 'Sold New', align: 'text-left' },
                      { label: 'Damaged', align: 'text-left' },
                      { label: 'Trade', align: 'text-left' },
                      { label: 'Closing (Full)', align: 'text-left' },
                      { label: 'Your Count', align: 'text-left' },
                      { label: 'Opening Empty', align: 'text-left' },
                      { label: 'Closing Empty', align: 'text-left' },
                      { label: 'Revenue', align: 'text-right' },
                    ].map(col => (
                      <th key={col.label} className={`px-3 py-2 ${col.align} text-xs font-medium uppercase text-content-secondary whitespace-nowrap`}>{col.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cylinderRows.map(row => {
                    const p = pricing.find(pr => pr.size_kg === row.size_kg)
                    const tIn = tradedInMap[row.size_kg] || 0
                    const tOut = tradedOutMap[row.size_kg] || 0
                    const hasActivity = row.opening_balance > 0 || row.receipts > 0
                      || row.sold_refill > 0 || row.sold_with_cylinder > 0
                      || tIn > 0 || tOut > 0
                      || row.opening_empty > 0 || row.closing_empty > 0
                    const diff = row.closing_count - row.balance

                    return (
                      <tr key={row.size_kg}
                        className={`border-t border-surface-border ${
                          row.balance < 0 ? 'bg-status-error/10'
                          : hasActivity ? 'bg-action-primary-light/30'
                          : 'hover:bg-surface-bg'
                        }`}>
                        <td className="px-3 py-2 align-top">
                          <p className="text-xs font-bold text-content-primary whitespace-nowrap">{row.size_kg} kg</p>
                          {p && (
                            <p className="text-[10px] text-content-secondary whitespace-nowrap">
                              R {fmt(p.price_refill)} / N {fmt(p.price_with_cylinder)}
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-2 align-top">
                          {canManage
                            ? cellInput(row.opening_balance, v => updateCylinder(row.size_kg, 'opening_balance', v))
                            : <span className="text-xs text-content-primary">{row.opening_balance}</span>}
                        </td>
                        <td className="px-3 py-2 align-top">
                          {canManage
                            ? cellInput(row.receipts, v => updateCylinder(row.size_kg, 'receipts', v))
                            : <span className="text-xs text-content-secondary">{row.receipts}</span>}
                        </td>
                        <td className="px-3 py-2 align-top">
                          {cellInput(row.sold_refill, v => updateCylinder(row.size_kg, 'sold_refill', v))}
                        </td>
                        <td className="px-3 py-2 align-top">
                          {cellInput(row.sold_with_cylinder, v => updateCylinder(row.size_kg, 'sold_with_cylinder', v))}
                        </td>
                        <td className="px-3 py-2 align-top">
                          {canManage ? (
                            <>
                              {cellInput(row.damaged || 0, v => updateCylinder(row.size_kg, 'damaged', v),
                                row.damaged > 0 ? 'border-status-warning' : '')}
                              {row.damaged > 0 && (
                                <input type="text" value={row.damage_note || ''}
                                  onChange={e => updateCylinderStr(row.size_kg, 'damage_note', e.target.value)}
                                  placeholder="Reason"
                                  className={`mt-1 w-28 px-1.5 py-1 rounded border bg-surface-bg text-content-primary text-[10px] focus:outline-none ${
                                    (row.damage_note || '').trim() ? 'border-surface-border' : 'border-status-error'
                                  }`} />
                              )}
                            </>
                          ) : <span className="text-xs text-content-secondary">{row.damaged || 0}</span>}
                        </td>
                        <td className="px-3 py-2 align-top whitespace-nowrap">
                          {tIn > 0 && <p className="text-xs text-status-success font-medium">+{tIn} in</p>}
                          {tOut > 0 && <p className="text-xs text-status-error font-medium">-{tOut} out</p>}
                          {tIn === 0 && tOut === 0 && <span className="text-xs text-content-secondary">-</span>}
                        </td>
                        <td className="px-3 py-2 align-top">
                          <span className={`text-sm font-bold ${row.balance < 0 ? 'text-status-error' : 'text-content-primary'}`}>
                            {row.balance}
                          </span>
                          {row.balance < 0 && <p className="text-[10px] text-status-error whitespace-nowrap">oversell</p>}
                        </td>
                        <td className="px-3 py-2 align-top">
                          {cellInput(row.closing_count, v => updateCylinder(row.size_kg, 'closing_count', v))}
                          {diff !== 0 && (
                            <p className="text-[10px] text-status-error mt-0.5 whitespace-nowrap">
                              {diff > 0 ? `+${diff}` : diff} vs expected
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-2 align-top">
                          {canManage
                            ? cellInput(row.opening_empty, v => updateCylinder(row.size_kg, 'opening_empty', v))
                            : <span className="text-xs text-content-secondary">{row.opening_empty}</span>}
                        </td>
                        <td className="px-3 py-2 align-top">
                          {canManage ? (
                            <>
                              {cellInput(row.closing_empty, v => overrideClosingEmpty(row.size_kg, v),
                                row.closing_empty_override ? 'border-status-warning' : '')}
                              {row.closing_empty_override && (
                                <button onClick={() => resetClosingEmpty(row.size_kg)}
                                  className="block text-[10px] text-action-primary underline mt-0.5">reset</button>
                              )}
                            </>
                          ) : <span className="text-xs text-content-secondary">{row.closing_empty}</span>}
                        </td>
                        <td className="px-3 py-2 align-top text-right">
                          <span className={`text-xs font-semibold ${row.total_value > 0 ? 'text-action-primary' : 'text-content-secondary'}`}>
                            {row.total_value > 0 ? fmt(row.total_value) : '-'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Trades section (supervisor+) */}
          {canManageStock && (
            <div className="bg-surface-card rounded-lg border border-surface-border mb-6">
              <div className="px-4 py-3 border-b border-surface-border flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-content-primary">Cylinder Trades</h3>
                  <p className="text-xs text-content-secondary mt-0.5">Customer exchanges one size for another — affects both size counts</p>
                </div>
                {totalTradeRevenue !== 0 && (
                  <span className={`text-sm font-semibold ${totalTradeRevenue >= 0 ? 'text-status-success' : 'text-status-error'}`}>
                    {totalTradeRevenue > 0 ? '+' : ''}{fmt(totalTradeRevenue)}
                  </span>
                )}
              </div>
              <div className="p-4 space-y-3">
                {trades.length === 0 && (
                  <p className="text-sm text-content-secondary">No trades recorded.</p>
                )}
                {trades.map((trade, idx) => {
                  const fromP = pricing.find(p => p.size_kg === trade.from_size_kg)
                  const toP = pricing.find(p => p.size_kg === trade.to_size_kg)
                  const priceDiff = ((toP?.price_refill || 0) - (fromP?.price_refill || 0)) * trade.quantity
                  const tradeType = trade.to_size_kg > trade.from_size_kg ? 'upgrade'
                    : trade.to_size_kg < trade.from_size_kg ? 'downgrade' : 'swap'
                  return (
                    <div key={idx} className="flex flex-wrap items-end gap-3 p-3 rounded-lg bg-surface-bg border border-surface-border">
                      <div>
                        <label className="block text-xs text-content-secondary mb-1">Customer returns</label>
                        <select value={trade.from_size_kg}
                          onChange={e => updateTrade(idx, 'from_size_kg', parseInt(e.target.value))}
                          className="px-2 py-1.5 rounded border border-surface-border bg-surface-bg text-content-primary text-sm focus:outline-none focus:border-action-primary">
                          {LPG_SIZES.map(s => <option key={s} value={s}>{s} kg</option>)}
                        </select>
                      </div>
                      <p className="pb-2 text-content-secondary text-sm">→</p>
                      <div>
                        <label className="block text-xs text-content-secondary mb-1">Receives</label>
                        <select value={trade.to_size_kg}
                          onChange={e => updateTrade(idx, 'to_size_kg', parseInt(e.target.value))}
                          className="px-2 py-1.5 rounded border border-surface-border bg-surface-bg text-content-primary text-sm focus:outline-none focus:border-action-primary">
                          {LPG_SIZES.map(s => <option key={s} value={s}>{s} kg</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-content-secondary mb-1">Qty</label>
                        <input type="number" min={1} value={trade.quantity}
                          onChange={e => updateTrade(idx, 'quantity', parseInt(e.target.value) || 1)}
                          className="w-16 px-2 py-1.5 rounded border border-surface-border bg-surface-bg text-content-primary text-sm text-right focus:outline-none focus:border-action-primary" />
                      </div>
                      <div className="pb-2 flex items-center gap-2">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          tradeType === 'upgrade' ? 'bg-status-success/15 text-status-success' :
                          tradeType === 'downgrade' ? 'bg-status-warning/15 text-status-warning' :
                          'bg-surface-bg text-content-secondary border border-surface-border'
                        }`}>{tradeType}</span>
                        {priceDiff !== 0 && (
                          <span className={`text-sm font-semibold ${priceDiff > 0 ? 'text-status-success' : 'text-status-error'}`}>
                            {priceDiff > 0 ? '+' : ''}{fmt(priceDiff)}
                          </span>
                        )}
                      </div>
                      <button onClick={() => removeTrade(idx)}
                        className="pb-2 px-2 py-1 text-xs rounded border border-status-error text-status-error hover:bg-status-error hover:text-white transition-colors">
                        Remove
                      </button>
                    </div>
                  )
                })}
                <button onClick={addTrade}
                  className="px-3 py-1.5 text-sm rounded border border-action-primary text-action-primary hover:bg-action-primary hover:text-white transition-colors font-medium">
                  + Add Trade
                </button>
              </div>
            </div>
          )}

      {/* Submit */}
      <div className="mt-2">
        {oversellRows.length > 0 && (
          <div className="mb-3 p-3 rounded-lg text-sm text-status-warning border border-status-warning bg-status-warning/10">
            {oversellRows.map(r => `${r.size_kg}kg: negative closing stock (${r.balance})`).join(' | ')}. Verify before submitting.
          </div>
        )}
        <button onClick={handleSubmit} disabled={loading || !lpgPricesConfigured}
          className="w-full py-3 rounded-lg font-semibold text-white text-sm bg-action-primary hover:bg-action-primary-hover disabled:opacity-50 transition-colors">
          {loading ? 'Submitting...' : 'Submit LPG Entry'}
        </button>
      </div>

      {/* Recent entries */}
      {entries.length > 0 && (
        <div className="mt-8 bg-surface-card rounded-lg border border-surface-border overflow-hidden">
          <div className="px-4 py-3 border-b border-surface-border">
            <h3 className="text-sm font-semibold text-content-primary">Entries for {date}</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-surface-bg">
                  {['ID', 'Shift', 'Salesperson', 'Revenue', 'Trade Rev.', 'Pop. Diff', 'Time', 'Damage'].map(h => (
                    <th key={h} className="px-4 py-2 text-left text-xs font-medium uppercase text-content-secondary">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entries.map((e: any) => {
                  const dStatus = e.damage_status || 'none'
                  return (
                    <tr key={e.entry_id} className="border-t border-surface-border hover:bg-surface-bg">
                      <td className="px-4 py-2 font-mono text-xs text-content-primary">{e.entry_id}</td>
                      <td className="px-4 py-2 text-content-primary">{e.shift_type}</td>
                      <td className="px-4 py-2 text-content-primary">{e.salesperson}</td>
                      <td className="px-4 py-2 font-semibold text-action-primary">{fmt(e.grand_total_value || 0)}</td>
                      <td className="px-4 py-2 text-content-secondary">
                        {e.total_trade_revenue ? fmt(e.total_trade_revenue) : '-'}
                      </td>
                      <td className="px-4 py-2">
                        {e.population_difference != null && e.population_difference !== 0
                          ? <span className="text-status-error font-medium">{e.population_difference}</span>
                          : <span className="text-content-secondary">-</span>}
                      </td>
                      <td className="px-4 py-2 text-xs text-content-secondary">
                        {e.created_at ? new Date(e.created_at).toLocaleTimeString() : '-'}
                      </td>
                      <td className="px-4 py-2">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium capitalize ${
                          dStatus === 'pending' ? 'bg-status-warning/15 text-status-warning' :
                          dStatus === 'approved' ? 'bg-status-success/15 text-status-success' :
                          'bg-surface-bg text-content-secondary'
                        }`}>{dStatus}</span>
                        {dStatus === 'pending' && canManage && (
                          <button onClick={() => authoriseDamage(e.entry_id)}
                            className="ml-2 px-2 py-0.5 text-xs rounded bg-status-success text-white font-medium">
                            Authorise
                          </button>
                        )}
                        {dStatus === 'approved' && e.damage_authorised_by && (
                          <span className="ml-1 text-xs text-content-secondary">by {e.damage_authorised_by}</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
