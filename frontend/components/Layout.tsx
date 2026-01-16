import Link from 'next/link'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { useTheme } from '../contexts/ThemeContext'

export default function Layout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const { theme } = useTheme()

  useEffect(() => {
    // Check if user is logged in
    const userData = localStorage.getItem('user')
    if (userData) {
      setUser(JSON.parse(userData))
    } else if (router.pathname !== '/login') {
      router.push('/login')
    }
    setLoading(false)
  }, [router.pathname])

  const handleLogout = () => {
    localStorage.removeItem('accessToken')
    localStorage.removeItem('user')
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

  // Define navigation items with role requirements and nested structure
  const allNavItems = [
    { path: '/', label: 'Dashboard', roles: ['user', 'supervisor', 'owner'] },
    {
      label: 'Operations',
      roles: ['user', 'supervisor', 'owner'],
      children: [
        { path: '/daily-tank-reading', label: 'Daily Tank Reading', roles: ['supervisor', 'owner'] },
        { path: '/stock-movement', label: 'Deliveries', roles: ['supervisor', 'owner'] },
        { path: '/readings', label: 'Readings', roles: ['user', 'supervisor', 'owner'] },
        { path: '/shifts', label: 'Shifts', roles: ['user', 'supervisor', 'owner'] },
        { path: '/sales', label: 'Sales', roles: ['supervisor', 'owner'] },
        { path: '/validated-readings', label: 'Enter Readings', roles: ['supervisor', 'owner'] },
      ]
    },
    {
      label: 'Inventory',
      roles: ['supervisor', 'owner'],
      children: [
        { path: '/inventory', label: 'Tanks', roles: ['supervisor', 'owner'] },
        { path: '/tank-movement', label: 'Tank Movement', roles: ['supervisor', 'owner'] },
      ]
    },
    {
      label: 'Station Setup',
      roles: ['user', 'supervisor', 'owner'],
      children: [
        { path: '/pumps', label: 'Pumps', roles: ['user', 'supervisor', 'owner'] },
        { path: '/nozzles', label: 'Nozzles', roles: ['user', 'supervisor', 'owner'] },
      ]
    },
    {
      label: 'Financial',
      roles: ['supervisor', 'owner'],
      children: [
        { path: '/accounts', label: 'Accounts', roles: ['supervisor', 'owner'] },
        { path: '/reconciliation', label: 'Shift Reconciliation', roles: ['supervisor', 'owner'] },
        { path: '/three-way-reconciliation', label: 'Three-Way Reconciliation', roles: ['supervisor', 'owner'] },
      ]
    },
    {
      label: 'Reports',
      roles: ['supervisor', 'owner'],
      children: [
        { path: '/tank-readings-report', label: 'Tank Readings Report', roles: ['supervisor', 'owner'] },
        { path: '/daily-sales-report', label: 'Daily Sales Report', roles: ['supervisor', 'owner'] },
        { path: '/reports', label: 'Date Range Reports', roles: ['supervisor', 'owner'] },
        { path: '/tank-analysis', label: 'Tank Analysis', roles: ['supervisor', 'owner'] },
        { path: '/advanced-reports', label: 'Advanced Reports', roles: ['supervisor', 'owner'] },
        { path: '/readings-monitor', label: 'Readings Monitor', roles: ['owner'] },
      ]
    },
    {
      label: 'Settings',
      roles: ['owner'],
      children: [
        { path: '/settings', label: 'General', roles: ['owner'] },
        { path: '/infrastructure', label: 'Infrastructure', roles: ['owner'] },
        { path: '/users', label: 'Users', roles: ['owner'] },
      ]
    },
  ]

  // Filter navigation items based on user role
  const navItems = user
    ? allNavItems.filter(item => {
        if (item.roles.includes(user.role)) {
          if (item.children) {
            // Filter children based on role
            item.children = item.children.filter(child => child.roles.includes(user.role))
            return item.children.length > 0
          }
          return true
        }
        return false
      })
    : []

  // Don't show navigation on login page
  if (router.pathname === '/login' || loading) {
    return <>{children}</>
  }

  return (
    <div className="min-h-screen transition-colors duration-300" style={{ backgroundColor: theme.background }}>
      <nav className="shadow-sm transition-colors duration-300" style={{ backgroundColor: theme.cardBg, borderBottomColor: theme.border, borderBottomWidth: '1px' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Top row: App name and user info */}
          <div className="flex justify-between items-center h-16 transition-colors duration-300" style={{ borderBottomColor: theme.border, borderBottomWidth: '1px' }}>
            <h1 className="text-xl font-bold transition-colors duration-300" style={{ color: theme.textPrimary }}>⛽ Fuel Management</h1>

            {/* User Info */}
            {user && (
              <div className="flex items-center space-x-4">
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-medium transition-colors duration-300" style={{ color: theme.textPrimary }}>{user.full_name}</p>
                  <p className="text-xs transition-colors duration-300" style={{ color: theme.textSecondary }}>
                    {user.role === 'user' && '👤 User'}
                    {user.role === 'supervisor' && '👔 Supervisor'}
                    {user.role === 'owner' && '👑 Owner'}
                  </p>
                </div>
                <button
                  onClick={handleLogout}
                  className="px-4 py-2 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  Logout
                </button>
              </div>
            )}
          </div>

          {/* Bottom row: Navigation menu */}
          <div className="hidden sm:flex sm:space-x-8 h-12">
            {navItems.map((item: any) => (
              item.children ? (
                <div key={item.label} className="relative group">
                  <button
                    className="inline-flex items-center px-1 border-b-2 text-sm font-medium h-12 transition-colors duration-300"
                    style={{
                      borderColor: 'transparent',
                      color: theme.textSecondary
                    }}
                  >
                    {item.label} ▾
                  </button>
                  <div className="absolute left-0 mt-0 w-48 shadow-lg rounded-md hidden group-hover:block z-50 transition-colors duration-300" style={{ backgroundColor: theme.cardBg, borderColor: theme.border, borderWidth: '1px' }}>
                    {item.children.map((child: any) => (
                      <Link
                        key={child.path}
                        href={child.path}
                        className="block px-4 py-2 text-sm transition-colors duration-300"
                        style={{
                          backgroundColor: isActive(child.path) ? theme.primaryLight : 'transparent',
                          color: isActive(child.path) ? theme.primary : theme.textPrimary,
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
                  className="inline-flex items-center px-1 border-b-2 text-sm font-medium transition-colors duration-300"
                  style={{
                    borderColor: isActive(item.path) ? theme.primary : 'transparent',
                    color: isActive(item.path) ? theme.primary : theme.textSecondary
                  }}
                >
                  {item.label}
                </Link>
              )
            ))}
          </div>
        </div>
      </nav>

      {/* Mobile Navigation */}
      <div className="sm:hidden transition-colors duration-300" style={{ backgroundColor: theme.cardBg, borderBottomColor: theme.border, borderBottomWidth: '1px' }}>
        <div className="px-2 pt-2 pb-3 space-y-1">
          {navItems.map((item: any) => (
            item.children ? (
              <div key={item.label}>
                <button
                  onClick={() => toggleMenu(item.label)}
                  className="w-full flex justify-between items-center px-3 py-2 rounded-md text-base font-medium transition-colors duration-300"
                  style={{ color: theme.textPrimary }}
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
                        className="block px-3 py-2 rounded-md text-sm transition-colors duration-300"
                        style={{
                          backgroundColor: isActive(child.path) ? theme.primaryLight : 'transparent',
                          color: isActive(child.path) ? theme.primary : theme.textSecondary,
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
                className="block px-3 py-2 rounded-md text-base font-medium transition-colors duration-300"
                style={{
                  backgroundColor: isActive(item.path) ? theme.primaryLight : 'transparent',
                  color: isActive(item.path) ? theme.primary : theme.textPrimary
                }}
              >
                {item.label}
              </Link>
            )
          ))}
          {user && (
            <div className="px-3 py-2 mt-2 pt-2 transition-colors duration-300" style={{ borderTopColor: theme.border, borderTopWidth: '1px' }}>
              <p className="text-sm font-medium transition-colors duration-300" style={{ color: theme.textPrimary }}>{user.full_name}</p>
              <p className="text-xs transition-colors duration-300" style={{ color: theme.textSecondary }}>
                {user.role === 'user' && '👤 User'}
                {user.role === 'supervisor' && '👔 Supervisor'}
                {user.role === 'owner' && '👑 Owner'}
              </p>
            </div>
          )}
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  )
}
