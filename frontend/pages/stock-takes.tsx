import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/router'
import toast from 'react-hot-toast'
import LoadingSpinner from '../components/LoadingSpinner'
import { getHeaders, authFetch } from '../lib/api'

const BASE = '/api/v1'

type Status = 'draft' | 'submitted' | 'approved'
type Bin = 'stores' | 'forecourt'

interface Line {
  item_key: string
  name: string
  category: string
  system_qty_at_open: number
  counted_qty: number | null
  variance: number | null
  note: string
}

interface StockTake {
  take_id: string
  date: string
  bin: Bin
  status: Status
  started_by: string
  started_at: string
  submitted_by: string | null
  submitted_at: string | null
  approved_by: string | null
  approved_at: string | null
  lines: Line[]
}

const STATUS_BADGE: Record<Status, { bg: string; color: string; label: string }> = {
  draft:     { bg: 'var(--color-status-pending-light)', color: 'var(--color-status-pending)', label: 'Draft' },
  submitted: { bg: 'var(--color-status-warning-light)', color: 'var(--color-status-warning)', label: 'Submitted' },
  approved:  { bg: 'var(--color-status-success-light)', color: 'var(--color-status-success)', label: 'Approved' },
}

export default function StockTakes() {
  const router = useRouter()
  const [role, setRole] = useState('')
  const [loading, setLoading] = useState(true)
  const [takes, setTakes] = useState<StockTake[]>([])
  const [active, setActive] = useState<StockTake | null>(null)
  const [busy, setBusy] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [newBin, setNewBin] = useState<Bin>('stores')

  useEffect(() => {
    const u = localStorage.getItem('user')
    if (!u) { router.push('/login'); return }
    const parsed = JSON.parse(u)
    if (!['manager', 'owner'].includes(parsed.role)) router.push('/')
    setRole(parsed.role || '')
  }, [router])

  const isOwner = role === 'owner'

  const fetchTakes = useCallback(async () => {
    try {
      const res = await authFetch(`${BASE}/stores/stock-takes`, { headers: getHeaders() })
      if (!res.ok) throw new Error((await res.json()).detail || 'Failed to load')
      setTakes(await res.json())
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchTakes() }, [fetchTakes])

  const createTake = async () => {
    setBusy(true)
    try {
      const res = await authFetch(`${BASE}/stores/stock-takes`, {
        method: 'POST',
        headers: { ...getHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ bin: newBin }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Failed to create')
      toast.success(`Stock take ${data.take_id} opened`)
      setShowCreate(false)
      setActive(data)
      fetchTakes()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  const openTake = async (id: string) => {
    try {
      const res = await authFetch(`${BASE}/stores/stock-takes/${id}`, { headers: getHeaders() })
      if (!res.ok) throw new Error((await res.json()).detail || 'Failed to load take')
      setActive(await res.json())
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  const setLineField = (item_key: string, field: 'counted_qty' | 'note', value: any) => {
    if (!active) return
    setActive({
      ...active,
      lines: active.lines.map(l => l.item_key === item_key
        ? {
            ...l,
            [field]: value,
            ...(field === 'counted_qty'
              ? { variance: value === null || value === '' ? null : Number(value) - l.system_qty_at_open }
              : {}),
          }
        : l),
    })
  }

  const saveCounts = async () => {
    if (!active) return
    setBusy(true)
    try {
      const counts = active.lines.map(l => ({
        item_key: l.item_key,
        counted_qty: l.counted_qty === null || (l.counted_qty as any) === '' ? null : Number(l.counted_qty),
        note: l.note || null,
      }))
      const res = await authFetch(`${BASE}/stores/stock-takes/${active.take_id}/lines`, {
        method: 'PATCH',
        headers: { ...getHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ counts }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Save failed')
      toast.success('Counts saved')
      setActive(data)
      fetchTakes()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  const submitTake = async () => {
    if (!active) return
    if (!confirm('Submit will apply the counted quantities to the bin. Continue?')) return
    setBusy(true)
    try {
      await saveCountsInline()
      const res = await authFetch(`${BASE}/stores/stock-takes/${active.take_id}/submit`, {
        method: 'POST', headers: getHeaders(),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Submit failed')
      toast.success('Stock take submitted; bin updated')
      setActive(data)
      fetchTakes()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  const saveCountsInline = async () => {
    if (!active) return
    const counts = active.lines.map(l => ({
      item_key: l.item_key,
      counted_qty: l.counted_qty === null || (l.counted_qty as any) === '' ? null : Number(l.counted_qty),
      note: l.note || null,
    }))
    await authFetch(`${BASE}/stores/stock-takes/${active.take_id}/lines`, {
      method: 'PATCH',
      headers: { ...getHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ counts }),
    })
  }

  const approveTake = async () => {
    if (!active) return
    setBusy(true)
    try {
      const res = await authFetch(`${BASE}/stores/stock-takes/${active.take_id}/approve`, {
        method: 'POST', headers: getHeaders(),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Approve failed')
      toast.success('Stock take approved')
      setActive(data)
      fetchTakes()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <LoadingSpinner fullPage text="Loading..." />

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-content-primary tracking-tight">Stock Takes</h1>
          <p className="mt-1 text-sm text-content-secondary">
            Physical-count sessions. Counts are applied to the chosen bin on submit; owner sign-off finalises the take.
          </p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="px-3 py-2 text-sm font-semibold rounded-md bg-action-primary text-white">
          + Start Stock Take
        </button>
      </div>

      {/* Takes list */}
      <div className="rounded-lg shadow overflow-x-auto bg-surface-card border border-surface-border">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-surface-bg">
              {['Take ID', 'Date', 'Bin', 'Lines', 'Counted', 'Variance Σ', 'Status', 'Started by', ''].map(h => (
                <th key={h} className="px-3 py-2 text-left text-xs font-medium uppercase text-content-secondary whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {takes.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-sm text-content-secondary">
                No stock takes yet. Start one to count physical stock against the system.
              </td></tr>
            )}
            {takes.map(t => {
              const counted = t.lines.filter(l => l.counted_qty != null).length
              const varianceSum = t.lines.reduce((s, l) => s + (l.variance || 0), 0)
              const s = STATUS_BADGE[t.status] || STATUS_BADGE.draft
              return (
                <tr key={t.take_id} className="border-t border-surface-border hover:bg-surface-bg">
                  <td className="px-3 py-2 font-mono text-xs text-content-primary">{t.take_id}</td>
                  <td className="px-3 py-2 text-content-secondary">{t.date}</td>
                  <td className="px-3 py-2 capitalize text-content-primary">{t.bin}</td>
                  <td className="px-3 py-2 font-mono text-content-secondary">{t.lines.length}</td>
                  <td className="px-3 py-2 font-mono text-content-secondary">{counted} / {t.lines.length}</td>
                  <td className="px-3 py-2 font-mono" style={{
                    color: varianceSum < 0 ? 'var(--color-status-error)' : varianceSum > 0 ? 'var(--color-status-warning)' : 'var(--color-text-secondary)',
                  }}>
                    {Math.round(varianceSum * 1000) / 1000}
                  </td>
                  <td className="px-3 py-2">
                    <span className="inline-block px-2 py-0.5 rounded text-xs font-medium" style={{ backgroundColor: s.bg, color: s.color }}>
                      {s.label}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-content-secondary">{t.started_by}</td>
                  <td className="px-3 py-2">
                    <button onClick={() => openTake(t.take_id)} className="text-xs underline text-action-primary">Open</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Active take editor */}
      {active && (
        <div className="rounded-lg shadow bg-surface-card border border-surface-border">
          <div className="p-4 flex flex-wrap items-center justify-between gap-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
            <div>
              <div className="font-semibold text-content-primary">{active.take_id}</div>
              <div className="text-xs text-content-secondary">
                {active.date} · bin: <span className="capitalize">{active.bin}</span> · started by {active.started_by}
              </div>
            </div>
            <div className="flex gap-2">
              <span className="inline-block px-2 py-0.5 rounded text-xs font-medium self-center"
                style={{ backgroundColor: STATUS_BADGE[active.status].bg, color: STATUS_BADGE[active.status].color }}>
                {STATUS_BADGE[active.status].label}
              </span>
              {active.status === 'draft' && (
                <>
                  <button onClick={saveCounts} disabled={busy}
                    className="px-3 py-1.5 text-sm rounded border border-surface-border text-content-secondary">
                    Save counts
                  </button>
                  <button onClick={submitTake} disabled={busy}
                    className="px-3 py-1.5 text-sm font-semibold rounded text-white bg-action-primary">
                    Submit
                  </button>
                </>
              )}
              {active.status === 'submitted' && isOwner && (
                <button onClick={approveTake} disabled={busy}
                  className="px-3 py-1.5 text-sm font-semibold rounded text-white"
                  style={{ backgroundColor: 'var(--color-status-success)' }}>
                  Approve
                </button>
              )}
              <button onClick={() => setActive(null)} className="px-3 py-1.5 text-sm rounded border border-surface-border text-content-secondary">Close</button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-surface-bg">
                  {['Item', 'Category', 'System', 'Counted', 'Variance', 'Note'].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-medium uppercase text-content-secondary">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {active.lines.map(l => (
                  <tr key={l.item_key} className="border-t border-surface-border">
                    <td className="px-3 py-2 text-content-primary">{l.name}</td>
                    <td className="px-3 py-2 text-content-secondary capitalize">{l.category.replace('_', ' ')}</td>
                    <td className="px-3 py-2 font-mono text-content-secondary">{l.system_qty_at_open}</td>
                    <td className="px-3 py-2">
                      {active.status === 'draft' ? (
                        <input type="number" min={0}
                          value={l.counted_qty == null ? '' : l.counted_qty}
                          onChange={e => setLineField(l.item_key, 'counted_qty', e.target.value === '' ? null : e.target.value)}
                          className="w-24 px-2 py-1 rounded border border-surface-border bg-surface-bg text-content-primary text-right font-mono text-sm" />
                      ) : (
                        <span className="font-mono">{l.counted_qty ?? '—'}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono" style={{
                      color: (l.variance || 0) < 0 ? 'var(--color-status-error)' :
                             (l.variance || 0) > 0 ? 'var(--color-status-warning)' : 'var(--color-text-secondary)',
                    }}>
                      {l.variance == null ? '—' : Math.round(l.variance * 1000) / 1000}
                    </td>
                    <td className="px-3 py-2">
                      {active.status === 'draft' ? (
                        <input type="text" value={l.note}
                          onChange={e => setLineField(l.item_key, 'note', e.target.value)}
                          className="w-full px-2 py-1 rounded border border-surface-border bg-surface-bg text-content-primary text-sm" />
                      ) : (
                        <span className="text-content-secondary">{l.note || '—'}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-lg shadow-lg p-6 bg-surface-card border border-surface-border">
            <h3 className="text-lg font-bold text-content-primary mb-2">Start Stock Take</h3>
            <p className="text-sm text-content-secondary mb-4">
              Counts the chosen bin against every catalog item. Submit later applies the counted quantities.
            </p>
            <label className="block text-sm font-medium text-content-secondary mb-1">Bin</label>
            <select value={newBin} onChange={e => setNewBin(e.target.value as Bin)}
              className="w-full px-3 py-2 mb-4 rounded border border-surface-border bg-surface-bg text-content-primary">
              <option value="stores">Stores (backroom)</option>
              <option value="forecourt">Forecourt (sales floor)</option>
            </select>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowCreate(false)}
                className="px-4 py-2 text-sm rounded border border-surface-border text-content-secondary">Cancel</button>
              <button onClick={createTake} disabled={busy}
                className="px-4 py-2 text-sm font-semibold rounded text-white bg-action-primary disabled:opacity-50">
                {busy ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
