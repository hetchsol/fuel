import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { getHeaders } from '../lib/api'

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
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [dailySummary, setDailySummary] = useState<any>(null)
  const [selectedReading, setSelectedReading] = useState<ReconciliationData | null>(null)
  const [selectedShiftId, setSelectedShiftId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Accept date query parameter
  useEffect(() => {
    if (router.query.date && typeof router.query.date === 'string') {
      setSelectedDate(router.query.date)
    }
  }, [router.query.date])

  useEffect(() => {
    fetchDailySummary()
  }, [selectedDate])

  const fetchDailySummary = async () => {
    setLoading(true)
    try {
      const response = await fetch(`${BASE}/reconciliation/three-way/daily-summary/${selectedDate}`, {
        headers: getHeaders()
      })
      if (response.ok) {
        const data = await response.json()
        setDailySummary(data)
      } else {
        setDailySummary(null)
      }
    } catch (err) {
      console.error('Error fetching daily summary:', err)
    } finally {
      setLoading(false)
    }
  }

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
      case 'DISCREPANCY_CRITICAL': return '🚨'
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

  return (
    <div className="min-h-screen bg-surface-bg p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-content-primary mb-2">Three-Way Reconciliation</h1>
          <p className="text-content-secondary">Tank Movement = Nozzle Sales = Cash in Hand</p>
        </div>

        {/* Date Selector */}
        <div className="bg-surface-card rounded-lg shadow p-4 mb-6">
          <label className="block text-sm font-medium text-content-secondary mb-2">
            Select Date
          </label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="border border-surface-border rounded px-3 py-2"
          />
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-content-primary"></div>
            <p className="mt-2 text-content-secondary">Loading...</p>
          </div>
        ) : dailySummary ? (
          <>
            {/* Daily Summary Card */}
            <div className="bg-surface-card rounded-lg shadow mb-6">
              <div className="bg-gradient-to-r from-blue-600 to-action-primary-hover px-6 py-4">
                <h2 className="text-xl font-bold text-white">Daily Summary - {dailySummary.date}</h2>
              </div>

              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
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
                    <div className="text-sm text-status-error mb-1">🚨 Critical</div>
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
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-action-primary-light rounded p-3">
                        <div className="text-xs text-action-primary font-medium mb-1">PHYSICAL (Tank)</div>
                        <div className="text-lg font-bold text-action-primary">
                          {shift.reconciliation.sources.physical.tank_movement_liters?.toLocaleString()} L
                        </div>
                        <div className="text-xs text-action-primary">
                          {shift.reconciliation.sources.physical.expected_cash?.toLocaleString()} cash
                        </div>
                      </div>

                      <div className="bg-category-a-light rounded p-3">
                        <div className="text-xs text-category-a font-medium mb-1">OPERATIONAL (Nozzle)</div>
                        <div className="text-lg font-bold text-category-a">
                          {shift.reconciliation.sources.operational.nozzle_sales_liters?.toLocaleString()} L
                        </div>
                        <div className="text-xs text-category-a">
                          {shift.reconciliation.sources.operational.expected_cash?.toLocaleString()} cash
                        </div>
                      </div>

                      <div className="bg-status-success-light rounded p-3">
                        <div className="text-xs text-status-success font-medium mb-1">FINANCIAL (Cash)</div>
                        <div className="text-lg font-bold text-status-success">
                          {shift.reconciliation.sources.financial.equivalent_liters?.toLocaleString()} L
                        </div>
                        <div className="text-xs text-status-success">
                          {shift.reconciliation.sources.financial.actual_cash?.toLocaleString()} cash
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="bg-surface-card rounded-lg shadow p-12 text-center">
            <p className="text-content-secondary text-lg">No data for {selectedDate}</p>
          </div>
        )}

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
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

                {/* Cross-link to Tank Analysis */}
                {selectedShiftId && (
                  <div className="mt-6 pt-4 border-t border-surface-border">
                    <Link
                      href={`/tank-analysis?shiftId=${selectedShiftId}`}
                      className="inline-flex items-center px-4 py-2 bg-action-primary text-white rounded-lg hover:bg-action-primary-hover font-medium text-sm"
                    >
                      View Full Tank Analysis &rarr;
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
