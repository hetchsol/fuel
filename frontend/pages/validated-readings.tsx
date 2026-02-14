import { authFetch, BASE, getHeaders } from '../lib/api'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'


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
      const headers = {
        ...getHeaders(),
        'Content-Type': 'application/json',
      }

      // Load shifts
      const shiftsResponse = await authFetch(`${BASE}/shifts`, { headers })
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
      const response = await authFetch(`${BASE}/validated-readings`, {
        headers: getHeaders()
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

      const response = await authFetch(`${BASE}/validated-readings`, {
        method: 'POST',
        headers: {
          ...getHeaders(),
          'Content-Type': 'application/json',
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
      case 'PASS': return 'text-status-success bg-status-success-light'
      case 'WARNING': return 'text-status-warning bg-status-pending-light'
      case 'FAIL': return 'text-status-error bg-status-error-light'
      default: return 'text-content-secondary bg-surface-bg'
    }
  }

  return (
    <div className="max-w-7xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Validated Readings</h1>
      <p className="text-content-secondary mb-8">
        Record mechanical, electronic, and dip readings. System validates all three readings match within 0.03% tolerance.
      </p>

      {/* Form Section */}
      <div className="bg-surface-card p-6 rounded-lg shadow mb-8">
        <h2 className="text-xl font-semibold mb-4">Record New Reading</h2>

        {error && (
          <div className="mb-4 p-3 bg-status-error-light border border-status-error text-status-error rounded">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 p-3 bg-status-success-light border border-status-success text-status-success rounded">
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Shift Selection */}
            <div>
              <label className="block text-sm font-medium text-content-secondary mb-1">
                Shift
              </label>
              <select
                value={formData.shift_id}
                onChange={(e) => setFormData({ ...formData, shift_id: e.target.value })}
                className="w-full px-3 py-2 border border-surface-border rounded-md"
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
              <label className="block text-sm font-medium text-content-secondary mb-1">
                Tank
              </label>
              <select
                value={formData.tank_id}
                onChange={(e) => {
                  const value = e.target.value
                  setFormData({ ...formData, tank_id: value })
                }}
                className="w-full px-3 py-2 border border-surface-border rounded-md"
                required
              >
                <option value="TANK-DIESEL">Diesel Tank</option>
                <option value="TANK-PETROL">Petrol Tank</option>
              </select>
            </div>

            {/* Reading Type */}
            <div>
              <label className="block text-sm font-medium text-content-secondary mb-1">
                Reading Type
              </label>
              <select
                value={formData.reading_type}
                onChange={(e) => setFormData({ ...formData, reading_type: e.target.value })}
                className="w-full px-3 py-2 border border-surface-border rounded-md"
                required
              >
                <option value="Opening">Opening</option>
                <option value="Closing">Closing</option>
              </select>
            </div>

            {/* Mechanical Reading */}
            <div>
              <label className="block text-sm font-medium text-content-secondary mb-1">
                Mechanical Reading (Liters)
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.mechanical_reading}
                onChange={(e) => setFormData({ ...formData, mechanical_reading: e.target.value })}
                className="w-full px-3 py-2 border border-surface-border rounded-md"
                required
              />
            </div>

            {/* Electronic Reading */}
            <div>
              <label className="block text-sm font-medium text-content-secondary mb-1">
                Electronic Reading (Liters)
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.electronic_reading}
                onChange={(e) => setFormData({ ...formData, electronic_reading: e.target.value })}
                className="w-full px-3 py-2 border border-surface-border rounded-md"
                required
              />
            </div>

            {/* Dip Reading */}
            <div>
              <label className="block text-sm font-medium text-content-secondary mb-1">
                Tank Dip Reading (cm)
              </label>
              <input
                type="number"
                step="0.1"
                value={formData.dip_reading_cm}
                onChange={(e) => setFormData({ ...formData, dip_reading_cm: e.target.value })}
                className="w-full px-3 py-2 border border-surface-border rounded-md"
                required
              />
            </div>

            {/* Notes */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-content-secondary mb-1">
                Notes (Optional)
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full px-3 py-2 border border-surface-border rounded-md"
                rows={2}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-action-primary text-white py-2 px-4 rounded-md hover:bg-action-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Submitting...' : 'Submit Reading'}
          </button>
        </form>
      </div>

      {/* Readings List */}
      <div className="bg-surface-card p-6 rounded-lg shadow">
        <h2 className="text-xl font-semibold mb-4">Recent Validated Readings</h2>

        {readings.length === 0 ? (
          <p className="text-content-secondary">No validated readings recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-surface-border">
              <thead className="bg-surface-bg">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase">Timestamp</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase">Tank</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase">Mechanical</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase">Electronic</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase">Dip (L)</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase">Max Disc.</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="bg-surface-card divide-y divide-surface-border">
                {readings.map((reading) => (
                  <tr key={reading.reading_id} className="hover:bg-surface-bg">
                    <td className="px-4 py-3 text-sm text-content-primary">
                      {new Date(reading.timestamp).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-content-primary">{reading.tank_id}</td>
                    <td className="px-4 py-3 text-sm text-content-primary">{reading.reading_type}</td>
                    <td className="px-4 py-3 text-sm text-content-primary">{reading.mechanical_reading.toFixed(2)}</td>
                    <td className="px-4 py-3 text-sm text-content-primary">{reading.electronic_reading.toFixed(2)}</td>
                    <td className="px-4 py-3 text-sm text-content-primary">{reading.dip_reading_liters.toFixed(2)}</td>
                    <td className="px-4 py-3 text-sm text-content-primary">{reading.max_discrepancy_percent.toFixed(4)}%</td>
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
