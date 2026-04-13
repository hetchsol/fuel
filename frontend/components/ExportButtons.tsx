import { useState, useEffect, useRef } from 'react'
import { exportToExcel, exportToPDF, ExportConfig, BusinessInfo } from '../lib/exportUtils'
import { getHeaders, authFetch } from '../lib/api'

interface Props {
  getConfig: () => ExportConfig | null
  className?: string
}

// Cache business info across all instances
let cachedBusinessInfo: BusinessInfo | null = null
let fetchPromise: Promise<BusinessInfo | null> | null = null

function fetchBusinessInfo(): Promise<BusinessInfo | null> {
  if (cachedBusinessInfo) return Promise.resolve(cachedBusinessInfo)
  if (fetchPromise) return fetchPromise
  fetchPromise = authFetch('/api/v1/settings/business-info', { headers: getHeaders() })
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      if (data) {
        const info: BusinessInfo = {
          business_name: data.business_name || '',
          station_location: data.station_location || '',
          contact_phone: data.contact_phone || '',
          contact_email: data.contact_email || '',
        }
        cachedBusinessInfo = info
        return info
      }
      return null
    })
    .catch(() => null)
  return fetchPromise
}

export default function ExportButtons({ getConfig, className = '' }: Props) {
  const [exporting, setExporting] = useState<'xlsx' | 'pdf' | null>(null)

  // Pre-fetch on mount
  useEffect(() => { fetchBusinessInfo() }, [])

  const handleExport = async (format: 'xlsx' | 'pdf') => {
    const config = getConfig()
    if (!config) return
    setExporting(format)
    try {
      // Ensure business info is loaded before exporting
      const biz = await fetchBusinessInfo()
      config.businessInfo = biz || undefined
      if (format === 'xlsx') exportToExcel(config)
      else exportToPDF(config)
    } catch (err) {
      console.error('Export failed:', err)
    } finally {
      setTimeout(() => setExporting(null), 500)
    }
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <button
        onClick={() => handleExport('xlsx')}
        disabled={!!exporting}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-green-600/15 text-green-400 border border-green-600/30 rounded-lg hover:bg-green-600/25 transition-colors disabled:opacity-50"
      >
        {exporting === 'xlsx' ? (
          <span className="w-3 h-3 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
        ) : (
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        )}
        Excel
      </button>
      <button
        onClick={() => handleExport('pdf')}
        disabled={!!exporting}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-red-600/15 text-red-400 border border-red-600/30 rounded-lg hover:bg-red-600/25 transition-colors disabled:opacity-50"
      >
        {exporting === 'pdf' ? (
          <span className="w-3 h-3 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
        ) : (
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
        )}
        PDF
      </button>
    </div>
  )
}
