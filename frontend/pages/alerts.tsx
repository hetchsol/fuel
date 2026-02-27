import { useState, useEffect } from 'react'
import { getHeaders, BASE } from '../lib/api'

interface Anomaly {
  tank_id: string
  fuel_type: string
  date: string | null
  type: string
  severity: 'CRITICAL' | 'WARNING' | 'INFO'
  message: string
  value: number | null
}

const SEVERITY_STYLES: Record<string, { border: string; badge: string; badgeText: string }> = {
  CRITICAL: {
    border: 'border-l-4 border-l-status-error',
    badge: 'bg-status-error-light text-status-error',
    badgeText: 'Critical',
  },
  WARNING: {
    border: 'border-l-4 border-l-status-warning',
    badge: 'bg-status-warning-light text-status-warning',
    badgeText: 'Warning',
  },
  INFO: {
    border: 'border-l-4 border-l-action-primary',
    badge: 'bg-action-primary-light text-action-primary',
    badgeText: 'Info',
  },
}

const TYPE_LABELS: Record<string, string> = {
  HIGH_CONSUMPTION: 'High Consumption',
  LOW_CONSUMPTION: 'Low Consumption',
  CONSISTENT_LOSS: 'Consistent Loss',
  HIGH_VARIANCE: 'High Variance',
}

const LOOKBACK_OPTIONS = [7, 14, 30]

export default function AlertsPage() {
  const [anomalies, setAnomalies] = useState<Anomaly[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lookbackDays, setLookbackDays] = useState(7)

  const fetchAnomalies = async (days: number) => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${BASE}/discrepancies?lookback_days=${days}`, {
        headers: getHeaders(),
      })
      if (!res.ok) throw new Error('Failed to fetch anomaly data')
      const data: Anomaly[] = await res.json()
      setAnomalies(data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAnomalies(lookbackDays)
  }, [lookbackDays])

  const criticalCount = anomalies.filter(a => a.severity === 'CRITICAL').length
  const warningCount = anomalies.filter(a => a.severity === 'WARNING').length
  const infoCount = anomalies.filter(a => a.severity === 'INFO').length

  // Group by severity for display
  const grouped: Record<string, Anomaly[]> = { CRITICAL: [], WARNING: [], INFO: [] }
  for (const a of anomalies) {
    if (grouped[a.severity]) grouped[a.severity].push(a)
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
        <h1 className="text-2xl font-bold text-content-primary">Anomaly Alerts</h1>
        <div className="flex items-center gap-2">
          <span className="text-sm text-content-secondary">Lookback:</span>
          {LOOKBACK_OPTIONS.map(days => (
            <button
              key={days}
              onClick={() => setLookbackDays(days)}
              className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${
                lookbackDays === days
                  ? 'bg-action-primary text-white'
                  : 'bg-surface-card text-content-secondary border border-surface-border hover:bg-surface-bg'
              }`}
            >
              {days}d
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 p-4 bg-status-error-light border border-status-error rounded-md">
          <p className="text-status-error">{error}</p>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="bg-surface-card rounded-lg shadow p-4">
          <p className="text-sm text-content-secondary">Total Alerts</p>
          <p className="text-2xl font-bold text-content-primary">{anomalies.length}</p>
        </div>
        <div className="bg-surface-card rounded-lg shadow p-4 border-l-4 border-l-status-error">
          <p className="text-sm text-content-secondary">Critical</p>
          <p className="text-2xl font-bold text-status-error">{criticalCount}</p>
        </div>
        <div className="bg-surface-card rounded-lg shadow p-4 border-l-4 border-l-status-warning">
          <p className="text-sm text-content-secondary">Warning</p>
          <p className="text-2xl font-bold text-status-warning">{warningCount}</p>
        </div>
        <div className="bg-surface-card rounded-lg shadow p-4 border-l-4 border-l-action-primary">
          <p className="text-sm text-content-secondary">Info</p>
          <p className="text-2xl font-bold text-action-primary">{infoCount}</p>
        </div>
      </div>

      {/* Loading */}
      {loading ? (
        <div className="text-center py-8 text-content-secondary">Loading anomaly data...</div>
      ) : anomalies.length === 0 ? (
        <div className="bg-surface-card rounded-lg shadow p-8 text-center">
          <p className="text-lg text-content-secondary">No anomalies detected — all tanks operating normally</p>
        </div>
      ) : (
        <div className="space-y-6">
          {(['CRITICAL', 'WARNING', 'INFO'] as const).map(severity => {
            const items = grouped[severity]
            if (items.length === 0) return null
            const style = SEVERITY_STYLES[severity]
            return (
              <div key={severity}>
                <h2 className="text-lg font-semibold text-content-primary mb-3">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium ${style.badge} mr-2`}>
                    {style.badgeText}
                  </span>
                  {items.length} {style.badgeText} Alert{items.length !== 1 ? 's' : ''}
                </h2>
                <div className="space-y-3">
                  {items.map((a, idx) => (
                    <div
                      key={`${severity}-${idx}`}
                      className={`bg-surface-card rounded-lg shadow p-4 ${style.border}`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-semibold text-content-primary">
                              {a.tank_id}
                            </span>
                            <span className="text-xs text-content-secondary capitalize">
                              {a.fuel_type}
                            </span>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${style.badge}`}>
                              {TYPE_LABELS[a.type] || a.type}
                            </span>
                          </div>
                          <p className="text-sm text-content-primary">{a.message}</p>
                        </div>
                        <div className="text-right text-sm shrink-0">
                          {a.date && (
                            <p className="text-content-secondary">{a.date}</p>
                          )}
                          {a.value !== null && (
                            <p className="font-mono text-content-primary">{a.value.toFixed(2)}L</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
