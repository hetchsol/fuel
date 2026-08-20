import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { useTheme } from '../contexts/ThemeContext'
import LoadingSpinner from '../components/LoadingSpinner'
import ReasonChips, { REASON_PRESETS } from '../components/ReasonChips'
import TankDipsCapture from '../components/TankDipsCapture'
import { loadTankDips } from '../lib/tankDips'
import { getHeaders, authFetch } from '../lib/api'
import ExportButtons from '../components/ExportButtons'
import Pagination from '../components/Pagination'
import { ExportConfig } from '../lib/exportUtils'
import { formatDateToDisplay } from '../lib/dateUtils'
import { CreditItem, OtherProduct, NewAccountModal, fetchOtherProducts } from '../components/CreditSaleShared'
import toast from 'react-hot-toast'

const PAGE_SIZE = 20

const fmtK = (v: number) => `K${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

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
    duplicate_reading_flagged?: boolean | null
    duplicate_reading_conflict_shift_id?: string | null
    duplicate_reading_note?: string | null
    implausible_volume_flagged?: boolean | null
    implausible_volume_note?: string | null
    excluded_from_checks?: boolean | null
    excluded_reason?: string | null
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
  pos_breakdown?: { type_id: string; type_name: string; amount: number; reference?: string }[] | null
  pos_terminal_batch_total?: number | null
  pos_terminal_variance?: number | null
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
  admin_override?: { reason: string; overridden_by_name: string; overridden_at: string } | null
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
  voided: { bg: 'var(--color-surface-border, #eee)', color: 'var(--color-content-secondary)', label: 'Voided' },
}

const FLAG_LABELS: Record<string, string> = {
  cash_shortage: 'Cash Shortage',
  meter_deviation: 'Meter Deviation',
  pos_terminal_variance: 'POS Terminal Variance',
  stock_variance_unexplained: 'Stock Variance',
  nozzle_loss_exceeded: 'Nozzle Loss Exceeded',
  duplicate_meter_reading: 'Duplicate Meter Reading',
  implausible_volume: 'Implausible Volume',
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

  // Tank dips modal — shown when Close & Approve finds (or hits) missing dips.
  // dipModalRetryClose distinguishes "opened from the proactive pre-check"
  // (save -> open the cash form) from "opened after a 409 mid-submit"
  // (save -> retry the close automatically, cash data is already filled in).
  const [dipModalHandover, setDipModalHandover] = useState<HandoverEntry | null>(null)
  const [dipModalRetryClose, setDipModalRetryClose] = useState(false)
  // Safety net against a retry loop: if submit-closing still 409s right after
  // the dip modal was just saved for this same handover, something the modal
  // can't fix is wrong server-side — stop retrying automatically and surface
  // it instead of reopening the modal again.
  const [dipRetryAttempted, setDipRetryAttempted] = useState<string | null>(null)
  // True only for the "still blocked after one retry" case above — lets the
  // cash form offer a direct link to the standalone Tank Dips page instead of
  // just naming the problem.
  const [closingDipBlocked, setClosingDipBlocked] = useState(false)

  // Informational-only: co-attendants on the same shift who haven't submitted
  // readings yet. Nothing to fix here except wait — no input, just a notice.
  const [pendingAttendantsModal, setPendingAttendantsModal] = useState<
    { handover: HandoverEntry; pending: { attendant_id: string; attendant_name: string }[] } | null
  >(null)

  // Owner-only bulk administrative override for a stuck Awaiting Closing backlog.
  // Separate selection set from `selectedIds` (used by the pending-tab batch
  // approve) so the two don't interfere with each other.
  const [overrideSelectedIds, setOverrideSelectedIds] = useState<Set<string>>(new Set())
  const [overrideModalOpen, setOverrideModalOpen] = useState(false)
  const [overrideReason, setOverrideReason] = useState('')
  const [overrideLoading, setOverrideLoading] = useState(false)
  const [overrideError, setOverrideError] = useState('')

  // Selection for batch-approve
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Return modal
  const [returnModalId, setReturnModalId] = useState<HandoverEntry | null>(null)
  const [returnNote, setReturnNote] = useState('')
  // Approve-with-note modal (required for flagged handovers)
  const [approveModalId, setApproveModalId] = useState<HandoverEntry | null>(null)
  const [approveNote, setApproveNote] = useState('')
  const [actionLoading, setActionLoading] = useState(false)

  // Inline closing form (Phase 2 embedded in this page)
  const [closingFormId, setClosingFormId] = useState<string | null>(null)
  const [closingCash, setClosingCash] = useState('')
  const [closingPosAmounts, setClosingPosAmounts] = useState<Record<string, string>>({})
  const [closingPosRefs, setClosingPosRefs] = useState<Record<string, string>>({})
  const [closingPosTerminalBatch, setClosingPosTerminalBatch] = useState('')
  const [closingNotes, setClosingNotes] = useState('')
  const [closingCreditItems, setClosingCreditItems] = useState<CreditItem[]>([])
  const [closingSafeDeposit, setClosingSafeDeposit] = useState(0)
  const [closingSubmitting, setClosingSubmitting] = useState(false)
  const [closingError, setClosingError] = useState('')
  const [creditAccounts, setCreditAccounts] = useState<any[]>([])
  const [fuelPrices, setFuelPrices] = useState<Record<string, number>>({ Diesel: 0, Petrol: 0 })
  const [posTypes, setPosTypes] = useState<{ type_id: string; name: string; is_active: boolean }[]>([])
  const [otherProducts, setOtherProducts] = useState<OtherProduct[]>([])

  const [currentUserRole, setCurrentUserRole] = useState('')

  // Auth check
  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (userData) {
      const user = JSON.parse(userData)
      if (user.role !== 'supervisor' && user.role !== 'manager' && user.role !== 'owner') {
        router.push('/')
      }
      setCurrentUserRole(user.role || '')
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

  // Load credit accounts and POS types once — needed for the inline closing form
  useEffect(() => {
    authFetch(`${BASE}/handover/credit-accounts`, { headers: getAuthHeaders() })
      .then(r => r.ok ? r.json() : { accounts: [], fuel_prices: {} })
      .then(data => {
        setCreditAccounts(data.accounts || [])
        setFuelPrices(data.fuel_prices || { Diesel: 0, Petrol: 0 })
      })
    authFetch(`${BASE}/settings/pos`, { headers: getAuthHeaders() })
      .then(r => r.ok ? r.json() : { payment_types: [] })
      .then(data => {
        const active = (data.payment_types || []).filter((t: any) => t.is_active)
        setPosTypes(active)
        const init: Record<string, string> = {}
        active.forEach((t: any) => { init[t.type_id] = '' })
        setClosingPosAmounts(init)
      })
      .catch(() => {})
    // Non-fuel products a credit sale can be entered against — see
    // fetchOtherProducts for why these specific catalogs.
    fetchOtherProducts().then(setOtherProducts)
  }, [])

  // When a closing form opens: reset fields + fetch safe deposits for pre-fill
  useEffect(() => {
    if (!closingFormId) return
    const h = awaitingClosing.find(x => x.handover_id === closingFormId)
    if (!h) return
    setClosingCash('')
    const resetAmounts: Record<string, string> = {}
    posTypes.forEach(t => { resetAmounts[t.type_id] = '' })
    setClosingPosAmounts(resetAmounts)
    setClosingPosRefs({})
    setClosingPosTerminalBatch('')
    setClosingNotes('')
    setClosingCreditItems([])
    setClosingSafeDeposit(0)
    setClosingError('')
    authFetch(`${BASE}/safe-deposits/${encodeURIComponent(h.shift_id)}`, { headers: getAuthHeaders() })
      .then(r => r.ok ? r.json() : { total_amount: 0 })
      .then(data => {
        const total = data.total_amount || 0
        setClosingSafeDeposit(total)
        if (total > 0) setClosingCash(total.toFixed(2))
      })
      .catch(() => {})
  }, [closingFormId]) // eslint-disable-line react-hooks/exhaustive-deps

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

  const handleCloseAndApprove = async (h: HandoverEntry) => {
    setClosingSubmitting(true)
    setClosingError('')
    setClosingDipBlocked(false)
    const actualCashVal = parseFloat(closingCash) || 0
    const posItems = posTypes
      .map(t => ({ type_id: t.type_id, type_name: t.name, amount: parseFloat(closingPosAmounts[t.type_id] || '0') || 0, reference: closingPosRefs[t.type_id] || undefined }))
      .filter(i => i.amount > 0)
    const posTotal = posItems.reduce((s, i) => s + i.amount, 0)
    const creditTotal = closingCreditItems.reduce((s, i) => s + (i.amount || 0), 0)
    try {
      // Step 1: submit Phase 2 financials
      const closeRes = await authFetch(`${BASE}/handover/submit-closing`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          handover_id: h.handover_id,
          actual_cash: actualCashVal,
          pos_receipts: posTotal,
          pos_items: posItems,
          pos_terminal_batch_total: closingPosTerminalBatch !== '' ? parseFloat(closingPosTerminalBatch) || 0 : null,
          credit_sales: creditTotal,
          credit_sale_items: closingCreditItems.map(i => ({
            account_id: i.account_id,
            account_name: i.account_name,
            fuel_type: i.fuel_type,
            volume: parseFloat(i.volume) || 0,
            price_per_liter: i.price_per_liter || 0,
          })),
          notes: closingNotes || null,
        }),
      })
      if (!closeRes.ok) {
        if (closeRes.status === 409) {
          if (dipRetryAttempted === h.handover_id) {
            // Already looped through the dip modal once for this handover and
            // it still won't clear — don't reopen it again and spin forever.
            const err = await closeRes.json().catch(() => ({ detail: 'Tank dips are still incomplete for this shift.' }))
            setClosingError(err.detail)
            setClosingDipBlocked(true)
            return
          }
          // Blocked on missing tank dips, discovered mid-submit (e.g. it changed
          // since the pre-check). This form has no dip inputs, so open the modal
          // in place — on save, retry this same close with the cash data intact.
          setDipRetryAttempted(h.handover_id)
          setDipModalHandover(h)
          setDipModalRetryClose(true)
          return
        }
        const err = await closeRes.json().catch(() => ({ detail: 'Closing failed' }))
        throw new Error(err.detail)
      }

      // Step 2: approve
      const reviewRes = await authFetch(`${BASE}/handover/review`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ handover_id: h.handover_id, action: 'approve' }),
      })
      if (!reviewRes.ok) {
        const err = await reviewRes.json().catch(() => ({ detail: 'Approval failed' }))
        // Closing saved but approval blocked (e.g. flagged — needs note). Close the
        // inline form and refresh so the handover appears in the queue as approvable.
        setClosingFormId(null)
        fetchQueue()
        setError(`Closing saved. ${err.detail}`)
        return
      }

      setClosingFormId(null)
      setError('')
      setSuccessMsg(`${h.attendant_name}'s shift closed and approved.`)
      fetchQueue()
    } catch (err: any) {
      setClosingError(err.message)
    } finally {
      setClosingSubmitting(false)
    }
  }

  // Shared by both ClosingForm render sites (desktop + mobile) so a credit
  // account created inline from either one is immediately available in both.
  const handleAccountCreated = (acct: any) => {
    setCreditAccounts(prev => [...prev, acct])
  }

  // Entry point for all "Close & Approve" buttons: check dips before ever
  // showing the cash form, so a manager isn't blocked after filling it in.
  const openCloseAndApprove = async (h: HandoverEntry) => {
    if (closingFormId === h.handover_id) { setClosingFormId(null); return }
    setDipRetryAttempted(null)
    setClosingDipBlocked(false)
    try {
      const { allComplete } = await loadTankDips(h.date, h.shift_type)
      if (!allComplete) {
        setDipModalHandover(h)
        setDipModalRetryClose(false)
        return
      }
    } catch {}
    try {
      const res = await authFetch(`${BASE}/handover/shift-submission-status/${encodeURIComponent(h.shift_id)}?bar=readings`, { headers: getAuthHeaders() })
      if (res.ok) {
        const status = await res.json()
        const pending = status.pending || []
        if (pending.length > 0) {
          setPendingAttendantsModal({ handover: h, pending })
          return
        }
      }
    } catch {}
    setClosingFormId(h.handover_id)
  }

  const toggleOverrideSelectAll = () => {
    const ids = awaitingClosing.map(h => h.handover_id)
    setOverrideSelectedIds(prev => prev.size === ids.length ? new Set() : new Set(ids))
  }

  const toggleOverrideRow = (id: string) => {
    setOverrideSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleAdminOverrideClose = async () => {
    if (!overrideReason.trim() || overrideSelectedIds.size === 0) return
    setOverrideLoading(true)
    setOverrideError('')
    try {
      const res = await authFetch(`${BASE}/handover/admin-override-close`, {
        method: 'POST',
        headers: { ...getHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ handover_ids: Array.from(overrideSelectedIds), reason: overrideReason.trim() }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Failed to close shifts' }))
        throw new Error(err.detail || 'Failed to close shifts')
      }
      const data = await res.json()
      setOverrideModalOpen(false)
      setOverrideReason('')
      setOverrideSelectedIds(new Set())
      setSuccessMsg(`${data.closed.length} shift(s) administratively closed.${data.skipped.length ? ` ${data.skipped.length} skipped (no longer awaiting closing).` : ''}`)
      fetchQueue()
    } catch (err: any) {
      setOverrideError(err.message || 'Failed to close shifts')
    } finally {
      setOverrideLoading(false)
    }
  }

  const getExportConfig = (): ExportConfig | null => {
    if (displayedHandovers.length === 0) return null
    const tabLabel: Record<string, string> = {
      all: 'All Handovers', pending: 'Pending Review', flagged: 'Flagged',
      approved: 'Approved', awaiting: 'Awaiting Closing',
    }
    const subtitle = [
      filterDate ? `Date: ${formatDateToDisplay(filterDate)}` : '',
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
        { header: 'Date', key: 'date', format: 'date' },
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
        _flags: (h.auto_flag_reasons || []).map(f => FLAG_LABELS[f] || f).join(', ') || '-',
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
          <span className="font-semibold">{staleReadingsCount} entries</span> have been verified but the shift has not been completed (over 4 hours ago). Follow up in the office.
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
        <>
        {currentUserRole === 'owner' && overrideSelectedIds.size > 0 && (
          <div className="flex items-center gap-3 p-3 mb-3 rounded-lg"
            style={{ backgroundColor: 'var(--color-status-warning-light)', borderWidth: 1, borderColor: 'var(--color-status-warning)' }}>
            <span className="text-sm font-medium" style={{ color: 'var(--color-status-warning)' }}>
              {overrideSelectedIds.size} selected
            </span>
            <button onClick={() => setOverrideModalOpen(true)}
              className="px-4 py-1.5 text-sm font-medium rounded text-white"
              style={{ backgroundColor: 'var(--color-status-warning)' }}>
              Override Close Selected (Owner)
            </button>
            <button onClick={() => setOverrideSelectedIds(new Set())}
              className="text-sm" style={{ color: 'var(--color-status-warning)' }}>
              Clear
            </button>
          </div>
        )}
        <div className="rounded-lg shadow overflow-x-auto"
          style={{ backgroundColor: theme.cardBg, borderColor: theme.border, borderWidth: 1 }}>
          {awaitingClosing.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm" style={{ color: theme.textSecondary }}>
              No shifts awaiting closing
            </div>
          ) : (
            <>
            {/* Mobile card list — same data/handlers as the table below, presentation only */}
            <div className="md:hidden space-y-3 p-3">
              {awaitingClosing.slice((awaitingPage - 1) * PAGE_SIZE, awaitingPage * PAGE_SIZE).map(h => (
                <div key={h.handover_id} className="rounded-lg p-3" style={{ backgroundColor: theme.background, borderColor: theme.border, borderWidth: 1 }}>
                  <div className="flex items-center justify-between mb-2 gap-2">
                    <span className="flex items-center gap-2">
                      {currentUserRole === 'owner' && (
                        <input type="checkbox" checked={overrideSelectedIds.has(h.handover_id)}
                          onChange={() => toggleOverrideRow(h.handover_id)} />
                      )}
                      <span className="font-semibold text-sm" style={{ color: theme.textPrimary }}>{h.attendant_name}</span>
                    </span>
                    {h.is_stale && (
                      <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold shrink-0"
                        style={{ backgroundColor: 'var(--color-status-warning-light)', color: 'var(--color-status-warning)' }}>
                        Stale
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="block text-[10px] uppercase font-medium mb-1" style={{ color: theme.textSecondary }}>Date</label>
                      <div style={{ color: theme.textPrimary }}>{formatDateToDisplay(h.date)}</div>
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase font-medium mb-1" style={{ color: theme.textSecondary }}>Shift</label>
                      <div style={{ color: theme.textSecondary }}>{h.shift_type}</div>
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase font-medium mb-1" style={{ color: theme.textSecondary }}>Waiting</label>
                      <div className="font-mono" style={{ color: theme.textSecondary }}>
                        {h.hours_waiting != null ? `${h.hours_waiting}h` : '-'}
                      </div>
                    </div>
                  </div>
                  <button onClick={() => { setStatusTab('todo'); openCloseAndApprove(h) }}
                    className="w-full min-h-[44px] px-2 py-1 text-sm font-medium rounded text-white"
                    style={{ backgroundColor: 'var(--color-action-primary)' }}>
                    Close & Approve
                  </button>
                </div>
              ))}
            </div>
            <div className="hidden md:block">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: theme.background }}>
                  {currentUserRole === 'owner' && (
                    <th className="px-3 py-2 w-8">
                      <input type="checkbox"
                        checked={overrideSelectedIds.size === awaitingClosing.length && awaitingClosing.length > 0}
                        onChange={toggleOverrideSelectAll} />
                    </th>
                  )}
                  {['Date', 'Shift', 'Attendant', 'Waiting', '', 'Action'].map((h, i) => (
                    <th key={i} className="px-3 py-2 text-left text-xs font-medium uppercase whitespace-nowrap"
                      style={{ color: theme.textSecondary }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {awaitingClosing.slice((awaitingPage - 1) * PAGE_SIZE, awaitingPage * PAGE_SIZE).map(h => (
                  <tr key={h.handover_id} style={{ borderTopColor: theme.border, borderTopWidth: 1 }}>
                    {currentUserRole === 'owner' && (
                      <td className="px-3 py-2">
                        <input type="checkbox" checked={overrideSelectedIds.has(h.handover_id)}
                          onChange={() => toggleOverrideRow(h.handover_id)} />
                      </td>
                    )}
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
                      <button onClick={() => { setStatusTab('todo'); openCloseAndApprove(h) }}
                        className="px-2 py-1 text-xs font-medium rounded text-white"
                        style={{ backgroundColor: 'var(--color-action-primary)' }}>
                        Close & Approve
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            <Pagination total={awaitingClosing.length} pageSize={PAGE_SIZE} page={awaitingPage} onPageChange={setAwaitingPage} />
            </>
          )}
        </div>
        </>
      )}

      {/* Handover table */}
      {statusTab !== 'awaiting' && (
      <div className="rounded-lg shadow"
        style={{ backgroundColor: theme.cardBg, borderColor: theme.border, borderWidth: 1 }}>
        {/* Mobile card list — same data/handlers as the table below, presentation only */}
        <div className="md:hidden space-y-3 p-3">
          {displayedHandovers.length === 0 && (
            <div className="px-4 py-8 text-center text-sm" style={{ color: theme.textSecondary }}>No handovers found</div>
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
              <div key={h.handover_id} className="rounded-lg p-3" style={{ backgroundColor: theme.background, borderColor: theme.border, borderWidth: 1 }}
                onClick={() => { if (!isAwaiting) setExpandedId(isExpanded ? null : h.handover_id) }}>
                <div className="flex items-center justify-between mb-2 gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {statusTab !== 'approved' && canSelect && (
                      <input type="checkbox" checked={selectedIds.has(h.handover_id)}
                        onChange={() => toggleSelect(h.handover_id)} onClick={e => e.stopPropagation()} className="rounded shrink-0" />
                    )}
                    <span className="font-semibold text-sm truncate" style={{ color: theme.textPrimary }}>{h.attendant_name}</span>
                  </div>
                  {isAwaiting ? (
                    <span className="inline-block px-2 py-0.5 rounded text-xs font-medium shrink-0"
                      style={{ backgroundColor: 'var(--color-status-warning-light)', color: 'var(--color-status-warning)' }}>
                      Awaiting closing
                    </span>
                  ) : (
                    <span className="inline-block px-2 py-0.5 rounded text-xs font-medium shrink-0"
                      style={{ backgroundColor: styleMap.bg, color: styleMap.color }}>
                      {styleMap.label}
                    </span>
                  )}
                  {h.admin_override && (
                    <span className="inline-block px-2 py-0.5 rounded text-xs font-medium shrink-0"
                      style={{ backgroundColor: 'var(--color-status-warning-light)', color: 'var(--color-status-warning)' }}
                      title={`Reason: ${h.admin_override.reason}`}>
                      Admin Override
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3 mb-2">
                  <div>
                    <label className="block text-[10px] uppercase font-medium mb-1" style={{ color: theme.textSecondary }}>Date</label>
                    <div style={{ color: theme.textPrimary }}>{formatDateToDisplay(h.date)} &middot; {h.shift_type}</div>
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase font-medium mb-1" style={{ color: theme.textSecondary }}>Difference</label>
                    <div className="font-mono font-bold" style={{ color: isAwaiting ? theme.textSecondary : h.difference >= 0 ? 'var(--color-status-success)' : 'var(--color-status-error)' }}>
                      {isAwaiting || h.source === 'readings' ? '—' : `${h.difference >= 0 ? '+' : ''}K${h.difference.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase font-medium mb-1" style={{ color: theme.textSecondary }}>Expected Cash</label>
                    <div className="font-mono" style={{ color: theme.textPrimary }}>
                      {isAwaiting || h.source === 'readings' ? '—' : `K${h.expected_cash.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase font-medium mb-1" style={{ color: theme.textSecondary }}>Actual Cash</label>
                    <div className="font-mono" style={{ color: theme.textPrimary }}>
                      {isAwaiting || h.source === 'readings' ? '—' : `K${h.actual_cash.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1 mb-3">
                  {isAwaiting ? (
                    h.hours_waiting != null && (
                      <span className="text-xs font-mono" style={{ color: theme.textSecondary }}>{h.hours_waiting}h waiting</span>
                    )
                  ) : (
                    <>
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
                    </>
                  )}
                  {h.is_stale && (
                    <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold"
                      style={{ backgroundColor: 'var(--color-status-warning-light)', color: 'var(--color-status-warning)' }}>
                      Stale
                    </span>
                  )}
                </div>
                <div className="flex gap-2 flex-wrap" onClick={e => e.stopPropagation()}>
                  {isAwaiting ? (
                    <button
                      onClick={() => openCloseAndApprove(h)}
                      className="min-h-[44px] px-3 py-1 text-sm font-medium rounded text-white"
                      style={{ backgroundColor: closingFormId === h.handover_id ? theme.textSecondary : 'var(--color-action-primary)' }}>
                      {closingFormId === h.handover_id ? 'Cancel' : 'Close & Approve'}
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => setReadingsModal(h)}
                        className="min-h-[44px] px-3 py-1 text-sm font-medium rounded"
                        style={{ backgroundColor: theme.cardBg, color: theme.textSecondary, borderWidth: 1, borderColor: theme.border }}>
                        Readings
                      </button>
                      {canAct && (
                        <>
                          <button
                            onClick={() => {
                              if (rs === 'flagged') { setApproveModalId(h); setApproveNote('') }
                              else { handleApprove(h) }
                            }}
                            disabled={actionLoading}
                            className="min-h-[44px] px-3 py-1 text-sm font-medium rounded text-white"
                            style={{ backgroundColor: 'var(--color-status-success)' }}>
                            Approve
                          </button>
                          <button onClick={() => { setReturnModalId(h); setReturnNote('') }}
                            className="min-h-[44px] px-3 py-1 text-sm font-medium rounded"
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
                    </>
                  )}
                </div>
                {isExpanded && !isAwaiting && (
                  <div className="mt-3 pt-3" style={{ borderTopColor: theme.border, borderTopWidth: 1 }} onClick={e => e.stopPropagation()}>
                    <ExpandedDetail h={h} theme={theme} onRefresh={fetchQueue} currentUserRole={currentUserRole} />
                  </div>
                )}
                {closingFormId === h.handover_id && isAwaiting && (
                  <div className="mt-3 pt-3" style={{ borderTopColor: theme.border, borderTopWidth: 1 }} onClick={e => e.stopPropagation()}>
                    <ClosingForm
                      h={h}
                      theme={theme}
                      creditAccounts={creditAccounts}
                      otherProducts={otherProducts}
                      onAccountCreated={handleAccountCreated}
                      currentUserRole={currentUserRole}
                      fuelPrices={fuelPrices}
                      safeDeposit={closingSafeDeposit}
                      cash={closingCash}
                      onCashChange={setClosingCash}
                      posTypes={posTypes}
                      posAmounts={closingPosAmounts}
                      onPosAmountsChange={setClosingPosAmounts}
                      posRefs={closingPosRefs}
                      onPosRefsChange={setClosingPosRefs}
                      posTerminalBatch={closingPosTerminalBatch}
                      onPosTerminalBatchChange={setClosingPosTerminalBatch}
                      notes={closingNotes}
                      onNotesChange={setClosingNotes}
                      creditItems={closingCreditItems}
                      onCreditItemsChange={setClosingCreditItems}
                      submitting={closingSubmitting}
                      error={closingError}
                      dipBlocked={closingDipBlocked}
                      onSubmit={() => handleCloseAndApprove(h)}
                      onCancel={() => setClosingFormId(null)}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <div className="hidden md:block overflow-x-auto">
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
                      {h.admin_override && (
                        <span className="inline-block ml-1 px-2 py-0.5 rounded text-xs font-medium"
                          style={{ backgroundColor: 'var(--color-status-warning-light)', color: 'var(--color-status-warning)' }}
                          title={`Reason: ${h.admin_override.reason}`}>
                          Admin Override
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                      {isAwaiting ? (
                        <button
                          onClick={() => openCloseAndApprove(h)}
                          className="px-2 py-1 text-xs font-medium rounded text-white"
                          style={{ backgroundColor: closingFormId === h.handover_id ? theme.textSecondary : 'var(--color-action-primary)' }}>
                          {closingFormId === h.handover_id ? 'Cancel' : 'Close & Approve'}
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
                        <ExpandedDetail h={h} theme={theme} onRefresh={fetchQueue} currentUserRole={currentUserRole} />
                      </td>
                    </tr>
                  )}
                  {/* Inline Phase 2 closing form */}
                  {closingFormId === h.handover_id && isAwaiting && (
                    <tr>
                      <td colSpan={10}
                        style={{ backgroundColor: theme.background, borderTopColor: theme.border, borderTopWidth: 1 }}>
                        <ClosingForm
                          h={h}
                          theme={theme}
                          creditAccounts={creditAccounts}
                          otherProducts={otherProducts}
                          onAccountCreated={handleAccountCreated}
                          currentUserRole={currentUserRole}
                          fuelPrices={fuelPrices}
                          safeDeposit={closingSafeDeposit}
                          cash={closingCash}
                          onCashChange={setClosingCash}
                          posTypes={posTypes}
                          posAmounts={closingPosAmounts}
                          onPosAmountsChange={setClosingPosAmounts}
                          posRefs={closingPosRefs}
                          onPosRefsChange={setClosingPosRefs}
                          posTerminalBatch={closingPosTerminalBatch}
                          onPosTerminalBatchChange={setClosingPosTerminalBatch}
                          notes={closingNotes}
                          onNotesChange={setClosingNotes}
                          creditItems={closingCreditItems}
                          onCreditItemsChange={setClosingCreditItems}
                          submitting={closingSubmitting}
                          error={closingError}
                          dipBlocked={closingDipBlocked}
                          onSubmit={() => handleCloseAndApprove(h)}
                          onCancel={() => setClosingFormId(null)}
                        />
                      </td>
                    </tr>
                  )}
                </tbody>
            )
          })}
        </table>
        </div>
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
                      {[
                        { label: 'Nozzle', align: 'text-left' },
                        { label: 'Fuel', align: 'text-left' },
                        { label: 'Mech. Opening', align: 'text-right' },
                        { label: 'Elect. Opening', align: 'text-right' },
                        { label: 'Elect. Closing', align: 'text-right' },
                        { label: 'Mech. Closing', align: 'text-right' },
                        { label: 'Volume Sold (L)', align: 'text-right' },
                        { label: 'Revenue (K)', align: 'text-right' },
                      ].map(col => (
                        <th key={col.label} className={`px-3 py-2 ${col.align} text-xs font-medium uppercase whitespace-nowrap`}
                          style={{ color: theme.textSecondary }}>{col.label}</th>
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

      {/* Tank Dips Modal — shown instead of the cash form when dips are missing */}
      {dipModalHandover && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setDipModalHandover(null)}>
          <div className="rounded-lg shadow-xl w-full max-w-lg"
            style={{ backgroundColor: theme.cardBg, borderColor: theme.border, borderWidth: 1 }}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4"
              style={{ borderBottomColor: theme.border, borderBottomWidth: 1 }}>
              <div>
                <div className="font-semibold text-base" style={{ color: theme.textPrimary }}>
                  Tank Dips Required
                </div>
                <div className="text-xs mt-0.5" style={{ color: theme.textSecondary }}>
                  {formatDateToDisplay(dipModalHandover.date)} — {dipModalHandover.shift_type} Shift
                </div>
              </div>
              <button onClick={() => setDipModalHandover(null)}
                className="text-lg leading-none px-2 py-1 rounded hover:bg-surface-bg"
                style={{ color: theme.textSecondary }}>
                x
              </button>
            </div>
            <div className="p-5">
              <TankDipsCapture
                date={dipModalHandover.date}
                shiftType={dipModalHandover.shift_type}
                userRole={currentUserRole}
                continueLabel="Save & Continue"
                onSaved={() => {
                  const h = dipModalHandover
                  const retry = dipModalRetryClose
                  setDipModalHandover(null)
                  if (!h) return
                  if (retry) handleCloseAndApprove(h)
                  else setClosingFormId(h.handover_id)
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Pending Attendants Modal — informational, nothing to submit; the manager
          just has to wait for co-attendants on this shift to submit their readings */}
      {pendingAttendantsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setPendingAttendantsModal(null)}>
          <div className="rounded-lg shadow-xl w-full max-w-md"
            style={{ backgroundColor: theme.cardBg, borderColor: theme.border, borderWidth: 1 }}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4"
              style={{ borderBottomColor: theme.border, borderBottomWidth: 1 }}>
              <div>
                <div className="font-semibold text-base" style={{ color: theme.textPrimary }}>
                  Waiting on Other Attendants
                </div>
                <div className="text-xs mt-0.5" style={{ color: theme.textSecondary }}>
                  {formatDateToDisplay(pendingAttendantsModal.handover.date)} — {pendingAttendantsModal.handover.shift_type} Shift
                </div>
              </div>
              <button onClick={() => setPendingAttendantsModal(null)}
                className="text-lg leading-none px-2 py-1 rounded hover:bg-surface-bg"
                style={{ color: theme.textSecondary }}>
                x
              </button>
            </div>
            <div className="p-5">
              <p className="text-sm" style={{ color: theme.textPrimary }}>
                {pendingAttendantsModal.pending.map(a => a.attendant_name).join(', ')} still need to submit
                readings before any attendant on this shift can be closed.
              </p>
              <div className="mt-4 flex justify-end">
                <button onClick={() => setPendingAttendantsModal(null)}
                  className="px-4 py-2 text-sm font-medium rounded text-white"
                  style={{ backgroundColor: 'var(--color-action-primary)' }}>
                  OK
                </button>
              </div>
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

      {/* Admin Override Close Modal — bulk, owner only, reason required */}
      {overrideModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="rounded-lg shadow-lg p-6 w-full max-w-md"
            style={{ backgroundColor: theme.cardBg, borderColor: theme.border, borderWidth: 1 }}>
            <h3 className="text-lg font-semibold mb-3" style={{ color: theme.textPrimary }}>
              Administratively Close {overrideSelectedIds.size} Shift{overrideSelectedIds.size !== 1 ? 's' : ''}
            </h3>
            <p className="text-sm mb-3" style={{ color: theme.textSecondary }}>
              This closes the selected shifts using expected figures — no tank dip or cash verification.
              It's permanently marked as an administrative override, not a real reconciliation. A reason is
              required and recorded in the audit trail.
            </p>
            <textarea
              rows={3}
              value={overrideReason}
              onChange={e => setOverrideReason(e.target.value)}
              placeholder="Reason for administratively closing these shifts (required)"
              className="w-full px-3 py-2 text-sm rounded border resize-none"
              style={{ backgroundColor: theme.background, color: theme.textPrimary, borderColor: theme.border }}
            />
            {overrideError && (
              <div className="text-xs p-2 mt-2 rounded"
                style={{ backgroundColor: 'var(--color-status-error-light)', color: 'var(--color-status-error)' }}>
                {overrideError}
              </div>
            )}
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => { setOverrideModalOpen(false); setOverrideError('') }}
                className="px-4 py-2 text-sm rounded"
                style={{ color: theme.textSecondary, borderWidth: 1, borderColor: theme.border }}>
                Cancel
              </button>
              <button onClick={handleAdminOverrideClose}
                disabled={!overrideReason.trim() || overrideLoading}
                className="px-4 py-2 text-sm font-medium rounded text-white disabled:opacity-50"
                style={{ backgroundColor: 'var(--color-status-warning)' }}>
                {overrideLoading ? 'Closing...' : 'Confirm Override Close'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

interface ClosingFormProps {
  h: HandoverEntry
  theme: any
  creditAccounts: any[]
  otherProducts: OtherProduct[]
  onAccountCreated: (acct: any) => void
  currentUserRole: string
  fuelPrices: Record<string, number>
  safeDeposit: number
  cash: string
  onCashChange: (v: string) => void
  posTypes: { type_id: string; name: string; is_active: boolean }[]
  posAmounts: Record<string, string>
  onPosAmountsChange: (v: Record<string, string>) => void
  posRefs: Record<string, string>
  onPosRefsChange: (v: Record<string, string>) => void
  posTerminalBatch: string
  onPosTerminalBatchChange: (v: string) => void
  notes: string
  onNotesChange: (v: string) => void
  creditItems: CreditItem[]
  onCreditItemsChange: (items: CreditItem[]) => void
  submitting: boolean
  error: string
  dipBlocked?: boolean
  onSubmit: () => void
  onCancel: () => void
}

function ClosingForm({ h, theme, creditAccounts, otherProducts, onAccountCreated, currentUserRole, fuelPrices, safeDeposit,
  cash, onCashChange, posTypes, posAmounts, onPosAmountsChange, posRefs, onPosRefsChange,
  posTerminalBatch, onPosTerminalBatchChange,
  notes, onNotesChange,
  creditItems, onCreditItemsChange, submitting, error, dipBlocked, onSubmit, onCancel,
}: ClosingFormProps) {
  const cashVal = parseFloat(cash) || 0
  const posVal = posTypes.reduce((s, t) => s + (parseFloat(posAmounts[t.type_id] || '0') || 0), 0)
  const creditTotal = creditItems.reduce((s, i) => s + (i.amount || 0), 0)
  const totalAccounted = cashVal + posVal + creditTotal
  const difference = totalAccounted - (h.total_expected || 0)
  const inputStyle = { backgroundColor: theme.background, color: theme.textPrimary, borderColor: theme.border }

  // newAccountRowIdx tracks which row (if any) should get the newly created
  // account selected; null means the modal was opened standalone (the
  // top-level "+ New Account" button rather than a row's picker).
  const canCreateAccounts = currentUserRole === 'manager' || currentUserRole === 'owner'
  const [showNewAccount, setShowNewAccount] = useState(false)
  const [newAccountRowIdx, setNewAccountRowIdx] = useState<number | null>(null)

  const openNewAccount = (rowIdx: number | null) => {
    setNewAccountRowIdx(rowIdx)
    setShowNewAccount(true)
  }

  const handleAccountCreatedHere = (acct: any) => {
    onAccountCreated(acct)
    if (newAccountRowIdx != null) {
      const updated = [...creditItems]
      updated[newAccountRowIdx] = { ...updated[newAccountRowIdx], account_id: acct.account_id, account_name: acct.account_name }
      onCreditItemsChange(updated)
    }
    setShowNewAccount(false)
  }

  const updateCreditItem = (idx: number, patch: Partial<CreditItem>) => {
    const updated = [...creditItems]
    updated[idx] = { ...updated[idx], ...patch }
    onCreditItemsChange(updated)
  }

  // Single source of truth for a row's amount/volume so entering either one
  // (money or liters/units) always keeps the other consistent for submission
  // — the backend only ever accepts volume, so "amount" mode is purely a
  // client-side convenience that back-computes it from the row's price.
  const recomputeCreditRow = (idx: number, price: number, volumeStr: string, amountStr: string, mode: 'liters' | 'amount') => {
    if (mode === 'liters') {
      const vol = parseFloat(volumeStr) || 0
      updateCreditItem(idx, { volume: volumeStr, price_per_liter: price, amount: Math.round(vol * price * 100) / 100, entry_mode: mode })
    } else {
      const amt = parseFloat(amountStr) || 0
      const vol = price > 0 ? Math.round((amt / price) * 1000) / 1000 : 0
      updateCreditItem(idx, { volume: String(vol), price_per_liter: price, amount: amt, entry_mode: mode })
    }
  }

  return (
    <div className="p-4 space-y-4">
      {/* Flagged heads-up — approving still requires a note, same as everywhere else; this
          just avoids that being a surprise after filling in the whole form. */}
      {h.auto_flag_reasons && h.auto_flag_reasons.length > 0 && (
        <div className="rounded-lg p-3 text-sm"
          style={{ backgroundColor: 'var(--color-status-warning-light)', color: 'var(--color-status-warning)', borderWidth: 1, borderColor: 'var(--color-status-warning)' }}>
          This shift is flagged: {h.auto_flag_reasons.map(f => FLAG_LABELS[f] || f).join(', ')}. Approving it will require a note.
        </div>
      )}

      {/* Phase 1 summary — context for the manager */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3 rounded-lg text-sm"
        style={{ backgroundColor: theme.cardBg, borderWidth: 1, borderColor: theme.border }}>
        <div>
          <div className="text-[10px] uppercase mb-0.5" style={{ color: theme.textSecondary }}>Fuel Revenue</div>
          <div className="font-mono font-medium" style={{ color: theme.textPrimary }}>{fmtK(h.fuel_revenue)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase mb-0.5" style={{ color: theme.textSecondary }}>Total Expected</div>
          <div className="font-mono font-semibold" style={{ color: theme.textPrimary }}>{fmtK(h.total_expected)}</div>
        </div>
        {safeDeposit > 0 && (
          <div>
            <div className="text-[10px] uppercase mb-0.5" style={{ color: theme.textSecondary }}>Safe Deposits</div>
            <div className="font-mono font-medium" style={{ color: theme.textPrimary }}>{fmtK(safeDeposit)}</div>
          </div>
        )}
      </div>

      {/* Cash inputs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: theme.textSecondary }}>
            Cash (Safe + Hand) — ZMW *
          </label>
          <input type="number" min={0} step="0.01" value={cash}
            onChange={e => onCashChange(e.target.value)}
            className="w-full px-3 py-2 rounded border text-sm text-right font-mono"
            style={inputStyle} />
          {/* Informational only — deposits are a subset of total cash, not necessarily
              equal to it, so this is context for the manager's own judgment, not a rule. */}
          {safeDeposit > 0 && cash !== '' && (
            <div className="mt-1.5 text-xs font-mono flex gap-3">
              <span style={{ color: theme.textSecondary }}>Safe deposits: {fmtK(safeDeposit)}</span>
              <span style={{ color: theme.textSecondary }}>Cash entered: {fmtK(cashVal)}</span>
              {cashVal < safeDeposit && (
                <span style={{ color: 'var(--color-status-warning)', fontWeight: 600 }}>
                  Entered cash is less than recorded deposits
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* POS Receipts — per payment type + terminal batch cross-check */}
      {posTypes.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium uppercase" style={{ color: theme.textSecondary }}>POS Receipts — ZMW</label>
            {posVal > 0 && (
              <span className="text-xs font-mono font-semibold" style={{ color: theme.textPrimary }}>
                K{posVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            )}
          </div>
          <div className="space-y-2 mb-3">
            {posTypes.map(t => (
              <div key={t.type_id} className="flex items-center gap-2">
                <span className="text-xs w-28 shrink-0" style={{ color: theme.textSecondary }}>{t.name}</span>
                <input type="number" min={0} step="0.01" value={posAmounts[t.type_id] ?? ''} placeholder="0.00"
                  onChange={e => onPosAmountsChange({ ...posAmounts, [t.type_id]: e.target.value })}
                  className="w-28 px-2 py-1.5 rounded border text-sm text-right font-mono"
                  style={inputStyle} />
                <input type="text" value={posRefs[t.type_id] ?? ''} placeholder="Ref (optional)"
                  onChange={e => onPosRefsChange({ ...posRefs, [t.type_id]: e.target.value })}
                  className="flex-1 px-2 py-1.5 rounded border text-xs"
                  style={inputStyle} />
              </div>
            ))}
          </div>
          <div className="pt-2" style={{ borderTopWidth: 1, borderTopColor: theme.border }}>
            <label className="block text-xs font-medium mb-1" style={{ color: theme.textSecondary }}>
              Terminal Batch Total — from settlement slip
            </label>
            <input type="number" min={0} step="0.01" value={posTerminalBatch} placeholder="0.00"
              onChange={e => onPosTerminalBatchChange(e.target.value)}
              className="w-40 px-2 py-1.5 rounded border text-sm text-right font-mono"
              style={inputStyle} />
            {posTerminalBatch !== '' && (() => {
              const batch = parseFloat(posTerminalBatch) || 0
              const variance = posVal - batch
              const ok = Math.abs(variance) < 0.01
              const fmt = (v: number) => `K${Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              return (
                <div className="mt-1.5 text-xs font-mono flex gap-3">
                  <span style={{ color: theme.textSecondary }}>Declared: K{posVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  <span style={{ color: theme.textSecondary }}>Terminal: {fmt(batch)}</span>
                  <span style={{ color: ok ? 'var(--color-status-success)' : 'var(--color-status-error)', fontWeight: 600 }}>
                    {ok ? 'Match' : `Variance: ${variance >= 0 ? '+' : '-'}${fmt(variance)}`}
                  </span>
                </div>
              )
            })()}
          </div>
        </div>
      )}

      {/* Credit sales */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-medium uppercase" style={{ color: theme.textSecondary }}>Credit Sales</label>
          <div className="flex gap-2">
            {canCreateAccounts && (
              <button type="button" onClick={() => openNewAccount(null)}
                className="px-2 py-1 text-xs font-medium rounded"
                style={{ color: theme.textSecondary, borderWidth: 1, borderColor: theme.border }}>
                + New Account
              </button>
            )}
            {creditAccounts.length > 0 && (
              <button type="button"
                onClick={() => {
                  const acct = creditAccounts[0]
                  onCreditItemsChange([...creditItems, {
                    account_id: acct.account_id,
                    account_name: acct.account_name,
                    item_kind: 'fuel',
                    fuel_type: 'Diesel',
                    volume: '',
                    price_per_liter: acct.default_price_per_liter || fuelPrices.Diesel || 0,
                    amount: 0,
                    entry_mode: 'liters',
                  }])
                }}
                className="px-2 py-1 text-xs font-medium rounded text-white"
                style={{ backgroundColor: 'var(--color-action-primary)' }}>
                + Add
              </button>
            )}
          </div>
        </div>

        {creditAccounts.length === 0 && (
          <div className="text-xs italic" style={{ color: theme.textSecondary }}>
            No credit accounts yet{canCreateAccounts ? ' — use "+ New Account" to set one up.' : '.'}
          </div>
        )}

        {creditItems.map((item, idx) => {
          const acct = creditAccounts.find((a: any) => a.account_id === item.account_id)
          return (
            <div key={idx} className="flex flex-wrap gap-1.5 items-center mb-1.5 text-xs p-1.5 rounded"
              style={{ backgroundColor: theme.background }}>
              <select value={item.account_id}
                onChange={e => {
                  if (e.target.value === '__new__') { openNewAccount(idx); return }
                  const found = creditAccounts.find((a: any) => a.account_id === e.target.value)
                  updateCreditItem(idx, { account_id: e.target.value, account_name: found?.account_name || '' })
                }}
                className="min-w-[8rem] flex-1 px-2 py-1 rounded border" style={inputStyle}>
                {creditAccounts.map((a: any) => (
                  <option key={a.account_id} value={a.account_id}>{a.account_name}</option>
                ))}
                {canCreateAccounts && <option value="__new__">+ New Account...</option>}
              </select>

              <select value={item.item_kind}
                onChange={e => {
                  const kind = e.target.value as 'fuel' | 'other'
                  if (kind === 'fuel') {
                    const price = acct?.default_price_per_liter || fuelPrices.Diesel || 0
                    updateCreditItem(idx, { item_kind: 'fuel', fuel_type: 'Diesel', product_code: undefined, price_per_liter: price, volume: '', amount: 0 })
                  } else {
                    const first = otherProducts[0]
                    updateCreditItem(idx, {
                      item_kind: 'other', fuel_type: first?.label || '', product_code: first?.code,
                      price_per_liter: first?.unit_price || 0, volume: '', amount: 0,
                    })
                  }
                }}
                className="w-20 px-2 py-1 rounded border" style={inputStyle}>
                <option value="fuel">Fuel</option>
                <option value="other">Other</option>
              </select>

              {item.item_kind === 'fuel' ? (
                <select value={item.fuel_type}
                  onChange={e => {
                    const price = acct?.default_price_per_liter || fuelPrices[e.target.value] || 0
                    updateCreditItem(idx, { fuel_type: e.target.value, price_per_liter: price })
                  }}
                  className="w-20 px-2 py-1 rounded border" style={inputStyle}>
                  <option>Diesel</option>
                  <option>Petrol</option>
                </select>
              ) : (
                <select value={item.product_code || ''}
                  onChange={e => {
                    const p = otherProducts.find(op => op.code === e.target.value)
                    updateCreditItem(idx, { fuel_type: p?.label || '', product_code: p?.code, price_per_liter: p?.unit_price || 0 })
                  }}
                  className="min-w-[10rem] flex-1 px-2 py-1 rounded border" style={inputStyle}>
                  {otherProducts.length === 0 && <option value="">No products available</option>}
                  {['Lubricant', 'Accessory'].map(cat => {
                    const rows = otherProducts.filter(p => p.category === cat)
                    if (rows.length === 0) return null
                    return (
                      <optgroup key={cat} label={cat}>
                        {rows.map(p => <option key={p.code} value={p.code}>{p.label}</option>)}
                      </optgroup>
                    )
                  })}
                </select>
              )}

              <select value={item.entry_mode}
                onChange={e => {
                  const mode = e.target.value as 'liters' | 'amount'
                  recomputeCreditRow(idx, item.price_per_liter, item.volume, String(item.amount), mode)
                }}
                className="w-24 px-2 py-1 rounded border" style={inputStyle}>
                <option value="liters">{item.item_kind === 'fuel' ? 'Litres' : 'Qty'}</option>
                <option value="amount">Amount (K)</option>
              </select>

              {item.entry_mode === 'liters' ? (
                <input type="number" min={0} step="0.001" value={item.volume}
                  placeholder={item.item_kind === 'fuel' ? 'Litres' : 'Qty'}
                  onChange={e => recomputeCreditRow(idx, item.price_per_liter, e.target.value, String(item.amount), 'liters')}
                  className="w-20 px-2 py-1 rounded border text-right font-mono" style={inputStyle} />
              ) : (
                <input type="number" min={0} step="0.01" value={item.amount || ''}
                  placeholder="Amount"
                  onChange={e => recomputeCreditRow(idx, item.price_per_liter, item.volume, e.target.value, 'amount')}
                  className="w-20 px-2 py-1 rounded border text-right font-mono" style={inputStyle} />
              )}

              <input type="number" min={0} step="0.01" value={item.price_per_liter || ''}
                title="Price — editable for a negotiated credit rate"
                placeholder="Price"
                onChange={e => {
                  const price = parseFloat(e.target.value) || 0
                  recomputeCreditRow(idx, price, item.volume, String(item.amount), item.entry_mode)
                }}
                className="w-16 px-2 py-1 rounded border text-right font-mono" style={inputStyle} />

              <span className="w-20 text-right font-mono" style={{ color: theme.textPrimary }} title={item.entry_mode === 'amount' ? `${item.volume} ${item.item_kind === 'fuel' ? 'L' : 'units'}` : undefined}>
                {fmtK(item.amount || 0)}
              </span>

              <button onClick={() => onCreditItemsChange(creditItems.filter((_, i) => i !== idx))}
                className="px-1" style={{ color: 'var(--color-status-error)' }}>X</button>
            </div>
          )
        })}
        {creditItems.length > 0 && (
          <div className="flex justify-between text-xs font-semibold pt-1 mt-1"
            style={{ borderTopColor: theme.border, borderTopWidth: 1 }}>
            <span style={{ color: theme.textSecondary }}>Credit Total</span>
            <span className="font-mono" style={{ color: theme.textPrimary }}>{fmtK(creditTotal)}</span>
          </div>
        )}
      </div>

      {showNewAccount && (
        <NewAccountModal theme={theme} onClose={() => setShowNewAccount(false)} onCreated={handleAccountCreatedHere} />
      )}

      {/* Notes */}
      <div>
        <label className="block text-xs font-medium mb-1" style={{ color: theme.textSecondary }}>Notes (optional)</label>
        <input type="text" value={notes} onChange={e => onNotesChange(e.target.value)}
          placeholder="Any remarks..."
          className="w-full px-3 py-2 rounded border text-sm" style={inputStyle} />
      </div>

      {/* Reconciliation preview */}
      {cash !== '' && (
        <div className="rounded-lg p-3 text-sm"
          style={{ backgroundColor: theme.cardBg, borderWidth: 1,
            borderColor: difference >= 0 ? 'var(--color-status-success)' : 'var(--color-status-error)' }}>
          <div className="flex justify-between mb-1">
            <span style={{ color: theme.textSecondary }}>Cash + POS + Credit</span>
            <span className="font-mono" style={{ color: theme.textPrimary }}>{fmtK(totalAccounted)}</span>
          </div>
          <div className="flex justify-between mb-1">
            <span style={{ color: theme.textSecondary }}>Expected</span>
            <span className="font-mono" style={{ color: theme.textPrimary }}>{fmtK(h.total_expected || 0)}</span>
          </div>
          <div className="flex justify-between font-bold">
            <span style={{ color: difference >= 0 ? 'var(--color-status-success)' : 'var(--color-status-error)' }}>
              {difference >= 0 ? 'Surplus' : 'Shortage'}
            </span>
            <span className="font-mono"
              style={{ color: difference >= 0 ? 'var(--color-status-success)' : 'var(--color-status-error)' }}>
              {difference >= 0 ? '+' : ''}{fmtK(difference)}
            </span>
          </div>
        </div>
      )}

      {error && (
        <div className="text-xs p-2 rounded"
          style={{ backgroundColor: 'var(--color-status-error-light)', color: 'var(--color-status-error)' }}>
          <div>{error}</div>
          {dipBlocked && (
            <Link href={`/tank-dips?date=${encodeURIComponent(h.date)}&shift_type=${encodeURIComponent(h.shift_type)}`}
              className="inline-block mt-1.5 font-medium underline">
              Open Tank Dips for {formatDateToDisplay(h.date)} ({h.shift_type}) to record them
            </Link>
          )}
        </div>
      )}

      <div className="flex gap-2 justify-end">
        <button onClick={onCancel}
          className="px-4 py-2 text-sm rounded"
          style={{ color: theme.textSecondary, borderWidth: 1, borderColor: theme.border }}>
          Cancel
        </button>
        <button onClick={onSubmit} disabled={submitting || cash === ''}
          className="px-4 py-2 text-sm font-semibold rounded text-white disabled:opacity-50"
          style={{ backgroundColor: 'var(--color-status-success)' }}>
          {submitting ? 'Saving...' : 'Close & Approve'}
        </button>
      </div>
    </div>
  )
}

function ExpandedDetail({ h, theme, onRefresh, currentUserRole }: { h: HandoverEntry; theme: any; onRefresh: () => void; currentUserRole: string }) {
  const [expandedStock, setExpandedStock] = useState<string | null>(null)
  const [showPOS, setShowPOS] = useState(false)
  const [showCredit, setShowCredit] = useState(false)
  const canEdit = h.review_status !== 'approved'

  // Exclude a nozzle reading from future duplicate/carry-forward checks —
  // pure historical-data correction, no impact on this handover's status,
  // sales, or stock, and works even on an already-closed-off day.
  const [excludeTarget, setExcludeTarget] = useState<string | null>(null)
  const [excludeReason, setExcludeReason] = useState('')
  const [excluding, setExcluding] = useState(false)

  const handleExcludeReading = async () => {
    if (!excludeTarget || !excludeReason.trim()) return
    setExcluding(true)
    try {
      const res = await authFetch(`${BASE}/handover/exclude-reading`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          shift_id: h.shift_id,
          attendant_id: h.attendant_id,
          nozzle_id: excludeTarget,
          reason: excludeReason.trim(),
        }),
      })
      if (!res.ok) {
        const error = await res.json()
        toast.error(`Failed to exclude reading: ${error.detail || JSON.stringify(error)}`)
        return
      }
      toast.success('Reading excluded from future checks.')
      setExcludeTarget(null)
      setExcludeReason('')
      onRefresh()
    } catch (err: any) {
      toast.error(`Failed to exclude reading: ${err.message}`)
    } finally {
      setExcluding(false)
    }
  }
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
        <div className="overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead>
            <tr style={{ backgroundColor: theme.cardBg }}>
              {[
                { label: 'Nozzle', align: 'text-left' },
                { label: 'Fuel', align: 'text-left' },
                { label: 'Elect. Open', align: 'text-right' },
                { label: 'Elect. Close', align: 'text-right' },
                { label: 'Volume (L)', align: 'text-right' },
                { label: 'Mech. Vol', align: 'text-right' },
                { label: 'Deviation', align: 'text-right' },
                { label: 'Revenue', align: 'text-right' },
                { label: '', align: 'text-right' },
              ].map(col => (
                <th key={col.label} className={`px-2 py-1 ${col.align} font-medium uppercase`} style={{ color: theme.textSecondary }}>{col.label}</th>
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
                  <td className="px-2 py-1 text-right whitespace-nowrap">
                    {currentUserRole === 'owner' && (
                      ns.excluded_from_checks ? (
                        <span className="text-xs" style={{ color: theme.textSecondary }}>Excluded</span>
                      ) : (
                        <button
                          onClick={() => { setExcludeTarget(ns.nozzle_id); setExcludeReason('') }}
                          className="text-xs font-medium hover:underline"
                          style={{ color: 'var(--color-status-error)' }}
                        >
                          Exclude from checks
                        </button>
                      )
                    )}
                  </td>
                </tr>
                {ns.duplicate_reading_flagged && (
                  <tr key={`${ns.nozzle_id}-duplicate`} style={{ backgroundColor: theme.cardBg }}>
                    <td colSpan={9} className="px-4 py-1.5">
                      <div className="text-xs" style={{ color: 'var(--color-status-error)' }}>
                        Also recorded on shift {ns.duplicate_reading_conflict_shift_id}
                        {ns.duplicate_reading_note ? ` — attendant note: "${ns.duplicate_reading_note}"` : ''}
                      </div>
                    </td>
                  </tr>
                )}
                {ns.implausible_volume_flagged && (
                  <tr key={`${ns.nozzle_id}-implausible`} style={{ backgroundColor: theme.cardBg }}>
                    <td colSpan={9} className="px-4 py-1.5">
                      <div className="text-xs" style={{ color: 'var(--color-status-error)' }}>
                        Implausible volume for this shift
                        {ns.implausible_volume_note ? ` — attendant note: "${ns.implausible_volume_note}"` : ''}
                      </div>
                    </td>
                  </tr>
                )}
                {ns.excluded_from_checks && ns.excluded_reason && (
                  <tr key={`${ns.nozzle_id}-excluded`} style={{ backgroundColor: theme.cardBg }}>
                    <td colSpan={9} className="px-4 py-1.5">
                      <div className="text-xs" style={{ color: theme.textSecondary }}>
                        Excluded from future checks — reason: &ldquo;{ns.excluded_reason}&rdquo;
                      </div>
                    </td>
                  </tr>
                )}
                {ns.pre_change_revenue != null && ns.post_change_revenue != null && (
                  <tr key={`${ns.nozzle_id}-split`} style={{ backgroundColor: theme.cardBg }}>
                    <td colSpan={9} className="px-4 py-1.5">
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
      </div>

      {/* Exclude from checks confirmation */}
      {excludeTarget && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="rounded-lg p-6 max-w-md w-full" style={{ backgroundColor: theme.cardBg }}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold" style={{ color: theme.textPrimary }}>Exclude Reading From Checks</h2>
              <button onClick={() => { setExcludeTarget(null); setExcludeReason('') }} className="text-2xl" style={{ color: theme.textSecondary }}>&times;</button>
            </div>
            <div className="mb-4 p-3 rounded-lg" style={{ backgroundColor: 'var(--color-status-error-light)' }}>
              <p className="text-sm" style={{ color: 'var(--color-status-error)' }}>
                Marks nozzle {excludeTarget}&apos;s reading on this shift ({h.date}, {h.shift_type}) as bad
                data — it will no longer be used as the comparison anchor for future
                duplicate/decreasing-reading checks or opening-reading carry-forward.
                This does not change this handover&apos;s approval status, sales
                totals, or stock, and works even though this day may already be
                closed off.
              </p>
            </div>
            <div className="mb-5">
              <label className="block text-sm font-medium mb-1" style={{ color: theme.textPrimary }}>Reason (required)</label>
              <ReasonChips presets={REASON_PRESETS.excludeReading} value={excludeReason} onSelect={setExcludeReason} className="mb-2" />
              <textarea
                value={excludeReason}
                onChange={e => setExcludeReason(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 text-sm border rounded-md"
                style={{ borderColor: theme.border, backgroundColor: theme.background, color: theme.textPrimary }}
                placeholder="Explain why this reading is bad data..."
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setExcludeTarget(null); setExcludeReason('') }}
                className="px-4 py-2 text-sm border rounded-md"
                style={{ borderColor: theme.border, color: theme.textSecondary }}
              >
                Cancel
              </button>
              <button
                onClick={handleExcludeReading}
                disabled={excluding || !excludeReason.trim()}
                className="px-5 py-2 text-sm text-white rounded-md font-medium disabled:opacity-60"
                style={{ backgroundColor: 'var(--color-status-error)' }}
              >
                {excluding ? 'Excluding...' : 'Exclude From Checks'}
              </button>
            </div>
          </div>
        </div>
      )}

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
        {(h.pos_receipts ?? 0) > 0 && (
          <div>
            <div className="text-[10px] uppercase" style={{ color: theme.textSecondary }}>POS Declared</div>
            <div className="text-sm font-mono font-medium" style={{ color: theme.textPrimary }}>
              K{(h.pos_receipts ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
          </div>
        )}
        {h.pos_terminal_batch_total != null && (
          <div>
            <div className="text-[10px] uppercase" style={{ color: theme.textSecondary }}>Terminal Batch</div>
            <div className="text-sm font-mono font-medium" style={{ color: theme.textPrimary }}>
              K{h.pos_terminal_batch_total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
          </div>
        )}
        {h.pos_terminal_variance != null && (
          <div>
            <div className="text-[10px] uppercase" style={{ color: theme.textSecondary }}>POS Variance</div>
            <div className="text-sm font-mono font-bold"
              style={{ color: Math.abs(h.pos_terminal_variance) < 0.01 ? 'var(--color-status-success)' : 'var(--color-status-error)' }}>
              {Math.abs(h.pos_terminal_variance) < 0.01 ? 'Match' : `${h.pos_terminal_variance >= 0 ? '+' : ''}K${h.pos_terminal_variance.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
            </div>
          </div>
        )}
      </div>}
      {/* POS breakdown by type */}
      {h.pos_breakdown && h.pos_breakdown.length > 0 && (
        <div>
          <div className="text-xs font-medium uppercase mb-2" style={{ color: theme.textSecondary }}>POS Breakdown</div>
          <div className="flex flex-wrap gap-2">
            {h.pos_breakdown.map((item, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs"
                style={{ backgroundColor: theme.cardBg, borderWidth: 1, borderColor: theme.border }}>
                <span style={{ color: theme.textSecondary }}>{item.type_name}</span>
                <span className="font-mono font-semibold" style={{ color: theme.textPrimary }}>
                  K{item.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
                {item.reference && <span style={{ color: theme.textSecondary }}>· {item.reference}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stock drill-down panels */}
      {expandedStock === 'lpg' && h.stock_snapshot?.lpg_cylinders && (
        <div className="mt-3 rounded-lg p-3" style={{ backgroundColor: theme.background, borderColor: theme.border, borderWidth: 1 }}>
          <div className="text-xs font-semibold uppercase mb-2" style={{ color: theme.textSecondary }}>LPG Cylinder Breakdown</div>
          <div className="overflow-x-auto">
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
        </div>
      )}

      {expandedStock === 'accessories' && h.stock_snapshot?.accessories && (
        <div className="mt-3 rounded-lg p-3" style={{ backgroundColor: theme.background, borderColor: theme.border, borderWidth: 1 }}>
          <div className="text-xs font-semibold uppercase mb-2" style={{ color: theme.textSecondary }}>Accessories Breakdown</div>
          <div className="overflow-x-auto">
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
        </div>
      )}

      {expandedStock === 'lubricants' && h.stock_snapshot?.lubricants && (
        <div className="mt-3 rounded-lg p-3" style={{ backgroundColor: theme.background, borderColor: theme.border, borderWidth: 1 }}>
          <div className="text-xs font-semibold uppercase mb-2" style={{ color: theme.textSecondary }}>Lubricants Breakdown</div>
          <div className="overflow-x-auto">
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
        </div>
      )}

      {/* Credit Sale Details */}
      {h.credit_sale_details && h.credit_sale_details.length > 0 && (
        <div>
          <div className="text-xs font-medium uppercase mb-2" style={{ color: theme.textSecondary }}>Credit Sale Items</div>
          <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr style={{ backgroundColor: theme.cardBg }}>
                {[
                  { label: 'Account', align: 'text-left' },
                  { label: 'Item', align: 'text-left' },
                  { label: 'Qty', align: 'text-right' },
                  { label: 'Price', align: 'text-right' },
                  { label: 'Amount', align: 'text-right' },
                  { label: 'Source', align: 'text-left' },
                ].map(col => (
                  <th key={col.label} className={`px-2 py-1 ${col.align} font-medium uppercase`} style={{ color: theme.textSecondary }}>{col.label}</th>
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

      {/* Inline POS entry */}
      {canEdit && (
        <div style={{ borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 12 }}>
          <button
            onClick={() => setShowPOS(p => !p)}
            className="text-xs font-semibold px-3 py-1.5 rounded"
            style={{ backgroundColor: showPOS ? theme.border : 'var(--color-action-primary-light)', color: 'var(--color-action-primary)' }}>
            {showPOS ? 'Hide POS Entry' : '+ Add POS Receipts'}
          </button>
          {showPOS && <POSPanel handoverId={h.handover_id} existingBreakdown={h.pos_breakdown ?? []} theme={theme} onSaved={() => { setShowPOS(false); onRefresh() }} />}
        </div>
      )}

      {/* Inline Credit Sales entry */}
      {canEdit && (
        <div style={{ borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 12 }}>
          <button
            onClick={() => setShowCredit(p => !p)}
            className="text-xs font-semibold px-3 py-1.5 rounded"
            style={{ backgroundColor: showCredit ? theme.border : 'var(--color-action-primary-light)', color: 'var(--color-action-primary)' }}>
            {showCredit ? 'Hide Credit Entry' : '+ Add Credit Sales'}
          </button>
          {showCredit && <CreditPanel handoverId={h.handover_id} existingDetails={h.credit_sale_details ?? []} theme={theme} currentUserRole={currentUserRole} onSaved={() => { setShowCredit(false); onRefresh() }} />}
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
              {d.time}{d.note && ` — ${d.note}`}
            </span>
            <span className="font-semibold" style={{ color: theme.textPrimary }}>K{d.amount.toLocaleString()}</span>
          </div>
        ))}
      </div>
      )}
    </div>
  )
}

function POSPanel({ handoverId, existingBreakdown, theme, onSaved }: {
  handoverId: string
  existingBreakdown: any[]
  theme: any
  onSaved: () => void
}) {
  const [posTypes, setPosTypes] = useState<any[]>([])
  const [selectedTypeId, setSelectedTypeId] = useState('')
  const [amount, setAmount] = useState('')
  const [reference, setReference] = useState('')
  const [items, setItems] = useState<any[]>([])
  const [dupWarning, setDupWarning] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [savedDuplicates, setSavedDuplicates] = useState<any[]>([])

  useEffect(() => {
    authFetch(`${BASE}/settings/pos`, { headers: getAuthHeaders() })
      .then(r => r.ok ? r.json() : { payment_types: [] })
      .then(data => {
        const active = (data.payment_types || []).filter((t: any) => t.is_active)
        setPosTypes(active)
        if (active.length > 0) setSelectedTypeId(active[0].type_id)
      })
      .catch(() => {})
  }, [])

  // Dedup check against both saved breakdown and the current session list
  const isDuplicate = (typeId: string, amt: number, ref: string): string | null => {
    const allExisting = [...existingBreakdown, ...items]
    const normRef = ref.trim().toLowerCase()
    if (normRef) {
      const match = allExisting.find(e => (e.reference || '').trim().toLowerCase() === normRef)
      if (match) return `Reference "${ref.trim()}" is already recorded (${match.type_name} K${match.amount.toFixed(2)})`
    } else {
      const match = allExisting.find(e =>
        e.type_id === typeId &&
        Math.round(e.amount * 100) === Math.round(amt * 100) &&
        !(e.reference || '').trim()
      )
      if (match) return `${match.type_name} K${match.amount.toFixed(2)} without a reference is already in the list`
    }
    return null
  }

  const addItem = () => {
    const amt = parseFloat(amount)
    if (!selectedTypeId || !amt || amt <= 0) return
    const type = posTypes.find(t => t.type_id === selectedTypeId)
    if (!type) return
    const dupMsg = isDuplicate(type.type_id, amt, reference)
    if (dupMsg) { setDupWarning(dupMsg); return }
    setDupWarning('')
    setItems(prev => [...prev, { type_id: type.type_id, type_name: type.name, amount: amt, reference: reference.trim() }])
    setAmount('')
    setReference('')
  }

  const saveAll = async () => {
    if (items.length === 0) return
    setSaving(true)
    setErr('')
    setSavedDuplicates([])
    try {
      const res = await authFetch(`${BASE}/handover/${handoverId}/pos-receipts`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ pos_items: items }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (res.status === 409 && body.detail?.duplicates) {
          setSavedDuplicates(body.detail.duplicates)
          setErr(body.detail.message || 'Duplicate entries detected')
        } else {
          setErr(body.detail || 'Save failed')
        }
        return
      }
      const added = body.added ?? items.length
      const dups = body.duplicates ?? []
      if (dups.length > 0) {
        setSavedDuplicates(dups)
        toast.success(`${added} receipt(s) saved. ${dups.length} duplicate(s) skipped.`)
      } else {
        toast.success(`${added} POS receipt(s) saved`)
      }
      onSaved()
    } catch (e: any) {
      setErr(e.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const total = items.reduce((s, i) => s + i.amount, 0)
  const fmtK = (v: number) => `K${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  return (
    <div className="mt-3" style={{ borderRadius: 8, padding: '0 0 0 3px', background: 'var(--color-action-primary)' }}>
    <div className="p-3 space-y-3" style={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 6 }}>
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <div className="text-[10px] font-bold uppercase mb-1" style={{ color: theme.textSecondary }}>Payment Type</div>
          {posTypes.length === 0 ? (
            <p className="text-xs" style={{ color: 'var(--color-status-warning)' }}>
              No types configured. Go to Settings &rarr; POS.
            </p>
          ) : (
            <select value={selectedTypeId} onChange={e => { setSelectedTypeId(e.target.value); setDupWarning('') }}
              className="px-2 py-1.5 text-xs rounded border" style={{ backgroundColor: theme.background, color: theme.textPrimary, borderColor: theme.border }}>
              {posTypes.map(t => <option key={t.type_id} value={t.type_id}>{t.name}</option>)}
            </select>
          )}
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase mb-1" style={{ color: theme.textSecondary }}>Amount (ZMW)</div>
          <input type="number" min="0" step="0.01" placeholder="0.00" value={amount}
            onChange={e => { setAmount(e.target.value); setDupWarning('') }} onKeyDown={e => e.key === 'Enter' && addItem()}
            className="w-28 px-2 py-1.5 text-xs rounded border" style={{ backgroundColor: theme.background, color: theme.textPrimary, borderColor: theme.border }} />
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase mb-1" style={{ color: theme.textSecondary }}>Transaction Ref.</div>
          <input type="text" placeholder="Slip / batch no." value={reference}
            onChange={e => { setReference(e.target.value); setDupWarning('') }} onKeyDown={e => e.key === 'Enter' && addItem()}
            className="w-36 px-2 py-1.5 text-xs rounded border" style={{ backgroundColor: theme.background, color: theme.textPrimary, borderColor: theme.border }} />
        </div>
        <button onClick={addItem} className="px-3 py-1.5 text-xs font-bold rounded text-white self-end"
          style={{ backgroundColor: 'var(--color-action-primary)' }}>
          + Add
        </button>
      </div>

      {dupWarning && (
        <p className="text-xs font-medium px-2 py-1.5 rounded" style={{ backgroundColor: 'var(--color-status-warning-light)', color: 'var(--color-status-warning)' }}>
          Duplicate: {dupWarning}
        </p>
      )}

      {savedDuplicates.length > 0 && (
        <div className="text-xs px-2 py-1.5 rounded" style={{ backgroundColor: 'var(--color-status-warning-light)', color: 'var(--color-status-warning)' }}>
          <span className="font-bold">Skipped duplicates:</span>
          {savedDuplicates.map((d, i) => <span key={i} className="block">{d.reason}</span>)}
        </div>
      )}

      {items.length > 0 && (
        <div className="space-y-1">
          {items.map((item, idx) => (
            <div key={idx} className="flex items-center justify-between text-xs px-2 py-1.5 rounded"
              style={{ backgroundColor: theme.background }}>
              <span style={{ color: theme.textSecondary }}>{item.type_name}{item.reference && ` · ${item.reference}`}</span>
              <div className="flex items-center gap-3">
                <span className="font-mono font-semibold" style={{ color: theme.textPrimary }}>{fmtK(item.amount)}</span>
                <button onClick={() => setItems(prev => prev.filter((_, i) => i !== idx))}
                  className="text-[10px]" style={{ color: 'var(--color-status-error)' }}>Remove</button>
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs font-bold" style={{ color: theme.textPrimary }}>Total: {fmtK(total)}</span>
            <button onClick={saveAll} disabled={saving}
              className="px-3 py-1.5 text-xs font-bold rounded text-white disabled:opacity-50"
              style={{ backgroundColor: 'var(--color-status-success)' }}>
              {saving ? 'Saving...' : 'Save POS'}
            </button>
          </div>
        </div>
      )}
      {err && <p className="text-xs" style={{ color: 'var(--color-status-error)' }}>{err}</p>}
    </div>
    </div>
  )
}

function CreditPanel({ handoverId, existingDetails, theme, currentUserRole, onSaved }: {
  handoverId: string
  existingDetails: any[]
  theme: any
  currentUserRole: string
  onSaved: () => void
}) {
  const [accounts, setAccounts] = useState<any[]>([])
  const [fuelPrices, setFuelPrices] = useState<Record<string, number>>({ Diesel: 0, Petrol: 0 })
  const [otherProducts, setOtherProducts] = useState<OtherProduct[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [itemKind, setItemKind] = useState<'fuel' | 'other'>('fuel')
  const [fuelType, setFuelType] = useState('Diesel')
  const [productCode, setProductCode] = useState('')
  const [entryMode, setEntryMode] = useState<'liters' | 'amount'>('liters')
  const [volume, setVolume] = useState('')
  const [amountInput, setAmountInput] = useState('')
  const [price, setPrice] = useState(0)
  const [items, setItems] = useState<any[]>([])
  const [dupWarning, setDupWarning] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [savedDuplicates, setSavedDuplicates] = useState<any[]>([])
  const [confirmedItems, setConfirmedItems] = useState<any[]>([])
  const [showNewAccount, setShowNewAccount] = useState(false)

  const canCreateAccounts = currentUserRole === 'manager' || currentUserRole === 'owner'

  useEffect(() => {
    authFetch(`${BASE}/handover/credit-accounts`, { headers: getAuthHeaders() })
      .then(r => r.ok ? r.json() : { accounts: [], fuel_prices: {} })
      .then(data => {
        const accts = data.accounts || []
        const prices = data.fuel_prices || { Diesel: 0, Petrol: 0 }
        setAccounts(accts)
        setFuelPrices(prices)
        const first = accts.find((a: any) => !a.is_suspended)
        if (first) setSelectedAccountId(first.account_id)
        setPrice(first?.default_price_per_liter || prices.Diesel || 0)
      })
      .catch(() => {})
    fetchOtherProducts().then(products => {
      setOtherProducts(products)
      setProductCode(prev => prev || products[0]?.code || '')
    })
  }, [])

  const selectedAccount = accounts.find(a => a.account_id === selectedAccountId)
  const selectedProduct = otherProducts.find(p => p.code === productCode)
  const itemLabel = itemKind === 'fuel' ? fuelType : (selectedProduct?.label || '')
  const vol = entryMode === 'liters' ? (parseFloat(volume) || 0) : (price > 0 ? Math.round(((parseFloat(amountInput) || 0) / price) * 1000) / 1000 : 0)
  const lineAmount = entryMode === 'amount' ? (parseFloat(amountInput) || 0) : Math.round(vol * price * 100) / 100

  const isDuplicate = (accountId: string, label: string): string | null => {
    const allExisting = [
      ...existingDetails.filter(d => d.source !== 'skipped_duplicate'),
      ...items,
    ]
    const match = allExisting.find(d => d.account_id === accountId && d.fuel_type === label)
    if (match) {
      const slip = match.slip_number ? ` (Slip: ${match.slip_number})` : ''
      return `${match.account_name} / ${label} already recorded for this shift${slip}`
    }
    return null
  }

  const handleAccountCreated = (acct: any) => {
    setAccounts(prev => [...prev, acct])
    setSelectedAccountId(acct.account_id)
    if (itemKind === 'fuel') {
      setPrice(acct.default_price_per_liter || fuelPrices[fuelType] || 0)
    } else {
      setPrice(selectedProduct?.unit_price || 0)
    }
    setShowNewAccount(false)
  }

  const addItem = () => {
    if (!selectedAccountId || vol <= 0 || price <= 0) return
    const acct = accounts.find(a => a.account_id === selectedAccountId)
    if (!acct) return
    const dupMsg = isDuplicate(acct.account_id, itemLabel)
    if (dupMsg) { setDupWarning(dupMsg); return }
    setDupWarning('')
    setItems(prev => [...prev, {
      account_id: acct.account_id, account_name: acct.account_name, item_kind: itemKind,
      fuel_type: itemLabel, volume: vol, price_per_liter: price, amount: lineAmount,
    }])
    setVolume('')
    setAmountInput('')
  }

  const saveAll = async () => {
    if (items.length === 0) return
    setSaving(true)
    setErr('')
    setSavedDuplicates([])
    try {
      const res = await authFetch(`${BASE}/handover/${handoverId}/credit-sales`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ credit_items: items }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (res.status === 409 && body.detail?.duplicates) {
          setSavedDuplicates(body.detail.duplicates)
          setErr(body.detail.message || 'Duplicate entries detected')
        } else {
          setErr(body.detail || 'Save failed')
        }
        return
      }
      const added = body.added ?? items.length
      const dups: any[] = body.duplicates ?? []
      if (dups.length > 0) setSavedDuplicates(dups)
      // Show newly saved items (with slip numbers) before collapsing
      const newlySaved = (body.credit_sale_details || []).filter(
        (d: any) => d.source === 'handover' && d.slip_number
      )
      setConfirmedItems(newlySaved)
      setItems([])
      if (added > 0) toast.success(`${added} credit sale(s) saved`)
    } catch (e: any) {
      setErr(e.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const total = items.reduce((s, i) => s + i.amount, 0)
  const fmtK = (v: number) => `K${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const smallInputStyle = { backgroundColor: theme.background, color: theme.textPrimary, borderColor: theme.border }

  return (
    <div className="mt-3" style={{ borderRadius: 8, padding: '0 0 0 3px', background: 'var(--color-action-primary)' }}>
    <div className="p-3 space-y-3" style={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: 6 }}>

      {confirmedItems.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase" style={{ color: 'var(--color-status-success)' }}>Saved</p>
          {confirmedItems.map((item, idx) => (
            <div key={idx} className="flex items-center justify-between text-xs px-2 py-1.5 rounded"
              style={{ backgroundColor: theme.background }}>
              <div>
                <span className="font-semibold" style={{ color: theme.textPrimary }}>{item.account_name}</span>
                <span style={{ color: theme.textSecondary }}> · {item.fuel_type} · {item.volume?.toLocaleString()}{['Diesel', 'Petrol'].includes(item.fuel_type) ? 'L' : ''}</span>
              </div>
              <div className="flex items-center gap-4">
                {item.slip_number && (
                  <span className="font-mono text-[10px] px-1.5 py-0.5 rounded"
                    style={{ backgroundColor: 'var(--color-action-primary-light)', color: 'var(--color-action-primary)' }}>
                    {item.slip_number}
                  </span>
                )}
                <span className="font-mono font-semibold" style={{ color: theme.textPrimary }}>{fmtK(item.amount)}</span>
              </div>
            </div>
          ))}
          {savedDuplicates.length > 0 && (
            <div className="text-xs px-2 py-1.5 rounded" style={{ backgroundColor: 'var(--color-status-warning-light)', color: 'var(--color-status-warning)' }}>
              <span className="font-bold">Skipped duplicates:</span>
              {savedDuplicates.map((d, i) => <span key={i} className="block">{d.reason}</span>)}
            </div>
          )}
          <div className="flex justify-end pt-1">
            <button onClick={onSaved} className="px-3 py-1.5 text-xs font-bold rounded text-white"
              style={{ backgroundColor: 'var(--color-action-primary)' }}>
              Done
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <div className="text-[10px] font-bold uppercase mb-1" style={{ color: theme.textSecondary }}>Account</div>
              <select value={selectedAccountId}
                onChange={e => {
                  if (e.target.value === '__new__') { setShowNewAccount(true); return }
                  setSelectedAccountId(e.target.value); setDupWarning('')
                }}
                className="px-2 py-1.5 text-xs rounded border" style={smallInputStyle}>
                {accounts.map(a => (
                  <option key={a.account_id} value={a.account_id} disabled={a.is_suspended}>
                    {a.account_name}{a.is_suspended ? ' (Suspended)' : ''}
                  </option>
                ))}
                {canCreateAccounts && <option value="__new__">+ New Account...</option>}
              </select>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase mb-1" style={{ color: theme.textSecondary }}>Kind</div>
              <select value={itemKind}
                onChange={e => {
                  const kind = e.target.value as 'fuel' | 'other'
                  setItemKind(kind)
                  setDupWarning('')
                  if (kind === 'fuel') {
                    setPrice(selectedAccount?.default_price_per_liter || fuelPrices[fuelType] || 0)
                  } else {
                    setPrice(selectedProduct?.unit_price || 0)
                  }
                }}
                className="px-2 py-1.5 text-xs rounded border" style={smallInputStyle}>
                <option value="fuel">Fuel</option>
                <option value="other">Other</option>
              </select>
            </div>
            {itemKind === 'fuel' ? (
              <div>
                <div className="text-[10px] font-bold uppercase mb-1" style={{ color: theme.textSecondary }}>Fuel</div>
                <select value={fuelType}
                  onChange={e => {
                    setFuelType(e.target.value)
                    setPrice(selectedAccount?.default_price_per_liter || fuelPrices[e.target.value] || 0)
                    setDupWarning('')
                  }}
                  className="px-2 py-1.5 text-xs rounded border" style={smallInputStyle}>
                  <option>Diesel</option>
                  <option>Petrol</option>
                </select>
              </div>
            ) : (
              <div>
                <div className="text-[10px] font-bold uppercase mb-1" style={{ color: theme.textSecondary }}>Product</div>
                <select value={productCode}
                  onChange={e => {
                    const p = otherProducts.find(op => op.code === e.target.value)
                    setProductCode(e.target.value)
                    setPrice(p?.unit_price || 0)
                    setDupWarning('')
                  }}
                  className="min-w-[10rem] px-2 py-1.5 text-xs rounded border" style={smallInputStyle}>
                  {otherProducts.length === 0 && <option value="">No products available</option>}
                  {['Lubricant', 'Accessory'].map(cat => {
                    const rows = otherProducts.filter(p => p.category === cat)
                    if (rows.length === 0) return null
                    return (
                      <optgroup key={cat} label={cat}>
                        {rows.map(p => <option key={p.code} value={p.code}>{p.label}</option>)}
                      </optgroup>
                    )
                  })}
                </select>
              </div>
            )}
            <div>
              <div className="text-[10px] font-bold uppercase mb-1" style={{ color: theme.textSecondary }}>Entry</div>
              <select value={entryMode} onChange={e => { setEntryMode(e.target.value as 'liters' | 'amount'); setDupWarning('') }}
                className="px-2 py-1.5 text-xs rounded border" style={smallInputStyle}>
                <option value="liters">{itemKind === 'fuel' ? 'Litres' : 'Qty'}</option>
                <option value="amount">Amount (K)</option>
              </select>
            </div>
            {entryMode === 'liters' ? (
              <div>
                <div className="text-[10px] font-bold uppercase mb-1" style={{ color: theme.textSecondary }}>
                  {itemKind === 'fuel' ? 'Volume (L)' : 'Quantity'}
                </div>
                <input type="number" min="0" step="0.01" placeholder="0.00" value={volume}
                  onChange={e => { setVolume(e.target.value); setDupWarning('') }} onKeyDown={e => e.key === 'Enter' && addItem()}
                  className="w-24 px-2 py-1.5 text-xs rounded border" style={smallInputStyle} />
              </div>
            ) : (
              <div>
                <div className="text-[10px] font-bold uppercase mb-1" style={{ color: theme.textSecondary }}>Amount (ZMW)</div>
                <input type="number" min="0" step="0.01" placeholder="0.00" value={amountInput}
                  onChange={e => { setAmountInput(e.target.value); setDupWarning('') }} onKeyDown={e => e.key === 'Enter' && addItem()}
                  className="w-24 px-2 py-1.5 text-xs rounded border" style={smallInputStyle} />
              </div>
            )}
            <div>
              <div className="text-[10px] font-bold uppercase mb-1" style={{ color: theme.textSecondary }}>Price</div>
              <input type="number" min="0" step="0.01" placeholder="0.00" value={price || ''}
                title="Price — editable for a negotiated credit rate"
                onChange={e => { setPrice(parseFloat(e.target.value) || 0); setDupWarning('') }}
                className="w-20 px-2 py-1.5 text-xs rounded border text-right font-mono" style={smallInputStyle} />
            </div>
            {vol > 0 && price > 0 && (
              <span className="text-xs self-end pb-2 font-semibold" style={{ color: 'var(--color-action-primary)' }}
                title={entryMode === 'amount' ? `= ${vol} ${itemKind === 'fuel' ? 'L' : 'units'}` : undefined}>
                {fmtK(lineAmount)}
              </span>
            )}
            <button onClick={addItem} className="px-3 py-1.5 text-xs font-bold rounded text-white self-end"
              style={{ backgroundColor: 'var(--color-action-primary)' }}>
              + Add
            </button>
          </div>

          {dupWarning && (
            <p className="text-xs font-medium px-2 py-1.5 rounded" style={{ backgroundColor: 'var(--color-status-warning-light)', color: 'var(--color-status-warning)' }}>
              Duplicate: {dupWarning}
            </p>
          )}

          {items.length > 0 && (
            <div className="space-y-1">
              {items.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs px-2 py-1.5 rounded"
                  style={{ backgroundColor: theme.background }}>
                  <span style={{ color: theme.textSecondary }}>
                    {item.account_name} · {item.fuel_type} · {item.volume.toLocaleString()}{item.item_kind === 'fuel' ? 'L' : ' units'} @ K{item.price_per_liter.toFixed(2)}
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-semibold" style={{ color: theme.textPrimary }}>{fmtK(item.amount)}</span>
                    <button onClick={() => setItems(prev => prev.filter((_, i) => i !== idx))}
                      className="text-[10px]" style={{ color: 'var(--color-status-error)' }}>Remove</button>
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs font-bold" style={{ color: theme.textPrimary }}>Total: {fmtK(total)}</span>
                <button onClick={saveAll} disabled={saving}
                  className="px-3 py-1.5 text-xs font-bold rounded text-white disabled:opacity-50"
                  style={{ backgroundColor: 'var(--color-status-success)' }}>
                  {saving ? 'Saving...' : 'Save Credit'}
                </button>
              </div>
            </div>
          )}
          {err && <p className="text-xs" style={{ color: 'var(--color-status-error)' }}>{err}</p>}
        </>
      )}

    </div>
    {showNewAccount && (
      <NewAccountModal theme={theme} onClose={() => setShowNewAccount(false)} onCreated={handleAccountCreated} />
    )}
    </div>
  )
}
