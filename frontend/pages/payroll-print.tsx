import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { authFetch } from '../lib/api'
import { PAYROLL, periodLabel } from '../lib/payroll'

interface BusinessInfo {
  business_name: string
  station_location: string
  contact_phone: string
  contact_email: string
}

interface PrintPayslip {
  payslip_id: string
  user_id: string
  full_name: string
  tpin: string | null
  nrc_number: string | null
  napsa_number: string | null
  nhima_number: string | null
  bank_name: string | null
  bank_branch: string | null
  bank_account_number: string | null
  mobile_money_provider: string | null
  mobile_money_number: string | null
  preferred_payment_method: string | null
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
  custom_deductions: { label: string; amount: number }[]
  advances_deducted: number
  total_deductions: number
  net_pay: number
  napsa_employer: number
  nhima_employer: number
  wcf_employer: number
  total_employer_cost: number
  attendance_days: number | null
  leave_days_taken: number | null
  notes: string | null
}

interface PrintData {
  business_info: BusinessInfo
  run: { period_month: number; period_year: number; status: string }
  payslips: PrintPayslip[]
}

function zmw(n: number | null | undefined): string {
  if (n == null) return 'ZMW 0.00'
  return `ZMW ${n.toLocaleString('en-ZM', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function eff(s: PrintPayslip, field: 'napsa' | 'nhima' | 'paye'): number {
  const ov   = field === 'napsa' ? s.napsa_employee_override : field === 'nhima' ? s.nhima_employee_override : s.paye_override
  const calc = field === 'napsa' ? s.napsa_employee_calc    : field === 'nhima' ? s.nhima_employee_calc    : s.paye_calc
  return ov != null ? ov : calc
}

function paymentLine(s: PrintPayslip): string {
  if (s.preferred_payment_method === 'bank') {
    const parts = [s.bank_name, s.bank_branch, s.bank_account_number ? `Acc: ${s.bank_account_number}` : null].filter(Boolean)
    return `Bank — ${parts.join(', ')}`
  }
  if (s.preferred_payment_method === 'mobile_money') {
    const prov = s.mobile_money_provider
      ? s.mobile_money_provider.charAt(0).toUpperCase() + s.mobile_money_provider.slice(1)
      : ''
    return `Mobile Money — ${prov}${s.mobile_money_number ? ` ${s.mobile_money_number}` : ''}`
  }
  return 'Cash'
}

function PayslipSheet({ slip, biz, period, breakAfter }: {
  slip: PrintPayslip
  biz: BusinessInfo
  period: string
  breakAfter: boolean
}) {
  const napsa = eff(slip, 'napsa')
  const nhima = eff(slip, 'nhima')
  const paye  = eff(slip, 'paye')

  const earningsRows: [string, number][] = [
    ['Basic Salary', slip.basic_salary],
    ...(slip.housing_allowance   > 0 ? [['Housing Allowance',   slip.housing_allowance]   as [string, number]] : []),
    ...(slip.transport_allowance > 0 ? [['Transport Allowance', slip.transport_allowance] as [string, number]] : []),
    ...(slip.other_allowances    > 0 ? [['Other Allowances',    slip.other_allowances]    as [string, number]] : []),
    ...(slip.overtime_pay        > 0 ? [['Overtime',            slip.overtime_pay]        as [string, number]] : []),
  ]

  const deductionRows: [string, number][] = [
    ...(napsa > 0 ? [['NAPSA (employee)', napsa] as [string, number]] : []),
    ...(nhima > 0 ? [['NHIMA (employee)', nhima] as [string, number]] : []),
    ...(paye  > 0 ? [['PAYE',            paye]  as [string, number]] : []),
    ...(slip.advances_deducted > 0 ? [['Advance Recovery', slip.advances_deducted] as [string, number]] : []),
    ...(slip.custom_deductions || []).map(d => [d.label, d.amount] as [string, number]),
  ]

  const hasEmployerContribs = slip.napsa_employer > 0 || slip.nhima_employer > 0 || slip.wcf_employer > 0

  return (
    <div style={{
      width: '210mm',
      minHeight: '270mm',
      padding: '14mm 16mm',
      pageBreakAfter: breakAfter ? 'always' : 'auto',
      fontFamily: 'Arial, Helvetica, sans-serif',
      fontSize: '10pt',
      color: '#000',
      boxSizing: 'border-box',
      backgroundColor: '#fff',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #000', paddingBottom: '10px', marginBottom: '12px' }}>
        <div>
          <div style={{ fontSize: '15pt', fontWeight: 'bold', letterSpacing: '0.3px' }}>{biz.business_name || 'Company'}</div>
          {biz.station_location && <div style={{ fontSize: '9pt', color: '#555', marginTop: '2px' }}>{biz.station_location}</div>}
          {biz.contact_phone    && <div style={{ fontSize: '9pt', color: '#555' }}>Tel: {biz.contact_phone}</div>}
          {biz.contact_email    && <div style={{ fontSize: '9pt', color: '#555' }}>{biz.contact_email}</div>}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '16pt', fontWeight: 'bold', letterSpacing: '2px', textTransform: 'uppercase' }}>Payslip</div>
          <div style={{ fontSize: '10pt', color: '#555', marginTop: '3px' }}>Period: {period}</div>
        </div>
      </div>

      {/* Employee details */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: '24px', rowGap: '3px', padding: '8px 10px', border: '1px solid #ccc', marginBottom: '14px', fontSize: '9.5pt' }}>
        <div><span style={{ color: '#666' }}>Employee: </span><strong>{slip.full_name}</strong></div>
        {slip.nrc_number    && <div><span style={{ color: '#666' }}>NRC: </span>{slip.nrc_number}</div>}
        {slip.tpin          && <div><span style={{ color: '#666' }}>TPIN: </span>{slip.tpin}</div>}
        {slip.napsa_number  && <div><span style={{ color: '#666' }}>NAPSA No.: </span>{slip.napsa_number}</div>}
        {slip.nhima_number  && <div><span style={{ color: '#666' }}>NHIMA No.: </span>{slip.nhima_number}</div>}
      </div>

      {/* Earnings + Deductions */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '12px' }}>
        {/* Earnings */}
        <div>
          <div style={{ fontWeight: 'bold', fontSize: '8.5pt', textTransform: 'uppercase', letterSpacing: '0.8px', borderBottom: '1.5px solid #000', paddingBottom: '3px', marginBottom: '6px' }}>Earnings</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9.5pt' }}>
            <tbody>
              {earningsRows.map(([label, val]) => (
                <tr key={label}>
                  <td style={{ paddingBottom: '3px', color: '#333' }}>{label}</td>
                  <td style={{ textAlign: 'right', paddingBottom: '3px', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{zmw(val)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '1px solid #555', fontWeight: 'bold' }}>
                <td style={{ paddingTop: '5px' }}>Gross</td>
                <td style={{ textAlign: 'right', paddingTop: '5px', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{zmw(slip.gross_salary)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Deductions */}
        <div>
          <div style={{ fontWeight: 'bold', fontSize: '8.5pt', textTransform: 'uppercase', letterSpacing: '0.8px', borderBottom: '1.5px solid #000', paddingBottom: '3px', marginBottom: '6px' }}>Deductions</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9.5pt' }}>
            <tbody>
              {deductionRows.length > 0 ? deductionRows.map(([label, val]) => (
                <tr key={label}>
                  <td style={{ paddingBottom: '3px', color: '#333' }}>{label}</td>
                  <td style={{ textAlign: 'right', paddingBottom: '3px', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{zmw(val)}</td>
                </tr>
              )) : (
                <tr><td style={{ color: '#888', fontSize: '9pt' }}>No deductions</td></tr>
              )}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '1px solid #555', fontWeight: 'bold' }}>
                <td style={{ paddingTop: '5px' }}>Total Deductions</td>
                <td style={{ textAlign: 'right', paddingTop: '5px', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{zmw(slip.total_deductions)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Net Pay */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 12px', border: '2px solid #000', marginBottom: '12px' }}>
        <span style={{ fontSize: '11pt', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px' }}>Net Pay</span>
        <span style={{ fontSize: '13pt', fontWeight: 'bold', fontFamily: 'monospace' }}>{zmw(slip.net_pay)}</span>
      </div>

      {/* Employer contributions */}
      {hasEmployerContribs && (
        <div style={{ padding: '7px 10px', border: '1px solid #ddd', marginBottom: '12px', fontSize: '9pt' }}>
          <div style={{ fontWeight: 'bold', fontSize: '8pt', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#555', marginBottom: '5px' }}>
            Employer Contributions — not deducted from employee pay
          </div>
          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
            {slip.napsa_employer > 0 && <span>NAPSA: {zmw(slip.napsa_employer)}</span>}
            {slip.nhima_employer > 0 && <span>NHIMA: {zmw(slip.nhima_employer)}</span>}
            {slip.wcf_employer   > 0 && <span>WCF: {zmw(slip.wcf_employer)}</span>}
            <span style={{ marginLeft: 'auto', fontWeight: 'bold' }}>Total Employer Cost: {zmw(slip.total_employer_cost)}</span>
          </div>
        </div>
      )}

      {/* Payment + Attendance */}
      <div style={{ fontSize: '9.5pt', marginBottom: '20px' }}>
        <div style={{ marginBottom: '3px' }}><span style={{ color: '#666' }}>Payment: </span>{paymentLine(slip)}</div>
        {slip.attendance_days != null && (
          <div style={{ marginBottom: '3px' }}>
            <span style={{ color: '#666' }}>Attendance: </span>
            {slip.attendance_days} day{slip.attendance_days !== 1 ? 's' : ''} present
            {slip.leave_days_taken ? `, ${slip.leave_days_taken} leave day${slip.leave_days_taken !== 1 ? 's' : ''}` : ''}
          </div>
        )}
        {slip.notes && (
          <div><span style={{ color: '#666' }}>Note: </span>{slip.notes}</div>
        )}
      </div>

      {/* Signature lines */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px', marginTop: 'auto' }}>
        <div>
          <div style={{ borderTop: '1px solid #000', paddingTop: '4px', fontSize: '9pt', color: '#555' }}>Employee Signature &amp; Date</div>
        </div>
        <div>
          <div style={{ borderTop: '1px solid #000', paddingTop: '4px', fontSize: '9pt', color: '#555' }}>Authorised Signature &amp; Date</div>
        </div>
      </div>
    </div>
  )
}

export default function PayrollPrint() {
  const router = useRouter()
  const { run_id } = router.query
  const [data, setData] = useState<PrintData | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!run_id || typeof run_id !== 'string') return
    authFetch(PAYROLL.runPrintData(run_id))
      .then(r => r.ok ? r.json() : r.json().then((e: any) => Promise.reject(e.detail || 'Failed to load')))
      .then(setData)
      .catch(e => setError(String(e)))
  }, [run_id])

  const period = data ? periodLabel(data.run.period_month, data.run.period_year) : ''

  return (
    <>
      <Head>
        <title>{data ? `Payslips — ${period}` : 'Loading payslips...'}</title>
        <style dangerouslySetInnerHTML={{ __html: `
          @page { size: A4; margin: 0; }
          @media print { .no-print { display: none !important; } body { background: #fff; } }
          @media screen { body { background: #9ca3af; } }
        `}} />
      </Head>

      {/* Screen-only toolbar */}
      <div className="no-print" style={{
        position: 'sticky', top: 0, zIndex: 10,
        display: 'flex', alignItems: 'center', gap: '12px',
        padding: '10px 20px', background: '#1e293b', color: '#fff',
        fontFamily: 'Arial, sans-serif', fontSize: '13px',
      }}>
        <button
          onClick={() => router.back()}
          style={{ padding: '6px 14px', borderRadius: '4px', border: '1px solid #475569', background: 'transparent', color: '#cbd5e1', cursor: 'pointer', fontSize: '13px' }}>
          Back
        </button>
        {data && (
          <span style={{ color: '#94a3b8' }}>
            {data.payslips.length} payslip{data.payslips.length !== 1 ? 's' : ''} — {period}
          </span>
        )}
        <button
          onClick={() => window.print()}
          disabled={!data}
          style={{ marginLeft: 'auto', padding: '7px 22px', borderRadius: '4px', background: '#3b82f6', color: '#fff', border: 'none', cursor: data ? 'pointer' : 'not-allowed', fontSize: '13px', fontWeight: 'bold', opacity: data ? 1 : 0.5 }}>
          Print All
        </button>
      </div>

      {/* States */}
      {error && (
        <div style={{ padding: '40px', fontFamily: 'Arial', color: '#dc2626', textAlign: 'center' }}>
          <p style={{ fontSize: '14pt', marginBottom: '12px' }}>Failed to load payslips</p>
          <p style={{ fontSize: '10pt', color: '#666' }}>{error}</p>
        </div>
      )}

      {!data && !error && (
        <div style={{ padding: '40px', fontFamily: 'Arial', color: '#6b7280', textAlign: 'center' }}>
          Loading payslips...
        </div>
      )}

      {/* Payslip sheets */}
      {data && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 0 40px' }}>
          {data.payslips.length === 0 && (
            <div style={{ padding: '40px', fontFamily: 'Arial', color: '#6b7280' }}>No payslips in this run.</div>
          )}
          {data.payslips.map((slip, i) => (
            <div
              key={slip.payslip_id}
              className="no-print-margin"
              style={{ marginBottom: i < data.payslips.length - 1 ? '20px' : 0, boxShadow: '0 2px 12px rgba(0,0,0,0.25)' }}>
              <PayslipSheet
                slip={slip}
                biz={data.business_info}
                period={period}
                breakAfter={i < data.payslips.length - 1}
              />
            </div>
          ))}
        </div>
      )}
    </>
  )
}
