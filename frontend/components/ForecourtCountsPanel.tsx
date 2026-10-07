import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import { getHeaders, authFetch } from '../lib/api'
import { formatDateToDisplay, formatDateTimeToDisplay } from '../lib/dateUtils'

const BASE = '/api/v1'

interface ForecourtStatus {
  live_since: string | null
  live_by: string | null
  source: string | null
  pending_count_differences: number
}

interface CountDifference {
  variance_id: string
  shift_id: string
  date: string
  shift_type: string
  attendant_name: string
  item_key: string
  label: string
  system_qty: number
  counted_qty: number
  difference: number
  note: string
  forecourt_live: boolean
  previous_attendant: string | null
  status: string
  created_at: string
}

interface GoLiveRow {
  item_key: string
  name: string
  forecourt_now: number | null
  last_closing: number
  closing_source: string
  handover_id: string | null
}

const RESPONSIBILITY: { value: string; label: string }[] = [
  { value: 'previous_shift', label: 'Previous shift' },
  { value: 'this_attendant', label: 'This attendant' },
  { value: 'stores_error', label: 'Stores / system error' },
]

/**
 * Stores page panel for the Forecourt count:
 *  - before go-live: owner previews and switches the station to the Forecourt
 *    count as every attendant's opening stock;
 *  - after: shift-start counts that differed from the system, for a manager
 *    to resolve (the Forecourt count moves to the confirmed figure).
 */
export default function ForecourtCountsPanel({ isOwner, onChanged }: { isOwner: boolean; onChanged: () => void }) {
  const [status, setStatus] = useState<ForecourtStatus | null>(null)
  const [pending, setPending] = useState<CountDifference[]>([])
  const [goLive, setGoLive] = useState<{ source: string; rows: GoLiveRow[] } | null>(null)
  const [resolving, setResolving] = useState<CountDifference | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const [sR, pR] = await Promise.all([
        authFetch(`${BASE}/stores/forecourt-status`, { headers: getHeaders() }),
        authFetch(`${BASE}/stores/opening-variances?status=pending`, { headers: getHeaders() }),
      ])
      if (sR.ok) setStatus(await sR.json())
      if (pR.ok) {
        const rows = await pR.json()
        setPending(Array.isArray(rows) ? rows : [])
      }
    } catch {
      // Panel is supplementary; the rest of the page still works without it.
    }
  }, [])

  useEffect(() => { load() }, [load])

  const previewGoLive = async (source: string) => {
    setBusy(true)
    try {
      const res = await authFetch(`${BASE}/stores/forecourt-go-live`, {
        method: 'POST', headers: getHeaders(), body: JSON.stringify({ source, dry_run: true }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Preview failed')
      setGoLive({ source, rows: data.rows || [] })
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  const applyGoLive = async () => {
    if (!goLive) return
    setBusy(true)
    try {
      const res = await authFetch(`${BASE}/stores/forecourt-go-live`, {
        method: 'POST', headers: getHeaders(), body: JSON.stringify({ source: goLive.source, dry_run: false }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Go-live failed')
      toast.success(`Forecourt counts are live. ${data.counts_changed} count(s) set.`)
      setGoLive(null)
      load()
      onChanged()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (!status) return null

  return (
    <div className="space-y-3">
      {!status.live_since ? (
        <div className="rounded-lg border border-status-warning bg-status-warning/5 p-4">
          <p className="text-sm font-semibold text-content-primary">Forecourt counts are not live yet</p>
          <p className="text-xs text-content-secondary mt-1">
            Attendants' opening stock still carries forward from the previous shift's closing count, and stock you
            issue to the forecourt does not reach them. Going live makes the Forecourt count the figure each
            attendant confirms or corrects at the start of their shift.
            Do a Forecourt and a Stores stock take at a shift change first, then keep those counts.
          </p>
          {isOwner ? (
            <div className="flex flex-wrap gap-2 mt-3">
              {/* Recommended path: count the Forecourt (Stock Takes), then keep those counts */}
              <button onClick={() => previewGoLive('current_counts')} disabled={busy}
                className="px-3 py-1.5 text-xs font-semibold rounded bg-action-primary text-white disabled:opacity-50">
                Preview: keep current Forecourt counts
              </button>
              <button onClick={() => previewGoLive('last_closing')} disabled={busy}
                className="px-3 py-1.5 text-xs font-medium rounded border border-surface-border text-content-secondary hover:bg-surface-bg disabled:opacity-50">
                Preview: use last shift closing counts
              </button>
            </div>
          ) : (
            <p className="text-xs text-content-secondary mt-2">Only the owner can switch the station over.</p>
          )}
        </div>
      ) : (
        <p className="text-xs text-content-secondary">
          Forecourt counts live since {formatDateTimeToDisplay(status.live_since)}
          {status.live_by ? ` (${status.live_by})` : ''}.
        </p>
      )}

      {pending.length > 0 && (
        <div className="rounded-lg border border-status-warning bg-surface-card overflow-hidden">
          <div className="px-4 py-3 border-b border-surface-border">
            <p className="text-sm font-semibold text-content-primary">
              Shift-start counts to review ({pending.length})
            </p>
            <p className="text-xs text-content-secondary mt-0.5">
              An attendant's count did not match the system. Resolving moves the Forecourt count to the confirmed
              figure and records who is responsible for the difference.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-surface-bg">
                <tr>
                  {['Shift', 'Attendant', 'Item', 'System', 'Counted', 'Difference', 'Note', ''].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-medium uppercase text-content-secondary">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pending.map(v => (
                  <tr key={v.variance_id} className="border-t border-surface-border">
                    <td className="px-3 py-2 whitespace-nowrap text-content-primary">{formatDateToDisplay(v.date)} {v.shift_type}</td>
                    <td className="px-3 py-2 text-content-primary">{v.attendant_name}</td>
                    <td className="px-3 py-2 text-content-primary">{v.label}</td>
                    <td className="px-3 py-2 font-mono text-content-primary">{v.system_qty}</td>
                    <td className="px-3 py-2 font-mono text-content-primary">{v.counted_qty}</td>
                    <td className={`px-3 py-2 font-mono ${v.difference < 0 ? 'text-status-error' : 'text-status-warning'}`}>
                      {v.difference > 0 ? '+' : ''}{v.difference}
                    </td>
                    <td className="px-3 py-2 text-xs text-content-secondary max-w-xs">{v.note}</td>
                    <td className="px-3 py-2">
                      <button onClick={() => setResolving(v)}
                        className="px-3 py-1 text-xs font-semibold rounded bg-action-primary text-white">
                        Resolve
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {goLive && (
        <GoLiveModal source={goLive.source} rows={goLive.rows} busy={busy}
          onApply={applyGoLive} onClose={() => setGoLive(null)} />
      )}
      {resolving && (
        <ResolveModal row={resolving}
          onClose={() => setResolving(null)}
          onDone={() => { setResolving(null); load(); onChanged() }} />
      )}
    </div>
  )
}

function GoLiveModal({ source, rows, busy, onApply, onClose }: {
  source: string; rows: GoLiveRow[]; busy: boolean; onApply: () => void; onClose: () => void
}) {
  const [confirmed, setConfirmed] = useState(false)
  const [zeroAccepted, setZeroAccepted] = useState(false)
  const target = (r: GoLiveRow) => source === 'last_closing' ? r.last_closing : (r.forecourt_now ?? 0)
  const changes = rows.filter(r => target(r) !== (r.forecourt_now ?? 0)).length
  // Counts the switch would wipe: stock on the Forecourt now, 0 afterwards
  const zeroed = rows.filter(r => (r.forecourt_now ?? 0) > 0 && target(r) === 0)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-surface-card rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="px-5 py-4 border-b border-surface-border">
          <h2 className="text-lg font-semibold text-content-primary">Switch to live Forecourt counts</h2>
          <p className="text-xs text-content-secondary mt-1">
            {source === 'last_closing'
              ? `Each Forecourt count will be set to the last shift's closing count (${changes} change${changes === 1 ? '' : 's'}).`
              : 'The Forecourt counts stay as they are. Use this only if you have just counted the forecourt.'}
            {' '}Shifts already started keep the old behaviour. This can only be done once.
          </p>
        </div>
        {zeroed.length > 0 && (
          <div className="mx-5 mt-4 rounded border border-status-error bg-status-error/5 p-3">
            <p className="text-sm font-semibold text-status-error">
              {zeroed.length} item{zeroed.length === 1 ? '' : 's'} on the Forecourt would be set to 0
            </p>
            <p className="text-xs text-content-secondary mt-1">
              {zeroed.slice(0, 6).map(r => `${r.name} (${r.forecourt_now})`).join(', ')}
              {zeroed.length > 6 ? `, and ${zeroed.length - 6} more` : ''}.
              The last shift closing shows none of these. If the stock is physically there, cancel, do a Forecourt
              stock take, and go live with &quot;keep current Forecourt counts&quot; instead.
            </p>
          </div>
        )}
        <div className="overflow-auto flex-1">
          <table className="min-w-full text-sm">
            <thead className="bg-surface-bg sticky top-0">
              <tr>
                {['Item', 'Forecourt now', 'Last closing', 'Will be'].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-xs font-medium uppercase text-content-secondary">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const after = target(r)
                const changed = after !== (r.forecourt_now ?? 0)
                const wiped = (r.forecourt_now ?? 0) > 0 && after === 0
                return (
                  <tr key={r.item_key} className={`border-t border-surface-border ${wiped ? 'bg-status-error/5' : ''}`}>
                    <td className="px-3 py-1.5 text-content-primary">{r.name}</td>
                    <td className="px-3 py-1.5 font-mono text-content-secondary">{r.forecourt_now ?? 'not set up'}</td>
                    <td className="px-3 py-1.5 font-mono text-content-secondary">{r.last_closing}</td>
                    <td className={`px-3 py-1.5 font-mono ${wiped ? 'text-status-error font-semibold' : changed ? 'text-status-warning font-semibold' : 'text-content-primary'}`}>{after}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-4 border-t border-surface-border space-y-3">
          <label className="flex items-start gap-2 text-sm text-content-primary cursor-pointer">
            <input type="checkbox" className="mt-0.5" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />
            <span>I have checked these figures against what is on the forecourt.</span>
          </label>
          {zeroed.length > 0 && (
            <label className="flex items-start gap-2 text-sm text-status-error cursor-pointer">
              <input type="checkbox" className="mt-0.5" checked={zeroAccepted} onChange={e => setZeroAccepted(e.target.checked)} />
              <span>I understand {zeroed.length} Forecourt count{zeroed.length === 1 ? '' : 's'} will be set to 0.</span>
            </label>
          )}
          <div className="flex justify-end gap-2">
            <button onClick={onClose} disabled={busy}
              className="px-4 py-2 text-sm rounded border border-surface-border text-content-secondary">Cancel</button>
            <button onClick={onApply} disabled={busy || !confirmed || (zeroed.length > 0 && !zeroAccepted)}
              className="px-4 py-2 text-sm font-semibold rounded bg-action-primary text-white disabled:opacity-50">
              {busy ? 'Switching...' : 'Go live'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ResolveModal({ row, onClose, onDone }: { row: CountDifference; onClose: () => void; onDone: () => void }) {
  const [responsibility, setResponsibility] = useState('previous_shift')
  const [confirmedQty, setConfirmedQty] = useState(String(row.counted_qty))
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const qty = Number(confirmedQty)
  const qtyValid = confirmedQty !== '' && Number.isInteger(qty) && qty >= 0
  const move = qtyValid ? qty - row.system_qty : 0

  const submit = async () => {
    setBusy(true)
    try {
      const res = await authFetch(`${BASE}/stores/opening-variances/${encodeURIComponent(row.variance_id)}/resolve`, {
        method: 'POST', headers: getHeaders(),
        body: JSON.stringify({ responsibility, note: note.trim(), confirmed_qty: qty }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Could not resolve')
      toast.success(`${row.label}: count difference resolved.`)
      onDone()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-surface-card rounded-lg shadow-xl w-full max-w-md p-5 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-content-primary">Resolve count difference</h2>
          <p className="text-xs text-content-secondary mt-1">
            {row.attendant_name}, {formatDateToDisplay(row.date)} {row.shift_type}: {row.label}.
            System {row.system_qty}, counted {row.counted_qty}.
            {row.previous_attendant ? ` Previous shift: ${row.previous_attendant}.` : ''}
          </p>
          {row.note && <p className="text-xs text-content-secondary mt-1">Attendant's note: {row.note}</p>}
        </div>
        <div>
          <label className="block text-xs font-medium text-content-secondary mb-1">Confirmed count at shift start</label>
          <input type="number" min={0} step={1} value={confirmedQty} onChange={e => setConfirmedQty(e.target.value)}
            className="w-32 px-2 py-1.5 text-sm font-mono rounded border border-surface-border bg-surface-bg text-content-primary" />
          <p className="text-xs text-content-secondary mt-1">
            {!row.forecourt_live
              ? 'This station was not live on Forecourt counts at the time, so no count moves.'
              : move === 0 ? 'The Forecourt count will not change.'
              : `The Forecourt count will move by ${move > 0 ? '+' : ''}${move}.`}
          </p>
        </div>
        <div>
          <label className="block text-xs font-medium text-content-secondary mb-1">Responsible for the difference</label>
          <select value={responsibility} onChange={e => setResponsibility(e.target.value)}
            className="w-full px-2 py-1.5 text-sm rounded border border-surface-border bg-surface-bg text-content-primary">
            {RESPONSIBILITY.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-content-secondary mb-1">Note</label>
          <textarea rows={2} value={note} onChange={e => setNote(e.target.value)}
            placeholder="e.g. Recounted with the attendant, one cylinder was in the cage"
            className="w-full px-2 py-1.5 text-sm rounded border border-surface-border bg-surface-bg text-content-primary" />
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} disabled={busy}
            className="px-4 py-2 text-sm rounded border border-surface-border text-content-secondary">Cancel</button>
          <button onClick={submit} disabled={busy || !qtyValid || !note.trim()}
            className="px-4 py-2 text-sm font-semibold rounded bg-action-primary text-white disabled:opacity-50">
            {busy ? 'Saving...' : 'Resolve'}
          </button>
        </div>
      </div>
    </div>
  )
}
