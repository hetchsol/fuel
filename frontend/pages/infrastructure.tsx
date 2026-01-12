import { useState, useEffect } from 'react'
import { useTheme } from '../contexts/ThemeContext'

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000/api/v1'

interface Tank {
  tank_id: string
  fuel_type: string
  current_level: number
  capacity: number
  last_updated: string
  percentage: number
}

interface Nozzle {
  nozzle_id: string
  pump_station_id: string
  fuel_type: string
  status: string
  electronic_reading: number
  mechanical_reading: number
}

interface PumpStation {
  pump_station_id: string
  island_id: string
  name: string
  tank_id: string
  nozzles: Nozzle[]
}

interface Island {
  island_id: string
  name: string
  location: string
  pump_station: PumpStation
}

export default function Infrastructure() {
  const { setFuelType } = useTheme()
  const [activeTab, setActiveTab] = useState<'tanks' | 'islands'>('tanks')
  const [tanks, setTanks] = useState<Tank[]>([])
  const [islands, setIslands] = useState<Island[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Tank capacity edit state
  const [editingTank, setEditingTank] = useState<string | null>(null)
  const [newCapacity, setNewCapacity] = useState<number>(0)

  // Island creation state
  const [showCreateIsland, setShowCreateIsland] = useState(false)
  const [newIsland, setNewIsland] = useState({
    island_id: '',
    name: '',
    location: '',
    pump_station_id: '',
    pump_station_name: '',
    tank_id: 'TANK-PETROL'
  })

  // Nozzle management state
  const [showAddNozzle, setShowAddNozzle] = useState<string | null>(null)
  const [newNozzle, setNewNozzle] = useState({
    nozzle_id: '',
    fuel_type: 'Petrol',
    pump_station_id: ''
  })

  // Pump-tank mapping state
  const [editingPumpMapping, setEditingPumpMapping] = useState<string | null>(null)
  const [selectedTankForPump, setSelectedTankForPump] = useState<string>('')

  useEffect(() => {
    fetchTanks()
    fetchIslands()
  }, [])

  const fetchTanks = async () => {
    try {
      const res = await fetch(`${BASE}/tanks/levels`)
      if (res.ok) {
        const data = await res.json()
        setTanks(data)
      }
    } catch (err) {
      console.error('Failed to fetch tanks:', err)
    }
  }

  const fetchIslands = async () => {
    try {
      const res = await fetch(`${BASE}/islands/`)
      if (res.ok) {
        const data = await res.json()
        setIslands(data)
      }
    } catch (err) {
      console.error('Failed to fetch islands:', err)
    }
  }

  const updateTankCapacity = async (tankId: string, capacity: number) => {
    setLoading(true)
    try {
      const res = await fetch(`${BASE}/tanks/${tankId}/capacity?new_capacity=${capacity}`, {
        method: 'PUT',
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

  const updatePumpTankMapping = async (islandId: string, tankId: string) => {
    setLoading(true)
    try {
      const res = await fetch(`${BASE}/islands/${islandId}/pump-station/tank?tank_id=${tankId}`, {
        method: 'PUT',
      })

      if (res.ok) {
        const data = await res.json()
        setMessage({ type: 'success', text: data.message })
        fetchIslands()
        setEditingPumpMapping(null)
      } else {
        const error = await res.json()
        setMessage({ type: 'error', text: error.detail || 'Failed to update mapping' })
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Network error' })
    } finally {
      setLoading(false)
    }
  }

  const createIsland = async () => {
    setLoading(true)
    try {
      const islandData = {
        island_id: newIsland.island_id,
        name: newIsland.name,
        location: newIsland.location,
        pump_station: {
          pump_station_id: newIsland.pump_station_id,
          island_id: newIsland.island_id,
          name: newIsland.pump_station_name,
          tank_id: newIsland.tank_id,
          nozzles: []
        }
      }

      const res = await fetch(`${BASE}/islands/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(islandData),
      })

      if (res.ok) {
        setMessage({ type: 'success', text: 'Island created successfully' })
        fetchIslands()
        setShowCreateIsland(false)
        setNewIsland({
          island_id: '',
          name: '',
          location: '',
          pump_station_id: '',
          pump_station_name: '',
          tank_id: 'TANK-PETROL'
        })
      } else {
        const error = await res.json()
        setMessage({ type: 'error', text: error.detail || 'Failed to create island' })
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Network error' })
    } finally {
      setLoading(false)
    }
  }

  const deleteIsland = async (islandId: string, islandName: string) => {
    if (!confirm(`Are you sure you want to delete ${islandName}? This action cannot be undone.`)) {
      return
    }

    setLoading(true)
    try {
      const res = await fetch(`${BASE}/islands/${islandId}`, {
        method: 'DELETE',
      })

      if (res.ok) {
        setMessage({ type: 'success', text: `Island ${islandName} deleted successfully` })
        fetchIslands()
      } else {
        const error = await res.json()
        setMessage({ type: 'error', text: error.detail || 'Failed to delete island' })
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Network error' })
    } finally {
      setLoading(false)
    }
  }

  const addNozzle = async (islandId: string) => {
    setLoading(true)
    try {
      const nozzleData = {
        nozzle_id: newNozzle.nozzle_id,
        pump_station_id: newNozzle.pump_station_id,
        fuel_type: newNozzle.fuel_type,
        status: 'Active',
        electronic_reading: 0.0,
        mechanical_reading: 0.0
      }

      const res = await fetch(`${BASE}/islands/${islandId}/nozzle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nozzleData),
      })

      if (res.ok) {
        const data = await res.json()
        setMessage({ type: 'success', text: data.message })
        fetchIslands()
        setShowAddNozzle(null)
        setNewNozzle({ nozzle_id: '', fuel_type: 'Petrol', pump_station_id: '' })
      } else {
        const error = await res.json()
        setMessage({ type: 'error', text: error.detail || 'Failed to add nozzle' })
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Network error' })
    } finally {
      setLoading(false)
    }
  }

  const removeNozzle = async (islandId: string, nozzleId: string) => {
    if (!confirm(`Are you sure you want to remove nozzle ${nozzleId}?`)) {
      return
    }

    setLoading(true)
    try {
      const res = await fetch(`${BASE}/islands/${islandId}/nozzle/${nozzleId}`, {
        method: 'DELETE',
      })

      if (res.ok) {
        const data = await res.json()
        setMessage({ type: 'success', text: data.message })
        fetchIslands()
      } else {
        const error = await res.json()
        setMessage({ type: 'error', text: error.detail || 'Failed to remove nozzle' })
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

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Infrastructure Management</h1>
        <p className="mt-2 text-sm text-gray-600">Manage tanks, islands, pumps, and nozzles (Owner Only)</p>
      </div>

      {/* Message Display */}
      {message && (
        <div className={`mb-6 p-4 rounded-lg border ${
          message.type === 'success'
            ? 'bg-green-50 border-green-200 text-green-800'
            : 'bg-red-50 border-red-200 text-red-800'
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
      <div className="mb-6 border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('tanks')}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'tanks'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            ⛽ Tank Management
          </button>
          <button
            onClick={() => setActiveTab('islands')}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'islands'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            🏝️ Islands & Pumps
          </button>
        </nav>
      </div>

      {/* Tanks Tab */}
      {activeTab === 'tanks' && (
        <div>
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Fuel Tank Capacity Management</h2>
            <p className="text-sm text-gray-600">Configure tank capacities for your fuel storage</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {tanks.map(tank => (
              <div
                key={tank.tank_id}
                className={`bg-white rounded-lg shadow-lg p-6 border-2 ${
                  tank.fuel_type === 'Diesel' ? 'border-yellow-300' : 'border-green-300'
                }`}
              >
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-2xl font-bold text-gray-900">{tank.fuel_type} Tank</h3>
                    <p className="text-sm text-gray-500">{tank.tank_id}</p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                    tank.fuel_type === 'Diesel'
                      ? 'bg-yellow-100 text-yellow-800'
                      : 'bg-green-100 text-green-800'
                  }`}>
                    {tank.percentage.toFixed(1)}% Full
                  </span>
                </div>

                {/* Current Level */}
                <div className="mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <p className="text-xs text-gray-600 mb-1">Current Level</p>
                  <p className="text-3xl font-bold text-blue-700">
                    {tank.current_level.toLocaleString()} L
                  </p>
                </div>

                {/* Capacity */}
                <div className="mb-4">
                  <div className="flex justify-between items-center mb-2">
                    <p className="text-sm font-semibold text-gray-700">Tank Capacity</p>
                    {editingTank !== tank.tank_id && (
                      <button
                        onClick={() => {
                          setEditingTank(tank.tank_id)
                          setNewCapacity(tank.capacity)
                        }}
                        className="text-xs text-blue-600 hover:text-blue-800 font-semibold underline"
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
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="New capacity (liters)"
                        min={tank.current_level}
                      />
                      <button
                        onClick={() => updateTankCapacity(tank.tank_id, newCapacity)}
                        disabled={loading || newCapacity <= 0}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingTank(null)}
                        className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <p className="text-2xl font-bold text-gray-900">
                      {tank.capacity.toLocaleString()} L
                    </p>
                  )}
                </div>

                {/* Progress Bar */}
                <div className="mb-4">
                  <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
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
                <p className="text-xs text-gray-500">
                  Last updated: {formatDate(tank.last_updated)}
                </p>

                {/* Warning */}
                {tank.percentage < 30 && (
                  <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm text-red-800 font-semibold">⚠️ Low fuel level - Schedule delivery soon!</p>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Info Panel */}
          <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-blue-900 mb-2">Tank Capacity Guidelines</h3>
            <ul className="text-sm text-blue-700 space-y-1">
              <li>• <strong>Owner Only</strong>: Only station owners can modify tank capacities</li>
              <li>• <strong>Safety Limits</strong>: Capacity cannot be set below current fuel level</li>
              <li>• <strong>Monitoring</strong>: System tracks tank levels in real-time as fuel is dispensed</li>
              <li>• <strong>Alerts</strong>: Low fuel warnings when tank drops below 30%</li>
            </ul>
          </div>
        </div>
      )}

      {/* Islands Tab */}
      {activeTab === 'islands' && (
        <div>
          <div className="mb-6 flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Islands & Pump Stations</h2>
              <p className="text-sm text-gray-600">Manage dispensing islands, pumps, and nozzles</p>
            </div>
            <button
              onClick={() => setShowCreateIsland(true)}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold"
            >
              + Create New Island
            </button>
          </div>

          {/* Create Island Form */}
          {showCreateIsland && (
            <div className="mb-6 bg-white rounded-lg shadow-lg p-6 border-2 border-green-300">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Create New Island</h3>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Island ID</label>
                  <input
                    type="text"
                    value={newIsland.island_id}
                    onChange={(e) => setNewIsland({...newIsland, island_id: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                    placeholder="ISL-003"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Island Name</label>
                  <input
                    type="text"
                    value={newIsland.name}
                    onChange={(e) => setNewIsland({...newIsland, name: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                    placeholder="Island 3"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Location</label>
                  <input
                    type="text"
                    value={newIsland.location}
                    onChange={(e) => setNewIsland({...newIsland, location: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                    placeholder="Main Station"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Pump Station ID</label>
                  <input
                    type="text"
                    value={newIsland.pump_station_id}
                    onChange={(e) => setNewIsland({...newIsland, pump_station_id: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                    placeholder="PS-003"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Pump Station Name</label>
                  <input
                    type="text"
                    value={newIsland.pump_station_name}
                    onChange={(e) => setNewIsland({...newIsland, pump_station_name: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                    placeholder="Pump Station 3"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Tank Source</label>
                  <select
                    value={newIsland.tank_id}
                    onChange={(e) => {
                      const value = e.target.value
                      setNewIsland({...newIsland, tank_id: value})
                      // Update theme based on tank selection
                      if (value === 'TANK-DIESEL') {
                        setFuelType('diesel')
                      } else if (value === 'TANK-PETROL') {
                        setFuelType('petrol')
                      }
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    <option value="TANK-PETROL">Petrol Tank</option>
                    <option value="TANK-DIESEL">Diesel Tank</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={createIsland}
                  disabled={loading || !newIsland.island_id || !newIsland.name}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400"
                >
                  Create Island
                </button>
                <button
                  onClick={() => {
                    setShowCreateIsland(false)
                    setNewIsland({
                      island_id: '',
                      name: '',
                      location: '',
                      pump_station_id: '',
                      pump_station_name: '',
                      tank_id: 'TANK-PETROL'
                    })
                  }}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Islands List */}
          <div className="space-y-6">
            {islands.map(island => (
              <div
                key={island.island_id}
                className="bg-white rounded-lg shadow-lg p-6 border-2 border-blue-200"
              >
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-2xl font-bold text-gray-900">{island.name}</h3>
                    <p className="text-sm text-gray-500">{island.island_id} • {island.location}</p>
                  </div>
                  <button
                    onClick={() => deleteIsland(island.island_id, island.name)}
                    className="px-3 py-1 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 text-sm font-semibold"
                  >
                    Delete Island
                  </button>
                </div>

                {/* Pump Station Info */}
                <div className="mb-4 p-4 bg-purple-50 rounded-lg border border-purple-200">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h4 className="font-bold text-gray-900">{island.pump_station.name}</h4>
                      <p className="text-sm text-gray-600">{island.pump_station.pump_station_id}</p>
                    </div>
                    {editingPumpMapping !== island.island_id && (
                      <button
                        onClick={() => {
                          setEditingPumpMapping(island.island_id)
                          setSelectedTankForPump(island.pump_station.tank_id)
                        }}
                        className="text-xs text-blue-600 hover:text-blue-800 font-semibold underline"
                      >
                        Change Tank Source
                      </button>
                    )}
                  </div>

                  {editingPumpMapping === island.island_id ? (
                    <div className="flex gap-2 mt-2">
                      <select
                        value={selectedTankForPump}
                        onChange={(e) => {
                          const value = e.target.value
                          setSelectedTankForPump(value)
                          // Update theme based on tank selection
                          if (value === 'TANK-DIESEL') {
                            setFuelType('diesel')
                          } else if (value === 'TANK-PETROL') {
                            setFuelType('petrol')
                          }
                        }}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="TANK-PETROL">Petrol Tank</option>
                        <option value="TANK-DIESEL">Diesel Tank</option>
                      </select>
                      <button
                        onClick={() => updatePumpTankMapping(island.island_id, selectedTankForPump)}
                        disabled={loading}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingPumpMapping(null)}
                        className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="mt-2">
                      <span className="text-sm text-gray-600">Draws fuel from: </span>
                      <span className={`px-2 py-1 rounded text-sm font-semibold ${
                        island.pump_station.tank_id === 'TANK-DIESEL'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-green-100 text-green-800'
                      }`}>
                        {island.pump_station.tank_id.replace('TANK-', '')} Tank
                      </span>
                    </div>
                  )}
                </div>

                {/* Nozzles */}
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <h4 className="font-bold text-gray-900">Nozzles ({island.pump_station.nozzles.length})</h4>
                    <button
                      onClick={() => {
                        setShowAddNozzle(island.island_id)
                        setNewNozzle({
                          nozzle_id: '',
                          fuel_type: 'Petrol',
                          pump_station_id: island.pump_station.pump_station_id
                        })
                      }}
                      className="text-sm px-3 py-1 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 font-semibold"
                    >
                      + Add Nozzle
                    </button>
                  </div>

                  {/* Add Nozzle Form */}
                  {showAddNozzle === island.island_id && (
                    <div className="mb-4 p-3 bg-green-50 rounded-lg border border-green-200">
                      <div className="grid grid-cols-3 gap-2 mb-2">
                        <input
                          type="text"
                          value={newNozzle.nozzle_id}
                          onChange={(e) => setNewNozzle({...newNozzle, nozzle_id: e.target.value})}
                          className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                          placeholder="Nozzle ID (e.g., UNL-3A)"
                        />
                        <select
                          value={newNozzle.fuel_type}
                          onChange={(e) => {
                            const value = e.target.value
                            setNewNozzle({...newNozzle, fuel_type: value})
                            // Update theme based on fuel selection
                            if (value.toLowerCase() === 'diesel') {
                              setFuelType('diesel')
                            } else if (value.toLowerCase() === 'petrol') {
                              setFuelType('petrol')
                            }
                          }}
                          className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                        >
                          <option value="Petrol">Petrol</option>
                          <option value="Diesel">Diesel</option>
                        </select>
                        <div className="flex gap-2">
                          <button
                            onClick={() => addNozzle(island.island_id)}
                            disabled={loading || !newNozzle.nozzle_id}
                            className="flex-1 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400"
                          >
                            Add
                          </button>
                          <button
                            onClick={() => setShowAddNozzle(null)}
                            className="px-3 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Nozzles Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {island.pump_station.nozzles.map(nozzle => (
                      <div
                        key={nozzle.nozzle_id}
                        className={`p-3 rounded-lg border-2 ${
                          nozzle.fuel_type === 'Diesel'
                            ? 'bg-yellow-50 border-yellow-300'
                            : 'bg-green-50 border-green-300'
                        }`}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <p className="font-bold text-gray-900 text-sm">{nozzle.nozzle_id}</p>
                          <button
                            onClick={() => removeNozzle(island.island_id, nozzle.nozzle_id)}
                            className="text-red-600 hover:text-red-800 text-xs"
                            title="Remove nozzle"
                          >
                            ✕
                          </button>
                        </div>
                        <p className={`text-xs font-semibold ${
                          nozzle.fuel_type === 'Diesel' ? 'text-yellow-700' : 'text-green-700'
                        }`}>
                          {nozzle.fuel_type}
                        </p>
                        <p className="text-xs text-gray-600 mt-1">{nozzle.status}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Info Panel */}
          <div className="mt-8 bg-purple-50 border border-purple-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-purple-900 mb-2">Infrastructure Configuration</h3>
            <ul className="text-sm text-purple-700 space-y-1">
              <li>• <strong>Islands</strong>: Each island has one pump station with multiple nozzles</li>
              <li>• <strong>Pump-Tank Mapping</strong>: Configure which tank each pump draws fuel from</li>
              <li>• <strong>Nozzles</strong>: Add or remove nozzles from pump stations as needed</li>
              <li>• <strong>Safety</strong>: Cannot delete islands that have dependent records (readings, sales)</li>
              <li>• <strong>Owner Only</strong>: All infrastructure changes require owner privileges</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
