import { useState } from 'react'

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
        headers: {
          'X-Station-Id': localStorage.getItem('stationId') || 'ST001',
        }
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
        <h1 className="text-3xl font-bold text-gray-900">Shift Reconciliation Dashboard</h1>
        <p className="mt-2 text-sm text-gray-600">Daily cash and inventory reconciliation - Matching Excel Summary Sheet</p>
      </div>

      {/* Date Selector */}
      <div className="mb-6 bg-white rounded-lg shadow p-4">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Date to View Reconciliation
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full sm:w-auto px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <button
            onClick={fetchReconciliations}
            disabled={loading}
            className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Load Reconciliation'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {/* Reconciliation Cards */}
      {reconciliations.length === 0 && !loading && !error && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
          <p className="text-yellow-800">No reconciliation data found for {selectedDate}. Select a date and click Load.</p>
        </div>
      )}

      <div className="space-y-6">
        {reconciliations.map((recon, index) => (
          <div
            key={index}
            className={`rounded-lg shadow-lg border-2 ${
              recon.shift_type === 'Day'
                ? 'bg-gradient-to-br from-yellow-50 to-orange-50 border-yellow-300'
                : 'bg-gradient-to-br from-indigo-50 to-purple-50 border-indigo-300'
            }`}
          >
            {/* Header */}
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                    {getShiftIcon(recon.shift_type)} {recon.shift_type} Shift Reconciliation
                  </h2>
                  <p className="text-sm text-gray-600 mt-1">
                    {recon.date} | Shift ID: {recon.shift_id}
                  </p>
                </div>
                {recon.difference !== null && (
                  <div className={`px-4 py-2 rounded-lg font-bold text-lg ${
                    recon.difference === 0
                      ? 'bg-green-100 text-green-800 border-2 border-green-300'
                      : recon.difference > 0
                      ? 'bg-blue-100 text-blue-800 border-2 border-blue-300'
                      : 'bg-red-100 text-red-800 border-2 border-red-300'
                  }`}>
                    {recon.difference > 0 ? '+' : ''}{formatCurrency(recon.difference)}
                  </div>
                )}
              </div>
            </div>

            {/* Revenue Breakdown */}
            <div className="p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">💰 Revenue Breakdown</h3>

              {/* VAT Calculation Section */}
              <div className="mb-6 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg p-4 border-2 border-indigo-200">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-sm font-semibold text-gray-700">VAT Included (16%)</p>
                    <p className="text-xs text-gray-600 mt-1">
                      Petrol + Diesel Fuel Sales Only
                    </p>
                    <p className="text-xs text-indigo-600 mt-1">
                      Formula: (Revenue × 0.16) ÷ 1.16
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-indigo-900">
                      {formatCurrency(((recon.petrol_revenue + recon.diesel_revenue) * 0.16 / 1.16))}
                    </p>
                    <p className="text-xs text-indigo-600">16% VAT on Fuel</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
                <div className="bg-white rounded-lg p-4 border border-blue-200">
                  <p className="text-xs text-gray-600 font-medium">Petrol Revenue</p>
                  <p className="text-xl font-bold text-blue-700 mt-1">
                    {formatCurrency(recon.petrol_revenue)}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    @ ZMW 29.92/L
                  </p>
                </div>

                <div className="bg-white rounded-lg p-4 border border-orange-200">
                  <p className="text-xs text-gray-600 font-medium">Diesel Revenue</p>
                  <p className="text-xl font-bold text-orange-700 mt-1">
                    {formatCurrency(recon.diesel_revenue)}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    @ ZMW 26.98/L
                  </p>
                </div>

                <div className="bg-white rounded-lg p-4 border border-purple-200">
                  <p className="text-xs text-gray-600 font-medium">LPG Revenue</p>
                  <p className="text-xl font-bold text-purple-700 mt-1">
                    {formatCurrency(recon.lpg_revenue)}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Gas + Accessories
                  </p>
                </div>

                <div className="bg-white rounded-lg p-4 border border-green-200">
                  <p className="text-xs text-gray-600 font-medium">Lubricants</p>
                  <p className="text-xl font-bold text-green-700 mt-1">
                    {formatCurrency(recon.lubricants_revenue)}
                  </p>
                </div>

                <div className="bg-white rounded-lg p-4 border border-cyan-200">
                  <p className="text-xs text-gray-600 font-medium">Accessories</p>
                  <p className="text-xl font-bold text-cyan-700 mt-1">
                    {formatCurrency(recon.accessories_revenue)}
                  </p>
                </div>
              </div>

              {/* Total Expected Revenue */}
              <div className="mt-6 bg-gradient-to-r from-blue-100 to-indigo-100 rounded-lg p-5 border-2 border-blue-300">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-sm font-semibold text-gray-700">Total Expected Revenue (All Products)</p>
                    <p className="text-xs text-gray-600 mt-1">Petrol + Diesel + LPG + Lubricants + Accessories</p>
                  </div>
                  <p className="text-3xl font-bold text-blue-900">
                    {formatCurrency(recon.total_expected)}
                  </p>
                </div>
              </div>

              {/* Credit Sales Deduction */}
              <div className="mt-4 bg-yellow-50 rounded-lg p-5 border-2 border-yellow-300">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-sm font-semibold text-gray-700">Less: Credit Sales</p>
                    <p className="text-xs text-gray-600 mt-1">Institutional & Corporate Accounts</p>
                  </div>
                  <p className="text-2xl font-bold text-yellow-800">
                    - {formatCurrency(recon.credit_sales_total)}
                  </p>
                </div>
              </div>

              {/* Expected Cash */}
              <div className="mt-4 bg-gradient-to-r from-green-100 to-emerald-100 rounded-lg p-5 border-2 border-green-400">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-sm font-semibold text-gray-700">Expected Cash</p>
                    <p className="text-xs text-gray-600 mt-1">Total Revenue - Credit Sales</p>
                  </div>
                  <p className="text-3xl font-bold text-green-900">
                    {formatCurrency(recon.expected_cash)}
                  </p>
                </div>
              </div>

              {/* Actual Deposited */}
              {recon.actual_deposited !== null && (
                <>
                  <div className="mt-4 bg-gray-100 rounded-lg p-5 border-2 border-gray-300">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-sm font-semibold text-gray-700">Actual Cash Deposited</p>
                        <p className="text-xs text-gray-600 mt-1">Bank deposit amount</p>
                      </div>
                      <p className="text-3xl font-bold text-gray-900">
                        {formatCurrency(recon.actual_deposited)}
                      </p>
                    </div>
                  </div>

                  {/* Difference Analysis */}
                  <div className={`mt-4 rounded-lg p-5 border-2 ${
                    recon.difference === 0
                      ? 'bg-green-50 border-green-400'
                      : recon.difference > 0
                      ? 'bg-blue-50 border-blue-400'
                      : 'bg-red-50 border-red-400'
                  }`}>
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-sm font-semibold text-gray-700">
                          {recon.difference === 0
                            ? '✅ Perfect Match'
                            : recon.difference > 0
                            ? '📈 Overage (Excess Cash)'
                            : '📉 Shortage (Cash Short)'}
                        </p>
                        <p className="text-xs text-gray-600 mt-1">Actual - Expected</p>
                      </div>
                      <p className={`text-3xl font-bold ${
                        recon.difference === 0
                          ? 'text-green-900'
                          : recon.difference > 0
                          ? 'text-blue-900'
                          : 'text-red-900'
                      }`}>
                        {recon.difference > 0 ? '+' : ''}{formatCurrency(recon.difference)}
                      </p>
                    </div>
                  </div>

                  {/* Cumulative Difference */}
                  <div className="mt-4 bg-purple-50 rounded-lg p-4 border-2 border-purple-300">
                    <div className="flex justify-between items-center">
                      <p className="text-sm font-semibold text-purple-900">Cumulative Difference (Running Total)</p>
                      <p className="text-xl font-bold text-purple-900">
                        {recon.cumulative_difference > 0 ? '+' : ''}{formatCurrency(recon.cumulative_difference)}
                      </p>
                    </div>
                  </div>

                  {/* Loss/Gain Percentage */}
                  <div className="mt-4 bg-gradient-to-r from-orange-50 to-red-50 rounded-lg p-4 border-2 border-orange-300">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-sm font-semibold text-orange-900">
                          {recon.difference < 0 ? '📉 Loss Percentage' : recon.difference > 0 ? '📈 Gain Percentage' : '⚖️ Perfect Balance'}
                        </p>
                        <p className="text-xs text-orange-700 mt-1">
                          (Actual - Expected) / Expected × 100
                        </p>
                      </div>
                      <p className={`text-2xl font-bold ${
                        Math.abs((recon.difference / recon.expected_cash) * 100) < 0.5 ? 'text-green-700' :
                        Math.abs((recon.difference / recon.expected_cash) * 100) < 2 ? 'text-yellow-700' : 'text-red-700'
                      }`}>
                        {recon.expected_cash > 0 ? (
                          <>
                            {((recon.difference / recon.expected_cash) * 100).toFixed(3)}%
                          </>
                        ) : '0.000%'}
                      </p>
                    </div>
                    {Math.abs((recon.difference / recon.expected_cash) * 100) >= 2 && (
                      <div className="mt-2 pt-2 border-t border-orange-200">
                        <p className="text-xs text-red-800 font-semibold">
                          ⚠️ Variance exceeds 2% threshold - Requires investigation
                        </p>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Notes */}
              {recon.notes && (
                <div className="mt-4 bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <p className="text-xs font-semibold text-gray-700">Notes:</p>
                  <p className="text-sm text-gray-800 mt-1">{recon.notes}</p>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* System Info */}
      <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-blue-900 mb-2">Reconciliation System - Matching Excel Summary Sheet</h3>
        <ul className="text-sm text-blue-700 space-y-1">
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
