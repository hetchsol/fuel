import { useState, useEffect } from 'react'
import { getHeaders } from '../lib/api'

const BASE = '/api/v1'

export default function Settings() {
  const [settings, setSettings] = useState({
    diesel_price_per_liter: 150.0,
    petrol_price_per_liter: 160.0,
    diesel_allowable_loss_percent: 0.3,
    petrol_allowable_loss_percent: 0.5,
  })
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

  const [activeTab, setActiveTab] = useState<'system' | 'fuel' | 'validation' | 'email'>('system')

  useEffect(() => {
    loadSettings()
    loadSystemSettings()
    loadValidationThresholds()
    loadEmailSettings()
  }, [])

  const loadSettings = async () => {
    try {
      const res = await fetch(`${BASE}/settings/fuel`, {
        headers: getHeaders()
      })
      if (res.ok) {
        const data = await res.json()
        setSettings(data)
      }
    } catch (err) {
      console.error('Failed to load settings:', err)
    }
  }

  const loadSystemSettings = async () => {
    try {
      const res = await fetch(`${BASE}/settings/system`, {
        headers: getHeaders()
      })
      if (res.ok) {
        const data = await res.json()
        setSystemSettings(data)
      }
    } catch (err) {
      console.error('Failed to load system settings:', err)
    }
  }

  const loadValidationThresholds = async () => {
    try {
      const res = await fetch(`${BASE}/settings/validation-thresholds`, {
        headers: getHeaders()
      })
      if (res.ok) {
        const data = await res.json()
        setValidationThresholds(data)
      }
    } catch (err) {
      console.error('Failed to load validation thresholds:', err)
    }
  }

  const updateValidationThresholds = async () => {
    setThresholdsLoading(true)
    setThresholdsMessage('')
    setThresholdsError('')
    try {
      const res = await fetch(`${BASE}/settings/validation-thresholds`, {
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

  const loadEmailSettings = async () => {
    try {
      const res = await fetch(`${BASE}/settings/email`, {
        headers: getHeaders()
      })
      if (res.ok) {
        const data = await res.json()
        setEmailSettings(data)
      }
    } catch (err) {
      console.error('Failed to load email settings:', err)
    }
  }

  const updateEmailSettings = async () => {
    setEmailLoading(true)
    setEmailMessage('')
    setEmailError('')
    try {
      const res = await fetch(`${BASE}/settings/email`, {
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
      const res = await fetch(`${BASE}/settings/email/test`, {
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setMessage('')

    try {
      const res = await fetch(`${BASE}/settings/fuel`, {
        method: 'PUT',
        headers: { ...getHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })

      if (!res.ok) {
        throw new Error('Failed to update settings')
      }

      const data = await res.json()
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
      const res = await fetch(`${BASE}/settings/system`, {
        method: 'PUT',
        headers: { ...getHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(systemSettings),
      })

      if (!res.ok) {
        throw new Error('Failed to update system settings')
      }

      const data = await res.json()
      setSystemMessage('System settings updated successfully!')
      setTimeout(() => setSystemMessage(''), 3000)
    } catch (err: any) {
      setSystemError(err.message || 'Failed to update system settings')
    } finally {
      setSystemLoading(false)
    }
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-content-primary">Owner Settings</h1>
        <p className="mt-2 text-sm text-content-secondary">Configure system information, fuel pricing, and validation thresholds</p>
      </div>

      {/* Tab Navigation */}
      <div className="mb-6 border-b border-surface-border">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('system')}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'system'
                ? 'border-action-primary text-action-primary'
                : 'border-transparent text-content-secondary hover:text-content-primary hover:border-surface-border'
            }`}
          >
            🏢 System Information
          </button>
          <button
            onClick={() => setActiveTab('fuel')}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'fuel'
                ? 'border-action-primary text-action-primary'
                : 'border-transparent text-content-secondary hover:text-content-primary hover:border-surface-border'
            }`}
          >
            💰 Fuel Settings
          </button>
          <button
            onClick={() => setActiveTab('validation')}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'validation'
                ? 'border-action-primary text-action-primary'
                : 'border-transparent text-content-secondary hover:text-content-primary hover:border-surface-border'
            }`}
          >
            ✓ Validation Thresholds
          </button>
          <button
            onClick={() => setActiveTab('email')}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'email'
                ? 'border-action-primary text-action-primary'
                : 'border-transparent text-content-secondary hover:text-content-primary hover:border-surface-border'
            }`}
          >
            ✉ Email Notifications
          </button>
        </nav>
      </div>

      {/* System Information Tab */}
      {activeTab === 'system' && (
        <div className="max-w-2xl bg-surface-card rounded-lg shadow p-6 mb-6">
        <form onSubmit={handleSystemUpdate} className="space-y-6">
          <div className="border-b pb-6">
            <h2 className="text-xl font-semibold text-content-primary mb-4">🏢 System Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-content-secondary mb-1">
                  Business Name
                </label>
                <input
                  type="text"
                  value={systemSettings.business_name}
                  onChange={(e) => setSystemSettings({ ...systemSettings, business_name: e.target.value })}
                  className="w-full px-3 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-action-primary focus:border-action-primary"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-content-secondary mb-1">
                  License Key
                </label>
                <input
                  type="text"
                  value={systemSettings.license_key}
                  onChange={(e) => setSystemSettings({ ...systemSettings, license_key: e.target.value })}
                  className="w-full px-3 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-action-primary focus:border-action-primary"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-content-secondary mb-1">
                  Contact Email
                </label>
                <input
                  type="email"
                  value={systemSettings.contact_email}
                  onChange={(e) => setSystemSettings({ ...systemSettings, contact_email: e.target.value })}
                  className="w-full px-3 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-action-primary focus:border-action-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-content-secondary mb-1">
                  Contact Phone
                </label>
                <input
                  type="tel"
                  value={systemSettings.contact_phone}
                  onChange={(e) => setSystemSettings({ ...systemSettings, contact_phone: e.target.value })}
                  className="w-full px-3 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-action-primary focus:border-action-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-content-secondary mb-1">
                  Station Location
                </label>
                <input
                  type="text"
                  value={systemSettings.station_location}
                  onChange={(e) => setSystemSettings({ ...systemSettings, station_location: e.target.value })}
                  className="w-full px-3 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-action-primary focus:border-action-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-content-secondary mb-1">
                  License Expiry Date
                </label>
                <input
                  type="date"
                  value={systemSettings.license_expiry_date}
                  onChange={(e) => setSystemSettings({ ...systemSettings, license_expiry_date: e.target.value })}
                  className="w-full px-3 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-action-primary focus:border-action-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-content-secondary mb-1">
                  Software Version
                </label>
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

          {/* Messages */}
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

          {/* Submit Button */}
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

      {/* Fuel Settings Tab */}
      {activeTab === 'fuel' && (
        <div className="max-w-2xl bg-surface-card rounded-lg shadow p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Fuel Pricing Section */}
          <div className="border-b pb-6">
            <h2 className="text-xl font-semibold text-content-primary mb-4">💰 Fuel Pricing</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-content-secondary mb-1">
                  Diesel Price per Liter
                </label>
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
                <label className="block text-sm font-medium text-content-secondary mb-1">
                  Petrol Price per Liter
                </label>
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

          {/* Allowable Losses Section */}
          <div>
            <h2 className="text-xl font-semibold text-content-primary mb-4">📊 Allowable Losses During Offloading</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-content-secondary mb-1">
                  Diesel Allowable Loss (%)
                </label>
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
                <label className="block text-sm font-medium text-content-secondary mb-1">
                  Petrol Allowable Loss (%)
                </label>
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

          {/* Messages */}
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

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-3 bg-action-primary text-white font-medium rounded-md hover:bg-action-primary-hover focus:outline-none focus:ring-2 focus:ring-action-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Saving...' : 'Save Settings'}
          </button>
        </form>

        {/* Info Card */}
        <div className="mt-6 bg-action-primary-light border border-action-primary rounded-lg p-4">
          <h3 className="text-sm font-semibold text-action-primary mb-2">ℹ️ About Allowable Losses</h3>
          <ul className="text-sm text-action-primary space-y-1">
            <li>• Allowable losses account for evaporation and spillage during fuel delivery</li>
            <li>• Typical industry standards: Diesel 0.2-0.4%, Petrol 0.3-0.6%</li>
            <li>• Losses exceeding these thresholds will be flagged in delivery reports</li>
            <li>• These settings are used to validate stock movements and calculate expected inventory</li>
          </ul>
        </div>
      </div>
      )}

      {/* Validation Thresholds Tab */}
      {activeTab === 'validation' && (
        <div className="max-w-2xl bg-surface-card rounded-lg shadow p-6">
          <div className="space-y-6">
            {/* Header */}
            <div className="border-b pb-4">
              <h2 className="text-xl font-semibold text-content-primary mb-2">✓ Validation Thresholds</h2>
              <p className="text-sm text-content-secondary">
                Configure variance thresholds for tank vs nozzle reading validation. These settings determine when readings are marked as PASS, WARNING, or FAIL.
              </p>
            </div>

            {/* Thresholds Form */}
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-content-secondary mb-1">
                    PASS Threshold (%)
                  </label>
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
                    Variance ≤ this % = PASS (Green status)
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-content-secondary mb-1">
                    WARNING Threshold (%)
                  </label>
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
                    Variance ≤ this % = WARNING (Yellow status)
                  </p>
                </div>
              </div>

              <div className="mt-4">
                <label className="block text-sm font-medium text-content-secondary mb-1">
                  Meter Discrepancy Threshold (%)
                </label>
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
                </p>
              </div>

              {/* Current Data Analysis */}
              <div className="bg-action-primary-light border border-action-primary rounded-lg p-4 mt-4">
                <h3 className="text-sm font-semibold text-action-primary mb-2">📊 Based on December 2025 Data:</h3>
                <ul className="text-sm text-action-primary space-y-1">
                  <li>• Diesel average variance: 0.59%</li>
                  <li>• Petrol average variance: 0.72%</li>
                  <li>• Recommended PASS: 2.0%</li>
                  <li>• Recommended WARNING: 3.5%</li>
                </ul>
              </div>

              {/* Status Legend */}
              <div className="bg-surface-bg border border-surface-border rounded-lg p-4">
                <h3 className="text-sm font-semibold text-content-primary mb-2">📋 How It Works:</h3>
                <ul className="text-sm text-content-secondary space-y-2">
                  <li className="flex items-start">
                    <span className="text-status-success font-bold mr-2">✓ PASS:</span>
                    <span>Variance is within acceptable range (≤ PASS threshold)</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-status-warning font-bold mr-2">⚠ WARNING:</span>
                    <span>Variance exceeds PASS but is ≤ WARNING threshold - requires attention</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-status-error font-bold mr-2">✗ FAIL:</span>
                    <span>Variance exceeds WARNING threshold - significant discrepancy detected</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* Messages */}
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

            {/* Submit Button */}
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

      {/* Email Notifications Tab */}
      {activeTab === 'email' && (
        <div className="max-w-2xl bg-surface-card rounded-lg shadow p-6">
          <div className="space-y-6">
            <div className="border-b pb-4">
              <h2 className="text-xl font-semibold text-content-primary mb-2">✉ Email Notifications</h2>
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
              <label className="block text-sm font-medium text-content-secondary mb-1">
                From Address
              </label>
              <input
                type="text"
                value={emailSettings.from_address}
                onChange={(e) => setEmailSettings({ ...emailSettings, from_address: e.target.value })}
                className="w-full px-3 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-action-primary focus:border-action-primary"
                placeholder="NextStop <noreply@yourdomain.com>"
              />
              <p className="text-xs text-content-secondary mt-1">
                Must be a verified sender in your Resend account
              </p>
            </div>

            {/* Recipients */}
            <div>
              <label className="block text-sm font-medium text-content-secondary mb-1">
                Recipients
              </label>
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

            {/* Messages */}
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

            {/* Action Buttons */}
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

            {/* Info Card */}
            <div className="bg-action-primary-light border border-action-primary rounded-lg p-4">
              <h3 className="text-sm font-semibold text-action-primary mb-2">How it works</h3>
              <ul className="text-sm text-action-primary space-y-1">
                <li>• Requires a valid Resend API key configured on the server (.env file)</li>
                <li>• All in-app notifications will be emailed to the listed recipients when enabled</li>
                <li>• Emails include severity level, title, message, and timestamp</li>
                <li>• Email delivery failures never block normal system operations</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
