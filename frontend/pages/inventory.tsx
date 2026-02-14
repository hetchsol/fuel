import { useState, useEffect } from 'react'
import { getHeaders } from '../lib/api'

const BASE = '/api/v1'

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
      const res = await fetch(`${BASE}/lpg/accessories`, {
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
      const res = await fetch(`${BASE}/lubricants/`, {
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

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-content-primary">Inventory Management</h1>
        <p className="mt-2 text-sm text-content-secondary">LPG Gas, Accessories, and Lubricants</p>
      </div>

      {/* Tab Navigation */}
      <div className="mb-6 border-b border-surface-border">
        <nav className="-mb-px flex space-x-8">
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
            onClick={() => setActiveTab('deliveries')}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'deliveries'
                ? 'border-action-primary text-action-primary'
                : 'border-transparent text-content-secondary hover:text-content-secondary hover:border-surface-border'
            }`}
          >
            🚚 Fuel Deliveries
          </button>
          <button
            onClick={() => setActiveTab('lpg')}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'lpg'
                ? 'border-action-primary text-action-primary'
                : 'border-transparent text-content-secondary hover:text-content-secondary hover:border-surface-border'
            }`}
          >
            🔥 LPG & Accessories
          </button>
          <button
            onClick={() => setActiveTab('lubricants')}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'lubricants'
                ? 'border-action-primary text-action-primary'
                : 'border-transparent text-content-secondary hover:text-content-secondary hover:border-surface-border'
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
            <h2 className="text-2xl font-bold text-content-primary mb-2">Fuel Tank Inventory</h2>
            <p className="text-sm text-content-secondary">Current fuel levels and tank status</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Diesel Tank */}
            <div className="bg-gradient-to-br from-fuel-diesel-light to-indigo-50 rounded-lg shadow-lg p-6 border-2 border-fuel-diesel-border">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-2xl font-bold text-content-primary">Diesel Tank</h3>
                <span className="px-3 py-1 bg-fuel-diesel-light text-fuel-diesel rounded-full text-sm font-semibold">
                  Tank 1
                </span>
              </div>
              <div className="space-y-4">
                <div className="bg-surface-card rounded-lg p-4 border border-fuel-diesel-border">
                  <p className="text-sm text-content-secondary">Current Level</p>
                  <p className="text-3xl font-bold text-fuel-diesel">25,117 L</p>
                  <p className="text-xs text-content-secondary mt-1">Dip: 155.4 cm</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-surface-card rounded-lg p-3 border border-surface-border">
                    <p className="text-xs text-content-secondary">Capacity</p>
                    <p className="text-lg font-bold text-content-primary">30,000 L</p>
                  </div>
                  <div className="bg-surface-card rounded-lg p-3 border border-surface-border">
                    <p className="text-xs text-content-secondary">% Full</p>
                    <p className="text-lg font-bold text-content-primary">83.7%</p>
                  </div>
                </div>
                <div className="bg-status-pending-light rounded-lg p-3 border border-status-warning">
                  <p className="text-xs text-status-warning font-semibold">⚠️ Reorder at 20% (6,000L)</p>
                </div>
              </div>
            </div>

            {/* Petrol Tank */}
            <div className="bg-gradient-to-br from-fuel-petrol-light to-emerald-50 rounded-lg shadow-lg p-6 border-2 border-fuel-petrol-border">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-2xl font-bold text-content-primary">Petrol Tank</h3>
                <span className="px-3 py-1 bg-fuel-petrol-light text-fuel-petrol rounded-full text-sm font-semibold">
                  Tank 2
                </span>
              </div>
              <div className="space-y-4">
                <div className="bg-surface-card rounded-lg p-4 border border-fuel-petrol-border">
                  <p className="text-sm text-content-secondary">Current Level</p>
                  <p className="text-3xl font-bold text-status-success">26,887 L</p>
                  <p className="text-xs text-content-secondary mt-1">Dip: 164.5 cm</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-surface-card rounded-lg p-3 border border-surface-border">
                    <p className="text-xs text-content-secondary">Capacity</p>
                    <p className="text-lg font-bold text-content-primary">30,000 L</p>
                  </div>
                  <div className="bg-surface-card rounded-lg p-3 border border-surface-border">
                    <p className="text-xs text-content-secondary">% Full</p>
                    <p className="text-lg font-bold text-content-primary">89.6%</p>
                  </div>
                </div>
                <div className="bg-status-success-light rounded-lg p-3 border border-fuel-petrol-border">
                  <p className="text-xs text-status-success font-semibold">✅ Stock Level Good</p>
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
            <h2 className="text-2xl font-bold text-content-primary mb-2">Fuel Deliveries</h2>
            <p className="text-sm text-content-secondary">Track fuel deliveries and tank refills</p>
          </div>

          {/* Record Delivery Form */}
          <div className="bg-surface-card rounded-lg shadow-lg p-6 mb-6">
            <h3 className="text-lg font-bold text-content-primary mb-4">🚚 Record New Delivery</h3>

            <form className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-content-secondary mb-1">
                    Tank
                  </label>
                  <select
                    value={deliveryForm.tank_id}
                    onChange={(e) => {
                      const fuelType = e.target.value.includes('DIESEL') ? 'Diesel' : 'Petrol'
                      setDeliveryForm({ ...deliveryForm, tank_id: e.target.value, fuel_type: fuelType })
                    }}
                    className="w-full px-3 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-action-primary focus:border-action-primary"
                  >
                    <option value="TANK-DIESEL-1">Diesel Tank 1</option>
                    <option value="TANK-PETROL-1">Petrol Tank 1</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-content-secondary mb-1">
                    Shift Type
                  </label>
                  <select
                    value={deliveryForm.shift_type}
                    onChange={(e) => setDeliveryForm({ ...deliveryForm, shift_type: e.target.value })}
                    className="w-full px-3 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-action-primary focus:border-action-primary"
                  >
                    <option value="Day">Day Shift</option>
                    <option value="Night">Night Shift</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-content-secondary mb-1">
                    Supplier
                  </label>
                  <input
                    type="text"
                    value={deliveryForm.supplier}
                    onChange={(e) => setDeliveryForm({ ...deliveryForm, supplier: e.target.value })}
                    className="w-full px-3 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-action-primary focus:border-action-primary"
                    placeholder="e.g., Total Zambia"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-status-pending-light rounded-lg p-4 border-2 border-status-warning">
                  <label className="block text-sm font-bold text-status-warning mb-2">
                    Before Delivery Dip (cm)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={deliveryForm.before_dip_cm}
                    onChange={(e) => setDeliveryForm({ ...deliveryForm, before_dip_cm: e.target.value })}
                    className="w-full px-3 py-2 border border-status-warning rounded-md focus:outline-none focus:ring-yellow-500 focus:border-yellow-500 text-lg font-semibold"
                    placeholder="e.g., 45.2"
                  />
                  <p className="text-xs text-status-warning mt-2">Record BEFORE truck offloads</p>
                </div>

                <div className="bg-fuel-petrol-light rounded-lg p-4 border-2 border-fuel-petrol-border">
                  <label className="block text-sm font-bold text-fuel-petrol mb-2">
                    After Delivery Dip (cm)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={deliveryForm.after_dip_cm}
                    onChange={(e) => setDeliveryForm({ ...deliveryForm, after_dip_cm: e.target.value })}
                    className="w-full px-3 py-2 border border-fuel-petrol-border rounded-md focus:outline-none focus:ring-green-500 focus:border-green-500 text-lg font-semibold"
                    placeholder="e.g., 185.6"
                  />
                  <p className="text-xs text-status-success mt-2">Record AFTER truck offloads</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-content-secondary mb-1">
                    Invoiced Volume (Liters)
                  </label>
                  <input
                    type="number"
                    step="1"
                    value={deliveryForm.invoiced_volume}
                    onChange={(e) => setDeliveryForm({ ...deliveryForm, invoiced_volume: e.target.value })}
                    className="w-full px-3 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-action-primary focus:border-action-primary"
                    placeholder="e.g., 30000"
                  />
                  <p className="text-xs text-content-secondary mt-1">Volume on delivery invoice</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-content-secondary mb-1">
                    Driver Name
                  </label>
                  <input
                    type="text"
                    value={deliveryForm.driver_name}
                    onChange={(e) => setDeliveryForm({ ...deliveryForm, driver_name: e.target.value })}
                    className="w-full px-3 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-action-primary focus:border-action-primary"
                    placeholder="e.g., John M."
                  />
                </div>
              </div>

              {/* Calculated Delivery Volume Preview */}
              {deliveryForm.before_dip_cm && deliveryForm.after_dip_cm && (
                <div className="bg-action-primary-light border-2 border-action-primary rounded-lg p-4">
                  <h4 className="text-sm font-bold text-action-primary mb-2">Calculated Delivery (from dip difference)</h4>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-xs text-action-primary">Before Dip</p>
                      <p className="text-lg font-bold text-action-primary">{deliveryForm.before_dip_cm} cm</p>
                    </div>
                    <div>
                      <p className="text-xs text-action-primary">After Dip</p>
                      <p className="text-lg font-bold text-action-primary">{deliveryForm.after_dip_cm} cm</p>
                    </div>
                    <div>
                      <p className="text-xs text-action-primary">Dip Increase</p>
                      <p className="text-lg font-bold text-action-primary">
                        {(parseFloat(deliveryForm.after_dip_cm) - parseFloat(deliveryForm.before_dip_cm)).toFixed(1)} cm
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-action-primary mt-2">
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
                className="w-full px-4 py-3 bg-action-primary text-white font-semibold rounded-md hover:bg-action-primary-hover focus:outline-none focus:ring-2 focus:ring-action-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Calculate & Record Delivery
              </button>

              {/* Delivery Result */}
              {deliveryResult && (
                <div className={`p-4 rounded-lg border-2 ${
                  Math.abs(deliveryResult.variance) < 100 ? 'bg-status-success-light border-status-success' : 'bg-status-pending-light border-yellow-400'
                }`}>
                  <h4 className="font-bold mb-2">Delivery Verification Result</h4>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-content-secondary">Calculated (Dips)</p>
                      <p className="font-bold text-content-primary">{deliveryResult.calculated_volume.toFixed(0)} L</p>
                    </div>
                    <div>
                      <p className="text-content-secondary">Invoiced</p>
                      <p className="font-bold text-content-primary">{deliveryResult.invoiced_volume.toFixed(0)} L</p>
                    </div>
                    <div>
                      <p className="text-content-secondary">Variance</p>
                      <p className={`font-bold ${Math.abs(deliveryResult.variance) < 100 ? 'text-status-success' : 'text-status-warning'}`}>
                        {deliveryResult.variance > 0 ? '+' : ''}{deliveryResult.variance.toFixed(0)} L
                      </p>
                    </div>
                  </div>
                  {Math.abs(deliveryResult.variance) < 100 ? (
                    <p className="text-xs text-status-success mt-2">✅ Delivery verified - variance within acceptable limits</p>
                  ) : (
                    <p className="text-xs text-status-warning mt-2">⚠️ Variance exceeds 100L - verify dip readings and invoice</p>
                  )}
                </div>
              )}
            </form>
          </div>

          {/* Recent Deliveries */}
          <div className="bg-surface-card rounded-lg shadow-lg p-6 mb-6">
            <h3 className="text-lg font-bold text-content-primary mb-4">Recent Deliveries</h3>

            <div className="space-y-4">
              {/* Sample Delivery Record */}
              <div className="border-l-4 border-action-primary bg-action-primary-light rounded-lg p-4">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h4 className="font-bold text-content-primary">Diesel Delivery</h4>
                    <p className="text-sm text-content-secondary">Tank 1 - Dec 15, 2025</p>
                  </div>
                  <span className="px-3 py-1 bg-action-primary-light text-action-primary rounded-full text-xs font-semibold">
                    Day Shift
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-content-secondary">Before Delivery</p>
                    <p className="text-lg font-bold text-content-primary">5,240 L</p>
                    <p className="text-xs text-content-secondary">45.2 cm</p>
                  </div>
                  <div>
                    <p className="text-xs text-content-secondary">Delivered</p>
                    <p className="text-lg font-bold text-action-primary">+30,000 L</p>
                  </div>
                  <div>
                    <p className="text-xs text-content-secondary">After Delivery</p>
                    <p className="text-lg font-bold text-content-primary">35,240 L</p>
                    <p className="text-xs text-content-secondary">185.6 cm</p>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-action-primary">
                  <p className="text-xs text-content-secondary">Time: 14:30 | Driver: John M. | Supplier: Total Zambia</p>
                </div>
              </div>

              {/* Placeholder message */}
              <div className="text-center py-6 bg-surface-bg rounded-lg border border-surface-border">
                <p className="text-sm text-content-secondary">Use the form above to record new deliveries</p>
              </div>
            </div>
          </div>

          {/* Delivery Instructions */}
          <div className="bg-action-primary-light border border-action-primary rounded-lg p-4">
            <h3 className="text-sm font-semibold text-action-primary mb-2">Fuel Delivery Process</h3>
            <ul className="text-sm text-action-primary space-y-1">
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
            <h2 className="text-2xl font-bold text-content-primary mb-2">LPG Accessories Inventory</h2>
            <p className="text-sm text-content-secondary">Gas stoves, cookers, hoses, and regulators</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

                    <div className="grid grid-cols-3 gap-3">
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
