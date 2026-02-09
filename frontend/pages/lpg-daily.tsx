import { useState, useEffect, useCallback } from 'react'
import { useTheme } from '../contexts/ThemeContext'

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000/api/v1'
const LPG_SIZES = [3, 6, 9, 19, 45, 48]

interface CylinderRow {
  size_kg: number
  opening_balance: number
  receipts: number
  sold_refill: number
  sold_with_cylinder: number
  balance: number
  value_refill: number
  value_with_cylinder: number
  total_value: number
}

interface Pricing {
  size_kg: number
  price_refill: number
  deposit: number
  price_with_cylinder: number
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
  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

export default function LPGDaily() {
  const { theme } = useTheme()
  const [user, setUser] = useState<any>(null)
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [shiftType, setShiftType] = useState('Day')
  const [salesperson, setSalesperson] = useState('')

  const [pricing, setPricing] = useState<Pricing[]>([])
  const [cylinderRows, setCylinderRows] = useState<CylinderRow[]>(
    LPG_SIZES.map(s => ({
      size_kg: s, opening_balance: 0, receipts: 0,
      sold_refill: 0, sold_with_cylinder: 0,
      balance: 0, value_refill: 0, value_with_cylinder: 0, total_value: 0,
    }))
  )

  const [bookPopulation, setBookPopulation] = useState<string>('')
  const [actualPopulation, setActualPopulation] = useState<string>('')

  // Accessories
  const [accessoryRows, setAccessoryRows] = useState<AccessoryRow[]>([])

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [entries, setEntries] = useState<any[]>([])

  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (userData) setUser(JSON.parse(userData))
  }, [])

  // Fetch pricing on mount
  useEffect(() => {
    fetch(`${BASE}/lpg-daily/pricing`, { headers: getAuthHeaders() })
      .then(r => r.json())
      .then(data => setPricing(data.sizes || []))
      .catch(() => {})
  }, [])

  // Fetch previous shift data when date/shift changes
  const fetchPreviousShift = useCallback(() => {
    fetch(`${BASE}/lpg-daily/previous-shift?current_date=${date}&shift_type=${shiftType}`, {
      headers: getAuthHeaders(),
    })
      .then(r => r.json())
      .then(data => {
        if (data.found && data.cylinder_balances) {
          setCylinderRows(prev => prev.map(row => ({
            ...row,
            opening_balance: data.cylinder_balances[row.size_kg] ?? row.opening_balance,
          })))
        }
      })
      .catch(() => {})
  }, [date, shiftType])

  useEffect(() => { fetchPreviousShift() }, [fetchPreviousShift])

  // Fetch previous day accessories
  useEffect(() => {
    fetch(`${BASE}/lpg-daily/accessories/previous-day?current_date=${date}`, {
      headers: getAuthHeaders(),
    })
      .then(r => r.json())
      .then(data => {
        const defaults = data.default_products || []
        const balances = data.product_balances || {}
        setAccessoryRows(defaults.map((p: any) => ({
          product_code: p.product_code,
          description: p.description,
          selling_price: p.selling_price,
          opening_stock: balances[p.product_code]?.balance ?? 0,
          additions: 0,
          sold: 0,
          balance: balances[p.product_code]?.balance ?? 0,
          sales_value: 0,
        })))
      })
      .catch(() => {})
  }, [date])

  // Fetch existing entries
  useEffect(() => {
    fetch(`${BASE}/lpg-daily/entries?date=${date}`, { headers: getAuthHeaders() })
      .then(r => r.json())
      .then(data => setEntries(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [date, success])

  // Recalculate balances and values in real-time
  useEffect(() => {
    if (pricing.length === 0) return
    setCylinderRows(prev => prev.map(row => {
      const p = pricing.find(pr => pr.size_kg === row.size_kg)
      if (!p) return row
      const balance = row.opening_balance + row.receipts - row.sold_refill - row.sold_with_cylinder
      const value_refill = p.price_refill * row.sold_refill
      const value_with_cylinder = p.price_with_cylinder * row.sold_with_cylinder
      return {
        ...row,
        balance,
        value_refill,
        value_with_cylinder,
        total_value: value_refill + value_with_cylinder,
      }
    }))
  }, [pricing, cylinderRows.map(r => `${r.opening_balance}-${r.receipts}-${r.sold_refill}-${r.sold_with_cylinder}`).join(',')])

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

  const grandTotal = cylinderRows.reduce((s, r) => s + r.total_value, 0)
  const accessoryTotal = accessoryRows.reduce((s, r) => s + r.sales_value, 0)

  const popDifference = bookPopulation && actualPopulation
    ? parseInt(bookPopulation) - parseInt(actualPopulation)
    : null

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
      const cylRes = await fetch(`${BASE}/lpg-daily/entry`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          date,
          shift_type: shiftType,
          salesperson,
          cylinder_rows: cylinderRows.map(r => ({
            size_kg: r.size_kg,
            opening_balance: r.opening_balance,
            receipts: r.receipts,
            sold_refill: r.sold_refill,
            sold_with_cylinder: r.sold_with_cylinder,
          })),
          book_cylinder_population: bookPopulation ? parseInt(bookPopulation) : null,
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
        const accRes = await fetch(`${BASE}/lpg-daily/accessories/entry`, {
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
    } catch (err: any) {
      setError(err.message || 'Submission failed')
    } finally {
      setLoading(false)
    }
  }

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

      {/* Cylinder Sales Table */}
      <div className="rounded-lg shadow mb-6 overflow-x-auto"
        style={{ backgroundColor: theme.cardBg, borderColor: theme.border, borderWidth: 1 }}>
        <div className="p-4 font-semibold text-sm" style={{ borderBottomColor: theme.border, borderBottomWidth: 1, color: theme.textPrimary }}>
          Cylinder Sales
        </div>
        <table className="min-w-full text-sm">
          <thead>
            <tr style={{ backgroundColor: theme.background }}>
              {['Size (kg)', 'Opening', 'Receipts', 'Sold Refill', 'Sold w/Cyl', 'Balance', 'Value Refill', 'Value w/Cyl', 'Total Value'].map(h => (
                <th key={h} className="px-3 py-2 text-left text-xs font-medium uppercase"
                  style={{ color: theme.textSecondary }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cylinderRows.map(row => {
              const p = pricing.find(pr => pr.size_kg === row.size_kg)
              return (
                <tr key={row.size_kg} style={{ borderTopColor: theme.border, borderTopWidth: 1 }}>
                  <td className="px-3 py-2 font-medium" style={{ color: theme.textPrimary }}>
                    {row.size_kg} kg
                    {p && <span className="block text-xs" style={{ color: theme.textSecondary }}>
                      Refill: {p.price_refill.toLocaleString()} | w/Cyl: {p.price_with_cylinder.toLocaleString()}
                    </span>}
                  </td>
                  <td className="px-3 py-2">
                    <input type="number" min={0} value={row.opening_balance}
                      onChange={e => updateCylinderField(row.size_kg, 'opening_balance', parseInt(e.target.value) || 0)}
                      className="w-20 px-2 py-1 rounded border text-sm text-right" style={inputStyle} />
                  </td>
                  <td className="px-3 py-2">
                    <input type="number" min={0} value={row.receipts}
                      onChange={e => updateCylinderField(row.size_kg, 'receipts', parseInt(e.target.value) || 0)}
                      className="w-20 px-2 py-1 rounded border text-sm text-right" style={inputStyle} />
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
                    color: row.balance < 0 ? '#ef4444' : theme.textPrimary
                  }}>
                    {row.balance}
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
              <td colSpan={5} className="px-3 py-2 text-right font-bold text-sm" style={{ color: theme.textPrimary }}>
                Grand Total
              </td>
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
                KES {grandTotal.toLocaleString()}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Cylinder Population */}
      <div className="rounded-lg shadow p-4 mb-6 grid grid-cols-1 md:grid-cols-3 gap-4"
        style={{ backgroundColor: theme.cardBg, borderColor: theme.border, borderWidth: 1 }}>
        <div className="col-span-full text-sm font-semibold mb-1" style={{ color: theme.textPrimary }}>
          Cylinder Population Count
        </div>
        <div>
          <label className="block text-xs mb-1" style={{ color: theme.textSecondary }}>Book Count</label>
          <input type="number" min={0} value={bookPopulation}
            onChange={e => setBookPopulation(e.target.value)}
            className="w-full px-3 py-2 rounded border text-sm" style={inputStyle} />
        </div>
        <div>
          <label className="block text-xs mb-1" style={{ color: theme.textSecondary }}>Actual Count</label>
          <input type="number" min={0} value={actualPopulation}
            onChange={e => setActualPopulation(e.target.value)}
            className="w-full px-3 py-2 rounded border text-sm" style={inputStyle} />
        </div>
        <div>
          <label className="block text-xs mb-1" style={{ color: theme.textSecondary }}>Difference</label>
          <div className="px-3 py-2 rounded text-sm font-semibold"
            style={{
              backgroundColor: theme.background,
              color: popDifference !== null && popDifference !== 0 ? '#ef4444' : theme.textPrimary,
            }}>
            {popDifference !== null ? popDifference : '-'}
          </div>
        </div>
      </div>

      {/* LPG Accessories */}
      <div className="rounded-lg shadow mb-6 overflow-x-auto"
        style={{ backgroundColor: theme.cardBg, borderColor: theme.border, borderWidth: 1 }}>
        <div className="p-4 font-semibold text-sm flex justify-between items-center"
          style={{ borderBottomColor: theme.border, borderBottomWidth: 1, color: theme.textPrimary }}>
          <span>LPG Accessories</span>
          <span className="text-xs font-normal" style={{ color: theme.textSecondary }}>
            Daily Sales: KES {accessoryTotal.toLocaleString()}
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
              <tr key={row.product_code} style={{ borderTopColor: theme.border, borderTopWidth: 1 }}>
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
                  <input type="number" min={0} value={row.additions}
                    onChange={e => updateAccessoryField(row.product_code, 'additions', parseInt(e.target.value) || 0)}
                    className="w-16 px-2 py-1 rounded border text-sm text-right" style={inputStyle} />
                </td>
                <td className="px-3 py-2">
                  <input type="number" min={0} value={row.sold}
                    onChange={e => updateAccessoryField(row.product_code, 'sold', parseInt(e.target.value) || 0)}
                    className="w-16 px-2 py-1 rounded border text-sm text-right" style={inputStyle} />
                </td>
                <td className="px-3 py-2 text-right font-medium" style={{
                  color: row.balance < 0 ? '#ef4444' : theme.textPrimary
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
      {error && (
        <div className="mb-4 p-3 rounded text-sm" style={{ backgroundColor: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }}>
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 p-3 rounded text-sm" style={{ backgroundColor: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' }}>
          {success}
        </div>
      )}
      <button
        onClick={handleSubmit}
        disabled={loading}
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
                {['Entry ID', 'Shift', 'Salesperson', 'Grand Total', 'Pop. Diff', 'Time'].map(h => (
                  <th key={h} className="px-4 py-2 text-left text-xs font-medium uppercase"
                    style={{ color: theme.textSecondary }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map((e: any) => (
                <tr key={e.entry_id} style={{ borderTopColor: theme.border, borderTopWidth: 1 }}>
                  <td className="px-4 py-2 font-mono text-xs" style={{ color: theme.textPrimary }}>{e.entry_id}</td>
                  <td className="px-4 py-2" style={{ color: theme.textPrimary }}>{e.shift_type}</td>
                  <td className="px-4 py-2" style={{ color: theme.textPrimary }}>{e.salesperson}</td>
                  <td className="px-4 py-2 font-semibold" style={{ color: theme.primary }}>
                    KES {(e.grand_total_value || 0).toLocaleString()}
                  </td>
                  <td className="px-4 py-2" style={{
                    color: e.population_difference && e.population_difference !== 0 ? '#ef4444' : theme.textSecondary
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
