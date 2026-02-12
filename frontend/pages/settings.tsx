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

export default function Settings() {
  const [settings, setSettings] = useState({
    diesel_price_per_liter: 150.0,
    petrol_price_per_liter: 160.0,
    diesel_allowable_loss_percent: 0.3,
    petrol_allowable_loss_percent: 0.5,
  })
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const [systemSettings, setSystemSettings] = useState({
    business_name: '',
    license_key: '',
    contact_email: '',
    contact_phone: '',
    license_expiry_date: '',
    software_version: '1.0.0',
    station_location: '',
  })
  const [systemLoading, setSystemLoading] = useState(false)
  const [systemMessage, setSystemMessage] = useState('')
  const [systemError, setSystemError] = useState('')

  const [validationThresholds, setValidationThresholds] = useState({
    pass_threshold: 0.5,
    warning_threshold: 1.0,
    meter_discrepancy_threshold: 0.5,
  })
  const [thresholdsLoading, setThresholdsLoading] = useState(false)
  const [thresholdsMessage, setThresholdsMessage] = useState('')
  const [thresholdsError, setThresholdsError] = useState('')

  const [tanks, setTanks] = useState<Tank[]>([])
  const [showCreateTank, setShowCreateTank] = useState(false)
  const [newTank, setNewTank] = useState({
    tank_id: '',
    fuel_type: 'Diesel',
    capacity: 0,
    initial_level: 0
  })
  const [tankLoading, setTankLoading] = useState(false)
  const [tankMessage, setTankMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [activeTab, setActiveTab] = useState<'system' | 'infrastructure' | 'fuel' | 'validation'>('system')

  useEffect(() => {
    loadSettings()
    loadSystemSettings()
    loadValidationThresholds()
    loadTanks()
  }, [])

  const loadSettings = async () => {
    try {
      const res = await fetch(`${BASE}/settings/fuel`, {
        headers: getHeaders()
      })
      if (res.ok) {
        const data = await res.json()
        setSettings(data)
      }
    } catch (err) {
      console.error('Failed to load settings:', err)
    }
  }

  const loadSystemSettings = async () => {
    try {
      const res = await fetch(`${BASE}/settings/system`, {
        headers: getHeaders()
      })
      if (res.ok) {
        const data = await res.json()
        setSystemSettings(data)
      }
    } catch (err) {
      console.error('Failed to load system settings:', err)
    }
  }

  const loadValidationThresholds = async () => {
    try {
      const res = await fetch(`${BASE}/settings/validation-thresholds`, {
        headers: getHeaders()
      })
      if (res.ok) {
        const data = await res.json()
        setValidationThresholds(data)
      }
    } catch (err) {
      console.error('Failed to load validation thresholds:', err)
    }
  }

  const updateValidationThresholds = async () => {
    setThresholdsLoading(true)
    setThresholdsMessage('')
    setThresholdsError('')
    try {
      const res = await fetch(`${BASE}/settings/validation-thresholds`, {
        method: 'PUT',
        headers: { ...getHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(validationThresholds),
      })
      if (res.ok) {
        setThresholdsMessage('Validation thresholds updated successfully!')
        setTimeout(() => setThresholdsMessage(''), 3000)
      } else {
        setThresholdsError('Failed to update thresholds')
      }
    } catch (err) {
      setThresholdsError('Error updating thresholds')
    } finally {
      setThresholdsLoading(false)
    }
  }

  const loadTanks = async () => {
    try {
      const res = await fetch(`${BASE}/tanks/levels`, {
        headers: getHeaders()
      })
      if (res.ok) {
        const data = await res.json()
        setTanks(data)
      }
    } catch (err) {
      console.error('Failed to load tanks:', err)
    }
  }

  const createTank = async () => {
    setTankLoading(true)
    setTankMessage(null)
    try {
      const res = await fetch(`${BASE}/tanks/create?tank_id=${encodeURIComponent(newTank.tank_id)}&fuel_type=${encodeURIComponent(newTank.fuel_type)}&capacity=${newTank.capacity}&initial_level=${newTank.initial_level}`, {
        method: 'POST',
        headers: getHeaders(),
      })

      if (res.ok) {
        const data = await res.json()
        setTankMessage({ type: 'success', text: data.message })
        loadTanks()
        setShowCreateTank(false)
        setNewTank({
          tank_id: '',
          fuel_type: 'Diesel',
          capacity: 0,
          initial_level: 0
        })
        setTimeout(() => setTankMessage(null), 5000)
      } else {
        const error = await res.json()
        setTankMessage({ type: 'error', text: error.detail || 'Failed to create tank' })
      }
    } catch (err: any) {
      setTankMessage({ type: 'error', text: err.message || 'Network error' })
    } finally {
      setTankLoading(false)
    }
  }

  const deleteTank = async (tankId: string, tankName: string) => {
    if (!confirm(`Are you sure you want to delete ${tankName}? This action cannot be undone.`)) {
      return
    }

    setTankLoading(true)
    setTankMessage(null)
    try {
      const res = await fetch(`${BASE}/tanks/${tankId}`, {
        method: 'DELETE',
        headers: getHeaders(),
      })

      if (res.ok) {
        const data = await res.json()
        setTankMessage({ type: 'success', text: data.message })
        loadTanks()
        setTimeout(() => setTankMessage(null), 5000)
      } else {
        const error = await res.json()
        setTankMessage({ type: 'error', text: error.detail || 'Failed to delete tank' })
      }
    } catch (err: any) {
      setTankMessage({ type: 'error', text: err.message || 'Network error' })
    } finally {
      setTankLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setMessage('')

    try {
      const res = await fetch(`${BASE}/settings/fuel`, {
        method: 'PUT',
        headers: { ...getHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })

      if (!res.ok) {
        throw new Error('Failed to update settings')
      }

      const data = await res.json()
      setMessage('Settings updated successfully!')
      setTimeout(() => setMessage(''), 3000)
    } catch (err: any) {
      setError(err.message || 'Failed to update settings')
    } finally {
      setLoading(false)
    }
  }

  const handleSystemUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    setSystemLoading(true)
    setSystemError('')
    setSystemMessage('')

    try {
      const res = await fetch(`${BASE}/settings/system`, {
        method: 'PUT',
        headers: { ...getHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(systemSettings),
      })

      if (!res.ok) {
        throw new Error('Failed to update system settings')
      }

      const data = await res.json()
      setSystemMessage('System settings updated successfully!')
      setTimeout(() => setSystemMessage(''), 3000)
    } catch (err: any) {
      setSystemError(err.message || 'Failed to update system settings')
    } finally {
      setSystemLoading(false)
    }
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Owner Settings</h1>
        <p className="mt-2 text-sm text-gray-600">Configure system information, infrastructure, and fuel pricing</p>
      </div>

      {/* Tab Navigation */}
      <div className="mb-6 border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('system')}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'system'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            🏢 System Information
          </button>
          <button
            onClick={() => setActiveTab('infrastructure')}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'infrastructure'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            ⛽ Infrastructure
          </button>
          <button
            onClick={() => setActiveTab('fuel')}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'fuel'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            💰 Fuel Settings
          </button>
          <button
            onClick={() => setActiveTab('validation')}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'validation'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            ✓ Validation Thresholds
          </button>
        </nav>
      </div>

      {/* System Information Tab */}
      {activeTab === 'system' && (
        <div className="max-w-2xl bg-white rounded-lg shadow p-6 mb-6">
        <form onSubmit={handleSystemUpdate} className="space-y-6">
          <div className="border-b pb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">🏢 System Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Business Name
                </label>
                <input
                  type="text"
                  value={systemSettings.business_name}
                  onChange={(e) => setSystemSettings({ ...systemSettings, business_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  License Key
                </label>
                <input
                  type="text"
                  value={systemSettings.license_key}
                  onChange={(e) => setSystemSettings({ ...systemSettings, license_key: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Contact Email
                </label>
                <input
                  type="email"
                  value={systemSettings.contact_email}
                  onChange={(e) => setSystemSettings({ ...systemSettings, contact_email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Contact Phone
                </label>
                <input
                  type="tel"
                  value={systemSettings.contact_phone}
                  onChange={(e) => setSystemSettings({ ...systemSettings, contact_phone: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Station Location
                </label>
                <input
                  type="text"
                  value={systemSettings.station_location}
                  onChange={(e) => setSystemSettings({ ...systemSettings, station_location: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  License Expiry Date
                </label>
                <input
                  type="date"
                  value={systemSettings.license_expiry_date}
                  onChange={(e) => setSystemSettings({ ...systemSettings, license_expiry_date: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Software Version
                </label>
                <input
                  type="text"
                  value={systemSettings.software_version}
                  disabled
                  className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100 cursor-not-allowed"
                />
                <p className="text-xs text-gray-500 mt-1">Read-only</p>
              </div>
            </div>
          </div>

          {/* Messages */}
          {systemMessage && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-md">
              <p className="text-sm text-green-700">✓ {systemMessage}</p>
            </div>
          )}

          {systemError && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-700">✗ {systemError}</p>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={systemLoading}
            className="w-full px-4 py-3 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {systemLoading ? 'Saving...' : 'Save System Information'}
          </button>
        </form>
        </div>
      )}

      {/* Infrastructure Tab */}
      {activeTab === 'infrastructure' && (
        <div className="max-w-2xl bg-white rounded-lg shadow p-6 mb-6">
        <div className="mb-6 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-1">⛽ Tank Management</h2>
            <p className="text-sm text-gray-600">Create and manage fuel storage tanks</p>
          </div>
          <button
            onClick={() => setShowCreateTank(true)}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 font-medium"
          >
            + Create New Tank
          </button>
        </div>

        {/* Tank Messages */}
        {tankMessage && (
          <div className={`mb-4 p-4 rounded-md border ${
            tankMessage.type === 'success'
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}>
            <p className="font-semibold">{tankMessage.text}</p>
            <button
              onClick={() => setTankMessage(null)}
              className="mt-2 text-sm underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Create Tank Form */}
        {showCreateTank && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-md">
            <h3 className="font-semibold text-gray-900 mb-4">Create New Tank</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tank ID
                </label>
                <input
                  type="text"
                  value={newTank.tank_id}
                  onChange={(e) => setNewTank({...newTank, tank_id: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., TANK-DIESEL, TANK-PETROL-2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Fuel Type
                </label>
                <select
                  value={newTank.fuel_type}
                  onChange={(e) => setNewTank({...newTank, fuel_type: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="Diesel">Diesel</option>
                  <option value="Petrol">Petrol</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tank Capacity (Liters)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={newTank.capacity}
                  onChange={(e) => setNewTank({...newTank, capacity: parseFloat(e.target.value) || 0})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., 20000"
                  min="0"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Initial Fuel Level (Liters)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={newTank.initial_level}
                  onChange={(e) => setNewTank({...newTank, initial_level: parseFloat(e.target.value) || 0})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., 0"
                  min="0"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={createTank}
                disabled={tankLoading || !newTank.tank_id || newTank.capacity <= 0}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {tankLoading ? 'Creating...' : 'Create Tank'}
              </button>
              <button
                onClick={() => {
                  setShowCreateTank(false)
                  setNewTank({
                    tank_id: '',
                    fuel_type: 'Diesel',
                    capacity: 0,
                    initial_level: 0
                  })
                }}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Tanks List */}
        <div className="space-y-3">
          {tanks.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">No tanks created yet. Click "Create New Tank" to add one.</p>
          ) : (
            tanks.map(tank => (
              <div
                key={tank.tank_id}
                className={`p-4 rounded-md border-2 ${
                  tank.fuel_type === 'Diesel' ? 'bg-purple-50 border-purple-300' : 'bg-green-50 border-green-300'
                }`}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-bold text-gray-900">{tank.tank_id}</h3>
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${
                        tank.fuel_type === 'Diesel'
                          ? 'bg-purple-100 text-purple-800'
                          : 'bg-green-100 text-green-800'
                      }`}>
                        {tank.fuel_type}
                      </span>
                      <span className="px-2 py-1 rounded bg-blue-100 text-blue-800 text-xs font-semibold">
                        {tank.percentage.toFixed(1)}% Full
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-gray-600">Current Level:</p>
                        <p className="font-semibold text-gray-900">{tank.current_level.toLocaleString()} L</p>
                      </div>
                      <div>
                        <p className="text-gray-600">Capacity:</p>
                        <p className="font-semibold text-gray-900">{tank.capacity.toLocaleString()} L</p>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => deleteTank(tank.tank_id, tank.tank_id)}
                    disabled={tankLoading}
                    className="ml-4 px-3 py-1 bg-red-100 text-red-700 rounded-md hover:bg-red-200 text-sm font-semibold disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Info */}
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
          <p className="text-xs text-blue-700">
            <strong>Note:</strong> Tanks can be assigned to pump stations in the Infrastructure page. You cannot delete a tank that is currently in use by a pump station.
          </p>
        </div>
        </div>
      )}

      {/* Fuel Settings Tab */}
      {activeTab === 'fuel' && (
        <div className="max-w-2xl bg-white rounded-lg shadow p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Fuel Pricing Section */}
          <div className="border-b pb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">💰 Fuel Pricing</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Diesel Price per Liter
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    value={settings.diesel_price_per_liter}
                    onChange={(e) => setSettings({ ...settings, diesel_price_per_liter: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                  <span className="absolute right-3 top-2 text-gray-500">ZMW</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Petrol Price per Liter
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    value={settings.petrol_price_per_liter}
                    onChange={(e) => setSettings({ ...settings, petrol_price_per_liter: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                  <span className="absolute right-3 top-2 text-gray-500">ZMW</span>
                </div>
              </div>
            </div>
          </div>

          {/* Allowable Losses Section */}
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">📊 Allowable Losses During Offloading</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Diesel Allowable Loss (%)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="5"
                  value={settings.diesel_allowable_loss_percent}
                  onChange={(e) => setSettings({ ...settings, diesel_allowable_loss_percent: parseFloat(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">Default: 0.3% loss during delivery</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Petrol Allowable Loss (%)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="5"
                  value={settings.petrol_allowable_loss_percent}
                  onChange={(e) => setSettings({ ...settings, petrol_allowable_loss_percent: parseFloat(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">Default: 0.5% loss during delivery</p>
              </div>
            </div>
          </div>

          {/* Messages */}
          {message && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-md">
              <p className="text-sm text-green-700">✓ {message}</p>
            </div>
          )}

          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-700">✗ {error}</p>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-3 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Saving...' : 'Save Settings'}
          </button>
        </form>

        {/* Info Card */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-blue-900 mb-2">ℹ️ About Allowable Losses</h3>
          <ul className="text-sm text-blue-700 space-y-1">
            <li>• Allowable losses account for evaporation and spillage during fuel delivery</li>
            <li>• Typical industry standards: Diesel 0.2-0.4%, Petrol 0.3-0.6%</li>
            <li>• Losses exceeding these thresholds will be flagged in delivery reports</li>
            <li>• These settings are used to validate stock movements and calculate expected inventory</li>
          </ul>
        </div>
      </div>
      )}

      {/* Validation Thresholds Tab */}
      {activeTab === 'validation' && (
        <div className="max-w-2xl bg-white rounded-lg shadow p-6">
          <div className="space-y-6">
            {/* Header */}
            <div className="border-b pb-4">
              <h2 className="text-xl font-semibold text-gray-900 mb-2">✓ Validation Thresholds</h2>
              <p className="text-sm text-gray-600">
                Configure variance thresholds for tank vs nozzle reading validation. These settings determine when readings are marked as PASS, WARNING, or FAIL.
              </p>
            </div>

            {/* Thresholds Form */}
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    PASS Threshold (%)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="10"
                    value={validationThresholds.pass_threshold}
                    onChange={(e) => setValidationThresholds({ ...validationThresholds, pass_threshold: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 border border-green-300 rounded-md focus:outline-none focus:ring-green-500 focus:border-green-500"
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Variance ≤ this % = PASS (Green status)
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    WARNING Threshold (%)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="10"
                    value={validationThresholds.warning_threshold}
                    onChange={(e) => setValidationThresholds({ ...validationThresholds, warning_threshold: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 border border-yellow-300 rounded-md focus:outline-none focus:ring-yellow-500 focus:border-yellow-500"
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Variance ≤ this % = WARNING (Yellow status)
                  </p>
                </div>
              </div>

              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Meter Discrepancy Threshold (%)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="10"
                  value={validationThresholds.meter_discrepancy_threshold}
                  onChange={(e) => setValidationThresholds({ ...validationThresholds, meter_discrepancy_threshold: parseFloat(e.target.value) })}
                  className="w-full px-3 py-2 border border-orange-300 rounded-md focus:outline-none focus:ring-orange-500 focus:border-orange-500"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  When electronic vs mechanical dispensed discrepancy exceeds this threshold, attendants must provide a note explaining the difference.
                </p>
              </div>

              {/* Current Data Analysis */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
                <h3 className="text-sm font-semibold text-blue-900 mb-2">📊 Based on December 2025 Data:</h3>
                <ul className="text-sm text-blue-700 space-y-1">
                  <li>• Diesel average variance: 0.59%</li>
                  <li>• Petrol average variance: 0.72%</li>
                  <li>• Recommended PASS: 2.0%</li>
                  <li>• Recommended WARNING: 3.5%</li>
                </ul>
              </div>

              {/* Status Legend */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-2">📋 How It Works:</h3>
                <ul className="text-sm text-gray-700 space-y-2">
                  <li className="flex items-start">
                    <span className="text-green-600 font-bold mr-2">✓ PASS:</span>
                    <span>Variance is within acceptable range (≤ PASS threshold)</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-yellow-600 font-bold mr-2">⚠ WARNING:</span>
                    <span>Variance exceeds PASS but is ≤ WARNING threshold - requires attention</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-red-600 font-bold mr-2">✗ FAIL:</span>
                    <span>Variance exceeds WARNING threshold - significant discrepancy detected</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* Messages */}
            {thresholdsMessage && (
              <div className="p-4 bg-green-50 border border-green-200 rounded-md">
                <p className="text-sm text-green-700">✓ {thresholdsMessage}</p>
              </div>
            )}

            {thresholdsError && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-md">
                <p className="text-sm text-red-700">✗ {thresholdsError}</p>
              </div>
            )}

            {/* Submit Button */}
            <button
              onClick={updateValidationThresholds}
              disabled={thresholdsLoading}
              className="w-full px-4 py-3 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {thresholdsLoading ? 'Saving...' : 'Save Validation Thresholds'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
