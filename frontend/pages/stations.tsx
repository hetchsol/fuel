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
  const [success, setSuccess] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newStation, setNewStation] = useState({ name: '', location: '', quickSetup: true })
  const [setupMessage, setSetupMessage] = useState('')
  const [editingStation, setEditingStation] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ name: '', location: '' })
  const [showDisabled, setShowDisabled] = useState(false)

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<any>(null)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)

  const loadStations = async () => {
    setLoading(true)
    try {
      const r = await authFetch(`${BASE}/stations/?include_disabled=${showDisabled}`)
      if (r.status === 401) { router.push('/login'); return }
      if (!r.ok) { const data = await r.json(); throw new Error(data.detail || 'Failed to load stations') }
      setStations(await r.json())
    } catch (err: any) { setError(err.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { loadStations() }, [showDisabled])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    setError('')
    setSetupMessage('')
    try {
      const stationId = `ST${String(stations.length + 1).padStart(3, '0')}`
      const res = await authFetch(`${BASE}/stations/`, {
        method: 'POST',
        body: JSON.stringify({ station_id: stationId, name: newStation.name, location: newStation.location }),
      })
      if (!res.ok) { const data = await res.json(); throw new Error(data.detail || 'Failed to create station') }
      const created = await res.json()
      if (newStation.quickSetup) {
        setSetupMessage('Running setup wizard...')
        const setupRes = await authFetch(`${BASE}/stations/${created.station_id}/setup-wizard`, { method: 'POST' })
        if (setupRes.ok) {
          const setupData = await setupRes.json()
          setSetupMessage(`Setup complete: ${setupData.islands} islands, ${setupData.nozzles} nozzles, ${setupData.tanks} tanks`)
        }
      }
      setNewStation({ name: '', location: '', quickSetup: true })
      setShowCreate(false)
      loadStations()
    } catch (err: any) { setError(err.message) }
    finally { setCreating(false) }
  }

  const handleRename = async (stationId: string) => {
    setError('')
    try {
      const res = await authFetch(`${BASE}/stations/${stationId}`, {
        method: 'PUT',
        body: JSON.stringify({ station_id: stationId, name: editForm.name, location: editForm.location }),
      })
      if (!res.ok) { const data = await res.json(); throw new Error(data.detail || 'Failed to update station') }
      setEditingStation(null)
      loadStations()
    } catch (err: any) { setError(err.message) }
  }

  const handleToggleStatus = async (stationId: string) => {
    setError('')
    setSuccess('')
    try {
      const res = await authFetch(`${BASE}/stations/${stationId}/toggle-status`, { method: 'PATCH' })
      if (!res.ok) { const data = await res.json(); throw new Error(data.detail || 'Failed to toggle status') }
      const data = await res.json()
      setSuccess(data.message + (data.staff_affected ? ` (${data.staff_affected} staff affected)` : ''))
      loadStations()
    } catch (err: any) { setError(err.message) }
  }

  const handleDelete = async () => {
    if (!deleteTarget || deleteConfirmText !== deleteTarget.name) return
    setDeleting(true)
    setError('')
    try {
      const res = await authFetch(`${BASE}/stations/${deleteTarget.station_id}`, { method: 'DELETE' })
      if (!res.ok) { const data = await res.json(); throw new Error(data.detail || 'Failed to delete station') }
      const data = await res.json()
      setSuccess(data.message)
      setDeleteTarget(null)
      setDeleteConfirmText('')
      loadStations()
    } catch (err: any) { setError(err.message) }
    finally { setDeleting(false) }
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
        <div className="p-3 rounded-md" style={{ backgroundColor: '#FEF2F2', border: '1px solid #FECACA' }}>
          <p className="text-sm text-status-error">{error}</p>
        </div>
      )}
      {success && (
        <div className="p-3 rounded-md" style={{ backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0' }}>
          <p className="text-sm text-status-success">{success}</p>
        </div>
      )}
      {setupMessage && (
        <div className="p-3 rounded-md" style={{ backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0' }}>
          <p className="text-sm text-status-success">{setupMessage}</p>
        </div>
      )}

      {/* Show disabled toggle */}
      <div className="flex items-center gap-2">
        <input type="checkbox" id="showDisabled" checked={showDisabled} onChange={e => setShowDisabled(e.target.checked)} className="h-4 w-4 rounded" />
        <label htmlFor="showDisabled" className="text-sm" style={{ color: theme.textSecondary }}>Show disabled stations</label>
      </div>

      {/* Create Station Form */}
      {showCreate && (
        <div className="p-6 rounded-lg shadow" style={{ backgroundColor: theme.cardBg, borderColor: theme.border, borderWidth: '1px' }}>
          <h2 className="text-lg font-semibold mb-4" style={{ color: theme.textPrimary }}>Create New Station</h2>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: theme.textSecondary }}>Station Name</label>
              <input type="text" value={newStation.name} onChange={e => setNewStation({ ...newStation, name: e.target.value })}
                className="w-full px-3 py-2 rounded-md border focus:outline-none focus:ring-2 focus:ring-action-primary"
                style={{ backgroundColor: theme.background, color: theme.textPrimary, borderColor: theme.border }}
                placeholder="e.g. Lusaka Main Station" required />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: theme.textSecondary }}>Location</label>
              <input type="text" value={newStation.location} onChange={e => setNewStation({ ...newStation, location: e.target.value })}
                className="w-full px-3 py-2 rounded-md border focus:outline-none focus:ring-2 focus:ring-action-primary"
                style={{ backgroundColor: theme.background, color: theme.textPrimary, borderColor: theme.border }}
                placeholder="e.g. Plot 123, Great East Road" />
            </div>
            <div className="flex items-center space-x-3">
              <input type="checkbox" id="quickSetup" checked={newStation.quickSetup} onChange={e => setNewStation({ ...newStation, quickSetup: e.target.checked })} className="h-4 w-4 text-action-primary rounded" />
              <label htmlFor="quickSetup" className="text-sm" style={{ color: theme.textPrimary }}>Quick Setup (seed islands, nozzles, tanks)</label>
            </div>
            <div className="flex space-x-3">
              <button type="submit" disabled={creating} className="px-4 py-2 bg-action-primary text-white rounded-md hover:bg-action-primary-hover text-sm font-medium disabled:opacity-50">
                {creating ? 'Creating...' : 'Create Station'}
              </button>
              <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 rounded-md text-sm font-medium"
                style={{ backgroundColor: theme.background, color: theme.textPrimary, borderColor: theme.border, borderWidth: '1px' }}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Station List */}
      {loading ? (
        <LoadingSpinner text="Loading stations..." />
      ) : (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {stations.map((station: any) => {
            const isCurrent = localStorage.getItem('stationId') === station.station_id
            const isDisabled = station.status === 'disabled'
            return (
              <div key={station.station_id} className="p-5 rounded-lg shadow" style={{
                backgroundColor: theme.cardBg,
                borderColor: isCurrent ? theme.primary : theme.border,
                borderWidth: isCurrent ? '2px' : '1px',
                opacity: isDisabled ? 0.6 : 1,
              }}>
                {editingStation === station.station_id ? (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium mb-1" style={{ color: theme.textSecondary }}>Name</label>
                      <input type="text" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                        className="w-full px-2 py-1.5 text-sm rounded border focus:outline-none focus:ring-2 focus:ring-action-primary"
                        style={{ backgroundColor: theme.background, color: theme.textPrimary, borderColor: theme.border }} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1" style={{ color: theme.textSecondary }}>Location</label>
                      <input type="text" value={editForm.location} onChange={e => setEditForm({ ...editForm, location: e.target.value })}
                        className="w-full px-2 py-1.5 text-sm rounded border focus:outline-none focus:ring-2 focus:ring-action-primary"
                        style={{ backgroundColor: theme.background, color: theme.textPrimary, borderColor: theme.border }} />
                    </div>
                    <div className="flex space-x-2">
                      <button onClick={() => handleRename(station.station_id)} className="px-3 py-1.5 bg-action-primary text-white rounded text-sm hover:bg-action-primary-hover">Save</button>
                      <button onClick={() => setEditingStation(null)} className="px-3 py-1.5 rounded text-sm"
                        style={{ backgroundColor: theme.background, color: theme.textPrimary, borderColor: theme.border, borderWidth: '1px' }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h3 className="text-lg font-semibold" style={{ color: theme.textPrimary }}>{station.name}</h3>
                        <p className="text-sm" style={{ color: theme.textSecondary }}>{station.station_id}</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {isCurrent && <span className="px-2 py-1 text-xs font-medium rounded-full bg-status-success-light text-status-success">Current</span>}
                        {isDisabled && <span className="px-2 py-1 text-xs font-medium rounded-full bg-status-error-light text-status-error">Disabled</span>}
                        <button onClick={() => { setEditingStation(station.station_id); setEditForm({ name: station.name, location: station.location || '' }) }}
                          className="px-2 py-1 text-xs rounded hover:bg-surface-bg" style={{ color: theme.textSecondary }}>Edit</button>
                      </div>
                    </div>

                    {station.location && <p className="text-sm mb-2" style={{ color: theme.textSecondary }}>{station.location}</p>}
                    {station.created_at && <p className="text-xs mb-3" style={{ color: theme.textSecondary }}>Created: {new Date(station.created_at).toLocaleDateString()}</p>}

                    <div className="flex gap-2">
                      {!isCurrent && !isDisabled && (
                        <button onClick={() => switchStation(station.station_id)}
                          className="flex-1 px-3 py-2 bg-action-primary text-white rounded-md hover:bg-action-primary-hover text-sm font-medium">
                          Switch to Station
                        </button>
                      )}

                      {!isCurrent && (
                        <button onClick={() => handleToggleStatus(station.station_id)}
                          className={`px-3 py-2 rounded-md text-sm font-medium ${isDisabled ? 'bg-status-success-light text-status-success hover:bg-status-success/20' : 'bg-status-warning-light text-status-warning hover:bg-status-warning/20'}`}>
                          {isDisabled ? 'Enable' : 'Disable'}
                        </button>
                      )}

                      {!isCurrent && isDisabled && (
                        <button onClick={() => { setDeleteTarget(station); setDeleteConfirmText('') }}
                          className="px-3 py-2 rounded-md text-sm font-medium bg-status-error-light text-status-error hover:bg-status-error/20">
                          Delete
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="rounded-lg shadow-xl p-6 max-w-md w-full" style={{ backgroundColor: theme.cardBg }}>
            <h3 className="text-lg font-bold text-status-error mb-2">Delete Station</h3>
            <p className="text-sm mb-4" style={{ color: theme.textSecondary }}>
              This will permanently delete <strong style={{ color: theme.textPrimary }}>{deleteTarget.name}</strong> and all its data (shifts, readings, sales, deliveries, settings). This cannot be undone.
            </p>
            <p className="text-sm mb-2" style={{ color: theme.textSecondary }}>
              Type <strong style={{ color: theme.textPrimary }}>{deleteTarget.name}</strong> to confirm:
            </p>
            <input type="text" value={deleteConfirmText} onChange={e => setDeleteConfirmText(e.target.value)}
              className="w-full px-3 py-2 rounded-md border text-sm focus:outline-none focus:ring-2 focus:ring-status-error mb-4"
              style={{ backgroundColor: theme.background, color: theme.textPrimary, borderColor: theme.border }}
              placeholder={deleteTarget.name} autoFocus />
            <div className="flex gap-3">
              <button onClick={() => { setDeleteTarget(null); setDeleteConfirmText('') }}
                className="flex-1 px-4 py-2 rounded-md text-sm font-medium"
                style={{ backgroundColor: theme.background, color: theme.textPrimary, borderColor: theme.border, borderWidth: '1px' }}>
                Cancel
              </button>
              <button onClick={handleDelete} disabled={deleting || deleteConfirmText !== deleteTarget.name}
                className="flex-1 px-4 py-2 rounded-md text-sm font-medium text-white disabled:opacity-50"
                style={{ backgroundColor: 'var(--color-status-error)' }}>
                {deleting ? 'Deleting...' : 'Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
