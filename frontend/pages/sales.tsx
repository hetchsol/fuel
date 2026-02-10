import { authFetch, BASE } from '../lib/api'
import { useState, useEffect } from 'react'
import { useTheme } from '../contexts/ThemeContext'


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
  const { setFuelType } = useTheme()
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
        headers: { 'Content-Type': 'application/json' },
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
        <h1 className="text-3xl font-bold text-gray-900">Calculate Daily Sale</h1>
        <p className="mt-2 text-sm text-gray-600">
          Enter opening and closing readings to calculate daily fuel sales
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Reading Details</h2>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Shift Type, Shift ID and Fuel Type */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Shift Type
                </label>
                <select
                  value={shiftType}
                  onChange={(e) => setShiftType(e.target.value as 'DAY' | 'NIGHT')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  required
                >
                  <option value="DAY">Day Shift</option>
                  <option value="NIGHT">Night Shift</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Shift ID (Auto-generated)
                </label>
                <input
                  type="text"
                  value={formData.shiftId}
                  readOnly
                  className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-700 cursor-not-allowed"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Fuel Type
                </label>
                <select
                  value={formData.fuelType}
                  onChange={(e) => {
                    const value = e.target.value
                    setFormData({ ...formData, fuelType: value })
                    // Update theme based on fuel selection
                    if (value.toLowerCase() === 'diesel') {
                      setFuelType('diesel')
                    } else if (value.toLowerCase() === 'petrol') {
                      setFuelType('petrol')
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  required
                >
                  <option value="Diesel">Diesel</option>
                  <option value="Petrol">Petrol</option>
                </select>
              </div>
            </div>

            {/* Mechanical Readings */}
            <div className="border-t pt-4">
              <h3 className="text-md font-semibold text-gray-700 mb-3">Mechanical Readings</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Opening Reading (Liters)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.mechanicalOpening}
                    onChange={(e) => setFormData({ ...formData, mechanicalOpening: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="e.g., 10000.00"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Closing Reading (Liters)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.mechanicalClosing}
                    onChange={(e) => setFormData({ ...formData, mechanicalClosing: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="e.g., 12345.50"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Electronic Readings */}
            <div className="border-t pt-4">
              <h3 className="text-md font-semibold text-gray-700 mb-3">Electronic Readings</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Opening Reading (Liters)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.electronicOpening}
                    onChange={(e) => setFormData({ ...formData, electronicOpening: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="e.g., 10000.00"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Closing Reading (Liters)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.electronicClosing}
                    onChange={(e) => setFormData({ ...formData, electronicClosing: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="e.g., 12345.00"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Volume Preview */}
            {volumes && (
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-md">
                <h4 className="text-sm font-semibold text-blue-900 mb-2">Calculated Volumes</h4>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-blue-700">Mechanical</p>
                    <p className="font-bold text-blue-900">{volumes.mechanical} L</p>
                  </div>
                  <div>
                    <p className="text-blue-700">Electronic</p>
                    <p className="font-bold text-blue-900">{volumes.electronic} L</p>
                  </div>
                  <div>
                    <p className="text-blue-700">Discrepancy</p>
                    <p className={`font-bold ${parseFloat(volumes.discrepancy) > 0.03 ? 'text-red-600' : 'text-green-600'}`}>
                      {volumes.discrepancy}%
                    </p>
                  </div>
                </div>
                {parseFloat(volumes.discrepancy) > 0.03 && (
                  <p className="text-xs text-red-600 mt-2">
                    ⚠ Warning: Discrepancy exceeds 0.03% limit
                  </p>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Calculating...' : 'Calculate Sale'}
            </button>
          </form>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Result</h2>

          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm font-medium text-red-900">Error</p>
              <p className="text-sm text-red-700 mt-2">{error}</p>
            </div>
          )}

          {result && (
            <div className="space-y-4">
              <div className="p-4 bg-green-50 border border-green-200 rounded-md">
                <p className="text-sm font-medium text-green-900">✓ Sale Calculated</p>
                <p className="text-sm text-green-700 mt-1">ID: {result.sale_id}</p>
              </div>

              <div className="space-y-3">
                <div>
                  <p className="text-xs text-gray-500">Fuel Type</p>
                  <p className="text-sm font-semibold">{result.fuel_type}</p>
                </div>

                <div className="border-t pt-3">
                  <p className="text-xs text-gray-500 mb-2">Volumes</p>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Mechanical:</span>
                      <span className="font-mono">{result.mechanical_volume.toFixed(2)} L</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Electronic:</span>
                      <span className="font-mono">{result.electronic_volume.toFixed(2)} L</span>
                    </div>
                    <div className="flex justify-between font-semibold">
                      <span className="text-gray-700">Average:</span>
                      <span className="font-mono">{result.average_volume.toFixed(2)} L</span>
                    </div>
                  </div>
                </div>

                <div className="border-t pt-3">
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-gray-600">Unit Price:</span>
                    <span className="font-mono">K{result.unit_price.toFixed(2)}/L</span>
                  </div>
                  <div className="flex justify-between text-lg font-bold text-green-700">
                    <span>Total Amount:</span>
                    <span className="font-mono">K{result.total_amount.toFixed(2)}</span>
                  </div>
                </div>

                <div className="border-t pt-3">
                  <p className="text-xs text-gray-500 mb-1">Validation</p>
                  <div className="flex items-center space-x-2">
                    <span className={`px-2 py-1 rounded text-xs font-bold ${
                      result.validation_status === 'PASS'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {result.validation_status}
                    </span>
                    <span className="text-xs text-gray-600">
                      {result.discrepancy_percent.toFixed(4)}% discrepancy
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {!result && !error && (
            <div className="text-center py-12 text-gray-500">
              Fill in the form to calculate sale
            </div>
          )}

          <div className="mt-6 pt-6 border-t border-gray-200">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">How It Works</h3>
            <div className="text-xs text-gray-600 space-y-2">
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
