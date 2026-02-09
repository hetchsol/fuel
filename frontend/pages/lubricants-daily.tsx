import { useState, useEffect, useMemo } from 'react'
import { useTheme } from '../contexts/ThemeContext'

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000/api/v1'

interface ProductRow {
  product_code: string
  description: string
  category: string
  unit_size: string
  selling_price: number
  opening_stock: number
  additions: number
  sold_or_drawn: number
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

export default function LubricantsDaily() {
  const { theme } = useTheme()
  const [user, setUser] = useState<any>(null)
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [location, setLocation] = useState<'Island 3' | 'Buffer'>('Island 3')
  const [searchTerm, setSearchTerm] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [showOnlyChanged, setShowOnlyChanged] = useState(false)
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set())

  const [productRows, setProductRows] = useState<ProductRow[]>([])
  const [categories, setCategories] = useState<string[]>([])

  // Transfer state
  const [transferMode, setTransferMode] = useState(false)
  const [transferItems, setTransferItems] = useState<Record<string, number>>({})

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [entries, setEntries] = useState<any[]>([])

  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (userData) setUser(JSON.parse(userData))
  }, [])

  // Fetch products for location
  useEffect(() => {
    fetch(`${BASE}/lubricants-daily/products/${encodeURIComponent(location)}`, {
      headers: getAuthHeaders(),
    })
      .then(r => r.json())
      .then(data => {
        setCategories(data.categories || [])
        const products = data.products || []
        // Now fetch previous day to set opening stock
        fetch(`${BASE}/lubricants-daily/previous-day?current_date=${date}&location=${encodeURIComponent(location)}`, {
          headers: getAuthHeaders(),
        })
          .then(r => r.json())
          .then(prevData => {
            const balances = prevData.product_balances || {}
            setProductRows(products.map((p: any) => ({
              product_code: p.product_code,
              description: p.description,
              category: p.category,
              unit_size: p.unit_size || '',
              selling_price: p.selling_price,
              opening_stock: balances[p.product_code]?.balance ?? p.current_stock ?? 0,
              additions: 0,
              sold_or_drawn: 0,
              balance: balances[p.product_code]?.balance ?? p.current_stock ?? 0,
              sales_value: 0,
            })))
          })
          .catch(() => {
            setProductRows(products.map((p: any) => ({
              product_code: p.product_code,
              description: p.description,
              category: p.category,
              unit_size: p.unit_size || '',
              selling_price: p.selling_price,
              opening_stock: p.current_stock || 0,
              additions: 0,
              sold_or_drawn: 0,
              balance: p.current_stock || 0,
              sales_value: 0,
            })))
          })
      })
      .catch(() => {})
  }, [location, date])

  // Fetch entries for display
  useEffect(() => {
    fetch(`${BASE}/lubricants-daily/entries?date=${date}&location=${encodeURIComponent(location)}`, {
      headers: getAuthHeaders(),
    })
      .then(r => r.json())
      .then(data => setEntries(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [date, location, success])

  // Recalculate balances
  useEffect(() => {
    setProductRows(prev => prev.map(row => ({
      ...row,
      balance: row.opening_stock + row.additions - row.sold_or_drawn,
      sales_value: row.selling_price * row.sold_or_drawn,
    })))
  }, [productRows.map(r => `${r.opening_stock}-${r.additions}-${r.sold_or_drawn}`).join(',')])

  const updateField = (code: string, field: string, value: number) => {
    setProductRows(prev => prev.map(row =>
      row.product_code === code ? { ...row, [field]: value } : row
    ))
  }

  // Filter and group
  const filteredRows = useMemo(() => {
    let rows = productRows
    if (searchTerm) {
      const lower = searchTerm.toLowerCase()
      rows = rows.filter(r =>
        r.description.toLowerCase().includes(lower) ||
        r.product_code.toLowerCase().includes(lower)
      )
    }
    if (categoryFilter) {
      rows = rows.filter(r => r.category === categoryFilter)
    }
    if (showOnlyChanged) {
      rows = rows.filter(r => r.additions > 0 || r.sold_or_drawn > 0)
    }
    return rows
  }, [productRows, searchTerm, categoryFilter, showOnlyChanged])

  const groupedRows = useMemo(() => {
    const groups: Record<string, ProductRow[]> = {}
    for (const row of filteredRows) {
      if (!groups[row.category]) groups[row.category] = []
      groups[row.category].push(row)
    }
    return groups
  }, [filteredRows])

  const totalSalesValue = productRows.reduce((s, r) => s + r.sales_value, 0)
  const totalItemsMoved = productRows.reduce((s, r) => s + r.sold_or_drawn, 0)

  const toggleCategory = (cat: string) => {
    setCollapsedCategories(prev => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }

  const handleSubmit = async () => {
    setLoading(true)
    setError('')
    setSuccess('')

    try {
      const res = await fetch(`${BASE}/lubricants-daily/entry`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          date,
          location,
          product_rows: productRows.map(r => ({
            product_code: r.product_code,
            description: r.description,
            category: r.category,
            unit_size: r.unit_size,
            selling_price: r.selling_price,
            opening_stock: r.opening_stock,
            additions: r.additions,
            sold_or_drawn: r.sold_or_drawn,
          })),
          recorded_by: user?.user_id || 'unknown',
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || 'Failed to submit entry')
      }

      setSuccess(`${location} daily entry submitted successfully!`)
    } catch (err: any) {
      setError(err.message || 'Submission failed')
    } finally {
      setLoading(false)
    }
  }

  const handleTransfer = async () => {
    const items = Object.entries(transferItems)
      .filter(([, qty]) => qty > 0)
      .map(([code, qty]) => ({ product_code: code, quantity: qty }))

    if (items.length === 0) {
      setError('No transfer items specified')
      return
    }

    setLoading(true)
    setError('')
    setSuccess('')

    try {
      const res = await fetch(`${BASE}/lubricants-daily/transfer?date=${date}&recorded_by=${user?.user_id || 'unknown'}`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(items),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(typeof err.detail === 'string' ? err.detail : err.detail?.message || 'Transfer failed')
      }

      const data = await res.json()
      setSuccess(data.message || 'Transfer recorded successfully')
      setTransferItems({})
      setTransferMode(false)
    } catch (err: any) {
      setError(err.message || 'Transfer failed')
    } finally {
      setLoading(false)
    }
  }

  const inputStyle = {
    backgroundColor: theme.cardBg,
    color: theme.textPrimary,
    borderColor: theme.border,
  }

  const actionLabel = location === 'Island 3' ? 'Sold' : 'Drawn'

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: theme.textPrimary }}>Lubricants Daily</h1>
        <p className="text-sm mt-1" style={{ color: theme.textSecondary }}>
          Daily stock movement for Island 3 (sales) and Buffer (warehouse)
        </p>
      </div>

      {/* Controls */}
      <div className="rounded-lg shadow p-4 mb-6 space-y-4"
        style={{ backgroundColor: theme.cardBg, borderColor: theme.border, borderWidth: 1 }}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: theme.textSecondary }}>Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="w-full px-3 py-2 rounded border text-sm" style={inputStyle} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: theme.textSecondary }}>Location</label>
            <div className="flex rounded overflow-hidden border" style={{ borderColor: theme.border }}>
              {(['Island 3', 'Buffer'] as const).map(loc => (
                <button key={loc}
                  onClick={() => setLocation(loc)}
                  className="flex-1 px-4 py-2 text-sm font-medium transition-colors"
                  style={{
                    backgroundColor: location === loc ? theme.primary : theme.cardBg,
                    color: location === loc ? '#fff' : theme.textPrimary,
                  }}>
                  {loc}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: theme.textSecondary }}>Category</label>
            <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
              className="w-full px-3 py-2 rounded border text-sm" style={inputStyle}>
              <option value="">All Categories</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <input type="text" placeholder="Search products..."
            value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            className="flex-1 min-w-[200px] px-3 py-2 rounded border text-sm" style={inputStyle} />
          <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: theme.textSecondary }}>
            <input type="checkbox" checked={showOnlyChanged}
              onChange={e => setShowOnlyChanged(e.target.checked)} />
            Show only changed
          </label>
          {location === 'Buffer' && (
            <button
              onClick={() => setTransferMode(!transferMode)}
              className="px-4 py-2 rounded text-sm font-medium"
              style={{
                backgroundColor: transferMode ? '#dc2626' : theme.primary,
                color: '#fff',
              }}>
              {transferMode ? 'Cancel Transfer' : 'Transfer to Island 3'}
            </button>
          )}
        </div>
      </div>

      {/* Summary Bar */}
      <div className="rounded-lg shadow p-4 mb-6 flex flex-wrap gap-6"
        style={{ backgroundColor: theme.cardBg, borderColor: theme.border, borderWidth: 1 }}>
        <div>
          <div className="text-xs" style={{ color: theme.textSecondary }}>Total Sales Value</div>
          <div className="text-lg font-bold" style={{ color: theme.primary }}>
            ZMW{totalSalesValue.toLocaleString()}
          </div>
        </div>
        <div>
          <div className="text-xs" style={{ color: theme.textSecondary }}>Total Items {actionLabel}</div>
          <div className="text-lg font-bold" style={{ color: theme.textPrimary }}>{totalItemsMoved}</div>
        </div>
        <div>
          <div className="text-xs" style={{ color: theme.textSecondary }}>Products Shown</div>
          <div className="text-lg font-bold" style={{ color: theme.textPrimary }}>
            {filteredRows.length} / {productRows.length}
          </div>
        </div>
      </div>

      {/* Product Table grouped by category */}
      {Object.entries(groupedRows).map(([category, rows]) => (
        <div key={category} className="rounded-lg shadow mb-4 overflow-hidden"
          style={{ backgroundColor: theme.cardBg, borderColor: theme.border, borderWidth: 1 }}>
          <button
            onClick={() => toggleCategory(category)}
            className="w-full p-3 flex justify-between items-center text-sm font-semibold"
            style={{ backgroundColor: theme.background, color: theme.textPrimary }}>
            <span>{category} ({rows.length})</span>
            <span>{collapsedCategories.has(category) ? '+' : '-'}</span>
          </button>
          {!collapsedCategories.has(category) && (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: theme.background }}>
                    {['Product', 'Size', 'Price', 'Opening', 'Additions', actionLabel, 'Balance', 'Sales Value',
                      ...(transferMode ? ['Transfer Qty'] : [])
                    ].map(h => (
                      <th key={h} className="px-3 py-2 text-left text-xs font-medium uppercase"
                        style={{ color: theme.textSecondary }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => (
                    <tr key={row.product_code} style={{ borderTopColor: theme.border, borderTopWidth: 1 }}>
                      <td className="px-3 py-2" style={{ color: theme.textPrimary }}>
                        <div className="font-medium text-xs">{row.description}</div>
                        <div className="text-xs" style={{ color: theme.textSecondary }}>{row.product_code}</div>
                      </td>
                      <td className="px-3 py-1 text-xs" style={{ color: theme.textSecondary }}>{row.unit_size}</td>
                      <td className="px-3 py-1 text-right text-xs" style={{ color: theme.textSecondary }}>
                        {row.selling_price.toLocaleString()}
                      </td>
                      <td className="px-3 py-1">
                        <input type="number" min={0} value={row.opening_stock}
                          onChange={e => updateField(row.product_code, 'opening_stock', parseInt(e.target.value) || 0)}
                          className="w-14 px-1 py-1 rounded border text-xs text-right" style={inputStyle} />
                      </td>
                      <td className="px-3 py-1">
                        <input type="number" min={0} value={row.additions}
                          onChange={e => updateField(row.product_code, 'additions', parseInt(e.target.value) || 0)}
                          className="w-14 px-1 py-1 rounded border text-xs text-right" style={inputStyle} />
                      </td>
                      <td className="px-3 py-1">
                        <input type="number" min={0} value={row.sold_or_drawn}
                          onChange={e => updateField(row.product_code, 'sold_or_drawn', parseInt(e.target.value) || 0)}
                          className="w-14 px-1 py-1 rounded border text-xs text-right" style={inputStyle} />
                      </td>
                      <td className="px-3 py-1 text-right text-xs font-medium" style={{
                        color: row.balance < 0 ? '#ef4444' : theme.textPrimary
                      }}>
                        {row.balance}
                      </td>
                      <td className="px-3 py-1 text-right text-xs" style={{ color: theme.primary }}>
                        {row.sales_value > 0 ? row.sales_value.toLocaleString() : '-'}
                      </td>
                      {transferMode && (
                        <td className="px-3 py-1">
                          <input type="number" min={0}
                            value={transferItems[row.product_code] || ''}
                            onChange={e => setTransferItems(prev => ({
                              ...prev,
                              [row.product_code]: parseInt(e.target.value) || 0,
                            }))}
                            className="w-14 px-1 py-1 rounded border text-xs text-right" style={inputStyle} />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}

      {/* Messages */}
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

      {/* Action Buttons */}
      <div className="flex gap-3">
        {transferMode ? (
          <button
            onClick={handleTransfer}
            disabled={loading}
            className="flex-1 py-3 rounded-lg font-semibold text-white text-sm disabled:opacity-50"
            style={{ backgroundColor: '#f59e0b' }}>
            {loading ? 'Transferring...' : `Confirm Transfer to Island 3 (${Object.values(transferItems).filter(v => v > 0).length} items)`}
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1 py-3 rounded-lg font-semibold text-white text-sm disabled:opacity-50"
            style={{ backgroundColor: theme.primary }}>
            {loading ? 'Submitting...' : `Submit ${location} Daily Entry`}
          </button>
        )}
      </div>

      {/* Recent Entries */}
      {entries.length > 0 && (
        <div className="mt-8 rounded-lg shadow overflow-x-auto"
          style={{ backgroundColor: theme.cardBg, borderColor: theme.border, borderWidth: 1 }}>
          <div className="p-4 font-semibold text-sm" style={{ borderBottomColor: theme.border, borderBottomWidth: 1, color: theme.textPrimary }}>
            {location} Entries for {date}
          </div>
          <table className="min-w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: theme.background }}>
                {['Entry ID', 'Location', 'Total Sales', 'Items Moved', 'Time'].map(h => (
                  <th key={h} className="px-4 py-2 text-left text-xs font-medium uppercase"
                    style={{ color: theme.textSecondary }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map((e: any) => (
                <tr key={e.entry_id} style={{ borderTopColor: theme.border, borderTopWidth: 1 }}>
                  <td className="px-4 py-2 font-mono text-xs" style={{ color: theme.textPrimary }}>{e.entry_id}</td>
                  <td className="px-4 py-2" style={{ color: theme.textPrimary }}>{e.location}</td>
                  <td className="px-4 py-2 font-semibold" style={{ color: theme.primary }}>
                    ZMW{(e.total_daily_sales_value || 0).toLocaleString()}
                  </td>
                  <td className="px-4 py-2" style={{ color: theme.textPrimary }}>{e.total_items_moved || 0}</td>
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
