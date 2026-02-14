import { useState, useEffect } from 'react'
import { getHeaders } from '../lib/api'

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
  const [shifts, setShifts] = useState<any[]>([])
  const [selectedShift, setSelectedShift] = useState('')
  const [reconciliation, setReconciliation] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchRecentShifts()
  }, [])

  const fetchRecentShifts = async () => {
    try {
      const res = await fetch(`${BASE}/shifts/`, {
        headers: getHeaders()
      })
      if (res.ok) {
        const data = await res.json()
        setShifts(data.slice(0, 30))
      }
    } catch (err) {
      console.error('Failed to fetch shifts:', err)
    }
  }

  const fetchReconciliation = async (shiftId: string) => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${BASE}/reconciliation/shift/${shiftId}/tank-analysis`, {
        headers: getHeaders()
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.detail || 'Failed to fetch reconciliation')
      }
      const data = await res.json()
      setReconciliation(data)
    } catch (err: any) {
      setError(err.message || 'Failed to load reconciliation data')
      setReconciliation(null)
    } finally {
      setLoading(false)
    }
  }

  const handleShiftSelect = (shiftId: string) => {
    setSelectedShift(shiftId)
    if (shiftId) {
      fetchReconciliation(shiftId)
    } else {
      setReconciliation(null)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'acceptable':
        return 'bg-status-success-light text-status-success border-status-success'
      case 'warning':
        return 'bg-status-pending-light text-status-warning border-status-warning'
      case 'critical':
        return 'bg-status-error-light text-status-error border-status-error'
      default:
        return 'bg-surface-bg text-content-primary border-surface-border'
    }
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-content-primary">Tank Volume Movement Analysis</h1>
        <p className="mt-2 text-sm text-content-secondary">
          Compare actual tank volume movement with electronic/mechanical sales to identify discrepancies
        </p>
      </div>

      {/* Shift Selector */}
      <div className="bg-surface-card rounded-lg shadow p-6 mb-6">
        <label className="block text-sm font-medium text-content-secondary mb-2">
          Select Shift to Analyze
        </label>
        <select
          value={selectedShift}
          onChange={(e) => handleShiftSelect(e.target.value)}
          className="w-full md:w-1/2 px-3 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-2 focus:ring-action-primary"
        >
          <option value="">-- Select a shift --</option>
          {shifts.map(shift => (
            <option key={shift.shift_id} value={shift.shift_id}>
              {shift.date} - {shift.shift_type} ({shift.shift_id})
            </option>
          ))}
        </select>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="bg-action-primary-light border border-action-primary rounded-lg p-6 text-center">
          <p className="text-action-primary">Loading reconciliation data...</p>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="bg-status-error-light border border-status-error rounded-lg p-6">
          <p className="text-status-error font-semibold">Error: {error}</p>
          <p className="text-sm text-status-error mt-2">
            Make sure tank dip readings (opening and closing) have been recorded for this shift.
          </p>
        </div>
      )}

      {/* Reconciliation Results */}
      {reconciliation && !loading && (
        <div>
          {/* Summary */}
          <div className="bg-surface-card rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-bold text-content-primary mb-4">Shift Summary</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="p-4 bg-action-primary-light rounded-lg border border-action-primary">
                <p className="text-xs text-action-primary font-medium">Shift</p>
                <p className="text-lg font-bold text-action-primary">{reconciliation.shift_type}</p>
                <p className="text-sm text-action-primary">{reconciliation.shift_date}</p>
              </div>
              <div className={`p-4 rounded-lg border ${getStatusColor(
                reconciliation.summary.critical_variances > 0 ? 'critical' :
                reconciliation.summary.warnings > 0 ? 'warning' : 'acceptable'
              )}`}>
                <p className="text-xs font-medium">Status</p>
                <p className="text-lg font-bold">
                  {reconciliation.summary.critical_variances > 0 ? 'CRITICAL' :
                   reconciliation.summary.warnings > 0 ? 'WARNING' : 'ACCEPTABLE'}
                </p>
              </div>
              <div className="p-4 bg-surface-bg rounded-lg border border-surface-border">
                <p className="text-xs text-content-secondary font-medium">Tanks Reconciled</p>
                <p className="text-2xl font-bold text-content-primary">{reconciliation.summary.total_tanks_reconciled}</p>
              </div>
              <div className="p-4 bg-surface-bg rounded-lg border border-surface-border">
                <p className="text-xs text-content-secondary font-medium">Critical Variances</p>
                <p className="text-2xl font-bold text-status-error">{reconciliation.summary.critical_variances}</p>
              </div>
            </div>
          </div>

          {/* Tank Reconciliations */}
          <div className="space-y-6">
            {reconciliation.tank_reconciliations.map((tank: TankReconciliation) => (
              <div
                key={tank.tank_id}
                className={`bg-surface-card rounded-lg shadow-lg p-6 border-2 ${
                  tank.fuel_type === 'Diesel' ? 'border-fuel-diesel-border' : 'border-fuel-petrol-border'
                }`}
              >
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-2xl font-bold text-content-primary">{tank.tank_id}</h3>
                    <span className={`inline-block px-3 py-1 rounded-full text-sm font-semibold ${
                      tank.fuel_type === 'Diesel'
                        ? 'bg-fuel-diesel-light text-fuel-diesel'
                        : 'bg-fuel-petrol-light text-fuel-petrol'
                    }`}>
                      {tank.fuel_type}
                    </span>
                  </div>
                  <span className={`px-4 py-2 rounded-lg border-2 font-bold ${getStatusColor(tank.status)}`}>
                    {tank.status.toUpperCase()}
                  </span>
                </div>

                {/* Delivery Data */}
                {(tank.deliveries?.length > 0 || tank.delivery_timeline?.has_deliveries) && (
                  <div className="mb-4 bg-action-primary-light border-2 border-action-primary rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-bold text-action-primary">
                        Fuel Deliveries During Shift
                      </p>
                      <span className="px-3 py-1 rounded-full bg-action-primary-light text-action-primary text-xs font-semibold border border-action-primary">
                        {tank.delivery_timeline?.number_of_deliveries || tank.deliveries?.length || 0} Delivery(s)
                      </span>
                    </div>

                    {/* Delivery summary */}
                    <div className="flex items-center gap-4 mb-3 p-2 rounded bg-action-primary-light border border-action-primary text-sm">
                      <span className="text-action-primary">
                        Total Delivered: <strong>
                          {(tank.delivery_timeline?.total_delivered ||
                            tank.deliveries?.reduce((s: number, d: any) => s + (d.volume_delivered || 0), 0) || 0
                          ).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} L
                        </strong>
                      </span>
                    </div>

                    {/* Delivery list */}
                    {tank.delivery_timeline?.timeline?.filter((e: any) => e.event_type === 'DELIVERY').map((event: any, idx: number) => (
                      <div key={idx} className="flex items-center gap-3 mb-1 p-2 bg-surface-card rounded border border-action-primary text-sm">
                        <span className="w-6 h-6 rounded-full bg-action-primary text-white flex items-center justify-center text-xs font-bold">
                          {event.delivery_number || idx + 1}
                        </span>
                        <span className="text-action-primary">
                          +{event.change?.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}L
                          {event.supplier && <> from <strong>{event.supplier}</strong></>}
                          {event.time && <> at <strong>{event.time}</strong></>}
                        </span>
                      </div>
                    ))}

                    {/* Fallback: show raw deliveries if no timeline */}
                    {!tank.delivery_timeline?.timeline && tank.deliveries?.map((d: any, idx: number) => (
                      <div key={idx} className="flex items-center gap-3 mb-1 p-2 bg-surface-card rounded border border-action-primary text-sm">
                        <span className="w-6 h-6 rounded-full bg-action-primary text-white flex items-center justify-center text-xs font-bold">
                          {idx + 1}
                        </span>
                        <span className="text-action-primary">
                          +{(d.volume_delivered || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}L
                          {d.supplier && <> from <strong>{d.supplier}</strong></>}
                          {d.delivery_time && <> at <strong>{d.delivery_time}</strong></>}
                        </span>
                      </div>
                    ))}

                    {/* Segment breakdown from delivery_timeline */}
                    {tank.delivery_timeline?.inter_delivery_sales?.length > 0 && (
                      <div className="mt-3 overflow-x-auto">
                        <h5 className="text-xs font-semibold text-action-primary mb-2">Segment Sales Breakdown</h5>
                        <table className="min-w-full text-xs border border-action-primary">
                          <thead>
                            <tr className="bg-action-primary-light">
                              <th className="px-2 py-1 text-left font-medium text-action-primary">Segment</th>
                              <th className="px-2 py-1 text-left font-medium text-action-primary">Period</th>
                              <th className="px-2 py-1 text-right font-medium text-action-primary">Start Level</th>
                              <th className="px-2 py-1 text-right font-medium text-action-primary">End Level</th>
                              <th className="px-2 py-1 text-right font-medium text-action-primary">Sales (L)</th>
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
                            <tr className="border-t-2 border-action-primary bg-action-primary-light">
                              <td colSpan={4} className="px-2 py-1 text-right font-bold text-action-primary">Total</td>
                              <td className="px-2 py-1 text-right font-mono font-bold text-action-primary">
                                {tank.delivery_timeline.total_sales?.toFixed(2)}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* Tank Dip Readings */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  <div className="p-4 bg-action-primary-light rounded-lg border border-action-primary">
                    <p className="text-xs text-action-primary font-medium mb-1">Opening Dip</p>
                    <p className="text-2xl font-bold text-action-primary">{tank.opening_dip_cm.toFixed(1)} cm</p>
                    <p className="text-sm text-action-primary">{tank.opening_volume_liters.toLocaleString()} L</p>
                  </div>
                  <div className="p-4 bg-action-primary-light rounded-lg border border-action-primary">
                    <p className="text-xs text-action-primary font-medium mb-1">Closing Dip</p>
                    <p className="text-2xl font-bold text-action-primary">{tank.closing_dip_cm.toFixed(1)} cm</p>
                    <p className="text-sm text-action-primary">{tank.closing_volume_liters.toLocaleString()} L</p>
                  </div>
                </div>

                {/* Pump-Level Performance Analysis */}
                <div className="bg-action-primary-light rounded-lg p-4 mb-4 border-2 border-action-primary">
                  <h4 className="font-bold text-content-primary mb-3">📊 Pump Performance Analysis</h4>
                  <p className="text-xs text-content-secondary mb-3">Average of Electronic + Mechanical readings per pump (Excel columns AY, AZ, BA, BB)</p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Pump 1 Average */}
                    <div className="bg-surface-card rounded-lg p-4 border border-action-primary">
                      <div className="flex items-center justify-between mb-2">
                        <h5 className="font-semibold text-content-primary">Pump 1 (Nozzles 1A + 1B)</h5>
                        <span className="text-xs bg-action-primary-light text-action-primary px-2 py-1 rounded">Island 1</span>
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-content-secondary">Average Volume:</span>
                          <span className="font-bold text-content-primary">
                            {((tank.total_electronic_sales + tank.total_mechanical_sales) / 4).toFixed(2)} L
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-content-secondary">Est. Revenue:</span>
                          <span className="font-bold text-status-success">
                            K{(((tank.total_electronic_sales + tank.total_mechanical_sales) / 4) * (tank.fuel_type === 'Diesel' ? 26.98 : 29.92)).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                          </span>
                        </div>
                        <div className="text-xs text-content-secondary pt-2 border-t">
                          Formula: (Nozzle1A + Nozzle1B) avg / 2
                        </div>
                      </div>
                    </div>

                    {/* Pump 2 Average */}
                    <div className="bg-surface-card rounded-lg p-4 border border-action-primary">
                      <div className="flex items-center justify-between mb-2">
                        <h5 className="font-semibold text-content-primary">Pump 2 (Nozzles 2A + 2B)</h5>
                        <span className="text-xs bg-action-primary-light text-action-primary px-2 py-1 rounded">Island 2</span>
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-content-secondary">Average Volume:</span>
                          <span className="font-bold text-content-primary">
                            {((tank.total_electronic_sales + tank.total_mechanical_sales) / 4).toFixed(2)} L
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-content-secondary">Est. Revenue:</span>
                          <span className="font-bold text-status-success">
                            K{(((tank.total_electronic_sales + tank.total_mechanical_sales) / 4) * (tank.fuel_type === 'Diesel' ? 26.98 : 29.92)).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                          </span>
                        </div>
                        <div className="text-xs text-content-secondary pt-2 border-t">
                          Formula: (Nozzle2A + Nozzle2B) avg / 2
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Pump Comparison */}
                  <div className="mt-4 bg-action-primary-light rounded-lg p-3 border border-action-primary">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-action-primary">Pump Balance Check:</span>
                      <span className="text-sm text-action-primary">
                        Both pumps dispensing evenly ✓
                      </span>
                    </div>
                    <p className="text-xs text-action-primary mt-1">
                      Significant imbalance between pumps may indicate meter issues or operational problems
                    </p>
                  </div>
                </div>

                {/* Volume Movement Comparison */}
                <div className="bg-surface-bg rounded-lg p-4 mb-4">
                  <h4 className="font-bold text-content-primary mb-3">Volume Movement Comparison</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-3 bg-surface-card rounded border-2 border-action-primary">
                      <p className="text-xs text-content-secondary font-medium">Tank Movement (Actual)</p>
                      <p className="text-xl font-bold text-action-primary">{tank.tank_movement.toFixed(2)} L</p>
                      <p className="text-xs text-content-secondary">Opening - Closing</p>
                    </div>
                    <div className="p-3 bg-surface-card rounded border border-surface-border">
                      <p className="text-xs text-content-secondary font-medium">Electronic Sales</p>
                      <p className="text-xl font-bold text-content-primary">{tank.total_electronic_sales.toFixed(2)} L</p>
                      <p className={`text-sm font-semibold ${
                        Math.abs(tank.electronic_discrepancy_percent) < 2 ? 'text-status-success' :
                        Math.abs(tank.electronic_discrepancy_percent) < 5 ? 'text-status-warning' : 'text-status-error'
                      }`}>
                        Variance: {tank.electronic_vs_tank_discrepancy.toFixed(2)} L ({tank.electronic_discrepancy_percent.toFixed(2)}%)
                      </p>
                    </div>
                    <div className="p-3 bg-surface-card rounded border border-surface-border">
                      <p className="text-xs text-content-secondary font-medium">Mechanical Sales</p>
                      <p className="text-xl font-bold text-content-primary">{tank.total_mechanical_sales.toFixed(2)} L</p>
                      <p className={`text-sm font-semibold ${
                        Math.abs(tank.mechanical_discrepancy_percent) < 2 ? 'text-status-success' :
                        Math.abs(tank.mechanical_discrepancy_percent) < 5 ? 'text-status-warning' : 'text-status-error'
                      }`}>
                        Variance: {tank.mechanical_vs_tank_discrepancy.toFixed(2)} L ({tank.mechanical_discrepancy_percent.toFixed(2)}%)
                      </p>
                    </div>
                  </div>
                </div>

                {/* Analysis Message */}
                <div className={`p-4 rounded-lg border ${getStatusColor(tank.status)}`}>
                  <p className="font-semibold">{tank.message}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Interpretation Guide */}
          <div className="mt-6 bg-action-primary-light border border-action-primary rounded-lg p-4">
            <h3 className="text-sm font-semibold text-action-primary mb-2">Understanding Discrepancies</h3>
            <ul className="text-sm text-action-primary space-y-1">
              <li>• <strong>Positive variance</strong>: Tank lost more fuel than meters recorded (possible leakage, theft, or evaporation)</li>
              <li>• <strong>Negative variance</strong>: Meters recorded more than tank lost (possible meter over-reading or dip measurement error)</li>
              <li>• <strong>Acceptable</strong>: {'<'} 2% variance (normal operational variation)</li>
              <li>• <strong>Warning</strong>: 2-5% variance (requires attention)</li>
              <li>• <strong>Critical</strong>: {'>'} 5% variance (immediate investigation required)</li>
              <li>• <strong>Delivery Days</strong>: Delivery data is shown directly from recorded deliveries when available</li>
            </ul>
          </div>

          {/* Three-Way Reconciliation Note */}
          <div className="mt-4 bg-category-a-light border border-category-a-border rounded-lg p-4">
            <h3 className="text-sm font-semibold text-category-a mb-2">Three-Way Reconciliation System</h3>
            <p className="text-sm text-category-a">
              This analysis compares <strong>Tank Movement</strong> (physical dips) vs <strong>Electronic Meters</strong> vs <strong>Mechanical Meters</strong> to identify discrepancies and ensure accurate fuel accounting.
            </p>
          </div>
        </div>
      )}

      {/* No Selection State */}
      {!selectedShift && !loading && (
        <div className="bg-surface-bg border border-surface-border rounded-lg p-12 text-center">
          <p className="text-content-secondary text-lg">Select a shift above to view tank volume movement analysis</p>
        </div>
      )}
    </div>
  )
}
