import { authFetch, BASE, getHeaders } from '../lib/api'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { useTheme, getFuelColorSet } from '../contexts/ThemeContext'
import LoadingSpinner from '../components/LoadingSpinner'

interface ValidatedReading {
  reading_id: string
  shift_id: string
  tank_id: string
  reading_type: string
  mechanical_reading: number
  electronic_reading: number
  dip_reading_cm: number
  dip_reading_liters: number
  recorded_by: string
  timestamp: string
  validation_status: string
  discrepancy_mech_elec_percent: number
  discrepancy_mech_dip_percent: number
  discrepancy_elec_dip_percent: number
  max_discrepancy_percent: number
  validation_message: string
  notes?: string
}

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
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<'readings' | 'validated'>('readings')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [selectedTank, setSelectedTank] = useState('TANK-DIESEL')
  const [readings, setReadings] = useState<TankReading[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectedReading, setSelectedReading] = useState<TankReading | null>(null)

  // Validated readings state (owner-only tab)
  const [user, setUser] = useState<any>(null)
  const [validatedReadings, setValidatedReadings] = useState<ValidatedReading[]>([])
  const [validatedLoading, setValidatedLoading] = useState(false)
  const [filterStatus, setFilterStatus] = useState<string>('ALL')
  const [filterShift, setFilterShift] = useState<string>('ALL')
  const [selectedValidatedReading, setSelectedValidatedReading] = useState<ValidatedReading | null>(null)

  // Get fuel type prefix and color based on tank
  const getFuelTypePrefix = (tankId: string) => {
    return tankId === 'TANK-DIESEL' ? 'LSD' : 'UNL'
  }

  // Load user and handle tab query param
  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (userData) {
      setUser(JSON.parse(userData))
    }
    if (router.query.tab === 'validated') {
      setActiveTab('validated')
    }
  }, [router.query.tab])

  // Set default date range (last 7 days)
  useEffect(() => {
    const today = new Date()
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(today.getDate() - 7)

    setEndDate(today.toISOString().split('T')[0])
    setStartDate(sevenDaysAgo.toISOString().split('T')[0])
  }, [])

  // Load validated readings when tab switches to validated
  useEffect(() => {
    if (activeTab === 'validated' && user?.role === 'owner') {
      loadValidatedReadings()
    }
  }, [activeTab, user])

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

  const loadValidatedReadings = async () => {
    setValidatedLoading(true)
    try {
      const response = await authFetch(`${BASE}/validated-readings`, {
        headers: getHeaders()
      })
      if (response.ok) {
        const data = await response.json()
        const sorted = data.sort((a: ValidatedReading, b: ValidatedReading) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        )
        setValidatedReadings(sorted)
      }
    } catch (err) {
      console.error('Error loading validated readings:', err)
    } finally {
      setValidatedLoading(false)
    }
  }

  const getValidatedStatusIcon = (status: string) => {
    switch (status) {
      case 'PASS': return '\u2713'
      case 'WARNING': return '\u26A0'
      case 'FAIL': return '\u2717'
      default: return '?'
    }
  }

  const filteredValidatedReadings = validatedReadings.filter(r => {
    if (filterStatus !== 'ALL' && r.validation_status !== filterStatus) return false
    if (filterShift !== 'ALL' && r.shift_id !== filterShift) return false
    return true
  })

  const uniqueShifts = Array.from(new Set(validatedReadings.map(r => r.shift_id)))

  const validatedStats = {
    total: validatedReadings.length,
    pass: validatedReadings.filter(r => r.validation_status === 'PASS').length,
    warning: validatedReadings.filter(r => r.validation_status === 'WARNING').length,
    fail: validatedReadings.filter(r => r.validation_status === 'FAIL').length
  }

  return (
    <div className="min-h-screen p-6 transition-colors duration-300" style={{ backgroundColor: theme.background }}>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold transition-colors duration-300" style={{ color: theme.textPrimary }}>
            Tank Readings & Monitor
          </h1>
          <p className="mt-2 transition-colors duration-300" style={{ color: theme.textSecondary }}>
            View tank readings history and validated readings monitor
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="mb-6 border-b border-surface-border">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('readings')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'readings'
                  ? 'border-action-primary text-action-primary'
                  : 'border-transparent text-content-secondary hover:text-content-primary hover:border-surface-border'
              }`}
            >
              Tank Readings
            </button>
            {user?.role === 'owner' && (
              <button
                onClick={() => setActiveTab('validated')}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === 'validated'
                    ? 'border-action-primary text-action-primary'
                    : 'border-transparent text-content-secondary hover:text-content-primary hover:border-surface-border'
                }`}
              >
                Validated Readings
              </button>
            )}
          </nav>
        </div>

        {activeTab === 'readings' && (<>
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
        {activeTab === 'readings' && selectedReading && (
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
        </>)}

        {/* Validated Readings Tab (Owner Only) */}
        {activeTab === 'validated' && user?.role === 'owner' && (
          <div>
            {/* Statistics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-surface-card p-4 rounded-lg shadow border-l-4 border-action-primary">
                <div className="text-sm text-content-secondary">Total Readings</div>
                <div className="text-2xl font-bold">{validatedStats.total}</div>
              </div>
              <div className="bg-surface-card p-4 rounded-lg shadow border-l-4 border-status-success">
                <div className="text-sm text-content-secondary">Passed</div>
                <div className="text-2xl font-bold text-status-success">{validatedStats.pass}</div>
              </div>
              <div className="bg-surface-card p-4 rounded-lg shadow border-l-4 border-status-warning">
                <div className="text-sm text-content-secondary">Warnings</div>
                <div className="text-2xl font-bold text-status-warning">{validatedStats.warning}</div>
              </div>
              <div className="bg-surface-card p-4 rounded-lg shadow border-l-4 border-status-error">
                <div className="text-sm text-content-secondary">Failed</div>
                <div className="text-2xl font-bold text-status-error">{validatedStats.fail}</div>
              </div>
            </div>

            {/* Filters */}
            <div className="bg-surface-card p-4 rounded-lg shadow mb-6">
              <div className="flex flex-wrap gap-4">
                <div>
                  <label className="block text-sm font-medium text-content-secondary mb-1">Status Filter</label>
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="px-3 py-2 border border-surface-border rounded-md"
                  >
                    <option value="ALL">All Statuses</option>
                    <option value="PASS">Pass Only</option>
                    <option value="WARNING">Warnings Only</option>
                    <option value="FAIL">Failed Only</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-content-secondary mb-1">Shift Filter</label>
                  <select
                    value={filterShift}
                    onChange={(e) => setFilterShift(e.target.value)}
                    className="px-3 py-2 border border-surface-border rounded-md"
                  >
                    <option value="ALL">All Shifts</option>
                    {uniqueShifts.map(shift => (
                      <option key={shift} value={shift}>{shift}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end">
                  <button
                    onClick={loadValidatedReadings}
                    className="px-4 py-2 bg-action-primary text-white rounded-md hover:bg-action-primary-hover"
                  >
                    Refresh
                  </button>
                </div>
              </div>
            </div>

            {/* Validated Readings Table */}
            <div className="bg-surface-card rounded-lg shadow overflow-hidden">
              {validatedLoading ? (
                <LoadingSpinner text="Loading validated readings..." />
              ) : filteredValidatedReadings.length === 0 ? (
                <div className="p-8 text-center text-content-secondary">No readings found matching filters.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-surface-border">
                    <thead className="bg-surface-bg">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase">Date/Time</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase">Shift</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase">Tank</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase">Type</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase">Mechanical (L)</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase">Electronic (L)</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase">Dip (L)</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase">Max Discrepancy</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-surface-card divide-y divide-surface-border">
                      {filteredValidatedReadings.map((reading) => (
                        <tr key={reading.reading_id} className="hover:bg-surface-bg">
                          <td className="px-4 py-3 text-sm text-content-primary">{new Date(reading.timestamp).toLocaleString()}</td>
                          <td className="px-4 py-3 text-sm text-content-primary">{reading.shift_id}</td>
                          <td className="px-4 py-3 text-sm text-content-primary">{reading.tank_id}</td>
                          <td className="px-4 py-3 text-sm text-content-primary">{reading.reading_type}</td>
                          <td className="px-4 py-3 text-sm font-mono text-content-primary">{reading.mechanical_reading.toFixed(2)}</td>
                          <td className="px-4 py-3 text-sm font-mono text-content-primary">{reading.electronic_reading.toFixed(2)}</td>
                          <td className="px-4 py-3 text-sm font-mono text-content-primary">{reading.dip_reading_liters.toFixed(2)}</td>
                          <td className="px-4 py-3 text-sm font-mono text-content-primary">
                            <span className={reading.max_discrepancy_percent > 0.03 ? 'text-status-error font-bold' : ''}>
                              {reading.max_discrepancy_percent.toFixed(4)}%
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <span className={`px-3 py-1 rounded-full text-xs font-bold border ${getStatusColor(reading.validation_status)}`}>
                              {getValidatedStatusIcon(reading.validation_status)} {reading.validation_status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <button
                              onClick={() => setSelectedValidatedReading(reading)}
                              className="text-action-primary hover:text-action-primary font-medium"
                            >
                              Details
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Validated Reading Details Modal */}
        {selectedValidatedReading && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setSelectedValidatedReading(null)}>
            <div className="bg-surface-card rounded-lg shadow-xl max-w-2xl w-full m-4 max-h-screen overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <h2 className="text-2xl font-bold">Reading Details</h2>
                  <button onClick={() => setSelectedValidatedReading(null)} className="text-content-secondary hover:text-content-primary text-2xl">&times;</button>
                </div>

                <div className="space-y-4">
                  {/* Status Banner */}
                  <div className={`p-4 rounded-lg border-2 ${getStatusColor(selectedValidatedReading.validation_status)}`}>
                    <div className="text-center">
                      <div className="text-3xl font-bold mb-2">{getValidatedStatusIcon(selectedValidatedReading.validation_status)} {selectedValidatedReading.validation_status}</div>
                      <div className="text-sm">{selectedValidatedReading.validation_message}</div>
                    </div>
                  </div>

                  {/* Reading Information */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-content-secondary">Reading ID</label>
                      <div className="text-sm">{selectedValidatedReading.reading_id}</div>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-content-secondary">Timestamp</label>
                      <div className="text-sm">{new Date(selectedValidatedReading.timestamp).toLocaleString()}</div>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-content-secondary">Shift ID</label>
                      <div className="text-sm">{selectedValidatedReading.shift_id}</div>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-content-secondary">Tank ID</label>
                      <div className="text-sm">{selectedValidatedReading.tank_id}</div>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-content-secondary">Reading Type</label>
                      <div className="text-sm">{selectedValidatedReading.reading_type}</div>
                    </div>
                  </div>

                  {/* Three Readings Comparison */}
                  <div className="border-t pt-4">
                    <h3 className="font-semibold mb-3">Reading Comparison</h3>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="bg-action-primary-light p-4 rounded-lg border border-action-primary">
                        <div className="text-sm font-medium text-action-primary mb-1">Mechanical</div>
                        <div className="text-2xl font-bold text-action-primary">{selectedValidatedReading.mechanical_reading.toFixed(2)}</div>
                        <div className="text-xs text-action-primary">Liters</div>
                      </div>
                      <div className="bg-fuel-petrol-light p-4 rounded-lg border border-fuel-petrol-border">
                        <div className="text-sm font-medium text-fuel-petrol mb-1">Electronic</div>
                        <div className="text-2xl font-bold text-fuel-petrol">{selectedValidatedReading.electronic_reading.toFixed(2)}</div>
                        <div className="text-xs text-status-success">Liters</div>
                      </div>
                      <div className="bg-fuel-diesel-light p-4 rounded-lg border border-fuel-diesel-border">
                        <div className="text-sm font-medium text-fuel-diesel mb-1">Dip Reading</div>
                        <div className="text-2xl font-bold text-fuel-diesel">{selectedValidatedReading.dip_reading_liters.toFixed(2)}</div>
                        <div className="text-xs text-fuel-diesel">{selectedValidatedReading.dip_reading_cm.toFixed(1)} cm</div>
                      </div>
                    </div>
                  </div>

                  {/* Discrepancy Analysis */}
                  <div className="border-t pt-4">
                    <h3 className="font-semibold mb-3">Discrepancy Analysis</h3>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-content-secondary">Mechanical vs Electronic:</span>
                        <span className="font-mono font-bold">{selectedValidatedReading.discrepancy_mech_elec_percent.toFixed(4)}%</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-content-secondary">Mechanical vs Dip:</span>
                        <span className="font-mono font-bold">{selectedValidatedReading.discrepancy_mech_dip_percent.toFixed(4)}%</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-content-secondary">Electronic vs Dip:</span>
                        <span className="font-mono font-bold">{selectedValidatedReading.discrepancy_elec_dip_percent.toFixed(4)}%</span>
                      </div>
                      <div className="flex justify-between items-center pt-2 border-t">
                        <span className="text-sm font-semibold text-content-secondary">Maximum Discrepancy:</span>
                        <span className={`font-mono font-bold text-lg ${selectedValidatedReading.max_discrepancy_percent > 0.03 ? 'text-status-error' : 'text-status-success'}`}>
                          {selectedValidatedReading.max_discrepancy_percent.toFixed(4)}%
                        </span>
                      </div>
                      <div className="text-xs text-content-secondary text-center mt-2">Tolerance: 0.03%</div>
                    </div>
                  </div>

                  {/* Notes */}
                  {selectedValidatedReading.notes && (
                    <div className="border-t pt-4">
                      <h3 className="font-semibold mb-2">Notes</h3>
                      <div className="text-sm text-content-secondary bg-surface-bg p-3 rounded">{selectedValidatedReading.notes}</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
