import { useState, useEffect, useCallback } from 'react'
import { getHeaders, BASE } from '../lib/api'

interface Notification {
  id: string
  timestamp: string
  type: string
  severity: 'critical' | 'high' | 'medium' | 'info'
  title: string
  message: string
  entity_type: string
  entity_id: string
  read: boolean
  read_at: string | null
  created_by: string
}

const SEVERITY_STYLES: Record<string, { border: string; badge: string; badgeText: string }> = {
  critical: {
    border: 'border-l-4 border-l-status-error',
    badge: 'bg-status-error-light text-status-error',
    badgeText: 'Critical',
  },
  high: {
    border: 'border-l-4 border-l-status-warning',
    badge: 'bg-status-warning-light text-status-warning',
    badgeText: 'High',
  },
  medium: {
    border: 'border-l-4 border-l-action-primary',
    badge: 'bg-action-primary-light text-action-primary',
    badgeText: 'Medium',
  },
  info: {
    border: 'border-l-4 border-l-content-secondary',
    badge: 'bg-surface-bg text-content-secondary',
    badgeText: 'Info',
  },
}

const TYPE_LABELS: Record<string, string> = {
  CONSISTENT_LOSS: 'Consistent Loss',
  TANK_LEVEL_CRITICAL: 'Critical Tank Level',
  TANK_LEVEL_LOW: 'Low Tank Level',
  SHIFT_AUTO_CLOSED: 'Shift Auto-Closed',
  CASH_SHORTAGE: 'Cash Shortage',
  HIGH_CONSUMPTION: 'High Consumption',
  HIGH_VARIANCE: 'High Variance',
  FUEL_PRICE_CHANGE: 'Price Change',
  USER_CREATED: 'User Created',
  USER_ROLE_CHANGE: 'Role Change',
  USER_DELETED: 'User Deleted',
  DELIVERY_LOSS_EXCESSIVE: 'Delivery Loss',
  DELIVERY_RECEIVED: 'Delivery Received',
  THRESHOLD_CHANGE: 'Threshold Change',
  SHIFT_COMPLETED: 'Shift Completed',
  HANDOVER_SUBMITTED: 'Handover Submitted',
}

const ALL_TYPES = Object.keys(TYPE_LABELS)
const ALL_SEVERITIES = ['critical', 'high', 'medium', 'info']

function formatRelativeTime(timestamp: string) {
  const diff = Date.now() - new Date(timestamp).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(timestamp).toLocaleDateString()
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [hasMore, setHasMore] = useState(false)
  const [limit, setLimit] = useState(50)

  // Filters
  const [severity, setSeverity] = useState('')
  const [type, setType] = useState('')
  const [readFilter, setReadFilter] = useState<string>('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const fetchNotifications = useCallback(async (currentLimit: number) => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      params.set('limit', String(currentLimit + 1))
      if (severity) params.set('severity', severity)
      if (type) params.set('type', type)
      if (readFilter === 'unread') params.set('read', 'false')
      if (readFilter === 'read') params.set('read', 'true')
      if (startDate) params.set('start_date', startDate)
      if (endDate) params.set('end_date', endDate)

      const res = await fetch(`${BASE}/notifications/?${params.toString()}`, {
        headers: getHeaders(),
      })
      if (!res.ok) throw new Error('Failed to fetch notifications')
      const data: Notification[] = await res.json()

      if (data.length > currentLimit) {
        setHasMore(true)
        setNotifications(data.slice(0, currentLimit))
      } else {
        setHasMore(false)
        setNotifications(data)
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [severity, type, readFilter, startDate, endDate])

  useEffect(() => {
    setLimit(50)
    fetchNotifications(50)
  }, [fetchNotifications])

  const loadMore = () => {
    const newLimit = limit + 50
    setLimit(newLimit)
    fetchNotifications(newLimit)
  }

  const markRead = (id: string) => {
    fetch(`${BASE}/notifications/${id}/read`, {
      method: 'PATCH',
      headers: getHeaders(),
    }).then(r => {
      if (r.ok) {
        setNotifications(prev =>
          prev.map(n => n.id === id ? { ...n, read: true, read_at: new Date().toISOString() } : n)
        )
      }
    }).catch(() => {})
  }

  const markAllRead = () => {
    fetch(`${BASE}/notifications/mark-all-read`, {
      method: 'PATCH',
      headers: getHeaders(),
    }).then(r => {
      if (r.ok) {
        setNotifications(prev => prev.map(n => ({ ...n, read: true, read_at: new Date().toISOString() })))
      }
    }).catch(() => {})
  }

  const unreadCount = notifications.filter(n => !n.read).length
  const criticalCount = notifications.filter(n => n.severity === 'critical').length
  const highCount = notifications.filter(n => n.severity === 'high').length

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
        <h1 className="text-2xl font-bold text-content-primary">Notifications</h1>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            className="px-4 py-2 text-sm font-medium bg-action-primary text-white rounded-md hover:opacity-90 transition-colors"
          >
            Mark all as read
          </button>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="bg-surface-card rounded-lg shadow p-4">
          <p className="text-sm text-content-secondary">Total</p>
          <p className="text-2xl font-bold text-content-primary">{notifications.length}</p>
        </div>
        <div className="bg-surface-card rounded-lg shadow p-4">
          <p className="text-sm text-content-secondary">Unread</p>
          <p className="text-2xl font-bold text-action-primary">{unreadCount}</p>
        </div>
        <div className="bg-surface-card rounded-lg shadow p-4 border-l-4 border-l-status-error">
          <p className="text-sm text-content-secondary">Critical</p>
          <p className="text-2xl font-bold text-status-error">{criticalCount}</p>
        </div>
        <div className="bg-surface-card rounded-lg shadow p-4 border-l-4 border-l-status-warning">
          <p className="text-sm text-content-secondary">High</p>
          <p className="text-2xl font-bold text-status-warning">{highCount}</p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="bg-surface-card rounded-lg shadow p-4 mb-6">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 items-end">
          <div>
            <label className="block text-xs text-content-secondary mb-1">Severity</label>
            <select
              value={severity}
              onChange={e => setSeverity(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-md border bg-surface-bg text-content-primary border-surface-border"
            >
              <option value="">All</option>
              {ALL_SEVERITIES.map(s => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-content-secondary mb-1">Type</label>
            <select
              value={type}
              onChange={e => setType(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-md border bg-surface-bg text-content-primary border-surface-border"
            >
              <option value="">All</option>
              {ALL_TYPES.map(t => (
                <option key={t} value={t}>{TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-content-secondary mb-1">Status</label>
            <select
              value={readFilter}
              onChange={e => setReadFilter(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-md border bg-surface-bg text-content-primary border-surface-border"
            >
              <option value="">All</option>
              <option value="unread">Unread</option>
              <option value="read">Read</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-content-secondary mb-1">From</label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-md border bg-surface-bg text-content-primary border-surface-border"
            />
          </div>
          <div>
            <label className="block text-xs text-content-secondary mb-1">To</label>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-md border bg-surface-bg text-content-primary border-surface-border"
            />
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 p-4 bg-status-error-light border border-status-error rounded-md">
          <p className="text-status-error">{error}</p>
        </div>
      )}

      {/* Notification list */}
      {loading ? (
        <div className="text-center py-8 text-content-secondary">Loading notifications...</div>
      ) : notifications.length === 0 ? (
        <div className="bg-surface-card rounded-lg shadow p-8 text-center">
          <p className="text-lg text-content-secondary">No notifications</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map(n => {
            const style = SEVERITY_STYLES[n.severity] || SEVERITY_STYLES.info
            return (
              <div
                key={n.id}
                onClick={() => !n.read && markRead(n.id)}
                className={`bg-surface-card rounded-lg shadow p-4 cursor-pointer hover:shadow-md transition-shadow ${style.border} ${!n.read ? 'ring-1 ring-action-primary/20' : ''}`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      {!n.read && (
                        <span className="w-2 h-2 rounded-full bg-action-primary shrink-0" />
                      )}
                      <span className="text-sm font-semibold text-content-primary">{n.title}</span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${style.badge}`}>
                        {style.badgeText}
                      </span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-surface-bg text-content-secondary">
                        {TYPE_LABELS[n.type] || n.type}
                      </span>
                    </div>
                    <p className="text-sm text-content-primary">{n.message}</p>
                    {n.entity_id && (
                      <p className="text-xs text-content-secondary mt-1">
                        {n.entity_type}: {n.entity_id}
                      </p>
                    )}
                  </div>
                  <div className="text-right text-sm shrink-0">
                    <p className="text-content-secondary text-xs">{formatRelativeTime(n.timestamp)}</p>
                    <p className="text-[10px] text-content-secondary">{new Date(n.timestamp).toLocaleString()}</p>
                  </div>
                </div>
              </div>
            )
          })}

          {hasMore && (
            <div className="text-center py-4">
              <button
                onClick={loadMore}
                className="px-6 py-2 text-sm font-medium bg-surface-card text-action-primary border border-surface-border rounded-md hover:bg-surface-bg transition-colors"
              >
                Load more
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
