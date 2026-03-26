import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getHeaders } from '../lib/api'

const BASE = '/api/v1'

interface ShiftRow {
  shift_id: string
  date: string
  shift_type: string
  // Financial (from reconciliations_data)
  financial?: {
    total_expected: number
    expected_cash: number
    actual_deposited: number
    difference: number
    petrol_revenue: number
    diesel_revenue: number
  }
  // Tank analysis
  tankAnalysis?: {
    summary: {
      total_tanks_reconciled: number
      critical_variances: number
      warnings: number
      acceptable: number
    }
    tank_reconciliations: any[]
  }
  // Three-way (from daily summary)
  threeWay?: {
    status: string
    tank_id: string
    reading_id: string
  }[]
}

export default function ReconciliationDashboard() {
  const today = new Date().toISOString().split('T')[0]
  const [selectedDate, setSelectedDate] = useState(today)
  const [shifts, setShifts] = useState<ShiftRow[]>([])
  const [loading, setLoading] = useState(false)
  const [expandedShift, setExpandedShift] = useState<string | null>(null)
  const [tankDetail, setTankDetail] = useState<any>(null)
  const [tankDetailLoading, setTankDetailLoading] = useState(false)

  // Summary counts
  const [summary, setSummary] = useState({
    totalShifts: 0,
    balanced: 0,
    warnings: 0,
    critical: 0,
  })

  useEffect(() => {
    loadDashboard()
  }, [selectedDate])

  const loadDashboard = async () => {
    setLoading(true)
    setExpandedShift(null)
    setTankDetail(null)

    try {
      // Fetch all data sources in parallel
      const [financialRes, threeWayRes, shiftsRes] = await Promise.all([
        fetch(`${BASE}/reconciliation/date/${selectedDate}`, { headers: getHeaders() }).then(r => r.ok ? r.json() : []).catch(() => []),
        fetch(`${BASE}/reconciliation/three-way/daily-summary/${selectedDate}`, { headers: getHeaders() }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${BASE}/shifts/`, { headers: getHeaders() }).then(r => r.ok ? r.json() : []).catch(() => []),
      ])

      // Build shift map from shifts API for this date
      const dateShifts = shiftsRes.filter((s: any) => s.date === selectedDate)

      // Index financial data by shift_id
      const financialMap: Record<string, any> = {}
      for (const f of financialRes) {
        financialMap[f.shift_id] = f
      }

      // Index three-way data by tank+shift
      const threeWayMap: Record<string, any[]> = {}
      if (threeWayRes?.all_shifts) {
        for (const tw of threeWayRes.all_shifts) {
          const shiftType = tw.shift_type || 'Day'
          // Group by shift_type since three-way doesn't have shift_id
          if (!threeWayMap[shiftType]) threeWayMap[shiftType] = []
          threeWayMap[shiftType].push({
            status: tw.reconciliation?.status || 'UNKNOWN',
            tank_id: tw.tank_id,
            reading_id: tw.reading_id,
          })
        }
      }

      // Build rows
      const rows: ShiftRow[] = dateShifts.map((s: any) => ({
        shift_id: s.shift_id,
        date: s.date,
        shift_type: s.shift_type,
        financial: financialMap[s.shift_id] ? {
          total_expected: financialMap[s.shift_id].total_expected,
          expected_cash: financialMap[s.shift_id].expected_cash,
          actual_deposited: financialMap[s.shift_id].actual_deposited,
          difference: financialMap[s.shift_id].difference,
          petrol_revenue: financialMap[s.shift_id].petrol_revenue,
          diesel_revenue: financialMap[s.shift_id].diesel_revenue,
        } : undefined,
        threeWay: threeWayMap[s.shift_type] || [],
      }))

      // If financial data exists for shifts not in the shifts list (e.g. shift_id format mismatch), add them
      for (const f of financialRes) {
        if (!rows.find(r => r.shift_id === f.shift_id)) {
          rows.push({
            shift_id: f.shift_id,
            date: f.date,
            shift_type: f.shift_type,
            financial: {
              total_expected: f.total_expected,
              expected_cash: f.expected_cash,
              actual_deposited: f.actual_deposited,
              difference: f.difference,
              petrol_revenue: f.petrol_revenue,
              diesel_revenue: f.diesel_revenue,
            },
            threeWay: threeWayMap[f.shift_type] || [],
          })
        }
      }

      setShifts(rows)

      // Compute summary
      let balanced = 0, warnings = 0, critical = 0
      for (const row of rows) {
        const diff = row.financial?.difference
        if (diff !== undefined && diff !== null) {
          const pct = row.financial!.expected_cash > 0 ? Math.abs(diff / row.financial!.expected_cash * 100) : 0
          if (pct < 0.5) balanced++
          else if (pct < 2) warnings++
          else critical++
        }
        // Count three-way critical
        for (const tw of (row.threeWay || [])) {
          if (tw.status === 'DISCREPANCY_CRITICAL') critical++
        }
      }
      // Also count three-way summary
      if (threeWayRes) {
        critical = Math.max(critical, threeWayRes.critical_shifts || 0)
      }

      setSummary({
        totalShifts: rows.length,
        balanced,
        warnings,
        critical,
      })

    } catch (err) {
      console.error('Dashboard load error:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadTankAnalysis = async (shiftId: string) => {
    if (expandedShift === shiftId) {
      setExpandedShift(null)
      setTankDetail(null)
      return
    }
    setExpandedShift(shiftId)
    setTankDetailLoading(true)
    try {
      const res = await fetch(`${BASE}/reconciliation/shift/${shiftId}/tank-analysis`, { headers: getHeaders() })
      if (res.ok) {
        const data = await res.json()
        setTankDetail(data)
      } else {
        setTankDetail(null)
      }
    } catch {
      setTankDetail(null)
    } finally {
      setTankDetailLoading(false)
    }
  }

  const formatCurrency = (amount: number) =>
    `ZMW ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'BALANCED': return 'bg-status-success-light text-status-success border-status-success'
      case 'VARIANCE_MINOR': return 'bg-status-pending-light text-status-warning border-status-warning'
      case 'VARIANCE_INVESTIGATION': return 'bg-category-c-light text-category-c border-category-c-border'
      case 'DISCREPANCY_CRITICAL': return 'bg-status-error-light text-status-error border-status-error'
      default: return 'bg-surface-bg text-content-secondary border-surface-border'
    }
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-content-primary">Reconciliation Dashboard</h1>
        <p className="mt-2 text-sm text-content-secondary">
          Unified view of financial, tank, and three-way reconciliation for a selected date
        </p>
      </div>

      {/* Date Picker */}
      <div className="bg-surface-card rounded-lg shadow p-4 mb-6">
        <div className="flex items-center gap-4">
          <div>
            <label className="block text-sm font-medium text-content-secondary mb-1">Select Date</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-4 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-action-primary focus:border-action-primary"
            />
          </div>
          <button
            onClick={loadDashboard}
            disabled={loading}
            className="mt-5 px-6 py-2 bg-action-primary text-white font-semibold rounded-md hover:bg-action-primary-hover disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Daily Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-surface-card rounded-lg shadow p-4 border-l-4 border-action-primary">
          <p className="text-xs text-content-secondary font-medium">Total Shifts</p>
          <p className="text-3xl font-bold text-action-primary">{summary.totalShifts}</p>
        </div>
        <div className="bg-surface-card rounded-lg shadow p-4 border-l-4 border-status-success">
          <p className="text-xs text-content-secondary font-medium">Balanced</p>
          <p className="text-3xl font-bold text-status-success">{summary.balanced}</p>
        </div>
        <div className="bg-surface-card rounded-lg shadow p-4 border-l-4 border-status-warning">
          <p className="text-xs text-content-secondary font-medium">Warnings</p>
          <p className="text-3xl font-bold text-status-warning">{summary.warnings}</p>
        </div>
        <div className="bg-surface-card rounded-lg shadow p-4 border-l-4 border-status-error">
          <p className="text-xs text-content-secondary font-medium">Critical</p>
          <p className="text-3xl font-bold text-status-error">{summary.critical}</p>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="bg-action-primary-light border border-action-primary rounded-lg p-6 text-center">
          <p className="text-action-primary">Loading dashboard data...</p>
        </div>
      )}

      {/* No Data */}
      {!loading && shifts.length === 0 && (
        <div className="bg-surface-bg border border-surface-border rounded-lg p-12 text-center">
          <p className="text-content-secondary text-lg">No shift data found for {selectedDate}</p>
          <p className="text-sm text-content-secondary mt-2">Reconciliation data appears after attendant handovers are submitted.</p>
        </div>
      )}

      {/* Shifts Table */}
      {!loading && shifts.length > 0 && (
        <div className="bg-surface-card rounded-lg shadow overflow-hidden">
          <div className="bg-surface-bg px-6 py-4 border-b">
            <h2 className="text-lg font-semibold text-content-primary">Shifts - {selectedDate}</h2>
          </div>

          <div className="divide-y">
            {shifts.map((row) => {
              const diff = row.financial?.difference
              const diffPct = (row.financial && row.financial.expected_cash > 0)
                ? (diff! / row.financial.expected_cash * 100)
                : 0
              const diffStatus = diff === undefined || diff === null ? 'unknown' :
                Math.abs(diffPct) < 0.5 ? 'balanced' :
                Math.abs(diffPct) < 2 ? 'warning' : 'critical'

              return (
                <div key={row.shift_id}>
                  {/* Shift Row */}
                  <div
                    className="p-4 hover:bg-surface-bg cursor-pointer transition-colors"
                    onClick={() => loadTankAnalysis(row.shift_id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div>
                          <span className="text-lg font-semibold text-content-primary">
                            {row.shift_type === 'Day' ? '☀️' : '🌙'} {row.shift_type} Shift
                          </span>
                          <p className="text-xs text-content-secondary">{row.shift_id}</p>
                        </div>

                        {/* Financial Status */}
                        {row.financial ? (
                          <div className="flex items-center gap-3">
                            <div className="text-sm">
                              <span className="text-content-secondary">Expected: </span>
                              <span className="font-semibold">{formatCurrency(row.financial.expected_cash)}</span>
                            </div>
                            <div className="text-sm">
                              <span className="text-content-secondary">Actual: </span>
                              <span className="font-semibold">{formatCurrency(row.financial.actual_deposited || 0)}</span>
                            </div>
                            <span className={`px-3 py-1 rounded-full text-xs font-bold border ${
                              diffStatus === 'balanced' ? 'bg-status-success-light text-status-success border-status-success' :
                              diffStatus === 'warning' ? 'bg-status-pending-light text-status-warning border-status-warning' :
                              diffStatus === 'critical' ? 'bg-status-error-light text-status-error border-status-error' :
                              'bg-surface-bg text-content-secondary border-surface-border'
                            }`}>
                              {diff !== undefined && diff !== null ? (
                                `${diff > 0 ? '+' : ''}${formatCurrency(diff)} (${diffPct.toFixed(1)}%)`
                              ) : 'No deposit'}
                            </span>
                          </div>
                        ) : (
                          <span className="text-sm text-content-secondary italic">No financial data</span>
                        )}
                      </div>

                      {/* Three-Way Badges */}
                      <div className="flex items-center gap-2">
                        {(row.threeWay || []).map((tw, idx) => (
                          <span
                            key={idx}
                            className={`px-2 py-1 rounded text-xs font-medium border ${getStatusBadge(tw.status)}`}
                            title={`${tw.tank_id}: ${tw.status}`}
                          >
                            {tw.tank_id}
                          </span>
                        ))}
                        <span className="text-content-secondary text-sm ml-2">
                          {expandedShift === row.shift_id ? '▲' : '▼'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Expanded Tank Detail */}
                  {expandedShift === row.shift_id && (
                    <div className="bg-surface-bg px-6 py-4 border-t border-surface-border">
                      {tankDetailLoading ? (
                        <p className="text-center text-content-secondary py-4">Loading tank analysis...</p>
                      ) : tankDetail ? (
                        <div>
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="font-semibold text-content-primary">Tank Analysis</h3>
                            <div className="flex gap-2">
                              <Link
                                href={`/tank-analysis?shiftId=${row.shift_id}`}
                                className="text-xs px-3 py-1 border border-action-primary text-action-primary rounded hover:bg-action-primary-light"
                              >
                                Full Tank Analysis
                              </Link>
                              <Link
                                href={`/reconciliation?date=${selectedDate}`}
                                className="text-xs px-3 py-1 border border-action-primary text-action-primary rounded hover:bg-action-primary-light"
                              >
                                Shift Reconciliation
                              </Link>
                              <Link
                                href={`/three-way-reconciliation?date=${selectedDate}`}
                                className="text-xs px-3 py-1 border border-action-primary text-action-primary rounded hover:bg-action-primary-light"
                              >
                                Three-Way Recon
                              </Link>
                            </div>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {tankDetail.tank_reconciliations.map((tank: any) => (
                              <div
                                key={tank.tank_id}
                                className={`rounded-lg p-4 border-2 ${
                                  tank.status === 'acceptable' ? 'bg-status-success-light border-status-success' :
                                  tank.status === 'warning' ? 'bg-status-pending-light border-status-warning' :
                                  'bg-status-error-light border-status-error'
                                }`}
                              >
                                <div className="flex items-center justify-between mb-2">
                                  <span className="font-bold text-content-primary">{tank.tank_id}</span>
                                  <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${
                                    tank.status === 'acceptable' ? 'text-status-success' :
                                    tank.status === 'warning' ? 'text-status-warning' : 'text-status-error'
                                  }`}>
                                    {tank.status}
                                  </span>
                                </div>
                                <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium mb-2 ${
                                  tank.fuel_type === 'Diesel'
                                    ? 'bg-fuel-diesel-light text-fuel-diesel'
                                    : 'bg-fuel-petrol-light text-fuel-petrol'
                                }`}>
                                  {tank.fuel_type}
                                </span>
                                <div className="text-sm space-y-1">
                                  <div className="flex justify-between">
                                    <span className="text-content-secondary">Movement:</span>
                                    <span className="font-semibold">{tank.tank_movement?.toFixed(1)} L</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-content-secondary">Electronic:</span>
                                    <span className="font-semibold">{tank.total_electronic_sales?.toFixed(1)} L</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-content-secondary">Variance:</span>
                                    <span className="font-bold">
                                      {tank.electronic_vs_tank_discrepancy?.toFixed(1)} L ({tank.electronic_discrepancy_percent?.toFixed(1)}%)
                                    </span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                          {tankDetail.tank_reconciliations.length === 0 && (
                            <p className="text-sm text-content-secondary text-center py-4">
                              No tank dip readings recorded for this shift.
                            </p>
                          )}
                        </div>
                      ) : (
                        <p className="text-sm text-content-secondary text-center py-4">
                          No tank analysis data available. Record tank dip readings via Operations &gt; Daily Tank Readings.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Quick Links */}
      <div className="mt-6 bg-surface-card rounded-lg shadow p-4 flex gap-4 flex-wrap items-center">
        <span className="text-sm font-medium text-content-secondary">Detailed Views:</span>
        <Link
          href={`/three-way-reconciliation?date=${selectedDate}`}
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
        <Link
          href={`/reconciliation?date=${selectedDate}`}
          className="inline-flex items-center px-4 py-2 border border-action-primary text-action-primary rounded-lg hover:bg-action-primary-light font-medium text-sm"
        >
          Shift Reconciliation
        </Link>
      </div>
    </div>
  )
}
