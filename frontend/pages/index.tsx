import { useState, useEffect } from 'react'
import useSWR from 'swr'
import { getDaily, getFlags, getTankLevels } from '../lib/api'
import TankCard from '../components/TankCard'
import LoadingSpinner from '../components/LoadingSpinner'

export default function Home() {
  const today = new Date().toISOString().split('T')[0]
  const [date, setDate] = useState(today)
  const [userRole, setUserRole] = useState<string>('')
  const [savingDips, setSavingDips] = useState(false)

  // Get user role from localStorage
  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (userData) {
      const user = JSON.parse(userData)
      setUserRole(user.role || '')
    }
  }, [])

  const { data: daily, error: dailyError } = useSWR(['daily', date], () => getDaily(date))
  const { data: flags, error: flagsError } = useSWR('flags', () => getFlags(10))
  const { data: tanks, error: tanksError, mutate: mutateTanks } = useSWR('tanks', getTankLevels, {
    refreshInterval: 5000, // Auto-refresh every 5 seconds for real-time updates
  })

  // Check if user has supervisor or owner role
  const canEditDipReadings = userRole === 'supervisor' || userRole === 'owner'

  // Find specific tanks
  const dieselTank = tanks?.find((t: any) => t.fuel_type === 'Diesel')
  const petrolTank = tanks?.find((t: any) => t.fuel_type === 'Petrol')

  const handleSaveDipReadings = async (tankId: string, fuelType: string, dipReadings: any) => {
    setSavingDips(true)
    try {
      const userData = localStorage.getItem('user')
      const user = userData ? JSON.parse(userData).full_name : 'Unknown'

      const BASE = '/api/v1'
      const token = localStorage.getItem('accessToken')
      const stationId = localStorage.getItem('stationId')
      const res = await fetch(`${BASE}/tanks/dip-reading/${tankId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(stationId ? { 'X-Station-Id': stationId } : {}),
        },
        body: JSON.stringify({
          opening_dip: dipReadings.openingDip ? parseFloat(dipReadings.openingDip) : null,
          closing_dip: dipReadings.closingDip ? parseFloat(dipReadings.closingDip) : null,
          user: user
        })
      })

      if (res.ok) {
        const data = await res.json()
        mutateTanks() // Refresh tank levels
        alert(`${fuelType} Tank Dip Readings Saved!\nTank level updated to ${data.current_level.toLocaleString()} L`)
      } else {
        alert('Failed to save dip readings')
      }
    } catch (err) {
      console.error('Error saving dip readings:', err)
      alert('Error saving dip readings')
    } finally {
      setSavingDips(false)
    }
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-2 text-sm text-gray-600">Overview of daily operations and alerts</p>
      </div>

      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Select Date
        </label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="mt-1 block w-full sm:w-auto px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      {/* Real-time Fuel Tank Levels */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <TankCard
          fuelType="Diesel"
          tank={dieselTank}
          tanksError={tanksError}
          canEditDipReadings={canEditDipReadings}
          userRole={userRole}
          onSaveDipReadings={handleSaveDipReadings}
          savingDips={savingDips}
          mutateTanks={mutateTanks}
        />
        <TankCard
          fuelType="Petrol"
          tank={petrolTank}
          tanksError={tanksError}
          canEditDipReadings={canEditDipReadings}
          userRole={userRole}
          onSaveDipReadings={handleSaveDipReadings}
          savingDips={savingDips}
          mutateTanks={mutateTanks}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Daily Summary</h2>
          {dailyError && (
            <div className="text-red-600 text-sm">Failed to load daily summary</div>
          )}
          {!dailyError && !daily && (
            <LoadingSpinner text="Loading..." />
          )}
          {daily && (
            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-600">Date</p>
                <p className="text-lg font-medium">{daily.date || 'N/A'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Volume Records</p>
                <p className="text-lg font-medium">{daily.volumes?.length || 0}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Cash Variance Records</p>
                <p className="text-lg font-medium">{daily.cash_variance?.length || 0}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Flags</p>
                <p className="text-lg font-medium">{daily.flags?.length || 0}</p>
              </div>
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Recent Discrepancies</h2>
          {flagsError && (
            <div className="text-red-600 text-sm">Failed to load discrepancies</div>
          )}
          {!flagsError && !flags && (
            <LoadingSpinner text="Loading..." />
          )}
          {flags && (
            <div>
              {flags.length === 0 ? (
                <div className="text-gray-500 text-sm">No discrepancies found</div>
              ) : (
                <ul className="space-y-2">
                  {flags.map((flag: any, idx: number) => (
                    <li key={idx} className="p-3 bg-red-50 border border-red-200 rounded">
                      <p className="text-sm font-medium text-red-900">{flag.description}</p>
                      <p className="text-xs text-red-600 mt-1">{flag.timestamp}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="bg-blue-50 rounded-lg p-6 border border-blue-100">
          <h3 className="text-sm font-medium text-blue-900 mb-2">Total Nozzles</h3>
          <p className="text-3xl font-bold text-blue-700">-</p>
          <p className="text-xs text-blue-600 mt-1">Active monitoring</p>
        </div>
        <div className="bg-green-50 rounded-lg p-6 border border-green-100">
          <h3 className="text-sm font-medium text-green-900 mb-2">Today's Sales</h3>
          <p className="text-3xl font-bold text-green-700">-</p>
          <p className="text-xs text-green-600 mt-1">Total transactions</p>
        </div>
        <div className="bg-yellow-50 rounded-lg p-6 border border-yellow-100">
          <h3 className="text-sm font-medium text-yellow-900 mb-2">Alerts</h3>
          <p className="text-3xl font-bold text-yellow-700">{flags?.length || 0}</p>
          <p className="text-xs text-yellow-600 mt-1">Requires attention</p>
        </div>
      </div>
    </div>
  )
}
