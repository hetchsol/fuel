import { useState, useEffect } from 'react'
import { useTheme } from '../contexts/ThemeContext'
import { getHeaders } from '../lib/api'

const BASE = '/api/v1'

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
  display_label: string | null
  custom_label: string | null
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
  status: string
  product_type: string | null
  pump_station: PumpStation
  display_number: number | null
  fuel_type_abbrev: string | null
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

  useEffect(() => {
    fetchTanks()
    fetchIslands()
  }, [])

  const fetchTanks = async () => {
    try {
      const res = await fetch(`${BASE}/tanks/levels`, {
        headers: getHeaders(),
      })
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
      const res = await fetch(`${BASE}/islands/`, {
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

  const updateTankCapacity = async (tankId: string, capacity: number) => {
    setLoading(true)
    try {
      const res = await fetch(`${BASE}/tanks/${tankId}/capacity?new_capacity=${capacity}`, {
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

  const updateProductType = async (islandId: string, productType: string) => {
    setLoading(true)
    try {
      const res = await fetch(`${BASE}/islands/${islandId}/product`, {
        method: 'PUT',
        headers: { ...getHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_type: productType }),
      })

      if (res.ok) {
        const data = await res.json()
        setMessage({ type: 'success', text: `${islandId} configured as ${productType}` })
        if (productType === 'Diesel') setFuelType('diesel')
        else setFuelType('petrol')
        fetchIslands()
      } else {
        const error = await res.json()
        setMessage({ type: 'error', text: error.detail || 'Failed to update product type' })
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Network error' })
    } finally {
      setLoading(false)
    }
  }

  const toggleIslandStatus = async (islandId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active'
    setLoading(true)
    try {
      const res = await fetch(`${BASE}/islands/${islandId}/status`, {
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
    if (fuelType === 'Petrol') return 'bg-green-100 text-green-800 border-green-300'
    if (fuelType === 'Diesel') return 'bg-purple-100 text-purple-800 border-purple-300'
    return 'bg-gray-100 text-gray-600 border-gray-300'
  }

  const getStatusBadge = (status: string) => {
    if (status === 'active') return 'bg-green-100 text-green-800 border-green-300'
    return 'bg-gray-100 text-gray-600 border-gray-300'
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
            Tank Management
          </button>
          <button
            onClick={() => setActiveTab('islands')}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'islands'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Islands & Pumps
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
                  tank.fuel_type === 'Diesel' ? 'border-purple-300' : 'border-green-300'
                }`}
              >
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-2xl font-bold text-gray-900">{tank.fuel_type} Tank</h3>
                    <p className="text-sm text-gray-500">{tank.tank_id}</p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                    tank.fuel_type === 'Diesel'
                      ? 'bg-purple-100 text-purple-800'
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
                    <p className="text-sm text-red-800 font-semibold">Low fuel level - Schedule delivery soon!</p>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Info Panel */}
          <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-blue-900 mb-2">Tank Capacity Guidelines</h3>
            <ul className="text-sm text-blue-700 space-y-1">
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
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Islands & Pump Stations</h2>
            <p className="text-sm text-gray-600">Configure product type and activate islands for operation</p>
          </div>

          {/* 2x2 Grid of Island Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {islands.map(island => (
              <div
                key={island.island_id}
                className={`bg-white rounded-lg shadow-lg p-6 border-2 ${
                  island.status === 'active' ? 'border-green-300' : 'border-gray-300'
                }`}
              >
                {/* Header: Name, ID, Status Badge */}
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">{island.name}</h3>
                    <p className="text-sm text-gray-500">{island.island_id}</p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-sm font-semibold border ${getStatusBadge(island.status)}`}>
                    {island.status === 'active' ? 'Active' : 'Inactive'}
                  </span>
                </div>

                {/* Product Type Dropdown */}
                <div className="mb-4">
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Product Type</label>
                  <select
                    value={island.product_type || ''}
                    onChange={(e) => {
                      if (e.target.value) {
                        updateProductType(island.island_id, e.target.value)
                      }
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Not configured</option>
                    <option value="Petrol">Petrol (UNL)</option>
                    <option value="Diesel">Diesel (LSD)</option>
                  </select>
                </div>

                {/* Activate / Deactivate Toggle */}
                <div className="mb-4">
                  <button
                    onClick={() => toggleIslandStatus(island.island_id, island.status)}
                    disabled={loading || (!island.product_type && island.status !== 'active')}
                    className={`w-full px-4 py-2 rounded-lg font-semibold text-sm transition-colors ${
                      island.status === 'active'
                        ? 'bg-red-100 text-red-700 hover:bg-red-200 border border-red-300'
                        : island.product_type
                          ? 'bg-green-600 text-white hover:bg-green-700'
                          : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    {island.status === 'active' ? 'Deactivate' : 'Activate'}
                  </button>
                  {!island.product_type && island.status !== 'active' && (
                    <p className="text-xs text-gray-500 mt-1">Configure product type before activating</p>
                  )}
                </div>

                {/* Pump Station Info (read-only) */}
                {island.pump_station && (
                  <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <p className="text-sm font-semibold text-gray-700">{island.pump_station.name}</p>
                    <p className="text-xs text-gray-500">{island.pump_station.pump_station_id}</p>
                    {island.pump_station.tank_id && (
                      <div className="mt-1">
                        <span className="text-xs text-gray-600">Tank: </span>
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                          island.pump_station.tank_id === 'TANK-DIESEL'
                            ? 'bg-purple-100 text-purple-800'
                            : island.pump_station.tank_id === 'TANK-PETROL'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-600'
                        }`}>
                          {island.pump_station.tank_id || 'Not assigned'}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Nozzle Badges (read-only, color-coded) */}
                {island.pump_station && (
                  <div>
                    <p className="text-sm font-semibold text-gray-700 mb-2">Nozzles</p>
                    <div className="flex gap-2">
                      {island.pump_station.nozzles.map(nozzle => (
                        <div
                          key={nozzle.nozzle_id}
                          className={`flex-1 p-2 rounded-lg border text-center ${getNozzleColor(nozzle.fuel_type)}`}
                        >
                          <p className="font-bold text-sm">
                            {island.fuel_type_abbrev && nozzle.display_label
                              ? `${island.fuel_type_abbrev} ${nozzle.display_label}`
                              : nozzle.nozzle_id}
                          </p>
                          <p className="text-xs opacity-75">{nozzle.nozzle_id}</p>
                          <p className="text-xs">{nozzle.fuel_type || 'Unconfigured'}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Info Panel */}
          <div className="mt-8 bg-purple-50 border border-purple-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-purple-900 mb-2">Standardized Island Configuration</h3>
            <ul className="text-sm text-purple-700 space-y-1">
              <li>- <strong>4 Islands</strong>: Each station has 4 standard islands with 1 pump and 2 nozzles each</li>
              <li>- <strong>Product Type</strong>: Configure each island as Petrol or Diesel. This sets the tank mapping and nozzle fuel types automatically.</li>
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
