import Link from 'next/link'
import { useRouter } from 'next/router'
import { useEffect, useState, useRef, useCallback } from 'react'
import { useTheme } from '../contexts/ThemeContext'
import { authFetch, BASE, getHeaders } from '../lib/api'
import Footer from './Footer'

function LiveClock() {
  const [time, setTime] = useState('')
  useEffect(() => {
    const tick = () => {
      const now = new Date()
      setTime(now.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }))
    }
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [])
  return <p className="text-[10px] text-white/40 leading-tight font-mono">{time}</p>
}

/* ── Nav Icons (inline SVGs) ──────────────────────────── */
const icons: Record<string, React.ReactNode> = {
  Dashboard: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1" />
    </svg>
  ),
  'My Shift': (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  "Today's Shift": (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  Day: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),
  'Stock & Sales': (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
  ),
  Admin: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  ),
  Operations: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  'Inventory & Sales': (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
  ),
  Reconciliation: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
    </svg>
  ),
  Reports: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  ),
  Administration: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  ),
}

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

  // Mobile nav
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [setupPending, setSetupPending] = useState(false)

  // Deposit overdue alert
  const [depositOverdue, setDepositOverdue] = useState(false)

  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (userData) {
      const parsed = JSON.parse(userData)
      setUser(parsed)
      setActiveStationId(localStorage.getItem('stationId') || parsed.station_id || 'ST001')

      // Check if owner needs to complete setup wizard
      if (parsed.role === 'owner' && router.pathname !== '/login' && router.pathname !== '/setup' && router.pathname !== '/initializing') {
        authFetch(`${BASE}/settings/system`)
          .then(r => r.ok ? r.json() : null)
          .then(sys => {
            if (sys && !sys.setup_completed) {
              setSetupPending(true)
              // Set cookie so middleware enforces on subsequent navigations
              const secure = window.location.protocol === 'https:' ? '; Secure' : ''
              document.cookie = `needsSetup=1; path=/; SameSite=Lax${secure}`
              router.push('/initializing')
            }
          })
          .catch(() => {})
      }
    } else if (router.pathname !== '/login' && router.pathname !== '/setup' && router.pathname !== '/initializing') {
      router.push(`/login?redirect=${encodeURIComponent(router.asPath)}`)
    }
    setLoading(false)
  }, [router.pathname])

  useEffect(() => {
    if (router.pathname === '/login' || router.pathname === '/setup') return
    if (user && user.role === 'owner') {
      authFetch(`${BASE}/stations/`)
        .then(r => r.ok ? r.json() : [])
        .then(data => setStations(data))
        .catch(() => {})
    }
  }, [user, router.pathname])

  // Silent token refresh — check every 30 min, refresh if token > 20 hours old
  useEffect(() => {
    if (!user || router.pathname === '/login' || router.pathname === '/setup' || router.pathname === '/initializing') return
    const tryRefresh = () => {
      const tokenSetAt = localStorage.getItem('tokenSetAt')
      if (!tokenSetAt) {
        localStorage.setItem('tokenSetAt', String(Date.now()))
        return
      }
      const ageHours = (Date.now() - parseInt(tokenSetAt)) / (1000 * 60 * 60)
      if (ageHours > 20) {
        authFetch(`${BASE}/auth/refresh`, { method: 'POST' })
          .then(r => r.ok ? r.json() : null)
          .then(data => {
            if (data?.access_token) {
              localStorage.setItem('accessToken', data.access_token)
              localStorage.setItem('tokenSetAt', String(Date.now()))
              const secure = window.location.protocol === 'https:' ? '; Secure' : ''
              document.cookie = `accessToken=${data.access_token}; path=/; SameSite=Strict${secure}`
            }
          })
          .catch(() => {})
      }
    }
    tryRefresh()
    const interval = setInterval(tryRefresh, 30 * 60 * 1000)
    return () => clearInterval(interval)
  }, [user, router.pathname])

  // Poll unread notification count for supervisors/owners
  const isSupervisorOrAbove = user && ['supervisor', 'manager', 'owner'].includes(user.role)
  const isManagerOrAbove = user && ['manager', 'owner'].includes(user.role)
  const isSupervisorOrOwner = isSupervisorOrAbove  // backward compat alias

  useEffect(() => {
    if (router.pathname === '/login' || router.pathname === '/setup') return
    if (!isSupervisorOrOwner) return
    const fetchCount = () => {
      authFetch(`${BASE}/notifications/unread-count`, { headers: getHeaders() })
        .then(r => r.ok ? r.json() : { count: 0 })
        .then(data => setUnreadCount(data.count))
        .catch(() => {})
    }
    fetchCount()
    const interval = setInterval(fetchCount, 60000)
    return () => clearInterval(interval)
  }, [isSupervisorOrOwner, router.pathname])

  // Periodic deposit overdue check — every 5 minutes for all roles
  useEffect(() => {
    if (!user || router.pathname === '/login' || router.pathname === '/setup' || router.pathname === '/initializing') return
    const checkDeposits = () => {
      if (user.role === 'user') {
        // Attendant: find their assigned shift via my-shift, then check deposits
        authFetch(`${BASE}/handover/my-shift`)
          .then(r => r.ok ? r.json() : null)
          .then(data => {
            if (!data?.found || !data?.shift?.shift_id) { setDepositOverdue(false); return }
            authFetch(`${BASE}/safe-deposits/${data.shift.shift_id}/my-deposits`)
              .then(r => r.ok ? r.json() : { overdue: false })
              .then(depData => setDepositOverdue(depData.overdue || false))
              .catch(() => {})
          })
          .catch(() => {})
      } else {
        // Supervisor/Manager/Owner: check ALL active shifts for any overdue deposits
        authFetch(`${BASE}/shifts/`)
          .then(r => r.ok ? r.json() : [])
          .then(async (shifts) => {
            const activeShifts = (shifts || []).filter((s: any) => s.status === 'active')
            if (activeShifts.length === 0) { setDepositOverdue(false); return }
            // Check all active shifts
            let anyOverdue = false
            for (const shift of activeShifts) {
              try {
                const depRes = await authFetch(`${BASE}/safe-deposits/${shift.shift_id}`)
                if (depRes.ok) {
                  const depData = await depRes.json()
                  if ((depData.attendants || []).some((a: any) => a.overdue)) {
                    anyOverdue = true
                    break
                  }
                }
              } catch {}
            }
            setDepositOverdue(anyOverdue)
          })
          .catch(() => {})
      }
    }
    checkDeposits()
    const interval = setInterval(checkDeposits, 5 * 60 * 1000) // Every 5 minutes
    return () => clearInterval(interval)
  }, [user, router.pathname])

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

  // Close mobile nav on route change
  useEffect(() => {
    setMobileNavOpen(false)
  }, [router.pathname])

  const openNotifDropdown = useCallback(() => {
    setShowNotifications(prev => !prev)
    if (!showNotifications) {
      authFetch(`${BASE}/notifications/?limit=20`, { headers: getHeaders() })
        .then(r => r.ok ? r.json() : [])
        .then(data => setNotifications(data))
        .catch(() => {})
    }
  }, [showNotifications])

  const markNotifRead = useCallback((id: string) => {
    authFetch(`${BASE}/notifications/${id}/read`, { method: 'PATCH', headers: getHeaders() })
      .then(r => {
        if (r.ok) {
          setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
          setUnreadCount(prev => Math.max(0, prev - 1))
        }
      })
      .catch(() => {})
  }, [])

  const markAllRead = useCallback(() => {
    authFetch(`${BASE}/notifications/mark-all-read`, { method: 'PATCH', headers: getHeaders() })
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
    const secure = window.location.protocol === 'https:' ? '; Secure' : ''
    document.cookie = `accessToken=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT${secure}`
    document.cookie = `user=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT${secure}`
    setUser(null)
    router.push('/login')
  }

  const isActive = (path: string) => router.pathname === path
  const [openMenus, setOpenMenus] = useState<string[]>([])

  const toggleMenu = (menuLabel: string) => {
    setOpenMenus(prev =>
      prev.includes(menuLabel) ? [] : [menuLabel]
    )
  }

  const DEFAULT_NAV = [
    { path: '/', label: 'Dashboard', roles: ['supervisor', 'owner'] },
    {
      // Attendant: their whole job — Start the shift (verify auto-fetched opening)
      // and End the shift (record closing + send to supervisor).
      label: "Today's Shift",
      roles: ['user'],
      children: [
        { path: '/my-shift?mode=start', label: 'Start Shift', roles: ['user'] },
        { path: '/my-shift?mode=end', label: 'End Shift', roles: ['user'] },
      ]
    },
    {
      label: 'My Shift',
      roles: ['supervisor', 'manager', 'owner'],
      children: [
        { path: '/my-shift', label: 'End My Shift', roles: ['supervisor'] },
        { path: '/shift-closing', label: 'Close Shift', roles: ['supervisor', 'manager', 'owner'] },
      ]
    },
    {
      label: 'Operations',
      roles: ['user', 'supervisor', 'owner'],
      children: [
        { path: '/shifts', label: 'Shifts', roles: ['supervisor', 'owner'] },
        { path: '/handover-review', label: 'Handover Review', roles: ['supervisor', 'manager', 'owner'] },
        { path: '/readings', label: 'OCR Reading Entry', roles: ['supervisor'], disabled: true },
        { path: '/tank-dips', label: 'Tank Dips', roles: ['manager', 'owner'] },
        { path: '/daily-tank-reading', label: 'Daily Tank Reading', roles: ['supervisor', 'manager', 'owner'] },
        { path: '/fuel-operations', label: 'Fuel Operations', roles: ['supervisor', 'manager', 'owner'] },
        { path: '/lpg-daily', label: 'LPG Daily Operations', roles: ['supervisor', 'manager', 'owner'] },
        { path: '/lubricants-daily', label: 'Lubricants Daily', roles: ['supervisor', 'manager', 'owner'] },
      ]
    },
    {
      label: 'Inventory & Sales',
      roles: ['supervisor', 'manager', 'owner'],
      children: [
        { path: '/inventory', label: 'Tank Levels', roles: ['supervisor', 'manager', 'owner'] },
        { path: '/stores', label: 'Stores / Stock', roles: ['manager', 'owner'] },
        { path: '/stock-takes', label: 'Stock Takes', roles: ['manager', 'owner'] },
        { path: '/sales', label: 'Sales', roles: ['supervisor', 'manager', 'owner'] },
        { path: '/accounts', label: 'Credit Accounts', roles: ['supervisor', 'manager', 'owner'] },
      ]
    },
    // Consolidated analytical clusters (each is a single tabbed page).
    { path: '/shift-reconciliation', label: 'Reconciliation', roles: ['supervisor', 'manager', 'owner'] },
    { path: '/reports', label: 'Reports', roles: ['supervisor', 'manager', 'owner'] },
    { path: '/alerts', label: 'Alerts', roles: ['supervisor', 'manager', 'owner'] },
    {
      label: 'Administration',
      roles: ['manager', 'owner'],
      children: [
        { path: '/daily-close-off', label: 'Daily Close-Off', roles: ['manager', 'owner'] },
        { path: '/stations', label: 'Stations', roles: ['owner'] },
        { path: '/infrastructure', label: 'Infrastructure', roles: ['owner'] },
        { path: '/settings', label: 'Settings', roles: ['manager', 'owner'] },
        { path: '/users', label: 'Users', roles: ['manager', 'owner'] },
        { path: '/audit', label: 'Audit Log', roles: ['manager', 'owner'] },
      ]
    },
  ]

  // Manager-only menu: a leaner, task-focused 4-group layout. Same pages and the
  // same middleware permissions — only the grouping/labels differ. The launchpad
  // (landed on at "/") remains the manager's home for the daily chain.
  const MANAGER_NAV = [
    {
      label: 'Day',
      roles: ['manager'],
      children: [
        { path: '/shifts', label: 'Shifts', roles: ['manager'] },
        { path: '/handover-review', label: 'Handover Review', roles: ['manager'] },
        { path: '/daily-close-off', label: 'Daily Close-Off', roles: ['manager'] },
      ],
    },
    {
      label: 'Stock & Sales',
      roles: ['manager'],
      children: [
        { path: '/tank-dips', label: 'Tank Dips', roles: ['manager'] },
        { path: '/daily-tank-reading', label: 'Daily Tank Reading', roles: ['manager'] },
        { path: '/fuel-operations', label: 'Fuel Operations', roles: ['manager'] },
        { path: '/stores', label: 'Stores / Stock', roles: ['manager'] },
        { path: '/stock-takes', label: 'Stock Takes', roles: ['manager'] },
        { path: '/inventory', label: 'Tank Levels', roles: ['manager'] },
        { path: '/sales', label: 'Sales', roles: ['manager'] },
        { path: '/accounts', label: 'Credit Accounts', roles: ['manager'] },
      ],
    },
    // Same consolidated clusters as every other role.
    { path: '/shift-reconciliation', label: 'Reconciliation', roles: ['manager'] },
    { path: '/reports', label: 'Reports', roles: ['manager'] },
    { path: '/alerts', label: 'Alerts', roles: ['manager'] },
    {
      label: 'Admin',
      roles: ['manager'],
      children: [
        { path: '/settings', label: 'Settings', roles: ['manager'] },
        { path: '/users', label: 'Users', roles: ['manager'] },
        { path: '/audit', label: 'Audit Log', roles: ['manager'] },
      ],
    },
  ]

  // Managers get the leaner 4-group menu; everyone else keeps the default nav.
  const allNavItems = user?.role === 'manager' ? MANAGER_NAV : DEFAULT_NAV

  const isSetupPage = ['/setup', '/initializing', '/login'].includes(router.pathname)
  const hideNav = setupPending || isSetupPage

  const navItems = (user && !hideNav)
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
      // Collapse a menu that has only one visible child into a direct link —
      // fewer clicks, no pointless dropdown (e.g. attendant's "My Shift").
      .map((item: any) => {
        if (item.children && item.children.length === 1) {
          const only = item.children[0]
          return { path: only.path, label: only.label, roles: item.roles, disabled: only.disabled }
        }
        return item
      })
    : []

  if (router.pathname === '/login' || router.pathname === '/setup' || loading) {
    return <>{children}</>
  }

  return (
    <div className="flex flex-col min-h-screen">
      {/* ── Glassmorphism Nav ────────────────────────────── */}
      <nav className="glass-nav sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Top row */}
          <div className="flex justify-between items-center h-16">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center group-hover:bg-white/30 transition-colors">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h1 className="text-xl font-bold text-white tracking-tight">NextStop</h1>
            </Link>

            {user && (
              <div className="flex items-center gap-3">
                {/* Station Selector for owners */}
                {user.role === 'owner' && stations.length > 0 && (
                  <select
                    value={activeStationId}
                    onChange={(e) => handleStationChange(e.target.value)}
                    className="px-3 py-1.5 text-sm rounded-btn border bg-white/10 text-white border-white/20 focus:outline-none focus:ring-2 focus:ring-white/40 backdrop-blur-sm"
                  >
                    {stations.map((s: any) => (
                      <option key={s.station_id} value={s.station_id} className="bg-surface-card text-content-primary">
                        {s.name}
                      </option>
                    ))}
                  </select>
                )}

                {/* Dark mode toggle — desktop only; drawer handles mobile/tablet */}
                <button
                  onClick={toggleDark}
                  className="hidden lg:inline-flex p-2 rounded-btn text-white/80 hover:text-white hover:bg-white/10 transition-all"
                  title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
                >
                  {isDark ? (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                    </svg>
                  )}
                </button>

                {/* Notification bell */}
                {isSupervisorOrOwner && (
                  <div className="relative" ref={notifRef}>
                    <button
                      onClick={openNotifDropdown}
                      className="p-2 rounded-btn text-white/80 hover:text-white hover:bg-white/10 transition-all relative"
                      title="Notifications"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                      </svg>
                      {(unreadCount > 0 || depositOverdue) && (
                        <span className={`absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white rounded-full ring-2 ring-action-primary/50 ${depositOverdue ? 'bg-status-warning animate-pulse' : 'bg-status-error'}`}>
                          {unreadCount > 0 ? (unreadCount > 99 ? '99+' : unreadCount) : '!'}
                        </span>
                      )}
                    </button>

                    {showNotifications && (
                      <div className="dropdown-enter absolute right-0 mt-2 w-80 sm:w-96 max-h-[28rem] overflow-y-auto rounded-card z-50 glass-card-static border border-surface-border">
                        <div className="sticky top-0 bg-surface-card/95 backdrop-blur-sm border-b border-surface-border px-4 py-3 flex items-center justify-between rounded-t-card">
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
                                className={`px-4 py-3 border-b border-surface-border cursor-pointer hover:bg-white/5 transition-colors ${!n.read ? 'bg-action-primary/5' : ''}`}
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

                {/* User info — desktop only */}
                <div className="hidden lg:flex items-center gap-3 pl-3 border-l border-white/20">
                  <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-sm font-semibold text-white">
                    {user.full_name?.charAt(0)?.toUpperCase() || 'U'}
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-white leading-tight">{user.full_name}</p>
                    <p className="text-[11px] text-white/60 leading-tight">
                      {user.role === 'user' && 'Attendant'}
                      {user.role === 'supervisor' && 'Supervisor'}
                      {user.role === 'manager' && 'Manager'}
                      {user.role === 'owner' && 'Owner'}
                    </p>
                    <LiveClock />
                    {depositOverdue && (
                      <p className="text-[10px] text-status-warning font-semibold animate-pulse leading-tight">Safe deposit overdue</p>
                    )}
                  </div>
                </div>

                <button
                  onClick={handleLogout}
                  className="hidden lg:inline-flex px-3.5 py-1.5 bg-white/10 hover:bg-white/20 text-white text-sm font-medium rounded-btn border border-white/10 transition-all"
                >
                  Logout
                </button>

                {/* Hamburger — visible on mobile and tablet */}
                <button
                  onClick={() => setMobileNavOpen(!mobileNavOpen)}
                  className="lg:hidden p-2 rounded-btn text-white/80 hover:text-white hover:bg-white/10 transition-all"
                >
                  {mobileNavOpen ? (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Desktop nav — 1024px and above */}
          <div className="hidden lg:flex lg:items-center lg:gap-1 h-11 -mb-px">
            {navItems.map((item: any) => (
              item.children ? (
                <div key={item.label} className="relative group">
                  <button
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-btn text-[13px] font-medium text-white/70 hover:text-white hover:bg-white/10 transition-all"
                  >
                    {icons[item.label]}
                    {item.label}
                    <svg className="w-3 h-3 opacity-50 group-hover:opacity-100 transition-all group-hover:translate-y-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  <div className="absolute left-0 pt-2 w-56 rounded-card invisible opacity-0 group-hover:visible group-hover:opacity-100 transition-all duration-200 z-50">
                  <div className="rounded-card glass-card-static border border-surface-border overflow-hidden dropdown-enter">
                    <div className="py-1">
                      {item.children.map((child: any) => (
                        child.disabled ? (
                          <span
                            key={child.path}
                            className="block px-4 py-2.5 text-sm text-content-secondary/40 border-l-2 border-transparent cursor-not-allowed select-none"
                            title="Coming soon"
                          >
                            {child.label}
                            <span className="ml-2 text-[10px] font-medium bg-white/5 px-1.5 py-0.5 rounded">Soon</span>
                          </span>
                        ) : (
                          <Link
                            key={child.path}
                            href={child.path}
                            className={`block px-4 py-2.5 text-sm transition-all ${
                              isActive(child.path)
                                ? 'bg-action-primary/10 text-action-primary font-medium border-l-2 border-action-primary'
                                : 'text-content-primary hover:bg-white/5 border-l-2 border-transparent'
                            }`}
                          >
                            {child.label}
                          </Link>
                        )
                      ))}
                    </div>
                  </div>
                  </div>
                </div>
              ) : (
                <Link
                  key={item.path}
                  href={item.path}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-btn text-[13px] font-medium transition-all ${
                    isActive(item.path)
                      ? 'bg-white/20 text-white'
                      : 'text-white/70 hover:text-white hover:bg-white/10'
                  }`}
                >
                  {icons[item.label]}
                  {item.label}
                </Link>
              )
            ))}
          </div>
        </div>
      </nav>

      {/* Mobile / Tablet Drawer */}
      {mobileNavOpen && (
        <div className="lg:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            onClick={() => setMobileNavOpen(false)}
          />
          {/* Drawer panel */}
          <div className="fixed inset-y-0 left-0 z-50 flex flex-col w-72 max-w-[85vw] bg-surface-card shadow-2xl">
            {/* User header */}
            {user && (
              <div className="flex items-center justify-between px-4 py-4 border-b border-surface-border bg-action-primary/5 shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-action-primary/20 flex items-center justify-center text-base font-bold text-action-primary shrink-0">
                    {user.full_name?.charAt(0)?.toUpperCase() || 'U'}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-content-primary truncate">{user.full_name}</p>
                    <p className="text-xs text-content-secondary">
                      {user.role === 'user' && 'Attendant'}
                      {user.role === 'supervisor' && 'Supervisor'}
                      {user.role === 'manager' && 'Manager'}
                      {user.role === 'owner' && 'Owner'}
                    </p>
                    {depositOverdue && (
                      <p className="text-[10px] text-status-warning font-semibold animate-pulse">Safe deposit overdue</p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setMobileNavOpen(false)}
                  className="p-2 rounded-btn text-content-secondary hover:text-content-primary hover:bg-surface-bg shrink-0"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}

            {/* Nav items */}
            <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
              {navItems.map((item: any) => (
                item.children ? (
                  <div key={item.label}>
                    <button
                      onClick={() => toggleMenu(item.label)}
                      className="w-full flex justify-between items-center px-3 py-3 rounded-btn text-sm font-medium text-content-primary hover:bg-surface-bg transition-colors min-h-[48px]"
                    >
                      <span className="flex items-center gap-2.5">
                        {icons[item.label]}
                        {item.label}
                      </span>
                      <svg className={`w-4 h-4 text-content-secondary transition-transform shrink-0 ${openMenus.includes(item.label) ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {openMenus.includes(item.label) && (
                      <div className="pl-9 space-y-0.5 mb-1">
                        {item.children.map((child: any) => (
                          child.disabled ? (
                            <span
                              key={child.path}
                              className="flex items-center px-3 py-2.5 rounded-btn text-sm text-content-secondary/40 cursor-not-allowed select-none"
                            >
                              {child.label}
                              <span className="ml-2 text-[10px] font-medium bg-surface-bg px-1.5 py-0.5 rounded">Soon</span>
                            </span>
                          ) : (
                            <Link
                              key={child.path}
                              href={child.path}
                              className={`flex items-center px-3 py-2.5 rounded-btn text-sm transition-all min-h-[44px] ${
                                isActive(child.path)
                                  ? 'bg-action-primary/10 text-action-primary font-medium'
                                  : 'text-content-secondary hover:text-content-primary hover:bg-surface-bg'
                              }`}
                            >
                              {child.label}
                            </Link>
                          )
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <Link
                    key={item.path}
                    href={item.path}
                    className={`flex items-center gap-2.5 px-3 py-3 rounded-btn text-sm font-medium transition-all min-h-[48px] ${
                      isActive(item.path)
                        ? 'bg-action-primary/10 text-action-primary'
                        : 'text-content-primary hover:bg-surface-bg'
                    }`}
                  >
                    {icons[item.label]}
                    {item.label}
                  </Link>
                )
              ))}
            </nav>

            {/* Drawer footer: station selector + dark mode + logout */}
            <div className="shrink-0 px-3 py-3 border-t border-surface-border space-y-2">
              {user?.role === 'owner' && stations.length > 0 && (
                <select
                  value={activeStationId}
                  onChange={(e) => handleStationChange(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm rounded-btn border border-surface-border bg-surface-bg text-content-primary focus:outline-none focus:ring-2 focus:ring-action-primary"
                >
                  {stations.map((s: any) => (
                    <option key={s.station_id} value={s.station_id}>{s.name}</option>
                  ))}
                </select>
              )}
              <div className="flex items-center gap-2">
                <button
                  onClick={toggleDark}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-btn border border-surface-border text-sm text-content-secondary hover:bg-surface-bg transition-colors"
                >
                  {isDark ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                    </svg>
                  )}
                  {isDark ? 'Light mode' : 'Dark mode'}
                </button>
                <button
                  onClick={handleLogout}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-btn border border-surface-border text-sm text-status-error hover:bg-status-error-light transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  Logout
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 w-full relative">
        {children}
      </main>

      <Footer userRole={user?.role} />
    </div>
  )
}
