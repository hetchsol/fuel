import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

// ─── Types ───────────────────────────────────────────────
export interface ExportColumn {
  header: string
  key: string
  width?: number
  format?: 'currency' | 'number' | 'percent' | 'text'
}

export interface BusinessInfo {
  business_name: string
  station_location?: string
  contact_phone?: string
  contact_email?: string
}

export interface ExportConfig {
  title: string
  subtitle?: string
  filename: string
  columns: ExportColumn[]
  data: Record<string, any>[]
  summaryCards?: { label: string; value: string | number }[]
  businessInfo?: BusinessInfo
}

// ─── Formatting helpers ──────────────────────────────────
function formatValue(value: any, format?: string): string {
  if (value === null || value === undefined) return '—'
  if (format === 'currency') return `ZMW ${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  if (format === 'number') return Number(value).toLocaleString()
  if (format === 'percent') return `${Number(value).toFixed(2)}%`
  return String(value)
}

function rawValue(value: any, format?: string): any {
  if (value === null || value === undefined) return ''
  if (format === 'currency' || format === 'number' || format === 'percent') return Number(value)
  return String(value)
}

// ─── CSV Export ─────────────────────────────────────────
export function exportToCSV(config: ExportConfig) {
  const esc = (v: string) => {
    const s = String(v)
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? '"' + s.replace(/"/g, '""') + '"'
      : s
  }

  const rows: string[] = []

  if (config.businessInfo?.business_name) {
    rows.push(esc(config.businessInfo.business_name.toUpperCase()))
    if (config.businessInfo.station_location) rows.push(esc(config.businessInfo.station_location.toUpperCase()))
    rows.push('')
  }

  rows.push(esc(config.title))
  if (config.subtitle) rows.push(esc(config.subtitle))
  rows.push('')

  if (config.summaryCards?.length) {
    config.summaryCards.forEach(c => rows.push(`${esc(c.label)},${esc(String(c.value))}`))
    rows.push('')
  }

  rows.push(config.columns.map(c => esc(c.header)).join(','))
  config.data.forEach(row =>
    rows.push(config.columns.map(col => esc(formatValue(row[col.key], col.format))).join(','))
  )

  rows.push('')
  rows.push(`Generated,${esc(new Date().toLocaleString())}`)

  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${config.filename}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Excel Export ────────────────────────────────────────
export function exportToExcel(config: ExportConfig) {
  const wb = XLSX.utils.book_new()
  const biz = config.businessInfo
  const timestamp = new Date().toLocaleString()

  // Build rows
  const headerRow = config.columns.map(c => c.header)
  const dataRows = config.data.map(row =>
    config.columns.map(col => rawValue(row[col.key], col.format))
  )

  const sheetData: any[][] = []

  // Business header (centered, uppercase)
  if (biz?.business_name) {
    sheetData.push([biz.business_name.toUpperCase()])
    if (biz.station_location) sheetData.push([biz.station_location.toUpperCase()])
    const contactParts: string[] = []
    if (biz.contact_phone) contactParts.push(biz.contact_phone)
    if (biz.contact_email) contactParts.push(biz.contact_email)
    if (contactParts.length > 0) sheetData.push([contactParts.join('  |  ')])
    sheetData.push([])
  }

  // Report title
  sheetData.push([config.title.toUpperCase()])
  if (config.subtitle) sheetData.push([config.subtitle])
  sheetData.push([])

  // Summary cards
  if (config.summaryCards && config.summaryCards.length > 0) {
    config.summaryCards.forEach(card => {
      sheetData.push([card.label, card.value])
    })
    sheetData.push([])
  }

  // Data table
  sheetData.push(headerRow)
  dataRows.forEach(r => sheetData.push(r))

  // Footer
  sheetData.push([])
  sheetData.push([`Generated: ${timestamp}`])

  const ws = XLSX.utils.aoa_to_sheet(sheetData)

  // Column widths
  ws['!cols'] = config.columns.map((col, i) => ({
    wch: Math.max(
      col.width || 15,
      col.header.length + 2,
      ...dataRows.map(r => String(r[i] ?? '').length + 2).slice(0, 50)
    )
  }))

  XLSX.utils.book_append_sheet(wb, ws, 'Report')
  XLSX.writeFile(wb, `${config.filename}.xlsx`)
}

// ─── PDF Export ──────────────────────────────────────────
export function exportToPDF(config: ExportConfig) {
  const doc = new jsPDF({ orientation: config.columns.length > 6 ? 'landscape' : 'portrait' })
  const pageWidth = doc.internal.pageSize.width
  const centerX = pageWidth / 2
  const biz = config.businessInfo
  const timestamp = new Date().toLocaleString()

  // ── Business Header (centered, uppercase) ──
  let y = 14
  if (biz?.business_name) {
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(10, 61, 122)
    doc.text(biz.business_name.toUpperCase(), centerX, y, { align: 'center' })
    y += 6

    if (biz.station_location) {
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(80)
      doc.text(biz.station_location.toUpperCase(), centerX, y, { align: 'center' })
      y += 5
    }

    const contactParts: string[] = []
    if (biz.contact_phone) contactParts.push(biz.contact_phone)
    if (biz.contact_email) contactParts.push(biz.contact_email)
    if (contactParts.length > 0) {
      doc.setFontSize(8)
      doc.text(contactParts.join('  |  '), centerX, y, { align: 'center' })
      y += 5
    }

    // Separator line
    doc.setDrawColor(10, 61, 122)
    doc.setLineWidth(0.5)
    doc.line(14, y, pageWidth - 14, y)
    y += 6
  }

  // ── Report Title ──
  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(10, 61, 122)
  doc.text(config.title.toUpperCase(), centerX, y, { align: 'center' })
  y += 6

  if (config.subtitle) {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100)
    doc.text(config.subtitle, centerX, y, { align: 'center' })
    y += 6
  }
  y += 2

  // ── Summary Cards ──
  if (config.summaryCards && config.summaryCards.length > 0) {
    doc.setFontSize(9)
    doc.setTextColor(60)
    doc.setFont('helvetica', 'normal')
    config.summaryCards.forEach(card => {
      doc.text(`${card.label}: ${card.value}`, 14, y)
      y += 5
    })
    y += 4
  }

  // ── Data Table ──
  const headers = config.columns.map(c => c.header)
  const body = config.data.map(row =>
    config.columns.map(col => formatValue(row[col.key], col.format))
  )

  autoTable(doc, {
    startY: y,
    head: [headers],
    body: body,
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: {
      fillColor: [10, 61, 122],
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 7,
    },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    margin: { left: 14, right: 14 },
  })

  // ── Footer (every page) ──
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    const pageHeight = doc.internal.pageSize.height

    doc.setFontSize(7)
    doc.setTextColor(150)
    doc.text(`Generated: ${timestamp}`, 14, pageHeight - 12)
    doc.text(`Page ${i} of ${pageCount}`, centerX, pageHeight - 8, { align: 'center' })
    doc.text('Developed by Hetch Solutions', pageWidth - 14, pageHeight - 8, { align: 'right' })
  }

  doc.save(`${config.filename}.pdf`)
}
