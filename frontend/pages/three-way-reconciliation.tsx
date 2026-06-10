import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { getHeaders, authFetch } from '../lib/api'
import ExportButtons from '../components/ExportButtons'
import { ExportConfig } from '../lib/exportUtils'

const BASE = '/api/v1'

interface ReconciliationSource {
  tank_movement_liters?: number
  nozzle_sales_liters?: number
  expected_cash: number
  actual_cash?: number
  equivalent_liters?: number
}

interface Variance {
  variance_liters: number
  variance_cash: number
  variance_percent: number
  status: string
}

interface RootCause {
  outlier_source: string | null
  confidence: string
  likely_causes: string[]
}

interface ReconciliationData {
  status: string
  sources: {
    physical: ReconciliationSource
    operational: ReconciliationSource
    financial: ReconciliationSource
  }
  variances: {
    tank_vs_nozzle: Variance
    tank_vs_cash?: Variance
    nozzle_vs_cash?: Variance
  }
  root_cause_analysis: RootCause
  recommendations: string[]
  reading_metadata?: {
    reading_id: string
    tank_id: string
    date: string
    shift_type: string
    recorded_by: string
  }
}

export default function ThreeWayReconciliation() {
  const router = useRouter()
  const today = new Date().toISOString().split('T')[0]

  const [mode, setMode] = useState<'shift' | 'range'>('range')
  const [shifts, setShifts] = useState<any[]>([])
  const [selectedShift, setSelectedShift] = useState('')
  const [selectedDate, setSelectedDate] = useState(today)
  const [startDate, setStartDate] = useState(today)
  const [endDate, setEndDate] = useState(today)
  const [rangeData, setRangeData] = useState<any[]>([])

  const [dailySummary, setDailySummary] = useState<any>(null)
  const [selectedReading, setSelectedReading] = useState<ReconciliationData | null>(null)
  const [selectedShiftId, setSelectedShiftId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [varianceTrends, setVarianceTrends] = useState<Record<string, any>>({})

  // Accept date query parameter
  useEffect(() => {
    if (router.query.date && typeof router.query.date === 'string') {
      const d = router.query.date
      setSelectedDate(d); setStartDate(d); setEndDate(d)
    }
  }, [router.query.date])

  useEffect(() => {
    authFetch(`${BASE}/shifts/`, { headers: getHeaders() })
      .then(res => res.ok ? res.json() : [])
      .then(data => setShifts(data.slice(0, 30)))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (mode === 'range') fetchDailySummary(selectedDate)
  }, [selectedDate])

  const fetchDailySummary = async (date: string) => {
    setLoading(true)
    try {
      const response = await authFetch(`${BASE}/reconciliation/three-way/daily-summary/${date}`, {
        headers: getHeaders()
      })
      if (response.ok) {
        const data = await response.json()
        setDailySummary(data)
        if (data.all_shifts) {
          const tankIds = Array.from(new Set(data.all_shifts.map((s: any) => s.tank_id))) as string[]
          const trends: Record<string, any> = {}
          await Promise.all(tankIds.map(async (tankId) => {
            try {
              const tRes = await authFetch(`${BASE}/reconciliation/three-way/patterns/${tankId}?days=30`, { headers: getHeaders() })
              if (tRes.ok) trends[tankId] = await tRes.json()
            } catch {}
          }))
          setVarianceTrends(trends)
        }
      } else {
        setDailySummary(null)
        setVarianceTrends({})
      }
    } catch (err) {
      console.error('Error fetching daily summary:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleShiftSelect = (shiftId: string) => {
    setSelectedShift(shiftId)
    const shift = shifts.find(s => s.shift_id === shiftId)
    if (shift?.date) {
      setSelectedDate(shift.date)
      fetchDailySummary(shift.date)
    }
  }

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

  const fetchRange = async () => {
    setLoading(true)
    try {
      const dates = genDates(startDate, endDate)
      const results = await Promise.all(
        dates.map(d => authFetch(`${BASE}/reconciliation/three-way/daily-summary/${d}`, { headers: getHeaders() })
          .then(r => r.ok ? r.json() : null).catch(() => null))
      )
      setRangeData(results.filter(Boolean))
      setDailySummary(null)
    } catch {}
    finally { setLoading(false) }
  }

  const isMultiDay = startDate !== endDate

  const viewDetails = (reading: any) => {
    setSelectedReading(reading.reconciliation)
    setSelectedShiftId(reading.shift_id || null)
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'BALANCED': return 'bg-status-success-light text-status-success border-status-success'
      case 'VARIANCE_MINOR': return 'bg-status-pending-light text-status-warning border-status-warning'
      case 'VARIANCE_INVESTIGATION': return 'bg-category-c-light text-category-c border-category-c-border'
      case 'DISCREPANCY_CRITICAL': return 'bg-status-error-light text-status-error border-status-error'
      default: return 'bg-surface-bg text-content-primary border-surface-border'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'BALANCED': return '✓'
      case 'VARIANCE_MINOR': return '⚠'
      case 'VARIANCE_INVESTIGATION': return '⚠⚠'
      case 'DISCREPANCY_CRITICAL': return '!!'
      default: return '?'
    }
  }

  const getVarianceStatusColor = (status: string) => {
    switch (status) {
      case 'WITHIN_TOLERANCE': return 'text-status-success'
      case 'REQUIRES_INVESTIGATION': return 'text-category-c'
      case 'CRITICAL': return 'text-status-error'
      default: return 'text-content-secondary'
    }
  }

  const getOutlierColor = (source: string | null) => {
    switch (source) {
      case 'PHYSICAL': return 'bg-action-primary-light text-action-primary border border-blue-300'
      case 'OPERATIONAL': return 'bg-category-a-light text-category-a border border-category-a-border'
      case 'FINANCIAL': return 'bg-status-error-light text-status-error border border-red-300'
      case 'MULTIPLE': return 'bg-surface-bg text-content-primary border border-surface-border'
      default: return 'bg-green-100 text-status-success border border-green-300'
    }
  }

  const getExportConfig = useCallback((): ExportConfig | null => {
    if (!dailySummary?.all_shifts) return null
    return {
      title: 'Three-Way Reconciliation',
      subtitle: `Date: ${dailySummary.date} — Status: ${dailySummary.overall_status}`,
      filename: `three_way_recon_${dailySummary.date}`,
      summaryCards: [
        { label: 'Total Shifts', value: dailySummary.total_shifts },
        { label: 'Balanced', value: dailySummary.balanced_shifts },
        { label: 'Variances', value: dailySummary.variance_shifts },
        { label: 'Critical', value: dailySummary.critical_shifts },
        { label: 'Status', value: dailySummary.overall_status },
      ],
      columns: [
        { header: 'Shift', key: 'shift_type' },
        { header: 'Status', key: 'status' },
        { header: 'Tank Movement (L)', key: 'tank_movement', format: 'number' },
        { header: 'Nozzle Sales (L)', key: 'nozzle_sales', format: 'number' },
        { header: 'Tank vs Nozzle %', key: 'tank_nozzle_var', format: 'percent' },
        { header: 'Expected Cash', key: 'expected_cash', format: 'currency' },
        { header: 'Actual Cash', key: 'actual_cash', format: 'currency' },
        { header: 'Cash Variance', key: 'cash_variance', format: 'currency' },
      ],
      data: dailySummary.all_shifts.map((s: any) => ({
        shift_type: s.shift_type || s.shift_id,
        status: s.status || s.reconciliation_status || '',
        tank_movement: s.physical?.tank_movement_liters || s.tank_movement_liters || 0,
        nozzle_sales: s.operational?.nozzle_sales_liters || s.nozzle_sales_liters || 0,
        tank_nozzle_var: s.variances?.tank_vs_nozzle_percent || s.tank_vs_nozzle_percent || 0,
        expected_cash: s.financial?.expected_cash || s.expected_cash || 0,
        actual_cash: s.financial?.actual_cash || s.actual_cash || 0,
        cash_variance: s.financial?.cash_variance || s.cash_variance || 0,
      })),
    }
  }, [dailySummary])

  return (
    <div className="min-h-screen bg-surface-bg p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h1 className="text-3xl font-bold text-content-primary mb-2">Three-Way Reconciliation</h1>
              <p className="text-content-secondary">Tank Movement = Nozzle Sales = Cash in Hand</p>
            </div>
            {dailySummary && <ExportButtons getConfig={getExportConfig} />}
          </div>
        </div>

        {/* Selection controls */}
        <div className="bg-surface-card rounded-lg shadow p-4 mb-6 space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            {/* Mode toggle */}
            <div>
              <label className="block text-xs font-medium text-content-secondary mb-1 uppercase tracking-wide">Mode</label>
              <div className="flex rounded-md border border-surface-border overflow-hidden">
                {(['shift', 'range'] as const).map(m => (
                  <button key={m} onClick={() => { setMode(m); setDailySummary(null); setRangeData([]) }}
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
                <select value={selectedShift} onChange={e => handleShiftSelect(e.target.value)}
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
                {isMultiDay ? (
                  <button onClick={fetchRange} disabled={loading}
                    className="px-5 py-2 rounded-md text-sm font-medium text-white disabled:opacity-50"
                    style={{ backgroundColor: 'var(--color-action-primary)' }}>
                    {loading ? 'Loading...' : 'Load'}
                  </button>
                ) : (
                  <button onClick={() => { setSelectedDate(startDate); fetchDailySummary(startDate) }} disabled={loading}
                    className="px-5 py-2 rounded-md text-sm font-medium text-white disabled:opacity-50"
                    style={{ backgroundColor: 'var(--color-action-primary)' }}>
                    {loading ? 'Loading...' : 'Load'}
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Multi-day range summary table */}
        {!loading && isMultiDay && rangeData.length > 0 && (
          <div className="bg-surface-card rounded-lg shadow overflow-hidden mb-6">
            <div className="px-6 py-4 border-b border-surface-border">
              <h2 className="text-lg font-bold text-content-primary">{startDate} to {endDate}</h2>
              <p className="text-xs text-content-secondary mt-1">{rangeData.length} day(s) with data</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-border bg-surface-bg">
                    {['Date', 'Shifts', 'Balanced', 'Variances', 'Critical', 'Overall Status'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase text-content-secondary whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rangeData.map((day: any, i: number) => {
                    const statusColor = day.overall_status === 'EXCELLENT' ? 'text-status-success bg-status-success-light' :
                      day.overall_status === 'GOOD' ? 'text-action-primary bg-action-primary-light' :
                      day.overall_status === 'NEEDS_ATTENTION' ? 'text-status-warning bg-status-pending-light' :
                      'text-status-error bg-status-error-light'
                    return (
                      <tr key={i} className="border-b border-surface-border hover:bg-surface-bg transition-colors">
                        <td className="px-4 py-3 font-medium">
                          <button onClick={() => { setSelectedDate(day.date); fetchDailySummary(day.date); setRangeData([]) }}
                            className="text-action-primary hover:underline">{day.date}</button>
                        </td>
                        <td className="px-4 py-3">{day.total_shifts}</td>
                        <td className="px-4 py-3 text-status-success font-semibold">{day.balanced_shifts}</td>
                        <td className="px-4 py-3 text-status-warning font-semibold">{day.variance_shifts}</td>
                        <td className="px-4 py-3 text-status-error font-semibold">{day.critical_shifts}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded text-xs font-semibold ${statusColor}`}>{day.overall_status}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!loading && isMultiDay && rangeData.length === 0 && mode === 'range' && startDate && endDate && (
          <div className="bg-surface-card rounded-lg shadow p-12 text-center">
            <p className="text-content-secondary text-sm">No data found for {startDate} to {endDate}. Click Load to fetch.</p>
          </div>
        )}

        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-content-primary"></div>
            <p className="mt-2 text-content-secondary">Loading...</p>
          </div>
        ) : (!isMultiDay || mode === 'shift') && dailySummary ? (
          <>
            {/* Daily Summary Card */}
            <div className="bg-surface-card rounded-lg shadow mb-6">
              <div className="bg-gradient-to-r from-blue-600 to-action-primary-hover px-6 py-4">
                <h2 className="text-xl font-bold text-white">Daily Summary - {dailySummary.date}</h2>
              </div>

              <div className="p-6">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                  <div className="bg-surface-bg rounded-lg p-4">
                    <div className="text-sm text-content-secondary mb-1">Total Shifts</div>
                    <div className="text-2xl font-bold text-content-primary">{dailySummary.total_shifts}</div>
                  </div>

                  <div className="bg-status-success-light rounded-lg p-4">
                    <div className="text-sm text-status-success mb-1">✓ Balanced</div>
                    <div className="text-2xl font-bold text-status-success">{dailySummary.balanced_shifts}</div>
                  </div>

                  <div className="bg-category-c-light rounded-lg p-4">
                    <div className="text-sm text-category-c mb-1">⚠ Variances</div>
                    <div className="text-2xl font-bold text-category-c">{dailySummary.variance_shifts}</div>
                  </div>

                  <div className="bg-status-error-light rounded-lg p-4">
                    <div className="text-sm text-status-error mb-1">Critical</div>
                    <div className="text-2xl font-bold text-status-error">{dailySummary.critical_shifts}</div>
                  </div>
                </div>

                {/* Overall Status */}
                <div className="flex items-center gap-3 mb-6">
                  <span className="text-sm font-medium text-content-secondary">Overall Status:</span>
                  <span className={`px-4 py-2 rounded-full font-semibold ${
                    dailySummary.overall_status === 'EXCELLENT' ? 'bg-green-100 text-status-success' :
                    dailySummary.overall_status === 'GOOD' ? 'bg-action-primary-light text-action-primary' :
                    dailySummary.overall_status === 'NEEDS_ATTENTION' ? 'bg-orange-100 text-orange-800' :
                    'bg-status-error-light text-status-error'
                  }`}>
                    {dailySummary.overall_status}
                  </span>
                </div>

                {/* Shifts Requiring Investigation */}
                {dailySummary.shifts_requiring_investigation && dailySummary.shifts_requiring_investigation.length > 0 && (
                  <div className="bg-status-error-light border border-status-error rounded-lg p-4 mb-6">
                    <h3 className="font-semibold text-status-error mb-3">⚠ Shifts Requiring Investigation</h3>
                    <div className="space-y-2">
                      {dailySummary.shifts_requiring_investigation.map((shift: any, idx: number) => (
                        <div key={idx} className="bg-surface-card rounded p-3 flex items-center justify-between">
                          <div>
                            <span className="font-medium">{shift.tank_id}</span>
                            <span className="mx-2">-</span>
                            <span>{shift.shift_type}</span>
                            {shift.outlier_source && (
                              <>
                                <span className="mx-2">•</span>
                                <span className={`text-sm px-2 py-1 rounded ${getOutlierColor(shift.outlier_source)}`}>
                                  Outlier: {shift.outlier_source}
                                </span>
                              </>
                            )}
                          </div>
                          <span className={`px-3 py-1 rounded text-sm font-medium border ${getStatusColor(shift.status)}`}>
                            {shift.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Variance Trends */}
            {Object.keys(varianceTrends).length > 0 && (
              <div className="bg-surface-card rounded-lg shadow mb-6">
                <div className="bg-surface-bg px-6 py-4 border-b">
                  <h2 className="text-lg font-semibold text-content-primary">Variance Trends (30 days)</h2>
                </div>
                <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {Object.entries(varianceTrends).map(([tankId, trend]: [string, any]) => {
                    const direction = trend.trend_direction || 'stable'
                    const avgVariance = trend.average_variance_percent ?? 0
                    const trendColor = direction === 'improving' ? 'text-status-success' :
                      direction === 'worsening' ? 'text-status-error' : 'text-content-secondary'
                    const trendIcon = direction === 'improving' ? '↗' :
                      direction === 'worsening' ? '↘' : '→'
                    return (
                      <div key={tankId} className="bg-surface-bg rounded-lg p-4 border border-surface-border">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-semibold text-content-primary">{tankId}</span>
                          <span className={`text-lg font-bold ${trendColor}`}>
                            {trendIcon} {direction}
                          </span>
                        </div>
                        <div className="text-sm text-content-secondary">
                          <div>Avg variance: <strong>{avgVariance.toFixed(2)}%</strong></div>
                          <div>Readings: {trend.readings_analyzed || 0}</div>
                          {trend.dominant_outlier_source && (
                            <div>Frequent outlier: <strong>{trend.dominant_outlier_source}</strong></div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* All Shifts List */}
            <div className="bg-surface-card rounded-lg shadow">
              <div className="bg-surface-bg px-6 py-4 border-b">
                <h2 className="text-lg font-semibold text-content-primary">All Shifts</h2>
              </div>

              <div className="divide-y">
                {dailySummary.all_shifts && dailySummary.all_shifts.map((shift: any, idx: number) => (
                  <div key={idx} className="p-6 hover:bg-surface-bg transition-colors">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg font-semibold text-content-primary">{shift.tank_id}</h3>
                          <span className="text-content-secondary">•</span>
                          <span className="text-content-secondary">{shift.shift_type}</span>
                          <span className={`px-3 py-1 rounded-full text-sm font-medium border ${getStatusColor(shift.reconciliation.status)}`}>
                            {getStatusIcon(shift.reconciliation.status)} {shift.reconciliation.status}
                          </span>
                        </div>
                        <p className="text-sm text-content-secondary">Reading ID: {shift.reading_id}</p>
                      </div>
                      <button
                        onClick={() => viewDetails(shift)}
                        className="px-4 py-2 bg-action-primary text-white rounded-lg hover:bg-action-primary-hover"
                      >
                        View Details
                      </button>
                    </div>

                    {/* Three Sources Mini View */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="bg-action-primary-light rounded p-3">
                        <div className="text-xs text-action-primary font-medium mb-1">PHYSICAL (Tank)</div>
                        <div className="text-lg font-bold text-action-primary">
                          {shift.reconciliation.sources.physical.tank_movement_liters?.toLocaleString()} L
                        </div>
                        <div className="text-xs font-mono text-action-primary">
                          ZMW {shift.reconciliation.sources.physical.expected_cash?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </div>
                      </div>

                      <div className="bg-category-a-light rounded p-3">
                        <div className="text-xs text-category-a font-medium mb-1">OPERATIONAL (Nozzle)</div>
                        <div className="text-lg font-bold text-category-a">
                          {shift.reconciliation.sources.operational.nozzle_sales_liters?.toLocaleString()} L
                        </div>
                        <div className="text-xs font-mono text-category-a">
                          ZMW {shift.reconciliation.sources.operational.expected_cash?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </div>
                      </div>

                      <div className="bg-status-success-light rounded p-3">
                        <div className="text-xs text-status-success font-medium mb-1">FINANCIAL (Cash)</div>
                        <div className="text-lg font-bold text-status-success">
                          {shift.reconciliation.sources.financial.equivalent_liters?.toLocaleString()} L
                        </div>
                        <div className="text-xs font-mono text-status-success">
                          ZMW {shift.reconciliation.sources.financial.actual_cash?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (!isMultiDay || mode === 'shift') ? (
          <div className="bg-surface-card rounded-lg shadow p-12 text-center">
            <p className="text-content-secondary text-lg">
              {mode === 'shift' ? 'Select a shift above to load data.' : `No data for ${selectedDate}.`}
            </p>
          </div>
        ) : null}

        {/* Details Modal */}
        {selectedReading && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50" onClick={() => setSelectedReading(null)}>
            <div className="bg-surface-card rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="sticky top-0 bg-surface-card border-b px-6 py-4 flex items-center justify-between">
                <h2 className="text-2xl font-bold text-content-primary">Details</h2>
                <button onClick={() => setSelectedReading(null)} className="text-content-secondary hover:text-content-secondary text-2xl">×</button>
              </div>

              <div className="p-6">
                {/* Status */}
                <div className={`rounded-lg p-4 mb-6 border-2 ${getStatusColor(selectedReading.status)}`}>
                  <div className="text-2xl font-bold">{getStatusIcon(selectedReading.status)} {selectedReading.status}</div>
                  {selectedReading.reading_metadata && (
                    <div className="text-sm mt-1 opacity-80">
                      {selectedReading.reading_metadata.tank_id} • {selectedReading.reading_metadata.shift_type} • {selectedReading.reading_metadata.date}
                    </div>
                  )}
                </div>

                {/* Three Sources */}
                <div className="mb-6">
                  <h3 className="text-lg font-semibold mb-4">Three Sources</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {/* Physical */}
                    <div className="bg-action-primary-light rounded-lg p-4 border border-action-primary">
                      <div className="text-sm font-semibold text-action-primary mb-3">PHYSICAL</div>
                      <div className="space-y-2">
                        <div>
                          <div className="text-xs text-action-primary">Tank Movement</div>
                          <div className="text-2xl font-bold text-action-primary">
                            {selectedReading.sources.physical.tank_movement_liters?.toLocaleString()} L
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-action-primary">Expected Cash</div>
                          <div className="text-lg font-semibold text-action-primary">
                            {selectedReading.sources.physical.expected_cash?.toLocaleString()}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Operational */}
                    <div className="bg-category-a-light rounded-lg p-4 border border-category-a-border">
                      <div className="text-sm font-semibold text-category-a mb-3">OPERATIONAL</div>
                      <div className="space-y-2">
                        <div>
                          <div className="text-xs text-category-a">Nozzle Sales</div>
                          <div className="text-2xl font-bold text-category-a">
                            {selectedReading.sources.operational.nozzle_sales_liters?.toLocaleString()} L
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-category-a">Expected Cash</div>
                          <div className="text-lg font-semibold text-category-a">
                            {selectedReading.sources.operational.expected_cash?.toLocaleString()}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Financial */}
                    <div className="bg-status-success-light rounded-lg p-4 border border-status-success">
                      <div className="text-sm font-semibold text-status-success mb-3">FINANCIAL</div>
                      <div className="space-y-2">
                        <div>
                          <div className="text-xs text-status-success">Cash Equivalent</div>
                          <div className="text-2xl font-bold text-status-success">
                            {selectedReading.sources.financial.equivalent_liters?.toLocaleString()} L
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-status-success">Actual Cash</div>
                          <div className="text-lg font-semibold text-status-success">
                            {selectedReading.sources.financial.actual_cash?.toLocaleString()}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Variances */}
                <div className="mb-6">
                  <h3 className="text-lg font-semibold mb-4">Variances</h3>
                  <div className="space-y-3">
                    <div className="bg-surface-bg rounded-lg p-4 border">
                      <div className="flex items-center justify-between mb-2">
                        <div className="font-medium">Tank vs Nozzle</div>
                        <span className={`px-3 py-1 rounded text-sm font-medium ${getVarianceStatusColor(selectedReading.variances.tank_vs_nozzle.status)}`}>
                          {selectedReading.variances.tank_vs_nozzle.status}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <div className="text-content-secondary">Liters</div>
                          <div className="font-semibold">{selectedReading.variances.tank_vs_nozzle.variance_liters.toLocaleString()}</div>
                        </div>
                        <div>
                          <div className="text-content-secondary">Cash</div>
                          <div className="font-semibold">{selectedReading.variances.tank_vs_nozzle.variance_cash.toLocaleString()}</div>
                        </div>
                        <div>
                          <div className="text-content-secondary">Percent</div>
                          <div className="font-semibold">{selectedReading.variances.tank_vs_nozzle.variance_percent.toFixed(2)}%</div>
                        </div>
                      </div>
                    </div>

                    {selectedReading.variances.tank_vs_cash && (
                      <div className="bg-surface-bg rounded-lg p-4 border">
                        <div className="flex items-center justify-between mb-2">
                          <div className="font-medium">Tank vs Cash</div>
                          <span className={`px-3 py-1 rounded text-sm font-medium ${getVarianceStatusColor(selectedReading.variances.tank_vs_cash.status)}`}>
                            {selectedReading.variances.tank_vs_cash.status}
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-4 text-sm">
                          <div>
                            <div className="text-content-secondary">Liters</div>
                            <div className="font-semibold">{selectedReading.variances.tank_vs_cash.variance_liters.toLocaleString()}</div>
                          </div>
                          <div>
                            <div className="text-content-secondary">Cash</div>
                            <div className="font-semibold">{selectedReading.variances.tank_vs_cash.variance_cash.toLocaleString()}</div>
                          </div>
                          <div>
                            <div className="text-content-secondary">Percent</div>
                            <div className="font-semibold">{selectedReading.variances.tank_vs_cash.variance_percent.toFixed(2)}%</div>
                          </div>
                        </div>
                      </div>
                    )}

                    {selectedReading.variances.nozzle_vs_cash && (
                      <div className="bg-surface-bg rounded-lg p-4 border">
                        <div className="flex items-center justify-between mb-2">
                          <div className="font-medium">Nozzle vs Cash</div>
                          <span className={`px-3 py-1 rounded text-sm font-medium ${getVarianceStatusColor(selectedReading.variances.nozzle_vs_cash.status)}`}>
                            {selectedReading.variances.nozzle_vs_cash.status}
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-4 text-sm">
                          <div>
                            <div className="text-content-secondary">Liters</div>
                            <div className="font-semibold">{selectedReading.variances.nozzle_vs_cash.variance_liters.toLocaleString()}</div>
                          </div>
                          <div>
                            <div className="text-content-secondary">Cash</div>
                            <div className="font-semibold">{selectedReading.variances.nozzle_vs_cash.variance_cash.toLocaleString()}</div>
                          </div>
                          <div>
                            <div className="text-content-secondary">Percent</div>
                            <div className="font-semibold">{selectedReading.variances.nozzle_vs_cash.variance_percent.toFixed(2)}%</div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Root Cause */}
                <div className="mb-6">
                  <h3 className="text-lg font-semibold mb-4">Root Cause</h3>
                  <div className="bg-surface-bg rounded-lg p-4 border">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-sm font-medium">Outlier:</span>
                      <span className={`px-4 py-2 rounded-full font-semibold ${getOutlierColor(selectedReading.root_cause_analysis.outlier_source)}`}>
                        {selectedReading.root_cause_analysis.outlier_source || 'NONE'}
                      </span>
                      <span className="text-sm">Confidence: {selectedReading.root_cause_analysis.confidence}</span>
                    </div>

                    <div className="mt-4">
                      <div className="text-sm font-medium mb-2">Likely Causes:</div>
                      <ul className="space-y-1">
                        {selectedReading.root_cause_analysis.likely_causes.map((cause, idx) => (
                          <li key={idx} className="text-sm flex items-start">
                            <span className="mr-2">•</span>
                            <span>{cause}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>

                {/* Recommendations */}
                <div>
                  <h3 className="text-lg font-semibold mb-4">Recommendations</h3>
                  <div className="bg-action-primary-light rounded-lg p-4 border border-action-primary">
                    <ul className="space-y-2">
                      {selectedReading.recommendations.map((rec, idx) => (
                        <li key={idx} className="text-sm flex items-start">
                          <span className="mr-2">→</span>
                          <span>{rec}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Cross-links to other reconciliation pages */}
                {selectedShiftId && (
                  <div className="mt-6 pt-4 border-t border-surface-border flex gap-3 flex-wrap">
                    <Link
                      href={`/tank-analysis?shiftId=${selectedShiftId}`}
                      className="inline-flex items-center px-4 py-2 bg-action-primary text-white rounded-lg hover:bg-action-primary-hover font-medium text-sm"
                    >
                      View Full Tank Analysis &rarr;
                    </Link>
                    <Link
                      href={`/shift-reconciliation?date=${selectedDate}`}
                      className="inline-flex items-center px-4 py-2 border border-action-primary text-action-primary rounded-lg hover:bg-action-primary-light font-medium text-sm"
                    >
                      View Shift Reconciliation &rarr;
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
