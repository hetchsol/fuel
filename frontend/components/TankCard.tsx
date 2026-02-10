import { useState, useEffect } from 'react'
import { getAuthHeaders } from '../lib/headers'
import LoadingSpinner from './LoadingSpinner'

interface TankCardProps {
  fuelType: 'Diesel' | 'Petrol'
  tank: any
  tanksError: any
  canEditDipReadings: boolean
  userRole: string
  onSaveDipReadings: (tankId: string, fuelType: string, dipReadings: any) => Promise<void>
  savingDips: boolean
  mutateTanks: () => void
}

const TankCard = ({
  fuelType,
  tank,
  tanksError,
  canEditDipReadings,
  userRole,
  onSaveDipReadings,
  savingDips,
  mutateTanks
}: TankCardProps) => {
  const [dipReadings, setDipReadings] = useState({
    openingDip: '',
    closingDip: ''
  })
  const [savedDips, setSavedDips] = useState<any>(null)

  // Color theme based on fuel type
  const colors = fuelType === 'Diesel'
    ? {
        gradient: 'from-purple-50 to-purple-100',
        border: 'border-purple-200',
        title: 'text-purple-900',
        badge: 'text-purple-600 bg-purple-200',
        text: 'text-purple-700',
        boldText: 'text-purple-900',
        lightText: 'text-purple-600',
        mediumText: 'text-purple-800',
        button: 'bg-purple-600 hover:bg-purple-700',
        progressBg: 'bg-purple-200',
        divider: 'border-purple-200',
        sectionBg: 'bg-purple-50',
        sectionBorder: 'border-purple-200',
        inputBorder: 'border-purple-300',
        focusRing: 'focus:ring-purple-500 focus:border-purple-500',
        lightestText: 'text-purple-500',
        sectionDivider: 'border-purple-300',
        badgeBg: 'bg-purple-200 text-purple-800'
      }
    : {
        gradient: 'from-green-50 to-green-100',
        border: 'border-green-200',
        title: 'text-green-900',
        badge: 'text-green-600 bg-green-200',
        text: 'text-green-700',
        boldText: 'text-green-900',
        lightText: 'text-green-600',
        mediumText: 'text-green-800',
        button: 'bg-green-600 hover:bg-green-700',
        progressBg: 'bg-green-200',
        divider: 'border-green-200',
        sectionBg: 'bg-green-50',
        sectionBorder: 'border-green-200',
        inputBorder: 'border-green-300',
        focusRing: 'focus:ring-green-500 focus:border-green-500',
        lightestText: 'text-green-500',
        sectionDivider: 'border-green-300',
        badgeBg: 'bg-green-200 text-green-800'
      }

  const tankId = `TANK-${fuelType.toUpperCase()}`
  const icon = fuelType === 'Diesel' ? '🛢️' : '⛽'

  // Fetch saved dip readings when component mounts
  useEffect(() => {
    if (tank && canEditDipReadings) {
      fetchDipReadings()
    }
  }, [tank, canEditDipReadings])

  const fetchDipReadings = async () => {
    try {
      const BASE = '/api/v1'
      const res = await fetch(`${BASE}/tanks/dip-reading/${tankId}`, {
        headers: getAuthHeaders()
      })
      if (res.ok) {
        const data = await res.json()
        setSavedDips(data)
      }
    } catch (err) {
      console.error('Failed to fetch dip readings:', err)
    }
  }

  const handleSave = async () => {
    await onSaveDipReadings(tankId, fuelType, dipReadings)
    // Refresh saved dips after save
    await fetchDipReadings()
    // Clear input fields
    setDipReadings({ openingDip: '', closingDip: '' })
  }

  return (
    <div className={`bg-gradient-to-br ${colors.gradient} rounded-lg shadow-lg p-6 border-2 ${colors.border}`}>
      <div className="flex items-center justify-between mb-4">
        <h2 className={`text-xl font-bold ${colors.title}`}>{icon} {fuelType} Tank</h2>
        <span className={`text-xs ${colors.badge} px-2 py-1 rounded`}>Real-time</span>
      </div>

      {tanksError && (
        <div className="text-red-600 text-sm">Failed to load tank data</div>
      )}
      {!tanksError && !tank && (
        <LoadingSpinner text="Loading tank data..." />
      )}

      {tank && (
        <div className="space-y-4">
          <div>
            <div className="flex justify-between items-end mb-2">
              <span className={`text-sm ${colors.text}`}>Current Level</span>
              <span className={`text-3xl font-bold ${colors.boldText}`}>
                {tank.current_level.toLocaleString()} L
              </span>
            </div>

            {/* Progress Bar */}
            <div className={`w-full ${colors.progressBg} rounded-full h-4 overflow-hidden`}>
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  tank.percentage > 50 ? 'bg-green-500' :
                  tank.percentage > 25 ? 'bg-yellow-500' : 'bg-red-500'
                }`}
                style={{ width: `${tank.percentage}%` }}
              />
            </div>
            <div className="flex justify-between mt-1">
              <span className={`text-xs ${colors.lightText}`}>0 L</span>
              <span className={`text-xs font-medium ${colors.mediumText}`}>{tank.percentage.toFixed(1)}% Full</span>
              <span className={`text-xs ${colors.lightText}`}>{tank.capacity.toLocaleString()} L</span>
            </div>
          </div>

          <div className={`pt-3 border-t ${colors.divider}`}>
            <p className={`text-xs ${colors.lightText}`}>
              Capacity: {tank.capacity.toLocaleString()} L |
              Available: {(tank.capacity - tank.current_level).toLocaleString()} L
            </p>
            <p className={`text-xs ${colors.lightestText} mt-1`}>
              Last updated: {new Date(tank.last_updated).toLocaleTimeString()}
            </p>
          </div>

          {/* Dip Readings Section - Only for Supervisor and Owner */}
          {canEditDipReadings && (
            <div className={`mt-4 pt-4 border-t ${colors.sectionDivider}`}>
              <div className="flex items-center justify-between mb-3">
                <h3 className={`text-sm font-semibold ${colors.boldText}`}>📏 Shift Dip Readings (cm)</h3>
                <span className={`text-xs ${colors.badgeBg} px-2 py-1 rounded font-semibold`}>
                  {userRole === 'owner' ? '👑 Owner' : '👔 Supervisor'}
                </span>
              </div>

              {/* Saved Dip Readings Display */}
              {savedDips && (savedDips.opening_dip || savedDips.closing_dip) && (
                <div className={`mb-3 p-3 ${colors.sectionBg} rounded-lg border ${colors.sectionBorder}`}>
                  <p className={`text-xs font-semibold ${colors.boldText} mb-2`}>Current Readings</p>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <p className={colors.lightText}>Opening</p>
                      <p className={`font-bold ${colors.boldText}`}>
                        {savedDips.opening_dip ? `${savedDips.opening_dip.toFixed(1)} cm` : 'Not set'}
                      </p>
                      {savedDips.opening_volume && (
                        <p className={`${colors.lightestText} text-xs`}>
                          {savedDips.opening_volume.toLocaleString()} L
                        </p>
                      )}
                    </div>
                    <div>
                      <p className={colors.lightText}>Closing</p>
                      <p className={`font-bold ${colors.boldText}`}>
                        {savedDips.closing_dip ? `${savedDips.closing_dip.toFixed(1)} cm` : 'Not set'}
                      </p>
                      {savedDips.closing_volume && (
                        <p className={`${colors.lightestText} text-xs`}>
                          {savedDips.closing_volume.toLocaleString()} L
                        </p>
                      )}
                    </div>
                  </div>
                  {savedDips.last_updated && (
                    <p className={`text-xs ${colors.lightestText} mt-2`}>
                      Last updated: {new Date(savedDips.last_updated).toLocaleTimeString()} by {savedDips.updated_by}
                    </p>
                  )}
                </div>
              )}

              {/* Input Fields */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`block text-xs font-medium ${colors.text} mb-1`}>
                    Opening Dip
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={dipReadings.openingDip}
                    onChange={(e) => setDipReadings({ ...dipReadings, openingDip: e.target.value })}
                    className={`w-full px-2 py-1.5 text-sm border ${colors.inputBorder} rounded focus:outline-none focus:ring-2 ${colors.focusRing}`}
                    placeholder="cm"
                  />
                </div>
                <div>
                  <label className={`block text-xs font-medium ${colors.text} mb-1`}>
                    Closing Dip
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={dipReadings.closingDip}
                    onChange={(e) => setDipReadings({ ...dipReadings, closingDip: e.target.value })}
                    className={`w-full px-2 py-1.5 text-sm border ${colors.inputBorder} rounded focus:outline-none focus:ring-2 ${colors.focusRing}`}
                    placeholder="cm"
                  />
                </div>
              </div>
              <button
                onClick={handleSave}
                disabled={savingDips || (!dipReadings.openingDip && !dipReadings.closingDip)}
                className={`mt-3 w-full px-3 py-1.5 ${colors.button} text-white text-sm font-medium rounded focus:outline-none focus:ring-2 ${colors.focusRing} disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {savingDips ? 'Saving...' : 'Save Dip Readings'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default TankCard
