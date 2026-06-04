import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/router'
import toast from 'react-hot-toast'
import LoadingSpinner from '../components/LoadingSpinner'
import { getHeaders, authFetch } from '../lib/api'
import Link from 'next/link'
import ExportButtons from '../components/ExportButtons'
import { ExportConfig } from '../lib/exportUtils'
import { useWorkingDay } from '../contexts/WorkingDayContext'

const BASE = '/api/v1'

const fmt = (n: number) => `K${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function DailyCloseOff() {
  const router = useRouter()
  const { date: selectedDate, setDate: setSelectedDate } = useWorkingDay()  // shared working day (item 2)

  const [userRole, setUserRole] = useState('')
  const [loading, setLoading] = useState(true)
  const [closing, setClosing] = useState(false)
  const [summary, setSummary] = useState<any>(null)
  const [error, setError] = useState('')

  // Deposit form
  const [bankDeposit, setBankDeposit] = useState('')
  const [depositReference, setDepositReference] = useState('')
  const [ownerNotes, setOwnerNotes] = useState('')

  // History
  const [showHistory, setShowHistory] = useState(false)
  const [history, setHistory] = useState<any[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  // Auth check — owner only
  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (!userData) {
      router.push('/login')
      return
    }
    const user = JSON.parse(userData)
    setUserRole(user.role || '')
    if (!['manager', 'owner'].includes(user.role)) {
      router.push('/')
    }
  }, [router])

  // Fetch summary
  const fetchSummary = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await authFetch(`${BASE}/daily-close-off/summary?date=${selectedDate}`, {
        headers: getHeaders(),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Failed to load summary' }))
        throw new Error(err.detail || 'Failed to load summary')
      }
      const data = await res.json()
      setSummary(data)

      // Pre-fill deposit if already closed
      if (data.already_closed && data.close_off_record) {
        setBankDeposit(String(data.close_off_record.bank_deposit?.amount || ''))
        setDepositReference(data.close_off_record.bank_deposit?.reference || '')
        setOwnerNotes(data.close_off_record.owner_notes || '')
      } else {
        setBankDeposit('')
        setDepositReference('')
        setOwnerNotes('')
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [selectedDate])

  useEffect(() => {
    if (userRole === 'owner' || userRole === 'manager') fetchSummary()
  }, [fetchSummary, userRole])

  // Fetch history
  const fetchHistory = async () => {
    setHistoryLoading(true)
    try {
      const res = await authFetch(`${BASE}/daily-close-off/history?limit=30`, {
        headers: getHeaders(),
      })
      if (res.ok) setHistory(await res.json())
    } catch {
      // silent
    } finally {
      setHistoryLoading(false)
    }
  }

  const toggleHistory = () => {
    if (!showHistory && history.length === 0) fetchHistory()
    setShowHistory(!showHistory)
  }

  // Close day
  const handleCloseDay = async () => {
    if (!bankDeposit || isNaN(parseFloat(bankDeposit))) {
      toast.error('Please enter a valid bank deposit amount')
      return
    }

    const confirmed = window.confirm(
      `This will lock all handovers for ${selectedDate} and cannot be undone.\n\nBank deposit: ${fmt(parseFloat(bankDeposit))}\n\nContinue?`
    )
    if (!confirmed) return

    setClosing(true)
    try {
      const res = await authFetch(`${BASE}/daily-close-off/close`, {
        method: 'POST',
        headers: { ...getHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: selectedDate,
          bank_deposit_amount: parseFloat(bankDeposit),
          deposit_reference: depositReference,
          owner_notes: ownerNotes,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Failed to close day' }))
        throw new Error(err.detail || 'Failed to close day')
      }
      toast.success(`Day ${selectedDate} closed successfully`)
      fetchSummary()
      if (showHistory) fetchHistory()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setClosing(false)
    }
  }

  if (!['manager', 'owner'].includes(userRole)) return null

  const isClosed = summary?.already_closed
  const record = summary?.close_off_record
  const totals = summary?.totals || {}
  const hasUnapproved = (summary?.unapproved_handovers?.length || 0) > 0
  const hasApproved = (summary?.approved_handovers?.length || 0) > 0
  const depositNum = parseFloat(bankDeposit) || 0
  const depositVariance = depositNum - (totals.total_actual_cash || 0)

  const canClose = !isClosed && hasApproved && !hasUnapproved && bankDeposit && !isNaN(parseFloat(bankDeposit))

  const getExportConfig = useCallback((): ExportConfig | null => {
    if (!summary?.approved_handovers?.length) return null
    return {
      title: 'Daily Close-Off Report',
      subtitle: `Date: ${selectedDate} — ${isClosed ? 'Closed' : 'Open'}`,
      filename: `daily_close_off_${selectedDate}`,
      summaryCards: [
        { label: 'Total Revenue', value: `ZMW ${(totals.total_revenue || 0).toLocaleString()}` },
        { label: 'Expected Cash', value: `ZMW ${(totals.total_expected_cash || 0).toLocaleString()}` },
        { label: 'Actual Cash', value: `ZMW ${(totals.total_actual_cash || 0).toLocaleString()}` },
        { label: 'Shifts', value: totals.shift_count || 0 },
      ],
      columns: [
        { header: 'Attendant', key: 'attendant_name' },
        { header: 'Shift', key: 'shift_type' },
        { header: 'Fuel Revenue', key: 'fuel_revenue', format: 'currency' },
        { header: 'LPG Sales', key: 'lpg_sales', format: 'currency' },
        { header: 'Lubricants', key: 'lubricant_sales', format: 'currency' },
        { header: 'Accessories', key: 'accessory_sales', format: 'currency' },
        { header: 'Expected Cash', key: 'expected_cash', format: 'currency' },
        { header: 'Actual Cash', key: 'actual_cash', format: 'currency' },
        { header: 'Difference', key: 'difference', format: 'currency' },
      ],
      data: summary.approved_handovers,
    }
  }, [summary, selectedDate, isClosed, totals])

  return (
    <div>
      {/* Header */}
      <div className="mb-6 animate-fade-in-up-1">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-content-primary tracking-tight">Daily Close-Off</h1>
            <p className="mt-1 text-sm text-content-secondary">Review, reconcile, and lock the day</p>
          </div>

          <div className="flex items-center gap-3">
            <ExportButtons getConfig={getExportConfig} />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-3 py-2 border border-surface-border rounded-input text-sm focus:outline-none focus:ring-2 focus:ring-action-primary"
            />

            {/* Status badge */}
            {summary && (
              <span className={`px-3 py-1.5 rounded-badge text-xs font-semibold ${
                isClosed
                  ? 'bg-status-success/15 text-status-success border border-status-success/30'
                  : hasUnapproved
                    ? 'bg-status-error/15 text-status-error border border-status-error/30'
                    : 'bg-status-warning/15 text-status-warning border border-status-warning/30'
              }`}>
                {isClosed ? 'Closed' : hasUnapproved ? 'Pending Reviews' : 'Open'}
              </span>
            )}
          </div>
        </div>
      </div>

      {loading && <LoadingSpinner text="Loading close-off summary..." />}
      {error && (
        <div className="p-4 bg-status-error-light border border-status-error/30 rounded-card text-sm text-status-error mb-6 animate-scale-in">
          {error}
        </div>
      )}

      {!loading && summary && (
        <>
          {/* Already Closed Banner */}
          {isClosed && record && (
            <div className="glass-card p-5 mb-6 border-l-4 border-status-success animate-fade-in-up-1">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-status-success/15 flex items-center justify-center">
                  <svg className="w-5 h-5 text-status-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-status-success">Day Closed</h3>
                  <p className="text-xs text-content-secondary">
                    Closed by {record.closed_by_name} on {new Date(record.closed_at).toLocaleString()}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <p className="text-content-secondary">Bank Deposit</p>
                  <p className="font-bold text-content-primary">{fmt(record.bank_deposit?.amount || 0)}</p>
                </div>
                <div>
                  <p className="text-content-secondary">Deposit Variance</p>
                  <p className={`font-bold ${(record.bank_deposit?.variance || 0) >= 0 ? 'text-status-success' : 'text-status-error'}`}>
                    {fmt(record.bank_deposit?.variance || 0)}
                  </p>
                </div>
                <div>
                  <p className="text-content-secondary">Reference</p>
                  <p className="font-bold text-content-primary">{record.bank_deposit?.reference || '-'}</p>
                </div>
                <div>
                  <p className="text-content-secondary">Notes</p>
                  <p className="font-bold text-content-primary">{record.owner_notes || '-'}</p>
                </div>
              </div>
            </div>
          )}

          {/* Unapproved Warning */}
          {hasUnapproved && !isClosed && (
            <div className="p-4 bg-status-warning/10 border border-status-warning/30 rounded-card mb-6 animate-fade-in-up-1">
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-status-warning shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div>
                  <p className="text-sm font-semibold text-status-warning">
                    {summary.unapproved_handovers.length} handover(s) still pending approval
                  </p>
                  <p className="text-xs text-content-secondary mt-0.5">
                    All handovers must be approved before closing the day.{' '}
                    <Link href="/handover-review" className="text-action-primary hover:underline">
                      Go to Handover Review
                    </Link>
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Approved Shifts Table */}
          {hasApproved && (
            <div className="glass-card p-6 mb-6 animate-fade-in-up-2">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-action-primary/10 flex items-center justify-center">
                  <svg className="w-5 h-5 text-action-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-content-primary">Approved Shifts</h2>
                  <p className="text-xs text-content-secondary">{summary.approved_handovers.length} handover(s) for {selectedDate}</p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-surface-border">
                      <th className="text-left py-2 px-3 text-xs font-semibold text-content-secondary">Attendant</th>
                      <th className="text-left py-2 px-3 text-xs font-semibold text-content-secondary">Shift</th>
                      <th className="text-right py-2 px-3 text-xs font-semibold text-content-secondary">Fuel</th>
                      <th className="text-right py-2 px-3 text-xs font-semibold text-content-secondary">LPG</th>
                      <th className="text-right py-2 px-3 text-xs font-semibold text-content-secondary">Lube</th>
                      <th className="text-right py-2 px-3 text-xs font-semibold text-content-secondary">Acc.</th>
                      <th className="text-right py-2 px-3 text-xs font-semibold text-content-secondary">Expected</th>
                      <th className="text-right py-2 px-3 text-xs font-semibold text-content-secondary">Actual</th>
                      <th className="text-right py-2 px-3 text-xs font-semibold text-content-secondary">Diff</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.approved_handovers.map((h: any) => {
                      const hasFlagStr = h.auto_flag_reasons?.length > 0
                      return (
                        <tr key={h.handover_id} className={`border-b border-surface-border/50 ${hasFlagStr ? 'bg-status-warning/5' : ''}`}>
                          <td className="py-2.5 px-3 text-content-primary font-medium">
                            {hasFlagStr && (
                              <span className="inline-block w-2 h-2 rounded-full bg-status-warning mr-1.5" title={h.auto_flag_reasons.join(', ')} />
                            )}
                            {h.attendant_name}
                          </td>
                          <td className="py-2.5 px-3 text-content-secondary">{h.shift_type}</td>
                          <td className="py-2.5 px-3 text-right text-content-primary">{fmt(h.fuel_revenue)}</td>
                          <td className="py-2.5 px-3 text-right text-content-primary">{fmt(h.lpg_sales)}</td>
                          <td className="py-2.5 px-3 text-right text-content-primary">{fmt(h.lubricant_sales)}</td>
                          <td className="py-2.5 px-3 text-right text-content-primary">{fmt(h.accessory_sales)}</td>
                          <td className="py-2.5 px-3 text-right text-content-primary font-medium">{fmt(h.expected_cash)}</td>
                          <td className="py-2.5 px-3 text-right text-content-primary font-medium">{fmt(h.actual_cash)}</td>
                          <td className={`py-2.5 px-3 text-right font-bold ${h.difference >= 0 ? 'text-status-success' : 'text-status-error'}`}>
                            {fmt(h.difference)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* No handovers */}
          {!hasApproved && !hasUnapproved && !isClosed && (
            <div className="glass-card p-12 mb-6 text-center animate-fade-in-up-2">
              <svg className="w-16 h-16 text-content-secondary/20 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <p className="text-content-secondary/60 font-medium">No handovers for {selectedDate}</p>
              <p className="text-content-secondary/40 text-sm mt-1">Nothing to close off</p>
            </div>
          )}

          {/* Daily P&L Snapshot */}
          {hasApproved && (
            <div className="glass-card p-6 mb-6 animate-fade-in-up-3">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-status-success/10 flex items-center justify-center">
                  <svg className="w-5 h-5 text-status-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h2 className="text-lg font-semibold text-content-primary">Daily P&L Snapshot</h2>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {[
                  { label: 'Fuel Revenue', value: totals.fuel_revenue, color: 'text-action-primary' },
                  { label: 'LPG Sales', value: totals.lpg_sales, color: 'text-fuel-petrol' },
                  { label: 'Lubricants', value: totals.lubricant_sales, color: 'text-category-c' },
                  { label: 'Accessories', value: totals.accessory_sales, color: 'text-category-d' },
                  { label: 'Total Revenue', value: totals.total_revenue, color: 'text-content-primary', bold: true },
                  { label: 'Credit Sales', value: totals.credit_sales, color: 'text-status-warning', negative: true },
                  { label: 'Expected Cash', value: totals.total_expected_cash, color: 'text-content-primary', bold: true },
                  { label: 'Actual Cash', value: totals.total_actual_cash, color: 'text-content-primary', bold: true },
                  { label: 'Net Variance', value: totals.net_variance, color: totals.net_variance >= 0 ? 'text-status-success' : 'text-status-error', bold: true },
                  { label: 'Shifts', value: totals.shift_count, isCount: true, color: 'text-content-secondary' },
                ].map((item) => (
                  <div key={item.label} className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.04]">
                    <p className="text-xs text-content-secondary mb-1">{item.label}</p>
                    <p className={`text-lg ${item.bold ? 'font-extrabold' : 'font-semibold'} ${item.color}`}>
                      {item.isCount ? item.value : fmt(item.value || 0)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Bank Deposit Form */}
          {hasApproved && !isClosed && (
            <div className="glass-card p-6 mb-6 animate-fade-in-up-4">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-fuel-diesel/10 flex items-center justify-center">
                  <svg className="w-5 h-5 text-fuel-diesel" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                  </svg>
                </div>
                <h2 className="text-lg font-semibold text-content-primary">Bank Deposit</h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-content-secondary mb-1.5">
                    Deposit Amount (K) <span className="text-status-error">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={bankDeposit}
                    onChange={(e) => setBankDeposit(e.target.value)}
                    className="w-full px-3 py-2.5 border border-surface-border rounded-input text-sm focus:outline-none focus:ring-2 focus:ring-action-primary"
                    placeholder="Enter bank deposit amount"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-content-secondary mb-1.5">
                    Deposit Reference
                  </label>
                  <input
                    type="text"
                    value={depositReference}
                    onChange={(e) => setDepositReference(e.target.value)}
                    className="w-full px-3 py-2.5 border border-surface-border rounded-input text-sm focus:outline-none focus:ring-2 focus:ring-action-primary"
                    placeholder="e.g. DEP-20260325"
                  />
                </div>
              </div>

              {/* Live deposit variance */}
              {bankDeposit && !isNaN(parseFloat(bankDeposit)) && (
                <div className={`p-3 rounded-xl mb-4 border ${
                  depositVariance >= 0
                    ? 'bg-status-success/10 border-status-success/30'
                    : 'bg-status-error/10 border-status-error/30'
                }`}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-content-secondary">Deposit vs Actual Cash</span>
                    <span className={`text-sm font-bold ${depositVariance >= 0 ? 'text-status-success' : 'text-status-error'}`}>
                      {depositVariance >= 0 ? '+' : ''}{fmt(depositVariance)}
                      <span className="text-xs font-normal ml-1">
                        ({depositVariance > 0 ? 'over' : depositVariance < 0 ? 'short' : 'exact'})
                      </span>
                    </span>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-content-secondary mb-1.5">
                  Owner Notes
                </label>
                <textarea
                  value={ownerNotes}
                  onChange={(e) => setOwnerNotes(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2.5 border border-surface-border rounded-input text-sm focus:outline-none focus:ring-2 focus:ring-action-primary resize-none"
                  placeholder="Optional notes about this day's operations..."
                />
              </div>
            </div>
          )}

          {/* Close Day Button */}
          {!isClosed && hasApproved && (
            <div className="mb-6 animate-fade-in-up-5">
              <button
                onClick={handleCloseDay}
                disabled={!canClose || closing}
                className="w-full sm:w-auto px-8 py-3 bg-status-success text-white font-semibold rounded-btn hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-status-success focus:ring-offset-2 focus:ring-offset-surface-bg disabled:opacity-40 disabled:cursor-not-allowed shadow-glow-success transition-all flex items-center justify-center gap-2"
              >
                {closing ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Closing...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    Close Day &amp; Lock Handovers
                  </>
                )}
              </button>
              {hasUnapproved && (
                <p className="text-xs text-status-error mt-2">Cannot close — {summary.unapproved_handovers.length} unapproved handover(s) remaining</p>
              )}
            </div>
          )}

          {/* History Section */}
          <div className="animate-fade-in-up-5">
            <button
              onClick={toggleHistory}
              className="flex items-center gap-2 text-sm font-medium text-content-secondary hover:text-content-primary transition-colors mb-4"
            >
              <svg className={`w-4 h-4 transition-transform ${showHistory ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
              Close-Off History
            </button>

            {showHistory && (
              <div className="glass-card p-6 dropdown-enter">
                {historyLoading ? (
                  <LoadingSpinner text="Loading history..." />
                ) : history.length === 0 ? (
                  <p className="text-center text-sm text-content-secondary/60 py-6">No close-off history yet</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-surface-border">
                          <th className="text-left py-2 px-3 text-xs font-semibold text-content-secondary">Date</th>
                          <th className="text-right py-2 px-3 text-xs font-semibold text-content-secondary">Shifts</th>
                          <th className="text-right py-2 px-3 text-xs font-semibold text-content-secondary">Revenue</th>
                          <th className="text-right py-2 px-3 text-xs font-semibold text-content-secondary">Deposit</th>
                          <th className="text-right py-2 px-3 text-xs font-semibold text-content-secondary">Dep. Var.</th>
                          <th className="text-left py-2 px-3 text-xs font-semibold text-content-secondary">Closed By</th>
                          <th className="text-left py-2 px-3 text-xs font-semibold text-content-secondary">Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {history.map((rec: any) => (
                          <tr
                            key={rec.date}
                            className="border-b border-surface-border/50 hover:bg-white/[0.02] cursor-pointer transition-colors"
                            onClick={() => setSelectedDate(rec.date)}
                          >
                            <td className="py-2.5 px-3 text-content-primary font-medium">{rec.date}</td>
                            <td className="py-2.5 px-3 text-right text-content-secondary">{rec.shift_count}</td>
                            <td className="py-2.5 px-3 text-right text-content-primary">{fmt(rec.summary?.total_revenue || 0)}</td>
                            <td className="py-2.5 px-3 text-right text-content-primary">{fmt(rec.bank_deposit?.amount || 0)}</td>
                            <td className={`py-2.5 px-3 text-right font-bold ${(rec.bank_deposit?.variance || 0) >= 0 ? 'text-status-success' : 'text-status-error'}`}>
                              {fmt(rec.bank_deposit?.variance || 0)}
                            </td>
                            <td className="py-2.5 px-3 text-content-secondary">{rec.closed_by_name}</td>
                            <td className="py-2.5 px-3 text-content-secondary text-xs">{new Date(rec.closed_at).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
