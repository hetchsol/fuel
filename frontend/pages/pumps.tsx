import { authFetch, BASE } from '../lib/api'
import useSWR from 'swr'
import LoadingSpinner from '../components/LoadingSpinner'


const fetchIslands = async () => {
  const res = await authFetch(`${BASE}/islands/`)
  if (!res.ok) throw new Error('Failed to load islands')
  return res.json()
}

export default function Pumps() {
  const { data: islands, error } = useSWR('islands', fetchIslands, {
    refreshInterval: 10000,
  })

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Pump Stations</h1>
        <p className="mt-2 text-sm text-gray-600">Overview of all pump stations across islands</p>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-700">Failed to load pump stations data</p>
        </div>
      )}

      {!error && !islands && (
        <LoadingSpinner text="Loading pump stations..." />
      )}

      {islands && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {islands.map((island: any) => (
            island.pump_station && (
              <div key={island.pump_station.pump_station_id} className="bg-white rounded-lg shadow-lg border-2 border-green-200 overflow-hidden">
                {/* Pump Station Header */}
                <div className="bg-gradient-to-r from-green-500 to-green-600 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-xl font-bold text-white">⚙️ {island.pump_station.name}</h2>
                      <p className="text-sm text-green-100 mt-1">Island: {island.name}</p>
                      {island.location && (
                        <p className="text-sm text-green-100">📍 {island.location}</p>
                      )}
                    </div>
                    <div className="bg-white bg-opacity-20 px-3 py-1 rounded">
                      <span className="text-xs text-white font-medium">{island.pump_station.pump_station_id}</span>
                    </div>
                  </div>
                </div>

                {/* Pump Station Details */}
                <div className="p-4">
                  <div className="mb-4">
                    <h3 className="text-sm font-medium text-gray-700 mb-2">Tank Connection</h3>
                    <div className="flex items-center space-x-2">
                      <span className="text-lg">🛢️</span>
                      <span className="text-gray-900 font-medium">
                        {island.pump_station.tank_id || 'Not assigned'}
                      </span>
                    </div>
                  </div>

                  <div className="mb-4">
                    <h3 className="text-sm font-medium text-gray-700 mb-2">Nozzles</h3>
                    <div className="grid grid-cols-2 gap-2">
                      {island.pump_station.nozzles.map((nozzle: any) => (
                        <div
                          key={nozzle.nozzle_id}
                          className={`p-2 rounded border ${
                            nozzle.fuel_type === 'Diesel'
                              ? 'bg-orange-50 border-orange-200'
                              : 'bg-blue-50 border-blue-200'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              <span className="text-lg">
                                {nozzle.fuel_type === 'Diesel' ? '🛢️' : '⛽'}
                              </span>
                              <div>
                                <p className="text-xs font-bold text-gray-900">{nozzle.nozzle_id}</p>
                                <p className={`text-xs ${
                                  nozzle.fuel_type === 'Diesel' ? 'text-purple-700' : 'text-green-700'
                                }`}>
                                  {nozzle.fuel_type}
                                </p>
                              </div>
                            </div>
                            <span className={`px-1 py-0.5 rounded text-xs font-semibold ${
                              nozzle.status === 'Active'
                                ? 'bg-green-100 text-green-800'
                                : nozzle.status === 'Maintenance'
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-red-100 text-red-800'
                            }`}>
                              {nozzle.status}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Readings Summary */}
                  <div className="bg-gray-50 rounded p-3">
                    <h3 className="text-sm font-medium text-gray-700 mb-2">Total Nozzles</h3>
                    <p className="text-2xl font-bold text-gray-900">
                      {island.pump_station.nozzles.length}
                    </p>
                  </div>
                </div>
              </div>
            )
          ))}
        </div>
      )}

      {/* Summary Stats */}
      {islands && (
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-green-50 rounded-lg p-4 border border-green-200">
            <h3 className="text-sm font-medium text-green-900 mb-1">Total Pump Stations</h3>
            <p className="text-3xl font-bold text-green-700">
              {islands.filter((island: any) => island.pump_station).length}
            </p>
          </div>
          <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
            <h3 className="text-sm font-medium text-blue-900 mb-1">Total Nozzles</h3>
            <p className="text-3xl font-bold text-blue-700">
              {islands.reduce((sum: number, island: any) =>
                sum + (island.pump_station?.nozzles?.length || 0), 0
              )}
            </p>
          </div>
          <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
            <h3 className="text-sm font-medium text-orange-900 mb-1">Active Nozzles</h3>
            <p className="text-3xl font-bold text-orange-700">
              {islands.reduce((sum: number, island: any) =>
                sum + (island.pump_station?.nozzles?.filter((n: any) => n.status === 'Active').length || 0), 0
              )}
            </p>
          </div>
        </div>
      )}

      {/* Info Box */}
      <div className="mt-8 bg-green-50 border border-green-200 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-green-900 mb-2">ℹ️ About Pump Stations</h3>
        <ul className="text-sm text-green-700 space-y-1">
          <li>• Each pump station is located on a specific island</li>
          <li>• Pump stations are connected to storage tanks for fuel supply</li>
          <li>• Each pump station typically has multiple nozzles for dispensing fuel</li>
          <li>• Tank connections can be configured by the owner</li>
        </ul>
      </div>
    </div>
  )
}
