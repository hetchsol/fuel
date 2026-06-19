import { useState, useEffect, useCallback } from 'react'
import { authFetch } from '../lib/api'
import {
  PAYROLL, fmtZMW, periodLabel, MONTH_NAMES,
  type EmployeeProfile, type StatutoryRates, type WcfCategory,
  type LeaveType, type LeaveBalance, type LeaveRequest,
  type AttendanceRecord, type PublicHoliday,
  type SalaryAdvance, type Payslip, type PayrollRun, type PayrollRunDetail,
  type PaymentMethod, type AttendanceStatus, type OvertimeType,
  type CustomDeduction,
} from '../lib/payroll'

// ── Helpers ───────────────────────────────────────────────
function fmt(n: number | null | undefined) {
  if (n == null) return '—'
  return fmtZMW(n)
}
function effective(p: Payslip, field: 'napsa' | 'nhima' | 'paye'): number {
  const ov = field === 'napsa' ? p.napsa_employee_override
           : field === 'nhima' ? p.nhima_employee_override
           : p.paye_override
  const calc = field === 'napsa' ? p.napsa_employee_calc
             : field === 'nhima' ? p.nhima_employee_calc
             : p.paye_calc
  return ov != null ? ov : calc
}
const TABS = ['Overview', 'Staff Setup', 'Attendance', 'Leave', 'Advances', 'Payroll Run', 'Payments', 'Statutory & History'] as const
type Tab = typeof TABS[number]

const ATTENDANCE_LABELS: Record<AttendanceStatus, string> = {
  present: 'Present', absent: 'Absent', on_leave: 'On Leave',
  public_holiday: 'Public Holiday', off_day: 'Off Day',
}
const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-blue-100 text-blue-800',
  paid: 'bg-green-100 text-green-800',
  pending: 'bg-yellow-100 text-yellow-800',
  active: 'bg-blue-100 text-blue-800',
  settled: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-600',
}

// ── Shared components ─────────────────────────────────────
function Badge({ status }: { status: string }) {
  return (
    <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded capitalize ${STATUS_COLORS[status] || 'bg-gray-100 text-gray-700'}`}>
      {status.replace('_', ' ')}
    </span>
  )
}
function Card({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="bg-surface-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-content-primary">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  )
}
function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 text-left text-xs font-semibold text-content-secondary uppercase tracking-wide">{children}</th>
}
function Td({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <td className={`px-3 py-2 text-sm text-content-primary ${right ? 'text-right tabular-nums' : ''}`}>{children}</td>
}
function Btn({ onClick, children, variant = 'secondary', disabled, small }: {
  onClick?: () => void; children: React.ReactNode; variant?: 'primary' | 'secondary' | 'danger'
  disabled?: boolean; small?: boolean
}) {
  const base = `font-medium rounded-btn transition-colors ${small ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm'} ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`
  const cls = variant === 'primary' ? `${base} bg-brand text-white hover:bg-brand-dark`
            : variant === 'danger'  ? `${base} bg-red-600 text-white hover:bg-red-700`
            : `${base} border border-border text-content-primary hover:bg-surface-hover`
  return <button className={cls} onClick={disabled ? undefined : onClick} disabled={disabled}>{children}</button>
}
function Input({ label, value, onChange, type = 'text', step }: {
  label: string; value: string | number; onChange: (v: string) => void
  type?: string; step?: string
}) {
  return (
    <label className="block">
      <span className="text-xs text-content-secondary mb-1 block">{label}</span>
      <input
        type={type} step={step} value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-2 py-1.5 text-sm border border-border rounded bg-surface-input text-content-primary focus:outline-none focus:ring-1 focus:ring-brand"
      />
    </label>
  )
}
function Select({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <label className="block">
      <span className="text-xs text-content-secondary mb-1 block">{label}</span>
      <select
        value={value} onChange={e => onChange(e.target.value)}
        className="w-full px-2 py-1.5 text-sm border border-border rounded bg-surface-input text-content-primary focus:outline-none focus:ring-1 focus:ring-brand"
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  )
}

// ══════════════════════════════════════════════════════════
// Overview tab
// ══════════════════════════════════════════════════════════
function OverviewTab({ runs, pendingLeave, pendingAdvances, onTabChange }: {
  runs: PayrollRun[]
  pendingLeave: number
  pendingAdvances: number
  onTabChange: (t: Tab) => void
}) {
  const latest = runs[0]
  const now = new Date()
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Latest Run', value: latest ? periodLabel(latest.period_month, latest.period_year) : 'None', sub: latest ? <Badge status={latest.status} /> : null },
          { label: 'Net Payroll', value: latest ? fmt(latest.total_net) : '—', sub: latest?.status },
          { label: 'Leave Pending', value: String(pendingLeave), sub: 'requests awaiting approval', onClick: () => onTabChange('Leave') },
          { label: 'Advance Pending', value: String(pendingAdvances), sub: 'advances awaiting approval', onClick: () => onTabChange('Advances') },
        ].map(c => (
          <div key={c.label}
            className={`bg-surface-card border border-border rounded-lg p-4 ${c.onClick ? 'cursor-pointer hover:border-brand transition-colors' : ''}`}
            onClick={c.onClick}
          >
            <p className="text-xs text-content-secondary">{c.label}</p>
            <p className="text-xl font-bold text-content-primary mt-0.5">{c.value}</p>
            <div className="text-xs text-content-secondary mt-0.5">{c.sub}</div>
          </div>
        ))}
      </div>
      {latest && (
        <Card title={`Latest Run — ${periodLabel(latest.period_month, latest.period_year)}`}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
            {[
              ['Gross Payroll', fmt(latest.total_gross)],
              ['Total PAYE', fmt(latest.total_paye)],
              ['Total NAPSA (employee)', fmt(latest.total_napsa_employee)],
              ['Total NHIMA (employee)', fmt(latest.total_nhima_employee)],
              ['Total Advances', fmt(latest.total_advances)],
              ['Net Pay', fmt(latest.total_net)],
              ['Employer Cost', fmt(latest.total_employer_cost)],
            ].map(([k, v]) => (
              <div key={k as string}><p className="text-content-secondary text-xs">{k}</p><p className="font-semibold">{v}</p></div>
            ))}
          </div>
        </Card>
      )}
      <Card title="Recent Runs">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border"><Th>Period</Th><Th>Status</Th><Th>Net</Th><Th>Employer Cost</Th></tr></thead>
          <tbody>
            {runs.slice(0, 6).map(r => (
              <tr key={r.run_id} className="border-b border-border last:border-0">
                <Td>{periodLabel(r.period_month, r.period_year)}</Td>
                <Td><Badge status={r.status} />{r.is_historical && <span className="ml-1 text-xs text-content-secondary">(historical)</span>}</Td>
                <Td right>{fmt(r.total_net)}</Td>
                <Td right>{fmt(r.total_employer_cost)}</Td>
              </tr>
            ))}
            {runs.length === 0 && <tr><td colSpan={4} className="text-center py-6 text-content-secondary text-sm">No payroll runs yet</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  )
}

// ══════════════════════════════════════════════════════════
// Staff Setup tab
// ══════════════════════════════════════════════════════════
function StaffSetupTab({ profiles, users, wcfCategories, onSave }: {
  profiles: EmployeeProfile[]
  users: any[]
  wcfCategories: WcfCategory[]
  onSave: () => void
}) {
  const [editing, setEditing] = useState<string | null>(null)
  const [form, setForm] = useState<any>({})
  const [saving, setSaving] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [error, setError] = useState('')

  const toggleActive = async () => {
    if (!editing) return
    setToggling(true)
    setError('')
    try {
      const res = await authFetch(PAYROLL.employeeToggle(editing), { method: 'PATCH' })
      if (!res.ok) throw new Error((await res.json()).detail || 'Toggle failed')
      onSave()
    } catch (e: any) { setError(e.message) }
    setToggling(false)
  }

  const openEdit = (uid: string) => {
    const p = profiles.find(p => p.user_id === uid) || {}
    setForm({
      basic_salary: (p as any).basic_salary || 0,
      housing_allowance: (p as any).housing_allowance || 0,
      transport_allowance: (p as any).transport_allowance || 0,
      employment_type: (p as any).employment_type || 'permanent',
      contracted_hours_per_week: (p as any).contracted_hours_per_week || 48,
      annual_leave_days: (p as any).annual_leave_days || 24,
      start_date: (p as any).start_date || '',
      nrc_number: (p as any).nrc_number || '',
      tpin: (p as any).tpin || '',
      napsa_number: (p as any).napsa_number || '',
      nhima_number: (p as any).nhima_number || '',
      bank_name: (p as any).bank_name || '',
      bank_branch: (p as any).bank_branch || '',
      bank_account_number: (p as any).bank_account_number || '',
      mobile_money_provider: (p as any).mobile_money_provider || '',
      mobile_money_number: (p as any).mobile_money_number || '',
      preferred_payment_method: (p as any).preferred_payment_method || 'bank',
      wcf_category_id: (p as any).wcf_category_id || '',
    })
    setEditing(uid)
    setError('')
  }

  const save = async () => {
    if (!editing) return
    setSaving(true)
    setError('')
    try {
      const res = await authFetch(`${PAYROLL.employee(editing)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          basic_salary: parseFloat(form.basic_salary) || 0,
          housing_allowance: parseFloat(form.housing_allowance) || 0,
          transport_allowance: parseFloat(form.transport_allowance) || 0,
          contracted_hours_per_week: parseInt(form.contracted_hours_per_week) || 48,
          annual_leave_days: parseInt(form.annual_leave_days) || 24,
          start_date: form.start_date || null,
          wcf_category_id: form.wcf_category_id || null,
          mobile_money_provider: form.mobile_money_provider || null,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).detail || 'Save failed')
      setEditing(null)
      onSave()
    } catch (e: any) { setError(e.message) }
    setSaving(false)
  }

  const stf = (k: string) => (v: string) => setForm((f: any) => ({ ...f, [k]: v }))
  const editingUser = users.find(u => u.user_id === editing)

  return (
    <div className="flex gap-4 items-start">
      {/* Left: employee list */}
      <div className="w-56 shrink-0">
        <div className="bg-surface-card border border-border rounded-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-border">
            <p className="text-xs font-semibold text-content-secondary uppercase tracking-wide">Employees</p>
          </div>
          {users.map(u => {
            const p = profiles.find(p => p.user_id === u.user_id)
            const isSelected = editing === u.user_id
            const inactive = p && !p.is_active
            const pending = p && p.is_active && p.pending_deactivation
            return (
              <button
                key={u.user_id}
                onClick={() => openEdit(u.user_id)}
                className={`w-full text-left px-3 py-2.5 border-b border-border last:border-0 transition-colors ${isSelected ? 'bg-brand/10 border-l-2 border-l-brand' : 'hover:bg-surface-hover'} ${inactive ? 'opacity-50' : ''}`}
              >
                <p className={`text-sm font-medium truncate ${isSelected ? 'text-brand' : 'text-content-primary'}`}>{u.full_name}</p>
                <p className="text-xs text-content-secondary capitalize">
                  {u.role}{!p ? ' · not set up' : inactive ? ' · inactive' : pending ? ' · leaving after pay run' : ''}
                </p>
              </button>
            )
          })}
          {users.length === 0 && <p className="px-3 py-4 text-sm text-content-secondary">No staff found</p>}
        </div>
      </div>

      {/* Right: form or placeholder */}
      <div className="flex-1 min-w-0">
        {!editing ? (
          <div className="bg-surface-card border border-border rounded-lg flex items-center justify-center h-48">
            <p className="text-sm text-content-secondary">Select an employee to edit their payroll profile</p>
          </div>
        ) : (
          <div className="bg-surface-card border border-border rounded-lg p-4">
            {(() => {
              const ep = profiles.find(p => p.user_id === editing)
              const epInactive = ep && !ep.is_active
              const epPending = ep && ep.is_active && ep.pending_deactivation
              return (
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <h3 className="font-semibold text-content-primary">{editingUser?.full_name}</h3>
                    {ep && (
                      epInactive
                        ? <span className="text-xs text-content-secondary bg-surface-hover border border-border px-2 py-0.5 rounded">Inactive</span>
                        : epPending
                          ? <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">Leaving after pay run</span>
                          : <span className="text-xs text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded">Active</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {error && <p className="text-red-600 text-sm">{error}</p>}
                    {ep && (
                      epInactive
                        ? <Btn variant="secondary" onClick={toggleActive} disabled={toggling}>{toggling ? 'Reactivating...' : 'Reactivate'}</Btn>
                        : epPending
                          ? <Btn variant="secondary" onClick={toggleActive} disabled={toggling}>{toggling ? 'Cancelling...' : 'Cancel deactivation'}</Btn>
                          : <Btn variant="secondary" onClick={toggleActive} disabled={toggling}>{toggling ? 'Queueing...' : 'Deactivate'}</Btn>
                    )}
                  </div>
                </div>
              )
            })()}

            {/* Salary & Employment — single dense row */}
            <p className="text-[10px] font-semibold text-content-secondary uppercase tracking-wide mb-2">Salary & Employment</p>
            <div className="grid grid-cols-5 gap-2 mb-3">
              <Input label="Basic (ZMW)" value={form.basic_salary} onChange={stf('basic_salary')} type="number" step="0.01" />
              <Input label="Housing (ZMW)" value={form.housing_allowance} onChange={stf('housing_allowance')} type="number" step="0.01" />
              <Input label="Transport (ZMW)" value={form.transport_allowance} onChange={stf('transport_allowance')} type="number" step="0.01" />
              <Select label="Type" value={form.employment_type} onChange={stf('employment_type')}
                options={[{value:'permanent',label:'Permanent'},{value:'contract',label:'Contract'},{value:'casual',label:'Casual'}]} />
              <Input label="Hrs / Week" value={form.contracted_hours_per_week} onChange={stf('contracted_hours_per_week')} type="number" />
            </div>
            <div className="grid grid-cols-5 gap-2 mb-4">
              <Input label="Leave Days / Yr" value={form.annual_leave_days} onChange={stf('annual_leave_days')} type="number" />
              <Input label="Start Date" value={form.start_date} onChange={stf('start_date')} type="date" />
              <div className="col-span-2">
                <Select label="WCF Category" value={form.wcf_category_id} onChange={stf('wcf_category_id')}
                  options={[{value:'',label:'— None —'}, ...wcfCategories.map(c => ({value:c.category_id,label:`${c.category_name} (${(c.rate_percent*100).toFixed(2)}%)`}))]} />
              </div>
              <div />
            </div>

            {/* Statutory numbers */}
            <p className="text-[10px] font-semibold text-content-secondary uppercase tracking-wide mb-2">Statutory Numbers</p>
            <div className="grid grid-cols-5 gap-2 mb-4">
              <Input label="NRC Number" value={form.nrc_number} onChange={stf('nrc_number')} />
              <Input label="TPIN" value={form.tpin} onChange={stf('tpin')} />
              <Input label="NAPSA Number" value={form.napsa_number} onChange={stf('napsa_number')} />
              <Input label="NHIMA Number" value={form.nhima_number} onChange={stf('nhima_number')} />
              <div />
            </div>

            {/* Payment details */}
            <p className="text-[10px] font-semibold text-content-secondary uppercase tracking-wide mb-2">Payment Details</p>
            <div className="grid grid-cols-5 gap-2 mb-4">
              <Select label="Method" value={form.preferred_payment_method} onChange={stf('preferred_payment_method')}
                options={[{value:'bank',label:'Bank Transfer'},{value:'mobile_money',label:'Mobile Money'},{value:'cash',label:'Cash'}]} />
              <Input label="Bank Name" value={form.bank_name} onChange={stf('bank_name')} />
              <Input label="Branch" value={form.bank_branch} onChange={stf('bank_branch')} />
              <Input label="Account Number" value={form.bank_account_number} onChange={stf('bank_account_number')} />
              <div />
            </div>
            <div className="grid grid-cols-5 gap-2 mb-4">
              <Select label="Mobile Provider" value={form.mobile_money_provider} onChange={stf('mobile_money_provider')}
                options={[{value:'',label:'— None —'},{value:'airtel',label:'Airtel Money'},{value:'mtn',label:'MTN Mobile Money'},{value:'zamtel',label:'Zamtel Kwacha'}]} />
              <Input label="Mobile Number" value={form.mobile_money_number} onChange={stf('mobile_money_number')} />
              <div /><div /><div />
            </div>

            <div className="flex gap-2 pt-1 border-t border-border">
              <Btn variant="primary" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save Profile'}</Btn>
              <Btn onClick={() => setEditing(null)}>Cancel</Btn>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════
// Attendance tab
// ══════════════════════════════════════════════════════════
function AttendanceTab({ users, holidays }: { users: any[]; holidays: PublicHoliday[] }) {
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [saving, setSaving] = useState(false)

  const daysInMonth = new Date(year, month, 0).getDate()
  const holidayDates = new Set(holidays.filter(h => {
    const d = new Date(h.holiday_date)
    return d.getMonth() + 1 === month && d.getFullYear() === year
  }).map(h => new Date(h.holiday_date).getDate()))

  const loadAttendance = useCallback(async () => {
    const res = await authFetch(`${PAYROLL.attendance()}?month=${month}&year=${year}`)
    if (res.ok) setRecords(await res.json())
  }, [month, year])

  useEffect(() => { loadAttendance() }, [loadAttendance])

  const getRecord = (uid: string, day: number): AttendanceRecord | undefined => {
    const d = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`
    return records.find(r => r.user_id === uid && r.work_date === d)
  }

  const updateDay = async (uid: string, day: number, status: AttendanceStatus) => {
    const d = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`
    const isHoliday = holidayDates.has(day)
    const isWeekend = new Date(year, month - 1, day).getDay() === 0
    await authFetch(`${PAYROLL.attendanceDay(uid, d)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, regular_hours: 8, overtime_hours: 0, overtime_type: 'none' }),
    })
    await loadAttendance()
  }

  const statusColor: Record<string, string> = {
    present: 'bg-green-100 text-green-800',
    absent: 'bg-red-100 text-red-700',
    on_leave: 'bg-blue-100 text-blue-700',
    public_holiday: 'bg-purple-100 text-purple-700',
    off_day: 'bg-gray-100 text-gray-500',
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <select className="px-2 py-1.5 text-sm border border-border rounded bg-surface-input"
          value={month} onChange={e => setMonth(parseInt(e.target.value))}>
          {MONTH_NAMES.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
        </select>
        <select className="px-2 py-1.5 text-sm border border-border rounded bg-surface-input"
          value={year} onChange={e => setYear(parseInt(e.target.value))}>
          {[2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      <div className="overflow-x-auto">
        <table className="text-xs border-collapse">
          <thead>
            <tr>
              <th className="px-2 py-1.5 text-left bg-surface-card border border-border min-w-[140px] sticky left-0 z-10">Employee</th>
              {Array.from({length: daysInMonth}, (_, i) => i + 1).map(d => {
                const dow = new Date(year, month - 1, d).getDay()
                const isHol = holidayDates.has(d)
                return (
                  <th key={d} className={`px-1 py-1.5 text-center border border-border min-w-[32px] ${isHol ? 'bg-purple-50' : dow === 0 ? 'bg-gray-50' : 'bg-surface-card'}`}>
                    <div className="font-semibold">{d}</div>
                    <div className="text-content-secondary font-normal">{'SMTWTFS'[dow]}</div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.user_id} className="hover:bg-surface-hover">
                <td className="px-2 py-1 border border-border bg-surface-card sticky left-0 z-10 font-medium text-content-primary">{u.full_name}</td>
                {Array.from({length: daysInMonth}, (_, i) => i + 1).map(d => {
                  const rec = getRecord(u.user_id, d)
                  const dow = new Date(year, month - 1, d).getDay()
                  const isHol = holidayDates.has(d)
                  const defaultStatus: AttendanceStatus = isHol ? 'public_holiday' : dow === 0 ? 'off_day' : 'present'
                  const status = rec?.status || defaultStatus
                  return (
                    <td key={d} className="border border-border p-0">
                      <select
                        value={status}
                        onChange={e => updateDay(u.user_id, d, e.target.value as AttendanceStatus)}
                        className={`w-full text-center text-[10px] py-1 border-0 bg-transparent cursor-pointer focus:outline-none ${statusColor[status]}`}
                        title={ATTENDANCE_LABELS[status as AttendanceStatus]}
                      >
                        <option value="present">P</option>
                        <option value="absent">A</option>
                        <option value="on_leave">L</option>
                        <option value="public_holiday">H</option>
                        <option value="off_day">O</option>
                      </select>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-3 text-xs flex-wrap">
        {Object.entries(statusColor).map(([k, v]) => (
          <span key={k} className={`px-2 py-0.5 rounded ${v}`}>{k === 'present' ? 'P - Present' : k === 'absent' ? 'A - Absent' : k === 'on_leave' ? 'L - Leave' : k === 'public_holiday' ? 'H - Holiday' : 'O - Off Day'}</span>
        ))}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════
// Leave tab
// ══════════════════════════════════════════════════════════
function LeaveTab({ users, leaveTypes, onRefresh }: {
  users: any[]; leaveTypes: LeaveType[]; onRefresh: () => void
}) {
  const [subTab, setSubTab] = useState<'requests' | 'balances'>('requests')
  const [requests, setRequests] = useState<LeaveRequest[]>([])
  const [balances, setBalances] = useState<LeaveBalance[]>([])
  const [acting, setActing] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [rRes, bRes] = await Promise.all([
      authFetch(`${PAYROLL.leaveRequests()}`),
      authFetch(`${PAYROLL.leaveBalances()}`),
    ])
    if (rRes.ok) setRequests(await rRes.json())
    if (bRes.ok) setBalances(await bRes.json())
  }, [])

  useEffect(() => { load() }, [load])

  const act = async (id: string, action: 'approve' | 'reject') => {
    setActing(id)
    const url = action === 'approve' ? PAYROLL.leaveApprove(id) : PAYROLL.leaveReject(id)
    await authFetch(url, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: '{}' })
    await load()
    onRefresh()
    setActing(null)
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(['requests', 'balances'] as const).map(t => (
          <Btn key={t} variant={subTab === t ? 'primary' : 'secondary'} onClick={() => setSubTab(t)}>
            {t === 'requests' ? 'Leave Requests' : 'Leave Balances'}
          </Btn>
        ))}
      </div>
      {subTab === 'requests' && (
        <Card title="Leave Requests">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border">
              <Th>Employee</Th><Th>Type</Th><Th>From</Th><Th>To</Th><Th>Days</Th><Th>Status</Th><Th>Notes</Th><Th>Actions</Th>
            </tr></thead>
            <tbody>
              {requests.map(r => (
                <tr key={r.request_id} className="border-b border-border last:border-0">
                  <Td>{users.find(u => u.user_id === r.user_id)?.full_name || r.user_id}</Td>
                  <Td>{leaveTypes.find(t => t.type_id === r.leave_type_id)?.type_name || r.leave_type_id}</Td>
                  <Td>{r.start_date}</Td>
                  <Td>{r.end_date}</Td>
                  <Td right>{r.days_requested}</Td>
                  <Td><Badge status={r.status} /></Td>
                  <Td><span className="text-content-secondary text-xs">{r.notes || '—'}</span></Td>
                  <Td>
                    {r.status === 'pending' && (
                      <div className="flex gap-1">
                        <Btn small variant="primary" disabled={acting === r.request_id} onClick={() => act(r.request_id, 'approve')}>Approve</Btn>
                        <Btn small variant="danger" disabled={acting === r.request_id} onClick={() => act(r.request_id, 'reject')}>Reject</Btn>
                      </div>
                    )}
                  </Td>
                </tr>
              ))}
              {requests.length === 0 && <tr><td colSpan={8} className="text-center py-6 text-content-secondary text-sm">No leave requests</td></tr>}
            </tbody>
          </table>
        </Card>
      )}
      {subTab === 'balances' && (
        <Card title={`Leave Balances — ${new Date().getFullYear()}`}>
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border">
              <Th>Employee</Th><Th>Leave Type</Th><Th>Entitled</Th><Th>Accrued</Th><Th>Taken</Th><Th>Carry Fwd</Th><Th>Remaining</Th>
            </tr></thead>
            <tbody>
              {balances.map(b => (
                <tr key={b.balance_id} className="border-b border-border last:border-0">
                  <Td>{users.find(u => u.user_id === b.user_id)?.full_name || b.user_id}</Td>
                  <Td>{leaveTypes.find(t => t.type_id === b.leave_type_id)?.type_name || b.leave_type_id}</Td>
                  <Td right>{b.days_entitled}</Td>
                  <Td right>{b.days_accrued}</Td>
                  <Td right>{b.days_taken}</Td>
                  <Td right>{b.carry_forward}</Td>
                  <Td right><span className={b.days_remaining < 0 ? 'text-red-600 font-semibold' : ''}>{b.days_remaining}</span></Td>
                </tr>
              ))}
              {balances.length === 0 && <tr><td colSpan={7} className="text-center py-6 text-content-secondary text-sm">No balances found</td></tr>}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════
// Advances tab
// ══════════════════════════════════════════════════════════
function AdvancesTab({ users, onRefresh }: { users: any[]; onRefresh: () => void }) {
  const [advances, setAdvances] = useState<SalaryAdvance[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ user_id: '', amount: '', reason: '', repayment_months: '1' })
  const [acting, setActing] = useState<string | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const res = await authFetch(`${PAYROLL.advances()}`)
    if (res.ok) setAdvances(await res.json())
  }, [])
  useEffect(() => { load() }, [load])

  const submit = async () => {
    setError('')
    try {
      const res = await authFetch(`${PAYROLL.advances()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: form.user_id, amount: parseFloat(form.amount), reason: form.reason, repayment_months: parseInt(form.repayment_months) }),
      })
      if (!res.ok) throw new Error((await res.json()).detail || 'Failed')
      setShowForm(false)
      setForm({ user_id: '', amount: '', reason: '', repayment_months: '1' })
      load()
    } catch (e: any) { setError(e.message) }
  }

  const act = async (id: string, action: 'approve' | 'reject') => {
    setActing(id)
    const url = action === 'approve' ? PAYROLL.advanceApprove(id) : PAYROLL.advanceReject(id)
    await authFetch(url, { method: 'PUT' })
    await load()
    onRefresh()
    setActing(null)
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Btn variant="primary" onClick={() => setShowForm(true)}>Request Advance</Btn>
      </div>
      {showForm && (
        <Card title="New Salary Advance Request">
          {error && <p className="text-red-600 text-sm mb-2">{error}</p>}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <Select label="Employee" value={form.user_id} onChange={v => setForm(f => ({...f,user_id:v}))}
              options={[{value:'',label:'Select employee...'}, ...users.map(u => ({value:u.user_id,label:u.full_name}))]} />
            <Input label="Amount (ZMW)" value={form.amount} onChange={v => setForm(f => ({...f,amount:v}))} type="number" step="0.01" />
            <Input label="Reason" value={form.reason} onChange={v => setForm(f => ({...f,reason:v}))} />
            <Input label="Repayment Months" value={form.repayment_months} onChange={v => setForm(f => ({...f,repayment_months:v}))} type="number" />
          </div>
          {form.amount && form.repayment_months && (
            <p className="text-sm text-content-secondary mb-3">
              Monthly deduction: {fmt(parseFloat(form.amount) / parseInt(form.repayment_months))}
            </p>
          )}
          <div className="flex gap-2">
            <Btn variant="primary" onClick={submit}>Submit Request</Btn>
            <Btn onClick={() => setShowForm(false)}>Cancel</Btn>
          </div>
        </Card>
      )}
      <Card title="Salary Advances">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border">
            <Th>Employee</Th><Th>Amount</Th><Th>Monthly</Th><Th>Outstanding</Th><Th>Months</Th><Th>Reason</Th><Th>Status</Th><Th>Actions</Th>
          </tr></thead>
          <tbody>
            {advances.map(a => (
              <tr key={a.advance_id} className="border-b border-border last:border-0">
                <Td>{users.find(u => u.user_id === a.user_id)?.full_name || a.user_id}</Td>
                <Td right>{fmt(a.amount)}</Td>
                <Td right>{fmt(a.monthly_deduction)}</Td>
                <Td right>{fmt(a.outstanding_balance)}</Td>
                <Td right>{a.repayment_months}</Td>
                <Td><span className="text-content-secondary text-xs">{a.reason || '—'}</span></Td>
                <Td><Badge status={a.status} /></Td>
                <Td>
                  {a.status === 'pending' && (
                    <div className="flex gap-1">
                      <Btn small variant="primary" disabled={acting === a.advance_id} onClick={() => act(a.advance_id, 'approve')}>Approve</Btn>
                      <Btn small variant="danger" disabled={acting === a.advance_id} onClick={() => act(a.advance_id, 'reject')}>Reject</Btn>
                    </div>
                  )}
                </Td>
              </tr>
            ))}
            {advances.length === 0 && <tr><td colSpan={8} className="text-center py-6 text-content-secondary text-sm">No salary advances</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  )
}

// ══════════════════════════════════════════════════════════
// Payroll Run tab
// ══════════════════════════════════════════════════════════
function PayrollRunTab({ runs, users, onRefresh, userRole }: {
  runs: PayrollRun[]; users: any[]; onRefresh: () => void; userRole: string
}) {
  const now = new Date()
  const [selMonth, setSelMonth] = useState(now.getMonth() + 1)
  const [selYear, setSelYear] = useState(now.getFullYear())
  const [runDetail, setRunDetail] = useState<PayrollRunDetail | null>(null)
  const [viewRunId, setViewRunId] = useState<string | null>(null)
  const [overrideSlip, setOverrideSlip] = useState<Payslip | null>(null)
  const [overrideForm, setOverrideForm] = useState<any>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const loadRun = useCallback(async (id: string) => {
    const res = await authFetch(`${PAYROLL.run(id)}`)
    if (res.ok) setRunDetail(await res.json())
  }, [])

  useEffect(() => {
    if (viewRunId) loadRun(viewRunId)
  }, [viewRunId, loadRun])

  const createRun = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await authFetch(`${PAYROLL.runs()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period_month: selMonth, period_year: selYear }),
      })
      if (!res.ok) throw new Error((await res.json()).detail || 'Failed')
      const run: PayrollRunDetail = await res.json()
      setRunDetail(run)
      setViewRunId(run.run_id)
      onRefresh()
    } catch (e: any) { setError(e.message) }
    setLoading(false)
  }

  const approveRun = async (id: string) => {
    await authFetch(`${PAYROLL.runApprove(id)}`, { method: 'PUT' })
    await loadRun(id)
    onRefresh()
  }

  const openOverride = (slip: Payslip) => {
    setOverrideSlip(slip)
    setOverrideForm({
      napsa_override: slip.napsa_employee_override != null ? String(slip.napsa_employee_override) : '',
      nhima_override: slip.nhima_employee_override != null ? String(slip.nhima_employee_override) : '',
      paye_override: slip.paye_override != null ? String(slip.paye_override) : '',
      custom: slip.custom_deductions.map(d => ({...d})),
      notes: slip.notes || '',
    })
  }

  const saveOverride = async () => {
    if (!overrideSlip) return
    const body: any = {
      napsa_employee_override: overrideForm.napsa_override !== '' ? parseFloat(overrideForm.napsa_override) : null,
      nhima_employee_override: overrideForm.nhima_override !== '' ? parseFloat(overrideForm.nhima_override) : null,
      paye_override: overrideForm.paye_override !== '' ? parseFloat(overrideForm.paye_override) : null,
      custom_deductions: overrideForm.custom,
      notes: overrideForm.notes || null,
    }
    await authFetch(`${PAYROLL.payslipOverrides(overrideSlip.payslip_id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setOverrideSlip(null)
    if (viewRunId) await loadRun(viewRunId)
  }

  const existingRun = runs.find(r => r.period_month === selMonth && r.period_year === selYear)

  return (
    <div className="space-y-4">
      {/* Override modal */}
      {overrideSlip && (
        <div className="fixed inset-0 bg-black/40 z-40 overflow-y-auto py-4 px-4">
          <div className="bg-surface-card border border-border rounded-lg w-full max-w-lg mx-auto p-5">
            <h3 className="font-semibold mb-4">Override Deductions — {users.find(u => u.user_id === overrideSlip.user_id)?.full_name}</h3>
            <p className="text-xs text-content-secondary mb-3">Leave blank to use calculated value. Set to a number to override.</p>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Input label={`NAPSA Employee (calc: ${fmt(overrideSlip.napsa_employee_calc)})`}
                  value={overrideForm.napsa_override} onChange={v => setOverrideForm((f: any) => ({...f,napsa_override:v}))} type="number" step="0.01" />
                <Input label={`NHIMA Employee (calc: ${fmt(overrideSlip.nhima_employee_calc)})`}
                  value={overrideForm.nhima_override} onChange={v => setOverrideForm((f: any) => ({...f,nhima_override:v}))} type="number" step="0.01" />
              </div>
              <Input label={`PAYE (calc: ${fmt(overrideSlip.paye_calc)})`}
                value={overrideForm.paye_override} onChange={v => setOverrideForm((f: any) => ({...f,paye_override:v}))} type="number" step="0.01" />
              <div>
                <p className="text-xs text-content-secondary mb-1">Additional deductions</p>
                {overrideForm.custom.map((d: CustomDeduction, i: number) => (
                  <div key={i} className="flex gap-2 mb-1">
                    <input className="flex-1 px-2 py-1 text-sm border border-border rounded"
                      placeholder="Label" value={d.label}
                      onChange={e => setOverrideForm((f: any) => { const c = [...f.custom]; c[i] = {...c[i], label: e.target.value}; return {...f, custom: c} })} />
                    <input className="w-28 px-2 py-1 text-sm border border-border rounded"
                      type="number" placeholder="Amount" value={d.amount}
                      onChange={e => setOverrideForm((f: any) => { const c = [...f.custom]; c[i] = {...c[i], amount: parseFloat(e.target.value)||0}; return {...f, custom: c} })} />
                    <Btn small variant="danger" onClick={() => setOverrideForm((f: any) => ({...f, custom: f.custom.filter((_: any, j: number) => j !== i)}))}>X</Btn>
                  </div>
                ))}
                <Btn small onClick={() => setOverrideForm((f: any) => ({...f, custom: [...f.custom, {label:'',amount:0}]}))}>+ Add deduction</Btn>
              </div>
              <Input label="Notes" value={overrideForm.notes} onChange={v => setOverrideForm((f: any) => ({...f,notes:v}))} />
            </div>
            <div className="flex gap-2 mt-4">
              <Btn variant="primary" onClick={saveOverride}>Save</Btn>
              <Btn onClick={() => setOverrideSlip(null)}>Cancel</Btn>
            </div>
          </div>
        </div>
      )}

      {/* Run selector */}
      <Card title="Create / Select Payroll Run">
        {error && <p className="text-red-600 text-sm mb-2">{error}</p>}
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <p className="text-xs text-content-secondary mb-1">Month</p>
            <select className="px-2 py-1.5 text-sm border border-border rounded bg-surface-input"
              value={selMonth} onChange={e => setSelMonth(parseInt(e.target.value))}>
              {MONTH_NAMES.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
            </select>
          </div>
          <div>
            <p className="text-xs text-content-secondary mb-1">Year</p>
            <select className="px-2 py-1.5 text-sm border border-border rounded bg-surface-input"
              value={selYear} onChange={e => setSelYear(parseInt(e.target.value))}>
              {[2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          {existingRun ? (
            <Btn variant="primary" onClick={() => setViewRunId(existingRun.run_id)}>View Run</Btn>
          ) : (
            <Btn variant="primary" disabled={loading} onClick={createRun}>
              {loading ? 'Calculating...' : `Run Payroll — ${MONTH_NAMES[selMonth-1]} ${selYear}`}
            </Btn>
          )}
        </div>
      </Card>

      {/* Run detail */}
      {runDetail && (
        <Card title={`${periodLabel(runDetail.period_month, runDetail.period_year)} — ${runDetail.status.toUpperCase()}`}
          action={
            <div className="flex items-center gap-2">
              <Btn small onClick={() => window.open(`/payroll-print?run_id=${runDetail.run_id}`, '_blank')}>Print Payslips</Btn>
              {runDetail.status === 'draft' && userRole === 'owner' && (
                <Btn variant="primary" onClick={() => approveRun(runDetail.run_id)}>Approve Run</Btn>
              )}
            </div>
          }
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 text-sm">
            {[
              ['Gross', fmt(runDetail.total_gross)],
              ['PAYE', fmt(runDetail.total_paye)],
              ['NAPSA (emp)', fmt(runDetail.total_napsa_employee)],
              ['NHIMA (emp)', fmt(runDetail.total_nhima_employee)],
              ['Advances', fmt(runDetail.total_advances)],
              ['Net Pay', fmt(runDetail.total_net)],
              ['Employer Cost', fmt(runDetail.total_employer_cost)],
            ].map(([k,v]) => (
              <div key={k as string}><p className="text-xs text-content-secondary">{k}</p><p className="font-semibold">{v}</p></div>
            ))}
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <Th>Employee</Th><Th>Gross</Th><Th>NAPSA</Th><Th>NHIMA</Th><Th>PAYE</Th><Th>Advances</Th><Th>Other</Th><Th>Net Pay</Th>
                {runDetail.status === 'draft' && <Th>Override</Th>}
              </tr>
            </thead>
            <tbody>
              {runDetail.payslips.map(s => {
                const napsaEff = effective(s, 'napsa')
                const nhimaEff = effective(s, 'nhima')
                const payeEff  = effective(s, 'paye')
                const customTotal = s.custom_deductions.reduce((a, d) => a + d.amount, 0)
                const hasOverride = s.napsa_employee_override != null || s.nhima_employee_override != null || s.paye_override != null || s.custom_deductions.length > 0
                return (
                  <tr key={s.payslip_id} className={`border-b border-border last:border-0 ${hasOverride ? 'bg-yellow-50' : ''}`}>
                    <Td>{users.find(u => u.user_id === s.user_id)?.full_name || s.user_id}</Td>
                    <Td right>{fmt(s.gross_salary)}</Td>
                    <Td right>
                      {fmt(napsaEff)}
                      {s.napsa_employee_override != null && <span className="ml-1 text-[10px] text-orange-600" title={`Calc: ${fmt(s.napsa_employee_calc)}`}>*</span>}
                    </Td>
                    <Td right>
                      {fmt(nhimaEff)}
                      {s.nhima_employee_override != null && <span className="ml-1 text-[10px] text-orange-600">*</span>}
                    </Td>
                    <Td right>
                      {fmt(payeEff)}
                      {s.paye_override != null && <span className="ml-1 text-[10px] text-orange-600">*</span>}
                    </Td>
                    <Td right>{s.advances_deducted > 0 ? fmt(s.advances_deducted) : '—'}</Td>
                    <Td right>{customTotal > 0 ? fmt(customTotal) : '—'}</Td>
                    <Td right><span className="font-semibold">{fmt(s.net_pay)}</span></Td>
                    {runDetail.status === 'draft' && (
                      <Td><Btn small onClick={() => openOverride(s)}>Override</Btn></Td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
          {runDetail.payslips.some(s => s.napsa_employee_override != null || s.nhima_employee_override != null || s.paye_override != null) && (
            <p className="text-xs text-orange-600 mt-2">* Overridden value — hover to see calculated amount</p>
          )}
        </Card>
      )}

      {/* Run list */}
      <Card title="All Runs">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border"><Th>Period</Th><Th>Status</Th><Th>Gross</Th><Th>Net</Th><Th>Employer Cost</Th><Th>Action</Th></tr></thead>
          <tbody>
            {runs.map(r => (
              <tr key={r.run_id} className="border-b border-border last:border-0">
                <Td>{periodLabel(r.period_month, r.period_year)}</Td>
                <Td><Badge status={r.status} />{r.is_historical && <span className="ml-1 text-xs text-content-secondary">(hist)</span>}</Td>
                <Td right>{fmt(r.total_gross)}</Td>
                <Td right>{fmt(r.total_net)}</Td>
                <Td right>{fmt(r.total_employer_cost)}</Td>
                <Td><Btn small onClick={() => setViewRunId(r.run_id)}>View</Btn></Td>
              </tr>
            ))}
            {runs.length === 0 && <tr><td colSpan={6} className="text-center py-6 text-content-secondary text-sm">No runs yet</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  )
}

// ══════════════════════════════════════════════════════════
// Payments tab
// ══════════════════════════════════════════════════════════
function PaymentsTab({ runs, users, onRefresh, userRole }: {
  runs: PayrollRun[]; users: any[]; onRefresh: () => void; userRole: string
}) {
  const [selRunId, setSelRunId] = useState<string | null>(null)
  const selRun = runs.find(r => r.run_id === selRunId)

  const download = async () => {
    if (!selRunId) return
    const res = await authFetch(`${PAYROLL.runPaymentFile(selRunId)}`)
    if (!res.ok) { alert((await res.json()).detail); return }
    const blob = await res.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `payroll_${selRunId.slice(0,8)}.csv`
    a.click()
  }

  const markPaid = async () => {
    if (!selRunId) return
    await authFetch(`${PAYROLL.runMarkPaid(selRunId)}`, { method: 'PUT' })
    onRefresh()
  }

  const approvedRuns = runs.filter(r => r.status === 'approved' || r.status === 'paid')

  return (
    <div className="space-y-4">
      <Card title="Payment Processing">
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <p className="text-xs text-content-secondary mb-1">Select run</p>
            <select className="px-2 py-1.5 text-sm border border-border rounded bg-surface-input"
              value={selRunId || ''} onChange={e => setSelRunId(e.target.value || null)}>
              <option value="">— Select a run —</option>
              {approvedRuns.map(r => (
                <option key={r.run_id} value={r.run_id}>
                  {periodLabel(r.period_month, r.period_year)} — {r.status} — Net: {fmt(r.total_net)}
                </option>
              ))}
            </select>
          </div>
          {selRun && (
            <>
              <Btn onClick={download}>Download Bank CSV</Btn>
              {selRun.status === 'approved' && userRole === 'owner' && (
                <Btn variant="primary" onClick={markPaid}>Mark as Paid</Btn>
              )}
            </>
          )}
        </div>
        {selRun && (
          <div className="mt-4 text-sm text-content-secondary">
            <p>Total to pay: <span className="font-semibold text-content-primary">{fmt(selRun.total_net)}</span></p>
            <p className="mt-1 text-xs">Download the CSV and upload it to your bank internet banking portal for bulk payment. Once payment is confirmed, click Mark as Paid.</p>
          </div>
        )}
      </Card>
      <Card title="Run Summary">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border"><Th>Period</Th><Th>Status</Th><Th>Net Pay</Th><Th>Approved</Th></tr></thead>
          <tbody>
            {approvedRuns.map(r => (
              <tr key={r.run_id} className="border-b border-border last:border-0">
                <Td>{periodLabel(r.period_month, r.period_year)}</Td>
                <Td><Badge status={r.status} /></Td>
                <Td right>{fmt(r.total_net)}</Td>
                <Td>{r.approved_at ? new Date(r.approved_at).toLocaleDateString('en-GB') : '—'}</Td>
              </tr>
            ))}
            {approvedRuns.length === 0 && <tr><td colSpan={4} className="text-center py-6 text-content-secondary text-sm">No approved runs</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  )
}

// ══════════════════════════════════════════════════════════
// Statutory & History tab
// ══════════════════════════════════════════════════════════
function StatutoryTab({ runs, rates, leaveTypes, wcfCategories, holidays, onRefresh, userRole }: {
  runs: PayrollRun[]; rates: StatutoryRates | null; leaveTypes: LeaveType[]
  wcfCategories: WcfCategory[]; holidays: PublicHoliday[]; onRefresh: () => void; userRole: string
}) {
  const [subTab, setSubTab] = useState<'reports' | 'rates' | 'leavetypes' | 'wcf' | 'holidays' | 'import'>('reports')
  const [selRunId, setSelRunId] = useState<string | null>(null)
  const [statutory, setStatutory] = useState<any>(null)
  const [ytd, setYtd] = useState<any>(null)
  const [selYear, setSelYear] = useState(new Date().getFullYear())
  const [holidayForm, setHolidayForm] = useState({ holiday_name: '', holiday_date: '', is_recurring: false, notes: '' })
  const [importJson, setImportJson] = useState('')
  const [importMonth, setImportMonth] = useState(1)
  const [importYear, setImportYear] = useState(new Date().getFullYear())

  const loadStatutory = async (id: string) => {
    const res = await authFetch(`${PAYROLL.runStatutory(id)}`)
    if (res.ok) setStatutory(await res.json())
  }
  const loadYtd = async () => {
    const res = await authFetch(`${PAYROLL.statutoryYtd()}?year=${selYear}`)
    if (res.ok) setYtd(await res.json())
  }
  useEffect(() => { if (selRunId) loadStatutory(selRunId) }, [selRunId])
  useEffect(() => { loadYtd() }, [selYear])

  const deleteHoliday = async (id: string) => {
    await authFetch(`${PAYROLL.holiday(id)}`, { method: 'DELETE' })
    onRefresh()
  }
  const addHoliday = async () => {
    await authFetch(`${PAYROLL.holidays()}`, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(holidayForm),
    })
    setHolidayForm({ holiday_name: '', holiday_date: '', is_recurring: false, notes: '' })
    onRefresh()
  }
  const importHistory = async () => {
    try {
      const rows = JSON.parse(importJson)
      const res = await authFetch(`${PAYROLL.historyImport()}`, {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ period_month: importMonth, period_year: importYear, payslips: rows }),
      })
      if (!res.ok) throw new Error((await res.json()).detail)
      setImportJson('')
      onRefresh()
      alert('Historical data imported.')
    } catch (e: any) { alert(e.message) }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {(['reports','rates','leavetypes','wcf','holidays','import'] as const).map(t => (
          <Btn key={t} variant={subTab === t ? 'primary' : 'secondary'} small onClick={() => setSubTab(t)}>
            {t === 'leavetypes' ? 'Leave Types' : t === 'wcf' ? 'WCF' : t === 'import' ? 'History Import' : t.charAt(0).toUpperCase() + t.slice(1)}
          </Btn>
        ))}
      </div>

      {subTab === 'reports' && (
        <div className="space-y-4">
          <div className="flex gap-3 items-end flex-wrap">
            <div>
              <p className="text-xs text-content-secondary mb-1">Monthly report — select run</p>
              <select className="px-2 py-1.5 text-sm border border-border rounded bg-surface-input"
                value={selRunId || ''} onChange={e => setSelRunId(e.target.value || null)}>
                <option value="">— Select run —</option>
                {runs.filter(r => r.status !== 'draft').map(r => (
                  <option key={r.run_id} value={r.run_id}>{periodLabel(r.period_month, r.period_year)}</option>
                ))}
              </select>
            </div>
            <div>
              <p className="text-xs text-content-secondary mb-1">YTD year</p>
              <select className="px-2 py-1.5 text-sm border border-border rounded bg-surface-input"
                value={selYear} onChange={e => setSelYear(parseInt(e.target.value))}>
                {[2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>

          {ytd && (
            <Card title={`Year-to-Date Summary — ${selYear}`}>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                {[
                  ['PAYE', fmt(ytd.ytd_paye)],
                  ['NAPSA (employee)', fmt(ytd.ytd_napsa_employee)],
                  ['NAPSA (employer)', fmt(ytd.ytd_napsa_employer)],
                  ['NHIMA (employee)', fmt(ytd.ytd_nhima_employee)],
                  ['NHIMA (employer)', fmt(ytd.ytd_nhima_employer)],
                  ['WCF (employer)', fmt(ytd.ytd_wcf_employer)],
                  ['Net Payroll', fmt(ytd.ytd_net)],
                  ['Employer Cost', fmt(ytd.ytd_employer_cost)],
                ].map(([k,v]) => (
                  <div key={k as string}><p className="text-xs text-content-secondary">{k}</p><p className="font-semibold">{v}</p></div>
                ))}
              </div>
            </Card>
          )}

          {statutory && (
            <>
              {[
                { title: 'PAYE Return', data: statutory.paye, cols: ['Name','TPIN','Gross','Taxable','PAYE'],
                  row: (l: any) => [l.name, l.tpin||'—', fmt(l.gross), fmt(l.taxable), fmt(l.paye)],
                  footer: `Total PAYE: ${fmt(statutory.paye.total)}` },
                { title: 'NAPSA Schedule', data: statutory.napsa, cols: ['Name','NAPSA No.','Gross','Employee','Employer','Total'],
                  row: (l: any) => [l.name, l.napsa_number||'—', fmt(l.gross), fmt(l.employee), fmt(l.employer), fmt(l.total)],
                  footer: `Employee: ${fmt(statutory.napsa.total_employee)} | Employer: ${fmt(statutory.napsa.total_employer)} | Total: ${fmt(statutory.napsa.total)}` },
                { title: 'NHIMA Schedule', data: statutory.nhima, cols: ['Name','NHIMA No.','Gross','Employee','Employer','Total'],
                  row: (l: any) => [l.name, l.nhima_number||'—', fmt(l.gross), fmt(l.employee), fmt(l.employer), fmt(l.total)],
                  footer: `Employee: ${fmt(statutory.nhima.total_employee)} | Employer: ${fmt(statutory.nhima.total_employer)} | Total: ${fmt(statutory.nhima.total)}` },
              ].map(({ title, data, cols, row, footer }) => (
                <Card key={title} title={title}>
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-border">{cols.map(c => <Th key={c}>{c}</Th>)}</tr></thead>
                    <tbody>
                      {data.lines.map((l: any, i: number) => (
                        <tr key={i} className="border-b border-border last:border-0">
                          {row(l).map((v: string, j: number) => <Td key={j} right={j>1}>{v}</Td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="text-xs text-content-secondary mt-2 font-semibold">{footer}</p>
                </Card>
              ))}
            </>
          )}
        </div>
      )}

      {subTab === 'rates' && rates && (
        <Card title="Active Statutory Rates">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm mb-4">
            {[
              ['NAPSA Employee Rate', `${(rates.napsa_employee_rate*100).toFixed(1)}%`],
              ['NAPSA Employer Rate', `${(rates.napsa_employer_rate*100).toFixed(1)}%`],
              ['NAPSA Monthly Ceiling', fmt(rates.napsa_monthly_ceiling)],
              ['NHIMA Employee Rate', `${(rates.nhima_employee_rate*100).toFixed(1)}%`],
              ['NHIMA Employer Rate', `${(rates.nhima_employer_rate*100).toFixed(1)}%`],
              ['OT Weekday Multiplier', `${rates.overtime_weekday_multiplier}x`],
              ['OT Weekend/Holiday Multiplier', `${rates.overtime_weekend_multiplier}x`],
              ['Standard Hours / Week', String(rates.standard_hours_per_week)],
              ['Effective From', rates.effective_from],
            ].map(([k,v]) => (
              <div key={k as string}><p className="text-xs text-content-secondary">{k}</p><p className="font-semibold">{v}</p></div>
            ))}
          </div>
          <p className="text-xs font-semibold text-content-secondary uppercase mb-2">PAYE Bands</p>
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border"><Th>Min (ZMW)</Th><Th>Max (ZMW)</Th><Th>Rate</Th></tr></thead>
            <tbody>
              {rates.paye_bands.map((b, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  <Td right>{fmt(b.min)}</Td>
                  <Td right>{b.max != null ? fmt(b.max) : 'No limit'}</Td>
                  <Td right>{b.label}</Td>
                </tr>
              ))}
            </tbody>
          </table>
          {userRole === 'owner' && (
            <p className="text-xs text-content-secondary mt-3">To update rates, post new statutory rates via the API with a future effective_from date. Historical payslips will retain the rates used at the time of their run.</p>
          )}
        </Card>
      )}

      {subTab === 'leavetypes' && (
        <Card title="Leave Types">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border"><Th>Type</Th><Th>Days / Year</Th><Th>Full Pay Days</Th><Th>Half Pay Days</Th><Th>Docs Required</Th><Th>System</Th></tr></thead>
            <tbody>
              {leaveTypes.map(t => (
                <tr key={t.type_id} className="border-b border-border last:border-0">
                  <Td>{t.type_name}</Td>
                  <Td right>{t.days_per_year ?? '—'}</Td>
                  <Td right>{t.full_pay_days ?? '—'}</Td>
                  <Td right>{t.half_pay_days ?? '—'}</Td>
                  <Td>{t.requires_documentation ? 'Yes' : 'No'}</Td>
                  <Td>{t.is_system ? 'Yes' : 'No'}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {subTab === 'wcf' && (
        <Card title="WCF Categories">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border"><Th>Category</Th><Th>Rate</Th><Th>Description</Th><Th>Effective From</Th><Th>Active</Th></tr></thead>
            <tbody>
              {wcfCategories.map(c => (
                <tr key={c.category_id} className="border-b border-border last:border-0">
                  <Td>{c.category_name}</Td>
                  <Td right>{(c.rate_percent * 100).toFixed(2)}%</Td>
                  <Td><span className="text-content-secondary text-xs">{c.description || '—'}</span></Td>
                  <Td>{c.effective_from}</Td>
                  <Td>{c.is_active ? 'Yes' : 'No'}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {subTab === 'holidays' && (
        <div className="space-y-4">
          {userRole === 'owner' && (
            <Card title="Add Public Holiday">
              <div className="grid grid-cols-2 gap-3 mb-3">
                <Input label="Holiday Name" value={holidayForm.holiday_name} onChange={v => setHolidayForm(f => ({...f,holiday_name:v}))} />
                <Input label="Date" value={holidayForm.holiday_date} onChange={v => setHolidayForm(f => ({...f,holiday_date:v}))} type="date" />
                <Input label="Notes (optional)" value={holidayForm.notes} onChange={v => setHolidayForm(f => ({...f,notes:v}))} />
                <label className="flex items-center gap-2 text-sm text-content-primary mt-4">
                  <input type="checkbox" checked={holidayForm.is_recurring} onChange={e => setHolidayForm(f => ({...f,is_recurring:e.target.checked}))} />
                  Recurring (same date every year)
                </label>
              </div>
              <Btn variant="primary" onClick={addHoliday}>Add Holiday</Btn>
            </Card>
          )}
          <Card title={`Public Holidays — ${new Date().getFullYear()}`}>
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border"><Th>Date</Th><Th>Day</Th><Th>Name</Th><Th>Recurring</Th><Th>Notes</Th>{userRole === 'owner' && <Th>Remove</Th>}</tr></thead>
              <tbody>
                {holidays.map(h => {
                  const d = new Date(h.holiday_date)
                  const dow = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][d.getDay()]
                  return (
                    <tr key={h.holiday_id} className="border-b border-border last:border-0">
                      <Td>{h.holiday_date}</Td>
                      <Td>{dow}</Td>
                      <Td>{h.holiday_name}</Td>
                      <Td>{h.is_recurring ? 'Yes' : 'No'}</Td>
                      <Td><span className="text-content-secondary text-xs">{h.notes || '—'}</span></Td>
                      {userRole === 'owner' && <Td><Btn small variant="danger" onClick={() => deleteHoliday(h.holiday_id)}>Remove</Btn></Td>}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      {subTab === 'import' && (
        <Card title="Historical Payroll Import">
          <p className="text-sm text-content-secondary mb-3">
            Import payroll history from before go-live. Runs are created with status "paid" and marked as historical.
            Paste a JSON array where each object has: user_id, basic_salary, housing_allowance, transport_allowance, gross_salary, paye, napsa_employee, nhima_employee, net_pay.
          </p>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <p className="text-xs text-content-secondary mb-1">Month</p>
              <select className="w-full px-2 py-1.5 text-sm border border-border rounded bg-surface-input"
                value={importMonth} onChange={e => setImportMonth(parseInt(e.target.value))}>
                {MONTH_NAMES.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
              </select>
            </div>
            <div>
              <p className="text-xs text-content-secondary mb-1">Year</p>
              <select className="w-full px-2 py-1.5 text-sm border border-border rounded bg-surface-input"
                value={importYear} onChange={e => setImportYear(parseInt(e.target.value))}>
                {[2023,2024,2025,2026].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>
          <textarea
            className="w-full h-40 px-2 py-2 text-xs font-mono border border-border rounded bg-surface-input text-content-primary mb-3"
            placeholder='[{"user_id":"...","gross_salary":5000,"paye":40,"napsa_employee":250,"nhima_employee":50,"net_pay":4660,...}]'
            value={importJson}
            onChange={e => setImportJson(e.target.value)}
          />
          <Btn variant="primary" onClick={importHistory} disabled={!importJson.trim()}>Import</Btn>
        </Card>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════
// Main page
// ══════════════════════════════════════════════════════════
export default function PayrollPage() {
  const [tab, setTab] = useState<Tab>('Overview')
  const [user, setUser] = useState<any>(null)
  const [users, setUsers] = useState<any[]>([])
  const [profiles, setProfiles] = useState<EmployeeProfile[]>([])
  const [runs, setRuns] = useState<PayrollRun[]>([])
  const [rates, setRates] = useState<StatutoryRates | null>(null)
  const [wcfCategories, setWcfCategories] = useState<WcfCategory[]>([])
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([])
  const [holidays, setHolidays] = useState<PublicHoliday[]>([])
  const [pendingLeave, setPendingLeave] = useState(0)
  const [pendingAdvances, setPendingAdvances] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const u = localStorage.getItem('user')
    if (u) setUser(JSON.parse(u))
  }, [])

  const loadAll = useCallback(async () => {
    setLoading(true)
    const [profRes, runRes, rateRes, wcfRes, ltRes, holRes, usersRes, leaveRes, advRes] = await Promise.all([
      authFetch(`${PAYROLL.employees()}`),
      authFetch(`${PAYROLL.runs()}`),
      authFetch(`${PAYROLL.ratesActive()}`),
      authFetch(`${PAYROLL.wcfCategories()}`),
      authFetch(`${PAYROLL.leaveTypes()}`),
      authFetch(`${PAYROLL.holidays()}?year=${new Date().getFullYear()}`),
      authFetch(`/api/v1/auth/users`),
      authFetch(`${PAYROLL.leaveRequests()}?status=pending`),
      authFetch(`${PAYROLL.advances()}`),
    ])
    if (profRes.ok) setProfiles(await profRes.json())
    if (runRes.ok) setRuns(await runRes.json())
    if (rateRes.ok) setRates(await rateRes.json())
    if (wcfRes.ok) setWcfCategories(await wcfRes.json())
    if (ltRes.ok) setLeaveTypes(await ltRes.json())
    if (holRes.ok) setHolidays(await holRes.json())
    if (usersRes.ok) { const d = await usersRes.json(); setUsers(Array.isArray(d) ? d : d.users || []) }
    if (leaveRes.ok) { const d = await leaveRes.json(); setPendingLeave(d.length) }
    if (advRes.ok) { const d = await advRes.json(); setPendingAdvances(d.filter((a: any) => a.status === 'pending').length) }
    setLoading(false)
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  if (loading) return <div className="p-8 text-center text-content-secondary">Loading payroll...</div>

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-content-primary">Payroll</h1>
      </div>

        {/* Tab bar */}
        <div className="flex gap-1 mb-5 border-b border-border overflow-x-auto">
          {TABS.map(t => (
            <button key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px
                ${tab === t
                  ? 'border-brand text-brand'
                  : 'border-transparent text-content-secondary hover:text-content-primary'}`}
            >
              {t}
              {t === 'Leave' && pendingLeave > 0 && <span className="ml-1 bg-red-500 text-white text-[10px] rounded-full px-1">{pendingLeave}</span>}
              {t === 'Advances' && pendingAdvances > 0 && <span className="ml-1 bg-red-500 text-white text-[10px] rounded-full px-1">{pendingAdvances}</span>}
            </button>
          ))}
        </div>

        {tab === 'Overview' && (
          <OverviewTab runs={runs} pendingLeave={pendingLeave} pendingAdvances={pendingAdvances} onTabChange={setTab} />
        )}
        {tab === 'Staff Setup' && (
          <StaffSetupTab profiles={profiles} users={users} wcfCategories={wcfCategories} onSave={loadAll} />
        )}
        {tab === 'Attendance' && (
          <AttendanceTab users={users} holidays={holidays} />
        )}
        {tab === 'Leave' && (
          <LeaveTab users={users} leaveTypes={leaveTypes} onRefresh={loadAll} />
        )}
        {tab === 'Advances' && (
          <AdvancesTab users={users} onRefresh={loadAll} />
        )}
        {tab === 'Payroll Run' && (
          <PayrollRunTab runs={runs} users={users} onRefresh={loadAll} userRole={user?.role || ''} />
        )}
        {tab === 'Payments' && (
          <PaymentsTab runs={runs} users={users} onRefresh={loadAll} userRole={user?.role || ''} />
        )}
        {tab === 'Statutory & History' && (
          <StatutoryTab runs={runs} rates={rates} leaveTypes={leaveTypes} wcfCategories={wcfCategories}
            holidays={holidays} onRefresh={loadAll} userRole={user?.role || ''} />
        )}
    </div>
  )
}
