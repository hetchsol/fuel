import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { authFetch } from '../lib/api'
import { PAYROLL, periodLabel } from '../lib/payroll'
import { exportToExcel } from '../lib/exportUtils'

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

// ── PDF generation ────────────────────────────────────────────────────────────

const PDF_BLUE: [number, number, number] = [10, 61, 122]
const PDF_GREY: [number, number, number] = [90, 90, 90]

function buildPayslipPage(doc: jsPDF, data: PrintData, slip: PrintPayslip) {
  const pw = doc.internal.pageSize.width
  const ph = doc.internal.pageSize.height
  const margin = 14
  let y = margin
  const biz = data.business_info

  // Business header
  if (biz.business_name) {
    doc.setFontSize(13)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...PDF_BLUE)
    doc.text(biz.business_name.toUpperCase(), pw / 2, y, { align: 'center' })
    y += 6
    if (biz.station_location) {
      doc.setFontSize(8.5)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...PDF_GREY)
      doc.text(biz.station_location.toUpperCase(), pw / 2, y, { align: 'center' })
      y += 5
    }
    const contact = [biz.contact_phone, biz.contact_email].filter(Boolean).join('  |  ')
    if (contact) {
      doc.setFontSize(8)
      doc.text(contact, pw / 2, y, { align: 'center' })
      y += 4
    }
    doc.setDrawColor(...PDF_BLUE)
    doc.setLineWidth(0.4)
    doc.line(margin, y, pw - margin, y)
    y += 5
  }

  // Title + period
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...PDF_BLUE)
  doc.text('PAYSLIP', pw / 2, y, { align: 'center' })
  y += 5
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...PDF_GREY)
  doc.text(
    `${periodLabel(data.run.period_month, data.run.period_year)}  |  ${data.run.status.toUpperCase()}`,
    pw / 2, y, { align: 'center' }
  )
  y += 7

  // Employee info (2-column)
  const c1 = margin, c2 = margin + 28, c3 = pw / 2 + 4, c4 = pw / 2 + 32
  const infoLines: [string, string, string, string][] = [
    ['Employee:', slip.full_name || '', 'NRC:', slip.nrc_number || '—'],
    ['TPIN:', slip.tpin || '—', 'NAPSA No:', slip.napsa_number || '—'],
    ['NHIMA No:', slip.nhima_number || '—', 'Payment:', paymentLine(slip)],
  ]
  if (slip.attendance_days != null) {
    infoLines.push([
      'Days Present:', String(slip.attendance_days),
      'Leave Taken:', slip.leave_days_taken != null ? `${slip.leave_days_taken} days` : '—',
    ])
  }
  doc.setFontSize(8)
  for (const [l1, v1, l2, v2] of infoLines) {
    doc.setFont('helvetica', 'bold'); doc.setTextColor(60, 60, 60); doc.text(l1, c1, y)
    doc.setFont('helvetica', 'normal'); doc.setTextColor(20, 20, 20); doc.text(v1, c2, y)
    doc.setFont('helvetica', 'bold'); doc.setTextColor(60, 60, 60); doc.text(l2, c3, y)
    doc.setFont('helvetica', 'normal'); doc.setTextColor(20, 20, 20); doc.text(v2, c4, y)
    y += 5
  }
  y += 3

  // Earnings / Deductions table (4-column)
  const napsa = slip.napsa_employee_override ?? slip.napsa_employee_calc
  const nhima = slip.nhima_employee_override ?? slip.nhima_employee_calc
  const paye  = slip.paye_override ?? slip.paye_calc

  const earnings: [string, number][] = [
    ['Basic Salary', slip.basic_salary],
    ...(slip.housing_allowance   > 0 ? [['Housing Allowance',   slip.housing_allowance]   as [string, number]] : []),
    ...(slip.transport_allowance > 0 ? [['Transport Allowance', slip.transport_allowance] as [string, number]] : []),
    ...(slip.other_allowances    > 0 ? [['Other Allowances',    slip.other_allowances]    as [string, number]] : []),
    ...(slip.overtime_pay        > 0 ? [['Overtime',            slip.overtime_pay]        as [string, number]] : []),
  ]
  const deductions: [string, number][] = [
    ...(napsa > 0 ? [['NAPSA (employee)', napsa] as [string, number]] : []),
    ...(nhima > 0 ? [['NHIMA (employee)', nhima] as [string, number]] : []),
    ...(paye  > 0 ? [['PAYE',            paye]  as [string, number]] : []),
    ...(slip.advances_deducted > 0 ? [['Advance Recovery', slip.advances_deducted] as [string, number]] : []),
    ...(slip.custom_deductions || []).map(d => [d.label, d.amount] as [string, number]),
  ]

  const len = Math.max(earnings.length, deductions.length)
  const colW = (pw - 2 * margin) / 4
  const body: string[][] = Array.from({ length: len }, (_, i) => [
    earnings[i]?.[0] || '',
    earnings[i] ? zmw(earnings[i][1]) : '',
    deductions[i]?.[0] || '',
    deductions[i] ? zmw(deductions[i][1]) : '',
  ])

  autoTable(doc, {
    startY: y,
    head: [['EARNINGS', '', 'DEDUCTIONS', '']],
    body,
    foot: [['GROSS SALARY', zmw(slip.gross_salary), 'TOTAL DEDUCTIONS', zmw(slip.total_deductions)]],
    headStyles: { fillColor: PDF_BLUE, textColor: 255, fontSize: 7, fontStyle: 'bold' },
    footStyles: { fillColor: [228, 234, 245], textColor: [20, 20, 20], fontSize: 7, fontStyle: 'bold' },
    styles: { fontSize: 7, cellPadding: 2 },
    alternateRowStyles: { fillColor: [248, 250, 253] },
    columnStyles: {
      0: { cellWidth: colW * 1.45 },
      1: { cellWidth: colW * 0.55, halign: 'right', fontStyle: 'bold' },
      2: { cellWidth: colW * 1.45 },
      3: { cellWidth: colW * 0.55, halign: 'right', fontStyle: 'bold' },
    },
    margin: { left: margin, right: margin },
  })
  y = (doc as any).lastAutoTable.finalY + 5

  // Net Pay box
  const boxW = 90
  doc.setFillColor(...PDF_BLUE)
  doc.roundedRect((pw - boxW) / 2, y, boxW, 14, 2, 2, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(255, 255, 255)
  doc.text('NET PAY', pw / 2, y + 5.5, { align: 'center' })
  doc.setFontSize(11)
  doc.text(zmw(slip.net_pay), pw / 2, y + 11.5, { align: 'center' })
  y += 18

  // Employer contributions
  if (slip.napsa_employer > 0 || slip.nhima_employer > 0 || slip.wcf_employer > 0) {
    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...PDF_GREY)
    doc.text('EMPLOYER CONTRIBUTIONS — for reference only, not deducted from employee pay', margin, y)
    y += 3
    autoTable(doc, {
      startY: y,
      head: [['NAPSA (Employer)', 'NHIMA (Employer)', 'WCF', 'Total Employer Cost']],
      body: [[zmw(slip.napsa_employer), zmw(slip.nhima_employer), zmw(slip.wcf_employer), zmw(slip.total_employer_cost)]],
      headStyles: { fillColor: [85, 115, 155], textColor: 255, fontSize: 7, fontStyle: 'bold' },
      styles: { fontSize: 7, cellPadding: 2, halign: 'right' },
      margin: { left: margin, right: margin },
    })
    y = (doc as any).lastAutoTable.finalY + 4
  }

  // Notes
  if (slip.notes) {
    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'italic')
    doc.setTextColor(...PDF_GREY)
    doc.text(`Notes: ${slip.notes}`, margin, y)
    y += 5
  }

  // Signature lines
  const sigY = ph - 25
  doc.setDrawColor(0)
  doc.setLineWidth(0.3)
  const half = (pw - 2 * margin - 20) / 2
  doc.line(margin, sigY, margin + half, sigY)
  doc.line(margin + half + 20, sigY, pw - margin, sigY)
  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(120)
  doc.text('Employee Signature & Date', margin, sigY + 4)
  doc.text('Authorised Signature & Date', margin + half + 20, sigY + 4)

  // Footer
  const ts = new Date().toLocaleString()
  doc.setFontSize(7)
  doc.setTextColor(160)
  doc.text(`Generated: ${ts}`, margin, ph - 8)
  doc.text('Developed by Hetch Solutions', pw - margin, ph - 8, { align: 'right' })
}

function generateAllPDF(data: PrintData) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  data.payslips.forEach((slip, i) => {
    if (i > 0) doc.addPage()
    buildPayslipPage(doc, data, slip)
  })
  const period = periodLabel(data.run.period_month, data.run.period_year).replace(' ', '_')
  doc.save(`payslips_${period}.pdf`)
}

function generateSinglePDF(data: PrintData, slip: PrintPayslip) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  buildPayslipPage(doc, data, slip)
  const name = slip.full_name.replace(/\s+/g, '_')
  const period = periodLabel(data.run.period_month, data.run.period_year).replace(' ', '_')
  doc.save(`payslip_${name}_${period}.pdf`)
}

// ── Payroll Schedule (PDF + Excel) ────────────────────────────────────────────

function buildScheduleRows(data: PrintData) {
  const slips = data.payslips
  const hasOther    = slips.some(s => s.other_allowances    > 0)
  const hasOT       = slips.some(s => s.overtime_pay        > 0)
  const hasAdvances = slips.some(s => s.advances_deducted   > 0)
  const hasCustom   = slips.some(s => (s.custom_deductions || []).length > 0)

  const cols = [
    { header: 'Employee',     key: 'full_name',          numeric: false },
    { header: 'Basic',        key: 'basic_salary',        numeric: true  },
    { header: 'Housing',      key: 'housing_allowance',   numeric: true  },
    { header: 'Transport',    key: 'transport_allowance', numeric: true  },
    ...(hasOther    ? [{ header: 'Other Allow.',  key: 'other_allowances',  numeric: true }] : []),
    ...(hasOT       ? [{ header: 'Overtime',      key: 'overtime_pay',       numeric: true }] : []),
    { header: 'Gross',        key: 'gross_salary',        numeric: true  },
    { header: 'PAYE',         key: '_paye',               numeric: true  },
    { header: 'NAPSA (Emp.)', key: '_napsa',              numeric: true  },
    { header: 'NHIMA (Emp.)', key: '_nhima',              numeric: true  },
    ...(hasAdvances ? [{ header: 'Advance',       key: 'advances_deducted', numeric: true }] : []),
    ...(hasCustom   ? [{ header: 'Other Ded.',    key: '_custom_total',     numeric: true }] : []),
    { header: 'Total Ded.',   key: 'total_deductions',    numeric: true  },
    { header: 'Net Pay',      key: 'net_pay',             numeric: true  },
    { header: 'NAPSA (Emp)', key: 'napsa_employer',      numeric: true  },
    { header: 'NHIMA (Emp)', key: 'nhima_employer',      numeric: true  },
    { header: 'WCF',          key: 'wcf_employer',        numeric: true  },
    { header: 'Employer Cost',key: 'total_employer_cost', numeric: true  },
  ]

  const rows = slips.map(s => {
    const napsa = s.napsa_employee_override ?? s.napsa_employee_calc
    const nhima = s.nhima_employee_override ?? s.nhima_employee_calc
    const paye  = s.paye_override ?? s.paye_calc
    const customTotal = (s.custom_deductions || []).reduce((sum: number, d: any) => sum + d.amount, 0)
    return { ...s, _paye: paye, _napsa: napsa, _nhima: nhima, _custom_total: customTotal }
  })

  // Totals row
  const totals: Record<string, any> = { full_name: 'TOTAL' }
  cols.filter(c => c.numeric).forEach(c => {
    totals[c.key] = rows.reduce((sum, r) => sum + (Number((r as any)[c.key]) || 0), 0)
  })

  return { cols, rows, totals }
}

function generateSchedulePDF(data: PrintData) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const pw = doc.internal.pageSize.width   // 297 mm
  const ph = doc.internal.pageSize.height  // 210 mm
  const margin = 12
  let y = margin
  const biz = data.business_info
  const run = data.run

  // Business info — left side
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...PDF_BLUE)
  doc.text((biz.business_name || '').toUpperCase(), margin, y)
  y += 5
  if (biz.station_location) {
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...PDF_GREY)
    doc.text(biz.station_location.toUpperCase(), margin, y)
    y += 4
  }
  const contact = [biz.contact_phone, biz.contact_email].filter(Boolean).join('  |  ')
  if (contact) {
    doc.setFontSize(7.5)
    doc.text(contact, margin, y)
    y += 4
  }

  // Title — right side
  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...PDF_BLUE)
  doc.text('PAYROLL SCHEDULE', pw - margin, margin, { align: 'right' })
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...PDF_GREY)
  doc.text(`Period: ${periodLabel(run.period_month, run.period_year)}`, pw - margin, margin + 6, { align: 'right' })
  doc.text(`Status: ${run.status.toUpperCase()}`, pw - margin, margin + 11, { align: 'right' })

  y = Math.max(y, margin + 14) + 3

  doc.setDrawColor(...PDF_BLUE)
  doc.setLineWidth(0.4)
  doc.line(margin, y, pw - margin, y)
  y += 5

  const { cols, rows, totals } = buildScheduleRows(data)

  const bodyRows = rows.map(r =>
    cols.map(c => c.numeric ? zmw((r as any)[c.key] || 0) : String((r as any)[c.key] || ''))
  )
  const totalsRow = cols.map(c => c.numeric ? zmw((totals as any)[c.key] || 0) : String((totals as any)[c.key] || ''))

  const numCols = cols.length
  const usableW = pw - 2 * margin
  const nameW = 34
  const restW = (usableW - nameW) / (numCols - 1)

  autoTable(doc, {
    startY: y,
    head: [cols.map(c => c.header)],
    body: bodyRows,
    foot: [totalsRow],
    headStyles: { fillColor: PDF_BLUE, textColor: 255, fontSize: 5.5, fontStyle: 'bold', halign: 'right' },
    footStyles: { fillColor: [220, 228, 245], textColor: [10, 10, 10], fontSize: 5.5, fontStyle: 'bold', halign: 'right' },
    styles: { fontSize: 5.5, cellPadding: 1.2, halign: 'right' },
    alternateRowStyles: { fillColor: [248, 250, 253] },
    columnStyles: {
      0: { halign: 'left', cellWidth: nameW },
      ...Object.fromEntries(Array.from({ length: numCols - 1 }, (_, i) => [i + 1, { cellWidth: restW }])),
    },
    margin: { left: margin, right: margin },
    didDrawPage: (_: any) => {
      // re-draw header on continuation pages
      doc.setFontSize(7)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...PDF_GREY)
      doc.text(
        `${periodLabel(run.period_month, run.period_year)} Payroll Schedule (continued)`,
        pw / 2, margin - 4, { align: 'center' }
      )
    },
  })

  // Signature block
  const sigY = ph - 22
  const sigW = 55
  doc.setDrawColor(0)
  doc.setLineWidth(0.3)
  doc.line(margin, sigY, margin + sigW, sigY)
  doc.line(pw / 2 - sigW / 2, sigY, pw / 2 + sigW / 2, sigY)
  doc.line(pw - margin - sigW, sigY, pw - margin, sigY)
  doc.setFontSize(6.5)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(120)
  doc.text('Prepared by & Date', margin, sigY + 4)
  doc.text('Reviewed by & Date', pw / 2 - sigW / 2, sigY + 4)
  doc.text('Approved by & Date', pw - margin - sigW, sigY + 4)

  // Footer
  const ts = new Date().toLocaleString()
  doc.setFontSize(6.5)
  doc.setTextColor(160)
  doc.text(`Generated: ${ts}`, margin, ph - 8)
  doc.text('Developed by Hetch Solutions', pw - margin, ph - 8, { align: 'right' })

  const period = periodLabel(run.period_month, run.period_year).replace(' ', '_')
  doc.save(`payroll_schedule_${period}.pdf`)
}

function generateScheduleExcel(data: PrintData) {
  const run = data.run
  const biz = data.business_info
  const { cols, rows, totals } = buildScheduleRows(data)
  const period = periodLabel(run.period_month, run.period_year)

  const exportCols = cols.map(c => ({
    header: c.header,
    key: c.key,
    format: c.numeric ? ('currency' as const) : ('text' as const),
    width: c.key === 'full_name' ? 28 : 16,
  }))

  const dataRows = rows.map(r =>
    Object.fromEntries(cols.map(c => [c.key, (r as any)[c.key] ?? '']))
  )
  // Totals row — mark with special name
  const totalsRow = Object.fromEntries(cols.map(c => [c.key, (totals as any)[c.key] ?? '']))

  exportToExcel({
    title: `Payroll Schedule — ${period}`,
    subtitle: `Status: ${run.status.toUpperCase()}`,
    filename: `payroll_schedule_${period.replace(' ', '_')}`,
    summaryCards: [
      { label: 'Period',            value: period },
      { label: 'Employees',         value: rows.length },
      { label: 'Total Gross',       value: zmw(rows.reduce((s, r) => s + r.gross_salary, 0)) },
      { label: 'Total Net Pay',     value: zmw(rows.reduce((s, r) => s + r.net_pay, 0)) },
      { label: 'Total PAYE',        value: zmw(rows.reduce((s, r) => s + (r._paye ?? 0), 0)) },
      { label: 'Total NAPSA (Emp)', value: zmw(rows.reduce((s, r) => s + (r._napsa ?? 0), 0)) },
      { label: 'Total Employer Cost', value: zmw(rows.reduce((s, r) => s + r.total_employer_cost, 0)) },
    ],
    columns: exportCols,
    data: [...dataRows, totalsRow],
    businessInfo: {
      business_name: biz.business_name || '',
      station_location: biz.station_location || '',
      contact_phone: biz.contact_phone || '',
      contact_email: biz.contact_email || '',
    },
  })
}

// ── Screen component ──────────────────────────────────────────────────────────

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
        {/* Payslips group */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Payslips</span>
          <button
            onClick={() => window.print()}
            disabled={!data}
            style={{ padding: '7px 14px', borderRadius: '4px', background: 'transparent', color: '#cbd5e1', border: '1px solid #475569', cursor: data ? 'pointer' : 'not-allowed', fontSize: '13px', opacity: data ? 1 : 0.5 }}>
            Print All
          </button>
          <button
            onClick={() => data && generateAllPDF(data)}
            disabled={!data}
            style={{ padding: '7px 16px', borderRadius: '4px', background: '#3b82f6', color: '#fff', border: 'none', cursor: data ? 'pointer' : 'not-allowed', fontSize: '13px', fontWeight: 'bold', opacity: data ? 1 : 0.5 }}>
            PDF
          </button>
        </div>

        {/* Divider */}
        <div style={{ width: '1px', height: '28px', background: '#334155' }} />

        {/* Schedule group */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Schedule</span>
          <button
            onClick={() => data && generateSchedulePDF(data)}
            disabled={!data}
            style={{ padding: '7px 16px', borderRadius: '4px', background: '#dc2626', color: '#fff', border: 'none', cursor: data ? 'pointer' : 'not-allowed', fontSize: '13px', fontWeight: 'bold', opacity: data ? 1 : 0.5 }}>
            PDF
          </button>
          <button
            onClick={() => data && generateScheduleExcel(data)}
            disabled={!data}
            style={{ padding: '7px 16px', borderRadius: '4px', background: '#16a34a', color: '#fff', border: 'none', cursor: data ? 'pointer' : 'not-allowed', fontSize: '13px', fontWeight: 'bold', opacity: data ? 1 : 0.5 }}>
            Excel
          </button>
        </div>
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
            <div key={slip.payslip_id} style={{ marginBottom: i < data.payslips.length - 1 ? '20px' : 0 }}>
              {/* Per-slip download button — hidden on print */}
              <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '4px' }}>
                <button
                  onClick={() => generateSinglePDF(data, slip)}
                  style={{ padding: '5px 14px', borderRadius: '4px', background: '#1e40af', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '12px' }}>
                  Download PDF — {slip.full_name}
                </button>
              </div>
              <div style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.25)' }}>
                <PayslipSheet
                  slip={slip}
                  biz={data.business_info}
                  period={period}
                  breakAfter={i < data.payslips.length - 1}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
