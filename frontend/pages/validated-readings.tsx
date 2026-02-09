import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { useTheme } from '../contexts/ThemeContext'

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000/api/v1'

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

interface Shift {
  shift_id: string
  date: string
  shift_type: string
  status: string
}

export default function ValidatedReadingsPage() {
  const router = useRouter()
  const { setFuelType } = useTheme()
  const [user, setUser] = useState<any>(null)
  const [readings, setReadings] = useState<ValidatedReading[]>([])
  const [shifts, setShifts] = useState<Shift[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Form state
  const [formData, setFormData] = useState({
    shift_id: '',
    tank_id: 'TANK-DIESEL',
    reading_type: 'Opening',
    mechanical_reading: '',
    electronic_reading: '',
    dip_reading_cm: '',
    notes: ''
  })

  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (userData) {
      const parsedUser = JSON.parse(userData)
      setUser(parsedUser)

      // Only supervisors and owners can access this page
      if (parsedUser.role !== 'supervisor' && parsedUser.role !== 'owner') {
        router.push('/')
        return
      }
    }

    loadInitialData()
  }, [])

  const loadInitialData = async () => {
    try {
      const token = localStorage.getItem('accessToken')
      const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Station-Id': localStorage.getItem('stationId') || 'ST001',
      }

      // Load shifts
      const shiftsResponse = await fetch(`${BASE}/shifts`, { headers })
      if (shiftsResponse.ok) {
        const shiftsData = await shiftsResponse.json()
        setShifts(shiftsData)
      }

      // Load existing validated readings
      loadValidatedReadings()
    } catch (err) {
      console.error('Error loading initial data:', err)
    }
  }

  const loadValidatedReadings = async () => {
    try {
      const token = localStorage.getItem('accessToken')
      const response = await fetch(`${BASE}/validated-readings`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Station-Id': localStorage.getItem('stationId') || 'ST001',
        }
      })

      if (response.ok) {
        const data = await response.json()
        setReadings(data)
      }
    } catch (err) {
      console.error('Error loading validated readings:', err)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')

    try {
      const token = localStorage.getItem('accessToken')

      const payload = {
        shift_id: formData.shift_id,
        tank_id: formData.tank_id,
        reading_type: formData.reading_type,
        mechanical_reading: parseFloat(formData.mechanical_reading),
        electronic_reading: parseFloat(formData.electronic_reading),
        dip_reading_cm: parseFloat(formData.dip_reading_cm),
        recorded_by: user.user_id,
        notes: formData.notes
      }

      const response = await fetch(`${BASE}/validated-readings`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Station-Id': localStorage.getItem('stationId') || 'ST001',
        },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Failed to submit reading')
      }

      const result = await response.json()
      setSuccess(`Reading recorded successfully! Status: ${result.validation_status}`)

      // Reset form
      setFormData({
        shift_id: '',
        tank_id: 'TANK-DIESEL',
        reading_type: 'Opening',
        mechanical_reading: '',
        electronic_reading: '',
        dip_reading_cm: '',
        notes: ''
      })

      // Reload readings
      loadValidatedReadings()

    } catch (err: any) {
      setError(err.message || 'Error submitting reading')
    } finally {
      setLoading(false)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PASS': return 'text-green-700 bg-green-100'
      case 'WARNING': return 'text-yellow-700 bg-yellow-100'
      case 'FAIL': return 'text-red-700 bg-red-100'
      default: return 'text-gray-700 bg-gray-100'
    }
  }

  return (
    <div className="max-w-7xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Validated Readings</h1>
      <p className="text-gray-600 mb-8">
        Record mechanical, electronic, and dip readings. System validates all three readings match within 0.03% tolerance.
      </p>

      {/* Form Section */}
      <div className="bg-white p-6 rounded-lg shadow mb-8">
        <h2 className="text-xl font-semibold mb-4">Record New Reading</h2>

        {error && (
          <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 p-3 bg-green-100 border border-green-400 text-green-700 rounded">
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Shift Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Shift
              </label>
              <select
                value={formData.shift_id}
                onChange={(e) => setFormData({ ...formData, shift_id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                required
              >
                <option value="">Select Shift</option>
                {shifts.map(shift => (
                  <option key={shift.shift_id} value={shift.shift_id}>
                    {shift.date} - {shift.shift_type} ({shift.status})
                  </option>
                ))}
              </select>
            </div>

            {/* Tank Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tank
              </label>
              <select
                value={formData.tank_id}
                onChange={(e) => {
                  const value = e.target.value
                  setFormData({ ...formData, tank_id: value })
                  // Update theme based on tank selection
                  if (value === 'TANK-DIESEL') {
                    setFuelType('diesel')
                  } else if (value === 'TANK-PETROL') {
                    setFuelType('petrol')
                  }
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                required
              >
                <option value="TANK-DIESEL">Diesel Tank</option>
                <option value="TANK-PETROL">Petrol Tank</option>
              </select>
            </div>

            {/* Reading Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reading Type
              </label>
              <select
                value={formData.reading_type}
                onChange={(e) => setFormData({ ...formData, reading_type: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                required
              >
                <option value="Opening">Opening</option>
                <option value="Closing">Closing</option>
              </select>
            </div>

            {/* Mechanical Reading */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Mechanical Reading (Liters)
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.mechanical_reading}
                onChange={(e) => setFormData({ ...formData, mechanical_reading: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                required
              />
            </div>

            {/* Electronic Reading */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Electronic Reading (Liters)
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.electronic_reading}
                onChange={(e) => setFormData({ ...formData, electronic_reading: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                required
              />
            </div>

            {/* Dip Reading */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tank Dip Reading (cm)
              </label>
              <input
                type="number"
                step="0.1"
                value={formData.dip_reading_cm}
                onChange={(e) => setFormData({ ...formData, dip_reading_cm: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                required
              />
            </div>

            {/* Notes */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notes (Optional)
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                rows={2}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-gray-400"
          >
            {loading ? 'Submitting...' : 'Submit Reading'}
          </button>
        </form>
      </div>

      {/* Readings List */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-xl font-semibold mb-4">Recent Validated Readings</h2>

        {readings.length === 0 ? (
          <p className="text-gray-500">No validated readings recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Timestamp</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tank</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Mechanical</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Electronic</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Dip (L)</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Max Disc.</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {readings.map((reading) => (
                  <tr key={reading.reading_id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {new Date(reading.timestamp).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">{reading.tank_id}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{reading.reading_type}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{reading.mechanical_reading.toFixed(2)}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{reading.electronic_reading.toFixed(2)}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{reading.dip_reading_liters.toFixed(2)}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{reading.max_discrepancy_percent.toFixed(4)}%</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getStatusColor(reading.validation_status)}`}>
                        {reading.validation_status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
