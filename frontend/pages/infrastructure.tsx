import { useState, useEffect } from 'react'
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
        <p className="mt-2 text-sm text-content-secondary">Manage tanks, islands, pumps, and nozzles (Owner Only)</p>
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
        <nav className="-mb-px flex space-x-8">
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
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-content-primary mb-2">Fuel Tank Capacity Management</h2>
            <p className="text-sm text-content-secondary">Configure tank capacities for your fuel storage</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {tanks.map(tank => (
              <div
                key={tank.tank_id}
                className={`bg-surface-card rounded-lg shadow-lg p-6 border-2 ${
                  tank.fuel_type === 'Diesel' ? 'border-fuel-diesel-border' : 'border-fuel-petrol-border'
                }`}
              >
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-2xl font-bold text-content-primary">{tank.fuel_type} Tank</h3>
                    <p className="text-sm text-content-secondary">{tank.tank_id}</p>
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

          {/* 2x2 Grid of Island Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {islands.map(island => (
              <div
                key={island.island_id}
                className={`bg-surface-card rounded-lg shadow-lg p-6 border-2 ${
                  island.status === 'active' ? 'border-status-success' : 'border-surface-border'
                }`}
              >
                {/* Header: Name, ID, Status Badge */}
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-xl font-bold text-content-primary">{island.name}</h3>
                    <p className="text-sm text-content-secondary">{island.island_id}</p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-sm font-semibold border ${getStatusBadge(island.status)}`}>
                    {island.status === 'active' ? 'Active' : 'Inactive'}
                  </span>
                </div>

                {/* Product Type Dropdown */}
                <div className="mb-4">
                  <label className="block text-sm font-semibold text-content-secondary mb-1">Product Type</label>
                  <select
                    value={island.product_type || ''}
                    onChange={(e) => {
                      if (e.target.value) {
                        updateProductType(island.island_id, e.target.value)
                      }
                    }}
                    className="w-full px-3 py-2 border border-surface-border rounded-lg focus:outline-none focus:ring-2 focus:ring-action-primary"
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
                    disabled={loading}
                    className={`w-full px-4 py-2 rounded-lg font-semibold text-sm transition-colors ${
                      island.status === 'active'
                        ? 'bg-status-error-light text-status-error hover:bg-red-200 border border-status-error'
                        : 'bg-status-success text-white hover:bg-status-success/90'
                    }`}
                  >
                    {island.status === 'active' ? 'Deactivate' : 'Activate'}
                  </button>
                </div>

                {/* Pump Station Info (read-only) */}
                {island.pump_station && (
                  <div className="mb-4 p-3 bg-surface-bg rounded-lg border border-surface-border">
                    <p className="text-sm font-semibold text-content-secondary">{island.pump_station.name}</p>
                    <p className="text-xs text-content-secondary">{island.pump_station.pump_station_id}</p>
                    {island.pump_station.tank_id && (
                      <div className="mt-1">
                        <span className="text-xs text-content-secondary">Tank: </span>
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                          island.pump_station.tank_id === 'TANK-DIESEL'
                            ? 'bg-fuel-diesel-light text-fuel-diesel'
                            : island.pump_station.tank_id === 'TANK-PETROL'
                              ? 'bg-fuel-petrol-light text-fuel-petrol'
                              : 'bg-surface-bg text-content-secondary'
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
                    <p className="text-sm font-semibold text-content-secondary mb-2">Nozzles</p>
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
          <div className="mt-8 bg-action-primary-light border border-action-primary rounded-lg p-4">
            <h3 className="text-sm font-semibold text-action-primary mb-2">Standardized Island Configuration</h3>
            <ul className="text-sm text-action-primary space-y-1">
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
