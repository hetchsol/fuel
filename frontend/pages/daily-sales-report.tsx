import { useState, useEffect } from 'react'
import LoadingSpinner from '../components/LoadingSpinner'
import { getHeaders } from '../lib/api'

const BASE = '/api/v1'

interface DailySalesReport {
  date: string
  diesel: {
    total_volume: number
    total_amount: number
    sales_count: number
    shifts: string[]
    sales: any[]
  }
  petrol: {
    total_volume: number
    total_amount: number
    sales_count: number
    shifts: string[]
    sales: any[]
  }
  summary: {
    total_volume: number
    total_revenue: number
    total_transactions: number
  }
}

export default function DailySalesReport() {
  const [selectedDate, setSelectedDate] = useState<string>('')
  const [report, setReport] = useState<DailySalesReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Set default date to today
  useEffect(() => {
    const today = new Date()
    const year = today.getFullYear()
    const month = String(today.getMonth() + 1).padStart(2, '0')
    const day = String(today.getDate()).padStart(2, '0')
    setSelectedDate(`${year}-${month}-${day}`)
  }, [])

  // Load report when date changes
  useEffect(() => {
    if (selectedDate) {
      loadReport(selectedDate)
    }
  }, [selectedDate])

  const loadReport = async (date: string) => {
    setLoading(true)
    setError('')

    try {
      const res = await fetch(`${BASE}/sales-reports/daily/${date}`, {
        headers: getHeaders(),
      })

      if (!res.ok) {
        throw new Error('Failed to load report')
      }

      const data = await res.json()
      setReport(data)
    } catch (err: any) {
      setError(err.message || 'Error loading report')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Daily Sales Report</h1>
        <p className="text-content-secondary mt-2">View diesel and petrol sales by date</p>
      </div>

      {/* Date Selector */}
      <div className="bg-surface-card p-4 rounded-lg shadow mb-6">
        <div className="flex items-center space-x-4">
          <label className="text-sm font-medium text-content-secondary">Select Date:</label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-3 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-action-primary focus:border-action-primary"
          />
          <button
            onClick={() => loadReport(selectedDate)}
            className="px-4 py-2 bg-action-primary text-white rounded-md hover:bg-action-primary-hover"
          >
            Load Report
          </button>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <LoadingSpinner text="Loading report..." />
      )}

      {/* Error State */}
      {error && (
        <div className="bg-status-error-light border border-status-error p-4 rounded-lg">
          <p className="text-status-error">{error}</p>
        </div>
      )}

      {/* Report Display */}
      {!loading && report && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-surface-card p-6 rounded-lg shadow border-l-4 border-action-primary">
              <p className="text-sm text-content-secondary">Total Volume</p>
              <p className="text-2xl font-bold">{report.summary.total_volume.toLocaleString()} L</p>
            </div>
            <div className="bg-surface-card p-6 rounded-lg shadow border-l-4 border-status-success">
              <p className="text-sm text-content-secondary">Total Revenue</p>
              <p className="text-2xl font-bold">K{report.summary.total_revenue.toLocaleString()}</p>
            </div>
            <div className="bg-surface-card p-6 rounded-lg shadow border-l-4 border-category-a">
              <p className="text-sm text-content-secondary">Transactions</p>
              <p className="text-2xl font-bold">{report.summary.total_transactions}</p>
            </div>
          </div>

          {/* Diesel Sales */}
          <div className="bg-surface-card rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">🛢️ Diesel Sales</h2>
              <span className="text-sm text-content-secondary">{report.diesel.sales_count} transactions</span>
            </div>

            {report.diesel.sales_count > 0 ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-surface-bg p-4 rounded">
                    <p className="text-sm text-content-secondary">Total Volume</p>
                    <p className="text-xl font-bold text-content-primary">{report.diesel.total_volume.toLocaleString()} L</p>
                  </div>
                  <div className="bg-surface-bg p-4 rounded">
                    <p className="text-sm text-content-secondary">Total Amount</p>
                    <p className="text-xl font-bold text-status-success">K{report.diesel.total_amount.toLocaleString()}</p>
                  </div>
                </div>

                <div>
                  <p className="text-sm font-medium text-content-secondary mb-2">Shifts:</p>
                  <div className="flex flex-wrap gap-2">
                    {report.diesel.shifts.map((shift, idx) => (
                      <span key={idx} className="px-3 py-1 bg-action-primary-light text-action-primary rounded-full text-sm">
                        {shift}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="border-t pt-4">
                  <p className="text-sm font-medium text-content-secondary mb-3">Transaction Details:</p>
                  <div className="space-y-2">
                    {report.diesel.sales.map((sale, idx) => (
                      <div key={idx} className="bg-surface-bg p-3 rounded flex justify-between items-center">
                        <div>
                          <p className="text-sm font-medium">{sale.shift_id}</p>
                          <p className="text-xs text-content-secondary">
                            Vol: {sale.average_volume.toFixed(2)}L |
                            Disc: {sale.discrepancy_percent.toFixed(4)}%
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-status-success">K{sale.total_amount.toFixed(2)}</p>
                          <p className="text-xs text-content-secondary">@K{sale.unit_price.toFixed(2)}/L</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-content-secondary text-center py-4">No diesel sales for this date</p>
            )}
          </div>

          {/* Petrol Sales */}
          <div className="bg-surface-card rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">⛽ Petrol Sales</h2>
              <span className="text-sm text-content-secondary">{report.petrol.sales_count} transactions</span>
            </div>

            {report.petrol.sales_count > 0 ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-surface-bg p-4 rounded">
                    <p className="text-sm text-content-secondary">Total Volume</p>
                    <p className="text-xl font-bold text-content-primary">{report.petrol.total_volume.toLocaleString()} L</p>
                  </div>
                  <div className="bg-surface-bg p-4 rounded">
                    <p className="text-sm text-content-secondary">Total Amount</p>
                    <p className="text-xl font-bold text-status-success">K{report.petrol.total_amount.toLocaleString()}</p>
                  </div>
                </div>

                <div>
                  <p className="text-sm font-medium text-content-secondary mb-2">Shifts:</p>
                  <div className="flex flex-wrap gap-2">
                    {report.petrol.shifts.map((shift, idx) => (
                      <span key={idx} className="px-3 py-1 bg-status-success-light text-status-success rounded-full text-sm">
                        {shift}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="border-t pt-4">
                  <p className="text-sm font-medium text-content-secondary mb-3">Transaction Details:</p>
                  <div className="space-y-2">
                    {report.petrol.sales.map((sale, idx) => (
                      <div key={idx} className="bg-surface-bg p-3 rounded flex justify-between items-center">
                        <div>
                          <p className="text-sm font-medium">{sale.shift_id}</p>
                          <p className="text-xs text-content-secondary">
                            Vol: {sale.average_volume.toFixed(2)}L |
                            Disc: {sale.discrepancy_percent.toFixed(4)}%
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-status-success">K{sale.total_amount.toFixed(2)}</p>
                          <p className="text-xs text-content-secondary">@K{sale.unit_price.toFixed(2)}/L</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-content-secondary text-center py-4">No petrol sales for this date</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
