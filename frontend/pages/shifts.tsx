import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import LoadingSpinner from '../components/LoadingSpinner'
import { getHeaders, authFetch } from '../lib/api'

const BASE = '/api/v1'

export default function Shifts() {
  const [activeShift, setActiveShift] = useState<any>(null)
  const [nozzles, setNozzles] = useState<any[]>([])
  const [attendants, setAttendants] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

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

  // Shift history state
  const [allShifts, setAllShifts] = useState<any[]>([])
  const [showHistory, setShowHistory] = useState(false)

  // Manage existing shift state
  const [selectedShiftId, setSelectedShiftId] = useState<string>('')
  const [editingShiftId, setEditingShiftId] = useState<string | null>(null)
  const [showManageDropdown, setShowManageDropdown] = useState(false)

  // Tank dip reading state
  const [tanks, setTanks] = useState<any[]>([])
  const [tankDipReadings, setTankDipReadings] = useState<any[]>([])
  const [showTankDipModal, setShowTankDipModal] = useState(false)
  const [tankDipForm, setTankDipForm] = useState({
    tank_id: '',
    opening_dip_cm: '',
    closing_dip_cm: ''
  })
  const [previousDipData, setPreviousDipData] = useState<any>(null)

  // Fetch active shift on mount
  useEffect(() => {
    // Get current user for role check
    const userData = localStorage.getItem('user')
    if (userData) {
      setCurrentUser(JSON.parse(userData))
    }

    fetchActiveShift()
    fetchAllShifts()
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
      const res = await authFetch(`${BASE}/shifts/current/active`, {
        headers: getHeaders()
      })
      if (res.ok) {
        const data = await res.json()
        setActiveShift(data)
      }
    } catch (err: any) {
      setError('Failed to fetch active shift')
    }
  }

  const fetchAllShifts = async () => {
    try {
      const res = await authFetch(`${BASE}/shifts/`, {
        headers: getHeaders()
      })
      if (res.ok) {
        const data = await res.json()
        // Sort by date descending, then by shift_type
        data.sort((a: any, b: any) => {
          if (b.date !== a.date) return b.date.localeCompare(a.date)
          return a.shift_type.localeCompare(b.shift_type)
        })
        setAllShifts(data)
      }
    } catch (err: any) {
      console.error('Failed to fetch all shifts:', err)
    }
  }

  const handleDeactivateShift = async (shiftId: string) => {
    if (!confirm('Deactivate this shift? Attendants will no longer see it as their active shift.')) return
    try {
      const res = await authFetch(`${BASE}/shifts/${shiftId}/deactivate`, {
        method: 'PUT',
        headers: getHeaders()
      })
      if (!res.ok) {
        const error = await res.json()
        toast.error(`Error deactivating shift: ${error.detail || JSON.stringify(error)}`)
        return
      }
      toast.success('Shift deactivated successfully')
      fetchActiveShift()
      fetchAllShifts()
    } catch (err: any) {
      toast.error(`Failed to deactivate shift: ${err.message}`)
    }
  }

  const handleDeleteShift = async (shiftId: string) => {
    if (!confirm('Permanently delete this inactive shift? This cannot be undone.')) return
    try {
      const res = await authFetch(`${BASE}/shifts/${shiftId}`, {
        method: 'DELETE',
        headers: getHeaders()
      })
      if (!res.ok) {
        const error = await res.json()
        toast.error(`Error deleting shift: ${error.detail || JSON.stringify(error)}`)
        return
      }
      toast.success('Shift deleted permanently')
      fetchActiveShift()
      fetchAllShifts()
    } catch (err: any) {
      toast.error(`Failed to delete shift: ${err.message}`)
    }
  }

  // Helper: get display name for a nozzle (e.g. "LSD 1A" or fallback to nozzle_id)
  const getNozzleDisplayName = (nozzle: any) => {
    if (nozzle.fuel_type_abbrev && nozzle.display_label) {
      return `${nozzle.fuel_type_abbrev} ${nozzle.display_label}`
    }
    return nozzle.display_label || nozzle.nozzle_id
  }

  const fetchNozzles = async () => {
    try {
      const res = await authFetch(`${BASE}/islands/?status=active`, {
        headers: getHeaders()
      })
      if (res.ok) {
        const data = await res.json()
        // Extract all nozzles from active islands, carrying island context
        const allNozzles: any[] = []
        data.forEach((island: any) => {
          if (island.pump_station?.nozzles) {
            island.pump_station.nozzles.forEach((nozzle: any) => {
              allNozzles.push({
                ...nozzle,
                fuel_type_abbrev: island.fuel_type_abbrev,
              })
            })
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
      const res = await authFetch(`${BASE}/auth/staff`, {
        headers: getHeaders()
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
      const res = await authFetch(`${BASE}/auth/staff`, {
        headers: getHeaders()
      })
      if (res.ok) {
        const data = await res.json()
        // Filter only users with role='user' (attendants)
        const attendantsOnly = data.filter((u: any) => u.role === 'user')
        setAvailableStaff(attendantsOnly)
        if (attendantsOnly.length === 0 && data.length === 0) {
          setError('No staff found. Create attendants in Administration > Users first.')
        }
      } else {
        console.error('Staff API returned', res.status)
        setError('Failed to load staff list. Try refreshing the page.')
      }
    } catch (err: any) {
      console.error('Failed to load staff:', err)
      setError('Failed to load staff list. Check your connection.')
    }
  }

  const loadIslandsData = async () => {
    try {
      const res = await authFetch(`${BASE}/islands/?status=active`, {
        headers: getHeaders()
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
      const res = await authFetch(`${BASE}/tanks/levels`, {
        headers: getHeaders()
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
      const res = await authFetch(`${BASE}/shifts/${activeShift.shift_id}/tank-dip-readings`, {
        headers: getHeaders()
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
      const payload = {
        tank_id: tankDipForm.tank_id,
        opening_dip_cm: tankDipForm.opening_dip_cm ? parseFloat(tankDipForm.opening_dip_cm) : null,
        closing_dip_cm: tankDipForm.closing_dip_cm ? parseFloat(tankDipForm.closing_dip_cm) : null
      }

      const res = await authFetch(`${BASE}/shifts/${activeShift.shift_id}/tank-dip-reading`, {
        method: 'POST',
        headers: { ...getHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.detail || 'Failed to submit tank dip reading')
      }

      toast.success('Tank dip reading recorded successfully!')
      fetchTankDipReadings()
      setShowTankDipModal(false)
      setTankDipForm({ tank_id: '', opening_dip_cm: '', closing_dip_cm: '' })
    } catch (err: any) {
      toast.error(err.message || 'Failed to submit tank dip reading')
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
    if (status === 'active') return 'bg-status-success-light text-status-success border-status-success'
    if (status === 'completed') return 'bg-action-primary-light text-action-primary border-action-primary'
    if (status === 'reconciled') return 'bg-category-a-light text-category-a border-category-a-border'
    if (status === 'inactive') return 'bg-status-error-light text-status-error border-status-error'
    if (status === 'auto-closed') return 'bg-status-pending-light text-status-warning border-status-warning'
    return 'bg-surface-bg text-content-primary border-surface-border'
  }

  // Derive the current user's assignment from the active shift
  const currentUserAssignment = activeShift?.assignments?.find(
    (a: any) => a.attendant_id === currentUser?.user_id || a.attendant_name === currentUser?.full_name
  ) || null

  // Nozzles the current user is allowed to submit readings for
  const userNozzles = (() => {
    if (!activeShift) return []
    // If the user has an explicit assignment, restrict to those nozzles
    if (currentUserAssignment?.nozzle_ids?.length > 0) {
      return nozzles.filter(n => currentUserAssignment.nozzle_ids.includes(n.nozzle_id))
    }
    // Supervisors/owners without an assignment can see all nozzles
    if (currentUser?.role === 'supervisor' || currentUser?.role === 'owner') {
      return nozzles
    }
    // Regular user with no assignment — no nozzles
    return []
  })()

  // Shift management handlers
  const canManageShifts = currentUser?.role === 'supervisor' || currentUser?.role === 'owner'

  const openShiftModal = () => {
    loadAvailableStaff()
    loadIslandsData()  // Re-fetch active islands
    fetchNozzles()     // Re-fetch nozzles from active islands
    setEditingShiftId(null)
    setShiftForm({ date: new Date().toISOString().split('T')[0], shift_type: 'Day', assignments: [] })
    setSelectedAttendants([])
    setShowConfirmation(false)
    setValidationMessages([])
    setShowManagementModal(true)
  }

  const openEditModal = (shift: any) => {
    loadAvailableStaff()
    loadIslandsData()
    fetchNozzles()
    setShiftForm({
      date: shift.date,
      shift_type: shift.shift_type,
      assignments: []
    })
    if (shift.assignments && shift.assignments.length > 0) {
      setSelectedAttendants(shift.assignments.map((a: any) => ({
        user_id: a.attendant_id,
        full_name: a.attendant_name,
        island_ids: a.island_ids || [],
        nozzle_ids: a.nozzle_ids || []
      })))
    } else {
      setSelectedAttendants([])
    }
    setEditingShiftId(shift.shift_id)
    setShowConfirmation(false)
    setValidationMessages([])
    setShowManagementModal(true)
  }

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

        // Auto-add all nozzles when island is checked, remove when unchecked
        let nozzle_ids = [...(attendant.nozzle_ids || [])]
        const island = islandsData.find(i => i.island_id === islandId)
        const islandNozzleIds = island?.pump_station?.nozzles?.map((n: any) => n.nozzle_id) || []

        if (checked) {
          // Add all nozzles from this island (avoid duplicates)
          for (const nid of islandNozzleIds) {
            if (!nozzle_ids.includes(nid)) nozzle_ids.push(nid)
          }
        } else {
          // Remove nozzles belonging to the unchecked island
          nozzle_ids = nozzle_ids.filter((nid: string) => !islandNozzleIds.includes(nid))
        }

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
        island.pump_station.nozzles.forEach((nozzle: any) => {
          nozzles.push({
            ...nozzle,
            fuel_type_abbrev: island.fuel_type_abbrev,
          })
        })
      }
    })
    return nozzles
  }

  // Validate shift before creation — returns array of error strings (empty = valid)
  const validateShift = (): string[] => {
    const errors: string[] = []
    const warnings: string[] = []

    // 1. Must have at least one attendant
    if (selectedAttendants.length === 0) {
      errors.push('At least one attendant must be selected.')
    }

    // 2. Every attendant must have at least one island assigned
    selectedAttendants.forEach(a => {
      if (!a.island_ids || a.island_ids.length === 0) {
        errors.push(`${a.full_name} has no islands assigned.`)
      }
    })

    // 3. Every attendant must have at least one nozzle assigned
    selectedAttendants.forEach(a => {
      if (!a.nozzle_ids || a.nozzle_ids.length === 0) {
        errors.push(`${a.full_name} has no nozzles assigned.`)
      }
    })

    // 4. Check for duplicate nozzle assignments across attendants
    const allNozzleIds: string[] = []
    selectedAttendants.forEach(a => {
      (a.nozzle_ids || []).forEach((nid: string) => {
        if (allNozzleIds.includes(nid)) {
          const otherAttendant = selectedAttendants.find(
            other => other.user_id !== a.user_id && other.nozzle_ids?.includes(nid)
          )
          const nozzle = nozzles.find(n => n.nozzle_id === nid)
          const label = nozzle ? getNozzleDisplayName(nozzle) : nid
          errors.push(`Nozzle ${label} is assigned to both ${otherAttendant?.full_name} and ${a.full_name}.`)
        }
        allNozzleIds.push(nid)
      })
    })

    // 5. Check for unassigned active nozzles (warning, not error)
    const assignedNozzleIds = new Set(allNozzleIds)
    const unassignedNozzles = nozzles.filter(n => n.status === 'Active' && !assignedNozzleIds.has(n.nozzle_id))
    if (unassignedNozzles.length > 0) {
      const labels = unassignedNozzles.map(n => getNozzleDisplayName(n)).join(', ')
      warnings.push(`Unassigned active nozzles: ${labels}`)
    }

    // 6. Date validation — warn if not today
    const today = new Date().toISOString().split('T')[0]
    if (shiftForm.date !== today) {
      warnings.push(`Date is ${shiftForm.date}, which is not today (${today}).`)
    }

    // Combine: errors are blocking, warnings are advisory
    return [...errors.map(e => `ERROR: ${e}`), ...warnings.map(w => `WARNING: ${w}`)]
  }

  // State for confirmation step
  const [showConfirmation, setShowConfirmation] = useState(false)
  const [validationMessages, setValidationMessages] = useState<string[]>([])

  const handleValidateAndConfirm = (e: React.FormEvent) => {
    e.preventDefault()
    const messages = validateShift()
    const hasErrors = messages.some(m => m.startsWith('ERROR:'))

    if (hasErrors) {
      setValidationMessages(messages)
      setShowConfirmation(false) // Stay on form, show errors
      return
    }

    // No blocking errors — show confirmation with any warnings
    setValidationMessages(messages)
    setShowConfirmation(true)
  }

  const handleCreateShift = async () => {
    const assignments = selectedAttendants.map(a => ({
      attendant_id: a.user_id,
      attendant_name: a.full_name,
      island_ids: a.island_ids || [],
      nozzle_ids: a.nozzle_ids || []
    }))

    if (editingShiftId) {
      // Edit mode — PUT to update existing shift (must include full shift object)
      const payload = {
        shift_id: editingShiftId,
        date: shiftForm.date,
        shift_type: shiftForm.shift_type,
        attendants: selectedAttendants.map(a => a.full_name),
        assignments,
        status: 'active'
      }

      try {
        const res = await authFetch(`${BASE}/shifts/${editingShiftId}`, {
          method: 'PUT',
          headers: { ...getHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })

        if (!res.ok) {
          const error = await res.json()
          const msg = typeof error.detail === 'string' ? error.detail : Array.isArray(error.detail) ? error.detail.map((e: any) => e.msg || e).join(', ') : 'Unknown error'
          toast.error(`Error updating shift: ${msg}`)
          console.error('Shift update error:', error)
          return
        }

        toast.success('Shift updated successfully!')
        setShowManagementModal(false)
        setShowConfirmation(false)
        setValidationMessages([])
        setSelectedAttendants([])
        setEditingShiftId(null)
        fetchActiveShift()
        fetchAllShifts()
      } catch (err: any) {
        console.error('Failed to update shift:', err)
        toast.error(`Failed to update shift: ${err.message || err.toString()}`)
      }
    } else {
      // Create mode — POST new shift
      const shift_id = `${shiftForm.date}-${shiftForm.shift_type}`
      const payload = {
        shift_id,
        date: shiftForm.date,
        shift_type: shiftForm.shift_type,
        attendants: selectedAttendants.map(a => a.full_name),
        assignments,
        status: 'active'
      }

      try {
        const res = await authFetch(`${BASE}/shifts/`, {
          method: 'POST',
          headers: { ...getHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })

        if (!res.ok) {
          const error = await res.json()
          const errorMessage = error.detail || JSON.stringify(error)
          if (res.status === 400 && errorMessage.includes('already exists')) {
            toast.error('A shift for this date and type already exists. Deactivate the existing shift first.')
          } else {
            toast.error(`Error creating shift: ${errorMessage}`)
          }
          console.error('Shift creation error:', error)
          return
        }

        toast.success('Shift created successfully!')
        setShowManagementModal(false)
        setShowConfirmation(false)
        setValidationMessages([])
        setSelectedAttendants([])
        fetchActiveShift()
        fetchAllShifts()
      } catch (err: any) {
        console.error('Failed to create shift:', err)
        toast.error(`Failed to create shift: ${err.message || err.toString()}`)
      }
    }
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-content-primary">Shift Management</h1>
        <p className="mt-2 text-sm text-content-secondary">Day/Night shift operations and dual meter readings</p>
      </div>

      {/* Current Active Shift Card */}
      <div className="mb-6">
        {activeShift ? (
          <div className="bg-status-success-light rounded-lg shadow-lg p-6 border-2 border-status-success">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-2xl font-bold text-content-primary">
                  {getShiftTypeDisplay(activeShift.shift_type)}
                </h2>
                <p className="text-sm text-content-secondary mt-1">
                  {activeShift.date} | Shift ID: {activeShift.shift_id}
                </p>
              </div>
              <div className="flex items-center space-x-3">
                <span className={`px-4 py-2 rounded-full font-semibold text-sm border-2 ${getShiftStatusColor(activeShift.status)}`}>
                  {activeShift.status.toUpperCase()}
                </span>
                {canManageShifts && (
                  <>
                    <button
                      onClick={openShiftModal}
                      className="px-3 py-1 text-sm bg-action-primary hover:bg-action-primary-hover text-white rounded-md"
                    >
                      Manage Shift
                    </button>
                    <button
                      onClick={() => setShowManageDropdown(!showManageDropdown)}
                      className="px-3 py-1 text-sm bg-category-d hover:bg-category-d/90 text-white rounded-md"
                    >
                      Manage Existing Shift
                    </button>
                    {activeShift.status === 'active' && (
                      <button
                        onClick={() => handleDeactivateShift(activeShift.shift_id)}
                        className="px-3 py-1 text-sm bg-status-error hover:bg-status-error/90 text-white rounded-md"
                      >
                        Deactivate
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Manage Existing Shift Dropdown */}
            {showManageDropdown && canManageShifts && (
              <div className="mb-4 p-4 bg-surface-card rounded-lg border border-category-d-border">
                <h3 className="font-semibold text-content-primary mb-3">Manage Existing Shift</h3>
                <div className="flex flex-wrap items-end gap-3">
                  <div className="flex-1 min-w-[250px]">
                    <label className="block text-sm font-medium text-content-secondary mb-1">Select a shift</label>
                    <select
                      value={selectedShiftId}
                      onChange={(e) => setSelectedShiftId(e.target.value)}
                      className="w-full px-3 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-category-d focus:border-category-d"
                    >
                      <option value="">-- Select Shift --</option>
                      {(() => {
                        const statusOrder: Record<string, number> = { active: 0, completed: 1, reconciled: 2, inactive: 3 }
                        const sorted = [...allShifts].sort((a, b) => {
                          const aO = statusOrder[a.status] ?? 99
                          const bO = statusOrder[b.status] ?? 99
                          if (aO !== bO) return aO - bO
                          if (b.date !== a.date) return b.date.localeCompare(a.date)
                          return a.shift_type.localeCompare(b.shift_type)
                        })
                        return sorted.map((shift: any) => (
                          <option key={shift.shift_id} value={shift.shift_id}>
                            {shift.date} — {shift.shift_type} Shift ({shift.status.toUpperCase()})
                          </option>
                        ))
                      })()}
                    </select>
                  </div>

                  {selectedShiftId && (() => {
                    const shift = allShifts.find(s => s.shift_id === selectedShiftId)
                    if (!shift) return null
                    return (
                      <div className="flex gap-2">
                        <button
                          onClick={() => { openEditModal(shift); setShowManageDropdown(false) }}
                          className="px-4 py-2 bg-action-primary hover:bg-action-primary-hover text-white rounded-md text-sm font-medium"
                        >
                          Edit Shift
                        </button>
                        {shift.status === 'active' && (
                          <button
                            onClick={() => { handleDeactivateShift(shift.shift_id); setSelectedShiftId('') }}
                            className="px-4 py-2 bg-status-error hover:bg-status-error/90 text-white rounded-md text-sm font-medium"
                          >
                            Deactivate
                          </button>
                        )}
                        {currentUser?.role === 'owner' && shift.status === 'inactive' && (
                          <button
                            onClick={() => { handleDeleteShift(shift.shift_id); setSelectedShiftId('') }}
                            className="px-4 py-2 bg-status-error hover:bg-status-error/90 text-white rounded-md text-sm font-medium"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    )
                  })()}
                </div>

                {/* Selected shift summary */}
                {selectedShiftId && (() => {
                  const shift = allShifts.find(s => s.shift_id === selectedShiftId)
                  if (!shift) return null
                  return (
                    <div className={`mt-3 p-3 rounded-lg border ${
                      shift.status === 'active' ? 'bg-status-success-light border-status-success'
                      : shift.status === 'completed' ? 'bg-action-primary-light border-action-primary'
                      : shift.status === 'reconciled' ? 'bg-category-a-light border-category-a-border'
                      : shift.status === 'inactive' ? 'bg-status-error-light border-status-error'
                      : 'bg-surface-bg border-surface-border'
                    }`}>
                      <div className="flex items-center gap-3 mb-2">
                        <span className="font-semibold text-content-primary text-sm">{shift.date} — {shift.shift_type === 'Day' ? 'Day Shift' : 'Night Shift'}</span>
                        <span className={`px-2 py-0.5 text-xs font-semibold rounded-full border ${getShiftStatusColor(shift.status)}`}>
                          {shift.status.toUpperCase()}
                        </span>
                      </div>
                      {shift.assignments && shift.assignments.length > 0 ? (
                        <div className="space-y-1">
                          {shift.assignments.map((a: any) => (
                            <div key={a.attendant_id} className="text-sm">
                              <span className="font-medium text-content-primary">{a.attendant_name}</span>
                              {a.nozzle_ids && a.nozzle_ids.length > 0 && (
                                <span className="text-content-secondary ml-2">
                                  — {a.nozzle_ids.map((nid: string) => {
                                    const nozzle = nozzles.find(n => n.nozzle_id === nid)
                                    return nozzle ? getNozzleDisplayName(nozzle) : nid
                                  }).join(', ')}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : shift.attendants && shift.attendants.length > 0 ? (
                        <p className="text-sm text-content-secondary">Attendants: {shift.attendants.join(', ')}</p>
                      ) : (
                        <p className="text-sm text-content-secondary">No attendant assignments</p>
                      )}
                    </div>
                  )
                })()}
              </div>
            )}

            {/* Attendant Assignments */}
            {activeShift.assignments && activeShift.assignments.length > 0 ? (
              <div className="mt-6">
                <h3 className="font-semibold mb-3 text-content-primary">
                  {canManageShifts ? 'Attendant Assignments:' : 'Your Assignment:'}
                </h3>
                <div className="space-y-4">
                  {/* Regular users only see their own assignment; supervisors/owners see all */}
                  {(canManageShifts
                    ? activeShift.assignments
                    : activeShift.assignments.filter((a: any) =>
                        a.attendant_id === currentUser?.user_id || a.attendant_name === currentUser?.full_name
                      )
                  ).map((assignment: any) => (
                    <div key={assignment.attendant_id} className="p-4 bg-surface-card rounded-lg border border-surface-border">
                      <p className="font-medium mb-2 text-content-primary">👤 {assignment.attendant_name}</p>

                      {assignment.island_ids && assignment.island_ids.length > 0 && (
                        <div className="mb-2">
                          <span className="text-sm text-content-secondary">Islands: </span>
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
                          <span className="text-sm text-content-secondary">Nozzles: </span>
                          <div className="flex flex-wrap gap-2 mt-1">
                            {assignment.nozzle_ids.map((nozzleId: string) => {
                              const nozzle = getFilteredNozzles(assignment.island_ids).find((n: any) => n.nozzle_id === nozzleId)
                              return (
                                <span
                                  key={nozzleId}
                                  className={`px-2 py-1 text-xs rounded ${
                                    nozzle?.fuel_type === 'Petrol'
                                      ? 'bg-action-primary-light text-action-primary'
                                      : 'bg-category-c-light text-category-c'
                                  }`}
                                >
                                  {nozzle ? getNozzleDisplayName(nozzle) : nozzleId}
                                </span>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  {/* User has no assignment */}
                  {!canManageShifts && !currentUserAssignment && (
                    <div className="p-4 bg-status-warning/10 rounded-lg border border-status-warning/30 text-sm text-status-warning">
                      You are not assigned to this shift. Contact your supervisor.
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div className="bg-surface-card rounded-lg p-4 border border-surface-border">
                  <p className="text-xs text-content-secondary font-medium">Attendants on Duty</p>
                  <p className="text-lg font-semibold text-content-primary mt-1">
                    {activeShift.attendants && activeShift.attendants.length > 0
                      ? activeShift.attendants.join(', ')
                      : 'No attendants assigned'}
                  </p>
                </div>
                <div className="bg-surface-card rounded-lg p-4 border border-surface-border">
                  <p className="text-xs text-content-secondary font-medium">Start Time</p>
                  <p className="text-lg font-semibold text-content-primary mt-1">
                    {activeShift.start_time || 'Not recorded'}
                  </p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-status-pending-light border border-status-warning rounded-lg p-4 flex items-center justify-between">
            <p className="text-status-warning">No active shift found.</p>
            {canManageShifts && (
              <button
                onClick={openShiftModal}
                className="px-4 py-2 bg-action-primary hover:bg-action-primary-hover text-white rounded-md font-medium"
              >
                Create Shift
              </button>
            )}
          </div>
        )}
      </div>

      {/* Nozzle Status Overview — supervisor/owner only */}
      {canManageShifts && (
        <div className="mb-6 bg-surface-card rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-bold text-content-primary mb-4">Nozzle Status</h2>

          {nozzles.length === 0 ? (
            <LoadingSpinner text="Loading nozzles..." />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {nozzles.map(nozzle => {
                // Find which attendant this nozzle is assigned to in the active shift
                const assignedAttendant = activeShift?.assignments?.find((a: any) =>
                  a.nozzle_ids?.includes(nozzle.nozzle_id) ||
                  a.island_ids?.some((islId: string) => {
                    // Check if nozzle belongs to this island (fallback for island-level assignments)
                    const island = (activeShift as any)?._islands?.[islId]
                    return island?.pump_station?.nozzles?.some((n: any) => n.nozzle_id === nozzle.nozzle_id)
                  })
                )

                return (
                  <div
                    key={nozzle.nozzle_id}
                    className={`p-4 rounded-lg border-2 ${
                      nozzle.fuel_type === 'Petrol'
                        ? 'bg-action-primary-light border-action-primary'
                        : 'bg-category-c-light border-category-c-border'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-bold text-content-primary">{getNozzleDisplayName(nozzle)}</p>
                        <p className="text-xs text-content-secondary">{nozzle.fuel_type}</p>
                      </div>
                      <span className={`px-2 py-1 text-xs font-semibold rounded ${
                        nozzle.status === 'Active'
                          ? 'bg-status-success-light text-status-success'
                          : nozzle.status === 'Maintenance'
                          ? 'bg-status-warning-light text-status-warning'
                          : 'bg-surface-bg text-content-secondary'
                      }`}>
                        {nozzle.status}
                      </span>
                    </div>
                    {assignedAttendant && (
                      <p className="text-xs mt-1 font-medium text-action-primary">
                        Assigned: {assignedAttendant.attendant_name}
                      </p>
                    )}
                    {!assignedAttendant && activeShift && (
                      <p className="text-xs mt-1 text-content-secondary italic">Unassigned</p>
                    )}
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <p className="text-content-secondary">Electronic</p>
                        <p className="font-semibold">{nozzle.electronic_reading?.toFixed(3) || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-content-secondary">Mechanical</p>
                        <p className="font-semibold">{nozzle.mechanical_reading?.toFixed(0) || 'N/A'}</p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Tank Dip Readings Section */}
      {activeShift && (
        <div className="mb-6 bg-surface-card rounded-lg shadow-lg p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-content-primary">Tank Dip Readings</h2>
            {(currentUser?.role === 'supervisor' || currentUser?.role === 'owner') && (
              <button
                onClick={() => {
                  // Auto-populate opening dip from previous shift if form is empty
                  if (!tankDipForm.opening_dip_cm) {
                    authFetch(`${BASE}/shifts/${activeShift.shift_id}/previous-dip-readings`)
                      .then(r => r.ok ? r.json() : { found: false })
                      .then(data => {
                        if (data.found && data.readings?.length > 0) {
                          // Pre-select first tank and auto-fill opening
                          const first = data.readings[0]
                          setTankDipForm(prev => ({
                            ...prev,
                            tank_id: prev.tank_id || first.tank_id,
                            opening_dip_cm: first.opening_dip_cm?.toFixed(1) || '',
                          }))
                          setPreviousDipData(data)
                        }
                      })
                      .catch(() => {})
                  }
                  setShowTankDipModal(true)
                }}
                className="px-4 py-2 bg-status-success text-white rounded-md hover:bg-status-success/90 font-medium"
              >
                + Record Dip Reading
              </button>
            )}
          </div>

          {/* Existing Tank Dip Readings */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {tankDipReadings.length === 0 ? (
              <div className="col-span-2 p-6 bg-surface-bg rounded-lg border border-surface-border text-center">
                <p className="text-content-secondary">No tank dip readings recorded for this shift yet.</p>
                <p className="text-sm text-content-secondary mt-1">Record opening and closing dip readings for reconciliation.</p>
              </div>
            ) : (
              tankDipReadings.map((reading: any) => {
                const tank = tanks.find(t => t.tank_id === reading.tank_id)
                const isDiesel = tank?.fuel_type === 'Diesel'
                const hasOpening = reading.opening_dip_cm != null
                const hasClosing = reading.closing_dip_cm != null
                const isComplete = hasOpening && hasClosing
                const closingHigher = hasOpening && hasClosing && reading.closing_dip_cm > reading.opening_dip_cm
                const movement = hasOpening && hasClosing
                  ? reading.opening_volume_liters - reading.closing_volume_liters
                  : null
                return (
                  <div
                    key={reading.tank_id}
                    className={`p-4 rounded-lg border-2 ${
                      isDiesel ? 'bg-fuel-diesel-light border-fuel-diesel-border' : 'bg-fuel-petrol-light border-fuel-petrol-border'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h3 className="font-bold text-content-primary">{reading.tank_id}</h3>
                        <span className={`text-xs font-semibold ${isDiesel ? 'text-fuel-diesel' : 'text-fuel-petrol'}`}>
                          {tank?.fuel_type || 'Unknown'}
                        </span>
                      </div>
                      {/* Completeness badge */}
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${
                        isComplete
                          ? 'bg-status-success-light text-status-success'
                          : hasOpening || hasClosing
                          ? 'bg-status-warning-light text-status-warning'
                          : 'bg-status-error-light text-status-error'
                      }`}>
                        {isComplete ? 'Complete' : hasOpening ? 'Needs Closing' : hasClosing ? 'Needs Opening' : 'Missing'}
                      </span>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-content-secondary">Opening Dip:</span>
                        <span className="font-semibold">
                          {hasOpening ? `${reading.opening_dip_cm.toFixed(1)} cm` : <span className="text-status-warning">Not recorded</span>}
                        </span>
                      </div>
                      {reading.opening_volume_liters != null && (
                        <div className="flex justify-between text-xs text-content-secondary">
                          <span>Opening Volume:</span>
                          <span>{Math.round(reading.opening_volume_liters).toLocaleString()} L</span>
                        </div>
                      )}

                      <div className="flex justify-between text-sm">
                        <span className="text-content-secondary">Closing Dip:</span>
                        <span className="font-semibold">
                          {hasClosing ? `${reading.closing_dip_cm.toFixed(1)} cm` : <span className="text-status-warning">Not recorded</span>}
                        </span>
                      </div>
                      {reading.closing_volume_liters != null && (
                        <div className="flex justify-between text-xs text-content-secondary">
                          <span>Closing Volume:</span>
                          <span>{Math.round(reading.closing_volume_liters).toLocaleString()} L</span>
                        </div>
                      )}

                      {movement != null && (
                        <div className="mt-2 pt-2 border-t border-surface-border">
                          <div className="flex justify-between text-sm font-semibold">
                            <span className="text-action-primary">Tank Movement:</span>
                            <span className="text-action-primary">
                              {Math.round(movement).toLocaleString()} L
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Warning: closing dip higher than opening (possible delivery not recorded) */}
                      {closingHigher && (
                        <div className="mt-2 p-2 bg-status-warning-light border border-status-warning rounded text-xs text-status-warning">
                          Closing dip is higher than opening — a delivery may have occurred. Verify delivery records.
                        </div>
                      )}

                      {/* Timestamp */}
                      {reading.recorded_at && (
                        <div className="text-[10px] text-content-secondary mt-1">
                          Last updated: {new Date(reading.recorded_at).toLocaleString()}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Show tanks without dip readings yet */}
          {tanks.length > 0 && tankDipReadings.length > 0 && tanks.length > tankDipReadings.length && (
            <div className="mt-3 p-2 bg-status-warning-light border border-status-warning rounded text-xs text-status-warning">
              {tanks.filter(t => !tankDipReadings.some((r: any) => r.tank_id === t.tank_id)).map(t => t.tank_id).join(', ')} — no dip readings yet. Record before shift end for reconciliation.
            </div>
          )}
        </div>
      )}

      {/* Tank Dip Reading Modal */}
      {showTankDipModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-surface-card rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-content-primary mb-4">Record Tank Dip Reading</h3>

            <form onSubmit={handleSubmitTankDipReading} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-content-secondary mb-1">
                  Select Tank
                </label>
                <select
                  value={tankDipForm.tank_id}
                  onChange={(e) => {
                    const tankId = e.target.value
                    // Auto-fill opening from previous shift data if available
                    const prevReading = previousDipData?.readings?.find((r: any) => r.tank_id === tankId)
                    // Also check if there's already a recorded reading for this tank (update mode)
                    const existingReading = tankDipReadings.find((r: any) => r.tank_id === tankId)
                    setTankDipForm({
                      tank_id: tankId,
                      opening_dip_cm: existingReading?.opening_dip_cm?.toFixed(1) || prevReading?.opening_dip_cm?.toFixed(1) || '',
                      closing_dip_cm: existingReading?.closing_dip_cm?.toFixed(1) || '',
                    })
                  }}
                  className="w-full px-3 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-2 focus:ring-action-primary"
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

              {/* Auto-populated indicator */}
              {previousDipData?.found && tankDipForm.opening_dip_cm && !tankDipReadings.some((r: any) => r.tank_id === tankDipForm.tank_id && r.opening_dip_cm) && (
                <div className="p-2 bg-status-success-light border border-status-success rounded text-xs text-status-success">
                  Opening dip auto-filled from previous shift ({previousDipData.source_shift_type} {previousDipData.source_date})
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-content-secondary mb-1">
                  Opening Dip (cm)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={tankDipForm.opening_dip_cm}
                  onChange={(e) => setTankDipForm({ ...tankDipForm, opening_dip_cm: e.target.value })}
                  className="w-full px-3 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-2 focus:ring-action-primary"
                  placeholder="e.g., 165.5"
                />
                <p className="text-xs text-content-secondary mt-1">Dip reading at shift start</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-content-secondary mb-1">
                  Closing Dip (cm)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={tankDipForm.closing_dip_cm}
                  onChange={(e) => setTankDipForm({ ...tankDipForm, closing_dip_cm: e.target.value })}
                  className="w-full px-3 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-2 focus:ring-action-primary"
                  placeholder="e.g., 155.4"
                />
                <p className="text-xs text-content-secondary mt-1">Dip reading at shift end</p>
              </div>

              {/* Closing > Opening warning */}
              {tankDipForm.opening_dip_cm && tankDipForm.closing_dip_cm &&
                parseFloat(tankDipForm.closing_dip_cm) > parseFloat(tankDipForm.opening_dip_cm) && (
                <div className="p-2 bg-status-warning-light border border-status-warning rounded text-xs text-status-warning">
                  Closing dip ({tankDipForm.closing_dip_cm} cm) is higher than opening ({tankDipForm.opening_dip_cm} cm). This usually means a delivery occurred during the shift — make sure it's recorded.
                </div>
              )}

              <div className="p-3 bg-action-primary-light border border-action-primary rounded-md">
                <p className="text-xs text-action-primary">
                  <strong>Tip:</strong> Record opening dip at shift start and closing dip at shift end.
                  Both are needed for reconciliation. You can save opening now and update with closing later.
                </p>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={loading || !tankDipForm.tank_id}
                  className="flex-1 px-4 py-2 bg-action-primary text-white rounded-md hover:bg-action-primary-hover disabled:bg-content-secondary disabled:cursor-not-allowed"
                >
                  {loading ? 'Saving...' : 'Save Reading'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowTankDipModal(false)
                    setTankDipForm({ tank_id: '', opening_dip_cm: '', closing_dip_cm: '' })
                    setPreviousDipData(null)
                  }}
                  className="px-4 py-2 bg-surface-border text-content-secondary rounded-md hover:bg-surface-border"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Shift History Section */}
      {canManageShifts && (
        <div className="mt-6 bg-surface-card rounded-lg shadow-lg p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-content-primary">Shift History</h2>
            <button
              onClick={() => { setShowHistory(!showHistory); if (!showHistory) fetchAllShifts() }}
              className="px-3 py-1 text-sm bg-surface-bg hover:bg-surface-border text-content-secondary rounded-md border"
            >
              {showHistory ? 'Hide' : 'Show'} History
            </button>
          </div>

          {showHistory && (
            <div className="space-y-3">
              {allShifts.length === 0 ? (
                <p className="text-content-secondary text-sm">No shifts found.</p>
              ) : (
                allShifts.map((shift: any) => (
                  <div
                    key={shift.shift_id}
                    className={`p-4 rounded-lg border-2 ${
                      shift.status === 'inactive'
                        ? 'bg-status-error-light border-status-error'
                        : shift.status === 'active'
                        ? 'bg-status-success-light border-status-success'
                        : shift.status === 'completed'
                        ? 'bg-action-primary-light border-action-primary'
                        : shift.status === 'reconciled'
                        ? 'bg-category-a-light border-category-a-border'
                        : shift.status === 'auto-closed'
                        ? 'bg-status-pending-light border-status-warning'
                        : 'bg-surface-bg border-surface-border'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-semibold text-content-primary">{shift.date}</span>
                        <span className="ml-2 text-sm text-content-secondary">
                          {shift.shift_type === 'Day' ? 'Day Shift' : 'Night Shift'}
                        </span>
                        <span className={`ml-3 px-2 py-0.5 text-xs font-semibold rounded-full border ${getShiftStatusColor(shift.status)}`}>
                          {shift.status.toUpperCase()}
                        </span>
                        {shift.auto_closed && (
                          <span className="ml-2 text-xs text-status-warning" title={shift.auto_close_reason || 'Auto-closed due to inactivity'}>
                            (auto-closed)
                          </span>
                        )}
                      </div>
                      <div className="flex items-center space-x-2">
                        {/* Deactivate: supervisor/owner, active shifts only */}
                        {canManageShifts && shift.status === 'active' && (
                          <button
                            onClick={() => handleDeactivateShift(shift.shift_id)}
                            className="px-2 py-1 text-xs bg-status-error hover:bg-status-error/90 text-white rounded"
                          >
                            Deactivate
                          </button>
                        )}
                        {/* Delete: owner only, inactive shifts only */}
                        {currentUser?.role === 'owner' && shift.status === 'inactive' && (
                          <button
                            onClick={() => handleDeleteShift(shift.shift_id)}
                            className="px-2 py-1 text-xs bg-status-error hover:bg-status-error/90 text-white rounded"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                    {/* Attendant names */}
                    {shift.assignments && shift.assignments.length > 0 ? (
                      <p className="mt-2 text-sm text-content-secondary">
                        Attendants: {shift.assignments.map((a: any) => a.attendant_name).join(', ')}
                      </p>
                    ) : shift.attendants && shift.attendants.length > 0 ? (
                      <p className="mt-2 text-sm text-content-secondary">
                        Attendants: {shift.attendants.join(', ')}
                      </p>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* My Recent Shifts — regular users see their own shifts from last 7 days */}
      {!canManageShifts && (
        <div className="mt-6 bg-surface-card rounded-lg shadow-lg p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-content-primary">My Recent Shifts</h2>
            <span className="text-xs text-content-secondary">Last 7 days</span>
          </div>

          {(() => {
            const sevenDaysAgo = new Date()
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
            const cutoff = sevenDaysAgo.toISOString().split('T')[0]

            const myShifts = allShifts.filter((shift: any) => {
              if (shift.date < cutoff) return false
              // Check if user was assigned to this shift
              if (shift.assignments?.length > 0) {
                return shift.assignments.some((a: any) =>
                  a.attendant_id === currentUser?.user_id || a.attendant_name === currentUser?.full_name
                )
              }
              // Fallback: check attendants list
              if (shift.attendants?.length > 0) {
                return shift.attendants.includes(currentUser?.full_name)
              }
              return false
            })

            if (myShifts.length === 0) {
              return <p className="text-sm text-content-secondary/60 text-center py-4">No shifts in the last 7 days.</p>
            }

            return (
              <div className="space-y-3">
                {myShifts.map((shift: any) => {
                  const myAssignment = shift.assignments?.find((a: any) =>
                    a.attendant_id === currentUser?.user_id || a.attendant_name === currentUser?.full_name
                  )
                  return (
                    <div
                      key={shift.shift_id}
                      className={`p-4 rounded-lg border ${
                        shift.status === 'active'
                          ? 'bg-status-success-light border-status-success'
                          : shift.status === 'completed' || shift.status === 'reconciled'
                          ? 'bg-action-primary-light border-action-primary'
                          : shift.status === 'auto-closed'
                          ? 'bg-status-pending-light border-status-warning'
                          : 'bg-surface-bg border-surface-border'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-semibold text-content-primary">{shift.date}</span>
                          <span className="ml-2 text-sm text-content-secondary">
                            {shift.shift_type === 'Day' ? 'Day Shift' : 'Night Shift'}
                          </span>
                          <span className={`ml-3 px-2 py-0.5 text-xs font-semibold rounded-full border ${getShiftStatusColor(shift.status)}`}>
                            {shift.status.toUpperCase()}
                          </span>
                        </div>
                      </div>
                      {myAssignment && myAssignment.nozzle_ids?.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {myAssignment.nozzle_ids.map((nid: string) => {
                            const nozzle = nozzles.find((n: any) => n.nozzle_id === nid)
                            return (
                              <span
                                key={nid}
                                className={`px-2 py-0.5 text-xs rounded ${
                                  nozzle?.fuel_type === 'Petrol'
                                    ? 'bg-action-primary-light text-action-primary'
                                    : 'bg-category-c-light text-category-c'
                                }`}
                              >
                                {nozzle ? getNozzleDisplayName(nozzle) : nid}
                              </span>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })()}
        </div>
      )}

      {/* Info Panel */}
      <div className="bg-action-primary-light border border-action-primary rounded-lg p-4">
        <h3 className="text-sm font-semibold text-action-primary mb-2">Shift Management System</h3>
        <ul className="text-sm text-action-primary space-y-1">
          <li>• Day Shift: 6:00 AM - 6:00 PM</li>
          <li>• Night Shift: 6:00 PM - 6:00 AM</li>
          <li>• Each shift requires Opening and Closing readings for all 8 nozzles</li>
          <li>• Electronic + Mechanical readings provide verification and loss detection</li>
          <li>• Tank dip readings help reconcile physical inventory with meter readings</li>
        </ul>
      </div>

      {/* Shift Management Modal */}
      {showManagementModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-surface-card rounded-lg p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold">{editingShiftId ? 'Edit Shift' : 'Create Shift'}</h2>
              <button onClick={() => { setShowManagementModal(false); setEditingShiftId(null) }} className="text-content-secondary hover:text-content-primary text-2xl">
                ✕
              </button>
            </div>

            <form onSubmit={handleValidateAndConfirm}>
              {/* Validation Messages */}
              {validationMessages.length > 0 && !showConfirmation && (
                <div className="mb-4 p-4 rounded-lg border bg-status-error-light border-status-error">
                  <h4 className="font-semibold text-status-error mb-2">Please fix the following before {editingShiftId ? 'saving' : 'creating'} the shift:</h4>
                  <ul className="space-y-1">
                    {validationMessages.filter(m => m.startsWith('ERROR:')).map((msg, i) => (
                      <li key={i} className="text-sm text-status-error flex items-start gap-2">
                        <span className="mt-0.5">&#x2717;</span>
                        <span>{msg.replace('ERROR: ', '')}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Date and Shift Type */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-sm font-medium mb-1">Date</label>
                  <input
                    type="date"
                    value={shiftForm.date}
                    onChange={(e) => setShiftForm({...shiftForm, date: e.target.value})}
                    className={`w-full px-3 py-2 border rounded-md ${editingShiftId ? 'bg-surface-bg text-content-secondary' : ''}`}
                    required
                    disabled={!!editingShiftId}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Shift Type</label>
                  <select
                    value={shiftForm.shift_type}
                    onChange={(e) => setShiftForm({...shiftForm, shift_type: e.target.value})}
                    className={`w-full px-3 py-2 border rounded-md ${editingShiftId ? 'bg-surface-bg text-content-secondary' : ''}`}
                    required
                    disabled={!!editingShiftId}
                  >
                    <option value="Day">Day (6AM - 6PM)</option>
                    <option value="Night">Night (6PM - 6AM)</option>
                  </select>
                  {editingShiftId && (
                    <p className="text-xs text-content-secondary mt-1">Date and shift type cannot be changed</p>
                  )}
                </div>
              </div>

              {/* Attendant Selection */}
              <div className="mb-6">
                <label className="block text-sm font-medium mb-2">Select Attendants</label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {availableStaff.map(staff => (
                    <label key={staff.user_id} className="flex items-center space-x-2 p-2 border rounded hover:bg-surface-bg cursor-pointer">
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
                <div key={attendant.user_id} className="mb-6 p-4 border rounded-lg bg-surface-bg">
                  <h3 className="font-semibold mb-3">👤 {attendant.full_name}</h3>

                  {/* Island Selection */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium mb-2">Assigned Islands</label>
                    <div className="flex flex-wrap gap-2">
                      {islandsData.map(island => (
                        <label key={island.island_id} className="flex items-center space-x-2 p-2 border rounded hover:bg-action-primary-light cursor-pointer">
                          <input
                            type="checkbox"
                            checked={attendant.island_ids?.includes(island.island_id) || false}
                            onChange={(e) => handleIslandToggle(attendant.user_id, island.island_id, e.target.checked)}
                            className="form-checkbox"
                          />
                          <span className="text-sm">{island.name}{island.fuel_type_abbrev ? ` (${island.fuel_type_abbrev})` : ''}</span>
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
                          className={`flex items-center space-x-2 p-2 border rounded hover:bg-action-primary-light cursor-pointer ${
                            nozzle.fuel_type === 'Petrol' ? 'border-fuel-petrol-border' : 'border-fuel-diesel-border'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={attendant.nozzle_ids?.includes(nozzle.nozzle_id) || false}
                            onChange={(e) => handleNozzleToggle(attendant.user_id, nozzle.nozzle_id, e.target.checked)}
                            className="form-checkbox"
                          />
                          <span className="text-sm">{getNozzleDisplayName(nozzle)}</span>
                        </label>
                      ))}
                    </div>
                    {(!attendant.island_ids || attendant.island_ids.length === 0) && (
                      <p className="text-sm text-content-secondary mt-2">Select islands first to see available nozzles</p>
                    )}
                  </div>
                </div>
              ))}

              {/* Confirmation Summary */}
              {showConfirmation && (
                <div className="mt-6 p-4 rounded-lg border-2 border-action-primary bg-action-primary-light">
                  <h4 className="font-bold text-action-primary mb-3">Confirm Shift Details</h4>
                  <div className="text-sm text-action-primary space-y-2 mb-4">
                    <p><strong>Date:</strong> {shiftForm.date}</p>
                    <p><strong>Type:</strong> {shiftForm.shift_type} Shift</p>
                    <p><strong>Shift ID:</strong> {shiftForm.date}-{shiftForm.shift_type}</p>
                    <div className="mt-2">
                      <strong>Assignments:</strong>
                      {selectedAttendants.map(a => (
                        <div key={a.user_id} className="ml-4 mt-1">
                          <span className="font-medium">{a.full_name}</span>
                          <span className="text-action-primary">
                            {' '}&#8212; {(a.island_ids || []).length} island(s), {(a.nozzle_ids || []).length} nozzle(s)
                          </span>
                          <div className="ml-2 text-xs text-action-primary">
                            Nozzles: {(a.nozzle_ids || []).map((nid: string) => {
                              const nozzle = nozzles.find(n => n.nozzle_id === nid)
                              return nozzle ? getNozzleDisplayName(nozzle) : nid
                            }).join(', ') || 'None'}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Warnings (non-blocking) */}
                  {validationMessages.filter(m => m.startsWith('WARNING:')).length > 0 && (
                    <div className="mb-4 p-3 rounded bg-status-pending-light border border-status-warning">
                      <h5 className="font-semibold text-status-warning text-sm mb-1">Warnings:</h5>
                      <ul className="space-y-1">
                        {validationMessages.filter(m => m.startsWith('WARNING:')).map((msg, i) => (
                          <li key={i} className="text-sm text-status-warning flex items-start gap-2">
                            <span className="mt-0.5">&#9888;</span>
                            <span>{msg.replace('WARNING: ', '')}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <p className="text-sm text-action-primary font-medium mb-3">
                    This action cannot be undone. Are you sure you want to proceed?
                  </p>

                  <div className="flex justify-end space-x-3">
                    <button
                      type="button"
                      onClick={() => { setShowConfirmation(false); setValidationMessages([]) }}
                      className="px-4 py-2 border rounded-md hover:bg-surface-bg"
                    >
                      Go Back
                    </button>
                    <button
                      type="button"
                      onClick={handleCreateShift}
                      className="px-4 py-2 bg-status-success text-white rounded-md hover:bg-status-success/90 font-semibold"
                    >
                      {editingShiftId ? 'Confirm & Save Changes' : 'Confirm & Create Shift'}
                    </button>
                  </div>
                </div>
              )}

              {/* Submit Buttons (pre-confirmation) */}
              {!showConfirmation && (
                <div className="flex justify-end space-x-3 mt-6">
                  <button
                    type="button"
                    onClick={() => { setShowManagementModal(false); setEditingShiftId(null); setValidationMessages([]) }}
                    className="px-4 py-2 border rounded-md hover:bg-surface-bg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-action-primary text-white rounded-md hover:bg-action-primary-hover disabled:opacity-50"
                    disabled={selectedAttendants.length === 0}
                  >
                    {editingShiftId ? 'Review & Save Changes' : 'Review & Create Shift'}
                  </button>
                </div>
              )}
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
