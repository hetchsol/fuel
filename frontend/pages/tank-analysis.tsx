import { useState, useEffect } from 'react'

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000/api/v1'

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
      const res = await fetch(`${BASE}/shifts/`)
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
      const res = await fetch(`${BASE}/reconciliation/shift/${shiftId}/tank-analysis`)
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
        return 'bg-green-100 text-green-800 border-green-300'
      case 'warning':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300'
      case 'critical':
        return 'bg-red-100 text-red-800 border-red-300'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300'
    }
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Tank Volume Movement Analysis</h1>
        <p className="mt-2 text-sm text-gray-600">
          Compare actual tank volume movement with electronic/mechanical sales to identify discrepancies
        </p>
      </div>

      {/* Shift Selector */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Select Shift to Analyze
        </label>
        <select
          value={selectedShift}
          onChange={(e) => handleShiftSelect(e.target.value)}
          className="w-full md:w-1/2 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center">
          <p className="text-blue-700">Loading reconciliation data...</p>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <p className="text-red-700 font-semibold">Error: {error}</p>
          <p className="text-sm text-red-600 mt-2">
            Make sure tank dip readings (opening and closing) have been recorded for this shift.
          </p>
        </div>
      )}

      {/* Reconciliation Results */}
      {reconciliation && !loading && (
        <div>
          {/* Summary */}
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Shift Summary</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                <p className="text-xs text-blue-700 font-medium">Shift</p>
                <p className="text-lg font-bold text-blue-900">{reconciliation.shift_type}</p>
                <p className="text-sm text-blue-600">{reconciliation.shift_date}</p>
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
              <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                <p className="text-xs text-gray-700 font-medium">Tanks Reconciled</p>
                <p className="text-2xl font-bold text-gray-900">{reconciliation.summary.total_tanks_reconciled}</p>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                <p className="text-xs text-gray-700 font-medium">Critical Variances</p>
                <p className="text-2xl font-bold text-red-600">{reconciliation.summary.critical_variances}</p>
              </div>
            </div>
          </div>

          {/* Tank Reconciliations */}
          <div className="space-y-6">
            {reconciliation.tank_reconciliations.map((tank: TankReconciliation) => (
              <div
                key={tank.tank_id}
                className={`bg-white rounded-lg shadow-lg p-6 border-2 ${
                  tank.fuel_type === 'Diesel' ? 'border-purple-300' : 'border-green-300'
                }`}
              >
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-2xl font-bold text-gray-900">{tank.tank_id}</h3>
                    <span className={`inline-block px-3 py-1 rounded-full text-sm font-semibold ${
                      tank.fuel_type === 'Diesel'
                        ? 'bg-purple-100 text-purple-800'
                        : 'bg-green-100 text-green-800'
                    }`}>
                      {tank.fuel_type}
                    </span>
                  </div>
                  <span className={`px-4 py-2 rounded-lg border-2 font-bold ${getStatusColor(tank.status)}`}>
                    {tank.status.toUpperCase()}
                  </span>
                </div>

                {/* Delivery Indicator */}
                {tank.tank_movement > 0 && tank.tank_movement < -5000 && (
                  <div className="mb-4 bg-green-50 border-2 border-green-400 rounded-lg p-3">
                    <p className="text-sm font-bold text-green-900 flex items-center gap-2">
                      <span>🚚</span> Fuel Delivery Detected
                    </p>
                    <p className="text-xs text-green-700 mt-1">
                      Tank volume increased during this shift - Delivery recorded
                    </p>
                  </div>
                )}

                {/* Tank Dip Readings */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <p className="text-xs text-blue-700 font-medium mb-1">Opening Dip</p>
                    <p className="text-2xl font-bold text-blue-900">{tank.opening_dip_cm.toFixed(1)} cm</p>
                    <p className="text-sm text-blue-600">{tank.opening_volume_liters.toLocaleString()} L</p>
                  </div>
                  <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <p className="text-xs text-blue-700 font-medium mb-1">Closing Dip</p>
                    <p className="text-2xl font-bold text-blue-900">{tank.closing_dip_cm.toFixed(1)} cm</p>
                    <p className="text-sm text-blue-600">{tank.closing_volume_liters.toLocaleString()} L</p>
                  </div>
                </div>

                {/* Volume Movement Comparison */}
                <div className="bg-gray-50 rounded-lg p-4 mb-4">
                  <h4 className="font-bold text-gray-900 mb-3">Volume Movement Comparison</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-3 bg-white rounded border-2 border-blue-400">
                      <p className="text-xs text-gray-600 font-medium">Tank Movement (Actual)</p>
                      <p className="text-xl font-bold text-blue-600">{tank.tank_movement.toFixed(2)} L</p>
                      <p className="text-xs text-gray-500">Opening - Closing</p>
                    </div>
                    <div className="p-3 bg-white rounded border border-gray-300">
                      <p className="text-xs text-gray-600 font-medium">Electronic Sales</p>
                      <p className="text-xl font-bold text-gray-900">{tank.total_electronic_sales.toFixed(2)} L</p>
                      <p className={`text-sm font-semibold ${
                        Math.abs(tank.electronic_discrepancy_percent) < 2 ? 'text-green-600' :
                        Math.abs(tank.electronic_discrepancy_percent) < 5 ? 'text-yellow-600' : 'text-red-600'
                      }`}>
                        Variance: {tank.electronic_vs_tank_discrepancy.toFixed(2)} L ({tank.electronic_discrepancy_percent.toFixed(2)}%)
                      </p>
                    </div>
                    <div className="p-3 bg-white rounded border border-gray-300">
                      <p className="text-xs text-gray-600 font-medium">Mechanical Sales</p>
                      <p className="text-xl font-bold text-gray-900">{tank.total_mechanical_sales.toFixed(2)} L</p>
                      <p className={`text-sm font-semibold ${
                        Math.abs(tank.mechanical_discrepancy_percent) < 2 ? 'text-green-600' :
                        Math.abs(tank.mechanical_discrepancy_percent) < 5 ? 'text-yellow-600' : 'text-red-600'
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
          <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-blue-900 mb-2">Understanding Discrepancies</h3>
            <ul className="text-sm text-blue-700 space-y-1">
              <li>• <strong>Positive variance</strong>: Tank lost more fuel than meters recorded (possible leakage, theft, or evaporation)</li>
              <li>• <strong>Negative variance</strong>: Meters recorded more than tank lost (possible meter over-reading or dip measurement error)</li>
              <li>• <strong>Acceptable</strong>: {'<'} 2% variance (normal operational variation)</li>
              <li>• <strong>Warning</strong>: 2-5% variance (requires attention)</li>
              <li>• <strong>Critical</strong>: {'>'} 5% variance (immediate investigation required)</li>
              <li>• <strong>Delivery Days</strong>: 🚚 Large negative tank movement indicates fuel delivery during shift</li>
            </ul>
          </div>

          {/* Three-Way Reconciliation Note */}
          <div className="mt-4 bg-purple-50 border border-purple-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-purple-900 mb-2">Three-Way Reconciliation System</h3>
            <p className="text-sm text-purple-700">
              This analysis compares <strong>Tank Movement</strong> (physical dips) vs <strong>Electronic Meters</strong> vs <strong>Mechanical Meters</strong> to identify discrepancies and ensure accurate fuel accounting.
            </p>
          </div>
        </div>
      )}

      {/* No Selection State */}
      {!selectedShift && !loading && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-12 text-center">
          <p className="text-gray-600 text-lg">Select a shift above to view tank volume movement analysis</p>
        </div>
      )}
    </div>
  )
}
