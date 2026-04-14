import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { getHeaders, authFetch, BASE } from '../lib/api'
import toast from 'react-hot-toast'

type Step = 'welcome' | 'profile' | 'business' | 'tanks' | 'fuel' | 'operations' | 'staff' | 'complete'

const STEPS: Step[] = ['welcome', 'profile', 'business', 'tanks', 'fuel', 'operations', 'staff', 'complete']

const STEP_LABELS: Record<Step, string> = {
  welcome: 'Welcome',
  profile: 'Your Profile',
  business: 'Business Info',
  tanks: 'Tanks',
  fuel: 'Pricing & Tax',
  operations: 'Operations',
  staff: 'Staff',
  complete: 'All Set',
}

interface CreatedUser {
  user_id: string
  username: string
  full_name: string
  role: string
}

interface TankRow {
  id: string
  fuel_type: 'Diesel' | 'Petrol'
  capacity: number
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

  // Tanks
  const [tankRows, setTankRows] = useState<TankRow[]>([
    { id: 'TANK-DIESEL', fuel_type: 'Diesel', capacity: 20000 },
    { id: 'TANK-PETROL', fuel_type: 'Petrol', capacity: 25000 },
  ])

  // Fuel pricing + tax
  const [dieselPrice, setDieselPrice] = useState(26.98)
  const [petrolPrice, setPetrolPrice] = useState(29.92)
  const [vatRate, setVatRate] = useState(16)
  const [fuelLevy, setFuelLevy] = useState(1.44)

  // Operational settings
  const [dieselLoss, setDieselLoss] = useState(0.3)
  const [petrolLoss, setPetrolLoss] = useState(0.5)
  const [nozzleLoss, setNozzleLoss] = useState(0.8)
  const [passThreshold, setPassThreshold] = useState(0.5)
  const [warningThreshold, setWarningThreshold] = useState(1.0)
  const [lowStock, setLowStock] = useState(25)
  const [criticalStock, setCriticalStock] = useState(10)
  const [volMode, setVolMode] = useState('percentage')
  const [volMinor, setVolMinor] = useState(50)
  const [volInvestigation, setVolInvestigation] = useState(200)
  const [volCapMinor, setVolCapMinor] = useState(0)
  const [volCapInvestigation, setVolCapInvestigation] = useState(0)
  const [pctMinor, setPctMinor] = useState(0.5)
  const [pctInvestigation, setPctInvestigation] = useState(2.0)
  const [volTiers, setVolTiers] = useState<any[]>([])
  const [cashMinor, setCashMinor] = useState(500)
  const [cashInvestigation, setCashInvestigation] = useState(2000)

  // Staff
  const [createdUsers, setCreatedUsers] = useState<CreatedUser[]>([])
  const [staffForm, setStaffForm] = useState({ full_name: '', username: '', password: '', role: 'user' as 'user' | 'supervisor' | 'manager' })
  const [addingUser, setAddingUser] = useState(false)

  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (!userData) {
      router.push('/login')
      return
    }
    const parsed = JSON.parse(userData)
    setUser(parsed)

    if (parsed.role !== 'owner') {
      router.push('/')
      return
    }

    loadSettings().then(setupDone => {
      if (setupDone) {
        const secure = window.location.protocol === 'https:' ? '; Secure' : ''
        document.cookie = `needsSetup=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT${secure}`
        router.push('/')
      }
    })

    // Intercept browser back button — show reverse initialization
    const handlePopState = () => {
      router.replace('/initializing?direction=reverse')
    }
    window.history.pushState(null, '', window.location.href)
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const loadSettings = async (): Promise<boolean> => {
    try {
      const [sysRes, fuelRes, taxRes] = await Promise.all([
        authFetch(`${BASE}/settings/system`),
        authFetch(`${BASE}/settings/fuel`),
        authFetch(`${BASE}/settings/tax-levy`),
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
        if (fuel.diesel_allowable_loss_percent) setDieselLoss(fuel.diesel_allowable_loss_percent)
        if (fuel.petrol_allowable_loss_percent) setPetrolLoss(fuel.petrol_allowable_loss_percent)
        if (fuel.nozzle_allowable_loss_liters) setNozzleLoss(fuel.nozzle_allowable_loss_liters)
      }
      if (taxRes.ok) {
        const tax = await taxRes.json()
        if (tax.vat_rate) setVatRate(tax.vat_rate * 100)
        if (tax.fuel_levy_per_liter) setFuelLevy(tax.fuel_levy_per_liter)
      }
      return setupDone
    } catch {
      return false
    }
  }

  const currentIndex = STEPS.indexOf(step)
  const middleSteps = STEPS.filter(s => s !== 'welcome' && s !== 'complete')

  const goNext = () => {
    const nextIndex = currentIndex + 1
    if (nextIndex < STEPS.length) setStep(STEPS[nextIndex])
  }

  const goBack = () => {
    const prevIndex = currentIndex - 1
    if (prevIndex >= 0) setStep(STEPS[prevIndex])
  }

  // ── Save handlers ──────────────────────────────────

  const saveProfile = async () => {
    if (!fullName.trim()) { toast.error('Please enter your full name'); return false }
    if (newPassword && newPassword !== confirmPassword) { toast.error('Passwords do not match'); return false }
    if (newPassword && newPassword.length < 6) { toast.error('Password must be at least 6 characters'); return false }

    setSaving(true)
    try {
      const updateData: any = { full_name: fullName.trim() }
      if (newPassword) updateData.password = newPassword

      const res = await authFetch(`${BASE}/auth/users/${user.username}`, {
        method: 'PUT',
        body: JSON.stringify(updateData),
      })
      if (!res.ok) { const err = await res.json(); throw new Error(err.detail || 'Failed to update profile') }

      const updatedUser = { ...user, full_name: fullName.trim() }
      localStorage.setItem('user', JSON.stringify(updatedUser))
      setUser(updatedUser)
      toast.success('Profile updated')
      return true
    } catch (err: any) { toast.error(err.message); return false }
    finally { setSaving(false) }
  }

  const saveBusiness = async () => {
    if (!businessName.trim()) { toast.error('Please enter your business name'); return false }

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

      const stationId = localStorage.getItem('stationId') || 'ST001'
      await authFetch(`${BASE}/stations/${stationId}`, {
        method: 'PUT',
        body: JSON.stringify({ station_id: stationId, name: businessName.trim(), location: stationLocation.trim() }),
      })

      toast.success('Business details saved')
      return true
    } catch (err: any) { toast.error(err.message); return false }
    finally { setSaving(false) }
  }

  const saveTanks = async () => {
    if (tankRows.length === 0) { toast.error('Add at least one tank'); return false }
    for (const row of tankRows) {
      if (!row.id.trim()) { toast.error('All tanks must have an ID'); return false }
      if (row.capacity <= 0) { toast.error('Tank capacity must be greater than zero'); return false }
    }
    // Check for duplicate IDs
    const ids = tankRows.map(r => r.id.trim())
    if (new Set(ids).size !== ids.length) { toast.error('Tank IDs must be unique'); return false }

    setSaving(true)
    try {
      for (const row of tankRows) {
        const params = new URLSearchParams({
          tank_id: row.id.trim(),
          fuel_type: row.fuel_type,
          capacity: String(row.capacity),
          initial_level: '0',
        })
        const res = await authFetch(`${BASE}/tanks/create?${params}`, { method: 'POST' })
        if (!res.ok) {
          const err = await res.json()
          // Skip if tank already exists (idempotent)
          if (!err.detail?.includes('already exists')) {
            throw new Error(err.detail || `Failed to create tank ${row.id}`)
          }
        }
      }
      toast.success(`${tankRows.length} tank(s) configured`)
      return true
    } catch (err: any) { toast.error(err.message); return false }
    finally { setSaving(false) }
  }

  const saveFuelAndTax = async () => {
    if (dieselPrice <= 0 || petrolPrice <= 0) { toast.error('Prices must be greater than zero'); return false }

    setSaving(true)
    try {
      const [fuelRes, taxRes] = await Promise.all([
        authFetch(`${BASE}/settings/fuel`, {
          method: 'PUT',
          body: JSON.stringify({
            diesel_price_per_liter: dieselPrice,
            petrol_price_per_liter: petrolPrice,
            diesel_allowable_loss_percent: dieselLoss,
            petrol_allowable_loss_percent: petrolLoss,
            nozzle_allowable_loss_liters: nozzleLoss,
          }),
        }),
        authFetch(`${BASE}/settings/tax-levy`, {
          method: 'PUT',
          body: JSON.stringify({
            vat_rate: vatRate / 100,
            fuel_levy_per_liter: fuelLevy,
          }),
        }),
      ])
      if (!fuelRes.ok) throw new Error('Failed to save fuel pricing')
      if (!taxRes.ok) throw new Error('Failed to save tax settings')
      toast.success('Pricing & tax saved')
      return true
    } catch (err: any) { toast.error(err.message); return false }
    finally { setSaving(false) }
  }

  const saveOperations = async () => {
    if (passThreshold >= warningThreshold) { toast.error('Pass threshold must be less than warning threshold'); return false }
    if (criticalStock >= lowStock) { toast.error('Critical stock must be less than low stock threshold'); return false }

    setSaving(true)
    try {
      const [thrRes, stockRes, reconRes] = await Promise.all([
        authFetch(`${BASE}/settings/validation-thresholds`, {
          method: 'PUT',
          body: JSON.stringify({
            pass_threshold: passThreshold,
            warning_threshold: warningThreshold,
            meter_discrepancy_threshold: 0.5,
          }),
        }),
        authFetch(`${BASE}/settings/stock-alerts`, {
          method: 'PUT',
          body: JSON.stringify({
            low_stock_threshold_percent: lowStock,
            critical_stock_threshold_percent: criticalStock,
          }),
        }),
        authFetch(`${BASE}/settings/reconciliation-tolerances`, {
          method: 'PUT',
          body: JSON.stringify({
            volume_tolerance_mode: volMode,
            volume_tolerance_minor: volMinor,
            volume_tolerance_investigation: volInvestigation,
            volume_cap_minor: volCapMinor,
            volume_cap_investigation: volCapInvestigation,
            percent_tolerance_minor: pctMinor,
            percent_tolerance_investigation: pctInvestigation,
            volume_tiers: volTiers,
            cash_tolerance_minor: cashMinor,
            cash_tolerance_investigation: cashInvestigation,
            min_volume_for_percent: 100,
          }),
        }),
      ])
      if (!thrRes.ok) throw new Error('Failed to save validation thresholds')
      if (!stockRes.ok) throw new Error('Failed to save stock alerts')
      if (!reconRes.ok) throw new Error('Failed to save reconciliation tolerances')
      toast.success('Operational settings saved')
      return true
    } catch (err: any) { toast.error(err.message); return false }
    finally { setSaving(false) }
  }

  const completeSetup = async () => {
    setSaving(true)
    try {
      const res = await authFetch(`${BASE}/settings/system`, {
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
      if (!res.ok) {
        toast.error('Failed to save settings. Please try again.')
        setSaving(false)
        return
      }
      // Clear cookie and redirect — setup is done
      const secure = window.location.protocol === 'https:' ? '; Secure' : ''
      document.cookie = `needsSetup=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT${secure}`
      router.push('/')
    } catch (err: any) {
      toast.error(err.message || 'Failed to complete setup. Please try again.')
    }
    finally { setSaving(false) }
  }

  const addStaffUser = async () => {
    const { full_name, username, password, role } = staffForm
    if (!full_name.trim() || !username.trim() || !password.trim()) {
      toast.error('Full name, username, and password are required')
      return
    }
    if (password.length < 6) { toast.error('Password must be at least 6 characters'); return }

    setAddingUser(true)
    try {
      const stationId = localStorage.getItem('stationId') || 'ST001'
      const res = await authFetch(`${BASE}/auth/users`, {
        method: 'POST',
        body: JSON.stringify({ full_name: full_name.trim(), username: username.trim(), password, role, station_id: stationId }),
      })
      if (!res.ok) { const err = await res.json(); throw new Error(err.detail || 'Failed to create user') }
      const data = await res.json()
      setCreatedUsers([...createdUsers, { user_id: data.user.user_id, username: data.user.username, full_name: data.user.full_name, role: data.user.role }])
      setStaffForm({ full_name: '', username: '', password: '', role })
      toast.success(`${role === 'supervisor' ? 'Supervisor' : role === 'manager' ? 'Manager' : 'Attendant'} "${full_name.trim()}" created`)
    } catch (err: any) { toast.error(err.message) }
    finally { setAddingUser(false) }
  }

  const removeStaffUser = async (username: string) => {
    try {
      const res = await authFetch(`${BASE}/auth/users/${username}`, { method: 'DELETE' })
      if (!res.ok) { const err = await res.json(); throw new Error(err.detail || 'Failed to remove user') }
      setCreatedUsers(createdUsers.filter(u => u.username !== username))
      toast.success('User removed')
    } catch (err: any) { toast.error(err.message) }
  }

  const validateStaff = () => {
    const attendants = createdUsers.filter(u => u.role === 'user')
    const supervisors = createdUsers.filter(u => u.role === 'supervisor')
    if (attendants.length === 0) { toast.error('Create at least one attendant'); return false }
    if (supervisors.length === 0) { toast.error('Create at least one supervisor'); return false }
    return true
  }

  const handleNext = async () => {
    if (step === 'profile') { if (!(await saveProfile())) return }
    else if (step === 'business') { if (!(await saveBusiness())) return }
    else if (step === 'tanks') { if (!(await saveTanks())) return }
    else if (step === 'fuel') { if (!(await saveFuelAndTax())) return }
    else if (step === 'operations') { if (!(await saveOperations())) return }
    else if (step === 'staff') { if (!validateStaff()) return }
    goNext()
  }

  // ── Tank row helpers ───────────────────────────────

  const addTankRow = () => {
    const dieselCount = tankRows.filter(r => r.fuel_type === 'Diesel').length
    const petrolCount = tankRows.filter(r => r.fuel_type === 'Petrol').length
    const nextType = dieselCount <= petrolCount ? 'Diesel' : 'Petrol'
    const count = tankRows.filter(r => r.fuel_type === nextType).length + 1
    setTankRows([...tankRows, { id: `TANK-${nextType.toUpperCase()}-${count}`, fuel_type: nextType, capacity: 20000 }])
  }

  const removeTankRow = (idx: number) => {
    if (tankRows.length <= 1) return
    setTankRows(tankRows.filter((_, i) => i !== idx))
  }

  const updateTankRow = (idx: number, field: keyof TankRow, value: any) => {
    setTankRows(tankRows.map((r, i) => i === idx ? { ...r, [field]: value } : r))
  }

  // ── Shared UI helpers ──────────────────────────────

  const inputClass = "w-full px-4 py-3 border border-surface-border rounded-input focus:outline-none focus:ring-2 focus:ring-action-primary focus:border-action-primary bg-transparent text-content-primary"
  const smallInputClass = "w-full px-3 py-2 text-sm border border-surface-border rounded-input focus:outline-none focus:ring-2 focus:ring-action-primary focus:border-action-primary bg-transparent text-content-primary"

  const NavButtons = ({ backDisabled }: { backDisabled?: boolean }) => (
    <div className="flex gap-3 pt-2">
      {!backDisabled && (
        <button onClick={goBack} className="px-4 py-3 border border-surface-border text-content-secondary rounded-btn hover:bg-surface-card/50 transition-all flex-1">
          Back
        </button>
      )}
      <button onClick={handleNext} disabled={saving} className={`px-4 py-3 bg-action-primary text-white font-semibold rounded-btn hover:bg-action-primary-hover disabled:opacity-50 transition-all shadow-glow-blue ${backDisabled ? 'w-full' : 'flex-[2]'}`}>
        {saving ? 'Saving...' : 'Continue'}
      </button>
    </div>
  )

  const StepHeader = ({ icon, iconBg, iconColor, title, subtitle }: { icon: React.ReactNode; iconBg: string; iconColor: string; title: string; subtitle: string }) => (
    <div className="text-center mb-2">
      <div className={`w-14 h-14 mx-auto ${iconBg} rounded-full flex items-center justify-center mb-3`}>
        <div className={`w-7 h-7 ${iconColor}`}>{icon}</div>
      </div>
      <h2 className="text-xl font-bold text-content-primary">{title}</h2>
      <p className="text-sm text-content-secondary mt-1">{subtitle}</p>
    </div>
  )

  // ── Render ─────────────────────────────────────────

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#0A3D7A] via-[#0F2847] to-[#0A1B30]" />
      <div className="absolute top-[20%] left-[15%] w-64 h-64 bg-action-primary/10 rounded-full blur-3xl animate-float" />
      <div className="absolute bottom-[20%] right-[10%] w-80 h-80 bg-action-primary/5 rounded-full blur-3xl animate-float" style={{ animationDelay: '1.5s' }} />

      <div className="max-w-lg w-full relative z-10 animate-scale-in">
        <div className="glass-card-static p-8 border border-white/10 relative overflow-hidden max-h-[85vh] overflow-y-auto">
          {/* Top accent line */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-action-primary via-action-primary-hover to-status-success" />

          {/* Progress bar */}
          {step !== 'welcome' && step !== 'complete' && (
            <div className="mb-6">
              <div className="flex justify-between text-xs text-content-secondary mb-2">
                {middleSteps.map((s) => (
                  <span key={s} className={step === s ? 'text-action-primary font-semibold' : currentIndex > STEPS.indexOf(s) ? 'text-status-success' : ''}>
                    {STEP_LABELS[s]}
                  </span>
                ))}
              </div>
              <div className="h-1.5 bg-surface-border rounded-full overflow-hidden">
                <div
                  className="h-full bg-action-primary rounded-full transition-all duration-500"
                  style={{ width: `${((STEPS.indexOf(step) - 1) / middleSteps.length) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* ── Welcome ──────────────────────────────── */}
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
                  Let's get your fuel management system set up. This wizard will walk you through everything needed to start operations.
                </p>
              </div>
              <div className="bg-surface-card/50 border border-surface-border rounded-lg p-4 text-left space-y-2">
                <p className="text-sm text-content-secondary">We'll help you configure:</p>
                <ul className="text-sm text-content-primary space-y-1.5">
                  {['Your name and login credentials', 'Business name and location', 'Fuel tanks and capacities', 'Fuel pricing and tax rates', 'Operational thresholds and tolerances', 'Staff accounts (attendants & supervisors)'].map(item => (
                    <li key={item} className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-status-success shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <button onClick={goNext} className="w-full px-4 py-3 bg-action-primary text-white font-semibold rounded-btn hover:bg-action-primary-hover focus:outline-none focus:ring-2 focus:ring-action-primary shadow-glow-blue transition-all">
                Get Started
              </button>
            </div>
          )}

          {/* ── Profile ──────────────────────────────── */}
          {step === 'profile' && (
            <div className="space-y-5">
              <StepHeader
                icon={<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>}
                iconBg="bg-category-a/20" iconColor="text-category-a"
                title="Your Profile" subtitle="Update your name and set a secure password"
              />
              <div>
                <label className="block text-sm font-medium text-content-secondary mb-1.5">Full Name</label>
                <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Enter your full name" className={inputClass} autoFocus />
              </div>
              <div>
                <label className="block text-sm font-medium text-content-secondary mb-1.5">New Password <span className="text-content-secondary/50 font-normal">(optional)</span></label>
                <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Leave blank to keep current" className={inputClass} />
              </div>
              {newPassword && (
                <div>
                  <label className="block text-sm font-medium text-content-secondary mb-1.5">Confirm Password</label>
                  <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Confirm your new password" className={inputClass} />
                </div>
              )}
              <NavButtons />
            </div>
          )}

          {/* ── Business ─────────────────────────────── */}
          {step === 'business' && (
            <div className="space-y-5">
              <StepHeader
                icon={<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 1.189a3 3 0 01-.621 4.72m-13.5 8.65h3.75a.75.75 0 00.75-.75V13.5a.75.75 0 00-.75-.75H6.75a.75.75 0 00-.75.75v3.15c0 .415.336.75.75.75z" /></svg>}
                iconBg="bg-status-success/20" iconColor="text-status-success"
                title="Business Details" subtitle="Tell us about your fuel station"
              />
              <div>
                <label className="block text-sm font-medium text-content-secondary mb-1.5">Business / Station Name</label>
                <input type="text" value={businessName} onChange={e => setBusinessName(e.target.value)} placeholder="e.g. Kafubu Filling Station" className={inputClass} autoFocus />
              </div>
              <div>
                <label className="block text-sm font-medium text-content-secondary mb-1.5">Location</label>
                <input type="text" value={stationLocation} onChange={e => setStationLocation(e.target.value)} placeholder="e.g. Great North Road, Ndola" className={inputClass} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-content-secondary mb-1.5">Contact Email</label>
                  <input type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} placeholder="email@example.com" className={inputClass} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-content-secondary mb-1.5">Contact Phone</label>
                  <input type="tel" value={contactPhone} onChange={e => setContactPhone(e.target.value)} placeholder="+260 97X XXXXXX" className={inputClass} />
                </div>
              </div>
              <NavButtons />
            </div>
          )}

          {/* ── Tanks ────────────────────────────────── */}
          {step === 'tanks' && (
            <div className="space-y-5">
              <StepHeader
                icon={<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" /></svg>}
                iconBg="bg-action-primary/20" iconColor="text-action-primary"
                title="Fuel Tanks" subtitle="Configure your station's fuel storage tanks"
              />

              <div className="space-y-3">
                {tankRows.map((row, idx) => (
                  <div key={idx} className="p-3 bg-surface-card/30 border border-surface-border rounded-lg space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-content-secondary">Tank {idx + 1}</span>
                      {tankRows.length > 1 && (
                        <button onClick={() => removeTankRow(idx)} className="text-xs text-status-error hover:text-status-error/80 transition-colors">Remove</button>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-xs text-content-secondary mb-1">Tank ID</label>
                        <input type="text" value={row.id} onChange={e => updateTankRow(idx, 'id', e.target.value)} className={smallInputClass} />
                      </div>
                      <div>
                        <label className="block text-xs text-content-secondary mb-1">Fuel Type</label>
                        <select value={row.fuel_type} onChange={e => updateTankRow(idx, 'fuel_type', e.target.value)} className={smallInputClass}>
                          <option value="Diesel">Diesel</option>
                          <option value="Petrol">Petrol</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-content-secondary mb-1">Capacity (L)</label>
                        <input type="number" min="0" value={row.capacity} onChange={e => updateTankRow(idx, 'capacity', parseFloat(e.target.value) || 0)} className={smallInputClass} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <button onClick={addTankRow} className="w-full px-3 py-2 border border-dashed border-surface-border text-content-secondary text-sm rounded-btn hover:bg-surface-card/30 transition-all">
                + Add Another Tank
              </button>

              <NavButtons />
            </div>
          )}

          {/* ── Fuel Pricing & Tax ────────────────────── */}
          {step === 'fuel' && (
            <div className="space-y-5">
              <StepHeader
                icon={<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                iconBg="bg-status-warning/20" iconColor="text-status-warning"
                title="Pricing & Tax" subtitle="Set pump prices and tax rates"
              />

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-content-secondary mb-1.5">Diesel (ZMW/L)</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-content-secondary/50 text-sm">K</span>
                    <input type="number" step="0.01" min="0" value={dieselPrice} onChange={e => setDieselPrice(parseFloat(e.target.value) || 0)} className={`${inputClass} pl-8`} />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-content-secondary mb-1.5">Petrol (ZMW/L)</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-content-secondary/50 text-sm">K</span>
                    <input type="number" step="0.01" min="0" value={petrolPrice} onChange={e => setPetrolPrice(parseFloat(e.target.value) || 0)} className={`${inputClass} pl-8`} />
                  </div>
                </div>
              </div>

              <div className="border-t border-surface-border pt-4">
                <p className="text-xs text-content-secondary mb-3">Tax & Levy (current Zambia national rates)</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-content-secondary mb-1.5">VAT Rate (%)</label>
                    <input type="number" step="0.1" min="0" max="100" value={vatRate} onChange={e => setVatRate(parseFloat(e.target.value) || 0)} className={inputClass} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-content-secondary mb-1.5">Fuel Levy (ZMW/L)</label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-content-secondary/50 text-sm">K</span>
                      <input type="number" step="0.01" min="0" value={fuelLevy} onChange={e => setFuelLevy(parseFloat(e.target.value) || 0)} className={`${inputClass} pl-8`} />
                    </div>
                  </div>
                </div>
              </div>

              <NavButtons />
            </div>
          )}

          {/* ── Operational Settings ──────────────────── */}
          {step === 'operations' && (
            <div className="space-y-4">
              <StepHeader
                icon={<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
                iconBg="bg-category-a/20" iconColor="text-category-a"
                title="Operational Settings" subtitle="Review and adjust recommended defaults"
              />

              {/* Allowable Losses */}
              <div className="p-3 bg-surface-card/30 border border-surface-border rounded-lg space-y-2">
                <p className="text-xs font-semibold text-content-secondary">Allowable Losses</p>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-xs text-content-secondary mb-1">Diesel (%)</label>
                    <input type="number" step="0.1" min="0" value={dieselLoss} onChange={e => setDieselLoss(parseFloat(e.target.value) || 0)} className={smallInputClass} />
                  </div>
                  <div>
                    <label className="block text-xs text-content-secondary mb-1">Petrol (%)</label>
                    <input type="number" step="0.1" min="0" value={petrolLoss} onChange={e => setPetrolLoss(parseFloat(e.target.value) || 0)} className={smallInputClass} />
                  </div>
                  <div>
                    <label className="block text-xs text-content-secondary mb-1">Nozzle (L)</label>
                    <input type="number" step="0.1" min="0" value={nozzleLoss} onChange={e => setNozzleLoss(parseFloat(e.target.value) || 0)} className={smallInputClass} />
                  </div>
                </div>
              </div>

              {/* Validation Thresholds */}
              <div className="p-3 bg-surface-card/30 border border-surface-border rounded-lg space-y-2">
                <p className="text-xs font-semibold text-content-secondary">Validation Thresholds</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-content-secondary mb-1">Pass (%)</label>
                    <input type="number" step="0.1" min="0" value={passThreshold} onChange={e => setPassThreshold(parseFloat(e.target.value) || 0)} className={smallInputClass} />
                  </div>
                  <div>
                    <label className="block text-xs text-content-secondary mb-1">Warning (%)</label>
                    <input type="number" step="0.1" min="0" value={warningThreshold} onChange={e => setWarningThreshold(parseFloat(e.target.value) || 0)} className={smallInputClass} />
                  </div>
                </div>
              </div>

              {/* Stock Alerts */}
              <div className="p-3 bg-surface-card/30 border border-surface-border rounded-lg space-y-2">
                <p className="text-xs font-semibold text-content-secondary">Stock Alerts</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-content-secondary mb-1">Low Stock (%)</label>
                    <input type="number" step="1" min="0" max="100" value={lowStock} onChange={e => setLowStock(parseFloat(e.target.value) || 0)} className={smallInputClass} />
                  </div>
                  <div>
                    <label className="block text-xs text-content-secondary mb-1">Critical (%)</label>
                    <input type="number" step="1" min="0" max="100" value={criticalStock} onChange={e => setCriticalStock(parseFloat(e.target.value) || 0)} className={smallInputClass} />
                  </div>
                </div>
              </div>

              {/* Reconciliation Tolerances */}
              <div className="p-3 bg-surface-card/30 border border-surface-border rounded-lg space-y-2">
                <p className="text-xs font-semibold text-content-secondary">Reconciliation Tolerances</p>
                <div>
                  <label className="block text-[10px] text-content-tertiary mb-0.5">Volume tolerance mode</label>
                  <select value={volMode} onChange={e => setVolMode(e.target.value)} className={smallInputClass + ' !w-full'}>
                    <option value="percentage">Percentage</option>
                    <option value="fixed">Fixed Litres</option>
                    <option value="hybrid">Hybrid (% + cap)</option>
                    <option value="tiered">Tiered (brackets)</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(volMode === 'percentage' || volMode === 'hybrid') && <>
                    <div>
                      <label className="block text-xs text-content-secondary mb-1">Percent Minor (%)</label>
                      <input type="number" step="0.1" min="0" value={pctMinor} onChange={e => setPctMinor(parseFloat(e.target.value) || 0)} className={smallInputClass} />
                    </div>
                    <div>
                      <label className="block text-xs text-content-secondary mb-1">Percent Investigate (%)</label>
                      <input type="number" step="0.1" min="0" value={pctInvestigation} onChange={e => setPctInvestigation(parseFloat(e.target.value) || 0)} className={smallInputClass} />
                    </div>
                  </>}
                  {volMode === 'fixed' && <>
                    <div>
                      <label className="block text-xs text-content-secondary mb-1">Volume Minor (L)</label>
                      <input type="number" step="0.5" min="0" value={volMinor} onChange={e => setVolMinor(parseFloat(e.target.value) || 0)} className={smallInputClass} />
                    </div>
                    <div>
                      <label className="block text-xs text-content-secondary mb-1">Volume Investigate (L)</label>
                      <input type="number" step="0.5" min="0" value={volInvestigation} onChange={e => setVolInvestigation(parseFloat(e.target.value) || 0)} className={smallInputClass} />
                    </div>
                  </>}
                  {volMode === 'hybrid' && <>
                    <div>
                      <label className="block text-xs text-content-secondary mb-1">Cap Minor (L)</label>
                      <input type="number" step="0.5" min="0" value={volCapMinor} onChange={e => setVolCapMinor(parseFloat(e.target.value) || 0)} className={smallInputClass} />
                      <p className="text-[10px] text-content-tertiary mt-0.5">{volCapMinor > 0 ? `Max ${volCapMinor}L` : '0 = no cap'}</p>
                    </div>
                    <div>
                      <label className="block text-xs text-content-secondary mb-1">Cap Investigate (L)</label>
                      <input type="number" step="0.5" min="0" value={volCapInvestigation} onChange={e => setVolCapInvestigation(parseFloat(e.target.value) || 0)} className={smallInputClass} />
                      <p className="text-[10px] text-content-tertiary mt-0.5">{volCapInvestigation > 0 ? `Max ${volCapInvestigation}L` : '0 = no cap'}</p>
                    </div>
                  </>}
                  {volMode === 'tiered' && <div className="col-span-2 space-y-1">
                    {volTiers.map((t: any, i: number) => (
                      <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-1 items-center">
                        <input type="number" placeholder="Up to (L)" value={t.up_to_liters} onChange={e => { const ts = [...volTiers]; ts[i] = { ...ts[i], up_to_liters: parseFloat(e.target.value) || 0 }; setVolTiers(ts) }} className={smallInputClass} />
                        <input type="number" placeholder="Minor (L)" step="0.5" value={t.tolerance_minor} onChange={e => { const ts = [...volTiers]; ts[i] = { ...ts[i], tolerance_minor: parseFloat(e.target.value) || 0 }; setVolTiers(ts) }} className={smallInputClass} />
                        <input type="number" placeholder="Invest (L)" step="0.5" value={t.tolerance_investigation} onChange={e => { const ts = [...volTiers]; ts[i] = { ...ts[i], tolerance_investigation: parseFloat(e.target.value) || 0 }; setVolTiers(ts) }} className={smallInputClass} />
                        <button type="button" onClick={() => setVolTiers(volTiers.filter((_: any, j: number) => j !== i))} className="text-status-error text-xs">X</button>
                      </div>
                    ))}
                    <button type="button" onClick={() => setVolTiers([...volTiers, { up_to_liters: (volTiers.length > 0 ? volTiers[volTiers.length-1].up_to_liters : 0) + 5000, tolerance_minor: 5, tolerance_investigation: 15 }])}
                      className="text-[10px] text-action-primary font-medium">+ Add tier</button>
                  </div>}
                  <div>
                    <label className="block text-xs text-content-secondary mb-1">Cash Minor (ZMW)</label>
                    <input type="number" min="0" value={cashMinor} onChange={e => setCashMinor(parseFloat(e.target.value) || 0)} className={smallInputClass} />
                  </div>
                  <div>
                    <label className="block text-xs text-content-secondary mb-1">Cash Investigate (ZMW)</label>
                    <input type="number" min="0" value={cashInvestigation} onChange={e => setCashInvestigation(parseFloat(e.target.value) || 0)} className={smallInputClass} />
                  </div>
                </div>
              </div>

              <NavButtons />
            </div>
          )}

          {/* ── Staff ───────────────────────────────── */}
          {step === 'staff' && (
            <div className="space-y-4">
              <StepHeader
                icon={<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>}
                iconBg="bg-status-success/20" iconColor="text-status-success"
                title="Create Staff" subtitle="Add at least one attendant and one supervisor"
              />

              {/* Created users list */}
              {createdUsers.length > 0 && (
                <div className="space-y-1.5">
                  {createdUsers.map(u => (
                    <div key={u.username} className="flex items-center justify-between p-2.5 bg-surface-card/30 border border-surface-border rounded-lg">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-badge ${u.role === 'manager' ? 'bg-action-primary/20 text-action-primary' : u.role === 'supervisor' ? 'bg-status-warning/20 text-status-warning' : 'bg-status-success/20 text-status-success'}`}>
                          {u.role === 'manager' ? 'MGR' : u.role === 'supervisor' ? 'SUP' : 'ATT'}
                        </span>
                        <span className="text-sm text-content-primary">{u.full_name}</span>
                        <span className="text-xs text-content-secondary">({u.username})</span>
                      </div>
                      <button onClick={() => removeStaffUser(u.username)} className="text-xs text-status-error hover:text-status-error/80">Remove</button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add user form */}
              <div className="p-3 bg-surface-card/30 border border-surface-border rounded-lg space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-content-secondary">Add</span>
                  <select
                    value={staffForm.role}
                    onChange={e => setStaffForm({ ...staffForm, role: e.target.value as 'user' | 'supervisor' | 'manager' })}
                    className={smallInputClass + ' !w-auto'}
                  >
                    <option value="user">Attendant</option>
                    <option value="supervisor">Supervisor</option>
                    <option value="manager">Manager</option>
                  </select>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-xs text-content-secondary mb-1">Full Name</label>
                    <input type="text" value={staffForm.full_name} onChange={e => setStaffForm({ ...staffForm, full_name: e.target.value })} placeholder="John Banda" className={smallInputClass} />
                  </div>
                  <div>
                    <label className="block text-xs text-content-secondary mb-1">Username</label>
                    <input type="text" value={staffForm.username} onChange={e => setStaffForm({ ...staffForm, username: e.target.value })} placeholder="jbanda" className={smallInputClass} />
                  </div>
                  <div>
                    <label className="block text-xs text-content-secondary mb-1">Password</label>
                    <input type="password" value={staffForm.password} onChange={e => setStaffForm({ ...staffForm, password: e.target.value })} placeholder="Min 6 chars" className={smallInputClass} />
                  </div>
                </div>
                <button
                  onClick={addStaffUser}
                  disabled={addingUser}
                  className="w-full px-3 py-2 bg-status-success/20 text-status-success text-sm font-medium rounded-btn hover:bg-status-success/30 disabled:opacity-50 transition-all border border-status-success/30"
                >
                  {addingUser ? 'Creating...' : `+ Add ${staffForm.role === 'manager' ? 'Manager' : staffForm.role === 'supervisor' ? 'Supervisor' : 'Attendant'}`}
                </button>
              </div>

              {/* Status summary */}
              <div className="flex gap-3 text-xs text-content-secondary">
                <span>Attendants: <strong className={createdUsers.filter(u => u.role === 'user').length > 0 ? 'text-status-success' : 'text-status-error'}>{createdUsers.filter(u => u.role === 'user').length}</strong></span>
                <span>Supervisors: <strong className={createdUsers.filter(u => u.role === 'supervisor').length > 0 ? 'text-status-success' : 'text-status-error'}>{createdUsers.filter(u => u.role === 'supervisor').length}</strong></span>
              </div>

              <NavButtons />
            </div>
          )}

          {/* ── Complete ─────────────────────────────── */}
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
                    <span><strong className="text-content-primary">Review infrastructure</strong> &mdash; Check islands and nozzle assignments in Infrastructure</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-action-primary font-bold mt-0.5">2.</span>
                    <span><strong className="text-content-primary">Add credit accounts</strong> &mdash; Set up customer accounts for credit sales</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-action-primary font-bold mt-0.5">3.</span>
                    <span><strong className="text-content-primary">Start a shift</strong> &mdash; Create your first shift and begin operations</span>
                  </li>
                </ul>
              </div>

              <button
                onClick={completeSetup}
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
        <p className="mt-1 text-center text-[10px] text-white/10">
          Developed by Hetch Solutions
        </p>
      </div>
    </div>
  )
}
