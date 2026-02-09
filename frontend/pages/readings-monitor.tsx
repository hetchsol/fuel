import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
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

export default function ReadingsMonitor() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [readings, setReadings] = useState<ValidatedReading[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<string>('ALL')
  const [filterShift, setFilterShift] = useState<string>('ALL')
  const [selectedReading, setSelectedReading] = useState<ValidatedReading | null>(null)

  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (userData) {
      const parsedUser = JSON.parse(userData)
      setUser(parsedUser)

      // Only owners can access this page
      if (parsedUser.role !== 'owner') {
        router.push('/')
        return
      }
    }

    loadReadings()
  }, [])

  const loadReadings = async () => {
    setLoading(true)
    try {
      const token = localStorage.getItem('accessToken')
      const BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000/api/v1'
      const response = await fetch(`${BASE}/validated-readings`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Station-Id': localStorage.getItem('stationId') || 'ST001'
        }
      })

      if (response.ok) {
        const data = await response.json()
        // Sort by timestamp descending (newest first)
        const sorted = data.sort((a: ValidatedReading, b: ValidatedReading) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        )
        setReadings(sorted)
      }
    } catch (err) {
      console.error('Error loading readings:', err)
    } finally {
      setLoading(false)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PASS': return 'bg-green-100 text-green-800 border-green-300'
      case 'WARNING': return 'bg-yellow-100 text-yellow-800 border-yellow-300'
      case 'FAIL': return 'bg-red-100 text-red-800 border-red-300'
      default: return 'bg-gray-100 text-gray-800 border-gray-300'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'PASS': return '✓'
      case 'WARNING': return '⚠'
      case 'FAIL': return '✗'
      default: return '?'
    }
  }

  // Filter readings
  const filteredReadings = readings.filter(r => {
    if (filterStatus !== 'ALL' && r.validation_status !== filterStatus) return false
    if (filterShift !== 'ALL' && r.shift_id !== filterShift) return false
    return true
  })

  // Get unique shift IDs for filter
  const uniqueShifts = Array.from(new Set(readings.map(r => r.shift_id)))

  // Calculate statistics
  const stats = {
    total: readings.length,
    pass: readings.filter(r => r.validation_status === 'PASS').length,
    warning: readings.filter(r => r.validation_status === 'WARNING').length,
    fail: readings.filter(r => r.validation_status === 'FAIL').length
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Readings Monitor</h1>
        <p className="text-gray-600 mt-2">
          View all validated readings from supervisors. System checks mechanical, electronic, and dip readings match within 0.03% tolerance.
        </p>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow border-l-4 border-blue-500">
          <div className="text-sm text-gray-600">Total Readings</div>
          <div className="text-2xl font-bold">{stats.total}</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow border-l-4 border-green-500">
          <div className="text-sm text-gray-600">Passed</div>
          <div className="text-2xl font-bold text-green-600">{stats.pass}</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow border-l-4 border-yellow-500">
          <div className="text-sm text-gray-600">Warnings</div>
          <div className="text-2xl font-bold text-yellow-600">{stats.warning}</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow border-l-4 border-red-500">
          <div className="text-sm text-gray-600">Failed</div>
          <div className="text-2xl font-bold text-red-600">{stats.fail}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow mb-6">
        <div className="flex flex-wrap gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Status Filter
            </label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="ALL">All Statuses</option>
              <option value="PASS">Pass Only</option>
              <option value="WARNING">Warnings Only</option>
              <option value="FAIL">Failed Only</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Shift Filter
            </label>
            <select
              value={filterShift}
              onChange={(e) => setFilterShift(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="ALL">All Shifts</option>
              {uniqueShifts.map(shift => (
                <option key={shift} value={shift}>{shift}</option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={loadReadings}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Readings Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <LoadingSpinner text="Loading readings..." />
        ) : filteredReadings.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No readings found matching filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date/Time</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Shift</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tank</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Mechanical (L)</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Electronic (L)</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Dip (L)</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Max Discrepancy</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredReadings.map((reading) => (
                  <tr key={reading.reading_id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {new Date(reading.timestamp).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">{reading.shift_id}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{reading.tank_id}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{reading.reading_type}</td>
                    <td className="px-4 py-3 text-sm font-mono text-gray-900">
                      {reading.mechanical_reading.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-sm font-mono text-gray-900">
                      {reading.electronic_reading.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-sm font-mono text-gray-900">
                      {reading.dip_reading_liters.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-sm font-mono text-gray-900">
                      <span className={reading.max_discrepancy_percent > 0.03 ? 'text-red-600 font-bold' : ''}>
                        {reading.max_discrepancy_percent.toFixed(4)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold border ${getStatusColor(reading.validation_status)}`}>
                        {getStatusIcon(reading.validation_status)} {reading.validation_status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <button
                        onClick={() => setSelectedReading(reading)}
                        className="text-blue-600 hover:text-blue-800 font-medium"
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

      {/* Details Modal */}
      {selectedReading && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setSelectedReading(null)}>
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full m-4 max-h-screen overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <h2 className="text-2xl font-bold">Reading Details</h2>
                <button
                  onClick={() => setSelectedReading(null)}
                  className="text-gray-400 hover:text-gray-600 text-2xl"
                >
                  ×
                </button>
              </div>

              <div className="space-y-4">
                {/* Status Banner */}
                <div className={`p-4 rounded-lg border-2 ${getStatusColor(selectedReading.validation_status)}`}>
                  <div className="text-center">
                    <div className="text-3xl font-bold mb-2">
                      {getStatusIcon(selectedReading.validation_status)} {selectedReading.validation_status}
                    </div>
                    <div className="text-sm">{selectedReading.validation_message}</div>
                  </div>
                </div>

                {/* Reading Information */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-500">Reading ID</label>
                    <div className="text-sm">{selectedReading.reading_id}</div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">Timestamp</label>
                    <div className="text-sm">{new Date(selectedReading.timestamp).toLocaleString()}</div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">Shift ID</label>
                    <div className="text-sm">{selectedReading.shift_id}</div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">Tank ID</label>
                    <div className="text-sm">{selectedReading.tank_id}</div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">Reading Type</label>
                    <div className="text-sm">{selectedReading.reading_type}</div>
                  </div>
                </div>

                {/* Three Readings Comparison */}
                <div className="border-t pt-4">
                  <h3 className="font-semibold mb-3">Reading Comparison</h3>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                      <div className="text-sm font-medium text-blue-700 mb-1">Mechanical</div>
                      <div className="text-2xl font-bold text-blue-900">{selectedReading.mechanical_reading.toFixed(2)}</div>
                      <div className="text-xs text-blue-600">Liters</div>
                    </div>
                    <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                      <div className="text-sm font-medium text-green-700 mb-1">Electronic</div>
                      <div className="text-2xl font-bold text-green-900">{selectedReading.electronic_reading.toFixed(2)}</div>
                      <div className="text-xs text-green-600">Liters</div>
                    </div>
                    <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
                      <div className="text-sm font-medium text-purple-700 mb-1">Dip Reading</div>
                      <div className="text-2xl font-bold text-purple-900">{selectedReading.dip_reading_liters.toFixed(2)}</div>
                      <div className="text-xs text-purple-600">{selectedReading.dip_reading_cm.toFixed(1)} cm</div>
                    </div>
                  </div>
                </div>

                {/* Discrepancy Analysis */}
                <div className="border-t pt-4">
                  <h3 className="font-semibold mb-3">Discrepancy Analysis</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Mechanical vs Electronic:</span>
                      <span className="font-mono font-bold">{selectedReading.discrepancy_mech_elec_percent.toFixed(4)}%</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Mechanical vs Dip:</span>
                      <span className="font-mono font-bold">{selectedReading.discrepancy_mech_dip_percent.toFixed(4)}%</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Electronic vs Dip:</span>
                      <span className="font-mono font-bold">{selectedReading.discrepancy_elec_dip_percent.toFixed(4)}%</span>
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t">
                      <span className="text-sm font-semibold text-gray-700">Maximum Discrepancy:</span>
                      <span className={`font-mono font-bold text-lg ${selectedReading.max_discrepancy_percent > 0.03 ? 'text-red-600' : 'text-green-600'}`}>
                        {selectedReading.max_discrepancy_percent.toFixed(4)}%
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 text-center mt-2">
                      Tolerance: 0.03%
                    </div>
                  </div>
                </div>

                {/* Notes */}
                {selectedReading.notes && (
                  <div className="border-t pt-4">
                    <h3 className="font-semibold mb-2">Notes</h3>
                    <div className="text-sm text-gray-700 bg-gray-50 p-3 rounded">
                      {selectedReading.notes}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
