import { useState, useEffect, useCallback } from 'react'
import { useTheme } from '../contexts/ThemeContext'
import { getHeaders, authFetch } from '../lib/api'

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
  balance: number
  sales_value: number
}

function getAuthHeaders() {
  return {
    ...getHeaders(),
    'Content-Type': 'application/json',
  }
}

export default function LPGDaily() {
  const { theme } = useTheme()
  const [user, setUser] = useState<any>(null)
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [shiftType, setShiftType] = useState('Day')
  const [salesperson, setSalesperson] = useState(() => {
    if (typeof window !== 'undefined') {
      const userData = localStorage.getItem('user')
      if (userData) return JSON.parse(userData).full_name || ''
    }
    return ''
  })

  const [pricing, setPricing] = useState<Pricing[]>([])
  const [cylinderRows, setCylinderRows] = useState<CylinderRow[]>(
    LPG_SIZES.map(s => ({
      size_kg: s, opening_balance: 0, opening_empty: 0, receipts: 0,
      traded_in: 0, traded_out: 0,
      sold_refill: 0, sold_with_cylinder: 0,
      balance: 0, closing_empty: 0, value_refill: 0, value_with_cylinder: 0, total_value: 0,
    }))
  )

  const [trades, setTrades] = useState<CylinderTrade[]>([])

  const [actualPopulation, setActualPopulation] = useState<string>('')

  // Accessories
  const [accessoryRows, setAccessoryRows] = useState<AccessoryRow[]>([])

  // Pricing editor state
  const [showPricingEditor, setShowPricingEditor] = useState(false)
  const [editPrices, setEditPrices] = useState<Record<number, { price_refill: string, price_full_cylinder: string }>>({})
  const [pricingSaving, setPricingSaving] = useState(false)
  const [pricingMsg, setPricingMsg] = useState('')

  // Accessories pricing editor state
  const [showAccPricingEditor, setShowAccPricingEditor] = useState(false)
  const [accEditPrices, setAccEditPrices] = useState<Record<string, string>>({})
  const [accPricingSaving, setAccPricingSaving] = useState(false)

  const [showEmptyTracking, setShowEmptyTracking] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [entries, setEntries] = useState<any[]>([])

  const canEditPricing = user?.role === 'supervisor' || user?.role === 'owner'
  const canManageStock = user?.role === 'supervisor' || user?.role === 'owner'
  const lpgPricesConfigured = pricing.length > 0 && pricing.some((p: any) => p.price_refill > 0 || p.price_with_cylinder > 0)

  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (userData) setUser(JSON.parse(userData))
  }, [])

  // Fetch pricing on mount
  const fetchPricing = useCallback(() => {
    authFetch(`${BASE}/lpg-daily/pricing`, { headers: getAuthHeaders() })
      .then(r => r.json())
      .then(data => {
        setPricing(data.sizes || [])
        // Populate pricing editor
        const ep: Record<number, { price_refill: string, price_full_cylinder: string }> = {}
        const prices = data.prices || {}
        for (const size of LPG_SIZES) {
          const sp = prices[String(size)]
          if (sp) {
            ep[size] = { price_refill: String(sp.price_refill || 0), price_full_cylinder: String(sp.price_full_cylinder || 0) }
          } else {
            // Fallback: use computed sizes data
            const sizeData = (data.sizes || []).find((s: any) => s.size_kg === size)
            ep[size] = {
              price_refill: String(sizeData?.price_refill || 0),
              price_full_cylinder: String(sizeData?.price_with_cylinder || 0),
            }
          }
        }
        setEditPrices(ep)
      })
      .catch(() => {})
  }, [])

  useEffect(() => { fetchPricing() }, [fetchPricing])

  // Fetch previous shift data when date/shift changes
  const fetchPreviousShift = useCallback(() => {
    authFetch(`${BASE}/lpg-daily/previous-shift?current_date=${date}&shift_type=${shiftType}`, {
      headers: getAuthHeaders(),
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

  // Fetch accessories pricing + previous day balances
  const fetchAccessories = useCallback(() => {
    Promise.all([
      authFetch(`${BASE}/lpg-daily/accessories/pricing`, { headers: getAuthHeaders() }).then(r => r.ok ? r.json() : []),
      authFetch(`${BASE}/lpg-daily/accessories/previous-day?current_date=${date}`, { headers: getAuthHeaders() }).then(r => r.ok ? r.json() : {} as any),
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
        balance: balances[p.product_code]?.balance ?? 0,
        sales_value: 0,
      })))
      // Populate editor
      const ep: Record<string, string> = {}
      for (const p of products) ep[p.product_code] = String(p.selling_price || 0)
      setAccEditPrices(ep)
    }).catch(() => {})
  }, [date])

  useEffect(() => { fetchAccessories() }, [fetchAccessories])

  // Fetch existing entries
  useEffect(() => {
    authFetch(`${BASE}/lpg-daily/entries?date=${date}`, { headers: getAuthHeaders() })
      .then(r => r.json())
      .then(data => setEntries(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [date, success])

  // Compute traded_in / traded_out from trades list
  const tradedInMap: Record<number, number> = {}
  const tradedOutMap: Record<number, number> = {}
  for (const size of LPG_SIZES) { tradedInMap[size] = 0; tradedOutMap[size] = 0 }
  for (const t of trades) {
    tradedInMap[t.from_size_kg] = (tradedInMap[t.from_size_kg] || 0) + t.quantity    // Station receives FROM-size
    tradedOutMap[t.to_size_kg] = (tradedOutMap[t.to_size_kg] || 0) + t.quantity      // Station gives TO-size
  }

  // Recalculate balances and values in real-time
  useEffect(() => {
    if (pricing.length === 0) return
    setCylinderRows(prev => prev.map(row => {
      const p = pricing.find(pr => pr.size_kg === row.size_kg)
      if (!p) return row
      const t_in = tradedInMap[row.size_kg] || 0
      const t_out = tradedOutMap[row.size_kg] || 0
      const balance = row.opening_balance + row.receipts + t_in - row.sold_refill - row.sold_with_cylinder - t_out
      const value_refill = p.price_refill * row.sold_refill
      const value_with_cylinder = p.price_with_cylinder * row.sold_with_cylinder
      return {
        ...row,
        traded_in: t_in,
        traded_out: t_out,
        balance,
        value_refill,
        value_with_cylinder,
        total_value: value_refill + value_with_cylinder,
      }
    }))
  }, [pricing, trades, cylinderRows.map(r => `${r.opening_balance}-${r.receipts}-${r.sold_refill}-${r.sold_with_cylinder}`).join(',')])

  // Recalculate accessory balances
  useEffect(() => {
    setAccessoryRows(prev => prev.map(row => ({
      ...row,
      balance: row.opening_stock + row.additions - row.sold,
      sales_value: row.selling_price * row.sold,
    })))
  }, [accessoryRows.map(r => `${r.opening_stock}-${r.additions}-${r.sold}`).join(',')])

  const updateCylinderField = (sizeKg: number, field: string, value: number) => {
    setCylinderRows(prev => prev.map(row =>
      row.size_kg === sizeKg ? { ...row, [field]: value } : row
    ))
  }

  const updateAccessoryField = (code: string, field: string, value: number) => {
    setAccessoryRows(prev => prev.map(row =>
      row.product_code === code ? { ...row, [field]: value } : row
    ))
  }

  // Trade helpers
  const addTrade = () => {
    setTrades(prev => [...prev, { from_size_kg: 3, to_size_kg: 6, quantity: 1, price_difference: 0, trade_type: 'upgrade' }])
  }

  const removeTrade = (index: number) => {
    setTrades(prev => prev.filter((_, i) => i !== index))
  }

  const updateTrade = (index: number, field: string, value: any) => {
    setTrades(prev => prev.map((t, i) => {
      if (i !== index) return t
      const updated = { ...t, [field]: value }
      // Recalculate price_difference and trade_type
      const fromP = pricing.find(p => p.size_kg === updated.from_size_kg)
      const toP = pricing.find(p => p.size_kg === updated.to_size_kg)
      if (fromP && toP) {
        updated.price_difference = toP.price_refill - fromP.price_refill
        updated.trade_type = updated.to_size_kg > updated.from_size_kg ? 'upgrade' : 'downgrade'
      }
      return updated
    }))
  }

  const totalTradeRevenue = trades.reduce((s, t) => s + (t.price_difference * t.quantity), 0)

  const grandTotal = cylinderRows.reduce((s, r) => s + r.total_value, 0)
  const accessoryTotal = accessoryRows.reduce((s, r) => s + r.sales_value, 0)

  // Auto-calculated book population: sum of closing filled + closing empty
  const autoBookPopulation = cylinderRows.reduce((s, r) => s + r.balance + r.closing_empty, 0)

  const popDifference = actualPopulation
    ? autoBookPopulation - parseInt(actualPopulation)
    : null

  // Oversell warnings
  const oversellRows = cylinderRows.filter(r => r.balance < 0)

  const handleSubmit = async () => {
    if (!salesperson.trim()) {
      setError('Please enter salesperson name')
      return
    }
    setLoading(true)
    setError('')
    setSuccess('')

    try {
      // Submit cylinder entry
      const validTrades = trades.filter(t => t.from_size_kg !== t.to_size_kg && t.quantity > 0)
      const cylRes = await authFetch(`${BASE}/lpg-daily/entry`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          date,
          shift_type: shiftType,
          salesperson,
          cylinder_rows: cylinderRows.map(r => ({
            size_kg: r.size_kg,
            opening_balance: r.opening_balance,
            opening_empty: r.opening_empty,
            receipts: r.receipts,
            sold_refill: r.sold_refill,
            sold_with_cylinder: r.sold_with_cylinder,
            closing_empty: r.closing_empty,
          })),
          trades: validTrades.length > 0 ? validTrades.map(t => ({
            from_size_kg: t.from_size_kg,
            to_size_kg: t.to_size_kg,
            quantity: t.quantity,
          })) : null,
          book_cylinder_population: autoBookPopulation,
          actual_cylinder_population: actualPopulation ? parseInt(actualPopulation) : null,
          recorded_by: user?.user_id || 'unknown',
        }),
      })

      if (!cylRes.ok) {
        const err = await cylRes.json()
        throw new Error(err.detail || 'Failed to submit LPG entry')
      }

      // Submit accessories entry
      const hasAccessoryActivity = accessoryRows.some(r => r.additions > 0 || r.sold > 0)
      if (hasAccessoryActivity) {
        const accRes = await authFetch(`${BASE}/lpg-daily/accessories/entry`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            date,
            product_rows: accessoryRows.map(r => ({
              product_code: r.product_code,
              description: r.description,
              selling_price: r.selling_price,
              opening_stock: r.opening_stock,
              additions: r.additions,
              sold: r.sold,
            })),
            recorded_by: user?.user_id || 'unknown',
          }),
        })

        if (!accRes.ok) {
          const err = await accRes.json()
          throw new Error(err.detail || 'Failed to submit accessories entry')
        }
      }

      setSuccess('LPG daily entry submitted successfully!')
      setTrades([])
    } catch (err: any) {
      setError(err.message || 'Submission failed')
    } finally {
      setLoading(false)
    }
  }

  const savePricing = async () => {
    setPricingSaving(true)
    setPricingMsg('')
    try {
      const prices: Record<string, { price_refill: number, price_full_cylinder: number }> = {}
      for (const size of LPG_SIZES) {
        const ep = editPrices[size]
        prices[String(size)] = {
          price_refill: parseFloat(ep?.price_refill) || 0,
          price_full_cylinder: parseFloat(ep?.price_full_cylinder) || 0,
        }
      }
      const res = await authFetch(`${BASE}/lpg-daily/pricing`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ prices }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || 'Failed to update pricing')
      }
      setPricingMsg('Pricing updated successfully')
      fetchPricing()
    } catch (err: any) {
      setPricingMsg(err.message || 'Failed to save pricing')
    } finally {
      setPricingSaving(false)
    }
  }

  const saveAccPricing = async () => {
    setAccPricingSaving(true)
    try {
      const items = Object.entries(accEditPrices).map(([code, price]) => ({
        product_code: code,
        selling_price: parseFloat(price) || 0,
      }))
      const res = await authFetch(`${BASE}/lpg-daily/accessories/pricing`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(items),
      })
      if (!res.ok) { const err = await res.json(); throw new Error(err.detail || 'Failed') }
      fetchAccessories()
      setShowAccPricingEditor(false)
    } catch (err: any) { setError(err.message) }
    finally { setAccPricingSaving(false) }
  }

  const accPricesConfigured = accessoryRows.length > 0 && accessoryRows.some(r => r.selling_price > 0)
  const isFirstCylinderEntry = cylinderRows.length > 0 && cylinderRows.every(r => r.opening_balance === 0)
  const isFirstAccessoryEntry = accessoryRows.length > 0 && accessoryRows.every(r => r.opening_stock === 0)

  const inputStyle = {
    backgroundColor: theme.cardBg,
    color: theme.textPrimary,
    borderColor: theme.border,
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: theme.textPrimary }}>LPG Daily Operations</h1>
        <p className="text-sm mt-1" style={{ color: theme.textSecondary }}>
          Shift-level cylinder sales and accessories tracking
        </p>
      </div>

      {/* Pricing Settings (editable by supervisor/owner) */}
      {canEditPricing && (
        <div className="rounded-lg shadow mb-6 overflow-hidden"
          style={{ backgroundColor: theme.cardBg, borderColor: theme.border, borderWidth: 1 }}>
          <button
            onClick={() => setShowPricingEditor(!showPricingEditor)}
            className="w-full p-3 flex justify-between items-center text-sm font-medium"
            style={{ color: theme.textPrimary }}>
            <span>LPG Pricing Settings</span>
            <span className="text-xs" style={{ color: theme.textSecondary }}>
              {showPricingEditor ? 'Hide' : 'Edit Pricing'} {showPricingEditor ? '-' : '+'}
            </span>
          </button>
          {showPricingEditor && (
            <div className="p-4 space-y-4" style={{ borderTopColor: theme.border, borderTopWidth: 1 }}>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr style={{ backgroundColor: theme.background }}>
                      <th className="px-3 py-2 text-left text-xs font-medium uppercase" style={{ color: theme.textSecondary }}>Size (kg)</th>
                      <th className="px-3 py-2 text-left text-xs font-medium uppercase" style={{ color: theme.textSecondary }}>Price Refill (ZMW)</th>
                      <th className="px-3 py-2 text-left text-xs font-medium uppercase" style={{ color: theme.textSecondary }}>Price Full Cylinder (ZMW)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {LPG_SIZES.map(size => (
                      <tr key={size} style={{ borderTopColor: theme.border, borderTopWidth: 1 }}>
                        <td className="px-3 py-2 font-medium" style={{ color: theme.textPrimary }}>{size} kg</td>
                        <td className="px-3 py-2">
                          <input type="number" min={0} step="1"
                            value={editPrices[size]?.price_refill || ''}
                            onChange={e => setEditPrices(prev => ({
                              ...prev,
                              [size]: { ...prev[size], price_refill: e.target.value }
                            }))}
                            className="w-32 px-2 py-1 rounded border text-sm text-right" style={inputStyle} />
                        </td>
                        <td className="px-3 py-2">
                          <input type="number" min={0} step="1"
                            value={editPrices[size]?.price_full_cylinder || ''}
                            onChange={e => setEditPrices(prev => ({
                              ...prev,
                              [size]: { ...prev[size], price_full_cylinder: e.target.value }
                            }))}
                            className="w-32 px-2 py-1 rounded border text-sm text-right" style={inputStyle} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {pricingMsg && (
                <div className="text-sm" style={{
                  color: pricingMsg.includes('success') ? 'var(--color-status-success)' : 'var(--color-status-error)'
                }}>{pricingMsg}</div>
              )}
              <button onClick={savePricing} disabled={pricingSaving}
                className="px-4 py-2 rounded text-sm font-medium text-white disabled:opacity-50"
                style={{ backgroundColor: theme.primary }}>
                {pricingSaving ? 'Saving...' : 'Save Pricing'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Date / Shift / Salesperson selectors */}
      <div className="rounded-lg shadow p-4 mb-6 grid grid-cols-1 md:grid-cols-3 gap-4"
        style={{ backgroundColor: theme.cardBg, borderColor: theme.border, borderWidth: 1 }}>
        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: theme.textSecondary }}>Date</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="w-full px-3 py-2 rounded border text-sm" style={inputStyle} />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: theme.textSecondary }}>Shift</label>
          <select value={shiftType} onChange={e => setShiftType(e.target.value)}
            className="w-full px-3 py-2 rounded border text-sm" style={inputStyle}>
            <option value="Day">Day Shift</option>
            <option value="Night">Night Shift</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: theme.textSecondary }}>Salesperson</label>
          <input type="text" value={salesperson} onChange={e => setSalesperson(e.target.value)}
            placeholder="Enter salesperson name"
            className="w-full px-3 py-2 rounded border text-sm" style={inputStyle} />
        </div>
      </div>

      {/* First-time stock banner */}
      {isFirstCylinderEntry && (
        <div className="mb-4 p-3 rounded-lg text-sm" style={{ backgroundColor: 'rgba(59,130,246,0.1)', color: 'var(--color-action-primary)', border: '1px solid var(--color-action-primary)' }}>
          First time? Enter your current physical cylinder counts as Opening Stock below. These will carry forward automatically after each shift.
        </div>
      )}

      {/* Cylinder Sales Table */}
      <div className="rounded-lg shadow mb-6 overflow-x-auto"
        style={{ backgroundColor: theme.cardBg, borderColor: theme.border, borderWidth: 1 }}>
        <div className="p-4 font-semibold text-sm flex justify-between items-center" style={{ borderBottomColor: theme.border, borderBottomWidth: 1, color: theme.textPrimary }}>
          <span>Cylinder Sales</span>
          <details className="inline">
            <summary className="cursor-pointer text-xs font-normal" style={{ color: theme.textSecondary }}>
              Column Guide
            </summary>
            <div className="absolute right-4 mt-1 p-3 rounded-lg shadow-lg text-xs font-normal z-10 max-w-sm"
              style={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.border}`, color: theme.textSecondary }}>
              <p><strong style={{ color: theme.textPrimary }}>Opening Stock</strong>: Filled cylinders at shift start (auto-populated from previous shift)</p>
              <p className="mt-1"><strong style={{ color: theme.textPrimary }}>Received</strong>: New filled cylinders delivered by supplier</p>
              <p className="mt-1"><strong style={{ color: theme.textPrimary }}>Trade In/Out</strong>: Cylinder size exchanges with customers (managed in Trades section below)</p>
              <p className="mt-1"><strong style={{ color: theme.textPrimary }}>Sold (Refill)</strong>: Customer returns empty cylinder, receives filled one — generates refill revenue</p>
              <p className="mt-1"><strong style={{ color: theme.textPrimary }}>Sold (New Cylinder)</strong>: Customer buys a new filled cylinder (no return) — generates full cylinder revenue</p>
              <p className="mt-1"><strong style={{ color: theme.textPrimary }}>Closing Stock</strong>: Remaining filled cylinders at shift end</p>
            </div>
          </details>
        </div>
        <table className="min-w-full text-sm">
          <thead>
            <tr style={{ backgroundColor: theme.background }}>
              {['Size (kg)', 'Opening Stock (Full)', 'Received (Deliveries)', 'Trade In (+)', 'Trade Out (-)', 'Sold (Refill Only)', 'Sold (New Cylinder)', 'Closing Stock (Full)', 'Refill Revenue', 'New Cyl Revenue', 'Total Revenue'].map(h => (
                <th key={h} className="px-3 py-2 text-left text-xs font-medium uppercase"
                  style={{ color: theme.textSecondary }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cylinderRows.map(row => {
              const p = pricing.find(pr => pr.size_kg === row.size_kg)
              return (
                <tr key={row.size_kg} className="hover:bg-surface-bg" style={{ borderTopColor: theme.border, borderTopWidth: 1 }}>
                  <td className="px-3 py-2 font-medium" style={{ color: theme.textPrimary }}>
                    {row.size_kg} kg
                    {p && <span className="block text-xs" style={{ color: theme.textSecondary }}>
                      Refill: K{p.price_refill.toLocaleString()} | New: K{p.price_with_cylinder.toLocaleString()}
                    </span>}
                  </td>
                  <td className="px-3 py-2">
                    <input type="number" min={0} value={row.opening_balance}
                      onChange={e => updateCylinderField(row.size_kg, 'opening_balance', parseInt(e.target.value) || 0)}
                      className="w-20 px-2 py-1 rounded border text-sm text-right" style={inputStyle} />
                  </td>
                  <td className="px-3 py-2">
                    {canManageStock ? (
                      <input type="number" min={0} value={row.receipts}
                        onChange={e => updateCylinderField(row.size_kg, 'receipts', parseInt(e.target.value) || 0)}
                        className="w-20 px-2 py-1 rounded border text-sm text-right" style={inputStyle} />
                    ) : (
                      <span className="text-sm" style={{ color: theme.textSecondary }}>{row.receipts}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-medium" style={{
                    color: row.traded_in > 0 ? 'var(--color-status-success)' : theme.textSecondary
                  }}>
                    {row.traded_in > 0 ? `+${row.traded_in}` : 0}
                  </td>
                  <td className="px-3 py-2 text-right font-medium" style={{
                    color: row.traded_out > 0 ? 'var(--color-status-error)' : theme.textSecondary
                  }}>
                    {row.traded_out > 0 ? `-${row.traded_out}` : 0}
                  </td>
                  <td className="px-3 py-2">
                    <input type="number" min={0} value={row.sold_refill}
                      onChange={e => updateCylinderField(row.size_kg, 'sold_refill', parseInt(e.target.value) || 0)}
                      className="w-20 px-2 py-1 rounded border text-sm text-right" style={inputStyle} />
                  </td>
                  <td className="px-3 py-2">
                    <input type="number" min={0} value={row.sold_with_cylinder}
                      onChange={e => updateCylinderField(row.size_kg, 'sold_with_cylinder', parseInt(e.target.value) || 0)}
                      className="w-20 px-2 py-1 rounded border text-sm text-right" style={inputStyle} />
                  </td>
                  <td className="px-3 py-2 text-right font-medium" style={{
                    color: row.balance < 0 ? 'var(--color-status-error)' : theme.textPrimary
                  }}>
                    {row.balance}
                    {row.balance < 0 && (
                      <div className="text-xs font-normal" style={{ color: 'var(--color-status-error)' }}>
                        Oversell
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right" style={{ color: theme.textSecondary }}>
                    {row.value_refill.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right" style={{ color: theme.textSecondary }}>
                    {row.value_with_cylinder.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold" style={{ color: theme.primary }}>
                    {row.total_value.toLocaleString()}
                  </td>
                </tr>
              )
            })}
            {/* Grand Total Row */}
            <tr style={{ backgroundColor: theme.background, borderTopColor: theme.border, borderTopWidth: 2 }}>
              <td colSpan={3} className="px-3 py-2 text-right font-bold text-sm" style={{ color: theme.textPrimary }}>
                Grand Total
              </td>
              <td className="px-3 py-2 text-right font-bold" style={{ color: 'var(--color-status-success)' }}>
                {cylinderRows.reduce((s, r) => s + r.traded_in, 0) || 0}
              </td>
              <td className="px-3 py-2 text-right font-bold" style={{ color: 'var(--color-status-error)' }}>
                {cylinderRows.reduce((s, r) => s + r.traded_out, 0) || 0}
              </td>
              <td colSpan={2} className="px-3 py-2" />
              <td className="px-3 py-2 text-right font-bold" style={{ color: theme.textPrimary }}>
                {cylinderRows.reduce((s, r) => s + r.balance, 0)}
              </td>
              <td className="px-3 py-2 text-right font-bold" style={{ color: theme.textSecondary }}>
                {cylinderRows.reduce((s, r) => s + r.value_refill, 0).toLocaleString()}
              </td>
              <td className="px-3 py-2 text-right font-bold" style={{ color: theme.textSecondary }}>
                {cylinderRows.reduce((s, r) => s + r.value_with_cylinder, 0).toLocaleString()}
              </td>
              <td className="px-3 py-2 text-right font-bold text-base" style={{ color: theme.primary }}>
                ZMW{grandTotal.toLocaleString()}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Empty Cylinder Tracking (Collapsible) */}
      <div className="rounded-lg shadow mb-6 overflow-hidden"
        style={{ backgroundColor: theme.cardBg, borderColor: theme.border, borderWidth: 1 }}>
        <button
          onClick={() => setShowEmptyTracking(!showEmptyTracking)}
          className="w-full p-3 flex justify-between items-center text-sm font-medium"
          style={{ color: theme.textPrimary }}>
          <span>Empty Cylinder Tracking</span>
          <span className="text-xs" style={{ color: theme.textSecondary }}>
            {showEmptyTracking ? 'Hide' : 'Show'} {showEmptyTracking ? '-' : '+'}
          </span>
        </button>
        {showEmptyTracking && (
          <div className="p-4" style={{ borderTopColor: theme.border, borderTopWidth: 1 }}>
            <p className="text-xs mb-3" style={{ color: theme.textSecondary }}>
              Track empty cylinders on hand. Empty count increases when customers return cylinders for refill.
            </p>
            <table className="min-w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: theme.background }}>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase" style={{ color: theme.textSecondary }}>Size</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase" style={{ color: theme.textSecondary }}>Opening Empty</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase" style={{ color: theme.textSecondary }}>Closing Empty</th>
                </tr>
              </thead>
              <tbody>
                {cylinderRows.map(row => (
                  <tr key={row.size_kg} style={{ borderTopColor: theme.border, borderTopWidth: 1 }}>
                    <td className="px-3 py-2 font-medium" style={{ color: theme.textPrimary }}>{row.size_kg} kg</td>
                    <td className="px-3 py-2">
                      <input type="number" min={0} value={row.opening_empty}
                        onChange={e => updateCylinderField(row.size_kg, 'opening_empty', parseInt(e.target.value) || 0)}
                        className="w-20 px-2 py-1 rounded border text-sm text-right" style={inputStyle} />
                    </td>
                    <td className="px-3 py-2">
                      <input type="number" min={0} value={row.closing_empty}
                        onChange={e => updateCylinderField(row.size_kg, 'closing_empty', parseInt(e.target.value) || 0)}
                        className="w-20 px-2 py-1 rounded border text-sm text-right" style={inputStyle} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Cylinder Trades (Upgrades/Downgrades) — supervisor/owner only */}
      {canManageStock && (
      <div className="rounded-lg shadow mb-6 overflow-hidden"
        style={{ backgroundColor: theme.cardBg, borderColor: theme.border, borderWidth: 1 }}>
        <div className="p-4 font-semibold text-sm flex justify-between items-center"
          style={{ borderBottomColor: theme.border, borderBottomWidth: 1, color: theme.textPrimary }}>
          <span>Cylinder Trades (Upgrades / Downgrades)</span>
          {totalTradeRevenue !== 0 && (
            <span className="text-xs font-normal" style={{ color: totalTradeRevenue >= 0 ? 'var(--color-status-success)' : 'var(--color-status-error)' }}>
              Trade Revenue: ZMW{totalTradeRevenue.toLocaleString()}
            </span>
          )}
        </div>
        <div className="p-4 space-y-3">
          <p className="text-xs mb-2" style={{ color: theme.textSecondary }}>
            When a customer exchanges one cylinder size for another. They return their current size and receive a different size. The station charges/refunds the price difference.
          </p>
          {trades.length === 0 && (
            <p className="text-sm" style={{ color: theme.textSecondary }}>
              No trades added yet.
            </p>
          )}
          {trades.map((trade, idx) => {
            const fromP = pricing.find(p => p.size_kg === trade.from_size_kg)
            const toP = pricing.find(p => p.size_kg === trade.to_size_kg)
            const priceDiff = (toP?.price_refill || 0) - (fromP?.price_refill || 0)
            const tradeType = trade.to_size_kg > trade.from_size_kg ? 'upgrade' : trade.to_size_kg < trade.from_size_kg ? 'downgrade' : '-'
            return (
              <div key={idx} className="flex flex-wrap items-center gap-3 p-3 rounded"
                style={{ backgroundColor: theme.background, border: `1px solid ${theme.border}` }}>
                <div>
                  <label className="block text-xs mb-1" style={{ color: theme.textSecondary }}>Customer Returns</label>
                  <select value={trade.from_size_kg}
                    onChange={e => updateTrade(idx, 'from_size_kg', parseInt(e.target.value))}
                    className="px-2 py-1 rounded border text-sm" style={inputStyle}>
                    {LPG_SIZES.map(s => <option key={s} value={s}>{s} kg</option>)}
                  </select>
                </div>
                <div className="flex items-end pb-1 text-lg" style={{ color: theme.textSecondary }}>
                  &rarr;
                </div>
                <div>
                  <label className="block text-xs mb-1" style={{ color: theme.textSecondary }}>Customer Receives</label>
                  <select value={trade.to_size_kg}
                    onChange={e => updateTrade(idx, 'to_size_kg', parseInt(e.target.value))}
                    className="px-2 py-1 rounded border text-sm" style={inputStyle}>
                    {LPG_SIZES.map(s => <option key={s} value={s}>{s} kg</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs mb-1" style={{ color: theme.textSecondary }}>Qty</label>
                  <input type="number" min={1} value={trade.quantity}
                    onChange={e => updateTrade(idx, 'quantity', parseInt(e.target.value) || 1)}
                    className="w-16 px-2 py-1 rounded border text-sm text-right" style={inputStyle} />
                </div>
                <div>
                  <label className="block text-xs mb-1" style={{ color: theme.textSecondary }}>Price Diff</label>
                  <div className="px-2 py-1 text-sm font-semibold" style={{
                    color: priceDiff > 0 ? 'var(--color-status-success)' : priceDiff < 0 ? 'var(--color-status-error)' : theme.textSecondary
                  }}>
                    {priceDiff > 0 ? '+' : ''}{(priceDiff * trade.quantity).toLocaleString()} ZMW
                  </div>
                </div>
                <div>
                  <label className="block text-xs mb-1" style={{ color: theme.textSecondary }}>Type</label>
                  <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                    tradeType === 'upgrade' ? 'text-green-700 bg-green-100' :
                    tradeType === 'downgrade' ? 'text-orange-700 bg-orange-100' : ''
                  }`}>
                    {tradeType}
                  </span>
                </div>
                <div>
                  <label className="block text-xs mb-1" style={{ color: theme.textSecondary }}>Stock Impact</label>
                  <div className="text-xs" style={{ color: theme.textSecondary }}>
                    <span style={{ color: 'var(--color-status-success)' }}>+{trade.quantity} x {trade.from_size_kg}kg</span>
                    {' / '}
                    <span style={{ color: 'var(--color-status-error)' }}>-{trade.quantity} x {trade.to_size_kg}kg</span>
                  </div>
                </div>
                <div className="flex items-end pb-1">
                  <button onClick={() => removeTrade(idx)}
                    className="px-2 py-1 rounded text-xs font-medium"
                    style={{ color: 'var(--color-status-error)', border: '1px solid var(--color-status-error)' }}>
                    Remove
                  </button>
                </div>
              </div>
            )
          })}
          <button onClick={addTrade}
            className="px-4 py-2 rounded text-sm font-medium"
            style={{ color: theme.primary, border: `1px solid ${theme.primary}` }}>
            + Add Trade
          </button>
        </div>
      </div>
      )}

      {/* Cylinder Population */}
      <div className="rounded-lg shadow p-4 mb-6 grid grid-cols-1 md:grid-cols-3 gap-4"
        style={{ backgroundColor: theme.cardBg, borderColor: theme.border, borderWidth: 1 }}>
        <div className="col-span-full text-sm font-semibold mb-1" style={{ color: theme.textPrimary }}>
          Cylinder Population Count
        </div>
        <div>
          <label className="block text-xs mb-1" style={{ color: theme.textSecondary }}>Book Count (auto-calculated)</label>
          <div className="w-full px-3 py-2 rounded text-sm font-semibold"
            style={{ backgroundColor: theme.background, color: theme.textPrimary }}>
            {autoBookPopulation}
          </div>
          <p className="text-xs mt-1" style={{ color: theme.textSecondary }}>
            Total cylinders on hand (filled + empty) based on closing counts.
          </p>
        </div>
        <div>
          <label className="block text-xs mb-1" style={{ color: theme.textSecondary }}>Actual Count</label>
          <input type="number" min={0} value={actualPopulation}
            onChange={e => setActualPopulation(e.target.value)}
            className="w-full px-3 py-2 rounded border text-sm" style={inputStyle} />
        </div>
        <div>
          <label className="block text-xs mb-1" style={{ color: theme.textSecondary }}>Difference (Book - Actual)</label>
          <div className="px-3 py-2 rounded text-sm font-semibold"
            style={{
              backgroundColor: theme.background,
              color: popDifference !== null && popDifference !== 0 ? 'var(--color-status-error)' : theme.textPrimary,
            }}>
            {popDifference !== null ? popDifference : '-'}
          </div>
        </div>
      </div>

      {/* Accessories Pricing Editor */}
      {canEditPricing && (
        <div className="mb-4">
          <button onClick={() => setShowAccPricingEditor(!showAccPricingEditor)}
            className="text-sm font-medium px-3 py-1.5 rounded-btn border"
            style={{ color: theme.primary, borderColor: theme.border, backgroundColor: theme.cardBg }}>
            {showAccPricingEditor ? 'Hide' : 'Edit'} Accessory Prices
          </button>
          {showAccPricingEditor && (
            <div className="mt-2 rounded-lg shadow p-4" style={{ backgroundColor: theme.cardBg, borderColor: theme.border, borderWidth: 1 }}>
              <div className="space-y-2">
                {accessoryRows.map(row => (
                  <div key={row.product_code} className="flex items-center gap-3">
                    <span className="text-sm flex-1" style={{ color: theme.textPrimary }}>{row.description}</span>
                    <div className="flex items-center gap-1">
                      <span className="text-xs" style={{ color: theme.textSecondary }}>K</span>
                      <input type="number" min={0} step={1}
                        value={accEditPrices[row.product_code] || '0'}
                        onChange={e => setAccEditPrices({ ...accEditPrices, [row.product_code]: e.target.value })}
                        className="w-24 px-2 py-1 rounded border text-sm text-right" style={inputStyle} />
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={saveAccPricing} disabled={accPricingSaving}
                className="mt-3 w-full py-2 rounded-lg font-semibold text-white text-sm disabled:opacity-50"
                style={{ backgroundColor: theme.primary }}>
                {accPricingSaving ? 'Saving...' : 'Save Accessory Prices'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* First-time accessory stock banner */}
      {isFirstAccessoryEntry && (
        <div className="mb-4 p-3 rounded-lg text-sm" style={{ backgroundColor: 'rgba(59,130,246,0.1)', color: 'var(--color-action-primary)', border: '1px solid var(--color-action-primary)' }}>
          First time? Enter your current accessory stock counts as Opening Stock below. These will carry forward automatically after each entry.
        </div>
      )}

      {/* LPG Accessories */}
      <div className="rounded-lg shadow mb-6 overflow-x-auto"
        style={{ backgroundColor: theme.cardBg, borderColor: theme.border, borderWidth: 1 }}>
        <div className="p-4 font-semibold text-sm flex justify-between items-center"
          style={{ borderBottomColor: theme.border, borderBottomWidth: 1, color: theme.textPrimary }}>
          <span>LPG Accessories</span>
          <span className="text-xs font-normal" style={{ color: theme.textSecondary }}>
            Daily Sales: ZMW{accessoryTotal.toLocaleString()}
          </span>
        </div>
        <table className="min-w-full text-sm">
          <thead>
            <tr style={{ backgroundColor: theme.background }}>
              {['Product', 'Price', 'Opening', 'Additions', 'Sold', 'Balance', 'Sales Value'].map(h => (
                <th key={h} className="px-3 py-2 text-left text-xs font-medium uppercase"
                  style={{ color: theme.textSecondary }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {accessoryRows.map(row => (
              <tr key={row.product_code} className="hover:bg-surface-bg" style={{ borderTopColor: theme.border, borderTopWidth: 1 }}>
                <td className="px-3 py-2" style={{ color: theme.textPrimary }}>
                  <div className="font-medium">{row.description}</div>
                  <div className="text-xs" style={{ color: theme.textSecondary }}>{row.product_code}</div>
                </td>
                <td className="px-3 py-2 text-right" style={{ color: theme.textSecondary }}>
                  {row.selling_price.toLocaleString()}
                </td>
                <td className="px-3 py-2">
                  <input type="number" min={0} value={row.opening_stock}
                    onChange={e => updateAccessoryField(row.product_code, 'opening_stock', parseInt(e.target.value) || 0)}
                    className="w-16 px-2 py-1 rounded border text-sm text-right" style={inputStyle} />
                </td>
                <td className="px-3 py-2">
                  {canManageStock ? (
                    <input type="number" min={0} value={row.additions}
                      onChange={e => updateAccessoryField(row.product_code, 'additions', parseInt(e.target.value) || 0)}
                      className="w-16 px-2 py-1 rounded border text-sm text-right" style={inputStyle} />
                  ) : (
                    <span className="text-sm" style={{ color: theme.textSecondary }}>{row.additions}</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <input type="number" min={0} value={row.sold}
                    onChange={e => updateAccessoryField(row.product_code, 'sold', parseInt(e.target.value) || 0)}
                    className="w-16 px-2 py-1 rounded border text-sm text-right" style={inputStyle} />
                </td>
                <td className="px-3 py-2 text-right font-medium" style={{
                  color: row.balance < 0 ? 'var(--color-status-error)' : theme.textPrimary
                }}>
                  {row.balance}
                </td>
                <td className="px-3 py-2 text-right" style={{ color: theme.primary }}>
                  {row.sales_value.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Submit */}
      {oversellRows.length > 0 && (
        <div className="mb-4 p-3 rounded text-sm" style={{ backgroundColor: 'rgba(255,165,0,0.1)', color: 'var(--color-status-warning, orange)', border: '1px solid var(--color-status-warning, orange)' }}>
          Warning: {oversellRows.map(r => `${r.size_kg}kg has negative closing stock (${r.balance})`).join('; ')}. Verify counts before submitting.
        </div>
      )}
      {error && (
        <div className="mb-4 p-3 rounded text-sm" style={{ backgroundColor: 'var(--color-status-error-light)', color: 'var(--color-status-error)', border: '1px solid var(--color-status-error)' }}>
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 p-3 rounded text-sm" style={{ backgroundColor: 'var(--color-status-success-light)', color: 'var(--color-status-success)', border: '1px solid var(--color-status-success)' }}>
          {success}
        </div>
      )}
      {!lpgPricesConfigured && (
        <div className="mb-4 p-4 rounded-lg text-sm font-medium" style={{ backgroundColor: 'rgba(239,83,80,0.1)', color: 'var(--color-status-error)', border: '1px solid var(--color-status-error)' }}>
          LPG pricing not configured. {canEditPricing ? 'Set prices in the pricing editor above before recording sales.' : 'Contact the owner or supervisor to set prices before recording sales.'}
        </div>
      )}
      <button
        onClick={handleSubmit}
        disabled={loading || !lpgPricesConfigured}
        className="w-full py-3 rounded-lg font-semibold text-white text-sm disabled:opacity-50"
        style={{ backgroundColor: theme.primary }}>
        {loading ? 'Submitting...' : 'Submit LPG Daily Entry'}
      </button>

      {/* Recent Entries */}
      {entries.length > 0 && (
        <div className="mt-8 rounded-lg shadow overflow-x-auto"
          style={{ backgroundColor: theme.cardBg, borderColor: theme.border, borderWidth: 1 }}>
          <div className="p-4 font-semibold text-sm" style={{ borderBottomColor: theme.border, borderBottomWidth: 1, color: theme.textPrimary }}>
            Entries for {date}
          </div>
          <table className="min-w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: theme.background }}>
                {['Entry ID', 'Shift', 'Salesperson', 'Grand Total', 'Trade Rev.', 'Pop. Diff', 'Time'].map(h => (
                  <th key={h} className="px-4 py-2 text-left text-xs font-medium uppercase"
                    style={{ color: theme.textSecondary }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map((e: any) => (
                <tr key={e.entry_id} className="hover:bg-surface-bg" style={{ borderTopColor: theme.border, borderTopWidth: 1 }}>
                  <td className="px-4 py-2 font-mono text-xs" style={{ color: theme.textPrimary }}>{e.entry_id}</td>
                  <td className="px-4 py-2" style={{ color: theme.textPrimary }}>{e.shift_type}</td>
                  <td className="px-4 py-2" style={{ color: theme.textPrimary }}>{e.salesperson}</td>
                  <td className="px-4 py-2 font-semibold" style={{ color: theme.primary }}>
                    ZMW{(e.grand_total_value || 0).toLocaleString()}
                  </td>
                  <td className="px-4 py-2" style={{
                    color: (e.total_trade_revenue || 0) !== 0 ? theme.primary : theme.textSecondary
                  }}>
                    {(e.total_trade_revenue || 0) !== 0 ? `ZMW${(e.total_trade_revenue || 0).toLocaleString()}` : '-'}
                  </td>
                  <td className="px-4 py-2" style={{
                    color: e.population_difference && e.population_difference !== 0 ? 'var(--color-status-error)' : theme.textSecondary
                  }}>
                    {e.population_difference ?? '-'}
                  </td>
                  <td className="px-4 py-2 text-xs" style={{ color: theme.textSecondary }}>
                    {e.created_at ? new Date(e.created_at).toLocaleTimeString() : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
