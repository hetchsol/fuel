import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { useTheme } from '../contexts/ThemeContext'

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000/api/v1'

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

export default function TankMovement() {
  const router = useRouter()
  const { setFuelType } = useTheme()
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
    delivery_occurred: false,
    before_offload_volume: '',
    after_offload_volume: '',
    supplier: '',
    invoice_number: '',
    delivery_time: '',
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
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Calculate preview of tank movement
  const calculateMovementPreview = () => {
    const opening = parseFloat(readingForm.opening_volume)
    const closing = parseFloat(readingForm.closing_volume)
    const before = parseFloat(readingForm.before_offload_volume)
    const after = parseFloat(readingForm.after_offload_volume)

    if (!opening || !closing) return 0

    if (readingForm.delivery_occurred && after && before) {
      return (opening - before) + (after - closing)
    }

    return opening - closing
  }

  const calculateDeliveryPreview = () => {
    const before = parseFloat(deliveryForm.volume_before)
    const after = parseFloat(deliveryForm.volume_after)
    if (!before || !after) return 0
    return after - before
  }

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
      const token = localStorage.getItem('accessToken')
      const res = await fetch(`${BASE}/tank-readings/readings/${selectedTank}`, {
        headers: { Authorization: `Bearer ${token}` }
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
      const token = localStorage.getItem('accessToken')
      const res = await fetch(`${BASE}/tank-readings/deliveries/${selectedTank}`, {
        headers: { Authorization: `Bearer ${token}` }
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
      const token = localStorage.getItem('accessToken')
      const payload = {
        tank_id: selectedTank,
        date: readingForm.date,
        opening_volume: parseFloat(readingForm.opening_volume),
        closing_volume: parseFloat(readingForm.closing_volume),
        delivery_occurred: readingForm.delivery_occurred,
        before_offload_volume: readingForm.delivery_occurred ? parseFloat(readingForm.before_offload_volume) : null,
        after_offload_volume: readingForm.delivery_occurred ? parseFloat(readingForm.after_offload_volume) : null,
        delivery_time: readingForm.delivery_occurred ? readingForm.delivery_time : null,
        supplier: readingForm.delivery_occurred ? readingForm.supplier : null,
        invoice_number: readingForm.delivery_occurred ? readingForm.invoice_number : null,
        recorded_by: user.user_id,
        notes: readingForm.notes || null
      }

      const res = await fetch(`${BASE}/tank-readings/readings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
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
        delivery_occurred: false,
        before_offload_volume: '',
        after_offload_volume: '',
        supplier: '',
        invoice_number: '',
        delivery_time: '',
        notes: ''
      })
      fetchReadings()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const submitDelivery = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')

    try {
      const token = localStorage.getItem('accessToken')
      const payload = {
        tank_id: selectedTank,
        date: deliveryForm.date,
        time: deliveryForm.time,
        volume_before: parseFloat(deliveryForm.volume_before),
        volume_after: parseFloat(deliveryForm.volume_after),
        supplier: deliveryForm.supplier,
        invoice_number: deliveryForm.invoice_number || null,
        expected_volume: deliveryForm.expected_volume ? parseFloat(deliveryForm.expected_volume) : null,
        temperature: deliveryForm.temperature ? parseFloat(deliveryForm.temperature) : null,
        recorded_by: user.user_id,
        notes: deliveryForm.notes || null
      }

      const res = await fetch(`${BASE}/tank-readings/deliveries`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.detail || 'Failed to record delivery')
      }

      setSuccess('Delivery recorded successfully!')
      setShowDeliveryForm(false)
      setDeliveryForm({
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
      fetchDeliveries()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PASS': return 'text-green-600 bg-green-50'
      case 'WARNING': return 'text-yellow-600 bg-yellow-50'
      case 'FAIL': return 'text-red-600 bg-red-50'
      default: return 'text-gray-600 bg-gray-50'
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Tank Volume Movement</h1>
          <p className="text-gray-600 mt-1">Track tank readings, deliveries, and fuel movement (Excel Column AM)</p>
        </div>

        {/* Tank Selector */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Select Tank</label>
          <select
            value={selectedTank}
            onChange={(e) => {
              const value = e.target.value
              setSelectedTank(value)
              // Update theme based on tank selection
              if (value === 'TANK-DIESEL') {
                setFuelType('diesel')
              } else if (value === 'TANK-PETROL') {
                setFuelType('petrol')
              }
            }}
            className="w-full max-w-xs px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
          >
            <option value="TANK-DIESEL">Diesel Tank</option>
            <option value="TANK-PETROL">Petrol Tank</option>
          </select>
        </div>

        {/* Success/Error Messages */}
        {success && (
          <div className="bg-green-50 border border-green-200 rounded-md p-4 mb-6">
            <p className="text-green-700">{success}</p>
          </div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
            <p className="text-red-700">{error}</p>
          </div>
        )}

        {/* Tabs */}
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="border-b border-gray-200">
            <nav className="flex -mb-px">
              <button
                onClick={() => setActiveTab('readings')}
                className={`px-6 py-3 font-medium text-sm border-b-2 ${
                  activeTab === 'readings'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Tank Readings
              </button>
              <button
                onClick={() => setActiveTab('deliveries')}
                className={`px-6 py-3 font-medium text-sm border-b-2 ${
                  activeTab === 'deliveries'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Deliveries
              </button>
              <button
                onClick={() => setActiveTab('summary')}
                className={`px-6 py-3 font-medium text-sm border-b-2 ${
                  activeTab === 'summary'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
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
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                  >
                    {showForm ? 'Cancel' : '+ New Reading'}
                  </button>
                </div>

                {showForm && (
                  <form onSubmit={submitReading} className="bg-gray-50 rounded-lg p-6 mb-6 border border-gray-200">
                    <h3 className="text-lg font-semibold mb-4">Submit Tank Reading</h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                        <input
                          type="date"
                          value={readingForm.date}
                          onChange={(e) => setReadingForm({ ...readingForm, date: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Opening Volume (L) <span className="text-gray-500">- Start of Day</span>
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={readingForm.opening_volume}
                          onChange={(e) => setReadingForm({ ...readingForm, opening_volume: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md"
                          required
                          placeholder="e.g., 26887.21"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Closing Volume (L) <span className="text-gray-500">- End of Day</span>
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={readingForm.closing_volume}
                          onChange={(e) => setReadingForm({ ...readingForm, closing_volume: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md"
                          required
                          placeholder="e.g., 25117.64"
                        />
                      </div>

                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          checked={readingForm.delivery_occurred}
                          onChange={(e) => setReadingForm({ ...readingForm, delivery_occurred: e.target.checked })}
                          className="mr-2"
                        />
                        <label className="text-sm font-medium text-gray-700">Delivery Occurred Today</label>
                      </div>
                    </div>

                    {readingForm.delivery_occurred && (
                      <div className="bg-blue-50 rounded-lg p-4 mb-4 border border-blue-200">
                        <h4 className="font-medium text-blue-900 mb-3">Delivery Information</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Before Off-loading (L)
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              value={readingForm.before_offload_volume}
                              onChange={(e) => setReadingForm({ ...readingForm, before_offload_volume: e.target.value })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md"
                              required={readingForm.delivery_occurred}
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              After Off-loading (L)
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              value={readingForm.after_offload_volume}
                              onChange={(e) => setReadingForm({ ...readingForm, after_offload_volume: e.target.value })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md"
                              required={readingForm.delivery_occurred}
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Delivery Time</label>
                            <input
                              type="time"
                              value={readingForm.delivery_time}
                              onChange={(e) => setReadingForm({ ...readingForm, delivery_time: e.target.value })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md"
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Supplier</label>
                            <input
                              type="text"
                              value={readingForm.supplier}
                              onChange={(e) => setReadingForm({ ...readingForm, supplier: e.target.value })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md"
                              placeholder="e.g., Puma Energy"
                            />
                          </div>

                          <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Invoice Number</label>
                            <input
                              type="text"
                              value={readingForm.invoice_number}
                              onChange={(e) => setReadingForm({ ...readingForm, invoice_number: e.target.value })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Notes (Optional)</label>
                      <textarea
                        value={readingForm.notes}
                        onChange={(e) => setReadingForm({ ...readingForm, notes: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                        rows={2}
                      />
                    </div>

                    {/* Preview Calculation */}
                    {readingForm.opening_volume && readingForm.closing_volume && (
                      <div className="bg-green-50 border border-green-200 rounded-md p-4 mb-4">
                        <p className="text-sm font-medium text-green-900">
                          Calculated Tank Movement: <span className="text-2xl">{calculateMovementPreview().toFixed(2)} L</span>
                        </p>
                        {readingForm.delivery_occurred && readingForm.before_offload_volume && readingForm.after_offload_volume && (
                          <p className="text-sm text-green-700 mt-1">
                            Delivery Volume: {(parseFloat(readingForm.after_offload_volume) - parseFloat(readingForm.before_offload_volume)).toFixed(2)} L
                          </p>
                        )}
                      </div>
                    )}

                    <div className="flex gap-2">
                      <button
                        type="submit"
                        disabled={loading}
                        className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                      >
                        {loading ? 'Submitting...' : 'Submit Reading'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowForm(false)}
                        className="px-6 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}

                {/* Readings List */}
                <div className="space-y-4">
                  {readings.length === 0 ? (
                    <p className="text-center text-gray-500 py-8">No readings found for this tank</p>
                  ) : (
                    readings.map((reading) => (
                      <div key={reading.reading_id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition">
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <h3 className="font-semibold text-lg">{reading.date}</h3>
                            <p className="text-sm text-gray-600">{reading.fuel_type}</p>
                          </div>
                          <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(reading.validation_status)}`}>
                            {reading.validation_status}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
                          <div>
                            <p className="text-xs text-gray-500">Opening</p>
                            <p className="font-semibold">{reading.opening_volume.toLocaleString()} L</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">Closing</p>
                            <p className="font-semibold">{reading.closing_volume.toLocaleString()} L</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">Movement</p>
                            <p className="font-semibold text-blue-600">{reading.tank_volume_movement.toLocaleString()} L</p>
                          </div>
                          {reading.delivery_occurred && reading.delivery_volume && (
                            <div>
                              <p className="text-xs text-gray-500">Delivered</p>
                              <p className="font-semibold text-green-600">{reading.delivery_volume.toLocaleString()} L</p>
                            </div>
                          )}
                        </div>

                        {reading.delivery_occurred && (
                          <div className="bg-green-50 rounded p-2 mb-2">
                            <p className="text-xs text-green-800">
                              Delivery: Before {reading.before_offload_volume?.toLocaleString()}L → After {reading.after_offload_volume?.toLocaleString()}L
                              {reading.supplier && ` | Supplier: ${reading.supplier}`}
                            </p>
                          </div>
                        )}

                        {reading.validation_messages.length > 0 && (
                          <div className="text-xs text-yellow-700 bg-yellow-50 p-2 rounded">
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
                    className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                  >
                    {showDeliveryForm ? 'Cancel' : '+ Record Delivery'}
                  </button>
                </div>

                {showDeliveryForm && (
                  <form onSubmit={submitDelivery} className="bg-gray-50 rounded-lg p-6 mb-6 border border-gray-200">
                    <h3 className="text-lg font-semibold mb-4">Record Fuel Delivery</h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                        <input
                          type="date"
                          value={deliveryForm.date}
                          onChange={(e) => setDeliveryForm({ ...deliveryForm, date: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Time</label>
                        <input
                          type="time"
                          value={deliveryForm.time}
                          onChange={(e) => setDeliveryForm({ ...deliveryForm, time: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Volume Before Delivery (L)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={deliveryForm.volume_before}
                          onChange={(e) => setDeliveryForm({ ...deliveryForm, volume_before: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Volume After Delivery (L)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={deliveryForm.volume_after}
                          onChange={(e) => setDeliveryForm({ ...deliveryForm, volume_after: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Supplier</label>
                        <input
                          type="text"
                          value={deliveryForm.supplier}
                          onChange={(e) => setDeliveryForm({ ...deliveryForm, supplier: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Invoice Number</label>
                        <input
                          type="text"
                          value={deliveryForm.invoice_number}
                          onChange={(e) => setDeliveryForm({ ...deliveryForm, invoice_number: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Expected Volume (L) - Optional</label>
                        <input
                          type="number"
                          step="0.01"
                          value={deliveryForm.expected_volume}
                          onChange={(e) => setDeliveryForm({ ...deliveryForm, expected_volume: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md"
                          placeholder="What supplier claimed"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Temperature (°C) - Optional</label>
                        <input
                          type="number"
                          step="0.1"
                          value={deliveryForm.temperature}
                          onChange={(e) => setDeliveryForm({ ...deliveryForm, temperature: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                        <textarea
                          value={deliveryForm.notes}
                          onChange={(e) => setDeliveryForm({ ...deliveryForm, notes: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md"
                          rows={2}
                        />
                      </div>
                    </div>

                    {deliveryForm.volume_before && deliveryForm.volume_after && (
                      <div className="bg-blue-50 border border-blue-200 rounded-md p-4 mb-4">
                        <p className="text-sm font-medium text-blue-900">
                          Calculated Delivery: <span className="text-2xl">{calculateDeliveryPreview().toFixed(2)} L</span>
                        </p>
                        {deliveryForm.expected_volume && (
                          <p className="text-sm text-blue-700 mt-1">
                            Variance: {(calculateDeliveryPreview() - parseFloat(deliveryForm.expected_volume)).toFixed(2)} L
                          </p>
                        )}
                      </div>
                    )}

                    <div className="flex gap-2">
                      <button
                        type="submit"
                        disabled={loading}
                        className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                      >
                        {loading ? 'Recording...' : 'Record Delivery'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowDeliveryForm(false)}
                        className="px-6 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}

                {/* Deliveries List */}
                <div className="space-y-4">
                  {deliveries.length === 0 ? (
                    <p className="text-center text-gray-500 py-8">No deliveries recorded for this tank</p>
                  ) : (
                    deliveries.map((delivery) => (
                      <div key={delivery.delivery_id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition">
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <h3 className="font-semibold text-lg">{delivery.date} at {delivery.time}</h3>
                            <p className="text-sm text-gray-600">{delivery.supplier}</p>
                          </div>
                          <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(delivery.validation_status)}`}>
                            {delivery.validation_status}
                          </span>
                        </div>

                        <div className="grid grid-cols-3 gap-4 mb-3">
                          <div>
                            <p className="text-xs text-gray-500">Before</p>
                            <p className="font-semibold">{delivery.volume_before.toLocaleString()} L</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">After</p>
                            <p className="font-semibold">{delivery.volume_after.toLocaleString()} L</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">Delivered</p>
                            <p className="font-semibold text-green-600">{delivery.actual_volume_delivered.toLocaleString()} L</p>
                          </div>
                        </div>

                        {delivery.expected_volume && (
                          <div className="bg-blue-50 rounded p-2 mb-2">
                            <p className="text-xs text-blue-800">
                              Expected: {delivery.expected_volume.toLocaleString()}L |
                              Variance: {delivery.delivery_variance?.toFixed(2)}L ({delivery.variance_percent?.toFixed(2)}%)
                            </p>
                          </div>
                        )}

                        <p className="text-xs text-gray-600">{delivery.validation_message}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Summary Tab */}
            {activeTab === 'summary' && (
              <div>
                <h2 className="text-xl font-semibold mb-4">Tank Movement Summary</h2>
                <p className="text-gray-600">Summary and analytics features coming soon...</p>
                <p className="text-sm text-gray-500 mt-2">
                  This will show variance analysis, trends, and anomaly detection.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
