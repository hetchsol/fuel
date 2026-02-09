import useSWR from 'swr'

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000/api/v1'

const fetchIslands = async () => {
  const res = await fetch(`${BASE}/islands/`)
  if (!res.ok) throw new Error('Failed to load islands')
  return res.json()
}

export default function Nozzles() {
  const { data: islands, error } = useSWR('islands', fetchIslands, {
    refreshInterval: 10000, // Refresh every 10 seconds
  })

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Pump Islands & Nozzles</h1>
        <p className="mt-2 text-sm text-gray-600">Overview of all islands, pump stations, and nozzles</p>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-700">Failed to load islands data</p>
        </div>
      )}

      {!error && !islands && (
        <div className="text-gray-500">Loading islands...</div>
      )}

      {islands && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {islands.map((island: any) => (
            <div key={island.island_id} className="bg-white rounded-lg shadow-lg border-2 border-blue-200 overflow-hidden">
              {/* Island Header */}
              <div className="bg-gradient-to-r from-blue-500 to-blue-600 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-white">🏝️ {island.name}</h2>
                    {island.location && (
                      <p className="text-sm text-blue-100 mt-1">📍 {island.location}</p>
                    )}
                  </div>
                  <div className="bg-white bg-opacity-20 px-3 py-1 rounded">
                    <span className="text-xs text-white font-medium">{island.island_id}</span>
                  </div>
                </div>
              </div>

              {/* Pump Station */}
              {island.pump_station && (
                <div className="p-4 bg-gray-50">
                  <div className="flex items-center mb-3">
                    <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      ⚙️ {island.pump_station.name}
                    </h3>
                  </div>
                  <p className="text-xs text-gray-500 mb-3">ID: {island.pump_station.pump_station_id}</p>

                  {/* Nozzles */}
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-gray-700 mb-2">Nozzles:</p>
                    {island.pump_station.nozzles.map((nozzle: any) => (
                      <div
                        key={nozzle.nozzle_id}
                        className={`p-3 rounded-lg border-2 ${
                          nozzle.fuel_type === 'Diesel'
                            ? 'bg-orange-50 border-orange-200'
                            : 'bg-blue-50 border-blue-200'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <div className={`text-2xl ${
                              nozzle.fuel_type === 'Diesel' ? 'text-purple-600' : 'text-green-600'
                            }`}>
                              {nozzle.fuel_type === 'Diesel' ? '🛢️' : '⛽'}
                            </div>
                            <div>
                              <p className="font-bold text-gray-900">{nozzle.nozzle_id}</p>
                              <p className={`text-xs font-medium ${
                                nozzle.fuel_type === 'Diesel' ? 'text-purple-700' : 'text-green-700'
                              }`}>
                                {nozzle.fuel_type}
                              </p>
                            </div>
                          </div>
                          <div>
                            <span className={`px-2 py-1 rounded text-xs font-semibold ${
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
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Summary Stats */}
      {islands && (
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
            <h3 className="text-sm font-medium text-blue-900 mb-1">Total Islands</h3>
            <p className="text-3xl font-bold text-blue-700">{islands.length}</p>
          </div>
          <div className="bg-green-50 rounded-lg p-4 border border-green-200">
            <h3 className="text-sm font-medium text-green-900 mb-1">Pump Stations</h3>
            <p className="text-3xl font-bold text-green-700">{islands.length}</p>
          </div>
          <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
            <h3 className="text-sm font-medium text-purple-900 mb-1">Total Nozzles</h3>
            <p className="text-3xl font-bold text-purple-700">
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
      <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-blue-900 mb-2">ℹ️ Island Structure</h3>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>• Each <strong>Island</strong> contains one <strong>Pump Station</strong></li>
          <li>• Each <strong>Pump Station</strong> has <strong>2 Nozzles</strong> (1 Diesel + 1 Petrol)</li>
          <li>• Nozzles can be in Active, Inactive, or Maintenance status</li>
          <li>• Use the readings page to record nozzle meter readings</li>
        </ul>
      </div>
    </div>
  )
}
