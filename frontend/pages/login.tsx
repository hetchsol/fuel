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
    <div className="flex flex-col items-center mb-6">
      {/* Nozzle */}
      <svg width="120" height="70" viewBox="0 0 120 75" fill="none" xmlns="http://www.w3.org/2000/svg" className="drop-shadow-lg">
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
      <div className="bg-[#0A1929] border-2 border-[#1E3A5F] rounded-xl px-1.5 py-2 flex items-center gap-[2px] shadow-lg">
        {display.split('').map((char, i) => (
          <div key={i} className={char === '.' ? 'flex items-end pb-1' : ''}>
            {char === '.' ? (
              <span className="text-[#F59E0B] text-lg font-bold leading-none">.</span>
            ) : (
              <div className="bg-[#0F2A4A] border border-[#1E3A5F] rounded-lg w-7 h-10 flex items-center justify-center overflow-hidden">
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

      localStorage.setItem('accessToken', data.access_token)
      localStorage.setItem('user', JSON.stringify(data.user))
      localStorage.setItem('stationId', data.user.station_id || 'ST001')
      localStorage.setItem('tokenSetAt', String(Date.now()))

      const secure = window.location.protocol === 'https:' ? '; Secure' : ''
      document.cookie = `accessToken=${data.access_token}; path=/; SameSite=Strict${secure}`
      document.cookie = `user=${encodeURIComponent(JSON.stringify(data.user))}; path=/; SameSite=Strict${secure}`

      // Redirect to initialization screen if first-time owner login
      if (data.needs_setup) {
        document.cookie = `needsSetup=1; path=/; SameSite=Strict${secure}`
        router.push('/initializing')
      } else {
        const redirect = typeof router.query.redirect === 'string' ? router.query.redirect : '/'
        router.push(redirect)
      }
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
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#0A3D7A] via-[#0F2847] to-[#0A1B30]" />

      {/* Floating orbs */}
      <div className="absolute top-[20%] left-[15%] w-64 h-64 bg-action-primary/10 rounded-full blur-3xl animate-float" />
      <div className="absolute bottom-[20%] right-[10%] w-80 h-80 bg-action-primary/5 rounded-full blur-3xl animate-float" style={{ animationDelay: '1.5s' }} />
      <div className="absolute top-[60%] left-[60%] w-48 h-48 bg-status-success/5 rounded-full blur-3xl animate-float" style={{ animationDelay: '3s' }} />

      {/* Grid pattern overlay */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
          backgroundSize: '60px 60px',
        }}
      />

      <div className="max-w-md w-full relative z-10 animate-scale-in">
        <div className="glass-card-static p-8 border border-white/10 relative overflow-hidden">
          {/* Top accent line */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-action-primary via-action-primary-hover to-status-success" />

          {loading && (
            <div className="absolute inset-0 bg-surface-card/90 backdrop-blur-sm rounded-card flex items-center justify-center z-10">
              <LoadingSpinner text="Signing in..." />
            </div>
          )}

          <div className="text-center mb-8">
            <FuelMeter />
            <h1 className="text-3xl font-extrabold text-content-primary tracking-tight">NextStop</h1>
            <p className="text-content-secondary mt-1 text-sm">Fuel Management System</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-content-secondary mb-1.5">
                Username
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="w-4 h-4 text-content-secondary/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <input
                  type="text"
                  value={credentials.username}
                  onChange={(e) => setCredentials({ ...credentials, username: e.target.value })}
                  className="w-full pl-10 pr-4 py-3 border border-surface-border rounded-input focus:outline-none focus:ring-2 focus:ring-action-primary focus:border-action-primary"
                  placeholder="Enter your username"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-content-secondary mb-1.5">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="w-4 h-4 text-content-secondary/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <input
                  type="password"
                  value={credentials.password}
                  onChange={(e) => setCredentials({ ...credentials, password: e.target.value })}
                  className="w-full pl-10 pr-4 py-3 border border-surface-border rounded-input focus:outline-none focus:ring-2 focus:ring-action-primary focus:border-action-primary"
                  placeholder="Enter your password"
                  required
                />
              </div>
            </div>

            {error && (
              <div className="p-3 bg-status-error-light border border-status-error/30 rounded-btn animate-scale-in">
                <p className="text-sm text-status-error flex items-center gap-2">
                  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {error}
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full px-4 py-3 bg-action-primary text-white font-semibold rounded-btn hover:bg-action-primary-hover focus:outline-none focus:ring-2 focus:ring-action-primary focus:ring-offset-2 focus:ring-offset-surface-card disabled:opacity-50 disabled:cursor-not-allowed shadow-glow-blue"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          {/* Demo Credentials */}
          {process.env.NEXT_PUBLIC_DEMO_MODE === 'true' && (
          <div className="mt-8 pt-6 border-t border-white/[0.06]">
            <p className="text-xs text-content-secondary/60 mb-3 text-center font-medium uppercase tracking-wider">Default Account</p>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => handleDemoLogin('owner1', 'owner123')}
                className="w-full px-4 py-2.5 bg-category-a/10 border border-category-a-border/20 text-category-a rounded-btn hover:bg-category-a/15 text-sm font-medium transition-all flex items-center gap-2 justify-center"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
                Owner: owner1 / owner123
              </button>
            </div>
          </div>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-white/30">
          Powered by NextStop Fuel Management v1.0
        </p>
      </div>
    </div>
  )
}
