import { useState, useEffect } from 'react'

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000/api/v1'

export default function Inventory() {
  const [activeTab, setActiveTab] = useState<'lpg' | 'lubricants'>('lpg')

  // LPG State
  const [lpgAccessories, setLpgAccessories] = useState<any[]>([])
  const [lubricants, setLubricants] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

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
