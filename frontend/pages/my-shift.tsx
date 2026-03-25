import { useState, useEffect } from 'react'
import { useTheme } from '../contexts/ThemeContext'
import LoadingSpinner from '../components/LoadingSpinner'
import { getHeaders } from '../lib/api'

const BASE = '/api/v1'

interface NozzleInfo {
  nozzle_id: string
  fuel_type: string
  opening_reading: number
  mechanical_opening_reading: number
  price_per_liter: number
  status: string
  display_label?: string | null
  fuel_type_abbrev?: string | null
}

interface NozzleRow {
  nozzle_id: string
  fuel_type: string
  opening_reading: number
  closing_reading: string
  mechanical_opening: number
  mechanical_closing: string
  price_per_liter: number
  display_label?: string | null
  fuel_type_abbrev?: string | null
}

// Stock count row types
interface LPGCylinderRow {
  size_kg: number
  opening_full: number
  opening_empty: number
  additions: string
  closing_full: string
  closing_empty: string
  sold_refill: string
  sold_with_cylinder: string
  refill_price: number
  price_with_cylinder: number
}

interface AccessoryRow {
  product_code: string
  description: string
  opening_stock: number
  additions: string
  closing_stock: string
  unit_price: number
}

interface LubricantRow {
  product_code: string
  description: string
  category: string
  opening_stock: number
  additions: string
  closing_stock: string
  unit_price: number
}

interface HandoverResult {
  handover_id: string
  shift_id: string
  attendant_name: string
  date: string
  shift_type: string
  nozzle_summaries: {
    nozzle_id: string
    fuel_type: string
    opening_reading: number
    closing_reading: number
    volume_sold: number
    price_per_liter: number
    revenue: number
    mechanical_volume?: number | null
    meter_deviation_percent?: number | null
    meter_deviation_flagged?: boolean | null
  }[]
  fuel_revenue: number
  lpg_sales: number
  lubricant_sales: number
  accessory_sales: number
  total_expected: number
  credit_sales: number
  expected_cash: number
  actual_cash: number
  difference: number
  status: string
  review_status?: string
  created_at: string
}

function getAuthHeaders() {
  return {
    'Content-Type': 'application/json',
    ...getHeaders(),
  }
}

export default function MyShift() {
  const { theme } = useTheme()

  // Shift state
  const [shiftFound, setShiftFound] = useState<boolean | null>(null)
  const [shiftInfo, setShiftInfo] = useState<any>(null)
  const [assignmentInfo, setAssignmentInfo] = useState<any>(null)
  const [nozzleRows, setNozzleRows] = useState<NozzleRow[]>([])

  // Stock count state
  const [lpgRows, setLpgRows] = useState<LPGCylinderRow[]>([])
  const [accessoryRows, setAccessoryRows] = useState<AccessoryRow[]>([])
  const [lubricantRows, setLubricantRows] = useState<LubricantRow[]>([])
  const [lubSearch, setLubSearch] = useState('')

  const [creditSales, setCreditSales] = useState('')
  const [actualCash, setActualCash] = useState('')
  const [notes, setNotes] = useState('')

  // Credit sale line items
  const [creditAccounts, setCreditAccounts] = useState<{account_id: string, account_name: string, account_type: string, default_price_per_liter: number|null}[]>([])
  const [fuelPrices, setFuelPrices] = useState<{Diesel: number, Petrol: number}>({Diesel: 0, Petrol: 0})
  const [creditItems, setCreditItems] = useState<{account_id: string, account_name: string, fuel_type: string, volume: string, price_per_liter: number, amount: number}[]>([])

  // UI state
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [handoverResult, setHandoverResult] = useState<HandoverResult | null>(null)
  const [pastHandovers, setPastHandovers] = useState<HandoverResult[]>([])

  // Meter discrepancy threshold (%)
  const [meterThreshold, setMeterThreshold] = useState<number>(0.5)

  // Wizard step state
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1)

  // Fetch active shift first, then stock opening separately (so stock failure doesn't kill the page)
  useEffect(() => {
    setLoading(true)
    fetch(`${BASE}/handover/my-shift`, { headers: getAuthHeaders() })
      .then(r => r.json())
      .then(shiftData => {
        if (!shiftData.found) {
          setShiftFound(false)
          setLoading(false)
          return
        }

        setShiftFound(true)
        setShiftInfo(shiftData.shift)
        setAssignmentInfo(shiftData.assignment)
        setNozzleRows(
          (shiftData.nozzles || []).map((n: NozzleInfo) => ({
            nozzle_id: n.nozzle_id,
            fuel_type: n.fuel_type,
            opening_reading: n.opening_reading,
            closing_reading: '',
            mechanical_opening: n.mechanical_opening_reading || 0,
            mechanical_closing: '',
            price_per_liter: n.price_per_liter,
            display_label: n.display_label,
            fuel_type_abbrev: n.fuel_type_abbrev,
          }))
        )
        setMeterThreshold(shiftData.meter_discrepancy_threshold ?? 0.5)

        // Fetch credit accounts for line-item entry
        fetch(`${BASE}/handover/credit-accounts`, { headers: getAuthHeaders() })
          .then(r => r.ok ? r.json() : { accounts: [], fuel_prices: { Diesel: 0, Petrol: 0 } })
          .then(data => {
            setCreditAccounts(data.accounts || [])
            setFuelPrices(data.fuel_prices || { Diesel: 0, Petrol: 0 })
          })
          .catch(() => {})

        // Fetch stock opening separately — failure returns empty defaults
        fetch(`${BASE}/handover/stock-opening`, { headers: getAuthHeaders() })
          .then(r => r.ok ? r.json() : Promise.reject())
          .catch(() => ({ lpg_cylinders: [], accessories: [], lubricants: [] }))
          .then(stockData => {
            setLpgRows(
              (stockData.lpg_cylinders || []).map((c: any) => ({
                size_kg: c.size_kg,
                opening_full: c.opening_full || 0,
                opening_empty: c.opening_empty || 0,
                additions: '',
                closing_full: '',
                closing_empty: '',
                sold_refill: '',
                sold_with_cylinder: '',
                refill_price: c.refill_price || 0,
                price_with_cylinder: c.price_with_cylinder || 0,
              }))
            )

            setAccessoryRows(
              (stockData.accessories || []).map((a: any) => ({
                product_code: a.product_code,
                description: a.description,
                opening_stock: a.opening_stock || 0,
                additions: '',
                closing_stock: '',
                unit_price: a.unit_price || 0,
              }))
            )

            setLubricantRows(
              (stockData.lubricants || []).map((l: any) => ({
                product_code: l.product_code,
                description: l.description,
                category: l.category || '',
                opening_stock: l.opening_stock || 0,
                additions: '',
                closing_stock: '',
                unit_price: l.unit_price || 0,
              }))
            )
          })
          .finally(() => setLoading(false))
      })
      .catch(() => {
        setShiftFound(false)
        setLoading(false)
      })
  }, [])

  // Fetch past handovers
  useEffect(() => {
    fetch(`${BASE}/handover/entries`, { headers: getAuthHeaders() })
      .then(r => r.json())
      .then(data => setPastHandovers(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [success])

  // --- Nozzle computation ---
  const nozzleComputations = nozzleRows.map(row => {
    const closing = parseFloat(row.closing_reading)
    if (isNaN(closing) || row.closing_reading === '') {
      return { volume: 0, revenue: 0, valid: false, mechVolume: 0, deviationL: 0, deviationPct: 0, flagged: false, mechValid: row.mechanical_closing === '' ? undefined : false }
    }
    const volume = closing - row.opening_reading
    const revenue = volume >= 0 ? volume * row.price_per_liter : 0

    // Mechanical (totalizer) deviation
    const mechClose = parseFloat(row.mechanical_closing)
    const mechValid = row.mechanical_closing !== '' && !isNaN(mechClose) && mechClose >= row.mechanical_opening
    const mechVolume = mechValid ? mechClose - row.mechanical_opening : 0
    const vol = Math.max(0, volume)
    const deviationL = mechValid ? Math.abs(vol - mechVolume) : 0
    const avg = mechValid ? (vol + mechVolume) / 2 : 0
    const deviationPct = mechValid && avg > 0 ? (deviationL / avg) * 100 : 0
    const flagged = mechValid && deviationPct > meterThreshold

    return {
      volume: Math.max(0, volume),
      revenue: volume >= 0 ? revenue : 0,
      valid: volume >= 0,
      mechVolume,
      deviationL,
      deviationPct,
      flagged,
      mechValid: row.mechanical_closing === '' ? undefined : mechValid,
    }
  })

  const fuelRevenue = nozzleComputations.reduce((s, c) => s + c.revenue, 0)
  const totalVolume = nozzleComputations.reduce((s, c) => s + c.volume, 0)

  // --- LPG cylinder computations ---
  const lpgComputations = lpgRows.map(row => {
    const additions = parseInt(row.additions) || 0
    const closingFull = parseInt(row.closing_full) || 0
    const totalSold = Math.max(0, row.opening_full + additions - closingFull)
    const refill = parseInt(row.sold_refill) || 0
    const withCyl = parseInt(row.sold_with_cylinder) || 0
    const splitValid = refill + withCyl === totalSold
    const value = refill * row.refill_price + withCyl * row.price_with_cylinder
    return { totalSold, refill, withCyl, splitValid, value, additions, closingFull }
  })
  const lpgTotal = lpgComputations.reduce((s, c) => s + c.value, 0)

  // --- Accessory computations ---
  const accComputations = accessoryRows.map(row => {
    const additions = parseInt(row.additions) || 0
    const closing = parseInt(row.closing_stock) || 0
    const sold = Math.max(0, row.opening_stock + additions - closing)
    const value = sold * row.unit_price
    return { sold, value, additions, closing }
  })
  const accessoryTotal = accComputations.reduce((s, c) => s + c.value, 0)

  // --- Lubricant computations ---
  const lubComputations = lubricantRows.map(row => {
    const additions = parseInt(row.additions) || 0
    const closing = parseInt(row.closing_stock) || 0
    const sold = Math.max(0, row.opening_stock + additions - closing)
    const value = sold * row.unit_price
    return { sold, value, additions, closing }
  })
  const lubricantTotal = lubComputations.reduce((s, c) => s + c.value, 0)

  const creditItemsTotal = creditItems.reduce((s, i) => s + i.amount, 0)
  const creditVal = creditAccounts.length > 0 ? creditItemsTotal : (parseFloat(creditSales) || 0)
  const actualCashVal = parseFloat(actualCash) || 0

  const totalExpected = fuelRevenue + lpgTotal + lubricantTotal + accessoryTotal
  const expectedCash = totalExpected - creditVal
  const difference = actualCashVal - expectedCash

  const allClosingsEntered = nozzleRows.length > 0 && nozzleRows.every(r => r.closing_reading !== '')
  const allValid = nozzleComputations.every(c => c.valid || c.volume === 0)
  const allMechEntered = nozzleRows.every(r => r.mechanical_closing !== '')
  const allMechValid = nozzleComputations.every(c => c.mechValid !== false)
  // LPG split validation: for rows where total sold > 0, refill + with_cylinder must equal total
  const lpgSplitValid = lpgComputations.every(c => c.totalSold === 0 || c.splitValid)
  const hasDeviationFlags = nozzleComputations.some(c => c.flagged)

  const canProceedToReview = allClosingsEntered && allValid && allMechEntered && allMechValid && lpgSplitValid
  const canSubmit = currentStep === 3 && allClosingsEntered && allValid && allMechEntered && allMechValid
    && lpgSplitValid && actualCash !== '' && !submitting
    && (!hasDeviationFlags || notes.trim() !== '')

  const updateClosingReading = (nozzleId: string, value: string) => {
    setNozzleRows(prev =>
      prev.map(r => r.nozzle_id === nozzleId ? { ...r, closing_reading: value } : r)
    )
  }

  const updateOpeningReading = (nozzleId: string, value: string) => {
    setNozzleRows(prev =>
      prev.map(r => r.nozzle_id === nozzleId ? { ...r, opening_reading: parseFloat(value) || 0 } : r)
    )
  }

  const updateMechClosing = (nozzleId: string, value: string) => {
    setNozzleRows(prev =>
      prev.map(r => r.nozzle_id === nozzleId ? { ...r, mechanical_closing: value } : r)
    )
  }

  const updateMechOpening = (nozzleId: string, value: string) => {
    setNozzleRows(prev =>
      prev.map(r => r.nozzle_id === nozzleId ? { ...r, mechanical_opening: parseFloat(value) || 0 } : r)
    )
  }

  const updateLpgRow = (idx: number, field: keyof LPGCylinderRow, value: string) => {
    setLpgRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r))
  }

  const updateAccRow = (idx: number, field: keyof AccessoryRow, value: string) => {
    setAccessoryRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r))
  }

  const updateLubRow = (idx: number, field: keyof LubricantRow, value: string) => {
    setLubricantRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r))
  }

  const handleSubmit = async () => {
    if (!shiftInfo) return
    setSubmitting(true)
    setError('')
    setSuccess('')

    try {
      const stockSnapshot = {
        lpg_cylinders: lpgRows.map((row, idx) => ({
          size_kg: row.size_kg,
          opening_full: row.opening_full,
          opening_empty: row.opening_empty,
          additions: parseInt(row.additions) || 0,
          closing_full: parseInt(row.closing_full) || 0,
          closing_empty: parseInt(row.closing_empty) || 0,
          sold_refill: parseInt(row.sold_refill) || 0,
          sold_with_cylinder: parseInt(row.sold_with_cylinder) || 0,
        })),
        accessories: accessoryRows.map((row, idx) => ({
          product_code: row.product_code,
          description: row.description,
          opening_stock: row.opening_stock,
          additions: parseInt(row.additions) || 0,
          closing_stock: parseInt(row.closing_stock) || 0,
        })),
        lubricants: lubricantRows.map((row, idx) => ({
          product_code: row.product_code,
          description: row.description,
          opening_stock: row.opening_stock,
          additions: parseInt(row.additions) || 0,
          closing_stock: parseInt(row.closing_stock) || 0,
        })),
      }

      const res = await fetch(`${BASE}/handover/submit`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          shift_id: shiftInfo.shift_id,
          nozzle_readings: nozzleRows.map(r => ({
            nozzle_id: r.nozzle_id,
            opening_reading: r.opening_reading,
            closing_reading: parseFloat(r.closing_reading) || 0,
            mechanical_opening: r.mechanical_opening,
            mechanical_closing: parseFloat(r.mechanical_closing) || 0,
          })),
          lpg_sales: lpgTotal,
          lubricant_sales: lubricantTotal,
          accessory_sales: accessoryTotal,
          credit_sales: creditVal,
          credit_sale_items: creditItems.map(i => ({
            account_id: i.account_id,
            account_name: i.account_name,
            fuel_type: i.fuel_type,
            volume: parseFloat(i.volume) || 0,
          })),
          actual_cash: actualCashVal,
          notes: notes || null,
          stock_snapshot: stockSnapshot,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || 'Failed to submit handover')
      }

      const result = await res.json()
      setHandoverResult(result)
      setSuccess('Shift handover submitted successfully!')
    } catch (err: any) {
      setError(err.message || 'Submission failed')
    } finally {
      setSubmitting(false)
    }
  }

  const inputStyle = {
    backgroundColor: theme.cardBg,
    color: theme.textPrimary,
    borderColor: theme.border,
  }

  const fmtZMW = (v: number) => v.toLocaleString(undefined, { minimumFractionDigits: 2 })
  const round2 = (v: number) => Math.round(v * 100) / 100

  if (loading) {
    return <LoadingSpinner text="Loading shift data..." />
  }

  if (shiftFound === false) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-4" style={{ color: theme.textPrimary }}>My Shift</h1>
        <div className="rounded-lg shadow p-8 text-center"
          style={{ backgroundColor: theme.cardBg, borderColor: theme.border, borderWidth: 1 }}>
          <div className="text-4xl mb-4">-</div>
          <h2 className="text-lg font-semibold mb-2" style={{ color: theme.textPrimary }}>
            No Active Shift Assigned
          </h2>
          <p className="text-sm" style={{ color: theme.textSecondary }}>
            You don't have an active shift assigned to you. Please contact your supervisor to be assigned to a shift.
          </p>
        </div>
        {pastHandovers.length > 0 && (
          <div className="mt-8">
            <PastHandoversTable handovers={pastHandovers} theme={theme} />
          </div>
        )}
      </div>
    )
  }

  // Filtered lubricant rows for search
  const filteredLubIdx: number[] = []
  lubricantRows.forEach((row, idx) => {
    if (!lubSearch) { filteredLubIdx.push(idx); return }
    const q = lubSearch.toLowerCase()
    if (row.description.toLowerCase().includes(q) || row.category.toLowerCase().includes(q) || row.product_code.toLowerCase().includes(q)) {
      filteredLubIdx.push(idx)
    }
  })

  // Step-specific subtitles
  const stepSubtitles: Record<number, string> = {
    1: 'Enter closing readings and stock counts for your shift',
    2: 'Review your entries before confirming',
    3: 'Complete your cash handover',
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: theme.textPrimary }}>My Shift</h1>
        <p className="text-sm mt-1" style={{ color: theme.textSecondary }}>
          {handoverResult ? 'Shift handover submitted' : stepSubtitles[currentStep]}
        </p>
      </div>

      {error && (
        <div className="rounded-lg p-3 mb-4 text-sm" style={{ backgroundColor: 'var(--color-status-error-light)', color: 'var(--color-status-error)', borderColor: 'var(--color-status-error)', borderWidth: 1 }}>
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg p-3 mb-4 text-sm" style={{ backgroundColor: 'var(--color-status-success-light)', color: 'var(--color-status-success)', borderColor: 'var(--color-status-success)', borderWidth: 1 }}>
          {success}
        </div>
      )}

      {/* Shift Info Card — always visible */}
      <div className="rounded-lg shadow p-4 mb-6"
        style={{ backgroundColor: theme.cardBg, borderColor: theme.border, borderWidth: 1 }}>
        <h2 className="text-sm font-semibold mb-3 uppercase tracking-wide" style={{ color: theme.textSecondary }}>
          Shift Information
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="text-xs" style={{ color: theme.textSecondary }}>Shift ID</div>
            <div className="font-medium text-sm" style={{ color: theme.textPrimary }}>{shiftInfo?.shift_id}</div>
          </div>
          <div>
            <div className="text-xs" style={{ color: theme.textSecondary }}>Date</div>
            <div className="font-medium text-sm" style={{ color: theme.textPrimary }}>{shiftInfo?.date}</div>
          </div>
          <div>
            <div className="text-xs" style={{ color: theme.textSecondary }}>Shift Type</div>
            <div className="font-medium text-sm" style={{ color: theme.textPrimary }}>{shiftInfo?.shift_type}</div>
          </div>
          <div>
            <div className="text-xs" style={{ color: theme.textSecondary }}>Status</div>
            <div className="font-medium text-sm" style={{ color: 'var(--color-status-success)' }}>{shiftInfo?.status}</div>
          </div>
          <div>
            <div className="text-xs" style={{ color: theme.textSecondary }}>Attendant</div>
            <div className="font-medium text-sm" style={{ color: theme.textPrimary }}>{assignmentInfo?.attendant_name}</div>
          </div>
          <div>
            <div className="text-xs" style={{ color: theme.textSecondary }}>Assigned Islands</div>
            <div className="font-medium text-sm" style={{ color: theme.textPrimary }}>
              {assignmentInfo?.island_ids?.join(', ') || 'N/A'}
            </div>
          </div>
          <div>
            <div className="text-xs" style={{ color: theme.textSecondary }}>Assigned Nozzles</div>
            <div className="font-medium text-sm" style={{ color: theme.textPrimary }}>
              {assignmentInfo?.nozzle_ids?.join(', ') || 'N/A'}
            </div>
          </div>
        </div>
      </div>

      {/* Step Indicator — visible before submission */}
      {!handoverResult && (
        <div className="rounded-lg shadow p-4 mb-6 flex items-center justify-center"
          style={{ backgroundColor: theme.cardBg, borderColor: theme.border, borderWidth: 1 }}>
          {/* Step 1 */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
              style={{
                backgroundColor: currentStep === 1 ? theme.primary : currentStep > 1 ? 'var(--color-status-success)' : 'transparent',
                color: currentStep >= 1 ? '#fff' : theme.textSecondary,
                borderWidth: 2,
                borderColor: currentStep === 1 ? theme.primary : currentStep > 1 ? 'var(--color-status-success)' : theme.border,
              }}>
              {currentStep > 1 ? '\u2713' : '1'}
            </div>
            <span className="text-sm font-medium hidden sm:inline"
              style={{ color: currentStep === 1 ? theme.textPrimary : theme.textSecondary }}>
              Enter Data
            </span>
          </div>

          <div className="w-8 sm:w-16 h-0.5 mx-1 sm:mx-3"
            style={{ backgroundColor: currentStep > 1 ? theme.primary : theme.border }} />

          {/* Step 2 */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
              style={{
                backgroundColor: currentStep === 2 ? theme.primary : currentStep > 2 ? 'var(--color-status-success)' : 'transparent',
                color: currentStep >= 2 ? '#fff' : theme.textSecondary,
                borderWidth: 2,
                borderColor: currentStep === 2 ? theme.primary : currentStep > 2 ? 'var(--color-status-success)' : theme.border,
              }}>
              {currentStep > 2 ? '\u2713' : '2'}
            </div>
            <span className="text-sm font-medium hidden sm:inline"
              style={{ color: currentStep === 2 ? theme.textPrimary : theme.textSecondary }}>
              Review
            </span>
          </div>

          <div className="w-8 sm:w-16 h-0.5 mx-1 sm:mx-3"
            style={{ backgroundColor: currentStep > 2 ? theme.primary : theme.border }} />

          {/* Step 3 */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
              style={{
                backgroundColor: currentStep === 3 ? theme.primary : 'transparent',
                color: currentStep === 3 ? '#fff' : theme.textSecondary,
                borderWidth: 2,
                borderColor: currentStep === 3 ? theme.primary : theme.border,
              }}>
              3
            </div>
            <span className="text-sm font-medium hidden sm:inline"
              style={{ color: currentStep === 3 ? theme.textPrimary : theme.textSecondary }}>
              Cash Handover
            </span>
          </div>
        </div>
      )}

      {/* ============================================= */}
      {/* STEP 1: Enter Readings & Stock Counts         */}
      {/* Financial columns (Price, Revenue, Value) hidden */}
      {/* ============================================= */}
      {currentStep === 1 && !handoverResult && (
        <>
          {/* Nozzle Readings Table — no Price/L or Revenue columns */}
          <div className="rounded-lg shadow mb-6 overflow-x-auto"
            style={{ backgroundColor: theme.cardBg, borderColor: theme.border, borderWidth: 1 }}>
            <div className="p-4 font-semibold text-sm"
              style={{ borderBottomColor: theme.border, borderBottomWidth: 1, color: theme.textPrimary }}>
              Nozzle Readings
            </div>
            <table className="min-w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: theme.background }}>
                  {['Nozzle', 'Fuel Type', 'Elect. Open', 'Elect. Close', 'Volume (L)', 'Mech. Open', 'Mech. Close', 'Deviation'].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-medium uppercase whitespace-nowrap"
                      style={{ color: theme.textSecondary }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {nozzleRows.map((row, idx) => {
                  const comp = nozzleComputations[idx]
                  const closingVal = parseFloat(row.closing_reading)
                  const hasError = row.closing_reading !== '' && !isNaN(closingVal) && closingVal < row.opening_reading
                  const mechCloseVal = parseFloat(row.mechanical_closing)
                  const mechError = row.mechanical_closing !== '' && !isNaN(mechCloseVal) && mechCloseVal < row.mechanical_opening
                  return (
                    <tr key={row.nozzle_id} className="hover:bg-surface-bg" style={{ borderTopColor: theme.border, borderTopWidth: 1 }}>
                      <td className="px-3 py-2 font-medium" style={{ color: theme.textPrimary }}>
                        {row.fuel_type_abbrev && row.display_label
                          ? `${row.fuel_type_abbrev} ${row.display_label}`
                          : row.nozzle_id}
                      </td>
                      <td className="px-3 py-2" style={{ color: theme.textSecondary }}>
                        <span className="inline-block px-2 py-0.5 rounded text-xs font-medium"
                          style={{
                            backgroundColor: row.fuel_type === 'Petrol' ? 'var(--color-action-primary-light)' : 'var(--color-status-pending-light)',
                            color: row.fuel_type === 'Petrol' ? 'var(--color-action-primary)' : 'var(--color-status-warning)',
                          }}>
                          {row.fuel_type}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          step="0.001"
                          value={row.opening_reading || ''}
                          onChange={e => updateOpeningReading(row.nozzle_id, e.target.value)}
                          placeholder="Elect. open"
                          className="w-32 px-2 py-1 rounded border text-sm text-right font-mono"
                          style={inputStyle}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          step="0.001"
                          value={row.closing_reading}
                          onChange={e => updateClosingReading(row.nozzle_id, e.target.value)}
                          placeholder="Elect. close"
                          className="w-32 px-2 py-1 rounded border text-sm text-right font-mono"
                          style={{
                            ...inputStyle,
                            borderColor: hasError ? 'var(--color-status-error)' : theme.border,
                          }}
                        />
                        {hasError && (
                          <div className="text-xs mt-0.5" style={{ color: 'var(--color-status-error)' }}>
                            Must be &ge; opening
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-medium" style={{ color: theme.textPrimary }}>
                        {comp.valid && row.closing_reading !== ''
                          ? comp.volume.toLocaleString(undefined, { minimumFractionDigits: 3 })
                          : '-'}
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          step="0.001"
                          value={row.mechanical_opening || ''}
                          onChange={e => updateMechOpening(row.nozzle_id, e.target.value)}
                          placeholder="Mech open"
                          className="w-32 px-2 py-1 rounded border text-sm text-right font-mono"
                          style={inputStyle}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          step="0.001"
                          value={row.mechanical_closing}
                          onChange={e => updateMechClosing(row.nozzle_id, e.target.value)}
                          placeholder="Mech close"
                          className="w-32 px-2 py-1 rounded border text-sm text-right font-mono"
                          style={{
                            ...inputStyle,
                            borderColor: mechError ? 'var(--color-status-error)' : theme.border,
                          }}
                        />
                        {mechError && (
                          <div className="text-xs mt-0.5" style={{ color: 'var(--color-status-error)' }}>
                            Must be &ge; opening
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs whitespace-nowrap" style={{
                        color: comp.flagged ? 'var(--color-status-error)' : theme.textSecondary,
                        fontWeight: comp.flagged ? 600 : 400,
                      }}>
                        {comp.mechValid && row.closing_reading !== '' && comp.valid
                          ? <>
                              {comp.flagged && <span title="Deviation exceeds threshold">! </span>}
                              {comp.deviationL.toFixed(3)} L ({comp.deviationPct.toFixed(2)}%)
                            </>
                          : '-'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr style={{ borderTopColor: theme.border, borderTopWidth: 2, backgroundColor: theme.background }}>
                  <td colSpan={7} className="px-3 py-2 font-semibold text-right" style={{ color: theme.textPrimary }}>
                    Total Volume
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-bold" style={{ color: theme.primary }}>
                    {totalVolume.toLocaleString(undefined, { minimumFractionDigits: 3 })} L
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* LPG Cylinders — no Value column */}
          <div className="rounded-lg shadow mb-6 overflow-x-auto"
            style={{ backgroundColor: theme.cardBg, borderColor: theme.border, borderWidth: 1 }}>
            <div className="p-4 font-semibold text-sm"
              style={{ borderBottomColor: theme.border, borderBottomWidth: 1, color: theme.textPrimary }}>
              LPG Cylinders
            </div>
            <table className="min-w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: theme.background }}>
                  {['Size', 'Open Full', 'Open Empty', 'Additions', 'Close Full', 'Close Empty', 'Sold', 'Refill', 'With Cyl'].map(h => (
                    <th key={h} className="px-2 py-2 text-center text-xs font-medium uppercase whitespace-nowrap"
                      style={{ color: theme.textSecondary }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lpgRows.map((row, idx) => {
                  const comp = lpgComputations[idx]
                  const splitError = comp.totalSold > 0 && !comp.splitValid && (row.sold_refill !== '' || row.sold_with_cylinder !== '')
                  return (
                    <tr key={row.size_kg} className="hover:bg-surface-bg" style={{ borderTopColor: theme.border, borderTopWidth: 1 }}>
                      <td className="px-2 py-1 text-center font-medium whitespace-nowrap" style={{ color: theme.textPrimary }}>
                        {row.size_kg}kg
                      </td>
                      <td className="px-2 py-1 text-center font-mono" style={{ color: theme.textSecondary }}>
                        {row.opening_full}
                      </td>
                      <td className="px-2 py-1 text-center font-mono" style={{ color: theme.textSecondary }}>
                        {row.opening_empty}
                      </td>
                      <td className="px-2 py-1">
                        <input type="number" min={0} step={1}
                          value={row.additions} onChange={e => updateLpgRow(idx, 'additions', e.target.value)}
                          placeholder="0" className="w-16 px-1 py-1 rounded border text-sm text-center font-mono" style={inputStyle} />
                      </td>
                      <td className="px-2 py-1">
                        <input type="number" min={0} step={1}
                          value={row.closing_full} onChange={e => updateLpgRow(idx, 'closing_full', e.target.value)}
                          placeholder="0" className="w-16 px-1 py-1 rounded border text-sm text-center font-mono" style={inputStyle} />
                      </td>
                      <td className="px-2 py-1">
                        <input type="number" min={0} step={1}
                          value={row.closing_empty} onChange={e => updateLpgRow(idx, 'closing_empty', e.target.value)}
                          placeholder="0" className="w-16 px-1 py-1 rounded border text-sm text-center font-mono" style={inputStyle} />
                      </td>
                      <td className="px-2 py-1 text-center font-mono font-medium" style={{ color: theme.textPrimary }}>
                        {comp.totalSold}
                      </td>
                      <td className="px-2 py-1">
                        <input type="number" min={0} step={1}
                          value={row.sold_refill} onChange={e => updateLpgRow(idx, 'sold_refill', e.target.value)}
                          placeholder="0"
                          className="w-16 px-1 py-1 rounded border text-sm text-center font-mono"
                          style={{ ...inputStyle, borderColor: splitError ? 'var(--color-status-error)' : theme.border }} />
                      </td>
                      <td className="px-2 py-1">
                        <input type="number" min={0} step={1}
                          value={row.sold_with_cylinder} onChange={e => updateLpgRow(idx, 'sold_with_cylinder', e.target.value)}
                          placeholder="0"
                          className="w-16 px-1 py-1 rounded border text-sm text-center font-mono"
                          style={{ ...inputStyle, borderColor: splitError ? 'var(--color-status-error)' : theme.border }} />
                        {splitError && (
                          <div className="text-xs mt-0.5 whitespace-nowrap" style={{ color: 'var(--color-status-error)' }}>
                            Must sum to {comp.totalSold}
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Accessories — no Value column, no @price */}
          {accessoryRows.length > 0 && (
            <div className="rounded-lg shadow mb-6 overflow-x-auto"
              style={{ backgroundColor: theme.cardBg, borderColor: theme.border, borderWidth: 1 }}>
              <div className="p-4 font-semibold text-sm"
                style={{ borderBottomColor: theme.border, borderBottomWidth: 1, color: theme.textPrimary }}>
                LPG Accessories
              </div>
              <table className="min-w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: theme.background }}>
                    {['Product', 'Opening', 'Additions', 'Closing', 'Sold'].map(h => (
                      <th key={h} className="px-3 py-2 text-left text-xs font-medium uppercase"
                        style={{ color: theme.textSecondary }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {accessoryRows.map((row, idx) => {
                    const comp = accComputations[idx]
                    return (
                      <tr key={row.product_code} className="hover:bg-surface-bg" style={{ borderTopColor: theme.border, borderTopWidth: 1 }}>
                        <td className="px-3 py-1" style={{ color: theme.textPrimary }}>
                          <div className="font-medium text-sm">{row.description}</div>
                        </td>
                        <td className="px-3 py-1 text-center font-mono" style={{ color: theme.textSecondary }}>
                          {row.opening_stock}
                        </td>
                        <td className="px-3 py-1">
                          <input type="number" min={0} step={1}
                            value={row.additions} onChange={e => updateAccRow(idx, 'additions', e.target.value)}
                            placeholder="0" className="w-16 px-1 py-1 rounded border text-sm text-center font-mono" style={inputStyle} />
                        </td>
                        <td className="px-3 py-1">
                          <input type="number" min={0} step={1}
                            value={row.closing_stock} onChange={e => updateAccRow(idx, 'closing_stock', e.target.value)}
                            placeholder="0" className="w-16 px-1 py-1 rounded border text-sm text-center font-mono" style={inputStyle} />
                        </td>
                        <td className="px-3 py-1 text-center font-mono font-medium" style={{ color: theme.textPrimary }}>
                          {comp.sold}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Lubricants — no Value column, no @price */}
          {lubricantRows.length > 0 && (
            <div className="rounded-lg shadow mb-6 overflow-x-auto"
              style={{ backgroundColor: theme.cardBg, borderColor: theme.border, borderWidth: 1 }}>
              <div className="p-4 flex items-center justify-between"
                style={{ borderBottomColor: theme.border, borderBottomWidth: 1 }}>
                <span className="font-semibold text-sm" style={{ color: theme.textPrimary }}>
                  Lubricants
                </span>
                <input
                  type="text"
                  value={lubSearch}
                  onChange={e => setLubSearch(e.target.value)}
                  placeholder="Search lubricants..."
                  className="px-3 py-1 rounded border text-sm w-48"
                  style={inputStyle}
                />
              </div>
              <table className="min-w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: theme.background }}>
                    {['Product', 'Opening', 'Additions', 'Closing', 'Sold'].map(h => (
                      <th key={h} className="px-3 py-2 text-left text-xs font-medium uppercase"
                        style={{ color: theme.textSecondary }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredLubIdx.map(idx => {
                    const row = lubricantRows[idx]
                    const comp = lubComputations[idx]
                    return (
                      <tr key={row.product_code} className="hover:bg-surface-bg" style={{ borderTopColor: theme.border, borderTopWidth: 1 }}>
                        <td className="px-3 py-1" style={{ color: theme.textPrimary }}>
                          <div className="font-medium text-sm">{row.description}</div>
                          <div className="text-xs" style={{ color: theme.textSecondary }}>
                            {row.category}
                          </div>
                        </td>
                        <td className="px-3 py-1 text-center font-mono" style={{ color: theme.textSecondary }}>
                          {row.opening_stock}
                        </td>
                        <td className="px-3 py-1">
                          <input type="number" min={0} step={1}
                            value={row.additions} onChange={e => updateLubRow(idx, 'additions', e.target.value)}
                            placeholder="0" className="w-16 px-1 py-1 rounded border text-sm text-center font-mono" style={inputStyle} />
                        </td>
                        <td className="px-3 py-1">
                          <input type="number" min={0} step={1}
                            value={row.closing_stock} onChange={e => updateLubRow(idx, 'closing_stock', e.target.value)}
                            placeholder="0" className="w-16 px-1 py-1 rounded border text-sm text-center font-mono" style={inputStyle} />
                        </td>
                        <td className="px-3 py-1 text-center font-mono font-medium" style={{ color: theme.textPrimary }}>
                          {comp.sold}
                        </td>
                      </tr>
                    )
                  })}
                  {filteredLubIdx.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-3 py-4 text-center text-sm" style={{ color: theme.textSecondary }}>
                        No lubricants match "{lubSearch}"
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Step 1 Navigation */}
          <div className="flex justify-end mb-6">
            <button
              onClick={() => setCurrentStep(2)}
              disabled={!canProceedToReview}
              className="px-6 py-3 rounded-lg text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: canProceedToReview ? theme.primary : '#9ca3af' }}>
              {canProceedToReview ? 'Review My Entries \u2192' : 'Complete all readings to continue'}
            </button>
          </div>
        </>
      )}

      {/* ============================================= */}
      {/* STEP 2: Review & Confirm (read-only, no money)*/}
      {/* ============================================= */}
      {currentStep === 2 && !handoverResult && (
        <>
          {/* Nozzle Readings Review */}
          <div className="rounded-lg shadow mb-6 overflow-x-auto"
            style={{ backgroundColor: theme.cardBg, borderColor: theme.border, borderWidth: 1 }}>
            <div className="p-4 font-semibold text-sm"
              style={{ borderBottomColor: theme.border, borderBottomWidth: 1, color: theme.textPrimary }}>
              Nozzle Readings
            </div>
            <table className="min-w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: theme.background }}>
                  {['Nozzle', 'Fuel Type', 'Elect. Open', 'Elect. Close', 'Volume (L)', 'Mech. Vol (L)', 'Deviation'].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-medium uppercase whitespace-nowrap"
                      style={{ color: theme.textSecondary }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {nozzleRows.map((row, idx) => {
                  const comp = nozzleComputations[idx]
                  return (
                    <tr key={row.nozzle_id} style={{ borderTopColor: theme.border, borderTopWidth: 1 }}>
                      <td className="px-3 py-2 font-medium" style={{ color: theme.textPrimary }}>
                        {row.fuel_type_abbrev && row.display_label
                          ? `${row.fuel_type_abbrev} ${row.display_label}`
                          : row.nozzle_id}
                      </td>
                      <td className="px-3 py-2" style={{ color: theme.textSecondary }}>
                        <span className="inline-block px-2 py-0.5 rounded text-xs font-medium"
                          style={{
                            backgroundColor: row.fuel_type === 'Petrol' ? 'var(--color-action-primary-light)' : 'var(--color-status-pending-light)',
                            color: row.fuel_type === 'Petrol' ? 'var(--color-action-primary)' : 'var(--color-status-warning)',
                          }}>
                          {row.fuel_type}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono" style={{ color: theme.textSecondary }}>
                        {row.opening_reading.toLocaleString(undefined, { minimumFractionDigits: 3 })}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-medium" style={{ color: theme.textPrimary }}>
                        {parseFloat(row.closing_reading).toLocaleString(undefined, { minimumFractionDigits: 3 })}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-medium" style={{ color: theme.textPrimary }}>
                        {comp.volume.toLocaleString(undefined, { minimumFractionDigits: 3 })}
                      </td>
                      <td className="px-3 py-2 text-right font-mono" style={{ color: theme.textPrimary }}>
                        {comp.mechValid
                          ? comp.mechVolume.toLocaleString(undefined, { minimumFractionDigits: 3 })
                          : '-'}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs whitespace-nowrap" style={{
                        color: comp.flagged ? 'var(--color-status-error)' : theme.textSecondary,
                        fontWeight: comp.flagged ? 600 : 400,
                      }}>
                        {comp.mechValid
                          ? <>
                              {comp.flagged && <span>! </span>}
                              {comp.deviationL.toFixed(3)} L ({comp.deviationPct.toFixed(2)}%)
                            </>
                          : '-'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr style={{ borderTopColor: theme.border, borderTopWidth: 2, backgroundColor: theme.background }}>
                  <td colSpan={6} className="px-3 py-2 font-semibold text-right" style={{ color: theme.textPrimary }}>
                    Total Volume
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-bold" style={{ color: theme.primary }}>
                    {totalVolume.toLocaleString(undefined, { minimumFractionDigits: 3 })} L
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* LPG Cylinders Review — only rows with activity */}
          {lpgRows.some((row, idx) => lpgComputations[idx].totalSold > 0 || (parseInt(row.additions) || 0) > 0) && (
            <div className="rounded-lg shadow mb-6 overflow-x-auto"
              style={{ backgroundColor: theme.cardBg, borderColor: theme.border, borderWidth: 1 }}>
              <div className="p-4 font-semibold text-sm"
                style={{ borderBottomColor: theme.border, borderBottomWidth: 1, color: theme.textPrimary }}>
                LPG Cylinders
              </div>
              <table className="min-w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: theme.background }}>
                    {['Size', 'Open Full', 'Additions', 'Close Full', 'Sold', 'Refill', 'With Cyl'].map(h => (
                      <th key={h} className="px-2 py-2 text-center text-xs font-medium uppercase whitespace-nowrap"
                        style={{ color: theme.textSecondary }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lpgRows.map((row, idx) => {
                    const comp = lpgComputations[idx]
                    if (comp.totalSold === 0 && comp.additions === 0) return null
                    return (
                      <tr key={row.size_kg} style={{ borderTopColor: theme.border, borderTopWidth: 1 }}>
                        <td className="px-2 py-2 text-center font-medium whitespace-nowrap" style={{ color: theme.textPrimary }}>
                          {row.size_kg}kg
                        </td>
                        <td className="px-2 py-2 text-center font-mono" style={{ color: theme.textSecondary }}>
                          {row.opening_full}
                        </td>
                        <td className="px-2 py-2 text-center font-mono" style={{ color: theme.textPrimary }}>
                          {comp.additions}
                        </td>
                        <td className="px-2 py-2 text-center font-mono" style={{ color: theme.textPrimary }}>
                          {comp.closingFull}
                        </td>
                        <td className="px-2 py-2 text-center font-mono font-medium" style={{ color: theme.textPrimary }}>
                          {comp.totalSold}
                        </td>
                        <td className="px-2 py-2 text-center font-mono" style={{ color: theme.textPrimary }}>
                          {comp.refill}
                        </td>
                        <td className="px-2 py-2 text-center font-mono" style={{ color: theme.textPrimary }}>
                          {comp.withCyl}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Accessories Review — only rows with activity */}
          {accessoryRows.some((_, idx) => accComputations[idx].sold > 0 || accComputations[idx].additions > 0) && (
            <div className="rounded-lg shadow mb-6 overflow-x-auto"
              style={{ backgroundColor: theme.cardBg, borderColor: theme.border, borderWidth: 1 }}>
              <div className="p-4 font-semibold text-sm"
                style={{ borderBottomColor: theme.border, borderBottomWidth: 1, color: theme.textPrimary }}>
                LPG Accessories
              </div>
              <table className="min-w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: theme.background }}>
                    {['Product', 'Opening', 'Additions', 'Closing', 'Sold'].map(h => (
                      <th key={h} className="px-3 py-2 text-left text-xs font-medium uppercase"
                        style={{ color: theme.textSecondary }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {accessoryRows.map((row, idx) => {
                    const comp = accComputations[idx]
                    if (comp.sold === 0 && comp.additions === 0) return null
                    return (
                      <tr key={row.product_code} style={{ borderTopColor: theme.border, borderTopWidth: 1 }}>
                        <td className="px-3 py-2 font-medium" style={{ color: theme.textPrimary }}>
                          {row.description}
                        </td>
                        <td className="px-3 py-2 text-center font-mono" style={{ color: theme.textSecondary }}>
                          {row.opening_stock}
                        </td>
                        <td className="px-3 py-2 text-center font-mono" style={{ color: theme.textPrimary }}>
                          {comp.additions}
                        </td>
                        <td className="px-3 py-2 text-center font-mono" style={{ color: theme.textPrimary }}>
                          {comp.closing}
                        </td>
                        <td className="px-3 py-2 text-center font-mono font-medium" style={{ color: theme.textPrimary }}>
                          {comp.sold}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Lubricants Review — only rows with activity */}
          {lubricantRows.some((_, idx) => lubComputations[idx].sold > 0 || lubComputations[idx].additions > 0) && (
            <div className="rounded-lg shadow mb-6 overflow-x-auto"
              style={{ backgroundColor: theme.cardBg, borderColor: theme.border, borderWidth: 1 }}>
              <div className="p-4 font-semibold text-sm"
                style={{ borderBottomColor: theme.border, borderBottomWidth: 1, color: theme.textPrimary }}>
                Lubricants
              </div>
              <table className="min-w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: theme.background }}>
                    {['Product', 'Opening', 'Additions', 'Closing', 'Sold'].map(h => (
                      <th key={h} className="px-3 py-2 text-left text-xs font-medium uppercase"
                        style={{ color: theme.textSecondary }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lubricantRows.map((row, idx) => {
                    const comp = lubComputations[idx]
                    if (comp.sold === 0 && comp.additions === 0) return null
                    return (
                      <tr key={row.product_code} style={{ borderTopColor: theme.border, borderTopWidth: 1 }}>
                        <td className="px-3 py-2" style={{ color: theme.textPrimary }}>
                          <div className="font-medium text-sm">{row.description}</div>
                          <div className="text-xs" style={{ color: theme.textSecondary }}>{row.category}</div>
                        </td>
                        <td className="px-3 py-2 text-center font-mono" style={{ color: theme.textSecondary }}>
                          {row.opening_stock}
                        </td>
                        <td className="px-3 py-2 text-center font-mono" style={{ color: theme.textPrimary }}>
                          {comp.additions}
                        </td>
                        <td className="px-3 py-2 text-center font-mono" style={{ color: theme.textPrimary }}>
                          {comp.closing}
                        </td>
                        <td className="px-3 py-2 text-center font-mono font-medium" style={{ color: theme.textPrimary }}>
                          {comp.sold}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Step 2 Navigation */}
          <div className="flex justify-between mb-6">
            <button
              onClick={() => setCurrentStep(1)}
              className="px-6 py-3 rounded-lg text-sm font-semibold"
              style={{ backgroundColor: theme.cardBg, color: theme.textPrimary, borderColor: theme.border, borderWidth: 1 }}>
              {'\u2190'} Back to Edit
            </button>
            <button
              onClick={() => setCurrentStep(3)}
              className="px-6 py-3 rounded-lg text-sm font-semibold text-white"
              style={{ backgroundColor: theme.primary }}>
              Confirm & Proceed to Cash Handover {'\u2192'}
            </button>
          </div>
        </>
      )}

      {/* ============================================= */}
      {/* STEP 3: Cash Handover (financial reveal)      */}
      {/* ============================================= */}
      {currentStep === 3 && !handoverResult && (
        <>
          <div className="rounded-lg shadow p-4 mb-6"
            style={{ backgroundColor: theme.cardBg, borderColor: theme.border, borderWidth: 1 }}>
            <h2 className="text-sm font-semibold mb-3 uppercase tracking-wide" style={{ color: theme.textSecondary }}>
              Cash Handover
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left: computation summary */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span style={{ color: theme.textSecondary }}>Fuel Revenue</span>
                  <span className="font-mono font-medium" style={{ color: theme.textPrimary }}>
                    {fmtZMW(fuelRevenue)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span style={{ color: theme.textSecondary }}>+ LPG Sales</span>
                  <span className="font-mono" style={{ color: theme.textPrimary }}>
                    {fmtZMW(lpgTotal)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span style={{ color: theme.textSecondary }}>+ Lubricant Sales</span>
                  <span className="font-mono" style={{ color: theme.textPrimary }}>
                    {fmtZMW(lubricantTotal)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span style={{ color: theme.textSecondary }}>+ Accessory Sales</span>
                  <span className="font-mono" style={{ color: theme.textPrimary }}>
                    {fmtZMW(accessoryTotal)}
                  </span>
                </div>
                <div className="flex justify-between text-sm pt-2" style={{ borderTopColor: theme.border, borderTopWidth: 1 }}>
                  <span className="font-semibold" style={{ color: theme.textPrimary }}>Total Expected</span>
                  <span className="font-mono font-semibold" style={{ color: theme.textPrimary }}>
                    {fmtZMW(totalExpected)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span style={{ color: theme.textSecondary }}>- Credit Sales</span>
                  <span className="font-mono" style={{ color: 'var(--color-status-error)' }}>
                    -{fmtZMW(creditVal)}
                  </span>
                </div>
                <div className="flex justify-between text-sm pt-2" style={{ borderTopColor: theme.border, borderTopWidth: 1 }}>
                  <span className="font-bold" style={{ color: theme.textPrimary }}>Expected Cash</span>
                  <span className="font-mono font-bold" style={{ color: theme.primary }}>
                    {fmtZMW(expectedCash)} ZMW
                  </span>
                </div>
              </div>

              {/* Right: actual cash + difference */}
              <div className="space-y-4">
                {/* Credit Sales — line items or legacy input */}
                {creditAccounts.length > 0 ? (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-medium uppercase" style={{ color: theme.textSecondary }}>Credit Sales</label>
                      <button type="button" onClick={() => setCreditItems(prev => [...prev, { account_id: creditAccounts[0]?.account_id || '', account_name: creditAccounts[0]?.account_name || '', fuel_type: 'Diesel', volume: '', price_per_liter: creditAccounts[0]?.default_price_per_liter || fuelPrices.Diesel, amount: 0 }])}
                        className="px-2 py-1 text-xs font-medium rounded text-white"
                        style={{ backgroundColor: theme.primary }}>
                        + Add
                      </button>
                    </div>
                    {creditItems.length === 0 && (
                      <div className="text-xs py-2 text-center" style={{ color: theme.textSecondary }}>No credit sales — tap Add to record one</div>
                    )}
                    {creditItems.map((item, idx) => {
                      const acct = creditAccounts.find(a => a.account_id === item.account_id)
                      const resolvedPrice = acct?.default_price_per_liter || fuelPrices[item.fuel_type as 'Diesel'|'Petrol'] || 0
                      const vol = parseFloat(item.volume) || 0
                      const amt = round2(vol * resolvedPrice)
                      // Sync amount if changed
                      if (item.price_per_liter !== resolvedPrice || item.amount !== amt) {
                        const updated = [...creditItems]
                        updated[idx] = { ...item, price_per_liter: resolvedPrice, amount: amt }
                        setCreditItems(updated)
                      }
                      return (
                        <div key={idx} className="grid grid-cols-12 gap-1 items-end mb-1">
                          <div className="col-span-4">
                            {idx === 0 && <div className="text-[10px] mb-0.5" style={{ color: theme.textSecondary }}>Account</div>}
                            <select value={item.account_id} onChange={e => {
                              const a = creditAccounts.find(x => x.account_id === e.target.value)
                              const updated = [...creditItems]
                              updated[idx] = { ...item, account_id: e.target.value, account_name: a?.account_name || '' }
                              setCreditItems(updated)
                            }} className="w-full px-1 py-1.5 rounded border text-xs" style={inputStyle}>
                              {creditAccounts.map(a => <option key={a.account_id} value={a.account_id}>{a.account_name}</option>)}
                            </select>
                          </div>
                          <div className="col-span-2">
                            {idx === 0 && <div className="text-[10px] mb-0.5" style={{ color: theme.textSecondary }}>Fuel</div>}
                            <select value={item.fuel_type} onChange={e => {
                              const updated = [...creditItems]
                              updated[idx] = { ...item, fuel_type: e.target.value }
                              setCreditItems(updated)
                            }} className="w-full px-1 py-1.5 rounded border text-xs" style={inputStyle}>
                              <option value="Diesel">Diesel</option>
                              <option value="Petrol">Petrol</option>
                            </select>
                          </div>
                          <div className="col-span-2">
                            {idx === 0 && <div className="text-[10px] mb-0.5" style={{ color: theme.textSecondary }}>Vol (L)</div>}
                            <input type="number" min={0} step="0.01" value={item.volume}
                              onChange={e => {
                                const updated = [...creditItems]
                                updated[idx] = { ...item, volume: e.target.value }
                                setCreditItems(updated)
                              }}
                              placeholder="0" className="w-full px-1 py-1.5 rounded border text-xs text-right font-mono" style={inputStyle} />
                          </div>
                          <div className="col-span-1">
                            {idx === 0 && <div className="text-[10px] mb-0.5" style={{ color: theme.textSecondary }}>K/L</div>}
                            <div className="px-1 py-1.5 text-xs font-mono text-right" style={{ color: theme.textSecondary }}>{resolvedPrice.toFixed(2)}</div>
                          </div>
                          <div className="col-span-2">
                            {idx === 0 && <div className="text-[10px] mb-0.5" style={{ color: theme.textSecondary }}>Amount</div>}
                            <div className="px-1 py-1.5 text-xs font-mono text-right font-medium" style={{ color: theme.textPrimary }}>{fmtZMW(amt)}</div>
                          </div>
                          <div className="col-span-1 flex justify-center">
                            {idx === 0 && <div className="text-[10px] mb-0.5 invisible">X</div>}
                            <button type="button" onClick={() => setCreditItems(prev => prev.filter((_, i) => i !== idx))}
                              className="text-xs px-1 py-1" style={{ color: 'var(--color-status-error)' }}>✕</button>
                          </div>
                        </div>
                      )
                    })}
                    {creditItems.length > 0 && (
                      <div className="flex justify-between text-xs font-semibold pt-1 mt-1" style={{ borderTopColor: theme.border, borderTopWidth: 1 }}>
                        <span style={{ color: theme.textSecondary }}>Credit Total</span>
                        <span className="font-mono" style={{ color: theme.textPrimary }}>{fmtZMW(creditItemsTotal)}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: theme.textSecondary }}>
                      Credit Sales (ZMW)
                    </label>
                    <input type="number" min={0} step="0.01" value={creditSales}
                      onChange={e => setCreditSales(e.target.value)} placeholder="0.00"
                      className="w-full px-3 py-2 rounded border text-sm text-right font-mono"
                      style={inputStyle} />
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: theme.textSecondary }}>
                    Actual Cash Handed In (ZMW)
                  </label>
                  <input type="number" min={0} step="0.01" value={actualCash}
                    onChange={e => setActualCash(e.target.value)} placeholder="0.00"
                    className="w-full px-3 py-2 rounded border text-sm text-right text-lg font-mono"
                    style={inputStyle} />
                </div>

                {actualCash !== '' && (
                  <div className="rounded-lg p-4 text-center"
                    style={{
                      backgroundColor: difference >= 0 ? 'var(--color-status-success-light)' : 'var(--color-status-error-light)',
                      borderWidth: 2,
                      borderColor: difference >= 0 ? 'var(--color-status-success)' : 'var(--color-status-error)',
                    }}>
                    <div className="text-xs uppercase tracking-wide mb-1"
                      style={{ color: difference >= 0 ? 'var(--color-status-success)' : 'var(--color-status-error)' }}>
                      {difference >= 0 ? 'Surplus' : 'Shortage'}
                    </div>
                    <div className="text-2xl font-bold font-mono"
                      style={{ color: difference >= 0 ? 'var(--color-status-success)' : 'var(--color-status-error)' }}>
                      {difference >= 0 ? '+' : ''}{fmtZMW(difference)} ZMW
                    </div>
                  </div>
                )}

                {hasDeviationFlags && (
                  <div className="rounded-lg p-3 text-sm"
                    style={{
                      backgroundColor: 'var(--color-status-warning-light, #fef3cd)',
                      color: 'var(--color-status-warning, #856404)',
                      borderWidth: 1,
                      borderColor: 'var(--color-status-warning, #ffc107)',
                    }}>
                    <span className="font-semibold">Warning:</span> Meter discrepancy detected on {nozzleComputations.filter(c => c.flagged).length} nozzle(s). You must provide an explanation before submitting.
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: theme.textSecondary }}>
                    {hasDeviationFlags ? 'Notes (required — explain meter discrepancy)' : 'Notes (optional)'}
                  </label>
                  <textarea value={notes} onChange={e => setNotes(e.target.value)}
                    placeholder={hasDeviationFlags ? 'Explain the meter discrepancy...' : 'Any remarks about the shift...'}
                    rows={2}
                    className="w-full px-3 py-2 rounded border text-sm"
                    style={{
                      ...inputStyle,
                      borderColor: hasDeviationFlags && notes.trim() === '' ? 'var(--color-status-error)' : theme.border,
                    }} />
                </div>
              </div>
            </div>
          </div>

          {/* Step 3 Navigation */}
          <div className="flex justify-between mb-6">
            <button
              onClick={() => setCurrentStep(2)}
              className="px-6 py-3 rounded-lg text-sm font-semibold"
              style={{ backgroundColor: theme.cardBg, color: theme.textPrimary, borderColor: theme.border, borderWidth: 1 }}>
              {'\u2190'} Back to Review
            </button>
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="px-6 py-3 rounded-lg text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: canSubmit ? theme.primary : '#9ca3af' }}>
              {submitting ? 'Submitting...' : 'Submit Shift Handover'}
            </button>
          </div>
        </>
      )}

      {/* Handover Result Display — shown after submission */}
      {handoverResult && (
        <div className="rounded-lg shadow p-6 mb-6"
          style={{ backgroundColor: theme.cardBg, borderColor: 'var(--color-status-success)', borderWidth: 2 }}>
          <h2 className="text-lg font-bold mb-4" style={{ color: theme.textPrimary }}>
            Handover Summary
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 text-sm">
            <div>
              <span className="text-xs" style={{ color: theme.textSecondary }}>Handover ID</span>
              <div className="font-mono font-medium" style={{ color: theme.textPrimary }}>{handoverResult.handover_id}</div>
            </div>
            <div>
              <span className="text-xs" style={{ color: theme.textSecondary }}>Date</span>
              <div className="font-medium" style={{ color: theme.textPrimary }}>{handoverResult.date}</div>
            </div>
            <div>
              <span className="text-xs" style={{ color: theme.textSecondary }}>Shift</span>
              <div className="font-medium" style={{ color: theme.textPrimary }}>{handoverResult.shift_type}</div>
            </div>
            <div>
              <span className="text-xs" style={{ color: theme.textSecondary }}>Review Status</span>
              <ReviewStatusBadge status={handoverResult.review_status || 'submitted'} />
            </div>
          </div>

          <table className="min-w-full text-sm mb-4">
            <thead>
              <tr style={{ backgroundColor: theme.background }}>
                {['Nozzle', 'Fuel', 'Elect. Open', 'Elect. Close', 'Volume (L)', 'Mech. Vol', 'Deviation', 'Revenue (ZMW)'].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-xs font-medium uppercase whitespace-nowrap"
                    style={{ color: theme.textSecondary }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {handoverResult.nozzle_summaries.map(ns => {
                const row = nozzleRows.find(r => r.nozzle_id === ns.nozzle_id)
                const displayName = row?.fuel_type_abbrev && row?.display_label
                  ? `${row.fuel_type_abbrev} ${row.display_label}`
                  : ns.nozzle_id
                return (
                <tr key={ns.nozzle_id} className="hover:bg-surface-bg" style={{ borderTopColor: theme.border, borderTopWidth: 1 }}>
                  <td className="px-3 py-1 font-medium" style={{ color: theme.textPrimary }}>{displayName}</td>
                  <td className="px-3 py-1" style={{ color: theme.textSecondary }}>{ns.fuel_type}</td>
                  <td className="px-3 py-1 text-right font-mono" style={{ color: theme.textSecondary }}>
                    {ns.opening_reading.toLocaleString(undefined, { minimumFractionDigits: 3 })}
                  </td>
                  <td className="px-3 py-1 text-right font-mono" style={{ color: theme.textPrimary }}>
                    {ns.closing_reading.toLocaleString(undefined, { minimumFractionDigits: 3 })}
                  </td>
                  <td className="px-3 py-1 text-right font-mono font-medium" style={{ color: theme.textPrimary }}>
                    {ns.volume_sold.toLocaleString(undefined, { minimumFractionDigits: 3 })}
                  </td>
                  <td className="px-3 py-1 text-right font-mono" style={{ color: theme.textPrimary }}>
                    {ns.mechanical_volume != null
                      ? ns.mechanical_volume.toLocaleString(undefined, { minimumFractionDigits: 3 })
                      : '-'}
                  </td>
                  <td className="px-3 py-1 text-right font-mono text-xs whitespace-nowrap" style={{
                    color: ns.meter_deviation_flagged ? 'var(--color-status-error)' : theme.textSecondary,
                    fontWeight: ns.meter_deviation_flagged ? 600 : 400,
                  }}>
                    {ns.meter_deviation_percent != null
                      ? <>
                          {ns.meter_deviation_flagged && <span>! </span>}
                          {ns.meter_deviation_percent.toFixed(2)}%
                        </>
                      : '-'}
                  </td>
                  <td className="px-3 py-1 text-right font-mono font-medium" style={{ color: theme.textPrimary }}>
                    {fmtZMW(ns.revenue)}
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <SummaryCell label="Fuel Revenue" value={handoverResult.fuel_revenue} theme={theme} />
            <SummaryCell label="LPG Sales" value={handoverResult.lpg_sales} theme={theme} />
            <SummaryCell label="Lubricant Sales" value={handoverResult.lubricant_sales} theme={theme} />
            <SummaryCell label="Accessory Sales" value={handoverResult.accessory_sales} theme={theme} />
            <SummaryCell label="Total Expected" value={handoverResult.total_expected} theme={theme} bold />
            <SummaryCell label="Credit Sales" value={handoverResult.credit_sales} theme={theme} negative />
            <SummaryCell label="Expected Cash" value={handoverResult.expected_cash} theme={theme} bold primary />
            <SummaryCell label="Actual Cash" value={handoverResult.actual_cash} theme={theme} bold />
          </div>

          <div className="mt-4 rounded-lg p-4 text-center"
            style={{
              backgroundColor: handoverResult.difference >= 0 ? 'var(--color-status-success-light)' : 'var(--color-status-error-light)',
              borderWidth: 2,
              borderColor: handoverResult.difference >= 0 ? 'var(--color-status-success)' : 'var(--color-status-error)',
            }}>
            <div className="text-xs uppercase tracking-wide mb-1"
              style={{ color: handoverResult.difference >= 0 ? 'var(--color-status-success)' : 'var(--color-status-error)' }}>
              {handoverResult.difference >= 0 ? 'Surplus' : 'Shortage'}
            </div>
            <div className="text-3xl font-bold font-mono"
              style={{ color: handoverResult.difference >= 0 ? 'var(--color-status-success)' : 'var(--color-status-error)' }}>
              {handoverResult.difference >= 0 ? '+' : ''}{fmtZMW(handoverResult.difference)} ZMW
            </div>
          </div>
        </div>
      )}

      {/* Past Handovers — always visible */}
      {pastHandovers.length > 0 && (
        <PastHandoversTable handovers={pastHandovers} theme={theme} />
      )}
    </div>
  )
}

function SummaryCell({ label, value, theme, bold, primary, negative }: {
  label: string
  value: number
  theme: any
  bold?: boolean
  primary?: boolean
  negative?: boolean
}) {
  return (
    <div>
      <div className="text-xs" style={{ color: theme.textSecondary }}>{label}</div>
      <div
        className={`font-mono ${bold ? 'font-bold' : 'font-medium'}`}
        style={{ color: negative ? 'var(--color-status-error)' : primary ? theme.primary : theme.textPrimary }}>
        {negative ? '-' : ''}{value.toLocaleString(undefined, { minimumFractionDigits: 2 })} ZMW
      </div>
    </div>
  )
}

const REVIEW_STATUS_MAP: Record<string, { bg: string; color: string; label: string }> = {
  submitted: { bg: 'var(--color-action-primary-light)', color: 'var(--color-action-primary)', label: 'Pending Review' },
  flagged: { bg: 'var(--color-status-error-light, #fde8e8)', color: 'var(--color-status-error)', label: 'Flagged' },
  approved: { bg: 'var(--color-status-success-light, #e6f9e6)', color: 'var(--color-status-success)', label: 'Approved' },
  returned: { bg: 'var(--color-status-warning-light, #fff8e1)', color: 'var(--color-status-warning)', label: 'Returned' },
  reopened: { bg: 'var(--color-status-pending-light)', color: 'var(--color-status-warning)', label: 'Reopened' },
}

function ReviewStatusBadge({ status }: { status: string }) {
  const style = REVIEW_STATUS_MAP[status] || REVIEW_STATUS_MAP.submitted
  return (
    <span className="inline-block px-2 py-0.5 rounded text-xs font-medium"
      style={{ backgroundColor: style.bg, color: style.color }}>
      {style.label}
    </span>
  )
}

function PastHandoversTable({ handovers, theme }: { handovers: HandoverResult[], theme: any }) {
  return (
    <div className="rounded-lg shadow overflow-x-auto"
      style={{ backgroundColor: theme.cardBg, borderColor: theme.border, borderWidth: 1 }}>
      <div className="p-4 font-semibold text-sm"
        style={{ borderBottomColor: theme.border, borderBottomWidth: 1, color: theme.textPrimary }}>
        Past Handovers
      </div>
      <table className="min-w-full text-sm">
        <thead>
          <tr style={{ backgroundColor: theme.background }}>
            {['Date', 'Shift', 'Attendant', 'Fuel Rev.', 'Total Expected', 'Expected Cash', 'Actual Cash', 'Difference', 'Review'].map(h => (
              <th key={h} className="px-3 py-2 text-left text-xs font-medium uppercase"
                style={{ color: theme.textSecondary }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {handovers.map(h => (
            <tr key={h.handover_id} className="hover:bg-surface-bg" style={{ borderTopColor: theme.border, borderTopWidth: 1 }}>
              <td className="px-3 py-2" style={{ color: theme.textPrimary }}>{h.date}</td>
              <td className="px-3 py-2" style={{ color: theme.textSecondary }}>{h.shift_type}</td>
              <td className="px-3 py-2" style={{ color: theme.textPrimary }}>{h.attendant_name}</td>
              <td className="px-3 py-2 text-right font-mono" style={{ color: theme.textPrimary }}>
                {h.fuel_revenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </td>
              <td className="px-3 py-2 text-right font-mono" style={{ color: theme.textPrimary }}>
                {h.total_expected.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </td>
              <td className="px-3 py-2 text-right font-mono font-medium" style={{ color: theme.primary }}>
                {h.expected_cash.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </td>
              <td className="px-3 py-2 text-right font-mono" style={{ color: theme.textPrimary }}>
                {h.actual_cash.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </td>
              <td className="px-3 py-2 text-right font-mono font-bold"
                style={{ color: h.difference >= 0 ? 'var(--color-status-success)' : 'var(--color-status-error)' }}>
                {h.difference >= 0 ? '+' : ''}{h.difference.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </td>
              <td className="px-3 py-2">
                <ReviewStatusBadge status={h.review_status || h.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
