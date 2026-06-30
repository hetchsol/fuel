import { useState, useEffect, useCallback } from 'react'
import { useWorkingDay } from '../contexts/WorkingDayContext'
import { getHeaders, authFetch } from '../lib/api'
import toast from 'react-hot-toast'

const BASE = '/api/v1'

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

export default function AccessoriesDaily() {
  const [user, setUser] = useState<any>(null)
  const { date, setDate } = useWorkingDay()
  const [rows, setRows] = useState<AccessoryRow[]>([])
  const [loading, setLoading] = useState(false)
  const [entries, setEntries] = useState<any[]>([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    const ud = localStorage.getItem('user')
    if (ud) setUser(JSON.parse(ud))
  }, [])

  const canManageStock = ['supervisor', 'manager', 'owner'].includes(user?.role)
  const canManage = ['manager', 'owner'].includes(user?.role)
  const pricesConfigured = rows.some(r => r.selling_price > 0)

  const fetchRows = useCallback(() => {
    Promise.all([
      authFetch(`${BASE}/lpg-daily/accessories/pricing`, { headers: { ...getHeaders(), 'Content-Type': 'application/json' } })
        .then(r => r.ok ? r.json() : []),
      authFetch(`${BASE}/lpg-daily/accessories/previous-day?current_date=${date}`, { headers: { ...getHeaders(), 'Content-Type': 'application/json' } })
        .then(r => r.ok ? r.json() : {} as any),
    ]).then(([catalog, prevData]: [any[], any]) => {
      const products = catalog.length > 0 ? catalog : (prevData.default_products || [])
      const balances = prevData.product_balances || {}
      setRows(products.map((p: any) => {
        const opening = balances[p.product_code]?.balance ?? 0
        return {
          product_code: p.product_code,
          description: p.description,
          selling_price: p.selling_price || 0,
          opening_stock: opening,
          additions: 0,
          sold: 0,
          damaged: 0,
          damage_note: '',
          balance: opening,
          sales_value: 0,
        }
      }))
    }).catch(() => {})
  }, [date])

  useEffect(() => { fetchRows() }, [fetchRows])

  const fetchEntries = useCallback(() => {
    authFetch(`${BASE}/lpg-daily/accessories/entries?date=${date}`, { headers: { ...getHeaders(), 'Content-Type': 'application/json' } })
      .then(r => r.ok ? r.json() : [])
      .then(data => setEntries(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [date])

  useEffect(() => { fetchEntries() }, [fetchEntries])

  // Recalculate balances and values reactively
  useEffect(() => {
    setRows(prev => prev.map(r => ({
      ...r,
      balance: r.opening_stock + r.additions - r.sold - (r.damaged || 0),
      sales_value: r.selling_price * r.sold,
    })))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.map(r => `${r.opening_stock}-${r.additions}-${r.sold}-${r.damaged}`).join(',')])

  const updateField = (code: string, field: string, value: number) =>
    setRows(prev => prev.map(r => r.product_code === code ? { ...r, [field]: value } : r))

  const updateFieldStr = (code: string, field: string, value: string) =>
    setRows(prev => prev.map(r => r.product_code === code ? { ...r, [field]: value } : r))

  const handleSubmit = async () => {
    setLoading(true)
    try {
      const res = await authFetch(`${BASE}/lpg-daily/accessories/entry`, {
        method: 'POST',
        headers: { ...getHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          product_rows: rows.map(r => ({
            product_code: r.product_code,
            description: r.description,
            selling_price: r.selling_price,
            opening_stock: r.opening_stock,
            additions: r.additions,
            sold: r.sold,
            damaged: r.damaged || 0,
            damage_note: r.damage_note || null,
          })),
          recorded_by: user?.user_id || 'unknown',
        }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Failed') }
      toast.success('Accessories entry submitted')
      fetchEntries()
    } catch (err: any) {
      toast.error(err.message || 'Submission failed')
    } finally {
      setLoading(false)
    }
  }

  const authoriseDamage = async (entryId: string) => {
    try {
      const res = await authFetch(`${BASE}/lpg-daily/accessories/${entryId}/authorise-damage`, {
        method: 'POST', headers: { ...getHeaders(), 'Content-Type': 'application/json' },
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.detail) }
      toast.success('Damage authorised')
      fetchEntries()
    } catch (err: any) { toast.error(err.message) }
  }

  // Filtered rows
  const q = search.toLowerCase()
  const visible = rows.filter(r =>
    !q ||
    r.description.toLowerCase().includes(q) ||
    r.product_code.toLowerCase().includes(q)
  )

  // Summary
  const totalRevenue = rows.reduce((s, r) => s + r.sales_value, 0)
  const totalSold = rows.reduce((s, r) => s + r.sold, 0)
  const activeCount = rows.filter(r => r.additions > 0 || r.sold > 0 || r.damaged > 0).length

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-content-primary">Accessories Daily</h1>
        <p className="text-sm text-content-secondary mt-1">Daily LPG accessories sales — regulators, hoses, valves</p>
      </div>

      {/* Controls */}
      <div className="bg-surface-card rounded-lg border border-surface-border p-4 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-xs font-medium text-content-secondary mb-1">Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="w-full px-3 py-2 rounded border border-surface-border bg-surface-bg text-content-primary text-sm focus:outline-none focus:border-action-primary" />
          </div>
          <div className="flex items-end">
            <input type="text" placeholder="Search products..."
              value={search} onChange={e => setSearch(e.target.value)}
              className="w-full px-3 py-2 rounded border border-surface-border bg-surface-bg text-content-primary text-sm focus:outline-none focus:border-action-primary" />
          </div>
        </div>
        {!pricesConfigured && rows.length > 0 && (
          <p className="text-xs text-content-secondary">
            No prices set. Update prices in{' '}
            <a href="/stores" className="text-action-primary underline">Stock Management</a> under LPG Accessories.
          </p>
        )}
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-surface-card rounded-lg border border-surface-border p-4">
          <p className="text-xs text-content-secondary mb-1">Total Revenue</p>
          <p className="text-2xl font-bold text-action-primary">{fmt(totalRevenue)}</p>
        </div>
        <div className="bg-surface-card rounded-lg border border-surface-border p-4">
          <p className="text-xs text-content-secondary mb-1">Units Sold</p>
          <p className="text-2xl font-bold text-content-primary">{totalSold}</p>
        </div>
        <div className="bg-surface-card rounded-lg border border-surface-border p-4">
          <p className="text-xs text-content-secondary mb-1">Products with Activity</p>
          <p className="text-2xl font-bold text-content-primary">
            {activeCount}
            <span className="text-sm font-normal text-content-secondary ml-1">/ {rows.length}</span>
          </p>
        </div>
      </div>

      {/* Products table */}
      <div className="bg-surface-card rounded-lg border border-surface-border overflow-hidden mb-6">
        {rows.length === 0 ? (
          <p className="px-4 py-8 text-sm text-content-secondary text-center">
            No accessories in catalog. Add items in{' '}
            <a href="/stores" className="text-action-primary underline">Stock Management</a>.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-surface-bg border-b border-surface-border">
                  {['Product', 'Price', 'Opening', 'Additions', 'Sold', 'Damaged', 'Closing', 'Value'].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-medium uppercase text-content-secondary">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map(row => {
                  const hasActivity = row.additions > 0 || row.sold > 0 || row.damaged > 0
                  return (
                    <tr key={row.product_code}
                      className={`border-t border-surface-border ${hasActivity ? 'bg-action-primary-light/30' : 'hover:bg-surface-bg'}`}>
                      <td className="px-3 py-2">
                        <p className="text-sm font-medium text-content-primary">{row.description}</p>
                        <p className="text-[10px] text-content-secondary">{row.product_code}</p>
                      </td>
                      <td className="px-3 py-2 text-right text-xs text-content-secondary whitespace-nowrap">
                        {row.selling_price > 0 ? fmt(row.selling_price) : '—'}
                      </td>
                      <td className="px-3 py-2">
                        {canManageStock
                          ? <input type="number" min={0} value={row.opening_stock}
                              onChange={e => updateField(row.product_code, 'opening_stock', parseInt(e.target.value) || 0)}
                              className="w-14 px-1.5 py-1 rounded border border-surface-border bg-surface-bg text-content-primary text-xs text-right focus:outline-none focus:border-action-primary" />
                          : <span className="text-xs text-content-primary">{row.opening_stock}</span>}
                      </td>
                      <td className="px-3 py-2">
                        {canManageStock
                          ? <input type="number" min={0} value={row.additions}
                              onChange={e => updateField(row.product_code, 'additions', parseInt(e.target.value) || 0)}
                              className="w-14 px-1.5 py-1 rounded border border-surface-border bg-surface-bg text-content-primary text-xs text-right focus:outline-none focus:border-action-primary" />
                          : <span className="text-xs text-content-secondary">{row.additions}</span>}
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" min={0} value={row.sold}
                          onChange={e => updateField(row.product_code, 'sold', parseInt(e.target.value) || 0)}
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
                          {row.sales_value > 0 ? fmt(row.sales_value) : '—'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
                {visible.length === 0 && rows.length > 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-sm text-content-secondary">
                      No products match your search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Submit */}
      <button onClick={handleSubmit} disabled={loading || rows.length === 0}
        className="w-full py-3 rounded-lg font-semibold text-white text-sm bg-action-primary hover:bg-action-primary-hover disabled:opacity-50 transition-colors">
        {loading ? 'Submitting...' : 'Submit Accessories Entry'}
      </button>

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
                  {['ID', 'Revenue', 'Units Sold', 'Time', 'Damage'].map(h => (
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
                      <td className="px-4 py-2 font-semibold text-action-primary">{fmt(e.total_accessories_value || 0)}</td>
                      <td className="px-4 py-2 text-content-primary">{e.total_items_sold || 0}</td>
                      <td className="px-4 py-2 text-xs text-content-secondary">
                        {e.created_at ? new Date(e.created_at).toLocaleTimeString() : '—'}
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
