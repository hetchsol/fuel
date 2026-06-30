import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { authFetch, getHeaders } from '../lib/api'

const BASE = '/api/v1'

interface Snapshot {
  date: string
  created_at: string
  triggered_by: string
  size_bytes: number
}

function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export default function BackupPage() {
  const router = useRouter()
  const [status, setStatus] = useState<any>(null)
  const [statusLoading, setStatusLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)
  const [snapshotDownloading, setSnapshotDownloading] = useState<string | null>(null)
  const [restoring, setRestoring] = useState(false)
  const [pgDumping, setPgDumping] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [isOwner, setIsOwner] = useState(false)

  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (!userData) { router.replace('/'); return }
    const role = JSON.parse(userData).role
    if (!['manager', 'owner'].includes(role)) { router.replace('/'); return }
    setIsOwner(role === 'owner')
    loadStatus()
  }, [])

  const flash = (msg: string, isError = false) => {
    if (isError) { setError(msg); setMessage('') }
    else { setMessage(msg); setError('') }
  }

  const loadStatus = () => {
    setStatusLoading(true)
    authFetch(`${BASE}/backup/status`, { headers: getHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(data => { setStatus(data); setStatusLoading(false) })
      .catch(() => setStatusLoading(false))
  }

  const handleDownload = async () => {
    setDownloading(true)
    flash('')
    try {
      const res = await authFetch(`${BASE}/backup/download`, { headers: getHeaders() })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.detail || 'Download failed')
      }
      const blob = await res.blob()
      const disposition = res.headers.get('Content-Disposition') || ''
      const match = disposition.match(/filename=(.+)/)
      downloadBlob(blob, match ? match[1] : 'fuel_backup.json.gz')
      flash('Backup downloaded. Save the file to USB or another secure location.')
      loadStatus()
    } catch (err: any) {
      flash(err.message || 'Download failed', true)
    } finally {
      setDownloading(false)
    }
  }

  const handleSnapshotDownload = async (snap: Snapshot) => {
    setSnapshotDownloading(snap.date)
    flash('')
    try {
      const res = await authFetch(`${BASE}/backup/snapshots/${snap.date}`, { headers: getHeaders() })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.detail || 'Download failed')
      }
      const blob = await res.blob()
      const disposition = res.headers.get('Content-Disposition') || ''
      const match = disposition.match(/filename=(.+)/)
      downloadBlob(blob, match ? match[1] : `fuel_backup_${snap.date}.json.gz`)
      flash(`Downloaded snapshot for ${snap.date}.`)
    } catch (err: any) {
      flash(err.message || 'Snapshot download failed', true)
    } finally {
      setSnapshotDownloading(null)
    }
  }

  const handleRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!confirm('Restore from this backup? This will overwrite all current station data. This cannot be undone.')) {
      e.target.value = ''
      return
    }
    setRestoring(true)
    flash('')
    try {
      const formData = new FormData()
      formData.append('file', file)
      const token = localStorage.getItem('accessToken')
      const stationId = localStorage.getItem('stationId')
      const res = await fetch(`${BASE}/backup/restore`, {
        method: 'POST',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(stationId ? { 'X-Station-Id': stationId } : {}),
        },
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Restore failed')
      flash(`Restore complete. Data restored from backup dated ${data.restored_from ? new Date(data.restored_from).toLocaleString() : 'unknown'}.`)
      loadStatus()
    } catch (err: any) {
      flash(err.message || 'Restore failed', true)
    } finally {
      setRestoring(false)
      e.target.value = ''
    }
  }

  const handlePgDump = async () => {
    setPgDumping(true)
    flash('')
    try {
      const res = await authFetch(`${BASE}/backup/pg-dump`, { headers: getHeaders() })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.detail || 'Database dump failed')
      }
      const blob = await res.blob()
      const disposition = res.headers.get('Content-Disposition') || ''
      const match = disposition.match(/filename=(.+)/)
      downloadBlob(blob, match ? match[1] : 'fuel_db_dump.sql.gz')
      flash('Database dump downloaded.')
    } catch (err: any) {
      flash(err.message || 'Database dump failed', true)
    } finally {
      setPgDumping(false)
    }
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-content-primary">Backup & Restore</h1>
        <p className="mt-2 text-sm text-content-secondary">
          A snapshot is saved automatically every time you close off a day. Snapshots are stored in the
          database and survive server restarts. Download any snapshot to keep a copy on USB or offline storage.
        </p>
      </div>

      <div className="space-y-6">
        {error && <div className="p-3 bg-status-error-light border border-status-error/30 rounded-btn text-sm text-status-error">{error}</div>}
        {message && <div className="p-3 bg-status-success-light border border-status-success/30 rounded-btn text-sm text-status-success">{message}</div>}

        {/* Saved snapshots */}
        <div className="glass-card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-content-primary">Saved Snapshots</h2>
            <span className="text-xs text-content-secondary">{status?.snapshot_count ?? 0} snapshots stored in database</span>
          </div>

          {statusLoading ? (
            <p className="text-sm text-content-secondary">Loading...</p>
          ) : status?.snapshots?.length > 0 ? (
            <div className="border border-surface-border rounded-lg overflow-hidden">
              <table className="min-w-full text-xs">
                <thead className="bg-surface-bg">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-content-secondary uppercase tracking-wide">Date</th>
                    <th className="px-3 py-2 text-left font-medium text-content-secondary uppercase tracking-wide">Saved at</th>
                    <th className="px-3 py-2 text-left font-medium text-content-secondary uppercase tracking-wide">Triggered by</th>
                    <th className="px-3 py-2 text-left font-medium text-content-secondary uppercase tracking-wide">Size</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {status.snapshots.map((snap: Snapshot) => (
                    <tr key={snap.date} className="border-t border-surface-border hover:bg-surface-card/30">
                      <td className="px-3 py-2 font-medium text-content-primary">{snap.date}</td>
                      <td className="px-3 py-2 text-content-secondary">{snap.created_at ? new Date(snap.created_at).toLocaleString() : '-'}</td>
                      <td className="px-3 py-2 text-content-secondary">{snap.triggered_by || '-'}</td>
                      <td className="px-3 py-2 text-content-secondary">{fmtBytes(snap.size_bytes || 0)}</td>
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => handleSnapshotDownload(snap)}
                          disabled={snapshotDownloading === snap.date}
                          className="px-2 py-1 text-xs rounded border border-action-primary/30 text-action-primary hover:bg-action-primary/5 disabled:opacity-40"
                        >
                          {snapshotDownloading === snap.date ? 'Downloading...' : 'Download'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-content-secondary">
              No snapshots yet. A snapshot is created automatically the next time you close off a day.
              You can also download an on-demand backup below.
            </p>
          )}
        </div>

        {/* Download + Restore */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="glass-card p-5 space-y-3">
            <h2 className="text-sm font-semibold text-content-primary">Download Current Backup</h2>
            <p className="text-xs text-content-secondary">
              Export all station data right now — shifts, readings, handovers, reconciliations, settings,
              and more. Save the file to USB or external storage.
            </p>
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="w-full px-4 py-2 bg-action-primary text-white rounded-btn hover:bg-action-primary-hover text-sm font-medium disabled:opacity-50"
            >
              {downloading ? 'Preparing download...' : 'Download Backup (.json.gz)'}
            </button>
          </div>

          {isOwner && (
            <div className="glass-card p-5 space-y-3">
              <h2 className="text-sm font-semibold text-content-primary">Restore from File</h2>
              <p className="text-xs text-content-secondary">
                Upload a .json.gz backup file (from USB or a previous download) to restore all station data.
                Current data will be overwritten. Use only in an emergency.
              </p>
              <label className={`block w-full px-4 py-2 border-2 border-dashed rounded-btn text-sm font-medium text-center cursor-pointer transition-colors ${restoring ? 'opacity-50 cursor-not-allowed border-surface-border text-content-secondary' : 'border-status-error/40 text-status-error hover:bg-status-error-light'}`}>
                {restoring ? 'Restoring...' : 'Choose backup file to restore'}
                <input type="file" accept=".json.gz" onChange={handleRestore} className="hidden" disabled={restoring} />
              </label>
            </div>
          )}
        </div>

        {/* Full DB dump — owner only */}
        {isOwner && (
          <div className="glass-card p-5 space-y-3">
            <h2 className="text-sm font-semibold text-content-primary">Full Database Dump</h2>
            <p className="text-xs text-content-secondary">
              Download a complete PostgreSQL dump (.sql.gz) of the entire database including user accounts and sessions.
              Only available when the server has pg_dump installed.
            </p>
            <button
              onClick={handlePgDump}
              disabled={pgDumping}
              className="px-4 py-2 border border-surface-border text-content-secondary rounded-btn hover:bg-surface-card/50 text-sm font-medium disabled:opacity-50"
            >
              {pgDumping ? 'Generating dump...' : 'Download Database Dump (.sql.gz)'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
