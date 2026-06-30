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
  closing_empty: number
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

interface AccessoryRow {
  product_code: string
  description: string
  selling_price: number
  opening_stock: number
  additions: number
  sold: number
  damaged: number
  damage_note: string
  balance: number
  sales_value: number
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
  const [activeTab, setActiveTab] = useState<'cylinders' | 'accessories'>('cylinders')

  const [pricing, setPricing] = useState<Pricing[]>([])
  const [cylinderRows, setCylinderRows] = useState<CylinderRow[]>(
    LPG_SIZES.map(s => ({
      size_kg: s, opening_balance: 0, opening_empty: 0, receipts: 0,
      traded_in: 0, traded_out: 0, sold_refill: 0, sold_with_cylinder: 0,
      damaged: 0, damage_note: '', balance: 0, closing_empty: 0,
      value_refill: 0, value_with_cylinder: 0, total_value: 0,
    }))
  )
  const [trades, setTrades] = useState<CylinderTrade[]>([])
  const [actualPopulation, setActualPopulation] = useState('')
  const [accessoryRows, setAccessoryRows] = useState<AccessoryRow[]>([])
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

  const fetchAccessories = useCallback(() => {
    Promise.all([
      authFetch(`${BASE}/lpg-daily/accessories/pricing`, { headers: { ...getHeaders(), 'Content-Type': 'application/json' } }).then(r => r.ok ? r.json() : []),
      authFetch(`${BASE}/lpg-daily/accessories/previous-day?current_date=${date}`, { headers: { ...getHeaders(), 'Content-Type': 'application/json' } }).then(r => r.ok ? r.json() : {} as any),
    ]).then(([catalog, prevData]: [any[], any]) => {
      const products = catalog.length > 0 ? catalog : (prevData.default_products || [])
      const balances = prevData.product_balances || {}
      setAccessoryRows(products.map((p: any) => ({
        product_code: p.product_code,
        description: p.description,
        selling_price: p.selling_price,
        opening_stock: balances[p.product_code]?.balance ?? 0,
        additions: 0,
        sold: 0,
        damaged: 0,
        damage_note: '',
        balance: balances[p.product_code]?.balance ?? 0,
        sales_value: 0,
      })))
    }).catch(() => {})
  }, [date])

  useEffect(() => { fetchAccessories() }, [fetchAccessories])

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

  // Recalculate cylinder rows when inputs change
  useEffect(() => {
    if (pricing.length === 0) return
    setCylinderRows(prev => prev.map(row => {
      const p = pricing.find(pr => pr.size_kg === row.size_kg)
      if (!p) return row
      const t_in = tradedInMap[row.size_kg] || 0
      const t_out = tradedOutMap[row.size_kg] || 0
      const balance = row.opening_balance + row.receipts + t_in - row.sold_refill - row.sold_with_cylinder - t_out - (row.damaged || 0)
      return {
        ...row,
        traded_in: t_in,
        traded_out: t_out,
        balance,
        value_refill: p.price_refill * row.sold_refill,
        value_with_cylinder: p.price_with_cylinder * row.sold_with_cylinder,
        total_value: p.price_refill * row.sold_refill + p.price_with_cylinder * row.sold_with_cylinder,
      }
    }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    pricing,
    trades,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    cylinderRows.map(r => `${r.opening_balance}-${r.receipts}-${r.sold_refill}-${r.sold_with_cylinder}-${r.damaged}`).join(','),
  ])

  // Recalculate accessory rows
  useEffect(() => {
    setAccessoryRows(prev => prev.map(row => ({
      ...row,
      balance: row.opening_stock + row.additions - row.sold - (row.damaged || 0),
      sales_value: row.selling_price * row.sold,
    })))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessoryRows.map(r => `${r.opening_stock}-${r.additions}-${r.sold}-${r.damaged}`).join(',')])

  const updateCylinder = (sizeKg: number, field: string, value: number) =>
    setCylinderRows(prev => prev.map(r => r.size_kg === sizeKg ? { ...r, [field]: value } : r))

  const updateCylinderStr = (sizeKg: number, field: string, value: string) =>
    setCylinderRows(prev => prev.map(r => r.size_kg === sizeKg ? { ...r, [field]: value } : r))

  const updateAccessory = (code: string, field: string, value: number) =>
    setAccessoryRows(prev => prev.map(r => r.product_code === code ? { ...r, [field]: value } : r))

  const updateAccessoryStr = (code: string, field: string, value: string) =>
    setAccessoryRows(prev => prev.map(r => r.product_code === code ? { ...r, [field]: value } : r))

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
  const accessoryTotal = accessoryRows.reduce((s, r) => s + r.sales_value, 0)
  const totalRevenue = grandTotal + accessoryTotal
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

      const hasAccActivity = accessoryRows.some(r => r.additions > 0 || r.sold > 0 || (r.damaged || 0) > 0)
      if (hasAccActivity) {
        const accRes = await authFetch(`${BASE}/lpg-daily/accessories/entry`, {
          method: 'POST',
          headers: { ...getHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date,
            product_rows: accessoryRows.map(r => ({
              product_code: r.product_code, description: r.description,
              selling_price: r.selling_price, opening_stock: r.opening_stock,
              additions: r.additions, sold: r.sold,
              damaged: r.damaged || 0, damage_note: r.damage_note || null,
            })),
            recorded_by: user?.user_id || 'unknown',
          }),
        })
        if (!accRes.ok) { const e = await accRes.json(); throw new Error(e.detail || 'Failed to submit accessories') }
      }

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

  const numInput = (value: number, onChange: (v: number) => void, extraClass = '') => (
    <input
      type="number" min={0} value={value}
      onChange={e => onChange(parseInt(e.target.value) || 0)}
      className={`w-full px-2 py-1.5 rounded border border-surface-border bg-surface-bg text-content-primary text-sm text-right focus:outline-none focus:border-action-primary ${extraClass}`}
    />
  )

  return (
    <div>
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-content-primary">LPG Operations</h1>
        <p className="text-sm text-content-secondary mt-1">Shift-level cylinder sales and accessories tracking</p>
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

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-surface-border">
        {(['cylinders', 'accessories'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === tab
                ? 'border-action-primary text-action-primary'
                : 'border-transparent text-content-secondary hover:text-content-primary'
            }`}>
            {tab === 'cylinders' ? 'Cylinders' : `Accessories${accessoryRows.length ? ` (${accessoryRows.length})` : ''}`}
          </button>
        ))}
      </div>

      {/* ── CYLINDERS TAB ── */}
      {activeTab === 'cylinders' && (
        <>
          {/* Summary strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <div className="bg-surface-card rounded-lg border border-surface-border p-4">
              <p className="text-xs text-content-secondary mb-1">Total Revenue</p>
              <p className="text-2xl font-bold text-action-primary">{fmt(totalRevenue)}</p>
              {accessoryTotal > 0 && (
                <p className="text-xs text-content-secondary mt-0.5">Cyl {fmt(grandTotal)} + Acc {fmt(accessoryTotal)}</p>
              )}
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
            </div>
          </div>

          {!lpgPricesConfigured && (
            <div className="mb-4 p-3 rounded-lg text-sm text-status-error border border-status-error bg-status-error/10">
              LPG pricing not configured. Ask a manager to set prices in Stores / Stock.
            </div>
          )}

          {/* Cylinder cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
            {cylinderRows.map(row => {
              const p = pricing.find(pr => pr.size_kg === row.size_kg)
              const tIn = tradedInMap[row.size_kg] || 0
              const tOut = tradedOutMap[row.size_kg] || 0
              const hasActivity = row.opening_balance > 0 || row.receipts > 0
                || row.sold_refill > 0 || row.sold_with_cylinder > 0
                || tIn > 0 || tOut > 0
                || row.opening_empty > 0 || row.closing_empty > 0

              return (
                <div key={row.size_kg}
                  className={`bg-surface-card rounded-lg border-2 p-4 ${
                    row.balance < 0
                      ? 'border-status-error'
                      : hasActivity
                      ? 'border-action-primary'
                      : 'border-surface-border'
                  }`}>

                  {/* Card header */}
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <p className="text-lg font-bold text-content-primary">{row.size_kg} kg</p>
                      {p && (
                        <p className="text-xs text-content-secondary mt-0.5">
                          Refill {fmt(p.price_refill)}&nbsp;&nbsp;|&nbsp;&nbsp;New {fmt(p.price_with_cylinder)}
                        </p>
                      )}
                    </div>
                    {row.total_value > 0 && (
                      <span className="text-sm font-bold text-action-primary">{fmt(row.total_value)}</span>
                    )}
                  </div>

                  {/* Full cylinders section */}
                  <p className="text-[10px] font-semibold text-content-secondary uppercase tracking-widest mb-2">Full Cylinders</p>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-2 mb-2">
                    <div>
                      <label className="block text-xs text-content-secondary mb-0.5">Opening</label>
                      {canManageStock
                        ? numInput(row.opening_balance, v => updateCylinder(row.size_kg, 'opening_balance', v))
                        : <p className="text-sm font-medium text-content-primary px-2 py-1.5">{row.opening_balance}</p>}
                    </div>
                    <div>
                      <label className="block text-xs text-content-secondary mb-0.5">Received</label>
                      {canManageStock
                        ? numInput(row.receipts, v => updateCylinder(row.size_kg, 'receipts', v))
                        : <p className="text-sm text-content-secondary px-2 py-1.5">{row.receipts}</p>}
                    </div>
                    <div>
                      <label className="block text-xs text-content-secondary mb-0.5">Sold (Refill)</label>
                      {numInput(row.sold_refill, v => updateCylinder(row.size_kg, 'sold_refill', v))}
                    </div>
                    <div>
                      <label className="block text-xs text-content-secondary mb-0.5">Sold (New)</label>
                      {numInput(row.sold_with_cylinder, v => updateCylinder(row.size_kg, 'sold_with_cylinder', v))}
                    </div>
                    <div>
                      <label className="block text-xs text-content-secondary mb-0.5">Damaged</label>
                      <input type="number" min={0} value={row.damaged || 0}
                        onChange={e => updateCylinder(row.size_kg, 'damaged', parseInt(e.target.value) || 0)}
                        className={`w-full px-2 py-1.5 rounded border bg-surface-bg text-content-primary text-sm text-right focus:outline-none focus:border-action-primary ${
                          row.damaged > 0 ? 'border-status-warning' : 'border-surface-border'
                        }`} />
                    </div>
                    {/* Trade impact — read-only, derived from trades list */}
                    {(tIn > 0 || tOut > 0) && (
                      <div className="flex flex-col justify-end gap-0.5 pb-1">
                        {tIn > 0 && <span className="text-xs text-status-success font-medium">+{tIn} traded in</span>}
                        {tOut > 0 && <span className="text-xs text-status-error font-medium">-{tOut} traded out</span>}
                      </div>
                    )}
                  </div>

                  {row.damaged > 0 && (
                    <input type="text" value={row.damage_note || ''}
                      onChange={e => updateCylinderStr(row.size_kg, 'damage_note', e.target.value)}
                      placeholder="Damage reason (required)"
                      className={`w-full px-2 py-1.5 rounded border bg-surface-bg text-content-primary text-xs mb-3 focus:outline-none focus:border-action-primary ${
                        (row.damage_note || '').trim() ? 'border-surface-border' : 'border-status-error'
                      }`} />
                  )}

                  {/* Closing full — calculated */}
                  <div className={`flex items-center justify-between px-3 py-2 rounded mb-4 ${
                    row.balance < 0
                      ? 'bg-status-error/10 border border-status-error'
                      : 'bg-surface-bg border border-surface-border'
                  }`}>
                    <span className="text-xs font-medium text-content-secondary">Closing (Full)</span>
                    <span className={`text-xl font-bold ${row.balance < 0 ? 'text-status-error' : 'text-content-primary'}`}>
                      {row.balance}
                      {row.balance < 0 && <span className="text-xs font-normal ml-1">oversell</span>}
                    </span>
                  </div>

                  {/* Empty cylinders section */}
                  <p className="text-[10px] font-semibold text-content-secondary uppercase tracking-widest mb-2">Empty Cylinders</p>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                    <div>
                      <label className="block text-xs text-content-secondary mb-0.5">Opening Empty</label>
                      {canManageStock
                        ? numInput(row.opening_empty, v => updateCylinder(row.size_kg, 'opening_empty', v))
                        : <p className="text-sm text-content-secondary px-2 py-1.5">{row.opening_empty}</p>}
                    </div>
                    <div>
                      <label className="block text-xs text-content-secondary mb-0.5">Closing Empty</label>
                      {numInput(row.closing_empty, v => updateCylinder(row.size_kg, 'closing_empty', v))}
                    </div>
                  </div>

                  {/* Revenue breakdown */}
                  {(row.value_refill > 0 || row.value_with_cylinder > 0) && (
                    <div className="mt-3 pt-3 border-t border-surface-border space-y-0.5">
                      {row.value_refill > 0 && (
                        <div className="flex justify-between text-xs">
                          <span className="text-content-secondary">Refill revenue</span>
                          <span className="font-medium text-content-primary">{fmt(row.value_refill)}</span>
                        </div>
                      )}
                      {row.value_with_cylinder > 0 && (
                        <div className="flex justify-between text-xs">
                          <span className="text-content-secondary">New cylinder revenue</span>
                          <span className="font-medium text-content-primary">{fmt(row.value_with_cylinder)}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
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
        </>
      )}

      {/* ── ACCESSORIES TAB ── */}
      {activeTab === 'accessories' && (
        <div className="bg-surface-card rounded-lg border border-surface-border overflow-hidden mb-6">
          <div className="px-4 py-3 border-b border-surface-border flex items-center justify-between">
            <h3 className="text-sm font-semibold text-content-primary">LPG Accessories</h3>
            {accessoryTotal > 0 && (
              <span className="text-sm font-bold text-action-primary">{fmt(accessoryTotal)}</span>
            )}
          </div>
          {accessoryRows.length === 0 ? (
            <p className="px-4 py-6 text-sm text-content-secondary">No accessories configured.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-surface-bg">
                    {['Product', 'Price', 'Opening', 'Additions', 'Sold', 'Damaged', 'Closing', 'Value'].map(h => (
                      <th key={h} className="px-3 py-2 text-left text-xs font-medium uppercase text-content-secondary">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {accessoryRows.map(row => (
                    <tr key={row.product_code} className="border-t border-surface-border hover:bg-surface-bg">
                      <td className="px-3 py-2">
                        <p className="font-medium text-content-primary">{row.description}</p>
                        <p className="text-xs text-content-secondary">{row.product_code}</p>
                      </td>
                      <td className="px-3 py-2 text-right text-content-secondary">{fmt(row.selling_price)}</td>
                      <td className="px-3 py-2">
                        {canManageStock
                          ? <input type="number" min={0} value={row.opening_stock}
                              onChange={e => updateAccessory(row.product_code, 'opening_stock', parseInt(e.target.value) || 0)}
                              className="w-16 px-2 py-1 rounded border border-surface-border bg-surface-bg text-content-primary text-sm text-right focus:outline-none focus:border-action-primary" />
                          : <span className="text-sm text-content-primary">{row.opening_stock}</span>}
                      </td>
                      <td className="px-3 py-2">
                        {canManageStock
                          ? <input type="number" min={0} value={row.additions}
                              onChange={e => updateAccessory(row.product_code, 'additions', parseInt(e.target.value) || 0)}
                              className="w-16 px-2 py-1 rounded border border-surface-border bg-surface-bg text-content-primary text-sm text-right focus:outline-none focus:border-action-primary" />
                          : <span className="text-sm text-content-secondary">{row.additions}</span>}
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" min={0} value={row.sold}
                          onChange={e => updateAccessory(row.product_code, 'sold', parseInt(e.target.value) || 0)}
                          className="w-16 px-2 py-1 rounded border border-surface-border bg-surface-bg text-content-primary text-sm text-right focus:outline-none focus:border-action-primary" />
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" min={0} value={row.damaged || 0}
                          onChange={e => updateAccessory(row.product_code, 'damaged', parseInt(e.target.value) || 0)}
                          className={`w-16 px-2 py-1 rounded border bg-surface-bg text-content-primary text-sm text-right focus:outline-none focus:border-action-primary ${
                            row.damaged > 0 ? 'border-status-warning' : 'border-surface-border'
                          }`} />
                        {row.damaged > 0 && (
                          <input type="text" value={row.damage_note || ''}
                            onChange={e => updateAccessoryStr(row.product_code, 'damage_note', e.target.value)}
                            placeholder="Reason"
                            className={`mt-1 w-36 px-2 py-1 rounded border bg-surface-bg text-content-primary text-xs focus:outline-none ${
                              (row.damage_note || '').trim() ? 'border-surface-border' : 'border-status-error'
                            }`} />
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span className={`font-medium ${row.balance < 0 ? 'text-status-error' : 'text-content-primary'}`}>
                          {row.balance}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-semibold text-action-primary">
                        {row.sales_value > 0 ? fmt(row.sales_value) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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
