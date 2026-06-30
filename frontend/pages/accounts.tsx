import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import LoadingSpinner from '../components/LoadingSpinner'
import { getHeaders, authFetch } from '../lib/api'

const BASE = '/api/v1'

const NOISE_WORDS = new Set(['ltd', 'limited', 'co', 'company', 'inc', 'plc', 'pvt', 'pty', 'llc', 'and', 'the', 'of', 'group'])

function previewClientCode(name: string): string {
  if (!name.trim()) return ''
  let words = name.trim().split(/[\s\-&.,/()+]+/)
    .filter(w => w && !NOISE_WORDS.has(w.toLowerCase()) && /[a-zA-Z]/.test(w))
  if (words.length === 0) words = name.match(/[a-zA-Z]+/g) || []
  if (words.length === 0) return ''

  let base: string
  if (words.length >= 3) {
    base = (words[0][0] + words[1][0] + words[2][0]).toUpperCase()
  } else if (words.length === 2) {
    const longer = words[0].length >= words[1].length ? words[0] : words[1]
    const extra = longer.length > 1 ? longer[1] : 'X'
    base = (words[0][0] + words[1][0] + extra).toUpperCase()
  } else {
    base = words[0].slice(0, 3).toUpperCase().padEnd(3, 'X')
  }
  return base
}

export default function Accounts() {
  const [accounts, setAccounts] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Live fuel prices from settings
  const [fuelPrices, setFuelPrices] = useState({ Diesel: 0, Petrol: 0 })

  // Role + create-account state (creating accounts is manager/owner only)
  const [userRole, setUserRole] = useState('')
  const canManage = ['manager', 'owner'].includes(userRole)
  const isOwner = userRole === 'owner'
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createForm, setCreateForm] = useState({
    account_name: '', account_type: 'Post-Paid', credit_limit: '',
    opening_balance: '', default_price_per_liter: '',
  })

  // Edit-account state
  const [editingAccount, setEditingAccount] = useState<any | null>(null)
  const [editForm, setEditForm] = useState({
    account_name: '', account_type: 'Post-Paid', credit_limit: '',
    default_price_per_liter: '',
  })
  const [editContacts, setEditContacts] = useState<{ name: string; phone: string }[]>([{ name: '', phone: '' }])
  const [saving, setSaving] = useState(false)

  // Create-account contacts state
  const [createContacts, setCreateContacts] = useState<{ name: string; phone: string }[]>([{ name: '', phone: '' }])

  // Top-up modal (Pre-Paid, owner only)
  const [topUpAccount, setTopUpAccount] = useState<any | null>(null)
  const [topUpAmount, setTopUpAmount] = useState('')
  const [topUpRef, setTopUpRef] = useState('')
  const [topUpSaving, setTopUpSaving] = useState(false)

  // Approve overdraft modal (owner only)
  const [overdraftAccount, setOverdraftAccount] = useState<any | null>(null)
  const [overdraftAmount, setOverdraftAmount] = useState('')
  const [overdraftSaving, setOverdraftSaving] = useState(false)

  // Credit sale form state — price starts empty; populated after settings fetch
  const [saleForm, setSaleForm] = useState({
    account_id: '',
    fuel_type: 'Diesel',
    volume: '',
    price_per_liter: '',
    pricing_tier: 'standard',
    amount: '',
    shift_id: '',
    notes: '',
    coupon_serial: '',
    driver_name: '',
    vehicle_reg: '',
  })
  const [lastAuthRef, setLastAuthRef] = useState('')

  // Only two tiers: standard (global price) and custom (free entry).
  // Per-account rates are configured on the account record itself via
  // default_price_per_liter and applied automatically on account selection.
  const pricingTiers = [
    { id: 'standard', label: 'Standard' },
    { id: 'custom',   label: 'Custom Price' },
  ]
  const tierPrice = (tierId: string): number =>
    tierId === 'standard' ? fuelPrices[saleForm.fuel_type as 'Diesel' | 'Petrol'] : 0

  const buildAuthRef = (accountId: string, vehicleReg: string, couponSerial: string): string => {
    const account = accounts.find((a: any) => a.account_id === accountId)
    const clientCode = account?.client_code || ''
    if (!clientCode || !vehicleReg.trim() || !couponSerial.trim()) return ''
    const vehicleClean = vehicleReg.replace(/\s+/g, '').toUpperCase()
    const now = new Date()
    const d = String(now.getDate()).padStart(2, '0')
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const y = now.getFullYear()
    return `${clientCode}-${vehicleClean}-${d}${m}${y}-${couponSerial.trim().toUpperCase()}`
  }

  const liveAuthRef = buildAuthRef(saleForm.account_id, saleForm.vehicle_reg, saleForm.coupon_serial)

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
      const isPrePaid = createForm.account_type === 'Pre-Paid'
      const payload = {
        account_id: '',
        account_name: createForm.account_name.trim(),
        account_type: createForm.account_type,
        credit_limit: isPrePaid ? 0 : (parseFloat(createForm.credit_limit) || 0),
        opening_balance: isPrePaid ? (parseFloat(createForm.opening_balance) || 0) : null,
        current_balance: 0,
        approved_overdraft: 0,
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
      setCreateForm({ account_name: '', account_type: 'Post-Paid', credit_limit: '', opening_balance: '', default_price_per_liter: '' })
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
    const t = account.account_type === 'Pre-Paid' ? 'Pre-Paid' : 'Post-Paid'
    setEditForm({
      account_name: account.account_name || '',
      account_type: t,
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

  const handleSuspend = async (account: any) => {
    const action = account.is_suspended ? 'unsuspend' : 'suspend'
    try {
      const res = await authFetch(`${BASE}/accounts/${account.account_id}/${action}`, {
        method: 'POST', headers: getHeaders(),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.detail || `Failed to ${action}`) }
      toast.success(account.is_suspended ? 'Account reinstated' : 'Account suspended')
      fetchAccounts()
    } catch (err: any) {
      toast.error(err.message || `Failed to ${action} account`)
    }
  }

  const handleDelete = async (account: any) => {
    if (!window.confirm(`Permanently delete "${account.account_name}"? This cannot be undone.`)) return
    try {
      const res = await authFetch(`${BASE}/accounts/${account.account_id}`, {
        method: 'DELETE', headers: getHeaders(),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.detail || 'Failed to delete') }
      toast.success('Account deleted')
      fetchAccounts()
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete account')
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
        invoice_number: saleForm.notes || null,
        driver_name: saleForm.driver_name.trim() || null,
        vehicle_reg: saleForm.vehicle_reg.trim() || null,
        coupon_serial: saleForm.coupon_serial.trim() || null,
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

      const responseData = await res.json()
      const authRef = responseData.auth_reference || ''
      setLastAuthRef(authRef)
      toast.success(authRef ? `Sale recorded. Auth ref: ${authRef}` : 'Credit sale recorded')

      // Reset form — re-seed price from live settings
      setSaleForm({
        account_id: '',
        fuel_type: 'Diesel',
        volume: '',
        price_per_liter: fuelPrices.Diesel ? fuelPrices.Diesel.toFixed(2) : '',
        pricing_tier: 'standard',
        amount: '',
        shift_id: '',
        notes: '',
        coupon_serial: '',
        driver_name: '',
        vehicle_reg: '',
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

  const effectiveType = (account: any): 'Pre-Paid' | 'Post-Paid' => {
    const t = account?.account_type
    return t === 'Pre-Paid' ? 'Pre-Paid' : 'Post-Paid'
  }

  const isBlocked = (account: any): boolean => {
    if (account.is_suspended) return true
    const t = effectiveType(account)
    if (t === 'Pre-Paid') return (account.current_balance ?? 0) <= 0 && (account.approved_overdraft ?? 0) <= 0
    return (account.credit_limit ?? 0) > 0 &&
      (account.current_balance ?? 0) >= (account.credit_limit ?? 0) + (account.approved_overdraft ?? 0)
  }

  const getBarPercent = (account: any): number => {
    const t = effectiveType(account)
    if (t === 'Pre-Paid') {
      const opening = account.opening_balance || account.current_balance || 0
      if (opening <= 0) return 0
      return Math.min(100, ((account.current_balance ?? 0) / opening) * 100)
    }
    const ceiling = (account.credit_limit ?? 0) + (account.approved_overdraft ?? 0)
    if (ceiling <= 0) return 0
    return Math.min(100, ((account.current_balance ?? 0) / ceiling) * 100)
  }

  const getBarColor = (account: any): string => {
    const t = effectiveType(account)
    const pct = getBarPercent(account)
    if (t === 'Pre-Paid') {
      if (pct <= 10) return 'bg-status-error'
      if (pct <= 30) return 'bg-status-warning'
      return 'bg-status-success'
    }
    if (pct >= 100) return 'bg-status-error'
    if (pct >= 80) return 'bg-status-warning'
    return 'bg-status-success'
  }

  const getAccountTypeColor = (accountType: string) => {
    if (accountType === 'Pre-Paid') return 'bg-category-b-light text-category-b border-category-b-border'
    return 'bg-action-primary-light text-action-primary border-action-primary'
  }

  const handleTopUp = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!topUpAccount) return
    const amt = parseFloat(topUpAmount)
    if (!amt || amt <= 0) { toast.error('Enter a valid amount'); return }
    setTopUpSaving(true)
    try {
      const params = new URLSearchParams({ amount: amt.toFixed(2) })
      if (topUpRef.trim()) params.set('reference', topUpRef.trim())
      const res = await authFetch(`${BASE}/accounts/${topUpAccount.account_id}/top-up?${params}`, {
        method: 'POST', headers: getHeaders(),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.detail || 'Top-up failed') }
      toast.success(`ZMW ${amt.toFixed(2)} added to ${topUpAccount.account_name}`)
      setTopUpAccount(null); setTopUpAmount(''); setTopUpRef('')
      fetchAccounts()
    } catch (err: any) { toast.error(err.message) }
    finally { setTopUpSaving(false) }
  }

  const handleApproveOverdraft = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!overdraftAccount) return
    const amt = parseFloat(overdraftAmount)
    if (isNaN(amt) || amt < 0) { toast.error('Enter a valid amount (0 to clear)'); return }
    setOverdraftSaving(true)
    try {
      const res = await authFetch(`${BASE}/accounts/${overdraftAccount.account_id}/approve-overdraft?amount=${amt.toFixed(2)}`, {
        method: 'POST', headers: getHeaders(),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.detail || 'Failed') }
      toast.success(amt > 0
        ? `ZMW ${amt.toFixed(2)} overdraft approved for ${overdraftAccount.account_name}`
        : `Overdraft cleared for ${overdraftAccount.account_name}`)
      setOverdraftAccount(null); setOverdraftAmount('')
      fetchAccounts()
    } catch (err: any) { toast.error(err.message) }
    finally { setOverdraftSaving(false) }
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-content-primary">Account Holders & Credit Sales</h1>
        <p className="mt-2 text-sm text-content-secondary">Manage institutional and corporate credit accounts</p>
      </div>

      {/* Record Credit Sale Form */}
      <div className="mb-8 bg-surface-card rounded-lg shadow-lg p-6">
        <h2 className="text-xl font-bold text-content-primary mb-4">Record Credit Sale</h2>

        {/* Last auth reference banner */}
        {lastAuthRef && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-md border border-status-success bg-status-success/10 px-4 py-3">
            <div>
              <p className="text-xs font-medium text-content-secondary">Last authorization reference — write this on the coupon</p>
              <p className="font-mono font-bold text-lg text-content-primary tracking-wide">{lastAuthRef}</p>
            </div>
            <button
              type="button"
              onClick={() => { navigator.clipboard.writeText(lastAuthRef); toast.success('Copied') }}
              className="shrink-0 px-3 py-1.5 text-xs font-semibold rounded border border-status-success text-status-success hover:bg-status-success hover:text-white transition-colors"
            >
              Copy
            </button>
          </div>
        )}

        <form onSubmit={handleSubmitSale} className="space-y-5">

          {/* Account + Coupon */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-content-secondary mb-1">Account</label>
              <select
                value={saleForm.account_id}
                onChange={(e) => handleAccountChange(e.target.value)}
                className="w-full px-3 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-action-primary focus:border-action-primary bg-surface-bg text-content-primary"
                required
              >
                <option value="">Select account</option>
                {accounts.map((account: any) => (
                  <option key={account.account_id} value={account.account_id}>
                    {account.client_code ? `[${account.client_code}] ` : ''}{account.account_name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-content-secondary mb-1">Coupon Serial No.</label>
              <input
                type="text"
                value={saleForm.coupon_serial}
                onChange={(e) => setSaleForm({ ...saleForm, coupon_serial: e.target.value })}
                className="w-full px-3 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-action-primary focus:border-action-primary bg-surface-bg text-content-primary font-mono"
                placeholder="e.g. C0045"
                required
              />
            </div>
          </div>

          {/* Auth Reference live preview */}
          <div>
            <label className="block text-sm font-medium text-content-secondary mb-1">Authorization Reference</label>
            <div className={`flex items-center gap-2 px-3 py-2.5 rounded-md border ${
              liveAuthRef ? 'border-action-primary bg-action-primary-light' : 'border-surface-border bg-surface-bg'
            }`}>
              <span className={`flex-1 font-mono font-bold text-base tracking-wide ${
                liveAuthRef ? 'text-action-primary' : 'text-content-tertiary'
              }`}>
                {liveAuthRef || 'Complete account, vehicle reg and coupon serial to generate'}
              </span>
              {liveAuthRef && (
                <button
                  type="button"
                  onClick={() => { navigator.clipboard.writeText(liveAuthRef); toast.success('Copied') }}
                  className="shrink-0 px-2 py-1 text-xs font-semibold rounded border border-action-primary text-action-primary hover:bg-action-primary hover:text-white transition-colors"
                >
                  Copy
                </button>
              )}
            </div>
            {liveAuthRef && (
              <p className="mt-1 text-xs text-content-secondary">Write this on the coupon before releasing fuel.</p>
            )}
          </div>

          {/* Driver + Vehicle */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-content-secondary mb-1">Driver Name</label>
              <input
                type="text"
                value={saleForm.driver_name}
                onChange={(e) => setSaleForm({ ...saleForm, driver_name: e.target.value })}
                className="w-full px-3 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-action-primary focus:border-action-primary bg-surface-bg text-content-primary"
                placeholder="e.g. John Mwansa"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-content-secondary mb-1">Vehicle Reg</label>
              <input
                type="text"
                value={saleForm.vehicle_reg}
                onChange={(e) => setSaleForm({ ...saleForm, vehicle_reg: e.target.value })}
                className="w-full px-3 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-action-primary focus:border-action-primary bg-surface-bg text-content-primary font-mono uppercase"
                placeholder="e.g. ABZ 1234 ZM"
                required
              />
            </div>
          </div>

          {/* Fuel + Volume + Price + Amount */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-content-secondary mb-1">Fuel Type</label>
              <select
                value={saleForm.fuel_type}
                onChange={(e) => handleFuelTypeChange(e.target.value)}
                className="w-full px-3 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-action-primary focus:border-action-primary bg-surface-bg text-content-primary"
              >
                <option value="Diesel">Diesel</option>
                <option value="Petrol">Petrol</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-content-secondary mb-1">Volume (L)</label>
              <input
                type="number"
                step="0.01"
                value={saleForm.volume}
                onChange={(e) => handleVolumeChange(e.target.value)}
                className="w-full px-3 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-action-primary focus:border-action-primary bg-surface-bg text-content-primary"
                placeholder="0.00"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-content-secondary mb-1">
                Price / L
                {saleForm.pricing_tier === 'custom' && (
                  <span className="ml-1 text-xs text-status-warning">(custom)</span>
                )}
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
                className={`w-full px-3 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-action-primary focus:border-action-primary font-semibold ${
                  saleForm.pricing_tier === 'custom' ? 'bg-status-pending-light' : 'bg-surface-bg'
                } text-content-primary`}
                placeholder={fuelPrices[saleForm.fuel_type as 'Diesel' | 'Petrol']
                  ? fuelPrices[saleForm.fuel_type as 'Diesel' | 'Petrol'].toFixed(2) : '0.00'}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-content-secondary mb-1">Amount (ZMW)</label>
              <input
                type="text"
                value={saleForm.amount}
                readOnly
                className="w-full px-3 py-2 border border-surface-border rounded-md bg-surface-bg font-bold text-lg cursor-not-allowed text-content-primary"
                placeholder="Auto-calculated"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-content-secondary mb-1">Notes (optional)</label>
            <input
              type="text"
              value={saleForm.notes}
              onChange={(e) => setSaleForm({ ...saleForm, notes: e.target.value })}
              className="w-full px-3 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-action-primary focus:border-action-primary bg-surface-bg text-content-primary"
              placeholder="Any additional notes"
            />
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
            {accounts.map((account: any) => {
              const t = effectiveType(account)
              const blocked = isBlocked(account)
              const barPct = getBarPercent(account)
              const barColor = getBarColor(account)
              const overdraft = account.approved_overdraft ?? 0

              // Pre-Paid: available = current_balance; ceiling = opening_balance
              // Post-Paid: owed = current_balance; ceiling = credit_limit
              const availableOrOwed = account.current_balance ?? 0
              const ceiling = t === 'Pre-Paid'
                ? (account.opening_balance || account.current_balance || 0)
                : (account.credit_limit ?? 0)
              const available = t === 'Pre-Paid'
                ? availableOrOwed
                : Math.max(0, ceiling - availableOrOwed)

              return (
                <div
                  key={account.account_id}
                  className={`bg-surface-card rounded-lg shadow-lg p-5 border-2 transition-all duration-200 ${
                    account.is_suspended
                      ? 'border-status-error opacity-60'
                      : blocked
                      ? 'border-status-warning'
                      : 'border-surface-border hover:border-action-primary hover:shadow-xl hover:-translate-y-0.5'
                  }`}
                >
                  {/* Header */}
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-content-primary text-lg leading-tight">{account.account_name}</h3>
                        {account.is_suspended && (
                          <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase rounded bg-status-error text-white">Suspended</span>
                        )}
                        {!account.is_suspended && blocked && (
                          <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase rounded bg-status-warning text-white">
                            {t === 'Pre-Paid' ? 'No Balance' : 'At Limit'}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-content-secondary mt-1">
                        {account.client_code && <span className="font-mono font-bold text-action-primary mr-2">{account.client_code}</span>}
                        {account.account_id}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 ml-2 shrink-0">
                      <span className={`px-2 py-1 text-xs font-semibold rounded border ${getAccountTypeColor(t)}`}>{t}</span>
                      {canManage && (
                        <button onClick={() => openEdit(account)}
                          className="px-2 py-1 text-xs rounded border border-surface-border text-content-secondary hover:bg-action-primary-light hover:text-action-primary hover:border-action-primary">
                          Edit
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Primary balance figure */}
                  <div className="mb-1">
                    <p className="text-xs text-content-secondary mb-0.5">
                      {t === 'Pre-Paid' ? 'Available Balance' : 'Amount Owed'}
                    </p>
                    <p className={`text-2xl font-bold ${
                      t === 'Pre-Paid'
                        ? (availableOrOwed <= 0 ? 'text-status-error' : 'text-content-primary')
                        : 'text-content-primary'
                    }`}>
                      {formatCurrency(availableOrOwed)}
                    </p>
                  </div>

                  {/* Ceiling */}
                  <div className="mb-3">
                    <p className="text-xs text-content-secondary">
                      {t === 'Pre-Paid' ? 'Opening Deposit' : 'Credit Ceiling'}
                    </p>
                    <p className="text-sm font-semibold text-content-secondary">{formatCurrency(ceiling)}</p>
                  </div>

                  {/* Progress bar */}
                  <div className="mb-3">
                    <div className="flex justify-between text-xs text-content-secondary mb-1">
                      <span>{t === 'Pre-Paid' ? 'Balance remaining' : 'Ceiling used'}</span>
                      <span className="font-semibold">{barPct.toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-surface-border rounded-full h-2.5 overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${barColor}`}
                        style={{ width: `${barPct}%` }} />
                    </div>
                  </div>

                  {/* Available credit / remaining */}
                  <div className="pt-3 border-t border-surface-border">
                    <p className="text-xs text-content-secondary">
                      {t === 'Pre-Paid' ? 'Balance' : 'Available Credit'}
                    </p>
                    <p className={`text-lg font-bold ${available <= 0 ? 'text-status-error' : 'text-status-success'}`}>
                      {formatCurrency(available)}
                    </p>
                  </div>

                  {/* Approved overdraft indicator */}
                  {overdraft > 0 && (
                    <div className="mt-2 px-2 py-1.5 rounded bg-status-warning/10 border border-status-warning/30">
                      <p className="text-xs text-status-warning font-medium">
                        Owner approved extra: {formatCurrency(overdraft)}
                      </p>
                    </div>
                  )}

                  {/* Custom rate */}
                  {account.default_price_per_liter && (
                    <div className="mt-3 pt-3 border-t border-surface-border">
                      <p className="text-xs text-content-secondary">Custom Rate</p>
                      <p className="text-sm font-semibold text-content-primary">
                        ZMW {account.default_price_per_liter.toFixed(2)}/L
                      </p>
                    </div>
                  )}

                  {/* Contacts */}
                  {(() => {
                    const contacts = account.contacts?.length
                      ? account.contacts
                      : account.contact_person ? [{ name: account.contact_person, phone: account.phone }] : []
                    return contacts.length > 0 ? (
                      <div className="mt-3 pt-3 border-t border-surface-border space-y-1">
                        <p className="text-xs font-medium text-content-secondary">{contacts.length === 1 ? 'Contact' : 'Contacts'}</p>
                        {contacts.map((c: any, i: number) => (
                          <p key={i} className="text-xs text-content-secondary">{c.name}{c.phone ? ` — ${c.phone}` : ''}</p>
                        ))}
                      </div>
                    ) : null
                  })()}

                  {/* Actions */}
                  {(canManage || isOwner) && (
                    <div className="mt-3 pt-3 border-t border-surface-border space-y-2">
                      {/* Owner: top-up (Pre-Paid) and overdraft approval */}
                      {isOwner && (
                        <div className="flex gap-2">
                          {t === 'Pre-Paid' && (
                            <button
                              onClick={() => { setTopUpAccount(account); setTopUpAmount(''); setTopUpRef('') }}
                              className="px-2 py-1 text-xs rounded border border-action-primary text-action-primary hover:bg-action-primary hover:text-white transition-colors font-medium">
                              Top Up
                            </button>
                          )}
                          <button
                            onClick={() => { setOverdraftAccount(account); setOverdraftAmount(overdraft > 0 ? String(overdraft) : '') }}
                            className="px-2 py-1 text-xs rounded border border-status-warning text-status-warning hover:bg-status-warning hover:text-white transition-colors font-medium">
                            {overdraft > 0 ? 'Adjust Overdraft' : 'Approve Overdraft'}
                          </button>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        {canManage && (
                          <button onClick={() => handleSuspend(account)}
                            className={`px-2 py-1 text-xs rounded border font-medium ${
                              account.is_suspended
                                ? 'border-status-success text-status-success hover:bg-status-success hover:text-white'
                                : 'border-status-warning text-status-warning hover:bg-status-warning hover:text-white'
                            } transition-colors`}>
                            {account.is_suspended ? 'Reinstate' : 'Suspend'}
                          </button>
                        )}
                        {isOwner && (
                          <button onClick={() => handleDelete(account)}
                            className="px-2 py-1 text-xs rounded border border-status-error text-status-error hover:bg-status-error hover:text-white transition-colors ml-auto">
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                  )}
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
          <li>• <strong>Pre-Paid</strong> — Customer deposits funds upfront. Each sale reduces the balance. Owner tops up when funds run low.</li>
          <li>• <strong>Post-Paid</strong> — Customer has a credit ceiling. Each sale increases what they owe. Owner records payment when they settle.</li>
          <li>• <strong>Owner Overdraft Approval</strong> — Owner can approve extra capacity on either type, consumed by the next sale(s).</li>
          <li>• <strong>Credit Sales</strong> are deducted from Expected Cash in shift reconciliation.</li>
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
                    <option value="Post-Paid">Post-Paid</option>
                    <option value="Pre-Paid">Pre-Paid</option>
                  </select>
                </div>
                {editForm.account_type === 'Post-Paid' && (
                  <div>
                    <label className="block text-sm font-medium text-content-secondary mb-1">Credit Ceiling (ZMW)</label>
                    <input type="number" step="0.01" min="0" value={editForm.credit_limit}
                      onChange={(e) => setEditForm({ ...editForm, credit_limit: e.target.value })}
                      className="w-full px-3 py-2 border border-surface-border rounded-md bg-surface-bg text-content-primary focus:outline-none focus:ring-action-primary focus:border-action-primary"
                      placeholder="0.00" />
                  </div>
                )}
                {editForm.account_type === 'Pre-Paid' && editingAccount && (
                  <div>
                    <label className="block text-sm font-medium text-content-secondary mb-1">Current Balance</label>
                    <p className="px-3 py-2 text-sm font-semibold text-content-primary border border-surface-border rounded-md bg-surface-bg/50">
                      {formatCurrency(editingAccount.current_balance ?? 0)}
                      <span className="ml-1 text-xs font-normal text-content-secondary">(managed via top-up)</span>
                    </p>
                  </div>
                )}
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
                {previewClientCode(createForm.account_name) && (
                  <p className="mt-1 text-xs text-content-secondary">
                    Client code: <span className="font-mono font-bold text-action-primary">{previewClientCode(createForm.account_name)}</span>
                    <span className="ml-1">(auto-assigned)</span>
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-content-secondary mb-1">Account Type</label>
                  <select value={createForm.account_type}
                    onChange={(e) => setCreateForm({ ...createForm, account_type: e.target.value })}
                    className="w-full px-3 py-2 border border-surface-border rounded-md bg-surface-bg text-content-primary focus:outline-none focus:ring-action-primary focus:border-action-primary">
                    <option value="Post-Paid">Post-Paid</option>
                    <option value="Pre-Paid">Pre-Paid</option>
                  </select>
                </div>
                {createForm.account_type === 'Post-Paid' ? (
                  <div>
                    <label className="block text-sm font-medium text-content-secondary mb-1">Credit Ceiling (ZMW)</label>
                    <input type="number" step="0.01" min="0" value={createForm.credit_limit}
                      onChange={(e) => setCreateForm({ ...createForm, credit_limit: e.target.value })}
                      className="w-full px-3 py-2 border border-surface-border rounded-md bg-surface-bg text-content-primary focus:outline-none focus:ring-action-primary focus:border-action-primary"
                      placeholder="0.00" />
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-content-secondary mb-1">Opening Balance (ZMW)</label>
                    <input type="number" step="0.01" min="0" value={createForm.opening_balance}
                      onChange={(e) => setCreateForm({ ...createForm, opening_balance: e.target.value })}
                      className="w-full px-3 py-2 border border-surface-border rounded-md bg-surface-bg text-content-primary focus:outline-none focus:ring-action-primary focus:border-action-primary"
                      placeholder="0.00" required />
                    <p className="mt-1 text-xs text-content-secondary">Initial deposit — becomes the starting balance.</p>
                  </div>
                )}
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

      {/* Top Up Modal (Pre-Paid, owner only) */}
      {topUpAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-lg shadow-lg p-6 bg-surface-card border border-surface-border">
            <h3 className="text-lg font-bold text-content-primary mb-1">Top Up — {topUpAccount.account_name}</h3>
            <p className="text-sm text-content-secondary mb-4">
              Current balance: <span className="font-semibold text-content-primary">{formatCurrency(topUpAccount.current_balance ?? 0)}</span>
            </p>
            <form onSubmit={handleTopUp} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-content-secondary mb-1">Amount to Add (ZMW)</label>
                <input type="number" step="0.01" min="0.01" value={topUpAmount}
                  onChange={(e) => setTopUpAmount(e.target.value)}
                  className="w-full px-3 py-2 border border-surface-border rounded-md bg-surface-bg text-content-primary focus:outline-none focus:ring-action-primary focus:border-action-primary"
                  placeholder="0.00" required autoFocus />
              </div>
              <div>
                <label className="block text-sm font-medium text-content-secondary mb-1">Reference (optional)</label>
                <input type="text" value={topUpRef}
                  onChange={(e) => setTopUpRef(e.target.value)}
                  className="w-full px-3 py-2 border border-surface-border rounded-md bg-surface-bg text-content-primary focus:outline-none focus:ring-action-primary focus:border-action-primary"
                  placeholder="e.g. Bank transfer ref, receipt no." />
              </div>
              {topUpAmount && parseFloat(topUpAmount) > 0 && (
                <p className="text-sm text-content-secondary">
                  New balance will be: <span className="font-semibold text-content-primary">
                    {formatCurrency((topUpAccount.current_balance ?? 0) + parseFloat(topUpAmount))}
                  </span>
                </p>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setTopUpAccount(null)}
                  className="px-4 py-2 text-sm rounded-md border border-surface-border text-content-secondary">Cancel</button>
                <button type="submit" disabled={topUpSaving}
                  className="px-4 py-2 text-sm font-semibold rounded-md bg-action-primary text-white disabled:opacity-50">
                  {topUpSaving ? 'Adding...' : 'Add Funds'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Approve Overdraft Modal (owner only) */}
      {overdraftAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-lg shadow-lg p-6 bg-surface-card border border-surface-border">
            <h3 className="text-lg font-bold text-content-primary mb-1">
              Approve Overdraft — {overdraftAccount.account_name}
            </h3>
            <p className="text-sm text-content-secondary mb-1">
              Type: <span className="font-semibold">{effectiveType(overdraftAccount)}</span>
            </p>
            <p className="text-sm text-content-secondary mb-4">
              {effectiveType(overdraftAccount) === 'Pre-Paid'
                ? `Current balance: ${formatCurrency(overdraftAccount.current_balance ?? 0)}. Overdraft allows draws beyond zero.`
                : `Ceiling: ${formatCurrency(overdraftAccount.credit_limit ?? 0)}. Overdraft allows sales beyond the ceiling.`}
            </p>
            <form onSubmit={handleApproveOverdraft} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-content-secondary mb-1">
                  Approved Extra Amount (ZMW)
                </label>
                <input type="number" step="0.01" min="0" value={overdraftAmount}
                  onChange={(e) => setOverdraftAmount(e.target.value)}
                  className="w-full px-3 py-2 border border-surface-border rounded-md bg-surface-bg text-content-primary focus:outline-none focus:ring-action-primary focus:border-action-primary"
                  placeholder="0.00 to clear" required autoFocus />
                <p className="mt-1 text-xs text-content-secondary">Set to 0 to remove any existing approval.</p>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setOverdraftAccount(null)}
                  className="px-4 py-2 text-sm rounded-md border border-surface-border text-content-secondary">Cancel</button>
                <button type="submit" disabled={overdraftSaving}
                  className="px-4 py-2 text-sm font-semibold rounded-md bg-status-warning text-white disabled:opacity-50">
                  {overdraftSaving ? 'Saving...' : 'Approve'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
