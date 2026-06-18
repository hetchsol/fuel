/**
 * Payroll API path constants — canonical contract.
 * Every payroll fetch in the frontend MUST use these constants.
 * To add a new endpoint, add it here first.
 * Base: /api/v1/payroll
 */
export const PAYROLL = {
  // Employee profiles
  employees:          ()          => `/api/v1/payroll/employees`,
  employee:           (uid: string) => `/api/v1/payroll/employees/${uid}`,

  // Statutory rates
  rates:              ()          => `/api/v1/payroll/rates`,
  ratesActive:        ()          => `/api/v1/payroll/rates/active`,

  // WCF categories
  wcfCategories:      ()          => `/api/v1/payroll/wcf-categories`,
  wcfCategory:        (id: string) => `/api/v1/payroll/wcf-categories/${id}`,

  // Leave types
  leaveTypes:         ()          => `/api/v1/payroll/leave-types`,
  leaveType:          (id: string) => `/api/v1/payroll/leave-types/${id}`,

  // Leave balances
  leaveBalances:      ()          => `/api/v1/payroll/leave-balances`,
  leaveBalance:       (uid: string) => `/api/v1/payroll/leave-balances/${uid}`,

  // Leave requests
  leaveRequests:      ()          => `/api/v1/payroll/leave-requests`,
  leaveApprove:       (id: string) => `/api/v1/payroll/leave-requests/${id}/approve`,
  leaveReject:        (id: string) => `/api/v1/payroll/leave-requests/${id}/reject`,
  leaveCancel:        (id: string) => `/api/v1/payroll/leave-requests/${id}/cancel`,

  // Attendance
  attendance:         ()          => `/api/v1/payroll/attendance`,
  attendanceDay:      (uid: string, date: string) => `/api/v1/payroll/attendance/${uid}/${date}`,
  attendanceBulk:     ()          => `/api/v1/payroll/attendance/bulk`,

  // Public holidays
  holidays:           ()          => `/api/v1/payroll/public-holidays`,
  holiday:            (id: string) => `/api/v1/payroll/public-holidays/${id}`,

  // Salary advances
  advances:           ()          => `/api/v1/payroll/advances`,
  advance:            (id: string) => `/api/v1/payroll/advances/${id}`,
  advanceApprove:     (id: string) => `/api/v1/payroll/advances/${id}/approve`,
  advanceReject:      (id: string) => `/api/v1/payroll/advances/${id}/reject`,

  // Payroll runs
  runs:               ()          => `/api/v1/payroll/runs`,
  run:                (id: string) => `/api/v1/payroll/runs/${id}`,
  runApprove:         (id: string) => `/api/v1/payroll/runs/${id}/approve`,
  runPayslips:        (id: string) => `/api/v1/payroll/runs/${id}/payslips`,
  runPayments:        (id: string) => `/api/v1/payroll/runs/${id}/payments`,
  runPaymentFile:     (id: string) => `/api/v1/payroll/runs/${id}/payment-file`,
  runMarkPaid:        (id: string) => `/api/v1/payroll/runs/${id}/mark-paid`,
  runStatutory:       (id: string) => `/api/v1/payroll/runs/${id}/statutory`,

  // Payslips
  payslip:            (id: string) => `/api/v1/payroll/payslips/${id}`,
  payslipOverrides:   (id: string) => `/api/v1/payroll/payslips/${id}/overrides`,

  // Statutory YTD
  statutoryYtd:       ()          => `/api/v1/payroll/statutory/ytd`,

  // Historical import
  historyImport:      ()          => `/api/v1/payroll/history/import`,
} as const

// ── Shared types ──────────────────────────────────────────────────────────────

export type EmploymentType     = 'permanent' | 'contract' | 'casual'
export type PayrollRunStatus   = 'draft' | 'approved' | 'paid'
export type AdvanceStatus      = 'pending' | 'approved' | 'rejected' | 'active' | 'settled'
export type LeaveRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'
export type AttendanceStatus   = 'present' | 'absent' | 'on_leave' | 'public_holiday' | 'off_day'
export type OvertimeType       = 'none' | 'weekday' | 'weekend' | 'public_holiday'
export type PaymentMethod      = 'bank' | 'mobile_money' | 'cash'
export type PaymentStatus      = 'pending' | 'submitted' | 'confirmed'
export type MobileMoneyProvider = 'airtel' | 'mtn' | 'zamtel'

export interface PayeBand {
  min: number
  max: number | null
  rate: number
  label: string
}

export interface StatutoryRates {
  rate_id: string
  paye_bands: PayeBand[]
  napsa_employee_rate: number
  napsa_employer_rate: number
  napsa_monthly_ceiling: number
  nhima_employee_rate: number
  nhima_employer_rate: number
  overtime_weekday_multiplier: number
  overtime_weekend_multiplier: number
  standard_hours_per_week: number
  effective_from: string
  created_at?: string
}

export interface WcfCategory {
  category_id: string
  category_name: string
  rate_percent: number
  description?: string
  effective_from: string
  is_active: boolean
}

export interface EmployeeProfile {
  profile_id: string
  user_id: string
  station_id?: string
  basic_salary: number
  housing_allowance: number
  transport_allowance: number
  employment_type: EmploymentType
  contracted_hours_per_week: number
  annual_leave_days: number
  start_date?: string
  nrc_number?: string
  tpin?: string
  napsa_number?: string
  nhima_number?: string
  bank_name?: string
  bank_branch?: string
  bank_account_number?: string
  mobile_money_provider?: MobileMoneyProvider
  mobile_money_number?: string
  preferred_payment_method: PaymentMethod
  wcf_category_id?: string
  is_active: boolean
}

export interface LeaveType {
  type_id: string
  type_name: string
  days_per_year?: number
  full_pay_days?: number
  half_pay_days?: number
  requires_documentation: boolean
  is_system: boolean
}

export interface LeaveBalance {
  balance_id: string
  user_id: string
  leave_type_id: string
  year: number
  days_entitled: number
  days_accrued: number
  days_taken: number
  carry_forward: number
  days_remaining: number
}

export interface LeaveRequest {
  request_id: string
  user_id: string
  leave_type_id: string
  start_date: string
  end_date: string
  days_requested: number
  status: LeaveRequestStatus
  approved_by?: string
  notes?: string
  manager_notes?: string
  created_at?: string
  approved_at?: string
}

export interface AttendanceRecord {
  record_id: string
  user_id: string
  work_date: string
  status: AttendanceStatus
  regular_hours: number
  overtime_hours: number
  overtime_type: OvertimeType
  leave_request_id?: string
  notes?: string
}

export interface PublicHoliday {
  holiday_id: string
  holiday_name: string
  holiday_date: string
  is_recurring: boolean
  recurrence_month?: number
  recurrence_day?: number
  notes?: string
}

export interface SalaryAdvance {
  advance_id: string
  user_id: string
  amount: number
  reason?: string
  approved_by?: string
  date_issued?: string
  repayment_months: number
  monthly_deduction: number
  outstanding_balance: number
  status: AdvanceStatus
  created_at?: string
}

export interface CustomDeduction {
  label: string
  amount: number
}

export interface Payslip {
  payslip_id: string
  run_id: string
  user_id: string
  is_historical: boolean
  basic_salary: number
  housing_allowance: number
  transport_allowance: number
  other_allowances: number
  overtime_pay: number
  overtime_details: any[]
  gross_salary: number
  napsa_employee_calc: number
  nhima_employee_calc: number
  paye_calc: number
  napsa_employee_override?: number | null
  nhima_employee_override?: number | null
  paye_override?: number | null
  custom_deductions: CustomDeduction[]
  advances_deducted: number
  total_deductions: number
  net_pay: number
  napsa_employer: number
  nhima_employer: number
  wcf_employer: number
  total_employer_cost: number
  attendance_days?: number
  leave_days_taken?: number
  notes?: string
}

export interface PayrollRun {
  run_id: string
  station_id: string
  period_month: number
  period_year: number
  status: PayrollRunStatus
  is_historical: boolean
  total_gross: number
  total_basic: number
  total_allowances: number
  total_overtime: number
  total_paye: number
  total_napsa_employee: number
  total_napsa_employer: number
  total_nhima_employee: number
  total_nhima_employer: number
  total_wcf_employer: number
  total_advances: number
  total_net: number
  total_employer_cost: number
  statutory_rate_id?: string
  created_by?: string
  approved_by?: string
  created_at?: string
  approved_at?: string
}

export interface PayrollRunDetail extends PayrollRun {
  payslips: Payslip[]
}

export interface PayrollPayment {
  payment_id: string
  run_id: string
  user_id: string
  payslip_id?: string
  net_amount: number
  payment_method: PaymentMethod
  bank_name?: string
  bank_account_number?: string
  mobile_money_provider?: string
  mobile_money_number?: string
  payment_reference?: string
  status: PaymentStatus
  submitted_at?: string
  confirmed_at?: string
}

export const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
]

export function fmtZMW(amount: number): string {
  return `ZMW ${amount.toLocaleString('en-ZM', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function periodLabel(month: number, year: number): string {
  return `${MONTH_NAMES[month - 1]} ${year}`
}
