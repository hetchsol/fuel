import { useState } from 'react'
import { getHeaders } from '../lib/api'

const BASE = '/api/v1'

export default function Reconciliation() {
  const today = new Date().toISOString().split('T')[0]
  const [selectedDate, setSelectedDate] = useState(today)
  const [reconciliations, setReconciliations] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const fetchReconciliations = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${BASE}/reconciliation/date/${selectedDate}`, {
        headers: getHeaders()
      })
      if (!res.ok) {
        throw new Error('Failed to fetch reconciliations')
      }
      const data = await res.json()
      setReconciliations(data)
    } catch (err: any) {
      setError(err.message || 'Failed to load reconciliation data')
      setReconciliations([])
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (amount: number) => {
    return `ZMW ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const getShiftIcon = (shiftType: string) => {
    return shiftType === 'Day' ? '☀️' : '🌙'
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-content-primary">Shift Reconciliation Dashboard</h1>
        <p className="mt-2 text-sm text-content-secondary">Daily cash and inventory reconciliation - Matching Excel Summary Sheet</p>
      </div>

      {/* Date Selector */}
      <div className="mb-6 bg-surface-card rounded-lg shadow p-4">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-content-secondary mb-2">
              Select Date to View Reconciliation
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full sm:w-auto px-4 py-2 border border-surface-border rounded-md focus:outline-none focus:ring-action-primary focus:border-action-primary"
            />
          </div>
          <button
            onClick={fetchReconciliations}
            disabled={loading}
            className="px-6 py-2 bg-action-primary text-white font-semibold rounded-md hover:bg-action-primary-hover focus:outline-none focus:ring-2 focus:ring-action-primary disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Load Reconciliation'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-status-error-light border border-status-error rounded-lg">
          <p className="text-status-error">{error}</p>
        </div>
      )}

      {/* Reconciliation Cards */}
      {reconciliations.length === 0 && !loading && !error && (
        <div className="bg-status-pending-light border border-status-warning rounded-lg p-6 text-center">
          <p className="text-status-warning">No reconciliation data found for {selectedDate}. Select a date and click Load.</p>
        </div>
      )}

      <div className="space-y-6">
        {reconciliations.map((recon, index) => (
          <div
            key={index}
            className={`rounded-lg shadow-lg border-2 ${
              recon.shift_type === 'Day'
                ? 'bg-status-pending-light border-status-warning'
                : 'bg-category-d-light border-category-d-border'
            }`}
          >
            {/* Header */}
            <div className="p-6 border-b border-surface-border">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-content-primary flex items-center gap-2">
                    {getShiftIcon(recon.shift_type)} {recon.shift_type} Shift Reconciliation
                  </h2>
                  <p className="text-sm text-content-secondary mt-1">
                    {recon.date} | Shift ID: {recon.shift_id}
                  </p>
                </div>
                {recon.difference !== null && (
                  <div className={`px-4 py-2 rounded-lg font-bold text-lg ${
                    recon.difference === 0
                      ? 'bg-status-success-light text-status-success border-2 border-status-success'
                      : recon.difference > 0
                      ? 'bg-action-primary-light text-action-primary border-2 border-action-primary'
                      : 'bg-status-error-light text-status-error border-2 border-status-error'
                  }`}>
                    {recon.difference > 0 ? '+' : ''}{formatCurrency(recon.difference)}
                  </div>
                )}
              </div>
            </div>

            {/* Revenue Breakdown */}
            <div className="p-6">
              <h3 className="text-lg font-bold text-content-primary mb-4">💰 Revenue Breakdown</h3>

              {/* VAT Calculation Section */}
              <div className="mb-6 bg-category-d-light rounded-lg p-4 border-2 border-category-d-border">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-sm font-semibold text-content-secondary">VAT Included (16%)</p>
                    <p className="text-xs text-content-secondary mt-1">
                      Petrol + Diesel Fuel Sales Only
                    </p>
                    <p className="text-xs text-category-d mt-1">
                      Formula: (Revenue × 0.16) ÷ 1.16
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-category-d">
                      {formatCurrency(((recon.petrol_revenue + recon.diesel_revenue) * 0.16 / 1.16))}
                    </p>
                    <p className="text-xs text-category-d">16% VAT on Fuel</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
                <div className="bg-surface-card rounded-lg p-4 border border-action-primary">
                  <p className="text-xs text-content-secondary font-medium">Petrol Revenue</p>
                  <p className="text-xl font-bold text-action-primary mt-1">
                    {formatCurrency(recon.petrol_revenue)}
                  </p>
                  <p className="text-xs text-content-secondary mt-1">
                    @ ZMW 29.92/L
                  </p>
                </div>

                <div className="bg-surface-card rounded-lg p-4 border border-category-c-border">
                  <p className="text-xs text-content-secondary font-medium">Diesel Revenue</p>
                  <p className="text-xl font-bold text-category-c mt-1">
                    {formatCurrency(recon.diesel_revenue)}
                  </p>
                  <p className="text-xs text-content-secondary mt-1">
                    @ ZMW 26.98/L
                  </p>
                </div>

                <div className="bg-surface-card rounded-lg p-4 border border-category-a-border">
                  <p className="text-xs text-content-secondary font-medium">LPG Revenue</p>
                  <p className="text-xl font-bold text-category-a mt-1">
                    {formatCurrency(recon.lpg_revenue)}
                  </p>
                  <p className="text-xs text-content-secondary mt-1">
                    Gas + Accessories
                  </p>
                </div>

                <div className="bg-surface-card rounded-lg p-4 border border-status-success">
                  <p className="text-xs text-content-secondary font-medium">Lubricants</p>
                  <p className="text-xl font-bold text-status-success mt-1">
                    {formatCurrency(recon.lubricants_revenue)}
                  </p>
                </div>

                <div className="bg-surface-card rounded-lg p-4 border border-cyan-200">
                  <p className="text-xs text-content-secondary font-medium">Accessories</p>
                  <p className="text-xl font-bold text-cyan-700 mt-1">
                    {formatCurrency(recon.accessories_revenue)}
                  </p>
                </div>
              </div>

              {/* Total Expected Revenue */}
              <div className="mt-6 bg-action-primary-light rounded-lg p-5 border-2 border-action-primary">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-sm font-semibold text-content-secondary">Total Expected Revenue (All Products)</p>
                    <p className="text-xs text-content-secondary mt-1">Petrol + Diesel + LPG + Lubricants + Accessories</p>
                  </div>
                  <p className="text-3xl font-bold text-action-primary">
                    {formatCurrency(recon.total_expected)}
                  </p>
                </div>
              </div>

              {/* Credit Sales Deduction */}
              <div className="mt-4 bg-status-pending-light rounded-lg p-5 border-2 border-status-warning">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-sm font-semibold text-content-secondary">Less: Credit Sales</p>
                    <p className="text-xs text-content-secondary mt-1">Institutional & Corporate Accounts</p>
                  </div>
                  <p className="text-2xl font-bold text-status-warning">
                    - {formatCurrency(recon.credit_sales_total)}
                  </p>
                </div>
              </div>

              {/* Expected Cash */}
              <div className="mt-4 bg-status-success-light rounded-lg p-5 border-2 border-status-success">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-sm font-semibold text-content-secondary">Expected Cash</p>
                    <p className="text-xs text-content-secondary mt-1">Total Revenue - Credit Sales</p>
                  </div>
                  <p className="text-3xl font-bold text-status-success">
                    {formatCurrency(recon.expected_cash)}
                  </p>
                </div>
              </div>

              {/* Actual Deposited */}
              {recon.actual_deposited !== null && (
                <>
                  <div className="mt-4 bg-surface-bg rounded-lg p-5 border-2 border-surface-border">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-sm font-semibold text-content-secondary">Actual Cash Deposited</p>
                        <p className="text-xs text-content-secondary mt-1">Bank deposit amount</p>
                      </div>
                      <p className="text-3xl font-bold text-content-primary">
                        {formatCurrency(recon.actual_deposited)}
                      </p>
                    </div>
                  </div>

                  {/* Difference Analysis */}
                  <div className={`mt-4 rounded-lg p-5 border-2 ${
                    recon.difference === 0
                      ? 'bg-status-success-light border-status-success'
                      : recon.difference > 0
                      ? 'bg-action-primary-light border-action-primary'
                      : 'bg-status-error-light border-status-error'
                  }`}>
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-sm font-semibold text-content-secondary">
                          {recon.difference === 0
                            ? '✅ Perfect Match'
                            : recon.difference > 0
                            ? '📈 Overage (Excess Cash)'
                            : '📉 Shortage (Cash Short)'}
                        </p>
                        <p className="text-xs text-content-secondary mt-1">Actual - Expected</p>
                      </div>
                      <p className={`text-3xl font-bold ${
                        recon.difference === 0
                          ? 'text-status-success'
                          : recon.difference > 0
                          ? 'text-action-primary'
                          : 'text-status-error'
                      }`}>
                        {recon.difference > 0 ? '+' : ''}{formatCurrency(recon.difference)}
                      </p>
                    </div>
                  </div>

                  {/* Cumulative Difference */}
                  <div className="mt-4 bg-category-a-light rounded-lg p-4 border-2 border-category-a-border">
                    <div className="flex justify-between items-center">
                      <p className="text-sm font-semibold text-category-a">Cumulative Difference (Running Total)</p>
                      <p className="text-xl font-bold text-category-a">
                        {recon.cumulative_difference > 0 ? '+' : ''}{formatCurrency(recon.cumulative_difference)}
                      </p>
                    </div>
                  </div>

                  {/* Loss/Gain Percentage */}
                  <div className="mt-4 bg-category-c-light rounded-lg p-4 border-2 border-category-c-border">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-sm font-semibold text-category-c">
                          {recon.difference < 0 ? '📉 Loss Percentage' : recon.difference > 0 ? '📈 Gain Percentage' : '⚖️ Perfect Balance'}
                        </p>
                        <p className="text-xs text-category-c mt-1">
                          (Actual - Expected) / Expected × 100
                        </p>
                      </div>
                      <p className={`text-2xl font-bold ${
                        Math.abs((recon.difference / recon.expected_cash) * 100) < 0.5 ? 'text-status-success' :
                        Math.abs((recon.difference / recon.expected_cash) * 100) < 2 ? 'text-status-warning' : 'text-status-error'
                      }`}>
                        {recon.expected_cash > 0 ? (
                          <>
                            {((recon.difference / recon.expected_cash) * 100).toFixed(3)}%
                          </>
                        ) : '0.000%'}
                      </p>
                    </div>
                    {Math.abs((recon.difference / recon.expected_cash) * 100) >= 2 && (
                      <div className="mt-2 pt-2 border-t border-category-c-border">
                        <p className="text-xs text-status-error font-semibold">
                          ⚠️ Variance exceeds 2% threshold - Requires investigation
                        </p>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Notes */}
              {recon.notes && (
                <div className="mt-4 bg-surface-bg rounded-lg p-4 border border-surface-border">
                  <p className="text-xs font-semibold text-content-secondary">Notes:</p>
                  <p className="text-sm text-content-primary mt-1">{recon.notes}</p>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* System Info */}
      <div className="mt-8 bg-action-primary-light border border-action-primary rounded-lg p-4">
        <h3 className="text-sm font-semibold text-action-primary mb-2">Reconciliation System - Matching Excel Summary Sheet</h3>
        <ul className="text-sm text-action-primary space-y-1">
          <li>• <strong>Total Expected Revenue</strong> = Sum of all product revenues (Petrol, Diesel, LPG, Lubricants, Accessories)</li>
          <li>• <strong>Credit Sales</strong> = Total sales made on credit to institutional/corporate accounts</li>
          <li>• <strong>Expected Cash</strong> = Total Expected Revenue - Credit Sales</li>
          <li>• <strong>Difference</strong> = Actual Deposited - Expected Cash</li>
          <li>• <strong>Positive Difference</strong> = Overage (excess cash found)</li>
          <li>• <strong>Negative Difference</strong> = Shortage (cash missing)</li>
          <li>• <strong>Cumulative Difference</strong> = Running total of all variances for loss/gain tracking</li>
        </ul>
      </div>
    </div>
  )
}
