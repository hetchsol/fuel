import { useState, useEffect } from 'react'
import { getHeaders, authFetch } from '../lib/api'

const BASE = '/api/v1'

interface Tank {
  tank_id: string
  fuel_type: string
  current_level: number
  capacity: number
  last_updated: string
  percentage: number
  display_name?: string
}

interface Nozzle {
  nozzle_id: string
  pump_station_id: string
  fuel_type: string
  tank_id: string | null
  status: string
  electronic_reading: number
  mechanical_reading: number
  display_label: string | null
  fuel_type_abbrev: string | null
  custom_label: string | null
}

interface PumpStation {
  pump_station_id: string
  island_id: string
  name: string
  tank_id: string | null
  nozzles: Nozzle[]
}

interface Island {
  island_id: string
  name: string
  location: string
  status: string
  product_type: string | null
  pump_station: PumpStation
  display_number: number | null
  fuel_type_abbrev: string | null
}

type PresetMode = 'all_diesel' | 'all_petrol' | 'mixed' | 'custom'

interface IslandPresetDraft {
  preset: PresetMode
  diesel_tank_id?: string
  petrol_tank_id?: string
  nozzle_assignments: { nozzle_id: string; tank_id: string }[]
}

export default function Infrastructure() {
  const [activeTab, setActiveTab] = useState<'tanks' | 'islands'>('tanks')
  const [tanks, setTanks] = useState<Tank[]>([])
  const [islands, setIslands] = useState<Island[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Island display-name edit state
  const [editingIslandName, setEditingIslandName] = useState<string | null>(null)
  const [islandNameDraft, setIslandNameDraft] = useState<string>('')

  // Tank capacity edit state
  const [editingTank, setEditingTank] = useState<string | null>(null)
  const [newCapacity, setNewCapacity] = useState<number>(0)
  const [editingTankName, setEditingTankName] = useState<string | null>(null)
  const [tankNameDraft, setTankNameDraft] = useState<string>('')
  const [calibStatus, setCalibStatus] = useState<Record<string, { found: boolean; point_count?: number }>>({})
  const [calibBusy, setCalibBusy] = useState<string | null>(null)

  // Create tank state
  const [showCreateTank, setShowCreateTank] = useState(false)
  const [newTank, setNewTank] = useState({
    tank_id: '',
    fuel_type: 'Diesel',
    capacity: 0,
    initial_level: 0
  })
  const [tankLoading, setTankLoading] = useState(false)

  // Per-island preset draft (keyed by island_id). Used to stage tank selections
  // before clicking Apply.
  const [presetDraft, setPresetDraft] = useState<Record<string, IslandPresetDraft>>({})
  const [showAdvanced, setShowAdvanced] = useState<Record<string, boolean>>({})

  useEffect(() => {
    fetchTanks()
    fetchIslands()
  }, [])

  const fetchTanks = async () => {
    try {
      const res = await authFetch(`${BASE}/tanks/levels`, {
        headers: getHeaders(),
      })
      if (res.ok) {
        const data = await res.json()
        setTanks(data)
        fetchCalibStatus(data)
      }
    } catch (err) {
      console.error('Failed to fetch tanks:', err)
    }
  }

  const fetchCalibStatus = async (tankList: Tank[]) => {
    try {
      const entries = await Promise.all(tankList.map(async (t) => {
        try {
          const res = await authFetch(`${BASE}/tank-calibrations/${t.tank_id}`, { headers: getHeaders() })
          if (res.ok) {
            const d = await res.json()
            return [t.tank_id, { found: !!d.found, point_count: d.point_count }] as const
          }
        } catch { /* ignore */ }
        return [t.tank_id, { found: false }] as const
      }))
      setCalibStatus(Object.fromEntries(entries))
    } catch { /* ignore */ }
  }

  const downloadCalibTemplate = async () => {
    try {
      const res = await authFetch(`${BASE}/tank-calibrations/template`, { headers: getHeaders() })
      if (!res.ok) { setMessage({ type: 'error', text: 'Failed to download template' }); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'tank_calibration_template.xlsx'
      a.click()
      URL.revokeObjectURL(url)
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'Network error' })
    }
  }

  const uploadCalibration = async (tankId: string, file: File) => {
    setCalibBusy(tankId)
    setMessage(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      // Plain fetch (not authFetch) so the browser sets the multipart boundary.
      const res = await fetch(`${BASE}/tank-calibrations/upload?tank_id=${encodeURIComponent(tankId)}`, {
        method: 'POST',
        headers: getHeaders(),
        body: fd,
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setMessage({ type: 'success', text: `Calibration uploaded for ${tankId} (${data.point_count ?? '?'} points)` })
        fetchTanks()
        setTimeout(() => setMessage(null), 4000)
      } else {
        setMessage({ type: 'error', text: data.detail || 'Upload failed' })
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'Network error' })
    } finally {
      setCalibBusy(null)
    }
  }

  const fetchIslands = async () => {
    try {
      const res = await authFetch(`${BASE}/islands/`, {
        headers: getHeaders(),
      })
      if (res.ok) {
        const data = await res.json()
        setIslands(data)
      }
    } catch (err) {
      console.error('Failed to fetch islands:', err)
    }
  }

  const createTank = async () => {
    setTankLoading(true)
    setMessage(null)
    try {
      const res = await authFetch(`${BASE}/tanks/create?tank_id=${encodeURIComponent(newTank.tank_id)}&fuel_type=${encodeURIComponent(newTank.fuel_type)}&capacity=${newTank.capacity}&initial_level=${newTank.initial_level}`, {
        method: 'POST',
        headers: getHeaders(),
      })

      if (res.ok) {
        const data = await res.json()
        setMessage({ type: 'success', text: data.message })
        fetchTanks()
        setShowCreateTank(false)
        setNewTank({ tank_id: '', fuel_type: 'Diesel', capacity: 0, initial_level: 0 })
        setTimeout(() => setMessage(null), 5000)
      } else {
        const error = await res.json()
        setMessage({ type: 'error', text: error.detail || 'Failed to create tank' })
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Network error' })
    } finally {
      setTankLoading(false)
    }
  }

  const deleteTank = async (tankId: string) => {
    if (!confirm(`Are you sure you want to delete ${tankId}? This action cannot be undone.`)) {
      return
    }

    setTankLoading(true)
    setMessage(null)
    try {
      const res = await authFetch(`${BASE}/tanks/${tankId}`, {
        method: 'DELETE',
        headers: getHeaders(),
      })

      if (res.ok) {
        const data = await res.json()
        setMessage({ type: 'success', text: data.message })
        fetchTanks()
        setTimeout(() => setMessage(null), 5000)
      } else {
        const error = await res.json()
        setMessage({ type: 'error', text: error.detail || 'Failed to delete tank' })
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Network error' })
    } finally {
      setTankLoading(false)
    }
  }

  const deleteIsland = async (islandId: string, islandName: string) => {
    if (!confirm(`Delete ${islandName} (${islandId})? This will remove the island and all its nozzles. This cannot be undone.`)) return
    setLoading(true)
    setMessage(null)
    try {
      const res = await authFetch(`${BASE}/islands/${islandId}`, { method: 'DELETE', headers: getHeaders() })
      if (res.ok) {
        const data = await res.json()
        setMessage({ type: 'success', text: data.message || `${islandName} deleted` })
        fetchIslands()
        setTimeout(() => setMessage(null), 5000)
      } else {
        const error = await res.json()
        setMessage({ type: 'error', text: error.detail || 'Failed to delete island' })
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Network error' })
    } finally {
      setLoading(false)
    }
  }

  const renameIsland = async (islandId: string) => {
    const name = islandNameDraft.trim()
    if (!name) {
      setMessage({ type: 'error', text: 'Island name cannot be empty' })
      return
    }
    setLoading(true)
    setMessage(null)
    try {
      const res = await authFetch(`${BASE}/islands/${islandId}/name`, {
        method: 'PUT',
        headers: { ...getHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (res.ok) {
        setMessage({ type: 'success', text: `Island renamed to "${name}"` })
        setEditingIslandName(null)
        fetchIslands()
        setTimeout(() => setMessage(null), 4000)
      } else {
        const error = await res.json()
        setMessage({ type: 'error', text: error.detail || 'Failed to rename island' })
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'Network error' })
    } finally {
      setLoading(false)
    }
  }

  const saveTankName = async (tankId: string) => {
    setLoading(true)
    setMessage(null)
    try {
      const res = await authFetch(`${BASE}/tanks/${tankId}/name?name=${encodeURIComponent(tankNameDraft.trim())}`, {
        method: 'PUT',
        headers: getHeaders(),
      })
      if (res.ok) {
        setMessage({ type: 'success', text: 'Tank name updated' })
        setEditingTankName(null)
        setTankNameDraft('')
        fetchTanks()
        setTimeout(() => setMessage(null), 4000)
      } else {
        const error = await res.json()
        setMessage({ type: 'error', text: error.detail || 'Failed to rename tank' })
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'Network error' })
    } finally {
      setLoading(false)
    }
  }

  const updateTankCapacity = async (tankId: string, capacity: number) => {
    setLoading(true)
    try {
      const res = await authFetch(`${BASE}/tanks/${tankId}/capacity?new_capacity=${capacity}`, {
        method: 'PUT',
        headers: getHeaders(),
      })

      if (res.ok) {
        const data = await res.json()
        setMessage({ type: 'success', text: data.message })
        fetchTanks()
        setEditingTank(null)
      } else {
        const error = await res.json()
        setMessage({ type: 'error', text: error.detail || 'Failed to update capacity' })
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Network error' })
    } finally {
      setLoading(false)
    }
  }

  // ─── Preset helpers ────────────────────────────────────────────────────

  const dieselTanks = tanks.filter(t => t.fuel_type === 'Diesel')
  const petrolTanks = tanks.filter(t => t.fuel_type === 'Petrol')

  /** Infer the preset that best matches an island's current configuration. */
  const inferPreset = (island: Island): IslandPresetDraft => {
    const nozzles = island.pump_station?.nozzles || []
    const fuels = new Set(nozzles.map(n => n.fuel_type).filter(Boolean))
    const diesel_tank_id = nozzles.find(n => n.fuel_type === 'Diesel')?.tank_id || dieselTanks[0]?.tank_id
    const petrol_tank_id = nozzles.find(n => n.fuel_type === 'Petrol')?.tank_id || petrolTanks[0]?.tank_id
    const nozzle_assignments = nozzles.map(n => ({
      nozzle_id: n.nozzle_id,
      tank_id: n.tank_id || (n.fuel_type === 'Diesel' ? diesel_tank_id : petrol_tank_id) || '',
    }))

    if (fuels.size === 1 && fuels.has('Diesel')) {
      // Same-fuel uniform tanks → all_diesel; otherwise custom
      const tanksUsed = new Set(nozzles.map(n => n.tank_id))
      if (tanksUsed.size <= 1) {
        return { preset: 'all_diesel', diesel_tank_id, petrol_tank_id, nozzle_assignments }
      }
      return { preset: 'custom', diesel_tank_id, petrol_tank_id, nozzle_assignments }
    }
    if (fuels.size === 1 && fuels.has('Petrol')) {
      const tanksUsed = new Set(nozzles.map(n => n.tank_id))
      if (tanksUsed.size <= 1) {
        return { preset: 'all_petrol', diesel_tank_id, petrol_tank_id, nozzle_assignments }
      }
      return { preset: 'custom', diesel_tank_id, petrol_tank_id, nozzle_assignments }
    }
    if (fuels.size === 2 && nozzles.length === 2) {
      return { preset: 'mixed', diesel_tank_id, petrol_tank_id, nozzle_assignments }
    }
    return { preset: 'custom', diesel_tank_id, petrol_tank_id, nozzle_assignments }
  }

  /** Get the live draft for an island (initialising from current state if needed). */
  const getDraft = (island: Island): IslandPresetDraft => {
    return presetDraft[island.island_id] || inferPreset(island)
  }

  const updateDraft = (island: Island, patch: Partial<IslandPresetDraft>) => {
    setPresetDraft(prev => ({
      ...prev,
      // Seed from the inferred preset on first edit so partial drafts always
      // carry nozzle_assignments / tank ids (otherwise switching to Custom
      // mode would render with undefined nozzle_assignments).
      [island.island_id]: { ...(prev[island.island_id] || inferPreset(island)), ...patch } as IslandPresetDraft,
    }))
  }

  const applyPreset = async (island: Island) => {
    const draft = getDraft(island)
    const body: any = { preset: draft.preset }

    if (draft.preset === 'custom') {
      body.nozzle_assignments = draft.nozzle_assignments
    } else {
      const tanksPayload: any = {}
      if ((draft.preset === 'all_diesel' || draft.preset === 'mixed') && dieselTanks.length > 1) {
        tanksPayload.diesel_tank_id = draft.diesel_tank_id
      }
      if ((draft.preset === 'all_petrol' || draft.preset === 'mixed') && petrolTanks.length > 1) {
        tanksPayload.petrol_tank_id = draft.petrol_tank_id
      }
      if (Object.keys(tanksPayload).length > 0) body.tanks = tanksPayload
    }

    setLoading(true)
    try {
      const res = await authFetch(`${BASE}/islands/${island.island_id}/preset`, {
        method: 'POST',
        headers: { ...getHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        const data = await res.json()
        const summary = data.island_product_type === 'Mixed'
          ? 'Mixed (LSD + UNL)'
          : data.island_product_type
        setMessage({ type: 'success', text: `${island.island_id} configured: ${summary}` })
        // Clear the draft so next render reads from fresh server data
        setPresetDraft(prev => { const n = { ...prev }; delete n[island.island_id]; return n })
        fetchIslands()
        setTimeout(() => setMessage(null), 4000)
      } else {
        const err = await res.json()
        setMessage({ type: 'error', text: err.detail || 'Failed to apply preset' })
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'Network error' })
    } finally {
      setLoading(false)
    }
  }

  const toggleIslandStatus = async (islandId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active'
    setLoading(true)
    try {
      const res = await authFetch(`${BASE}/islands/${islandId}/status`, {
        method: 'PUT',
        headers: { ...getHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })

      if (res.ok) {
        setMessage({ type: 'success', text: `${islandId} is now ${newStatus}` })
        fetchIslands()
      } else {
        const error = await res.json()
        setMessage({ type: 'error', text: error.detail || 'Failed to update status' })
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Network error' })
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString()
  }

  const getNozzleColor = (fuelType: string) => {
    if (fuelType === 'Petrol') return 'bg-fuel-petrol-light text-fuel-petrol border-fuel-petrol-border'
    if (fuelType === 'Diesel') return 'bg-fuel-diesel-light text-fuel-diesel border-fuel-diesel-border'
    return 'bg-surface-bg text-content-secondary border-surface-border'
  }

  const getStatusBadge = (status: string) => {
    if (status === 'active') return 'bg-status-success-light text-status-success border-status-success'
    return 'bg-surface-bg text-content-secondary border-surface-border'
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-content-primary">Infrastructure Management</h1>
        <p className="mt-2 text-sm text-content-secondary">Manage tanks, islands, pumps, and nozzles</p>
      </div>

      {/* Message Display */}
      {message && (
        <div className={`mb-6 p-4 rounded-lg border ${
          message.type === 'success'
            ? 'bg-status-success-light border-status-success text-status-success'
            : 'bg-status-error-light border-status-error text-status-error'
        }`}>
          <p className="font-semibold">{message.text}</p>
          <button
            onClick={() => setMessage(null)}
            className="mt-2 text-sm underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="mb-6 border-b border-surface-border">
        <nav className="-mb-px flex flex-wrap gap-2 sm:gap-8 overflow-x-auto">
          <button
            onClick={() => setActiveTab('tanks')}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'tanks'
                ? 'border-action-primary text-action-primary'
                : 'border-transparent text-content-secondary hover:text-content-secondary hover:border-surface-border'
            }`}
          >
            Tank Management
          </button>
          <button
            onClick={() => setActiveTab('islands')}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'islands'
                ? 'border-action-primary text-action-primary'
                : 'border-transparent text-content-secondary hover:text-content-secondary hover:border-surface-border'
            }`}
          >
            Islands & Pumps
          </button>
        </nav>
      </div>

      {/* Tanks Tab */}
      {activeTab === 'tanks' && (
        <div>
          <div className="mb-6 flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold text-content-primary mb-2">Fuel Tank Capacity Management</h2>
              <p className="text-sm text-content-secondary">Configure tank capacities for your fuel storage</p>
            </div>
            <button
              onClick={() => setShowCreateTank(true)}
              className="px-4 py-2 bg-status-success text-white rounded-md hover:bg-status-success/90 font-medium"
            >
              + Create New Tank
            </button>
          </div>

          {/* Create Tank Form */}
          {showCreateTank && (
            <div className="mb-6 p-4 bg-action-primary-light border border-action-primary rounded-md">
              <h3 className="font-semibold text-content-primary mb-4">Create New Tank</h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-content-secondary mb-1">Tank ID</label>
                  <input
                    type="text"
                    value={newTank.tank_id}
                    onChange={(e) => setNewTank({...newTank, tank_id: e.target.value})}
                    className="w-full px-3 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-2 focus:ring-action-primary"
                    placeholder="e.g., TANK-DIESEL, TANK-PETROL-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-content-secondary mb-1">Fuel Type</label>
                  <select
                    value={newTank.fuel_type}
                    onChange={(e) => setNewTank({...newTank, fuel_type: e.target.value})}
                    className="w-full px-3 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-2 focus:ring-action-primary"
                  >
                    <option value="Diesel">Diesel</option>
                    <option value="Petrol">Petrol</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-content-secondary mb-1">Tank Capacity (Liters)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newTank.capacity}
                    onChange={(e) => setNewTank({...newTank, capacity: parseFloat(e.target.value) || 0})}
                    className="w-full px-3 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-2 focus:ring-action-primary"
                    placeholder="e.g., 20000"
                    min="0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-content-secondary mb-1">Initial Fuel Level (Liters)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newTank.initial_level}
                    onChange={(e) => setNewTank({...newTank, initial_level: parseFloat(e.target.value) || 0})}
                    className="w-full px-3 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-2 focus:ring-action-primary"
                    placeholder="e.g., 0"
                    min="0"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={createTank}
                  disabled={tankLoading || !newTank.tank_id || newTank.capacity <= 0}
                  className="px-4 py-2 bg-status-success text-white rounded-md hover:bg-status-success/90 disabled:bg-content-secondary disabled:cursor-not-allowed"
                >
                  {tankLoading ? 'Creating...' : 'Create Tank'}
                </button>
                <button
                  onClick={() => {
                    setShowCreateTank(false)
                    setNewTank({ tank_id: '', fuel_type: 'Diesel', capacity: 0, initial_level: 0 })
                  }}
                  className="px-4 py-2 bg-surface-border text-content-secondary rounded-md hover:bg-surface-border"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            {tanks.map(tank => (
              <div
                key={tank.tank_id}
                className={`bg-surface-card rounded-lg shadow-lg p-6 border-2 ${
                  tank.fuel_type === 'Diesel' ? 'border-fuel-diesel-border' : 'border-fuel-petrol-border'
                }`}
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1 mr-3">
                    {editingTankName === tank.tank_id ? (
                      <div className="flex gap-2 items-center">
                        <input
                          type="text"
                          value={tankNameDraft}
                          onChange={(e) => setTankNameDraft(e.target.value)}
                          placeholder={tank.display_name || `${tank.fuel_type} Tank`}
                          className="flex-1 px-2 py-1 border border-surface-border rounded focus:outline-none focus:ring-2 focus:ring-action-primary text-lg font-bold"
                        />
                        <button onClick={() => saveTankName(tank.tank_id)} disabled={loading}
                          className="px-3 py-1 bg-action-primary text-white rounded text-sm hover:bg-action-primary-hover disabled:opacity-50">Save</button>
                        <button onClick={() => { setEditingTankName(null); setTankNameDraft('') }}
                          className="px-3 py-1 bg-surface-border text-content-secondary rounded text-sm hover:opacity-80">Cancel</button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <h3 className="text-2xl font-bold text-content-primary">{tank.display_name || `${tank.fuel_type} Tank`}</h3>
                        <button
                          onClick={() => { setEditingTankName(tank.tank_id); setTankNameDraft('') }}
                          className="text-xs text-action-primary hover:underline font-semibold"
                        >
                          Rename
                        </button>
                      </div>
                    )}
                    <p className="text-sm text-content-secondary">{tank.tank_id}</p>
                    {editingTankName === tank.tank_id && (
                      <p className="text-xs text-content-secondary mt-1">Leave blank and save to revert to the automatic name.</p>
                    )}
                  </div>
                  <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                    tank.fuel_type === 'Diesel'
                      ? 'bg-fuel-diesel-light text-fuel-diesel'
                      : 'bg-fuel-petrol-light text-fuel-petrol'
                  }`}>
                    {tank.percentage.toFixed(1)}% Full
                  </span>
                </div>

                {/* Current Level */}
                <div className="mb-4 p-4 bg-action-primary-light rounded-lg border border-action-primary">
                  <p className="text-xs text-content-secondary mb-1">Current Level</p>
                  <p className="text-3xl font-bold text-action-primary">
                    {tank.current_level.toLocaleString()} L
                  </p>
                </div>

                {/* Capacity */}
                <div className="mb-4">
                  <div className="flex justify-between items-center mb-2">
                    <p className="text-sm font-semibold text-content-secondary">Tank Capacity</p>
                    {editingTank !== tank.tank_id && (
                      <button
                        onClick={() => {
                          setEditingTank(tank.tank_id)
                          setNewCapacity(tank.capacity)
                        }}
                        className="text-xs text-action-primary hover:text-action-primary font-semibold underline"
                      >
                        Edit Capacity
                      </button>
                    )}
                  </div>

                  {editingTank === tank.tank_id ? (
                    <div className="flex gap-2">
                      <input
                        type="number"
                        value={newCapacity}
                        onChange={(e) => setNewCapacity(Number(e.target.value))}
                        className="flex-1 px-3 py-2 border border-surface-border rounded-lg focus:outline-none focus:ring-2 focus:ring-action-primary"
                        placeholder="New capacity (liters)"
                        min={tank.current_level}
                      />
                      <button
                        onClick={() => updateTankCapacity(tank.tank_id, newCapacity)}
                        disabled={loading || newCapacity <= 0}
                        className="px-4 py-2 bg-action-primary text-white rounded-lg hover:bg-action-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingTank(null)}
                        className="px-4 py-2 bg-surface-border text-content-secondary rounded-lg hover:opacity-80"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <p className="text-2xl font-bold text-content-primary">
                      {tank.capacity.toLocaleString()} L
                    </p>
                  )}
                </div>

                {/* Calibration */}
                <div className="mb-4">
                  <div className="flex justify-between items-center mb-1">
                    <p className="text-sm font-semibold text-content-secondary">Calibration (dip → volume)</p>
                    <button onClick={downloadCalibTemplate} className="text-xs text-action-primary hover:underline font-semibold">
                      Download template
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-sm font-medium ${calibStatus[tank.tank_id]?.found ? 'text-status-success' : 'text-status-warning'}`}>
                      {calibStatus[tank.tank_id]?.found
                        ? `Calibrated (${calibStatus[tank.tank_id]?.point_count ?? 0} points)`
                        : 'No calibration chart - upload required'}
                    </span>
                    <label className={`px-3 py-1 rounded text-sm cursor-pointer text-white ${calibBusy === tank.tank_id ? 'bg-content-secondary cursor-wait' : 'bg-action-primary hover:bg-action-primary-hover'}`}>
                      {calibBusy === tank.tank_id ? 'Uploading...' : 'Upload chart'}
                      <input
                        type="file"
                        accept=".xlsx,.xls"
                        className="hidden"
                        disabled={calibBusy === tank.tank_id}
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadCalibration(tank.tank_id, f); e.currentTarget.value = '' }}
                      />
                    </label>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="mb-4">
                  <div className="w-full bg-surface-border rounded-full h-4 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        tank.percentage > 70 ? 'bg-green-500' :
                        tank.percentage > 30 ? 'bg-yellow-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${tank.percentage}%` }}
                    />
                  </div>
                </div>

                {/* Last Updated */}
                <p className="text-xs text-content-secondary">
                  Last updated: {formatDate(tank.last_updated)}
                </p>

                {/* Warning */}
                {tank.percentage < 30 && (
                  <div className="mt-4 p-3 bg-status-error-light border border-status-error rounded-lg">
                    <p className="text-sm text-status-error font-semibold">Low fuel level - Schedule delivery soon!</p>
                  </div>
                )}

                {/* Set Current Level */}
                <div className="mt-4 pt-4 border-t border-surface-border flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={tank.capacity}
                    step={0.1}
                    placeholder="Set level (L)"
                    id={`level-${tank.tank_id}`}
                    className="w-32 px-2 py-1 text-sm rounded border border-surface-border bg-surface-bg text-content-primary"
                  />
                  <button
                    onClick={async () => {
                      const input = document.getElementById(`level-${tank.tank_id}`) as HTMLInputElement
                      const val = parseFloat(input?.value)
                      if (isNaN(val) || val < 0) { setMessage({ type: 'error', text: 'Enter a valid level' }); return }
                      setTankLoading(true)
                      try {
                        const res = await authFetch(`${BASE}/tanks/${tank.tank_id}/set-level?level=${val}`, { method: 'PUT', headers: getHeaders() })
                        if (res.ok) { setMessage({ type: 'success', text: `${tank.tank_id} set to ${val.toLocaleString()} L` }); fetchTanks(); setTimeout(() => setMessage(null), 5000) }
                        else { const e = await res.json(); setMessage({ type: 'error', text: e.detail || 'Failed' }) }
                      } catch (err: any) { setMessage({ type: 'error', text: err.message }) }
                      finally { setTankLoading(false) }
                    }}
                    disabled={tankLoading}
                    className="px-3 py-1 bg-action-primary text-white rounded-md text-sm font-semibold disabled:opacity-50"
                  >
                    Set Level
                  </button>
                </div>

                {/* Delete Tank */}
                <div className="mt-3">
                  <button
                    onClick={() => deleteTank(tank.tank_id)}
                    disabled={tankLoading}
                    className="px-3 py-1 bg-status-error-light text-status-error rounded-md hover:bg-status-error-light text-sm font-semibold disabled:opacity-50"
                  >
                    Delete Tank
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Info Panel */}
          <div className="mt-8 bg-action-primary-light border border-action-primary rounded-lg p-4">
            <h3 className="text-sm font-semibold text-action-primary mb-2">Tank Capacity Guidelines</h3>
            <ul className="text-sm text-action-primary space-y-1">
              <li>- <strong>Owner Only</strong>: Only station owners can modify tank capacities</li>
              <li>- <strong>Safety Limits</strong>: Capacity cannot be set below current fuel level</li>
              <li>- <strong>Monitoring</strong>: System tracks tank levels in real-time as fuel is dispensed</li>
              <li>- <strong>Alerts</strong>: Low fuel warnings when tank drops below 30%</li>
            </ul>
          </div>
        </div>
      )}

      {/* Islands Tab */}
      {activeTab === 'islands' && (
        <div>
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-content-primary mb-2">Islands & Pump Stations</h2>
            <p className="text-sm text-content-secondary">Configure product type and activate islands for operation</p>
          </div>

          {/* 3-column Grid of Island Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {islands.map(island => (
              <div
                key={island.island_id}
                className={`bg-surface-card rounded-lg shadow p-4 border-2 ${
                  island.status === 'active' ? 'border-status-success' : 'border-surface-border'
                }`}
              >
                {/* Header */}
                <div className="flex justify-between items-center mb-3">
                  <div className="min-w-0 flex-1">
                    {editingIslandName === island.island_id ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={islandNameDraft}
                          onChange={(e) => setIslandNameDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') renameIsland(island.island_id)
                            if (e.key === 'Escape') setEditingIslandName(null)
                          }}
                          maxLength={60}
                          autoFocus
                          className="w-full px-2 py-1 text-sm border border-action-primary rounded-md focus:outline-none focus:ring-2 focus:ring-action-primary"
                          placeholder="Island name"
                        />
                        <button
                          onClick={() => renameIsland(island.island_id)}
                          disabled={loading}
                          className="px-2 py-1 bg-action-primary text-white rounded-md text-xs font-semibold disabled:opacity-50"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingIslandName(null)}
                          className="px-2 py-1 bg-surface-border text-content-secondary rounded-md text-xs"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-bold text-content-primary truncate">{island.name}</h3>
                        {/* Rename control — the Infrastructure page is already
                            restricted to owners (and the backend endpoint enforces
                            manager/owner), so the button is always shown here. */}
                        <button
                          onClick={() => {
                            setEditingIslandName(island.island_id)
                            setIslandNameDraft(island.name)
                          }}
                          title="Rename island"
                          aria-label="Rename island"
                          className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-action-primary text-action-primary text-xs font-semibold hover:bg-action-primary-light"
                        >
                          <span aria-hidden="true">✎</span>
                          Rename
                        </button>
                      </div>
                    )}
                    <p className="text-xs text-content-secondary">{island.island_id}</p>
                  </div>
                  <span className={`ml-2 shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold border ${getStatusBadge(island.status)}`}>
                    {island.status === 'active' ? 'Active' : 'Inactive'}
                  </span>
                </div>

                {/* Preset — pill selector + conditional tank pickers */}
                {island.pump_station && (() => {
                  const draft = getDraft(island)
                  const showDieselPicker = (draft.preset === 'all_diesel' || draft.preset === 'mixed') && dieselTanks.length > 1
                  const showPetrolPicker = (draft.preset === 'all_petrol' || draft.preset === 'mixed') && petrolTanks.length > 1
                  const advancedOpen = !!showAdvanced[island.island_id] || draft.preset === 'custom'

                  return (
                    <div className="mb-3 space-y-2">
                      <label className="block text-xs font-semibold text-content-secondary">Configuration</label>
                      <div className="grid grid-cols-3 gap-1">
                        {(['all_diesel', 'all_petrol', 'mixed'] as const).map(p => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => updateDraft(island, { preset: p })}
                            className={`px-2 py-1.5 text-xs rounded-md border transition-colors ${
                              draft.preset === p
                                ? 'bg-action-primary text-white border-action-primary font-semibold'
                                : 'bg-surface-bg text-content-primary border-surface-border hover:bg-surface-card'
                            }`}
                          >
                            {p === 'all_diesel' ? 'All Diesel' : p === 'all_petrol' ? 'All Petrol' : 'Mixed'}
                          </button>
                        ))}
                      </div>

                      {/* Conditional tank picker(s) */}
                      {showDieselPicker && (
                        <div>
                          <label className="block text-[10px] font-semibold text-content-secondary mb-1">Diesel from</label>
                          <select
                            value={draft.diesel_tank_id || ''}
                            onChange={e => updateDraft(island, { diesel_tank_id: e.target.value })}
                            className="w-full px-2 py-1 text-xs border border-surface-border rounded-md"
                          >
                            <option value="">Choose a diesel tank…</option>
                            {dieselTanks.map(t => (
                              <option key={t.tank_id} value={t.tank_id}>{t.tank_id}</option>
                            ))}
                          </select>
                        </div>
                      )}
                      {showPetrolPicker && (
                        <div>
                          <label className="block text-[10px] font-semibold text-content-secondary mb-1">Petrol from</label>
                          <select
                            value={draft.petrol_tank_id || ''}
                            onChange={e => updateDraft(island, { petrol_tank_id: e.target.value })}
                            className="w-full px-2 py-1 text-xs border border-surface-border rounded-md"
                          >
                            <option value="">Choose a petrol tank…</option>
                            {petrolTanks.map(t => (
                              <option key={t.tank_id} value={t.tank_id}>{t.tank_id}</option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* Advanced expander → Custom (per-nozzle) */}
                      <button
                        type="button"
                        onClick={() => setShowAdvanced(prev => ({ ...prev, [island.island_id]: !advancedOpen }))}
                        className="text-[10px] text-content-secondary hover:text-content-primary underline"
                      >
                        {advancedOpen ? 'Hide advanced' : 'Advanced…'}
                      </button>

                      {advancedOpen && (
                        <div className="pt-1 border-t border-surface-border space-y-1.5">
                          <div className="flex items-center gap-2">
                            <label className="flex items-center gap-1 text-[10px]">
                              <input
                                type="radio"
                                checked={draft.preset === 'custom'}
                                onChange={() => updateDraft(island, { preset: 'custom' })}
                              />
                              Custom (per-nozzle tank)
                            </label>
                          </div>
                          {draft.preset === 'custom' && (
                            <div className="space-y-1">
                              {island.pump_station.nozzles.map((n, idx) => {
                                const assignment = draft.nozzle_assignments.find(a => a.nozzle_id === n.nozzle_id) || {
                                  nozzle_id: n.nozzle_id,
                                  tank_id: n.tank_id || '',
                                }
                                return (
                                  <div key={n.nozzle_id} className="flex items-center gap-2 text-[10px]">
                                    <span className="w-12 text-content-secondary">Slot {String.fromCharCode(65 + idx)}</span>
                                    <select
                                      value={assignment.tank_id}
                                      onChange={e => {
                                        const newAssign = draft.nozzle_assignments.map(a =>
                                          a.nozzle_id === n.nozzle_id ? { ...a, tank_id: e.target.value } : a
                                        )
                                        // ensure entry exists
                                        if (!newAssign.find(a => a.nozzle_id === n.nozzle_id)) {
                                          newAssign.push({ nozzle_id: n.nozzle_id, tank_id: e.target.value })
                                        }
                                        updateDraft(island, { nozzle_assignments: newAssign })
                                      }}
                                      className="flex-1 px-1 py-0.5 border border-surface-border rounded text-[10px]"
                                    >
                                      <option value="">Choose tank…</option>
                                      {tanks.map(t => (
                                        <option key={t.tank_id} value={t.tank_id}>
                                          {t.tank_id} ({t.fuel_type})
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => applyPreset(island)}
                        disabled={loading}
                        className="w-full mt-1 px-3 py-1.5 bg-action-primary text-white rounded-md text-xs font-semibold hover:bg-action-primary/90 disabled:opacity-50"
                      >
                        Apply configuration
                      </button>
                    </div>
                  )
                })()}

                {/* Activate / Deactivate */}
                <div className="mb-3">
                  <button
                    onClick={() => toggleIslandStatus(island.island_id, island.status)}
                    disabled={loading}
                    className={`w-full px-3 py-1.5 rounded-md font-semibold text-xs transition-colors ${
                      island.status === 'active'
                        ? 'bg-status-error-light text-status-error hover:bg-red-200 border border-status-error'
                        : 'bg-status-success text-white hover:bg-status-success/90'
                    }`}
                  >
                    {island.status === 'active' ? 'Deactivate' : 'Activate'}
                  </button>
                </div>

                {/* Pump Station */}
                {island.pump_station && (
                  <div className="mb-3 p-2 bg-surface-bg rounded-md border border-surface-border">
                    <p className="text-xs font-semibold text-content-secondary">{island.pump_station.name}</p>
                    <p className="text-[10px] text-content-secondary">{island.pump_station.pump_station_id}</p>
                  </div>
                )}

                {/* Nozzle Badges — read fuel_type_abbrev per-nozzle so mixed islands display correctly */}
                {island.pump_station && (
                  <div>
                    <p className="text-xs font-semibold text-content-secondary mb-1">Nozzles</p>
                    <div className="flex gap-1.5">
                      {island.pump_station.nozzles.map(nozzle => (
                        <div
                          key={nozzle.nozzle_id}
                          className={`flex-1 p-1.5 rounded-md border text-center ${getNozzleColor(nozzle.fuel_type)}`}
                        >
                          <p className="font-bold text-xs">
                            {nozzle.fuel_type_abbrev && nozzle.display_label
                              ? `${nozzle.fuel_type_abbrev} ${nozzle.display_label}`
                              : nozzle.nozzle_id}
                          </p>
                          <p className="text-[10px] opacity-75">
                            {nozzle.nozzle_id}
                            {nozzle.tank_id && <span className="ml-1">→ {nozzle.tank_id}</span>}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Delete Island */}
                <div className="mt-3 pt-3 border-t border-surface-border">
                  <button
                    onClick={() => deleteIsland(island.island_id, island.name)}
                    disabled={loading}
                    className="px-3 py-1 bg-status-error-light text-status-error rounded-md hover:bg-red-200 text-xs font-semibold disabled:opacity-50"
                  >
                    Delete Island
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Info Panel */}
          <div className="mt-8 bg-action-primary-light border border-action-primary rounded-lg p-4">
            <h3 className="text-sm font-semibold text-action-primary mb-2">Standardized Island Configuration</h3>
            <ul className="text-sm text-action-primary space-y-1">
              <li>- <strong>6 Islands</strong>: Each station has 6 standard islands with 1 pump and 2 nozzles each</li>
              <li>- <strong>Configuration</strong>: Pick a preset per island — All Diesel, All Petrol, or Mixed. The system wires nozzles to the matching tank automatically. Use <em>Advanced</em> to assign each nozzle to a specific tank when you have more than one tank of the same fuel.</li>
              <li>- <strong>Activation</strong>: Islands must have a product type configured before they can be activated</li>
              <li>- <strong>Active Islands</strong>: Only active islands appear in shift allocation and operations</li>
              <li>- <strong>Owner Only</strong>: All island configuration changes require owner privileges</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
