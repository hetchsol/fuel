import { useState, useEffect, useMemo } from 'react'
import { authFetch } from '../lib/api'
import { PAYROLL, periodLabel, MONTH_NAMES } from '../lib/payroll'

interface MyPayslip {
  payslip_id: string
  run_id: string
  user_id: string
  period_month: number
  period_year: number
  run_status: string
  is_historical: boolean
  basic_salary: number
  housing_allowance: number
  transport_allowance: number
  other_allowances: number
  overtime_pay: number
  gross_salary: number
  napsa_employee_calc: number
  nhima_employee_calc: number
  paye_calc: number
  napsa_employee_override: number | null
  nhima_employee_override: number | null
  paye_override: number | null
  advances_deducted: number
  custom_deductions: { label: string; amount: number }[]
  total_deductions: number
  net_pay: number
  attendance_days: number | null
  leave_days_taken: number | null
  notes: string | null
}

function fmt(n: number | null | undefined) {
  if (n == null) return 'ZMW 0.00'
  return `ZMW ${n.toLocaleString('en-ZM', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function eff(s: MyPayslip, field: 'napsa' | 'nhima' | 'paye'): number {
  if (field === 'napsa') return s.napsa_employee_override ?? s.napsa_employee_calc
  if (field === 'nhima') return s.nhima_employee_override ?? s.nhima_employee_calc
  return s.paye_override ?? s.paye_calc
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === 'paid'     ? 'bg-green-100 text-green-800' :
    status === 'approved' ? 'bg-blue-100 text-blue-800' :
    'bg-yellow-100 text-yellow-800'
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}

function PayslipCard({ slip, onPrint }: { slip: MyPayslip; onPrint: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const napsa = eff(slip, 'napsa')
  const nhima = eff(slip, 'nhima')
  const paye  = eff(slip, 'paye')
  const customTotal = (slip.custom_deductions || []).reduce((s, d) => s + d.amount, 0)

  return (
    <div className="border border-surface-border rounded-lg bg-surface-card overflow-hidden">
      {/* Summary row — always visible */}
      <button
        className="w-full text-left px-4 py-3 flex items-center gap-4"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex-1">
          <span className="font-semibold text-content-primary text-sm">
            {periodLabel(slip.period_month, slip.period_year)}
          </span>
          {slip.is_historical && (
            <span className="ml-2 text-xs text-content-secondary">(historical)</span>
          )}
        </div>
        <StatusBadge status={slip.run_status} />
        <div className="text-right">
          <p className="text-xs text-content-secondary">Net Pay</p>
          <p className="font-bold text-content-primary text-sm">{fmt(slip.net_pay)}</p>
        </div>
        <span className="text-content-secondary text-xs ml-2">{expanded ? 'Hide' : 'View'}</span>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-surface-border px-4 py-4 space-y-4">
          {/* Earnings */}
          <div>
            <p className="text-xs font-semibold text-content-secondary uppercase tracking-wide mb-2">Earnings</p>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-content-secondary">Basic Salary</span><span className="tabular-nums">{fmt(slip.basic_salary)}</span></div>
              {slip.housing_allowance   > 0 && <div className="flex justify-between"><span className="text-content-secondary">Housing Allowance</span><span className="tabular-nums">{fmt(slip.housing_allowance)}</span></div>}
              {slip.transport_allowance > 0 && <div className="flex justify-between"><span className="text-content-secondary">Transport Allowance</span><span className="tabular-nums">{fmt(slip.transport_allowance)}</span></div>}
              {slip.other_allowances    > 0 && <div className="flex justify-between"><span className="text-content-secondary">Other Allowances</span><span className="tabular-nums">{fmt(slip.other_allowances)}</span></div>}
              {slip.overtime_pay        > 0 && <div className="flex justify-between"><span className="text-content-secondary">Overtime</span><span className="tabular-nums">{fmt(slip.overtime_pay)}</span></div>}
              <div className="flex justify-between border-t border-surface-border pt-1 font-semibold">
                <span>Gross Salary</span><span className="tabular-nums">{fmt(slip.gross_salary)}</span>
              </div>
            </div>
          </div>

          {/* Deductions */}
          <div>
            <p className="text-xs font-semibold text-content-secondary uppercase tracking-wide mb-2">Deductions</p>
            <div className="space-y-1 text-sm">
              {napsa > 0 && <div className="flex justify-between"><span className="text-content-secondary">NAPSA (Employee)</span><span className="tabular-nums">{fmt(napsa)}</span></div>}
              {nhima > 0 && <div className="flex justify-between"><span className="text-content-secondary">NHIMA (Employee)</span><span className="tabular-nums">{fmt(nhima)}</span></div>}
              {paye  > 0 && <div className="flex justify-between"><span className="text-content-secondary">PAYE</span><span className="tabular-nums">{fmt(paye)}</span></div>}
              {slip.advances_deducted > 0 && <div className="flex justify-between"><span className="text-content-secondary">Advance Recovery</span><span className="tabular-nums">{fmt(slip.advances_deducted)}</span></div>}
              {(slip.custom_deductions || []).map((d, i) => (
                <div key={i} className="flex justify-between"><span className="text-content-secondary">{d.label}</span><span className="tabular-nums">{fmt(d.amount)}</span></div>
              ))}
              <div className="flex justify-between border-t border-surface-border pt-1 font-semibold">
                <span>Total Deductions</span><span className="tabular-nums">{fmt(slip.total_deductions)}</span>
              </div>
            </div>
          </div>

          {/* Net Pay */}
          <div className="flex justify-between items-center px-3 py-2 rounded-lg bg-action-primary text-white">
            <span className="font-bold text-sm uppercase tracking-wide">Net Pay</span>
            <span className="font-bold text-base tabular-nums">{fmt(slip.net_pay)}</span>
          </div>

          {/* Attendance + notes */}
          {(slip.attendance_days != null || slip.notes) && (
            <div className="text-sm space-y-1">
              {slip.attendance_days != null && (
                <p className="text-content-secondary">
                  Attendance: <span className="text-content-primary">{slip.attendance_days} day{slip.attendance_days !== 1 ? 's' : ''} present</span>
                  {slip.leave_days_taken ? `, ${slip.leave_days_taken} leave day${slip.leave_days_taken !== 1 ? 's' : ''}` : ''}
                </p>
              )}
              {slip.notes && <p className="text-content-secondary">Note: <span className="text-content-primary">{slip.notes}</span></p>}
            </div>
          )}

          {/* Print button */}
          <div className="flex justify-end pt-1">
            <button
              onClick={onPrint}
              className="px-3 py-1.5 text-sm font-medium rounded-btn bg-action-primary text-white hover:bg-action-primary-hover transition-colors"
            >
              Download / Print Payslip
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function MyPayslipPage() {
  const [payslips, setPayslips] = useState<MyPayslip[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Period filter — "All" (empty string) shows everything, same as before.
  // Options are derived from the payslips actually on record, so the picker
  // never offers a month/year with nothing to show.
  const [filterYear, setFilterYear] = useState('')
  const [filterMonth, setFilterMonth] = useState('')

  useEffect(() => {
    authFetch(PAYROLL.myPayslips())
      .then(r => r.ok ? r.json() : r.json().then((e: any) => Promise.reject(e.detail || 'Failed to load')))
      .then((data: MyPayslip[]) => { setPayslips(data); setLoading(false) })
      .catch((e: any) => { setError(String(e)); setLoading(false) })
  }, [])

  const userData = typeof window !== 'undefined' ? localStorage.getItem('user') : null
  const userId = userData ? JSON.parse(userData).user_id : ''

  const availableYears = useMemo(
    () => Array.from(new Set(payslips.map(s => s.period_year))).sort((a, b) => b - a),
    [payslips]
  )
  const availableMonths = useMemo(
    () => Array.from(new Set(
      payslips
        .filter(s => !filterYear || s.period_year === parseInt(filterYear, 10))
        .map(s => s.period_month)
    )).sort((a, b) => a - b),
    [payslips, filterYear]
  )

  const filteredPayslips = payslips.filter(s =>
    (!filterYear || s.period_year === parseInt(filterYear, 10)) &&
    (!filterMonth || s.period_month === parseInt(filterMonth, 10))
  )

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold text-content-primary mb-1">My Payslips</h1>
      <p className="text-sm text-content-secondary mb-6">Your payslip history for this station.</p>

      {loading && (
        <p className="text-content-secondary text-sm">Loading...</p>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error === 'Payroll requires a database connection'
            ? 'Payroll is not available at this station (database not configured).'
            : error}
        </div>
      )}

      {!loading && !error && payslips.length === 0 && (
        <div className="rounded-lg border border-surface-border bg-surface-card px-4 py-8 text-center text-sm text-content-secondary">
          No payslips on record yet.
        </div>
      )}

      {!loading && !error && payslips.length > 0 && (
        <>
          <div className="flex gap-2 mb-4">
            <div className="flex-1">
              <label className="block text-xs font-medium text-content-secondary mb-1">Year</label>
              <select
                value={filterYear}
                onChange={e => { setFilterYear(e.target.value); setFilterMonth('') }}
                className="w-full px-3 py-2 rounded border border-surface-border bg-surface-bg text-content-primary text-sm focus:outline-none focus:border-action-primary"
              >
                <option value="">All years</option>
                {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-content-secondary mb-1">Month</label>
              <select
                value={filterMonth}
                onChange={e => setFilterMonth(e.target.value)}
                className="w-full px-3 py-2 rounded border border-surface-border bg-surface-bg text-content-primary text-sm focus:outline-none focus:border-action-primary"
              >
                <option value="">All months</option>
                {availableMonths.map(m => <option key={m} value={m}>{MONTH_NAMES[m - 1]}</option>)}
              </select>
            </div>
          </div>

          {filteredPayslips.length === 0 ? (
            <div className="rounded-lg border border-surface-border bg-surface-card px-4 py-8 text-center text-sm text-content-secondary">
              No payslip for that period.
            </div>
          ) : (
            <div className="space-y-3">
              {filteredPayslips.map(slip => (
                <PayslipCard
                  key={slip.payslip_id}
                  slip={slip}
                  onPrint={() => window.open(`/payroll-print?run_id=${slip.run_id}&user_id=${userId}`, '_blank')}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
