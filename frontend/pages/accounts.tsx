import { useState, useEffect } from 'react'
import LoadingSpinner from '../components/LoadingSpinner'
import { getHeaders } from '../lib/api'

const BASE = '/api/v1'

export default function Accounts() {
  const [accounts, setAccounts] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Credit sale form state
  const [saleForm, setSaleForm] = useState({
    account_id: '',
    fuel_type: 'Diesel',
    volume: '',
    price_per_liter: '26.98',
    pricing_tier: 'standard',
    amount: '',
    shift_id: '',
    notes: ''
  })

  // Pricing tiers for Diesel
  const dieselPricingTiers = [
    { id: 'standard', label: 'Standard (Drive-In)', price: 26.98, discount: 0 },
    { id: 'volcano', label: 'Volcano Mining', price: 26.85, discount: 0.13 },
    { id: 'hammington', label: 'Hammington', price: 26.82, discount: 0.16 },
    { id: 'custom', label: 'Custom Price', price: 26.98, discount: 0 }
  ]

  useEffect(() => {
    fetchAccounts()
  }, [])

  const fetchAccounts = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${BASE}/accounts/`, {
        headers: getHeaders()
      })
      if (res.ok) {
        const data = await res.json()
        setAccounts(data)
      }
    } catch (err: any) {
      setError('Failed to fetch accounts')
    } finally {
      setLoading(false)
    }
  }

  const handleFuelTypeChange = (fuelType: string) => {
    const price = fuelType === 'Petrol' ? '29.92' : '26.98'
    const pricingTier = fuelType === 'Petrol' ? 'standard' : saleForm.pricing_tier
    setSaleForm({ ...saleForm, fuel_type: fuelType, price_per_liter: price, pricing_tier: pricingTier })

    // Recalculate amount if volume exists
    if (saleForm.volume) {
      const calculatedAmount = (parseFloat(saleForm.volume) * parseFloat(price)).toFixed(2)
      setSaleForm({ ...saleForm, fuel_type: fuelType, price_per_liter: price, pricing_tier: pricingTier, amount: calculatedAmount })
    }
  }

  const handlePricingTierChange = (tierId: string) => {
    const tier = dieselPricingTiers.find(t => t.id === tierId)
    if (!tier) return

    const price = tier.price.toString()
    setSaleForm({ ...saleForm, pricing_tier: tierId, price_per_liter: price })

    // Recalculate amount if volume exists
    if (saleForm.volume) {
      const calculatedAmount = (parseFloat(saleForm.volume) * parseFloat(price)).toFixed(2)
      setSaleForm({ ...saleForm, pricing_tier: tierId, price_per_liter: price, amount: calculatedAmount })
    }
  }

  const handleVolumeChange = (volume: string) => {
    setSaleForm({ ...saleForm, volume })

    // Auto-calculate amount
    if (volume && saleForm.price_per_liter) {
      const calculatedAmount = (parseFloat(volume) * parseFloat(saleForm.price_per_liter)).toFixed(2)
      setSaleForm({ ...saleForm, volume, amount: calculatedAmount })
    }
  }

  const handleSubmitSale = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      // Generate sale ID
      const saleId = `CS-${Date.now()}`
      const currentDate = new Date().toISOString().split('T')[0]

      const payload = {
        sale_id: saleId,
        account_id: saleForm.account_id,
        fuel_type: saleForm.fuel_type,
        volume: parseFloat(saleForm.volume),
        amount: parseFloat(saleForm.amount),
        shift_id: saleForm.shift_id || `SHIFT-${currentDate}`,
        date: currentDate,
        invoice_number: saleForm.notes || null
      }

      const res = await fetch(`${BASE}/accounts/sales`, {
        method: 'POST',
        headers: { ...getHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!res.ok) {
        const errorData = await res.json()
        // Handle FastAPI validation errors which come as an array
        if (Array.isArray(errorData.detail)) {
          const errorMessages = errorData.detail.map((err: any) => `${err.loc?.join('.') || ''}: ${err.msg || err}`).join(', ')
          throw new Error(errorMessages)
        }
        // Handle structured error objects (e.g. foreign_key_violation)
        if (typeof errorData.detail === 'object' && errorData.detail !== null) {
          throw new Error(errorData.detail.message || JSON.stringify(errorData.detail))
        }
        throw new Error(errorData.detail || 'Failed to record credit sale')
      }

      alert('Credit sale recorded successfully!')

      // Reset form
      setSaleForm({
        account_id: '',
        fuel_type: 'Diesel',
        volume: '',
        price_per_liter: '26.98',
        pricing_tier: 'standard',
        amount: '',
        shift_id: '',
        notes: ''
      })

      // Refresh accounts to update balances
      fetchAccounts()
    } catch (err: any) {
      setError(err.message || 'Failed to record credit sale')
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (amount: number) => {
    return `ZMW ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const getCreditUtilization = (account: any) => {
    return account.credit_limit > 0 ? (account.current_balance / account.credit_limit) * 100 : 0
  }

  const getUtilizationColor = (utilization: number) => {
    if (utilization >= 90) return 'bg-red-500'
    if (utilization >= 75) return 'bg-orange-500'
    if (utilization >= 50) return 'bg-yellow-500'
    return 'bg-green-500'
  }

  const getAccountTypeColor = (accountType: string) => {
    const colors: any = {
      'Corporate': 'bg-blue-100 text-blue-800 border-blue-300',
      'Institution': 'bg-purple-100 text-purple-800 border-purple-300',
      'Individual': 'bg-green-100 text-green-800 border-green-300',
      'POS': 'bg-orange-100 text-orange-800 border-orange-300'
    }
    return colors[accountType] || 'bg-gray-100 text-gray-800 border-gray-300'
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Account Holders & Credit Sales</h1>
        <p className="mt-2 text-sm text-gray-600">Manage institutional and corporate credit accounts</p>
      </div>

      {/* Record Credit Sale Form */}
      <div className="mb-8 bg-white rounded-lg shadow-lg p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">📝 Record Credit Sale</h2>

        <form onSubmit={handleSubmitSale} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Account Holder
              </label>
              <select
                value={saleForm.account_id}
                onChange={(e) => setSaleForm({ ...saleForm, account_id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                required
              >
                <option value="">Select Account</option>
                {accounts.map(account => (
                  <option key={account.account_id} value={account.account_id}>
                    {account.account_name} ({account.account_type})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Fuel Type
              </label>
              <select
                value={saleForm.fuel_type}
                onChange={(e) => handleFuelTypeChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="Petrol">Petrol</option>
                <option value="Diesel">Diesel</option>
              </select>
            </div>

            {/* Pricing Tier for Diesel */}
            {saleForm.fuel_type === 'Diesel' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Customer Pricing Tier
                </label>
                <select
                  value={saleForm.pricing_tier}
                  onChange={(e) => handlePricingTierChange(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                >
                  {dieselPricingTiers.map(tier => (
                    <option key={tier.id} value={tier.id}>
                      {tier.label} - ZMW {tier.price.toFixed(2)}/L
                      {tier.discount > 0 && ` (${tier.discount.toFixed(2)} discount)`}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Price per Liter Display */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Price per Liter
              </label>
              <input
                type="number"
                step="0.01"
                value={saleForm.price_per_liter}
                onChange={(e) => {
                  setSaleForm({ ...saleForm, price_per_liter: e.target.value, pricing_tier: 'custom' })
                  if (saleForm.volume) {
                    const calculatedAmount = (parseFloat(saleForm.volume) * parseFloat(e.target.value)).toFixed(2)
                    setSaleForm({ ...saleForm, price_per_liter: e.target.value, pricing_tier: 'custom', amount: calculatedAmount })
                  }
                }}
                className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 font-semibold text-lg ${
                  saleForm.pricing_tier === 'custom' ? 'bg-yellow-50' : 'bg-gray-50'
                }`}
                placeholder="26.98"
              />
              {saleForm.pricing_tier === 'custom' && (
                <p className="text-xs text-yellow-700 mt-1">⚠️ Custom price - differs from standard tiers</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Volume (Liters)
              </label>
              <input
                type="number"
                step="0.01"
                value={saleForm.volume}
                onChange={(e) => handleVolumeChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g., 500.00"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Total Amount (Auto-calculated)
              </label>
              <input
                type="text"
                value={saleForm.amount}
                readOnly
                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100 font-bold text-lg cursor-not-allowed"
                placeholder="Auto-calculated"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notes (Optional)
              </label>
              <input
                type="text"
                value={saleForm.notes}
                onChange={(e) => setSaleForm({ ...saleForm, notes: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g., Vehicle registration, driver name, etc."
              />
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-3 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Recording...' : 'Record Credit Sale'}
          </button>
        </form>
      </div>

      {/* Account Holders List */}
      <div className="mb-8">
        <h2 className="text-xl font-bold text-gray-900 mb-4">💳 Account Holders</h2>

        {loading && accounts.length === 0 ? (
          <LoadingSpinner text="Loading accounts..." />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {accounts.map(account => {
              const utilization = getCreditUtilization(account)
              return (
                <div
                  key={account.account_id}
                  className="bg-white rounded-lg shadow-lg p-5 border-2 border-gray-200 hover:border-blue-300 transition-colors"
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex-1">
                      <h3 className="font-bold text-gray-900 text-lg">{account.account_name}</h3>
                      <p className="text-xs text-gray-500 mt-1">ID: {account.account_id}</p>
                    </div>
                    <span className={`px-2 py-1 text-xs font-semibold rounded border ${getAccountTypeColor(account.account_type)}`}>
                      {account.account_type}
                    </span>
                  </div>

                  {/* Current Balance */}
                  <div className="mb-3">
                    <p className="text-xs text-gray-600 mb-1">Current Balance</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {formatCurrency(account.current_balance)}
                    </p>
                  </div>

                  {/* Credit Limit */}
                  <div className="mb-3">
                    <p className="text-xs text-gray-600 mb-1">Credit Limit</p>
                    <p className="text-lg font-semibold text-gray-700">
                      {formatCurrency(account.credit_limit)}
                    </p>
                  </div>

                  {/* Credit Utilization Bar */}
                  <div className="mb-3">
                    <div className="flex justify-between text-xs text-gray-600 mb-1">
                      <span>Credit Utilization</span>
                      <span className="font-semibold">{utilization.toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${getUtilizationColor(utilization)}`}
                        style={{ width: `${Math.min(utilization, 100)}%` }}
                      />
                    </div>
                  </div>

                  {/* Available Credit */}
                  <div className="pt-3 border-t border-gray-200">
                    <p className="text-xs text-gray-600">Available Credit</p>
                    <p className="text-lg font-bold text-green-700">
                      {formatCurrency(account.credit_limit - account.current_balance)}
                    </p>
                  </div>

                  {/* Contact Info */}
                  {account.contact_person && (
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <p className="text-xs text-gray-500">
                        Contact: {account.contact_person}
                      </p>
                      {account.phone && (
                        <p className="text-xs text-gray-500">
                          Phone: {account.phone}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Info Panel */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-blue-900 mb-2">Credit Account Management</h3>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>• <strong>14 Pre-configured Accounts</strong> from Luanshya Station (POS, Police, ZACODE, etc.)</li>
          <li>• <strong>Credit Limit Enforcement</strong> - System prevents sales exceeding credit limits</li>
          <li>• <strong>Real-time Balance Tracking</strong> - Balances update automatically with each credit sale</li>
          <li>• <strong>Account Types</strong>: Corporate, Institution, Individual, POS</li>
          <li>• <strong>Credit Sales</strong> are deducted from Expected Cash in shift reconciliation</li>
          <li>• <strong>Payment Recording</strong> reduces account balance when customers pay</li>
        </ul>
      </div>
    </div>
  )
}
