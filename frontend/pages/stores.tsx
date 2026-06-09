import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/router'
import toast from 'react-hot-toast'
import LoadingSpinner from '../components/LoadingSpinner'
import { getHeaders, authFetch } from '../lib/api'

const BASE = '/api/v1'
const fmtZMW = (v: number) => `K${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

type Tab = 'lubricants' | 'cylinders' | 'accessories' | 'movements'
type StockAction = 'receive' | 'issue' | 'damage' | 'adjust'
type Bin = 'stores' | 'forecourt'

interface StockItem {
  item_key: string; category: string; product_code: string; name: string
  unit: string; stores: number; forecourt: number; reorder_level: number; needs_reorder?: boolean
}
interface LubRow {
  product_code: string; description: string; sub_category: string; unit_size: string
  selling_price: number; reorder_level: number; stores: number; forecourt: number
  item_key: string; needs_reorder: boolean; in_catalog: boolean
}
interface AccRow {
  product_code: string; description: string; selling_price: number; reorder_level: number
  stores: number; forecourt: number; item_key: string; needs_reorder: boolean; in_catalog: boolean
}
interface CylRow {
  size_kg: number; price_refill: number; price_full_cylinder: number
  full_stores: number; full_forecourt: number; empty_stores: number; empty_forecourt: number
}
interface Movement {
  timestamp: string; type: string; item_key: string; name: string; category: string
  qty: number; from_bin: string | null; to_bin: string | null; performed_by: string; note: string
}

const LPG_SIZES = [3, 6, 9, 19, 45, 48]
const LUB_CATS = ['Engine Oil', 'Gear Oil', 'Transmission Fluid', 'Hydraulic Fluid',
                  'Brake Fluid', 'Coolant', 'Grease', 'Filters', 'Other']

const UOM_OPTIONS: { group: string; units: { code: string; label: string }[] }[] = [
  { group: 'Volume', units: [
    { code: 'mL', label: 'mL — Millilitre' },
    { code: 'L',  label: 'L — Litre' },
    { code: 'fl oz', label: 'fl oz — Fluid ounce' },
    { code: 'pt', label: 'pt — Pint' },
    { code: 'qt', label: 'qt — Quart' },
    { code: 'gal', label: 'gal — Gallon' },
  ]},
  { group: 'Mass / Weight', units: [
    { code: 'mg', label: 'mg — Milligram' },
    { code: 'g',  label: 'g — Gram' },
    { code: 'kg', label: 'kg — Kilogram' },
    { code: 't',  label: 't — Tonne' },
    { code: 'oz', label: 'oz — Ounce' },
    { code: 'lb', label: 'lb — Pound' },
    { code: 'st', label: 'st — Stone' },
  ]},
  { group: 'Gas', units: [
    { code: 'm³',  label: 'm³ — Cubic metre' },
    { code: 'ft³', label: 'ft³ — Cubic foot' },
  ]},
  { group: 'Length', units: [
    { code: 'mm', label: 'mm — Millimetre' },
    { code: 'cm', label: 'cm — Centimetre' },
    { code: 'm',  label: 'm — Metre' },
    { code: 'in', label: 'in — Inch' },
    { code: 'ft', label: 'ft — Foot' },
    { code: 'yd', label: 'yd — Yard' },
  ]},
  { group: 'Count / Packaging', units: [
    { code: 'ea',   label: 'ea — Each' },
    { code: 'pr',   label: 'pr — Pair' },
    { code: 'dz',   label: 'dz — Dozen' },
    { code: 'set',  label: 'set — Set' },
    { code: 'pk',   label: 'pk — Pack' },
    { code: 'bx',   label: 'bx — Box' },
    { code: 'ctn',  label: 'ctn — Carton' },
    { code: 'roll', label: 'roll — Roll' },
  ]},
]

export default function StoresDashboard() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('lubricants')
  const [loading, setLoading] = useState(true)

  const [stockItems, setStockItems] = useState<StockItem[]>([])
  const [lubCatalog, setLubCatalog] = useState<any[]>([])
  const [accCatalog, setAccCatalog] = useState<any[]>([])
  const [cylPricing, setCylPricing] = useState<Record<string, any>>({})
  const [allMovements, setAllMovements] = useState<Movement[]>([])

  const [itemModal, setItemModal] = useState<{ type: 'lubricant' | 'accessory'; item: LubRow | AccRow | null } | null>(null)
  const [stockModal, setStockModal] = useState<{ item_key: string; name: string; stores: number; forecourt: number } | null>(null)
  const [cylModal, setCylModal] = useState<CylRow | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ item_key: string; name: string } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (!userData) { router.push('/login'); return }
    const user = JSON.parse(userData)
    if (!['manager', 'owner'].includes(user.role)) router.push('/')
  }, [router])

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [dashR, lubR, accR, cylR, movR] = await Promise.all([
        authFetch(`${BASE}/stores/dashboard`, { headers: getHeaders() }),
        authFetch(`${BASE}/lubricants-daily/products/pricing`, { headers: getHeaders() }),
        authFetch(`${BASE}/lpg-daily/accessories/pricing`, { headers: getHeaders() }),
        authFetch(`${BASE}/lpg-daily/pricing`, { headers: getHeaders() }),
        authFetch(`${BASE}/stores/movements?limit=300`, { headers: getHeaders() }),
      ])
      const [dash, lubs, accs, cyls, movs] = await Promise.all([
        dashR.json(), lubR.json(), accR.json(), cylR.json(), movR.json()
      ])
      setStockItems(dash.items || [])
      setLubCatalog(Array.isArray(lubs) ? lubs : [])
      setAccCatalog(Array.isArray(accs) ? accs : [])
      setCylPricing(cyls.prices || {})
      setAllMovements(Array.isArray(movs) ? movs : [])
    } catch {
      toast.error('Failed to load stock data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const lubricants: LubRow[] = lubCatalog.map((cat: any) => {
    const itemKey = `lubricant:${cat.product_code}`
    const si = stockItems.find(i => i.item_key === itemKey)
    return {
      product_code: cat.product_code, description: cat.description,
      sub_category: cat.category || 'Other', unit_size: cat.unit_size || '',
      selling_price: cat.selling_price || 0, reorder_level: cat.reorder_level || si?.reorder_level || 0,
      stores: si?.stores || 0, forecourt: si?.forecourt || 0,
      item_key: itemKey, needs_reorder: si?.needs_reorder || false, in_catalog: !!si,
    }
  })

  const accessories: AccRow[] = accCatalog.map((cat: any) => {
    const itemKey = `lpg_accessory:${cat.product_code}`
    const si = stockItems.find(i => i.item_key === itemKey)
    return {
      product_code: cat.product_code, description: cat.description,
      selling_price: cat.selling_price || 0, reorder_level: cat.reorder_level || si?.reorder_level || 0,
      stores: si?.stores || 0, forecourt: si?.forecourt || 0,
      item_key: itemKey, needs_reorder: si?.needs_reorder || false, in_catalog: !!si,
    }
  })

  const cylinders: CylRow[] = LPG_SIZES.map(size => {
    const pricing = cylPricing[String(size)] || {}
    const fullSI = stockItems.find(i => i.item_key === `cylinder_full:${size}kg`)
    const emptySI = stockItems.find(i => i.item_key === `cylinder_empty:${size}kg`)
    return {
      size_kg: size,
      price_refill: pricing.price_refill || 0,
      price_full_cylinder: pricing.price_full_cylinder || 0,
      full_stores: fullSI?.stores || 0, full_forecourt: fullSI?.forecourt || 0,
      empty_stores: emptySI?.stores || 0, empty_forecourt: emptySI?.forecourt || 0,
    }
  })

  const handleDelete = async () => {
    if (!deleteTarget) return
    setBusy(true)
    try {
      const res = await authFetch(`${BASE}/stores/items/${encodeURIComponent(deleteTarget.item_key)}`,
        { method: 'DELETE', headers: getHeaders() })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Delete failed')
      toast.success(`${deleteTarget.name} removed from catalog.`)
      setDeleteTarget(null)
      fetchAll()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  const seedCatalog = async () => {
    setBusy(true)
    try {
      const res = await authFetch(`${BASE}/stores/seed-catalog`, { method: 'POST', headers: getHeaders() })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Seed failed')
      toast.success(`Catalog synced — ${data.items_seeded} stock item(s) created.`)
      fetchAll()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <LoadingSpinner fullPage text="Loading stock management..." />

  const TABS: { key: Tab; label: string }[] = [
    { key: 'lubricants', label: 'Lubricants' },
    { key: 'cylinders', label: 'LPG Cylinders' },
    { key: 'accessories', label: 'LPG Accessories' },
    { key: 'movements', label: 'Movement Log' },
  ]

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-content-primary">Stock Management</h1>
          <p className="text-sm mt-1 text-content-secondary">
            Manage catalog, pricing, and stock levels across stores (backroom) and forecourt.
          </p>
        </div>
        <button onClick={seedCatalog} disabled={busy}
          className="px-3 py-1.5 text-xs font-medium rounded border border-surface-border text-content-secondary hover:bg-surface-bg disabled:opacity-50">
          Sync catalog from product lists
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-surface-border">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.key ? 'border-action-primary text-action-primary' : 'border-transparent text-content-secondary hover:text-content-primary'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'lubricants' && (
        <LubricantsTab rows={lubricants}
          onAdd={() => setItemModal({ type: 'lubricant', item: null })}
          onEdit={r => setItemModal({ type: 'lubricant', item: r })}
          onDelete={r => setDeleteTarget({ item_key: r.item_key, name: r.description })}
          onStock={r => setStockModal({ item_key: r.item_key, name: r.description, stores: r.stores, forecourt: r.forecourt })}
        />
      )}
      {tab === 'cylinders' && (
        <CylindersTab rows={cylinders}
          onEditPricing={r => setCylModal(r)}
          onStock={(key, name, stores, forecourt) => setStockModal({ item_key: key, name, stores, forecourt })}
          onSeedMissing={seedCatalog}
        />
      )}
      {tab === 'accessories' && (
        <AccessoriesTab rows={accessories}
          onAdd={() => setItemModal({ type: 'accessory', item: null })}
          onEdit={r => setItemModal({ type: 'accessory', item: r })}
          onDelete={r => setDeleteTarget({ item_key: r.item_key, name: r.description })}
          onStock={r => setStockModal({ item_key: r.item_key, name: r.description, stores: r.stores, forecourt: r.forecourt })}
        />
      )}
      {tab === 'movements' && <MovementsTab movements={allMovements} />}

      {itemModal !== null && (
        <ItemModal type={itemModal.type} item={itemModal.item}
          onClose={() => setItemModal(null)}
          onDone={() => { setItemModal(null); fetchAll() }} />
      )}
      {stockModal && (
        <StockActionModal {...stockModal}
          onClose={() => setStockModal(null)}
          onDone={() => { setStockModal(null); fetchAll() }} />
      )}
      {cylModal && (
        <CylinderPricingModal row={cylModal} allPricing={cylPricing}
          onClose={() => setCylModal(null)}
          onDone={() => { setCylModal(null); fetchAll() }} />
      )}
      {deleteTarget && (
        <ConfirmDialog
          title="Remove item from catalog"
          message={`Remove "${deleteTarget.name}" from the catalog? Any remaining stock quantities will be discarded. This also removes the item from daily operation sheets.`}
          confirmLabel="Remove"
          danger
          busy={busy}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}

// ── Lubricants Tab ───────────────────────────────────────────────────

function LubricantsTab({ rows, onAdd, onEdit, onDelete, onStock }: {
  rows: LubRow[]
  onAdd: () => void
  onEdit: (r: LubRow) => void
  onDelete: (r: LubRow) => void
  onStock: (r: LubRow) => void
}) {
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('')

  const visible = rows.filter(r => {
    if (search && !r.description.toLowerCase().includes(search.toLowerCase()) &&
        !r.product_code.toLowerCase().includes(search.toLowerCase())) return false
    if (catFilter && r.sub_category !== catFilter) return false
    return true
  })

  const cats = Array.from(new Set(rows.map(r => r.sub_category))).sort()
  const reorderCount = rows.filter(r => r.needs_reorder).length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2 flex-wrap">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or code..."
            className="px-3 py-1.5 text-sm rounded border border-surface-border bg-surface-bg text-content-primary w-52" />
          <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
            className="px-3 py-1.5 text-sm rounded border border-surface-border bg-surface-bg text-content-primary">
            <option value="">All categories</option>
            {cats.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-3">
          {reorderCount > 0 && (
            <span className="text-xs font-medium text-status-error">{reorderCount} need re-order</span>
          )}
          <button onClick={onAdd}
            className="px-3 py-1.5 text-sm font-medium rounded bg-action-primary text-white">
            + Add Lubricant
          </button>
        </div>
      </div>

      <div className="rounded-lg shadow overflow-x-auto bg-surface-card border border-surface-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-bg border-b border-surface-border">
              {['Name', 'Code', 'Category', 'Size', 'Selling Price', 'Stores', 'Forecourt', 'Re-order', 'Actions'].map(h => (
                <th key={h} className="px-3 py-2 text-left text-xs font-medium uppercase text-content-secondary whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-sm text-content-secondary">
                {rows.length === 0 ? 'No lubricant products in catalog.' : 'No results.'}
              </td></tr>
            )}
            {visible.map(r => (
              <tr key={r.product_code} className={`border-t border-surface-border ${r.needs_reorder ? 'bg-status-error-light/30' : ''}`}>
                <td className="px-3 py-2 font-medium text-content-primary">{r.description}</td>
                <td className="px-3 py-2 font-mono text-xs text-content-secondary">{r.product_code}</td>
                <td className="px-3 py-2 text-content-secondary">{r.sub_category}</td>
                <td className="px-3 py-2 text-content-secondary">{r.unit_size || '—'}</td>
                <td className="px-3 py-2 font-mono text-content-primary text-right">{fmtZMW(r.selling_price)}</td>
                <td className="px-3 py-2 font-mono text-content-primary text-right">{r.stores}</td>
                <td className="px-3 py-2 font-mono text-content-primary text-right">{r.forecourt}</td>
                <td className="px-3 py-2 text-content-secondary text-right">
                  {r.needs_reorder
                    ? <span className="text-xs font-semibold text-status-error">{r.reorder_level} !</span>
                    : <span className="font-mono">{r.reorder_level || '—'}</span>}
                </td>
                <td className="px-3 py-2">
                  <div className="flex gap-1">
                    <button onClick={() => onEdit(r)}
                      className="px-2 py-1 text-xs rounded border border-surface-border text-content-secondary hover:bg-surface-bg">Edit</button>
                    <button onClick={() => onStock(r)}
                      className="px-2 py-1 text-xs rounded bg-action-primary/10 text-action-primary border border-action-primary/30">Stock</button>
                    <button onClick={() => onDelete(r)}
                      className="px-2 py-1 text-xs rounded text-status-error border border-status-error/30 hover:bg-status-error-light">Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── LPG Cylinders Tab ────────────────────────────────────────────────

function CylindersTab({ rows, onEditPricing, onStock, onSeedMissing }: {
  rows: CylRow[]
  onEditPricing: (r: CylRow) => void
  onStock: (item_key: string, name: string, stores: number, forecourt: number) => void
  onSeedMissing: () => void
}) {
  return (
    <div className="space-y-6">
      {/* Pricing */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-content-secondary">Cylinder Pricing</h2>
        </div>
        <div className="rounded-lg shadow overflow-x-auto bg-surface-card border border-surface-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-bg border-b border-surface-border">
                {['Size', 'Refill Price', 'Full Cylinder Price', ''].map(h => (
                  <th key={h} className="px-4 py-2 text-left text-xs font-medium uppercase text-content-secondary whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.size_kg} className="border-t border-surface-border">
                  <td className="px-4 py-2 font-semibold text-content-primary">{r.size_kg}kg</td>
                  <td className="px-4 py-2 font-mono text-content-primary">{fmtZMW(r.price_refill)}</td>
                  <td className="px-4 py-2 font-mono text-content-primary">{fmtZMW(r.price_full_cylinder)}</td>
                  <td className="px-4 py-2">
                    <button onClick={() => onEditPricing(r)}
                      className="px-2 py-1 text-xs rounded border border-surface-border text-content-secondary hover:bg-surface-bg">
                      Edit pricing
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Stock levels */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-content-secondary">Cylinder Stock</h2>
          <button onClick={onSeedMissing}
            className="text-xs text-content-secondary underline">
            Sync missing stock items
          </button>
        </div>
        <div className="rounded-lg shadow overflow-x-auto bg-surface-card border border-surface-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-bg border-b border-surface-border">
                <th className="px-4 py-2 text-left text-xs font-medium uppercase text-content-secondary">Size</th>
                <th className="px-4 py-2 text-right text-xs font-medium uppercase text-content-secondary" colSpan={2}>Full Cylinders</th>
                <th className="px-4 py-2 text-right text-xs font-medium uppercase text-content-secondary" colSpan={2}>Empty Cylinders</th>
                <th className="px-4 py-2 text-xs font-medium uppercase text-content-secondary">Actions</th>
              </tr>
              <tr className="bg-surface-bg border-b border-surface-border">
                <th className="px-4 py-1"></th>
                <th className="px-3 py-1 text-right text-xs text-content-secondary">Stores</th>
                <th className="px-3 py-1 text-right text-xs text-content-secondary">Forecourt</th>
                <th className="px-3 py-1 text-right text-xs text-content-secondary">Stores</th>
                <th className="px-3 py-1 text-right text-xs text-content-secondary">Forecourt</th>
                <th className="px-3 py-1"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.size_kg} className="border-t border-surface-border">
                  <td className="px-4 py-2 font-semibold text-content-primary">{r.size_kg}kg</td>
                  <td className="px-3 py-2 font-mono text-right text-content-primary">{r.full_stores}</td>
                  <td className="px-3 py-2 font-mono text-right text-content-primary">{r.full_forecourt}</td>
                  <td className="px-3 py-2 font-mono text-right text-content-secondary">{r.empty_stores}</td>
                  <td className="px-3 py-2 font-mono text-right text-content-secondary">{r.empty_forecourt}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      <button onClick={() => onStock(`cylinder_full:${r.size_kg}kg`, `${r.size_kg}kg full`, r.full_stores, r.full_forecourt)}
                        className="px-2 py-1 text-xs rounded bg-action-primary/10 text-action-primary border border-action-primary/30">
                        Full
                      </button>
                      <button onClick={() => onStock(`cylinder_empty:${r.size_kg}kg`, `${r.size_kg}kg empty`, r.empty_stores, r.empty_forecourt)}
                        className="px-2 py-1 text-xs rounded border border-surface-border text-content-secondary hover:bg-surface-bg">
                        Empty
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── LPG Accessories Tab ──────────────────────────────────────────────

function AccessoriesTab({ rows, onAdd, onEdit, onDelete, onStock }: {
  rows: AccRow[]
  onAdd: () => void
  onEdit: (r: AccRow) => void
  onDelete: (r: AccRow) => void
  onStock: (r: AccRow) => void
}) {
  const reorderCount = rows.filter(r => r.needs_reorder).length
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          {reorderCount > 0 && <span className="text-xs font-medium text-status-error">{reorderCount} need re-order</span>}
        </div>
        <button onClick={onAdd}
          className="px-3 py-1.5 text-sm font-medium rounded bg-action-primary text-white">
          + Add Accessory
        </button>
      </div>

      <div className="rounded-lg shadow overflow-x-auto bg-surface-card border border-surface-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-bg border-b border-surface-border">
              {['Description', 'Code', 'Selling Price', 'Stores', 'Forecourt', 'Re-order', 'Actions'].map(h => (
                <th key={h} className="px-3 py-2 text-left text-xs font-medium uppercase text-content-secondary whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-content-secondary">
                No accessories in catalog. Add one above.
              </td></tr>
            )}
            {rows.map(r => (
              <tr key={r.product_code} className={`border-t border-surface-border ${r.needs_reorder ? 'bg-status-error-light/30' : ''}`}>
                <td className="px-3 py-2 font-medium text-content-primary">{r.description}</td>
                <td className="px-3 py-2 font-mono text-xs text-content-secondary">{r.product_code}</td>
                <td className="px-3 py-2 font-mono text-right text-content-primary">{fmtZMW(r.selling_price)}</td>
                <td className="px-3 py-2 font-mono text-right text-content-primary">{r.stores}</td>
                <td className="px-3 py-2 font-mono text-right text-content-primary">{r.forecourt}</td>
                <td className="px-3 py-2 text-content-secondary text-right">
                  {r.needs_reorder
                    ? <span className="text-xs font-semibold text-status-error">{r.reorder_level} !</span>
                    : <span className="font-mono">{r.reorder_level || '—'}</span>}
                </td>
                <td className="px-3 py-2">
                  <div className="flex gap-1">
                    <button onClick={() => onEdit(r)}
                      className="px-2 py-1 text-xs rounded border border-surface-border text-content-secondary hover:bg-surface-bg">Edit</button>
                    <button onClick={() => onStock(r)}
                      className="px-2 py-1 text-xs rounded bg-action-primary/10 text-action-primary border border-action-primary/30">Stock</button>
                    <button onClick={() => onDelete(r)}
                      className="px-2 py-1 text-xs rounded text-status-error border border-status-error/30 hover:bg-status-error-light">Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Movement Log Tab ─────────────────────────────────────────────────

function MovementsTab({ movements }: { movements: Movement[] }) {
  const [typeFilter, setTypeFilter] = useState('')
  const [catFilter, setCatFilter] = useState('')

  const visible = movements.filter(m => {
    if (typeFilter && m.type !== typeFilter) return false
    if (catFilter && !m.item_key.startsWith(catFilter)) return false
    return true
  })

  const TYPE_COLORS: Record<string, string> = {
    receive: 'text-status-success', issue: 'text-action-primary',
    damage: 'text-status-error', adjust: 'text-status-warning',
    sale: 'text-content-secondary', return: 'text-content-secondary',
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
          className="px-3 py-1.5 text-sm rounded border border-surface-border bg-surface-bg text-content-primary">
          <option value="">All types</option>
          {['receive', 'issue', 'damage', 'adjust', 'sale', 'return'].map(t => (
            <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
          ))}
        </select>
        <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
          className="px-3 py-1.5 text-sm rounded border border-surface-border bg-surface-bg text-content-primary">
          <option value="">All categories</option>
          <option value="lubricant:">Lubricants</option>
          <option value="lpg_accessory:">LPG Accessories</option>
          <option value="cylinder_full:">Cylinders (full)</option>
          <option value="cylinder_empty:">Cylinders (empty)</option>
        </select>
        <span className="text-xs text-content-secondary self-center">{visible.length} record(s)</span>
      </div>

      <div className="rounded-lg shadow overflow-x-auto bg-surface-card border border-surface-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-bg border-b border-surface-border">
              {['When', 'Type', 'Item', 'Qty', 'Flow', 'By', 'Note'].map(h => (
                <th key={h} className="px-3 py-2 text-left text-xs font-medium uppercase text-content-secondary whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-content-secondary">No movements recorded yet.</td></tr>
            )}
            {visible.map((m, i) => (
              <tr key={i} className="border-t border-surface-border">
                <td className="px-3 py-2 text-content-secondary whitespace-nowrap text-xs">
                  {new Date(m.timestamp).toLocaleString()}
                </td>
                <td className={`px-3 py-2 font-medium capitalize ${TYPE_COLORS[m.type] || 'text-content-primary'}`}>{m.type}</td>
                <td className="px-3 py-2 text-content-primary">{m.name}</td>
                <td className="px-3 py-2 font-mono text-right text-content-primary">
                  {m.qty > 0 ? '+' : ''}{m.qty}
                </td>
                <td className="px-3 py-2 text-xs text-content-secondary whitespace-nowrap">
                  {[m.from_bin, m.to_bin].filter(Boolean).join(' → ') || '—'}
                </td>
                <td className="px-3 py-2 text-xs text-content-secondary">{m.performed_by}</td>
                <td className="px-3 py-2 text-xs text-content-secondary max-w-xs truncate">{m.note || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Item Modal (add/edit lubricant or accessory) ─────────────────────

function ItemModal({ type, item, onClose, onDone }: {
  type: 'lubricant' | 'accessory'
  item: LubRow | AccRow | null
  onClose: () => void
  onDone: () => void
}) {
  const isLub = type === 'lubricant'
  const isNew = !item

  const [name, setName] = useState(item ? (item as any).description : '')
  const [code, setCode] = useState(item?.product_code || '')
  const [subCat, setSubCat] = useState(isLub ? (item as LubRow | null)?.sub_category || 'Engine Oil' : '')
  const [uom, setUom] = useState(
    isLub ? ((item as LubRow | null)?.unit_size || 'L') : 'ea'
  )
  const [sellingPrice, setSellingPrice] = useState(String(item?.selling_price || ''))
  const [reorderLevel, setReorderLevel] = useState(String(item?.reorder_level || ''))
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!name.trim() || !code.trim()) { toast.error('Name and product code are required.'); return }
    const sp = parseFloat(sellingPrice)
    if (isNaN(sp) || sp < 0) { toast.error('Enter a valid selling price.'); return }

    setBusy(true)
    try {
      const body: any = {
        category: isLub ? 'lubricant' : 'lpg_accessory',
        product_code: code.trim(),
        name: name.trim(),
        unit: uom,
        reorder_level: parseFloat(reorderLevel) || 0,
        selling_price: sp,
      }
      if (isLub) {
        body.sub_category = subCat
        body.unit_size = uom
      }

      const res = await authFetch(`${BASE}/stores/items`, {
        method: 'POST',
        headers: { ...getHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Save failed')
      toast.success(`${name} ${isNew ? 'added' : 'updated'}.`)
      onDone()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="rounded-lg shadow-lg p-6 w-full max-w-md bg-surface-card border border-surface-border">
        <h3 className="text-lg font-semibold mb-4 text-content-primary">
          {isNew ? `Add ${isLub ? 'Lubricant' : 'LPG Accessory'}` : `Edit ${(item as any).description}`}
        </h3>
        <div className="space-y-3">
          <Field label="Name / Description" value={name} onChange={setName} placeholder="e.g. 15W-40 Diesel Engine Oil 4L" />
          <Field label="Product code" value={code} onChange={setCode} placeholder="e.g. EO-15W40-4L" disabled={!isNew} />
          {isLub && (
            <div>
              <label className="block text-xs font-medium text-content-secondary mb-1">Category</label>
              <select value={subCat} onChange={e => setSubCat(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded border border-surface-border bg-surface-bg text-content-primary">
                {LUB_CATS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-content-secondary mb-1">Unit of measure</label>
            <select value={uom} onChange={e => setUom(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded border border-surface-border bg-surface-bg text-content-primary">
              {UOM_OPTIONS.map(group => (
                <optgroup key={group.group} label={group.group}>
                  {group.units.map(u => (
                    <option key={u.code} value={u.code}>{u.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <Field label="Selling price (ZMW)" value={sellingPrice} onChange={setSellingPrice} type="number" placeholder="0.00" />
          <Field label="Re-order level" value={reorderLevel} onChange={setReorderLevel} type="number" placeholder="0" />
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded border border-surface-border text-content-secondary">Cancel</button>
          <button onClick={submit} disabled={busy}
            className="px-4 py-2 text-sm font-medium rounded bg-action-primary text-white disabled:opacity-50">
            {busy ? 'Saving...' : isNew ? 'Add item' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Stock Action Modal ───────────────────────────────────────────────

function StockActionModal({ item_key, name, stores, forecourt, onClose, onDone }: {
  item_key: string; name: string; stores: number; forecourt: number
  onClose: () => void; onDone: () => void
}) {
  const [action, setAction] = useState<StockAction>('receive')
  const [qty, setQty] = useState('')
  const [note, setNote] = useState('')
  const [bin, setBin] = useState<Bin>('stores')
  const [busy, setBusy] = useState(false)

  const ACTIONS: [StockAction, string, string][] = [
    ['receive', 'Receive', 'Add stock to stores (backroom)'],
    ['issue', 'Issue', 'Move stock from stores to forecourt'],
    ['damage', 'Damage', 'Write off damaged units'],
    ['adjust', 'Adjust', 'Set a bin to the physically counted qty'],
  ]

  const submit = async () => {
    const q = parseFloat(qty)
    if (action === 'adjust') {
      if (isNaN(q) || q < 0) { toast.error('Enter a valid quantity (0 or more).'); return }
      if (!note.trim()) { toast.error('A reason is required for adjustments.'); return }
    } else {
      if (isNaN(q) || q <= 0) { toast.error('Enter a quantity greater than zero.'); return }
      if (action === 'damage' && !note.trim()) { toast.error('A reason is required for damage.'); return }
    }

    setBusy(true)
    try {
      let path = '', body: any = {}
      if (action === 'receive') { path = '/stores/receive'; body = { item_key, qty: q, note: note.trim() } }
      else if (action === 'issue') { path = '/stores/issue'; body = { item_key, qty: q, note: note.trim() } }
      else if (action === 'damage') { path = '/stores/damage'; body = { item_key, qty: q, bin, note: note.trim() } }
      else { path = '/stores/adjust'; body = { item_key, bin, new_qty: q, reason: note.trim() } }

      const res = await authFetch(`${BASE}${path}`, {
        method: 'POST',
        headers: { ...getHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Action failed')
      toast.success(`${action.charAt(0).toUpperCase() + action.slice(1)} recorded.`)
      onDone()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  const showBin = action === 'damage' || action === 'adjust'
  const currentBinQty = bin === 'stores' ? stores : forecourt

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="rounded-lg shadow-lg p-6 w-full max-w-md bg-surface-card border border-surface-border">
        <h3 className="text-lg font-semibold mb-1 text-content-primary">Stock Movement</h3>
        <p className="text-sm text-content-secondary mb-4">
          {name} &mdash; stores: {stores}, forecourt: {forecourt}
        </p>

        {/* Action selector */}
        <div className="grid grid-cols-4 gap-1 mb-4">
          {ACTIONS.map(([a, label]) => (
            <button key={a} type="button" onClick={() => { setAction(a); setQty(''); setNote('') }}
              className="py-1.5 text-xs font-medium rounded border text-center"
              style={{
                backgroundColor: action === a ? 'var(--color-action-primary)' : 'transparent',
                color: action === a ? '#fff' : 'var(--color-content-secondary)',
                borderColor: action === a ? 'var(--color-action-primary)' : 'var(--color-surface-border)',
              }}>
              {label}
            </button>
          ))}
        </div>
        <p className="text-xs text-content-secondary mb-3">{ACTIONS.find(a => a[0] === action)?.[2]}</p>

        <div className="space-y-3">
          {showBin && (
            <div>
              <label className="block text-xs font-medium text-content-secondary mb-1">Bin</label>
              <select value={bin} onChange={e => setBin(e.target.value as Bin)}
                className="w-full px-3 py-2 text-sm rounded border border-surface-border bg-surface-bg text-content-primary">
                <option value="stores">Stores (backroom) — current: {stores}</option>
                <option value="forecourt">Forecourt — current: {forecourt}</option>
              </select>
            </div>
          )}
          <Field
            label={action === 'adjust' ? `New ${bin} quantity (currently ${currentBinQty})` : 'Quantity'}
            value={qty} onChange={setQty} type="number" placeholder="0" autoFocus
          />
          <div>
            <label className="block text-xs font-medium text-content-secondary mb-1">
              {action === 'damage' || action === 'adjust' ? 'Reason (required)' : 'Note (optional)'}
            </label>
            <textarea rows={2} value={note} onChange={e => setNote(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded border border-surface-border bg-surface-bg text-content-primary resize-none" />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded border border-surface-border text-content-secondary">Cancel</button>
          <button onClick={submit} disabled={busy}
            className="px-4 py-2 text-sm font-medium rounded bg-action-primary text-white disabled:opacity-50">
            {busy ? 'Saving...' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Cylinder Pricing Modal ───────────────────────────────────────────

function CylinderPricingModal({ row, allPricing, onClose, onDone }: {
  row: CylRow
  allPricing: Record<string, any>
  onClose: () => void
  onDone: () => void
}) {
  const [refill, setRefill] = useState(String(row.price_refill))
  const [full, setFull] = useState(String(row.price_full_cylinder))
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    const r = parseFloat(refill), f = parseFloat(full)
    if (isNaN(r) || r < 0 || isNaN(f) || f < 0) { toast.error('Enter valid prices.'); return }
    setBusy(true)
    try {
      const prices = { ...allPricing, [String(row.size_kg)]: { price_refill: r, price_full_cylinder: f } }
      const res = await authFetch(`${BASE}/lpg-daily/pricing`, {
        method: 'PUT',
        headers: { ...getHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ prices }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Update failed')
      toast.success(`${row.size_kg}kg pricing updated.`)
      onDone()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="rounded-lg shadow-lg p-6 w-full max-w-sm bg-surface-card border border-surface-border">
        <h3 className="text-lg font-semibold mb-1 text-content-primary">{row.size_kg}kg Cylinder Pricing</h3>
        <p className="text-sm text-content-secondary mb-4">Update prices charged at the forecourt.</p>
        <div className="space-y-3">
          <Field label="Refill price (ZMW)" value={refill} onChange={setRefill} type="number" placeholder="0.00" />
          <Field label="Full cylinder price (ZMW)" value={full} onChange={setFull} type="number" placeholder="0.00" />
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded border border-surface-border text-content-secondary">Cancel</button>
          <button onClick={submit} disabled={busy}
            className="px-4 py-2 text-sm font-medium rounded bg-action-primary text-white disabled:opacity-50">
            {busy ? 'Saving...' : 'Save pricing'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Shared helpers ───────────────────────────────────────────────────

function ConfirmDialog({ title, message, confirmLabel, danger, busy, onConfirm, onCancel }: {
  title: string; message: string; confirmLabel: string; danger?: boolean; busy: boolean
  onConfirm: () => void; onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="rounded-lg shadow-lg p-6 w-full max-w-md bg-surface-card border border-surface-border">
        <h3 className="text-lg font-semibold mb-2 text-content-primary">{title}</h3>
        <p className="text-sm text-content-secondary mb-5">{message}</p>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-4 py-2 text-sm rounded border border-surface-border text-content-secondary">Cancel</button>
          <button onClick={onConfirm} disabled={busy}
            className={`px-4 py-2 text-sm font-medium rounded text-white disabled:opacity-50 ${danger ? 'bg-status-error' : 'bg-action-primary'}`}>
            {busy ? 'Removing...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', placeholder, autoFocus, disabled }: {
  label: string; value: string; onChange: (v: string) => void
  type?: string; placeholder?: string; autoFocus?: boolean; disabled?: boolean
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-content-secondary mb-1">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder} autoFocus={autoFocus} disabled={disabled}
        className="w-full px-3 py-2 text-sm rounded border border-surface-border bg-surface-bg text-content-primary disabled:opacity-50 disabled:cursor-not-allowed" />
    </div>
  )
}
