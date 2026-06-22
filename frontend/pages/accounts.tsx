import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import LoadingSpinner from '../components/LoadingSpinner'
import { getHeaders, authFetch } from '../lib/api'

const BASE = '/api/v1'

export default function Accounts() {
  const [accounts, setAccounts] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Live fuel prices from settings
  const [fuelPrices, setFuelPrices] = useState({ Diesel: 0, Petrol: 0 })

  // Role + create-account state (creating accounts is manager/owner only)
  const [userRole, setUserRole] = useState('')
  const canManage = ['manager', 'owner'].includes(userRole)
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createForm, setCreateForm] = useState({
    account_name: '', account_type: 'Corporate', credit_limit: '',
    default_price_per_liter: '',
  })

  // Edit-account state
  const [editingAccount, setEditingAccount] = useState<any | null>(null)
  const [editForm, setEditForm] = useState({
    account_name: '', account_type: 'Corporate', credit_limit: '',
    default_price_per_liter: '',
  })
  const [editContacts, setEditContacts] = useState<{ name: string; phone: string }[]>([{ name: '', phone: '' }])
  const [saving, setSaving] = useState(false)

  // Create-account contacts state
  const [createContacts, setCreateContacts] = useState<{ name: string; phone: string }[]>([{ name: '', phone: '' }])

  // Credit sale form state — price starts empty; populated after settings fetch
  const [saleForm, setSaleForm] = useState({
    account_id: '',
    fuel_type: 'Diesel',
    volume: '',
    price_per_liter: '',
    pricing_tier: 'standard',
    amount: '',
    shift_id: '',
    notes: ''
  })

  // Only two tiers: standard (global price) and custom (free entry).
  // Per-account rates are configured on the account record itself via
  // default_price_per_liter and applied automatically on account selection.
  const pricingTiers = [
    { id: 'standard', label: 'Standard' },
    { id: 'custom',   label: 'Custom Price' },
  ]
  const tierPrice = (tierId: string): number =>
    tierId === 'standard' ? fuelPrices[saleForm.fuel_type as 'Diesel' | 'Petrol'] : 0

  useEffect(() => {
    fetchAccounts()
    fetchFuelPrices()
    try {
      const u = localStorage.getItem('user')
      if (u) setUserRole(JSON.parse(u).role || '')
    } catch { /* ignore */ }
  }, [])

  const fetchFuelPrices = async () => {
    try {
      const res = await authFetch(`${BASE}/settings/fuel`, { headers: getHeaders() })
      if (res.ok) {
        const data = await res.json()
        const prices = {
          Diesel: data.diesel_price_per_liter || 0,
          Petrol: data.petrol_price_per_liter || 0,
        }
        setFuelPrices(prices)
        setSaleForm(prev => ({
          ...prev,
          price_per_liter: prev.price_per_liter || (prices.Diesel ? prices.Diesel.toFixed(2) : ''),
        }))
      }
    } catch { /* ignore */ }
  }

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!createForm.account_name.trim()) { toast.error('Account name is required'); return }
    setCreating(true)
    try {
      const filledContacts = createContacts
        .filter(c => c.name.trim())
        .map(c => ({ name: c.name.trim(), phone: c.phone.trim() || null }))
      const payload = {
        account_id: '',
        account_name: createForm.account_name.trim(),
        account_type: createForm.account_type,
        credit_limit: parseFloat(createForm.credit_limit) || 0,
        current_balance: 0,
        contacts: filledContacts,
        contact_person: null,
        phone: null,
        default_price_per_liter: createForm.default_price_per_liter
          ? parseFloat(createForm.default_price_per_liter) : null,
      }
      const res = await authFetch(`${BASE}/accounts/`, {
        method: 'POST',
        headers: { ...getHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        const detail = Array.isArray(data.detail)
          ? data.detail.map((d: any) => d.msg || d).join(', ')
          : (typeof data.detail === 'string' ? data.detail : 'Failed to create account')
        throw new Error(detail)
      }
      toast.success('Credit account created')
      setShowCreate(false)
      setCreateForm({ account_name: '', account_type: 'Corporate', credit_limit: '', default_price_per_liter: '' })
      setCreateContacts([{ name: '', phone: '' }])
      fetchAccounts()
    } catch (err: any) {
      toast.error(err.message || 'Failed to create account')
    } finally {
      setCreating(false)
    }
  }

  const openEdit = (account: any) => {
    setEditingAccount(account)
    setEditForm({
      account_name: account.account_name || '',
      account_type: account.account_type || 'Corporate',
      credit_limit: account.credit_limit != null ? String(account.credit_limit) : '',
      default_price_per_liter: account.default_price_per_liter != null
        ? String(account.default_price_per_liter) : '',
    })
    // Seed contacts from new array; fall back to legacy single fields
    const existing: { name: string; phone: string }[] =
      account.contacts?.length
        ? account.contacts.map((c: any) => ({ name: c.name || '', phone: c.phone || '' }))
        : account.contact_person
          ? [{ name: account.contact_person, phone: account.phone || '' }]
          : [{ name: '', phone: '' }]
    setEditContacts(existing)
  }

  const handleUpdateAccount = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingAccount) return
    setSaving(true)
    try {
      const filledContacts = editContacts
        .filter(c => c.name.trim())
        .map(c => ({ name: c.name.trim(), phone: c.phone.trim() || null }))
      const payload = {
        account_id: editingAccount.account_id,
        account_name: editForm.account_name.trim(),
        account_type: editForm.account_type,
        credit_limit: parseFloat(editForm.credit_limit) || 0,
        current_balance: editingAccount.current_balance,
        contacts: filledContacts,
        contact_person: null,  // clear legacy field
        phone: null,
        default_price_per_liter: editForm.default_price_per_liter
          ? parseFloat(editForm.default_price_per_liter) : null,
      }
      const res = await authFetch(`${BASE}/accounts/${editingAccount.account_id}`, {
        method: 'PUT',
        headers: { ...getHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        const detail = Array.isArray(data.detail)
          ? data.detail.map((d: any) => d.msg || d).join(', ')
          : (typeof data.detail === 'string' ? data.detail : 'Failed to update account')
        throw new Error(detail)
      }
      toast.success('Account updated')
      setEditingAccount(null)
      setEditContacts([{ name: '', phone: '' }])
      fetchAccounts()
    } catch (err: any) {
      toast.error(err.message || 'Failed to update account')
    } finally {
      setSaving(false)
    }
  }

  const fetchAccounts = async () => {
    setLoading(true)
    try {
      const res = await authFetch(`${BASE}/accounts/`, {
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
    const price = fuelPrices[fuelType as 'Diesel' | 'Petrol']
    const priceStr = price ? price.toFixed(2) : ''
    const pricingTier = fuelType === 'Petrol' ? 'standard' : saleForm.pricing_tier
    const amount = saleForm.volume && price
      ? (parseFloat(saleForm.volume) * price).toFixed(2) : ''
    setSaleForm({ ...saleForm, fuel_type: fuelType, price_per_liter: priceStr, pricing_tier: pricingTier, amount })
  }

  const handleAccountChange = (accountId: string) => {
    const account = accounts.find((a: any) => a.account_id === accountId)
    if (account?.default_price_per_liter) {
      const price = (account.default_price_per_liter as number).toFixed(2)
      const amount = saleForm.volume
        ? (parseFloat(saleForm.volume) * account.default_price_per_liter).toFixed(2) : ''
      setSaleForm({ ...saleForm, account_id: accountId, price_per_liter: price, pricing_tier: 'custom', amount })
    } else {
      setSaleForm({ ...saleForm, account_id: accountId })
    }
  }

  const handlePricingTierChange = (tierId: string) => {
    if (tierId === 'custom') {
      setSaleForm({ ...saleForm, pricing_tier: 'custom' })
      return
    }
    // Standard — reset to global price for the selected fuel type
    const price = tierPrice('standard')
    const priceStr = price ? price.toFixed(2) : ''
    const amount = saleForm.volume && price
      ? (parseFloat(saleForm.volume) * price).toFixed(2) : ''
    setSaleForm({ ...saleForm, pricing_tier: tierId, price_per_liter: priceStr, amount })
  }

  const handleVolumeChange = (volume: string) => {
    const price = parseFloat(saleForm.price_per_liter) || 0
    const amount = volume && price ? (parseFloat(volume) * price).toFixed(2) : ''
    setSaleForm({ ...saleForm, volume, amount })
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

      const res = await authFetch(`${BASE}/accounts/sales`, {
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

      toast.success('Credit sale recorded successfully!')

      // Reset form — re-seed price from live settings
      setSaleForm({
        account_id: '',
        fuel_type: 'Diesel',
        volume: '',
        price_per_liter: fuelPrices.Diesel ? fuelPrices.Diesel.toFixed(2) : '',
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
    if (utilization >= 90) return 'bg-status-error-light0'
    if (utilization >= 75) return 'bg-category-c'
    if (utilization >= 50) return 'bg-status-warning'
    return 'bg-status-success'
  }

  const getAccountTypeColor = (accountType: string) => {
    const colors: any = {
      'Corporate': 'bg-action-primary-light text-action-primary border-action-primary',
      'Institution': 'bg-category-a-light text-category-a border-category-a-border',
      'Individual': 'bg-category-b-light text-category-b border-category-b-border',
      'POS': 'bg-category-c-light text-category-c border-category-c-border'
    }
    return colors[accountType] || 'bg-surface-bg text-content-primary border-surface-border'
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-content-primary">Account Holders & Credit Sales</h1>
        <p className="mt-2 text-sm text-content-secondary">Manage institutional and corporate credit accounts</p>
      </div>

      {/* Record Credit Sale Form */}
      <div className="mb-8 bg-surface-card rounded-lg shadow-lg p-6">
        <h2 className="text-xl font-bold text-content-primary mb-4">📝 Record Credit Sale</h2>

        <form onSubmit={handleSubmitSale} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-content-secondary mb-1">
                Account Holder
              </label>
              <select
                value={saleForm.account_id}
                onChange={(e) => handleAccountChange(e.target.value)}
                className="w-full px-3 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-action-primary focus:border-action-primary"
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
              <label className="block text-sm font-medium text-content-secondary mb-1">
                Fuel Type
              </label>
              <select
                value={saleForm.fuel_type}
                onChange={(e) => handleFuelTypeChange(e.target.value)}
                className="w-full px-3 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-action-primary focus:border-action-primary"
              >
                <option value="Petrol">Petrol</option>
                <option value="Diesel">Diesel</option>
              </select>
            </div>

            {/* Pricing Tier */}
            <div>
              <label className="block text-sm font-medium text-content-secondary mb-1">
                Pricing
              </label>
              <select
                value={saleForm.pricing_tier}
                onChange={(e) => handlePricingTierChange(e.target.value)}
                className="w-full px-3 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-action-primary focus:border-action-primary"
              >
                {pricingTiers.map(tier => {
                  const globalPrice = fuelPrices[saleForm.fuel_type as 'Diesel' | 'Petrol']
                  return (
                    <option key={tier.id} value={tier.id}>
                      {tier.label}
                      {tier.id === 'standard' && globalPrice > 0
                        ? ` — ZMW ${globalPrice.toFixed(2)}/L`
                        : tier.id === 'custom' ? ' — enter below' : ''}
                    </option>
                  )
                })}
              </select>
            </div>

            {/* Price per Liter Display */}
            <div>
              <label className="block text-sm font-medium text-content-secondary mb-1">
                Price per Liter
              </label>
              <input
                type="number"
                step="0.01"
                value={saleForm.price_per_liter}
                onChange={(e) => {
                  const price = e.target.value
                  const amount = saleForm.volume && parseFloat(price) > 0
                    ? (parseFloat(saleForm.volume) * parseFloat(price)).toFixed(2) : ''
                  setSaleForm({ ...saleForm, price_per_liter: price, pricing_tier: 'custom', amount })
                }}
                className={`w-full px-3 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-action-primary focus:border-action-primary font-semibold text-lg ${
                  saleForm.pricing_tier === 'custom' ? 'bg-status-pending-light' : 'bg-surface-bg'
                }`}
                placeholder={fuelPrices[saleForm.fuel_type as 'Diesel' | 'Petrol']
                  ? fuelPrices[saleForm.fuel_type as 'Diesel' | 'Petrol'].toFixed(2) : ''}
              />
              {saleForm.pricing_tier === 'custom' && (
                <p className="text-xs text-status-warning mt-1">Custom price — amount computed from this rate</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-content-secondary mb-1">
                Volume (Liters)
              </label>
              <input
                type="number"
                step="0.01"
                value={saleForm.volume}
                onChange={(e) => handleVolumeChange(e.target.value)}
                className="w-full px-3 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-action-primary focus:border-action-primary"
                placeholder="e.g., 500.00"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-content-secondary mb-1">
                Total Amount (Auto-calculated)
              </label>
              <input
                type="text"
                value={saleForm.amount}
                readOnly
                className="w-full px-3 py-2 border border-surface-border rounded-md bg-surface-bg font-bold text-lg cursor-not-allowed"
                placeholder="Auto-calculated"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-content-secondary mb-1">
                Notes (Optional)
              </label>
              <input
                type="text"
                value={saleForm.notes}
                onChange={(e) => setSaleForm({ ...saleForm, notes: e.target.value })}
                className="w-full px-3 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-action-primary focus:border-action-primary"
                placeholder="e.g., Vehicle registration, driver name, etc."
              />
            </div>
          </div>

          {error && (
            <div className="p-3 bg-status-error-light border border-status-error rounded-md">
              <p className="text-sm text-status-error">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-3 bg-action-primary text-white font-semibold rounded-md hover:bg-action-primary-hover focus:outline-none focus:ring-2 focus:ring-action-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Recording...' : 'Record Credit Sale'}
          </button>
        </form>
      </div>

      {/* Account Holders List */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-content-primary">Account Holders</h2>
          {canManage && (
            <button
              onClick={() => setShowCreate(true)}
              className="px-3 py-2 text-sm font-semibold rounded-md bg-action-primary text-white hover:bg-action-primary-hover"
            >
              + Create Account
            </button>
          )}
        </div>

        {loading && accounts.length === 0 ? (
          <LoadingSpinner text="Loading accounts..." />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {accounts.map(account => {
              const utilization = getCreditUtilization(account)
              return (
                <div
                  key={account.account_id}
                  className="bg-surface-card rounded-lg shadow-lg p-5 border-2 border-surface-border hover:border-action-primary hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200"
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex-1">
                      <h3 className="font-bold text-content-primary text-lg">{account.account_name}</h3>
                      <p className="text-xs text-content-secondary mt-1">ID: {account.account_id}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 text-xs font-semibold rounded border ${getAccountTypeColor(account.account_type)}`}>
                        {account.account_type}
                      </span>
                      {canManage && (
                        <button
                          onClick={() => openEdit(account)}
                          className="px-2 py-1 text-xs rounded border border-surface-border text-content-secondary hover:bg-action-primary-light hover:text-action-primary hover:border-action-primary"
                        >
                          Edit
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Current Balance */}
                  <div className="mb-3">
                    <p className="text-xs text-content-secondary mb-1">Current Balance</p>
                    <p className="text-2xl font-bold text-content-primary">
                      {formatCurrency(account.current_balance)}
                    </p>
                  </div>

                  {/* Credit Limit */}
                  <div className="mb-3">
                    <p className="text-xs text-content-secondary mb-1">Credit Limit</p>
                    <p className="text-lg font-semibold text-content-secondary">
                      {formatCurrency(account.credit_limit)}
                    </p>
                  </div>

                  {/* Credit Utilization Bar */}
                  <div className="mb-3">
                    <div className="flex justify-between text-xs text-content-secondary mb-1">
                      <span>Credit Utilization</span>
                      <span className="font-semibold">{utilization.toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-surface-border rounded-full h-3 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${getUtilizationColor(utilization)}`}
                        style={{ width: `${Math.min(utilization, 100)}%` }}
                      />
                    </div>
                  </div>

                  {/* Available Credit */}
                  <div className="pt-3 border-t border-surface-border">
                    <p className="text-xs text-content-secondary">Available Credit</p>
                    <p className="text-lg font-bold text-status-success">
                      {formatCurrency(account.credit_limit - account.current_balance)}
                    </p>
                  </div>

                  {/* Custom Price & Contact Info */}
                  {account.default_price_per_liter && (
                    <div className="mt-3 pt-3 border-t border-surface-border">
                      <p className="text-xs text-content-secondary">Custom Rate</p>
                      <p className="text-sm font-semibold text-content-primary">
                        ZMW {account.default_price_per_liter.toFixed(2)}/L
                      </p>
                    </div>
                  )}
                  {(() => {
                    const contacts = account.contacts?.length
                      ? account.contacts
                      : account.contact_person
                        ? [{ name: account.contact_person, phone: account.phone }]
                        : []
                    return contacts.length > 0 ? (
                      <div className="mt-3 pt-3 border-t border-surface-border space-y-1">
                        <p className="text-xs font-medium text-content-secondary">
                          {contacts.length === 1 ? 'Contact' : 'Contacts'}
                        </p>
                        {contacts.map((c: any, i: number) => (
                          <p key={i} className="text-xs text-content-secondary">
                            {c.name}{c.phone ? ` — ${c.phone}` : ''}
                          </p>
                        ))}
                      </div>
                    ) : null
                  })()}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Info Panel */}
      <div className="bg-action-primary-light border border-action-primary rounded-lg p-4">
        <h3 className="text-sm font-semibold text-action-primary mb-2">Credit Account Management</h3>
        <ul className="text-sm text-action-primary space-y-1">
          <li>• <strong>Credit Accounts</strong> — Add your customers and set credit limits</li>
          <li>• <strong>Credit Limit Enforcement</strong> - System prevents sales exceeding credit limits</li>
          <li>• <strong>Real-time Balance Tracking</strong> - Balances update automatically with each credit sale</li>
          <li>• <strong>Account Types</strong>: Corporate, Institution, Individual, POS</li>
          <li>• <strong>Credit Sales</strong> are deducted from Expected Cash in shift reconciliation</li>
          <li>• <strong>Payment Recording</strong> reduces account balance when customers pay</li>
        </ul>
      </div>

      {/* Edit Account Modal */}
      {editingAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg shadow-lg p-6 bg-surface-card border border-surface-border">
            <h3 className="text-lg font-bold text-content-primary mb-4">Edit Account — {editingAccount.account_name}</h3>
            <form onSubmit={handleUpdateAccount} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-content-secondary mb-1">Account Name *</label>
                <input type="text" value={editForm.account_name}
                  onChange={(e) => setEditForm({ ...editForm, account_name: e.target.value })}
                  className="w-full px-3 py-2 border border-surface-border rounded-md bg-surface-bg text-content-primary focus:outline-none focus:ring-action-primary focus:border-action-primary"
                  required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-content-secondary mb-1">Account Type</label>
                  <select value={editForm.account_type}
                    onChange={(e) => setEditForm({ ...editForm, account_type: e.target.value })}
                    className="w-full px-3 py-2 border border-surface-border rounded-md bg-surface-bg text-content-primary focus:outline-none focus:ring-action-primary focus:border-action-primary">
                    {['Corporate', 'Institution', 'Individual', 'POS'].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-content-secondary mb-1">Credit Limit (ZMW)</label>
                  <input type="number" step="0.01" min="0" value={editForm.credit_limit}
                    onChange={(e) => setEditForm({ ...editForm, credit_limit: e.target.value })}
                    className="w-full px-3 py-2 border border-surface-border rounded-md bg-surface-bg text-content-primary focus:outline-none focus:ring-action-primary focus:border-action-primary"
                    placeholder="0.00" />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium text-content-secondary">Contacts (up to 3)</label>
                  {editContacts.length < 3 && (
                    <button type="button"
                      onClick={() => setEditContacts([...editContacts, { name: '', phone: '' }])}
                      className="text-xs text-action-primary hover:underline">+ Add contact</button>
                  )}
                </div>
                <div className="space-y-2">
                  {editContacts.map((c, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <input type="text" value={c.name} placeholder="Name"
                        onChange={(e) => { const updated = [...editContacts]; updated[i] = { ...c, name: e.target.value }; setEditContacts(updated) }}
                        className="flex-1 px-3 py-2 border border-surface-border rounded-md bg-surface-bg text-content-primary text-sm focus:outline-none focus:ring-action-primary focus:border-action-primary" />
                      <input type="text" value={c.phone} placeholder="Phone"
                        onChange={(e) => { const updated = [...editContacts]; updated[i] = { ...c, phone: e.target.value }; setEditContacts(updated) }}
                        className="flex-1 px-3 py-2 border border-surface-border rounded-md bg-surface-bg text-content-primary text-sm focus:outline-none focus:ring-action-primary focus:border-action-primary" />
                      {editContacts.length > 1 && (
                        <button type="button"
                          onClick={() => setEditContacts(editContacts.filter((_, j) => j !== i))}
                          className="text-xs text-status-error hover:underline px-1">Remove</button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-content-secondary mb-1">Custom Rate per Liter (optional)</label>
                <input type="number" step="0.01" min="0" value={editForm.default_price_per_liter}
                  onChange={(e) => setEditForm({ ...editForm, default_price_per_liter: e.target.value })}
                  className="w-full px-3 py-2 border border-surface-border rounded-md bg-surface-bg text-content-primary focus:outline-none focus:ring-action-primary focus:border-action-primary"
                  placeholder={fuelPrices.Diesel ? `Global: ${fuelPrices.Diesel.toFixed(2)} — leave blank to use global` : 'Leave blank to use global fuel price'} />
                {editForm.default_price_per_liter && fuelPrices.Diesel > 0 && (
                  <p className="text-xs text-content-secondary mt-1">
                    {parseFloat(editForm.default_price_per_liter) < fuelPrices.Diesel
                      ? `${(fuelPrices.Diesel - parseFloat(editForm.default_price_per_liter)).toFixed(2)} below global rate`
                      : parseFloat(editForm.default_price_per_liter) > fuelPrices.Diesel
                      ? `${(parseFloat(editForm.default_price_per_liter) - fuelPrices.Diesel).toFixed(2)} above global rate`
                      : 'Same as global rate'}
                  </p>
                )}
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setEditingAccount(null)}
                  className="px-4 py-2 text-sm rounded-md border border-surface-border text-content-secondary">Cancel</button>
                <button type="submit" disabled={saving}
                  className="px-4 py-2 text-sm font-semibold rounded-md bg-action-primary text-white disabled:opacity-50">
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Account Modal (manager/owner) */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg shadow-lg p-6 bg-surface-card border border-surface-border">
            <h3 className="text-lg font-bold text-content-primary mb-4">Create Credit Account</h3>
            <form onSubmit={handleCreateAccount} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-content-secondary mb-1">Account Name *</label>
                <input type="text" value={createForm.account_name}
                  onChange={(e) => setCreateForm({ ...createForm, account_name: e.target.value })}
                  className="w-full px-3 py-2 border border-surface-border rounded-md bg-surface-bg text-content-primary focus:outline-none focus:ring-action-primary focus:border-action-primary"
                  placeholder="e.g. Volcano Mining Ltd" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-content-secondary mb-1">Account Type</label>
                  <select value={createForm.account_type}
                    onChange={(e) => setCreateForm({ ...createForm, account_type: e.target.value })}
                    className="w-full px-3 py-2 border border-surface-border rounded-md bg-surface-bg text-content-primary focus:outline-none focus:ring-action-primary focus:border-action-primary">
                    {['Corporate', 'Institution', 'Individual', 'POS'].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-content-secondary mb-1">Credit Limit (ZMW)</label>
                  <input type="number" step="0.01" min="0" value={createForm.credit_limit}
                    onChange={(e) => setCreateForm({ ...createForm, credit_limit: e.target.value })}
                    className="w-full px-3 py-2 border border-surface-border rounded-md bg-surface-bg text-content-primary focus:outline-none focus:ring-action-primary focus:border-action-primary"
                    placeholder="0.00" />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium text-content-secondary">Contacts (up to 3)</label>
                  {createContacts.length < 3 && (
                    <button type="button"
                      onClick={() => setCreateContacts([...createContacts, { name: '', phone: '' }])}
                      className="text-xs text-action-primary hover:underline">+ Add contact</button>
                  )}
                </div>
                <div className="space-y-2">
                  {createContacts.map((c, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <input type="text" value={c.name} placeholder="Name"
                        onChange={(e) => { const updated = [...createContacts]; updated[i] = { ...c, name: e.target.value }; setCreateContacts(updated) }}
                        className="flex-1 px-3 py-2 border border-surface-border rounded-md bg-surface-bg text-content-primary text-sm focus:outline-none focus:ring-action-primary focus:border-action-primary" />
                      <input type="text" value={c.phone} placeholder="Phone"
                        onChange={(e) => { const updated = [...createContacts]; updated[i] = { ...c, phone: e.target.value }; setCreateContacts(updated) }}
                        className="flex-1 px-3 py-2 border border-surface-border rounded-md bg-surface-bg text-content-primary text-sm focus:outline-none focus:ring-action-primary focus:border-action-primary" />
                      {createContacts.length > 1 && (
                        <button type="button"
                          onClick={() => setCreateContacts(createContacts.filter((_, j) => j !== i))}
                          className="text-xs text-status-error hover:underline px-1">Remove</button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-content-secondary mb-1">Custom Rate per Liter (optional)</label>
                <input type="number" step="0.01" min="0" value={createForm.default_price_per_liter}
                  onChange={(e) => setCreateForm({ ...createForm, default_price_per_liter: e.target.value })}
                  className="w-full px-3 py-2 border border-surface-border rounded-md bg-surface-bg text-content-primary focus:outline-none focus:ring-action-primary focus:border-action-primary"
                  placeholder="Leave blank to use global fuel price" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowCreate(false)}
                  className="px-4 py-2 text-sm rounded-md border border-surface-border text-content-secondary">Cancel</button>
                <button type="submit" disabled={creating}
                  className="px-4 py-2 text-sm font-semibold rounded-md bg-action-primary text-white disabled:opacity-50">
                  {creating ? 'Creating...' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
