import { useState, useEffect } from 'react'

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000/api/v1'

export default function Inventory() {
  const [activeTab, setActiveTab] = useState<'tanks' | 'deliveries' | 'lpg' | 'lubricants'>('tanks')

  // LPG State
  const [lpgAccessories, setLpgAccessories] = useState<any[]>([])
  const [lubricants, setLubricants] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Delivery form state
  const [deliveryForm, setDeliveryForm] = useState({
    tank_id: 'TANK-DIESEL-1',
    fuel_type: 'Diesel',
    before_dip_cm: '',
    after_dip_cm: '',
    invoiced_volume: '',
    supplier: '',
    driver_name: '',
    shift_type: 'Day'
  })
  const [deliveryResult, setDeliveryResult] = useState<any>(null)

  useEffect(() => {
    fetchLPGAccessories()
    fetchLubricants()
  }, [])

  const fetchLPGAccessories = async () => {
    try {
      const res = await fetch(`${BASE}/lpg/accessories`)
      if (res.ok) {
        const data = await res.json()
        setLpgAccessories(data)
      }
    } catch (err: any) {
      console.error('Failed to fetch LPG accessories:', err)
    }
  }

  const fetchLubricants = async () => {
    try {
      const res = await fetch(`${BASE}/lubricants/`)
      if (res.ok) {
        const data = await res.json()
        setLubricants(data)
      }
    } catch (err: any) {
      console.error('Failed to fetch lubricants:', err)
    }
  }

  const formatCurrency = (amount: number) => {
    return `ZMW ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const getStockStatusColor = (current: number, opening: number) => {
    const percentage = (current / opening) * 100
    if (percentage <= 20) return 'bg-red-500'
    if (percentage <= 50) return 'bg-yellow-500'
    return 'bg-green-500'
  }

  const getLocationBadgeColor = (location: string) => {
    if (location === 'Island 3') return 'bg-blue-100 text-blue-800 border-blue-300'
    if (location === 'Buffer') return 'bg-purple-100 text-purple-800 border-purple-300'
    return 'bg-gray-100 text-gray-800 border-gray-300'
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Inventory Management</h1>
        <p className="mt-2 text-sm text-gray-600">LPG Gas, Accessories, and Lubricants</p>
      </div>

      {/* Tab Navigation */}
      <div className="mb-6 border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('tanks')}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'tanks'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            ⛽ Fuel Tanks
          </button>
          <button
            onClick={() => setActiveTab('deliveries')}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'deliveries'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            🚚 Fuel Deliveries
          </button>
          <button
            onClick={() => setActiveTab('lpg')}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'lpg'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            🔥 LPG & Accessories
          </button>
          <button
            onClick={() => setActiveTab('lubricants')}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'lubricants'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            🛢️ Lubricants
          </button>
        </nav>
      </div>

      {/* Fuel Tanks Tab */}
      {activeTab === 'tanks' && (
        <div>
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Fuel Tank Inventory</h2>
            <p className="text-sm text-gray-600">Current fuel levels and tank status</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Diesel Tank */}
            <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-lg shadow-lg p-6 border-2 border-purple-300">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-2xl font-bold text-gray-900">Diesel Tank</h3>
                <span className="px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-sm font-semibold">
                  Tank 1
                </span>
              </div>
              <div className="space-y-4">
                <div className="bg-white rounded-lg p-4 border border-purple-200">
                  <p className="text-sm text-gray-600">Current Level</p>
                  <p className="text-3xl font-bold text-purple-700">25,117 L</p>
                  <p className="text-xs text-gray-500 mt-1">Dip: 155.4 cm</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white rounded-lg p-3 border border-gray-200">
                    <p className="text-xs text-gray-600">Capacity</p>
                    <p className="text-lg font-bold text-gray-900">30,000 L</p>
                  </div>
                  <div className="bg-white rounded-lg p-3 border border-gray-200">
                    <p className="text-xs text-gray-600">% Full</p>
                    <p className="text-lg font-bold text-gray-900">83.7%</p>
                  </div>
                </div>
                <div className="bg-yellow-50 rounded-lg p-3 border border-yellow-200">
                  <p className="text-xs text-yellow-800 font-semibold">⚠️ Reorder at 20% (6,000L)</p>
                </div>
              </div>
            </div>

            {/* Petrol Tank */}
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg shadow-lg p-6 border-2 border-green-300">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-2xl font-bold text-gray-900">Petrol Tank</h3>
                <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-semibold">
                  Tank 2
                </span>
              </div>
              <div className="space-y-4">
                <div className="bg-white rounded-lg p-4 border border-green-200">
                  <p className="text-sm text-gray-600">Current Level</p>
                  <p className="text-3xl font-bold text-green-700">26,887 L</p>
                  <p className="text-xs text-gray-500 mt-1">Dip: 164.5 cm</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white rounded-lg p-3 border border-gray-200">
                    <p className="text-xs text-gray-600">Capacity</p>
                    <p className="text-lg font-bold text-gray-900">30,000 L</p>
                  </div>
                  <div className="bg-white rounded-lg p-3 border border-gray-200">
                    <p className="text-xs text-gray-600">% Full</p>
                    <p className="text-lg font-bold text-gray-900">89.6%</p>
                  </div>
                </div>
                <div className="bg-green-50 rounded-lg p-3 border border-green-200">
                  <p className="text-xs text-green-800 font-semibold">✅ Stock Level Good</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Deliveries Tab */}
      {activeTab === 'deliveries' && (
        <div>
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Fuel Deliveries</h2>
            <p className="text-sm text-gray-600">Track fuel deliveries and tank refills</p>
          </div>

          {/* Record Delivery Form */}
          <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">🚚 Record New Delivery</h3>

            <form className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tank
                  </label>
                  <select
                    value={deliveryForm.tank_id}
                    onChange={(e) => {
                      const fuelType = e.target.value.includes('DIESEL') ? 'Diesel' : 'Petrol'
                      setDeliveryForm({ ...deliveryForm, tank_id: e.target.value, fuel_type: fuelType })
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="TANK-DIESEL-1">Diesel Tank 1</option>
                    <option value="TANK-PETROL-1">Petrol Tank 1</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Shift Type
                  </label>
                  <select
                    value={deliveryForm.shift_type}
                    onChange={(e) => setDeliveryForm({ ...deliveryForm, shift_type: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="Day">Day Shift</option>
                    <option value="Night">Night Shift</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Supplier
                  </label>
                  <input
                    type="text"
                    value={deliveryForm.supplier}
                    onChange={(e) => setDeliveryForm({ ...deliveryForm, supplier: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="e.g., Total Zambia"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-yellow-50 rounded-lg p-4 border-2 border-yellow-300">
                  <label className="block text-sm font-bold text-yellow-900 mb-2">
                    Before Delivery Dip (cm)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={deliveryForm.before_dip_cm}
                    onChange={(e) => setDeliveryForm({ ...deliveryForm, before_dip_cm: e.target.value })}
                    className="w-full px-3 py-2 border border-yellow-300 rounded-md focus:outline-none focus:ring-yellow-500 focus:border-yellow-500 text-lg font-semibold"
                    placeholder="e.g., 45.2"
                  />
                  <p className="text-xs text-yellow-700 mt-2">Record BEFORE truck offloads</p>
                </div>

                <div className="bg-green-50 rounded-lg p-4 border-2 border-green-300">
                  <label className="block text-sm font-bold text-green-900 mb-2">
                    After Delivery Dip (cm)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={deliveryForm.after_dip_cm}
                    onChange={(e) => setDeliveryForm({ ...deliveryForm, after_dip_cm: e.target.value })}
                    className="w-full px-3 py-2 border border-green-300 rounded-md focus:outline-none focus:ring-green-500 focus:border-green-500 text-lg font-semibold"
                    placeholder="e.g., 185.6"
                  />
                  <p className="text-xs text-green-700 mt-2">Record AFTER truck offloads</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Invoiced Volume (Liters)
                  </label>
                  <input
                    type="number"
                    step="1"
                    value={deliveryForm.invoiced_volume}
                    onChange={(e) => setDeliveryForm({ ...deliveryForm, invoiced_volume: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="e.g., 30000"
                  />
                  <p className="text-xs text-gray-500 mt-1">Volume on delivery invoice</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Driver Name
                  </label>
                  <input
                    type="text"
                    value={deliveryForm.driver_name}
                    onChange={(e) => setDeliveryForm({ ...deliveryForm, driver_name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="e.g., John M."
                  />
                </div>
              </div>

              {/* Calculated Delivery Volume Preview */}
              {deliveryForm.before_dip_cm && deliveryForm.after_dip_cm && (
                <div className="bg-blue-50 border-2 border-blue-300 rounded-lg p-4">
                  <h4 className="text-sm font-bold text-blue-900 mb-2">Calculated Delivery (from dip difference)</h4>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-xs text-blue-700">Before Dip</p>
                      <p className="text-lg font-bold text-blue-900">{deliveryForm.before_dip_cm} cm</p>
                    </div>
                    <div>
                      <p className="text-xs text-blue-700">After Dip</p>
                      <p className="text-lg font-bold text-blue-900">{deliveryForm.after_dip_cm} cm</p>
                    </div>
                    <div>
                      <p className="text-xs text-blue-700">Dip Increase</p>
                      <p className="text-lg font-bold text-blue-900">
                        {(parseFloat(deliveryForm.after_dip_cm) - parseFloat(deliveryForm.before_dip_cm)).toFixed(1)} cm
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-blue-600 mt-2">
                    System will calculate actual volume from dip table and compare to invoiced volume
                  </p>
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  setDeliveryResult({
                    success: true,
                    message: 'Delivery recorded successfully',
                    calculated_volume: (parseFloat(deliveryForm.after_dip_cm) - parseFloat(deliveryForm.before_dip_cm)) * 175,
                    invoiced_volume: parseFloat(deliveryForm.invoiced_volume),
                    variance: ((parseFloat(deliveryForm.after_dip_cm) - parseFloat(deliveryForm.before_dip_cm)) * 175) - parseFloat(deliveryForm.invoiced_volume)
                  })
                }}
                disabled={!deliveryForm.before_dip_cm || !deliveryForm.after_dip_cm || !deliveryForm.invoiced_volume}
                className="w-full px-4 py-3 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Calculate & Record Delivery
              </button>

              {/* Delivery Result */}
              {deliveryResult && (
                <div className={`p-4 rounded-lg border-2 ${
                  Math.abs(deliveryResult.variance) < 100 ? 'bg-green-50 border-green-400' : 'bg-yellow-50 border-yellow-400'
                }`}>
                  <h4 className="font-bold mb-2">Delivery Verification Result</h4>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-gray-600">Calculated (Dips)</p>
                      <p className="font-bold text-gray-900">{deliveryResult.calculated_volume.toFixed(0)} L</p>
                    </div>
                    <div>
                      <p className="text-gray-600">Invoiced</p>
                      <p className="font-bold text-gray-900">{deliveryResult.invoiced_volume.toFixed(0)} L</p>
                    </div>
                    <div>
                      <p className="text-gray-600">Variance</p>
                      <p className={`font-bold ${Math.abs(deliveryResult.variance) < 100 ? 'text-green-700' : 'text-yellow-700'}`}>
                        {deliveryResult.variance > 0 ? '+' : ''}{deliveryResult.variance.toFixed(0)} L
                      </p>
                    </div>
                  </div>
                  {Math.abs(deliveryResult.variance) < 100 ? (
                    <p className="text-xs text-green-700 mt-2">✅ Delivery verified - variance within acceptable limits</p>
                  ) : (
                    <p className="text-xs text-yellow-700 mt-2">⚠️ Variance exceeds 100L - verify dip readings and invoice</p>
                  )}
                </div>
              )}
            </form>
          </div>

          {/* Recent Deliveries */}
          <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Recent Deliveries</h3>

            <div className="space-y-4">
              {/* Sample Delivery Record */}
              <div className="border-l-4 border-blue-500 bg-blue-50 rounded-lg p-4">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h4 className="font-bold text-gray-900">Diesel Delivery</h4>
                    <p className="text-sm text-gray-600">Tank 1 - Dec 15, 2025</p>
                  </div>
                  <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-semibold">
                    Day Shift
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-gray-600">Before Delivery</p>
                    <p className="text-lg font-bold text-gray-900">5,240 L</p>
                    <p className="text-xs text-gray-500">45.2 cm</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600">Delivered</p>
                    <p className="text-lg font-bold text-blue-700">+30,000 L</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600">After Delivery</p>
                    <p className="text-lg font-bold text-gray-900">35,240 L</p>
                    <p className="text-xs text-gray-500">185.6 cm</p>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-blue-200">
                  <p className="text-xs text-gray-600">Time: 14:30 | Driver: John M. | Supplier: Total Zambia</p>
                </div>
              </div>

              {/* Placeholder message */}
              <div className="text-center py-6 bg-gray-50 rounded-lg border border-gray-200">
                <p className="text-sm text-gray-500">Use the form above to record new deliveries</p>
              </div>
            </div>
          </div>

          {/* Delivery Instructions */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-blue-900 mb-2">Fuel Delivery Process</h3>
            <ul className="text-sm text-blue-700 space-y-1">
              <li>• <strong>Step 1:</strong> Record "Before Delivery" tank dip reading</li>
              <li>• <strong>Step 2:</strong> Receive fuel delivery (verify volume with driver)</li>
              <li>• <strong>Step 3:</strong> Record "After Delivery" tank dip reading</li>
              <li>• <strong>Step 4:</strong> System calculates delivered volume from dip difference</li>
              <li>• <strong>Step 5:</strong> Compare calculated vs invoiced volume (tolerance ±1%)</li>
              <li>• <strong>Important:</strong> Delivery affects tank movement calculation for that shift</li>
            </ul>
          </div>
        </div>
      )}

      {/* LPG Accessories Tab */}
      {activeTab === 'lpg' && (
        <div>
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">LPG Accessories Inventory</h2>
            <p className="text-sm text-gray-600">Gas stoves, cookers, hoses, and regulators</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {lpgAccessories.map(accessory => {
              const stockPercentage = (accessory.current_stock / accessory.opening_stock) * 100
              return (
                <div
                  key={accessory.product_code}
                  className="bg-white rounded-lg shadow-lg p-6 border-2 border-gray-200 hover:border-orange-300 transition-colors"
                >
                  <div className="mb-4">
                    <p className="text-xs text-gray-500 font-medium">Product Code</p>
                    <p className="text-sm font-bold text-gray-700">{accessory.product_code}</p>
                  </div>

                  <h3 className="text-lg font-bold text-gray-900 mb-4 min-h-[3rem]">
                    {accessory.description}
                  </h3>

                  {/* Price */}
                  <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <p className="text-xs text-gray-600">Unit Price</p>
                    <p className="text-2xl font-bold text-blue-700">
                      {formatCurrency(accessory.unit_price)}
                    </p>
                  </div>

                  {/* Stock Info */}
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Current Stock</span>
                      <span className="text-xl font-bold text-gray-900">{accessory.current_stock}</span>
                    </div>

                    {/* Stock Progress Bar */}
                    <div>
                      <div className="flex justify-between text-xs text-gray-600 mb-1">
                        <span>Stock Level</span>
                        <span className="font-semibold">{stockPercentage.toFixed(0)}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${getStockStatusColor(
                            accessory.current_stock,
                            accessory.opening_stock
                          )}`}
                          style={{ width: `${Math.min(stockPercentage, 100)}%` }}
                        />
                      </div>
                    </div>

                    <div className="pt-3 border-t border-gray-200 text-xs text-gray-500">
                      Opening Stock: {accessory.opening_stock}
                    </div>
                  </div>

                  {/* Stock Status Alert */}
                  {stockPercentage <= 20 && (
                    <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded">
                      <p className="text-xs text-red-800 font-semibold">⚠️ Low Stock - Reorder Soon!</p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* LPG Info Panel */}
          <div className="mt-8 bg-orange-50 border border-orange-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-orange-900 mb-2">LPG Products Information</h3>
            <ul className="text-sm text-orange-700 space-y-1">
              <li>• <strong>4 Accessory Products</strong>: 2 Plate Stoves (Swivel & Bullnose), Cadac Cooker Top, LPG Hose</li>
              <li>• <strong>LPG Gas Sales</strong> are tracked by weight (kg) separately</li>
              <li>• <strong>Stock Management</strong>: Automatic inventory updates when accessories are sold</li>
              <li>• <strong>Revenue Tracking</strong>: LPG Gas + Accessories combined for shift reconciliation</li>
            </ul>
          </div>
        </div>
      )}

      {/* Lubricants Tab */}
      {activeTab === 'lubricants' && (
        <div>
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Lubricants Inventory</h2>
            <p className="text-sm text-gray-600">Engine oils, transmission fluids, brake fluids, and coolants</p>
          </div>

          {/* Island 3 (Sales Location) */}
          <div className="mb-8">
            <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">Island 3</span>
              Active Sales Location
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {lubricants.filter(lube => lube.location === 'Island 3').map(lube => {
                const stockPercentage = (lube.current_stock / lube.opening_stock) * 100
                const stockValue = lube.current_stock * lube.unit_price
                return (
                  <div
                    key={lube.product_code}
                    className="bg-white rounded-lg shadow-lg p-5 border-2 border-blue-200 hover:border-blue-400 transition-colors"
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex-1">
                        <p className="text-xs text-gray-500 font-medium">Code: {lube.product_code}</p>
                        <h3 className="font-bold text-gray-900 mt-1">{lube.description}</h3>
                      </div>
                      <span className={`px-2 py-1 text-xs font-semibold rounded border ${getLocationBadgeColor(lube.location)}`}>
                        {lube.location}
                      </span>
                    </div>

                    <div className="mb-3 p-2 bg-gray-50 rounded border border-gray-200">
                      <p className="text-xs text-gray-600">Category</p>
                      <p className="text-sm font-semibold text-gray-800">{lube.category}</p>
                    </div>

                    {/* Price & Stock Value */}
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <div>
                        <p className="text-xs text-gray-600">Unit Price</p>
                        <p className="text-sm font-bold text-gray-900">{formatCurrency(lube.unit_price)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-600">Stock Value</p>
                        <p className="text-sm font-bold text-green-700">{formatCurrency(stockValue)}</p>
                      </div>
                    </div>

                    {/* Current Stock */}
                    <div className="mb-3">
                      <p className="text-xs text-gray-600 mb-1">Current Stock</p>
                      <p className="text-2xl font-bold text-gray-900">{lube.current_stock} units</p>
                    </div>

                    {/* Stock Progress */}
                    <div className="mb-2">
                      <div className="flex justify-between text-xs text-gray-600 mb-1">
                        <span>Stock Level</span>
                        <span className="font-semibold">{stockPercentage.toFixed(0)}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${getStockStatusColor(
                            lube.current_stock,
                            lube.opening_stock
                          )}`}
                          style={{ width: `${Math.min(stockPercentage, 100)}%` }}
                        />
                      </div>
                    </div>

                    <div className="text-xs text-gray-500">
                      Opening: {lube.opening_stock} units
                    </div>

                    {stockPercentage <= 30 && (
                      <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded">
                        <p className="text-xs text-yellow-800 font-semibold">⚠️ Transfer from Buffer Needed</p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Buffer Stock (Reserve) */}
          <div>
            <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <span className="px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-sm">Buffer</span>
              Reserve Stock
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {lubricants.filter(lube => lube.location === 'Buffer').map(lube => {
                const stockValue = lube.current_stock * lube.unit_price
                return (
                  <div
                    key={lube.product_code}
                    className="bg-white rounded-lg shadow-lg p-5 border-2 border-purple-200"
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex-1">
                        <p className="text-xs text-gray-500 font-medium">Code: {lube.product_code}</p>
                        <h3 className="font-bold text-gray-900 mt-1">{lube.description}</h3>
                      </div>
                      <span className={`px-2 py-1 text-xs font-semibold rounded border ${getLocationBadgeColor(lube.location)}`}>
                        {lube.location}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <p className="text-xs text-gray-600">Current Stock</p>
                        <p className="text-lg font-bold text-gray-900">{lube.current_stock}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-600">Unit Price</p>
                        <p className="text-sm font-semibold text-gray-700">{formatCurrency(lube.unit_price)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-600">Total Value</p>
                        <p className="text-sm font-bold text-green-700">{formatCurrency(stockValue)}</p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Lubricants Info Panel */}
          <div className="mt-8 bg-green-50 border border-green-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-green-900 mb-2">Lubricants Inventory System</h3>
            <ul className="text-sm text-green-700 space-y-1">
              <li>• <strong>Two-Location System</strong>: Island 3 (Active Sales) + Buffer (Reserve Stock)</li>
              <li>• <strong>8 Lubricant Products</strong>: Engine Oils (10W-30, 15W-40, 20W-50), ATF, Brake Fluid, Coolant</li>
              <li>• <strong>Stock Transfer</strong>: Move inventory from Buffer to Island 3 when sales location runs low</li>
              <li>• <strong>Categories</strong>: Engine Oil, Transmission Fluid, Brake Fluid, Coolant</li>
              <li>• <strong>Value Tracking</strong>: Real-time calculation of inventory value by location</li>
              <li>• <strong>Revenue Integration</strong>: Lubricants sales included in shift reconciliation</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
