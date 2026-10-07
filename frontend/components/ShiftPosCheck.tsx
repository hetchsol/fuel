import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { getHeaders, authFetch } from '../lib/api'

const BASE = '/api/v1'
const fmtK = (v: number) => `K${(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

interface Check {
  shift_id: string
  slips_total: number
  slips_by_bank: { bank: string | null; total: number }[]
  machine_entries: { bank: string | null; amount: number }[]
  machine_total: number | null
  difference: number | null
  threshold: number
  status: 'not_entered' | 'match' | 'mismatch'
  attendants: { attendant_id: string; attendant_name: string; closed: boolean; slips: number; slips_total: number }[]
  all_closed: boolean
  entered_by: string | null
  note: string | null
  banks: string[]
}

interface Line { bank: string; amount: string }

/**
 * Card machines are shared on a shift. Each attendant answers for their own
 * slips; this checks the machines' printed totals against every attendant's
 * card slips combined, once per shift.
 */
export default function ShiftPosCheck({ shiftId, label }: { shiftId: string; label?: string }) {
  const [check, setCheck] = useState<Check | null>(null)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const [lines, setLines] = useState<Line[]>([])
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    setError('')
    authFetch(`${BASE}/handover/shift/${encodeURIComponent(shiftId)}/pos-check`, { headers: getHeaders() })
      .then(async r => {
        const body = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(body.detail || 'Could not load the card machine check')
        return body
      })
      .then((c: Check) => setCheck(c))
      .catch(e => setError(e.message))
  }, [shiftId])

  useEffect(() => { setCheck(null); setEditing(false); load() }, [load])

  const startEdit = () => {
    if (!check) return
    setLines(check.machine_entries.length
      ? check.machine_entries.map(e => ({ bank: e.bank || '', amount: String(e.amount) }))
      : [{ bank: '', amount: '' }])
    setNote(check.note || '')
    setEditing(true)
  }

  const save = async () => {
    const entries = lines
      .filter(l => l.amount !== '')
      .map(l => ({ bank: l.bank || null, amount: parseFloat(l.amount) || 0 }))
    if (entries.length === 0) { toast.error('Enter at least one machine total.'); return }
    setSaving(true)
    try {
      const res = await authFetch(`${BASE}/handover/shift/${encodeURIComponent(shiftId)}/pos-check`, {
        method: 'PUT',
        headers: { ...getHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries, note: note.trim() || null }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.detail || 'Could not save machine totals')
      setCheck(body)
      setEditing(false)
      toast.success('Card machine totals saved.')
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (error) return <p className="text-xs text-status-error">{error}</p>
  if (!check) return null

  const statusText = check.status === 'not_entered'
    ? 'Machine totals not entered yet'
    : check.status === 'match'
      ? 'Machine totals match the slips'
      : `Difference of ${fmtK(Math.abs(check.difference || 0))} (slips ${(check.difference || 0) > 0 ? 'more' : 'less'} than machines)`
  const statusClass = check.status === 'match' ? 'text-status-success'
    : check.status === 'mismatch' ? 'text-status-error' : 'text-status-warning'

  return (
    <div className="rounded-lg border border-surface-border bg-surface-card p-4 space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-content-primary">Card machine check{label ? `: ${label}` : ''}</p>
        <p className={`text-sm font-medium ${statusClass}`}>{statusText}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-xs font-semibold uppercase text-content-secondary mb-1">Attendants' card slips</p>
          {check.attendants.length === 0 && <p className="text-xs text-content-secondary">No handovers yet.</p>}
          {check.attendants.map(a => (
            <div key={a.attendant_id} className="flex justify-between">
              <span className="text-content-primary">
                {a.attendant_name}
                {!a.closed && <span className="text-xs text-status-warning ml-1">(not closed yet)</span>}
              </span>
              <span className="font-mono text-content-primary">{a.slips} slip{a.slips === 1 ? '' : 's'}, {fmtK(a.slips_total)}</span>
            </div>
          ))}
          <div className="flex justify-between border-t border-surface-border mt-1 pt-1 font-semibold">
            <span className="text-content-primary">All slips</span>
            <span className="font-mono text-content-primary">{fmtK(check.slips_total)}</span>
          </div>
          {check.slips_by_bank.length > 1 && (
            <p className="text-xs text-content-secondary mt-1">
              By bank: {check.slips_by_bank.map(b => `${b.bank || 'not specified'} ${fmtK(b.total)}`).join(', ')}
            </p>
          )}
        </div>

        <div>
          <p className="text-xs font-semibold uppercase text-content-secondary mb-1">Machine totals (printed)</p>
          {!editing ? (
            <>
              {check.machine_entries.length === 0 && <p className="text-xs text-content-secondary">None entered.</p>}
              {check.machine_entries.map((e, i) => (
                <div key={i} className="flex justify-between">
                  <span className="text-content-primary">{e.bank || `Machine ${i + 1}`}</span>
                  <span className="font-mono text-content-primary">{fmtK(e.amount)}</span>
                </div>
              ))}
              {check.machine_total !== null && (
                <div className="flex justify-between border-t border-surface-border mt-1 pt-1 font-semibold">
                  <span className="text-content-primary">All machines</span>
                  <span className="font-mono text-content-primary">{fmtK(check.machine_total)}</span>
                </div>
              )}
              {check.note && <p className="text-xs text-content-secondary mt-1">Note: {check.note}</p>}
              <button type="button" onClick={startEdit}
                className="mt-2 px-3 py-1.5 text-xs font-semibold rounded bg-action-primary text-white">
                {check.machine_entries.length ? 'Edit machine totals' : 'Enter machine totals'}
              </button>
            </>
          ) : (
            <div className="space-y-2">
              {lines.map((l, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select value={l.bank} onChange={e => setLines(prev => prev.map((x, j) => j === i ? { ...x, bank: e.target.value } : x))}
                    aria-label="Bank"
                    className="px-2 py-1.5 text-xs rounded border border-surface-border bg-surface-bg text-content-primary">
                    <option value="">Bank (optional)</option>
                    {check.banks.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                  <input type="number" min={0} step="0.01" value={l.amount} placeholder="0.00" aria-label="Machine total"
                    onChange={e => setLines(prev => prev.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))}
                    className="w-28 px-2 py-1.5 text-sm text-right font-mono rounded border border-surface-border bg-surface-bg text-content-primary" />
                  <button type="button" onClick={() => setLines(prev => prev.filter((_, j) => j !== i))}
                    className="text-xs text-content-secondary">Remove</button>
                </div>
              ))}
              <button type="button" onClick={() => setLines(prev => [...prev, { bank: '', amount: '' }])}
                className="px-3 py-1 text-xs rounded border border-surface-border text-content-primary">Add machine</button>
              <input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="Note (optional)"
                className="w-full px-2 py-1.5 text-xs rounded border border-surface-border bg-surface-bg text-content-primary" />
              <div className="flex gap-2">
                <button type="button" onClick={save} disabled={saving}
                  className="px-3 py-1.5 text-xs font-semibold rounded bg-action-primary text-white disabled:opacity-50">
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <button type="button" onClick={() => setEditing(false)} disabled={saving}
                  className="px-3 py-1.5 text-xs rounded border border-surface-border text-content-secondary">Cancel</button>
              </div>
            </div>
          )}
        </div>
      </div>
      {!check.all_closed && check.attendants.length > 0 && (
        <p className="text-xs text-content-secondary">
          Some attendants have not closed yet, so their slips may still change.
        </p>
      )}
    </div>
  )
}
