import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { useTheme } from '../contexts/ThemeContext'
import LoadingSpinner from '../components/LoadingSpinner'
import { authFetch, BASE } from '../lib/api'

export default function StationsPage() {
  const router = useRouter()
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

  const loadStations = async () => {
    setLoading(true)
    try {
      const r = await authFetch(`${BASE}/stations/`)
      if (r.status === 401) {
        router.push('/login')
        return
      }
      if (!r.ok) {
        const data = await r.json()
        throw new Error(data.detail || 'Failed to load stations')
      }
      const data = await r.json()
      setStations(data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
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
      const res = await authFetch(`${BASE}/stations/`, {
        method: 'POST',
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
        const setupRes = await authFetch(`${BASE}/stations/${created.station_id}/setup-wizard`, {
          method: 'POST',
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
      const res = await authFetch(`${BASE}/stations/${stationId}`, {
        method: 'PUT',
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
    <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold" style={{ color: theme.textPrimary }}>Station Management</h1>
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="px-4 py-2 bg-action-primary text-white rounded-md hover:bg-action-primary-hover text-sm font-medium"
          >
            {showCreate ? 'Cancel' : '+ New Station'}
          </button>
        </div>

        {error && (
          <div className="p-4 rounded-md" style={{ backgroundColor: '#FEF2F2', borderColor: '#FECACA', borderWidth: '1px' }}>
            <p className="text-sm text-status-error">{error}</p>
          </div>
        )}

        {setupMessage && (
          <div className="p-4 rounded-md" style={{ backgroundColor: '#F0FDF4', borderColor: '#BBF7D0', borderWidth: '1px' }}>
            <p className="text-sm text-status-success">{setupMessage}</p>
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
                  className="w-full px-3 py-2 rounded-md border focus:outline-none focus:ring-2 focus:ring-action-primary"
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
                  className="w-full px-3 py-2 rounded-md border focus:outline-none focus:ring-2 focus:ring-action-primary"
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
                  className="h-4 w-4 text-action-primary rounded"
                />
                <label htmlFor="quickSetup" className="text-sm" style={{ color: theme.textPrimary }}>
                  Quick Setup (seed 4 islands, 8 nozzles, 2 tanks, accounts)
                </label>
              </div>
              <div className="flex space-x-3">
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-2 bg-action-primary text-white rounded-md hover:bg-action-primary-hover text-sm font-medium disabled:opacity-50"
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
                          className="w-full px-2 py-1.5 text-sm rounded border focus:outline-none focus:ring-2 focus:ring-action-primary"
                          style={{ backgroundColor: theme.background, color: theme.textPrimary, borderColor: theme.border }}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1" style={{ color: theme.textSecondary }}>Location</label>
                        <input
                          type="text"
                          value={editForm.location}
                          onChange={e => setEditForm({ ...editForm, location: e.target.value })}
                          className="w-full px-2 py-1.5 text-sm rounded border focus:outline-none focus:ring-2 focus:ring-action-primary"
                          style={{ backgroundColor: theme.background, color: theme.textPrimary, borderColor: theme.border }}
                        />
                      </div>
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleRename(station.station_id)}
                          className="px-3 py-1.5 bg-action-primary text-white rounded text-sm hover:bg-action-primary-hover"
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
                            <span className="px-2 py-1 text-xs font-medium rounded-full bg-status-success-light text-status-success">Active</span>
                          )}
                          <button
                            onClick={() => {
                              setEditingStation(station.station_id)
                              setEditForm({ name: station.name, location: station.location || '' })
                            }}
                            className="px-2 py-1 text-xs rounded hover:bg-surface-bg"
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
                          className="w-full px-3 py-2 bg-action-primary text-white rounded-md hover:bg-action-primary-hover text-sm font-medium"
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
  )
}
