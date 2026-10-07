import { useState } from 'react'
import toast from 'react-hot-toast'
import { getHeaders, authFetch } from '../lib/api'
import { formatTimeToDisplay } from '../lib/dateUtils'

const BASE = '/api/v1'

interface Props {
  shiftId: string
  deposits: any[]
  attendants: { attendant_id: string; attendant_name: string }[]
  theme: any
  onChanged: () => void
  canCorrect?: boolean   // manager/owner: Void and Move
}

/**
 * Manager/owner list of one attendant's safe deposits with Void and Move
 * (to the right attendant). Each needs a reason and works only while the
 * attendants involved haven't closed their shift; the server enforces that.
 */
export default function DepositCorrections({ shiftId, deposits, attendants, theme, onChanged, canCorrect = true }: Props) {
  const [action, setAction] = useState<{ id: string; kind: 'void' | 'move' } | null>(null)
  const [reason, setReason] = useState('')
  const [target, setTarget] = useState('')
  const [busy, setBusy] = useState(false)

  if (deposits.length === 0) return null

  const submit = async (d: any) => {
    if (!action || !reason.trim()) return
    setBusy(true)
    try {
      const path = action.kind === 'void' ? 'void' : 'reassign'
      const body = action.kind === 'void' ? { reason: reason.trim() } : { reason: reason.trim(), attendant_id: target }
      const res = await authFetch(`${BASE}/safe-deposits/${encodeURIComponent(shiftId)}/${encodeURIComponent(d.deposit_id)}/${path}`, {
        method: 'POST',
        headers: { ...getHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.detail || 'Could not update the deposit')
      toast.success(action.kind === 'void' ? 'Deposit voided.' : 'Deposit moved.')
      setAction(null)
      setReason('')
      onChanged()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-2 space-y-1">
      {deposits.map((d: any) => {
        const open = action?.id === d.deposit_id
        const others = attendants.filter(a => a.attendant_id !== d.attendant_id)
        return (
          <div key={d.deposit_id} className="text-xs p-1.5 rounded" style={{ backgroundColor: theme.background }}>
            <div className="flex flex-wrap justify-between items-center gap-2">
              <span style={{ color: theme.textSecondary }}>
                {d.time || formatTimeToDisplay(d.timestamp)}
                {d.recorded_by_id && d.recorded_by_id !== d.attendant_id ? ` (recorded by ${d.recorded_by_name})` : ''}
                {d.note ? ` | ${d.note}` : ''}
              </span>
              <span className="flex items-center gap-3">
                <span className="font-semibold" style={{ color: theme.textPrimary }}>K{d.amount.toLocaleString()}</span>
                {canCorrect && !open && (
                  <>
                    <button type="button" className="underline" style={{ color: 'var(--color-status-error)' }}
                      onClick={() => { setAction({ id: d.deposit_id, kind: 'void' }); setReason('') }}>Void</button>
                    {others.length > 0 && (
                      <button type="button" className="underline" style={{ color: theme.textSecondary }}
                        onClick={() => { setAction({ id: d.deposit_id, kind: 'move' }); setReason(''); setTarget(others[0].attendant_id) }}>
                        Move
                      </button>
                    )}
                  </>
                )}
              </span>
            </div>
            {open && (
              <div className="flex flex-wrap items-center gap-2 mt-1.5">
                {action!.kind === 'move' && (
                  <select value={target} onChange={e => setTarget(e.target.value)} aria-label="Move to attendant"
                    className="px-2 py-1 rounded border text-xs"
                    style={{ backgroundColor: theme.cardBg, color: theme.textPrimary, borderColor: theme.border }}>
                    {others.map(a => <option key={a.attendant_id} value={a.attendant_id}>{a.attendant_name}</option>)}
                  </select>
                )}
                <input type="text" value={reason} onChange={e => setReason(e.target.value)}
                  placeholder={action!.kind === 'void' ? 'Reason for voiding' : 'Reason for moving'}
                  className="flex-1 min-w-[10rem] px-2 py-1 rounded border text-xs"
                  style={{ backgroundColor: theme.cardBg, color: theme.textPrimary, borderColor: theme.border }} />
                <button type="button" disabled={busy || !reason.trim()} onClick={() => submit(d)}
                  className="px-2 py-1 rounded text-white disabled:opacity-50"
                  style={{ backgroundColor: action!.kind === 'void' ? 'var(--color-status-error)' : 'var(--color-action-primary)' }}>
                  {busy ? 'Saving...' : action!.kind === 'void' ? 'Void deposit' : 'Move deposit'}
                </button>
                <button type="button" onClick={() => setAction(null)} disabled={busy} style={{ color: theme.textSecondary }}>Cancel</button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}


/**
 * Supervisor/manager/owner recording a deposit at the safe for a rostered
 * attendant. It is saved against that attendant (the recorder is kept
 * separately), so it counts only towards their shift close.
 */
export function RecordDepositFor({ shiftId, attendantId, attendantName, theme, onRecorded }: {
  shiftId: string; attendantId: string; attendantName: string; theme: any; onRecorded: () => void
}) {
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) return
    setBusy(true)
    try {
      const res = await authFetch(`${BASE}/safe-deposits/`, {
        method: 'POST',
        headers: { ...getHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ shift_id: shiftId, amount: amt, note, attendant_id: attendantId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.detail || 'Could not record the deposit')
      toast.success(`Deposit of K${amt.toLocaleString()} recorded for ${attendantName}.`)
      setAmount('')
      setNote('')
      onRecorded()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  const style = { backgroundColor: theme.cardBg, color: theme.textPrimary, borderColor: theme.border }
  return (
    <div className="flex flex-wrap items-center gap-2 mt-2">
      <input type="number" min={0} step={1} value={amount} onChange={e => setAmount(e.target.value)}
        placeholder="Amount" aria-label={`Deposit amount for ${attendantName}`}
        className="w-24 px-2 py-1 rounded border text-xs" style={style} />
      <input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="Note (optional)"
        className="flex-1 min-w-[8rem] px-2 py-1 rounded border text-xs" style={style} />
      <button type="button" onClick={submit} disabled={busy || !amount}
        className="px-2 py-1 rounded text-xs text-white disabled:opacity-50"
        style={{ backgroundColor: 'var(--color-action-primary)' }}>
        {busy ? 'Saving...' : `Record for ${attendantName}`}
      </button>
    </div>
  )
}
