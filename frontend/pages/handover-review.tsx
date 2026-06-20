import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { useTheme } from '../contexts/ThemeContext'
import LoadingSpinner from '../components/LoadingSpinner'
import ReasonChips, { REASON_PRESETS } from '../components/ReasonChips'
import { getHeaders, authFetch } from '../lib/api'
import ExportButtons from '../components/ExportButtons'
import Pagination from '../components/Pagination'
import { ExportConfig } from '../lib/exportUtils'
import { formatDateToDisplay } from '../lib/dateUtils'

const PAGE_SIZE = 20

const BASE = '/api/v1'

function getAuthHeaders() {
  return { 'Content-Type': 'application/json', ...getHeaders() }
}

interface HandoverEntry {
  handover_id: string
  shift_id: string
  attendant_id: string
  attendant_name: string
  date: string
  shift_type: string
  nozzle_summaries: {
    nozzle_id: string
    fuel_type: string
    opening_reading: number
    closing_reading: number
    volume_sold: number
    price_per_liter: number
    revenue: number
    mechanical_opening?: number | null
    mechanical_closing?: number | null
    mechanical_volume?: number | null
    meter_deviation_liters?: number | null
    meter_deviation_percent?: number | null
    meter_deviation_flagged?: boolean | null
    changeover_reading?: number | null
    changeover_estimated?: boolean | null
    pre_change_volume?: number | null
    post_change_volume?: number | null
    pre_change_price?: number | null
    post_change_price?: number | null
    pre_change_revenue?: number | null
    post_change_revenue?: number | null
  }[]
  fuel_revenue: number
  lpg_sales: number
  lubricant_sales: number
  accessory_sales: number
  total_expected: number
  credit_sales: number
  credit_sale_details?: {
    account_id: string
    account_name: string
    fuel_type: string
    volume: number
    price_per_liter: number
    amount: number
    source: string
    over_limit?: boolean
  }[] | null
  expected_cash: number
  actual_cash: number
  pos_receipts?: number
  total_accounted?: number
  difference: number
  status: string
  phase?: string
  review_status: string
  supervisor_review?: {
    reviewed_by: string
    reviewed_by_name: string
    reviewed_at: string
    action: string
    note?: string
  } | null
  auto_flag_reasons?: string[] | null
  notes?: string | null
  created_at: string
  stock_snapshot?: any
  // Present on "awaiting closing" (Phase-1) rows from the review-queue payload.
  hours_waiting?: number
  is_stale?: boolean
  // "readings" = enter-readings source; absent or "handover" = financial handover
  source?: 'handover' | 'readings'
}

const REVIEW_STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  submitted: { bg: 'var(--color-action-primary-light)', color: 'var(--color-action-primary)', label: 'Pending Review' },
  flagged: { bg: 'var(--color-status-error-light, #fde8e8)', color: 'var(--color-status-error)', label: 'Flagged' },
  approved: { bg: 'var(--color-status-success-light, #e6f9e6)', color: 'var(--color-status-success)', label: 'Approved' },
  returned: { bg: 'var(--color-status-warning-light, #fff8e1)', color: 'var(--color-status-warning)', label: 'Returned' },
}

const FLAG_LABELS: Record<string, string> = {
  cash_shortage: 'Cash Shortage',
  meter_deviation: 'Meter Deviation',
}

export default function HandoverReview() {
  const { theme } = useTheme()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [handovers, setHandovers] = useState<HandoverEntry[]>([])
  const [summaryPending, setSummaryPending] = useState(0)
  const [summaryFlagged, setSummaryFlagged] = useState(0)
  const [summaryApprovedToday, setSummaryApprovedToday] = useState(0)
  const [staleReadingsCount, setStaleReadingsCount] = useState(0)
  const [awaitingCount, setAwaitingCount] = useState(0)
  const [awaitingClosing, setAwaitingClosing] = useState<HandoverEntry[]>([])

  // Filters
  const [filterDate, setFilterDate] = useState('')
  const [filterShiftType, setFilterShiftType] = useState<'' | 'Day' | 'Night'>('')
  const [filterAttendant, setFilterAttendant] = useState('')  // attendant_id, set when opened from a person card
  const [statusTab, setStatusTab] = useState<'todo' | 'all' | 'pending' | 'flagged' | 'awaiting' | 'approved'>('todo')

  // Pagination
  const [page, setPage] = useState(1)
  const [awaitingPage, setAwaitingPage] = useState(1)

  // Expansion
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Readings modal
  const [readingsModal, setReadingsModal] = useState<HandoverEntry | null>(null)

  // Selection for batch-approve
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Return modal
  const [returnModalId, setReturnModalId] = useState<HandoverEntry | null>(null)
  const [returnNote, setReturnNote] = useState('')
  // Approve-with-note modal (required for flagged handovers)
  const [approveModalId, setApproveModalId] = useState<HandoverEntry | null>(null)
  const [approveNote, setApproveNote] = useState('')
  const [actionLoading, setActionLoading] = useState(false)

  // Auth check
  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (userData) {
      const user = JSON.parse(userData)
      if (user.role !== 'supervisor' && user.role !== 'manager' && user.role !== 'owner') {
        router.push('/')
      }
    } else {
      router.push('/login')
    }
  }, [router])

  // Pre-filter when opened from a card on another page (e.g. My Shift).
  // attendant_id → that person's handovers across shifts (active + past);
  // shift_id → that shift's handovers.
  useEffect(() => {
    if (!router.isReady) return
    if (typeof router.query.attendant_id === 'string') {
      setFilterAttendant(router.query.attendant_id)
      setStatusTab('all')
    }
    if (typeof router.query.shift_id === 'string') {
      const sid = router.query.shift_id
      const m = sid.match(/^(\d{4}-\d{2}-\d{2})-(Day|Night)$/)
      if (m) {
        setFilterDate(m[1])
        setFilterShiftType(m[2] as 'Day' | 'Night')
      } else if (sid === 'Day' || sid === 'Night') {
        setFilterShiftType(sid)
      }
    }
  }, [router.isReady, router.query.attendant_id, router.query.shift_id])

  useEffect(() => {
    setPage(1)
    setAwaitingPage(1)
  }, [statusTab, filterDate, filterShiftType, filterAttendant])

  const fetchQueue = useCallback(() => {
    const params = new URLSearchParams()
    if (filterDate) params.append('date', filterDate)
    if (filterDate && filterShiftType) params.append('shift_id', `${filterDate}-${filterShiftType}`)
    const qs = params.toString() ? `?${params.toString()}` : ''

    authFetch(`${BASE}/handover/review-queue${qs}`, { headers: getAuthHeaders() })
      .then(r => {
        if (!r.ok) throw new Error('Failed to load review queue')
        return r.json()
      })
      .then(data => {
        setHandovers(data.handovers || [])
        setSummaryPending(data.pending || 0)
        setSummaryFlagged(data.flagged || 0)
        setSummaryApprovedToday(data.approved_today || 0)
        setStaleReadingsCount(data.stale_readings_count || 0)
        setAwaitingCount(data.awaiting_closing || 0)
        setAwaitingClosing(data.awaiting_closing_handovers || [])
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }, [filterDate, filterShiftType])

  useEffect(() => {
    fetchQueue()
  }, [fetchQueue])

  // Also load approved/returned for "all" and "approved" tabs
  const [allHandovers, setAllHandovers] = useState<HandoverEntry[]>([])
  useEffect(() => {
    const params = new URLSearchParams()
    if (filterDate) params.append('date', filterDate)
    if (filterDate && filterShiftType) params.append('shift_id', `${filterDate}-${filterShiftType}`)
    const qs = params.toString() ? `?${params.toString()}` : ''

    authFetch(`${BASE}/handover/entries${qs}`, { headers: getAuthHeaders() })
      .then(r => r.ok ? r.json() : [])
      .then(data => setAllHandovers(data))
      .catch(() => {})
  }, [filterDate, filterShiftType, handovers])

  // Compute displayed list based on tab
  const displayedHandovers = (() => {
    let list: HandoverEntry[]
    if (statusTab === 'todo') {
      const flagged = handovers.filter(h => h.review_status === 'flagged')
      const submitted = handovers.filter(h => (h.review_status || 'submitted') === 'submitted')
      list = [...flagged, ...submitted, ...awaitingClosing]
    }
    else if (statusTab === 'pending') list = handovers.filter(h => (h.review_status || 'submitted') === 'submitted')
    else if (statusTab === 'flagged') list = handovers.filter(h => h.review_status === 'flagged')
    else if (statusTab === 'approved') list = allHandovers.filter(h => h.review_status === 'approved')
    else {
      // "all" tab: show queue items + approved/returned from allHandovers
      const queueIds = new Set(handovers.map(h => h.handover_id))
      const extra = allHandovers.filter(h => !queueIds.has(h.handover_id))
      list = [...handovers, ...extra]
    }
    // Client-side shift type filter (when no date is set, server can't filter by shift_id)
    if (filterShiftType) list = list.filter(h => h.shift_type === filterShiftType)
    // When opened for one attendant, narrow to their handovers (active + past).
    if (filterAttendant) list = list.filter(h => h.attendant_id === filterAttendant)
    return list
  })()

  // Unique attendants for dropdown, derived from all loaded handovers
  const uniqueAttendants = useMemo(() => {
    const seen = new Map<string, string>()
    for (const h of [...handovers, ...allHandovers]) {
      if (h.attendant_id && !seen.has(h.attendant_id))
        seen.set(h.attendant_id, h.attendant_name || h.attendant_id)
    }
    return Array.from(seen.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [handovers, allHandovers])

  // Display name for the attendant banner, derived from the filtered rows.
  const filterAttendantName = filterAttendant
    ? (displayedHandovers[0]?.attendant_name
        || allHandovers.find(h => h.attendant_id === filterAttendant)?.attendant_name
        || 'this attendant')
    : ''

  const clearAttendantFilter = () => {
    setFilterAttendant('')
    router.replace('/handover-review', undefined, { shallow: true })
  }

  const handleApprove = async (h: HandoverEntry, note?: string) => {
    setActionLoading(true)
    try {
      let res: Response
      if (h.source === 'readings') {
        res = await authFetch(`${BASE}/enter-readings/review`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            shift_id: h.shift_id,
            attendant_id: h.attendant_id,
            action: 'approve',
            ...(note ? { overall_note: note } : {}),
          }),
        })
      } else {
        res = await authFetch(`${BASE}/handover/review`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            handover_id: h.handover_id,
            action: 'approve',
            ...(note ? { supervisor_note: note } : {}),
          }),
        })
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Approve failed' }))
        throw new Error(err.detail)
      }
      setApproveModalId(null)
      setApproveNote('')
      setError('')
      setSuccessMsg('Handover approved.')
      fetchQueue()
      setExpandedId(null)
    } catch (err: any) {
      setSuccessMsg('')
      setError(err.message)
    } finally {
      setActionLoading(false)
    }
  }

  const handleReturn = async () => {
    if (!returnModalId || !returnNote.trim()) return
    setActionLoading(true)
    try {
      let res: Response
      if (returnModalId.source === 'readings') {
        res = await authFetch(`${BASE}/enter-readings/review`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            shift_id: returnModalId.shift_id,
            attendant_id: returnModalId.attendant_id,
            action: 'return',
            overall_note: returnNote.trim(),
          }),
        })
      } else {
        res = await authFetch(`${BASE}/handover/review`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            handover_id: returnModalId.handover_id,
            action: 'return',
            supervisor_note: returnNote.trim(),
          }),
        })
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Return failed' }))
        throw new Error(err.detail)
      }
      setReturnModalId(null)
      setReturnNote('')
      fetchQueue()
      setExpandedId(null)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setActionLoading(false)
    }
  }

  const handleBatchApprove = async () => {
    if (selectedIds.size === 0) return
    const count = selectedIds.size
    setActionLoading(true)
    try {
      const res = await authFetch(`${BASE}/handover/batch-approve`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ handover_ids: Array.from(selectedIds) }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Batch approve failed' }))
        throw new Error(err.detail)
      }
      setSelectedIds(new Set())
      setError('')
      setSuccessMsg(`${count} handover${count !== 1 ? 's' : ''} approved.`)
      fetchQueue()
    } catch (err: any) {
      setSuccessMsg('')
      setError(err.message)
    } finally {
      setActionLoading(false)
    }
  }

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectableIds = handovers
    .filter(h => (h.review_status || 'submitted') === 'submitted' && h.source !== 'readings')
    .map(h => h.handover_id)

  const toggleSelectAll = () => {
    if (selectedIds.size === selectableIds.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(selectableIds))
    }
  }

  const getExportConfig = (): ExportConfig | null => {
    if (displayedHandovers.length === 0) return null
    const tabLabel: Record<string, string> = {
      all: 'All Handovers', pending: 'Pending Review', flagged: 'Flagged',
      approved: 'Approved', awaiting: 'Awaiting Closing',
    }
    const subtitle = [
      filterDate ? `Date: ${filterDate}` : '',
      filterShiftType ? `Shift: ${filterShiftType}` : '',
    ].filter(Boolean).join('  |  ') || undefined
    return {
      title: `Handover Review - ${tabLabel[statusTab] || 'All'}`,
      subtitle,
      filename: `handover_review_${filterDate || new Date().toISOString().slice(0, 10)}`,
      summaryCards: [
        { label: 'Awaiting Closing', value: awaitingCount },
        { label: 'Pending Review', value: summaryPending },
        { label: 'Flagged', value: summaryFlagged },
        { label: 'Approved Today', value: summaryApprovedToday },
      ],
      columns: [
        { header: 'Date', key: 'date' },
        { header: 'Shift', key: 'shift_id' },
        { header: 'Attendant', key: 'attendant_name' },
        { header: 'Expected Cash', key: 'expected_cash', format: 'currency' },
        { header: 'Actual Cash', key: 'actual_cash', format: 'currency' },
        { header: 'Difference', key: 'difference', format: 'currency' },
        { header: 'Flags', key: '_flags' },
        { header: 'Status', key: 'review_status' },
      ],
      data: displayedHandovers.map(h => ({
        ...h,
        _flags: (h.auto_flag_reasons || []).map(f =>
          f === 'cash_shortage' ? 'Cash Shortage' : f === 'meter_deviation' ? 'Meter Deviation' : f
        ).join(', ') || '-',
      })),
    }
  }

  if (loading) return <LoadingSpinner />

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-bold" style={{ color: theme.textPrimary }}>Handover Review</h1>
        <ExportButtons getConfig={getExportConfig} />
      </div>

      {/* Attendant focus banner — set when opened from a person card on My Shift */}
      {filterAttendant && (
        <div className="rounded-lg p-3 flex items-center justify-between" style={{ backgroundColor: 'var(--color-action-primary-light)', color: 'var(--color-action-primary)', borderWidth: 1, borderColor: 'var(--color-action-primary)' }}>
          <span className="text-sm font-medium">
            Showing <strong>{filterAttendantName}</strong>&rsquo;s shifts (current &amp; past)
          </span>
          <button onClick={clearAttendantFilter} className="text-sm underline">Show all</button>
        </div>
      )}

      {error && (
        <div className="p-3 rounded text-sm" style={{ backgroundColor: 'var(--color-status-error-light, #fde8e8)', color: 'var(--color-status-error)' }}>
          {error}
          <button onClick={() => setError('')} className="ml-2 underline text-xs">dismiss</button>
        </div>
      )}

      {successMsg && (
        <div className="p-3 rounded text-sm" style={{ backgroundColor: 'var(--color-status-success-light, #e6f9e6)', color: 'var(--color-status-success)' }}>
          {successMsg}
          <button onClick={() => setSuccessMsg('')} className="ml-2 underline text-xs">dismiss</button>
        </div>
      )}

      {/* Summary cards — the manager's pipeline at a glance */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Awaiting Closing', value: awaitingCount, color: 'var(--color-status-warning)' },
          { label: 'Pending Review', value: summaryPending, color: 'var(--color-action-primary)' },
          { label: 'Flagged', value: summaryFlagged, color: 'var(--color-status-error)' },
          { label: 'Approved Today', value: summaryApprovedToday, color: 'var(--color-status-success)' },
        ].map(card => (
          <div key={card.label} className="rounded-lg p-4 shadow"
            style={{ backgroundColor: theme.cardBg, borderColor: theme.border, borderWidth: 1 }}>
            <div className="text-xs font-medium uppercase" style={{ color: theme.textSecondary }}>{card.label}</div>
            <div className="text-2xl font-bold mt-1" style={{ color: card.color }}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* All reviewed → nudge to close the day (item 6) */}
      {summaryPending === 0 && summaryFlagged === 0 && awaitingCount === 0 && summaryApprovedToday > 0 && (
        <div className="rounded-lg p-3 flex items-center justify-between" style={{ backgroundColor: 'var(--color-status-success-light)', color: 'var(--color-status-success)', borderWidth: 1, borderColor: 'var(--color-status-success)' }}>
          <span className="text-sm font-medium">All handovers reviewed — nothing outstanding.</span>
          <Link href="/daily-close-off"
            className="px-4 py-2 text-sm font-medium rounded-lg text-white"
            style={{ backgroundColor: 'var(--color-status-success)' }}>
            Next: Daily Close-Off →
          </Link>
        </div>
      )}

      {/* Stale readings warning */}
      {staleReadingsCount > 0 && (
        <div className="rounded-lg p-3 text-sm" style={{ backgroundColor: 'var(--color-status-warning-light)', color: 'var(--color-status-warning)', borderWidth: 1, borderColor: 'var(--color-status-warning)' }}>
          <span className="font-semibold">{staleReadingsCount} attendant(s)</span> have verified readings but haven't completed shift closing (over 4 hours ago). Follow up in the office.
        </div>
      )}

      {/* Filter bar */}
      <div className="rounded-lg p-3 shadow space-y-3"
        style={{ backgroundColor: theme.cardBg, borderColor: theme.border, borderWidth: 1 }}>
        {/* Row 1: filters */}
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: theme.textSecondary }}>Date</label>
            <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)}
              className="px-2 py-1.5 text-sm rounded border"
              style={{ backgroundColor: theme.background, color: theme.textPrimary, borderColor: theme.border }} />
          </div>
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: theme.textSecondary }}>Shift</label>
            <select value={filterShiftType} onChange={e => setFilterShiftType(e.target.value as '' | 'Day' | 'Night')}
              className="px-2 py-1.5 text-sm rounded border"
              style={{ backgroundColor: theme.background, color: theme.textPrimary, borderColor: theme.border }}>
              <option value="">All</option>
              <option value="Day">Day</option>
              <option value="Night">Night</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: theme.textSecondary }}>Attendant</label>
            <select value={filterAttendant} onChange={e => setFilterAttendant(e.target.value)}
              className="px-2 py-1.5 text-sm rounded border"
              style={{ backgroundColor: theme.background, color: theme.textPrimary, borderColor: theme.border }}>
              <option value="">All</option>
              {uniqueAttendants.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
        </div>
        {/* Row 2: status tabs — own full-width row, never competes with filters */}
        <div className="flex gap-1.5 overflow-x-auto flex-nowrap pt-2.5"
          style={{ borderTopColor: theme.border, borderTopWidth: 1 }}>
          {([
            ['todo', 'Action Required'],
            ['approved', 'Approved'],
            ['all', 'All'],
          ] as const).map(([tab, label]) => (
            <button key={tab} onClick={() => setStatusTab(tab)}
              className="px-3 py-1.5 text-xs font-medium rounded-full transition-colors whitespace-nowrap"
              style={{
                backgroundColor: statusTab === tab ? 'var(--color-action-primary)' : 'transparent',
                color: statusTab === tab ? '#fff' : theme.textSecondary,
                borderWidth: 1,
                borderColor: statusTab === tab ? 'var(--color-action-primary)' : theme.border,
              }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Batch approve bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-lg"
          style={{ backgroundColor: 'var(--color-action-primary-light)', borderWidth: 1, borderColor: 'var(--color-action-primary)' }}>
          <span className="text-sm font-medium" style={{ color: 'var(--color-action-primary)' }}>
            {selectedIds.size} selected
          </span>
          <button onClick={handleBatchApprove} disabled={actionLoading}
            className="px-4 py-1.5 text-sm font-medium rounded text-white"
            style={{ backgroundColor: 'var(--color-status-success)' }}>
            {actionLoading ? 'Approving...' : `Approve Selected (${selectedIds.size})`}
          </button>
          <button onClick={() => setSelectedIds(new Set())}
            className="px-3 py-1.5 text-sm rounded"
            style={{ color: theme.textSecondary }}>
            Cancel
          </button>
        </div>
      )}

      {/* Awaiting Closing list — Phase-1 handovers not yet closed (no financials yet) */}
      {statusTab === 'awaiting' && (
        <div className="rounded-lg shadow overflow-x-auto"
          style={{ backgroundColor: theme.cardBg, borderColor: theme.border, borderWidth: 1 }}>
          {awaitingClosing.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm" style={{ color: theme.textSecondary }}>
              No shifts awaiting closing
            </div>
          ) : (
            <>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: theme.background }}>
                  {['Date', 'Shift', 'Attendant', 'Waiting', '', 'Action'].map((h, i) => (
                    <th key={i} className="px-3 py-2 text-left text-xs font-medium uppercase whitespace-nowrap"
                      style={{ color: theme.textSecondary }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {awaitingClosing.slice((awaitingPage - 1) * PAGE_SIZE, awaitingPage * PAGE_SIZE).map(h => (
                  <tr key={h.handover_id} style={{ borderTopColor: theme.border, borderTopWidth: 1 }}>
                    <td className="px-3 py-2" style={{ color: theme.textPrimary }}>{formatDateToDisplay(h.date)}</td>
                    <td className="px-3 py-2" style={{ color: theme.textSecondary }}>{h.shift_type}</td>
                    <td className="px-3 py-2 font-medium" style={{ color: theme.textPrimary }}>{h.attendant_name}</td>
                    <td className="px-3 py-2 font-mono" style={{ color: theme.textSecondary }}>
                      {h.hours_waiting != null ? `${h.hours_waiting}h` : '-'}
                    </td>
                    <td className="px-3 py-2">
                      {h.is_stale && (
                        <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold"
                          style={{ backgroundColor: 'var(--color-status-warning-light)', color: 'var(--color-status-warning)' }}>
                          Stale
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <button onClick={() => router.push(`/shift-closing?handover_id=${encodeURIComponent(h.handover_id)}`)}
                        className="px-2 py-1 text-xs font-medium rounded text-white"
                        style={{ backgroundColor: 'var(--color-action-primary)' }}>
                        Complete closing
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination total={awaitingClosing.length} pageSize={PAGE_SIZE} page={awaitingPage} onPageChange={setAwaitingPage} />
            </>
          )}
        </div>
      )}

      {/* Handover table */}
      {statusTab !== 'awaiting' && (
      <div className="rounded-lg shadow overflow-x-auto"
        style={{ backgroundColor: theme.cardBg, borderColor: theme.border, borderWidth: 1 }}>
        <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: theme.background }}>
              {statusTab !== 'approved' && (
                <th className="px-3 py-2 w-8">
                  <input type="checkbox"
                    checked={selectableIds.length > 0 && selectedIds.size === selectableIds.length}
                    onChange={toggleSelectAll}
                    className="rounded" />
                </th>
              )}
              {['Date', 'Shift', 'Attendant', 'Expected Cash', 'Actual Cash', 'Difference', 'Flags', 'Review Status', 'Actions'].map(h => {
                const rightAlign = ['Expected Cash', 'Actual Cash', 'Difference'].includes(h)
                return (
                  <th key={h} className={`px-3 py-2 ${rightAlign ? 'text-right' : 'text-left'} text-xs font-medium uppercase whitespace-nowrap`}
                    style={{ color: theme.textSecondary }}>{h}</th>
                )
              })}
            </tr>
          </thead>
          {displayedHandovers.length === 0 && (
            <tbody>
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-sm" style={{ color: theme.textSecondary }}>
                  No handovers found
                </td>
              </tr>
            </tbody>
          )}
          {displayedHandovers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(h => {
            const rs = h.review_status || 'submitted'
            const styleMap = REVIEW_STATUS_STYLES[rs] || REVIEW_STATUS_STYLES.submitted
            const isExpanded = expandedId === h.handover_id
            const isAwaiting = statusTab === 'todo' && h.phase === 'readings_verified'
            const isFullySubmitted = h.phase == null || h.phase === 'completed'
            const canSelect = rs === 'submitted' && isFullySubmitted
            const canAct = (rs === 'submitted' || rs === 'flagged') && isFullySubmitted

            return (
              <tbody key={h.handover_id}>
                  <tr className={`hover:bg-surface-bg ${isAwaiting ? '' : 'cursor-pointer'}`}
                    style={{ borderTopColor: theme.border, borderTopWidth: 1 }}
                    onClick={() => { if (!isAwaiting) setExpandedId(isExpanded ? null : h.handover_id) }}>
                    {statusTab !== 'approved' && (
                      <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                        {canSelect && (
                          <input type="checkbox" checked={selectedIds.has(h.handover_id)}
                            onChange={() => toggleSelect(h.handover_id)} className="rounded" />
                        )}
                      </td>
                    )}
                    <td className="px-3 py-2" style={{ color: theme.textPrimary }}>{formatDateToDisplay(h.date)}</td>
                    <td className="px-3 py-2" style={{ color: theme.textSecondary }}>{h.shift_type}</td>
                    <td className="px-3 py-2 font-medium" style={{ color: theme.textPrimary }}>{h.attendant_name}</td>
                    <td className="px-3 py-2 text-right font-mono" style={{ color: theme.textPrimary }}>
                      {isAwaiting || h.source === 'readings' ? '—' : `K${h.expected_cash.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                    </td>
                    <td className="px-3 py-2 text-right font-mono" style={{ color: theme.textPrimary }}>
                      {isAwaiting || h.source === 'readings' ? '—' : `K${h.actual_cash.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-bold"
                      style={{ color: isAwaiting ? theme.textSecondary : h.difference >= 0 ? 'var(--color-status-success)' : 'var(--color-status-error)' }}>
                      {isAwaiting || h.source === 'readings' ? '—' : `${h.difference >= 0 ? '+' : ''}K${h.difference.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                    </td>
                    <td className="px-3 py-2">
                      {isAwaiting ? (
                        <div className="flex flex-wrap gap-1 items-center">
                          {h.hours_waiting != null && (
                            <span className="text-xs font-mono" style={{ color: theme.textSecondary }}>{h.hours_waiting}h waiting</span>
                          )}
                          {h.is_stale && (
                            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold"
                              style={{ backgroundColor: 'var(--color-status-warning-light)', color: 'var(--color-status-warning)' }}>
                              Stale
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {h.source === 'readings' && (
                            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold"
                              style={{ backgroundColor: 'var(--color-action-primary-light)', color: 'var(--color-action-primary)' }}>
                              Enter Readings
                            </span>
                          )}
                          {(h.auto_flag_reasons || []).map(flag => (
                            <span key={flag} className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold"
                              style={{ backgroundColor: 'var(--color-status-error-light, #fde8e8)', color: 'var(--color-status-error)' }}>
                              {FLAG_LABELS[flag] || flag}
                            </span>
                          ))}
                          {!h.source && (!h.auto_flag_reasons || h.auto_flag_reasons.length === 0) && (
                            <span className="text-xs" style={{ color: theme.textSecondary }}>-</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {isAwaiting ? (
                        <span className="inline-block px-2 py-0.5 rounded text-xs font-medium"
                          style={{ backgroundColor: 'var(--color-status-warning-light)', color: 'var(--color-status-warning)' }}>
                          Awaiting closing
                        </span>
                      ) : (
                        <span className="inline-block px-2 py-0.5 rounded text-xs font-medium"
                          style={{ backgroundColor: styleMap.bg, color: styleMap.color }}>
                          {styleMap.label}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                      {isAwaiting ? (
                        <button
                          onClick={() => router.push(`/shift-closing?handover_id=${encodeURIComponent(h.handover_id)}`)}
                          className="px-2 py-1 text-xs font-medium rounded text-white"
                          style={{ backgroundColor: 'var(--color-action-primary)' }}>
                          Complete closing
                        </button>
                      ) : (
                        <div className="flex gap-1 flex-wrap">
                          <button
                            onClick={() => setReadingsModal(h)}
                            className="px-2 py-1 text-xs font-medium rounded"
                            style={{ backgroundColor: theme.background, color: theme.textSecondary, borderWidth: 1, borderColor: theme.border }}>
                            Readings
                          </button>
                          {canAct && (
                            <>
                              <button
                                onClick={() => {
                                  if (rs === 'flagged') {
                                    setApproveModalId(h); setApproveNote('')
                                  } else {
                                    handleApprove(h)
                                  }
                                }}
                                disabled={actionLoading}
                                className="px-2 py-1 text-xs font-medium rounded text-white"
                                style={{ backgroundColor: 'var(--color-status-success)' }}>
                                Approve
                              </button>
                              <button onClick={() => { setReturnModalId(h); setReturnNote('') }}
                                className="px-2 py-1 text-xs font-medium rounded"
                                style={{ backgroundColor: 'var(--color-status-warning-light, #fff8e1)', color: 'var(--color-status-warning)' }}>
                                Return
                              </button>
                            </>
                          )}
                          {rs === 'approved' && (
                            <span className="text-xs self-center" style={{ color: 'var(--color-status-success)' }}>Done</span>
                          )}
                          {rs === 'returned' && (
                            <span className="text-xs self-center" style={{ color: 'var(--color-status-warning)' }}>Returned</span>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>

                  {/* Expanded detail — not available for awaiting rows (no Phase 2 data yet) */}
                  {isExpanded && !isAwaiting && (
                    <tr>
                      <td colSpan={statusTab !== 'approved' ? 10 : 9}
                        style={{ backgroundColor: theme.background, borderTopColor: theme.border, borderTopWidth: 1 }}>
                        <ExpandedDetail h={h} theme={theme} />
                      </td>
                    </tr>
                  )}
                </tbody>
            )
          })}
        </table>
        <Pagination total={displayedHandovers.length} pageSize={PAGE_SIZE} page={page} onPageChange={setPage} />
      </div>
      )}

      {/* Readings Modal */}
      {readingsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setReadingsModal(null)}>
          <div className="rounded-lg shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col"
            style={{ backgroundColor: theme.cardBg, borderColor: theme.border, borderWidth: 1 }}
            onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4"
              style={{ borderBottomColor: theme.border, borderBottomWidth: 1 }}>
              <div>
                <div className="font-semibold text-base" style={{ color: theme.textPrimary }}>
                  Nozzle Readings
                </div>
                <div className="text-xs mt-0.5" style={{ color: theme.textSecondary }}>
                  {readingsModal.attendant_name} — {formatDateToDisplay(readingsModal.date)} {readingsModal.shift_type}
                </div>
              </div>
              <button onClick={() => setReadingsModal(null)}
                className="text-lg leading-none px-2 py-1 rounded hover:bg-surface-bg"
                style={{ color: theme.textSecondary }}>
                x
              </button>
            </div>
            {/* Body */}
            <div className="overflow-auto flex-1 p-5">
              {(!readingsModal.nozzle_summaries || readingsModal.nozzle_summaries.length === 0) ? (
                <p className="text-sm text-center py-6" style={{ color: theme.textSecondary }}>
                  No nozzle readings recorded for this handover.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ backgroundColor: theme.background }}>
                      {['Nozzle', 'Fuel', 'Mech. Opening', 'Elect. Opening', 'Elect. Closing', 'Mech. Closing', 'Volume Sold (L)', 'Revenue (K)'].map(col => (
                        <th key={col} className="px-3 py-2 text-left text-xs font-medium uppercase whitespace-nowrap"
                          style={{ color: theme.textSecondary }}>{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {readingsModal.nozzle_summaries.map(ns => {
                      const label = ns.nozzle_id.replace('ISL', '').replace('-', '')
                      return (
                        <tr key={ns.nozzle_id} style={{ borderTopColor: theme.border, borderTopWidth: 1 }}>
                          <td className="px-3 py-2 font-semibold" style={{ color: theme.textPrimary }}>{label}</td>
                          <td className="px-3 py-2" style={{ color: theme.textSecondary }}>{ns.fuel_type}</td>
                          <td className="px-3 py-2 font-mono text-right" style={{ color: theme.textSecondary }}>
                            {ns.mechanical_opening != null ? ns.mechanical_opening.toLocaleString() : '-'}
                          </td>
                          <td className="px-3 py-2 font-mono text-right" style={{ color: theme.textSecondary }}>
                            {ns.opening_reading.toLocaleString(undefined, { minimumFractionDigits: 3 })}
                          </td>
                          <td className="px-3 py-2 font-mono text-right" style={{ color: theme.textPrimary }}>
                            {ns.closing_reading.toLocaleString(undefined, { minimumFractionDigits: 3 })}
                          </td>
                          <td className="px-3 py-2 font-mono text-right" style={{ color: theme.textSecondary }}>
                            {ns.mechanical_closing != null ? ns.mechanical_closing.toLocaleString() : '-'}
                          </td>
                          <td className="px-3 py-2 font-mono text-right font-medium" style={{ color: theme.textPrimary }}>
                            {ns.volume_sold.toLocaleString(undefined, { minimumFractionDigits: 3 })}
                          </td>
                          <td className="px-3 py-2 font-mono text-right font-medium" style={{ color: theme.textPrimary }}>
                            {ns.revenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTopColor: theme.border, borderTopWidth: 2 }}>
                      <td colSpan={6} className="px-3 py-2 text-xs font-medium uppercase text-right"
                        style={{ color: theme.textSecondary }}>Total</td>
                      <td className="px-3 py-2 font-mono text-right font-bold" style={{ color: theme.textPrimary }}>
                        {readingsModal.nozzle_summaries.reduce((s, n) => s + n.volume_sold, 0)
                          .toLocaleString(undefined, { minimumFractionDigits: 3 })}
                      </td>
                      <td className="px-3 py-2 font-mono text-right font-bold" style={{ color: theme.textPrimary }}>
                        {readingsModal.fuel_revenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Return Modal */}
      {returnModalId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="rounded-lg shadow-lg p-6 w-full max-w-md"
            style={{ backgroundColor: theme.cardBg, borderColor: theme.border, borderWidth: 1 }}>
            <h3 className="text-lg font-semibold mb-3" style={{ color: theme.textPrimary }}>Return Handover</h3>
            <p className="text-sm mb-3" style={{ color: theme.textSecondary }}>
              Provide a reason for returning this handover. The attendant will be notified.
            </p>
            <ReasonChips presets={REASON_PRESETS.returnHandover} value={returnNote} onSelect={setReturnNote} className="mb-2" />
            <textarea
              rows={4}
              value={returnNote}
              onChange={e => setReturnNote(e.target.value)}
              placeholder="Reason for return (required)"
              className="w-full px-3 py-2 text-sm rounded border resize-none"
              style={{ backgroundColor: theme.background, color: theme.textPrimary, borderColor: theme.border }}
            />
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setReturnModalId(null)}
                className="px-4 py-2 text-sm rounded"
                style={{ color: theme.textSecondary, borderWidth: 1, borderColor: theme.border }}>
                Cancel
              </button>
              <button onClick={handleReturn} disabled={!returnNote.trim() || actionLoading}
                className="px-4 py-2 text-sm font-medium rounded text-white disabled:opacity-50"
                style={{ backgroundColor: 'var(--color-status-warning)' }}>
                {actionLoading ? 'Returning...' : 'Confirm Return'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Approve Flagged Modal — a justification note is required */}
      {approveModalId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="rounded-lg shadow-lg p-6 w-full max-w-md"
            style={{ backgroundColor: theme.cardBg, borderColor: theme.border, borderWidth: 1 }}>
            <h3 className="text-lg font-semibold mb-3" style={{ color: theme.textPrimary }}>Approve Flagged Handover</h3>
            <p className="text-sm mb-3" style={{ color: theme.textSecondary }}>
              This handover was flagged (e.g. cash shortage or meter deviation).
              A note explaining why you are approving it anyway is required and recorded in the audit trail.
            </p>
            <ReasonChips presets={REASON_PRESETS.approveFlagged} value={approveNote} onSelect={setApproveNote} className="mb-2" />
            <textarea
              rows={4}
              value={approveNote}
              onChange={e => setApproveNote(e.target.value)}
              placeholder="Justification for approving despite the flag (required)"
              className="w-full px-3 py-2 text-sm rounded border resize-none"
              style={{ backgroundColor: theme.background, color: theme.textPrimary, borderColor: theme.border }}
            />
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => { setApproveModalId(null); setApproveNote('') }}
                className="px-4 py-2 text-sm rounded"
                style={{ color: theme.textSecondary, borderWidth: 1, borderColor: theme.border }}>
                Cancel
              </button>
              <button onClick={() => approveModalId && handleApprove(approveModalId, approveNote.trim())}
                disabled={!approveNote.trim() || actionLoading || !approveModalId}
                className="px-4 py-2 text-sm font-medium rounded text-white disabled:opacity-50"
                style={{ backgroundColor: 'var(--color-status-success)' }}>
                {actionLoading ? 'Approving...' : 'Confirm Approve'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


function ExpandedDetail({ h, theme }: { h: HandoverEntry; theme: any }) {
  const [expandedStock, setExpandedStock] = useState<string | null>(null)
  return (
    <div className="p-4 space-y-4">
      {/* Previous supervisor review */}
      {h.supervisor_review && (
        <div className="p-3 rounded-lg" style={{ backgroundColor: theme.cardBg, borderWidth: 1, borderColor: theme.border }}>
          <div className="text-xs font-medium uppercase mb-1" style={{ color: theme.textSecondary }}>Previous Review</div>
          <div className="text-sm" style={{ color: theme.textPrimary }}>
            <span className="font-medium">{h.supervisor_review.reviewed_by_name}</span>
            {' '}({h.supervisor_review.action}) on {new Date(h.supervisor_review.reviewed_at).toLocaleString()}
          </div>
          {h.supervisor_review.note && (
            <div className="text-sm mt-1 italic" style={{ color: theme.textSecondary }}>
              &ldquo;{h.supervisor_review.note}&rdquo;
            </div>
          )}
        </div>
      )}

      {/* Nozzle readings */}
      <div>
        <div className="text-xs font-medium uppercase mb-2" style={{ color: theme.textSecondary }}>Nozzle Readings</div>
        <table className="min-w-full text-xs">
          <thead>
            <tr style={{ backgroundColor: theme.cardBg }}>
              {['Nozzle', 'Fuel', 'Elect. Open', 'Elect. Close', 'Volume (L)', 'Mech. Vol', 'Deviation', 'Revenue'].map(col => (
                <th key={col} className="px-2 py-1 text-left font-medium uppercase" style={{ color: theme.textSecondary }}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {h.nozzle_summaries.map(ns => (
              <>
                <tr key={ns.nozzle_id} style={{ borderTopWidth: 1, borderTopColor: theme.border }}>
                  <td className="px-2 py-1 font-medium" style={{ color: theme.textPrimary }}>{ns.nozzle_id}</td>
                  <td className="px-2 py-1" style={{ color: theme.textSecondary }}>{ns.fuel_type}</td>
                  <td className="px-2 py-1 text-right font-mono" style={{ color: theme.textSecondary }}>
                    {ns.opening_reading.toLocaleString(undefined, { minimumFractionDigits: 3 })}
                  </td>
                  <td className="px-2 py-1 text-right font-mono" style={{ color: theme.textPrimary }}>
                    {ns.closing_reading.toLocaleString(undefined, { minimumFractionDigits: 3 })}
                  </td>
                  <td className="px-2 py-1 text-right font-mono font-medium" style={{ color: theme.textPrimary }}>
                    {ns.volume_sold.toLocaleString(undefined, { minimumFractionDigits: 3 })}
                  </td>
                  <td className="px-2 py-1 text-right font-mono" style={{ color: theme.textPrimary }}>
                    {ns.mechanical_volume != null ? ns.mechanical_volume.toLocaleString(undefined, { minimumFractionDigits: 3 }) : '-'}
                  </td>
                  <td className="px-2 py-1 text-right font-mono" style={{
                    color: ns.meter_deviation_flagged ? 'var(--color-status-error)' : theme.textSecondary,
                    fontWeight: ns.meter_deviation_flagged ? 600 : 400,
                  }}>
                    {ns.meter_deviation_percent != null
                      ? <>{ns.meter_deviation_flagged && '! '}{ns.meter_deviation_percent.toFixed(2)}%</>
                      : '-'}
                  </td>
                  <td className="px-2 py-1 text-right font-mono font-medium" style={{ color: theme.textPrimary }}>
                    K{ns.revenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                </tr>
                {ns.pre_change_revenue != null && ns.post_change_revenue != null && (
                  <tr key={`${ns.nozzle_id}-split`} style={{ backgroundColor: theme.cardBg }}>
                    <td colSpan={8} className="px-4 py-1.5">
                      <div className="flex flex-wrap gap-4 text-xs" style={{ color: theme.textSecondary }}>
                        <span>
                          Price split{ns.changeover_estimated ? ' (estimated)' : ''}:
                        </span>
                        <span>
                          {ns.pre_change_volume?.toLocaleString(undefined, { minimumFractionDigits: 3 })} L
                          at K{ns.pre_change_price?.toFixed(2)}
                          {' = '}
                          <span className="font-mono font-medium" style={{ color: theme.textPrimary }}>
                            K{ns.pre_change_revenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                        </span>
                        <span>+</span>
                        <span>
                          {ns.post_change_volume?.toLocaleString(undefined, { minimumFractionDigits: 3 })} L
                          at K{ns.post_change_price?.toFixed(2)}
                          {' = '}
                          <span className="font-mono font-medium" style={{ color: theme.textPrimary }}>
                            K{ns.post_change_revenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                        </span>
                        {ns.changeover_estimated && (
                          <span style={{ color: 'var(--color-status-warning)' }}>
                            No meter snapshot - split estimated by time
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>

      {/* Financial summary — hidden for enter-readings source rows */}
      {h.source !== 'readings' && <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Fuel Revenue', value: h.fuel_revenue, drillKey: '' },
          { label: 'LPG Sales', value: h.lpg_sales, drillKey: 'lpg' },
          { label: 'Lubricant Sales', value: h.lubricant_sales, drillKey: 'lubricants' },
          { label: 'Accessory Sales', value: h.accessory_sales, drillKey: 'accessories' },
          { label: 'Total Expected', value: h.total_expected, drillKey: '' },
          { label: 'Credit Sales', value: h.credit_sales, drillKey: '' },
          { label: 'Expected Cash', value: h.expected_cash, drillKey: '' },
          { label: 'Actual Cash', value: h.actual_cash, drillKey: '' },
        ].map(item => (
          <div key={item.label}
            onClick={() => {
              if (item.drillKey && h.stock_snapshot) {
                setExpandedStock(prev => prev === item.drillKey ? null : item.drillKey)
              }
            }}
            className={item.drillKey && h.stock_snapshot ? 'cursor-pointer hover:ring-1 hover:ring-action-primary/30 rounded-lg p-1 -m-1 transition-all' : ''}
            style={expandedStock === item.drillKey ? { outline: '2px solid var(--color-action-primary)', borderRadius: 8 } : {}}>
            <div className="text-[10px] uppercase" style={{ color: theme.textSecondary }}>
              {item.label}
              {item.drillKey && h.stock_snapshot && <span className="ml-1 text-action-primary">▾</span>}
            </div>
            <div className="text-sm font-mono font-medium" style={{ color: theme.textPrimary }}>
              K{item.value.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
          </div>
        ))}
        <div>
          <div className="text-[10px] uppercase" style={{ color: theme.textSecondary }}>Difference</div>
          <div className="text-sm font-mono font-bold"
            style={{ color: h.difference >= 0 ? 'var(--color-status-success)' : 'var(--color-status-error)' }}>
            {h.difference >= 0 ? '+' : ''}K{h.difference.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
        </div>
      </div>}

      {/* Stock drill-down panels */}
      {expandedStock === 'lpg' && h.stock_snapshot?.lpg_cylinders && (
        <div className="mt-3 rounded-lg p-3" style={{ backgroundColor: theme.background, borderColor: theme.border, borderWidth: 1 }}>
          <div className="text-xs font-semibold uppercase mb-2" style={{ color: theme.textSecondary }}>LPG Cylinder Breakdown</div>
          <table className="min-w-full text-xs">
            <thead>
              <tr>
                {['Size', 'Refills', 'New Cyl', 'Damaged', 'Variance', 'Revenue'].map(col => (
                  <th key={col} className="px-2 py-1 text-center font-medium uppercase" style={{ color: theme.textSecondary }}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {h.stock_snapshot.lpg_cylinders
                .filter((r: any) => (r.total_sold || r.sold_refill + r.sold_with_cylinder) > 0 || (r.damaged || 0) > 0 || (r.variance || 0) !== 0)
                .map((r: any) => (
                <tr key={r.size_kg} style={{ borderTopColor: theme.border, borderTopWidth: 1 }}>
                  <td className="px-2 py-1 text-center font-medium" style={{ color: theme.textPrimary }}>{r.size_kg}kg</td>
                  <td className="px-2 py-1 text-center font-mono" style={{ color: theme.textPrimary }}>
                    {r.sold_refill || 0}{r.refill_price ? ` × K${r.refill_price}` : ''}
                  </td>
                  <td className="px-2 py-1 text-center font-mono" style={{ color: theme.textPrimary }}>
                    {r.sold_with_cylinder || 0}{r.price_with_cylinder ? ` × K${r.price_with_cylinder}` : ''}
                  </td>
                  <td className="px-2 py-1 text-center font-mono" style={{ color: (r.damaged || 0) > 0 ? 'var(--color-status-warning)' : theme.textSecondary }}>
                    {r.damaged || 0}
                  </td>
                  <td className="px-2 py-1 text-center font-mono" style={{ color: (r.variance || 0) !== 0 ? 'var(--color-status-error)' : theme.textSecondary }}>
                    {r.variance || 0}{r.variance_note ? ` (${r.variance_note})` : ''}
                  </td>
                  <td className="px-2 py-1 text-center font-mono font-medium" style={{ color: theme.primary }}>
                    K{(r.sales_value || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {expandedStock === 'accessories' && h.stock_snapshot?.accessories && (
        <div className="mt-3 rounded-lg p-3" style={{ backgroundColor: theme.background, borderColor: theme.border, borderWidth: 1 }}>
          <div className="text-xs font-semibold uppercase mb-2" style={{ color: theme.textSecondary }}>Accessories Breakdown</div>
          <table className="min-w-full text-xs">
            <thead>
              <tr>
                {['Product', 'Sold', 'Damaged', 'Unit Price', 'Revenue', 'Variance'].map(col => (
                  <th key={col} className="px-2 py-1 text-left font-medium uppercase" style={{ color: theme.textSecondary }}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {h.stock_snapshot.accessories
                .filter((r: any) => (r.sold || 0) > 0 || (r.damaged || 0) > 0 || (r.variance || 0) !== 0)
                .map((r: any) => (
                <tr key={r.product_code} style={{ borderTopColor: theme.border, borderTopWidth: 1 }}>
                  <td className="px-2 py-1 font-medium" style={{ color: theme.textPrimary }}>{r.description}</td>
                  <td className="px-2 py-1 font-mono" style={{ color: theme.textPrimary }}>{r.sold || 0}</td>
                  <td className="px-2 py-1 font-mono" style={{ color: (r.damaged || 0) > 0 ? 'var(--color-status-warning)' : theme.textSecondary }}>{r.damaged || 0}</td>
                  <td className="px-2 py-1 font-mono" style={{ color: theme.textSecondary }}>K{(r.unit_price || 0).toLocaleString()}</td>
                  <td className="px-2 py-1 font-mono font-medium" style={{ color: theme.primary }}>K{(r.sales_value || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td className="px-2 py-1 font-mono" style={{ color: (r.variance || 0) !== 0 ? 'var(--color-status-error)' : theme.textSecondary }}>
                    {r.variance || 0}{r.variance_note ? ` (${r.variance_note})` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {expandedStock === 'lubricants' && h.stock_snapshot?.lubricants && (
        <div className="mt-3 rounded-lg p-3" style={{ backgroundColor: theme.background, borderColor: theme.border, borderWidth: 1 }}>
          <div className="text-xs font-semibold uppercase mb-2" style={{ color: theme.textSecondary }}>Lubricants Breakdown</div>
          <table className="min-w-full text-xs">
            <thead>
              <tr>
                {['Product', 'Sold', 'Damaged', 'Unit Price', 'Revenue', 'Variance'].map(col => (
                  <th key={col} className="px-2 py-1 text-left font-medium uppercase" style={{ color: theme.textSecondary }}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {h.stock_snapshot.lubricants
                .filter((r: any) => (r.sold || 0) > 0 || (r.damaged || 0) > 0 || (r.variance || 0) !== 0)
                .map((r: any) => (
                <tr key={r.product_code} style={{ borderTopColor: theme.border, borderTopWidth: 1 }}>
                  <td className="px-2 py-1 font-medium" style={{ color: theme.textPrimary }}>{r.description}</td>
                  <td className="px-2 py-1 font-mono" style={{ color: theme.textPrimary }}>{r.sold || 0}</td>
                  <td className="px-2 py-1 font-mono" style={{ color: (r.damaged || 0) > 0 ? 'var(--color-status-warning)' : theme.textSecondary }}>{r.damaged || 0}</td>
                  <td className="px-2 py-1 font-mono" style={{ color: theme.textSecondary }}>K{(r.unit_price || 0).toLocaleString()}</td>
                  <td className="px-2 py-1 font-mono font-medium" style={{ color: theme.primary }}>K{(r.sales_value || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td className="px-2 py-1 font-mono" style={{ color: (r.variance || 0) !== 0 ? 'var(--color-status-error)' : theme.textSecondary }}>
                    {r.variance || 0}{r.variance_note ? ` (${r.variance_note})` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Credit Sale Details */}
      {h.credit_sale_details && h.credit_sale_details.length > 0 && (
        <div>
          <div className="text-xs font-medium uppercase mb-2" style={{ color: theme.textSecondary }}>Credit Sale Items</div>
          <table className="min-w-full text-xs">
            <thead>
              <tr style={{ backgroundColor: theme.cardBg }}>
                {['Account', 'Fuel Type', 'Volume (L)', 'Price/L', 'Amount', 'Source'].map(col => (
                  <th key={col} className="px-2 py-1 text-left font-medium uppercase" style={{ color: theme.textSecondary }}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {h.credit_sale_details.map((d, idx) => (
                <tr key={idx} style={{ borderTopWidth: 1, borderTopColor: theme.border }}>
                  <td className="px-2 py-1 font-medium" style={{ color: theme.textPrimary }}>{d.account_name}</td>
                  <td className="px-2 py-1" style={{ color: theme.textSecondary }}>{d.fuel_type}</td>
                  <td className="px-2 py-1 text-right font-mono" style={{ color: theme.textPrimary }}>
                    {d.volume.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-2 py-1 text-right font-mono" style={{ color: theme.textSecondary }}>
                    {d.price_per_liter.toFixed(2)}
                  </td>
                  <td className="px-2 py-1 text-right font-mono font-medium" style={{ color: theme.textPrimary }}>
                    K{d.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-2 py-1">
                    {d.source === 'pre_existing' && (
                      <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold"
                        style={{ backgroundColor: 'var(--color-action-primary-light)', color: 'var(--color-action-primary)' }}>
                        Already Recorded
                      </span>
                    )}
                    {d.over_limit && (
                      <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold"
                        style={{ backgroundColor: 'var(--color-status-error-light, #fde8e8)', color: 'var(--color-status-error)' }}>
                        Over Limit
                      </span>
                    )}
                    {d.source === 'skipped_duplicate' && (
                      <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold"
                        style={{ backgroundColor: 'var(--color-status-warning-light, #fff8e1)', color: 'var(--color-status-warning)' }}>
                        Duplicate (Skipped)
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Notes */}
      {h.notes && (
        <div>
          <div className="text-xs font-medium uppercase mb-1" style={{ color: theme.textSecondary }}>Attendant Notes</div>
          <div className="text-sm p-2 rounded" style={{ backgroundColor: theme.cardBg, color: theme.textPrimary, borderWidth: 1, borderColor: theme.border }}>
            {h.notes}
          </div>
        </div>
      )}

      {/* Safe Deposits */}
      <SafeDepositSummary shiftId={h.shift_id} attendantId={h.attendant_id} theme={theme} />
    </div>
  )
}

function SafeDepositSummary({ shiftId, attendantId, theme }: { shiftId: string; attendantId: string; theme: any }) {
  const [deposits, setDeposits] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    authFetch(`${BASE}/safe-deposits/${shiftId}`)
      .then(r => r.ok ? r.json() : { attendants: [] })
      .then(data => {
        const att = (data.attendants || []).find((a: any) => a.attendant_id === attendantId)
        if (att) {
          setDeposits(att.deposits || [])
          setTotal(att.total || 0)
        }
      })
      .catch(() => {})
  }, [shiftId, attendantId])

  if (deposits.length === 0) return null

  return (
    <div>
      <button onClick={() => setExpanded(!expanded)} className="w-full text-left">
        <div className="text-xs font-medium uppercase mb-1 flex justify-between" style={{ color: theme.textSecondary }}>
          <span>Safe Deposits ({deposits.length} deposit{deposits.length !== 1 ? 's' : ''} — K{total.toLocaleString()})</span>
          <span>{expanded ? '−' : '+'}</span>
        </div>
      </button>
      {expanded && (
      <div className="space-y-1">
        {deposits.map((d: any) => (
          <div key={d.deposit_id} className="flex justify-between text-xs p-1.5 rounded"
            style={{ backgroundColor: theme.background }}>
            <span style={{ color: theme.textSecondary }}>
              {d.time || new Date(d.timestamp).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})} {d.note && `— ${d.note}`}
            </span>
            <span className="font-semibold" style={{ color: theme.textPrimary }}>K{d.amount.toLocaleString()}</span>
          </div>
        ))}
      </div>
      )}
    </div>
  )
}
