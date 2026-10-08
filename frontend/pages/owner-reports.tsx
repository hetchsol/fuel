import { useState, useEffect, useCallback, useMemo, Fragment } from 'react'
import { useRouter } from 'next/router'
import LoadingSpinner from '../components/LoadingSpinner'
import ExportButtons from '../components/ExportButtons'
import { ExportConfig } from '../lib/exportUtils'
import { getHeaders, authFetch } from '../lib/api'
import { formatDateToDisplay } from '../lib/dateUtils'

const BASE = '/api/v1'
type Tab = 'scorecard' | 'payments' | 'stock'

const fmtK = (v: number | null | undefined) =>
  `K${(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtN = (v: number | null | undefined) => (v || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })
const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const monthLabel = (m: string) => {
  const [y, mo] = m.split('-').map(Number)
  return new Date(y, (mo || 1) - 1, 1).toLocaleString(undefined, { month: 'short', year: 'numeric' })
}

const FLAG_LABELS: Record<string, string> = {
  cash_shortage: 'Cash shortage',
  cash_below_safe_deposits: 'Cash below own deposits',
  meter_deviation: 'Meter deviation',
  nozzle_loss_exceeded: 'Nozzle loss',
  pos_terminal_variance: 'Card machine (old)',
  stock_difference: 'Stock difference',
  count_difference: 'Shift-start count',
  duplicate_meter_reading: 'Duplicate reading',
  implausible_volume: 'Implausible volume',
  other: 'Other',
}

/** Shows when a recently added record started, so earlier dates in the range aren't read as clean. */
function FeatureNote({ dates, from, which }: { dates: any; from: string; which: ('deposits' | 'counts')[] }) {
  const lines: string[] = []
  const dep = dates?.deposits_and_slip_refs_from
  const cnt = dates?.shift_start_counts_from
  if (which.includes('deposits')) {
    if (!dep) lines.push('Deposits tied to attendants and slip references are not in use yet at this station.')
    else if (from < dep) lines.push(`Deposits tied to attendants and required slip references started on ${formatDateToDisplay(dep)}. Earlier dates have less detail.`)
  }
  if (which.includes('counts')) {
    if (!cnt) lines.push('Shift-start stock counts start when the owner goes live on the Stores page; none yet.')
    else if (from < cnt) lines.push(`Shift-start stock counts started on ${formatDateToDisplay(cnt)}. Earlier dates have none.`)
  }
  if (!lines.length) return null
  return (
    <div className="rounded-lg border border-status-warning bg-status-warning/5 px-4 py-2 text-xs text-content-secondary space-y-0.5">
      {lines.map(l => <p key={l}>{l}</p>)}
    </div>
  )
}

const th = 'px-3 py-2 text-left text-xs font-medium uppercase text-content-secondary whitespace-nowrap'
const td = 'px-3 py-2 text-sm text-content-primary whitespace-nowrap'
const tdNum = `${td} text-right font-mono`

export default function OwnerReports() {
  const router = useRouter()
  const [allowed, setAllowed] = useState(false)
  const [tab, setTab] = useState<Tab>('scorecard')
  const today = new Date()
  const [from, setFrom] = useState(isoDay(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29)))
  const [to, setTo] = useState(isoDay(today))
  const [data, setData] = useState<Record<Tab, any>>({ scorecard: null, payments: null, stock: null })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const raw = localStorage.getItem('user')
    if (!raw) { router.push('/login'); return }
    const u = JSON.parse(raw)
    if (u.role !== 'owner') { router.push('/'); return }
    setAllowed(true)
  }, [router])

  const load = useCallback(async (which: Tab) => {
    const path = which === 'scorecard' ? 'attendant-scorecard' : which === 'payments' ? 'payment-totals' : 'stock-losses'
    setLoading(true)
    setError('')
    try {
      const res = await authFetch(`${BASE}/owner-reports/${path}?from=${from}&to=${to}`, { headers: getHeaders() })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.detail || 'Could not load the report')
      setData(prev => ({ ...prev, [which]: body }))
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [from, to])

  // Reload the open tab when the dates change; other tabs reload when opened
  useEffect(() => {
    if (!allowed) return
    setData({ scorecard: null, payments: null, stock: null })
  }, [from, to, allowed])
  useEffect(() => {
    if (allowed && !data[tab]) load(tab)
  }, [allowed, tab, data, load])

  if (!allowed) return null

  const range = `${formatDateToDisplay(from)} to ${formatDateToDisplay(to)}`
  const TABS: { key: Tab; label: string }[] = [
    { key: 'scorecard', label: 'Attendant Scorecard' },
    { key: 'payments', label: 'Payment Totals' },
    { key: 'stock', label: 'Stock Losses' },
  ]

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-content-primary">Owner Reports</h1>
        <p className="text-sm mt-1 text-content-secondary">
          Read-only. Voided entries and replaced attempts are left out.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-content-secondary mb-1">From</label>
          <input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)}
            className="px-2 py-1.5 text-sm rounded border border-surface-border bg-surface-card text-content-primary" />
        </div>
        <div>
          <label className="block text-xs font-medium text-content-secondary mb-1">To</label>
          <input type="date" value={to} min={from} onChange={e => setTo(e.target.value)}
            className="px-2 py-1.5 text-sm rounded border border-surface-border bg-surface-card text-content-primary" />
        </div>
      </div>

      <div className="flex gap-0 border-b border-surface-border overflow-x-auto">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${
              tab === t.key ? 'border-action-primary text-action-primary' : 'border-transparent text-content-secondary hover:text-content-primary'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-status-error">{error}</p>}
      {loading && !data[tab] && <LoadingSpinner text="Loading report..." />}

      {tab === 'scorecard' && data.scorecard && <Scorecard data={data.scorecard} from={from} range={range} />}
      {tab === 'payments' && data.payments && <Payments data={data.payments} from={from} range={range} />}
      {tab === 'stock' && data.stock && <StockLosses data={data.stock} from={from} range={range} />}
    </div>
  )
}

// ── 1. Attendant scorecard ──────────────────────────────────────────

// Scorecard columns: header, how a row sorts on it, and which way the first click sorts
type SortDir = 'asc' | 'desc'
const SCORE_COLUMNS = (threshold: number): { label: string; key: string; value: (r: any) => number | string; first: SortDir }[] => [
  { label: 'Attendant', key: 'attendant_name', value: r => (r.attendant_name || r.attendant_id || '').toLowerCase(), first: 'asc' },
  { label: 'Shifts', key: 'shifts_closed', value: r => r.shifts_closed, first: 'desc' },
  { label: 'Sales', key: 'sales', value: r => r.sales, first: 'desc' },
  { label: 'Cash short', key: 'cash_short', value: r => r.cash_short, first: 'desc' },
  { label: 'Cash over', key: 'cash_over', value: r => r.cash_over, first: 'desc' },
  // Net cash: biggest shortfall (most negative) first
  { label: 'Net cash', key: 'net_cash', value: r => r.net_cash, first: 'asc' },
  { label: `Short > K${threshold}`, key: 'shifts_short_over_threshold', value: r => r.shifts_short_over_threshold, first: 'desc' },
  { label: 'Stock short', key: 'stock_short_value', value: r => r.stock_short_value, first: 'desc' },
  { label: 'Count diffs', key: 'count_differences', value: r => r.count_differences, first: 'desc' },
  { label: 'Flagged', key: 'flagged_shifts', value: r => r.flagged_shifts, first: 'desc' },
  { label: 'Deposits', key: 'deposit_total', value: r => r.deposit_total, first: 'desc' },
  { label: 'Voided / moved', key: 'deposits_corrected', value: r => (r.deposits_voided || 0) + (r.deposits_moved_away || 0), first: 'desc' },
  { label: 'Overdue', key: 'overdue_reminders', value: r => r.overdue_reminders, first: 'desc' },
]

function Scorecard({ data, from, range }: { data: any; from: string; range: string }) {
  const [open, setOpen] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState('net_cash')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [nameFilter, setNameFilter] = useState('')
  const columns = SCORE_COLUMNS(data.cash_shortage_threshold)

  // Filtered by name, then sorted by the chosen column (ties by name)
  const rows: any[] = useMemo(() => {
    const col = columns.find(c => c.key === sortKey) || columns[0]
    const q = nameFilter.trim().toLowerCase()
    const list = (data.attendants || []).filter((r: any) =>
      !q || (r.attendant_name || '').toLowerCase().includes(q) || (r.attendant_id || '').toLowerCase().includes(q))
    return [...list].sort((a: any, b: any) => {
      const va = col.value(a), vb = col.value(b)
      const cmp = typeof va === 'string' ? String(va).localeCompare(String(vb)) : (Number(va) || 0) - (Number(vb) || 0)
      if (cmp !== 0) return sortDir === 'asc' ? cmp : -cmp
      return (a.attendant_name || '').localeCompare(b.attendant_name || '')
    })
  }, [data.attendants, sortKey, sortDir, nameFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  const sortBy = (key: string) => {
    const col = columns.find(c => c.key === key)!
    if (key === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir(col.first) }
  }
  const sortHint = (key: string) => {
    if (key !== sortKey) return ''
    if (key === 'attendant_name') return sortDir === 'asc' ? 'A to Z' : 'Z to A'
    return sortDir === 'desc' ? 'high first' : 'low first'
  }

  const getConfig = useCallback((): ExportConfig | null => rows.length ? {
    title: 'Attendant Scorecard',
    subtitle: range,
    filename: `attendant_scorecard_${from}`,
    columns: [
      { header: 'Attendant', key: 'attendant_name' },
      { header: 'Shifts', key: 'shifts_closed', format: 'number' },
      { header: 'Sales', key: 'sales', format: 'currency' },
      { header: 'Cash short', key: 'cash_short', format: 'currency' },
      { header: 'Cash over', key: 'cash_over', format: 'currency' },
      { header: 'Net cash', key: 'net_cash', format: 'currency' },
      { header: `Shifts short over K${data.cash_shortage_threshold}`, key: 'shifts_short_over_threshold', format: 'number' },
      { header: 'Stock short (units)', key: 'stock_short_units', format: 'number' },
      { header: 'Stock short (value)', key: 'stock_short_value', format: 'currency' },
      { header: 'Count differences', key: 'count_differences', format: 'number' },
      { header: 'Ruled their responsibility', key: 'count_differences_their_responsibility', format: 'number' },
      { header: 'Flagged shifts', key: 'flagged_shifts', format: 'number' },
      { header: 'Deposits', key: 'deposits', format: 'number' },
      { header: 'Deposit total', key: 'deposit_total', format: 'currency' },
      { header: 'Deposits voided', key: 'deposits_voided', format: 'number' },
      { header: 'Deposits moved away', key: 'deposits_moved_away', format: 'number' },
      { header: 'Overdue reminders', key: 'overdue_reminders', format: 'number' },
    ],
    data: rows,
  } : null, [rows, range, from, data.cash_shortage_threshold])

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-content-secondary">
          Click a column heading to sort by it, again to reverse. Click an attendant for their shifts.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input type="text" value={nameFilter} onChange={e => setNameFilter(e.target.value)}
            placeholder="Filter by attendant" aria-label="Filter by attendant"
            className="px-2 py-1.5 text-sm rounded border border-surface-border bg-surface-card text-content-primary" />
          <ExportButtons getConfig={getConfig} />
        </div>
      </div>
      <FeatureNote dates={data.feature_dates} from={from} which={['deposits', 'counts']} />
      {rows.length === 0 ? (
        <p className="text-sm text-content-secondary">
          {(data.attendants || []).length ? 'No attendant matches that filter.' : 'No closed shifts in this period.'}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-surface-border bg-surface-card">
          <table className="min-w-full">
            <thead className="bg-surface-bg">
              <tr>
                {columns.map(c => (
                  <th key={c.key} className={th} aria-sort={c.key === sortKey ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                    <button type="button" onClick={() => sortBy(c.key)}
                      className={`uppercase text-left hover:text-content-primary ${c.key === sortKey ? 'text-action-primary' : ''}`}>
                      {c.label}
                      {c.key === sortKey && <span className="block normal-case font-normal text-[10px]">{sortHint(c.key)}</span>}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <Fragment key={r.attendant_id}>
                  <tr className="border-t border-surface-border cursor-pointer hover:bg-surface-bg"
                    onClick={() => setOpen(o => o === r.attendant_id ? null : r.attendant_id)}>
                    <td className={`${td} font-medium text-action-primary`}>{r.attendant_name || r.attendant_id}</td>
                    <td className={tdNum}>{r.shifts_closed}</td>
                    <td className={tdNum}>{fmtK(r.sales)}</td>
                    <td className={`${tdNum} ${r.cash_short ? 'text-status-error' : ''}`}>{fmtK(r.cash_short)}</td>
                    <td className={tdNum}>{fmtK(r.cash_over)}</td>
                    <td className={`${tdNum} font-semibold ${r.net_cash < 0 ? 'text-status-error' : ''}`}>{fmtK(r.net_cash)}</td>
                    <td className={`${tdNum} ${r.shifts_short_over_threshold ? 'text-status-error font-semibold' : ''}`}>{r.shifts_short_over_threshold}</td>
                    <td className={tdNum}>{r.stock_short_units ? `${fmtN(r.stock_short_units)} (${fmtK(r.stock_short_value)})` : '0'}</td>
                    <td className={tdNum}>
                      {r.count_differences}
                      {r.count_differences_their_responsibility ? <span className="text-status-error"> ({r.count_differences_their_responsibility} theirs)</span> : null}
                    </td>
                    <td className={tdNum}>{r.flagged_shifts}</td>
                    <td className={tdNum}>{r.deposits} ({fmtK(r.deposit_total)})</td>
                    <td className={tdNum}>{r.deposits_voided} / {r.deposits_moved_away}</td>
                    <td className={`${tdNum} ${r.overdue_reminders ? 'text-status-warning' : ''}`}>{r.overdue_reminders}</td>
                  </tr>
                  {open === r.attendant_id && (
                    <tr className="bg-surface-bg">
                      <td colSpan={13} className="px-3 py-3">
                        {Object.keys(r.flags || {}).length > 0 && (
                          <p className="text-xs text-content-secondary mb-2">
                            Flags: {Object.entries(r.flags).map(([k, n]) => `${FLAG_LABELS[k] || k} ${n}`).join(', ')}
                          </p>
                        )}
                        <table className="min-w-full">
                          <thead>
                            <tr>{['Date', 'Shift', 'Sales', 'Cash difference', 'Own deposits', 'Stock short', 'Status'].map(h => <th key={h} className={th}>{h}</th>)}</tr>
                          </thead>
                          <tbody>
                            {r.shifts.map((s: any) => (
                              <tr key={s.handover_id} className="border-t border-surface-border">
                                <td className={td}>{formatDateToDisplay(s.date)}</td>
                                <td className={td}>{s.shift_type}</td>
                                <td className={tdNum}>{fmtK(s.sales)}</td>
                                <td className={`${tdNum} ${s.difference < 0 ? 'text-status-error' : ''}`}>{fmtK(s.difference)}</td>
                                <td className={tdNum}>{s.safe_deposits_total == null ? 'not recorded' : fmtK(s.safe_deposits_total)}</td>
                                <td className={tdNum}>{s.stock_short_units ? `${fmtN(s.stock_short_units)} (${fmtK(s.stock_short_value)})` : '0'}</td>
                                <td className={td}>{s.review_status}{s.flags?.length ? `, ${s.flags.length} flag${s.flags.length === 1 ? '' : 's'}` : ''}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── 2. Payment totals by provider ───────────────────────────────────

function Payments({ data, from, range }: { data: any; from: string; range: string }) {
  const [filter, setFilter] = useState<string | null>(null)
  const byType: any[] = data.by_type || []
  const slipLabel = (s: any) => s.type_name + (s.bank ? ` (${s.bank})` : (s.type_id && data.totals?.some((t: any) => t.type_id === s.type_id && t.is_terminal) ? ' (bank not specified)' : ''))
  const slips: any[] = (data.slips || []).filter((s: any) => !filter || slipLabel(s) === filter)
  const checks: any[] = data.card_checks || []

  const getConfig = useCallback((): ExportConfig | null => slips.length ? {
    title: 'Payment Slips',
    subtitle: `${range}${filter ? `, ${filter}` : ''}`,
    filename: `payment_slips_${from}`,
    summaryCards: byType.map(b => ({ label: b.label, value: fmtK(b.amount) })),
    columns: [
      { header: 'Date', key: 'date', format: 'date' },
      { header: 'Shift', key: 'shift_type' },
      { header: 'Attendant', key: 'attendant_name' },
      { header: 'Type', key: 'type_name' },
      { header: 'Bank', key: 'bank' },
      { header: 'Reference', key: 'reference' },
      { header: 'Amount', key: 'amount', format: 'currency' },
    ],
    data: slips,
  } : null, [slips, byType, range, filter, from])

  return (
    <div className="space-y-4">
      <FeatureNote dates={data.feature_dates} from={from} which={['deposits']} />

      <div>
        <p className="text-sm font-semibold text-content-primary mb-2">Totals for the period</p>
        {byType.length === 0 ? <p className="text-sm text-content-secondary">No non-cash payments in this period.</p> : (
          <div className="overflow-x-auto rounded-lg border border-surface-border bg-surface-card">
            <table className="min-w-full">
              <thead className="bg-surface-bg"><tr>{['Payment type', 'Amount', 'Slips', 'Without reference', ''].map(h => <th key={h} className={th}>{h}</th>)}</tr></thead>
              <tbody>
                {byType.map(b => (
                  <tr key={b.label} className={`border-t border-surface-border ${filter === b.label ? 'bg-action-primary/10' : ''}`}>
                    <td className={`${td} font-medium`}>{b.label}</td>
                    <td className={tdNum}>{fmtK(b.amount)}</td>
                    <td className={tdNum}>{b.slips}</td>
                    <td className={`${tdNum} ${b.without_reference ? 'text-status-warning' : ''}`}>{b.without_reference}</td>
                    <td className={td}>
                      <button type="button" className="text-xs text-action-primary underline"
                        onClick={() => setFilter(f => f === b.label ? null : b.label)}>
                        {filter === b.label ? 'Show all slips' : 'Show slips'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {checks.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-content-primary mb-2">Card machine check per shift</p>
          <div className="overflow-x-auto rounded-lg border border-surface-border bg-surface-card">
            <table className="min-w-full">
              <thead className="bg-surface-bg"><tr>{['Date', 'Shift', 'POS slips', 'Machine totals', 'Difference', 'Result'].map(h => <th key={h} className={th}>{h}</th>)}</tr></thead>
              <tbody>
                {checks.map(c => (
                  <tr key={c.shift_id} className="border-t border-surface-border">
                    <td className={td}>{formatDateToDisplay(c.date)}</td>
                    <td className={td}>{c.shift_type}</td>
                    <td className={tdNum}>{fmtK(c.slips_total)}</td>
                    <td className={tdNum}>{c.machine_total == null ? 'not entered' : fmtK(c.machine_total)}</td>
                    <td className={tdNum}>{c.difference == null ? '' : fmtK(c.difference)}</td>
                    <td className={`${td} ${c.status === 'mismatch' ? 'text-status-error' : c.status === 'match' ? 'text-status-success' : 'text-status-warning'}`}>
                      {c.status === 'mismatch' ? 'Does not match' : c.status === 'match' ? 'Matches' : 'Not entered'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <p className="text-sm font-semibold text-content-primary">
            Slips{filter ? `: ${filter}` : ''} ({slips.length})
          </p>
          <ExportButtons getConfig={getConfig} />
        </div>
        <p className="text-xs text-content-secondary mb-2">Use this list to tick slips off against the wallet or bank statement.</p>
        {slips.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-surface-border bg-surface-card max-h-[32rem] overflow-y-auto">
            <table className="min-w-full">
              <thead className="bg-surface-bg sticky top-0"><tr>{['Date', 'Shift', 'Attendant', 'Type', 'Reference', 'Amount'].map(h => <th key={h} className={th}>{h}</th>)}</tr></thead>
              <tbody>
                {slips.map((s, i) => (
                  <tr key={i} className="border-t border-surface-border">
                    <td className={td}>{formatDateToDisplay(s.date)}</td>
                    <td className={td}>{s.shift_type}</td>
                    <td className={td}>{s.attendant_name}</td>
                    <td className={td}>{slipLabel(s)}</td>
                    <td className={`${td} font-mono ${s.reference ? '' : 'text-status-warning'}`}>{s.reference || 'none'}</td>
                    <td className={tdNum}>{fmtK(s.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ── 3. Stock losses ─────────────────────────────────────────────────

function StockLosses({ data, from, range }: { data: any; from: string; range: string }) {
  const rows: any[] = data.rows || []
  const months: any[] = data.months || []

  const getConfig = useCallback((): ExportConfig | null => rows.length ? {
    title: 'Stock Losses',
    subtitle: `${range}, valued at selling price`,
    filename: `stock_losses_${from}`,
    summaryCards: months.map(m => ({ label: monthLabel(m.month), value: fmtK(m.net_lost_value) })),
    columns: [
      { header: 'Month', key: 'month' },
      { header: 'Item', key: 'name' },
      { header: 'Written off', key: 'written_off', format: 'number' },
      { header: 'Lost at counts', key: 'count_corrections_lost', format: 'number' },
      { header: 'Found at counts', key: 'found', format: 'number' },
      { header: 'Lost value', key: 'lost_value', format: 'currency' },
      { header: 'Found value', key: 'found_value', format: 'currency' },
      { header: 'Net lost value', key: 'net_lost_value', format: 'currency' },
      { header: 'Closing shortfall (units)', key: 'closing_shortfall', format: 'number' },
      { header: 'Closing shortfall (value)', key: 'closing_shortfall_value', format: 'currency' },
    ],
    data: rows.map(r => ({ ...r, month: monthLabel(r.month) })),
  } : null, [rows, months, range, from])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-content-secondary max-w-3xl">
          Lost = written off plus stock found missing at counts (stock takes and shift-start counts); found = stock that
          turned up at counts. Valued at selling price. Attendants&apos; closing shortfalls are shown separately and are
          not added to the loss, because the same missing items usually show up again at the next count.
        </p>
        <ExportButtons getConfig={getConfig} />
      </div>
      <FeatureNote dates={data.feature_dates} from={from} which={['counts']} />

      {months.length === 0 ? <p className="text-sm text-content-secondary">No losses recorded in this period.</p> : (
        <>
          <div className="overflow-x-auto rounded-lg border border-surface-border bg-surface-card">
            <table className="min-w-full">
              <thead className="bg-surface-bg"><tr>{['Month', 'Lost', 'Found', 'Net lost', 'Closing shortfall (not added)'].map(h => <th key={h} className={th}>{h}</th>)}</tr></thead>
              <tbody>
                {months.map(m => (
                  <tr key={m.month} className="border-t border-surface-border">
                    <td className={`${td} font-medium`}>{monthLabel(m.month)}</td>
                    <td className={`${tdNum} text-status-error`}>{fmtK(m.lost_value)}</td>
                    <td className={tdNum}>{fmtK(m.found_value)}</td>
                    <td className={`${tdNum} font-semibold`}>{fmtK(m.net_lost_value)}</td>
                    <td className={`${tdNum} text-content-secondary`}>{fmtK(m.closing_shortfall_value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="overflow-x-auto rounded-lg border border-surface-border bg-surface-card">
            <table className="min-w-full">
              <thead className="bg-surface-bg">
                <tr>{['Month', 'Item', 'Price', 'Written off', 'Lost at counts', 'Found', 'Net lost value', 'Closing shortfall'].map(h => <th key={h} className={th}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={`${r.month}-${r.item_key}`} className="border-t border-surface-border">
                    <td className={td}>{monthLabel(r.month)}</td>
                    <td className={`${td} font-medium`}>{r.name}</td>
                    <td className={tdNum}>{r.price ? fmtK(r.price) : 'no price'}</td>
                    <td className={tdNum}>{fmtN(r.written_off)}</td>
                    <td className={tdNum}>{fmtN(r.count_corrections_lost)}</td>
                    <td className={tdNum}>{fmtN(r.found)}</td>
                    <td className={`${tdNum} font-semibold ${r.net_lost_value > 0 ? 'text-status-error' : ''}`}>{fmtK(r.net_lost_value)}</td>
                    <td className={`${tdNum} text-content-secondary`}>
                      {r.closing_shortfall ? `${fmtN(r.closing_shortfall)} (${fmtK(r.closing_shortfall_value)})` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
