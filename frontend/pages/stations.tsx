import { useState, useEffect } from 'react'
import Layout from '../components/Layout'
import { useTheme } from '../contexts/ThemeContext'
import LoadingSpinner from '../components/LoadingSpinner'
import { getHeaders } from '../lib/api'

const BASE = '/api/v1'

function getAuthHeaders() {
  return { ...getHeaders(), 'Content-Type': 'application/json' }
}

export default function StationsPage() {
  const { theme } = useTheme()
  const [stations, setStations] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newStation, setNewStation] = useState({ name: '', location: '', quickSetup: true })
  const [setupMessage, setSetupMessage] = useState('')
  const [editingStation, setEditingStation] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ name: '', location: '' })

  const loadStations = () => {
    setLoading(true)
    fetch(`${BASE}/stations/`, { headers: getAuthHeaders() })
      .then(r => {
        if (!r.ok) throw new Error('Failed to load stations')
        return r.json()
      })
      .then(data => {
        setStations(data)
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }

  useEffect(() => { loadStations() }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    setError('')
    setSetupMessage('')

    try {
      // Generate a station ID
      const stationId = `ST${String(stations.length + 1).padStart(3, '0')}`

      // Create the station
      const res = await fetch(`${BASE}/stations/`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          station_id: stationId,
          name: newStation.name,
          location: newStation.location,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.detail || 'Failed to create station')
      }

      const created = await res.json()

      // Run setup wizard if quick setup selected
      if (newStation.quickSetup) {
        setSetupMessage('Running setup wizard...')
        const setupRes = await fetch(`${BASE}/stations/${created.station_id}/setup-wizard`, {
          method: 'POST',
          headers: getAuthHeaders(),
        })
        if (setupRes.ok) {
          const setupData = await setupRes.json()
          setSetupMessage(`Setup complete: ${setupData.islands} islands, ${setupData.nozzles} nozzles, ${setupData.tanks} tanks`)
        }
      }

      setNewStation({ name: '', location: '', quickSetup: true })
      setShowCreate(false)
      loadStations()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setCreating(false)
    }
  }

  const handleRename = async (stationId: string) => {
    setError('')
    try {
      const res = await fetch(`${BASE}/stations/${stationId}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          station_id: stationId,
          name: editForm.name,
          location: editForm.location,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.detail || 'Failed to update station')
      }
      setEditingStation(null)
      loadStations()
    } catch (err: any) {
      setError(err.message)
    }
  }

  const switchStation = (stationId: string) => {
    localStorage.setItem('stationId', stationId)
    window.location.href = '/'
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold" style={{ color: theme.textPrimary }}>Station Management</h1>
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium"
          >
            {showCreate ? 'Cancel' : '+ New Station'}
          </button>
        </div>

        {error && (
          <div className="p-4 rounded-md" style={{ backgroundColor: '#FEF2F2', borderColor: '#FECACA', borderWidth: '1px' }}>
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {setupMessage && (
          <div className="p-4 rounded-md" style={{ backgroundColor: '#F0FDF4', borderColor: '#BBF7D0', borderWidth: '1px' }}>
            <p className="text-sm text-green-700">{setupMessage}</p>
          </div>
        )}

        {/* Create Station Form */}
        {showCreate && (
          <div className="p-6 rounded-lg shadow" style={{ backgroundColor: theme.cardBg, borderColor: theme.border, borderWidth: '1px' }}>
            <h2 className="text-lg font-semibold mb-4" style={{ color: theme.textPrimary }}>Create New Station</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: theme.textSecondary }}>Station Name</label>
                <input
                  type="text"
                  value={newStation.name}
                  onChange={e => setNewStation({ ...newStation, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-md border focus:outline-none focus:ring-2 focus:ring-blue-500"
                  style={{ backgroundColor: theme.background, color: theme.textPrimary, borderColor: theme.border }}
                  placeholder="e.g. Lusaka Main Station"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: theme.textSecondary }}>Location</label>
                <input
                  type="text"
                  value={newStation.location}
                  onChange={e => setNewStation({ ...newStation, location: e.target.value })}
                  className="w-full px-3 py-2 rounded-md border focus:outline-none focus:ring-2 focus:ring-blue-500"
                  style={{ backgroundColor: theme.background, color: theme.textPrimary, borderColor: theme.border }}
                  placeholder="e.g. Plot 123, Great East Road"
                />
              </div>
              <div className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  id="quickSetup"
                  checked={newStation.quickSetup}
                  onChange={e => setNewStation({ ...newStation, quickSetup: e.target.checked })}
                  className="h-4 w-4 text-blue-600 rounded"
                />
                <label htmlFor="quickSetup" className="text-sm" style={{ color: theme.textPrimary }}>
                  Quick Setup (seed 4 islands, 8 nozzles, 2 tanks, accounts)
                </label>
              </div>
              <div className="flex space-x-3">
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium disabled:opacity-50"
                >
                  {creating ? 'Creating...' : 'Create Station'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="px-4 py-2 rounded-md text-sm font-medium"
                  style={{ backgroundColor: theme.background, color: theme.textPrimary, borderColor: theme.border, borderWidth: '1px' }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Station List */}
        {loading ? (
          <LoadingSpinner text="Loading stations..." />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {stations.map((station: any) => {
              const isActive = localStorage.getItem('stationId') === station.station_id
              return (
                <div
                  key={station.station_id}
                  className="p-5 rounded-lg shadow"
                  style={{
                    backgroundColor: theme.cardBg,
                    borderColor: isActive ? theme.primary : theme.border,
                    borderWidth: isActive ? '2px' : '1px',
                  }}
                >
                  {editingStation === station.station_id ? (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium mb-1" style={{ color: theme.textSecondary }}>Name</label>
                        <input
                          type="text"
                          value={editForm.name}
                          onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                          className="w-full px-2 py-1.5 text-sm rounded border focus:outline-none focus:ring-2 focus:ring-blue-500"
                          style={{ backgroundColor: theme.background, color: theme.textPrimary, borderColor: theme.border }}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1" style={{ color: theme.textSecondary }}>Location</label>
                        <input
                          type="text"
                          value={editForm.location}
                          onChange={e => setEditForm({ ...editForm, location: e.target.value })}
                          className="w-full px-2 py-1.5 text-sm rounded border focus:outline-none focus:ring-2 focus:ring-blue-500"
                          style={{ backgroundColor: theme.background, color: theme.textPrimary, borderColor: theme.border }}
                        />
                      </div>
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleRename(station.station_id)}
                          className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingStation(null)}
                          className="px-3 py-1.5 rounded text-sm"
                          style={{ backgroundColor: theme.background, color: theme.textPrimary, borderColor: theme.border, borderWidth: '1px' }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <h3 className="text-lg font-semibold" style={{ color: theme.textPrimary }}>{station.name}</h3>
                          <p className="text-sm" style={{ color: theme.textSecondary }}>{station.station_id}</p>
                        </div>
                        <div className="flex items-center space-x-2">
                          {isActive && (
                            <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">Active</span>
                          )}
                          <button
                            onClick={() => {
                              setEditingStation(station.station_id)
                              setEditForm({ name: station.name, location: station.location || '' })
                            }}
                            className="px-2 py-1 text-xs rounded hover:bg-gray-100"
                            style={{ color: theme.textSecondary }}
                            title="Rename station"
                          >
                            Edit
                          </button>
                        </div>
                      </div>
                      {station.location && (
                        <p className="text-sm mb-3" style={{ color: theme.textSecondary }}>{station.location}</p>
                      )}
                      {station.created_at && (
                        <p className="text-xs mb-3" style={{ color: theme.textSecondary }}>
                          Created: {new Date(station.created_at).toLocaleDateString()}
                        </p>
                      )}
                      {!isActive && (
                        <button
                          onClick={() => switchStation(station.station_id)}
                          className="w-full px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium"
                        >
                          Switch to this Station
                        </button>
                      )}
                    </>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Layout>
  )
}
