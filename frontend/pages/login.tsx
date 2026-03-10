import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import LoadingSpinner from '../components/LoadingSpinner'

function FuelMeter() {
  const [liters, setLiters] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setLiters(prev => {
        const next = prev + 0.07
        return next >= 999.99 ? 0 : parseFloat(next.toFixed(2))
      })
    }, 50)
    return () => clearInterval(interval)
  }, [])

  const display = liters.toFixed(2).padStart(6, '0')

  return (
    <div className="flex flex-col items-center mb-4">
      {/* Nozzle */}
      <svg width="120" height="70" viewBox="0 0 120 75" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Hose */}
        <path d="M20 55 Q5 55 5 42 Q5 28 15 25" stroke="#374151" strokeWidth="6" strokeLinecap="round" fill="none" />
        {/* Nozzle handle */}
        <rect x="20" y="38" width="45" height="14" rx="4" fill="#4B5563" />
        <rect x="25" y="41" width="35" height="8" rx="2" fill="#6B7280" />
        {/* Trigger */}
        <path d="M30 52 L25 63 L33 63 L35 52 Z" fill="#4B5563" />
        {/* Nozzle arm */}
        <path d="M55 35 L78 12 L83 12 L83 20 L62 41 Z" fill="#6B7280" />
        <path d="M78 12 L83 12 L83 20 L78 20 Z" fill="#4B5563" />
        {/* Spout */}
        <rect x="81" y="10" width="24" height="12" rx="2" fill="#4B5563" />
        <rect x="103" y="12" width="8" height="8" rx="1" fill="#374151" />
        {/* Fuel drops */}
        <circle cx="111" cy="24" r="2" fill="#3B82F6">
          <animate attributeName="cy" values="24;45;65" dur="0.9s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="1;0.6;0" dur="0.9s" repeatCount="indefinite" />
        </circle>
        <circle cx="111" cy="24" r="1.5" fill="#60A5FA">
          <animate attributeName="cy" values="24;45;65" dur="0.9s" begin="0.45s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="1;0.6;0" dur="0.9s" begin="0.45s" repeatCount="indefinite" />
        </circle>
      </svg>

      {/* Numeric Odometer Display */}
      <div className="bg-[#0A1929] border-2 border-[#1E3A5F] rounded-lg px-1 py-2 flex items-center gap-[2px] shadow-lg">
        {display.split('').map((char, i) => (
          <div key={i} className={char === '.' ? 'flex items-end pb-1' : ''}>
            {char === '.' ? (
              <span className="text-[#F59E0B] text-lg font-bold leading-none">.</span>
            ) : (
              <div className="bg-[#0F2A4A] border border-[#1E3A5F] rounded w-7 h-10 flex items-center justify-center overflow-hidden">
                <span
                  className="text-[#22D3EE] text-xl font-mono font-bold tabular-nums transition-all duration-150"
                  style={{ textShadow: '0 0 8px rgba(34,211,238,0.5)' }}
                >
                  {char}
                </span>
              </div>
            )}
          </div>
        ))}
        <span className="text-[#6B7280] text-[10px] font-mono ml-1 self-end pb-2">L</span>
      </div>
    </div>
  )
}

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
      // Retry with backoff for rate limits and cold starts (Render free tier)
      let res: Response | null = null
      for (let attempt = 0; attempt < 3; attempt++) {
        res = await fetch(`${BASE}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(credentials),
        })

        const retryable = res.status === 429 || res.status === 502 || res.status === 503 || res.status === 504
        if (!retryable || attempt === 2) break

        // Wait before retrying: use Retry-After header or exponential backoff (2s, 4s)
        const retryAfter = res.headers.get('retry-after')
        const delay = retryAfter ? parseInt(retryAfter, 10) * 1000 : (attempt + 1) * 2000
        setError(`Server busy, retrying in ${Math.round(delay / 1000)}s...`)
        await new Promise(r => setTimeout(r, delay))
      }

      if (!res) throw new Error('Login failed')

      if (res.status === 429) {
        throw new Error('Server is busy. Please wait a moment and try again.')
      }

      if (res.status === 502 || res.status === 503 || res.status === 504) {
        throw new Error('The server is starting up. Please wait a moment and try again.')
      }

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
            <FuelMeter />
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
