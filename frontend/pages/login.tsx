import { useState } from 'react'
import { useRouter } from 'next/router'
import LoadingSpinner from '../components/LoadingSpinner'

const BASE = '/api/v1'

export default function Login() {
  const router = useRouter()
  const [credentials, setCredentials] = useState({
    username: '',
    password: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const res = await fetch(`${BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      })

      const contentType = res.headers.get('content-type') || ''
      if (!contentType.includes('application/json')) {
        throw new Error('Cannot reach the API server. Please try again in a moment.')
      }

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.detail || 'Login failed')
      }

      const data = await res.json()

      // Store user data and token in localStorage
      localStorage.setItem('accessToken', data.access_token)
      localStorage.setItem('user', JSON.stringify(data.user))
      localStorage.setItem('stationId', data.user.station_id || 'ST001')

      // Set cookies for server-side middleware route protection
      document.cookie = `accessToken=${data.access_token}; path=/; SameSite=Lax`
      document.cookie = `user=${encodeURIComponent(JSON.stringify(data.user))}; path=/; SameSite=Lax`

      // Redirect to original page or dashboard
      const redirect = typeof router.query.redirect === 'string' ? router.query.redirect : '/'
      router.push(redirect)
    } catch (err: any) {
      setError(err.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  const handleDemoLogin = (username: string, password: string) => {
    setCredentials({ username, password })
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-header-bg to-action-primary-hover flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="bg-surface-card rounded-lg shadow-2xl p-8 relative">
          {loading && (
            <div className="absolute inset-0 bg-surface-card bg-opacity-80 rounded-lg flex items-center justify-center z-10">
              <LoadingSpinner text="Signing in..." />
            </div>
          )}

          <div className="text-center mb-8">
            {/* Nozzle with Filling Meter Animation */}
            <div className="flex justify-center mb-4">
              <svg width="100" height="120" viewBox="0 0 120 140" fill="none" xmlns="http://www.w3.org/2000/svg">
                {/* Nozzle handle */}
                <rect x="25" y="45" width="40" height="14" rx="4" fill="#4B5563" />
                <rect x="30" y="48" width="30" height="8" rx="2" fill="#6B7280" />
                {/* Nozzle body */}
                <path d="M55 42 L75 20 L80 20 L80 28 L62 48 Z" fill="#6B7280" />
                <path d="M75 20 L80 20 L80 28 L75 28 Z" fill="#4B5563" />
                {/* Nozzle spout */}
                <rect x="78" y="18" width="22" height="12" rx="2" fill="#4B5563" />
                <rect x="98" y="20" width="8" height="8" rx="1" fill="#374151" />
                {/* Trigger */}
                <path d="M35 59 L30 70 L38 70 L40 59 Z" fill="#4B5563" />
                {/* Hose */}
                <path d="M25 52 Q10 52 10 65 Q10 80 20 85" stroke="#374151" strokeWidth="6" strokeLinecap="round" fill="none" />
                {/* Fuel drops from spout */}
                <circle cx="106" cy="32" r="2" fill="#3B82F6">
                  <animate attributeName="cy" values="30;50;70" dur="1s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="1;0.6;0" dur="1s" repeatCount="indefinite" />
                </circle>
                <circle cx="106" cy="32" r="1.5" fill="#60A5FA">
                  <animate attributeName="cy" values="30;50;70" dur="1s" begin="0.5s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="1;0.6;0" dur="1s" begin="0.5s" repeatCount="indefinite" />
                </circle>
                {/* Gauge circle */}
                <circle cx="60" cy="105" r="25" fill="#0A1929" stroke="#1E3A5F" strokeWidth="2" />
                <circle cx="60" cy="105" r="21" fill="none" stroke="#1E3A5F" strokeWidth="3" />
                {/* Gauge fill arc */}
                <circle cx="60" cy="105" r="21" fill="none" stroke="#3B82F6" strokeWidth="3"
                  strokeDasharray="132" strokeDashoffset="132" strokeLinecap="round"
                  transform="rotate(-90 60 105)">
                  <animate attributeName="stroke-dashoffset" values="132;33;132" dur="4s" repeatCount="indefinite" />
                </circle>
                {/* Gauge ticks */}
                <line x1="60" y1="86" x2="60" y2="89" stroke="#4B5563" strokeWidth="1" />
                <line x1="42" y1="93" x2="44" y2="95" stroke="#4B5563" strokeWidth="1" />
                <line x1="39" y1="105" x2="42" y2="105" stroke="#4B5563" strokeWidth="1" />
                <line x1="42" y1="117" x2="44" y2="115" stroke="#4B5563" strokeWidth="1" />
                <line x1="60" y1="124" x2="60" y2="121" stroke="#4B5563" strokeWidth="1" />
                <line x1="78" y1="117" x2="76" y2="115" stroke="#4B5563" strokeWidth="1" />
                <line x1="81" y1="105" x2="78" y2="105" stroke="#4B5563" strokeWidth="1" />
                <line x1="78" y1="93" x2="76" y2="95" stroke="#4B5563" strokeWidth="1" />
                {/* Gauge needle */}
                <line x1="60" y1="105" x2="60" y2="88" stroke="#EF4444" strokeWidth="1.5" strokeLinecap="round">
                  <animateTransform attributeName="transform" type="rotate" values="-90,60,105;90,60,105;-90,60,105" dur="4s" repeatCount="indefinite" />
                </line>
                <circle cx="60" cy="105" r="3" fill="#EF4444" />
                {/* Gauge label */}
                <text x="60" y="118" textAnchor="middle" fill="#60A5FA" fontSize="6" fontFamily="monospace">LITERS</text>
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-content-primary">NextStop</h1>
            <p className="text-content-secondary mt-2">Fuel Management System</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-content-secondary mb-1">
                Username
              </label>
              <input
                type="text"
                value={credentials.username}
                onChange={(e) => setCredentials({ ...credentials, username: e.target.value })}
                className="w-full px-4 py-3 border border-surface-border rounded-md focus:outline-none focus:ring-2 focus:ring-action-primary focus:border-action-primary"
                placeholder="Enter your username"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-content-secondary mb-1">
                Password
              </label>
              <input
                type="password"
                value={credentials.password}
                onChange={(e) => setCredentials({ ...credentials, password: e.target.value })}
                className="w-full px-4 py-3 border border-surface-border rounded-md focus:outline-none focus:ring-2 focus:ring-action-primary focus:border-action-primary"
                placeholder="Enter your password"
                required
              />
            </div>

            {error && (
              <div className="p-4 bg-status-error-light border border-status-error rounded-md">
                <p className="text-sm text-status-error">✗ {error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full px-4 py-3 bg-action-primary text-white font-medium rounded-md hover:bg-action-primary-hover focus:outline-none focus:ring-2 focus:ring-action-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          {/* Demo Credentials */}
          <div className="mt-8 pt-8 border-t border-surface-border">
            <p className="text-sm text-content-secondary mb-4 text-center">Demo Accounts:</p>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => handleDemoLogin('user1', 'password123')}
                className="w-full px-4 py-2 bg-status-success-light border border-status-success text-status-success rounded-md hover:opacity-80 text-sm font-medium"
              >
                👤 User: user1 / password123
              </button>
              <button
                type="button"
                onClick={() => handleDemoLogin('supervisor1', 'super123')}
                className="w-full px-4 py-2 bg-status-pending-light border border-status-warning text-status-warning rounded-md hover:opacity-80 text-sm font-medium"
              >
                👔 Supervisor: supervisor1 / super123
              </button>
              <button
                type="button"
                onClick={() => handleDemoLogin('owner1', 'owner123')}
                className="w-full px-4 py-2 bg-category-a-light border border-category-a-border text-category-a rounded-md hover:opacity-80 text-sm font-medium"
              >
                👑 Owner: owner1 / owner123
              </button>
            </div>
          </div>
        </div>

        <div className="mt-4 text-center">
          <p className="text-sm text-white opacity-80">
            Powered by Fuel Management System v1.0
          </p>
        </div>
      </div>
    </div>
  )
}
