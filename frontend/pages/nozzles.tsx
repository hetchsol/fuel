import { authFetch, BASE } from '../lib/api'
import useSWR from 'swr'
import LoadingSpinner from '../components/LoadingSpinner'


const fetchIslands = async () => {
  const res = await authFetch(`${BASE}/islands/`)
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
        <h1 className="text-3xl font-bold text-content-primary">Pump Islands & Nozzles</h1>
        <p className="mt-2 text-sm text-content-secondary">Overview of all islands, pump stations, and nozzles</p>
      </div>

      {error && (
        <div className="p-4 bg-status-error-light border border-status-error rounded-md">
          <p className="text-sm text-status-error">Failed to load islands data</p>
        </div>
      )}

      {!error && !islands && (
        <LoadingSpinner text="Loading islands..." />
      )}

      {islands && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {islands.map((island: any) => (
            <div key={island.island_id} className="bg-surface-card rounded-lg shadow-lg border-2 border-action-primary overflow-hidden">
              {/* Island Header */}
              <div className="bg-gradient-to-r from-action-primary to-action-primary p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-white">🏝️ {island.name}</h2>
                    {island.location && (
                      <p className="text-sm text-blue-100 mt-1">📍 {island.location}</p>
                    )}
                  </div>
                  <div className="bg-surface-card bg-opacity-20 px-3 py-1 rounded">
                    <span className="text-xs text-white font-medium">{island.island_id}</span>
                  </div>
                </div>
              </div>

              {/* Pump Station */}
              {island.pump_station && (
                <div className="p-4 bg-surface-bg">
                  <div className="flex items-center mb-3">
                    <div className="w-2 h-2 bg-status-success rounded-full mr-2"></div>
                    <h3 className="text-lg font-semibold text-content-primary">
                      ⚙️ {island.pump_station.name}
                    </h3>
                  </div>
                  <p className="text-xs text-content-secondary mb-3">ID: {island.pump_station.pump_station_id}</p>

                  {/* Nozzles */}
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-content-secondary mb-2">Nozzles:</p>
                    {island.pump_station.nozzles.map((nozzle: any) => (
                      <div
                        key={nozzle.nozzle_id}
                        className={`p-3 rounded-lg border-2 ${
                          nozzle.fuel_type === 'Diesel'
                            ? 'bg-orange-50 border-orange-200'
                            : 'bg-action-primary-light border-action-primary'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <div className={`text-2xl ${
                              nozzle.fuel_type === 'Diesel' ? 'text-fuel-diesel' : 'text-status-success'
                            }`}>
                              {nozzle.fuel_type === 'Diesel' ? '🛢️' : '⛽'}
                            </div>
                            <div>
                              <p className="font-bold text-content-primary">
                                {island.fuel_type_abbrev && nozzle.display_label
                                  ? `${island.fuel_type_abbrev} ${nozzle.display_label}`
                                  : nozzle.nozzle_id}
                              </p>
                              <p className="text-xs text-content-secondary">{nozzle.nozzle_id}</p>
                              <p className={`text-xs font-medium ${
                                nozzle.fuel_type === 'Diesel' ? 'text-fuel-diesel' : 'text-fuel-petrol'
                              }`}>
                                {nozzle.fuel_type}
                              </p>
                            </div>
                          </div>
                          <div>
                            <span className={`px-2 py-1 rounded text-xs font-semibold ${
                              nozzle.status === 'Active'
                                ? 'bg-status-success-light text-status-success'
                                : nozzle.status === 'Maintenance'
                                ? 'bg-status-pending-light text-status-warning'
                                : 'bg-status-error-light text-status-error'
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
          <div className="bg-action-primary-light rounded-lg p-4 border border-action-primary">
            <h3 className="text-sm font-medium text-action-primary mb-1">Total Islands</h3>
            <p className="text-3xl font-bold text-action-primary">{islands.length}</p>
          </div>
          <div className="bg-fuel-petrol-light rounded-lg p-4 border border-fuel-petrol-border">
            <h3 className="text-sm font-medium text-fuel-petrol mb-1">Pump Stations</h3>
            <p className="text-3xl font-bold text-fuel-petrol">{islands.length}</p>
          </div>
          <div className="bg-fuel-diesel-light rounded-lg p-4 border border-fuel-diesel-border">
            <h3 className="text-sm font-medium text-fuel-diesel mb-1">Total Nozzles</h3>
            <p className="text-3xl font-bold text-fuel-diesel">
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
      <div className="mt-8 bg-action-primary-light border border-action-primary rounded-lg p-4">
        <h3 className="text-sm font-semibold text-action-primary mb-2">ℹ️ Island Structure & Naming</h3>
        <ul className="text-sm text-action-primary space-y-1">
          <li>• Each <strong>Island</strong> contains one <strong>Pump Station</strong> with <strong>2 Nozzles</strong></li>
          <li>• Nozzles use the spreadsheet naming convention: <strong>LSD 1A</strong>, <strong>LSD 1B</strong> (Diesel) / <strong>UNL 1A</strong>, <strong>UNL 1B</strong> (Petrol)</li>
          <li>• <strong>LSD</strong> = Low Sulphur Diesel, <strong>UNL</strong> = Unleaded Petrol</li>
          <li>• Islands are numbered 1, 2 within each fuel type group</li>
          <li>• Nozzles can be in Active, Inactive, or Maintenance status</li>
        </ul>
      </div>
    </div>
  )
}
