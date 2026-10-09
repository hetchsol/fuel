import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import toast from 'react-hot-toast'
import LoadingSpinner from '../components/LoadingSpinner'
import { getHeaders, authFetch } from '../lib/api'
import { formatDateToDisplay, formatDateTimeToDisplay } from '../lib/dateUtils'

const BASE = '/api/v1'

type Tab = 'todo' | 'requests'

const STATUS_STYLE: Record<string, string> = {
  pending: 'bg-status-warning/15 text-status-warning',
  approved: 'bg-status-success/15 text-status-success',
  declined: 'bg-status-error/15 text-status-error',
  withdrawn: 'bg-surface-bg text-content-secondary',
}

/**
 * Manager desk: what is waiting on the manager today (read-only, each item
 * links to where the work is done) and requests for owner-only actions.
 * The owner sees the same page and approves or declines requests here.
 */
export default function ManagerDesk() {
  const router = useRouter()
  const [role, setRole] = useState('')
  const [username, setUsername] = useState('')
  const [tab, setTab] = useState<Tab>('todo')

  useEffect(() => {
    const raw = localStorage.getItem('user')
    if (!raw) { router.push('/login'); return }
    const u = JSON.parse(raw)
    if (!['manager', 'owner'].includes(u.role)) { router.push('/'); return }
    setRole(u.role)
    setUsername(u.username)
    const q = router.query.tab
    setTab(q === 'todo' || q === 'requests' ? q : u.role === 'owner' ? 'requests' : 'todo')
  }, [router])

  if (!role) return null
  const isOwner = role === 'owner'

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-content-primary">To-Do and Requests</h1>
        <p className="text-sm mt-1 text-content-secondary">
          {isOwner
            ? 'Requests from managers wait here for your decision. Approving runs the action as you.'
            : 'What is waiting on you at this station, and actions you have asked the owner to approve.'}
        </p>
      </div>

      <div className="flex gap-0 border-b border-surface-border overflow-x-auto">
        {([['todo', 'To-Do'], ['requests', 'Requests']] as [Tab, string][]).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${
              tab === key ? 'border-action-primary text-action-primary' : 'border-transparent text-content-secondary hover:text-content-primary'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'todo' ? <TodoList /> : <Requests isOwner={isOwner} username={username} />}
    </div>
  )
}

function TodoList() {
  const [data, setData] = useState<any>(null)
  const [days, setDays] = useState(7)
  const [error, setError] = useState('')

  useEffect(() => {
    setData(null)
    setError('')
    authFetch(`${BASE}/manager/todo?days=${days}`, { headers: getHeaders() })
      .then(async r => {
        const body = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(body.detail || 'Could not load the to-do list')
        setData(body)
      })
      .catch(e => setError(e.message))
  }, [days])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-content-secondary">Look back</label>
        <select value={days} onChange={e => setDays(parseInt(e.target.value))}
          className="px-2 py-1.5 text-sm rounded border border-surface-border bg-surface-card text-content-primary">
          {[3, 7, 14, 31].map(d => <option key={d} value={d}>{d} days</option>)}
        </select>
        {data && (
          <span className="text-sm text-content-secondary">
            {data.total === 0 ? 'Nothing waiting.' : `${data.total} item${data.total === 1 ? '' : 's'} waiting`}
            {' '}since {formatDateToDisplay(data.since)}
          </span>
        )}
      </div>

      {error && <p className="text-sm text-status-error">{error}</p>}
      {!data && !error && <LoadingSpinner text="Loading..." />}

      {data && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {data.sections.map((s: any) => (
            <div key={s.key} className="rounded-lg border border-surface-border bg-surface-card">
              <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-surface-border">
                <div className="flex items-center gap-2">
                  <span className={`inline-flex min-w-[1.75rem] justify-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                    s.count === 0 ? 'bg-status-success/15 text-status-success'
                      : s.severity === 'error' ? 'bg-status-error/15 text-status-error' : 'bg-status-warning/15 text-status-warning'}`}>
                    {s.count}
                  </span>
                  <h2 className="text-sm font-semibold text-content-primary">{s.title}</h2>
                </div>
                {s.count > 0 && (
                  <Link href={s.link} className="text-xs font-medium text-action-primary hover:underline whitespace-nowrap">Open</Link>
                )}
              </div>
              {s.count === 0 ? (
                <p className="px-4 py-3 text-sm text-content-secondary">All clear.</p>
              ) : (
                <ul className="divide-y divide-surface-border max-h-64 overflow-y-auto">
                  {s.items.map((it: any, i: number) => (
                    <li key={`${it.ref}-${i}`} className="px-4 py-2">
                      <p className="text-sm text-content-primary">{it.label}</p>
                      {it.detail && <p className="text-xs text-content-secondary">{it.detail}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Requests({ isOwner, username }: { isOwner: boolean; username: string }) {
  const [rows, setRows] = useState<any[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [declining, setDeclining] = useState<string | null>(null)
  const [note, setNote] = useState('')

  const load = useCallback(() => {
    authFetch(`${BASE}/manager/requests`, { headers: getHeaders() })
      .then(r => r.ok ? r.json() : [])
      .then(setRows)
      .catch(() => setRows([]))
  }, [])
  useEffect(() => { load() }, [load])

  const act = async (rid: string, action: 'approve' | 'decline' | 'cancel', body?: any) => {
    setBusy(rid)
    try {
      const res = await authFetch(`${BASE}/manager/requests/${rid}/${action}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...getHeaders() },
        body: JSON.stringify(body || {}),
      })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof out.detail === 'string' ? out.detail : 'Failed')
      toast.success(action === 'approve' ? 'Approved and done.' : action === 'decline' ? 'Declined.' : 'Request withdrawn.')
      setDeclining(null)
      setNote('')
      load()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBusy(null)
    }
  }

  if (!rows) return <LoadingSpinner text="Loading..." />

  return (
    <div className="space-y-3">
      {!isOwner && (
        <p className="text-sm text-content-secondary">
          To ask for a void, use Void/Annul on the Shifts page or a returned entry on Handover Review.
          To ask for an overdraft, use Request Overdraft on Credit Accounts.
        </p>
      )}
      {rows.length === 0 && <p className="text-sm text-content-secondary">No requests yet.</p>}
      {rows.map(r => (
        <div key={r.request_id} className="rounded-lg border border-surface-border bg-surface-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-content-primary">{r.summary}</p>
              <p className="text-xs text-content-secondary mt-0.5">
                Asked by {r.requested_by_name} on {formatDateTimeToDisplay(r.requested_at)}
              </p>
            </div>
            <span className={`text-xs font-medium px-2 py-0.5 rounded capitalize ${STATUS_STYLE[r.status] || ''}`}>{r.status}</span>
          </div>
          <p className="text-sm text-content-primary mt-2"><span className="text-content-secondary">Reason: </span>{r.reason}</p>
          {r.type === 'overdraft' && (
            <p className="text-xs text-content-secondary mt-1">
              Current overdraft K{(r.payload?.current_overdraft || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </p>
          )}
          {r.status !== 'pending' && r.decided_at && (
            <p className="text-xs text-content-secondary mt-1">
              {r.status === 'withdrawn' ? 'Withdrawn' : `${r.status === 'approved' ? 'Approved' : 'Declined'} by ${r.decided_by_name}`}
              {' '}on {formatDateTimeToDisplay(r.decided_at)}{r.decision_note ? `: ${r.decision_note}` : ''}
            </p>
          )}

          {r.status === 'pending' && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {isOwner && declining !== r.request_id && (
                <>
                  <button disabled={busy === r.request_id} onClick={() => act(r.request_id, 'approve')}
                    className="px-3 py-1.5 text-xs font-semibold rounded bg-status-success text-white disabled:opacity-60">
                    {busy === r.request_id ? 'Working...' : 'Approve'}
                  </button>
                  <button onClick={() => { setDeclining(r.request_id); setNote('') }}
                    className="px-3 py-1.5 text-xs font-medium rounded border border-status-error text-status-error">
                    Decline
                  </button>
                </>
              )}
              {isOwner && declining === r.request_id && (
                <div className="w-full space-y-2">
                  <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
                    placeholder="Why is this declined? The manager sees this."
                    className="w-full px-3 py-2 text-sm border border-surface-border rounded-md bg-surface-bg text-content-primary" />
                  <div className="flex gap-2">
                    <button disabled={!note.trim() || busy === r.request_id}
                      onClick={() => act(r.request_id, 'decline', { note: note.trim() })}
                      className="px-3 py-1.5 text-xs font-semibold rounded bg-status-error text-white disabled:opacity-60">
                      Confirm Decline
                    </button>
                    <button onClick={() => setDeclining(null)}
                      className="px-3 py-1.5 text-xs font-medium rounded border border-surface-border text-content-secondary">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              {!isOwner && r.requested_by === username && (
                <button disabled={busy === r.request_id} onClick={() => act(r.request_id, 'cancel')}
                  className="px-3 py-1.5 text-xs font-medium rounded border border-surface-border text-content-secondary disabled:opacity-60">
                  Withdraw
                </button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
