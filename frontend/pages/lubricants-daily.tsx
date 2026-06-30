import { useState, useEffect, useMemo, useCallback } from 'react'
import { useWorkingDay } from '../contexts/WorkingDayContext'
import { getHeaders, authFetch } from '../lib/api'
import toast from 'react-hot-toast'

const BASE = '/api/v1'

interface ProductRow {
  product_code: string
  description: string
  category: string
  unit_size: string
  selling_price: number
  opening_stock: number
  additions: number
  sold_or_drawn: number
  damaged: number
  damage_note: string
  balance: number
  sales_value: number
}

export default function LubricantsDaily() {
  const [user, setUser] = useState<any>(null)
  const { date, setDate } = useWorkingDay()
  const [location, setLocation] = useState<'Island 3' | 'Buffer'>('Island 3')
  const [searchTerm, setSearchTerm] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [showOnlyActive, setShowOnlyActive] = useState(false)
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set())

  const [productRows, setProductRows] = useState<ProductRow[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [entries, setEntries] = useState<any[]>([])

  // Transfer modal
  const [showTransfer, setShowTransfer] = useState(false)
  const [transferItems, setTransferItems] = useState<Record<string, number>>({})
  const [transferSaving, setTransferSaving] = useState(false)

  // Pricing editor modal
  const [showPricingEditor, setShowPricingEditor] = useState(false)
  const [editPrices, setEditPrices] = useState<Record<string, string>>({})
  const [editReorderLevels, setEditReorderLevels] = useState<Record<string, string>>({})
  const [pricingSaving, setPricingSaving] = useState(false)
  const [pricingSearch, setPricingSearch] = useState('')

  useEffect(() => {
    const ud = localStorage.getItem('user')
    if (ud) setUser(JSON.parse(ud))
  }, [])

  const canEditPricing = ['supervisor', 'manager', 'owner'].includes(user?.role)
  const canManage = ['manager', 'owner'].includes(user?.role)
  const pricesConfigured = productRows.some(r => r.selling_price > 0)
  const actionLabel = location === 'Island 3' ? 'Sold' : 'Drawn'

  // Fetch products + previous day balances when location or date changes
  useEffect(() => {
    authFetch(`${BASE}/lubricants-daily/products/${encodeURIComponent(location)}`, {
      headers: { ...getHeaders(), 'Content-Type': 'application/json' },
    })
      .then(r => r.json())
      .then(data => {
        const cats: string[] = data.categories || []
        setCategories(cats)
        setCollapsedCategories(new Set(cats))
        const products: any[] = data.products || []

        authFetch(`${BASE}/lubricants-daily/previous-day?current_date=${date}&location=${encodeURIComponent(location)}`, {
          headers: { ...getHeaders(), 'Content-Type': 'application/json' },
        })
          .then(r => r.json())
          .then(prevData => {
            const balances = prevData.product_balances || {}
            const ep: Record<string, string> = {}
            const er: Record<string, string> = {}
            const rows = products.map((p: any) => {
              ep[p.product_code] = String(p.selling_price || 0)
              er[p.product_code] = String(p.reorder_level || 0)
              const opening = balances[p.product_code]?.balance ?? p.current_stock ?? 0
              return {
                product_code: p.product_code,
                description: p.description,
                category: p.category,
                unit_size: p.unit_size || '',
                selling_price: p.selling_price,
                opening_stock: opening,
                additions: 0,
                sold_or_drawn: 0,
                damaged: 0,
                damage_note: '',
                balance: opening,
                sales_value: 0,
              }
            })
            setProductRows(rows)
            setEditPrices(ep)
            setEditReorderLevels(er)
          })
          .catch(() => {
            const ep: Record<string, string> = {}
            const er: Record<string, string> = {}
            setProductRows(products.map((p: any) => {
              ep[p.product_code] = String(p.selling_price || 0)
              er[p.product_code] = String(p.reorder_level || 0)
              return {
                product_code: p.product_code, description: p.description,
                category: p.category, unit_size: p.unit_size || '',
                selling_price: p.selling_price,
                opening_stock: p.current_stock || 0, additions: 0,
                sold_or_drawn: 0, damaged: 0, damage_note: '',
                balance: p.current_stock || 0, sales_value: 0,
              }
            }))
            setEditPrices(ep)
            setEditReorderLevels(er)
          })
      })
      .catch(() => {})
  }, [location, date])

  // Fetch recent entries
  useEffect(() => {
    authFetch(`${BASE}/lubricants-daily/entries?date=${date}&location=${encodeURIComponent(location)}`, {
      headers: { ...getHeaders(), 'Content-Type': 'application/json' },
    })
      .then(r => r.json())
      .then(data => setEntries(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [date, location])

  // Recalculate balances
  useEffect(() => {
    setProductRows(prev => prev.map(row => ({
      ...row,
      balance: row.opening_stock + row.additions - row.sold_or_drawn - (row.damaged || 0),
      sales_value: row.selling_price * row.sold_or_drawn,
    })))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productRows.map(r => `${r.opening_stock}-${r.additions}-${r.sold_or_drawn}-${r.damaged}`).join(',')])

  const updateField = (code: string, field: string, value: number) =>
    setProductRows(prev => prev.map(r => r.product_code === code ? { ...r, [field]: value } : r))

  const updateFieldStr = (code: string, field: string, value: string) =>
    setProductRows(prev => prev.map(r => r.product_code === code ? { ...r, [field]: value } : r))

  const toggleCategory = (cat: string) =>
    setCollapsedCategories(prev => {
      const next = new Set(prev)
      next.has(cat) ? next.delete(cat) : next.add(cat)
      return next
    })

  // Filtered + grouped rows
  const filteredRows = useMemo(() => {
    let rows = productRows
    if (searchTerm) {
      const q = searchTerm.toLowerCase()
      rows = rows.filter(r => r.description.toLowerCase().includes(q) || r.product_code.toLowerCase().includes(q))
    }
    if (categoryFilter) rows = rows.filter(r => r.category === categoryFilter)
    if (showOnlyActive) rows = rows.filter(r => r.additions > 0 || r.sold_or_drawn > 0 || r.damaged > 0)
    return rows
  }, [productRows, searchTerm, categoryFilter, showOnlyActive])

  const groupedRows = useMemo(() => {
    const groups: Record<string, ProductRow[]> = {}
    for (const row of filteredRows) {
      if (!groups[row.category]) groups[row.category] = []
      groups[row.category].push(row)
    }
    return groups
  }, [filteredRows])

  // Summary
  const totalRevenue = productRows.reduce((s, r) => s + r.sales_value, 0)
  const totalMoved = productRows.reduce((s, r) => s + r.sold_or_drawn, 0)
  const activeCount = productRows.filter(r => r.additions > 0 || r.sold_or_drawn > 0 || r.damaged > 0).length
  const fmt = (v: number) => `K${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  const handleSubmit = async () => {
    setLoading(true)
    try {
      const res = await authFetch(`${BASE}/lubricants-daily/entry`, {
        method: 'POST',
        headers: { ...getHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date, location,
          product_rows: productRows.map(r => ({
            product_code: r.product_code, description: r.description,
            category: r.category, unit_size: r.unit_size,
            selling_price: r.selling_price, opening_stock: r.opening_stock,
            additions: r.additions, sold_or_drawn: r.sold_or_drawn,
            damaged: r.damaged || 0, damage_note: r.damage_note || null,
          })),
          recorded_by: user?.user_id || 'unknown',
        }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Failed') }
      toast.success(`${location} entry submitted`)
      const fresh = await authFetch(`${BASE}/lubricants-daily/entries?date=${date}&location=${encodeURIComponent(location)}`, { headers: { ...getHeaders(), 'Content-Type': 'application/json' } })
      if (fresh.ok) setEntries(await fresh.json())
    } catch (err: any) {
      toast.error(err.message || 'Submission failed')
    } finally {
      setLoading(false)
    }
  }

  const handleTransfer = async () => {
    const items = Object.entries(transferItems)
      .filter(([, qty]) => qty > 0)
      .map(([code, qty]) => ({ product_code: code, quantity: qty }))
    if (items.length === 0) { toast.error('No items to transfer'); return }
    setTransferSaving(true)
    try {
      const res = await authFetch(`${BASE}/lubricants-daily/transfer?date=${date}&recorded_by=${user?.user_id || 'unknown'}`, {
        method: 'POST',
        headers: { ...getHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(items),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(typeof e.detail === 'string' ? e.detail : e.detail?.message || 'Transfer failed') }
      const data = await res.json()
      toast.success(data.message || 'Transfer recorded')
      setTransferItems({})
      setShowTransfer(false)
    } catch (err: any) {
      toast.error(err.message || 'Transfer failed')
    } finally {
      setTransferSaving(false)
    }
  }

  const savePricing = async () => {
    setPricingSaving(true)
    try {
      const items = Object.entries(editPrices).map(([code, price]) => ({
        product_code: code,
        selling_price: parseFloat(price) || 0,
        reorder_level: parseInt(editReorderLevels[code] || '0') || 0,
      }))
      const res = await authFetch(`${BASE}/lubricants-daily/products/pricing`, {
        method: 'PUT',
        headers: { ...getHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(items),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Failed') }
      toast.success('Prices saved')
      setProductRows(prev => prev.map(r => ({
        ...r,
        selling_price: parseFloat(editPrices[r.product_code]) || r.selling_price,
        sales_value: (parseFloat(editPrices[r.product_code]) || r.selling_price) * r.sold_or_drawn,
      })))
      setShowPricingEditor(false)
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setPricingSaving(false)
    }
  }

  const authoriseDamage = async (entryId: string) => {
    try {
      const res = await authFetch(`${BASE}/lubricants-daily/${entryId}/authorise-damage`, {
        method: 'POST', headers: { ...getHeaders(), 'Content-Type': 'application/json' },
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.detail) }
      toast.success('Damage authorised')
      const fresh = await authFetch(`${BASE}/lubricants-daily/entries?date=${date}&location=${encodeURIComponent(location)}`, { headers: { ...getHeaders(), 'Content-Type': 'application/json' } })
      if (fresh.ok) setEntries(await fresh.json())
    } catch (err: any) { toast.error(err.message) }
  }

  const transferCount = Object.values(transferItems).filter(v => v > 0).length

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-content-primary">Lubricants Daily</h1>
        <p className="text-sm text-content-secondary mt-1">Daily stock movement — Island 3 (sales) and Buffer (warehouse)</p>
      </div>

      {/* Controls */}
      <div className="bg-surface-card rounded-lg border border-surface-border p-4 mb-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-content-secondary mb-1">Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="w-full px-3 py-2 rounded border border-surface-border bg-surface-bg text-content-primary text-sm focus:outline-none focus:border-action-primary" />
          </div>
          <div>
            <label className="block text-xs font-medium text-content-secondary mb-1">Location</label>
            <div className="flex rounded-md overflow-hidden border border-surface-border">
              {(['Island 3', 'Buffer'] as const).map(loc => (
                <button key={loc} onClick={() => setLocation(loc)}
                  className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
                    location === loc
                      ? 'bg-action-primary text-white'
                      : 'bg-surface-bg text-content-secondary hover:text-content-primary'
                  }`}>
                  {loc}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-content-secondary mb-1">Category</label>
            <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
              className="w-full px-3 py-2 rounded border border-surface-border bg-surface-bg text-content-primary text-sm focus:outline-none focus:border-action-primary">
              <option value="">All Categories</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <input type="text" placeholder="Search products..."
            value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            className="flex-1 min-w-[180px] px-3 py-2 rounded border border-surface-border bg-surface-bg text-content-primary text-sm focus:outline-none focus:border-action-primary" />
          <label className="flex items-center gap-2 text-sm text-content-secondary cursor-pointer select-none">
            <input type="checkbox" checked={showOnlyActive} onChange={e => setShowOnlyActive(e.target.checked)}
              className="rounded" />
            Show active only
          </label>
          {canEditPricing && (
            <button onClick={() => setShowPricingEditor(true)}
              className="px-3 py-2 text-sm rounded border border-surface-border text-content-secondary hover:text-content-primary hover:border-action-primary transition-colors">
              Edit Prices
            </button>
          )}
          {location === 'Buffer' && (
            <button onClick={() => setShowTransfer(true)}
              className="px-3 py-2 text-sm rounded border border-action-primary text-action-primary hover:bg-action-primary hover:text-white transition-colors font-medium">
              Transfer to Island 3
            </button>
          )}
        </div>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-surface-card rounded-lg border border-surface-border p-4">
          <p className="text-xs text-content-secondary mb-1">Total Revenue</p>
          <p className="text-2xl font-bold text-action-primary">{fmt(totalRevenue)}</p>
        </div>
        <div className="bg-surface-card rounded-lg border border-surface-border p-4">
          <p className="text-xs text-content-secondary mb-1">Units {actionLabel}</p>
          <p className="text-2xl font-bold text-content-primary">{totalMoved}</p>
        </div>
        <div className="bg-surface-card rounded-lg border border-surface-border p-4">
          <p className="text-xs text-content-secondary mb-1">Products with Activity</p>
          <p className="text-2xl font-bold text-content-primary">
            {activeCount}
            <span className="text-sm font-normal text-content-secondary ml-1">/ {productRows.length}</span>
          </p>
        </div>
      </div>

      {!pricesConfigured && (
        <div className="mb-4 p-3 rounded-lg text-sm text-status-error border border-status-error bg-status-error/10">
          Prices not configured. {canEditPricing ? 'Use Edit Prices above.' : 'Ask a manager to set prices before recording sales.'}
        </div>
      )}

      {/* Category accordions */}
      <div className="space-y-3 mb-6">
        {Object.entries(groupedRows).length === 0 && (
          <p className="text-sm text-content-secondary text-center py-8">No products match your filters.</p>
        )}
        {Object.entries(groupedRows).map(([category, rows]) => {
          const catRevenue = rows.reduce((s, r) => s + r.sales_value, 0)
          const catActive = rows.filter(r => r.sold_or_drawn > 0 || r.additions > 0 || r.damaged > 0).length
          const isCollapsed = collapsedCategories.has(category)

          return (
            <div key={category} className="bg-surface-card rounded-lg border border-surface-border overflow-hidden">
              <button onClick={() => toggleCategory(category)}
                className="w-full px-4 py-3 flex items-center justify-between bg-surface-bg hover:bg-action-primary-light transition-colors">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-content-primary">{category}</span>
                  <span className="text-xs text-content-secondary">{rows.length} products</span>
                  {catActive > 0 && (
                    <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-action-primary text-white">
                      {catActive} active
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {catRevenue > 0 && (
                    <span className="text-sm font-semibold text-action-primary">{fmt(catRevenue)}</span>
                  )}
                  <span className="text-content-secondary text-sm">{isCollapsed ? '+' : '-'}</span>
                </div>
              </button>

              {!isCollapsed && (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="bg-surface-bg border-t border-surface-border">
                        {['Product', 'Size', 'Price', 'Opening', 'Additions', actionLabel, 'Damaged', 'Closing', 'Value'].map(h => (
                          <th key={h} className="px-3 py-2 text-left text-xs font-medium uppercase text-content-secondary">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(row => {
                        const hasActivity = row.additions > 0 || row.sold_or_drawn > 0 || row.damaged > 0
                        return (
                          <tr key={row.product_code}
                            className={`border-t border-surface-border ${hasActivity ? 'bg-action-primary-light/30' : 'hover:bg-surface-bg'}`}>
                            <td className="px-3 py-2">
                              <p className="text-xs font-medium text-content-primary">{row.description}</p>
                              <p className="text-[10px] text-content-secondary">{row.product_code}</p>
                            </td>
                            <td className="px-3 py-2 text-xs text-content-secondary whitespace-nowrap">{row.unit_size}</td>
                            <td className="px-3 py-2 text-xs text-right text-content-secondary">{fmt(row.selling_price)}</td>
                            <td className="px-3 py-2">
                              {canEditPricing
                                ? <input type="number" min={0} value={row.opening_stock}
                                    onChange={e => updateField(row.product_code, 'opening_stock', parseInt(e.target.value) || 0)}
                                    className="w-14 px-1.5 py-1 rounded border border-surface-border bg-surface-bg text-content-primary text-xs text-right focus:outline-none focus:border-action-primary" />
                                : <span className="text-xs text-content-primary">{row.opening_stock}</span>}
                            </td>
                            <td className="px-3 py-2">
                              {canEditPricing
                                ? <input type="number" min={0} value={row.additions}
                                    onChange={e => updateField(row.product_code, 'additions', parseInt(e.target.value) || 0)}
                                    className="w-14 px-1.5 py-1 rounded border border-surface-border bg-surface-bg text-content-primary text-xs text-right focus:outline-none focus:border-action-primary" />
                                : <span className="text-xs text-content-secondary">{row.additions}</span>}
                            </td>
                            <td className="px-3 py-2">
                              <input type="number" min={0} value={row.sold_or_drawn}
                                onChange={e => updateField(row.product_code, 'sold_or_drawn', parseInt(e.target.value) || 0)}
                                className="w-14 px-1.5 py-1 rounded border border-surface-border bg-surface-bg text-content-primary text-xs text-right focus:outline-none focus:border-action-primary" />
                            </td>
                            <td className="px-3 py-2">
                              <input type="number" min={0} value={row.damaged || 0}
                                onChange={e => updateField(row.product_code, 'damaged', parseInt(e.target.value) || 0)}
                                className={`w-14 px-1.5 py-1 rounded border bg-surface-bg text-content-primary text-xs text-right focus:outline-none focus:border-action-primary ${
                                  row.damaged > 0 ? 'border-status-warning' : 'border-surface-border'
                                }`} />
                              {row.damaged > 0 && (
                                <input type="text" value={row.damage_note || ''}
                                  onChange={e => updateFieldStr(row.product_code, 'damage_note', e.target.value)}
                                  placeholder="Reason"
                                  className={`mt-1 w-36 px-1.5 py-1 rounded border bg-surface-bg text-content-primary text-[10px] focus:outline-none ${
                                    (row.damage_note || '').trim() ? 'border-surface-border' : 'border-status-error'
                                  }`} />
                              )}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <span className={`text-xs font-medium ${row.balance < 0 ? 'text-status-error' : 'text-content-primary'}`}>
                                {row.balance}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right">
                              <span className={`text-xs font-semibold ${row.sales_value > 0 ? 'text-action-primary' : 'text-content-secondary'}`}>
                                {row.sales_value > 0 ? fmt(row.sales_value) : '-'}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Submit */}
      <button onClick={handleSubmit} disabled={loading || !pricesConfigured}
        className="w-full py-3 rounded-lg font-semibold text-white text-sm bg-action-primary hover:bg-action-primary-hover disabled:opacity-50 transition-colors">
        {loading ? 'Submitting...' : !pricesConfigured ? 'Set prices first' : `Submit ${location} Entry`}
      </button>

      {/* Recent entries */}
      {entries.length > 0 && (
        <div className="mt-8 bg-surface-card rounded-lg border border-surface-border overflow-hidden">
          <div className="px-4 py-3 border-b border-surface-border">
            <h3 className="text-sm font-semibold text-content-primary">{location} entries for {date}</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-surface-bg">
                  {['ID', 'Revenue', 'Units Moved', 'Time', 'Damage'].map(h => (
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
                      <td className="px-4 py-2 font-semibold text-action-primary">{fmt(e.total_daily_sales_value || 0)}</td>
                      <td className="px-4 py-2 text-content-primary">{e.total_items_moved || 0}</td>
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

      {/* Transfer Modal */}
      {showTransfer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-lg shadow-lg bg-surface-card border border-surface-border overflow-hidden max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-surface-border flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-content-primary">Transfer to Island 3</h3>
                <p className="text-xs text-content-secondary mt-0.5">Enter quantities to move from Buffer stock to Island 3</p>
              </div>
              <button onClick={() => { setShowTransfer(false); setTransferItems({}) }}
                className="text-content-secondary hover:text-content-primary text-xl leading-none">&times;</button>
            </div>
            <div className="overflow-y-auto flex-1 p-4">
              <div className="space-y-4">
                {categories.map(cat => {
                  const catRows = productRows.filter(r => r.category === cat)
                  if (catRows.length === 0) return null
                  return (
                    <div key={cat}>
                      <p className="text-xs font-semibold text-content-secondary uppercase tracking-wide mb-2">{cat}</p>
                      <div className="space-y-1">
                        {catRows.map(row => (
                          <div key={row.product_code} className="flex items-center gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-content-primary truncate">{row.description}</p>
                              <p className="text-[10px] text-content-secondary">{row.unit_size} &nbsp;|&nbsp; Stock: {row.balance}</p>
                            </div>
                            <input type="number" min={0} max={row.balance}
                              value={transferItems[row.product_code] || ''}
                              onChange={e => setTransferItems(prev => ({ ...prev, [row.product_code]: parseInt(e.target.value) || 0 }))}
                              placeholder="0"
                              className="w-20 px-2 py-1.5 rounded border border-surface-border bg-surface-bg text-content-primary text-sm text-right focus:outline-none focus:border-action-primary" />
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-surface-border flex justify-end gap-2">
              <button onClick={() => { setShowTransfer(false); setTransferItems({}) }}
                className="px-4 py-2 text-sm rounded border border-surface-border text-content-secondary">Cancel</button>
              <button onClick={handleTransfer} disabled={transferSaving || transferCount === 0}
                className="px-4 py-2 text-sm font-semibold rounded bg-action-primary text-white disabled:opacity-50">
                {transferSaving ? 'Transferring...' : `Transfer ${transferCount > 0 ? `(${transferCount} products)` : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pricing Editor Modal */}
      {showPricingEditor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-lg shadow-lg bg-surface-card border border-surface-border overflow-hidden max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-surface-border flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-content-primary">Edit Prices</h3>
                <p className="text-xs text-content-secondary mt-0.5">Price and reorder level per product</p>
              </div>
              <button onClick={() => setShowPricingEditor(false)}
                className="text-content-secondary hover:text-content-primary text-xl leading-none">&times;</button>
            </div>
            <div className="px-4 py-3 border-b border-surface-border">
              <input type="text" placeholder="Search products..."
                value={pricingSearch} onChange={e => setPricingSearch(e.target.value)}
                className="w-full px-3 py-2 rounded border border-surface-border bg-surface-bg text-content-primary text-sm focus:outline-none focus:border-action-primary" />
            </div>
            <div className="overflow-y-auto flex-1 p-4">
              <div className="space-y-4">
                {categories.map(cat => {
                  const catProducts = productRows.filter(r => r.category === cat &&
                    (!pricingSearch || r.description.toLowerCase().includes(pricingSearch.toLowerCase()) || r.product_code.toLowerCase().includes(pricingSearch.toLowerCase()))
                  )
                  if (catProducts.length === 0) return null
                  return (
                    <div key={cat}>
                      <p className="text-xs font-semibold text-content-secondary uppercase tracking-wide mb-2">{cat}</p>
                      <div className="space-y-1.5">
                        {catProducts.map(p => (
                          <div key={p.product_code} className="flex items-center gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-content-primary truncate">{p.description}</p>
                              <p className="text-[10px] text-content-secondary">{p.unit_size}</p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <span className="text-xs text-content-secondary">K</span>
                              <input type="number" min={0} step={1}
                                value={editPrices[p.product_code] || '0'}
                                onChange={e => setEditPrices(prev => ({ ...prev, [p.product_code]: e.target.value }))}
                                className="w-20 px-1.5 py-1 rounded border border-surface-border bg-surface-bg text-content-primary text-xs text-right focus:outline-none focus:border-action-primary" />
                            </div>
                            <div className="flex items-center gap-1 shrink-0" title="Reorder level">
                              <span className="text-xs text-content-secondary">R/L</span>
                              <input type="number" min={0} step={1}
                                value={editReorderLevels[p.product_code] || '0'}
                                onChange={e => setEditReorderLevels(prev => ({ ...prev, [p.product_code]: e.target.value }))}
                                className="w-14 px-1.5 py-1 rounded border border-surface-border bg-surface-bg text-content-primary text-xs text-right focus:outline-none focus:border-action-primary" />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-surface-border flex justify-end gap-2">
              <button onClick={() => setShowPricingEditor(false)}
                className="px-4 py-2 text-sm rounded border border-surface-border text-content-secondary">Cancel</button>
              <button onClick={savePricing} disabled={pricingSaving}
                className="px-4 py-2 text-sm font-semibold rounded bg-action-primary text-white disabled:opacity-50">
                {pricingSaving ? 'Saving...' : 'Save All Prices'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
