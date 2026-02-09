import { useState, useEffect } from 'react'
import { getStaffList, getNozzleList, getIslandList, getProductList } from '../lib/api'

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000/api/v1'

export default function AdvancedReports() {
  const [reportType, setReportType] = useState('custom')
  const [loading, setLoading] = useState(false)
  const [reportData, setReportData] = useState<any>(null)
  const [error, setError] = useState('')

  // Filter states
  const [filters, setFilters] = useState({
    staff_name: '',
    nozzle_id: '',
    island_id: '',
    product_type: '',
    shift_id: '',
    start_date: '',
    end_date: ''
  })

  const [specificId, setSpecificId] = useState('')

  // Dropdown lists
  const [staffList, setStaffList] = useState<string[]>([])
  const [nozzleList, setNozzleList] = useState<string[]>([])
  const [islandList, setIslandList] = useState<string[]>([])
  const [productList, setProductList] = useState<string[]>(['Petrol', 'Diesel', 'LPG', 'Lubricants', 'Accessories'])
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
            getProductList().catch(() => ({ product_types: productTypes }))
          ])
          setStaffList(staffData.staff_names || [])
          setNozzleList(nozzleData.nozzle_ids || [])
          setIslandList(islandData.island_ids || [])
          setProductList(productData.product_types || productTypes)
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

      const response = await fetch(url, {
        headers: {
          'X-Station-Id': localStorage.getItem('stationId') || 'ST001'
        }
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

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Advanced Reports</h1>
        <p className="mt-2 text-sm text-gray-600">
          Filter and analyze data by staff, nozzle, island, product, and more
        </p>
      </div>

      {/* Report Type Selection */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Select Report Type</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {reportTypes.map((type) => (
            <button
              key={type.value}
              onClick={() => {
                setReportType(type.value)
                setReportData(null)
                setError('')
                setSpecificId('') // Reset selection when changing report type
              }}
              className={`p-4 rounded-lg border-2 transition-all ${
                reportType === type.value
                  ? 'border-blue-500 bg-blue-50 text-blue-900'
                  : 'border-gray-200 hover:border-gray-300 text-gray-700'
              }`}
            >
              <div className="text-2xl mb-1">{type.icon}</div>
              <div className="text-xs font-medium">{type.label}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Filters</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Specific ID input for staff/nozzle/island/product */}
          {['staff', 'nozzle', 'island', 'product'].includes(reportType) && (
            <div className="md:col-span-2 lg:col-span-3">
              <label className="block text-sm font-medium text-gray-700 mb-2">
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
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
                <select
                  value={specificId}
                  onChange={(e) => setSpecificId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Select Product Type</option>
                  {productList.map((product) => (
                    <option key={product} value={product}>
                      {product}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Custom filters */}
          {reportType === 'custom' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Staff Name</label>
                <select
                  value={filters.staff_name}
                  onChange={(e) => setFilters({ ...filters, staff_name: e.target.value })}
                  disabled={loadingLists}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
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
                <label className="block text-sm font-medium text-gray-700 mb-2">Nozzle ID</label>
                <select
                  value={filters.nozzle_id}
                  onChange={(e) => setFilters({ ...filters, nozzle_id: e.target.value })}
                  disabled={loadingLists}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
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
                <label className="block text-sm font-medium text-gray-700 mb-2">Island ID</label>
                <select
                  value={filters.island_id}
                  onChange={(e) => setFilters({ ...filters, island_id: e.target.value })}
                  disabled={loadingLists}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
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
                <label className="block text-sm font-medium text-gray-700 mb-2">Product Type</label>
                <select
                  value={filters.product_type}
                  onChange={(e) => setFilters({ ...filters, product_type: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
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
                <label className="block text-sm font-medium text-gray-700 mb-2">Shift ID</label>
                <input
                  type="text"
                  value={filters.shift_id}
                  onChange={(e) => setFilters({ ...filters, shift_id: e.target.value })}
                  placeholder="Filter by shift (optional)"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </>
          )}

          {/* Date filters */}
          {!['monthly'].includes(reportType) && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {reportType === 'daily' ? 'Date' : 'Start Date'}
              </label>
              <input
                type="date"
                value={filters.start_date}
                onChange={(e) => setFilters({ ...filters, start_date: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          )}

          {!['daily', 'monthly'].includes(reportType) && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">End Date</label>
              <input
                type="date"
                value={filters.end_date}
                onChange={(e) => setFilters({ ...filters, end_date: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          )}

          {reportType === 'monthly' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Month</label>
              <input
                type="month"
                value={filters.start_date.substring(0, 7)}
                onChange={(e) => setFilters({ ...filters, start_date: e.target.value + '-01' })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          )}
        </div>

        <div className="mt-4 flex gap-3">
          <button
            onClick={generateReport}
            disabled={loading}
            className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
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
                start_date: '',
                end_date: ''
              })
              setSpecificId('')
              setReportData(null)
              setError('')
            }}
            className="px-6 py-2 bg-gray-200 text-gray-700 font-semibold rounded-md hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-400"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {/* Results */}
      {reportData && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Report Results</h2>

          {/* Summary section */}
          {reportData.summary && (
            <div className="mb-6">
              <h3 className="text-md font-semibold text-gray-800 mb-3">Summary</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {Object.entries(reportData.summary).map(([key, value]: [string, any]) => (
                  <div key={key} className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                    <p className="text-xs text-gray-600 mb-1">
                      {key.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                    </p>
                    <p className="text-xl font-bold text-blue-900">
                      {typeof value === 'number' && key.includes('revenue')
                        ? formatCurrency(value)
                        : typeof value === 'number'
                        ? value.toLocaleString()
                        : value}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Product breakdown */}
          {reportData.product_breakdown && (
            <div className="mb-6">
              <h3 className="text-md font-semibold text-gray-800 mb-3">Product Breakdown</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Product
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Transactions
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Revenue
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Volume
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {Object.entries(reportData.product_breakdown).map(([product, data]: [string, any]) => (
                      <tr key={product}>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{product}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{data.transactions || data.count}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{formatCurrency(data.revenue)}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{data.volume?.toLocaleString() || 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Raw JSON data */}
          <div className="mt-6">
            <details className="cursor-pointer">
              <summary className="text-sm font-semibold text-gray-700 hover:text-gray-900">
                View Full Report Data (JSON)
              </summary>
              <pre className="mt-2 p-4 bg-gray-50 rounded-lg text-xs overflow-x-auto">
                {JSON.stringify(reportData, null, 2)}
              </pre>
            </details>
          </div>
        </div>
      )}

      {/* Help section */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-blue-900 mb-2">Report Types Guide</h3>
        <ul className="text-sm text-blue-700 space-y-1">
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
