import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/router'
import useSWR from 'swr'
import { getHeaders, authFetch } from '../lib/api'
import { useTanks, tankLabel } from '../hooks/useTanks'
import ExportButtons from '../components/ExportButtons'
import { ExportConfig } from '../lib/exportUtils'
import { formatDateToDisplay } from '../lib/dateUtils'

const BASE = '/api/v1'

interface TankReading {
  reading_id: string
  tank_id: string
  fuel_type: string
  date: string
  opening_volume: number
  closing_volume: number
  before_offload_volume?: number
  after_offload_volume?: number
  tank_volume_movement: number
  delivery_occurred: boolean
  delivery_volume?: number
  validation_status: string
  validation_messages: string[]
  recorded_by: string
  created_at: string
  supplier?: string
  invoice_number?: string
  notes?: string
}

interface Delivery {
  delivery_id: string
  tank_id: string
  fuel_type: string
  date: string
  time: string
  before_delivery_dip_cm?: number
  after_delivery_dip_cm?: number
  volume_before: number
  volume_after: number
  actual_volume_delivered: number
  invoice_volume_liters?: number
  expected_volume?: number
  flowmeter_volume?: number
  delivery_variance?: number
  variance_percent?: number
  supplier: string
  invoice_number?: string
  validation_status: string
  validation_message: string
  recon_invoice_vs_flowmeter?: number
  recon_flowmeter_vs_tank?: number
  recon_invoice_vs_tank?: number
  recon_status?: string
  recon_outlier?: string
  recorded_by: string
  created_at: string
}

interface QueuedTankDelivery {
  id: string
  date: string
  time: string
  before_delivery_dip_cm: string
  after_delivery_dip_cm: string
  computed_before_vol?: number  // cached from calibration preview at add time
  computed_after_vol?: number
  supplier: string
  invoice_number: string
  invoice_volume_liters: string
  flowmeter_volume: string
  temperature: string
  notes: string
  status: 'pending' | 'submitted' | 'error'
  result?: any
  error?: string
}

export default function FuelOperations() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [activeTab, setActiveTab] = useState<'levels' | 'readings' | 'deliveries' | 'summary'>('levels')
  const canManageDeliveries = user?.role === 'manager' || user?.role === 'owner'
  const { tanks: availableTanks } = useTanks()
  const [selectedTank, setSelectedTank] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [showDeliveryForm, setShowDeliveryForm] = useState(false)

  // Default to first available tank on load
  useEffect(() => {
    if (!selectedTank && availableTanks.length > 0) {
      setSelectedTank(availableTanks[0].tank_id)
    }
  }, [availableTanks, selectedTank])

  useEffect(() => {
    authFetch(`${BASE}/settings/fuel`, { headers: getHeaders() })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data) setFuelPrices({ Petrol: data.petrol_price_per_liter || 0, Diesel: data.diesel_price_per_liter || 0 })
      })
      .catch(() => {})
  }, [])

  // Tank Reading Form State
  const [readingForm, setReadingForm] = useState({
    date: new Date().toISOString().split('T')[0],
    opening_volume: '',
    closing_volume: '',
    notes: ''
  })

  // Delivery Form State
  const [deliveryForm, setDeliveryForm] = useState({
    date: new Date().toISOString().split('T')[0],
    time: '',
    before_delivery_dip_cm: '',
    after_delivery_dip_cm: '',
    supplier: '',
    invoice_number: '',
    invoice_volume_liters: '',
    flowmeter_volume: '',
    temperature: '',
    notes: ''
  })
  const [beforeVolPreview, setBeforeVolPreview] = useState<number | null>(null)
  const [afterVolPreview, setAfterVolPreview] = useState<number | null>(null)

  const [readings, setReadings] = useState<TankReading[]>([])
  const [deliveries, setDeliveries] = useState<Delivery[]>([])
  const [deliveryQueue, setDeliveryQueue] = useState<QueuedTankDelivery[]>([])
  const [submittingQueue, setSubmittingQueue] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [fuelPrices, setFuelPrices] = useState<Record<string, number>>({ Petrol: 0, Diesel: 0 })

  // Summary tab state
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [summaryMovements, setSummaryMovements] = useState<any>(null)
  const [summarySales, setSummarySales] = useState<any[]>([])
  const [summaryLoading, setSummaryLoading] = useState(false)

  // ===== Tank Levels Tab (from stock-movement.tsx) =====
  const today = new Date().toISOString().split('T')[0]

  const { data: tankLevels, mutate: mutateLevels } = useSWR(
    activeTab === 'levels' ? 'tank-levels' : null,
    () => authFetch(`${BASE}/tanks/levels`, { headers: getHeaders() }).then(r => r.ok ? r.json() : []),
    { refreshInterval: 10000 }
  )

  const { data: todaySales } = useSWR(
    activeTab === 'levels' ? 'sales-today' : null,
    () => authFetch(`${BASE}/sales/date/${today}`, { headers: getHeaders() }).then(r => r.ok ? r.json() : []),
    { refreshInterval: 10000 }
  )

  const { data: levelsMovements, mutate: mutateLevelsMovements } = useSWR(
    activeTab === 'levels' ? `movements-${selectedTank}-${today}` : null,
    () => authFetch(`${BASE}/tanks/${selectedTank}/movements?date=${today}`, { headers: getHeaders() }).then(r => r.ok ? r.json() : null),
    { refreshInterval: 10000 }
  )

  const currentStock = tankLevels?.find((t: any) => t.tank_id === selectedTank) || null

  // Calculate preview of tank movement
  const calculateMovementPreview = () => {
    const opening = parseFloat(readingForm.opening_volume)
    const closing = parseFloat(readingForm.closing_volume)
    if (!opening || !closing) return 0
    return opening - closing
  }

  const calculateDeliveryPreview = () => {
    if (afterVolPreview === null || beforeVolPreview === null) return 0
    return afterVolPreview - beforeVolPreview
  }

  const fetchSummary = async () => {
    setSummaryLoading(true)
    try {
      const [movementsRes, salesRes] = await Promise.all([
        authFetch(`${BASE}/tanks/${selectedTank}/movements?date=${selectedDate}`, { headers: getHeaders() }),
        authFetch(`${BASE}/sales/date/${selectedDate}`, { headers: getHeaders() })
      ])
      if (movementsRes.ok) {
        setSummaryMovements(await movementsRes.json())
      } else {
        setSummaryMovements(null)
      }
      if (salesRes.ok) {
        setSummarySales(await salesRes.json())
      } else {
        setSummarySales([])
      }
    } catch (err) {
      console.error('Error fetching summary:', err)
    } finally {
      setSummaryLoading(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'summary') {
      fetchSummary()
    }
  }, [activeTab, selectedTank, selectedDate])

  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (!userData) {
      router.push('/login')
      return
    }
    setUser(JSON.parse(userData))
    fetchReadings()
    fetchDeliveries()
  }, [selectedTank])

  const fetchReadings = async () => {
    try {
      const res = await authFetch(`${BASE}/tank-readings/readings/${selectedTank}`, {
        headers: getHeaders()
      })
      if (res.ok) {
        const data = await res.json()
        setReadings(data)
      }
    } catch (err) {
      console.error('Error fetching readings:', err)
    }
  }

  const fetchDeliveries = async () => {
    try {
      const res = await authFetch(`${BASE}/tank-readings/deliveries/${selectedTank}`, {
        headers: getHeaders()
      })
      if (res.ok) {
        const data = await res.json()
        setDeliveries(data)
      }
    } catch (err) {
      console.error('Error fetching deliveries:', err)
    }
  }

  const submitReading = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')

    try {
      const payload = {
        tank_id: selectedTank,
        date: readingForm.date,
        opening_volume: parseFloat(readingForm.opening_volume),
        closing_volume: parseFloat(readingForm.closing_volume),
        delivery_occurred: false,
        recorded_by: user.user_id,
        notes: readingForm.notes || null
      }

      const res = await authFetch(`${BASE}/tank-readings/readings`, {
        method: 'POST',
        headers: {
          ...getHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.detail?.message || errorData.detail || 'Failed to submit reading')
      }

      setSuccess('Tank reading submitted successfully!')
      setShowForm(false)
      setReadingForm({
        date: new Date().toISOString().split('T')[0],
        opening_volume: '',
        closing_volume: '',
        notes: ''
      })
      fetchReadings()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const fetchDipVolume = async (dipCm: string, setter: (v: number | null) => void) => {
    if (!selectedTank || !dipCm || isNaN(parseFloat(dipCm))) {
      setter(null)
      return
    }
    try {
      const res = await authFetch(
        `${BASE}/settings/tank-calibration/${selectedTank}/convert?dip_cm=${parseFloat(dipCm)}`,
        { headers: getHeaders() }
      )
      if (res.ok) {
        const data = await res.json()
        setter(data.volume_liters ?? null)
      } else {
        setter(null)
      }
    } catch {
      setter(null)
    }
  }

  const addDeliveryToQueue = (e: React.FormEvent) => {
    e.preventDefault()
    const newDelivery: QueuedTankDelivery = {
      id: crypto.randomUUID(),
      date: deliveryForm.date,
      time: deliveryForm.time,
      before_delivery_dip_cm: deliveryForm.before_delivery_dip_cm,
      after_delivery_dip_cm: deliveryForm.after_delivery_dip_cm,
      computed_before_vol: beforeVolPreview ?? undefined,
      computed_after_vol: afterVolPreview ?? undefined,
      supplier: deliveryForm.supplier,
      invoice_number: deliveryForm.invoice_number,
      invoice_volume_liters: deliveryForm.invoice_volume_liters,
      flowmeter_volume: deliveryForm.flowmeter_volume,
      temperature: deliveryForm.temperature,
      notes: deliveryForm.notes,
      status: 'pending',
    }
    setDeliveryQueue(prev => [...prev, newDelivery].sort((a, b) => a.time.localeCompare(b.time)))
    setError('')
    setSuccess('')
    setBeforeVolPreview(null)
    setAfterVolPreview(null)
    setDeliveryForm({
      ...deliveryForm,
      time: '',
      before_delivery_dip_cm: '',
      after_delivery_dip_cm: '',
      supplier: '',
      invoice_number: '',
      invoice_volume_liters: '',
      flowmeter_volume: '',
      temperature: '',
      notes: ''
    })
  }

  const removeFromDeliveryQueue = (id: string) => {
    setDeliveryQueue(prev => prev.filter(d => d.id !== id))
  }

  const clearCompletedDeliveries = () => {
    setDeliveryQueue(prev => prev.filter(d => d.status === 'pending' || d.status === 'error'))
  }

  const submitAllDeliveries = async () => {
    setSubmittingQueue(true)
    setError('')
    setSuccess('')

    const pending = deliveryQueue.filter(d => d.status === 'pending' || d.status === 'error')
    for (const delivery of pending) {
      setDeliveryQueue(prev => prev.map(d => d.id === delivery.id ? { ...d, status: 'pending' as const, error: undefined } : d))

      try {
        const payload = {
          tank_id: selectedTank,
          date: delivery.date,
          time: delivery.time,
          before_delivery_dip_cm: parseFloat(delivery.before_delivery_dip_cm),
          after_delivery_dip_cm: parseFloat(delivery.after_delivery_dip_cm),
          supplier: delivery.supplier,
          invoice_number: delivery.invoice_number || null,
          invoice_volume_liters: delivery.invoice_volume_liters ? parseFloat(delivery.invoice_volume_liters) : null,
          flowmeter_volume: delivery.flowmeter_volume ? parseFloat(delivery.flowmeter_volume) : null,
          temperature: delivery.temperature ? parseFloat(delivery.temperature) : null,
          recorded_by: user.user_id,
          notes: delivery.notes || null
        }

        const res = await authFetch(`${BASE}/tank-readings/deliveries`, {
          method: 'POST',
          headers: {
            ...getHeaders(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload)
        })

        if (!res.ok) {
          const errorData = await res.json()
          throw new Error(errorData.detail || 'Failed to record delivery')
        }

        const data = await res.json()
        setDeliveryQueue(prev => prev.map(d => d.id === delivery.id ? { ...d, status: 'submitted' as const, result: data } : d))
      } catch (err: any) {
        setDeliveryQueue(prev => prev.map(d => d.id === delivery.id ? { ...d, status: 'error' as const, error: err.message || 'Failed' } : d))
      }
    }

    fetchDeliveries()
    mutateLevels()
    mutateLevelsMovements()
    setSubmittingQueue(false)
    if (pending.length > 0) {
      setSuccess('Batch submission complete')
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PASS': return 'text-status-success bg-status-success-light'
      case 'WARNING': return 'text-status-warning bg-status-pending-light'
      case 'FAIL': return 'text-status-error bg-status-error-light'
      default: return 'text-content-secondary bg-surface-bg'
    }
  }

  const getExportConfig = useCallback((): ExportConfig | null => {
    if (deliveries.length > 0) {
      return {
        title: 'Fuel Operations — Deliveries',
        filename: `fuel_operations_${new Date().toISOString().slice(0,10)}`,
        columns: [
          { header: 'Date', key: 'date' },
          { header: 'Tank', key: 'tank_id' },
          { header: 'Supplier', key: 'supplier' },
          { header: 'Invoice', key: 'invoice_number' },
          { header: 'Expected (L)', key: 'expected_volume', format: 'number' },
          { header: 'Flowmeter (L)', key: 'flowmeter_volume', format: 'number' },
          { header: 'Actual (L)', key: 'actual_volume', format: 'number' },
          { header: 'Variance (L)', key: 'variance', format: 'number' },
        ],
        data: deliveries,
      }
    }
    if (readings.length > 0) {
      return {
        title: 'Fuel Operations — Readings',
        filename: `fuel_readings_${new Date().toISOString().slice(0,10)}`,
        columns: [
          { header: 'Date', key: 'date' },
          { header: 'Shift', key: 'shift_type' },
          { header: 'Tank', key: 'tank_id' },
          { header: 'Opening Dip', key: 'opening_dip_cm', format: 'number' },
          { header: 'Closing Dip', key: 'closing_dip_cm', format: 'number' },
          { header: 'Opening Vol (L)', key: 'opening_volume_liters', format: 'number' },
          { header: 'Closing Vol (L)', key: 'closing_volume_liters', format: 'number' },
        ],
        data: readings,
      }
    }
    return null
  }, [deliveries, readings])

  return (
    <div className="min-h-screen bg-surface-bg p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h1 className="text-3xl font-bold text-content-primary">Fuel Operations</h1>
              <p className="text-content-secondary mt-1">Real-time tank levels, readings, deliveries, and movement summary</p>
            </div>
            <ExportButtons getConfig={getExportConfig} />
          </div>
        </div>

        {/* Tank Selector */}
        <div className="bg-surface-card rounded-lg shadow p-4 mb-6">
          <label className="block text-sm font-medium text-content-secondary mb-2">Select Tank</label>
          <select
            value={selectedTank}
            onChange={(e) => setSelectedTank(e.target.value)}
            className="w-full max-w-xs px-4 py-2 border border-surface-border rounded-md focus:ring-2 focus:ring-action-primary"
          >
            {availableTanks.map(t => (
              <option key={t.tank_id} value={t.tank_id}>
                {tankLabel(t)}
              </option>
            ))}
          </select>
        </div>

        {/* Success/Error Messages */}
        {success && (
          <div className="bg-status-success-light border border-status-success rounded-md p-4 mb-6">
            <p className="text-status-success">{success}</p>
          </div>
        )}
        {error && (
          <div className="bg-status-error-light border border-status-error rounded-md p-4 mb-6">
            <p className="text-status-error">{error}</p>
          </div>
        )}

        {/* Tabs */}
        <div className="bg-surface-card rounded-lg shadow mb-6">
          <div className="border-b border-surface-border">
            <nav className="flex -mb-px overflow-x-auto">
              <button
                onClick={() => setActiveTab('levels')}
                className={`px-6 py-3 font-medium text-sm border-b-2 whitespace-nowrap flex-shrink-0 ${
                  activeTab === 'levels'
                    ? 'border-action-primary text-action-primary'
                    : 'border-transparent text-content-secondary hover:text-content-secondary'
                }`}
              >
                Tank Levels
              </button>
              {canManageDeliveries && (
              <button
                onClick={() => setActiveTab('deliveries')}
                className={`px-6 py-3 font-medium text-sm border-b-2 whitespace-nowrap flex-shrink-0 ${
                  activeTab === 'deliveries'
                    ? 'border-action-primary text-action-primary'
                    : 'border-transparent text-content-secondary hover:text-content-secondary'
                }`}
              >
                Deliveries
              </button>
              )}
              <button
                onClick={() => setActiveTab('readings')}
                className={`px-6 py-3 font-medium text-sm border-b-2 whitespace-nowrap flex-shrink-0 ${
                  activeTab === 'readings'
                    ? 'border-action-primary text-action-primary'
                    : 'border-transparent text-content-secondary hover:text-content-secondary'
                }`}
              >
                Tank Readings
              </button>
              <button
                onClick={() => setActiveTab('summary')}
                className={`px-6 py-3 font-medium text-sm border-b-2 whitespace-nowrap flex-shrink-0 ${
                  activeTab === 'summary'
                    ? 'border-action-primary text-action-primary'
                    : 'border-transparent text-content-secondary hover:text-content-secondary'
                }`}
              >
                Summary & Analytics
              </button>
            </nav>
          </div>

          <div className="p-6">
            {/* ===== Tank Levels Tab (from stock-movement.tsx) ===== */}
            {activeTab === 'levels' && (
              <div>
                {/* Current Tank Stock Display */}
                <div className="mb-6 bg-gradient-to-r from-action-primary-light to-indigo-50 rounded-lg p-6 border-2 border-action-primary">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-semibold text-action-primary mb-1">Current Tank Level</h2>
                      <p className="text-sm text-action-primary">
                        {(() => { const t = availableTanks.find(t => t.tank_id === selectedTank); return t ? tankLabel(t) : 'Fuel Tank' })()}
                      </p>
                    </div>
                    {currentStock ? (
                      <div className="text-right">
                        <div className="text-4xl font-bold text-action-primary">
                          {currentStock.current_level
                            ? currentStock.current_level.toLocaleString(undefined, {maximumFractionDigits: 0})
                            : 'N/A'}
                        </div>
                        <div className="text-sm text-action-primary font-medium">Liters</div>
                        <div className="text-xs text-action-primary mt-1">
                          {currentStock.percentage?.toFixed(1)}% Full
                        </div>
                        {currentStock.last_updated && (
                          <div className="text-xs text-action-primary mt-1">
                            Updated: {new Date(currentStock.last_updated).toLocaleString()}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-content-secondary text-sm">No data available</div>
                    )}
                  </div>

                  {currentStock && currentStock.current_level && (
                    <div className="mt-4 pt-4 border-t border-action-primary">
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-action-primary text-xs">Current Level</p>
                          <p className="font-semibold text-action-primary">{currentStock.current_level.toLocaleString(undefined, {maximumFractionDigits: 0})} L</p>
                        </div>
                        <div>
                          <p className="text-action-primary text-xs">Tank Capacity</p>
                          <p className="font-semibold text-action-primary">{currentStock.capacity?.toLocaleString(undefined, {maximumFractionDigits: 0})} L</p>
                        </div>
                      </div>
                      <div className="mt-3">
                        <div className="w-full bg-surface-border rounded-full h-3">
                          <div
                            className={`h-3 rounded-full transition-all duration-300 ${
                              currentStock.percentage >= 95 ? 'bg-status-error' :
                              currentStock.percentage >= 85 ? 'bg-yellow-500' :
                              'bg-action-primary'
                            }`}
                            style={{ width: `${Math.min(currentStock.percentage || 0, 100)}%` }}
                          ></div>
                        </div>
                        <p className="text-xs text-content-secondary mt-1 text-center">
                          {currentStock.percentage?.toFixed(1)}% capacity
                        </p>
                      </div>
                      {currentStock.percentage >= 90 && (
                        <div className="mt-3 p-2 bg-status-pending-light border border-status-warning rounded text-xs text-status-warning">
                          Warning: Tank is {currentStock.percentage?.toFixed(1)}% full.
                          Available space: {((currentStock.capacity - currentStock.current_level)).toLocaleString(undefined, {maximumFractionDigits: 0})} L
                        </div>
                      )}
                    </div>
                  )}

                  <button
                    onClick={() => mutateLevels()}
                    className="mt-3 text-xs text-action-primary hover:text-action-primary underline"
                  >
                    Refresh Current Stock
                  </button>
                </div>

                {/* Today's Activity */}
                {(() => {
                  const fuelType = availableTanks.find(t => t.tank_id === selectedTank)?.fuel_type || 'Diesel'
                  const ppl = fuelPrices[fuelType] || 0
                  const todayDelivered = levelsMovements?.summary?.total_delivered ?? 0
                  const todaySold = levelsMovements?.summary?.total_sold ?? 0
                  const netChange = todayDelivered - todaySold
                  const maxBar = Math.max(todayDelivered, todaySold, 1)
                  const fmtK = (v: number) => `ZMW ${(v * ppl).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

                  return (
                    <div className="mb-6">
                      <h2 className="text-xl font-semibold mb-4">Today's Activity — {fuelType} {ppl > 0 && <span className="text-sm font-normal text-content-secondary">@ K{ppl}/L</span>}</h2>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                        <div className="bg-status-success-light rounded-lg p-4 border border-status-success">
                          <p className="text-xs text-status-success font-medium">Deliveries In</p>
                          <p className="text-2xl font-bold text-status-success">{todayDelivered.toLocaleString(undefined, { maximumFractionDigits: 0 })} L</p>
                          {ppl > 0 && <p className="text-xs text-status-success/70 font-mono mt-0.5">{fmtK(todayDelivered)}</p>}
                        </div>
                        <div className="bg-status-error-light rounded-lg p-4 border border-status-error">
                          <p className="text-xs text-status-error font-medium">Sales Out</p>
                          <p className="text-2xl font-bold text-status-error">{todaySold.toLocaleString(undefined, { maximumFractionDigits: 0 })} L</p>
                          {ppl > 0 && <p className="text-xs text-status-error/70 font-mono mt-0.5">{fmtK(todaySold)}</p>}
                        </div>
                        <div className={`rounded-lg p-4 border ${netChange >= 0 ? 'bg-status-success-light border-status-success' : 'bg-status-error-light border-status-error'}`}>
                          <p className={`text-xs font-medium ${netChange >= 0 ? 'text-status-success' : 'text-status-error'}`}>Net Change</p>
                          <p className={`text-2xl font-bold ${netChange >= 0 ? 'text-status-success' : 'text-status-error'}`}>
                            {netChange >= 0 ? '+' : ''}{netChange.toLocaleString(undefined, { maximumFractionDigits: 0 })} L
                          </p>
                          {ppl > 0 && <p className={`text-xs font-mono mt-0.5 ${netChange >= 0 ? 'text-status-success/70' : 'text-status-error/70'}`}>{fmtK(netChange)}</p>}
                        </div>
                      </div>
                      {/* Visual bar */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-content-secondary w-12">In</span>
                          <div className="flex-1 bg-surface-bg rounded-full h-4">
                            <div className="bg-status-success h-4 rounded-full transition-all" style={{ width: `${(todayDelivered / maxBar) * 100}%` }}></div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-content-secondary w-12">Out</span>
                          <div className="flex-1 bg-surface-bg rounded-full h-4">
                            <div className="bg-status-error h-4 rounded-full transition-all" style={{ width: `${(todaySold / maxBar) * 100}%` }}></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })()}

                {/* Stock Movements Timeline */}
                <div>
                  <h2 className="text-xl font-semibold mb-4">Stock Movements -- {today}</h2>
                  {!levelsMovements && (
                    <div className="text-content-secondary text-sm">Loading movements...</div>
                  )}
                  {levelsMovements && levelsMovements.movements?.length === 0 && (
                    <div className="text-content-secondary text-sm">No movements recorded today</div>
                  )}
                  {levelsMovements && levelsMovements.movements?.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-surface-border">
                        <thead className="bg-surface-bg">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase">Time</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase">Type</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase">Volume</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase">Value (ZMW)</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase">Reference</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase">Description</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-content-secondary uppercase">Running Net</th>
                          </tr>
                        </thead>
                        <tbody className="bg-surface-card divide-y divide-surface-border">
                          {levelsMovements.movements.map((m: any, idx: number) => {
                            const runningNet = levelsMovements.movements
                              .slice(0, idx + 1)
                              .reduce((sum: number, mv: any) => sum + mv.volume, 0)

                            return (
                              <tr key={idx} className="hover:bg-surface-bg">
                                <td className="px-4 py-3 text-sm text-content-secondary font-mono">
                                  {m.timestamp ? new Date(m.timestamp).toLocaleTimeString() : '-'}
                                </td>
                                <td className="px-4 py-3 text-sm">
                                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                                    m.type === 'DELIVERY'
                                      ? 'bg-status-success-light text-status-success'
                                      : 'bg-status-error-light text-status-error'
                                  }`}>
                                    {m.type}
                                  </span>
                                </td>
                                <td className={`px-4 py-3 text-sm font-semibold ${m.volume >= 0 ? 'text-status-success' : 'text-status-error'}`}>
                                  {m.volume >= 0 ? '+' : ''}{m.volume.toLocaleString(undefined, { maximumFractionDigits: 1 })} L
                                </td>
                                <td className={`px-4 py-3 text-xs font-mono ${m.volume >= 0 ? 'text-status-success' : 'text-status-error'}`}>
                                  {(() => { const ft = availableTanks.find(t => t.tank_id === selectedTank)?.fuel_type || 'Diesel'; const p = fuelPrices[ft] || 0; return p > 0 ? `K${(Math.abs(m.volume) * p).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—' })()}
                                </td>
                                <td className="px-4 py-3 text-sm font-mono text-content-secondary">
                                  {m.reference_id}
                                </td>
                                <td className="px-4 py-3 text-sm text-content-secondary">
                                  {m.description}
                                </td>
                                <td className={`px-4 py-3 text-sm font-semibold text-right ${runningNet >= 0 ? 'text-status-success' : 'text-status-error'}`}>
                                  {runningNet >= 0 ? '+' : ''}{runningNet.toLocaleString(undefined, { maximumFractionDigits: 1 })} L
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ===== Tank Readings Tab ===== */}
            {activeTab === 'readings' && (
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                  <h2 className="text-xl font-semibold">Daily Tank Readings</h2>
                  <button
                    onClick={() => setShowForm(!showForm)}
                    className="px-4 py-2 bg-action-primary text-white rounded-md hover:bg-action-primary-hover"
                  >
                    {showForm ? 'Cancel' : '+ New Reading'}
                  </button>
                </div>

                {showForm && (
                  <form onSubmit={submitReading} className="bg-surface-bg rounded-lg p-6 mb-6 border border-surface-border">
                    <h3 className="text-lg font-semibold mb-4">Submit Tank Reading</h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="block text-sm font-medium text-content-secondary mb-1">Date</label>
                        <input
                          type="date"
                          value={readingForm.date}
                          onChange={(e) => setReadingForm({ ...readingForm, date: e.target.value })}
                          className="w-full px-3 py-2 border border-surface-border rounded-md"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-content-secondary mb-1">
                          Opening Volume (L) <span className="text-content-secondary">- Start of Day</span>
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={readingForm.opening_volume}
                          onChange={(e) => setReadingForm({ ...readingForm, opening_volume: e.target.value })}
                          className="w-full px-3 py-2 border border-surface-border rounded-md"
                          required
                          placeholder="e.g., 26887.21"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-content-secondary mb-1">
                          Closing Volume (L) <span className="text-content-secondary">- End of Day</span>
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={readingForm.closing_volume}
                          onChange={(e) => setReadingForm({ ...readingForm, closing_volume: e.target.value })}
                          className="w-full px-3 py-2 border border-surface-border rounded-md"
                          required
                          placeholder="e.g., 25117.64"
                        />
                      </div>
                    </div>

                    {/* Delivery reference */}
                    {(() => {
                      const todayDeliveries = deliveries.filter(d => d.date === readingForm.date)
                      const queuedToday = deliveryQueue.filter(d => d.date === readingForm.date)
                      const totalCount = todayDeliveries.length + queuedToday.filter(d => d.status === 'pending').length
                      if (totalCount > 0) {
                        return (
                          <div className="bg-action-primary-light rounded-lg p-4 mb-4 border border-action-primary">
                            <p className="text-sm text-action-primary">
                              {totalCount} delivery(ies) recorded for this tank on {readingForm.date}.{' '}
                              <button
                                type="button"
                                onClick={() => setActiveTab('deliveries')}
                                className="underline font-medium hover:opacity-80"
                              >
                                View in Deliveries tab
                              </button>
                            </p>
                            <p className="text-xs text-action-primary mt-1">
                              Deliveries are automatically linked to readings by the system.
                            </p>
                          </div>
                        )
                      }
                      return null
                    })()}

                    <div className="mb-4">
                      <label className="block text-sm font-medium text-content-secondary mb-1">Notes (Optional)</label>
                      <textarea
                        value={readingForm.notes}
                        onChange={(e) => setReadingForm({ ...readingForm, notes: e.target.value })}
                        className="w-full px-3 py-2 border border-surface-border rounded-md"
                        rows={2}
                      />
                    </div>

                    {/* Preview Calculation */}
                    {readingForm.opening_volume && readingForm.closing_volume && (
                      <div className="bg-status-success-light border border-status-success rounded-md p-4 mb-4">
                        <p className="text-sm font-medium text-status-success">
                          Calculated Tank Movement: <span className="text-2xl">{calculateMovementPreview().toFixed(2)} L</span>
                        </p>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <button
                        type="submit"
                        disabled={loading}
                        className="px-6 py-2 bg-action-primary text-white rounded-md hover:bg-action-primary-hover disabled:opacity-50"
                      >
                        {loading ? 'Submitting...' : 'Submit Reading'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowForm(false)}
                        className="px-6 py-2 bg-surface-border text-content-secondary rounded-md hover:opacity-80"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}

                {/* Readings List */}
                <div className="space-y-4">
                  {readings.length === 0 ? (
                    <p className="text-center text-content-secondary py-8">No readings found for this tank</p>
                  ) : (
                    readings.map((reading) => (
                      <div key={reading.reading_id} className="border border-surface-border rounded-lg p-4 hover:shadow-md transition">
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <h3 className="font-semibold text-lg">{formatDateToDisplay(reading.date)}</h3>
                            <p className="text-sm text-content-secondary">{reading.fuel_type}</p>
                          </div>
                          <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(reading.validation_status)}`}>
                            {reading.validation_status}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-3">
                          <div>
                            <p className="text-xs text-content-secondary">Opening</p>
                            <p className="font-semibold">{(reading.opening_volume ?? 0).toLocaleString()} L</p>
                          </div>
                          <div>
                            <p className="text-xs text-content-secondary">Closing</p>
                            <p className="font-semibold">{(reading.closing_volume ?? 0).toLocaleString()} L</p>
                          </div>
                          <div>
                            <p className="text-xs text-content-secondary">Movement</p>
                            <p className="font-semibold text-action-primary">{(reading.tank_volume_movement ?? 0).toLocaleString()} L</p>
                          </div>
                          {reading.delivery_occurred && reading.delivery_volume && (
                            <div>
                              <p className="text-xs text-content-secondary">Delivered</p>
                              <p className="font-semibold text-status-success">{reading.delivery_volume.toLocaleString()} L</p>
                            </div>
                          )}
                        </div>

                        {reading.delivery_occurred && (
                          <div className="bg-status-success-light rounded p-2 mb-2">
                            <p className="text-xs text-status-success">
                              Delivery: Before {reading.before_offload_volume?.toLocaleString()}L &rarr; After {reading.after_offload_volume?.toLocaleString()}L
                              {reading.supplier && ` | Supplier: ${reading.supplier}`}
                            </p>
                          </div>
                        )}

                        {(reading.validation_messages?.length ?? 0) > 0 && (
                          <div className="text-xs text-status-warning bg-status-pending-light p-2 rounded">
                            {reading.validation_messages.map((msg, i) => (
                              <p key={i}>{msg}</p>
                            ))}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* ===== Deliveries Tab ===== */}
            {activeTab === 'deliveries' && canManageDeliveries && (
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                  <h2 className="text-xl font-semibold">Fuel Deliveries</h2>
                  <button
                    onClick={() => setShowDeliveryForm(!showDeliveryForm)}
                    className="px-4 py-2 bg-status-success text-white rounded-md hover:bg-status-success/90"
                  >
                    {showDeliveryForm ? 'Cancel' : '+ Record Delivery'}
                  </button>
                </div>

                {showDeliveryForm && (
                  <form onSubmit={addDeliveryToQueue} className="bg-surface-bg rounded-lg p-6 mb-6 border border-surface-border">
                    <h3 className="text-lg font-semibold mb-4">Record Fuel Delivery</h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="block text-sm font-medium text-content-secondary mb-1">Date</label>
                        <input
                          type="date"
                          value={deliveryForm.date}
                          onChange={(e) => setDeliveryForm({ ...deliveryForm, date: e.target.value })}
                          className="w-full px-3 py-2 border border-surface-border rounded-md"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-content-secondary mb-1">Time</label>
                        <input
                          type="time"
                          value={deliveryForm.time}
                          onChange={(e) => setDeliveryForm({ ...deliveryForm, time: e.target.value })}
                          className="w-full px-3 py-2 border border-surface-border rounded-md"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-content-secondary mb-1">Dip Before Delivery (cm)</label>
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          value={deliveryForm.before_delivery_dip_cm}
                          onChange={(e) => setDeliveryForm({ ...deliveryForm, before_delivery_dip_cm: e.target.value })}
                          onBlur={(e) => fetchDipVolume(e.target.value, setBeforeVolPreview)}
                          className="w-full px-3 py-2 border border-surface-border rounded-md"
                          required
                        />
                        {beforeVolPreview !== null && (
                          <p className="text-xs text-content-secondary mt-1">= {beforeVolPreview.toFixed(0)} L</p>
                        )}
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-content-secondary mb-1">Dip After Delivery (cm)</label>
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          value={deliveryForm.after_delivery_dip_cm}
                          onChange={(e) => setDeliveryForm({ ...deliveryForm, after_delivery_dip_cm: e.target.value })}
                          onBlur={(e) => fetchDipVolume(e.target.value, setAfterVolPreview)}
                          className="w-full px-3 py-2 border border-surface-border rounded-md"
                          required
                        />
                        {afterVolPreview !== null && (
                          <p className="text-xs text-content-secondary mt-1">
                            = {afterVolPreview.toFixed(0)} L
                            {beforeVolPreview !== null && ` (delivery: ${(afterVolPreview - beforeVolPreview).toFixed(0)} L)`}
                          </p>
                        )}
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-content-secondary mb-1">Supplier</label>
                        <input
                          type="text"
                          value={deliveryForm.supplier}
                          onChange={(e) => setDeliveryForm({ ...deliveryForm, supplier: e.target.value })}
                          className="w-full px-3 py-2 border border-surface-border rounded-md"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-content-secondary mb-1">Invoice Number</label>
                        <input
                          type="text"
                          value={deliveryForm.invoice_number}
                          onChange={(e) => setDeliveryForm({ ...deliveryForm, invoice_number: e.target.value })}
                          className="w-full px-3 py-2 border border-surface-border rounded-md"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-content-secondary mb-1">Invoice Volume (L) - Optional</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={deliveryForm.invoice_volume_liters}
                          onChange={(e) => setDeliveryForm({ ...deliveryForm, invoice_volume_liters: e.target.value })}
                          className="w-full px-3 py-2 border border-surface-border rounded-md"
                          placeholder="Volume on supplier invoice"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-content-secondary mb-1">Flowmeter Reading (L) - Optional</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={deliveryForm.flowmeter_volume}
                          onChange={(e) => setDeliveryForm({ ...deliveryForm, flowmeter_volume: e.target.value })}
                          className="w-full px-3 py-2 border border-surface-border rounded-md"
                          placeholder="Gauge reading from delivery pipe"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-content-secondary mb-1">Temperature (C) - Optional</label>
                        <input
                          type="number"
                          step="0.1"
                          value={deliveryForm.temperature}
                          onChange={(e) => setDeliveryForm({ ...deliveryForm, temperature: e.target.value })}
                          className="w-full px-3 py-2 border border-surface-border rounded-md"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-content-secondary mb-1">Notes</label>
                        <textarea
                          value={deliveryForm.notes}
                          onChange={(e) => setDeliveryForm({ ...deliveryForm, notes: e.target.value })}
                          className="w-full px-3 py-2 border border-surface-border rounded-md"
                          rows={2}
                        />
                      </div>
                    </div>

                    {beforeVolPreview !== null && afterVolPreview !== null && (
                      <div className="bg-action-primary-light border border-action-primary rounded-md p-4 mb-4">
                        <p className="text-sm font-medium text-action-primary">
                          Calculated Delivery: <span className="text-2xl">{calculateDeliveryPreview().toFixed(0)} L</span>
                        </p>
                        {deliveryForm.invoice_volume_liters && (
                          <p className="text-sm text-action-primary mt-1">
                            Variance vs invoice: {(calculateDeliveryPreview() - parseFloat(deliveryForm.invoice_volume_liters)).toFixed(0)} L
                          </p>
                        )}
                      </div>
                    )}

                    <div className="flex gap-2">
                      <button
                        type="submit"
                        className="px-6 py-2 bg-status-success text-white rounded-md hover:bg-status-success/90"
                      >
                        + Add to Queue
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowDeliveryForm(false)}
                        className="px-6 py-2 bg-surface-border text-content-secondary rounded-md hover:opacity-80"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}

                {/* Delivery Queue */}
                {deliveryQueue.length > 0 && (
                  <div className="bg-surface-bg rounded-lg p-6 mb-6 border border-surface-border">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                      <h3 className="text-lg font-semibold">
                        Delivery Queue ({deliveryQueue.filter(d => d.status === 'pending').length} pending)
                      </h3>
                      {deliveryQueue.some(d => d.status === 'submitted') && (
                        <button
                          onClick={clearCompletedDeliveries}
                          className="text-sm text-content-secondary hover:text-content-primary underline"
                        >
                          Clear Completed
                        </button>
                      )}
                    </div>

                    {/* Timeline Preview */}
                    {deliveryQueue.filter(d => d.status === 'pending').length >= 2 && (
                      <div className="mb-4 p-4 bg-surface-card rounded-md border border-surface-border">
                        <p className="text-xs font-medium text-content-secondary mb-3">Timeline Preview</p>
                        <div className="relative pl-6">
                          {deliveryQueue
                            .filter(d => d.status === 'pending')
                            .sort((a, b) => a.time.localeCompare(b.time))
                            .map((delivery, idx, arr) => {
                              const bVol = delivery.computed_before_vol
                              const aVol = delivery.computed_after_vol
                              const vol = bVol != null && aVol != null ? aVol - bVol : null
                              return (
                                <div key={delivery.id} className="relative pb-4">
                                  {idx < arr.length - 1 && (
                                    <div className="absolute left-[-16px] top-3 bottom-0 w-0.5 bg-action-primary"></div>
                                  )}
                                  <div className="absolute left-[-20px] top-1.5 w-2.5 h-2.5 rounded-full bg-action-primary border-2 border-surface-card"></div>
                                  <div className="flex items-baseline gap-3">
                                    <span className="text-sm font-mono font-semibold text-action-primary">{delivery.time}</span>
                                    <span className="text-sm">
                                      {delivery.before_delivery_dip_cm} cm
                                      <span className="mx-1 text-content-secondary">&rarr;</span>
                                      {delivery.after_delivery_dip_cm} cm
                                      {bVol != null && aVol != null && (
                                        <span className="ml-1 text-content-secondary text-xs">
                                          ({bVol.toFixed(0)} L &rarr; {aVol.toFixed(0)} L)
                                        </span>
                                      )}
                                    </span>
                                    {vol != null && <span className="text-xs font-medium text-status-success">+{vol.toFixed(0)} L</span>}
                                  </div>
                                  {delivery.supplier && (
                                    <p className="text-xs text-content-secondary mt-0.5">{delivery.supplier}</p>
                                  )}
                                </div>
                              )
                            })}
                        </div>
                      </div>
                    )}

                    {/* Dip sequence warning */}
                    {(() => {
                      const sorted = deliveryQueue
                        .filter(d => d.status === 'pending')
                        .sort((a, b) => a.time.localeCompare(b.time))
                      const warnings: string[] = []
                      for (let i = 1; i < sorted.length; i++) {
                        const prevAfterDip = parseFloat(sorted[i - 1].after_delivery_dip_cm)
                        const currBeforeDip = parseFloat(sorted[i].before_delivery_dip_cm)
                        if (!isNaN(prevAfterDip) && !isNaN(currBeforeDip) && currBeforeDip > prevAfterDip) {
                          warnings.push(`Delivery at ${sorted[i].time}: before dip (${currBeforeDip} cm) > previous after dip (${prevAfterDip} cm)`)
                        }
                      }
                      if (warnings.length === 0) return null
                      return (
                        <div className="mb-4 p-3 bg-status-pending-light border border-status-warning rounded-md">
                          <p className="text-xs font-medium text-status-warning mb-1">Dip sequence warnings:</p>
                          {warnings.map((w, i) => (
                            <p key={i} className="text-xs text-status-warning">{w}</p>
                          ))}
                        </div>
                      )
                    })()}

                    {/* Queue cards */}
                    <div className="space-y-2">
                      {deliveryQueue.map((delivery) => {
                        const vol = delivery.computed_before_vol != null && delivery.computed_after_vol != null
                          ? delivery.computed_after_vol - delivery.computed_before_vol
                          : null
                        return (
                          <div
                            key={delivery.id}
                            className={`p-3 rounded-md border ${
                              delivery.status === 'submitted'
                                ? 'bg-status-success-light border-status-success'
                                : delivery.status === 'error'
                                ? 'bg-status-error-light border-status-error'
                                : 'bg-surface-card border-surface-border'
                            }`}
                          >
                            <div className="flex justify-between items-start">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-sm font-semibold">{formatDateToDisplay(delivery.date)} at {delivery.time}</span>
                                  {delivery.status === 'submitted' && <span className="text-status-success text-sm">&#10003;</span>}
                                  {delivery.status === 'error' && <span className="text-status-error text-sm">&#10007;</span>}
                                </div>
                                <div className="flex gap-3 text-xs text-content-secondary">
                                  <span>{delivery.before_delivery_dip_cm} cm &rarr; {delivery.after_delivery_dip_cm} cm</span>
                                  {vol != null && <span className="font-medium text-status-success">+{vol.toFixed(0)} L</span>}
                                  {delivery.supplier && <span>| {delivery.supplier}</span>}
                                </div>
                                {delivery.status === 'submitted' && delivery.result && (
                                  <div className="mt-1 text-xs">
                                    <span className="text-status-success">ID: {delivery.result.delivery_id}</span>
                                    {delivery.result.validation_status && (
                                      <span className={`ml-2 px-1.5 py-0.5 rounded text-xs ${getStatusColor(delivery.result.validation_status)}`}>
                                        {delivery.result.validation_status}
                                      </span>
                                    )}
                                  </div>
                                )}
                                {delivery.status === 'error' && delivery.error && (
                                  <p className="mt-1 text-xs text-status-error">{delivery.error}</p>
                                )}
                              </div>
                              {delivery.status === 'pending' && (
                                <button
                                  onClick={() => removeFromDeliveryQueue(delivery.id)}
                                  className="ml-2 text-content-secondary hover:text-status-error text-sm"
                                  title="Remove from queue"
                                >
                                  &#10005;
                                </button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* Submit All button */}
                    {deliveryQueue.some(d => d.status === 'pending' || d.status === 'error') && (
                      <button
                        onClick={submitAllDeliveries}
                        disabled={submittingQueue}
                        className="w-full mt-4 px-4 py-2 bg-status-success text-white rounded-md hover:bg-status-success/90 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                      >
                        {submittingQueue ? 'Submitting...' : `Submit All (${deliveryQueue.filter(d => d.status === 'pending' || d.status === 'error').length})`}
                      </button>
                    )}
                  </div>
                )}

                {/* Deliveries List */}
                <div className="space-y-4">
                  {deliveries.length === 0 ? (
                    <p className="text-center text-content-secondary py-8">No deliveries recorded for this tank</p>
                  ) : (
                    deliveries.map((delivery) => (
                      <div key={delivery.delivery_id} className="border border-surface-border rounded-lg p-4 hover:shadow-md transition">
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <h3 className="font-semibold text-lg">{formatDateToDisplay(delivery.date)} at {delivery.time}</h3>
                            <p className="text-sm text-content-secondary">{delivery.supplier}</p>
                          </div>
                          <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(delivery.validation_status)}`}>
                            {delivery.validation_status}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-3">
                          <div>
                            <p className="text-xs text-content-secondary">Before</p>
                            <p className="font-semibold">{delivery.volume_before.toLocaleString()} L</p>
                            {delivery.before_delivery_dip_cm != null && (
                              <p className="text-xs text-content-secondary">{delivery.before_delivery_dip_cm} cm</p>
                            )}
                          </div>
                          <div>
                            <p className="text-xs text-content-secondary">After</p>
                            <p className="font-semibold">{delivery.volume_after.toLocaleString()} L</p>
                            {delivery.after_delivery_dip_cm != null && (
                              <p className="text-xs text-content-secondary">{delivery.after_delivery_dip_cm} cm</p>
                            )}
                          </div>
                          <div>
                            <p className="text-xs text-content-secondary">Delivered</p>
                            <p className="font-semibold text-status-success">{delivery.actual_volume_delivered.toLocaleString()} L</p>
                          </div>
                        </div>

                        {(delivery.invoice_volume_liters ?? delivery.expected_volume) && (
                          <div className="bg-action-primary-light rounded p-2 mb-2">
                            <p className="text-xs text-action-primary">
                              Invoice: {(delivery.invoice_volume_liters ?? delivery.expected_volume)?.toLocaleString()}L |
                              Variance: {delivery.delivery_variance?.toFixed(2)}L ({delivery.variance_percent?.toFixed(2)}%)
                            </p>
                          </div>
                        )}

                        {/* Delivery Three-Way Reconciliation */}
                        {delivery.recon_status && (
                          <div className={`rounded p-3 mb-2 border ${
                            delivery.recon_status === 'BALANCED' ? 'bg-status-success-light border-status-success' :
                            delivery.recon_status === 'VARIANCE_MINOR' ? 'bg-status-warning-light border-status-warning' :
                            'bg-status-error-light border-status-error'
                          }`}>
                            <p className="text-xs font-semibold mb-2" style={{
                              color: delivery.recon_status === 'BALANCED' ? 'var(--color-status-success)' :
                                     delivery.recon_status === 'VARIANCE_MINOR' ? 'var(--color-status-warning)' :
                                     'var(--color-status-error)'
                            }}>
                              Delivery Reconciliation: {delivery.recon_status.replace(/_/g, ' ')}
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs mb-2">
                              <div>
                                <p className="text-content-secondary">OMC Invoice</p>
                                <p className="font-semibold">{(delivery.invoice_volume_liters ?? delivery.expected_volume)?.toLocaleString() ?? '—'} L</p>
                              </div>
                              <div>
                                <p className="text-content-secondary">Flowmeter</p>
                                <p className="font-semibold">{delivery.flowmeter_volume?.toLocaleString()} L</p>
                              </div>
                              <div>
                                <p className="text-content-secondary">Tank Dip</p>
                                <p className="font-semibold">{delivery.actual_volume_delivered.toLocaleString()} L</p>
                              </div>
                            </div>
                            <div className="text-xs space-y-0.5">
                              <p>Invoice vs Flowmeter: <span className="font-mono font-medium">{delivery.recon_invoice_vs_flowmeter?.toFixed(2)}L</span></p>
                              <p>Flowmeter vs Tank: <span className="font-mono font-medium">{delivery.recon_flowmeter_vs_tank?.toFixed(2)}L</span></p>
                              <p>Invoice vs Tank: <span className="font-mono font-medium">{delivery.recon_invoice_vs_tank?.toFixed(2)}L</span></p>
                            </div>
                            {delivery.recon_outlier && delivery.recon_outlier !== 'MULTIPLE' && (
                              <p className="text-xs mt-1 font-medium">
                                Likely issue: <span className="font-bold">{delivery.recon_outlier}</span>
                                {delivery.recon_outlier === 'TANK' && ' (dip error or leak)'}
                                {delivery.recon_outlier === 'FLOWMETER' && ' (gauge malfunction)'}
                                {delivery.recon_outlier === 'INVOICE' && ' (OMC short-shipped)'}
                              </p>
                            )}
                            {delivery.recon_outlier === 'MULTIPLE' && (
                              <p className="text-xs mt-1 font-medium">Multiple sources differ — investigation required</p>
                            )}
                          </div>
                        )}

                        <p className="text-xs text-content-secondary">{delivery.validation_message}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* ===== Summary Tab ===== */}
            {activeTab === 'summary' && (
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
                  <h2 className="text-xl font-semibold">Tank Movement Summary</h2>
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-content-secondary">Date:</label>
                    <input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className="px-3 py-1.5 border border-surface-border rounded-md text-sm focus:ring-2 focus:ring-action-primary"
                    />
                  </div>
                </div>

                {summaryLoading && (
                  <div className="text-center py-8 text-content-secondary">Loading summary...</div>
                )}

                {!summaryLoading && (
                  <>
                    {/* Daily Totals */}
                    {summaryMovements && (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                        <div className="bg-status-success-light rounded-lg p-4 border border-status-success">
                          <p className="text-xs text-status-success font-medium">Total Delivered</p>
                          <p className="text-2xl font-bold text-status-success">
                            {summaryMovements.summary.total_delivered.toLocaleString(undefined, { maximumFractionDigits: 0 })} L
                          </p>
                        </div>
                        <div className="bg-status-error-light rounded-lg p-4 border border-status-error">
                          <p className="text-xs text-status-error font-medium">Total Sold</p>
                          <p className="text-2xl font-bold text-status-error">
                            {summaryMovements.summary.total_sold.toLocaleString(undefined, { maximumFractionDigits: 0 })} L
                          </p>
                        </div>
                        <div className={`rounded-lg p-4 border ${
                          summaryMovements.summary.net_change >= 0
                            ? 'bg-status-success-light border-status-success'
                            : 'bg-status-error-light border-status-error'
                        }`}>
                          <p className={`text-xs font-medium ${summaryMovements.summary.net_change >= 0 ? 'text-status-success' : 'text-status-error'}`}>Net Change</p>
                          <p className={`text-2xl font-bold ${summaryMovements.summary.net_change >= 0 ? 'text-status-success' : 'text-status-error'}`}>
                            {summaryMovements.summary.net_change >= 0 ? '+' : ''}{summaryMovements.summary.net_change.toLocaleString(undefined, { maximumFractionDigits: 0 })} L
                          </p>
                        </div>
                        <div className="bg-surface-bg rounded-lg p-4 border border-surface-border">
                          <p className="text-xs text-content-secondary font-medium">Movements</p>
                          <p className="text-2xl font-bold text-content-primary">{summaryMovements.summary.movement_count}</p>
                        </div>
                      </div>
                    )}

                    {/* Reconciliation Status */}
                    {(() => {
                      const fuelType = availableTanks.find(t => t.tank_id === selectedTank)?.fuel_type || 'Diesel'
                      const dayReadings = readings.filter(r => r.date === selectedDate)
                      const daySales = summarySales.filter((s: any) => s.fuel_type === fuelType)
                      const totalNozzleSales = daySales.reduce((sum: number, s: any) => sum + (s.average_volume || 0), 0)

                      if (dayReadings.length > 0 && summaryMovements) {
                        const reading = dayReadings[0]
                        const tankMovement = reading.tank_volume_movement
                        const variance = totalNozzleSales > 0 ? Math.abs(totalNozzleSales - tankMovement) : 0
                        const variancePercent = tankMovement > 0 ? (variance / tankMovement) * 100 : 0
                        const status = variancePercent <= 0.5 ? 'PASS' : variancePercent <= 1.0 ? 'WARNING' : 'FAIL'

                        return (
                          <div className={`rounded-lg p-4 mb-6 border ${
                            status === 'PASS' ? 'bg-status-success-light border-status-success' :
                            status === 'WARNING' ? 'bg-status-pending-light border-status-warning' :
                            'bg-status-error-light border-status-error'
                          }`}>
                            <div className="flex items-center justify-between">
                              <div>
                                <h3 className="font-semibold text-content-primary">Reconciliation</h3>
                                <p className="text-sm text-content-secondary mt-1">
                                  Tank movement: {tankMovement.toLocaleString()} L | Nozzle sales: {totalNozzleSales.toLocaleString(undefined, { maximumFractionDigits: 0 })} L | Variance: {variance.toFixed(1)} L ({variancePercent.toFixed(2)}%)
                                </p>
                              </div>
                              <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(status)}`}>
                                {status}
                              </span>
                            </div>
                          </div>
                        )
                      }

                      return (
                        <div className="rounded-lg p-4 mb-6 border bg-surface-bg border-surface-border">
                          <p className="text-sm text-content-secondary">
                            No tank readings available for {selectedDate} to perform reconciliation.
                            {totalNozzleSales > 0 && ` (${daySales.length} sales totaling ${totalNozzleSales.toLocaleString(undefined, { maximumFractionDigits: 0 })} L recorded)`}
                          </p>
                        </div>
                      )
                    })()}

                    {/* Stock Movement Timeline */}
                    <h3 className="text-lg font-semibold mb-3">Stock Movement Timeline</h3>
                    {summaryMovements && summaryMovements.movements?.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-surface-border">
                          <thead className="bg-surface-bg">
                            <tr>
                              <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase">Time</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase">Type</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase">Volume</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase">Reference</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase">Description</th>
                              <th className="px-4 py-3 text-right text-xs font-medium text-content-secondary uppercase">Running Net</th>
                            </tr>
                          </thead>
                          <tbody className="bg-surface-card divide-y divide-surface-border">
                            {summaryMovements.movements.map((m: any, idx: number) => {
                              const runningNet = summaryMovements.movements
                                .slice(0, idx + 1)
                                .reduce((sum: number, mv: any) => sum + mv.volume, 0)

                              return (
                                <tr key={idx} className="hover:bg-surface-bg">
                                  <td className="px-4 py-3 text-sm text-content-secondary font-mono">
                                    {m.timestamp ? new Date(m.timestamp).toLocaleTimeString() : '-'}
                                  </td>
                                  <td className="px-4 py-3 text-sm">
                                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                                      m.type === 'DELIVERY'
                                        ? 'bg-status-success-light text-status-success'
                                        : 'bg-status-error-light text-status-error'
                                    }`}>
                                      {m.type}
                                    </span>
                                  </td>
                                  <td className={`px-4 py-3 text-sm font-semibold ${m.volume >= 0 ? 'text-status-success' : 'text-status-error'}`}>
                                    {m.volume >= 0 ? '+' : ''}{m.volume.toLocaleString(undefined, { maximumFractionDigits: 1 })} L
                                  </td>
                                  <td className="px-4 py-3 text-sm font-mono text-content-secondary">
                                    {m.reference_id}
                                  </td>
                                  <td className="px-4 py-3 text-sm text-content-secondary">
                                    {m.description}
                                  </td>
                                  <td className={`px-4 py-3 text-sm font-semibold text-right ${runningNet >= 0 ? 'text-status-success' : 'text-status-error'}`}>
                                    {runningNet >= 0 ? '+' : ''}{runningNet.toLocaleString(undefined, { maximumFractionDigits: 1 })} L
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-center text-content-secondary py-8">No stock movements for {selectedDate}</p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
