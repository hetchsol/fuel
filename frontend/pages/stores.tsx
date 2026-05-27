import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/router'
import toast from 'react-hot-toast'
import LoadingSpinner from '../components/LoadingSpinner'
import { getHeaders, authFetch } from '../lib/api'

const BASE = '/api/v1'

type Bin = 'stores' | 'forecourt'
type Category = 'lubricant' | 'lpg_accessory' | 'cylinder_full' | 'cylinder_empty' | 'accessory'

interface StockItem {
  item_key: string
  category: Category
  product_code: string
  name: string
  unit: string
  stores: number
  forecourt: number
  reorder_level: number
  reorder_qty: number
  needs_reorder?: boolean
}

interface Movement {
  timestamp: string
  type: string
  item_key: string
  name: string
  qty: number
  from_bin: string | null
  to_bin: string | null
  performed_by: string
  note: string
}

const CATEGORY_LABELS: Record<Category, string> = {
  lubricant: 'Lubricant',
  lpg_accessory: 'LPG Accessory',
  cylinder_full: 'Cylinder (full)',
  cylinder_empty: 'Cylinder (empty)',
  accessory: 'Accessory',
}

const CATEGORIES = Object.keys(CATEGORY_LABELS) as Category[]

type Action = 'receive' | 'issue' | 'damage' | 'adjust' | 'additem'

export default function StoresDashboard() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<StockItem[]>([])
  const [summary, setSummary] = useState<any>(null)
  const [recent, setRecent] = useState<Movement[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [busy, setBusy] = useState(false)

  // Modal state: which action + which item (null item for add-item).
  const [modal, setModal] = useState<{ action: Action; item: StockItem | null } | null>(null)

  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (!userData) { router.push('/login'); return }
    const user = JSON.parse(userData)
    if (!['manager', 'owner'].includes(user.role)) router.push('/')
  }, [router])

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await authFetch(`${BASE}/stores/dashboard`, { headers: getHeaders() })
      if (!res.ok) throw new Error((await res.json()).detail || 'Failed to load')
      const data = await res.json()
      setItems(data.items || [])
      setSummary(data.summary || null)
      setRecent(data.recent_movements || [])
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchDashboard() }, [fetchDashboard])

  const seedCatalog = async () => {
    setBusy(true)
    try {
      const res = await authFetch(`${BASE}/stores/seed-catalog`, { method: 'POST', headers: getHeaders() })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Seed failed')
      toast.success(`Catalog seeded — ${data.items_seeded} item definition(s).`)
      fetchDashboard()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <LoadingSpinner fullPage text="Loading stores..." />

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-content-primary tracking-tight">Stores / Stock</h1>
          <p className="mt-1 text-sm text-content-secondary">
            Manage backroom (stores) and forecourt stock — receive, issue, damages, and re-order levels.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setModal({ action: 'additem', item: null })}
            className="px-3 py-2 text-sm font-medium rounded-md bg-action-primary text-white">
            + Add / Edit Item
          </button>
          <button onClick={seedCatalog} disabled={busy}
            className="px-3 py-2 text-sm font-medium rounded-md border border-surface-border text-content-secondary disabled:opacity-50">
            Seed from catalogs
          </button>
        </div>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Items', value: summary.item_count, color: 'var(--color-action-primary)' },
            { label: 'Needs Re-order', value: summary.reorder_count, color: 'var(--color-status-error)' },
            { label: 'Stores Units', value: summary.total_stores_units, color: 'var(--color-content-primary)' },
            { label: 'Forecourt Units', value: summary.total_forecourt_units, color: 'var(--color-status-success)' },
          ].map(c => (
            <div key={c.label} className="rounded-lg p-4 shadow bg-surface-card border border-surface-border">
              <div className="text-xs font-medium uppercase text-content-secondary">{c.label}</div>
              <div className="text-2xl font-bold mt-1" style={{ color: c.color }}>{c.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Re-order alerts */}
      {summary?.reorder_count > 0 && (
        <div className="rounded-lg p-3 text-sm bg-status-warning-light border border-status-warning text-status-warning">
          <span className="font-semibold">{summary.reorder_count} item(s)</span> at or below re-order level — replenish stores.
        </div>
      )}

      {/* Items table */}
      <div className="rounded-lg shadow overflow-x-auto bg-surface-card border border-surface-border">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-surface-bg">
              {['Item', 'Category', 'Stores', 'Forecourt', 'Re-order', '', 'Actions'].map((h, i) => (
                <th key={i} className="px-3 py-2 text-left text-xs font-medium uppercase text-content-secondary whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-content-secondary">
                No stock items yet. Use “Seed from catalogs” or “Add / Edit Item” to get started.
              </td></tr>
            )}
            {items.map(item => (
              <tr key={item.item_key} className="border-t border-surface-border">
                <td className="px-3 py-2 font-medium text-content-primary">{item.name}</td>
                <td className="px-3 py-2 text-content-secondary">{CATEGORY_LABELS[item.category] || item.category}</td>
                <td className="px-3 py-2 font-mono text-content-primary">{item.stores}</td>
                <td className="px-3 py-2 font-mono text-content-primary">{item.forecourt}</td>
                <td className="px-3 py-2 font-mono text-content-secondary">{item.reorder_level || '—'}</td>
                <td className="px-3 py-2">
                  {item.needs_reorder && (
                    <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-status-error-light text-status-error">
                      Re-order
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <div className="flex gap-1 flex-wrap">
                    {([
                      ['receive', 'Receive'],
                      ['issue', 'Issue'],
                      ['damage', 'Damage'],
                      ['adjust', 'Adjust'],
                    ] as [Action, string][]).map(([action, label]) => (
                      <button key={action} onClick={() => setModal({ action, item })}
                        className="px-2 py-1 text-xs font-medium rounded border border-surface-border text-content-secondary hover:bg-surface-bg">
                        {label}
                      </button>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Movement history */}
      <div>
        <button onClick={() => setShowHistory(s => !s)} className="text-sm font-medium text-action-primary">
          {showHistory ? 'Hide' : 'Show'} recent movements
        </button>
        {showHistory && (
          <div className="mt-2 rounded-lg shadow overflow-x-auto bg-surface-card border border-surface-border">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-surface-bg">
                  {['When', 'Type', 'Item', 'Qty', 'Flow', 'By', 'Note'].map((h, i) => (
                    <th key={i} className="px-3 py-2 text-left text-xs font-medium uppercase text-content-secondary whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recent.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-6 text-center text-sm text-content-secondary">No movements yet</td></tr>
                )}
                {recent.map((m, i) => (
                  <tr key={i} className="border-t border-surface-border">
                    <td className="px-3 py-2 text-content-secondary whitespace-nowrap">{new Date(m.timestamp).toLocaleString()}</td>
                    <td className="px-3 py-2 capitalize text-content-primary">{m.type}</td>
                    <td className="px-3 py-2 text-content-primary">{m.name}</td>
                    <td className="px-3 py-2 font-mono">{m.qty}</td>
                    <td className="px-3 py-2 text-content-secondary">{[m.from_bin, m.to_bin].filter(Boolean).join(' → ') || '—'}</td>
                    <td className="px-3 py-2 text-content-secondary">{m.performed_by}</td>
                    <td className="px-3 py-2 text-content-secondary">{m.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <ActionModal
          action={modal.action}
          item={modal.item}
          busy={busy}
          setBusy={setBusy}
          onClose={() => setModal(null)}
          onDone={() => { setModal(null); fetchDashboard() }}
        />
      )}
    </div>
  )
}

// ── Action modal ──────────────────────────────────────────────────

function ActionModal({ action, item, busy, setBusy, onClose, onDone }: {
  action: Action
  item: StockItem | null
  busy: boolean
  setBusy: (b: boolean) => void
  onClose: () => void
  onDone: () => void
}) {
  const [qty, setQty] = useState('')
  const [note, setNote] = useState('')
  const [bin, setBin] = useState<Bin>('stores')
  // add-item fields
  const [category, setCategory] = useState<Category>('accessory')
  const [productCode, setProductCode] = useState('')
  const [name, setName] = useState('')
  const [unit, setUnit] = useState('ea')
  const [reorderLevel, setReorderLevel] = useState('')

  const titles: Record<Action, string> = {
    receive: 'Receive into Stores',
    issue: 'Issue to Forecourt',
    damage: 'Record Damage',
    adjust: 'Adjust (physical count)',
    additem: 'Add / Edit Item',
  }

  const submit = async () => {
    setBusy(true)
    try {
      let path = '', body: any = {}
      if (action === 'additem') {
        if (!productCode.trim() || !name.trim()) throw new Error('Product code and name are required.')
        path = '/stores/items'
        body = {
          category, product_code: productCode.trim(), name: name.trim(),
          unit: unit.trim() || 'ea', reorder_level: parseFloat(reorderLevel) || 0,
        }
      } else {
        if (!item) throw new Error('No item selected.')
        const q = parseFloat(qty)
        if (action === 'adjust') {
          if (isNaN(q) || q < 0) throw new Error('Enter a valid quantity.')
          if (!note.trim()) throw new Error('A reason is required.')
          path = '/stores/adjust'; body = { item_key: item.item_key, bin, new_qty: q, reason: note.trim() }
        } else {
          if (isNaN(q) || q <= 0) throw new Error('Enter a quantity greater than zero.')
          if (action === 'receive') { path = '/stores/receive'; body = { item_key: item.item_key, qty: q, note: note.trim() } }
          else if (action === 'issue') { path = '/stores/issue'; body = { item_key: item.item_key, qty: q, note: note.trim() } }
          else if (action === 'damage') {
            if (!note.trim()) throw new Error('A reason is required for damages.')
            path = '/stores/damage'; body = { item_key: item.item_key, qty: q, bin, note: note.trim() }
          }
        }
      }
      const res = await authFetch(`${BASE}${path}`, {
        method: 'POST', headers: { ...getHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Action failed')
      toast.success(`${titles[action]} — done.`)
      onDone()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  const showBin = action === 'damage' || action === 'adjust'
  const noteRequired = action === 'damage' || action === 'adjust'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="rounded-lg shadow-lg p-6 w-full max-w-md bg-surface-card border border-surface-border">
        <h3 className="text-lg font-semibold mb-1 text-content-primary">{titles[action]}</h3>
        {item && <p className="text-sm mb-4 text-content-secondary">{item.name} — stores {item.stores}, forecourt {item.forecourt}</p>}

        {action === 'additem' ? (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-content-secondary mb-1">Category</label>
              <select value={category} onChange={e => setCategory(e.target.value as Category)}
                className="w-full px-3 py-2 text-sm rounded border border-surface-border bg-surface-bg text-content-primary">
                {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
              </select>
            </div>
            <Field label="Product code" value={productCode} onChange={setProductCode} placeholder="e.g. 9kg or LUB-001" />
            <Field label="Name" value={name} onChange={setName} placeholder="Display name" />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Unit" value={unit} onChange={setUnit} placeholder="ea" />
              <Field label="Re-order level" value={reorderLevel} onChange={setReorderLevel} type="number" placeholder="0" />
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {showBin && (
              <div>
                <label className="block text-xs font-medium text-content-secondary mb-1">Bin</label>
                <select value={bin} onChange={e => setBin(e.target.value as Bin)}
                  className="w-full px-3 py-2 text-sm rounded border border-surface-border bg-surface-bg text-content-primary">
                  <option value="stores">Stores</option>
                  <option value="forecourt">Forecourt</option>
                </select>
              </div>
            )}
            <Field
              label={action === 'adjust' ? `New ${bin} quantity` : 'Quantity'}
              value={qty} onChange={setQty} type="number" placeholder="0" autoFocus
            />
            <div>
              <label className="block text-xs font-medium text-content-secondary mb-1">
                {noteRequired ? 'Reason (required)' : 'Note (optional)'}
              </label>
              <textarea rows={2} value={note} onChange={e => setNote(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded border border-surface-border bg-surface-bg text-content-primary resize-none" />
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded border border-surface-border text-content-secondary">Cancel</button>
          <button onClick={submit} disabled={busy}
            className="px-4 py-2 text-sm font-medium rounded text-white bg-action-primary disabled:opacity-50">
            {busy ? 'Saving...' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', placeholder, autoFocus }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string; autoFocus?: boolean
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-content-secondary mb-1">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} autoFocus={autoFocus}
        className="w-full px-3 py-2 text-sm rounded border border-surface-border bg-surface-bg text-content-primary" />
    </div>
  )
}
