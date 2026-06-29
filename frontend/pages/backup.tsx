import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { authFetch, getHeaders } from '../lib/api'

const BASE = '/api/v1'

export default function BackupPage() {
  const router = useRouter()
  const [status, setStatus] = useState<any>(null)
  const [statusLoading, setStatusLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [pgDumping, setPgDumping] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (!userData || JSON.parse(userData).role !== 'owner') {
      router.replace('/')
      return
    }
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
      const filename = match ? match[1] : 'fuel_backup.json.gz'
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      flash('Backup downloaded successfully.')
      loadStatus()
    } catch (err: any) {
      flash(err.message || 'Download failed', true)
    } finally {
      setDownloading(false)
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
      const filename = match ? match[1] : 'fuel_db_dump.sql.gz'
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      flash('Database dump downloaded successfully.')
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
          Download snapshots of all station data or restore from a previous backup.
          A backup is also created automatically each time you close off a day.
        </p>
      </div>

      <div className="space-y-6">
        {error && <div className="p-3 bg-status-error-light border border-status-error/30 rounded-btn text-sm text-status-error">{error}</div>}
        {message && <div className="p-3 bg-status-success-light border border-status-success/30 rounded-btn text-sm text-status-success">{message}</div>}

        {/* Status card */}
        <div className="glass-card p-5 space-y-3">
          <h2 className="text-sm font-semibold text-content-primary">Backup Status</h2>
          {statusLoading ? (
            <p className="text-sm text-content-secondary">Loading...</p>
          ) : status ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-content-secondary">Last backup</span>
                <span className="font-medium text-content-primary">
                  {status.last_backup_at
                    ? new Date(status.last_backup_at).toLocaleString()
                    : 'No backup yet this session'}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-content-secondary">Snapshots on server</span>
                <span className="font-medium text-content-primary">{status.snapshot_count}</span>
              </div>
              {status.snapshots?.length > 0 && (
                <div className="max-h-48 overflow-y-auto border border-surface-border rounded-lg">
                  <table className="min-w-full text-xs">
                    <thead className="sticky top-0 bg-surface-bg">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium text-content-secondary uppercase tracking-wide">Snapshot file</th>
                      </tr>
                    </thead>
                    <tbody>
                      {status.snapshots.map((f: string) => (
                        <tr key={f} className="border-t border-surface-border">
                          <td className="px-3 py-1.5 text-content-primary font-mono">{f}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-content-secondary">Could not load backup status.</p>
          )}
        </div>

        {/* Download + Restore side by side */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="glass-card p-5 space-y-3">
            <h2 className="text-sm font-semibold text-content-primary">Download Backup</h2>
            <p className="text-xs text-content-secondary">
              Export all station data — shifts, readings, handovers, reconciliations, settings, and more — as a single file you can store offline.
            </p>
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="w-full px-4 py-2 bg-action-primary text-white rounded-btn hover:bg-action-primary-hover text-sm font-medium disabled:opacity-50"
            >
              {downloading ? 'Preparing download...' : 'Download Backup (.json.gz)'}
            </button>
          </div>

          <div className="glass-card p-5 space-y-3">
            <h2 className="text-sm font-semibold text-content-primary">Restore from Backup</h2>
            <p className="text-xs text-content-secondary">
              Upload a previously downloaded .json.gz file to restore all station data. Current data will be overwritten. Use only in an emergency.
            </p>
            <label className={`block w-full px-4 py-2 border-2 border-dashed rounded-btn text-sm font-medium text-center cursor-pointer transition-colors ${restoring ? 'opacity-50 cursor-not-allowed border-surface-border text-content-secondary' : 'border-status-error/40 text-status-error hover:bg-status-error-light'}`}>
              {restoring ? 'Restoring...' : 'Choose backup file to restore'}
              <input type="file" accept=".json.gz" onChange={handleRestore} className="hidden" disabled={restoring} />
            </label>
          </div>
        </div>

        {/* Full DB dump */}
        <div className="glass-card p-5 space-y-3">
          <h2 className="text-sm font-semibold text-content-primary">Full Database Dump</h2>
          <p className="text-xs text-content-secondary">
            Download a complete PostgreSQL dump (.sql.gz) of the entire database. This is the deepest level of backup — it restores everything including user accounts and sessions.
            Only available when the server has PostgreSQL configured and pg_dump installed.
          </p>
          <button
            onClick={handlePgDump}
            disabled={pgDumping}
            className="px-4 py-2 border border-surface-border text-content-secondary rounded-btn hover:bg-surface-card/50 text-sm font-medium disabled:opacity-50"
          >
            {pgDumping ? 'Generating dump...' : 'Download Database Dump (.sql.gz)'}
          </button>
        </div>
      </div>
    </div>
  )
}
