import { useState, useEffect, useCallback, useMemo, Fragment } from 'react'
import { useRouter } from 'next/router'
import LoadingSpinner from '../components/LoadingSpinner'
import ExportButtons from '../components/ExportButtons'
import { ExportConfig } from '../lib/exportUtils'
import { getHeaders, authFetch } from '../lib/api'
import { formatDateToDisplay, formatDateTimeToDisplay } from '../lib/dateUtils'

const BASE = '/api/v1'
type Tab = 'scorecard' | 'payments' | 'stock' | 'fuel' | 'credit' | 'banking' | 'reorder' | 'stations' | 'audit'
const TAB_PATHS: Record<Tab, string> = {
  scorecard: 'attendant-scorecard', payments: 'payment-totals', stock: 'stock-losses', fuel: 'fuel-losses',
  credit: 'credit-exposure', banking: 'banking', reorder: 'reorder', stations: 'station-comparison', audit: 'sensitive-actions',
}
// Tabs that show the current position, not a date range
const UNDATED: Tab[] = ['credit', 'reorder']
const EMPTY_DATA: Record<Tab, any> = {
  scorecard: null, payments: null, stock: null, fuel: null, credit: null, banking: null, reorder: null, stations: null, audit: null,
}

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
  const [data, setData] = useState<Record<Tab, any>>(EMPTY_DATA)
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
    const path = TAB_PATHS[which]
    setLoading(true)
    setError('')
    try {
      const qs = UNDATED.includes(which) ? '' : `?from=${from}&to=${to}`
      const res = await authFetch(`${BASE}/owner-reports/${path}${qs}`, { headers: getHeaders() })
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
    setData(prev => {
      const next = { ...EMPTY_DATA }
      UNDATED.forEach(t => { next[t] = prev[t] })
      return next
    })
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
    { key: 'fuel', label: 'Fuel Losses' },
    { key: 'credit', label: 'Credit Exposure' },
    { key: 'banking', label: 'Banking' },
    { key: 'reorder', label: 'Reorder' },
    { key: 'stations', label: 'Stations' },
    { key: 'audit', label: 'Sensitive Actions' },
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
        {UNDATED.includes(tab) && (
          <p className="text-xs text-content-secondary pb-2">This tab shows the position today; the dates are not used.</p>
        )}
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
      {tab === 'fuel' && data.fuel && <FuelLosses data={data.fuel} from={from} range={range} />}
      {tab === 'credit' && data.credit && <CreditExposure data={data.credit} />}
      {tab === 'banking' && data.banking && <Banking data={data.banking} from={from} range={range} />}
      {tab === 'reorder' && data.reorder && <Reorder initial={data.reorder} />}
      {tab === 'stations' && data.stations && <Stations data={data.stations} from={from} range={range} />}
      {tab === 'audit' && data.audit && <SensitiveActions data={data.audit} from={from} range={range} />}
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


// ── 4. Fuel losses ──────────────────────────────────────────────────

// Fuel colours are fixed across every chart: petrol green, diesel purple (the app's
// --color-chart-petrol / --color-chart-diesel tokens, which switch for dark mode).
// Two tanks of the same fuel on one chart share the colour and differ by line style,
// and every line carries its tank name, so identity never rests on colour alone.
const fuelColour = (fuel?: string) =>
  (fuel || '').toLowerCase() === 'diesel' ? 'var(--color-chart-diesel)'
    : (fuel || '').toLowerCase() === 'petrol' ? 'var(--color-chart-petrol)'
    : 'var(--color-text-secondary, #6b7280)'
const DASHES = [undefined, '6 4', '2 4']
const tankStyles = (tanks: any[]) => {
  const seen: Record<string, number> = {}
  return tanks.map(t => {
    const fuel = (t.fuel_type || '').toLowerCase()
    const n = seen[fuel] = (seen[fuel] ?? -1) + 1
    return { colour: fuelColour(t.fuel_type), dash: DASHES[n % DASHES.length] }
  })
}

/**
 * Weekly loss as % of litres that left each tank, with the tolerance band.
 * One or two tanks: one chart, a line per tank. More than two: one small panel
 * per tank in a grid (lines would otherwise cross and labels pile up), all on
 * the same scale so the tanks stay directly comparable.
 */
function FuelTrendChart({ weeks, tanks, passPct, warnPct }: { weeks: any[]; tanks: any[]; passPct: number; warnPct: number }) {
  const weekKeys = Array.from(new Set(weeks.map(w => w.week_start))).sort()
  if (weekKeys.length < 2 || tanks.length === 0) return null

  // One scale for every panel, so a tall line means a big loss wherever it sits
  const vals = weeks.map(w => w.loss_percent)
  const top = Math.max(warnPct * 1.5, ...vals, 0.5)
  const bottom = Math.min(-warnPct * 1.5, ...vals, -0.5)
  const styles = tankStyles(tanks)
  const split = tanks.length > 2

  const legendBand = (
    <span className="flex items-center gap-1.5">
      <span className="inline-block w-4 h-3 rounded-sm bg-status-success/15" />within tolerance ({passPct}%)
    </span>
  )

  if (!split) {
    return (
      <div className="rounded-lg border border-surface-border bg-surface-card p-3">
        <p className="text-sm font-semibold text-content-primary">Weekly fuel loss, % of litres that left the tank</p>
        <div className="flex flex-wrap gap-4 text-xs text-content-secondary mt-1 mb-2">
          {tanks.map((t, i) => (
            <span key={t.tank_id} className="flex items-center gap-1.5">
              <svg width="18" height="6" aria-hidden="true">
                <line x1="0" y1="3" x2="18" y2="3" stroke={styles[i].colour} strokeWidth={2} strokeDasharray={styles[i].dash} />
              </svg>
              {t.tank}{t.fuel_type ? ` (${t.fuel_type})` : ''}
            </span>
          ))}
          {legendBand}
        </div>
        <TrendPlot tanks={tanks} styles={styles} weeks={weeks} weekKeys={weekKeys}
          top={top} bottom={bottom} passPct={passPct} warnPct={warnPct} height={260} endLabels />
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-surface-border bg-surface-card p-3">
      <p className="text-sm font-semibold text-content-primary">Weekly fuel loss per tank, % of litres that left the tank</p>
      <div className="flex flex-wrap gap-4 text-xs text-content-secondary mt-1 mb-3">
        <span>One panel per tank, all on the same scale.</span>
        {legendBand}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {tanks.map(t => {
          const colour = fuelColour(t.fuel_type)
          return (
            <div key={t.tank_id} className="rounded border border-surface-border p-2">
              <div className="flex items-baseline justify-between gap-2 mb-1">
                <span className="flex items-center gap-1.5 text-sm font-medium text-content-primary">
                  <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: colour }} aria-hidden="true" />
                  {t.tank}{t.fuel_type ? ` (${t.fuel_type})` : ''}
                </span>
                <span className={`text-xs font-mono ${t.shifts_over ? 'text-status-error' : 'text-content-secondary'}`}>
                  {t.loss_percent}% overall
                </span>
              </div>
              <TrendPlot tanks={[t]} styles={[{ colour, dash: undefined }]} weeks={weeks} weekKeys={weekKeys}
                top={top} bottom={bottom} passPct={passPct} warnPct={warnPct} height={170} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** One plot area: axes, tolerance band and a line per tank, with a hover tooltip. */
function TrendPlot({ tanks, styles, weeks, weekKeys, top, bottom, passPct, warnPct, height, endLabels = false }: {
  tanks: any[]; styles: { colour: string; dash?: string }[]; weeks: any[]; weekKeys: string[]
  top: number; bottom: number; passPct: number; warnPct: number; height: number; endLabels?: boolean
}) {
  const [hover, setHover] = useState<{ x: number; y: number; text: string } | null>(null)
  const W = 720, H = height, L = 48, R = endLabels ? 110 : 16, T = 12, B = 28
  const x = (i: number) => L + (i / (weekKeys.length - 1)) * (W - L - R)
  const y = (v: number) => T + ((top - v) / (top - bottom)) * (H - T - B)
  const ticks = [bottom, -warnPct, 0, warnPct, top].filter((v, i, a) => a.indexOf(v) === i)
  const every = Math.ceil(weekKeys.length / (endLabels ? 8 : 6))
  const weekLabel = (k: string) => formatDateToDisplay(k).slice(0, 5)

  const lines = tanks.map((t, si) => {
    const pts = weekKeys.map((k, i) => {
      const w = weeks.find(w => w.tank_id === t.tank_id && w.week_start === k)
      return w ? { i, w } : null
    }).filter(Boolean) as { i: number; w: any }[]
    return { t, si, pts }
  }).filter(l => l.pts.length)

  // End labels: keep at least 13px apart so two lines ending close together stay readable
  const labelY: Record<string, number> = {}
  if (endLabels) {
    const ends = lines.map(l => ({ id: l.t.tank_id, y: y(l.pts[l.pts.length - 1].w.loss_percent) + 4 }))
      .sort((a, b) => a.y - b.y)
    ends.forEach((e, i) => { if (i > 0 && e.y - ends[i - 1].y < 13) e.y = ends[i - 1].y + 13 })
    ends.forEach(e => { labelY[e.id] = Math.min(e.y, H - B) })
  }

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img"
        aria-label={`Weekly fuel loss percentage: ${tanks.map(t => t.tank).join(', ')}`} onMouseLeave={() => setHover(null)}>
        <rect x={L} y={y(passPct)} width={W - L - R} height={y(-passPct) - y(passPct)} className="fill-current text-status-success" opacity={0.12} />
        {ticks.map(v => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="stroke-current text-surface-border"
              strokeDasharray={Math.abs(Math.abs(v) - warnPct) < 1e-9 ? '4 4' : undefined} strokeWidth={v === 0 ? 1.5 : 1} />
            <text x={L - 6} y={y(v) + 4} textAnchor="end" className="fill-current text-content-secondary" fontSize={11}>
              {v.toFixed(1)}%
            </text>
          </g>
        ))}
        {weekKeys.map((k, i) => (i % every === 0 || i === weekKeys.length - 1) && (
          <text key={k} x={x(i)} y={H - 8} textAnchor="middle" className="fill-current text-content-secondary" fontSize={11}>{weekLabel(k)}</text>
        ))}
        {lines.map(({ t, si, pts }) => (
          <g key={t.tank_id}>
            <polyline fill="none" stroke={styles[si].colour} strokeWidth={2} strokeLinejoin="round" strokeDasharray={styles[si].dash}
              points={pts.map(p => `${x(p.i)},${y(p.w.loss_percent)}`).join(' ')} />
            {pts.map(p => (
              <g key={p.i}>
                <circle cx={x(p.i)} cy={y(p.w.loss_percent)} r={4} fill={styles[si].colour} className="stroke-current text-surface-card" strokeWidth={2} />
                <circle cx={x(p.i)} cy={y(p.w.loss_percent)} r={12} fill="transparent"
                  onMouseEnter={() => setHover({
                    x: x(p.i), y: y(p.w.loss_percent),
                    text: `${t.tank}, week of ${formatDateToDisplay(p.w.week_start)}: ${p.w.loss_percent}% (${fmtN(p.w.loss_litres)} L, ${fmtK(p.w.loss_value)})`,
                  })} />
              </g>
            ))}
            {endLabels && (
              <text x={x(pts[pts.length - 1].i) + 8} y={labelY[t.tank_id]} fontSize={11} className="fill-current text-content-primary">
                {t.tank}
              </text>
            )}
          </g>
        ))}
      </svg>
      {hover && (
        <div className="absolute z-10 pointer-events-none rounded border border-surface-border bg-surface-card px-2 py-1 text-xs text-content-primary shadow whitespace-nowrap"
          style={{ left: `${(hover.x / W) * 100}%`, top: `${(hover.y / H) * 100}%`, transform: 'translate(-50%, -120%)' }}>
          {hover.text}
        </div>
      )}
    </div>
  )
}

function FuelLosses({ data, from, range }: { data: any; from: string; range: string }) {
  const tanks: any[] = data.tanks || []
  const shifts: any[] = data.shifts || []
  const getConfig = useCallback((): ExportConfig | null => shifts.length ? {
    title: 'Fuel Losses', subtitle: range, filename: `fuel_losses_${from}`,
    summaryCards: tanks.map(t => ({ label: t.tank, value: `${fmtN(t.loss_litres)} L (${t.loss_percent}%)` })),
    columns: [
      { header: 'Date', key: 'date', format: 'date' }, { header: 'Shift', key: 'shift_type' }, { header: 'Tank', key: 'tank' },
      { header: 'Left tank (L)', key: 'tank_movement', format: 'number' }, { header: 'Nozzles (L)', key: 'nozzles', format: 'number' },
      { header: 'Loss (L)', key: 'loss_litres', format: 'number' }, { header: 'Loss %', key: 'loss_percent', format: 'percent' },
      { header: 'Loss value', key: 'loss_value', format: 'currency' }, { header: 'Result', key: 'status' },
    ],
    data: shifts,
  } : null, [shifts, tanks, range, from])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-content-secondary max-w-3xl">
          Loss = litres that left the tank by dips (after deliveries) minus litres the nozzles recorded. Positive means fuel
          went without a nozzle sale (leak, theft or meter drift). Tolerance is {data.pass_percent}% (warning up to {data.warning_percent}%).
          Only shifts whose tank check was worked out at close are counted.
        </p>
        <ExportButtons getConfig={getConfig} />
      </div>
      {tanks.length === 0 ? <p className="text-sm text-content-secondary">No tank checks in this period.</p> : (
        <>
          <FuelTrendChart weeks={data.weeks || []} tanks={tanks} passPct={data.pass_percent} warnPct={data.warning_percent} />
          <div className="overflow-x-auto rounded-lg border border-surface-border bg-surface-card">
            <table className="min-w-full">
              <thead className="bg-surface-bg"><tr>{['Tank', 'Shifts', 'Left tank', 'Nozzles', 'Loss', 'Loss %', 'Value', 'Shifts over tolerance'].map(h => <th key={h} className={th}>{h}</th>)}</tr></thead>
              <tbody>
                {tanks.map(t => (
                  <tr key={t.tank_id} className="border-t border-surface-border">
                    <td className={`${td} font-medium`}>{t.tank}</td>
                    <td className={tdNum}>{t.shifts}</td>
                    <td className={tdNum}>{fmtN(t.tank_movement)} L</td>
                    <td className={tdNum}>{fmtN(t.nozzles)} L</td>
                    <td className={`${tdNum} ${t.loss_litres > 0 ? 'text-status-error' : ''}`}>{fmtN(t.loss_litres)} L</td>
                    <td className={tdNum}>{t.loss_percent}%</td>
                    <td className={tdNum}>{fmtK(t.loss_value)}</td>
                    <td className={`${tdNum} ${t.shifts_over ? 'text-status-error font-semibold' : ''}`}>{t.shifts_over}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <details className="rounded-lg border border-surface-border bg-surface-card">
            <summary className="px-3 py-2 text-sm font-medium text-content-primary cursor-pointer">Shift by shift ({shifts.length})</summary>
            <div className="overflow-x-auto max-h-[28rem] overflow-y-auto">
              <table className="min-w-full">
                <thead className="bg-surface-bg sticky top-0"><tr>{['Date', 'Shift', 'Tank', 'Left tank', 'Nozzles', 'Loss', 'Loss %', 'Result'].map(h => <th key={h} className={th}>{h}</th>)}</tr></thead>
                <tbody>
                  {shifts.map((s, i) => (
                    <tr key={i} className="border-t border-surface-border">
                      <td className={td}>{formatDateToDisplay(s.date)}</td>
                      <td className={td}>{s.shift_type}</td>
                      <td className={td}>{s.tank}</td>
                      <td className={tdNum}>{fmtN(s.tank_movement)}</td>
                      <td className={tdNum}>{fmtN(s.nozzles)}</td>
                      <td className={tdNum}>{fmtN(s.loss_litres)}</td>
                      <td className={tdNum}>{s.loss_percent}%</td>
                      <td className={`${td} ${s.status === 'over' ? 'text-status-error' : s.status === 'warning' ? 'text-status-warning' : 'text-status-success'}`}>
                        {s.status === 'over' ? 'Over tolerance' : s.status === 'warning' ? 'Warning' : 'Within'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </div>
  )
}

// ── 5. Credit exposure ──────────────────────────────────────────────

const CREDIT_STATUS: Record<string, { label: string; cls: string }> = {
  over_limit: { label: 'Over limit', cls: 'text-status-error' },
  empty: { label: 'No balance left', cls: 'text-status-error' },
  near_limit: { label: 'Near limit (90%+)', cls: 'text-status-warning' },
  low: { label: 'Low balance', cls: 'text-status-warning' },
  suspended: { label: 'Suspended', cls: 'text-content-secondary' },
  ok: { label: 'OK', cls: 'text-status-success' },
}

function CreditExposure({ data }: { data: any }) {
  const rows: any[] = data.accounts || []
  const getConfig = useCallback((): ExportConfig | null => rows.length ? {
    title: 'Credit Exposure', subtitle: `As of ${formatDateToDisplay(data.as_of)}`, filename: `credit_exposure_${data.as_of}`,
    summaryCards: [{ label: 'Total owed', value: fmtK(data.total_owed) }, { label: 'Pre-paid held', value: fmtK(data.total_prepaid_held) }],
    columns: [
      { header: 'Account', key: 'account_name' }, { header: 'Type', key: 'account_type' },
      { header: 'Owed', key: 'owed', format: 'currency' }, { header: 'Pre-paid balance', key: 'prepaid_balance', format: 'currency' },
      { header: 'Limit', key: 'credit_limit', format: 'currency' }, { header: 'Available', key: 'available', format: 'currency' },
      { header: 'Oldest unpaid (days)', key: 'oldest_unpaid_days', format: 'number' },
      { header: 'Last payment', key: 'last_payment', format: 'date' }, { header: 'Status', key: 'status' },
    ],
    data: rows,
  } : null, [rows, data])
  const aging = data.aging_total || {}

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-3">
          {[['Total owed (Post-Paid)', fmtK(data.total_owed)], ['Pre-Paid funds held', fmtK(data.total_prepaid_held)],
            ['Owed 0-30 days', fmtK(aging['0-30'])], ['31-60 days', fmtK(aging['31-60'])], ['61-90 days', fmtK(aging['61-90'])], ['Over 90 days', fmtK(aging['90+'])]]
            .map(([l, v]) => (
              <div key={l} className="rounded-lg border border-surface-border bg-surface-card px-3 py-2">
                <p className="text-xs text-content-secondary">{l}</p>
                <p className="text-base font-semibold text-content-primary font-mono">{v}</p>
              </div>
            ))}
        </div>
        <ExportButtons getConfig={getConfig} />
      </div>
      <p className="text-xs text-content-secondary">
        Payments are not linked to individual sales, so the age of what is owed assumes payments clear the oldest sales first.
      </p>
      {rows.length === 0 ? <p className="text-sm text-content-secondary">No credit accounts.</p> : (
        <div className="overflow-x-auto rounded-lg border border-surface-border bg-surface-card">
          <table className="min-w-full">
            <thead className="bg-surface-bg"><tr>{['Account', 'Type', 'Owed / balance', 'Limit', 'Available', 'Used', 'Oldest unpaid', 'Last sale', 'Last payment', 'Sales 30 days', 'Status'].map(h => <th key={h} className={th}>{h}</th>)}</tr></thead>
            <tbody>
              {rows.map(r => {
                const st = CREDIT_STATUS[r.status] || CREDIT_STATUS.ok
                return (
                  <tr key={r.account_id} className="border-t border-surface-border">
                    <td className={`${td} font-medium`}>{r.client_code ? `${r.client_code} ` : ''}{r.account_name}</td>
                    <td className={td}>{r.account_type}</td>
                    <td className={tdNum}>{r.account_type === 'Pre-Paid' ? `${fmtK(r.prepaid_balance)} left` : fmtK(r.owed)}</td>
                    <td className={tdNum}>{r.account_type === 'Pre-Paid' ? '' : fmtK(r.credit_limit)}</td>
                    <td className={`${tdNum} ${r.available <= 0 ? 'text-status-error' : ''}`}>{fmtK(r.available)}</td>
                    <td className={tdNum}>{r.used_percent == null ? '' : `${r.used_percent}%`}</td>
                    <td className={`${tdNum} ${(r.oldest_unpaid_days || 0) > 60 ? 'text-status-error' : ''}`}>{r.oldest_unpaid_days == null ? '' : `${r.oldest_unpaid_days} days`}</td>
                    <td className={td}>{r.last_sale ? formatDateToDisplay(r.last_sale) : ''}</td>
                    <td className={td}>{r.last_payment ? formatDateToDisplay(r.last_payment) : 'none recorded'}</td>
                    <td className={tdNum}>{fmtK(r.sales_last_30_days)}</td>
                    <td className={`${td} font-medium ${st.cls}`}>{st.label}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── 6. Banking ──────────────────────────────────────────────────────

function Banking({ data, from, range }: { data: any; from: string; range: string }) {
  const days: any[] = data.days || []
  const getConfig = useCallback((): ExportConfig | null => days.length ? {
    title: 'Banking Check', subtitle: range, filename: `banking_${from}`,
    summaryCards: [{ label: 'Cash handed in', value: fmtK(data.total_cash) }, { label: 'Banked', value: fmtK(data.total_banked) },
      { label: 'Gap', value: fmtK(data.running_gap) }],
    columns: [
      { header: 'Date', key: 'date', format: 'date' }, { header: 'Cash handed in', key: 'cash', format: 'currency' },
      { header: 'Banked', key: 'banked', format: 'currency' }, { header: 'Gap', key: 'gap', format: 'currency' },
      { header: 'Running gap', key: 'running_gap', format: 'currency' }, { header: 'Reference', key: 'reference' },
    ],
    data: days,
  } : null, [days, data, range, from])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-3">
          {[['Cash handed in', fmtK(data.total_cash), ''], ['Banked', fmtK(data.total_banked), ''],
            ['Banked minus cash', fmtK(data.running_gap), data.running_gap < 0 ? 'text-status-error' : ''],
            ['Days not closed off', String(data.days_not_closed), data.days_not_closed ? 'text-status-warning' : '']]
            .map(([l, v, c]) => (
              <div key={l} className="rounded-lg border border-surface-border bg-surface-card px-3 py-2">
                <p className="text-xs text-content-secondary">{l}</p>
                <p className={`text-base font-semibold font-mono ${c || 'text-content-primary'}`}>{v}</p>
              </div>
            ))}
        </div>
        <ExportButtons getConfig={getConfig} />
      </div>
      <p className="text-xs text-content-secondary">
        Cash handed in = cash counted at each attendant's close. Banked = the bank deposit entered at Daily Close-Off.
        A day not closed off yet counts as not banked.
      </p>
      {days.length === 0 ? <p className="text-sm text-content-secondary">No closed shifts in this period.</p> : (
        <div className="overflow-x-auto rounded-lg border border-surface-border bg-surface-card">
          <table className="min-w-full">
            <thead className="bg-surface-bg"><tr>{['Date', 'Cash handed in', 'Banked', 'Gap', 'Running gap', 'Reference'].map(h => <th key={h} className={th}>{h}</th>)}</tr></thead>
            <tbody>
              {days.map(d => (
                <tr key={d.date} className="border-t border-surface-border">
                  <td className={td}>{formatDateToDisplay(d.date)}</td>
                  <td className={tdNum}>{fmtK(d.cash)}</td>
                  <td className={tdNum}>{d.closed ? fmtK(d.banked) : <span className="text-status-warning">not closed off</span>}</td>
                  <td className={`${tdNum} ${d.gap < 0 ? 'text-status-error' : ''}`}>{fmtK(d.gap)}</td>
                  <td className={`${tdNum} font-semibold ${d.running_gap < 0 ? 'text-status-error' : ''}`}>{fmtK(d.running_gap)}</td>
                  <td className={td}>{d.reference || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── 7. Reorder suggestions ──────────────────────────────────────────

function Reorder({ initial }: { initial: any }) {
  const [data, setData] = useState<any>(initial)
  const [days, setDays] = useState(String(initial.days))
  const [cover, setCover] = useState(String(initial.cover_days))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const items: any[] = data.items || []

  const refresh = async () => {
    setBusy(true)
    setErr('')
    try {
      const res = await authFetch(`${BASE}/owner-reports/reorder?days=${parseInt(days) || 28}&cover_days=${parseInt(cover) || 14}`, { headers: getHeaders() })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.detail || 'Could not load suggestions')
      setData(body)
    } catch (e: any) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  const getConfig = useCallback((): ExportConfig | null => items.length ? {
    title: 'Reorder Suggestions', subtitle: `Sales over the last ${data.days} days, ordering for ${data.cover_days} days of cover`,
    filename: 'reorder_suggestions',
    summaryCards: [{ label: 'Items to order', value: data.to_order }, { label: 'Order value (selling price)', value: fmtK(data.order_value) }],
    columns: [
      { header: 'Item', key: 'name' }, { header: 'On hand', key: 'on_hand', format: 'number' },
      { header: 'Sold', key: 'sold', format: 'number' }, { header: 'Per day', key: 'per_day', format: 'number' },
      { header: 'Days of cover', key: 'days_cover', format: 'number' }, { header: 'Re-order level', key: 'reorder_level', format: 'number' },
      { header: 'Suggested order', key: 'suggested_order', format: 'number' }, { header: 'Value', key: 'suggested_value', format: 'currency' },
    ],
    data: items,
  } : null, [items, data])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-content-secondary mb-1">Sales over the last (days)</label>
            <input type="number" min={1} max={365} value={days} onChange={e => setDays(e.target.value)}
              className="w-24 px-2 py-1.5 text-sm rounded border border-surface-border bg-surface-card text-content-primary" />
          </div>
          <div>
            <label className="block text-xs font-medium text-content-secondary mb-1">Order enough for (days)</label>
            <input type="number" min={1} max={120} value={cover} onChange={e => setCover(e.target.value)}
              className="w-24 px-2 py-1.5 text-sm rounded border border-surface-border bg-surface-card text-content-primary" />
          </div>
          <button type="button" onClick={refresh} disabled={busy}
            className="px-3 py-1.5 text-sm font-semibold rounded bg-action-primary text-white disabled:opacity-50">
            {busy ? 'Working...' : 'Update'}
          </button>
        </div>
        <ExportButtons getConfig={getConfig} />
      </div>
      {err && <p className="text-sm text-status-error">{err}</p>}
      <p className="text-xs text-content-secondary">
        {data.to_order} item{data.to_order === 1 ? '' : 's'} to order, worth {fmtK(data.order_value)} at selling price. An item is suggested when
        it is at or below its re-order level, or would run out within {data.cover_days} days at its recent rate of sale. Empty
        cylinders are left out (they go back to the supplier).
      </p>
      {items.length === 0 ? <p className="text-sm text-content-secondary">No Stores items yet.</p> : (
        <div className="overflow-x-auto rounded-lg border border-surface-border bg-surface-card">
          <table className="min-w-full">
            <thead className="bg-surface-bg"><tr>{['Item', 'Stores', 'Forecourt', 'Sold', 'Per day', 'Days of cover', 'Re-order level', 'Suggested order', 'Value'].map(h => <th key={h} className={th}>{h}</th>)}</tr></thead>
            <tbody>
              {items.map(r => (
                <tr key={r.item_key} className={`border-t border-surface-border ${r.suggested_order ? '' : 'opacity-70'}`}>
                  <td className={`${td} font-medium`}>{r.name}</td>
                  <td className={tdNum}>{fmtN(r.stores)}</td>
                  <td className={tdNum}>{fmtN(r.forecourt)}</td>
                  <td className={tdNum}>{fmtN(r.sold)}</td>
                  <td className={tdNum}>{fmtN(r.per_day)}</td>
                  <td className={`${tdNum} ${r.days_cover != null && r.days_cover < data.cover_days ? 'text-status-error' : ''}`}>{r.days_cover == null ? 'no sales' : `${r.days_cover} days`}</td>
                  <td className={tdNum}>{fmtN(r.reorder_level)}</td>
                  <td className={`${tdNum} font-semibold`}>{r.suggested_order || ''}</td>
                  <td className={tdNum}>{r.suggested_order ? fmtK(r.suggested_value) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── 8. Station comparison ───────────────────────────────────────────

function Stations({ data, from, range }: { data: any; from: string; range: string }) {
  const rows: any[] = data.stations || []
  const getConfig = useCallback((): ExportConfig | null => rows.length ? {
    title: 'Station Comparison', subtitle: range, filename: `station_comparison_${from}`,
    columns: [
      { header: 'Station', key: 'name' }, { header: 'Shifts', key: 'shifts', format: 'number' },
      { header: 'Sales', key: 'sales', format: 'currency' }, { header: 'Net cash', key: 'net_cash', format: 'currency' },
      { header: 'Flagged shifts', key: 'flagged_shifts', format: 'number' }, { header: 'Fuel loss (L)', key: 'fuel_loss_litres', format: 'number' },
      { header: 'Fuel loss %', key: 'fuel_loss_percent', format: 'percent' }, { header: 'Stock net lost', key: 'stock_net_lost_value', format: 'currency' },
      { header: 'Card mismatches', key: 'card_mismatches', format: 'number' }, { header: 'Banking gap', key: 'banking_gap', format: 'currency' },
      { header: 'Credit owed', key: 'credit_owed', format: 'currency' },
    ],
    data: rows,
  } : null, [rows, range, from])
  const metrics: [string, (r: any) => any, (r: any) => boolean][] = [
    ['Shifts closed', r => r.shifts, () => false],
    ['Sales', r => fmtK(r.sales), () => false],
    ['Net cash (over minus short)', r => fmtK(r.net_cash), r => r.net_cash < 0],
    ['Flagged shifts', r => r.flagged_shifts, r => r.flagged_shifts > 0],
    ['Fuel loss', r => `${fmtN(r.fuel_loss_litres)} L (${r.fuel_loss_percent}%)`, r => r.fuel_loss_litres > 0],
    ['Stock net lost', r => fmtK(r.stock_net_lost_value), r => r.stock_net_lost_value > 0],
    ['Card machine mismatches', r => r.card_mismatches, r => r.card_mismatches > 0],
    ['Shifts without machine totals', r => r.card_not_entered, r => r.card_not_entered > 0],
    ['Banked minus cash', r => fmtK(r.banking_gap), r => r.banking_gap < 0],
    ['Days not closed off', r => r.days_not_closed, r => r.days_not_closed > 0],
    ['Credit owed', r => fmtK(r.credit_owed), () => false],
    ['Accounts over limit', r => r.accounts_over_limit, r => r.accounts_over_limit > 0],
  ]

  return (
    <div className="space-y-3">
      <div className="flex justify-end"><ExportButtons getConfig={getConfig} /></div>
      {rows.length === 0 ? <p className="text-sm text-content-secondary">No active stations.</p> : (
        <div className="overflow-x-auto rounded-lg border border-surface-border bg-surface-card">
          <table className="min-w-full">
            <thead className="bg-surface-bg">
              <tr>
                <th className={th}>Figure</th>
                {rows.map(r => <th key={r.station_id} className={`${th} text-right`}>{r.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {metrics.map(([label, value, bad]) => (
                <tr key={label} className="border-t border-surface-border">
                  <td className={`${td} text-content-secondary`}>{label}</td>
                  {rows.map(r => (
                    <td key={r.station_id} className={`${tdNum} ${!r.error && bad(r) ? 'text-status-error' : ''}`}>
                      {r.error ? 'could not load' : value(r)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── 9. Sensitive actions ────────────────────────────────────────────

function SensitiveActions({ data, from, range }: { data: any; from: string; range: string }) {
  const [group, setGroup] = useState('')
  const [who, setWho] = useState('')
  const all: any[] = data.entries || []
  const people = Array.from(new Set(all.map(e => e.performed_by).filter(Boolean))).sort()
  const entries = all.filter(e => (!group || e.group === group) && (!who || e.performed_by === who))
  const counts: Record<string, number> = {}
  all.forEach(e => { counts[e.group] = (counts[e.group] || 0) + 1 })
  const describe = (e: any) => {
    const d = e.details || {}
    const bits = Object.entries(d)
      .filter(([, v]) => v !== null && v !== undefined && typeof v !== 'object')
      .slice(0, 4).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`)
    return [e.notes, ...bits].filter(Boolean).join('; ')
  }

  const getConfig = useCallback((): ExportConfig | null => entries.length ? {
    title: 'Sensitive Actions', subtitle: `${range}${group ? `, ${group}` : ''}${who ? `, by ${who}` : ''}`, filename: `sensitive_actions_${from}`,
    columns: [
      { header: 'When', key: 'timestamp', format: 'datetime' }, { header: 'Area', key: 'group' },
      { header: 'Action', key: 'action' }, { header: 'By', key: 'performed_by' }, { header: 'Item', key: 'entity_id' },
    ],
    data: entries,
  } : null, [entries, range, group, who, from])

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-content-secondary mb-1">Area</label>
            <select value={group} onChange={e => setGroup(e.target.value)}
              className="px-2 py-1.5 text-sm rounded border border-surface-border bg-surface-card text-content-primary">
              <option value="">All ({all.length})</option>
              {(data.groups || []).map((g: string) => <option key={g} value={g}>{g} ({counts[g] || 0})</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-content-secondary mb-1">Done by</label>
            <select value={who} onChange={e => setWho(e.target.value)}
              className="px-2 py-1.5 text-sm rounded border border-surface-border bg-surface-card text-content-primary">
              <option value="">Anyone</option>
              {people.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>
        <ExportButtons getConfig={getConfig} />
      </div>
      <p className="text-xs text-content-secondary">
        Voids, deletions, deposit moves, stock adjustments, price changes, credit changes, reading exclusions and settings
        or user changes, newest first.
      </p>
      {entries.length === 0 ? <p className="text-sm text-content-secondary">None in this period.</p> : (
        <div className="overflow-x-auto rounded-lg border border-surface-border bg-surface-card max-h-[36rem] overflow-y-auto">
          <table className="min-w-full">
            <thead className="bg-surface-bg sticky top-0"><tr>{['When', 'Area', 'Action', 'By', 'Item', 'Details'].map(h => <th key={h} className={th}>{h}</th>)}</tr></thead>
            <tbody>
              {entries.map((e, i) => (
                <tr key={i} className="border-t border-surface-border align-top">
                  <td className={td}>{formatDateTimeToDisplay(e.timestamp)}</td>
                  <td className={td}>{e.group}</td>
                  <td className={td}>{e.action.replace(/_/g, ' ')}</td>
                  <td className={td}>{e.performed_by}</td>
                  <td className={`${td} font-mono text-xs`}>{e.entity_id}</td>
                  <td className="px-3 py-2 text-xs text-content-secondary min-w-[16rem]">{describe(e)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
