import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { getHeaders } from '../lib/api'

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
  volume_before: number
  volume_after: number
  actual_volume_delivered: number
  expected_volume?: number
  delivery_variance?: number
  variance_percent?: number
  supplier: string
  invoice_number?: string
  validation_status: string
  validation_message: string
  recorded_by: string
  created_at: string
}

interface QueuedTankDelivery {
  id: string
  date: string
  time: string
  volume_before: string
  volume_after: string
  supplier: string
  invoice_number: string
  expected_volume: string
  temperature: string
  notes: string
  status: 'pending' | 'submitted' | 'error'
  result?: any
  error?: string
}

export default function TankMovement() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [activeTab, setActiveTab] = useState<'readings' | 'deliveries' | 'summary'>('readings')
  const [selectedTank, setSelectedTank] = useState('TANK-DIESEL')
  const [showForm, setShowForm] = useState(false)
  const [showDeliveryForm, setShowDeliveryForm] = useState(false)

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
    volume_before: '',
    volume_after: '',
    supplier: '',
    invoice_number: '',
    expected_volume: '',
    temperature: '',
    notes: ''
  })

  const [readings, setReadings] = useState<TankReading[]>([])
  const [deliveries, setDeliveries] = useState<Delivery[]>([])
  const [deliveryQueue, setDeliveryQueue] = useState<QueuedTankDelivery[]>([])
  const [submittingQueue, setSubmittingQueue] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Summary tab state
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [summaryMovements, setSummaryMovements] = useState<any>(null)
  const [summarySales, setSummarySales] = useState<any[]>([])
  const [summaryLoading, setSummaryLoading] = useState(false)

  // Calculate preview of tank movement
  const calculateMovementPreview = () => {
    const opening = parseFloat(readingForm.opening_volume)
    const closing = parseFloat(readingForm.closing_volume)

    if (!opening || !closing) return 0

    return opening - closing
  }

  const calculateDeliveryPreview = () => {
    const before = parseFloat(deliveryForm.volume_before)
    const after = parseFloat(deliveryForm.volume_after)
    if (!before || !after) return 0
    return after - before
  }

  const fetchSummary = async () => {
    setSummaryLoading(true)
    try {
      const [movementsRes, salesRes] = await Promise.all([
        fetch(`${BASE}/tanks/${selectedTank}/movements?date=${selectedDate}`, { headers: getHeaders() }),
        fetch(`${BASE}/sales/date/${selectedDate}`, { headers: getHeaders() })
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
      const res = await fetch(`${BASE}/tank-readings/readings/${selectedTank}`, {
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
      const res = await fetch(`${BASE}/tank-readings/deliveries/${selectedTank}`, {
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

      const res = await fetch(`${BASE}/tank-readings/readings`, {
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

  const addDeliveryToQueue = (e: React.FormEvent) => {
    e.preventDefault()
    const newDelivery: QueuedTankDelivery = {
      id: crypto.randomUUID(),
      date: deliveryForm.date,
      time: deliveryForm.time,
      volume_before: deliveryForm.volume_before,
      volume_after: deliveryForm.volume_after,
      supplier: deliveryForm.supplier,
      invoice_number: deliveryForm.invoice_number,
      expected_volume: deliveryForm.expected_volume,
      temperature: deliveryForm.temperature,
      notes: deliveryForm.notes,
      status: 'pending',
    }
    setDeliveryQueue(prev => [...prev, newDelivery].sort((a, b) => a.time.localeCompare(b.time)))
    setError('')
    setSuccess('')
    // Reset form but keep date
    setDeliveryForm({
      ...deliveryForm,
      time: '',
      volume_before: '',
      volume_after: '',
      supplier: '',
      invoice_number: '',
      expected_volume: '',
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
          volume_before: parseFloat(delivery.volume_before),
          volume_after: parseFloat(delivery.volume_after),
          supplier: delivery.supplier,
          invoice_number: delivery.invoice_number || null,
          expected_volume: delivery.expected_volume ? parseFloat(delivery.expected_volume) : null,
          temperature: delivery.temperature ? parseFloat(delivery.temperature) : null,
          recorded_by: user.user_id,
          notes: delivery.notes || null
        }

        const res = await fetch(`${BASE}/tank-readings/deliveries`, {
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
    setSubmittingQueue(false)
    if (pending.length > 0) {
      setSuccess(`Batch submission complete`)
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

  return (
    <div className="min-h-screen bg-surface-bg p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-content-primary">Tank Volume Movement</h1>
          <p className="text-content-secondary mt-1">Track tank readings, deliveries, and fuel movement (Excel Column AM)</p>
        </div>

        {/* Tank Selector */}
        <div className="bg-surface-card rounded-lg shadow p-4 mb-6">
          <label className="block text-sm font-medium text-content-secondary mb-2">Select Tank</label>
          <select
            value={selectedTank}
            onChange={(e) => {
              const value = e.target.value
              setSelectedTank(value)
            }}
            className="w-full max-w-xs px-4 py-2 border border-surface-border rounded-md focus:ring-2 focus:ring-action-primary"
          >
            <option value="TANK-DIESEL">Diesel Tank</option>
            <option value="TANK-PETROL">Petrol Tank</option>
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
            <nav className="flex -mb-px">
              <button
                onClick={() => setActiveTab('readings')}
                className={`px-6 py-3 font-medium text-sm border-b-2 ${
                  activeTab === 'readings'
                    ? 'border-action-primary text-action-primary'
                    : 'border-transparent text-content-secondary hover:text-content-secondary'
                }`}
              >
                Tank Readings
              </button>
              <button
                onClick={() => setActiveTab('deliveries')}
                className={`px-6 py-3 font-medium text-sm border-b-2 ${
                  activeTab === 'deliveries'
                    ? 'border-action-primary text-action-primary'
                    : 'border-transparent text-content-secondary hover:text-content-secondary'
                }`}
              >
                Deliveries
              </button>
              <button
                onClick={() => setActiveTab('summary')}
                className={`px-6 py-3 font-medium text-sm border-b-2 ${
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
            {/* Tank Readings Tab */}
            {activeTab === 'readings' && (
              <div>
                <div className="flex justify-between items-center mb-4">
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

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
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
                            <h3 className="font-semibold text-lg">{reading.date}</h3>
                            <p className="text-sm text-content-secondary">{reading.fuel_type}</p>
                          </div>
                          <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(reading.validation_status)}`}>
                            {reading.validation_status}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
                          <div>
                            <p className="text-xs text-content-secondary">Opening</p>
                            <p className="font-semibold">{reading.opening_volume.toLocaleString()} L</p>
                          </div>
                          <div>
                            <p className="text-xs text-content-secondary">Closing</p>
                            <p className="font-semibold">{reading.closing_volume.toLocaleString()} L</p>
                          </div>
                          <div>
                            <p className="text-xs text-content-secondary">Movement</p>
                            <p className="font-semibold text-action-primary">{reading.tank_volume_movement.toLocaleString()} L</p>
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
                              Delivery: Before {reading.before_offload_volume?.toLocaleString()}L → After {reading.after_offload_volume?.toLocaleString()}L
                              {reading.supplier && ` | Supplier: ${reading.supplier}`}
                            </p>
                          </div>
                        )}

                        {reading.validation_messages.length > 0 && (
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

            {/* Deliveries Tab */}
            {activeTab === 'deliveries' && (
              <div>
                <div className="flex justify-between items-center mb-4">
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

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
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
                        <label className="block text-sm font-medium text-content-secondary mb-1">Volume Before Delivery (L)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={deliveryForm.volume_before}
                          onChange={(e) => setDeliveryForm({ ...deliveryForm, volume_before: e.target.value })}
                          className="w-full px-3 py-2 border border-surface-border rounded-md"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-content-secondary mb-1">Volume After Delivery (L)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={deliveryForm.volume_after}
                          onChange={(e) => setDeliveryForm({ ...deliveryForm, volume_after: e.target.value })}
                          className="w-full px-3 py-2 border border-surface-border rounded-md"
                          required
                        />
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
                        <label className="block text-sm font-medium text-content-secondary mb-1">Expected Volume (L) - Optional</label>
                        <input
                          type="number"
                          step="0.01"
                          value={deliveryForm.expected_volume}
                          onChange={(e) => setDeliveryForm({ ...deliveryForm, expected_volume: e.target.value })}
                          className="w-full px-3 py-2 border border-surface-border rounded-md"
                          placeholder="What supplier claimed"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-content-secondary mb-1">Temperature (°C) - Optional</label>
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

                    {deliveryForm.volume_before && deliveryForm.volume_after && (
                      <div className="bg-action-primary-light border border-action-primary rounded-md p-4 mb-4">
                        <p className="text-sm font-medium text-action-primary">
                          Calculated Delivery: <span className="text-2xl">{calculateDeliveryPreview().toFixed(2)} L</span>
                        </p>
                        {deliveryForm.expected_volume && (
                          <p className="text-sm text-action-primary mt-1">
                            Variance: {(calculateDeliveryPreview() - parseFloat(deliveryForm.expected_volume)).toFixed(2)} L
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
                    <div className="flex justify-between items-center mb-4">
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
                              const vol = parseFloat(delivery.volume_after) - parseFloat(delivery.volume_before)
                              return (
                                <div key={delivery.id} className="relative pb-4">
                                  {/* Vertical line */}
                                  {idx < arr.length - 1 && (
                                    <div className="absolute left-[-16px] top-3 bottom-0 w-0.5 bg-action-primary"></div>
                                  )}
                                  {/* Dot */}
                                  <div className="absolute left-[-20px] top-1.5 w-2.5 h-2.5 rounded-full bg-action-primary border-2 border-surface-card"></div>
                                  <div className="flex items-baseline gap-3">
                                    <span className="text-sm font-mono font-semibold text-action-primary">{delivery.time}</span>
                                    <span className="text-sm">
                                      {parseFloat(delivery.volume_before).toLocaleString()} L
                                      <span className="mx-1 text-content-secondary">&rarr;</span>
                                      {parseFloat(delivery.volume_after).toLocaleString()} L
                                    </span>
                                    <span className="text-xs font-medium text-status-success">+{vol.toLocaleString()} L</span>
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

                    {/* Volume sequence warning */}
                    {(() => {
                      const sorted = deliveryQueue
                        .filter(d => d.status === 'pending')
                        .sort((a, b) => a.time.localeCompare(b.time))
                      const warnings: string[] = []
                      for (let i = 1; i < sorted.length; i++) {
                        const prevAfter = parseFloat(sorted[i - 1].volume_after)
                        const currBefore = parseFloat(sorted[i].volume_before)
                        if (currBefore > prevAfter) {
                          warnings.push(`Delivery at ${sorted[i].time}: before volume (${currBefore.toLocaleString()} L) > previous after volume (${prevAfter.toLocaleString()} L)`)
                        }
                      }
                      if (warnings.length === 0) return null
                      return (
                        <div className="mb-4 p-3 bg-status-pending-light border border-status-warning rounded-md">
                          <p className="text-xs font-medium text-status-warning mb-1">Volume sequence warnings:</p>
                          {warnings.map((w, i) => (
                            <p key={i} className="text-xs text-status-warning">{w}</p>
                          ))}
                        </div>
                      )
                    })()}

                    {/* Queue cards */}
                    <div className="space-y-2">
                      {deliveryQueue.map((delivery) => {
                        const vol = parseFloat(delivery.volume_after) - parseFloat(delivery.volume_before)
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
                                  <span className="text-sm font-semibold">{delivery.date} at {delivery.time}</span>
                                  {delivery.status === 'submitted' && <span className="text-status-success text-sm">✓</span>}
                                  {delivery.status === 'error' && <span className="text-status-error text-sm">✗</span>}
                                </div>
                                <div className="flex gap-3 text-xs text-content-secondary">
                                  <span>{parseFloat(delivery.volume_before).toLocaleString()} L &rarr; {parseFloat(delivery.volume_after).toLocaleString()} L</span>
                                  <span className="font-medium text-status-success">+{vol.toLocaleString()} L</span>
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
                                  ✕
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
                            <h3 className="font-semibold text-lg">{delivery.date} at {delivery.time}</h3>
                            <p className="text-sm text-content-secondary">{delivery.supplier}</p>
                          </div>
                          <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(delivery.validation_status)}`}>
                            {delivery.validation_status}
                          </span>
                        </div>

                        <div className="grid grid-cols-3 gap-4 mb-3">
                          <div>
                            <p className="text-xs text-content-secondary">Before</p>
                            <p className="font-semibold">{delivery.volume_before.toLocaleString()} L</p>
                          </div>
                          <div>
                            <p className="text-xs text-content-secondary">After</p>
                            <p className="font-semibold">{delivery.volume_after.toLocaleString()} L</p>
                          </div>
                          <div>
                            <p className="text-xs text-content-secondary">Delivered</p>
                            <p className="font-semibold text-status-success">{delivery.actual_volume_delivered.toLocaleString()} L</p>
                          </div>
                        </div>

                        {delivery.expected_volume && (
                          <div className="bg-action-primary-light rounded p-2 mb-2">
                            <p className="text-xs text-action-primary">
                              Expected: {delivery.expected_volume.toLocaleString()}L |
                              Variance: {delivery.delivery_variance?.toFixed(2)}L ({delivery.variance_percent?.toFixed(2)}%)
                            </p>
                          </div>
                        )}

                        <p className="text-xs text-content-secondary">{delivery.validation_message}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Summary Tab */}
            {activeTab === 'summary' && (
              <div>
                <div className="flex justify-between items-center mb-6">
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
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
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
                      const fuelType = selectedTank === 'TANK-DIESEL' ? 'Diesel' : 'Petrol'
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
