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

export interface ExportConfig {
  title: string
  subtitle?: string
  filename: string
  columns: ExportColumn[]
  data: Record<string, any>[]
  summaryCards?: { label: string; value: string | number }[]
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

// ─── Excel Export ────────────────────────────────────────
export function exportToExcel(config: ExportConfig) {
  const wb = XLSX.utils.book_new()

  // Build rows
  const headerRow = config.columns.map(c => c.header)
  const dataRows = config.data.map(row =>
    config.columns.map(col => rawValue(row[col.key], col.format))
  )

  // Summary section at top
  const sheetData: any[][] = []
  sheetData.push([config.title])
  if (config.subtitle) sheetData.push([config.subtitle])
  sheetData.push([`Generated: ${new Date().toLocaleString()}`])
  sheetData.push([])

  if (config.summaryCards && config.summaryCards.length > 0) {
    config.summaryCards.forEach(card => {
      sheetData.push([card.label, card.value])
    })
    sheetData.push([])
  }

  sheetData.push(headerRow)
  dataRows.forEach(r => sheetData.push(r))

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

  // Header
  doc.setFontSize(16)
  doc.setTextColor(10, 61, 122) // brand blue
  doc.text(config.title, 14, 18)

  let y = 24
  if (config.subtitle) {
    doc.setFontSize(10)
    doc.setTextColor(100)
    doc.text(config.subtitle, 14, y)
    y += 6
  }

  doc.setFontSize(8)
  doc.setTextColor(150)
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, y)
  y += 8

  // Summary cards
  if (config.summaryCards && config.summaryCards.length > 0) {
    doc.setFontSize(9)
    doc.setTextColor(60)
    config.summaryCards.forEach(card => {
      doc.text(`${card.label}: ${card.value}`, 14, y)
      y += 5
    })
    y += 4
  }

  // Table
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

  // Footer
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(7)
    doc.setTextColor(180)
    const pageHeight = doc.internal.pageSize.height
    doc.text(`NextStop Fuel Management — Page ${i} of ${pageCount}`, 14, pageHeight - 8)
    doc.text('Developed by Hetch Solutions', doc.internal.pageSize.width - 14, pageHeight - 8, { align: 'right' })
  }

  doc.save(`${config.filename}.pdf`)
}
