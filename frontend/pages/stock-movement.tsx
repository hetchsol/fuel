import { useState, useEffect } from 'react'
import useSWR from 'swr'
import { getHeaders } from '../lib/api'

const BASE = '/api/v1'

const fetchDeliveries = async () => {
  const res = await fetch(`${BASE}/tanks/deliveries`, {
    headers: getHeaders()
  })
  if (!res.ok) throw new Error('Failed to load deliveries')
  return res.json()
}

export default function StockMovement() {
  const [formData, setFormData] = useState({
    tank_id: 'TANK-DIESEL',
    fuel_type: 'Diesel',
    expected_volume: '',
    volume_delivered: '',
    supplier: '',
    delivery_note: '',
  })
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState('')
  const [currentStock, setCurrentStock] = useState<any>(null)
  const [fetchingStock, setFetchingStock] = useState(false)

  const { data: deliveries, mutate } = useSWR('deliveries', fetchDeliveries, {
    refreshInterval: 10000, // Refresh every 10 seconds
  })

  // Fetch current tank stock when tank changes
  useEffect(() => {
    fetchCurrentStock()
  }, [formData.tank_id])

  const fetchCurrentStock = async () => {
    setFetchingStock(true)
    try {
      // Fetch REAL-TIME tank levels (cumulative with all deliveries and sales)
      const response = await fetch(`${BASE}/tanks/levels`, {
        headers: getHeaders()
      })

      if (response.ok) {
        const allTanks = await response.json()
        // Find the current tank
        const tankLevel = allTanks.find((t: any) => t.tank_id === formData.tank_id)
        if (tankLevel) {
          setCurrentStock(tankLevel)
        } else {
          setCurrentStock(null)
        }
      } else {
        setCurrentStock(null)
      }
    } catch (err) {
      console.error('Error fetching current stock:', err)
      setCurrentStock(null)
    } finally {
      setFetchingStock(false)
    }
  }

  const handleTankChange = (tankId: string) => {
    const fuelType = tankId === 'TANK-DIESEL' ? 'Diesel' : 'Petrol'
    setFormData({ ...formData, tank_id: tankId, fuel_type: fuelType })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setResult(null)

    try {
      const payload = {
        tank_id: formData.tank_id,
        fuel_type: formData.fuel_type,
        expected_volume: parseFloat(formData.expected_volume),
        volume_delivered: parseFloat(formData.volume_delivered),
        supplier: formData.supplier || null,
        delivery_note: formData.delivery_note || null,
      }

      const res = await fetch(`${BASE}/tanks/delivery`, {
        method: 'POST',
        headers: {
          ...getHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        throw new Error('Failed to receive delivery')
      }

      const data = await res.json()
      setResult(data)

      // Reset form
      setFormData({
        tank_id: 'TANK-DIESEL',
        fuel_type: 'Diesel',
        expected_volume: '',
        volume_delivered: '',
        supplier: '',
        delivery_note: '',
      })

      // Refresh deliveries list and current stock
      mutate()
      fetchCurrentStock()
    } catch (err: any) {
      setError(err.message || 'Failed to receive delivery')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-content-primary">Stock Movement</h1>
        <p className="mt-2 text-sm text-content-secondary">Receive fuel deliveries and track stock levels</p>
      </div>

      {/* Current Tank Stock Display */}
      <div className="mb-6 bg-gradient-to-r from-action-primary-light to-indigo-50 rounded-lg shadow-lg p-6 border-2 border-action-primary">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-action-primary mb-1">📊 Current Tank Level</h2>
            <p className="text-sm text-action-primary">
              {formData.tank_id === 'TANK-DIESEL' ? '🛢️ Diesel Tank' : '⛽ Petrol Tank'}
            </p>
          </div>
          {fetchingStock ? (
            <div className="text-action-primary text-sm">Loading...</div>
          ) : currentStock ? (
            <div className="text-right">
              <div className="text-4xl font-bold text-action-primary">
                {currentStock.current_level
                  ? currentStock.current_level.toLocaleString(undefined, {maximumFractionDigits: 0})
                  : 'N/A'}
              </div>
              <div className="text-sm text-action-primary font-medium">Liters</div>
              <div className="text-xs text-action-primary mt-1">
                {currentStock.percentage?.toFixed(1)}% Full
              </div>
              {currentStock.last_updated && (
                <div className="text-xs text-action-primary mt-1">
                  Updated: {new Date(currentStock.last_updated).toLocaleString()}
                </div>
              )}
            </div>
          ) : (
            <div className="text-content-secondary text-sm">No data available</div>
          )}
        </div>

        {currentStock && currentStock.current_level && (
          <div className="mt-4 pt-4 border-t border-action-primary">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-action-primary text-xs">Current Level</p>
                <p className="font-semibold text-action-primary">{currentStock.current_level.toLocaleString(undefined, {maximumFractionDigits: 0})} L</p>
              </div>
              <div>
                <p className="text-action-primary text-xs">Tank Capacity</p>
                <p className="font-semibold text-action-primary">{currentStock.capacity?.toLocaleString(undefined, {maximumFractionDigits: 0})} L</p>
              </div>
            </div>
            <div className="mt-3">
              <div className="w-full bg-surface-border rounded-full h-3">
                <div
                  className={`h-3 rounded-full transition-all duration-300 ${
                    currentStock.percentage >= 95 ? 'bg-status-error' :
                    currentStock.percentage >= 85 ? 'bg-yellow-500' :
                    'bg-action-primary'
                  }`}
                  style={{ width: `${Math.min(currentStock.percentage || 0, 100)}%` }}
                ></div>
              </div>
              <p className="text-xs text-content-secondary mt-1 text-center">
                {currentStock.percentage?.toFixed(1)}% capacity
              </p>
            </div>
            {currentStock.percentage >= 90 && (
              <div className="mt-3 p-2 bg-status-pending-light border border-status-warning rounded text-xs text-status-warning">
                ⚠️ Warning: Tank is {currentStock.percentage?.toFixed(1)}% full.
                Available space: {((currentStock.capacity - currentStock.current_level)).toLocaleString(undefined, {maximumFractionDigits: 0})} L
              </div>
            )}
          </div>
        )}

        <button
          onClick={fetchCurrentStock}
          disabled={fetchingStock}
          className="mt-3 text-xs text-action-primary hover:text-action-primary underline disabled:opacity-50"
        >
          🔄 Refresh Current Stock
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Delivery Form */}
        <div className="bg-surface-card rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">📦 Receive Delivery</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-content-secondary mb-1">
                Select Tank
              </label>
              <select
                value={formData.tank_id}
                onChange={(e) => handleTankChange(e.target.value)}
                className="w-full px-3 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-action-primary focus:border-action-primary"
              >
                <option value="TANK-DIESEL">🛢️ Diesel Tank</option>
                <option value="TANK-PETROL">⛽ Petrol Tank</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-content-secondary mb-1">
                Expected Volume (Liters)
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.expected_volume}
                onChange={(e) => setFormData({ ...formData, expected_volume: e.target.value })}
                className="w-full px-3 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-action-primary focus:border-action-primary"
                placeholder="e.g., 10000"
                required
              />
              <p className="text-xs text-content-secondary mt-1">Volume stated on delivery note</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-content-secondary mb-1">
                Actual Volume Delivered (Liters)
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.volume_delivered}
                onChange={(e) => setFormData({ ...formData, volume_delivered: e.target.value })}
                className="w-full px-3 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-action-primary focus:border-action-primary"
                placeholder="e.g., 9970"
                required
              />
              <p className="text-xs text-content-secondary mt-1">Volume measured at receiving</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-content-secondary mb-1">
                Supplier (Optional)
              </label>
              <input
                type="text"
                value={formData.supplier}
                onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
                className="w-full px-3 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-action-primary focus:border-action-primary"
                placeholder="e.g., Total Kenya"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-content-secondary mb-1">
                Delivery Note (Optional)
              </label>
              <textarea
                value={formData.delivery_note}
                onChange={(e) => setFormData({ ...formData, delivery_note: e.target.value })}
                className="w-full px-3 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-action-primary focus:border-action-primary"
                rows={3}
                placeholder="Additional notes about this delivery..."
              />
            </div>

            {error && (
              <div className="p-4 bg-status-error-light border border-status-error rounded-md">
                <p className="text-sm text-status-error">✗ {error}</p>
              </div>
            )}

            {currentStock && formData.volume_delivered && (
              (() => {
                const deliveryVolume = parseFloat(formData.volume_delivered) || 0
                const afterDelivery = (currentStock.current_level || 0) + deliveryVolume
                const percentAfter = (afterDelivery / (currentStock.capacity || 1)) * 100

                if (percentAfter > 100) {
                  return (
                    <div className="p-4 bg-status-error-light border border-status-error rounded-md">
                      <p className="text-sm text-status-error font-semibold">⚠️ OVERFLOW WARNING</p>
                      <p className="text-xs text-status-error mt-1">
                        This delivery ({deliveryVolume.toLocaleString()} L) will exceed tank capacity by {(afterDelivery - (currentStock.capacity || 0)).toLocaleString()} L.
                        Delivery will be capped at capacity.
                      </p>
                    </div>
                  )
                } else if (percentAfter >= 95) {
                  return (
                    <div className="p-3 bg-status-pending-light border border-status-warning rounded-md">
                      <p className="text-xs text-status-warning">
                        ⚠️ Tank will be {percentAfter.toFixed(1)}% full after delivery.
                      </p>
                    </div>
                  )
                }
                return null
              })()
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full px-4 py-2 bg-action-primary text-white rounded-md hover:bg-action-primary-hover focus:outline-none focus:ring-2 focus:ring-action-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Processing...' : 'Receive Delivery'}
            </button>
          </form>
        </div>

        {/* Delivery Result */}
        <div className="bg-surface-card rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Delivery Result</h2>

          {result && (
            <div className="space-y-4">
              <div className="p-4 bg-status-success-light border border-status-success rounded-md">
                <p className="text-sm font-medium text-status-success">✓ {result.message}</p>
                <p className="text-xs text-status-success mt-1">Delivery ID: {result.delivery_id}</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-action-primary-light border border-action-primary rounded-md">
                  <p className="text-xs text-action-primary">Previous Level</p>
                  <p className="text-lg font-bold text-action-primary">{result.previous_level?.toLocaleString()} L</p>
                </div>
                <div className="p-3 bg-status-success-light border border-status-success rounded-md">
                  <p className="text-xs text-status-success">New Level</p>
                  <p className="text-lg font-bold text-status-success">{result.new_level?.toLocaleString()} L</p>
                </div>
              </div>

              <div className="p-4 bg-action-primary-light border border-action-primary rounded-md">
                <p className="text-xs text-action-primary mb-1">Volume Added</p>
                <p className="text-2xl font-bold text-action-primary">{result.volume_added?.toLocaleString()} L</p>
                <p className="text-xs text-action-primary mt-1">Tank now {result.percentage?.toFixed(1)}% full</p>
              </div>

              {result.loss_analysis && (
                <div className={`p-4 border rounded-md ${
                  result.loss_analysis.status === 'acceptable'
                    ? 'bg-status-success-light border-status-success'
                    : 'bg-category-c-light border-category-c-border'
                }`}>
                  <p className="text-sm font-medium mb-2">
                    {result.loss_analysis.status === 'acceptable' ? '✓' : '⚠️'} Loss Analysis
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <p className="text-content-secondary">Actual Loss</p>
                      <p className="font-bold">{result.loss_analysis.actual_loss?.toFixed(2)} L ({result.loss_analysis.actual_loss_percent}%)</p>
                    </div>
                    <div>
                      <p className="text-content-secondary">Allowable Loss</p>
                      <p className="font-bold">{result.loss_analysis.allowable_loss?.toFixed(2)} L ({result.loss_analysis.allowable_loss_percent}%)</p>
                    </div>
                  </div>
                  <p className="text-xs mt-2">{result.loss_analysis.message}</p>
                </div>
              )}
            </div>
          )}

          {!result && !error && (
            <div className="text-center py-12 text-content-secondary">
              Submit a delivery to see results
            </div>
          )}
        </div>
      </div>

      {/* Delivery History */}
      <div className="mt-8 bg-surface-card rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">📋 Recent Deliveries</h2>
        {!deliveries && (
          <div className="text-content-secondary text-sm">Loading...</div>
        )}
        {deliveries && deliveries.length === 0 && (
          <div className="text-content-secondary text-sm">No deliveries recorded yet</div>
        )}
        {deliveries && deliveries.length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-surface-border">
              <thead className="bg-surface-bg">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase">Delivery ID</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase">Timestamp</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase">Fuel Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase">Delivered</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase">Loss</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="bg-surface-card divide-y divide-surface-border">
                {deliveries.map((delivery: any, idx: number) => (
                  <tr key={idx} className="hover:bg-surface-bg">
                    <td className="px-4 py-3 text-sm font-medium text-content-primary">{delivery.delivery_id}</td>
                    <td className="px-4 py-3 text-sm text-content-secondary">
                      {new Date(delivery.timestamp).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-content-secondary">{delivery.fuel_type}</td>
                    <td className="px-4 py-3 text-sm font-medium text-content-primary">
                      {delivery.volume_delivered?.toLocaleString()} L
                    </td>
                    <td className="px-4 py-3 text-sm text-content-secondary">
                      {delivery.actual_loss?.toFixed(2)} L ({delivery.actual_loss_percent?.toFixed(2)}%)
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        delivery.loss_status === 'acceptable'
                          ? 'bg-status-success-light text-status-success'
                          : 'bg-category-c-light text-category-c'
                      }`}>
                        {delivery.loss_status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
