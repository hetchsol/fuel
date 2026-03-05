import Link from 'next/link'
import { useRouter } from 'next/router'
import { useEffect, useState, useRef, useCallback } from 'react'
import { useTheme } from '../contexts/ThemeContext'
import { authFetch, BASE, getHeaders } from '../lib/api'
import Footer from './Footer'

export default function Layout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const { theme, isDark, toggleDark } = useTheme()
  const [stations, setStations] = useState<any[]>([])
  const [activeStationId, setActiveStationId] = useState<string>('ST001')

  // Notification state
  const [unreadCount, setUnreadCount] = useState(0)
  const [showNotifications, setShowNotifications] = useState(false)
  const [notifications, setNotifications] = useState<any[]>([])
  const notifRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (userData) {
      const parsed = JSON.parse(userData)
      setUser(parsed)
      setActiveStationId(localStorage.getItem('stationId') || parsed.station_id || 'ST001')
    } else if (router.pathname !== '/login') {
      router.push(`/login?redirect=${encodeURIComponent(router.asPath)}`)
    }
    setLoading(false)
  }, [router.pathname])

  useEffect(() => {
    if (user && user.role === 'owner') {
      authFetch(`${BASE}/stations/`)
        .then(r => r.ok ? r.json() : [])
        .then(data => setStations(data))
        .catch(() => {})
    }
  }, [user])

  // Poll unread notification count for supervisors/owners
  const isSupervisorOrOwner = user && (user.role === 'supervisor' || user.role === 'owner')

  useEffect(() => {
    if (!isSupervisorOrOwner) return
    const fetchCount = () => {
      fetch(`${BASE}/notifications/unread-count`, { headers: getHeaders() })
        .then(r => r.ok ? r.json() : { count: 0 })
        .then(data => setUnreadCount(data.count))
        .catch(() => {})
    }
    fetchCount()
    const interval = setInterval(fetchCount, 60000)
    return () => clearInterval(interval)
  }, [isSupervisorOrOwner])

  // Click outside to close notification dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifications(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const openNotifDropdown = useCallback(() => {
    setShowNotifications(prev => !prev)
    if (!showNotifications) {
      fetch(`${BASE}/notifications/?limit=20`, { headers: getHeaders() })
        .then(r => r.ok ? r.json() : [])
        .then(data => setNotifications(data))
        .catch(() => {})
    }
  }, [showNotifications])

  const markNotifRead = useCallback((id: string) => {
    fetch(`${BASE}/notifications/${id}/read`, { method: 'PATCH', headers: getHeaders() })
      .then(r => {
        if (r.ok) {
          setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
          setUnreadCount(prev => Math.max(0, prev - 1))
        }
      })
      .catch(() => {})
  }, [])

  const markAllRead = useCallback(() => {
    fetch(`${BASE}/notifications/mark-all-read`, { method: 'PATCH', headers: getHeaders() })
      .then(r => {
        if (r.ok) {
          setNotifications(prev => prev.map(n => ({ ...n, read: true })))
          setUnreadCount(0)
        }
      })
      .catch(() => {})
  }, [])

  const formatRelativeTime = (timestamp: string) => {
    const diff = Date.now() - new Date(timestamp).getTime()
    const minutes = Math.floor(diff / 60000)
    if (minutes < 1) return 'just now'
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    return `${days}d ago`
  }

  const severityDot: Record<string, string> = {
    critical: 'bg-status-error',
    high: 'bg-status-warning',
    medium: 'bg-action-primary',
    info: 'bg-content-secondary',
  }

  const handleStationChange = (stationId: string) => {
    setActiveStationId(stationId)
    localStorage.setItem('stationId', stationId)
    router.reload()
  }

  const handleLogout = () => {
    localStorage.removeItem('accessToken')
    localStorage.removeItem('user')
    localStorage.removeItem('stationId')
    document.cookie = 'accessToken=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT'
    document.cookie = 'user=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT'
    setUser(null)
    router.push('/login')
  }

  const isActive = (path: string) => router.pathname === path
  const [openMenus, setOpenMenus] = useState<string[]>([])

  const toggleMenu = (menuLabel: string) => {
    setOpenMenus(prev =>
      prev.includes(menuLabel)
        ? prev.filter(m => m !== menuLabel)
        : [...prev, menuLabel]
    )
  }

  const allNavItems = [
    { path: '/', label: 'Dashboard', roles: ['user', 'supervisor', 'owner'] },
    { path: '/my-shift', label: 'My Shift', roles: ['user', 'supervisor', 'owner'] },
    {
      label: 'Operations',
      roles: ['user', 'supervisor', 'owner'],
      children: [
        { path: '/shifts', label: 'Shifts', roles: ['user', 'supervisor', 'owner'] },
        { path: '/enter-readings', label: 'Enter Readings', roles: ['user', 'supervisor', 'owner'] },
        { path: '/readings', label: 'OCR Reading Entry', roles: ['user', 'supervisor', 'owner'] },
        { path: '/daily-tank-reading', label: 'Daily Tank Reading', roles: ['supervisor', 'owner'] },
        { path: '/tank-movement', label: 'Tank Readings & Deliveries', roles: ['supervisor', 'owner'] },
        { path: '/stock-movement', label: 'Stock Movement', roles: ['supervisor', 'owner'] },
        { path: '/lpg-daily', label: 'LPG Daily Operations', roles: ['supervisor', 'owner'] },
        { path: '/lubricants-daily', label: 'Lubricants Daily', roles: ['supervisor', 'owner'] },
      ]
    },
    {
      label: 'Inventory & Sales',
      roles: ['supervisor', 'owner'],
      children: [
        { path: '/inventory', label: 'Tank Levels', roles: ['supervisor', 'owner'] },
        { path: '/sales', label: 'Sales', roles: ['supervisor', 'owner'] },
        { path: '/accounts', label: 'Credit Accounts', roles: ['supervisor', 'owner'] },
      ]
    },
    {
      label: 'Reconciliation',
      roles: ['supervisor', 'owner'],
      children: [
        { path: '/three-way-reconciliation', label: 'Three-Way Reconciliation', roles: ['supervisor', 'owner'] },
        { path: '/tank-analysis', label: 'Tank Analysis', roles: ['supervisor', 'owner'] },
        { path: '/reconciliation', label: 'Shift Reconciliation', roles: ['supervisor', 'owner'] },
      ]
    },
    {
      label: 'Reports',
      roles: ['supervisor', 'owner'],
      children: [
        { path: '/reports', label: 'Sales Reports', roles: ['supervisor', 'owner'] },
        { path: '/tank-readings-report', label: 'Tank Readings & Monitor', roles: ['supervisor', 'owner'] },
        { path: '/advanced-reports', label: 'Advanced Reports', roles: ['supervisor', 'owner'] },
        { path: '/alerts', label: 'Anomaly Alerts', roles: ['supervisor', 'owner'] },
        { path: '/notifications', label: 'Notifications', roles: ['supervisor', 'owner'] },
      ]
    },
    {
      label: 'Administration',
      roles: ['owner'],
      children: [
        { path: '/stations', label: 'Stations', roles: ['owner'] },
        { path: '/infrastructure', label: 'Infrastructure', roles: ['owner'] },
        { path: '/settings', label: 'Settings', roles: ['owner'] },
        { path: '/users', label: 'Users', roles: ['owner'] },
        { path: '/audit', label: 'Audit Log', roles: ['owner'] },
      ]
    },
  ]

  const navItems = user
    ? allNavItems.filter(item => {
        if (item.roles.includes(user.role)) {
          if (item.children) {
            item.children = item.children.filter(child => child.roles.includes(user.role))
            return item.children.length > 0
          }
          return true
        }
        return false
      })
    : []

  if (router.pathname === '/login' || loading) {
    return <>{children}</>
  }

  return (
    <div className="flex flex-col min-h-screen bg-surface-bg">
      <nav className="bg-header-bg shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Top row */}
          <div className="flex justify-between items-center h-16 border-b border-white/20">
            <h1 className="text-xl font-bold text-header-text">NextStop</h1>

            {user && (
              <div className="flex items-center space-x-4">
                {/* Station Selector for owners */}
                {user.role === 'owner' && stations.length > 0 && (
                  <select
                    value={activeStationId}
                    onChange={(e) => handleStationChange(e.target.value)}
                    className="px-3 py-1.5 text-sm rounded-md border bg-surface-card text-content-primary border-surface-border focus:outline-none focus:ring-2 focus:ring-white/40"
                  >
                    {stations.map((s: any) => (
                      <option key={s.station_id} value={s.station_id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                )}

                {/* Dark mode toggle */}
                <button
                  onClick={toggleDark}
                  className="p-2 rounded-md text-header-text hover:bg-white/10 transition-colors"
                  title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
                >
                  {isDark ? '☀️' : '🌙'}
                </button>

                {/* Notification bell - supervisor/owner only */}
                {isSupervisorOrOwner && (
                  <div className="relative" ref={notifRef}>
                    <button
                      onClick={openNotifDropdown}
                      className="p-2 rounded-md text-header-text hover:bg-white/10 transition-colors relative"
                      title="Notifications"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                      </svg>
                      {unreadCount > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-status-error rounded-full">
                          {unreadCount > 99 ? '99+' : unreadCount}
                        </span>
                      )}
                    </button>

                    {showNotifications && (
                      <div className="absolute right-0 mt-2 w-80 sm:w-96 max-h-[28rem] overflow-y-auto shadow-lg rounded-md z-50 bg-surface-card border border-surface-border">
                        <div className="sticky top-0 bg-surface-card border-b border-surface-border px-4 py-3 flex items-center justify-between">
                          <h3 className="text-sm font-semibold text-content-primary">Notifications</h3>
                          <div className="flex items-center gap-3">
                            {unreadCount > 0 && (
                              <button
                                onClick={markAllRead}
                                className="text-xs text-action-primary hover:underline"
                              >
                                Mark all read
                              </button>
                            )}
                            <Link
                              href="/notifications"
                              className="text-xs text-action-primary hover:underline"
                              onClick={() => setShowNotifications(false)}
                            >
                              View all
                            </Link>
                          </div>
                        </div>
                        {notifications.length === 0 ? (
                          <div className="px-4 py-8 text-center text-sm text-content-secondary">
                            No notifications
                          </div>
                        ) : (
                          <div>
                            {notifications.map((n: any) => (
                              <div
                                key={n.id}
                                onClick={() => !n.read && markNotifRead(n.id)}
                                className={`px-4 py-3 border-b border-surface-border cursor-pointer hover:bg-surface-bg transition-colors ${!n.read ? 'bg-action-primary-light/30' : ''}`}
                              >
                                <div className="flex items-start gap-2">
                                  <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${severityDot[n.severity] || 'bg-content-secondary'}`} />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-content-primary truncate">{n.title}</p>
                                    <p className="text-xs text-content-secondary line-clamp-2">{n.message}</p>
                                    <p className="text-[10px] text-content-secondary mt-1">{formatRelativeTime(n.timestamp)}</p>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div className="text-right hidden sm:block">
                  <p className="text-sm font-medium text-header-text">{user.full_name}</p>
                  <p className="text-xs text-header-text/70">
                    {user.role === 'user' && 'User'}
                    {user.role === 'supervisor' && 'Supervisor'}
                    {user.role === 'owner' && 'Owner'}
                  </p>
                </div>
                <button
                  onClick={handleLogout}
                  className="px-4 py-2 bg-status-error text-white text-sm rounded-md hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-white/40"
                >
                  Logout
                </button>
              </div>
            )}
          </div>

          {/* Desktop nav */}
          <div className="hidden sm:flex sm:space-x-8 h-12">
            {navItems.map((item: any) => (
              item.children ? (
                <div key={item.label} className="relative group">
                  <button
                    className="inline-flex items-center px-1 border-b-2 border-transparent text-sm font-medium h-12 text-header-text/70 hover:text-header-text transition-colors"
                  >
                    {item.label} ▾
                  </button>
                  <div className="absolute left-0 mt-0 w-48 shadow-lg rounded-md hidden group-hover:block z-50 bg-surface-card border border-surface-border">
                    {item.children.map((child: any) => (
                      <Link
                        key={child.path}
                        href={child.path}
                        className="block px-4 py-2 text-sm transition-colors"
                        style={{
                          backgroundColor: isActive(child.path) ? 'var(--color-action-primary-light)' : 'transparent',
                          color: isActive(child.path) ? 'var(--color-action-primary)' : 'var(--color-text-primary)',
                          fontWeight: isActive(child.path) ? '500' : '400'
                        }}
                      >
                        {child.label}
                      </Link>
                    ))}
                  </div>
                </div>
              ) : (
                <Link
                  key={item.path}
                  href={item.path}
                  className={`inline-flex items-center px-1 border-b-2 text-sm font-medium transition-colors ${
                    isActive(item.path)
                      ? 'border-white text-header-text'
                      : 'border-transparent text-header-text/70 hover:text-header-text'
                  }`}
                >
                  {item.label}
                </Link>
              )
            ))}
          </div>
        </div>
      </nav>

      {/* Mobile Navigation */}
      <div className="sm:hidden bg-surface-card border-b border-surface-border">
        <div className="px-2 pt-2 pb-3 space-y-1">
          {navItems.map((item: any) => (
            item.children ? (
              <div key={item.label}>
                <button
                  onClick={() => toggleMenu(item.label)}
                  className="w-full flex justify-between items-center px-3 py-2 rounded-md text-base font-medium text-content-primary"
                >
                  <span>{item.label}</span>
                  <span>{openMenus.includes(item.label) ? '▴' : '▾'}</span>
                </button>
                {openMenus.includes(item.label) && (
                  <div className="pl-4 space-y-1">
                    {item.children.map((child: any) => (
                      <Link
                        key={child.path}
                        href={child.path}
                        className="block px-3 py-2 rounded-md text-sm transition-colors"
                        style={{
                          backgroundColor: isActive(child.path) ? 'var(--color-action-primary-light)' : 'transparent',
                          color: isActive(child.path) ? 'var(--color-action-primary)' : 'var(--color-text-secondary)',
                          fontWeight: isActive(child.path) ? '500' : '400'
                        }}
                      >
                        {child.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <Link
                key={item.path}
                href={item.path}
                className="block px-3 py-2 rounded-md text-base font-medium transition-colors"
                style={{
                  backgroundColor: isActive(item.path) ? 'var(--color-action-primary-light)' : 'transparent',
                  color: isActive(item.path) ? 'var(--color-action-primary)' : 'var(--color-text-primary)'
                }}
              >
                {item.label}
              </Link>
            )
          ))}
          {user && (
            <div className="px-3 py-2 mt-2 pt-2 border-t border-surface-border">
              <p className="text-sm font-medium text-content-primary">{user.full_name}</p>
              <p className="text-xs text-content-secondary">
                {user.role === 'user' && 'User'}
                {user.role === 'supervisor' && 'Supervisor'}
                {user.role === 'owner' && 'Owner'}
              </p>
            </div>
          )}
        </div>
      </div>

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        {children}
      </main>

      <Footer />
    </div>
  )
}
