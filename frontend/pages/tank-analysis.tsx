import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { getHeaders, authFetch } from '../lib/api'
import ExportButtons from '../components/ExportButtons'
import { ExportConfig } from '../lib/exportUtils'
import { useTanks, tankLabel } from '../hooks/useTanks'

const BASE = '/api/v1'

interface TankReconciliation {
  tank_id: string
  fuel_type: string
  shift_id: string
  opening_dip_cm: number
  closing_dip_cm: number
  opening_volume_liters: number
  closing_volume_liters: number
  tank_movement: number
  total_electronic_sales: number
  total_mechanical_sales: number
  electronic_vs_tank_discrepancy: number
  mechanical_vs_tank_discrepancy: number
  electronic_discrepancy_percent: number
  mechanical_discrepancy_percent: number
  status: 'acceptable' | 'warning' | 'critical'
  message: string
  deliveries?: any[]
  delivery_timeline?: any
}

export default function TankAnalysis() {
  const router = useRouter()
  const { tanks: allTanks } = useTanks()
  const tankNameFor = (tankId: string) => {
    const t = allTanks.find(x => x.tank_id === tankId)
    return t ? tankLabel(t) : tankId
  }

  // ── Selection state ──
  const [selectedTank, setSelectedTank] = useState('')
  const [mode, setMode] = useState<'shift' | 'range'>('shift')

  // ── Shift mode ──
  const [shifts, setShifts] = useState<any[]>([])
  const [selectedShift, setSelectedShift] = useState('')
  const [reconciliation, setReconciliation] = useState<any>(null)

  // ── Date range mode ──
  const today = new Date().toISOString().split('T')[0]
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]
  const [startDate, setStartDate] = useState(sevenDaysAgo)
  const [endDate, setEndDate] = useState(today)
  const [rangeReadings, setRangeReadings] = useState<any[]>([])

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Pre-select first tank once list loads
  useEffect(() => {
    if (allTanks.length > 0 && !selectedTank) {
      setSelectedTank(allTanks[0].tank_id)
    }
  }, [allTanks, selectedTank])

  useEffect(() => {
    fetchRecentShifts()
  }, [])

  // Accept shiftId query param to pre-select a shift
  useEffect(() => {
    if (router.query.shiftId && typeof router.query.shiftId === 'string' && shifts.length > 0) {
      const shiftId = router.query.shiftId
      if (shifts.some(s => s.shift_id === shiftId)) {
        setSelectedShift(shiftId)
        fetchShiftAnalysis(shiftId)
      }
    }
  }, [router.query.shiftId, shifts])

  const fetchRecentShifts = async () => {
    try {
      const res = await authFetch(`${BASE}/shifts/`, { headers: getHeaders() })
      if (res.ok) {
        const data = await res.json()
        setShifts(data.slice(0, 30))
      }
    } catch {}
  }

  const fetchShiftAnalysis = async (shiftId: string) => {
    if (!shiftId) { setReconciliation(null); return }
    setLoading(true)
    setError('')
    try {
      const res = await authFetch(`${BASE}/reconciliation/shift/${shiftId}/tank-analysis`, { headers: getHeaders() })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || 'Failed to fetch reconciliation')
      }
      setReconciliation(await res.json())
    } catch (err: any) {
      setError(err.message || 'Failed to load reconciliation data')
      setReconciliation(null)
    } finally {
      setLoading(false)
    }
  }

  const fetchRangeReadings = async () => {
    if (!selectedTank || !startDate || !endDate) return
    setLoading(true)
    setError('')
    try {
      const res = await authFetch(
        `${BASE}/tank-readings/readings/${selectedTank}?start_date=${startDate}&end_date=${endDate}`,
        { headers: getHeaders() }
      )
      if (!res.ok) throw new Error('Failed to load readings')
      setRangeReadings(await res.json())
    } catch (err: any) {
      setError(err.message || 'Failed to load readings')
      setRangeReadings([])
    } finally {
      setLoading(false)
    }
  }

  // Auto-load when mode/tank/shift changes
  useEffect(() => {
    if (mode === 'shift' && selectedShift) fetchShiftAnalysis(selectedShift)
    if (mode === 'range' && selectedTank && startDate && endDate) fetchRangeReadings()
  }, [mode, selectedTank])

  const handleShiftSelect = (shiftId: string) => {
    setSelectedShift(shiftId)
    fetchShiftAnalysis(shiftId)
  }

  // For shift mode, filter results to selected tank (or show all if no tank selected)
  const visibleTankRecons: TankReconciliation[] = reconciliation?.tank_reconciliations
    ? (selectedTank
        ? reconciliation.tank_reconciliations.filter((t: TankReconciliation) => t.tank_id === selectedTank)
        : reconciliation.tank_reconciliations)
    : []

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'acceptable': return 'bg-status-success-light text-status-success border-status-success'
      case 'warning':    return 'bg-status-pending-light text-status-warning border-status-warning'
      case 'critical':   return 'bg-status-error-light text-status-error border-status-error'
      default:           return 'bg-surface-bg text-content-primary border-surface-border'
    }
  }

  const fmt = (n: number | null | undefined, dp = 2) =>
    n == null ? '-' : Number(n).toLocaleString('en-ZM', { minimumFractionDigits: dp, maximumFractionDigits: dp })

  const getExportConfig = useCallback((): ExportConfig | null => {
    if (mode === 'shift') {
      if (!visibleTankRecons.length) return null
      return {
        title: 'Tank Volume Movement Analysis',
        subtitle: `Shift: ${selectedShift}`,
        filename: `tank_analysis_${selectedShift.replace(/\s/g, '_')}`,
        columns: [
          { header: 'Tank', key: 'tank_id' },
          { header: 'Fuel Type', key: 'fuel_type' },
          { header: 'Opening Vol (L)', key: 'opening_volume_liters', format: 'number' },
          { header: 'Closing Vol (L)', key: 'closing_volume_liters', format: 'number' },
          { header: 'Tank Movement (L)', key: 'tank_movement', format: 'number' },
          { header: 'Electronic Sales (L)', key: 'total_electronic_sales', format: 'number' },
          { header: 'Mechanical Sales (L)', key: 'total_mechanical_sales', format: 'number' },
          { header: 'Elec Variance (L)', key: 'electronic_vs_tank_discrepancy', format: 'number' },
          { header: 'Elec Variance %', key: 'electronic_discrepancy_percent', format: 'percent' },
          { header: 'Status', key: 'status' },
        ],
        data: visibleTankRecons,
      }
    }
    if (!rangeReadings.length) return null
    return {
      title: `Tank Analysis - ${tankNameFor(selectedTank)}`,
      subtitle: `${startDate} to ${endDate}`,
      filename: `tank_analysis_${selectedTank}_${startDate}_${endDate}`,
      columns: [
        { header: 'Date', key: 'date' },
        { header: 'Shift', key: 'shift_type' },
        { header: 'Opening Vol (L)', key: 'opening_volume', format: 'number' },
        { header: 'Closing Vol (L)', key: 'closing_volume', format: 'number' },
        { header: 'Movement (L)', key: 'tank_volume_movement', format: 'number' },
        { header: 'Elec Dispensed (L)', key: 'total_electronic_dispensed', format: 'number' },
        { header: 'Mech Dispensed (L)', key: 'total_mechanical_dispensed', format: 'number' },
        { header: 'Elec vs Tank (L)', key: 'electronic_vs_tank_variance', format: 'number' },
        { header: 'Elec vs Tank %', key: 'electronic_vs_tank_percent', format: 'percent' },
        { header: 'Status', key: 'validation_status' },
      ],
      data: rangeReadings,
    }
  }, [mode, visibleTankRecons, rangeReadings, selectedShift, selectedTank, startDate, endDate, allTanks])

  // ── Render ───────────────────────────────────────────────
  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-content-primary">Tank Volume Movement Analysis</h1>
            <p className="mt-2 text-sm text-content-secondary">
              Compare actual tank volume movement with electronic/mechanical sales to identify discrepancies
            </p>
          </div>
          {(visibleTankRecons.length > 0 || rangeReadings.length > 0) && (
            <ExportButtons getConfig={getExportConfig} />
          )}
        </div>
      </div>

      {/* Selection controls */}
      <div className="bg-surface-card rounded-lg shadow p-6 mb-6 space-y-4">
        {/* Row 1: Tank + Mode */}
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs font-medium text-content-secondary mb-1 uppercase tracking-wide">Tank</label>
            <select
              value={selectedTank}
              onChange={e => { setSelectedTank(e.target.value); setReconciliation(null); setRangeReadings([]) }}
              className="w-full px-3 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-2 focus:ring-action-primary text-sm"
            >
              <option value="">-- Select tank --</option>
              {allTanks.map(t => (
                <option key={t.tank_id} value={t.tank_id}>{tankLabel(t)}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-content-secondary mb-1 uppercase tracking-wide">Mode</label>
            <div className="flex rounded-md border border-surface-border overflow-hidden">
              {(['shift', 'range'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => { setMode(m); setReconciliation(null); setRangeReadings([]) }}
                  className="px-4 py-2 text-sm font-medium transition-colors"
                  style={{
                    backgroundColor: mode === m ? 'var(--color-action-primary)' : 'transparent',
                    color: mode === m ? '#fff' : 'var(--color-content-secondary)',
                  }}
                >
                  {m === 'shift' ? 'By Shift' : 'By Date Range'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Row 2: Shift or Date Range controls */}
        {mode === 'shift' ? (
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[240px]">
              <label className="block text-xs font-medium text-content-secondary mb-1 uppercase tracking-wide">Shift</label>
              <select
                value={selectedShift}
                onChange={e => handleShiftSelect(e.target.value)}
                disabled={!selectedTank}
                className="w-full px-3 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-2 focus:ring-action-primary text-sm disabled:opacity-50"
              >
                <option value="">-- Select a shift --</option>
                {shifts.map(s => (
                  <option key={s.shift_id} value={s.shift_id}>
                    {s.date} - {s.shift_type} ({s.shift_id})
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-xs font-medium text-content-secondary mb-1 uppercase tracking-wide">From</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className="px-3 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-2 focus:ring-action-primary text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-content-secondary mb-1 uppercase tracking-wide">To</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                className="px-3 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-2 focus:ring-action-primary text-sm" />
            </div>
            <button
              onClick={fetchRangeReadings}
              disabled={!selectedTank || loading}
              className="px-5 py-2 rounded-md text-sm font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: 'var(--color-action-primary)' }}
            >
              {loading ? 'Loading...' : 'Load'}
            </button>
          </div>
        )}
      </div>

      {/* Cross-links */}
      {reconciliation?.shift_date && (
        <div className="mb-6 flex gap-4 flex-wrap">
          <Link href={`/three-way-reconciliation?date=${reconciliation.shift_date}`}
            className="text-sm text-action-primary hover:underline font-medium">
            Three-Way Reconciliation ({reconciliation.shift_date})
          </Link>
          <Link href={`/shift-reconciliation?date=${reconciliation.shift_date}`}
            className="text-sm text-action-primary hover:underline font-medium">
            Shift Reconciliation
          </Link>
        </div>
      )}

      {loading && (
        <div className="bg-action-primary-light border border-action-primary rounded-lg p-6 text-center">
          <p className="text-action-primary">Loading...</p>
        </div>
      )}

      {error && (
        <div className="bg-status-error-light border border-status-error rounded-lg p-6">
          <p className="text-status-error font-semibold">{error}</p>
          <p className="text-sm text-status-error mt-1">
            Make sure tank dip readings have been recorded for this shift.
          </p>
        </div>
      )}

      {/* ── SHIFT MODE RESULTS ── */}
      {mode === 'shift' && reconciliation && !loading && (
        <div>
          {/* Shift summary cards */}
          <div className="bg-surface-card rounded-lg shadow p-6 mb-6">
            <h2 className="text-lg font-bold text-content-primary mb-4">Shift Summary</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 bg-action-primary-light rounded-lg border border-action-primary">
                <p className="text-xs text-action-primary font-medium uppercase">Shift</p>
                <p className="text-lg font-bold text-action-primary">{reconciliation.shift_type}</p>
                <p className="text-sm text-action-primary">{reconciliation.shift_date}</p>
              </div>
              <div className={`p-4 rounded-lg border ${getStatusColor(
                reconciliation.summary.critical_variances > 0 ? 'critical' :
                reconciliation.summary.warnings > 0 ? 'warning' : 'acceptable'
              )}`}>
                <p className="text-xs font-medium uppercase">Status</p>
                <p className="text-lg font-bold">
                  {reconciliation.summary.critical_variances > 0 ? 'Critical' :
                   reconciliation.summary.warnings > 0 ? 'Warning' : 'Acceptable'}
                </p>
              </div>
              <div className="p-4 bg-surface-bg rounded-lg border border-surface-border">
                <p className="text-xs text-content-secondary font-medium uppercase">Tanks Reconciled</p>
                <p className="text-2xl font-bold text-content-primary">{reconciliation.summary.total_tanks_reconciled}</p>
              </div>
              <div className="p-4 bg-surface-bg rounded-lg border border-surface-border">
                <p className="text-xs text-content-secondary font-medium uppercase">Critical Variances</p>
                <p className="text-2xl font-bold text-status-error">{reconciliation.summary.critical_variances}</p>
              </div>
            </div>
          </div>

          {visibleTankRecons.length === 0 && selectedTank && (
            <div className="bg-status-pending-light border border-status-warning rounded-lg p-6 text-center">
              <p className="text-status-warning text-sm">No data recorded for {tankNameFor(selectedTank)} in this shift.</p>
            </div>
          )}

          {/* Per-tank detail cards */}
          <div className="space-y-6">
            {visibleTankRecons.map((tank: TankReconciliation) => (
              <div key={tank.tank_id}
                className={`bg-surface-card rounded-lg shadow-lg p-6 border-2 ${
                  tank.fuel_type === 'Diesel' ? 'border-fuel-diesel-border' : 'border-fuel-petrol-border'
                }`}>
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-2xl font-bold text-content-primary">{tankNameFor(tank.tank_id)}</h3>
                    <span className={`inline-block mt-1 px-3 py-1 rounded-full text-sm font-semibold ${
                      tank.fuel_type === 'Diesel'
                        ? 'bg-fuel-diesel-light text-fuel-diesel'
                        : 'bg-fuel-petrol-light text-fuel-petrol'
                    }`}>{tank.fuel_type}</span>
                  </div>
                  <span className={`px-4 py-2 rounded-lg border-2 font-bold ${getStatusColor(tank.status)}`}>
                    {tank.status.toUpperCase()}
                  </span>
                </div>

                {/* Delivery data */}
                {(tank.deliveries?.length > 0 || tank.delivery_timeline?.has_deliveries) && (
                  <div className="mb-4 bg-action-primary-light border-2 border-action-primary rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-bold text-action-primary">Fuel Deliveries During Shift</p>
                      <span className="px-3 py-1 rounded-full bg-action-primary-light text-action-primary text-xs font-semibold border border-action-primary">
                        {tank.delivery_timeline?.number_of_deliveries || tank.deliveries?.length || 0} delivery(s)
                      </span>
                    </div>
                    <p className="text-sm text-action-primary mb-3">
                      Total delivered: <strong>
                        {(tank.delivery_timeline?.total_delivered ||
                          tank.deliveries?.reduce((s: number, d: any) => s + (d.volume_delivered || 0), 0) || 0
                        ).toLocaleString(undefined, { maximumFractionDigits: 0 })} L
                      </strong>
                    </p>
                    {tank.delivery_timeline?.timeline?.filter((e: any) => e.event_type === 'DELIVERY').map((event: any, idx: number) => (
                      <div key={idx} className="flex items-center gap-3 mb-1 p-2 bg-surface-card rounded border border-action-primary text-sm">
                        <span className="w-6 h-6 rounded-full bg-action-primary text-white flex items-center justify-center text-xs font-bold">{idx + 1}</span>
                        <span className="text-action-primary">
                          +{event.change?.toLocaleString(undefined, { maximumFractionDigits: 0 })}L
                          {event.supplier && <> from <strong>{event.supplier}</strong></>}
                          {event.time && <> at <strong>{event.time}</strong></>}
                        </span>
                      </div>
                    ))}
                    {!tank.delivery_timeline?.timeline && tank.deliveries?.map((d: any, idx: number) => (
                      <div key={idx} className="flex items-center gap-3 mb-1 p-2 bg-surface-card rounded border border-action-primary text-sm">
                        <span className="w-6 h-6 rounded-full bg-action-primary text-white flex items-center justify-center text-xs font-bold">{idx + 1}</span>
                        <span className="text-action-primary">
                          +{(d.volume_delivered || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}L
                          {d.supplier && <> from <strong>{d.supplier}</strong></>}
                          {d.delivery_time && <> at <strong>{d.delivery_time}</strong></>}
                        </span>
                      </div>
                    ))}
                    {tank.delivery_timeline?.inter_delivery_sales?.length > 0 && (
                      <div className="mt-3 overflow-x-auto">
                        <p className="text-xs font-semibold text-action-primary mb-2">Segment Sales Breakdown</p>
                        <table className="min-w-full text-xs border border-action-primary">
                          <thead>
                            <tr className="bg-action-primary-light">
                              {['Segment', 'Period', 'Start (L)', 'End (L)', 'Sales (L)'].map(h => (
                                <th key={h} className="px-2 py-1 text-left font-medium text-action-primary">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {tank.delivery_timeline.inter_delivery_sales.map((seg: any, idx: number) => (
                              <tr key={idx} className="border-t border-action-primary">
                                <td className="px-2 py-1 font-medium text-action-primary">{idx + 1}</td>
                                <td className="px-2 py-1 text-action-primary">{seg.period}</td>
                                <td className="px-2 py-1 text-right font-mono text-action-primary">{seg.start_level?.toLocaleString()}</td>
                                <td className="px-2 py-1 text-right font-mono text-action-primary">{seg.end_level?.toLocaleString()}</td>
                                <td className="px-2 py-1 text-right font-mono font-semibold text-action-primary">{seg.sales_volume?.toFixed(2)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* Volume movement grid */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
                  {[
                    { label: 'Opening Volume', value: `${fmt(tank.opening_volume_liters)} L` },
                    { label: 'Closing Volume', value: `${fmt(tank.closing_volume_liters)} L` },
                    { label: 'Tank Movement', value: `${fmt(tank.tank_movement)} L` },
                    { label: 'Electronic Sales', value: `${fmt(tank.total_electronic_sales)} L` },
                    { label: 'Mechanical Sales', value: `${fmt(tank.total_mechanical_sales)} L` },
                    { label: 'Elec Variance', value: `${fmt(tank.electronic_vs_tank_discrepancy)} L (${fmt(tank.electronic_discrepancy_percent, 2)}%)` },
                  ].map(item => (
                    <div key={item.label} className="p-3 bg-surface-bg rounded-lg border border-surface-border">
                      <p className="text-xs text-content-secondary font-medium">{item.label}</p>
                      <p className="text-sm font-bold text-content-primary mt-1 font-mono">{item.value}</p>
                    </div>
                  ))}
                </div>

                <p className="text-sm text-content-secondary">{tank.message}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── DATE RANGE MODE RESULTS ── */}
      {mode === 'range' && !loading && rangeReadings.length > 0 && (
        <div className="bg-surface-card rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-surface-border">
            <h2 className="text-lg font-bold text-content-primary">
              {tankNameFor(selectedTank)} — {startDate} to {endDate}
            </h2>
            <p className="text-xs text-content-secondary mt-1">{rangeReadings.length} reading(s)</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-border" style={{ backgroundColor: 'var(--color-surface-bg)' }}>
                  {['Date', 'Shift', 'Opening (L)', 'Closing (L)', 'Movement (L)', 'Elec Dispensed (L)', 'Elec vs Tank (L)', 'Elec vs Tank %', 'Status'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase text-content-secondary whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rangeReadings.map((r: any, i: number) => {
                  const varPct = r.electronic_vs_tank_percent ?? r.electronic_vs_tank_variance
                  const status = r.validation_status || '-'
                  const statusStyle = status === 'PASS'
                    ? 'text-status-success bg-status-success-light'
                    : status === 'WARNING'
                    ? 'text-status-warning bg-status-pending-light'
                    : status === 'FAIL'
                    ? 'text-status-error bg-status-error-light'
                    : 'text-content-secondary'
                  return (
                    <tr key={r.reading_id || i} className="border-b border-surface-border hover:bg-surface-bg transition-colors">
                      <td className="px-4 py-3 font-medium">{r.date}</td>
                      <td className="px-4 py-3">{r.shift_type}</td>
                      <td className="px-4 py-3 font-mono text-right">{fmt(r.opening_volume)}</td>
                      <td className="px-4 py-3 font-mono text-right">{fmt(r.closing_volume)}</td>
                      <td className="px-4 py-3 font-mono text-right">{fmt(r.tank_volume_movement)}</td>
                      <td className="px-4 py-3 font-mono text-right">{fmt(r.total_electronic_dispensed)}</td>
                      <td className="px-4 py-3 font-mono text-right">{fmt(r.electronic_vs_tank_variance)}</td>
                      <td className="px-4 py-3 font-mono text-right">{varPct != null ? `${fmt(varPct, 2)}%` : '-'}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusStyle}`}>{status}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {mode === 'range' && !loading && rangeReadings.length === 0 && selectedTank && startDate && endDate && (
        <div className="bg-surface-card rounded-lg p-8 text-center border border-surface-border">
          <p className="text-content-secondary text-sm">No readings found for {tankNameFor(selectedTank)} between {startDate} and {endDate}.</p>
        </div>
      )}
    </div>
  )
}
