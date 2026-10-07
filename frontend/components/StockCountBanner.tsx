import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getHeaders, authFetch } from '../lib/api'
import { formatDateTimeToDisplay } from '../lib/dateUtils'

const BASE = '/api/v1'

interface Take {
  take_id: string
  bin: 'stores' | 'forecourt'
  status: string
  scope_item_keys: string[] | null
  submitted_at: string | null
}

/**
 * Dashboard reminder for managers and owners while the station is not yet
 * live on Forecourt counts: count the Forecourt and Stores (Stock Takes),
 * then the owner goes live on the Stores page. Shows when each full count
 * was last submitted. Disappears once the station is live.
 */
export default function StockCountBanner({ isOwner, className = '' }: { isOwner: boolean; className?: string }) {
  const [live, setLive] = useState<boolean | null>(null)
  const [takes, setTakes] = useState<Take[]>([])

  useEffect(() => {
    let cancelled = false
    Promise.all([
      authFetch(`${BASE}/stores/forecourt-status`, { headers: getHeaders() }).then(r => r.ok ? r.json() : null),
      authFetch(`${BASE}/stores/stock-takes`, { headers: getHeaders() }).then(r => r.ok ? r.json() : []),
    ])
      .then(([status, list]) => {
        if (cancelled) return
        // Unknown status (older backend, network error): stay hidden rather than nag.
        setLive(status ? !!status.live_since : true)
        setTakes(Array.isArray(list) ? list : [])
      })
      .catch(() => { if (!cancelled) setLive(true) })
    return () => { cancelled = true }
  }, [])

  if (live !== false) return null

  // Most recent full (all-item) count submitted for each location
  const lastFull = (bin: 'stores' | 'forecourt') => takes
    .filter(t => t.bin === bin && !t.scope_item_keys && ['submitted', 'approved'].includes(t.status) && t.submitted_at)
    .sort((a, b) => (b.submitted_at || '').localeCompare(a.submitted_at || ''))[0]
  const forecourt = lastFull('forecourt')
  const stores = lastFull('stores')

  const step = (label: string, done: Take | undefined) => (
    <li className="flex flex-wrap items-baseline gap-x-2">
      <span className={`text-xs font-semibold ${done ? 'text-status-success' : 'text-status-warning'}`}>
        {done ? 'Done' : 'To do'}
      </span>
      <span className="text-sm text-content-primary">{label}</span>
      {done && <span className="text-xs text-content-secondary">last counted {formatDateTimeToDisplay(done.submitted_at)}</span>}
    </li>
  )

  return (
    <div className={`rounded-lg border border-status-warning bg-status-warning/5 p-4 ${className}`}>
      <p className="text-sm font-semibold text-content-primary">
        Stock counts need updating before Forecourt go-live
      </p>
      <p className="text-xs text-content-secondary mt-1">
        Attendants' opening stock for LPG, lubricants and accessories is still carried forward from earlier
        shifts and does not match what is on hand. At a shift change, count everything on the Forecourt and in
        Stores, then the owner switches the station to live Forecourt counts.
      </p>
      <ol className="mt-3 space-y-1">
        {step('Stock take: Forecourt (all items)', forecourt)}
        {step('Stock take: Stores (all items)', stores)}
        <li className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-xs font-semibold text-status-warning">To do</span>
          <span className="text-sm text-content-primary">
            Owner: go live on the Stores page with &quot;keep current Forecourt counts&quot;
          </span>
        </li>
      </ol>
      <div className="flex flex-wrap gap-2 mt-3">
        <Link href="/stock-takes"
          className="px-3 py-1.5 text-xs font-semibold rounded bg-action-primary text-white">
          Open Stock Takes
        </Link>
        {isOwner && (
          <Link href="/stores"
            className="px-3 py-1.5 text-xs font-medium rounded border border-surface-border text-content-secondary hover:bg-surface-bg">
            Go to Stores page
          </Link>
        )}
      </div>
    </div>
  )
}
