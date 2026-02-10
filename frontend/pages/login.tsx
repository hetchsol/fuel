import { useState } from 'react'
import { useRouter } from 'next/router'

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000/api/v1'

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
    <div className="min-h-screen bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-lg shadow-2xl p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900">⛽ Fuel Management</h1>
            <p className="text-gray-600 mt-2">Sign in to your account</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Username
              </label>
              <input
                type="text"
                value={credentials.username}
                onChange={(e) => setCredentials({ ...credentials, username: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter your username"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <input
                type="password"
                value={credentials.password}
                onChange={(e) => setCredentials({ ...credentials, password: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter your password"
                required
              />
            </div>

            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-md">
                <p className="text-sm text-red-700">✗ {error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full px-4 py-3 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          {/* Demo Credentials */}
          <div className="mt-8 pt-8 border-t border-gray-200">
            <p className="text-sm text-gray-600 mb-4 text-center">Demo Accounts:</p>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => handleDemoLogin('user1', 'password123')}
                className="w-full px-4 py-2 bg-green-50 border border-green-200 text-green-700 rounded-md hover:bg-green-100 text-sm font-medium"
              >
                👤 User: user1 / password123
              </button>
              <button
                type="button"
                onClick={() => handleDemoLogin('supervisor1', 'super123')}
                className="w-full px-4 py-2 bg-yellow-50 border border-yellow-200 text-yellow-700 rounded-md hover:bg-yellow-100 text-sm font-medium"
              >
                👔 Supervisor: supervisor1 / super123
              </button>
              <button
                type="button"
                onClick={() => handleDemoLogin('owner1', 'owner123')}
                className="w-full px-4 py-2 bg-purple-50 border border-purple-200 text-purple-700 rounded-md hover:bg-purple-100 text-sm font-medium"
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
