import { useState, useEffect } from 'react'
import { getHeaders, authFetch } from '../lib/api'

const BASE = '/api/v1'

type SettingsTab = 'system' | 'fuel' | 'tax-levy' | 'validation' | 'stock-alerts' | 'recon-tolerances' | 'email' | 'tank-calibration'

export default function Settings() {
  const [settings, setSettings] = useState({
    diesel_price_per_liter: 150.0,
    petrol_price_per_liter: 160.0,
    diesel_allowable_loss_percent: 0.3,
    petrol_allowable_loss_percent: 0.5,
    nozzle_allowable_loss_liters: 0.8,
    cash_shortage_threshold: 500.0,
  })
  const [scheduledPrices, setScheduledPrices] = useState<any[]>([])
  const [scheduleForm, setScheduleForm] = useState({ fuel_type: 'Diesel', new_price_per_liter: '', effective_date: '', effective_time: '00:00' })
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const [systemSettings, setSystemSettings] = useState({
    business_name: '',
    license_key: '',
    contact_email: '',
    contact_phone: '',
    license_expiry_date: '',
    software_version: '1.0.0',
    station_location: '',
  })
  const [systemLoading, setSystemLoading] = useState(false)
  const [systemMessage, setSystemMessage] = useState('')
  const [systemError, setSystemError] = useState('')

  const [validationThresholds, setValidationThresholds] = useState({
    pass_threshold: 0.5,
    warning_threshold: 1.0,
    meter_discrepancy_threshold: 0.5,
  })
  const [thresholdsLoading, setThresholdsLoading] = useState(false)
  const [thresholdsMessage, setThresholdsMessage] = useState('')
  const [thresholdsError, setThresholdsError] = useState('')

  const [emailSettings, setEmailSettings] = useState({
    enabled: false,
    from_address: 'NextStop <onboarding@resend.dev>',
    recipients: [] as string[],
  })
  const [emailLoading, setEmailLoading] = useState(false)
  const [emailMessage, setEmailMessage] = useState('')
  const [emailError, setEmailError] = useState('')
  const [newRecipient, setNewRecipient] = useState('')
  const [testLoading, setTestLoading] = useState(false)

  const [taxLevy, setTaxLevy] = useState({ vat_rate: 0.16, fuel_levy_per_liter: 1.44 })
  const [taxLevyLoading, setTaxLevyLoading] = useState(false)
  const [taxLevyMessage, setTaxLevyMessage] = useState('')
  const [taxLevyError, setTaxLevyError] = useState('')

  const [stockAlerts, setStockAlerts] = useState({ low_stock_threshold_percent: 25.0, critical_stock_threshold_percent: 10.0 })
  const [stockAlertsLoading, setStockAlertsLoading] = useState(false)
  const [stockAlertsMessage, setStockAlertsMessage] = useState('')
  const [stockAlertsError, setStockAlertsError] = useState('')

  const [reconTolerances, setReconTolerances] = useState<any>({
    volume_tolerance_mode: 'percentage',
    volume_tolerance_minor: 50.0,
    volume_tolerance_investigation: 200.0,
    volume_cap_minor: 0.0,
    volume_cap_investigation: 0.0,
    percent_tolerance_minor: 0.5,
    percent_tolerance_investigation: 2.0,
    volume_tiers: [],
    cash_tolerance_minor: 500.0,
    cash_tolerance_investigation: 2000.0,
    min_volume_for_percent: 100.0,
  })
  const [reconLoading, setReconLoading] = useState(false)
  const [reconMessage, setReconMessage] = useState('')
  const [reconError, setReconError] = useState('')

  const [activeTab, setActiveTab] = useState<SettingsTab>('system')
  const [currentUserRole, setCurrentUserRole] = useState<string>('')

  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (userData) {
      const parsed = JSON.parse(userData)
      setCurrentUserRole(parsed.role || '')
      // Managers cannot see system/email tabs, default to fuel
      if (parsed.role === 'manager') {
        setActiveTab('fuel')
      }
    }
  }, [])

  useEffect(() => {
    loadSettings()
    loadScheduledPrices()
    loadSystemSettings()
    loadValidationThresholds()
    loadEmailSettings()
    loadTaxLevy()
    loadStockAlerts()
    loadReconTolerances()
  }, [])

  // ── Loaders ──────────────────────────────────────────────

  const loadSettings = async () => {
    try {
      const res = await authFetch(`${BASE}/settings/fuel`, { headers: getHeaders() })
      if (res.ok) setSettings(await res.json())
    } catch (err) {
      console.error('Failed to load settings:', err)
    }
  }

  const loadScheduledPrices = async () => {
    try {
      const res = await authFetch(`${BASE}/settings/fuel/scheduled-prices`, { headers: getHeaders() })
      if (res.ok) {
        const data = await res.json()
        setScheduledPrices(data.scheduled_prices || [])
      }
    } catch {}
  }

  const handleSchedulePrice = async () => {
    if (!scheduleForm.new_price_per_liter || !scheduleForm.effective_date) return
    try {
      const res = await authFetch(`${BASE}/settings/fuel/schedule-price`, {
        method: 'POST',
        headers: { ...getHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fuel_type: scheduleForm.fuel_type,
          new_price_per_liter: parseFloat(scheduleForm.new_price_per_liter),
          effective_date: scheduleForm.effective_date,
          effective_time: scheduleForm.effective_time || '00:00',
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        setError(err.detail || 'Failed to schedule price')
        return
      }
      setMessage('Price change scheduled successfully')
      setScheduleForm({ fuel_type: 'Diesel', new_price_per_liter: '', effective_date: '', effective_time: '00:00' })
      loadScheduledPrices()
    } catch (err: any) {
      setError(err.message || 'Failed to schedule price')
    }
  }

  const handleCancelSchedule = async (index: number) => {
    if (!confirm('Cancel this scheduled price change?')) return
    try {
      const res = await authFetch(`${BASE}/settings/fuel/scheduled-price/${index}`, {
        method: 'DELETE',
        headers: getHeaders(),
      })
      if (res.ok) {
        setMessage('Scheduled price change cancelled')
        loadScheduledPrices()
      }
    } catch {}
  }

  const loadSystemSettings = async () => {
    try {
      const res = await authFetch(`${BASE}/settings/system`, { headers: getHeaders() })
      if (res.ok) setSystemSettings(await res.json())
    } catch (err) {
      console.error('Failed to load system settings:', err)
    }
  }

  const loadValidationThresholds = async () => {
    try {
      const res = await authFetch(`${BASE}/settings/validation-thresholds`, { headers: getHeaders() })
      if (res.ok) setValidationThresholds(await res.json())
    } catch (err) {
      console.error('Failed to load validation thresholds:', err)
    }
  }

  const loadEmailSettings = async () => {
    try {
      const res = await authFetch(`${BASE}/settings/email`, { headers: getHeaders() })
      if (res.ok) setEmailSettings(await res.json())
    } catch (err) {
      console.error('Failed to load email settings:', err)
    }
  }

  const loadTaxLevy = async () => {
    try {
      const res = await authFetch(`${BASE}/settings/tax-levy`, { headers: getHeaders() })
      if (res.ok) setTaxLevy(await res.json())
    } catch (err) {
      console.error('Failed to load tax/levy settings:', err)
    }
  }

  const loadStockAlerts = async () => {
    try {
      const res = await authFetch(`${BASE}/settings/stock-alerts`, { headers: getHeaders() })
      if (res.ok) setStockAlerts(await res.json())
    } catch (err) {
      console.error('Failed to load stock alert settings:', err)
    }
  }

  const loadReconTolerances = async () => {
    try {
      const res = await authFetch(`${BASE}/settings/reconciliation-tolerances`, { headers: getHeaders() })
      if (res.ok) setReconTolerances(await res.json())
    } catch (err) {
      console.error('Failed to load reconciliation tolerances:', err)
    }
  }

  // ── Updaters ─────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setMessage('')
    try {
      const res = await authFetch(`${BASE}/settings/fuel`, {
        method: 'PUT',
        headers: { ...getHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      if (!res.ok) throw new Error('Failed to update settings')
      await res.json()
      setMessage('Settings updated successfully!')
      setTimeout(() => setMessage(''), 3000)
    } catch (err: any) {
      setError(err.message || 'Failed to update settings')
    } finally {
      setLoading(false)
    }
  }

  const handleSystemUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    setSystemLoading(true)
    setSystemError('')
    setSystemMessage('')
    try {
      const res = await authFetch(`${BASE}/settings/system`, {
        method: 'PUT',
        headers: { ...getHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(systemSettings),
      })
      if (!res.ok) throw new Error('Failed to update system settings')
      await res.json()
      setSystemMessage('System settings updated successfully!')
      setTimeout(() => setSystemMessage(''), 3000)
    } catch (err: any) {
      setSystemError(err.message || 'Failed to update system settings')
    } finally {
      setSystemLoading(false)
    }
  }

  const updateValidationThresholds = async () => {
    setThresholdsLoading(true)
    setThresholdsMessage('')
    setThresholdsError('')
    try {
      const res = await authFetch(`${BASE}/settings/validation-thresholds`, {
        method: 'PUT',
        headers: { ...getHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(validationThresholds),
      })
      if (res.ok) {
        setThresholdsMessage('Validation thresholds updated successfully!')
        setTimeout(() => setThresholdsMessage(''), 3000)
      } else {
        setThresholdsError('Failed to update thresholds')
      }
    } catch (err) {
      setThresholdsError('Error updating thresholds')
    } finally {
      setThresholdsLoading(false)
    }
  }

  const updateEmailSettings = async () => {
    setEmailLoading(true)
    setEmailMessage('')
    setEmailError('')
    try {
      const res = await authFetch(`${BASE}/settings/email`, {
        method: 'PUT',
        headers: { ...getHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(emailSettings),
      })
      if (res.ok) {
        setEmailMessage('Email settings updated successfully!')
        setTimeout(() => setEmailMessage(''), 3000)
      } else {
        const data = await res.json()
        setEmailError(data.detail || 'Failed to update email settings')
      }
    } catch (err) {
      setEmailError('Error updating email settings')
    } finally {
      setEmailLoading(false)
    }
  }

  const sendTestEmail = async () => {
    setTestLoading(true)
    setEmailMessage('')
    setEmailError('')
    try {
      const res = await authFetch(`${BASE}/settings/email/test`, {
        method: 'POST',
        headers: getHeaders(),
      })
      const data = await res.json()
      if (res.ok) {
        setEmailMessage(data.message || 'Test email sent!')
        setTimeout(() => setEmailMessage(''), 5000)
      } else {
        setEmailError(data.detail || 'Test email failed')
      }
    } catch (err) {
      setEmailError('Error sending test email')
    } finally {
      setTestLoading(false)
    }
  }

  const updateTaxLevy = async () => {
    setTaxLevyLoading(true)
    setTaxLevyMessage('')
    setTaxLevyError('')
    try {
      const res = await authFetch(`${BASE}/settings/tax-levy`, {
        method: 'PUT',
        headers: { ...getHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(taxLevy),
      })
      if (res.ok) {
        setTaxLevyMessage('Tax & levy settings updated successfully!')
        setTimeout(() => setTaxLevyMessage(''), 3000)
      } else {
        const d = await res.json()
        setTaxLevyError(d.detail || 'Failed to update')
      }
    } catch {
      setTaxLevyError('Error updating tax & levy settings')
    } finally {
      setTaxLevyLoading(false)
    }
  }

  const updateStockAlerts = async () => {
    setStockAlertsLoading(true)
    setStockAlertsMessage('')
    setStockAlertsError('')
    if (stockAlerts.critical_stock_threshold_percent >= stockAlerts.low_stock_threshold_percent) {
      setStockAlertsError('Critical threshold must be less than low stock threshold')
      setStockAlertsLoading(false)
      return
    }
    try {
      const res = await authFetch(`${BASE}/settings/stock-alerts`, {
        method: 'PUT',
        headers: { ...getHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(stockAlerts),
      })
      if (res.ok) {
        setStockAlertsMessage('Stock alert settings updated successfully!')
        setTimeout(() => setStockAlertsMessage(''), 3000)
      } else {
        const d = await res.json()
        setStockAlertsError(d.detail || 'Failed to update')
      }
    } catch {
      setStockAlertsError('Error updating stock alert settings')
    } finally {
      setStockAlertsLoading(false)
    }
  }

  const updateReconTolerances = async () => {
    setReconLoading(true)
    setReconMessage('')
    setReconError('')
    const mode = reconTolerances.volume_tolerance_mode
    if (mode === 'fixed' && reconTolerances.volume_tolerance_minor >= reconTolerances.volume_tolerance_investigation) {
      setReconError('Volume minor must be less than investigation'); setReconLoading(false); return
    }
    if ((mode === 'percentage' || mode === 'hybrid') && reconTolerances.percent_tolerance_minor >= reconTolerances.percent_tolerance_investigation) {
      setReconError('Percent minor must be less than investigation'); setReconLoading(false); return
    }
    if (mode === 'hybrid' && reconTolerances.volume_cap_minor > 0 && reconTolerances.volume_cap_investigation > 0 && reconTolerances.volume_cap_minor >= reconTolerances.volume_cap_investigation) {
      setReconError('Volume cap minor must be less than volume cap investigation'); setReconLoading(false); return
    }
    if (mode === 'tiered') {
      const tiers = reconTolerances.volume_tiers || []
      if (tiers.length === 0) { setReconError('Tiered mode requires at least one tier'); setReconLoading(false); return }
      for (let i = 0; i < tiers.length; i++) {
        if (tiers[i].tolerance_minor >= tiers[i].tolerance_investigation) {
          setReconError(`Tier ${i + 1}: minor must be less than investigation`); setReconLoading(false); return
        }
        if (i > 0 && tiers[i].up_to_liters <= tiers[i - 1].up_to_liters) {
          setReconError(`Tier ${i + 1}: volume must be greater than previous tier`); setReconLoading(false); return
        }
      }
    }
    if (reconTolerances.cash_tolerance_minor >= reconTolerances.cash_tolerance_investigation) {
      setReconError('Cash minor must be less than investigation'); setReconLoading(false); return
    }
    try {
      const res = await authFetch(`${BASE}/settings/reconciliation-tolerances`, {
        method: 'PUT',
        headers: { ...getHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(reconTolerances),
      })
      if (res.ok) {
        setReconMessage('Reconciliation tolerances updated successfully!')
        setTimeout(() => setReconMessage(''), 3000)
      } else {
        const d = await res.json()
        setReconError(d.detail || 'Failed to update')
      }
    } catch {
      setReconError('Error updating reconciliation tolerances')
    } finally {
      setReconLoading(false)
    }
  }

  // ── Helpers ──────────────────────────────────────────────

  const addRecipient = () => {
    const email = newRecipient.trim()
    if (!email) return
    if (!/^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(email)) {
      setEmailError('Invalid email address')
      return
    }
    if (emailSettings.recipients.includes(email)) {
      setEmailError('Email already in list')
      return
    }
    setEmailSettings({ ...emailSettings, recipients: [...emailSettings.recipients, email] })
    setNewRecipient('')
    setEmailError('')
  }

  const removeRecipient = (email: string) => {
    setEmailSettings({
      ...emailSettings,
      recipients: emailSettings.recipients.filter(r => r !== email),
    })
  }

  // ── Tab config ───────────────────────────────────────────

  const allTabs: { id: SettingsTab; label: string }[] = [
    { id: 'system', label: 'System Information' },
    { id: 'fuel', label: 'Fuel Settings' },
    { id: 'tax-levy', label: 'Tax & Levy' },
    { id: 'validation', label: 'Validation Thresholds' },
    { id: 'stock-alerts', label: 'Stock Alerts' },
    { id: 'recon-tolerances', label: 'Reconciliation' },
    { id: 'email', label: 'Email Notifications' },
    { id: 'tank-calibration', label: 'Tank Calibration' },
  ]
  const managerHiddenTabs: SettingsTab[] = ['system', 'email', 'tank-calibration']
  const tabs = currentUserRole === 'manager'
    ? allTabs.filter(t => !managerHiddenTabs.includes(t.id))
    : allTabs

  // ── Render ───────────────────────────────────────────────

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-content-primary">Owner Settings</h1>
        <p className="mt-2 text-sm text-content-secondary">
          Configure system information, fuel pricing, tax rates, thresholds, and notifications
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="mb-6 border-b border-surface-border">
        <nav className="-mb-px flex flex-wrap gap-1 sm:gap-0 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-4 px-1 border-b-2 font-medium text-sm transition-colors whitespace-nowrap text-center ${
                activeTab === tab.id
                  ? 'border-action-primary text-action-primary'
                  : 'border-transparent text-content-secondary hover:text-content-primary hover:border-surface-border'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* ── System Information Tab ── */}
      {activeTab === 'system' && (
        <div className="bg-surface-card rounded-lg shadow p-6">
          <form onSubmit={handleSystemUpdate} className="space-y-6">
            <div className="border-b pb-6">
              <h2 className="text-xl font-semibold text-content-primary mb-4">System Information</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-content-secondary mb-1">Business Name</label>
                  <input
                    type="text"
                    value={systemSettings.business_name}
                    onChange={(e) => setSystemSettings({ ...systemSettings, business_name: e.target.value })}
                    className="w-full px-3 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-action-primary focus:border-action-primary"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-content-secondary mb-1">License Key</label>
                  <input
                    type="text"
                    value={systemSettings.license_key}
                    onChange={(e) => setSystemSettings({ ...systemSettings, license_key: e.target.value })}
                    className="w-full px-3 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-action-primary focus:border-action-primary"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-content-secondary mb-1">Contact Email</label>
                  <input
                    type="email"
                    value={systemSettings.contact_email}
                    onChange={(e) => setSystemSettings({ ...systemSettings, contact_email: e.target.value })}
                    className="w-full px-3 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-action-primary focus:border-action-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-content-secondary mb-1">Contact Phone</label>
                  <input
                    type="tel"
                    value={systemSettings.contact_phone}
                    onChange={(e) => setSystemSettings({ ...systemSettings, contact_phone: e.target.value })}
                    className="w-full px-3 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-action-primary focus:border-action-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-content-secondary mb-1">Station Location</label>
                  <input
                    type="text"
                    value={systemSettings.station_location}
                    onChange={(e) => setSystemSettings({ ...systemSettings, station_location: e.target.value })}
                    className="w-full px-3 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-action-primary focus:border-action-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-content-secondary mb-1">License Expiry Date</label>
                  <input
                    type="date"
                    value={systemSettings.license_expiry_date}
                    onChange={(e) => setSystemSettings({ ...systemSettings, license_expiry_date: e.target.value })}
                    className="w-full px-3 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-action-primary focus:border-action-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-content-secondary mb-1">Software Version</label>
                  <input
                    type="text"
                    value={systemSettings.software_version}
                    disabled
                    className="w-full px-3 py-2 border border-surface-border rounded-md bg-surface-bg cursor-not-allowed"
                  />
                  <p className="text-xs text-content-secondary mt-1">Read-only</p>
                </div>
              </div>
            </div>

            {systemMessage && (
              <div className="p-4 bg-status-success-light border border-status-success rounded-md">
                <p className="text-sm text-status-success">✓ {systemMessage}</p>
              </div>
            )}
            {systemError && (
              <div className="p-4 bg-status-error-light border border-status-error rounded-md">
                <p className="text-sm text-status-error">✗ {systemError}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={systemLoading}
              className="w-full px-4 py-3 bg-action-primary text-white font-medium rounded-md hover:bg-action-primary-hover focus:outline-none focus:ring-2 focus:ring-action-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {systemLoading ? 'Saving...' : 'Save System Information'}
            </button>
          </form>
        </div>
      )}

      {/* ── Fuel Settings Tab ── */}
      {activeTab === 'fuel' && (
        <div className="bg-surface-card rounded-lg shadow p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="border-b pb-6">
              <h2 className="text-xl font-semibold text-content-primary mb-4">Fuel Pricing</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-content-secondary mb-1">Diesel Price per Liter</label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      value={settings.diesel_price_per_liter}
                      onChange={(e) => setSettings({ ...settings, diesel_price_per_liter: parseFloat(e.target.value) })}
                      className="w-full px-3 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-action-primary focus:border-action-primary"
                      required
                    />
                    <span className="absolute right-3 top-2 text-content-secondary">ZMW</span>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-content-secondary mb-1">Petrol Price per Liter</label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      value={settings.petrol_price_per_liter}
                      onChange={(e) => setSettings({ ...settings, petrol_price_per_liter: parseFloat(e.target.value) })}
                      className="w-full px-3 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-action-primary focus:border-action-primary"
                      required
                    />
                    <span className="absolute right-3 top-2 text-content-secondary">ZMW</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Scheduled Price Changes */}
            <div className="border-b pb-6">
              <h2 className="text-xl font-semibold text-content-primary mb-4">Scheduled Price Changes</h2>
              <p className="text-sm text-content-secondary mb-3">Schedule future price changes (e.g., month-end adjustments). The new price activates automatically at the specified date and time.</p>

              {/* Schedule form */}
              <div className="flex flex-wrap items-end gap-3 mb-4">
                <div>
                  <label className="block text-xs font-medium text-content-secondary mb-1">Fuel Type</label>
                  <select value={scheduleForm.fuel_type} onChange={e => setScheduleForm({ ...scheduleForm, fuel_type: e.target.value })}
                    className="px-3 py-2 border border-surface-border rounded-md text-sm">
                    <option value="Diesel">Diesel</option>
                    <option value="Petrol">Petrol</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-content-secondary mb-1">New Price (ZMW)</label>
                  <input type="number" step="0.01" min="0" value={scheduleForm.new_price_per_liter}
                    onChange={e => setScheduleForm({ ...scheduleForm, new_price_per_liter: e.target.value })}
                    placeholder="0.00"
                    className="px-3 py-2 border border-surface-border rounded-md text-sm w-32" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-content-secondary mb-1">Effective Date</label>
                  <input type="date" value={scheduleForm.effective_date}
                    onChange={e => setScheduleForm({ ...scheduleForm, effective_date: e.target.value })}
                    className="px-3 py-2 border border-surface-border rounded-md text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-content-secondary mb-1">Time</label>
                  <input type="time" value={scheduleForm.effective_time}
                    onChange={e => setScheduleForm({ ...scheduleForm, effective_time: e.target.value })}
                    className="px-3 py-2 border border-surface-border rounded-md text-sm" />
                </div>
                <button type="button" onClick={handleSchedulePrice}
                  disabled={!scheduleForm.new_price_per_liter || !scheduleForm.effective_date}
                  className="px-4 py-2 bg-action-primary text-white rounded-md text-sm font-medium disabled:opacity-50">
                  Schedule
                </button>
              </div>

              {/* Scheduled list */}
              {scheduledPrices.length > 0 ? (
                <div className="space-y-2">
                  {scheduledPrices.map((sp: any, idx: number) => (
                    <div key={idx} className={`flex items-center justify-between p-3 rounded-lg border text-sm ${
                      sp.applied ? 'bg-surface-bg border-surface-border' : 'bg-action-primary-light border-action-primary'
                    }`}>
                      <div>
                        <span className="font-medium text-content-primary">{sp.fuel_type}</span>
                        <span className="text-content-secondary mx-2">→</span>
                        <span className="font-mono font-semibold text-content-primary">K{sp.new_price_per_liter}</span>
                        <span className="text-content-secondary ml-2">effective {sp.effective_date} at {sp.effective_time || '00:00'}</span>
                        {sp.applied && sp.old_price_per_liter && (
                          <span className="text-xs text-content-secondary ml-2">(was K{sp.old_price_per_liter})</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {sp.applied ? (
                          <span className="text-xs px-2 py-0.5 rounded bg-status-success-light text-status-success font-medium">Applied</span>
                        ) : (
                          <>
                            <span className="text-xs px-2 py-0.5 rounded bg-action-primary-light text-action-primary font-medium">Pending</span>
                            <button type="button" onClick={() => handleCancelSchedule(idx)}
                              className="text-xs text-status-error hover:underline">Cancel</button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-content-secondary">No scheduled price changes.</p>
              )}
            </div>

            <div>
              <h2 className="text-xl font-semibold text-content-primary mb-4">Allowable Losses During Offloading</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-content-secondary mb-1">Diesel Allowable Loss (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="5"
                    value={settings.diesel_allowable_loss_percent}
                    onChange={(e) => setSettings({ ...settings, diesel_allowable_loss_percent: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-action-primary focus:border-action-primary"
                    required
                  />
                  <p className="text-xs text-content-secondary mt-1">Default: 0.3% loss during delivery</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-content-secondary mb-1">Petrol Allowable Loss (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="5"
                    value={settings.petrol_allowable_loss_percent}
                    onChange={(e) => setSettings({ ...settings, petrol_allowable_loss_percent: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-action-primary focus:border-action-primary"
                    required
                  />
                  <p className="text-xs text-content-secondary mt-1">Default: 0.5% loss during delivery</p>
                </div>
              </div>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-content-primary mb-4">Nozzle Loss Threshold</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-content-secondary mb-1">Allowable Loss Per Nozzle (Liters)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="50"
                    value={settings.nozzle_allowable_loss_liters}
                    onChange={(e) => setSettings({ ...settings, nozzle_allowable_loss_liters: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-action-primary focus:border-action-primary"
                    required
                  />
                  <p className="text-xs text-content-secondary mt-1">Default: 0.8L — losses above this per nozzle will be flagged during shift handover</p>
                </div>
              </div>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-content-primary mb-4">Cash Shortage Threshold</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-content-secondary mb-1">Cash Shortage Threshold (ZMW)</label>
                  <input
                    type="number"
                    step="50"
                    min="0"
                    value={settings.cash_shortage_threshold}
                    onChange={(e) => setSettings({ ...settings, cash_shortage_threshold: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-action-primary focus:border-action-primary"
                    required
                  />
                  <p className="text-xs text-content-secondary mt-1">Default: K500 — a shift handover is flagged when cash is over/short by more than this amount</p>
                </div>
              </div>
            </div>

            {message && (
              <div className="p-4 bg-status-success-light border border-status-success rounded-md">
                <p className="text-sm text-status-success">✓ {message}</p>
              </div>
            )}
            {error && (
              <div className="p-4 bg-status-error-light border border-status-error rounded-md">
                <p className="text-sm text-status-error">✗ {error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full px-4 py-3 bg-action-primary text-white font-medium rounded-md hover:bg-action-primary-hover focus:outline-none focus:ring-2 focus:ring-action-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Saving...' : 'Save Settings'}
            </button>
          </form>

          <div className="mt-6 bg-action-primary-light border border-action-primary rounded-lg p-4">
            <h3 className="text-sm font-semibold text-action-primary mb-2">About Allowable Losses</h3>
            <ul className="text-sm text-action-primary space-y-1">
              <li>Allowable losses account for evaporation and spillage during fuel delivery</li>
              <li>Typical industry standards: Diesel 0.2-0.4%, Petrol 0.3-0.6%</li>
              <li>Losses exceeding these thresholds will be flagged in delivery reports</li>
              <li>These settings are used to validate stock movements and calculate expected inventory</li>
            </ul>
          </div>
        </div>
      )}

      {/* ── Tax & Levy Tab ── */}
      {activeTab === 'tax-levy' && (
        <div className="bg-surface-card rounded-lg shadow p-6">
          <div className="space-y-6">
            <div className="border-b pb-4">
              <h2 className="text-xl font-semibold text-content-primary mb-2">Tax & Levy Settings</h2>
              <p className="text-sm text-content-secondary">
                Configure VAT rate and fuel levy used for delivery VAT calculations.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-content-secondary mb-1">VAT Rate (%)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={taxLevy.vat_rate * 100}
                  onChange={(e) => setTaxLevy({ ...taxLevy, vat_rate: parseFloat(e.target.value) / 100 })}
                  className="w-full px-3 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-action-primary focus:border-action-primary"
                  required
                />
                <p className="text-xs text-content-secondary mt-1">
                  Current: {(taxLevy.vat_rate * 100).toFixed(1)}% (stored as {taxLevy.vat_rate})
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-content-secondary mb-1">Fuel Levy per Liter (ZMW)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="50"
                  value={taxLevy.fuel_levy_per_liter}
                  onChange={(e) => setTaxLevy({ ...taxLevy, fuel_levy_per_liter: parseFloat(e.target.value) })}
                  className="w-full px-3 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-action-primary focus:border-action-primary"
                  required
                />
                <p className="text-xs text-content-secondary mt-1">Levy deducted per liter before VAT calculation</p>
              </div>
            </div>

            {taxLevyMessage && (
              <div className="p-4 bg-status-success-light border border-status-success rounded-md">
                <p className="text-sm text-status-success">✓ {taxLevyMessage}</p>
              </div>
            )}
            {taxLevyError && (
              <div className="p-4 bg-status-error-light border border-status-error rounded-md">
                <p className="text-sm text-status-error">✗ {taxLevyError}</p>
              </div>
            )}

            <button
              onClick={updateTaxLevy}
              disabled={taxLevyLoading}
              className="w-full px-4 py-3 bg-action-primary text-white font-medium rounded-md hover:bg-action-primary-hover focus:outline-none focus:ring-2 focus:ring-action-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {taxLevyLoading ? 'Saving...' : 'Save Tax & Levy Settings'}
            </button>

            <div className="bg-action-primary-light border border-action-primary rounded-lg p-4">
              <h3 className="text-sm font-semibold text-action-primary mb-2">How delivery VAT is calculated</h3>
              <p className="text-sm text-action-primary">
                VAT = Volume x ((Price - Levy) / (1 + VAT Rate)) x VAT Rate
              </p>
              <p className="text-sm text-action-primary mt-1">
                These values are used in the Daily Tank Readings delivery VAT calculation.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Validation Thresholds Tab ── */}
      {activeTab === 'validation' && (
        <div className="bg-surface-card rounded-lg shadow p-6">
          <div className="space-y-6">
            <div className="border-b pb-4">
              <h2 className="text-xl font-semibold text-content-primary mb-2">Validation Thresholds</h2>
              <p className="text-sm text-content-secondary">
                Configure variance thresholds for tank vs nozzle reading validation. These settings determine when readings are marked as PASS, WARNING, or FAIL.
              </p>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-content-secondary mb-1">PASS Threshold (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="10"
                    value={validationThresholds.pass_threshold}
                    onChange={(e) => setValidationThresholds({ ...validationThresholds, pass_threshold: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 border border-status-success rounded-md focus:outline-none focus:ring-status-success focus:border-status-success"
                    required
                  />
                  <p className="text-xs text-content-secondary mt-1">
                    Variance &le; this % = PASS (Green status)
                    <span className="ml-1 text-content-tertiary">
                      — e.g. {((validationThresholds.pass_threshold / 100) * 20000).toFixed(0)}L on a 20,000L tank, {((validationThresholds.pass_threshold / 100) * 5000).toFixed(0)}L on 5,000L
                    </span>
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-content-secondary mb-1">WARNING Threshold (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="10"
                    value={validationThresholds.warning_threshold}
                    onChange={(e) => setValidationThresholds({ ...validationThresholds, warning_threshold: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 border border-status-warning rounded-md focus:outline-none focus:ring-status-warning focus:border-status-warning"
                    required
                  />
                  <p className="text-xs text-content-secondary mt-1">
                    Variance &le; this % = WARNING (Yellow status)
                    <span className="ml-1 text-content-tertiary">
                      — e.g. {((validationThresholds.warning_threshold / 100) * 20000).toFixed(0)}L on a 20,000L tank, {((validationThresholds.warning_threshold / 100) * 5000).toFixed(0)}L on 5,000L
                    </span>
                  </p>
                </div>
              </div>

              <div className="mt-4">
                <label className="block text-sm font-medium text-content-secondary mb-1">Meter Discrepancy Threshold (%)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="10"
                  value={validationThresholds.meter_discrepancy_threshold}
                  onChange={(e) => setValidationThresholds({ ...validationThresholds, meter_discrepancy_threshold: parseFloat(e.target.value) })}
                  className="w-full px-3 py-2 border border-category-c-border rounded-md focus:outline-none focus:ring-category-c focus:border-category-c"
                  required
                />
                <p className="text-xs text-content-secondary mt-1">
                  When electronic vs mechanical dispensed discrepancy exceeds this threshold, attendants must provide a note explaining the difference.
                  <span className="block mt-0.5 text-content-tertiary">
                    e.g. {((validationThresholds.meter_discrepancy_threshold / 100) * 2000).toFixed(1)}L on 2,000L dispensed, {((validationThresholds.meter_discrepancy_threshold / 100) * 500).toFixed(1)}L on 500L dispensed
                  </span>
                </p>
              </div>

              <div className="bg-action-primary-light border border-action-primary rounded-lg p-4 mt-4">
                <h3 className="text-sm font-semibold text-action-primary mb-2">Based on December 2025 Data:</h3>
                <ul className="text-sm text-action-primary space-y-1">
                  <li>Diesel average variance: 0.59%</li>
                  <li>Petrol average variance: 0.72%</li>
                  <li>Recommended PASS: 2.0%</li>
                  <li>Recommended WARNING: 3.5%</li>
                </ul>
              </div>

              <div className="bg-surface-bg border border-surface-border rounded-lg p-4">
                <h3 className="text-sm font-semibold text-content-primary mb-2">How It Works:</h3>
                <ul className="text-sm text-content-secondary space-y-2">
                  <li className="flex items-start">
                    <span className="text-status-success font-bold mr-2">PASS:</span>
                    <span>Variance is within acceptable range (&le; PASS threshold)</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-status-warning font-bold mr-2">WARNING:</span>
                    <span>Variance exceeds PASS but is &le; WARNING threshold - requires attention</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-status-error font-bold mr-2">FAIL:</span>
                    <span>Variance exceeds WARNING threshold - significant discrepancy detected</span>
                  </li>
                </ul>
              </div>
            </div>

            {thresholdsMessage && (
              <div className="p-4 bg-status-success-light border border-status-success rounded-md">
                <p className="text-sm text-status-success">✓ {thresholdsMessage}</p>
              </div>
            )}
            {thresholdsError && (
              <div className="p-4 bg-status-error-light border border-status-error rounded-md">
                <p className="text-sm text-status-error">✗ {thresholdsError}</p>
              </div>
            )}

            <button
              onClick={updateValidationThresholds}
              disabled={thresholdsLoading}
              className="w-full px-4 py-3 bg-action-primary text-white font-medium rounded-md hover:bg-action-primary-hover focus:outline-none focus:ring-2 focus:ring-action-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {thresholdsLoading ? 'Saving...' : 'Save Validation Thresholds'}
            </button>
          </div>
        </div>
      )}

      {/* ── Stock Alerts Tab ── */}
      {activeTab === 'stock-alerts' && (
        <div className="bg-surface-card rounded-lg shadow p-6">
          <div className="space-y-6">
            <div className="border-b pb-4">
              <h2 className="text-xl font-semibold text-content-primary mb-2">Stock Alert Thresholds</h2>
              <p className="text-sm text-content-secondary">
                Configure tank level thresholds for low stock and critical stock alerts.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-content-secondary mb-1">Low Stock Threshold (%)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={stockAlerts.low_stock_threshold_percent}
                  onChange={(e) => setStockAlerts({ ...stockAlerts, low_stock_threshold_percent: parseFloat(e.target.value) })}
                  className="w-full px-3 py-2 border border-status-warning rounded-md focus:outline-none focus:ring-status-warning focus:border-status-warning"
                  required
                />
                <p className="text-xs text-content-secondary mt-1">Yellow warning level</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-content-secondary mb-1">Critical Stock Threshold (%)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={stockAlerts.critical_stock_threshold_percent}
                  onChange={(e) => setStockAlerts({ ...stockAlerts, critical_stock_threshold_percent: parseFloat(e.target.value) })}
                  className="w-full px-3 py-2 border border-status-error rounded-md focus:outline-none focus:ring-status-error focus:border-status-error"
                  required
                />
                <p className="text-xs text-content-secondary mt-1">Red critical level (must be less than low stock)</p>
              </div>
            </div>

            {stockAlertsMessage && (
              <div className="p-4 bg-status-success-light border border-status-success rounded-md">
                <p className="text-sm text-status-success">✓ {stockAlertsMessage}</p>
              </div>
            )}
            {stockAlertsError && (
              <div className="p-4 bg-status-error-light border border-status-error rounded-md">
                <p className="text-sm text-status-error">✗ {stockAlertsError}</p>
              </div>
            )}

            <button
              onClick={updateStockAlerts}
              disabled={stockAlertsLoading}
              className="w-full px-4 py-3 bg-action-primary text-white font-medium rounded-md hover:bg-action-primary-hover focus:outline-none focus:ring-2 focus:ring-action-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {stockAlertsLoading ? 'Saving...' : 'Save Stock Alert Settings'}
            </button>

            <div className="bg-action-primary-light border border-action-primary rounded-lg p-4">
              <h3 className="text-sm font-semibold text-action-primary mb-2">About stock alerts</h3>
              <ul className="text-sm text-action-primary space-y-1">
                <li>Tanks below the low stock threshold will trigger a yellow warning</li>
                <li>Tanks below the critical threshold will trigger a red critical alert</li>
                <li>Critical threshold must be lower than the low stock threshold</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* ── Reconciliation Tolerances Tab ── */}
      {/* Previous dual-gate UI archived at: frontend/_archived/recon_tolerances_tab_dual_gate_v1.tsx */}
      {activeTab === 'recon-tolerances' && (
        <div className="bg-surface-card rounded-lg shadow p-6">
          <div className="space-y-6">
            <div className="border-b pb-4">
              <h2 className="text-xl font-semibold text-content-primary mb-2">Reconciliation Tolerances</h2>
              <p className="text-sm text-content-secondary">
                Configure how the system decides whether a fuel variance is acceptable, needs investigation, or is critical.
              </p>
            </div>

            {/* Mode Selector */}
            <div>
              <label className="block text-sm font-medium text-content-primary mb-2">Volume Tolerance Mode</label>
              <select
                value={reconTolerances.volume_tolerance_mode}
                onChange={(e) => setReconTolerances({ ...reconTolerances, volume_tolerance_mode: e.target.value })}
                className="w-full px-3 py-2 border border-surface-border rounded-md text-sm focus:outline-none focus:ring-action-primary focus:border-action-primary"
              >
                <option value="percentage">Percentage — tolerance scales with volume</option>
                <option value="fixed">Fixed Litres — same litre tolerance regardless of volume</option>
                <option value="hybrid">Hybrid — percentage with a maximum litre cap</option>
                <option value="tiered">Tiered — different tolerances for different volume ranges</option>
              </select>
            </div>

            {/* Mode description */}
            <div className="bg-surface-bg border border-surface-border rounded-lg p-4">
              {reconTolerances.volume_tolerance_mode === 'percentage' && (
                <div>
                  <h3 className="text-sm font-semibold text-content-primary mb-1">Percentage Mode</h3>
                  <p className="text-sm text-content-secondary">
                    Tolerance is calculated as a percentage of the total volume. For example, at 0.5% a 20,000L shift
                    allows up to 100L variance, while a 500L shift allows only 2.5L. This scales naturally but can
                    be too generous on large volumes.
                  </p>
                </div>
              )}
              {reconTolerances.volume_tolerance_mode === 'fixed' && (
                <div>
                  <h3 className="text-sm font-semibold text-content-primary mb-1">Fixed Litres Mode</h3>
                  <p className="text-sm text-content-secondary">
                    A flat litre tolerance is applied regardless of volume. Every shift is held to the same absolute
                    standard. Best when you want tight, predictable control. May produce false flags on very large
                    volumes if set too tight.
                  </p>
                </div>
              )}
              {reconTolerances.volume_tolerance_mode === 'hybrid' && (
                <div>
                  <h3 className="text-sm font-semibold text-content-primary mb-1">Hybrid Mode (Percentage + Cap)</h3>
                  <p className="text-sm text-content-secondary">
                    Tolerance is calculated as a percentage of volume, but <strong>capped</strong> at a maximum number of litres.
                    The system uses <em>whichever is smaller</em>. This gives proportional sensitivity on small volumes
                    while preventing large volumes from hiding big losses behind a small percentage.
                  </p>
                  <p className="text-sm text-content-secondary mt-1">
                    Example: at 0.5% with a 5L cap — a 200L shift allows 1L (percentage governs), but a 20,000L shift
                    allows only 5L (cap kicks in), not 100L.
                  </p>
                </div>
              )}
              {reconTolerances.volume_tolerance_mode === 'tiered' && (
                <div>
                  <h3 className="text-sm font-semibold text-content-primary mb-1">Tiered Mode (Volume Brackets)</h3>
                  <p className="text-sm text-content-secondary">
                    Define volume brackets with specific litre tolerances for each range. This gives you full control
                    over exactly how much loss is acceptable at every volume level. The system finds the bracket that
                    matches the shift volume and applies that tier's tolerance.
                  </p>
                </div>
              )}
            </div>

            {/* ── Percentage mode fields ── */}
            {reconTolerances.volume_tolerance_mode === 'percentage' && (
              <div>
                <h3 className="text-sm font-semibold text-content-primary mb-3">Percentage Tolerances</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-content-secondary mb-1">Acceptable (%)</label>
                    <input type="number" step="0.1" min="0" max="100"
                      value={reconTolerances.percent_tolerance_minor}
                      onChange={(e) => setReconTolerances({ ...reconTolerances, percent_tolerance_minor: parseFloat(e.target.value) })}
                      className="w-full px-3 py-2 border border-status-success rounded-md focus:outline-none focus:ring-status-success" required />
                    <p className="text-xs text-content-secondary mt-1">
                      Variance up to this % = acceptable
                      <span className="block text-content-tertiary mt-0.5">
                        {((reconTolerances.percent_tolerance_minor / 100) * 20000).toFixed(0)}L on 20,000L
                        {' / '}{((reconTolerances.percent_tolerance_minor / 100) * 5000).toFixed(0)}L on 5,000L
                        {' / '}{((reconTolerances.percent_tolerance_minor / 100) * 500).toFixed(1)}L on 500L
                      </span>
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-content-secondary mb-1">Investigation (%)</label>
                    <input type="number" step="0.1" min="0" max="100"
                      value={reconTolerances.percent_tolerance_investigation}
                      onChange={(e) => setReconTolerances({ ...reconTolerances, percent_tolerance_investigation: parseFloat(e.target.value) })}
                      className="w-full px-3 py-2 border border-status-warning rounded-md focus:outline-none focus:ring-status-warning" required />
                    <p className="text-xs text-content-secondary mt-1">
                      Above acceptable but within this = investigate; beyond = critical
                      <span className="block text-content-tertiary mt-0.5">
                        {((reconTolerances.percent_tolerance_investigation / 100) * 20000).toFixed(0)}L on 20,000L
                        {' / '}{((reconTolerances.percent_tolerance_investigation / 100) * 5000).toFixed(0)}L on 5,000L
                        {' / '}{((reconTolerances.percent_tolerance_investigation / 100) * 500).toFixed(1)}L on 500L
                      </span>
                    </p>
                  </div>
                </div>
                <div className="mt-4">
                  <label className="block text-sm font-medium text-content-secondary mb-1">Minimum Volume for % Calculation (L)</label>
                  <input type="number" step="10" min="0" max="10000"
                    value={reconTolerances.min_volume_for_percent}
                    onChange={(e) => setReconTolerances({ ...reconTolerances, min_volume_for_percent: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 border border-surface-border rounded-md max-w-xs" required />
                  <p className="text-xs text-content-secondary mt-1">Below this volume, percentage is not calculated (avoids misleading % on tiny amounts)</p>
                </div>
              </div>
            )}

            {/* ── Fixed mode fields ── */}
            {reconTolerances.volume_tolerance_mode === 'fixed' && (
              <div>
                <h3 className="text-sm font-semibold text-content-primary mb-3">Fixed Volume Tolerances (Litres)</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-content-secondary mb-1">Acceptable (L)</label>
                    <input type="number" step="0.5" min="0" max="10000"
                      value={reconTolerances.volume_tolerance_minor}
                      onChange={(e) => setReconTolerances({ ...reconTolerances, volume_tolerance_minor: parseFloat(e.target.value) })}
                      className="w-full px-3 py-2 border border-status-success rounded-md focus:outline-none focus:ring-status-success" required />
                    <p className="text-xs text-content-secondary mt-1">Variance up to this many litres = acceptable, regardless of volume handled</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-content-secondary mb-1">Investigation (L)</label>
                    <input type="number" step="0.5" min="0" max="50000"
                      value={reconTolerances.volume_tolerance_investigation}
                      onChange={(e) => setReconTolerances({ ...reconTolerances, volume_tolerance_investigation: parseFloat(e.target.value) })}
                      className="w-full px-3 py-2 border border-status-warning rounded-md focus:outline-none focus:ring-status-warning" required />
                    <p className="text-xs text-content-secondary mt-1">Above acceptable but within this = investigate; beyond = critical</p>
                  </div>
                </div>
              </div>
            )}

            {/* ── Hybrid mode fields ── */}
            {reconTolerances.volume_tolerance_mode === 'hybrid' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-content-primary mb-3">Percentage</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-content-secondary mb-1">Acceptable (%)</label>
                      <input type="number" step="0.1" min="0" max="100"
                        value={reconTolerances.percent_tolerance_minor}
                        onChange={(e) => setReconTolerances({ ...reconTolerances, percent_tolerance_minor: parseFloat(e.target.value) })}
                        className="w-full px-3 py-2 border border-status-success rounded-md" required />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-content-secondary mb-1">Investigation (%)</label>
                      <input type="number" step="0.1" min="0" max="100"
                        value={reconTolerances.percent_tolerance_investigation}
                        onChange={(e) => setReconTolerances({ ...reconTolerances, percent_tolerance_investigation: parseFloat(e.target.value) })}
                        className="w-full px-3 py-2 border border-status-warning rounded-md" required />
                    </div>
                  </div>
                </div>
                <div className="bg-status-warning/5 border border-status-warning/30 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-content-primary mb-1">Maximum Litre Cap</h3>
                  <p className="text-xs text-content-secondary mb-3">
                    The cap is the hard ceiling. Even if the percentage allows more, loss beyond the cap triggers escalation.
                    Set to 0 to disable (percentage alone governs).
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-content-secondary mb-1">Cap — Acceptable (L)</label>
                      <input type="number" step="0.5" min="0" max="10000"
                        value={reconTolerances.volume_cap_minor}
                        onChange={(e) => setReconTolerances({ ...reconTolerances, volume_cap_minor: parseFloat(e.target.value) })}
                        className="w-full px-3 py-2 border border-status-warning/50 rounded-md" required />
                      <p className="text-xs text-content-secondary mt-1">
                        {reconTolerances.volume_cap_minor > 0
                          ? `Active — max ${reconTolerances.volume_cap_minor}L acceptable loss`
                          : 'Disabled (0) — no cap'}
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-content-secondary mb-1">Cap — Investigation (L)</label>
                      <input type="number" step="0.5" min="0" max="50000"
                        value={reconTolerances.volume_cap_investigation}
                        onChange={(e) => setReconTolerances({ ...reconTolerances, volume_cap_investigation: parseFloat(e.target.value) })}
                        className="w-full px-3 py-2 border border-status-warning/50 rounded-md" required />
                      <p className="text-xs text-content-secondary mt-1">
                        {reconTolerances.volume_cap_investigation > 0
                          ? `Active — above ${reconTolerances.volume_cap_minor || 'acceptable'} but within ${reconTolerances.volume_cap_investigation}L = investigate`
                          : 'Disabled (0) — no cap'}
                      </p>
                    </div>
                  </div>
                  {reconTolerances.volume_cap_minor > 0 && (
                    <div className="mt-3 p-2.5 bg-surface-card rounded border border-surface-border">
                      <p className="text-xs text-content-secondary font-medium mb-1">With current settings:</p>
                      <p className="text-xs text-content-tertiary">
                        20,000L shift: {reconTolerances.percent_tolerance_minor}% = {((reconTolerances.percent_tolerance_minor / 100) * 20000).toFixed(0)}L,
                        but cap limits to {reconTolerances.volume_cap_minor}L
                      </p>
                      <p className="text-xs text-content-tertiary">
                        200L shift: {reconTolerances.percent_tolerance_minor}% = {((reconTolerances.percent_tolerance_minor / 100) * 200).toFixed(1)}L
                        (below cap, percentage governs)
                      </p>
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-content-secondary mb-1">Minimum Volume for % Calculation (L)</label>
                  <input type="number" step="10" min="0" max="10000"
                    value={reconTolerances.min_volume_for_percent}
                    onChange={(e) => setReconTolerances({ ...reconTolerances, min_volume_for_percent: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 border border-surface-border rounded-md max-w-xs" required />
                  <p className="text-xs text-content-secondary mt-1">Below this volume, percentage is not calculated</p>
                </div>
              </div>
            )}

            {/* ── Tiered mode fields ── */}
            {reconTolerances.volume_tolerance_mode === 'tiered' && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-content-primary">Volume Tiers</h3>
                  <button type="button" onClick={() => {
                    const tiers = [...(reconTolerances.volume_tiers || [])]
                    const lastUpTo = tiers.length > 0 ? tiers[tiers.length - 1].up_to_liters : 0
                    tiers.push({ up_to_liters: lastUpTo + 5000, tolerance_minor: 5, tolerance_investigation: 15 })
                    setReconTolerances({ ...reconTolerances, volume_tiers: tiers })
                  }} className="px-3 py-1.5 bg-action-primary text-white rounded-md text-xs font-medium">
                    + Add Tier
                  </button>
                </div>
                {(!reconTolerances.volume_tiers || reconTolerances.volume_tiers.length === 0) && (
                  <p className="text-sm text-content-secondary italic">No tiers defined. Add at least one tier to use tiered mode.</p>
                )}
                {reconTolerances.volume_tiers && reconTolerances.volume_tiers.length > 0 && (
                  <div className="space-y-2">
                    {/* Header */}
                    <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 text-xs font-medium text-content-secondary px-1">
                      <span>Up to (L)</span>
                      <span>Acceptable (L)</span>
                      <span>Investigation (L)</span>
                      <span className="w-8"></span>
                    </div>
                    {reconTolerances.volume_tiers.map((tier: any, idx: number) => (
                      <div key={idx} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
                        <div className="relative">
                          <input type="number" step="100" min="1"
                            value={tier.up_to_liters}
                            onChange={(e) => {
                              const tiers = [...reconTolerances.volume_tiers]
                              tiers[idx] = { ...tiers[idx], up_to_liters: parseFloat(e.target.value) || 0 }
                              setReconTolerances({ ...reconTolerances, volume_tiers: tiers })
                            }}
                            className="w-full px-3 py-2 border border-surface-border rounded-md text-sm" />
                          {idx === 0 && <span className="absolute -top-0.5 right-1 text-[10px] text-content-tertiary">0 – {tier.up_to_liters}L</span>}
                          {idx > 0 && <span className="absolute -top-0.5 right-1 text-[10px] text-content-tertiary">{reconTolerances.volume_tiers[idx-1].up_to_liters} – {tier.up_to_liters}L</span>}
                        </div>
                        <input type="number" step="0.5" min="0"
                          value={tier.tolerance_minor}
                          onChange={(e) => {
                            const tiers = [...reconTolerances.volume_tiers]
                            tiers[idx] = { ...tiers[idx], tolerance_minor: parseFloat(e.target.value) || 0 }
                            setReconTolerances({ ...reconTolerances, volume_tiers: tiers })
                          }}
                          className="w-full px-3 py-2 border border-status-success rounded-md text-sm" />
                        <input type="number" step="0.5" min="0"
                          value={tier.tolerance_investigation}
                          onChange={(e) => {
                            const tiers = [...reconTolerances.volume_tiers]
                            tiers[idx] = { ...tiers[idx], tolerance_investigation: parseFloat(e.target.value) || 0 }
                            setReconTolerances({ ...reconTolerances, volume_tiers: tiers })
                          }}
                          className="w-full px-3 py-2 border border-status-warning rounded-md text-sm" />
                        <button type="button" onClick={() => {
                          const tiers = reconTolerances.volume_tiers.filter((_: any, i: number) => i !== idx)
                          setReconTolerances({ ...reconTolerances, volume_tiers: tiers })
                        }} className="w-8 h-8 flex items-center justify-center text-status-error hover:bg-status-error/10 rounded">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                    ))}
                    <p className="text-xs text-content-tertiary mt-1">
                      Volumes above the last tier use the last tier's tolerances. Tiers must be in ascending order.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* ── Cash Tolerances (always shown) ── */}
            <div className="border-t pt-4">
              <h3 className="text-sm font-semibold text-content-primary mb-3">Cash Tolerances (ZMW)</h3>
              <p className="text-xs text-content-secondary mb-3">Cash tolerances are always flat ZMW amounts, independent of volume mode.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-content-secondary mb-1">Acceptable (ZMW)</label>
                  <input type="number" step="10" min="0" max="1000000"
                    value={reconTolerances.cash_tolerance_minor}
                    onChange={(e) => setReconTolerances({ ...reconTolerances, cash_tolerance_minor: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 border border-status-success rounded-md" required />
                  <p className="text-xs text-content-secondary mt-1">Cash variance up to this = acceptable</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-content-secondary mb-1">Investigation (ZMW)</label>
                  <input type="number" step="10" min="0" max="1000000"
                    value={reconTolerances.cash_tolerance_investigation}
                    onChange={(e) => setReconTolerances({ ...reconTolerances, cash_tolerance_investigation: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 border border-status-warning rounded-md" required />
                  <p className="text-xs text-content-secondary mt-1">Above acceptable but within this = investigate; beyond = critical</p>
                </div>
              </div>
            </div>

            {/* Status messages */}
            {reconMessage && (
              <div className="p-4 bg-status-success-light border border-status-success rounded-md">
                <p className="text-sm text-status-success">&#10003; {reconMessage}</p>
              </div>
            )}
            {reconError && (
              <div className="p-4 bg-status-error-light border border-status-error rounded-md">
                <p className="text-sm text-status-error">&#10007; {reconError}</p>
              </div>
            )}

            <button
              onClick={updateReconTolerances}
              disabled={reconLoading}
              className="w-full px-4 py-3 bg-action-primary text-white font-medium rounded-md hover:bg-action-primary-hover focus:outline-none focus:ring-2 focus:ring-action-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {reconLoading ? 'Saving...' : 'Save Reconciliation Tolerances'}
            </button>

            {/* Reconciliation levels reference */}
            <div className="bg-surface-bg border border-surface-border rounded-lg p-4">
              <h3 className="text-sm font-semibold text-content-primary mb-2">Reconciliation Levels</h3>
              <ul className="text-sm text-content-secondary space-y-2">
                <li className="flex items-start">
                  <span className="text-status-success font-bold mr-2">BALANCED:</span>
                  <span>All three sources match within acceptable tolerance</span>
                </li>
                <li className="flex items-start">
                  <span className="text-status-warning font-bold mr-2">INVESTIGATION:</span>
                  <span>Exceeds acceptable but within investigation threshold — requires review</span>
                </li>
                <li className="flex items-start">
                  <span className="text-status-error font-bold mr-2">CRITICAL:</span>
                  <span>Above investigation threshold — significant mismatch, immediate action needed</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* ── Email Notifications Tab ── */}
      {activeTab === 'email' && (
        <div className="bg-surface-card rounded-lg shadow p-6">
          <div className="space-y-6">
            <div className="border-b pb-4">
              <h2 className="text-xl font-semibold text-content-primary mb-2">Email Notifications</h2>
              <p className="text-sm text-content-secondary">
                Configure email alerts for all in-app notifications. Requires a valid Resend API key on the server.
              </p>
            </div>

            {/* Enabled Toggle */}
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-content-primary">Enable Email Notifications</label>
                <p className="text-xs text-content-secondary">When enabled, all notifications will also be emailed</p>
              </div>
              <button
                type="button"
                onClick={() => setEmailSettings({ ...emailSettings, enabled: !emailSettings.enabled })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  emailSettings.enabled ? 'bg-action-primary' : 'bg-surface-border'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    emailSettings.enabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* From Address */}
            <div>
              <label className="block text-sm font-medium text-content-secondary mb-1">From Address</label>
              <input
                type="text"
                value={emailSettings.from_address}
                onChange={(e) => setEmailSettings({ ...emailSettings, from_address: e.target.value })}
                className="w-full px-3 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-action-primary focus:border-action-primary"
                placeholder="NextStop <noreply@yourdomain.com>"
              />
              <p className="text-xs text-content-secondary mt-1">Must be a verified sender in your Resend account</p>
            </div>

            {/* Recipients */}
            <div>
              <label className="block text-sm font-medium text-content-secondary mb-1">Recipients</label>
              <div className="flex gap-2 mb-2">
                <input
                  type="email"
                  value={newRecipient}
                  onChange={(e) => setNewRecipient(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addRecipient(); } }}
                  className="flex-1 px-3 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-action-primary focus:border-action-primary"
                  placeholder="email@example.com"
                />
                <button
                  type="button"
                  onClick={addRecipient}
                  className="px-4 py-2 bg-action-primary text-white rounded-md hover:bg-action-primary-hover text-sm"
                >
                  Add
                </button>
              </div>
              {emailSettings.recipients.length > 0 ? (
                <ul className="space-y-1">
                  {emailSettings.recipients.map((email) => (
                    <li key={email} className="flex items-center justify-between bg-surface-bg px-3 py-2 rounded-md">
                      <span className="text-sm text-content-primary">{email}</span>
                      <button
                        type="button"
                        onClick={() => removeRecipient(email)}
                        className="text-status-error hover:text-status-error text-sm font-medium"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-content-secondary">No recipients added yet</p>
              )}
            </div>

            {emailMessage && (
              <div className="p-4 bg-status-success-light border border-status-success rounded-md">
                <p className="text-sm text-status-success">✓ {emailMessage}</p>
              </div>
            )}
            {emailError && (
              <div className="p-4 bg-status-error-light border border-status-error rounded-md">
                <p className="text-sm text-status-error">✗ {emailError}</p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={updateEmailSettings}
                disabled={emailLoading}
                className="flex-1 px-4 py-3 bg-action-primary text-white font-medium rounded-md hover:bg-action-primary-hover focus:outline-none focus:ring-2 focus:ring-action-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {emailLoading ? 'Saving...' : 'Save Email Settings'}
              </button>
              <button
                onClick={sendTestEmail}
                disabled={testLoading || !emailSettings.enabled || emailSettings.recipients.length === 0}
                className="px-4 py-3 border border-action-primary text-action-primary font-medium rounded-md hover:bg-action-primary-light focus:outline-none focus:ring-2 focus:ring-action-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {testLoading ? 'Sending...' : 'Send Test'}
              </button>
            </div>

            <div className="bg-action-primary-light border border-action-primary rounded-lg p-4">
              <h3 className="text-sm font-semibold text-action-primary mb-2">How it works</h3>
              <ul className="text-sm text-action-primary space-y-1">
                <li>Requires a valid Resend API key configured on the server (.env file)</li>
                <li>All in-app notifications will be emailed to the listed recipients when enabled</li>
                <li>Emails include severity level, title, message, and timestamp</li>
                <li>Email delivery failures never block normal system operations</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* ── Tank Calibration ─────────────────────────────── */}
      {activeTab === 'tank-calibration' && (
        <TankCalibrationTab />
      )}
    </div>
  )
}

function TankCalibrationTab() {
  const [tanks, setTanks] = useState<any[]>([])
  const [selectedTank, setSelectedTank] = useState('')
  const [calibration, setCalibration] = useState<any>(null)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    authFetch(`${BASE}/tanks/levels`).then(r => r.ok ? r.json() : []).then(setTanks).catch(() => {})
  }, [])

  useEffect(() => {
    if (!selectedTank) { setCalibration(null); return }
    authFetch(`${BASE}/settings/tank-calibration/${selectedTank}`)
      .then(r => r.ok ? r.json() : null)
      .then(setCalibration)
      .catch(() => {})
  }, [selectedTank])

  const handleDownloadTemplate = async () => {
    // Fetch the file and trigger a download with an explicit .xlsx filename so
    // the browser can't drop the extension via the Next.js rewrite (which would
    // otherwise save it as "template" — opening as an unreadable zip).
    setError('')
    try {
      const token = localStorage.getItem('accessToken')
      const stationId = localStorage.getItem('stationId')
      const res = await fetch(`${BASE}/settings/tank-calibration/template`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(stationId ? { 'X-Station-Id': stationId } : {}),
        },
      })
      if (!res.ok) throw new Error('Failed to download template')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'tank_calibration_template.xlsx'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err: any) {
      setError(err.message || 'Failed to download template')
    }
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !selectedTank) return
    setUploading(true)
    setError('')
    setMessage('')
    try {
      const formData = new FormData()
      formData.append('file', file)
      const token = localStorage.getItem('accessToken')
      const stationId = localStorage.getItem('stationId')
      const res = await fetch(`${BASE}/settings/tank-calibration/upload?tank_id=${selectedTank}`, {
        method: 'POST',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(stationId ? { 'X-Station-Id': stationId } : {}),
        },
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Upload failed')
      setMessage(data.message)
      // Refresh calibration
      const calRes = await authFetch(`${BASE}/settings/tank-calibration/${selectedTank}`)
      if (calRes.ok) setCalibration(await calRes.json())
    } catch (err: any) { setError(err.message) }
    finally { setUploading(false); e.target.value = '' }
  }

  const handleClear = async () => {
    if (!selectedTank || !confirm('Clear calibration? Tank will revert to system default.')) return
    setError('')
    setMessage('')
    try {
      const res = await authFetch(`${BASE}/settings/tank-calibration/${selectedTank}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Failed to clear')
      setMessage(data.message)
      setCalibration(null)
    } catch (err: any) { setError(err.message) }
  }

  const chartEntries = calibration?.found && calibration?.chart
    ? Object.entries(calibration.chart).map(([dip, vol]) => ({ dip: parseFloat(dip), vol: vol as number })).sort((a, b) => a.dip - b.dip)
    : []

  return (
    <div className="glass-card p-6 space-y-6">
      <div>
        <h2 className="text-lg font-bold text-content-primary mb-1">Tank Calibration</h2>
        <p className="text-sm text-content-secondary">Upload manufacturer calibration charts (dip cm → volume L) per tank</p>
      </div>

      {/* Tank selector */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-content-secondary mb-1">Select Tank</label>
          <select value={selectedTank} onChange={e => setSelectedTank(e.target.value)}
            className="w-full px-3 py-2 border border-surface-border rounded-input focus:outline-none focus:ring-2 focus:ring-action-primary">
            <option value="">-- Select a tank --</option>
            {tanks.map((t: any) => (
              <option key={t.tank_id} value={t.tank_id}>{t.display_name || `${t.tank_id} (${t.fuel_type})`}</option>
            ))}
          </select>
        </div>
        <div className="flex items-end gap-3">
          <button onClick={handleDownloadTemplate}
            className="px-4 py-2 border border-surface-border text-content-secondary rounded-btn hover:bg-surface-card/50 text-sm font-medium">
            Download Template
          </button>
          {selectedTank && (
            <label className="px-4 py-2 bg-action-primary text-white rounded-btn hover:bg-action-primary-hover text-sm font-medium cursor-pointer">
              {uploading ? 'Uploading...' : 'Upload Excel'}
              <input type="file" accept=".xlsx,.xls" onChange={handleUpload} className="hidden" disabled={uploading} />
            </label>
          )}
        </div>
      </div>

      {error && <div className="p-3 bg-status-error-light border border-status-error/30 rounded-btn text-sm text-status-error">{error}</div>}
      {message && <div className="p-3 bg-status-success-light border border-status-success/30 rounded-btn text-sm text-status-success">{message}</div>}

      {/* Current calibration display */}
      {selectedTank && calibration?.found && (
        <div>
          <div className="flex justify-between items-center mb-3">
            <div>
              <h3 className="text-sm font-semibold text-content-primary">Current Calibration — {selectedTank}</h3>
              <p className="text-xs text-content-secondary">
                {calibration.point_count} data points — Uploaded {new Date(calibration.uploaded_at).toLocaleDateString()} by {calibration.uploaded_by}
              </p>
            </div>
            <button onClick={handleClear}
              className="px-3 py-1.5 text-xs font-medium text-status-error border border-status-error/30 rounded-btn hover:bg-status-error-light">
              Clear Calibration
            </button>
          </div>
          <div className="max-h-64 overflow-y-auto border border-surface-border rounded-lg">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-surface-bg">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-content-secondary uppercase">Dip (cm)</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-content-secondary uppercase">Volume (L)</th>
                </tr>
              </thead>
              <tbody>
                {chartEntries.map((entry, i) => (
                  <tr key={i} className="border-t border-surface-border">
                    <td className="px-4 py-1.5 text-content-primary">{entry.dip}</td>
                    <td className="px-4 py-1.5 text-right text-content-primary">{entry.vol.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedTank && calibration && !calibration.found && (
        <div className="p-4 bg-surface-bg border border-surface-border rounded-lg text-sm text-content-secondary text-center">
          No custom calibration uploaded for {selectedTank}. Using system default.
        </div>
      )}

      {!selectedTank && (
        <div className="p-4 bg-surface-bg border border-surface-border rounded-lg text-sm text-content-secondary text-center">
          Select a tank above to view or upload its calibration chart.
        </div>
      )}
    </div>
  )
}
