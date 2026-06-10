import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { getHeaders, authFetch } from '../lib/api'
import ExportButtons from '../components/ExportButtons'
import { ExportConfig } from '../lib/exportUtils'

const BASE = '/api/v1'

export default function Inventory() {
  const [activeTab, setActiveTab] = useState<'tanks' | 'lpg' | 'lubricants'>('tanks')

  // Tank State
  const [tanks, setTanks] = useState<any[]>([])

  // LPG State
  const [lpgAccessories, setLpgAccessories] = useState<any[]>([])
  const [lubricants, setLubricants] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchTanks()
    fetchLPGAccessories()
    fetchLubricants()
  }, [])

  const fetchTanks = async () => {
    try {
      const res = await authFetch(`${BASE}/tanks/levels`, { headers: getHeaders() })
      if (res.ok) {
        setTanks(await res.json())
      }
    } catch (err: any) {
      console.error('Failed to fetch tanks:', err)
    }
  }

  const fetchLPGAccessories = async () => {
    try {
      const res = await authFetch(`${BASE}/lpg-daily/accessories/inventory`, {
        headers: getHeaders()
      })
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
      const res = await authFetch(`${BASE}/lubricants-daily/products`, {
        headers: getHeaders()
      })
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
    if (location === 'Island 3') return 'bg-action-primary-light text-action-primary border-action-primary'
    if (location === 'Buffer') return 'bg-category-a-light text-category-a border-category-a-border'
    return 'bg-surface-bg text-content-primary border-surface-border'
  }

  const getExportConfig = useCallback((): ExportConfig | null => {
    if (activeTab === 'tanks' && tanks.length) {
      return {
        title: 'Inventory — Fuel Tanks',
        filename: `inventory_tanks_${new Date().toISOString().slice(0,10)}`,
        columns: [
          { header: 'Tank ID', key: 'tank_id' },
          { header: 'Fuel Type', key: 'fuel_type' },
          { header: 'Capacity (L)', key: 'capacity', format: 'number' },
          { header: 'Current Level (L)', key: 'current_level', format: 'number' },
          { header: '% Full', key: 'percent_full', format: 'percent' },
        ],
        data: tanks,
      }
    }
    if (activeTab === 'lpg' && lpgAccessories.length) {
      return {
        title: 'Inventory — LPG & Accessories',
        filename: `inventory_lpg_${new Date().toISOString().slice(0,10)}`,
        columns: [
          { header: 'Product Code', key: 'product_code' },
          { header: 'Description', key: 'description' },
          { header: 'Unit Price', key: 'unit_price', format: 'currency' },
          { header: 'Opening Stock', key: 'opening_stock', format: 'number' },
          { header: 'Current Stock', key: 'current_stock', format: 'number' },
        ],
        data: lpgAccessories,
      }
    }
    if (activeTab === 'lubricants' && lubricants.length) {
      return {
        title: 'Inventory — Lubricants',
        filename: `inventory_lubricants_${new Date().toISOString().slice(0,10)}`,
        columns: [
          { header: 'Product Code', key: 'product_code' },
          { header: 'Description', key: 'description' },
          { header: 'Category', key: 'category' },
          { header: 'Location', key: 'location' },
          { header: 'Unit Price', key: 'unit_price', format: 'currency' },
          { header: 'Current Stock', key: 'current_stock', format: 'number' },
        ],
        data: lubricants,
      }
    }
    return null
  }, [activeTab, tanks, lpgAccessories, lubricants])

  return (
    <div>
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-content-primary">Inventory Management</h1>
            <p className="mt-2 text-sm text-content-secondary">LPG Gas, Accessories, and Lubricants</p>
          </div>
          <ExportButtons getConfig={getExportConfig} />
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="mb-6 border-b border-surface-border">
        <nav className="-mb-px flex flex-wrap gap-2 sm:gap-8 overflow-x-auto">
          <button
            onClick={() => setActiveTab('tanks')}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'tanks'
                ? 'border-action-primary text-action-primary'
                : 'border-transparent text-content-secondary hover:text-content-secondary hover:border-surface-border'
            }`}
          >
            ⛽ Fuel Tanks
          </button>
          <button
            onClick={() => setActiveTab('lpg')}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'lpg'
                ? 'border-action-primary text-action-primary'
                : 'border-transparent text-content-secondary hover:text-content-secondary hover:border-surface-border'
            }`}
          >
            LPG & Accessories
          </button>
          <button
            onClick={() => setActiveTab('lubricants')}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'lubricants'
                ? 'border-action-primary text-action-primary'
                : 'border-transparent text-content-secondary hover:text-content-secondary hover:border-surface-border'
            }`}
          >
            Lubricants
          </button>
        </nav>
      </div>

      {/* Fuel Tanks Tab */}
      {activeTab === 'tanks' && (
        <div>
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-content-primary mb-2">Fuel Tank Inventory</h2>
            <p className="text-sm text-content-secondary">Current fuel levels and tank status</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {tanks.length === 0 && (
              <div className="col-span-full text-center py-8 text-content-secondary">
                No tanks configured. Add tanks in the setup wizard or Infrastructure page.
              </div>
            )}
            {tanks.map((tank: any, idx: number) => {
              const isDiesel = tank.fuel_type === 'Diesel'
              const pct = tank.percentage || (tank.capacity > 0 ? (tank.current_level / tank.capacity) * 100 : 0)
              const isLow = pct <= 25
              const isCritical = pct <= 10
              const tankLabel = tank.display_name || `${tank.fuel_type} Tank`

              return (
                <div key={tank.tank_id} className={`bg-gradient-to-br ${isDiesel ? 'from-fuel-diesel-light to-indigo-50' : 'from-fuel-petrol-light to-emerald-50'} rounded-lg shadow-lg p-6 border-2 ${isDiesel ? 'border-fuel-diesel-border' : 'border-fuel-petrol-border'}`}>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-2xl font-bold text-content-primary">{tankLabel}</h3>
                    <span className={`px-3 py-1 ${isDiesel ? 'bg-fuel-diesel-light text-fuel-diesel' : 'bg-fuel-petrol-light text-fuel-petrol'} rounded-full text-sm font-semibold`}>
                      {tank.tank_id}
                    </span>
                  </div>
                  <div className="space-y-4">
                    <div className={`bg-surface-card rounded-lg p-4 border ${isDiesel ? 'border-fuel-diesel-border' : 'border-fuel-petrol-border'}`}>
                      <p className="text-sm text-content-secondary">Current Level</p>
                      <p className={`text-3xl font-bold ${isCritical ? 'text-status-error' : isLow ? 'text-status-warning' : isDiesel ? 'text-fuel-diesel' : 'text-status-success'}`}>
                        {tank.current_level.toLocaleString()} L
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-surface-card rounded-lg p-3 border border-surface-border">
                        <p className="text-xs text-content-secondary">Capacity</p>
                        <p className="text-lg font-bold text-content-primary">{tank.capacity.toLocaleString()} L</p>
                      </div>
                      <div className="bg-surface-card rounded-lg p-3 border border-surface-border">
                        <p className="text-xs text-content-secondary">% Full</p>
                        <p className="text-lg font-bold text-content-primary">{pct.toFixed(1)}%</p>
                      </div>
                    </div>
                    <div className="bg-surface-card rounded-lg p-3 border border-surface-border">
                      <p className="text-xs text-content-secondary">Available Space</p>
                      <p className="text-sm font-bold text-content-primary">{(tank.capacity - tank.current_level).toLocaleString()} L</p>
                    </div>
                    {isCritical && (
                      <div className="bg-status-error-light rounded-lg p-3 border border-status-error">
                        <p className="text-xs text-status-error font-semibold">⚠️ Critical — Order fuel immediately</p>
                      </div>
                    )}
                    {isLow && !isCritical && (
                      <div className="bg-status-pending-light rounded-lg p-3 border border-status-warning">
                        <p className="text-xs text-status-warning font-semibold">⚠️ Low stock — Reorder soon</p>
                      </div>
                    )}
                    {!isLow && (
                      <div className="bg-status-success-light rounded-lg p-3 border border-status-success">
                        <p className="text-xs text-status-success font-semibold">Stock level good</p>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Record Delivery Link */}
          <div className="mt-6 bg-action-primary-light border border-action-primary rounded-lg p-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-action-primary">Need to record a fuel delivery?</h3>
              <p className="text-xs text-action-primary mt-1">Use the Fuel Operations page to record deliveries and track fuel intake</p>
            </div>
            <Link
              href="/fuel-operations"
              className="px-4 py-2 bg-action-primary text-white rounded-md hover:bg-action-primary-hover font-medium text-sm whitespace-nowrap"
            >
              Record Delivery &rarr;
            </Link>
          </div>
        </div>
      )}

      {/* LPG Accessories Tab */}
      {activeTab === 'lpg' && (
        <div>
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-content-primary mb-2">LPG Accessories Inventory</h2>
            <p className="text-sm text-content-secondary">Gas stoves, cookers, hoses, and regulators</p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {lpgAccessories.map(accessory => {
              const stockPercentage = (accessory.current_stock / accessory.opening_stock) * 100
              return (
                <div
                  key={accessory.product_code}
                  className="bg-surface-card rounded-lg shadow-lg p-6 border-2 border-surface-border hover:border-category-c-border transition-colors"
                >
                  <div className="mb-4">
                    <p className="text-xs text-content-secondary font-medium">Product Code</p>
                    <p className="text-sm font-bold text-content-secondary">{accessory.product_code}</p>
                  </div>

                  <h3 className="text-lg font-bold text-content-primary mb-4 min-h-[3rem]">
                    {accessory.description}
                  </h3>

                  {/* Price */}
                  <div className="mb-4 p-3 bg-action-primary-light rounded-lg border border-action-primary">
                    <p className="text-xs text-content-secondary">Unit Price</p>
                    <p className="text-2xl font-bold text-action-primary">
                      {formatCurrency(accessory.unit_price)}
                    </p>
                  </div>

                  {/* Stock Info */}
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-content-secondary">Current Stock</span>
                      <span className="text-xl font-bold text-content-primary">{accessory.current_stock}</span>
                    </div>

                    {/* Stock Progress Bar */}
                    <div>
                      <div className="flex justify-between text-xs text-content-secondary mb-1">
                        <span>Stock Level</span>
                        <span className="font-semibold">{stockPercentage.toFixed(0)}%</span>
                      </div>
                      <div className="w-full bg-surface-border rounded-full h-3 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${getStockStatusColor(
                            accessory.current_stock,
                            accessory.opening_stock
                          )}`}
                          style={{ width: `${Math.min(stockPercentage, 100)}%` }}
                        />
                      </div>
                    </div>

                    <div className="pt-3 border-t border-surface-border text-xs text-content-secondary">
                      Opening Stock: {accessory.opening_stock}
                    </div>
                  </div>

                  {/* Stock Status Alert */}
                  {stockPercentage <= 20 && (
                    <div className="mt-3 p-2 bg-status-error-light border border-status-error rounded">
                      <p className="text-xs text-status-error font-semibold">⚠️ Low Stock - Reorder Soon!</p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* LPG Info Panel */}
          <div className="mt-8 bg-category-c-light border border-category-c-border rounded-lg p-4">
            <h3 className="text-sm font-semibold text-category-c mb-2">LPG Products Information</h3>
            <ul className="text-sm text-category-c space-y-1">
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
            <h2 className="text-2xl font-bold text-content-primary mb-2">Lubricants Inventory</h2>
            <p className="text-sm text-content-secondary">Engine oils, transmission fluids, brake fluids, and coolants</p>
          </div>

          {/* Island 3 (Sales Location) */}
          <div className="mb-8">
            <h3 className="text-lg font-bold text-content-primary mb-4 flex items-center gap-2">
              <span className="px-3 py-1 bg-action-primary-light text-action-primary rounded-full text-sm">Island 3</span>
              Active Sales Location
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {lubricants.filter(lube => lube.location === 'Island 3').map(lube => {
                const stockPercentage = (lube.current_stock / lube.opening_stock) * 100
                const stockValue = lube.current_stock * lube.unit_price
                return (
                  <div
                    key={lube.product_code}
                    className="bg-surface-card rounded-lg shadow-lg p-5 border-2 border-action-primary hover:border-blue-400 transition-colors"
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex-1">
                        <p className="text-xs text-content-secondary font-medium">Code: {lube.product_code}</p>
                        <h3 className="font-bold text-content-primary mt-1">{lube.description}</h3>
                      </div>
                      <span className={`px-2 py-1 text-xs font-semibold rounded border ${getLocationBadgeColor(lube.location)}`}>
                        {lube.location}
                      </span>
                    </div>

                    <div className="mb-3 p-2 bg-surface-bg rounded border border-surface-border">
                      <p className="text-xs text-content-secondary">Category</p>
                      <p className="text-sm font-semibold text-content-primary">{lube.category}</p>
                    </div>

                    {/* Price & Stock Value */}
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <div>
                        <p className="text-xs text-content-secondary">Unit Price</p>
                        <p className="text-sm font-bold text-content-primary">{formatCurrency(lube.unit_price)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-content-secondary">Stock Value</p>
                        <p className="text-sm font-bold text-status-success">{formatCurrency(stockValue)}</p>
                      </div>
                    </div>

                    {/* Current Stock */}
                    <div className="mb-3">
                      <p className="text-xs text-content-secondary mb-1">Current Stock</p>
                      <p className="text-2xl font-bold text-content-primary">{lube.current_stock} units</p>
                    </div>

                    {/* Stock Progress */}
                    <div className="mb-2">
                      <div className="flex justify-between text-xs text-content-secondary mb-1">
                        <span>Stock Level</span>
                        <span className="font-semibold">{stockPercentage.toFixed(0)}%</span>
                      </div>
                      <div className="w-full bg-surface-border rounded-full h-3 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${getStockStatusColor(
                            lube.current_stock,
                            lube.opening_stock
                          )}`}
                          style={{ width: `${Math.min(stockPercentage, 100)}%` }}
                        />
                      </div>
                    </div>

                    <div className="text-xs text-content-secondary">
                      Opening: {lube.opening_stock} units
                    </div>

                    {stockPercentage <= 30 && (
                      <div className="mt-3 p-2 bg-status-pending-light border border-status-warning rounded">
                        <p className="text-xs text-status-warning font-semibold">⚠️ Transfer from Buffer Needed</p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Buffer Stock (Reserve) */}
          <div>
            <h3 className="text-lg font-bold text-content-primary mb-4 flex items-center gap-2">
              <span className="px-3 py-1 bg-category-a-light text-category-a rounded-full text-sm">Buffer</span>
              Reserve Stock
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {lubricants.filter(lube => lube.location === 'Buffer').map(lube => {
                const stockValue = lube.current_stock * lube.unit_price
                return (
                  <div
                    key={lube.product_code}
                    className="bg-surface-card rounded-lg shadow-lg p-5 border-2 border-category-a-border"
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex-1">
                        <p className="text-xs text-content-secondary font-medium">Code: {lube.product_code}</p>
                        <h3 className="font-bold text-content-primary mt-1">{lube.description}</h3>
                      </div>
                      <span className={`px-2 py-1 text-xs font-semibold rounded border ${getLocationBadgeColor(lube.location)}`}>
                        {lube.location}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <p className="text-xs text-content-secondary">Current Stock</p>
                        <p className="text-lg font-bold text-content-primary">{lube.current_stock}</p>
                      </div>
                      <div>
                        <p className="text-xs text-content-secondary">Unit Price</p>
                        <p className="text-sm font-semibold text-content-secondary">{formatCurrency(lube.unit_price)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-content-secondary">Total Value</p>
                        <p className="text-sm font-bold text-status-success">{formatCurrency(stockValue)}</p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Lubricants Info Panel */}
          <div className="mt-8 bg-status-success-light border border-status-success rounded-lg p-4">
            <h3 className="text-sm font-semibold text-status-success mb-2">Lubricants Inventory System</h3>
            <ul className="text-sm text-status-success space-y-1">
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
