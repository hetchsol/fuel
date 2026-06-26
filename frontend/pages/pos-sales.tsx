import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import toast from 'react-hot-toast'
import LoadingSpinner from '../components/LoadingSpinner'
import { getHeaders, authFetch } from '../lib/api'

const BASE = '/api/v1'
const fmtZMW = (v: number) =>
  `K${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const todayStr = () => new Date().toISOString().slice(0, 10)

interface POSItem {
  type_id: string
  type_name: string
  amount: number
  reference: string
}

interface Handover {
  handover_id: string
  attendant_name: string
  shift_type: string
  date: string
  phase: string
  review_status: string
  shift_id: string
}

interface POSType {
  type_id: string
  name: string
  is_active: boolean
}

export default function POSSales() {
  const router = useRouter()
  const [authorized, setAuthorized] = useState(false)

  const [date, setDate] = useState(todayStr())
  const [handovers, setHandovers] = useState<Handover[]>([])
  const [handoversLoading, setHandoversLoading] = useState(true)
  const [posTypes, setPosTypes] = useState<POSType[]>([])

  const [selectedHandoverId, setSelectedHandoverId] = useState('')
  const [selectedTypeId, setSelectedTypeId] = useState('')
  const [amount, setAmount] = useState('')
  const [reference, setReference] = useState('')

  const [items, setItems] = useState<POSItem[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (!userData) { router.push('/login'); return }
    const user = JSON.parse(userData)
    if (!['manager', 'owner'].includes(user.role)) { router.push('/'); return }
    setAuthorized(true)
  }, [])

  useEffect(() => {
    if (!authorized) return
    authFetch(`${BASE}/settings/pos`, { headers: getHeaders() })
      .then(r => r.ok ? r.json() : { payment_types: [] })
      .then(data => {
        const active = (data.payment_types || []).filter((t: POSType) => t.is_active)
        setPosTypes(active)
        if (active.length > 0) setSelectedTypeId(active[0].type_id)
      })
      .catch(() => {})
  }, [authorized])

  useEffect(() => {
    if (!authorized) return
    setHandoversLoading(true)
    setSelectedHandoverId('')
    setItems([])
    authFetch(`${BASE}/handover/entries?date=${date}`, { headers: getHeaders() })
      .then(r => r.ok ? r.json() : [])
      .then((data: Handover[]) => {
        const eligible = data.filter(
          h => h.phase !== 'readings_superseded' && h.review_status !== 'approved'
        )
        setHandovers(eligible)
        if (eligible.length === 1) setSelectedHandoverId(eligible[0].handover_id)
      })
      .catch(() => setHandovers([]))
      .finally(() => setHandoversLoading(false))
  }, [authorized, date])

  const addItem = () => {
    const amt = parseFloat(amount)
    if (!selectedTypeId) { toast.error('Select a payment type'); return }
    if (!amt || amt <= 0) { toast.error('Enter a valid amount'); return }
    const type = posTypes.find(t => t.type_id === selectedTypeId)
    if (!type) return
    setItems(prev => [...prev, {
      type_id: type.type_id,
      type_name: type.name,
      amount: amt,
      reference: reference.trim(),
    }])
    setAmount('')
    setReference('')
  }

  const removeItem = (idx: number) => {
    setItems(prev => prev.filter((_, i) => i !== idx))
  }

  const saveAll = async () => {
    if (!selectedHandoverId || items.length === 0) return
    setSaving(true)
    try {
      const res = await authFetch(`${BASE}/handover/${selectedHandoverId}/pos-receipts`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getHeaders() },
        body: JSON.stringify({ pos_items: items }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || 'Save failed')
      }
      toast.success('POS receipts saved')
      setItems([])
    } catch (e: any) {
      toast.error(e.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const total = items.reduce((s, i) => s + i.amount, 0)

  if (!authorized) return null

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-content-primary">POS Sales</h1>
        <p className="text-sm text-content-secondary mt-1">Record POS receipts against a handover</p>
      </div>

      {/* Date + handover selector */}
      <div className="glass-card-static rounded-card p-5 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-content-secondary mb-1">Date</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full px-3 py-2 rounded-btn border border-surface-border bg-surface-bg text-content-primary text-sm focus:outline-none focus:ring-2 focus:ring-action-primary"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-content-secondary mb-1">Handover</label>
            {handoversLoading ? (
              <div className="flex items-center h-9 gap-2">
                <LoadingSpinner />
                <span className="text-sm text-content-secondary">Loading...</span>
              </div>
            ) : handovers.length === 0 ? (
              <p className="text-sm text-content-secondary py-2">No handovers for this date</p>
            ) : (
              <select
                value={selectedHandoverId}
                onChange={e => { setSelectedHandoverId(e.target.value); setItems([]) }}
                className="w-full px-3 py-2 rounded-btn border border-surface-border bg-surface-bg text-content-primary text-sm focus:outline-none focus:ring-2 focus:ring-action-primary"
              >
                <option value="">Select handover</option>
                {handovers.map(h => (
                  <option key={h.handover_id} value={h.handover_id}>
                    {h.attendant_name} - {h.shift_type} Shift
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      </div>

      {/* Entry form */}
      {selectedHandoverId && (
        <>
          <div className="glass-card-static rounded-card p-5 space-y-4">
            <h2 className="text-sm font-semibold text-content-primary">Add POS Receipt</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-content-secondary mb-1">Payment Type</label>
                <select
                  value={selectedTypeId}
                  onChange={e => setSelectedTypeId(e.target.value)}
                  className="w-full px-3 py-2 rounded-btn border border-surface-border bg-surface-bg text-content-primary text-sm focus:outline-none focus:ring-2 focus:ring-action-primary"
                >
                  {posTypes.map(t => (
                    <option key={t.type_id} value={t.type_id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-content-secondary mb-1">Amount (ZMW)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addItem()}
                  className="w-full px-3 py-2 rounded-btn border border-surface-border bg-surface-bg text-content-primary text-sm focus:outline-none focus:ring-2 focus:ring-action-primary"
                />
              </div>
            </div>
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <label className="block text-xs font-medium text-content-secondary mb-1">
                  Reference <span className="font-normal text-content-secondary/70">(optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="Slip or batch number"
                  value={reference}
                  onChange={e => setReference(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addItem()}
                  className="w-full px-3 py-2 rounded-btn border border-surface-border bg-surface-bg text-content-primary text-sm focus:outline-none focus:ring-2 focus:ring-action-primary"
                />
              </div>
              <button
                onClick={addItem}
                className="px-5 py-2 bg-action-primary text-white text-sm font-medium rounded-btn hover:opacity-90 transition-opacity whitespace-nowrap"
              >
                + Add
              </button>
            </div>
          </div>

          {/* Item list */}
          {items.length > 0 ? (
            <div className="glass-card-static rounded-card overflow-hidden">
              <div className="px-5 py-3 border-b border-surface-border">
                <h2 className="text-sm font-semibold text-content-primary">Receipts this session</h2>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-border bg-surface-bg">
                    <th className="px-5 py-2.5 text-left text-xs font-medium text-content-secondary">Payment Type</th>
                    <th className="px-5 py-2.5 text-right text-xs font-medium text-content-secondary">Amount</th>
                    <th className="px-5 py-2.5 text-left text-xs font-medium text-content-secondary">Reference</th>
                    <th className="px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr key={idx} className="border-b border-surface-border last:border-0 hover:bg-white/5">
                      <td className="px-5 py-3 text-content-primary">{item.type_name}</td>
                      <td className="px-5 py-3 text-right font-mono text-content-primary">{fmtZMW(item.amount)}</td>
                      <td className="px-5 py-3 text-content-secondary">{item.reference || '-'}</td>
                      <td className="px-3 py-3">
                        <button
                          onClick={() => removeItem(idx)}
                          className="text-xs text-status-error hover:opacity-70 transition-opacity"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-surface-bg border-t-2 border-surface-border">
                    <td className="px-5 py-3 font-semibold text-content-primary">Total</td>
                    <td className="px-5 py-3 text-right font-mono font-semibold text-content-primary">{fmtZMW(total)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
              <div className="px-5 py-4 border-t border-surface-border flex justify-end">
                <button
                  onClick={saveAll}
                  disabled={saving}
                  className="px-6 py-2 bg-action-primary text-white text-sm font-medium rounded-btn hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {saving ? 'Saving...' : 'Save All'}
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-content-secondary text-center py-6">
              No receipts added yet. Use the form above to add POS receipts.
            </p>
          )}
        </>
      )}
    </div>
  )
}
