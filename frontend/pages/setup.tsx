import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { getHeaders, authFetch, BASE } from '../lib/api'
import toast from 'react-hot-toast'

type Step = 'welcome' | 'profile' | 'business' | 'fuel' | 'complete'

const STEPS: Step[] = ['welcome', 'profile', 'business', 'fuel', 'complete']

const STEP_LABELS: Record<Step, string> = {
  welcome: 'Welcome',
  profile: 'Your Profile',
  business: 'Business Info',
  fuel: 'Fuel Pricing',
  complete: 'All Set',
}

export default function SetupWizard() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('welcome')
  const [saving, setSaving] = useState(false)
  const [user, setUser] = useState<any>(null)

  // Profile fields
  const [fullName, setFullName] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  // Business fields
  const [businessName, setBusinessName] = useState('')
  const [stationLocation, setStationLocation] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactPhone, setContactPhone] = useState('')

  // Fuel pricing
  const [dieselPrice, setDieselPrice] = useState(26.98)
  const [petrolPrice, setPetrolPrice] = useState(29.92)

  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (!userData) {
      router.push('/login')
      return
    }
    const parsed = JSON.parse(userData)
    setUser(parsed)

    // If not an owner, redirect to dashboard
    if (parsed.role !== 'owner') {
      router.push('/')
      return
    }

    // Load existing settings and check if setup is already done
    loadSettings().then(setupDone => {
      if (setupDone) {
        // Setup already completed — clear stale cookie and go to dashboard
        const secure = window.location.protocol === 'https:' ? '; Secure' : ''
        document.cookie = `needsSetup=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT${secure}`
        router.push('/')
      }
    })
  }, [])

  const loadSettings = async (): Promise<boolean> => {
    try {
      const [sysRes, fuelRes] = await Promise.all([
        authFetch(`${BASE}/settings/system`),
        authFetch(`${BASE}/settings/fuel`),
      ])
      let setupDone = false
      if (sysRes.ok) {
        const sys = await sysRes.json()
        setupDone = !!sys.setup_completed
        if (sys.business_name && sys.business_name !== 'Fuel Management System') setBusinessName(sys.business_name)
        if (sys.station_location) setStationLocation(sys.station_location)
        if (sys.contact_email) setContactEmail(sys.contact_email)
        if (sys.contact_phone) setContactPhone(sys.contact_phone)
      }
      if (fuelRes.ok) {
        const fuel = await fuelRes.json()
        if (fuel.diesel_price_per_liter) setDieselPrice(fuel.diesel_price_per_liter)
        if (fuel.petrol_price_per_liter) setPetrolPrice(fuel.petrol_price_per_liter)
      }
      return setupDone
    } catch {
      return false
    }
  }

  const currentIndex = STEPS.indexOf(step)

  const goNext = () => {
    const nextIndex = currentIndex + 1
    if (nextIndex < STEPS.length) setStep(STEPS[nextIndex])
  }

  const goBack = () => {
    const prevIndex = currentIndex - 1
    if (prevIndex >= 0) setStep(STEPS[prevIndex])
  }

  const saveProfile = async () => {
    if (!fullName.trim()) {
      toast.error('Please enter your full name')
      return false
    }
    if (newPassword && newPassword !== confirmPassword) {
      toast.error('Passwords do not match')
      return false
    }
    if (newPassword && newPassword.length < 6) {
      toast.error('Password must be at least 6 characters')
      return false
    }

    setSaving(true)
    try {
      const updateData: any = { full_name: fullName.trim() }
      if (newPassword) updateData.password = newPassword

      const res = await authFetch(`${BASE}/auth/users/${user.username}`, {
        method: 'PUT',
        body: JSON.stringify(updateData),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || 'Failed to update profile')
      }

      // Update local user data
      const updatedUser = { ...user, full_name: fullName.trim() }
      localStorage.setItem('user', JSON.stringify(updatedUser))
      setUser(updatedUser)

      toast.success('Profile updated')
      return true
    } catch (err: any) {
      toast.error(err.message)
      return false
    } finally {
      setSaving(false)
    }
  }

  const saveBusiness = async () => {
    if (!businessName.trim()) {
      toast.error('Please enter your business name')
      return false
    }

    setSaving(true)
    try {
      const res = await authFetch(`${BASE}/settings/system`, {
        method: 'PUT',
        body: JSON.stringify({
          business_name: businessName.trim(),
          station_location: stationLocation.trim(),
          contact_email: contactEmail.trim(),
          contact_phone: contactPhone.trim(),
          license_key: 'DEMO-LICENSE-2025',
          license_expiry_date: '',
          setup_completed: false,
        }),
      })
      if (!res.ok) throw new Error('Failed to save business settings')
      toast.success('Business details saved')
      return true
    } catch (err: any) {
      toast.error(err.message)
      return false
    } finally {
      setSaving(false)
    }
  }

  const saveFuelPricing = async () => {
    if (dieselPrice <= 0 || petrolPrice <= 0) {
      toast.error('Prices must be greater than zero')
      return false
    }

    setSaving(true)
    try {
      const res = await authFetch(`${BASE}/settings/fuel`, {
        method: 'PUT',
        body: JSON.stringify({
          diesel_price_per_liter: dieselPrice,
          petrol_price_per_liter: petrolPrice,
          diesel_allowable_loss_percent: 0.3,
          petrol_allowable_loss_percent: 0.5,
          nozzle_allowable_loss_liters: 0.8,
        }),
      })
      if (!res.ok) throw new Error('Failed to save fuel pricing')
      toast.success('Fuel pricing saved')
      return true
    } catch (err: any) {
      toast.error(err.message)
      return false
    } finally {
      setSaving(false)
    }
  }

  const completeSetup = async () => {
    setSaving(true)
    try {
      // Mark setup as completed in system settings
      await authFetch(`${BASE}/settings/system`, {
        method: 'PUT',
        body: JSON.stringify({
          business_name: businessName.trim() || 'Fuel Management System',
          station_location: stationLocation.trim(),
          contact_email: contactEmail.trim(),
          contact_phone: contactPhone.trim(),
          license_key: 'DEMO-LICENSE-2025',
          license_expiry_date: '',
          setup_completed: true,
        }),
      })
      // Clear the needsSetup cookie so middleware stops redirecting
      const secure = window.location.protocol === 'https:' ? '; Secure' : ''
      document.cookie = `needsSetup=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT${secure}`
      router.push('/')
    } catch {
      router.push('/')
    } finally {
      setSaving(false)
    }
  }

  const handleNext = async () => {
    if (step === 'profile') {
      const ok = await saveProfile()
      if (!ok) return
    } else if (step === 'business') {
      const ok = await saveBusiness()
      if (!ok) return
    } else if (step === 'fuel') {
      const ok = await saveFuelPricing()
      if (!ok) return
    }
    goNext()
  }

  const handleFinish = async () => {
    await completeSetup()
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#0A3D7A] via-[#0F2847] to-[#0A1B30]" />
      <div className="absolute top-[20%] left-[15%] w-64 h-64 bg-action-primary/10 rounded-full blur-3xl animate-float" />
      <div className="absolute bottom-[20%] right-[10%] w-80 h-80 bg-action-primary/5 rounded-full blur-3xl animate-float" style={{ animationDelay: '1.5s' }} />

      <div className="max-w-lg w-full relative z-10 animate-scale-in">
        <div className="glass-card-static p-8 border border-white/10 relative overflow-hidden">
          {/* Top accent line */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-action-primary via-action-primary-hover to-status-success" />

          {/* Progress bar */}
          {step !== 'welcome' && step !== 'complete' && (
            <div className="mb-6">
              <div className="flex justify-between text-xs text-content-secondary mb-2">
                {STEPS.filter(s => s !== 'welcome' && s !== 'complete').map((s, i) => (
                  <span key={s} className={step === s ? 'text-action-primary font-semibold' : currentIndex > STEPS.indexOf(s) ? 'text-status-success' : ''}>
                    {STEP_LABELS[s]}
                  </span>
                ))}
              </div>
              <div className="h-1.5 bg-surface-border rounded-full overflow-hidden">
                <div
                  className="h-full bg-action-primary rounded-full transition-all duration-500"
                  style={{ width: `${((currentIndex - 1) / (STEPS.length - 3)) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* ── Welcome Step ──────────────────────────── */}
          {step === 'welcome' && (
            <div className="text-center space-y-6">
              <div className="w-20 h-20 mx-auto bg-action-primary/20 rounded-full flex items-center justify-center">
                <svg className="w-10 h-10 text-action-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-content-primary">Welcome to NextStop</h1>
                <p className="text-content-secondary mt-2">
                  Let's get your fuel management system set up. This quick wizard will walk you through the essentials to get started.
                </p>
              </div>
              <div className="bg-surface-card/50 border border-surface-border rounded-lg p-4 text-left space-y-2">
                <p className="text-sm text-content-secondary">We'll help you configure:</p>
                <ul className="text-sm text-content-primary space-y-1.5">
                  <li className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-status-success shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    Your name and login credentials
                  </li>
                  <li className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-status-success shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    Business name and location
                  </li>
                  <li className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-status-success shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    Fuel pricing
                  </li>
                </ul>
              </div>
              <button
                onClick={goNext}
                className="w-full px-4 py-3 bg-action-primary text-white font-semibold rounded-btn hover:bg-action-primary-hover focus:outline-none focus:ring-2 focus:ring-action-primary shadow-glow-blue transition-all"
              >
                Get Started
              </button>
              <button
                onClick={() => router.push('/')}
                className="text-sm text-content-secondary hover:text-content-primary transition-colors"
              >
                Skip for now
              </button>
            </div>
          )}

          {/* ── Profile Step ─────────────────────────── */}
          {step === 'profile' && (
            <div className="space-y-5">
              <div className="text-center mb-2">
                <div className="w-14 h-14 mx-auto bg-category-a/20 rounded-full flex items-center justify-center mb-3">
                  <svg className="w-7 h-7 text-category-a" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                  </svg>
                </div>
                <h2 className="text-xl font-bold text-content-primary">Your Profile</h2>
                <p className="text-sm text-content-secondary mt-1">Update your name and set a secure password</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-content-secondary mb-1.5">Full Name</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder="Enter your full name"
                  className="w-full px-4 py-3 border border-surface-border rounded-input focus:outline-none focus:ring-2 focus:ring-action-primary focus:border-action-primary bg-transparent text-content-primary"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-content-secondary mb-1.5">New Password <span className="text-content-secondary/50 font-normal">(optional)</span></label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="Leave blank to keep current"
                  className="w-full px-4 py-3 border border-surface-border rounded-input focus:outline-none focus:ring-2 focus:ring-action-primary focus:border-action-primary bg-transparent text-content-primary"
                />
              </div>

              {newPassword && (
                <div>
                  <label className="block text-sm font-medium text-content-secondary mb-1.5">Confirm Password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Confirm your new password"
                    className="w-full px-4 py-3 border border-surface-border rounded-input focus:outline-none focus:ring-2 focus:ring-action-primary focus:border-action-primary bg-transparent text-content-primary"
                  />
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button onClick={goBack} className="px-4 py-3 border border-surface-border text-content-secondary rounded-btn hover:bg-surface-card/50 transition-all flex-1">
                  Back
                </button>
                <button onClick={handleNext} disabled={saving} className="px-4 py-3 bg-action-primary text-white font-semibold rounded-btn hover:bg-action-primary-hover disabled:opacity-50 transition-all flex-[2] shadow-glow-blue">
                  {saving ? 'Saving...' : 'Continue'}
                </button>
              </div>
            </div>
          )}

          {/* ── Business Step ────────────────────────── */}
          {step === 'business' && (
            <div className="space-y-5">
              <div className="text-center mb-2">
                <div className="w-14 h-14 mx-auto bg-status-success/20 rounded-full flex items-center justify-center mb-3">
                  <svg className="w-7 h-7 text-status-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 1.189a3 3 0 01-.621 4.72m-13.5 8.65h3.75a.75.75 0 00.75-.75V13.5a.75.75 0 00-.75-.75H6.75a.75.75 0 00-.75.75v3.15c0 .415.336.75.75.75z" />
                  </svg>
                </div>
                <h2 className="text-xl font-bold text-content-primary">Business Details</h2>
                <p className="text-sm text-content-secondary mt-1">Tell us about your fuel station</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-content-secondary mb-1.5">Business / Station Name</label>
                <input
                  type="text"
                  value={businessName}
                  onChange={e => setBusinessName(e.target.value)}
                  placeholder="e.g. Kafubu Filling Station"
                  className="w-full px-4 py-3 border border-surface-border rounded-input focus:outline-none focus:ring-2 focus:ring-action-primary focus:border-action-primary bg-transparent text-content-primary"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-content-secondary mb-1.5">Location</label>
                <input
                  type="text"
                  value={stationLocation}
                  onChange={e => setStationLocation(e.target.value)}
                  placeholder="e.g. Great North Road, Ndola"
                  className="w-full px-4 py-3 border border-surface-border rounded-input focus:outline-none focus:ring-2 focus:ring-action-primary focus:border-action-primary bg-transparent text-content-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-content-secondary mb-1.5">Contact Email</label>
                  <input
                    type="email"
                    value={contactEmail}
                    onChange={e => setContactEmail(e.target.value)}
                    placeholder="email@example.com"
                    className="w-full px-4 py-3 border border-surface-border rounded-input focus:outline-none focus:ring-2 focus:ring-action-primary focus:border-action-primary bg-transparent text-content-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-content-secondary mb-1.5">Contact Phone</label>
                  <input
                    type="tel"
                    value={contactPhone}
                    onChange={e => setContactPhone(e.target.value)}
                    placeholder="+260 97X XXXXXX"
                    className="w-full px-4 py-3 border border-surface-border rounded-input focus:outline-none focus:ring-2 focus:ring-action-primary focus:border-action-primary bg-transparent text-content-primary"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={goBack} className="px-4 py-3 border border-surface-border text-content-secondary rounded-btn hover:bg-surface-card/50 transition-all flex-1">
                  Back
                </button>
                <button onClick={handleNext} disabled={saving} className="px-4 py-3 bg-action-primary text-white font-semibold rounded-btn hover:bg-action-primary-hover disabled:opacity-50 transition-all flex-[2] shadow-glow-blue">
                  {saving ? 'Saving...' : 'Continue'}
                </button>
              </div>
            </div>
          )}

          {/* ── Fuel Pricing Step ────────────────────── */}
          {step === 'fuel' && (
            <div className="space-y-5">
              <div className="text-center mb-2">
                <div className="w-14 h-14 mx-auto bg-status-warning/20 rounded-full flex items-center justify-center mb-3">
                  <svg className="w-7 h-7 text-status-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h2 className="text-xl font-bold text-content-primary">Fuel Pricing</h2>
                <p className="text-sm text-content-secondary mt-1">Set your current pump prices (ZMW per litre)</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-content-secondary mb-1.5">Diesel Price (ZMW/L)</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-content-secondary/50 font-medium">K</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={dieselPrice}
                    onChange={e => setDieselPrice(parseFloat(e.target.value) || 0)}
                    className="w-full pl-10 pr-4 py-3 border border-surface-border rounded-input focus:outline-none focus:ring-2 focus:ring-action-primary focus:border-action-primary bg-transparent text-content-primary"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-content-secondary mb-1.5">Petrol Price (ZMW/L)</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-content-secondary/50 font-medium">K</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={petrolPrice}
                    onChange={e => setPetrolPrice(parseFloat(e.target.value) || 0)}
                    className="w-full pl-10 pr-4 py-3 border border-surface-border rounded-input focus:outline-none focus:ring-2 focus:ring-action-primary focus:border-action-primary bg-transparent text-content-primary"
                  />
                </div>
              </div>

              <div className="bg-surface-card/50 border border-surface-border rounded-lg p-3">
                <p className="text-xs text-content-secondary">
                  You can update these prices anytime from Settings. Other settings like VAT rate, allowable losses, and stock alert thresholds can also be configured there.
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={goBack} className="px-4 py-3 border border-surface-border text-content-secondary rounded-btn hover:bg-surface-card/50 transition-all flex-1">
                  Back
                </button>
                <button onClick={handleNext} disabled={saving} className="px-4 py-3 bg-action-primary text-white font-semibold rounded-btn hover:bg-action-primary-hover disabled:opacity-50 transition-all flex-[2] shadow-glow-blue">
                  {saving ? 'Saving...' : 'Continue'}
                </button>
              </div>
            </div>
          )}

          {/* ── Complete Step ────────────────────────── */}
          {step === 'complete' && (
            <div className="text-center space-y-6">
              <div className="w-20 h-20 mx-auto bg-status-success/20 rounded-full flex items-center justify-center">
                <svg className="w-10 h-10 text-status-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h2 className="text-2xl font-bold text-content-primary">You're All Set!</h2>
                <p className="text-content-secondary mt-2">
                  Your system is ready to use{businessName ? `, ${businessName}` : ''}.
                </p>
              </div>

              <div className="bg-surface-card/50 border border-surface-border rounded-lg p-4 text-left space-y-3">
                <p className="text-sm font-medium text-content-primary">Next steps you may want to do:</p>
                <ul className="text-sm text-content-secondary space-y-2">
                  <li className="flex items-start gap-2">
                    <span className="text-action-primary font-bold mt-0.5">1.</span>
                    <span><strong className="text-content-primary">Add staff</strong> &mdash; Create attendant and supervisor accounts in Users</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-action-primary font-bold mt-0.5">2.</span>
                    <span><strong className="text-content-primary">Check infrastructure</strong> &mdash; Review tanks, islands, and nozzles in Infrastructure</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-action-primary font-bold mt-0.5">3.</span>
                    <span><strong className="text-content-primary">Fine-tune settings</strong> &mdash; VAT, stock alerts, and reconciliation tolerances in Settings</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-action-primary font-bold mt-0.5">4.</span>
                    <span><strong className="text-content-primary">Start a shift</strong> &mdash; Create your first shift and begin operations</span>
                  </li>
                </ul>
              </div>

              <button
                onClick={handleFinish}
                disabled={saving}
                className="w-full px-4 py-3 bg-action-primary text-white font-semibold rounded-btn hover:bg-action-primary-hover disabled:opacity-50 shadow-glow-blue transition-all"
              >
                {saving ? 'Loading...' : 'Go to Dashboard'}
              </button>
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-white/30">
          Powered by NextStop Fuel Management v1.0
        </p>
      </div>
    </div>
  )
}
