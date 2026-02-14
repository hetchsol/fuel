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

      // Redirect to dashboard
      router.push('/')
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
            <h1 className="text-3xl font-bold text-content-primary">⛽ Fuel Management</h1>
            <p className="text-content-secondary mt-2">Sign in to your account</p>
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
