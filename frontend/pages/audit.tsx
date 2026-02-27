import { useState, useEffect } from 'react'
import { getHeaders, BASE } from '../lib/api'

const ACTION_OPTIONS = [
  '',
  'price_change',
  'settings_update',
  'threshold_update',
  'user_create',
  'user_update',
  'user_delete',
  'shift_create',
  'shift_complete',
  'shift_auto_close',
  'handover_submit',
]

const ENTITY_TYPE_OPTIONS = [
  '',
  'fuel_settings',
  'validation_thresholds',
  'user',
  'shift',
  'handover',
]

interface AuditEntry {
  timestamp: string
  action: string
  entity_type: string
  entity_id: string
  performed_by: string
  details: Record<string, any> | null
  notes: string | null
}

function formatDetails(details: Record<string, any> | null): string {
  if (!details || Object.keys(details).length === 0) return '-'
  // Show a concise summary of key changes
  const parts: string[] = []
  for (const [key, value] of Object.entries(details)) {
    if (typeof value === 'object' && value !== null && 'old' in value && 'new' in value) {
      parts.push(`${key}: ${value.old} → ${value.new}`)
    } else if (typeof value === 'object' && value !== null) {
      parts.push(`${key}: ${JSON.stringify(value)}`)
    } else {
      parts.push(`${key}: ${value}`)
    }
  }
  return parts.join(', ')
}

function formatAction(action: string): string {
  return action.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function formatTimestamp(ts: string): string {
  try {
    const d = new Date(ts)
    return d.toLocaleString()
  } catch {
    return ts
  }
}

export default function AuditLogPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedRow, setExpandedRow] = useState<number | null>(null)

  // Filters
  const [action, setAction] = useState('')
  const [entityType, setEntityType] = useState('')
  const [performedBy, setPerformedBy] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [limit, setLimit] = useState(50)
  const [hasMore, setHasMore] = useState(false)

  const fetchEntries = async (currentLimit: number) => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (action) params.set('action', action)
      if (entityType) params.set('entity_type', entityType)
      if (performedBy) params.set('performed_by', performedBy)
      if (startDate) params.set('start_date', startDate)
      if (endDate) params.set('end_date', endDate)
      params.set('limit', String(currentLimit))

      const res = await fetch(`${BASE}/audit/?${params.toString()}`, {
        headers: getHeaders(),
      })
      if (!res.ok) throw new Error('Failed to fetch audit log')
      const data: AuditEntry[] = await res.json()
      setEntries(data)
      setHasMore(data.length >= currentLimit)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchEntries(limit)
  }, [])

  const handleApply = () => {
    setLimit(50)
    fetchEntries(50)
  }

  const handleLoadMore = () => {
    const newLimit = limit + 50
    setLimit(newLimit)
    fetchEntries(newLimit)
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-content-primary mb-6">Audit Log</h1>

      {/* Filter bar */}
      <div className="bg-surface-card rounded-lg shadow p-4 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
          <div>
            <label className="block text-xs font-medium text-content-secondary mb-1">Action</label>
            <select
              value={action}
              onChange={e => setAction(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-md border border-surface-border bg-surface-bg text-content-primary focus:outline-none focus:ring-2 focus:ring-action-primary"
            >
              <option value="">All Actions</option>
              {ACTION_OPTIONS.filter(Boolean).map(a => (
                <option key={a} value={a}>{formatAction(a)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-content-secondary mb-1">Entity Type</label>
            <select
              value={entityType}
              onChange={e => setEntityType(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-md border border-surface-border bg-surface-bg text-content-primary focus:outline-none focus:ring-2 focus:ring-action-primary"
            >
              <option value="">All Types</option>
              {ENTITY_TYPE_OPTIONS.filter(Boolean).map(t => (
                <option key={t} value={t}>{formatAction(t)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-content-secondary mb-1">Performed By</label>
            <input
              type="text"
              value={performedBy}
              onChange={e => setPerformedBy(e.target.value)}
              placeholder="Username..."
              className="w-full px-3 py-2 text-sm rounded-md border border-surface-border bg-surface-bg text-content-primary focus:outline-none focus:ring-2 focus:ring-action-primary"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-content-secondary mb-1">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-md border border-surface-border bg-surface-bg text-content-primary focus:outline-none focus:ring-2 focus:ring-action-primary"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-content-secondary mb-1">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-md border border-surface-border bg-surface-bg text-content-primary focus:outline-none focus:ring-2 focus:ring-action-primary"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={handleApply}
              className="w-full px-4 py-2 text-sm font-medium text-white bg-action-primary rounded-md hover:bg-action-primary-hover focus:outline-none focus:ring-2 focus:ring-action-primary"
            >
              Apply
            </button>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 p-4 bg-status-error-light border border-status-error rounded-md">
          <p className="text-status-error">{error}</p>
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="text-center py-8 text-content-secondary">Loading audit log...</div>
      ) : entries.length === 0 ? (
        <div className="text-center py-12 text-content-secondary">
          No audit entries match your filters
        </div>
      ) : (
        <>
          {/* Results table */}
          <div className="bg-surface-card rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-surface-border">
                <thead className="bg-surface-bg">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase tracking-wider">Timestamp</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase tracking-wider">Action</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase tracking-wider">Entity Type</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase tracking-wider">Entity ID</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase tracking-wider">Performed By</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase tracking-wider">Details</th>
                  </tr>
                </thead>
                <tbody className="bg-surface-card divide-y divide-surface-border">
                  {entries.map((entry, idx) => (
                    <tr
                      key={idx}
                      className="hover:bg-surface-bg cursor-pointer"
                      onClick={() => setExpandedRow(expandedRow === idx ? null : idx)}
                    >
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-content-primary">
                        {formatTimestamp(entry.timestamp)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-action-primary-light text-action-primary">
                          {formatAction(entry.action)}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-content-secondary">
                        {entry.entity_type || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-content-secondary font-mono text-xs max-w-[200px] truncate" title={entry.entity_id}>
                        {entry.entity_id || '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-content-primary font-medium">
                        {entry.performed_by || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-content-secondary max-w-[300px]">
                        {expandedRow === idx ? (
                          <pre className="whitespace-pre-wrap text-xs bg-surface-bg p-2 rounded">
                            {JSON.stringify(entry.details, null, 2)}
                            {entry.notes && `\nNote: ${entry.notes}`}
                          </pre>
                        ) : (
                          <span className="truncate block max-w-[300px]">
                            {formatDetails(entry.details)}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Load more */}
          {hasMore && (
            <div className="mt-4 text-center">
              <button
                onClick={handleLoadMore}
                className="px-6 py-2 text-sm font-medium text-action-primary bg-action-primary-light rounded-md hover:bg-action-primary hover:text-white transition-colors"
              >
                Load More
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
