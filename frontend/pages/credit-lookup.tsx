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

  const isBlocked = (a: any): boolean => {
    if (a.is_suspended) return true
    const t = effectiveType(a)
    const overdraft = a.approved_overdraft ?? 0
    if (t === 'Pre-Paid') return (a.current_balance ?? 0) <= 0 && overdraft <= 0
    return (a.credit_limit ?? 0) > 0 &&
      (a.current_balance ?? 0) >= (a.credit_limit ?? 0) + overdraft
  }

  const q = search.trim().toLowerCase()
  const filtered = accounts
    .filter((a: any) =>
      !q ||
      a.account_name?.toLowerCase().includes(q) ||
      a.client_code?.toLowerCase().includes(q) ||
      a.account_type?.toLowerCase().includes(q)
    )
    .sort((a: any, b: any) => {
      const aBlocked = isBlocked(a), bBlocked = isBlocked(b)
      if (aBlocked !== bBlocked) return aBlocked ? -1 : 1
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
          {filtered.map((account: any) => {
            const t = effectiveType(account)
            const blocked = isBlocked(account)
            const overdraft = account.approved_overdraft ?? 0

            // Pre-Paid: available = current_balance; Post-Paid: available = ceiling - owed
            const availableBalance = t === 'Pre-Paid'
              ? (account.current_balance ?? 0)
              : Math.max(0, (account.credit_limit ?? 0) - (account.current_balance ?? 0))
            const ceiling = t === 'Pre-Paid'
              ? (account.opening_balance || account.current_balance || 0)
              : (account.credit_limit ?? 0)
            const barPct = ceiling > 0
              ? Math.min(100, t === 'Pre-Paid'
                ? Math.round(((account.current_balance ?? 0) / ceiling) * 100)
                : Math.round(((account.current_balance ?? 0) / ceiling) * 100))
              : 0

            const statusLabel = account.is_suspended ? 'Suspended' : blocked ? (t === 'Pre-Paid' ? 'No Balance' : 'At Limit') : 'Active'
            const statusClass = account.is_suspended || blocked
              ? 'bg-status-error text-white'
              : 'bg-status-success/15 text-status-success'

            return (
              <div
                key={account.account_id}
                className={`rounded-lg border-2 p-4 ${
                  account.is_suspended || blocked
                    ? 'border-status-error bg-status-error/5'
                    : 'border-surface-border bg-surface-card'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {account.client_code && (
                        <span className="font-mono font-bold text-sm text-action-primary">{account.client_code}</span>
                      )}
                      <span className="font-bold text-content-primary truncate">{account.account_name}</span>
                    </div>
                    <p className="text-xs text-content-secondary mt-0.5">{t}</p>
                  </div>
                  <span className={`shrink-0 px-2 py-1 text-xs font-bold rounded uppercase ${statusClass}`}>
                    {statusLabel}
                  </span>
                </div>

                {account.is_suspended ? (
                  <p className="mt-3 text-sm font-semibold text-status-error">
                    Do not dispense fuel on credit to this account.
                  </p>
                ) : blocked ? (
                  <div className="mt-3 space-y-1">
                    <p className="text-sm font-semibold text-status-error">
                      {t === 'Pre-Paid' ? 'No balance remaining.' : 'Credit ceiling reached.'}
                    </p>
                    <p className="text-xs text-content-secondary">Owner approval required before dispensing.</p>
                  </div>
                ) : (
                  <div className="mt-3 space-y-2">
                    {t === 'Pre-Paid' ? (
                      <>
                        <div className="flex justify-between text-xs">
                          <span className="text-content-secondary">Available balance</span>
                          <span className={`font-mono font-bold ${availableBalance <= 0 ? 'text-status-error' : 'text-status-success'}`}>
                            {fmtK(availableBalance)}
                          </span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-content-secondary">Opening deposit</span>
                          <span className="font-mono text-content-secondary">{fmtK(ceiling)}</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex justify-between text-xs">
                          <span className="text-content-secondary">Amount owed</span>
                          <span className="font-mono font-semibold text-content-primary">{fmtK(account.current_balance)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-content-secondary">Credit ceiling</span>
                          <span className="font-mono text-content-secondary">{fmtK(account.credit_limit)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-content-secondary">Available credit</span>
                          <span className={`font-mono font-bold ${availableBalance <= 0 ? 'text-status-error' : 'text-status-success'}`}>
                            {fmtK(availableBalance)}
                          </span>
                        </div>
                      </>
                    )}
                    {ceiling > 0 && (
                      <div className="h-1.5 rounded-full bg-surface-border overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${
                          t === 'Pre-Paid'
                            ? (barPct <= 10 ? 'bg-status-error' : barPct <= 30 ? 'bg-status-warning' : 'bg-status-success')
                            : (barPct >= 100 ? 'bg-status-error' : barPct >= 80 ? 'bg-status-warning' : 'bg-status-success')
                        }`} style={{ width: `${barPct}%` }} />
                      </div>
                    )}
                    {overdraft > 0 && (
                      <p className="text-xs text-status-warning font-medium">
                        Owner has approved {fmtK(overdraft)} extra
                      </p>
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
