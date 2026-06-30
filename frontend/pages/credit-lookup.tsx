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

  const q = search.trim().toLowerCase()
  const filtered = accounts
    .filter(a =>
      !q ||
      a.account_name?.toLowerCase().includes(q) ||
      a.client_code?.toLowerCase().includes(q) ||
      a.account_type?.toLowerCase().includes(q)
    )
    .sort((a, b) => {
      // Suspended first, then alphabetical
      if (a.is_suspended !== b.is_suspended) return a.is_suspended ? -1 : 1
      return (a.account_name || '').localeCompare(b.account_name || '')
    })

  const fmtK = (v: number) =>
    `K${(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-content-primary">Credit Account Lookup</h1>
        <p className="text-sm text-content-secondary mt-1">
          Check account status and available credit before dispensing fuel on credit.
        </p>
      </div>

      <input
        type="text"
        placeholder="Search by account name or client code..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        autoFocus
        className="w-full px-4 py-3 rounded-lg border border-surface-border bg-surface-bg text-content-primary text-sm focus:outline-none focus:ring-2 focus:ring-action-primary"
      />

      {loading ? (
        <p className="text-sm text-content-secondary text-center py-8">Loading accounts...</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-content-secondary text-center py-8">No accounts found.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map(account => {
            const available = (account.credit_limit || 0) - (account.current_balance || 0)
            const utilizationPct = account.credit_limit > 0
              ? Math.min(100, Math.round((account.current_balance / account.credit_limit) * 100))
              : 0

            return (
              <div
                key={account.account_id}
                className={`rounded-lg border-2 p-4 ${
                  account.is_suspended
                    ? 'border-status-error bg-status-error/5'
                    : 'border-surface-border bg-surface-card'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {account.client_code && (
                        <span className="font-mono font-bold text-sm text-action-primary">
                          {account.client_code}
                        </span>
                      )}
                      <span className="font-bold text-content-primary truncate">
                        {account.account_name}
                      </span>
                    </div>
                    <p className="text-xs text-content-secondary mt-0.5">{account.account_type}</p>
                  </div>

                  <span className={`shrink-0 px-2 py-1 text-xs font-bold rounded uppercase ${
                    account.is_suspended
                      ? 'bg-status-error text-white'
                      : 'bg-status-success/15 text-status-success'
                  }`}>
                    {account.is_suspended ? 'Suspended' : 'Active'}
                  </span>
                </div>

                {account.is_suspended ? (
                  <p className="mt-3 text-sm font-semibold text-status-error">
                    Do not dispense fuel on credit to this account.
                  </p>
                ) : (
                  <div className="mt-3 space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-content-secondary">Balance owing</span>
                      <span className="font-mono font-semibold text-content-primary">
                        {fmtK(account.current_balance)}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-content-secondary">Credit limit</span>
                      <span className="font-mono text-content-secondary">{fmtK(account.credit_limit)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-content-secondary">Available credit</span>
                      <span className={`font-mono font-bold ${available <= 0 ? 'text-status-error' : 'text-status-success'}`}>
                        {fmtK(available)}
                      </span>
                    </div>
                    {account.credit_limit > 0 && (
                      <div className="h-1.5 rounded-full bg-surface-border overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            utilizationPct >= 90 ? 'bg-status-error' :
                            utilizationPct >= 70 ? 'bg-status-warning' : 'bg-status-success'
                          }`}
                          style={{ width: `${utilizationPct}%` }}
                        />
                      </div>
                    )}
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
