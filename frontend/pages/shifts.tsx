import { useState, useEffect } from 'react'
import LoadingSpinner from '../components/LoadingSpinner'

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000/api/v1'

export default function Shifts() {
  const [activeShift, setActiveShift] = useState<any>(null)
  const [nozzles, setNozzles] = useState<any[]>([])
  const [attendants, setAttendants] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Dual reading form state
  const [readingForm, setReadingForm] = useState({
    nozzle_id: '',
    reading_type: 'Opening',
    electronic_reading: '',
    mechanical_reading: '',
    attendant: '',
    tank_dip_cm: ''
  })

  // Shift management state
  const [showManagementModal, setShowManagementModal] = useState(false)
  const [shiftForm, setShiftForm] = useState({
    date: new Date().toISOString().split('T')[0],
    shift_type: 'Day',
    assignments: []
  })
  const [availableStaff, setAvailableStaff] = useState<any[]>([])
  const [islandsData, setIslandsData] = useState<any[]>([])
  const [selectedAttendants, setSelectedAttendants] = useState<any[]>([])
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [isEditMode, setIsEditMode] = useState(false)

  // Tank dip reading state
  const [tanks, setTanks] = useState<any[]>([])
  const [tankDipReadings, setTankDipReadings] = useState<any[]>([])
  const [showTankDipModal, setShowTankDipModal] = useState(false)
  const [tankDipForm, setTankDipForm] = useState({
    tank_id: '',
    opening_dip_cm: '',
    closing_dip_cm: ''
  })

  // Fetch active shift on mount
  useEffect(() => {
    // Get current user for role check
    const userData = localStorage.getItem('user')
    if (userData) {
      setCurrentUser(JSON.parse(userData))
    }

    fetchActiveShift()
    fetchNozzles()
    fetchStaffList()
    loadAvailableStaff()
    loadIslandsData()
    fetchTanks()
  }, [])

  useEffect(() => {
    if (activeShift) {
      fetchTankDipReadings()
    }
  }, [activeShift])

  const fetchActiveShift = async () => {
    try {
      const res = await fetch(`${BASE}/shifts/current/active`, {
        headers: { 'X-Station-Id': localStorage.getItem('stationId') || 'ST001' }
      })
      if (res.ok) {
        const data = await res.json()
        setActiveShift(data)
      }
    } catch (err: any) {
      setError('Failed to fetch active shift')
    }
  }

  const fetchNozzles = async () => {
    try {
      const res = await fetch(`${BASE}/islands/`, {
        headers: { 'X-Station-Id': localStorage.getItem('stationId') || 'ST001' }
      })
      if (res.ok) {
        const data = await res.json()
        // Extract all nozzles from islands
        const allNozzles: any[] = []
        data.forEach((island: any) => {
          if (island.pump_station?.nozzles) {
            allNozzles.push(...island.pump_station.nozzles)
          }
        })
        setNozzles(allNozzles)
      }
    } catch (err: any) {
      console.error('Failed to fetch nozzles:', err)
    }
  }

  const fetchStaffList = async () => {
    try {
      const res = await fetch(`${BASE}/auth/staff`, {
        headers: { 'X-Station-Id': localStorage.getItem('stationId') || 'ST001' }
      })
      if (res.ok) {
        const data = await res.json()
        // Extract full names from staff data
        const staffNames = data.map((staff: any) => staff.full_name)
        setAttendants(staffNames)
      }
    } catch (err: any) {
      console.error('Failed to fetch staff list:', err)
    }
  }

  const loadAvailableStaff = async () => {
    try {
      const res = await fetch(`${BASE}/auth/staff`, {
        headers: { 'X-Station-Id': localStorage.getItem('stationId') || 'ST001' }
      })
      if (res.ok) {
        const data = await res.json()
        // Filter only users with role='user' (attendants)
        const attendantsOnly = data.filter((u: any) => u.role === 'user')
        setAvailableStaff(attendantsOnly)
      }
    } catch (err: any) {
      console.error('Failed to load staff:', err)
    }
  }

  const loadIslandsData = async () => {
    try {
      const res = await fetch(`${BASE}/islands/`, {
        headers: { 'X-Station-Id': localStorage.getItem('stationId') || 'ST001' }
      })
      if (res.ok) {
        const data = await res.json()
        setIslandsData(data)
      }
    } catch (err: any) {
      console.error('Failed to load islands:', err)
    }
  }

  const fetchTanks = async () => {
    try {
      const res = await fetch(`${BASE}/tanks/levels`, {
        headers: { 'X-Station-Id': localStorage.getItem('stationId') || 'ST001' }
      })
      if (res.ok) {
        const data = await res.json()
        setTanks(data)
      }
    } catch (err: any) {
      console.error('Failed to fetch tanks:', err)
    }
  }

  const fetchTankDipReadings = async () => {
    if (!activeShift) return
    try {
      const res = await fetch(`${BASE}/shifts/${activeShift.shift_id}/tank-dip-readings`, {
        headers: { 'X-Station-Id': localStorage.getItem('stationId') || 'ST001' }
      })
      if (res.ok) {
        const data = await res.json()
        setTankDipReadings(data)
      }
    } catch (err: any) {
      console.error('Failed to fetch tank dip readings:', err)
    }
  }

  const handleSubmitTankDipReading = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeShift) return

    setLoading(true)
    try {
      const token = localStorage.getItem('token')
      const payload = {
        tank_id: tankDipForm.tank_id,
        opening_dip_cm: tankDipForm.opening_dip_cm ? parseFloat(tankDipForm.opening_dip_cm) : null,
        closing_dip_cm: tankDipForm.closing_dip_cm ? parseFloat(tankDipForm.closing_dip_cm) : null
      }

      const res = await fetch(`${BASE}/shifts/${activeShift.shift_id}/tank-dip-reading`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'X-Station-Id': localStorage.getItem('stationId') || 'ST001'
        },
        body: JSON.stringify(payload)
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.detail || 'Failed to submit tank dip reading')
      }

      alert('Tank dip reading recorded successfully!')
      fetchTankDipReadings()
      setShowTankDipModal(false)
      setTankDipForm({ tank_id: '', opening_dip_cm: '', closing_dip_cm: '' })
    } catch (err: any) {
      alert(err.message || 'Failed to submit tank dip reading')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmitReading = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const payload = {
        nozzle_id: readingForm.nozzle_id,
        shift_id: activeShift.shift_id,
        attendant: readingForm.attendant,
        reading_type: readingForm.reading_type,
        electronic_reading: parseFloat(readingForm.electronic_reading),
        mechanical_reading: parseFloat(readingForm.mechanical_reading),
        timestamp: new Date().toISOString(),
        tank_dip_cm: readingForm.tank_dip_cm ? parseFloat(readingForm.tank_dip_cm) : null
      }

      const res = await fetch(`${BASE}/shifts/readings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Station-Id': localStorage.getItem('stationId') || 'ST001' },
        body: JSON.stringify(payload)
      })

      if (!res.ok) {
        throw new Error('Failed to submit reading')
      }

      alert('Dual reading submitted successfully!')

      // Reset form
      setReadingForm({
        nozzle_id: '',
        reading_type: 'Opening',
        electronic_reading: '',
        mechanical_reading: '',
        attendant: '',
        tank_dip_cm: ''
      })

      fetchActiveShift()
    } catch (err: any) {
      setError(err.message || 'Failed to submit reading')
    } finally {
      setLoading(false)
    }
  }

  const getShiftTypeDisplay = (shiftType: string) => {
    if (shiftType === 'Day') return '☀️ Day Shift (6AM - 6PM)'
    if (shiftType === 'Night') return '🌙 Night Shift (6PM - 6AM)'
    return shiftType
  }

  const getShiftStatusColor = (status: string) => {
    if (status === 'active') return 'bg-green-100 text-green-800 border-green-300'
    if (status === 'completed') return 'bg-blue-100 text-blue-800 border-blue-300'
    if (status === 'reconciled') return 'bg-purple-100 text-purple-800 border-purple-300'
    return 'bg-gray-100 text-gray-800 border-gray-300'
  }

  // Shift management handlers
  const canManageShifts = currentUser?.role === 'supervisor' || currentUser?.role === 'owner'

  const handleAttendantToggle = (staff: any, checked: boolean) => {
    if (checked) {
      setSelectedAttendants([...selectedAttendants, {
        user_id: staff.user_id,
        full_name: staff.full_name,
        island_ids: [],
        nozzle_ids: []
      }])
    } else {
      setSelectedAttendants(selectedAttendants.filter(a => a.user_id !== staff.user_id))
    }
  }

  const handleIslandToggle = (attendantId: string, islandId: string, checked: boolean) => {
    setSelectedAttendants(selectedAttendants.map(attendant => {
      if (attendant.user_id === attendantId) {
        const island_ids = checked
          ? [...(attendant.island_ids || []), islandId]
          : (attendant.island_ids || []).filter((id: string) => id !== islandId)

        // Remove nozzles that don't belong to selected islands
        const nozzle_ids = (attendant.nozzle_ids || []).filter((nozzleId: string) => {
          return island_ids.some((iid: string) => {
            const island = islandsData.find(i => i.island_id === iid)
            return island?.pump_station?.nozzles?.some((n: any) => n.nozzle_id === nozzleId)
          })
        })

        return { ...attendant, island_ids, nozzle_ids }
      }
      return attendant
    }))
  }

  const handleNozzleToggle = (attendantId: string, nozzleId: string, checked: boolean) => {
    setSelectedAttendants(selectedAttendants.map(attendant => {
      if (attendant.user_id === attendantId) {
        const nozzle_ids = checked
          ? [...(attendant.nozzle_ids || []), nozzleId]
          : (attendant.nozzle_ids || []).filter((id: string) => id !== nozzleId)
        return { ...attendant, nozzle_ids }
      }
      return attendant
    }))
  }

  const getFilteredNozzles = (selectedIslandIds: string[]) => {
    if (!selectedIslandIds || selectedIslandIds.length === 0) return []

    const nozzles: any[] = []
    selectedIslandIds.forEach(islandId => {
      const island = islandsData.find(i => i.island_id === islandId)
      if (island?.pump_station?.nozzles) {
        nozzles.push(...island.pump_station.nozzles)
      }
    })
    return nozzles
  }

  const handleCreateShift = async (e: React.FormEvent) => {
    e.preventDefault()

    const shift_id = `${shiftForm.date}-${shiftForm.shift_type}`
    const payload = {
      shift_id,
      date: shiftForm.date,
      shift_type: shiftForm.shift_type,
      attendants: selectedAttendants.map(a => a.full_name),
      assignments: selectedAttendants.map(a => ({
        attendant_id: a.user_id,
        attendant_name: a.full_name,
        island_ids: a.island_ids || [],
        nozzle_ids: a.nozzle_ids || []
      })),
      status: 'active'
    }

    try {
      const token = localStorage.getItem('accessToken')

      // First, check if shift already exists
      const checkRes = await fetch(`${BASE}/shifts/${shift_id}`, {
        headers: { 'X-Station-Id': localStorage.getItem('stationId') || 'ST001' }
      })
      const shiftExists = checkRes.ok
      setIsEditMode(shiftExists)

      // Use PUT if shift exists, POST if new
      const method = shiftExists ? 'PUT' : 'POST'
      const url = shiftExists ? `${BASE}/shifts/${shift_id}` : `${BASE}/shifts/`

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'X-Station-Id': localStorage.getItem('stationId') || 'ST001'
        },
        body: JSON.stringify(payload)
      })

      if (!res.ok) {
        const error = await res.json()
        const errorMessage = error.detail || JSON.stringify(error)
        alert(`Error ${shiftExists ? 'updating' : 'creating'} shift: ${errorMessage}`)
        console.error('Shift operation error:', error)
        return
      }

      alert(`Shift ${shiftExists ? 'updated' : 'created'} successfully!`)
      setShowManagementModal(false)
      setSelectedAttendants([])
      fetchActiveShift()
    } catch (err: any) {
      console.error('Failed to save shift:', err)
      alert(`Failed to save shift: ${err.message || err.toString()}`)
    }
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Shift Management</h1>
        <p className="mt-2 text-sm text-gray-600">Day/Night shift operations and dual meter readings</p>
      </div>

      {/* Current Active Shift Card */}
      <div className="mb-6">
        {activeShift ? (
          <div className="bg-gradient-to-br from-green-50 to-blue-50 rounded-lg shadow-lg p-6 border-2 border-green-300">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">
                  {getShiftTypeDisplay(activeShift.shift_type)}
                </h2>
                <p className="text-sm text-gray-600 mt-1">
                  {activeShift.date} | Shift ID: {activeShift.shift_id}
                </p>
              </div>
              <div className="flex items-center space-x-3">
                <span className={`px-4 py-2 rounded-full font-semibold text-sm border-2 ${getShiftStatusColor(activeShift.status)}`}>
                  {activeShift.status.toUpperCase()}
                </span>
                {canManageShifts && (
                  <button
                    onClick={() => setShowManagementModal(true)}
                    className="px-3 py-1 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md"
                  >
                    Manage Shift
                  </button>
                )}
              </div>
            </div>

            {/* Attendant Assignments */}
            {activeShift.assignments && activeShift.assignments.length > 0 ? (
              <div className="mt-6">
                <h3 className="font-semibold mb-3 text-gray-900">Attendant Assignments:</h3>
                <div className="space-y-4">
                  {activeShift.assignments.map((assignment: any) => (
                    <div key={assignment.attendant_id} className="p-4 bg-white rounded-lg border border-gray-200">
                      <p className="font-medium mb-2 text-gray-900">👤 {assignment.attendant_name}</p>

                      {assignment.island_ids && assignment.island_ids.length > 0 && (
                        <div className="mb-2">
                          <span className="text-sm text-gray-600">Islands: </span>
                          <span className="text-sm font-medium">
                            {assignment.island_ids.map((id: string) => {
                              const island = islandsData.find(i => i.island_id === id)
                              return island?.name || id
                            }).join(', ')}
                          </span>
                        </div>
                      )}

                      {assignment.nozzle_ids && assignment.nozzle_ids.length > 0 && (
                        <div>
                          <span className="text-sm text-gray-600">Nozzles: </span>
                          <div className="flex flex-wrap gap-2 mt-1">
                            {assignment.nozzle_ids.map((nozzleId: string) => {
                              const nozzle = getFilteredNozzles(assignment.island_ids).find((n: any) => n.nozzle_id === nozzleId)
                              return (
                                <span
                                  key={nozzleId}
                                  className={`px-2 py-1 text-xs rounded ${
                                    nozzle?.fuel_type === 'Petrol'
                                      ? 'bg-blue-100 text-blue-700'
                                      : 'bg-orange-100 text-orange-700'
                                  }`}
                                >
                                  {nozzleId}
                                </span>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div className="bg-white rounded-lg p-4 border border-gray-200">
                  <p className="text-xs text-gray-600 font-medium">Attendants on Duty</p>
                  <p className="text-lg font-semibold text-gray-900 mt-1">
                    {activeShift.attendants && activeShift.attendants.length > 0
                      ? activeShift.attendants.join(', ')
                      : 'No attendants assigned'}
                  </p>
                </div>
                <div className="bg-white rounded-lg p-4 border border-gray-200">
                  <p className="text-xs text-gray-600 font-medium">Start Time</p>
                  <p className="text-lg font-semibold text-gray-900 mt-1">
                    {activeShift.start_time || 'Not recorded'}
                  </p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-4">
            <p className="text-yellow-800">No active shift found. A shift will be automatically created.</p>
          </div>
        )}
      </div>

      {/* Dual Reading Submission Form */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">📝 Submit Dual Reading</h2>

          <form onSubmit={handleSubmitReading} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nozzle
              </label>
              <select
                value={readingForm.nozzle_id}
                onChange={(e) => setReadingForm({ ...readingForm, nozzle_id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                required
              >
                <option value="">Select Nozzle</option>
                {nozzles.map(nozzle => (
                  <option key={nozzle.nozzle_id} value={nozzle.nozzle_id}>
                    {nozzle.nozzle_id} - {nozzle.fuel_type}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reading Type
              </label>
              <select
                value={readingForm.reading_type}
                onChange={(e) => setReadingForm({ ...readingForm, reading_type: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              >
                <option>Opening</option>
                <option>Closing</option>
              </select>
            </div>

            <div className="bg-green-50 border-2 border-green-200 rounded-lg p-3">
              <label className="block text-sm font-bold text-green-900 mb-1">
                ⚡ Electronic Reading (3 decimals)
              </label>
              <input
                type="number"
                step="0.001"
                value={readingForm.electronic_reading}
                onChange={(e) => setReadingForm({ ...readingForm, electronic_reading: e.target.value })}
                className="w-full px-3 py-2 border border-green-300 rounded-md focus:outline-none focus:ring-green-500 focus:border-green-500 text-lg font-semibold"
                placeholder="e.g., 12345.678"
                required
              />
              <p className="text-xs text-green-600 mt-1">
                Primary precise reading from digital display
              </p>
            </div>

            <div className="bg-indigo-50 border-2 border-indigo-200 rounded-lg p-3">
              <label className="block text-sm font-bold text-indigo-900 mb-1">
                🔧 Mechanical Reading (whole numbers)
              </label>
              <input
                type="number"
                step="1"
                value={readingForm.mechanical_reading}
                onChange={(e) => setReadingForm({ ...readingForm, mechanical_reading: e.target.value })}
                className="w-full px-3 py-2 border border-indigo-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-lg font-semibold"
                placeholder="e.g., 12345"
                required
              />
              <p className="text-xs text-indigo-600 mt-1">
                Backup reading from mechanical meter
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Attendant
              </label>
              <select
                value={readingForm.attendant}
                onChange={(e) => setReadingForm({ ...readingForm, attendant: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                required
              >
                <option value="">Select Attendant</option>
                {attendants.map(attendant => (
                  <option key={attendant} value={attendant}>
                    {attendant}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tank Dip (cm) - Optional
              </label>
              <input
                type="number"
                step="0.1"
                value={readingForm.tank_dip_cm}
                onChange={(e) => setReadingForm({ ...readingForm, tank_dip_cm: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g., 135.8"
              />
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !activeShift}
              className="w-full px-4 py-3 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Submitting...' : 'Submit Dual Reading'}
            </button>
          </form>
        </div>

        {/* Nozzle Status Overview */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">⛽ Nozzle Status</h2>

          <div className="space-y-3">
            {nozzles.length === 0 ? (
              <LoadingSpinner text="Loading nozzles..." />
            ) : (
              nozzles.map(nozzle => (
                <div
                  key={nozzle.nozzle_id}
                  className={`p-4 rounded-lg border-2 ${
                    nozzle.fuel_type === 'Petrol'
                      ? 'bg-blue-50 border-blue-200'
                      : 'bg-orange-50 border-orange-200'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-bold text-gray-900">{nozzle.nozzle_id}</p>
                      <p className="text-xs text-gray-600">{nozzle.fuel_type}</p>
                    </div>
                    <span className={`px-2 py-1 text-xs font-semibold rounded ${
                      nozzle.status === 'Active'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {nozzle.status}
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <p className="text-gray-600">Electronic</p>
                      <p className="font-semibold">{nozzle.electronic_reading?.toFixed(3) || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-gray-600">Mechanical</p>
                      <p className="font-semibold">{nozzle.mechanical_reading?.toFixed(0) || 'N/A'}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Tank Dip Readings Section */}
      {activeShift && (currentUser?.role === 'supervisor' || currentUser?.role === 'owner') && (
        <div className="mt-6 bg-white rounded-lg shadow-lg p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-gray-900">🛢️ Tank Dip Readings</h2>
            <button
              onClick={() => setShowTankDipModal(true)}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 font-medium"
            >
              + Record Dip Reading
            </button>
          </div>

          {/* Existing Tank Dip Readings */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {tankDipReadings.length === 0 ? (
              <div className="col-span-2 p-6 bg-gray-50 rounded-lg border border-gray-200 text-center">
                <p className="text-gray-600">No tank dip readings recorded for this shift yet.</p>
                <p className="text-sm text-gray-500 mt-1">Record opening and closing dip readings for reconciliation.</p>
              </div>
            ) : (
              tankDipReadings.map((reading: any) => {
                const tank = tanks.find(t => t.tank_id === reading.tank_id)
                const isDiesel = tank?.fuel_type === 'Diesel'
                return (
                  <div
                    key={reading.tank_id}
                    className={`p-4 rounded-lg border-2 ${
                      isDiesel ? 'bg-purple-50 border-purple-300' : 'bg-green-50 border-green-300'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-3">
                      <h3 className="font-bold text-gray-900">{reading.tank_id}</h3>
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${
                        isDiesel ? 'bg-purple-100 text-purple-800' : 'bg-green-100 text-green-800'
                      }`}>
                        {tank?.fuel_type || 'Unknown'}
                      </span>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Opening Dip:</span>
                        <span className="font-semibold">
                          {reading.opening_dip_cm ? `${reading.opening_dip_cm.toFixed(1)} cm` : 'Not recorded'}
                        </span>
                      </div>
                      {reading.opening_volume_liters && (
                        <div className="flex justify-between text-xs text-gray-600">
                          <span>Opening Volume:</span>
                          <span>{reading.opening_volume_liters.toLocaleString()} L</span>
                        </div>
                      )}

                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Closing Dip:</span>
                        <span className="font-semibold">
                          {reading.closing_dip_cm ? `${reading.closing_dip_cm.toFixed(1)} cm` : 'Not recorded'}
                        </span>
                      </div>
                      {reading.closing_volume_liters && (
                        <div className="flex justify-between text-xs text-gray-600">
                          <span>Closing Volume:</span>
                          <span>{reading.closing_volume_liters.toLocaleString()} L</span>
                        </div>
                      )}

                      {reading.opening_volume_liters && reading.closing_volume_liters && (
                        <div className="mt-2 pt-2 border-t border-gray-300">
                          <div className="flex justify-between text-sm font-semibold">
                            <span className="text-blue-700">Tank Movement:</span>
                            <span className="text-blue-900">
                              {(reading.opening_volume_liters - reading.closing_volume_liters).toLocaleString()} L
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}

      {/* Tank Dip Reading Modal */}
      {showTankDipModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Record Tank Dip Reading</h3>

            <form onSubmit={handleSubmitTankDipReading} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Select Tank
                </label>
                <select
                  value={tankDipForm.tank_id}
                  onChange={(e) => setTankDipForm({ ...tankDipForm, tank_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">-- Select Tank --</option>
                  {tanks.map(tank => (
                    <option key={tank.tank_id} value={tank.tank_id}>
                      {tank.tank_id} ({tank.fuel_type})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Opening Dip (cm)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={tankDipForm.opening_dip_cm}
                  onChange={(e) => setTankDipForm({ ...tankDipForm, opening_dip_cm: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., 165.5"
                />
                <p className="text-xs text-gray-500 mt-1">Dip reading at shift start</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Closing Dip (cm)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={tankDipForm.closing_dip_cm}
                  onChange={(e) => setTankDipForm({ ...tankDipForm, closing_dip_cm: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., 155.4"
                />
                <p className="text-xs text-gray-500 mt-1">Dip reading at shift end</p>
              </div>

              <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                <p className="text-xs text-blue-700">
                  <strong>Note:</strong> You can record opening dip at shift start and closing dip at shift end.
                  Both readings are needed for reconciliation analysis.
                </p>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={loading || !tankDipForm.tank_id}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {loading ? 'Saving...' : 'Save Reading'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowTankDipModal(false)
                    setTankDipForm({ tank_id: '', opening_dip_cm: '', closing_dip_cm: '' })
                  }}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Info Panel */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-blue-900 mb-2">Shift Management System</h3>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>• Day Shift: 6:00 AM - 6:00 PM</li>
          <li>• Night Shift: 6:00 PM - 6:00 AM</li>
          <li>• Each shift requires Opening and Closing readings for all 8 nozzles</li>
          <li>• Dual readings (Electronic + Mechanical) provide verification and loss detection</li>
          <li>• Tank dip readings help reconcile physical inventory with meter readings</li>
        </ul>
      </div>

      {/* Shift Management Modal */}
      {showManagementModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold">{isEditMode ? 'Edit Shift' : 'Create Shift'}</h2>
              <button onClick={() => setShowManagementModal(false)} className="text-gray-500 hover:text-gray-700 text-2xl">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateShift}>
              {/* Date and Shift Type */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-sm font-medium mb-1">Date</label>
                  <input
                    type="date"
                    value={shiftForm.date}
                    onChange={(e) => setShiftForm({...shiftForm, date: e.target.value})}
                    className="w-full px-3 py-2 border rounded-md"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Shift Type</label>
                  <select
                    value={shiftForm.shift_type}
                    onChange={(e) => setShiftForm({...shiftForm, shift_type: e.target.value})}
                    className="w-full px-3 py-2 border rounded-md"
                    required
                  >
                    <option value="Day">Day (6AM - 6PM)</option>
                    <option value="Night">Night (6PM - 6AM)</option>
                  </select>
                </div>
              </div>

              {/* Attendant Selection */}
              <div className="mb-6">
                <label className="block text-sm font-medium mb-2">Select Attendants</label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {availableStaff.map(staff => (
                    <label key={staff.user_id} className="flex items-center space-x-2 p-2 border rounded hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedAttendants.some(a => a.user_id === staff.user_id)}
                        onChange={(e) => handleAttendantToggle(staff, e.target.checked)}
                        className="form-checkbox"
                      />
                      <span className="text-sm">{staff.full_name}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Assignment Details for Each Attendant */}
              {selectedAttendants.map(attendant => (
                <div key={attendant.user_id} className="mb-6 p-4 border rounded-lg bg-gray-50">
                  <h3 className="font-semibold mb-3">👤 {attendant.full_name}</h3>

                  {/* Island Selection */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium mb-2">Assigned Islands</label>
                    <div className="flex flex-wrap gap-2">
                      {islandsData.map(island => (
                        <label key={island.island_id} className="flex items-center space-x-2 p-2 border rounded hover:bg-blue-50 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={attendant.island_ids?.includes(island.island_id) || false}
                            onChange={(e) => handleIslandToggle(attendant.user_id, island.island_id, e.target.checked)}
                            className="form-checkbox"
                          />
                          <span className="text-sm">{island.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Nozzle Selection (filtered by selected islands) */}
                  <div>
                    <label className="block text-sm font-medium mb-2">Assigned Nozzles</label>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {getFilteredNozzles(attendant.island_ids || []).map(nozzle => (
                        <label
                          key={nozzle.nozzle_id}
                          className={`flex items-center space-x-2 p-2 border rounded hover:bg-blue-50 cursor-pointer ${
                            nozzle.fuel_type === 'Petrol' ? 'border-green-300' : 'border-purple-300'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={attendant.nozzle_ids?.includes(nozzle.nozzle_id) || false}
                            onChange={(e) => handleNozzleToggle(attendant.user_id, nozzle.nozzle_id, e.target.checked)}
                            className="form-checkbox"
                          />
                          <span className="text-sm">{nozzle.nozzle_id}</span>
                        </label>
                      ))}
                    </div>
                    {(!attendant.island_ids || attendant.island_ids.length === 0) && (
                      <p className="text-sm text-gray-500 mt-2">Select islands first to see available nozzles</p>
                    )}
                  </div>
                </div>
              ))}

              {/* Submit Buttons */}
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowManagementModal(false)}
                  className="px-4 py-2 border rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                  disabled={selectedAttendants.length === 0}
                >
                  {isEditMode ? 'Update Shift' : 'Create Shift'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
