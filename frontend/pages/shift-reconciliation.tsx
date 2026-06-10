import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { getHeaders, downloadExport, authFetch } from '../lib/api'
import ExportButtons from '../components/ExportButtons'
import { ExportConfig } from '../lib/exportUtils'
import ThreeWayReconciliation from './three-way-reconciliation'
import TankAnalysis from './tank-analysis'

const BASE = '/api/v1'

function ShiftReconciliationView() {
  const router = useRouter()
  const today = new Date().toISOString().split('T')[0]

  const [mode, setMode] = useState<'shift' | 'range'>('range')
  const [shifts, setShifts] = useState<any[]>([])
  const [selectedShift, setSelectedShift] = useState('')
  const [startDate, setStartDate] = useState(today)
  const [endDate, setEndDate] = useState(today)
  const [reconciliations, setReconciliations] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [fuelPrices, setFuelPrices] = useState<{petrol: number, diesel: number}>({petrol: 0, diesel: 0})

  // Accept date query parameter
  useEffect(() => {
    if (router.query.date && typeof router.query.date === 'string') {
      setStartDate(router.query.date)
      setEndDate(router.query.date)
    }
  }, [router.query.date])

  useEffect(() => {
    authFetch(`${BASE}/shifts/`, { headers: getHeaders() })
      .then(res => res.ok ? res.json() : [])
      .then(data => setShifts(data.slice(0, 30)))
      .catch(() => {})
    authFetch(`${BASE}/settings/fuel`, { headers: getHeaders() })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data) setFuelPrices({ petrol: data.petrol_price_per_liter || 0, diesel: data.diesel_price_per_liter || 0 })
      })
      .catch(() => {})
  }, [])

  const genDates = (start: string, end: string) => {
    const out: string[] = []
    const cur = new Date(start)
    const last = new Date(end)
    while (cur <= last && out.length < 31) {
      out.push(cur.toISOString().split('T')[0])
      cur.setDate(cur.getDate() + 1)
    }
    return out
  }

  const fetchByShift = async (shiftId: string) => {
    if (!shiftId) { setReconciliations([]); return }
    setLoading(true); setError('')
    try {
      const res = await authFetch(`${BASE}/reconciliation/shift/${shiftId}`, { headers: getHeaders() })
      if (!res.ok) throw new Error('No reconciliation recorded for this shift yet')
      setReconciliations([await res.json()])
    } catch (err: any) {
      setError(err.message || 'Failed to load')
      setReconciliations([])
    } finally { setLoading(false) }
  }

  const fetchByRange = async () => {
    setLoading(true); setError('')
    try {
      const dates = genDates(startDate, endDate)
      const results = await Promise.all(
        dates.map(d => authFetch(`${BASE}/reconciliation/date/${d}`, { headers: getHeaders() })
          .then(r => r.ok ? r.json() : []).catch(() => []))
      )
      setReconciliations(results.flat())
    } catch (err: any) {
      setError(err.message || 'Failed to load')
    } finally { setLoading(false) }
  }

  const isMultiDay = startDate !== endDate

  const formatCurrency = (amount: number) => {
    return `ZMW ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const getShiftIcon = (shiftType: string) => {
    return shiftType === 'Day' ? '☀️' : '🌙'
  }

  const getExportConfig = useCallback((): ExportConfig | null => {
    if (!reconciliations.length) return null
    const subtitle = mode === 'shift'
      ? `Shift: ${selectedShift}`
      : startDate === endDate ? `Date: ${startDate}` : `${startDate} to ${endDate}`
    return {
      title: 'Shift Reconciliation',
      subtitle,
      filename: `reconciliation_${mode === 'shift' ? selectedShift : startDate}${mode === 'range' && startDate !== endDate ? `_${endDate}` : ''}`,
      summaryCards: [
        { label: 'Total Shifts', value: reconciliations.length },
      ],
      columns: [
        { header: 'Shift', key: 'shift_type' },
        { header: 'Date', key: 'date' },
        { header: 'Petrol Revenue', key: 'petrol_revenue', format: 'currency' },
        { header: 'Diesel Revenue', key: 'diesel_revenue', format: 'currency' },
        { header: 'LPG Revenue', key: 'lpg_revenue', format: 'currency' },
        { header: 'Lubricants', key: 'lubricant_revenue', format: 'currency' },
        { header: 'Accessories', key: 'accessory_revenue', format: 'currency' },
        { header: 'Total Expected', key: 'total_expected', format: 'currency' },
        { header: 'Credit Sales', key: 'credit_sales', format: 'currency' },
        { header: 'Expected Cash', key: 'expected_cash', format: 'currency' },
        { header: 'Actual Cash', key: 'actual_cash', format: 'currency' },
        { header: 'Difference', key: 'cash_difference', format: 'currency' },
      ],
      data: reconciliations.map((r: any) => ({
        shift_type: r.shift_type || r.shift_id,
        date: r.date || selectedDate,
        petrol_revenue: r.petrol_revenue || 0,
        diesel_revenue: r.diesel_revenue || 0,
        lpg_revenue: r.lpg_revenue || 0,
        lubricant_revenue: r.lubricant_revenue || 0,
        accessory_revenue: r.accessory_revenue || 0,
        total_expected: r.total_expected || 0,
        credit_sales: r.credit_sales || 0,
        expected_cash: r.expected_cash || 0,
        actual_cash: r.actual_cash || 0,
        cash_difference: r.cash_difference || r.difference || 0,
      })),
    }
  }, [reconciliations, selectedDate])

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-content-primary">Shift Reconciliation Dashboard</h1>
        <p className="mt-2 text-sm text-content-secondary">Daily cash and inventory reconciliation - Matching Excel Summary Sheet</p>
      </div>

      {/* Selection controls */}
      <div className="mb-6 bg-surface-card rounded-lg shadow p-4 space-y-4">
        <div className="flex flex-wrap items-end gap-4">
          {/* Mode toggle */}
          <div>
            <label className="block text-xs font-medium text-content-secondary mb-1 uppercase tracking-wide">Mode</label>
            <div className="flex rounded-md border border-surface-border overflow-hidden">
              {(['shift', 'range'] as const).map(m => (
                <button key={m} onClick={() => { setMode(m); setReconciliations([]) }}
                  className="px-4 py-2 text-sm font-medium transition-colors"
                  style={{ backgroundColor: mode === m ? 'var(--color-action-primary)' : 'transparent', color: mode === m ? '#fff' : 'var(--color-content-secondary)' }}>
                  {m === 'shift' ? 'By Shift' : 'By Date Range'}
                </button>
              ))}
            </div>
          </div>

          {mode === 'shift' ? (
            <div className="flex-1 min-w-[260px]">
              <label className="block text-xs font-medium text-content-secondary mb-1 uppercase tracking-wide">Shift</label>
              <select value={selectedShift}
                onChange={e => { setSelectedShift(e.target.value); fetchByShift(e.target.value) }}
                className="w-full px-3 py-2 border border-surface-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-action-primary">
                <option value="">-- Select a shift --</option>
                {shifts.map(s => (
                  <option key={s.shift_id} value={s.shift_id}>{s.date} - {s.shift_type} ({s.shift_id})</option>
                ))}
              </select>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-medium text-content-secondary mb-1 uppercase tracking-wide">From</label>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                  className="px-3 py-2 border border-surface-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-action-primary" />
              </div>
              <div>
                <label className="block text-xs font-medium text-content-secondary mb-1 uppercase tracking-wide">To</label>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                  className="px-3 py-2 border border-surface-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-action-primary" />
              </div>
              <button onClick={fetchByRange} disabled={loading}
                className="px-5 py-2 rounded-md text-sm font-medium text-white disabled:opacity-50"
                style={{ backgroundColor: 'var(--color-action-primary)' }}>
                {loading ? 'Loading...' : 'Load'}
              </button>
            </>
          )}

          {reconciliations.length > 0 && (
            <div className="flex items-end gap-2">
              <button onClick={() => downloadExport(`/exports/reconciliation?format=csv&start_date=${startDate}&end_date=${endDate}`, 'reconciliation.csv')}
                className="px-4 py-2 border border-action-primary text-action-primary font-medium rounded-md hover:opacity-80 text-sm">CSV</button>
              <button onClick={() => downloadExport(`/exports/reconciliation?format=excel&start_date=${startDate}&end_date=${endDate}`, 'reconciliation.xlsx')}
                className="px-4 py-2 border border-action-primary text-action-primary font-medium rounded-md hover:opacity-80 text-sm">Excel</button>
              <ExportButtons getConfig={getExportConfig} />
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-status-error-light border border-status-error rounded-lg">
          <p className="text-status-error">{error}</p>
        </div>
      )}

      {/* Empty state */}
      {reconciliations.length === 0 && !loading && !error && (
        <div className="bg-status-pending-light border border-status-warning rounded-lg p-6 text-center">
          <p className="text-status-warning text-sm">
            {mode === 'shift' ? 'Select a shift above to load its reconciliation.' : 'Select a date range and click Load.'}
          </p>
        </div>
      )}

      {/* Range summary table (multi-day) */}
      {mode === 'range' && isMultiDay && reconciliations.length > 0 && !loading && (
        <div className="bg-surface-card rounded-lg shadow overflow-hidden mb-6">
          <div className="px-6 py-4 border-b border-surface-border">
            <h2 className="text-lg font-bold text-content-primary">{startDate} to {endDate}</h2>
            <p className="text-xs text-content-secondary mt-1">{reconciliations.length} shift(s) found</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-border bg-surface-bg">
                  {['Date', 'Shift', 'Total Expected', 'Credit Sales', 'Expected Cash', 'Actual Deposited', 'Difference'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase text-content-secondary whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {reconciliations.map((recon: any, i: number) => {
                  const diff = recon.difference ?? null
                  const diffColor = diff == null ? '' : diff > 0 ? 'text-action-primary' : diff < 0 ? 'text-status-error' : 'text-status-success'
                  const fmt = (n: number) => n == null ? '-' : `ZMW ${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  return (
                    <tr key={i} className="border-b border-surface-border hover:bg-surface-bg transition-colors">
                      <td className="px-4 py-3 font-medium">{recon.date}</td>
                      <td className="px-4 py-3">{recon.shift_type}</td>
                      <td className="px-4 py-3 font-mono">{fmt(recon.total_expected)}</td>
                      <td className="px-4 py-3 font-mono">{fmt(recon.credit_sales_total)}</td>
                      <td className="px-4 py-3 font-mono font-semibold">{fmt(recon.expected_cash)}</td>
                      <td className="px-4 py-3 font-mono">{recon.actual_deposited != null ? fmt(recon.actual_deposited) : '-'}</td>
                      <td className={`px-4 py-3 font-mono font-semibold ${diffColor}`}>
                        {diff != null ? `${diff > 0 ? '+' : ''}${fmt(diff)}` : '-'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Detail cards — shift mode or single-day range */}
      {(mode === 'shift' || !isMultiDay) && (
      <div className="space-y-6">
        {reconciliations.map((recon, index) => (
          <div
            key={index}
            className={`rounded-lg shadow-lg border-2 ${
              recon.shift_type === 'Day'
                ? 'bg-status-pending-light border-status-warning'
                : 'bg-category-d-light border-category-d-border'
            }`}
          >
            {/* Header */}
            <div className="p-6 border-b border-surface-border">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-content-primary flex items-center gap-2">
                    {getShiftIcon(recon.shift_type)} {recon.shift_type} Shift Reconciliation
                  </h2>
                  <p className="text-sm text-content-secondary mt-1">
                    {recon.date} | Shift ID: {recon.shift_id}
                  </p>
                </div>
                {recon.difference !== null && (
                  <div className={`px-4 py-2 rounded-lg font-bold text-lg ${
                    recon.difference === 0
                      ? 'bg-status-success-light text-status-success border-2 border-status-success'
                      : recon.difference > 0
                      ? 'bg-action-primary-light text-action-primary border-2 border-action-primary'
                      : 'bg-status-error-light text-status-error border-2 border-status-error'
                  }`}>
                    {recon.difference > 0 ? '+' : ''}{formatCurrency(recon.difference)}
                  </div>
                )}
              </div>
            </div>

            {/* Revenue Breakdown */}
            <div className="p-6">
              <h3 className="text-lg font-bold text-content-primary mb-4">💰 Revenue Breakdown</h3>

              {/* VAT Calculation Section */}
              <div className="mb-6 bg-category-d-light rounded-lg p-4 border-2 border-category-d-border">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-sm font-semibold text-content-secondary">VAT Included (16%)</p>
                    <p className="text-xs text-content-secondary mt-1">
                      Petrol + Diesel Fuel Sales Only
                    </p>
                    <p className="text-xs text-category-d mt-1">
                      Formula: (Revenue × 0.16) ÷ 1.16
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-category-d">
                      {formatCurrency(((recon.petrol_revenue + recon.diesel_revenue) * 0.16 / 1.16))}
                    </p>
                    <p className="text-xs text-category-d">16% VAT on Fuel</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
                <div className="bg-surface-card rounded-lg p-4 border border-action-primary">
                  <p className="text-xs text-content-secondary font-medium">Petrol Revenue</p>
                  <p className="text-xl font-bold text-action-primary mt-1">
                    {formatCurrency(recon.petrol_revenue)}
                  </p>
                  <p className="text-xs text-content-secondary mt-1">
                    {fuelPrices.petrol > 0 ? `@ ZMW ${fuelPrices.petrol.toFixed(2)}/L` : ''}
                  </p>
                </div>

                <div className="bg-surface-card rounded-lg p-4 border border-category-c-border">
                  <p className="text-xs text-content-secondary font-medium">Diesel Revenue</p>
                  <p className="text-xl font-bold text-category-c mt-1">
                    {formatCurrency(recon.diesel_revenue)}
                  </p>
                  <p className="text-xs text-content-secondary mt-1">
                    {fuelPrices.diesel > 0 ? `@ ZMW ${fuelPrices.diesel.toFixed(2)}/L` : ''}
                  </p>
                </div>

                <div className="bg-surface-card rounded-lg p-4 border border-category-a-border">
                  <p className="text-xs text-content-secondary font-medium">LPG Revenue</p>
                  <p className="text-xl font-bold text-category-a mt-1">
                    {formatCurrency(recon.lpg_revenue)}
                  </p>
                  <p className="text-xs text-content-secondary mt-1">
                    Gas + Accessories
                  </p>
                </div>

                <div className="bg-surface-card rounded-lg p-4 border border-status-success">
                  <p className="text-xs text-content-secondary font-medium">Lubricants</p>
                  <p className="text-xl font-bold text-status-success mt-1">
                    {formatCurrency(recon.lubricants_revenue)}
                  </p>
                </div>

                <div className="bg-surface-card rounded-lg p-4 border border-cyan-200">
                  <p className="text-xs text-content-secondary font-medium">Accessories</p>
                  <p className="text-xl font-bold text-cyan-700 mt-1">
                    {formatCurrency(recon.accessories_revenue)}
                  </p>
                </div>
              </div>

              {/* Total Expected Revenue */}
              <div className="mt-6 bg-action-primary-light rounded-lg p-5 border-2 border-action-primary">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-sm font-semibold text-content-secondary">Total Expected Revenue (All Products)</p>
                    <p className="text-xs text-content-secondary mt-1">Petrol + Diesel + LPG + Lubricants + Accessories</p>
                  </div>
                  <p className="text-3xl font-bold text-action-primary">
                    {formatCurrency(recon.total_expected)}
                  </p>
                </div>
              </div>

              {/* Credit Sales Deduction */}
              <div className="mt-4 bg-status-pending-light rounded-lg p-5 border-2 border-status-warning">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-sm font-semibold text-content-secondary">Less: Credit Sales</p>
                    <p className="text-xs text-content-secondary mt-1">Institutional & Corporate Accounts</p>
                  </div>
                  <p className="text-2xl font-bold text-status-warning">
                    - {formatCurrency(recon.credit_sales_total)}
                  </p>
                </div>
              </div>

              {/* Expected Cash */}
              <div className="mt-4 bg-status-success-light rounded-lg p-5 border-2 border-status-success">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-sm font-semibold text-content-secondary">Expected Cash</p>
                    <p className="text-xs text-content-secondary mt-1">Total Revenue - Credit Sales</p>
                  </div>
                  <p className="text-3xl font-bold text-status-success">
                    {formatCurrency(recon.expected_cash)}
                  </p>
                </div>
              </div>

              {/* Actual Deposited */}
              {recon.actual_deposited !== null && (
                <>
                  <div className="mt-4 bg-surface-bg rounded-lg p-5 border-2 border-surface-border">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-sm font-semibold text-content-secondary">Actual Cash Deposited</p>
                        <p className="text-xs text-content-secondary mt-1">Bank deposit amount</p>
                      </div>
                      <p className="text-3xl font-bold text-content-primary">
                        {formatCurrency(recon.actual_deposited)}
                      </p>
                    </div>
                  </div>

                  {/* Difference Analysis */}
                  <div className={`mt-4 rounded-lg p-5 border-2 ${
                    recon.difference === 0
                      ? 'bg-status-success-light border-status-success'
                      : recon.difference > 0
                      ? 'bg-action-primary-light border-action-primary'
                      : 'bg-status-error-light border-status-error'
                  }`}>
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-sm font-semibold text-content-secondary">
                          {recon.difference === 0
                            ? '✅ Perfect Match'
                            : recon.difference > 0
                            ? '📈 Overage (Excess Cash)'
                            : '📉 Shortage (Cash Short)'}
                        </p>
                        <p className="text-xs text-content-secondary mt-1">Actual - Expected</p>
                      </div>
                      <p className={`text-3xl font-bold ${
                        recon.difference === 0
                          ? 'text-status-success'
                          : recon.difference > 0
                          ? 'text-action-primary'
                          : 'text-status-error'
                      }`}>
                        {recon.difference > 0 ? '+' : ''}{formatCurrency(recon.difference)}
                      </p>
                    </div>
                  </div>

                  {/* Cumulative Difference */}
                  <div className="mt-4 bg-category-a-light rounded-lg p-4 border-2 border-category-a-border">
                    <div className="flex justify-between items-center">
                      <p className="text-sm font-semibold text-category-a">Cumulative Difference (Running Total)</p>
                      <p className="text-xl font-bold text-category-a">
                        {recon.cumulative_difference > 0 ? '+' : ''}{formatCurrency(recon.cumulative_difference)}
                      </p>
                    </div>
                  </div>

                  {/* Loss/Gain Percentage */}
                  <div className="mt-4 bg-category-c-light rounded-lg p-4 border-2 border-category-c-border">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-sm font-semibold text-category-c">
                          {recon.difference < 0 ? '📉 Loss Percentage' : recon.difference > 0 ? '📈 Gain Percentage' : '⚖️ Perfect Balance'}
                        </p>
                        <p className="text-xs text-category-c mt-1">
                          (Actual - Expected) / Expected × 100
                        </p>
                      </div>
                      <p className={`text-2xl font-bold ${
                        Math.abs((recon.difference / recon.expected_cash) * 100) < 0.5 ? 'text-status-success' :
                        Math.abs((recon.difference / recon.expected_cash) * 100) < 2 ? 'text-status-warning' : 'text-status-error'
                      }`}>
                        {recon.expected_cash > 0 ? (
                          <>
                            {((recon.difference / recon.expected_cash) * 100).toFixed(3)}%
                          </>
                        ) : '0.000%'}
                      </p>
                    </div>
                    {Math.abs((recon.difference / recon.expected_cash) * 100) >= 2 && (
                      <div className="mt-2 pt-2 border-t border-category-c-border">
                        <p className="text-xs text-status-error font-semibold">
                          ⚠️ Variance exceeds 2% threshold - Requires investigation
                        </p>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Notes */}
              {recon.notes && (
                <div className="mt-4 bg-surface-bg rounded-lg p-4 border border-surface-border">
                  <p className="text-xs font-semibold text-content-secondary">Notes:</p>
                  <p className="text-sm text-content-primary mt-1">{recon.notes}</p>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      )}

      {/* Cross-links to other reconciliation pages */}
      <div className="mt-6 bg-surface-card rounded-lg shadow p-4 flex gap-4 flex-wrap items-center">
        <span className="text-sm font-medium text-content-secondary">Related:</span>
        <Link
          href={`/three-way-reconciliation?date=${startDate}`}
          className="inline-flex items-center px-4 py-2 border border-action-primary text-action-primary rounded-lg hover:bg-action-primary-light font-medium text-sm"
        >
          Three-Way Reconciliation
        </Link>
        <Link
          href="/tank-analysis"
          className="inline-flex items-center px-4 py-2 border border-action-primary text-action-primary rounded-lg hover:bg-action-primary-light font-medium text-sm"
        >
          Tank Analysis
        </Link>
      </div>

      {/* System Info */}
      <div className="mt-8 bg-action-primary-light border border-action-primary rounded-lg p-4">
        <h3 className="text-sm font-semibold text-action-primary mb-2">Reconciliation System - Matching Excel Summary Sheet</h3>
        <ul className="text-sm text-action-primary space-y-1">
          <li>• <strong>Total Expected Revenue</strong> = Sum of all product revenues (Petrol, Diesel, LPG, Lubricants, Accessories)</li>
          <li>• <strong>Credit Sales</strong> = Total sales made on credit to institutional/corporate accounts</li>
          <li>• <strong>Expected Cash</strong> = Total Expected Revenue - Credit Sales</li>
          <li>• <strong>Difference</strong> = Actual Deposited - Expected Cash</li>
          <li>• <strong>Positive Difference</strong> = Overage (excess cash found)</li>
          <li>• <strong>Negative Difference</strong> = Shortage (cash missing)</li>
          <li>• <strong>Cumulative Difference</strong> = Running total of all variances for loss/gain tracking</li>
        </ul>
      </div>
    </div>
  )
}

// --- Reconciliation hub: one page, three tabs (Shift / Three-Way / Tank Analysis).
// The three views remain their own components; this just surfaces them as tabs so
// the menu carries a single "Reconciliation" item. Each view reads its own query
// params (date / shiftId), preserved across tab switches.
const RECON_TABS: { key: string; label: string }[] = [
  { key: 'shift', label: 'Shift Reconciliation' },
  { key: 'three-way', label: 'Three-Way' },
  { key: 'tank-analysis', label: 'Tank Analysis' },
]

export default function ReconciliationHub() {
  const router = useRouter()
  const q = router.query.tab
  const active = (typeof q === 'string' && RECON_TABS.some(t => t.key === q)) ? q : 'shift'

  const setTab = (key: string) => {
    router.replace(
      { pathname: '/shift-reconciliation', query: { ...router.query, tab: key } },
      undefined,
      { shallow: true },
    )
  }

  return (
    <div>
      <div className="bg-surface-card border-b border-surface-border px-4">
        <div className="max-w-7xl mx-auto flex gap-1">
          {RECON_TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="px-4 py-3 text-sm font-medium border-b-2 transition-colors"
              style={{
                borderColor: active === t.key ? 'var(--color-action-primary)' : 'transparent',
                color: active === t.key ? 'var(--color-action-primary)' : 'var(--color-content-secondary)',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      {active === 'shift' && <ShiftReconciliationView />}
      {active === 'three-way' && <ThreeWayReconciliation />}
      {active === 'tank-analysis' && <TankAnalysis />}
    </div>
  )
}
