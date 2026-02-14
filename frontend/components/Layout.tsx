import Link from 'next/link'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { useTheme } from '../contexts/ThemeContext'
import { authFetch, BASE } from '../lib/api'
import Footer from './Footer'

export default function Layout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const { theme, isDark, toggleDark } = useTheme()
  const [stations, setStations] = useState<any[]>([])
  const [activeStationId, setActiveStationId] = useState<string>('ST001')

  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (userData) {
      const parsed = JSON.parse(userData)
      setUser(parsed)
      setActiveStationId(localStorage.getItem('stationId') || parsed.station_id || 'ST001')
    } else if (router.pathname !== '/login') {
      router.push('/login')
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

  const handleStationChange = (stationId: string) => {
    setActiveStationId(stationId)
    localStorage.setItem('stationId', stationId)
    router.reload()
  }

  const handleLogout = () => {
    localStorage.removeItem('accessToken')
    localStorage.removeItem('user')
    localStorage.removeItem('stationId')
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
            <h1 className="text-xl font-bold text-header-text">Fuel Management</h1>

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
