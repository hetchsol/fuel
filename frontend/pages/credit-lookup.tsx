import { useState, useEffect } from 'react'
import { getHeaders, authFetch } from '../lib/api'

const BASE = '/api/v1'

export default function CreditLookup() {
  const [accounts, setAccounts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    authFetch(`${BASE}/accounts/`, { headers: getHeaders() })
      .then(r => r.ok ? r.json() : [])
      .then(data => setAccounts(Array.isArray(data) ? data : []))
      .catch(() => setAccounts([]))
      .finally(() => setLoading(false))
  }, [])

  const effectiveType = (a: any): 'Pre-Paid' | 'Post-Paid' =>
    a.account_type === 'Pre-Paid' ? 'Pre-Paid' : 'Post-Paid'

  const getStatus = (a: any): { ok: boolean; reason?: string } => {
    if (a.is_suspended) return { ok: false, reason: 'Account suspended' }
    const t = effectiveType(a)
    const overdraft = a.approved_overdraft ?? 0
    if (t === 'Pre-Paid') {
      const available = (a.current_balance ?? 0) + overdraft
      if (available <= 0) return { ok: false, reason: 'No balance remaining' }
    } else {
      const ceiling = (a.credit_limit ?? 0) + overdraft
      if (ceiling > 0 && (a.current_balance ?? 0) >= ceiling)
        return { ok: false, reason: 'Credit ceiling reached' }
    }
    return { ok: true }
  }

  const getAvailable = (a: any): number => {
    const t = effectiveType(a)
    const overdraft = a.approved_overdraft ?? 0
    if (t === 'Pre-Paid') return Math.max(0, (a.current_balance ?? 0) + overdraft)
    const ceiling = (a.credit_limit ?? 0) + overdraft
    return Math.max(0, ceiling - (a.current_balance ?? 0))
  }

  const fmt = (v: number) =>
    `K${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  const q = search.trim().toLowerCase()
  const filtered = accounts.filter(a =>
    !q ||
    a.account_name?.toLowerCase().includes(q) ||
    a.client_code?.toLowerCase().includes(q)
  )

  return (
    <div className="max-w-lg mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-content-primary">Credit Lookup</h1>
        <p className="text-sm text-content-secondary mt-1">
          Search an account to check if you can dispense fuel on credit.
        </p>
      </div>

      <input
        type="text"
        placeholder="Account name or client code..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        autoFocus
        className="w-full px-4 py-3 rounded-lg border border-surface-border bg-surface-bg text-content-primary text-sm focus:outline-none focus:ring-2 focus:ring-action-primary"
      />

      {loading ? (
        <p className="text-sm text-content-secondary text-center py-8">Loading...</p>
      ) : !q ? (
        <p className="text-sm text-content-secondary text-center py-8">Type to search.</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-content-secondary text-center py-8">No account found.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((account: any) => {
            const status = getStatus(account)
            const available = getAvailable(account)

            return (
              <div
                key={account.account_id}
                className={`rounded-lg border-2 p-5 ${
                  status.ok
                    ? 'border-status-success bg-status-success/5'
                    : 'border-status-error bg-status-error/5'
                }`}
              >
                {/* Account identity */}
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div>
                    <p className="font-bold text-content-primary text-lg leading-tight">{account.account_name}</p>
                    {account.client_code && (
                      <p className="text-xs text-content-secondary mt-0.5">
                        Client code: <span className="font-mono font-bold text-action-primary">{account.client_code}</span>
                      </p>
                    )}
                  </div>
                  <span className={`shrink-0 px-3 py-1 text-xs font-bold rounded uppercase tracking-wide ${
                    status.ok ? 'bg-status-success text-white' : 'bg-status-error text-white'
                  }`}>
                    {status.ok ? 'Clear' : 'Blocked'}
                  </span>
                </div>

                {status.ok ? (
                  <div>
                    <p className="text-xs text-content-secondary mb-1">Available to dispense</p>
                    <p className="text-3xl font-bold text-status-success">{fmt(available)}</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm font-semibold text-status-error">{status.reason}</p>
                    <p className="text-xs text-content-secondary mt-1">Do not dispense fuel on credit. Contact the manager.</p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
