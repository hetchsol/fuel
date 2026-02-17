import { useState, useEffect } from 'react'
import useSWR from 'swr'
import { getHeaders } from '../lib/api'

const BASE = '/api/v1'

interface QueuedDelivery {
  id: string
  tank_id: string
  fuel_type: string
  expected_volume: number
  volume_delivered: number
  supplier: string
  delivery_note: string
  status: 'pending' | 'submitted' | 'error'
  result?: any
  error?: string
}

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
  const [error, setError] = useState('')
  const [currentStock, setCurrentStock] = useState<any>(null)
  const [fetchingStock, setFetchingStock] = useState(false)
  const [deliveryQueue, setDeliveryQueue] = useState<QueuedDelivery[]>([])
  const [submitting, setSubmitting] = useState(false)

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

  const addToQueue = (e: React.FormEvent) => {
    e.preventDefault()
    const newDelivery: QueuedDelivery = {
      id: crypto.randomUUID(),
      tank_id: formData.tank_id,
      fuel_type: formData.fuel_type,
      expected_volume: parseFloat(formData.expected_volume),
      volume_delivered: parseFloat(formData.volume_delivered),
      supplier: formData.supplier || '',
      delivery_note: formData.delivery_note || '',
      status: 'pending',
    }
    setDeliveryQueue(prev => [...prev, newDelivery])
    setError('')
    // Reset form but keep the same tank selected
    setFormData({
      ...formData,
      expected_volume: '',
      volume_delivered: '',
      supplier: '',
      delivery_note: '',
    })
  }

  const removeFromQueue = (id: string) => {
    setDeliveryQueue(prev => prev.filter(d => d.id !== id))
  }

  const clearCompleted = () => {
    setDeliveryQueue(prev => prev.filter(d => d.status === 'pending' || d.status === 'error'))
  }

  const submitAllDeliveries = async () => {
    setSubmitting(true)
    setError('')

    const pending = deliveryQueue.filter(d => d.status === 'pending' || d.status === 'error')
    for (const delivery of pending) {
      // Mark as submitting
      setDeliveryQueue(prev => prev.map(d => d.id === delivery.id ? { ...d, status: 'pending' as const, error: undefined } : d))

      try {
        const payload = {
          tank_id: delivery.tank_id,
          fuel_type: delivery.fuel_type,
          expected_volume: delivery.expected_volume,
          volume_delivered: delivery.volume_delivered,
          supplier: delivery.supplier || null,
          delivery_note: delivery.delivery_note || null,
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
        setDeliveryQueue(prev => prev.map(d => d.id === delivery.id ? { ...d, status: 'submitted' as const, result: data } : d))
      } catch (err: any) {
        setDeliveryQueue(prev => prev.map(d => d.id === delivery.id ? { ...d, status: 'error' as const, error: err.message || 'Failed' } : d))
      }
    }

    // Refresh deliveries list and current stock
    mutate()
    fetchCurrentStock()
    setSubmitting(false)
  }

  // Cumulative overflow check helper
  const getTotalQueuedForTank = (tankId: string) => {
    return deliveryQueue
      .filter(d => d.tank_id === tankId && d.status === 'pending')
      .reduce((sum, d) => sum + d.volume_delivered, 0)
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
          <form onSubmit={addToQueue} className="space-y-4">
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
                const totalQueued = getTotalQueuedForTank(formData.tank_id)
                const afterAll = (currentStock.current_level || 0) + totalQueued + deliveryVolume
                const percentAfter = (afterAll / (currentStock.capacity || 1)) * 100

                if (percentAfter > 100) {
                  return (
                    <div className="p-4 bg-status-error-light border border-status-error rounded-md">
                      <p className="text-sm text-status-error font-semibold">⚠️ OVERFLOW WARNING</p>
                      <p className="text-xs text-status-error mt-1">
                        This delivery ({deliveryVolume.toLocaleString()} L) plus {totalQueued > 0 ? `${totalQueued.toLocaleString()} L already queued` : 'current level'} will exceed tank capacity by {(afterAll - (currentStock.capacity || 0)).toLocaleString()} L.
                      </p>
                    </div>
                  )
                } else if (percentAfter >= 95) {
                  return (
                    <div className="p-3 bg-status-pending-light border border-status-warning rounded-md">
                      <p className="text-xs text-status-warning">
                        ⚠️ Tank will be {percentAfter.toFixed(1)}% full after all deliveries{totalQueued > 0 ? ` (including ${totalQueued.toLocaleString()} L queued)` : ''}.
                      </p>
                    </div>
                  )
                }
                return null
              })()
            )}

            <button
              type="submit"
              className="w-full px-4 py-2 bg-action-primary text-white rounded-md hover:bg-action-primary-hover focus:outline-none focus:ring-2 focus:ring-action-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              + Add to Queue
            </button>
          </form>
        </div>

        {/* Delivery Queue */}
        <div className="bg-surface-card rounded-lg shadow p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Delivery Queue ({deliveryQueue.filter(d => d.status === 'pending').length} pending)</h2>
            {deliveryQueue.some(d => d.status === 'submitted') && (
              <button
                onClick={clearCompleted}
                className="text-sm text-content-secondary hover:text-content-primary underline"
              >
                Clear Completed
              </button>
            )}
          </div>

          {deliveryQueue.length === 0 ? (
            <div className="text-center py-12 text-content-secondary">
              Add deliveries to the queue using the form
            </div>
          ) : (
            <div className="space-y-3">
              {deliveryQueue.map((delivery) => (
                <div
                  key={delivery.id}
                  className={`p-3 rounded-md border ${
                    delivery.status === 'submitted'
                      ? 'bg-status-success-light border-status-success'
                      : delivery.status === 'error'
                      ? 'bg-status-error-light border-status-error'
                      : 'bg-surface-bg border-surface-border'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold">
                          {delivery.tank_id === 'TANK-DIESEL' ? 'Diesel' : 'Petrol'}
                        </span>
                        {delivery.status === 'submitted' && <span className="text-status-success text-sm">✓</span>}
                        {delivery.status === 'error' && <span className="text-status-error text-sm">✗</span>}
                        {delivery.supplier && (
                          <span className="text-xs text-content-secondary">| {delivery.supplier}</span>
                        )}
                      </div>
                      <div className="flex gap-4 text-xs text-content-secondary">
                        <span>Expected: {delivery.expected_volume.toLocaleString()} L</span>
                        <span>Delivered: {delivery.volume_delivered.toLocaleString()} L</span>
                      </div>
                      {delivery.status === 'submitted' && delivery.result && (
                        <div className="mt-2 text-xs">
                          <span className="text-status-success">ID: {delivery.result.delivery_id}</span>
                          {delivery.result.loss_analysis && (
                            <span className={`ml-2 px-1.5 py-0.5 rounded text-xs ${
                              delivery.result.loss_analysis.status === 'acceptable'
                                ? 'bg-status-success-light text-status-success'
                                : 'bg-category-c-light text-category-c'
                            }`}>
                              Loss: {delivery.result.loss_analysis.actual_loss_percent}%
                            </span>
                          )}
                        </div>
                      )}
                      {delivery.status === 'error' && delivery.error && (
                        <p className="mt-1 text-xs text-status-error">{delivery.error}</p>
                      )}
                    </div>
                    {delivery.status === 'pending' && (
                      <button
                        onClick={() => removeFromQueue(delivery.id)}
                        className="ml-2 text-content-secondary hover:text-status-error text-sm"
                        title="Remove from queue"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {/* Running totals per tank */}
              {(() => {
                const pendingByTank: Record<string, number> = {}
                deliveryQueue.filter(d => d.status === 'pending').forEach(d => {
                  pendingByTank[d.fuel_type] = (pendingByTank[d.fuel_type] || 0) + d.volume_delivered
                })
                const entries = Object.entries(pendingByTank)
                if (entries.length === 0) return null
                return (
                  <div className="pt-3 border-t border-surface-border">
                    <p className="text-xs font-medium text-content-secondary mb-1">Queued Totals:</p>
                    {entries.map(([fuel, total]) => (
                      <p key={fuel} className="text-sm font-semibold">{fuel}: {total.toLocaleString()} L</p>
                    ))}
                  </div>
                )
              })()}

              {/* Submit All button */}
              {deliveryQueue.some(d => d.status === 'pending' || d.status === 'error') && (
                <button
                  onClick={submitAllDeliveries}
                  disabled={submitting}
                  className="w-full px-4 py-2 bg-status-success text-white rounded-md hover:bg-status-success/90 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  {submitting ? 'Submitting...' : `Submit All Deliveries (${deliveryQueue.filter(d => d.status === 'pending' || d.status === 'error').length})`}
                </button>
              )}
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
