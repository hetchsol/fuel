import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { getStaffList, getNozzleList, getIslandList, getProductList, getHeaders, authFetch } from '../lib/api'
import ExportButtons from '../components/ExportButtons'
import { ExportConfig } from '../lib/exportUtils'

const BASE = '/api/v1'

export default function AdvancedReports() {
  const [reportType, setReportType] = useState('custom')
  const [loading, setLoading] = useState(false)
  const [reportData, setReportData] = useState<any>(null)
  const [drillDown, setDrillDown] = useState<string | null>(null)
  const [error, setError] = useState('')

  // Filter states
  const [filters, setFilters] = useState({
    staff_name: '',
    nozzle_id: '',
    island_id: '',
    product_type: '',
    shift_id: '',
    shift_type: '',
    start_date: '',
    end_date: ''
  })

  const [specificId, setSpecificId] = useState('')
  const [productSearch, setProductSearch] = useState('')

  // Dropdown lists
  const [staffList, setStaffList] = useState<string[]>([])
  const [nozzleList, setNozzleList] = useState<string[]>([])
  const [islandList, setIslandList] = useState<string[]>([])
  const [productList, setProductList] = useState<string[]>(['Petrol', 'Diesel', 'LPG', 'Lubricants', 'Accessories'])
  const [productItems, setProductItems] = useState<{value: string, label: string, category: string}[]>([])
  const [loadingLists, setLoadingLists] = useState(false)

  const productTypes = ['Petrol', 'Diesel', 'LPG', 'Lubricants', 'Accessories']
  const reportTypes = [
    { value: 'staff', label: 'Staff Performance', icon: '👤' },
    { value: 'nozzle', label: 'Nozzle Report', icon: '⛽' },
    { value: 'island', label: 'Island Report', icon: '🏝️' },
    { value: 'product', label: 'Product Sales', icon: '📦' },
    { value: 'custom', label: 'Custom Multi-Filter', icon: '🔍' },
    { value: 'daily', label: 'Daily Summary', icon: '📅' },
    { value: 'monthly', label: 'Monthly Summary', icon: '📊' }
  ]

  // Fetch dropdown lists when report type changes
  useEffect(() => {
    const fetchLists = async () => {
      setLoadingLists(true)
      try {
        if (reportType === 'custom') {
          // Fetch all lists for custom filter mode
          const [staffData, nozzleData, islandData, productData] = await Promise.all([
            getStaffList().catch(() => ({ staff_names: [] })),
            getNozzleList().catch(() => ({ nozzle_ids: [] })),
            getIslandList().catch(() => ({ island_ids: [] })),
            getProductList().catch(() => ({ product_types: productTypes, items: [] }))
          ])
          setStaffList(staffData.staff_names || [])
          setNozzleList(nozzleData.nozzle_ids || [])
          setIslandList(islandData.island_ids || [])
          setProductList(productData.product_types || productTypes)
          if (productData.items) setProductItems(productData.items)
        } else {
          switch (reportType) {
            case 'staff':
              const staffData = await getStaffList()
              setStaffList(staffData.staff_names || [])
              break
            case 'nozzle':
              const nozzleData = await getNozzleList()
              setNozzleList(nozzleData.nozzle_ids || [])
              break
            case 'island':
              const islandData = await getIslandList()
              setIslandList(islandData.island_ids || [])
              break
            case 'product':
              const productData = await getProductList()
              setProductList(productData.product_types || productTypes)
              if (productData.items) setProductItems(productData.items)
              break
          }
        }
      } catch (err) {
        console.error('Failed to fetch list:', err)
      } finally {
        setLoadingLists(false)
      }
    }

    if (['staff', 'nozzle', 'island', 'product', 'custom'].includes(reportType)) {
      fetchLists()
    }
  }, [reportType])

  const generateReport = async () => {
    setLoading(true)
    setError('')
    setReportData(null)

    try {
      let url = ''

      switch (reportType) {
        case 'staff':
          if (!specificId) {
            setError('Please enter staff name')
            setLoading(false)
            return
          }
          url = `${BASE}/reports/staff/${encodeURIComponent(specificId)}`
          if (filters.start_date) url += `?start_date=${filters.start_date}`
          if (filters.end_date) url += `${filters.start_date ? '&' : '?'}end_date=${filters.end_date}`
          break

        case 'nozzle':
          if (!specificId) {
            setError('Please enter nozzle ID')
            setLoading(false)
            return
          }
          url = `${BASE}/reports/nozzle/${encodeURIComponent(specificId)}`
          if (filters.start_date) url += `?start_date=${filters.start_date}`
          if (filters.end_date) url += `${filters.start_date ? '&' : '?'}end_date=${filters.end_date}`
          break

        case 'island':
          if (!specificId) {
            setError('Please enter island ID')
            setLoading(false)
            return
          }
          url = `${BASE}/reports/island/${encodeURIComponent(specificId)}`
          if (filters.start_date) url += `?start_date=${filters.start_date}`
          if (filters.end_date) url += `${filters.start_date ? '&' : '?'}end_date=${filters.end_date}`
          break

        case 'product':
          if (!specificId) {
            setError('Please select product type')
            setLoading(false)
            return
          }
          url = `${BASE}/reports/product/${encodeURIComponent(specificId)}`
          if (filters.start_date) url += `?start_date=${filters.start_date}`
          if (filters.end_date) url += `${filters.start_date ? '&' : '?'}end_date=${filters.end_date}`
          break

        case 'custom':
          url = `${BASE}/reports/custom?`
          const params = []
          if (filters.staff_name) params.push(`staff_name=${encodeURIComponent(filters.staff_name)}`)
          if (filters.nozzle_id) params.push(`nozzle_id=${encodeURIComponent(filters.nozzle_id)}`)
          if (filters.island_id) params.push(`island_id=${encodeURIComponent(filters.island_id)}`)
          if (filters.product_type) params.push(`product_type=${encodeURIComponent(filters.product_type)}`)
          if (filters.shift_id) params.push(`shift_id=${encodeURIComponent(filters.shift_id)}`)
          if (filters.shift_type) params.push(`shift_type=${encodeURIComponent(filters.shift_type)}`)
          if (filters.start_date) params.push(`start_date=${filters.start_date}`)
          if (filters.end_date) params.push(`end_date=${filters.end_date}`)
          url += params.join('&')
          break

        case 'daily':
          if (!filters.start_date) {
            setError('Please select a date')
            setLoading(false)
            return
          }
          url = `${BASE}/reports/daily?date=${filters.start_date}`
          break

        case 'monthly':
          if (!filters.start_date) {
            setError('Please select a date for the month')
            setLoading(false)
            return
          }
          const [year, month] = filters.start_date.split('-')
          url = `${BASE}/reports/monthly?year=${year}&month=${parseInt(month)}`
          break
      }

      const response = await authFetch(url, {
        headers: getHeaders()
      })
      if (!response.ok) {
        throw new Error('Failed to generate report')
      }

      const data = await response.json()
      setReportData(data)
    } catch (err: any) {
      setError(err.message || 'Failed to generate report')
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (amount: number) => {
    return `ZMW ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  // Build export config from current report data
  const getExportConfig = useCallback((): ExportConfig | null => {
    if (!reportData) return null

    const reportLabel = reportTypes.find(r => r.value === reportType)?.label || 'Report'
    const periodStr = `${reportData.period?.start_date || 'All'} to ${reportData.period?.end_date || 'All'}`

    // Staff report — export all sales records (not just product breakdown)
    if (reportData.staff_name && reportData.sales) {
      return {
        title: `Staff Performance Report — ${reportData.staff_name}`,
        subtitle: periodStr,
        filename: `staff_report_${reportData.staff_name.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0,10)}`,
        summaryCards: reportData.summary ? Object.entries(reportData.summary).map(([k, v]) => ({
          label: k.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          value: typeof v === 'number' ? (k.includes('revenue') ? formatCurrency(v) : v.toLocaleString()) : String(v),
        })) : [],
        columns: [
          { header: 'Date', key: 'date' },
          { header: 'Shift', key: 'shift_type' },
          { header: 'Shift ID', key: 'shift_id' },
          { header: 'Nozzle', key: 'nozzle_id' },
          { header: 'Fuel Type', key: 'fuel_type' },
          { header: 'Elec Open', key: 'electronic_opening', format: 'number' },
          { header: 'Elec Close', key: 'electronic_closing', format: 'number' },
          { header: 'Mech Open', key: 'mechanical_opening', format: 'number' },
          { header: 'Mech Close', key: 'mechanical_closing', format: 'number' },
          { header: 'Volume (L)', key: 'volume', format: 'number' },
          { header: 'Revenue (ZMW)', key: 'total_amount', format: 'currency' },
        ],
        data: reportData.sales,
      }
    }

    // Nozzle shift breakdown
    if (reportData.shift_breakdown) {
      return {
        title: `Nozzle Report — ${reportData.nozzle_id || ''}`,
        subtitle: `${reportData.fuel_type || ''} | ${periodStr}`,
        filename: `nozzle_report_${reportData.nozzle_id || 'all'}_${new Date().toISOString().slice(0,10)}`,
        summaryCards: [
          { label: 'Total Volume', value: `${reportData.summary?.total_volume?.toLocaleString()} L` },
          { label: 'Electronic Opening', value: reportData.summary?.electronic_opening?.toLocaleString() || '' },
          { label: 'Electronic Closing', value: reportData.summary?.electronic_closing?.toLocaleString() || '' },
          { label: 'Overall Deviation', value: `${reportData.summary?.overall_deviation} L` },
        ],
        columns: [
          { header: 'Date', key: 'date' },
          { header: 'Shift', key: 'shift_type' },
          { header: 'Attendant', key: 'staff_name' },
          { header: 'Elec Open', key: 'electronic_opening', format: 'number' },
          { header: 'Elec Close', key: 'electronic_closing', format: 'number' },
          { header: 'Mech Open', key: 'mechanical_opening', format: 'number' },
          { header: 'Mech Close', key: 'mechanical_closing', format: 'number' },
          { header: 'Volume (L)', key: 'volume_sold', format: 'number' },
          { header: 'Deviation (L)', key: 'deviation_liters', format: 'number' },
        ],
        data: reportData.shift_breakdown,
      }
    }

    // Product report — export all sales records
    if (reportData.product_type && reportData.sales) {
      return {
        title: `Product Report — ${reportData.product_type}`,
        subtitle: periodStr,
        filename: `product_report_${reportData.product_type}_${new Date().toISOString().slice(0,10)}`,
        summaryCards: reportData.summary ? Object.entries(reportData.summary).map(([k, v]) => ({
          label: k.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          value: typeof v === 'number' ? (k.includes('revenue') ? formatCurrency(v) : v.toLocaleString()) : String(v),
        })) : [],
        columns: [
          { header: 'Date', key: 'date' },
          { header: 'Shift', key: 'shift_type' },
          { header: 'Attendant', key: 'attendant' },
          { header: 'Nozzle', key: 'nozzle_id' },
          { header: 'Volume (L)', key: 'volume', format: 'number' },
          { header: 'Revenue (ZMW)', key: 'total_amount', format: 'currency' },
        ],
        data: reportData.sales,
      }
    }

    // Product breakdown (island report, etc.)
    if (reportData.product_breakdown) {
      const rows = Object.entries(reportData.product_breakdown).map(([product, d]: [string, any]) => ({
        product, transactions: d.transactions || d.count || 0, revenue: d.revenue || 0, volume: d.volume || 0,
      }))
      return {
        title: reportLabel,
        subtitle: periodStr,
        filename: `${reportType}_report_${new Date().toISOString().slice(0,10)}`,
        summaryCards: reportData.summary ? Object.entries(reportData.summary).map(([k, v]) => ({
          label: k.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          value: typeof v === 'number' ? (k.includes('revenue') ? formatCurrency(v) : v.toLocaleString()) : String(v),
        })) : [],
        columns: [
          { header: 'Product', key: 'product' },
          { header: 'Transactions', key: 'transactions', format: 'number' },
          { header: 'Revenue', key: 'revenue', format: 'currency' },
          { header: 'Volume', key: 'volume', format: 'number' },
        ],
        data: rows,
      }
    }

    // Generic data table (custom filter, staff, etc.)
    if (reportData.data && Array.isArray(reportData.data) && reportData.data.length > 0) {
      const sample = reportData.data[0]
      const cols: ExportConfig['columns'] = []
      const keyMap: Record<string, string> = {
        date: 'Date', shift_id: 'Shift', shift_type: 'Shift Type', staff_name: 'Staff',
        nozzle_id: 'Nozzle', fuel_type: 'Fuel Type', volume: 'Volume (L)',
        electronic_opening: 'Elec Open', electronic_closing: 'Elec Close',
        mechanical_opening: 'Mech Open', mechanical_closing: 'Mech Close',
      }
      for (const key of Object.keys(sample)) {
        if (['island_id'].includes(key) && !keyMap[key]) continue
        cols.push({
          header: keyMap[key] || key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          key,
          format: typeof sample[key] === 'number' ? (key.includes('revenue') || key.includes('amount') ? 'currency' : 'number') : 'text',
        })
      }
      return {
        title: reportLabel,
        subtitle: reportData.filters_applied ? `Filters: ${Object.entries(reportData.filters_applied).map(([k,v]) => `${k}=${v}`).join(', ')}` : '',
        filename: `${reportType}_report_${new Date().toISOString().slice(0,10)}`,
        summaryCards: reportData.summary ? Object.entries(reportData.summary).map(([k, v]) => ({
          label: k.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          value: typeof v === 'number' ? (k.includes('revenue') ? formatCurrency(v) : v.toLocaleString()) : String(v),
        })) : [],
        columns: cols,
        data: reportData.data,
      }
    }

    // Daily/monthly summary with only summary cards
    if (reportData.summary) {
      const rows = reportData.summary ? [reportData.summary] : []
      const cols = Object.keys(reportData.summary || {}).map(k => ({
        header: k.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()),
        key: k,
        format: (typeof (reportData.summary as any)?.[k] === 'number' && k.includes('revenue') ? 'currency' : 'number') as 'currency' | 'number',
      }))
      return {
        title: reportLabel,
        filename: `${reportType}_report_${new Date().toISOString().slice(0,10)}`,
        summaryCards: Object.entries(reportData.summary).map(([k, v]) => ({
          label: k.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()),
          value: typeof v === 'number' ? (k.includes('revenue') ? formatCurrency(v) : v.toLocaleString()) : String(v),
        })),
        columns: cols,
        data: rows,
      }
    }

    return null
  }, [reportData, reportType])

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-content-primary">Advanced Reports</h1>
        <p className="mt-2 text-sm text-content-secondary">
          Filter and analyze data by staff, nozzle, island, product, and more
        </p>
      </div>

      {/* Related Pages */}
      <div className="mb-6 flex flex-wrap gap-3">
        <span className="text-sm text-content-secondary self-center font-medium">Related:</span>
        <Link href="/reports" className="text-sm px-3 py-1.5 bg-surface-card border border-surface-border rounded-lg hover:border-action-primary hover:text-action-primary transition-colors">
          Sales Reports
        </Link>
        <Link href="/tank-readings-report" className="text-sm px-3 py-1.5 bg-surface-card border border-surface-border rounded-lg hover:border-action-primary hover:text-action-primary transition-colors">
          Tank Readings Report
        </Link>
      </div>

      {/* Report Type Selection */}
      <div className="bg-surface-card rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-semibold text-content-primary mb-4">Select Report Type</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2 sm:gap-3">
          {reportTypes.map((type) => (
            <button
              key={type.value}
              onClick={() => {
                setReportType(type.value)
                setReportData(null)
                setError('')
                setSpecificId('')
                setProductSearch('')
              }}
              className={`p-4 rounded-lg border-2 transition-all ${
                reportType === type.value
                  ? 'border-action-primary bg-action-primary-light text-action-primary'
                  : 'border-surface-border hover:border-surface-border text-content-secondary'
              }`}
            >
              <div className="text-2xl mb-1">{type.icon}</div>
              <div className="text-xs font-medium">{type.label}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-surface-card rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-semibold text-content-primary mb-4">Filters</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Specific ID input for staff/nozzle/island/product */}
          {['staff', 'nozzle', 'island', 'product'].includes(reportType) && (
            <div className="md:col-span-2 lg:col-span-3">
              <label className="block text-sm font-medium text-content-secondary mb-2">
                {reportType === 'staff' && 'Staff Name'}
                {reportType === 'nozzle' && 'Nozzle ID (e.g., ULP-001, LSD-002)'}
                {reportType === 'island' && 'Island ID (e.g., ISLAND-1)'}
                {reportType === 'product' && 'Product Type'}
              </label>
              {reportType === 'staff' ? (
                <select
                  value={specificId}
                  onChange={(e) => setSpecificId(e.target.value)}
                  disabled={loadingLists}
                  className="w-full px-3 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-action-primary focus:border-action-primary disabled:bg-surface-bg"
                >
                  <option value="">
                    {loadingLists ? 'Loading staff...' : staffList.length > 0 ? 'Select Staff Member' : 'No staff found - record some readings first'}
                  </option>
                  {staffList.map((staff) => (
                    <option key={staff} value={staff}>
                      {staff}
                    </option>
                  ))}
                </select>
              ) : reportType === 'nozzle' ? (
                <select
                  value={specificId}
                  onChange={(e) => setSpecificId(e.target.value)}
                  disabled={loadingLists}
                  className="w-full px-3 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-action-primary focus:border-action-primary disabled:bg-surface-bg"
                >
                  <option value="">
                    {loadingLists ? 'Loading nozzles...' : nozzleList.length > 0 ? 'Select Nozzle' : 'No nozzles found - record some readings first'}
                  </option>
                  {nozzleList.map((nozzle) => (
                    <option key={nozzle} value={nozzle}>
                      {nozzle}
                    </option>
                  ))}
                </select>
              ) : reportType === 'island' ? (
                <select
                  value={specificId}
                  onChange={(e) => setSpecificId(e.target.value)}
                  disabled={loadingLists}
                  className="w-full px-3 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-action-primary focus:border-action-primary disabled:bg-surface-bg"
                >
                  <option value="">
                    {loadingLists ? 'Loading islands...' : islandList.length > 0 ? 'Select Island' : 'No islands found - record some readings first'}
                  </option>
                  {islandList.map((island) => (
                    <option key={island} value={island}>
                      {island}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="relative">
                  <input
                    type="text"
                    value={productSearch}
                    onChange={(e) => {
                      setProductSearch(e.target.value)
                      if (!e.target.value) setSpecificId('')
                    }}
                    placeholder="Search or select product..."
                    className="w-full px-3 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-action-primary focus:border-action-primary"
                  />
                  {productSearch && !specificId && (
                    <div className="absolute z-20 w-full mt-1 bg-surface-card border border-surface-border rounded-md shadow-lg max-h-60 overflow-y-auto">
                      {(productItems.length > 0 ? productItems : productList.map(p => ({ value: p, label: p, category: '' })))
                        .filter(item => item.label.toLowerCase().includes(productSearch.toLowerCase()) || item.category.toLowerCase().includes(productSearch.toLowerCase()))
                        .map((item) => (
                          <button
                            key={item.value}
                            onClick={() => { setSpecificId(item.value); setProductSearch(item.label) }}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-action-primary-light transition-colors flex justify-between"
                          >
                            <span className="text-content-primary">{item.label}</span>
                            {item.category && <span className="text-xs text-content-secondary">{item.category}</span>}
                          </button>
                        ))}
                      {(productItems.length > 0 ? productItems : productList.map(p => ({ value: p, label: p, category: '' })))
                        .filter(item => item.label.toLowerCase().includes(productSearch.toLowerCase()) || item.category.toLowerCase().includes(productSearch.toLowerCase())).length === 0 && (
                        <div className="px-3 py-2 text-sm text-content-secondary">No products found</div>
                      )}
                    </div>
                  )}
                  {!productSearch && !specificId && (
                    <div className="absolute z-20 w-full mt-1 bg-surface-card border border-surface-border rounded-md shadow-lg max-h-60 overflow-y-auto hidden group-focus-within:block">
                    </div>
                  )}
                  {specificId && (
                    <button
                      onClick={() => { setSpecificId(''); setProductSearch('') }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-content-secondary hover:text-content-primary text-sm"
                    >
                      ✕
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Custom filters */}
          {reportType === 'custom' && (
            <>
              <div>
                <label className="block text-sm font-medium text-content-secondary mb-2">Staff Name</label>
                <select
                  value={filters.staff_name}
                  onChange={(e) => setFilters({ ...filters, staff_name: e.target.value })}
                  disabled={loadingLists}
                  className="w-full px-3 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-action-primary focus:border-action-primary disabled:bg-surface-bg"
                >
                  <option value="">All Staff</option>
                  {staffList.map((staff) => (
                    <option key={staff} value={staff}>
                      {staff}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-content-secondary mb-2">Nozzle ID</label>
                <select
                  value={filters.nozzle_id}
                  onChange={(e) => setFilters({ ...filters, nozzle_id: e.target.value })}
                  disabled={loadingLists}
                  className="w-full px-3 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-action-primary focus:border-action-primary disabled:bg-surface-bg"
                >
                  <option value="">All Nozzles</option>
                  {nozzleList.map((nozzle) => (
                    <option key={nozzle} value={nozzle}>
                      {nozzle}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-content-secondary mb-2">Island ID</label>
                <select
                  value={filters.island_id}
                  onChange={(e) => setFilters({ ...filters, island_id: e.target.value })}
                  disabled={loadingLists}
                  className="w-full px-3 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-action-primary focus:border-action-primary disabled:bg-surface-bg"
                >
                  <option value="">All Islands</option>
                  {islandList.map((island) => (
                    <option key={island} value={island}>
                      {island}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-content-secondary mb-2">Product Type</label>
                <select
                  value={filters.product_type}
                  onChange={(e) => setFilters({ ...filters, product_type: e.target.value })}
                  className="w-full px-3 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-action-primary focus:border-action-primary"
                >
                  <option value="">All Products</option>
                  {productList.map((product) => (
                    <option key={product} value={product}>
                      {product}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-content-secondary mb-2">Shift Type</label>
                <select
                  value={filters.shift_type}
                  onChange={(e) => setFilters({ ...filters, shift_type: e.target.value })}
                  className="w-full px-3 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-action-primary focus:border-action-primary"
                >
                  <option value="">Both Shifts</option>
                  <option value="Day">Day Shift</option>
                  <option value="Night">Night Shift</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-content-secondary mb-2">Shift ID</label>
                <input
                  type="text"
                  value={filters.shift_id}
                  onChange={(e) => setFilters({ ...filters, shift_id: e.target.value })}
                  placeholder="Filter by shift (optional)"
                  className="w-full px-3 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-action-primary focus:border-action-primary"
                />
              </div>
            </>
          )}

          {/* Date filters */}
          {!['monthly'].includes(reportType) && (
            <div>
              <label className="block text-sm font-medium text-content-secondary mb-2">
                {reportType === 'daily' ? 'Date' : 'Start Date'}
              </label>
              <input
                type="date"
                value={filters.start_date}
                onChange={(e) => setFilters({ ...filters, start_date: e.target.value })}
                className="w-full px-3 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-action-primary focus:border-action-primary"
              />
            </div>
          )}

          {!['daily', 'monthly'].includes(reportType) && (
            <div>
              <label className="block text-sm font-medium text-content-secondary mb-2">End Date</label>
              <input
                type="date"
                value={filters.end_date}
                onChange={(e) => setFilters({ ...filters, end_date: e.target.value })}
                className="w-full px-3 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-action-primary focus:border-action-primary"
              />
            </div>
          )}

          {reportType === 'monthly' && (
            <div>
              <label className="block text-sm font-medium text-content-secondary mb-2">Month</label>
              <input
                type="month"
                value={filters.start_date.substring(0, 7)}
                onChange={(e) => setFilters({ ...filters, start_date: e.target.value + '-01' })}
                className="w-full px-3 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-action-primary focus:border-action-primary"
              />
            </div>
          )}
        </div>

        <div className="mt-4 flex gap-3">
          <button
            onClick={generateReport}
            disabled={loading}
            className="px-6 py-2 bg-action-primary text-white font-semibold rounded-md hover:bg-action-primary-hover focus:outline-none focus:ring-2 focus:ring-action-primary disabled:opacity-50"
          >
            {loading ? 'Generating...' : 'Generate Report'}
          </button>
          <button
            onClick={() => {
              setFilters({
                staff_name: '',
                nozzle_id: '',
                island_id: '',
                product_type: '',
                shift_id: '',
                shift_type: '',
                start_date: '',
                end_date: ''
              })
              setSpecificId('')
              setProductSearch('')
              setReportData(null)
              setError('')
            }}
            className="px-6 py-2 bg-surface-bg text-content-secondary font-semibold rounded-md hover:bg-surface-bg focus:outline-none focus:ring-2 focus:ring-gray-400"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-status-error-light border border-status-error rounded-lg p-4 mb-6">
          <p className="text-status-error">{error}</p>
        </div>
      )}

      {/* Results */}
      {reportData && (
        <div className="bg-surface-card rounded-lg shadow p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3">
            <h2 className="text-lg font-semibold text-content-primary">Report Results</h2>
            <ExportButtons getConfig={getExportConfig} />
          </div>

          {/* Summary section — clickable cards */}
          {reportData.summary && (
            <div className="mb-6">
              <h3 className="text-md font-semibold text-content-primary mb-3">Summary</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4">
                {Object.entries(reportData.summary).map(([key, value]: [string, any]) => {
                  const isClickable = typeof value === 'number' && (reportData.data || reportData.readings || reportData.shift_breakdown)
                  return (
                    <div
                      key={key}
                      onClick={() => isClickable && setDrillDown(drillDown === key ? null : key)}
                      className={`bg-action-primary-light rounded-lg p-4 border transition-all ${
                        drillDown === key ? 'border-action-primary ring-2 ring-action-primary/30' : 'border-action-primary'
                      } ${isClickable ? 'cursor-pointer hover:ring-2 hover:ring-action-primary/20' : ''}`}
                    >
                      <p className="text-xs text-content-secondary mb-1">
                        {key.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                      </p>
                      <p className="text-xl font-bold text-action-primary">
                        {typeof value === 'number' && key.includes('revenue')
                          ? formatCurrency(value)
                          : typeof value === 'number'
                          ? value.toLocaleString()
                          : typeof value === 'boolean'
                          ? (value ? 'Yes' : 'No')
                          : value}
                      </p>
                      {isClickable && (
                        <p className="text-[10px] text-content-secondary/60 mt-1">Click to view details</p>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Drill-down detail table */}
              {drillDown && (reportData.data || reportData.readings || reportData.shift_breakdown) && (() => {
                const rows = reportData.shift_breakdown || reportData.data || reportData.readings || []
                if (!rows.length) return null
                const relevantKeys = ['date', 'shift_type', 'shift_id', 'staff_name', 'nozzle_id', 'fuel_type', 'volume', 'volume_sold', 'electronic_opening', 'electronic_closing', 'mechanical_opening', 'mechanical_closing', 'deviation_liters']
                const displayKeys = relevantKeys.filter(k => rows[0]?.[k] !== undefined)
                return (
                  <div className="mt-4 bg-surface-bg rounded-lg p-4 border border-surface-border">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-semibold text-content-primary">
                        Detailed Breakdown — {drillDown.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      </h4>
                      <button onClick={() => setDrillDown(null)} className="text-xs text-content-secondary hover:text-content-primary">Close</button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-surface-border text-xs">
                        <thead>
                          <tr>
                            {displayKeys.map(k => (
                              <th key={k} className="px-3 py-2 text-left font-medium text-content-secondary uppercase">
                                {k.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-surface-border">
                          {rows.map((row: any, i: number) => (
                            <tr key={i} className="hover:bg-surface-card">
                              {displayKeys.map(k => (
                                <td key={k} className="px-3 py-2 text-content-primary whitespace-nowrap font-mono">
                                  {typeof row[k] === 'number' ? row[k].toLocaleString() : row[k] || '—'}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })()}
            </div>
          )}

          {/* Product breakdown */}
          {reportData.product_breakdown && (
            <div className="mb-6">
              <h3 className="text-md font-semibold text-content-primary mb-3">Product Breakdown</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-surface-border">
                  <thead className="bg-surface-bg">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase">
                        Product
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase">
                        Transactions
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase">
                        Revenue
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase">
                        Volume
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-surface-card divide-y divide-surface-border">
                    {Object.entries(reportData.product_breakdown).map(([product, data]: [string, any]) => (
                      <tr key={product} className="hover:bg-surface-bg">
                        <td className="px-4 py-3 text-sm font-medium text-content-primary">{product}</td>
                        <td className="px-4 py-3 text-sm text-content-secondary">{data.transactions || data.count}</td>
                        <td className="px-4 py-3 text-sm text-content-secondary">{formatCurrency(data.revenue)}</td>
                        <td className="px-4 py-3 text-sm text-content-secondary">{data.volume?.toLocaleString() || 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Nozzle shift breakdown — readings + deviations */}
          {reportData.shift_breakdown && (
            <div className="mb-6">
              <h3 className="text-md font-semibold text-content-primary mb-3">Shift-by-Shift Readings</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-surface-border">
                  <thead className="bg-surface-bg">
                    <tr>
                      <th className="px-3 py-3 text-left text-xs font-medium text-content-secondary uppercase">Shift</th>
                      <th className="px-3 py-3 text-left text-xs font-medium text-content-secondary uppercase">Attendant</th>
                      <th className="px-3 py-3 text-right text-xs font-medium text-content-secondary uppercase">Elec Open</th>
                      <th className="px-3 py-3 text-right text-xs font-medium text-content-secondary uppercase">Elec Close</th>
                      <th className="px-3 py-3 text-right text-xs font-medium text-content-secondary uppercase">Mech Open</th>
                      <th className="px-3 py-3 text-right text-xs font-medium text-content-secondary uppercase">Mech Close</th>
                      <th className="px-3 py-3 text-right text-xs font-medium text-content-secondary uppercase">Volume (L)</th>
                      <th className="px-3 py-3 text-right text-xs font-medium text-content-secondary uppercase">Deviation (L)</th>
                    </tr>
                  </thead>
                  <tbody className="bg-surface-card divide-y divide-surface-border">
                    {reportData.shift_breakdown.map((row: any, i: number) => (
                      <tr key={i} className={`hover:bg-surface-bg ${row.deviation_flagged ? 'bg-status-error-light' : ''}`}>
                        <td className="px-3 py-3 text-sm text-content-primary whitespace-nowrap">
                          {row.date} {row.shift_type}
                        </td>
                        <td className="px-3 py-3 text-sm text-content-secondary">{row.staff_name}</td>
                        <td className="px-3 py-3 text-sm text-content-secondary text-right font-mono">{row.electronic_opening?.toLocaleString()}</td>
                        <td className="px-3 py-3 text-sm text-content-secondary text-right font-mono">{row.electronic_closing?.toLocaleString()}</td>
                        <td className="px-3 py-3 text-sm text-content-secondary text-right font-mono">{row.mechanical_opening?.toLocaleString()}</td>
                        <td className="px-3 py-3 text-sm text-content-secondary text-right font-mono">{row.mechanical_closing?.toLocaleString()}</td>
                        <td className="px-3 py-3 text-sm text-content-primary text-right font-mono font-semibold">{row.volume_sold?.toLocaleString()}</td>
                        <td className={`px-3 py-3 text-sm text-right font-mono font-semibold ${row.deviation_flagged ? 'text-status-error' : 'text-content-secondary'}`}>
                          {row.deviation_liters}
                          {row.deviation_flagged && ' ⚠'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Period totals */}
              {reportData.summary?.overall_deviation !== undefined && (
                <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-surface-bg rounded-lg p-3">
                    <p className="text-xs text-content-secondary">Period Electronic</p>
                    <p className="text-sm font-mono font-semibold text-content-primary">
                      {reportData.summary.electronic_opening?.toLocaleString()} → {reportData.summary.electronic_closing?.toLocaleString()}
                    </p>
                  </div>
                  <div className="bg-surface-bg rounded-lg p-3">
                    <p className="text-xs text-content-secondary">Period Mechanical</p>
                    <p className="text-sm font-mono font-semibold text-content-primary">
                      {reportData.summary.mechanical_opening?.toLocaleString()} → {reportData.summary.mechanical_closing?.toLocaleString()}
                    </p>
                  </div>
                  <div className="bg-surface-bg rounded-lg p-3">
                    <p className="text-xs text-content-secondary">Total Volume</p>
                    <p className="text-sm font-mono font-semibold text-content-primary">{reportData.summary.total_volume?.toLocaleString()} L</p>
                  </div>
                  <div className={`rounded-lg p-3 ${reportData.summary.deviation_flagged ? 'bg-status-error-light' : 'bg-surface-bg'}`}>
                    <p className="text-xs text-content-secondary">Overall Deviation</p>
                    <p className={`text-sm font-mono font-semibold ${reportData.summary.deviation_flagged ? 'text-status-error' : 'text-content-primary'}`}>
                      {reportData.summary.overall_deviation} L {reportData.summary.deviation_flagged ? '⚠' : ''}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Help section */}
      <div className="mt-6 bg-action-primary-light border border-action-primary rounded-lg p-4">
        <h3 className="text-sm font-semibold text-action-primary mb-2">Report Types Guide</h3>
        <ul className="text-sm text-action-primary space-y-1">
          <li><strong>Staff Performance:</strong> View individual employee transactions and revenue</li>
          <li><strong>Nozzle Report:</strong> Track specific nozzle readings and volume</li>
          <li><strong>Island Report:</strong> Analyze pump station performance</li>
          <li><strong>Product Sales:</strong> View sales by product type (Petrol, Diesel, etc.)</li>
          <li><strong>Custom Multi-Filter:</strong> Combine multiple filters for detailed analysis</li>
          <li><strong>Daily Summary:</strong> Complete operations summary for a specific date</li>
          <li><strong>Monthly Summary:</strong> Aggregate data for an entire month</li>
        </ul>
      </div>
    </div>
  )
}
