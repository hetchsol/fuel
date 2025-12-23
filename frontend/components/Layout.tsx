import Link from 'next/link'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'

export default function Layout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)

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
        { path: '/readings', label: 'Readings', roles: ['user', 'supervisor', 'owner'] },
        { path: '/shifts', label: 'Shifts', roles: ['user', 'supervisor', 'owner'] },
        { path: '/sales', label: 'Sales', roles: ['supervisor', 'owner'] },
        { path: '/validated-readings', label: 'Enter Readings', roles: ['supervisor', 'owner'] },
      ]
    },
    {
      label: 'Station Setup',
      roles: ['user', 'supervisor', 'owner'],
      children: [
        { path: '/pumps', label: 'Pumps', roles: ['user', 'supervisor', 'owner'] },
        { path: '/nozzles', label: 'Nozzles', roles: ['user', 'supervisor', 'owner'] },
        { path: '/inventory', label: 'Tanks', roles: ['supervisor', 'owner'] },
      ]
    },
    {
      label: 'Financial',
      roles: ['supervisor', 'owner'],
      children: [
        { path: '/accounts', label: 'Accounts', roles: ['supervisor', 'owner'] },
        { path: '/reconciliation', label: 'Reconciliation', roles: ['supervisor', 'owner'] },
      ]
    },
    {
      label: 'Inventory',
      roles: ['supervisor', 'owner'],
      children: [
        { path: '/stock-movement', label: 'Stock Movement', roles: ['supervisor', 'owner'] },
      ]
    },
    {
      label: 'Reports',
      roles: ['supervisor', 'owner'],
      children: [
        { path: '/daily-sales-report', label: 'Daily Sales Report', roles: ['supervisor', 'owner'] },
        { path: '/reports', label: 'Date Range Reports', roles: ['supervisor', 'owner'] },
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
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Top row: App name and user info */}
          <div className="flex justify-between items-center h-16 border-b border-gray-200">
            <h1 className="text-xl font-bold text-gray-900">⛽ Fuel Management</h1>

            {/* User Info and Logout */}
            {user && (
              <div className="flex items-center space-x-4">
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-medium text-gray-900">{user.full_name}</p>
                  <p className="text-xs text-gray-500">
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
                    className="inline-flex items-center px-1 border-b-2 border-transparent text-sm font-medium text-gray-500 hover:border-gray-300 hover:text-gray-700 h-12"
                  >
                    {item.label} ▾
                  </button>
                  <div className="absolute left-0 mt-0 w-48 bg-white shadow-lg rounded-md border border-gray-200 hidden group-hover:block z-50">
                    {item.children.map((child: any) => (
                      <Link
                        key={child.path}
                        href={child.path}
                        className={`block px-4 py-2 text-sm ${
                          isActive(child.path)
                            ? 'bg-blue-50 text-blue-700 font-medium'
                            : 'text-gray-700 hover:bg-gray-50'
                        }`}
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
                  className={`inline-flex items-center px-1 border-b-2 text-sm font-medium ${
                    isActive(item.path)
                      ? 'border-blue-500 text-gray-900'
                      : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
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
      <div className="sm:hidden bg-white border-b">
        <div className="px-2 pt-2 pb-3 space-y-1">
          {navItems.map((item: any) => (
            item.children ? (
              <div key={item.label}>
                <button
                  onClick={() => toggleMenu(item.label)}
                  className="w-full flex justify-between items-center px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:bg-gray-50"
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
                        className={`block px-3 py-2 rounded-md text-sm ${
                          isActive(child.path)
                            ? 'bg-blue-50 text-blue-700 font-medium'
                            : 'text-gray-600 hover:bg-gray-50'
                        }`}
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
                className={`block px-3 py-2 rounded-md text-base font-medium ${
                  isActive(item.path)
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                {item.label}
              </Link>
            )
          ))}
          {user && (
            <div className="px-3 py-2 border-t mt-2 pt-2">
              <p className="text-sm font-medium text-gray-900">{user.full_name}</p>
              <p className="text-xs text-gray-500">
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
