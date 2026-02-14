import { authFetch, BASE, getHeaders } from '../lib/api'
import { useState, useEffect } from 'react'


interface SaleResult {
  sale_id: string
  shift_id: string
  fuel_type: string
  mechanical_opening: number
  mechanical_closing: number
  electronic_opening: number
  electronic_closing: number
  mechanical_volume: number
  electronic_volume: number
  discrepancy_percent: number
  validation_status: string
  average_volume: number
  unit_price: number
  total_amount: number
  validation_message: string
}

export default function Sales() {
  const [shiftType, setShiftType] = useState<'DAY' | 'NIGHT'>('DAY')
  const [formData, setFormData] = useState({
    shiftId: '',
    fuelType: 'Diesel',
    mechanicalOpening: '',
    mechanicalClosing: '',
    electronicOpening: '',
    electronicClosing: '',
  })
  const [result, setResult] = useState<SaleResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Generate Shift ID based on shift type and current date
  const generateShiftId = (type: 'DAY' | 'NIGHT') => {
    const now = new Date()
    const day = String(now.getDate()).padStart(2, '0')
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const year = now.getFullYear()
    return `${type}_${day}_${month}_${year}`
  }

  // Auto-fill Shift ID when component mounts or shift type changes
  useEffect(() => {
    const shiftId = generateShiftId(shiftType)
    setFormData(prev => ({ ...prev, shiftId }))
  }, [shiftType])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setResult(null)

    try {
      const res = await authFetch(`${BASE}/sales`, {
        method: 'POST',
        headers: {
          ...getHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          shift_id: formData.shiftId,
          fuel_type: formData.fuelType,
          mechanical_opening: parseFloat(formData.mechanicalOpening),
          mechanical_closing: parseFloat(formData.mechanicalClosing),
          electronic_opening: parseFloat(formData.electronicOpening),
          electronic_closing: parseFloat(formData.electronicClosing),
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        // Handle different error formats
        let errorMessage = 'Failed to calculate sale'

        if (typeof data.detail === 'string') {
          errorMessage = data.detail
        } else if (Array.isArray(data.detail)) {
          // Pydantic validation errors
          errorMessage = data.detail
            .map((err: any) => `${err.loc.join('.')}: ${err.msg}`)
            .join('; ')
        } else if (data.detail && typeof data.detail === 'object') {
          errorMessage = JSON.stringify(data.detail)
        }

        throw new Error(errorMessage)
      }

      setResult(data)
      // Reset form and regenerate shift ID
      const newShiftId = generateShiftId(shiftType)
      setFormData({
        shiftId: newShiftId,
        fuelType: 'Diesel',
        mechanicalOpening: '',
        mechanicalClosing: '',
        electronicOpening: '',
        electronicClosing: '',
      })
    } catch (err: any) {
      setError(err.message || 'Failed to calculate sale')
    } finally {
      setLoading(false)
    }
  }

  const calculateVolumes = () => {
    const mechOpen = parseFloat(formData.mechanicalOpening)
    const mechClose = parseFloat(formData.mechanicalClosing)
    const elecOpen = parseFloat(formData.electronicOpening)
    const elecClose = parseFloat(formData.electronicClosing)

    if (!isNaN(mechOpen) && !isNaN(mechClose) && !isNaN(elecOpen) && !isNaN(elecClose)) {
      const mechVol = mechClose - mechOpen
      const elecVol = elecClose - elecOpen
      const avg = (mechVol + elecVol) / 2

      // Calculate discrepancy
      const avgVal = avg
      const diff = Math.abs(mechVol - elecVol)
      const discrepancy = avgVal > 0 ? (diff / avgVal) * 100 : 0

      return {
        mechanical: mechVol.toFixed(2),
        electronic: elecVol.toFixed(2),
        average: avg.toFixed(2),
        discrepancy: discrepancy.toFixed(4)
      }
    }
    return null
  }

  const volumes = calculateVolumes()

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-content-primary">Calculate Daily Sale</h1>
        <p className="mt-2 text-sm text-content-secondary">
          Enter opening and closing readings to calculate daily fuel sales
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-surface-card rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Reading Details</h2>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Shift Type, Shift ID and Fuel Type */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-content-secondary mb-1">
                  Shift Type
                </label>
                <select
                  value={shiftType}
                  onChange={(e) => setShiftType(e.target.value as 'DAY' | 'NIGHT')}
                  className="w-full px-3 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-action-primary focus:border-action-primary"
                  required
                >
                  <option value="DAY">Day Shift</option>
                  <option value="NIGHT">Night Shift</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-content-secondary mb-1">
                  Shift ID (Auto-generated)
                </label>
                <input
                  type="text"
                  value={formData.shiftId}
                  readOnly
                  className="w-full px-3 py-2 border border-surface-border rounded-md bg-surface-bg text-content-secondary cursor-not-allowed"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-content-secondary mb-1">
                  Fuel Type
                </label>
                <select
                  value={formData.fuelType}
                  onChange={(e) => {
                    const value = e.target.value
                    setFormData({ ...formData, fuelType: value })
                  }}
                  className="w-full px-3 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-action-primary focus:border-action-primary"
                  required
                >
                  <option value="Diesel">Diesel</option>
                  <option value="Petrol">Petrol</option>
                </select>
              </div>
            </div>

            {/* Mechanical Readings */}
            <div className="border-t pt-4">
              <h3 className="text-md font-semibold text-content-secondary mb-3">Mechanical Readings</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-content-secondary mb-1">
                    Opening Reading (Liters)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.mechanicalOpening}
                    onChange={(e) => setFormData({ ...formData, mechanicalOpening: e.target.value })}
                    className="w-full px-3 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-action-primary focus:border-action-primary"
                    placeholder="e.g., 10000.00"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-content-secondary mb-1">
                    Closing Reading (Liters)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.mechanicalClosing}
                    onChange={(e) => setFormData({ ...formData, mechanicalClosing: e.target.value })}
                    className="w-full px-3 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-action-primary focus:border-action-primary"
                    placeholder="e.g., 12345.50"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Electronic Readings */}
            <div className="border-t pt-4">
              <h3 className="text-md font-semibold text-content-secondary mb-3">Electronic Readings</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-content-secondary mb-1">
                    Opening Reading (Liters)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.electronicOpening}
                    onChange={(e) => setFormData({ ...formData, electronicOpening: e.target.value })}
                    className="w-full px-3 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-action-primary focus:border-action-primary"
                    placeholder="e.g., 10000.00"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-content-secondary mb-1">
                    Closing Reading (Liters)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.electronicClosing}
                    onChange={(e) => setFormData({ ...formData, electronicClosing: e.target.value })}
                    className="w-full px-3 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-action-primary focus:border-action-primary"
                    placeholder="e.g., 12345.00"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Volume Preview */}
            {volumes && (
              <div className="p-4 bg-action-primary-light border border-action-primary rounded-md">
                <h4 className="text-sm font-semibold text-action-primary mb-2">Calculated Volumes</h4>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-action-primary">Mechanical</p>
                    <p className="font-bold text-action-primary">{volumes.mechanical} L</p>
                  </div>
                  <div>
                    <p className="text-action-primary">Electronic</p>
                    <p className="font-bold text-action-primary">{volumes.electronic} L</p>
                  </div>
                  <div>
                    <p className="text-action-primary">Discrepancy</p>
                    <p className={`font-bold ${parseFloat(volumes.discrepancy) > 0.03 ? 'text-status-error' : 'text-status-success'}`}>
                      {volumes.discrepancy}%
                    </p>
                  </div>
                </div>
                {parseFloat(volumes.discrepancy) > 0.03 && (
                  <p className="text-xs text-status-error mt-2">
                    ⚠ Warning: Discrepancy exceeds 0.03% limit
                  </p>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full px-4 py-2 bg-action-primary text-white rounded-md hover:bg-action-primary-hover focus:outline-none focus:ring-2 focus:ring-action-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Calculating...' : 'Calculate Sale'}
            </button>
          </form>
        </div>

        <div className="bg-surface-card rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Result</h2>

          {error && (
            <div className="p-4 bg-status-error-light border border-status-error rounded-md">
              <p className="text-sm font-medium text-status-error">Error</p>
              <p className="text-sm text-status-error mt-2">{error}</p>
            </div>
          )}

          {result && (
            <div className="space-y-4">
              <div className="p-4 bg-status-success-light border border-status-success rounded-md">
                <p className="text-sm font-medium text-status-success">✓ Sale Calculated</p>
                <p className="text-sm text-status-success mt-1">ID: {result.sale_id}</p>
              </div>

              <div className="space-y-3">
                <div>
                  <p className="text-xs text-content-secondary">Fuel Type</p>
                  <p className="text-sm font-semibold">{result.fuel_type}</p>
                </div>

                <div className="border-t pt-3">
                  <p className="text-xs text-content-secondary mb-2">Volumes</p>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-content-secondary">Mechanical:</span>
                      <span className="font-mono">{result.mechanical_volume.toFixed(2)} L</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-content-secondary">Electronic:</span>
                      <span className="font-mono">{result.electronic_volume.toFixed(2)} L</span>
                    </div>
                    <div className="flex justify-between font-semibold">
                      <span className="text-content-secondary">Average:</span>
                      <span className="font-mono">{result.average_volume.toFixed(2)} L</span>
                    </div>
                  </div>
                </div>

                <div className="border-t pt-3">
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-content-secondary">Unit Price:</span>
                    <span className="font-mono">K{result.unit_price.toFixed(2)}/L</span>
                  </div>
                  <div className="flex justify-between text-lg font-bold text-status-success">
                    <span>Total Amount:</span>
                    <span className="font-mono">K{result.total_amount.toFixed(2)}</span>
                  </div>
                </div>

                <div className="border-t pt-3">
                  <p className="text-xs text-content-secondary mb-1">Validation</p>
                  <div className="flex items-center space-x-2">
                    <span className={`px-2 py-1 rounded text-xs font-bold ${
                      result.validation_status === 'PASS'
                        ? 'bg-status-success-light text-status-success'
                        : 'bg-status-error-light text-status-error'
                    }`}>
                      {result.validation_status}
                    </span>
                    <span className="text-xs text-content-secondary">
                      {result.discrepancy_percent.toFixed(4)}% discrepancy
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {!result && !error && (
            <div className="text-center py-12 text-content-secondary">
              Fill in the form to calculate sale
            </div>
          )}

          <div className="mt-6 pt-6 border-t border-surface-border">
            <h3 className="text-sm font-semibold text-content-primary mb-3">How It Works</h3>
            <div className="text-xs text-content-secondary space-y-2">
              <p>1. Enter opening & closing readings</p>
              <p>2. System compares mechanical vs electronic</p>
              <p>3. Validates within 0.03% tolerance</p>
              <p>4. Calculates: Volume × Unit Price</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
