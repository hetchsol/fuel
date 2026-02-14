import { authFetch, BASE, getHeaders } from '../lib/api'
import { useState, useEffect } from 'react'
import { useTheme, getFuelColorSet } from '../contexts/ThemeContext'


interface NozzleReading {
  nozzle_id: string
  attendant: string
  electronic_opening: number
  electronic_closing: number
  electronic_movement: number
  mechanical_opening: number
  mechanical_closing: number
  mechanical_movement: number
}

interface CustomerAllocation {
  customer_id: string
  customer_name: string
  volume: number
  price_per_liter: number
  amount: number
}

interface TankReading {
  reading_id: string
  tank_id: string
  fuel_type: string
  date: string
  shift_type: string
  opening_dip_cm: number
  closing_dip_cm: number
  after_delivery_dip_cm: number | null
  opening_volume: number
  closing_volume: number
  tank_volume_movement: number
  total_electronic_dispensed: number
  total_mechanical_dispensed: number
  electronic_vs_tank_variance: number
  mechanical_vs_tank_variance: number
  electronic_vs_tank_percent: number
  mechanical_vs_tank_percent: number
  price_per_liter: number
  expected_amount_electronic: number
  actual_cash_banked: number | null
  cash_difference: number | null
  loss_percent: number
  validation_status: string
  delivery_occurred: boolean
  nozzle_readings: NozzleReading[]
  customer_allocations?: CustomerAllocation[]
  allocation_balance_check?: number | null
  total_customer_revenue?: number | null
  recorded_by: string
  created_at: string
  notes: string
  deliveries?: any[]
  delivery_timeline?: any
}

export default function TankReadingsReport() {
  const { theme } = useTheme()
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [selectedTank, setSelectedTank] = useState('TANK-DIESEL')
  const [readings, setReadings] = useState<TankReading[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectedReading, setSelectedReading] = useState<TankReading | null>(null)

  // Get fuel type prefix and color based on tank
  const getFuelTypePrefix = (tankId: string) => {
    return tankId === 'TANK-DIESEL' ? 'LSD' : 'UNL'
  }

  // Set default date range (last 7 days)
  useEffect(() => {
    const today = new Date()
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(today.getDate() - 7)

    setEndDate(today.toISOString().split('T')[0])
    setStartDate(sevenDaysAgo.toISOString().split('T')[0])
  }, [])

  // Load readings when date range or tank changes
  useEffect(() => {
    if (startDate && endDate) {
      loadReadings()
    }
  }, [startDate, endDate, selectedTank])

  const loadReadings = async () => {
    setLoading(true)
    setError('')

    try {
      const url = `${BASE}/tank-readings/readings/${selectedTank}?start_date=${startDate}&end_date=${endDate}`

      const res = await authFetch(url, {
        headers: getHeaders()
      })

      if (!res.ok) {
        throw new Error('Failed to load readings')
      }

      const data = await res.json()
      setReadings(data)
    } catch (err: any) {
      setError(err.message || 'Error loading readings')
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-ZM', {
      style: 'currency',
      currency: 'ZMW',
      minimumFractionDigits: 2
    }).format(amount)
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PASS':
        return 'bg-status-success-light text-status-success border-status-success'
      case 'WARNING':
        return 'bg-status-pending-light text-status-warning border-status-warning'
      case 'FAIL':
        return 'bg-status-error-light text-status-error border-status-error'
      default:
        return 'bg-surface-bg text-content-primary border-surface-border'
    }
  }

  return (
    <div className="min-h-screen p-6 transition-colors duration-300" style={{ backgroundColor: theme.background }}>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold transition-colors duration-300" style={{ color: theme.textPrimary }}>
            Tank Readings Report
          </h1>
          <p className="mt-2 transition-colors duration-300" style={{ color: theme.textSecondary }}>
            View and analyze tank readings by date range
          </p>
        </div>

        {/* Filters */}
        <div className="rounded-lg shadow p-6 mb-6 transition-colors duration-300" style={{ backgroundColor: theme.cardBg }}>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2 transition-colors duration-300" style={{ color: theme.textPrimary }}>
                Tank
              </label>
              <select
                value={selectedTank}
                onChange={(e) => {
                  setSelectedTank(e.target.value)
                }}
                className="w-full px-3 py-2 border rounded-md focus:ring-2 transition-colors duration-300"
                style={{
                  backgroundColor: theme.cardBg,
                  color: theme.textPrimary,
                  borderColor: theme.border
                }}
              >
                <option value="TANK-DIESEL">Diesel Tank</option>
                <option value="TANK-PETROL">Petrol Tank</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2 transition-colors duration-300" style={{ color: theme.textPrimary }}>
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 border rounded-md focus:ring-2 transition-colors duration-300"
                style={{
                  backgroundColor: theme.cardBg,
                  color: theme.textPrimary,
                  borderColor: theme.border
                }}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2 transition-colors duration-300" style={{ color: theme.textPrimary }}>
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 border rounded-md focus:ring-2 transition-colors duration-300"
                style={{
                  backgroundColor: theme.cardBg,
                  color: theme.textPrimary,
                  borderColor: theme.border
                }}
              />
            </div>

            <div className="flex items-end">
              <button
                onClick={loadReadings}
                disabled={loading}
                className="w-full px-4 py-2 text-white rounded-md hover:opacity-90 disabled:opacity-50 transition"
                style={{ backgroundColor: theme.primary }}
              >
                {loading ? 'Loading...' : 'Load Report'}
              </button>
            </div>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-status-error-light border border-status-error rounded-md p-4 mb-6">
            <p className="text-status-error">{error}</p>
          </div>
        )}

        {/* Summary Statistics */}
        {readings.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="rounded-lg p-4 shadow transition-colors duration-300" style={{ backgroundColor: theme.primaryLight, borderColor: theme.primary, borderWidth: '2px' }}>
              <p className="text-sm font-medium mb-1" style={{ color: theme.primary }}>Total Readings</p>
              <p className="text-3xl font-bold" style={{ color: theme.primary }}>{readings.length}</p>
            </div>

            <div className="rounded-lg p-4 shadow transition-colors duration-300" style={{ backgroundColor: theme.secondaryLight, borderColor: theme.secondary, borderWidth: '2px' }}>
              <p className="text-sm font-medium mb-1" style={{ color: theme.secondary }}>Total Volume Dispensed</p>
              <p className="text-3xl font-bold" style={{ color: theme.secondary }}>
                {readings.reduce((sum, r) => sum + r.total_electronic_dispensed, 0).toFixed(2)} L
              </p>
            </div>

            <div className="rounded-lg p-4 shadow transition-colors duration-300" style={{ backgroundColor: theme.accentLight, borderColor: theme.accent, borderWidth: '2px' }}>
              <p className="text-sm font-medium mb-1" style={{ color: theme.accent }}>Total Expected Revenue</p>
              <p className="text-2xl font-bold" style={{ color: theme.accent }}>
                {formatCurrency(readings.reduce((sum, r) => sum + r.expected_amount_electronic, 0))}
              </p>
            </div>

            <div className="rounded-lg p-4 shadow bg-surface-card border-2" style={{ borderColor: theme.border }}>
              <p className="text-sm font-medium mb-1 text-content-secondary">Avg Variance</p>
              <p className="text-3xl font-bold text-content-primary">
                {(readings.reduce((sum, r) => sum + Math.abs(r.electronic_vs_tank_percent), 0) / readings.length).toFixed(2)}%
              </p>
            </div>
          </div>
        )}

        {/* Readings Table */}
        {loading ? (
          <div className="rounded-lg shadow p-8 text-center transition-colors duration-300" style={{ backgroundColor: theme.cardBg }}>
            <p className="transition-colors duration-300" style={{ color: theme.textSecondary }}>Loading readings...</p>
          </div>
        ) : readings.length === 0 ? (
          <div className="rounded-lg shadow p-8 text-center transition-colors duration-300" style={{ backgroundColor: theme.cardBg }}>
            <p className="transition-colors duration-300" style={{ color: theme.textSecondary }}>
              No readings found for the selected date range.
            </p>
          </div>
        ) : (
          <div className="rounded-lg shadow overflow-hidden transition-colors duration-300" style={{ backgroundColor: theme.cardBg }}>
            <table className="min-w-full divide-y" style={{ borderColor: theme.border }}>
              <thead style={{ backgroundColor: theme.primaryLight }}>
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: theme.primary }}>
                    Date & Shift
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: theme.primary }}>
                    Tank Movement
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: theme.primary }}>
                    Electronic Dispensed
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: theme.primary }}>
                    Variance
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: theme.primary }}>
                    Expected Revenue
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: theme.primary }}>
                    Deliveries
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: theme.primary }}>
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: theme.primary }}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: theme.border }}>
                {readings.map((reading) => (
                  <tr key={reading.reading_id} className="hover:opacity-75 transition-opacity">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium transition-colors duration-300" style={{ color: theme.textPrimary }}>
                        {reading.date}
                      </div>
                      <div className="text-sm transition-colors duration-300" style={{ color: theme.textSecondary }}>
                        {reading.shift_type}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-semibold transition-colors duration-300" style={{ color: theme.textPrimary }}>
                        {reading.tank_volume_movement.toFixed(3)} L
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-semibold transition-colors duration-300" style={{ color: theme.textPrimary }}>
                        {reading.total_electronic_dispensed.toFixed(3)} L
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm transition-colors duration-300" style={{ color: theme.textPrimary }}>
                        {reading.electronic_vs_tank_variance.toFixed(3)} L
                      </div>
                      <div className={`text-xs font-medium ${
                        Math.abs(reading.electronic_vs_tank_percent) > 1 ? 'text-status-error' :
                        Math.abs(reading.electronic_vs_tank_percent) > 0.5 ? 'text-status-warning' :
                        'text-status-success'
                      }`}>
                        ({reading.electronic_vs_tank_percent.toFixed(2)}%)
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-semibold transition-colors duration-300" style={{ color: theme.textPrimary }}>
                        {formatCurrency(reading.expected_amount_electronic)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {reading.deliveries && reading.deliveries.length > 0 ? (
                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-action-primary-light text-action-primary border border-action-primary">
                          {reading.deliveries.length}
                        </span>
                      ) : reading.delivery_timeline?.has_deliveries ? (
                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-action-primary-light text-action-primary border border-action-primary">
                          {reading.delivery_timeline.number_of_deliveries}
                        </span>
                      ) : (
                        <span className="text-sm transition-colors duration-300" style={{ color: theme.textSecondary }}>-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full border ${getStatusColor(reading.validation_status)}`}>
                        {reading.validation_status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <button
                        onClick={() => setSelectedReading(reading)}
                        className="text-white px-3 py-1 rounded hover:opacity-80"
                        style={{ backgroundColor: theme.primary }}
                      >
                        View Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Reading Details Modal */}
        {selectedReading && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50" onClick={() => setSelectedReading(null)}>
            <div
              className="rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto transition-colors duration-300"
              style={{ backgroundColor: theme.cardBg }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h2 className="text-2xl font-bold transition-colors duration-300" style={{ color: theme.textPrimary }}>
                      Reading Details
                    </h2>
                    <p className="text-sm mt-1 transition-colors duration-300" style={{ color: theme.textSecondary }}>
                      {selectedReading.date} - {selectedReading.shift_type} Shift
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedReading(null)}
                    className="text-content-secondary hover:text-content-primary text-2xl"
                  >
                    ×
                  </button>
                </div>

                {/* Nozzle Readings */}
                <div className="mb-6">
                  <h3 className="text-lg font-semibold mb-3 transition-colors duration-300" style={{ color: theme.textPrimary }}>
                    Nozzle Readings
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {selectedReading.nozzle_readings.map((nozzle) => {
                      const fuelPrefix = getFuelTypePrefix(selectedReading.tank_id)
                      const fuelColors = getFuelColorSet(selectedReading.tank_id === 'TANK-DIESEL' ? 'diesel' : 'petrol')
                      const fuelColor = fuelColors.main
                      const fuelLightColor = fuelColors.light

                      return (
                        <div
                          key={nozzle.nozzle_id}
                          className="border-2 rounded-lg p-4"
                          style={{
                            borderColor: fuelColor,
                            backgroundColor: fuelLightColor
                          }}
                        >
                          <div className="flex justify-between items-center mb-3">
                            <span className="font-bold text-lg" style={{ color: fuelColor }}>
                              {fuelPrefix} {nozzle.nozzle_id}
                            </span>
                            <span className="text-sm font-medium px-2 py-1 rounded" style={{
                              color: fuelColor,
                              backgroundColor: theme.cardBg
                            }}>
                              {nozzle.attendant}
                            </span>
                          </div>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span style={{ color: theme.textSecondary }}>Electronic:</span>
                              <span className="font-semibold" style={{ color: fuelColor }}>{nozzle.electronic_movement.toFixed(3)} L</span>
                            </div>
                            <div className="flex justify-between">
                              <span style={{ color: theme.textSecondary }}>Mechanical:</span>
                              <span className="font-semibold" style={{ color: fuelColor }}>{nozzle.mechanical_movement.toFixed(3)} L</span>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Financial Summary */}
                <div className="rounded-lg p-4 mb-4" style={{ backgroundColor: theme.primaryLight }}>
                  <h3 className="text-lg font-semibold mb-3" style={{ color: theme.primary }}>Financial Summary</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span style={{ color: theme.textSecondary }}>Price per Liter:</span>
                      <p className="font-semibold text-lg" style={{ color: theme.primary }}>{formatCurrency(selectedReading.price_per_liter)}</p>
                    </div>
                    <div>
                      <span style={{ color: theme.textSecondary }}>Expected Revenue:</span>
                      <p className="font-semibold text-lg" style={{ color: theme.primary }}>
                        {formatCurrency(selectedReading.expected_amount_electronic)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Customer Allocation (Diesel Only) */}
                {selectedReading.tank_id === 'TANK-DIESEL' && selectedReading.customer_allocations && selectedReading.customer_allocations.length > 0 && (
                  <div className="rounded-lg p-4 mb-4" style={{ backgroundColor: 'var(--color-fuel-diesel-light)', borderColor: 'var(--color-fuel-diesel)', borderWidth: '2px' }}>
                    <div className="flex justify-between items-center mb-3">
                      <h3 className="text-lg font-semibold" style={{ color: 'var(--color-fuel-diesel)' }}>
                        Customer Allocation (Columns AR-BB)
                      </h3>
                      {selectedReading.allocation_balance_check !== null && selectedReading.allocation_balance_check !== undefined && (
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          Math.abs(selectedReading.allocation_balance_check) <= 0.01 ? 'bg-status-success-light text-status-success' :
                          Math.abs(selectedReading.allocation_balance_check) < selectedReading.total_electronic_dispensed * 0.01 ? 'bg-status-pending-light text-status-warning' :
                          'bg-status-error-light text-status-error'
                        }`}>
                          Balance: {selectedReading.allocation_balance_check.toFixed(3)} L
                        </span>
                      )}
                    </div>

                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead>
                          <tr className="border-b-2" style={{ borderColor: 'var(--color-fuel-diesel)' }}>
                            <th className="text-left py-2 px-3 font-semibold" style={{ color: 'var(--color-fuel-diesel)' }}>Customer</th>
                            <th className="text-right py-2 px-3 font-semibold" style={{ color: 'var(--color-fuel-diesel)' }}>Volume (L)</th>
                            <th className="text-right py-2 px-3 font-semibold" style={{ color: 'var(--color-fuel-diesel)' }}>Price/L</th>
                            <th className="text-right py-2 px-3 font-semibold" style={{ color: 'var(--color-fuel-diesel)' }}>Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedReading.customer_allocations.map((allocation) => (
                            <tr key={allocation.customer_id} className="border-b" style={{ borderColor: 'var(--color-fuel-diesel-light)' }}>
                              <td className="py-2 px-3 font-medium" style={{ color: 'var(--color-fuel-diesel)' }}>
                                {allocation.customer_name}
                              </td>
                              <td className="py-2 px-3 text-right font-semibold" style={{ color: 'var(--color-fuel-diesel)' }}>
                                {allocation.volume.toFixed(3)}
                              </td>
                              <td className="py-2 px-3 text-right" style={{ color: 'var(--color-fuel-diesel)' }}>
                                {formatCurrency(allocation.price_per_liter)}
                              </td>
                              <td className="py-2 px-3 text-right font-semibold" style={{ color: 'var(--color-fuel-diesel)' }}>
                                {formatCurrency(allocation.amount)}
                              </td>
                            </tr>
                          ))}
                          <tr className="border-t-2" style={{ borderColor: 'var(--color-fuel-diesel)' }}>
                            <td colSpan={3} className="py-2 px-3 text-right font-bold" style={{ color: 'var(--color-fuel-diesel)' }}>
                              Total Customer Revenue:
                            </td>
                            <td className="py-2 px-3 text-right font-bold text-lg" style={{ color: 'var(--color-fuel-diesel)' }}>
                              {formatCurrency(selectedReading.total_customer_revenue || 0)}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {/* Column AW Check */}
                    <div className="mt-3 p-2 rounded text-xs" style={{ backgroundColor: 'var(--color-fuel-diesel-light)' }}>
                      <span style={{ color: 'var(--color-fuel-diesel)' }}>
                        <strong>Column AW Check:</strong> Total Electronic ({selectedReading.total_electronic_dispensed.toFixed(3)} L) -
                        Sum of Allocations ({selectedReading.customer_allocations.reduce((sum, a) => sum + a.volume, 0).toFixed(3)} L) =
                        {selectedReading.allocation_balance_check?.toFixed(3) || '0.000'} L
                      </span>
                    </div>
                  </div>
                )}

                {/* Deliveries & Timeline */}
                {(selectedReading.delivery_timeline?.has_deliveries || (selectedReading.deliveries && selectedReading.deliveries.length > 0)) && (
                  <div className="rounded-lg p-4 mb-4 border-2 border-action-primary bg-action-primary-light">
                    <h3 className="text-lg font-semibold mb-3 text-action-primary">Deliveries & Timeline</h3>

                    {/* Delivery Summary */}
                    <div className="flex items-center gap-4 mb-4 p-3 rounded-lg bg-action-primary-light border border-action-primary/30">
                      <span className="text-2xl font-bold text-action-primary">
                        {selectedReading.delivery_timeline?.number_of_deliveries || selectedReading.deliveries?.length || 0}
                      </span>
                      <span className="text-sm text-action-primary">
                        {(selectedReading.delivery_timeline?.number_of_deliveries || selectedReading.deliveries?.length || 0) === 1 ? 'Delivery' : 'Deliveries'}
                      </span>
                      <span className="mx-2 text-action-primary">|</span>
                      <span className="text-sm text-action-primary">
                        Total Delivered: <strong>
                          {(selectedReading.delivery_timeline?.total_delivered ||
                            selectedReading.deliveries?.reduce((s: number, d: any) => s + (d.volume_delivered || 0), 0) || 0
                          ).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} L
                        </strong>
                      </span>
                    </div>

                    {/* Delivery List */}
                    {selectedReading.delivery_timeline?.timeline?.filter((e: any) => e.event_type === 'DELIVERY').map((event: any, idx: number) => (
                      <div key={idx} className="flex items-center gap-3 mb-2 p-2 bg-surface-card rounded border border-action-primary text-sm">
                        <span className="w-7 h-7 rounded-full bg-action-primary text-white flex items-center justify-center text-xs font-bold">
                          {event.delivery_number || idx + 1}
                        </span>
                        <span className="text-action-primary">
                          +{event.change?.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}L
                          {event.supplier && <> from <strong>{event.supplier}</strong></>}
                          {event.time && <> at <strong>{event.time}</strong></>}
                        </span>
                      </div>
                    ))}

                    {/* Fallback: show deliveries array if no timeline events */}
                    {!selectedReading.delivery_timeline?.timeline && selectedReading.deliveries?.map((d: any, idx: number) => (
                      <div key={idx} className="flex items-center gap-3 mb-2 p-2 bg-surface-card rounded border border-action-primary text-sm">
                        <span className="w-7 h-7 rounded-full bg-action-primary text-white flex items-center justify-center text-xs font-bold">
                          {idx + 1}
                        </span>
                        <span className="text-action-primary">
                          +{(d.volume_delivered || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}L
                          {d.supplier && <> from <strong>{d.supplier}</strong></>}
                          {d.delivery_time && <> at <strong>{d.delivery_time}</strong></>}
                        </span>
                      </div>
                    ))}

                    {/* Segment Sales Table */}
                    {selectedReading.delivery_timeline?.inter_delivery_sales?.length > 0 && (
                      <div className="mt-4 overflow-x-auto">
                        <h4 className="text-sm font-semibold text-action-primary mb-2">Segment Sales Breakdown</h4>
                        <table className="min-w-full text-sm border border-action-primary">
                          <thead>
                            <tr className="bg-action-primary-light">
                              <th className="px-3 py-2 text-left text-xs font-medium text-action-primary uppercase">Segment</th>
                              <th className="px-3 py-2 text-left text-xs font-medium text-action-primary uppercase">Period</th>
                              <th className="px-3 py-2 text-right text-xs font-medium text-action-primary uppercase">Start Level</th>
                              <th className="px-3 py-2 text-right text-xs font-medium text-action-primary uppercase">End Level</th>
                              <th className="px-3 py-2 text-right text-xs font-medium text-action-primary uppercase">Sales (L)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedReading.delivery_timeline.inter_delivery_sales.map((seg: any, idx: number) => (
                              <tr key={idx} className="border-t border-action-primary">
                                <td className="px-3 py-2 font-medium text-action-primary">{idx + 1}</td>
                                <td className="px-3 py-2 text-action-primary">{seg.period}</td>
                                <td className="px-3 py-2 text-right font-mono text-action-primary">{seg.start_level?.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</td>
                                <td className="px-3 py-2 text-right font-mono text-action-primary">{seg.end_level?.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</td>
                                <td className="px-3 py-2 text-right font-mono font-semibold text-action-primary">{seg.sales_volume?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                              </tr>
                            ))}
                            <tr className="border-t-2 border-action-primary bg-action-primary-light">
                              <td colSpan={4} className="px-3 py-2 text-right font-bold text-action-primary">Total</td>
                              <td className="px-3 py-2 text-right font-mono font-bold text-action-primary">
                                {selectedReading.delivery_timeline.total_sales?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Cross-check */}
                    {selectedReading.delivery_timeline?.formula_sales !== undefined && (
                      <div className="mt-3 p-2 rounded bg-surface-card border border-action-primary text-xs text-action-primary">
                        <strong>Cross-check:</strong> Formula sales = {selectedReading.delivery_timeline.formula_sales?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} L
                        {' | '}Segment sum = {selectedReading.delivery_timeline.total_sales?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} L
                        {Math.abs((selectedReading.delivery_timeline.formula_sales || 0) - (selectedReading.delivery_timeline.total_sales || 0)) < 1
                          ? <span className="ml-2 text-status-success font-semibold">Match</span>
                          : <span className="ml-2 text-status-error font-semibold">Mismatch</span>
                        }
                      </div>
                    )}

                    {/* Validation */}
                    {selectedReading.delivery_timeline?.validation?.warnings?.length > 0 && (
                      <div className="mt-3 p-3 rounded bg-status-pending-light border border-status-warning">
                        <p className="text-xs font-semibold text-status-warning mb-1">Warnings</p>
                        <ul className="text-xs text-status-warning space-y-1">
                          {selectedReading.delivery_timeline.validation.warnings.map((w: string, i: number) => (
                            <li key={i}>- {w}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex justify-end mt-6">
                  <button
                    onClick={() => setSelectedReading(null)}
                    className="px-6 py-2 rounded-md text-white hover:opacity-90"
                    style={{ backgroundColor: theme.primary }}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
