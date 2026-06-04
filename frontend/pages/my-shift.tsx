import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { useTheme } from '../contexts/ThemeContext'
import LoadingSpinner from '../components/LoadingSpinner'
import DoubleEntryModal from '../components/DoubleEntryModal'
import { getHeaders, authFetch } from '../lib/api'

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
  has_price_change?: boolean
  old_price?: number | null
  new_price?: number | null
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
  deviation_note: string
  changeover_reading: string
  // Double-entry verification: true once the value has been blind-keyed twice
  // and the two entries matched 100%.
  closing_verified: boolean
  mech_closing_verified: boolean
}

// Stock count row types
interface LPGCylinderRow {
  size_kg: number
  opening_full: number
  opening_empty: number
  sold_refill: string
  sold_with_cylinder: string
  damaged: string
  closing_full: string
  closing_empty: string
  variance_note: string
  refill_price: number
  price_with_cylinder: number
}

interface AccessoryRow {
  product_code: string
  description: string
  opening_stock: number
  sold: string
  damaged: string
  closing_stock: string
  variance_note: string
  unit_price: number
}

interface LubricantRow {
  product_code: string
  description: string
  category: string
  opening_stock: number
  sold: string
  damaged: string
  closing_stock: string
  variance_note: string
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

  // Determine user role for visibility control
  const userData = typeof window !== 'undefined' ? localStorage.getItem('user') : null
  const userRole = userData ? JSON.parse(userData).role : ''
  const isAttendant = userRole === 'user'

  // Shift selection state
  const [availableShifts, setAvailableShifts] = useState<any[]>([])
  const [selectedShiftId, setSelectedShiftId] = useState<string>('')

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

  // Safe deposit state
  const [depositAmount, setDepositAmount] = useState('')
  const [depositTime, setDepositTime] = useState(() => {
    const now = new Date()
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  })
  const [depositNote, setDepositNote] = useState('')
  const [depositSaving, setDepositSaving] = useState(false)
  const [myDeposits, setMyDeposits] = useState<any[]>([])
  const [depositTotal, setDepositTotal] = useState(0)
  const [depositOverdue, setDepositOverdue] = useState(false)
  const [showDeposits, setShowDeposits] = useState(true)

  // Collapsible sections
  const [showShiftInfo, setShowShiftInfo] = useState(true)
  const [showNozzles, setShowNozzles] = useState(true)
  const [showLpg, setShowLpg] = useState(false)
  const [showLubs, setShowLubs] = useState(false)
  const [showAccessories, setShowAccessories] = useState(false)
  const [lpgNoSales, setLpgNoSales] = useState(false)
  const [accNoSales, setAccNoSales] = useState(false)
  const [lubNoSales, setLubNoSales] = useState(false)
  // Upgrade/downgrade trades recorded during the shift (customer swaps one size for another)
  const [lpgTrades, setLpgTrades] = useState<Array<{ from_size_kg: number; to_size_kg: number; quantity: string }>>([])

  // On This Shift (supervisor/manager overview)
  const [showOnThisShift, setShowOnThisShift] = useState(true)
  const [shiftDeposits, setShiftDeposits] = useState<any>(null)

  // UI state
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [handoverResult, setHandoverResult] = useState<HandoverResult | null>(null)
  const [pastHandovers, setPastHandovers] = useState<HandoverResult[]>([])

  // Meter discrepancy threshold (%)
  const [meterThreshold, setMeterThreshold] = useState<number>(0.5)
  // Nozzle allowable loss threshold (liters)
  const [nozzleLossThreshold, setNozzleLossThreshold] = useState<number>(0.8)

  // Wizard step state
  const [currentStep, setCurrentStep] = useState<1 | 2>(1)
  const [readingsVerifiedHandover, setReadingsVerifiedHandover] = useState<any>(null)
  const [priceChangeDetected, setPriceChangeDetected] = useState(false)
  // Start-of-shift opening verification (two-mode). Default true so the closing
  // flow never flashes before the shift loads; set from the backend on load.
  const [openingVerified, setOpeningVerified] = useState(true)
  const [verifyingOpening, setVerifyingOpening] = useState(false)
  const [openingDiscrepancyNote, setOpeningDiscrepancyNote] = useState('')
  // Review confirmation modal
  const [showReviewModal, setShowReviewModal] = useState(false)

  // Fetch available active shifts for dropdown
  useEffect(() => {
    authFetch(`${BASE}/handover/my-shifts`, { headers: getAuthHeaders() })
      .then(r => r.ok ? r.json() : { shifts: [] })
      .then(data => {
        const shifts = data.shifts || []
        setAvailableShifts(shifts)
        if (shifts.length === 1) {
          // Single shift: auto-select; loadShiftData() runs via the
          // selectedShiftId effect and clears the spinner itself.
          setSelectedShiftId(shifts[0].shift_id)
        } else if (shifts.length === 0) {
          // No assigned active shift — surface the empty/supervisor state
          // instead of spinning forever.
          setShiftFound(false)
          setLoading(false)
        } else {
          // Multiple active shifts — let the user pick from the dropdown.
          setLoading(false)
        }
      })
      .catch(() => { setShiftFound(false); setLoading(false) })
  }, [])

  // Load shift data when selectedShiftId changes
  const loadShiftData = (shiftId: string) => {
    setLoading(true)
    setShiftFound(null)
    setHandoverResult(null)
    setSuccess('')
    setError('')
    const qs = shiftId ? `?shift_id=${encodeURIComponent(shiftId)}` : ''
    authFetch(`${BASE}/handover/my-shift${qs}`, { headers: getAuthHeaders() })
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
        setPriceChangeDetected(shiftData.price_change_detected || false)
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
            deviation_note: '',
            changeover_reading: '',
            closing_verified: false,
            mech_closing_verified: false,
          }))
        )
        setMeterThreshold(shiftData.meter_discrepancy_threshold ?? 0.5)
        setNozzleLossThreshold(shiftData.nozzle_allowable_loss_liters ?? 0.8)
        setReadingsVerifiedHandover(shiftData.readings_verified_handover || null)
        setOpeningVerified(!!shiftData.opening_verified)

        // Fetch credit accounts for line-item entry
        authFetch(`${BASE}/handover/credit-accounts`, { headers: getAuthHeaders() })
          .then(r => r.ok ? r.json() : { accounts: [], fuel_prices: { Diesel: 0, Petrol: 0 } })
          .then(data => {
            setCreditAccounts(data.accounts || [])
            setFuelPrices(data.fuel_prices || { Diesel: 0, Petrol: 0 })
          })
          .catch(() => {})

        // Fetch stock opening separately — failure returns empty defaults
        authFetch(`${BASE}/handover/stock-opening`, { headers: getAuthHeaders() })
          .then(r => r.ok ? r.json() : Promise.reject())
          .catch(() => ({ lpg_cylinders: [], accessories: [], lubricants: [] }))
          .then(stockData => {
            setLpgRows(
              (stockData.lpg_cylinders || []).map((c: any) => ({
                size_kg: c.size_kg,
                opening_full: c.opening_full || 0,
                opening_empty: c.opening_empty || 0,
                sold_refill: '',
                sold_with_cylinder: '',
                damaged: '',
                closing_full: '',
                closing_empty: '',
                variance_note: '',
                refill_price: c.refill_price || 0,
                price_with_cylinder: c.price_with_cylinder || 0,
              }))
            )

            setAccessoryRows(
              (stockData.accessories || []).map((a: any) => ({
                product_code: a.product_code,
                description: a.description,
                opening_stock: a.opening_stock || 0,
                sold: '',
                damaged: '',
                closing_stock: '',
                variance_note: '',
                unit_price: a.unit_price || 0,
              }))
            )

            setLubricantRows(
              (stockData.lubricants || []).map((l: any) => ({
                product_code: l.product_code,
                description: l.description,
                category: l.category || '',
                opening_stock: l.opening_stock || 0,
                sold: '',
                damaged: '',
                closing_stock: '',
                variance_note: '',
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
  }

  useEffect(() => {
    if (selectedShiftId) loadShiftData(selectedShiftId)
  }, [selectedShiftId])

  // Fetch past handovers
  useEffect(() => {
    authFetch(`${BASE}/handover/entries`, { headers: getAuthHeaders() })
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

    const lossExceedsThreshold = mechValid && deviationL > nozzleLossThreshold

    return {
      volume: Math.max(0, volume),
      revenue: volume >= 0 ? revenue : 0,
      valid: volume >= 0,
      mechVolume,
      deviationL,
      deviationPct,
      flagged,
      lossExceedsThreshold,
      mechValid: row.mechanical_closing === '' ? undefined : mechValid,
    }
  })

  const fuelRevenue = nozzleComputations.reduce((s, c) => s + c.revenue, 0)
  const totalVolume = nozzleComputations.reduce((s, c) => s + c.volume, 0)

  // --- LPG cylinder computations ---
  const lpgComputations = lpgRows.map(row => {
    const refill = parseInt(row.sold_refill) || 0
    const withCyl = parseInt(row.sold_with_cylinder) || 0
    const damaged = parseInt(row.damaged) || 0
    const totalSold = refill + withCyl
    const closingFull = parseInt(row.closing_full) || 0
    const expectedClosing = row.opening_full - totalSold - damaged
    const variance = row.closing_full !== '' ? expectedClosing - closingFull : 0
    const hasVariance = row.closing_full !== '' && variance !== 0
    const soldExceedsOpening = totalSold + damaged > row.opening_full
    const value = refill * row.refill_price + withCyl * row.price_with_cylinder
    return { totalSold, refill, withCyl, damaged, expectedClosing, closingFull, variance, hasVariance, soldExceedsOpening, value }
  })
  const lpgRowTotal = lpgComputations.reduce((s, c) => s + c.value, 0)
  // Trade (upgrade/downgrade) revenue = price_refill[to] + (deposit[to] - deposit[from]) per trade.
  const lpgPriceMap = new Map(lpgRows.map(r => [r.size_kg, { refill: r.refill_price, full: r.price_with_cylinder }]))
  const lpgTradeRevenue = lpgTrades.reduce((s, t) => {
    const q = parseInt(t.quantity) || 0
    if (q <= 0 || t.from_size_kg === t.to_size_kg) return s
    const from = lpgPriceMap.get(t.from_size_kg)
    const to = lpgPriceMap.get(t.to_size_kg)
    if (!from || !to) return s
    const fromDeposit = from.full - from.refill
    const toDeposit = to.full - to.refill
    const charge = to.refill + (toDeposit - fromDeposit)
    return s + charge * q
  }, 0)
  const lpgTotal = lpgRowTotal + lpgTradeRevenue

  // --- Accessory computations ---
  const accComputations = accessoryRows.map(row => {
    const sold = parseInt(row.sold) || 0
    const damaged = parseInt(row.damaged) || 0
    const closing = parseInt(row.closing_stock) || 0
    const expectedClosing = row.opening_stock - sold - damaged
    const variance = row.closing_stock !== '' ? expectedClosing - closing : 0
    const hasVariance = row.closing_stock !== '' && variance !== 0
    const soldExceedsOpening = sold + damaged > row.opening_stock
    const value = sold * row.unit_price
    return { sold, damaged, expectedClosing, closing, variance, hasVariance, soldExceedsOpening, value }
  })
  const accessoryTotal = accComputations.reduce((s, c) => s + c.value, 0)

  // --- Lubricant computations ---
  const lubComputations = lubricantRows.map(row => {
    const sold = parseInt(row.sold) || 0
    const damaged = parseInt(row.damaged) || 0
    const closing = parseInt(row.closing_stock) || 0
    const expectedClosing = row.opening_stock - sold - damaged
    const variance = row.closing_stock !== '' ? expectedClosing - closing : 0
    const hasVariance = row.closing_stock !== '' && variance !== 0
    const soldExceedsOpening = sold + damaged > row.opening_stock
    const value = sold * row.unit_price
    return { sold, damaged, expectedClosing, closing, variance, hasVariance, soldExceedsOpening, value }
  })
  const lubricantTotal = lubComputations.reduce((s, c) => s + c.value, 0)

  const creditItemsTotal = creditItems.reduce((s, i) => s + i.amount, 0)
  const creditVal = creditAccounts.length > 0 ? creditItemsTotal : (parseFloat(creditSales) || 0)
  const actualCashVal = parseFloat(actualCash) || 0

  const totalExpected = fuelRevenue + lpgTotal + lubricantTotal + accessoryTotal
  const expectedCash = totalExpected - creditVal
  const difference = actualCashVal - expectedCash

  // Double-entry: a closing reading counts as "entered" only once it has been
  // blind-keyed twice and verified (not merely typed once).
  const allClosingsEntered = nozzleRows.length > 0 && nozzleRows.every(r => r.closing_reading !== '' && r.closing_verified)
  const allValid = nozzleComputations.every(c => c.valid || c.volume === 0)
  const allMechEntered = nozzleRows.every(r => r.mechanical_closing !== '' && r.mech_closing_verified)
  const allMechValid = nozzleComputations.every(c => c.mechValid !== false)
  // Stock variance validation: all variances must have notes
  const allStockVarianceNotesProvided = [
    ...lpgComputations.map((c, i) => !c.hasVariance || lpgRows[i].variance_note.trim() !== ''),
    ...accComputations.map((c, i) => !c.hasVariance || accessoryRows[i].variance_note.trim() !== ''),
    ...lubComputations.map((c, i) => !c.hasVariance || lubricantRows[i].variance_note.trim() !== ''),
  ].every(Boolean)
  const noStockOutViolations = [...lpgComputations, ...accComputations, ...lubComputations].every(c => !c.soldExceedsOpening)
  const hasDeviationFlags = nozzleComputations.some(c => c.flagged)
  const hasLossFlags = nozzleComputations.some(c => c.lossExceedsThreshold)
  // All flagged nozzles must have a deviation note before proceeding
  const allDeviationNotesProvided = nozzleRows.every((row, i) => {
    const comp = nozzleComputations[i]
    return !comp?.flagged && !comp?.lossExceedsThreshold || row.deviation_note.trim() !== ''
  })

  const canProceedToReview = allClosingsEntered && allValid && allMechEntered && allMechValid && allStockVarianceNotesProvided && noStockOutViolations && allDeviationNotesProvided
  const canSubmit = currentStep === 2 && allClosingsEntered && allValid && allMechEntered && allMechValid
    && allStockVarianceNotesProvided && noStockOutViolations && !submitting
    && (!hasDeviationFlags || notes.trim() !== '')

  // Plain-language list of what still blocks submission (read-only; mirrors the
  // existing canProceedToReview / canSubmit gates — item 4).
  const pendingItems: string[] = (() => {
    const items: string[] = []
    const n = (count: number, one: string, many: string) => count === 1 ? one : `${count} ${many}`
    const closingsMissing = nozzleRows.filter(r => !(r.closing_reading !== '' && r.closing_verified)).length
    if (closingsMissing > 0) items.push(`${n(closingsMissing, 'A closing reading', 'closing readings')} still to enter`)
    const mechMissing = nozzleRows.filter(r => !(r.mechanical_closing !== '' && r.mech_closing_verified)).length
    if (mechMissing > 0) items.push(`${n(mechMissing, 'A mechanical reading', 'mechanical readings')} still to enter`)
    const invalidCount = nozzleComputations.filter(c => !(c.valid || c.volume === 0) || c.mechValid === false).length
    if (invalidCount > 0) items.push(`${n(invalidCount, 'A reading', 'readings')} look wrong (closing below opening)`)
    const stockOuts = [...lpgComputations, ...accComputations, ...lubComputations].filter(c => c.soldExceedsOpening).length
    if (stockOuts > 0) items.push(`${n(stockOuts, 'An item', 'items')} sold more than the opening stock`)
    const stockNotesMissing =
      lpgComputations.filter((c, i) => c.hasVariance && lpgRows[i].variance_note.trim() === '').length +
      accComputations.filter((c, i) => c.hasVariance && accessoryRows[i].variance_note.trim() === '').length +
      lubComputations.filter((c, i) => c.hasVariance && lubricantRows[i].variance_note.trim() === '').length
    if (stockNotesMissing > 0) items.push(`${n(stockNotesMissing, 'A stock variance', 'stock variances')} need a note`)
    const devNotesMissing = nozzleRows.filter((row, i) => {
      const c = nozzleComputations[i]
      return (c?.flagged || c?.lossExceedsThreshold) && row.deviation_note.trim() === ''
    }).length
    if (devNotesMissing > 0) items.push(`${n(devNotesMissing, 'A meter deviation', 'meter deviations')} need a note`)
    if (hasDeviationFlags && notes.trim() === '') items.push('A shift note is required (deviations were flagged)')
    return items
  })()

  // A returned/reopened handover for this shift, if any (item 6 — read-only surfacing).
  const returnedHandover: any = isAttendant
    ? (pastHandovers as any[]).find(h =>
        h.shift_id === shiftInfo?.shift_id && (h.review_status === 'returned' || h.status === 'reopened'))
    : null

  // Two-mode: a fresh shift starts in "verify opening" mode until the attendant
  // confirms the carried-forward opening. In-flight shifts (handover exists) are
  // already opening_verified, so they go straight to the closing flow.
  const inStartMode = isAttendant && shiftFound && !openingVerified && !handoverResult

  // Which closing reading (if any) is currently being double-entered.
  const [activeEntry, setActiveEntry] = useState<{ nozzleId: string; field: 'electronic' | 'mechanical' } | null>(null)

  // Commit a closing reading once it has passed the blind double-entry check.
  // Stores the value verbatim and marks the field verified — downstream volume/
  // deviation logic is unchanged from when the value was typed directly.
  const confirmClosingReading = (nozzleId: string, value: string) => {
    setNozzleRows(prev =>
      prev.map(r => r.nozzle_id === nozzleId ? { ...r, closing_reading: value, closing_verified: true } : r)
    )
  }

  const confirmMechClosing = (nozzleId: string, value: string) => {
    setNozzleRows(prev =>
      prev.map(r => r.nozzle_id === nozzleId ? { ...r, mechanical_closing: value, mech_closing_verified: true } : r)
    )
  }

  const updateOpeningReading = (nozzleId: string, value: string) => {
    setNozzleRows(prev =>
      prev.map(r => r.nozzle_id === nozzleId ? { ...r, opening_reading: parseFloat(value) || 0 } : r)
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
        lpg_cylinders: lpgRows.map((row) => ({
          size_kg: row.size_kg,
          opening_full: row.opening_full,
          opening_empty: row.opening_empty,
          additions: 0,
          closing_full: parseInt(row.closing_full) || 0,
          closing_empty: parseInt(row.closing_empty) || 0,
          sold_refill: parseInt(row.sold_refill) || 0,
          sold_with_cylinder: parseInt(row.sold_with_cylinder) || 0,
          damaged: parseInt(row.damaged) || 0,
          variance_note: row.variance_note || null,
        })),
        accessories: accessoryRows.map((row) => ({
          product_code: row.product_code,
          description: row.description,
          opening_stock: row.opening_stock,
          additions: 0,
          sold: parseInt(row.sold) || 0,
          damaged: parseInt(row.damaged) || 0,
          closing_stock: parseInt(row.closing_stock) || 0,
          variance_note: row.variance_note || null,
        })),
        lubricants: lubricantRows.map((row) => ({
          product_code: row.product_code,
          description: row.description,
          opening_stock: row.opening_stock,
          additions: 0,
          sold: parseInt(row.sold) || 0,
          damaged: parseInt(row.damaged) || 0,
          closing_stock: parseInt(row.closing_stock) || 0,
          variance_note: row.variance_note || null,
        })),
        lpg_trades: lpgTrades
          .filter(t => (parseInt(t.quantity) || 0) > 0 && t.from_size_kg !== t.to_size_kg)
          .map(t => ({
            from_size_kg: t.from_size_kg,
            to_size_kg: t.to_size_kg,
            quantity: parseInt(t.quantity) || 0,
          })),
        lpg_no_sales: lpgNoSales,
        acc_no_sales: accNoSales,
        lub_no_sales: lubNoSales,
      }

      const res = await authFetch(`${BASE}/handover/submit-readings`, {
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
            ...(r.changeover_reading ? { changeover_reading: parseFloat(r.changeover_reading) } : {}),
          })),
          notes: notes || null,
          stock_snapshot: stockSnapshot,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || 'Failed to submit readings')
      }

      const result = await res.json()
      setHandoverResult(result)
      setReadingsVerifiedHandover(result)
      setSuccess('Readings verified successfully! Proceed to the office for shift closing.')
    } catch (err: any) {
      setError(err.message || 'Submission failed')
    } finally {
      setSubmitting(false)
    }
  }

  // Safe deposit functions
  const fetchMyDeposits = () => {
    if (!shiftInfo?.shift_id) return
    authFetch(`${BASE}/safe-deposits/${shiftInfo.shift_id}/my-deposits`, { headers: getAuthHeaders() })
      .then(r => r.ok ? r.json() : { deposits: [], count: 0, total: 0, overdue: false })
      .then(data => {
        setMyDeposits(data.deposits || [])
        setDepositTotal(data.total || 0)
        setDepositOverdue(data.overdue || false)
      })
      .catch(() => {})
  }

  useEffect(() => { fetchMyDeposits() }, [shiftInfo?.shift_id])

  // Fetch all attendants' deposits for "On This Shift" (supervisor/manager)
  const fetchShiftDeposits = () => {
    if (!shiftInfo?.shift_id || isAttendant) return
    authFetch(`${BASE}/safe-deposits/${shiftInfo.shift_id}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => setShiftDeposits(data))
      .catch(() => {})
  }
  useEffect(() => { fetchShiftDeposits() }, [shiftInfo?.shift_id, isAttendant])

  const handleRecordDeposit = async () => {
    const amt = parseFloat(depositAmount)
    if (!amt || amt <= 0) return
    setDepositSaving(true)
    try {
      const res = await authFetch(`${BASE}/safe-deposits/`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ shift_id: shiftInfo.shift_id, amount: amt, time: depositTime, note: depositNote }),
      })
      if (res.ok) {
        setDepositAmount('')
        setDepositNote('')
        const now = new Date()
        setDepositTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`)
        fetchMyDeposits()
      }
    } catch {}
    finally { setDepositSaving(false) }
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
    const isOwnerOrSupervisor = !isAttendant && (userRole === 'owner' || userRole === 'manager' || userRole === 'supervisor')

    if (isOwnerOrSupervisor) {
      return <SupervisorDashboard theme={theme} pastHandovers={pastHandovers} />
    }

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
            <PastHandoversTable handovers={pastHandovers} theme={theme} isAttendant={true} />
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
    2: 'Review your entries before submitting',
  }

  // Start-of-shift: record the attendant's verification of the carried-forward
  // opening readings/stock, then move into the closing flow.
  const handleVerifyOpening = async () => {
    if (!shiftInfo?.shift_id) return
    setVerifyingOpening(true)
    setError('')
    try {
      const res = await authFetch(`${BASE}/handover/verify-opening`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          shift_id: shiftInfo.shift_id,
          discrepancy_note: openingDiscrepancyNote.trim() || null,
        }),
      })
      if (!res.ok) {
        const e = await res.json().catch(() => ({ detail: 'Failed to verify opening' }))
        throw new Error(e.detail || 'Failed to verify opening')
      }
      setOpeningVerified(true)
    } catch (err: any) {
      setError(err.message || 'Failed to verify opening')
    } finally {
      setVerifyingOpening(false)
    }
  }

  const handleRedoReadings = async () => {
    if (!readingsVerifiedHandover) return
    if (!confirm('This will discard your previously submitted readings. Continue?')) return
    try {
      const res = await authFetch(`${BASE}/handover/redo-readings`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ handover_id: readingsVerifiedHandover.handover_id }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || 'Failed to redo readings')
      }
      setReadingsVerifiedHandover(null)
      setHandoverResult(null)
      setSuccess('')
      setCurrentStep(1)
    } catch (err: any) {
      setError(err.message || 'Failed to redo readings')
    }
  }

  return (
    <div>
      {/* Blind double-entry prompt for a closing reading */}
      {activeEntry && (() => {
        const row = nozzleRows.find(r => r.nozzle_id === activeEntry.nozzleId)
        if (!row) return null
        const isElectronic = activeEntry.field === 'electronic'
        const label = row.fuel_type_abbrev && row.display_label
          ? `${row.fuel_type_abbrev} ${row.display_label}`
          : row.nozzle_id
        return (
          <DoubleEntryModal
            title={`${label} — ${isElectronic ? 'Electronic' : 'Mechanical'} Closing`}
            unit="L"
            minValue={isElectronic ? row.opening_reading : row.mechanical_opening}
            onConfirm={(value) => {
              if (isElectronic) confirmClosingReading(activeEntry.nozzleId, value)
              else confirmMechClosing(activeEntry.nozzleId, value)
              setActiveEntry(null)
            }}
            onCancel={() => setActiveEntry(null)}
          />
        )
      })()}
      <div className="mb-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: theme.textPrimary }}>Readings Verification</h1>
            <p className="text-sm mt-1" style={{ color: theme.textSecondary }}>
              {handoverResult ? 'Readings verified — proceed to office for shift closing' : stepSubtitles[currentStep]}
            </p>
          </div>
          {availableShifts.length > 1 && (
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: theme.textSecondary }}>Active Shift</label>
              <select
                value={selectedShiftId}
                onChange={e => setSelectedShiftId(e.target.value)}
                className="px-3 py-2 rounded-lg border text-sm font-medium"
                style={{ backgroundColor: theme.cardBg, color: theme.textPrimary, borderColor: theme.border }}>
                <option value="">-- Select Shift --</option>
                {availableShifts.map((s: any) => (
                  <option key={s.shift_id} value={s.shift_id}>
                    {s.date} — {s.shift_type} Shift
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
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

      {/* Shift Info Card — collapsible */}
      <div className="rounded-lg shadow mb-6 overflow-hidden"
        style={{ backgroundColor: theme.cardBg, borderColor: theme.border, borderWidth: 1 }}>
        <button onClick={() => setShowShiftInfo(!showShiftInfo)}
          className="w-full p-4 flex justify-between items-center text-left">
          <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: theme.textSecondary }}>
            Shift Information
          </h2>
          <span className="text-xs" style={{ color: theme.textSecondary }}>{showShiftInfo ? '−' : '+'}</span>
        </button>
        {showShiftInfo && (
        <div className="px-4 pb-4 grid grid-cols-2 md:grid-cols-4 gap-4">
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
        )}
      </div>

      {/* On This Shift — supervisor/manager view of all attendants + deposits */}
      {!isAttendant && shiftFound && shiftInfo && (
        <div className="rounded-lg shadow mb-6 overflow-hidden"
          style={{ backgroundColor: theme.cardBg, borderColor: theme.border, borderWidth: 1 }}>
          <button onClick={() => setShowOnThisShift(!showOnThisShift)}
            className="w-full p-4 flex justify-between items-center text-left">
            <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: theme.textSecondary }}>
              On This Shift
            </h2>
            <span className="text-xs" style={{ color: theme.textSecondary }}>
              {shiftInfo.assignments?.length || 0} attendant{(shiftInfo.assignments?.length || 0) !== 1 ? 's' : ''} {showOnThisShift ? '−' : '+'}
            </span>
          </button>
          {showOnThisShift && (
            <div className="px-4 pb-4 space-y-3">
              {/* Attendant list */}
              {(shiftInfo.assignments || [])
                .sort((a: any, b: any) => (a.attendant_id || '').localeCompare(b.attendant_id || ''))
                .map((assignment: any) => {
                  const attDeposits = shiftDeposits?.attendants?.find((a: any) => a.attendant_id === assignment.attendant_id)
                  return (
                    <div key={assignment.attendant_id} className="p-3 rounded-lg border"
                      style={{ borderColor: attDeposits?.overdue ? 'var(--color-status-warning)' : theme.border }}>
                      <div className="flex justify-between items-center">
                        <div>
                          <span className="text-sm font-semibold" style={{ color: theme.textPrimary }}>{assignment.attendant_name}</span>
                          <span className="text-xs ml-2" style={{ color: theme.textSecondary }}>{assignment.attendant_id}</span>
                          {attDeposits?.overdue && (
                            <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-badge bg-status-warning/20 text-status-warning font-semibold">OVERDUE</span>
                          )}
                        </div>
                        <div className="text-right">
                          <span className="text-xs" style={{ color: theme.textSecondary }}>
                            Islands: {assignment.island_ids?.join(', ') || 'N/A'}
                          </span>
                        </div>
                      </div>
                      {/* Deposit summary */}
                      <div className="mt-2 flex justify-between items-center text-xs" style={{ color: theme.textSecondary }}>
                        <span>
                          Safe Deposits: <strong style={{ color: theme.textPrimary }}>{attDeposits?.count || 0}</strong> deposit{(attDeposits?.count || 0) !== 1 ? 's' : ''}
                        </span>
                        <span className="font-semibold" style={{ color: theme.textPrimary }}>
                          Total: K{(attDeposits?.total || 0).toLocaleString()}
                        </span>
                      </div>
                      {attDeposits?.last_deposit_time && (
                        <div className="text-xs mt-1" style={{ color: theme.textSecondary }}>
                          Last deposit: {attDeposits.deposits?.[attDeposits.deposits.length - 1]?.time || new Date(attDeposits.last_deposit_time).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}
                        </div>
                      )}
                    </div>
                  )
                })}
              {(!shiftInfo.assignments || shiftInfo.assignments.length === 0) && (
                <div className="text-sm text-center py-4" style={{ color: theme.textSecondary }}>No attendants assigned to this shift</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Handover returned by supervisor — surface the note (item 6, read-only) */}
      {isAttendant && returnedHandover && (
        <div className="rounded-lg shadow p-4 mb-6"
          style={{ backgroundColor: 'var(--color-status-warning-light)', borderColor: 'var(--color-status-warning)', borderWidth: 2 }}>
          <h3 className="font-semibold text-sm" style={{ color: 'var(--color-status-warning)' }}>
            Handover returned by supervisor
          </h3>
          <p className="text-sm mt-1" style={{ color: 'var(--color-status-warning)' }}>
            {returnedHandover.supervisor_review?.note
              ? `“${returnedHandover.supervisor_review.note}”`
              : 'Your handover was sent back for correction.'}
          </p>
          <p className="text-xs mt-2" style={{ color: 'var(--color-status-warning)' }}>
            Handover ID: {returnedHandover.handover_id}. Please correct the issue and resubmit as instructed.
          </p>
        </div>
      )}

      {/* Phase 1 already submitted banner */}
      {readingsVerifiedHandover && !handoverResult && (
        <div className="rounded-lg shadow p-4 mb-6"
          style={{ backgroundColor: 'var(--color-status-success-light)', borderColor: 'var(--color-status-success)', borderWidth: 2 }}>
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-semibold text-sm" style={{ color: 'var(--color-status-success)' }}>
                Readings Verified
              </h3>
              <p className="text-sm mt-1" style={{ color: 'var(--color-status-success)' }}>
                Your readings have been submitted. Proceed to the office for shift closing.
              </p>
              <p className="text-xs mt-2" style={{ color: 'var(--color-status-success)' }}>
                Handover ID: {readingsVerifiedHandover.handover_id} | Total Expected: K{(readingsVerifiedHandover.total_expected || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </p>
              {/* Step 2 of the day's flow — make the next hop obvious (item 3) */}
              <Link href="/shift-closing"
                className="inline-block mt-3 px-4 py-2 text-sm font-semibold rounded-lg text-white"
                style={{ backgroundColor: 'var(--color-status-success)' }}>
                Next: Close Shift
              </Link>
            </div>
            <button
              onClick={handleRedoReadings}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg"
              style={{ backgroundColor: 'var(--color-status-warning-light)', color: 'var(--color-status-warning)', borderColor: 'var(--color-status-warning)', borderWidth: 1 }}>
              Redo Readings
            </button>
          </div>
        </div>
      )}

      {/* Safe Deposits — visible on all steps during active shift */}
      {shiftFound && !handoverResult && (
        <div className="rounded-lg shadow mb-6 overflow-hidden"
          style={{ backgroundColor: theme.cardBg, borderColor: depositOverdue ? 'var(--color-status-warning)' : theme.border, borderWidth: depositOverdue ? 2 : 1 }}>
          <button
            onClick={() => setShowDeposits(!showDeposits)}
            className="w-full p-3 flex justify-between items-center text-sm font-medium"
            style={{ color: theme.textPrimary }}>
            <span className="flex items-center gap-2">
              Safe Deposits
              {depositOverdue && <span className="text-[10px] px-1.5 py-0.5 rounded-badge bg-status-warning/20 text-status-warning font-semibold">OVERDUE</span>}
            </span>
            <span className="text-xs" style={{ color: theme.textSecondary }}>
              {myDeposits.length} deposit{myDeposits.length !== 1 ? 's' : ''} — K{depositTotal.toLocaleString()} {showDeposits ? '−' : '+'}
            </span>
          </button>
          {showDeposits && (
            <div className="p-3 space-y-3" style={{ borderTopColor: theme.border, borderTopWidth: 1 }}>
              {/* Deposit form */}
              <div className="flex flex-col sm:flex-row gap-2 sm:items-end flex-wrap">
                <div className="w-full sm:w-28">
                  <label className="block text-xs text-content-secondary mb-1">Time</label>
                  <input type="time" value={depositTime}
                    onChange={e => setDepositTime(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded border" style={inputStyle} />
                </div>
                <div className="flex-1 min-w-0">
                  <label className="block text-xs text-content-secondary mb-1">Amount (ZMW)</label>
                  <input type="number" min={0} step={1} value={depositAmount}
                    onChange={e => setDepositAmount(e.target.value)}
                    placeholder="e.g. 1500"
                    className="w-full px-3 py-2 text-sm rounded border" style={inputStyle} />
                </div>
                <div className="flex-1 min-w-0">
                  <label className="block text-xs text-content-secondary mb-1">Note (optional)</label>
                  <input type="text" value={depositNote}
                    onChange={e => setDepositNote(e.target.value)}
                    placeholder="e.g. Fleet fill-up"
                    className="w-full px-3 py-2 text-sm rounded border" style={inputStyle} />
                </div>
                <button onClick={handleRecordDeposit} disabled={depositSaving || !depositAmount || !depositTime}
                  className="w-full sm:w-auto px-4 py-2 rounded text-sm font-medium text-white disabled:opacity-50"
                  style={{ backgroundColor: theme.primary }}>
                  {depositSaving ? '...' : 'Deposit'}
                </button>
              </div>

              {/* Deposit history */}
              {myDeposits.length > 0 && (
                <div className="space-y-1">
                  {myDeposits.map((d: any, i: number) => (
                    <div key={d.deposit_id} className="flex justify-between items-center text-xs p-1.5 rounded"
                      style={{ backgroundColor: theme.background }}>
                      <span style={{ color: theme.textSecondary }}>
                        {d.time || new Date(d.timestamp).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})} {d.note && `— ${d.note}`}
                      </span>
                      <span className="font-semibold" style={{ color: theme.textPrimary }}>K{d.amount.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}

              {depositOverdue && (
                <div className="p-2 rounded text-xs font-medium" style={{ backgroundColor: 'rgba(255,193,7,0.1)', color: 'var(--color-status-warning)' }}>
                  You have not made a deposit in over 1 hour. Please deposit accumulated cash into the safe.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Start of shift: verify the carried-forward opening readings & stock */}
      {inStartMode && (
        <div className="space-y-6">
          <div className="rounded-lg shadow p-4" style={{ backgroundColor: 'var(--color-action-primary-light)', borderColor: 'var(--color-action-primary)', borderWidth: 1 }}>
            <h2 className="text-lg font-bold" style={{ color: 'var(--color-action-primary)' }}>Start of shift — verify your opening</h2>
            <p className="text-sm mt-1" style={{ color: 'var(--color-action-primary)' }}>
              These opening figures carry over from the previous shift&rsquo;s close. Check them against the pumps and stock, then confirm to begin. If anything doesn&rsquo;t match, note it below.
            </p>
          </div>

          {/* Opening readings (read-only) */}
          <div className="rounded-lg shadow overflow-hidden" style={{ backgroundColor: theme.cardBg, borderColor: theme.border, borderWidth: 1 }}>
            <div className="p-4 font-semibold text-sm" style={{ borderBottomColor: theme.border, borderBottomWidth: 1, color: theme.textPrimary }}>
              Opening meter readings
            </div>
            <table className="min-w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: theme.background }}>
                  {['Nozzle', 'Fuel', 'Electronic opening', 'Mechanical opening'].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-medium uppercase" style={{ color: theme.textSecondary }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {nozzleRows.map(row => (
                  <tr key={row.nozzle_id} style={{ borderTopColor: theme.border, borderTopWidth: 1 }}>
                    <td className="px-3 py-2 font-medium" style={{ color: theme.textPrimary }}>{row.display_label || row.nozzle_id}</td>
                    <td className="px-3 py-2" style={{ color: theme.textSecondary }}>{row.fuel_type}</td>
                    <td className="px-3 py-2 font-mono" style={{ color: theme.textPrimary }}>{Number(row.opening_reading || 0).toLocaleString(undefined, { minimumFractionDigits: 3 })}</td>
                    <td className="px-3 py-2 font-mono" style={{ color: theme.textPrimary }}>{Number(row.mechanical_opening || 0).toLocaleString(undefined, { minimumFractionDigits: 3 })}</td>
                  </tr>
                ))}
                {nozzleRows.length === 0 && (
                  <tr><td colSpan={4} className="px-3 py-6 text-center text-sm" style={{ color: theme.textSecondary }}>No nozzles assigned</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Opening stock summary (read-only) — only items carried with stock */}
          {(() => {
            const lpgOpen = lpgRows.filter(r => (r.opening_full || 0) > 0 || (r.opening_empty || 0) > 0)
            const accOpen = accessoryRows.filter(r => (r.opening_stock || 0) > 0)
            const lubOpen = lubricantRows.filter(r => (r.opening_stock || 0) > 0)
            if (lpgOpen.length === 0 && accOpen.length === 0 && lubOpen.length === 0) return null
            return (
              <div className="rounded-lg shadow p-4" style={{ backgroundColor: theme.cardBg, borderColor: theme.border, borderWidth: 1 }}>
                <div className="font-semibold text-sm mb-3" style={{ color: theme.textPrimary }}>Opening stock</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
                  {lpgOpen.map(r => (
                    <div key={`lpg-${r.size_kg}`} className="flex justify-between">
                      <span style={{ color: theme.textSecondary }}>{r.size_kg}kg cylinders</span>
                      <span className="font-mono" style={{ color: theme.textPrimary }}>{r.opening_full} full{(r.opening_empty || 0) > 0 ? ` / ${r.opening_empty} empty` : ''}</span>
                    </div>
                  ))}
                  {accOpen.map(r => (
                    <div key={`acc-${r.product_code}`} className="flex justify-between">
                      <span style={{ color: theme.textSecondary }}>{r.description}</span>
                      <span className="font-mono" style={{ color: theme.textPrimary }}>{r.opening_stock}</span>
                    </div>
                  ))}
                  {lubOpen.map(r => (
                    <div key={`lub-${r.product_code}`} className="flex justify-between">
                      <span style={{ color: theme.textSecondary }}>{r.description}</span>
                      <span className="font-mono" style={{ color: theme.textPrimary }}>{r.opening_stock}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}

          {/* Optional discrepancy note + confirm */}
          <div className="rounded-lg shadow p-4" style={{ backgroundColor: theme.cardBg, borderColor: theme.border, borderWidth: 1 }}>
            <label className="block text-sm font-medium mb-1" style={{ color: theme.textSecondary }}>
              Discrepancy note (optional)
            </label>
            <textarea
              rows={2}
              value={openingDiscrepancyNote}
              onChange={e => setOpeningDiscrepancyNote(e.target.value)}
              placeholder="e.g. UNL 1A pump shows 12350 but handover says 12345"
              className="w-full px-3 py-2 text-sm rounded border"
              style={{ backgroundColor: theme.background, color: theme.textPrimary, borderColor: theme.border }}
            />
            <button
              onClick={handleVerifyOpening}
              disabled={verifyingOpening}
              className="mt-3 w-full sm:w-auto px-6 py-3 rounded-lg text-base font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: theme.primary }}>
              {verifyingOpening ? 'Confirming...' : 'Confirm opening & begin shift'}
            </button>
          </div>
        </div>
      )}

      {/* Step Indicator — visible to attendants only, before submission, with active shift */}
      {isAttendant && shiftFound && !handoverResult && openingVerified && (
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
              Step 1: Enter readings
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
              Step 2: Review &amp; submit
            </span>
          </div>

        </div>
      )}

      {/* ============================================= */}
      {/* STEP 1: Enter Readings & Stock Counts         */}
      {/* Financial columns (Price, Revenue, Value) hidden */}
      {/* ============================================= */}
      {currentStep === 1 && !handoverResult && !inStartMode && (
        <>
          {/* What's left to submit — live checklist of the existing submit gates (item 4) */}
          <div className="rounded-lg shadow p-4 mb-6"
            style={{ backgroundColor: theme.cardBg, borderColor: pendingItems.length === 0 ? 'var(--color-status-success)' : theme.border, borderWidth: 1 }}>
            {pendingItems.length === 0 ? (
              <p className="text-sm font-medium" style={{ color: 'var(--color-status-success)' }}>
                Everything is entered. Tap &ldquo;Review my entries&rdquo; below.
              </p>
            ) : (
              <>
                <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: theme.textSecondary }}>
                  Still needed before you can submit
                </p>
                <ul className="space-y-1.5">
                  {pendingItems.map((item, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm" style={{ color: theme.textPrimary }}>
                      <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: 'var(--color-status-warning)' }} />
                      {item}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          {/* Price change banner */}
          {priceChangeDetected && (
            <div className="rounded-lg p-3 mb-4 text-sm"
              style={{ backgroundColor: 'var(--color-status-warning-light)', color: 'var(--color-status-warning)', borderWidth: 1, borderColor: 'var(--color-status-warning)' }}>
              <span className="font-semibold">Price change detected during this shift.</span> Enter the meter reading at midnight (changeover point) for each nozzle. If you don't have the reading, leave it blank and the system will estimate.
            </div>
          )}

          {/* Nozzle Readings Table — collapsible */}
          <div className="rounded-lg shadow mb-6 overflow-hidden"
            style={{ backgroundColor: theme.cardBg, borderColor: theme.border, borderWidth: 1 }}>
            <button onClick={() => setShowNozzles(!showNozzles)}
              className="w-full p-4 flex justify-between items-center text-left font-semibold text-sm"
              style={{ color: theme.textPrimary }}>
              <span>Nozzle Readings</span>
              <span className="text-xs font-normal" style={{ color: theme.textSecondary }}>{nozzleRows.length} nozzle{nozzleRows.length !== 1 ? 's' : ''} {showNozzles ? '−' : '+'}</span>
            </button>
            {showNozzles && (
            <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                {/* Group header row */}
                <tr style={{ backgroundColor: theme.background }}>
                  <th rowSpan={2} className="px-3 py-1 text-left text-xs font-medium uppercase whitespace-nowrap" style={{ color: theme.textSecondary, borderBottomColor: theme.border, borderBottomWidth: 1 }}>Nozzle</th>
                  <th rowSpan={2} className="px-3 py-1 text-left text-xs font-medium uppercase whitespace-nowrap" style={{ color: theme.textSecondary, borderBottomColor: theme.border, borderBottomWidth: 1 }}>Fuel</th>
                  <th colSpan={priceChangeDetected ? 4 : 3} className="px-3 py-1 text-center text-xs font-semibold uppercase" style={{ color: theme.primary, borderBottomColor: theme.primary, borderBottomWidth: 2 }}>Electronic</th>
                  <th colSpan={3} className="px-3 py-1 text-center text-xs font-semibold uppercase" style={{ color: 'var(--color-status-warning)', borderBottomColor: 'var(--color-status-warning)', borderBottomWidth: 2 }}>Mechanical</th>
                  <th rowSpan={2} className="px-3 py-1 text-left text-xs font-medium uppercase whitespace-nowrap" style={{ color: theme.textSecondary, borderBottomColor: theme.border, borderBottomWidth: 1 }}>Deviation</th>
                </tr>
                {/* Sub-header row */}
                <tr style={{ backgroundColor: theme.background }}>
                  <th className="px-3 py-1 text-center text-xs font-medium uppercase whitespace-nowrap" style={{ color: theme.textSecondary }}>Open</th>
                  {priceChangeDetected && <th className="px-3 py-1 text-center text-xs font-medium uppercase whitespace-nowrap" style={{ color: theme.textSecondary }}>Changeover</th>}
                  <th className="px-3 py-1 text-center text-xs font-medium uppercase whitespace-nowrap" style={{ color: theme.textSecondary }}>Close</th>
                  <th className="px-3 py-1 text-center text-xs font-medium uppercase whitespace-nowrap" style={{ color: theme.textSecondary }}>Volume</th>
                  <th className="px-3 py-1 text-center text-xs font-medium uppercase whitespace-nowrap" style={{ color: theme.textSecondary }}>Open</th>
                  <th className="px-3 py-1 text-center text-xs font-medium uppercase whitespace-nowrap" style={{ color: theme.textSecondary }}>Close</th>
                  <th className="px-3 py-1 text-center text-xs font-medium uppercase whitespace-nowrap" style={{ color: theme.textSecondary }}>Volume</th>
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
                    <React.Fragment key={row.nozzle_id}>
                    <tr className="hover:bg-surface-bg" style={{ borderTopColor: theme.border, borderTopWidth: 1 }}>
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
                          className="w-20 sm:w-32 px-1 sm:px-2 py-1 rounded border text-xs sm:text-sm text-right font-mono"
                          style={inputStyle}
                        />
                      </td>
                      {priceChangeDetected && (
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          step="0.001"
                          value={row.changeover_reading}
                          onChange={e => setNozzleRows(prev => prev.map(r => r.nozzle_id === row.nozzle_id ? { ...r, changeover_reading: e.target.value } : r))}
                          placeholder="Midnight"
                          className="w-20 sm:w-32 px-1 sm:px-2 py-1 rounded border text-xs sm:text-sm text-right font-mono"
                          style={{
                            ...inputStyle,
                            borderColor: row.changeover_reading && (parseFloat(row.changeover_reading) < row.opening_reading || (row.closing_reading && parseFloat(row.changeover_reading) > parseFloat(row.closing_reading)))
                              ? 'var(--color-status-error)' : 'var(--color-status-warning)',
                          }}
                        />
                      </td>
                      )}
                      <td className="px-3 py-2">
                        {row.closing_verified && row.closing_reading !== '' ? (
                          <div className="flex items-center justify-end gap-1">
                            <span className="font-mono text-xs sm:text-sm" style={{ color: theme.textPrimary }}>{row.closing_reading}</span>
                            <span title="Double-entry verified" style={{ color: 'var(--color-status-success)' }}>✓</span>
                            <button type="button" onClick={() => setActiveEntry({ nozzleId: row.nozzle_id, field: 'electronic' })}
                              className="text-xs underline" style={{ color: theme.primary }}>Re-do</button>
                          </div>
                        ) : (
                          <button type="button" onClick={() => setActiveEntry({ nozzleId: row.nozzle_id, field: 'electronic' })}
                            className="w-20 sm:w-32 px-1 sm:px-2 py-1 rounded border text-xs sm:text-sm font-medium"
                            style={{ ...inputStyle, borderColor: theme.primary, color: theme.primary }}>
                            Enter ✎
                          </button>
                        )}
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
                          className="w-20 sm:w-32 px-1 sm:px-2 py-1 rounded border text-xs sm:text-sm text-right font-mono"
                          style={inputStyle}
                        />
                      </td>
                      <td className="px-3 py-2">
                        {row.mech_closing_verified && row.mechanical_closing !== '' ? (
                          <div className="flex items-center justify-end gap-1">
                            <span className="font-mono text-xs sm:text-sm" style={{ color: theme.textPrimary }}>{row.mechanical_closing}</span>
                            <span title="Double-entry verified" style={{ color: 'var(--color-status-success)' }}>✓</span>
                            <button type="button" onClick={() => setActiveEntry({ nozzleId: row.nozzle_id, field: 'mechanical' })}
                              className="text-xs underline" style={{ color: theme.primary }}>Re-do</button>
                          </div>
                        ) : (
                          <button type="button" onClick={() => setActiveEntry({ nozzleId: row.nozzle_id, field: 'mechanical' })}
                            className="w-20 sm:w-32 px-1 sm:px-2 py-1 rounded border text-xs sm:text-sm font-medium"
                            style={{ ...inputStyle, borderColor: theme.primary, color: theme.primary }}>
                            Enter ✎
                          </button>
                        )}
                        {mechError && (
                          <div className="text-xs mt-0.5" style={{ color: 'var(--color-status-error)' }}>
                            Must be &ge; opening
                          </div>
                        )}
                      </td>
                      {/* Mechanical Volume */}
                      <td className="px-3 py-2 text-right font-mono font-medium" style={{ color: theme.textPrimary }}>
                        {comp.mechValid && row.mechanical_closing !== ''
                          ? comp.mechVolume.toLocaleString(undefined, { minimumFractionDigits: 3 })
                          : '-'}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs whitespace-nowrap" style={{
                        color: comp.flagged || comp.lossExceedsThreshold ? 'var(--color-status-error)' : theme.textSecondary,
                        fontWeight: comp.flagged || comp.lossExceedsThreshold ? 600 : 400,
                      }}>
                        {comp.mechValid && row.closing_reading !== '' && comp.valid
                          ? <>
                              {comp.flagged && <span title="Deviation exceeds threshold">! </span>}
                              {comp.lossExceedsThreshold && <span title={`Loss exceeds ${nozzleLossThreshold}L threshold`}>!! </span>}
                              {comp.deviationL.toFixed(3)} L ({comp.deviationPct.toFixed(2)}%)
                            </>
                          : '-'}
                      </td>
                    </tr>
                    {/* Inline deviation warning + mandatory note */}
                    {(comp.flagged || comp.lossExceedsThreshold) && comp.mechValid && row.closing_reading !== '' && (
                      <tr style={{ backgroundColor: 'rgba(239,83,80,0.05)' }}>
                        <td colSpan={priceChangeDetected ? 11 : 10} className="px-3 py-2">
                          <div className="flex items-start gap-3">
                            <div className="text-xs font-semibold text-status-error whitespace-nowrap pt-1">
                              {comp.lossExceedsThreshold
                                ? `Loss: ${comp.deviationL.toFixed(1)}L exceeds ${nozzleLossThreshold}L`
                                : `Deviation: ${comp.deviationPct.toFixed(2)}% exceeds ${meterThreshold}%`}
                            </div>
                            <div className="flex-1">
                              <input
                                type="text"
                                value={row.deviation_note}
                                onChange={e => setNozzleRows(prev => prev.map(r => r.nozzle_id === row.nozzle_id ? { ...r, deviation_note: e.target.value } : r))}
                                placeholder="Explain deviation (required to proceed)"
                                className="w-full px-2 py-1 rounded border text-xs"
                                style={{
                                  ...inputStyle,
                                  borderColor: row.deviation_note.trim() ? theme.border : 'var(--color-status-error)',
                                }}
                              />
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
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
          )}
          </div>

          {/* LPG Cylinders — collapsible */}
          <div className="rounded-lg shadow mb-6 overflow-hidden"
            style={{ backgroundColor: theme.cardBg, borderColor: theme.border, borderWidth: 1 }}>
            <button onClick={() => setShowLpg(!showLpg)}
              className="w-full p-4 flex justify-between items-center text-left font-semibold text-sm"
              style={{ color: theme.textPrimary }}>
              <span>LPG Cylinders</span>
              <span className="text-xs font-normal" style={{ color: theme.textSecondary }}>{showLpg ? '−' : '+'}</span>
            </button>
            {showLpg && (
            <div>
            {lpgNoSales ? (
              <div className="p-4 flex items-center gap-2">
                <span className="text-sm font-medium" style={{ color: 'var(--color-status-success)' }}>No LPG sales this shift ✓</span>
                <button onClick={() => setLpgNoSales(false)} className="text-xs underline" style={{ color: theme.textSecondary }}>Undo</button>
              </div>
            ) : (
            <>
            <div className="px-4 py-2 space-y-3">
              {lpgRows.map((row, idx) => {
                const comp = lpgComputations[idx]
                return (
                  <div key={row.size_kg} className="rounded-lg p-3" style={{ backgroundColor: theme.background, borderColor: theme.border, borderWidth: 1 }}>
                    {/* Header row */}
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-bold" style={{ color: theme.textPrimary }}>{row.size_kg}kg Cylinder</span>
                      <span className="text-xs font-mono px-2 py-0.5 rounded" style={{ backgroundColor: theme.cardBg, color: theme.textSecondary }}>
                        Opening: {row.opening_full}
                      </span>
                    </div>

                    {/* Input grid — 2 columns on mobile, 4 on desktop */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-[10px] uppercase font-medium mb-1" style={{ color: theme.textSecondary }}>Refills Sold</label>
                        <input type="number" min={0} max={row.opening_full} step={1}
                          value={row.sold_refill} onChange={e => updateLpgRow(idx, 'sold_refill', e.target.value)}
                          placeholder="0" className="w-full px-2 py-1.5 rounded border text-sm text-center font-mono"
                          style={{ ...inputStyle, borderColor: comp.soldExceedsOpening ? 'var(--color-status-error)' : theme.border }} />
                      </div>
                      <div>
                        <label className="block text-[10px] uppercase font-medium mb-1" style={{ color: theme.textSecondary }}>New Cyl Sold</label>
                        <input type="number" min={0} max={row.opening_full} step={1}
                          value={row.sold_with_cylinder} onChange={e => updateLpgRow(idx, 'sold_with_cylinder', e.target.value)}
                          placeholder="0" className="w-full px-2 py-1.5 rounded border text-sm text-center font-mono"
                          style={{ ...inputStyle, borderColor: comp.soldExceedsOpening ? 'var(--color-status-error)' : theme.border }} />
                      </div>
                      <div>
                        <label className="block text-[10px] uppercase font-medium mb-1" style={{ color: theme.textSecondary }}>Damaged</label>
                        <input type="number" min={0} step={1}
                          value={row.damaged} onChange={e => updateLpgRow(idx, 'damaged', e.target.value)}
                          placeholder="0" className="w-full px-2 py-1.5 rounded border text-sm text-center font-mono" style={inputStyle} />
                      </div>
                      <div>
                        <label className="block text-[10px] uppercase font-medium mb-1" style={{ color: theme.textSecondary }}>Closing (Count)</label>
                        <input type="number" min={0} step={1}
                          value={row.closing_full} onChange={e => updateLpgRow(idx, 'closing_full', e.target.value)}
                          placeholder="0" className="w-full px-2 py-1.5 rounded border text-sm text-center font-mono" style={inputStyle} />
                      </div>
                    </div>

                    {/* Computed footer */}
                    {row.closing_full !== '' && (
                      <div className="flex items-center justify-between mt-2 pt-2" style={{ borderTopColor: theme.border, borderTopWidth: 1 }}>
                        <span className="text-xs" style={{ color: theme.textSecondary }}>
                          Expected: <span className="font-mono">{comp.expectedClosing}</span>
                        </span>
                        <span className="text-xs font-medium font-mono" style={{ color: comp.hasVariance ? 'var(--color-status-error)' : 'var(--color-status-success)' }}>
                          Variance: {comp.variance === 0 ? '0 ✓' : comp.variance}
                        </span>
                      </div>
                    )}

                    {comp.soldExceedsOpening && (
                      <div className="mt-2 text-xs" style={{ color: 'var(--color-status-error)' }}>
                        Cannot sell more than opening stock ({row.opening_full})
                      </div>
                    )}

                    {comp.hasVariance && (
                      <div className="mt-2 p-2 rounded" style={{ backgroundColor: 'var(--color-status-error-light)' }}>
                        <label className="block text-[10px] uppercase font-medium mb-1" style={{ color: 'var(--color-status-error)' }}>
                          Explain variance ({comp.variance})
                        </label>
                        <input type="text" value={row.variance_note}
                          onChange={e => updateLpgRow(idx, 'variance_note', e.target.value)}
                          placeholder="e.g. 1 cylinder damaged, miscount..."
                          className="w-full px-2 py-1.5 rounded border text-xs"
                          style={{ ...inputStyle, borderColor: row.variance_note.trim() ? theme.border : 'var(--color-status-error)' }} />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            {/* Upgrades / Downgrades — customer swapped one cylinder size for another */}
            <div className="px-4 py-3" style={{ borderTopColor: theme.border, borderTopWidth: 1 }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs uppercase font-semibold" style={{ color: theme.textSecondary }}>
                  Upgrades / Downgrades
                </span>
                <button
                  type="button"
                  onClick={() => setLpgTrades(prev => [...prev, { from_size_kg: 3, to_size_kg: 6, quantity: '' }])}
                  className="text-xs px-2 py-1 rounded border"
                  style={{ color: theme.textSecondary, borderColor: theme.border }}
                >
                  + Add trade
                </button>
              </div>
              {lpgTrades.length === 0 ? (
                <p className="text-xs" style={{ color: theme.textSecondary }}>
                  Record a trade when a customer hands in a smaller (or larger) empty cylinder and takes a different size filled.
                </p>
              ) : (
                <div className="space-y-2">
                  {lpgTrades.map((trade, idx) => (
                    <div key={idx} className="grid grid-cols-7 gap-2 items-center">
                      <div className="col-span-2">
                        <label className="block text-[10px] uppercase font-medium mb-1" style={{ color: theme.textSecondary }}>From (empty)</label>
                        <select
                          value={trade.from_size_kg}
                          onChange={e => setLpgTrades(prev => prev.map((t, i) => i === idx ? { ...t, from_size_kg: parseInt(e.target.value) } : t))}
                          className="w-full px-2 py-1.5 rounded border text-sm"
                          style={inputStyle}
                        >
                          {lpgRows.map(r => (
                            <option key={r.size_kg} value={r.size_kg}>{r.size_kg}kg</option>
                          ))}
                        </select>
                      </div>
                      <div className="col-span-2">
                        <label className="block text-[10px] uppercase font-medium mb-1" style={{ color: theme.textSecondary }}>To (filled)</label>
                        <select
                          value={trade.to_size_kg}
                          onChange={e => setLpgTrades(prev => prev.map((t, i) => i === idx ? { ...t, to_size_kg: parseInt(e.target.value) } : t))}
                          className="w-full px-2 py-1.5 rounded border text-sm"
                          style={inputStyle}
                        >
                          {lpgRows.map(r => (
                            <option key={r.size_kg} value={r.size_kg}>{r.size_kg}kg</option>
                          ))}
                        </select>
                      </div>
                      <div className="col-span-2">
                        <label className="block text-[10px] uppercase font-medium mb-1" style={{ color: theme.textSecondary }}>Qty</label>
                        <input
                          type="number" min={0} step={1}
                          value={trade.quantity}
                          onChange={e => setLpgTrades(prev => prev.map((t, i) => i === idx ? { ...t, quantity: e.target.value } : t))}
                          placeholder="0"
                          className="w-full px-2 py-1.5 rounded border text-sm text-center font-mono"
                          style={inputStyle}
                        />
                      </div>
                      <div className="col-span-1 flex justify-end items-end h-full">
                        <button
                          type="button"
                          onClick={() => setLpgTrades(prev => prev.filter((_, i) => i !== idx))}
                          className="text-xs px-2 py-1.5 rounded border"
                          style={{ color: 'var(--color-status-error)', borderColor: theme.border }}
                          aria-label="Remove trade"
                        >
                          ×
                        </button>
                      </div>
                      {trade.from_size_kg === trade.to_size_kg && (
                        <div className="col-span-7 text-xs" style={{ color: 'var(--color-status-error)' }}>
                          From and To sizes must differ.
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="px-4 py-2 text-right text-sm font-semibold" style={{ color: theme.primary, borderTopColor: theme.border, borderTopWidth: 1 }}>
              {lpgTradeRevenue > 0 && (
                <span className="text-xs font-normal mr-2" style={{ color: theme.textSecondary }}>
                  (incl. trades ZMW {lpgTradeRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })})
                </span>
              )}
              LPG Revenue: ZMW {lpgTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
            {lpgComputations.every(c => c.totalSold === 0 && (parseInt(lpgRows[lpgComputations.indexOf(c)]?.damaged || '0') || 0) === 0) && (
              <div className="px-4 pb-3">
                <button onClick={() => {
                  setLpgNoSales(true)
                  setLpgRows(prev => prev.map(r => ({ ...r, closing_full: String(r.opening_full), closing_empty: String(r.opening_empty) })))
                }} className="text-xs px-3 py-1 rounded border" style={{ color: theme.textSecondary, borderColor: theme.border }}>
                  Confirm No Sales This Shift
                </button>
              </div>
            )}
            </>
            )}
            </div>
            )}
          </div>

          {/* Accessories — collapsible */}
          {accessoryRows.length > 0 && (
            <div className="rounded-lg shadow mb-6 overflow-hidden"
              style={{ backgroundColor: theme.cardBg, borderColor: theme.border, borderWidth: 1 }}>
              <button onClick={() => setShowAccessories(!showAccessories)}
                className="w-full p-4 flex justify-between items-center text-left font-semibold text-sm"
                style={{ color: theme.textPrimary }}>
                <span>LPG Accessories</span>
                <span className="text-xs font-normal" style={{ color: theme.textSecondary }}>{accessoryRows.length} items {showAccessories ? '−' : '+'}</span>
              </button>
              {showAccessories && (
              <div>
              {accNoSales ? (
                <div className="p-4 flex items-center gap-2">
                  <span className="text-sm font-medium" style={{ color: 'var(--color-status-success)' }}>No accessory sales this shift ✓</span>
                  <button onClick={() => setAccNoSales(false)} className="text-xs underline" style={{ color: theme.textSecondary }}>Undo</button>
                </div>
              ) : (
              <>
              <div className="px-4 py-2 space-y-3">
                {accessoryRows.map((row, idx) => {
                  const comp = accComputations[idx]
                  return (
                    <div key={row.product_code} className="rounded-lg p-3" style={{ backgroundColor: theme.background, borderColor: theme.border, borderWidth: 1 }}>
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-bold" style={{ color: theme.textPrimary }}>{row.description}</span>
                        <span className="text-xs font-mono px-2 py-0.5 rounded" style={{ backgroundColor: theme.cardBg, color: theme.textSecondary }}>
                          Opening: {row.opening_stock}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="block text-[10px] uppercase font-medium mb-1" style={{ color: theme.textSecondary }}>Qty Sold</label>
                          <input type="number" min={0} max={row.opening_stock} step={1}
                            value={row.sold} onChange={e => updateAccRow(idx, 'sold', e.target.value)}
                            placeholder="0" className="w-full px-2 py-1.5 rounded border text-sm text-center font-mono"
                            style={{ ...inputStyle, borderColor: comp.soldExceedsOpening ? 'var(--color-status-error)' : theme.border }} />
                        </div>
                        <div>
                          <label className="block text-[10px] uppercase font-medium mb-1" style={{ color: theme.textSecondary }}>Damaged</label>
                          <input type="number" min={0} step={1}
                            value={row.damaged} onChange={e => updateAccRow(idx, 'damaged', e.target.value)}
                            placeholder="0" className="w-full px-2 py-1.5 rounded border text-sm text-center font-mono" style={inputStyle} />
                        </div>
                        <div>
                          <label className="block text-[10px] uppercase font-medium mb-1" style={{ color: theme.textSecondary }}>Stock on Hand</label>
                          <input type="number" min={0} step={1}
                            value={row.closing_stock} onChange={e => updateAccRow(idx, 'closing_stock', e.target.value)}
                            placeholder="0" className="w-full px-2 py-1.5 rounded border text-sm text-center font-mono" style={inputStyle} />
                        </div>
                      </div>
                      {row.closing_stock !== '' && (
                        <div className="flex items-center justify-between mt-2 pt-2" style={{ borderTopColor: theme.border, borderTopWidth: 1 }}>
                          <span className="text-xs" style={{ color: theme.textSecondary }}>Expected: <span className="font-mono">{comp.expectedClosing}</span></span>
                          <span className="text-xs font-medium font-mono" style={{ color: comp.hasVariance ? 'var(--color-status-error)' : 'var(--color-status-success)' }}>
                            Variance: {comp.variance === 0 ? '0 ✓' : comp.variance}
                          </span>
                        </div>
                      )}
                      {comp.hasVariance && (
                        <div className="mt-2 p-2 rounded" style={{ backgroundColor: 'var(--color-status-error-light)' }}>
                          <label className="block text-[10px] uppercase font-medium mb-1" style={{ color: 'var(--color-status-error)' }}>Explain variance ({comp.variance})</label>
                          <input type="text" value={row.variance_note}
                            onChange={e => updateAccRow(idx, 'variance_note', e.target.value)}
                            placeholder="e.g. broken, returned..."
                            className="w-full px-2 py-1.5 rounded border text-xs"
                            style={{ ...inputStyle, borderColor: row.variance_note.trim() ? theme.border : 'var(--color-status-error)' }} />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
              <div className="px-4 py-2 text-right text-sm font-semibold" style={{ color: theme.primary, borderTopColor: theme.border, borderTopWidth: 1 }}>
                Accessories Revenue: ZMW {accessoryTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
              {accComputations.every(c => c.sold === 0 && c.damaged === 0) && (
                <div className="px-4 pb-3">
                  <button onClick={() => {
                    setAccNoSales(true)
                    setAccessoryRows(prev => prev.map(r => ({ ...r, closing_stock: String(r.opening_stock) })))
                  }} className="text-xs px-3 py-1 rounded border" style={{ color: theme.textSecondary, borderColor: theme.border }}>
                    Confirm No Sales This Shift
                  </button>
                </div>
              )}
              </>
              )}
              </div>
              )}
            </div>
          )}

          {/* Lubricants — collapsible */}
          {lubricantRows.length > 0 && (
            <div className="rounded-lg shadow mb-6 overflow-hidden"
              style={{ backgroundColor: theme.cardBg, borderColor: theme.border, borderWidth: 1 }}>
              <button onClick={() => setShowLubs(!showLubs)}
                className="w-full p-4 flex justify-between items-center text-left font-semibold text-sm"
                style={{ color: theme.textPrimary }}>
                <span>Lubricants</span>
                <span className="text-xs font-normal" style={{ color: theme.textSecondary }}>{lubricantRows.length} products {showLubs ? '−' : '+'}</span>
              </button>
              {showLubs && (
              <div>
              {lubNoSales ? (
                <div className="p-4 flex items-center gap-2">
                  <span className="text-sm font-medium" style={{ color: 'var(--color-status-success)' }}>No lubricant sales this shift ✓</span>
                  <button onClick={() => setLubNoSales(false)} className="text-xs underline" style={{ color: theme.textSecondary }}>Undo</button>
                </div>
              ) : (
              <div>
              <div className="px-4 pb-2 flex justify-end">
                <input
                  type="text"
                  value={lubSearch}
                  onChange={e => setLubSearch(e.target.value)}
                  placeholder="Search lubricants..."
                  className="px-3 py-1 rounded border text-sm w-48"
                  style={inputStyle}
                />
              </div>
              <div className="px-4 py-2 space-y-3">
                {filteredLubIdx.map(idx => {
                  const row = lubricantRows[idx]
                  const comp = lubComputations[idx]
                  return (
                    <div key={row.product_code} className="rounded-lg p-3" style={{ backgroundColor: theme.background, borderColor: theme.border, borderWidth: 1 }}>
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <span className="text-sm font-bold" style={{ color: theme.textPrimary }}>{row.description}</span>
                          <span className="text-xs ml-2" style={{ color: theme.textSecondary }}>{row.category}</span>
                        </div>
                        <span className="text-xs font-mono px-2 py-0.5 rounded" style={{ backgroundColor: theme.cardBg, color: theme.textSecondary }}>
                          Opening: {row.opening_stock}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="block text-[10px] uppercase font-medium mb-1" style={{ color: theme.textSecondary }}>Qty Sold</label>
                          <input type="number" min={0} max={row.opening_stock} step={1}
                            value={row.sold} onChange={e => updateLubRow(idx, 'sold', e.target.value)}
                            placeholder="0" className="w-full px-2 py-1.5 rounded border text-sm text-center font-mono"
                            style={{ ...inputStyle, borderColor: comp.soldExceedsOpening ? 'var(--color-status-error)' : theme.border }} />
                        </div>
                        <div>
                          <label className="block text-[10px] uppercase font-medium mb-1" style={{ color: theme.textSecondary }}>Damaged</label>
                          <input type="number" min={0} step={1}
                            value={row.damaged} onChange={e => updateLubRow(idx, 'damaged', e.target.value)}
                            placeholder="0" className="w-full px-2 py-1.5 rounded border text-sm text-center font-mono" style={inputStyle} />
                        </div>
                        <div>
                          <label className="block text-[10px] uppercase font-medium mb-1" style={{ color: theme.textSecondary }}>Stock on Hand</label>
                          <input type="number" min={0} step={1}
                            value={row.closing_stock} onChange={e => updateLubRow(idx, 'closing_stock', e.target.value)}
                            placeholder="0" className="w-full px-2 py-1.5 rounded border text-sm text-center font-mono" style={inputStyle} />
                        </div>
                      </div>
                      {row.closing_stock !== '' && (
                        <div className="flex items-center justify-between mt-2 pt-2" style={{ borderTopColor: theme.border, borderTopWidth: 1 }}>
                          <span className="text-xs" style={{ color: theme.textSecondary }}>Expected: <span className="font-mono">{comp.expectedClosing}</span></span>
                          <span className="text-xs font-medium font-mono" style={{ color: comp.hasVariance ? 'var(--color-status-error)' : 'var(--color-status-success)' }}>
                            Variance: {comp.variance === 0 ? '0 ✓' : comp.variance}
                          </span>
                        </div>
                      )}
                      {comp.hasVariance && (
                        <div className="mt-2 p-2 rounded" style={{ backgroundColor: 'var(--color-status-error-light)' }}>
                          <label className="block text-[10px] uppercase font-medium mb-1" style={{ color: 'var(--color-status-error)' }}>Explain variance ({comp.variance})</label>
                          <input type="text" value={row.variance_note}
                            onChange={e => updateLubRow(idx, 'variance_note', e.target.value)}
                            placeholder="e.g. broken bottle, miscount..."
                            className="w-full px-2 py-1.5 rounded border text-xs"
                            style={{ ...inputStyle, borderColor: row.variance_note.trim() ? theme.border : 'var(--color-status-error)' }} />
                        </div>
                      )}
                    </div>
                  )
                })}
                {filteredLubIdx.length === 0 && (
                  <div className="py-4 text-center text-sm" style={{ color: theme.textSecondary }}>
                    No lubricants match "{lubSearch}"
                  </div>
                )}
              </div>
              <div className="px-4 py-2 text-right text-sm font-semibold" style={{ color: theme.primary, borderTopColor: theme.border, borderTopWidth: 1 }}>
                Lubricants Revenue: ZMW {lubricantTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
              {lubComputations.every(c => c.sold === 0 && c.damaged === 0) && (
                <div className="px-4 pb-3">
                  <button onClick={() => {
                    setLubNoSales(true)
                    setLubricantRows(prev => prev.map(r => ({ ...r, closing_stock: String(r.opening_stock) })))
                  }} className="text-xs px-3 py-1 rounded border" style={{ color: theme.textSecondary, borderColor: theme.border }}>
                    Confirm No Sales This Shift
                  </button>
                </div>
              )}
              </div>
              )}
              </div>
              )}
            </div>
          )}

          {/* Step 1 Navigation */}
          <div className="flex justify-end mb-6">
            <button
              onClick={() => setCurrentStep(2)}
              disabled={!canProceedToReview}
              className="px-6 py-3 rounded-lg text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: canProceedToReview ? theme.primary : '#9ca3af' }}>
              {canProceedToReview ? 'Review My Entries \u2192' : !allDeviationNotesProvided ? 'Explain all deviations to continue' : 'Complete all readings to continue'}
            </button>
          </div>
        </>
      )}

      {/* ============================================= */}
      {/* STEP 2: Review & Confirm (read-only, no money)*/}
      {/* ============================================= */}
      {currentStep === 2 && !handoverResult && !inStartMode && (
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
                  <th rowSpan={2} className="px-3 py-1 text-left text-xs font-medium uppercase" style={{ color: theme.textSecondary, borderBottomColor: theme.border, borderBottomWidth: 1 }}>Nozzle</th>
                  <th rowSpan={2} className="px-3 py-1 text-left text-xs font-medium uppercase" style={{ color: theme.textSecondary, borderBottomColor: theme.border, borderBottomWidth: 1 }}>Fuel</th>
                  <th colSpan={3} className="px-3 py-1 text-center text-xs font-semibold uppercase" style={{ color: theme.primary, borderBottomColor: theme.primary, borderBottomWidth: 2 }}>Electronic</th>
                  <th colSpan={1} className="px-3 py-1 text-center text-xs font-semibold uppercase" style={{ color: 'var(--color-status-warning)', borderBottomColor: 'var(--color-status-warning)', borderBottomWidth: 2 }}>Mechanical</th>
                  <th rowSpan={2} className="px-3 py-1 text-left text-xs font-medium uppercase" style={{ color: theme.textSecondary, borderBottomColor: theme.border, borderBottomWidth: 1 }}>Deviation</th>
                </tr>
                <tr style={{ backgroundColor: theme.background }}>
                  <th className="px-3 py-1 text-center text-xs font-medium uppercase" style={{ color: theme.textSecondary }}>Open</th>
                  <th className="px-3 py-1 text-center text-xs font-medium uppercase" style={{ color: theme.textSecondary }}>Close</th>
                  <th className="px-3 py-1 text-center text-xs font-medium uppercase" style={{ color: theme.textSecondary }}>Volume</th>
                  <th className="px-3 py-1 text-center text-xs font-medium uppercase" style={{ color: theme.textSecondary }}>Volume</th>
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
                        color: comp.flagged || comp.lossExceedsThreshold ? 'var(--color-status-error)' : theme.textSecondary,
                        fontWeight: comp.flagged || comp.lossExceedsThreshold ? 600 : 400,
                      }}>
                        {comp.mechValid
                          ? <>
                              {comp.flagged && <span>! </span>}
                              {comp.lossExceedsThreshold && <span title={`Loss exceeds ${nozzleLossThreshold}L threshold`}>!! </span>}
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
          {(lpgNoSales || lpgRows.some((_, idx) => lpgComputations[idx].totalSold > 0 || lpgComputations[idx].damaged > 0)) && (
            <div className="rounded-lg shadow mb-6 overflow-x-auto"
              style={{ backgroundColor: theme.cardBg, borderColor: theme.border, borderWidth: 1 }}>
              <div className="p-4 font-semibold text-sm"
                style={{ borderBottomColor: theme.border, borderBottomWidth: 1, color: theme.textPrimary }}>
                LPG Cylinders {lpgNoSales && <span className="text-xs font-normal" style={{ color: 'var(--color-status-success)' }}>(No sales confirmed)</span>}
              </div>
              {!lpgNoSales && (
              <table className="min-w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: theme.background }}>
                    {['Size', 'Opening', 'Refills', 'New Cyl', 'Damaged', 'Closing', 'Variance'].map(h => (
                      <th key={h} className="px-2 py-2 text-center text-xs font-medium uppercase whitespace-nowrap"
                        style={{ color: theme.textSecondary }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lpgRows.map((row, idx) => {
                    const comp = lpgComputations[idx]
                    if (comp.totalSold === 0 && comp.damaged === 0) return null
                    return (
                      <tr key={row.size_kg} style={{ borderTopColor: theme.border, borderTopWidth: 1 }}>
                        <td className="px-2 py-2 text-center font-medium" style={{ color: theme.textPrimary }}>{row.size_kg}kg</td>
                        <td className="px-2 py-2 text-center font-mono" style={{ color: theme.textSecondary }}>{row.opening_full}</td>
                        <td className="px-2 py-2 text-center font-mono" style={{ color: theme.textPrimary }}>{comp.refill}</td>
                        <td className="px-2 py-2 text-center font-mono" style={{ color: theme.textPrimary }}>{comp.withCyl}</td>
                        <td className="px-2 py-2 text-center font-mono" style={{ color: comp.damaged > 0 ? 'var(--color-status-warning)' : theme.textSecondary }}>{comp.damaged}</td>
                        <td className="px-2 py-2 text-center font-mono" style={{ color: theme.textPrimary }}>{comp.closingFull}</td>
                        <td className="px-2 py-2 text-center font-mono" style={{ color: comp.hasVariance ? 'var(--color-status-error)' : theme.textSecondary }}>
                          {comp.variance}{comp.hasVariance && row.variance_note ? ` (${row.variance_note})` : ''}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              )}
            </div>
          )}

          {/* Accessories Review — only rows with activity */}
          {(accNoSales || accessoryRows.some((_, idx) => accComputations[idx].sold > 0 || accComputations[idx].damaged > 0)) && (
            <div className="rounded-lg shadow mb-6 overflow-x-auto"
              style={{ backgroundColor: theme.cardBg, borderColor: theme.border, borderWidth: 1 }}>
              <div className="p-4 font-semibold text-sm"
                style={{ borderBottomColor: theme.border, borderBottomWidth: 1, color: theme.textPrimary }}>
                Accessories {accNoSales && <span className="text-xs font-normal" style={{ color: 'var(--color-status-success)' }}>(No sales confirmed)</span>}
              </div>
              {!accNoSales && (
              <table className="min-w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: theme.background }}>
                    {['Product', 'Opening', 'Sold', 'Damaged', 'Closing', 'Variance'].map(h => (
                      <th key={h} className="px-3 py-2 text-left text-xs font-medium uppercase"
                        style={{ color: theme.textSecondary }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {accessoryRows.map((row, idx) => {
                    const comp = accComputations[idx]
                    if (comp.sold === 0 && comp.damaged === 0) return null
                    return (
                      <tr key={row.product_code} style={{ borderTopColor: theme.border, borderTopWidth: 1 }}>
                        <td className="px-3 py-2 font-medium" style={{ color: theme.textPrimary }}>{row.description}</td>
                        <td className="px-3 py-2 text-center font-mono" style={{ color: theme.textSecondary }}>{row.opening_stock}</td>
                        <td className="px-3 py-2 text-center font-mono" style={{ color: theme.textPrimary }}>{comp.sold}</td>
                        <td className="px-3 py-2 text-center font-mono" style={{ color: comp.damaged > 0 ? 'var(--color-status-warning)' : theme.textSecondary }}>{comp.damaged}</td>
                        <td className="px-3 py-2 text-center font-mono" style={{ color: theme.textPrimary }}>{comp.closing}</td>
                        <td className="px-3 py-2 text-center font-mono" style={{ color: comp.hasVariance ? 'var(--color-status-error)' : theme.textSecondary }}>
                          {comp.variance}{comp.hasVariance && row.variance_note ? ` (${row.variance_note})` : ''}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              )}
            </div>
          )}

          {/* Lubricants Review — only rows with activity */}
          {(lubNoSales || lubricantRows.some((_, idx) => lubComputations[idx].sold > 0 || lubComputations[idx].damaged > 0)) && (
            <div className="rounded-lg shadow mb-6 overflow-x-auto"
              style={{ backgroundColor: theme.cardBg, borderColor: theme.border, borderWidth: 1 }}>
              <div className="p-4 font-semibold text-sm"
                style={{ borderBottomColor: theme.border, borderBottomWidth: 1, color: theme.textPrimary }}>
                Lubricants {lubNoSales && <span className="text-xs font-normal" style={{ color: 'var(--color-status-success)' }}>(No sales confirmed)</span>}
              </div>
              {!lubNoSales && (
              <table className="min-w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: theme.background }}>
                    {['Product', 'Opening', 'Sold', 'Damaged', 'Closing', 'Variance'].map(h => (
                      <th key={h} className="px-3 py-2 text-left text-xs font-medium uppercase"
                        style={{ color: theme.textSecondary }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lubricantRows.map((row, idx) => {
                    const comp = lubComputations[idx]
                    if (comp.sold === 0 && comp.damaged === 0) return null
                    return (
                      <tr key={row.product_code} style={{ borderTopColor: theme.border, borderTopWidth: 1 }}>
                        <td className="px-3 py-2" style={{ color: theme.textPrimary }}>
                          <div className="font-medium text-sm">{row.description}</div>
                          <div className="text-xs" style={{ color: theme.textSecondary }}>{row.category}</div>
                        </td>
                        <td className="px-3 py-2 text-center font-mono" style={{ color: theme.textSecondary }}>{row.opening_stock}</td>
                        <td className="px-3 py-2 text-center font-mono" style={{ color: theme.textPrimary }}>{comp.sold}</td>
                        <td className="px-3 py-2 text-center font-mono" style={{ color: comp.damaged > 0 ? 'var(--color-status-warning)' : theme.textSecondary }}>{comp.damaged}</td>
                        <td className="px-3 py-2 text-center font-mono" style={{ color: theme.textPrimary }}>{comp.closing}</td>
                        <td className="px-3 py-2 text-center font-mono" style={{ color: comp.hasVariance ? 'var(--color-status-error)' : theme.textSecondary }}>
                          {comp.variance}{comp.hasVariance && row.variance_note ? ` (${row.variance_note})` : ''}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              )}
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
              onClick={() => setShowReviewModal(true)}
              disabled={!canProceedToReview}
              className="px-6 py-3 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: theme.primary }}>
              Submit Readings
            </button>
          </div>
        </>
      )}

      {/* Review Confirmation Modal */}
      {showReviewModal && !handoverResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="rounded-lg shadow-xl p-6 max-w-md w-full mx-4"
            style={{ backgroundColor: theme.cardBg, borderColor: theme.border, borderWidth: 1 }}>
            <h3 className="text-lg font-bold mb-3" style={{ color: theme.textPrimary }}>
              Confirm Readings Submission
            </h3>

            {hasLossFlags && (
              <div className="rounded-lg p-3 mb-3 text-sm"
                style={{
                  backgroundColor: 'var(--color-status-error-light, #fde8e8)',
                  color: 'var(--color-status-error)',
                  borderWidth: 1,
                  borderColor: 'var(--color-status-error)',
                }}>
                <span className="font-semibold">Nozzle Loss Alert:</span>
                <ul className="mt-1 list-disc list-inside">
                  {nozzleRows.map((row, idx) => {
                    const comp = nozzleComputations[idx]
                    if (!comp.lossExceedsThreshold) return null
                    const label = row.fuel_type_abbrev && row.display_label
                      ? `${row.fuel_type_abbrev} ${row.display_label}`
                      : row.nozzle_id
                    return (
                      <li key={row.nozzle_id}>
                        {label}: {comp.deviationL.toFixed(3)}L loss (threshold: {nozzleLossThreshold}L)
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}

            {hasDeviationFlags && !hasLossFlags && (
              <div className="rounded-lg p-3 mb-3 text-sm"
                style={{
                  backgroundColor: 'var(--color-status-warning-light, #fef3cd)',
                  color: 'var(--color-status-warning, #856404)',
                  borderWidth: 1,
                  borderColor: 'var(--color-status-warning, #ffc107)',
                }}>
                <span className="font-semibold">Warning:</span> Meter discrepancy detected on {nozzleComputations.filter(c => c.flagged).length} nozzle(s).
              </div>
            )}

            <p className="text-sm mb-4" style={{ color: theme.textSecondary }}>
              Your readings and stock counts will be submitted for verification. After this, proceed to the office for shift closing.
            </p>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowReviewModal(false)}
                className="px-4 py-2 rounded-lg text-sm font-semibold"
                style={{ backgroundColor: theme.background, color: theme.textPrimary, borderColor: theme.border, borderWidth: 1 }}>
                Go Back
              </button>
              <button
                onClick={() => { setShowReviewModal(false); handleSubmit() }}
                disabled={submitting}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
                style={{ backgroundColor: theme.primary }}>
                {submitting ? 'Submitting...' : 'Submit Readings'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Handover Result Display — shown after submission */}
      {handoverResult && (
        <div className="rounded-lg shadow p-6 mb-6"
          style={{ backgroundColor: theme.cardBg, borderColor: 'var(--color-status-success)', borderWidth: 2 }}>
          <h2 className="text-lg font-bold mb-4" style={{ color: theme.textPrimary }}>
            {isAttendant ? 'Readings Verified' : 'Readings Summary'}
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

          {isAttendant ? (
            /* Attendant view: volumes only, no monetary info */
            <div>
              <table className="min-w-full text-sm mb-4">
                <thead>
                  <tr style={{ backgroundColor: theme.background }}>
                    {['Nozzle', 'Fuel', 'Volume (L)', 'Mech. Vol', 'Deviation'].map(h => (
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
                    <tr key={ns.nozzle_id} style={{ borderTopColor: theme.border, borderTopWidth: 1 }}>
                      <td className="px-3 py-1 font-medium" style={{ color: theme.textPrimary }}>{displayName}</td>
                      <td className="px-3 py-1" style={{ color: theme.textSecondary }}>{ns.fuel_type}</td>
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
                          ? <>{ns.meter_deviation_flagged && <span>! </span>}{ns.meter_deviation_percent.toFixed(2)}%</>
                          : '-'}
                      </td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
              <div className="rounded-lg p-4 text-center"
                style={{ backgroundColor: 'var(--color-action-primary-light)', borderWidth: 1, borderColor: theme.primary }}>
                <p className="text-sm font-medium" style={{ color: theme.textPrimary }}>
                  Your shift handover has been submitted successfully and is awaiting supervisor review.
                </p>
                <p className="text-xs mt-1" style={{ color: theme.textSecondary }}>
                  Your sales summary will be available once the supervisor approves your submission.
                </p>
              </div>
            </div>
          ) : (
            /* Supervisor/Owner view: full financial breakdown */
            <>
              <table className="min-w-full text-sm mb-4">
                <thead>
                  <tr style={{ backgroundColor: theme.background }}>
                    <th rowSpan={2} className="px-3 py-1 text-left text-xs font-medium uppercase" style={{ color: theme.textSecondary, borderBottomColor: theme.border, borderBottomWidth: 1 }}>Nozzle</th>
                    <th rowSpan={2} className="px-3 py-1 text-left text-xs font-medium uppercase" style={{ color: theme.textSecondary, borderBottomColor: theme.border, borderBottomWidth: 1 }}>Fuel</th>
                    <th colSpan={3} className="px-3 py-1 text-center text-xs font-semibold uppercase" style={{ color: theme.primary, borderBottomColor: theme.primary, borderBottomWidth: 2 }}>Electronic</th>
                    <th colSpan={1} className="px-3 py-1 text-center text-xs font-semibold uppercase" style={{ color: 'var(--color-status-warning)', borderBottomColor: 'var(--color-status-warning)', borderBottomWidth: 2 }}>Mechanical</th>
                    <th rowSpan={2} className="px-3 py-1 text-left text-xs font-medium uppercase" style={{ color: theme.textSecondary, borderBottomColor: theme.border, borderBottomWidth: 1 }}>Deviation</th>
                    <th rowSpan={2} className="px-3 py-1 text-left text-xs font-medium uppercase" style={{ color: theme.textSecondary, borderBottomColor: theme.border, borderBottomWidth: 1 }}>Revenue</th>
                  </tr>
                  <tr style={{ backgroundColor: theme.background }}>
                    <th className="px-3 py-1 text-center text-xs font-medium uppercase" style={{ color: theme.textSecondary }}>Open</th>
                    <th className="px-3 py-1 text-center text-xs font-medium uppercase" style={{ color: theme.textSecondary }}>Close</th>
                    <th className="px-3 py-1 text-center text-xs font-medium uppercase" style={{ color: theme.textSecondary }}>Volume</th>
                    <th className="px-3 py-1 text-center text-xs font-medium uppercase" style={{ color: theme.textSecondary }}>Volume</th>
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
            </>
          )}
        </div>
      )}

      {/* Past Handovers — always visible */}
      {pastHandovers.length > 0 && (
        <PastHandoversTable handovers={pastHandovers} theme={theme} isAttendant={isAttendant} />
      )}
    </div>
  )
}

function SupervisorDashboard({ theme, pastHandovers }: { theme: any, pastHandovers: HandoverResult[] }) {
  const router = useRouter()
  const [activeShifts, setActiveShifts] = useState<any[]>([])
  const [allStaff, setAllStaff] = useState<any[]>([])
  const [islands, setIslands] = useState<any[]>([])
  const [dashLoading, setDashLoading] = useState(true)
  const [shiftDeposits, setShiftDeposits] = useState<Record<string, any>>({})
  const [expandedDeposits, setExpandedDeposits] = useState<Record<string, boolean>>({})
  // attendant_id -> review_status of their handover on the current active shift(s)
  const [attendantStatus, setAttendantStatus] = useState<Record<string, string>>({})

  useEffect(() => {
    const headers = { 'Content-Type': 'application/json', ...getHeaders() }
    Promise.all([
      authFetch(`${BASE}/shifts/`, { headers }).then(r => r.ok ? r.json() : []),
      authFetch(`${BASE}/auth/staff`, { headers }).then(r => r.ok ? r.json() : []),
      authFetch(`${BASE}/islands/?status=active`, { headers }).then(r => r.ok ? r.json() : []),
      authFetch(`${BASE}/handover/entries`, { headers }).then(r => r.ok ? r.json() : []),
    ])
      .then(([shifts, staff, islandsData, entries]) => {
        const active = Array.isArray(shifts) ? shifts.filter((s: any) => s.status === 'active') : []
        setActiveShifts(active)
        setAllStaff(Array.isArray(staff) ? staff : [])
        setIslands(Array.isArray(islandsData) ? islandsData : [])
        // Map each attendant's handover status on the active shift(s) for progress badges
        const activeIds = new Set(active.map((s: any) => s.shift_id))
        const statusMap: Record<string, string> = {}
        ;(Array.isArray(entries) ? entries : []).forEach((e: any) => {
          if (e.attendant_id && activeIds.has(e.shift_id)) statusMap[e.attendant_id] = e.review_status || 'submitted'
        })
        setAttendantStatus(statusMap)
        // Fetch deposits for each active shift
        active.forEach(shift => {
          authFetch(`${BASE}/safe-deposits/${shift.shift_id}`)
            .then(r => r.ok ? r.json() : null)
            .then(data => {
              if (data) setShiftDeposits(prev => ({ ...prev, [shift.shift_id]: data }))
            })
            .catch(() => {})
        })
      })
      .catch(() => {})
      .finally(() => setDashLoading(false))
  }, [])

  // Determine which staff are assigned to active shifts
  const assignedUserIds = new Set<string>()
  const assignedNames = new Set<string>()
  activeShifts.forEach(shift => {
    (shift.assignments || []).forEach((a: any) => {
      if (a.attendant_id) assignedUserIds.add(a.attendant_id)
      if (a.attendant_name) assignedNames.add(a.attendant_name.toLowerCase())
    })
  })

  const availableStaff = allStaff.filter(s =>
    s.role === 'user' && !assignedUserIds.has(s.user_id) && !assignedNames.has((s.full_name || '').toLowerCase())
  )
  const assignedStaff = allStaff.filter(s =>
    s.role === 'user' && (assignedUserIds.has(s.user_id) || assignedNames.has((s.full_name || '').toLowerCase()))
  )

  // Build island lookup
  const islandMap: Record<string, any> = {}
  islands.forEach(isl => { islandMap[isl.island_id] = isl })

  const getNozzleDisplayName = (nozzle: any) => {
    if (nozzle.fuel_type_abbrev && nozzle.display_label) return `${nozzle.fuel_type_abbrev} ${nozzle.display_label}`
    return nozzle.display_label || nozzle.nozzle_id
  }

  // Readings/handover progress for an attendant on the active shift.
  const STATUS_META: Record<string, { label: string; bg: string; color: string }> = {
    approved: { label: 'Approved', bg: 'var(--color-status-success-light)', color: 'var(--color-status-success)' },
    submitted: { label: 'Pending review', bg: 'var(--color-action-primary-light)', color: 'var(--color-action-primary)' },
    flagged: { label: 'Flagged', bg: 'var(--color-status-error-light, #fde8e8)', color: 'var(--color-status-error)' },
    returned: { label: 'Returned', bg: 'var(--color-status-warning-light, #fff8e1)', color: 'var(--color-status-warning)' },
    reopened: { label: 'Reopened', bg: 'var(--color-status-warning-light, #fff8e1)', color: 'var(--color-status-warning)' },
  }
  const attendantStatusMeta = (attId?: string) => {
    if (!attId) return null
    const st = attendantStatus[attId]
    if (!st) return { label: 'No readings yet', bg: theme.background, color: theme.textSecondary }
    return STATUS_META[st] || { label: st, bg: theme.background, color: theme.textSecondary }
  }

  if (dashLoading) {
    return <LoadingSpinner text="Loading dashboard..." />
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4" style={{ color: theme.textPrimary }}>Shift Overview</h1>

      {/* Active Shifts */}
      {activeShifts.length === 0 ? (
        <div className="rounded-lg shadow p-6 mb-6 text-center"
          style={{ backgroundColor: theme.cardBg, borderColor: theme.border, borderWidth: 1 }}>
          <h2 className="text-lg font-semibold mb-2" style={{ color: theme.textPrimary }}>No Active Shifts</h2>
          <p className="text-sm" style={{ color: theme.textSecondary }}>
            Use the Shifts page to create or manage shifts.
          </p>
        </div>
      ) : (
        activeShifts.map(shift => (
          <div key={shift.shift_id} className="rounded-lg shadow mb-6"
            style={{ backgroundColor: theme.cardBg, borderColor: 'var(--color-status-success)', borderWidth: 2 }}>
            {/* Shift Header */}
            <div className="p-4" style={{ borderBottomColor: theme.border, borderBottomWidth: 1 }}>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold" style={{ color: theme.textPrimary }}>
                    {shift.shift_type === 'Day' ? '\u2600\uFE0F' : '\uD83C\uDF19'} {shift.shift_type} Shift
                  </h2>
                  <p className="text-sm" style={{ color: theme.textSecondary }}>
                    {shift.date} &middot; {shift.shift_id}
                  </p>
                </div>
                <span className="px-3 py-1 rounded-full text-xs font-semibold"
                  style={{ backgroundColor: 'var(--color-status-success-light)', color: 'var(--color-status-success)' }}>
                  ACTIVE
                </span>
              </div>
            </div>

            {/* Assignments */}
            <div className="p-4">
              {(!shift.assignments || shift.assignments.length === 0) ? (
                <p className="text-sm italic" style={{ color: theme.textSecondary }}>No attendants assigned yet</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {shift.assignments.map((assignment: any, idx: number) => (
                    <div key={idx}
                      onClick={() => router.push(`/handover-review?attendant_id=${encodeURIComponent(assignment.attendant_id || '')}`)}
                      role="button" tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter') router.push(`/handover-review?attendant_id=${encodeURIComponent(assignment.attendant_id || '')}`) }}
                      title={`Open ${assignment.attendant_name || 'this attendant'}'s shifts in Handover Review`}
                      className="rounded-lg p-4 cursor-pointer transition-shadow hover:shadow-md"
                      style={{ backgroundColor: theme.background, borderColor: theme.border, borderWidth: 1 }}>
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white"
                            style={{ backgroundColor: theme.primary }}>
                            {(assignment.attendant_name || '?')[0].toUpperCase()}
                          </div>
                          <div>
                            <p className="font-semibold text-sm" style={{ color: theme.textPrimary }}>
                              {assignment.attendant_name || 'Unknown'}
                            </p>
                            <p className="text-xs" style={{ color: theme.textSecondary }}>Attendant</p>
                          </div>
                        </div>
                        {(() => {
                          const m = attendantStatusMeta(assignment.attendant_id)
                          return m ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap"
                              style={{ backgroundColor: m.bg, color: m.color }}>{m.label}</span>
                          ) : null
                        })()}
                      </div>

                      {/* Islands */}
                      {assignment.island_ids?.length > 0 && (
                        <div className="mb-2">
                          <p className="text-xs font-medium uppercase mb-1" style={{ color: theme.textSecondary }}>Islands</p>
                          <div className="flex flex-wrap gap-1">
                            {assignment.island_ids.map((islId: string) => {
                              const isl = islandMap[islId]
                              return (
                                <span key={islId} className="px-2 py-0.5 rounded text-xs font-medium"
                                  style={{ backgroundColor: 'var(--color-status-success-light)', color: 'var(--color-status-success)' }}>
                                  {isl?.name || islId}
                                </span>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      {/* Nozzles */}
                      {assignment.nozzle_ids?.length > 0 && (
                        <div>
                          <p className="text-xs font-medium uppercase mb-1" style={{ color: theme.textSecondary }}>Nozzles</p>
                          <div className="flex flex-wrap gap-1">
                            {assignment.nozzle_ids.map((nzId: string) => {
                              // Find nozzle in islands data
                              let nozzle: any = null
                              for (const isl of islands) {
                                const found = isl.pump_station?.nozzles?.find((n: any) => n.nozzle_id === nzId)
                                if (found) { nozzle = { ...found, fuel_type_abbrev: isl.fuel_type_abbrev }; break }
                              }
                              const isPetrol = nozzle?.fuel_type === 'Petrol'
                              return (
                                <span key={nzId} className="px-2 py-0.5 rounded text-xs font-medium"
                                  style={{
                                    backgroundColor: isPetrol ? 'var(--color-action-primary-light)' : 'var(--color-status-pending-light)',
                                    color: isPetrol ? 'var(--color-action-primary)' : 'var(--color-status-warning)',
                                  }}>
                                  {nozzle ? getNozzleDisplayName(nozzle) : nzId}
                                </span>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      {/* Individual Safe Deposits */}
                      {(() => {
                        const deposits = shiftDeposits[shift.shift_id]
                        const attDep = deposits?.attendants?.find((a: any) => a.attendant_id === assignment.attendant_id)
                        if (!attDep) return (
                          <div className="mt-3 pt-3" style={{ borderTopColor: theme.border, borderTopWidth: 1 }}>
                            <p className="text-xs" style={{ color: theme.textSecondary }}>Safe Deposits: 0</p>
                          </div>
                        )
                        const depKey = `${shift.shift_id}-${assignment.attendant_id}`
                        return (
                          <div className="mt-3 pt-3" style={{ borderTopColor: theme.border, borderTopWidth: 1 }}>
                            <button onClick={(e) => { e.stopPropagation(); setExpandedDeposits(prev => ({ ...prev, [depKey]: !prev[depKey] })) }}
                              className="w-full flex justify-between items-center text-left">
                              <span className="text-xs flex items-center gap-1" style={{ color: theme.textSecondary }}>
                                Safe Deposits: <strong style={{ color: theme.textPrimary }}>{attDep.count}</strong>
                                {attDep.overdue && <span className="text-[10px] px-1 py-0.5 rounded-badge bg-status-warning/20 text-status-warning font-semibold">OVERDUE</span>}
                              </span>
                              <span className="text-xs font-semibold" style={{ color: theme.textPrimary }}>
                                K{attDep.total.toLocaleString()} {expandedDeposits[depKey] ? '−' : '+'}
                              </span>
                            </button>
                            {expandedDeposits[depKey] && attDep.deposits?.length > 0 && (
                              <div className="mt-2 space-y-1">
                                {attDep.deposits.map((d: any) => (
                                  <div key={d.deposit_id} className="flex justify-between text-xs p-1.5 rounded"
                                    style={{ backgroundColor: theme.cardBg }}>
                                    <span style={{ color: theme.textSecondary }}>
                                      {d.time || new Date(d.timestamp).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})} {d.note && `— ${d.note}`}
                                    </span>
                                    <span className="font-semibold" style={{ color: theme.textPrimary }}>K{d.amount.toLocaleString()}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })()}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))
      )}

      {/* Staff Overview */}
      <div className="rounded-lg shadow mb-6"
        style={{ backgroundColor: theme.cardBg, borderColor: theme.border, borderWidth: 1 }}>
        <div className="p-4" style={{ borderBottomColor: theme.border, borderBottomWidth: 1 }}>
          <h2 className="text-lg font-bold" style={{ color: theme.textPrimary }}>Staff</h2>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* On Shift */}
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide mb-3" style={{ color: 'var(--color-status-success)' }}>
                On Shift ({assignedStaff.length})
              </h3>
              {assignedStaff.length === 0 ? (
                <p className="text-sm italic" style={{ color: theme.textSecondary }}>No staff currently on shift</p>
              ) : (
                <div className="space-y-2">
                  {assignedStaff.map(staff => {
                    const m = attendantStatusMeta(staff.user_id)
                    return (
                    <div key={staff.user_id}
                      onClick={() => router.push(`/handover-review?attendant_id=${encodeURIComponent(staff.user_id)}`)}
                      role="button" tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter') router.push(`/handover-review?attendant_id=${encodeURIComponent(staff.user_id)}`) }}
                      title={`Open ${staff.full_name}'s shifts in Handover Review`}
                      className="flex items-center justify-between gap-3 rounded-lg p-3 cursor-pointer transition-shadow hover:shadow-md"
                      style={{ backgroundColor: 'var(--color-status-success-light)', borderColor: 'var(--color-status-success)', borderWidth: 1 }}>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white"
                          style={{ backgroundColor: 'var(--color-status-success)' }}>
                          {(staff.full_name || '?')[0].toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-sm" style={{ color: theme.textPrimary }}>{staff.full_name}</p>
                          <p className="text-xs" style={{ color: theme.textSecondary }}>{staff.username}</p>
                        </div>
                      </div>
                      {m && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap"
                          style={{ backgroundColor: m.bg, color: m.color }}>{m.label}</span>
                      )}
                    </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Available */}
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide mb-3" style={{ color: theme.textSecondary }}>
                Available ({availableStaff.length})
              </h3>
              {availableStaff.length === 0 ? (
                <p className="text-sm italic" style={{ color: theme.textSecondary }}>All staff are assigned</p>
              ) : (
                <div className="space-y-2">
                  {availableStaff.map(staff => (
                    <div key={staff.user_id}
                      onClick={() => router.push('/shifts')}
                      role="button" tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter') router.push('/shifts') }}
                      title={`Assign ${staff.full_name} to a shift`}
                      className="flex items-center justify-between gap-3 rounded-lg p-3 cursor-pointer transition-shadow hover:shadow-md"
                      style={{ backgroundColor: theme.background, borderColor: theme.border, borderWidth: 1 }}>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
                          style={{ backgroundColor: theme.border, color: theme.textSecondary }}>
                          {(staff.full_name || '?')[0].toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-sm" style={{ color: theme.textPrimary }}>{staff.full_name}</p>
                          <p className="text-xs" style={{ color: theme.textSecondary }}>{staff.username}</p>
                        </div>
                      </div>
                      <span className="text-[10px] font-semibold whitespace-nowrap" style={{ color: theme.primary }}>Assign</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Islands & Nozzles Overview */}
      {islands.length > 0 && (
        <div className="rounded-lg shadow mb-6"
          style={{ backgroundColor: theme.cardBg, borderColor: theme.border, borderWidth: 1 }}>
          <div className="p-4" style={{ borderBottomColor: theme.border, borderBottomWidth: 1 }}>
            <h2 className="text-lg font-bold" style={{ color: theme.textPrimary }}>Islands & Nozzles</h2>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {islands.map(island => (
                <div key={island.island_id}
                  onClick={() => router.push('/shifts')}
                  role="button" tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter') router.push('/shifts') }}
                  title="Manage assignments for this island"
                  className="rounded-lg p-4 cursor-pointer transition-shadow hover:shadow-md"
                  style={{
                    backgroundColor: theme.background,
                    borderWidth: 2,
                    borderColor: island.status === 'active' ? 'var(--color-status-success)' : theme.border,
                  }}>
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="font-bold text-sm" style={{ color: theme.textPrimary }}>{island.name}</p>
                      <p className="text-xs" style={{ color: theme.textSecondary }}>{island.island_id}</p>
                    </div>
                    <span className="px-2 py-0.5 rounded text-xs font-medium"
                      style={{
                        backgroundColor: island.status === 'active' ? 'var(--color-status-success-light)' : theme.background,
                        color: island.status === 'active' ? 'var(--color-status-success)' : theme.textSecondary,
                      }}>
                      {island.status}
                    </span>
                  </div>
                  {(() => {
                    // For mixed islands, show all fuels present comma-separated.
                    const fuels = Array.from(new Set(
                      (island.pump_station?.nozzles || [])
                        .map((n: any) => n.fuel_type)
                        .filter(Boolean)
                    ))
                    if (fuels.length === 0) return null
                    const label = fuels.length === 1 ? `Product: ${fuels[0]}` : `Products: ${fuels.join(', ')}`
                    return (
                      <p className="text-xs mb-2" style={{ color: theme.textSecondary }}>
                        {label}
                      </p>
                    )
                  })()}
                  {island.pump_station?.nozzles?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {island.pump_station.nozzles.map((nozzle: any) => {
                        const isPetrol = nozzle.fuel_type === 'Petrol'
                        // Read fuel_type_abbrev per-nozzle so mixed islands display correctly
                        const displayName = nozzle.fuel_type_abbrev && nozzle.display_label
                          ? `${nozzle.fuel_type_abbrev} ${nozzle.display_label}`
                          : nozzle.display_label || nozzle.nozzle_id

                        // Check if this nozzle is assigned in any active shift
                        let assignedTo: string | null = null
                        let assignedAttId: string | null = null
                        for (const shift of activeShifts) {
                          for (const a of shift.assignments || []) {
                            if (a.nozzle_ids?.includes(nozzle.nozzle_id)) {
                              assignedTo = a.attendant_name
                              assignedAttId = a.attendant_id
                              break
                            }
                          }
                          if (assignedTo) break
                        }
                        const nozzleStatus = assignedAttId ? attendantStatusMeta(assignedAttId) : null

                        return (
                          <div key={nozzle.nozzle_id} className="px-2 py-1 rounded text-xs"
                            style={{
                              backgroundColor: isPetrol ? 'var(--color-action-primary-light)' : 'var(--color-status-pending-light)',
                              color: isPetrol ? 'var(--color-action-primary)' : 'var(--color-status-warning)',
                              borderWidth: 1,
                              borderColor: isPetrol ? 'var(--color-action-primary)' : 'var(--color-status-warning)',
                            }}>
                            <span className="font-semibold">{displayName}</span>
                            {assignedTo && (
                              <span className="text-[10px] mt-0.5 flex items-center gap-1" style={{ opacity: 0.85 }}>
                                {nozzleStatus && (
                                  <span className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
                                    style={{ backgroundColor: nozzleStatus.color }} title={`Readings: ${nozzleStatus.label}`} />
                                )}
                                {assignedTo}
                              </span>
                            )}
                            {!assignedTo && activeShifts.length > 0 && (
                              <span className="block text-[10px] mt-0.5 italic" style={{ opacity: 0.6 }}>
                                unassigned
                              </span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Past Handovers */}
      {pastHandovers.length > 0 && (
        <PastHandoversTable handovers={pastHandovers} theme={theme} isAttendant={false} />
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

function PastHandoversTable({ handovers, theme, isAttendant = false }: { handovers: HandoverResult[], theme: any, isAttendant?: boolean }) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const fmtZMW = (v: number) => v.toLocaleString(undefined, { minimumFractionDigits: 2 })

  const attendantHeaders = ['Date', 'Shift', 'Review']
  const fullHeaders = ['Date', 'Shift', 'Attendant', 'Fuel Rev.', 'Total Expected', 'Expected Cash', 'Actual Cash', 'Difference', 'Review']

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
            {(isAttendant ? attendantHeaders : fullHeaders).map(h => (
              <th key={h} className="px-3 py-2 text-left text-xs font-medium uppercase"
                style={{ color: theme.textSecondary }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {handovers.map(h => {
            const isApproved = (h.review_status || h.status) === 'approved'
            const isExpanded = expandedId === h.handover_id
            return (
              <React.Fragment key={h.handover_id}>
                <tr
                  className={`hover:bg-surface-bg ${isAttendant && isApproved ? 'cursor-pointer' : ''}`}
                  style={{ borderTopColor: theme.border, borderTopWidth: 1 }}
                  onClick={() => isAttendant && isApproved && setExpandedId(isExpanded ? null : h.handover_id)}
                >
                  <td className="px-3 py-2" style={{ color: theme.textPrimary }}>{h.date}</td>
                  <td className="px-3 py-2" style={{ color: theme.textSecondary }}>{h.shift_type}</td>
                  {!isAttendant && (
                    <td className="px-3 py-2" style={{ color: theme.textPrimary }}>{h.attendant_name}</td>
                  )}
                  {!isAttendant && (
                    <>
                      <td className="px-3 py-2 text-right font-mono" style={{ color: theme.textPrimary }}>
                        {fmtZMW(h.fuel_revenue)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono" style={{ color: theme.textPrimary }}>
                        {fmtZMW(h.total_expected)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-medium" style={{ color: theme.primary }}>
                        {fmtZMW(h.expected_cash)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono" style={{ color: theme.textPrimary }}>
                        {fmtZMW(h.actual_cash)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-bold"
                        style={{ color: h.difference >= 0 ? 'var(--color-status-success)' : 'var(--color-status-error)' }}>
                        {h.difference >= 0 ? '+' : ''}{fmtZMW(h.difference)}
                      </td>
                    </>
                  )}
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <ReviewStatusBadge status={h.review_status || h.status} />
                      {isAttendant && isApproved && (
                        <span className="text-xs" style={{ color: theme.textSecondary }}>
                          {isExpanded ? '\u25B2' : '\u25BC'} View Sales
                        </span>
                      )}
                    </div>
                  </td>
                </tr>

                {/* Expanded sales summary for approved handovers (attendant only) */}
                {isAttendant && isApproved && isExpanded && (
                  <tr>
                    <td colSpan={isAttendant ? 3 : 9} className="px-3 py-0">
                      <div className="rounded-lg p-4 my-2"
                        style={{ backgroundColor: theme.background, borderColor: theme.border, borderWidth: 1 }}>
                        <h4 className="text-sm font-semibold mb-3" style={{ color: theme.textPrimary }}>
                          Your total sales for the shift:
                        </h4>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span style={{ color: theme.textSecondary }}>Fuel Sales</span>
                            <span className="font-mono font-medium" style={{ color: theme.textPrimary }}>
                              K {fmtZMW(h.fuel_revenue)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span style={{ color: theme.textSecondary }}>LPG Sales</span>
                            <span className="font-mono font-medium" style={{ color: theme.textPrimary }}>
                              K {fmtZMW(h.lpg_sales)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span style={{ color: theme.textSecondary }}>Lubricant Sales</span>
                            <span className="font-mono font-medium" style={{ color: theme.textPrimary }}>
                              K {fmtZMW(h.lubricant_sales)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span style={{ color: theme.textSecondary }}>Accessory Sales</span>
                            <span className="font-mono font-medium" style={{ color: theme.textPrimary }}>
                              K {fmtZMW(h.accessory_sales)}
                            </span>
                          </div>
                          <div className="flex justify-between pt-2" style={{ borderTopColor: theme.border, borderTopWidth: 2 }}>
                            <span className="font-bold" style={{ color: theme.textPrimary }}>Total Sales</span>
                            <span className="font-mono font-bold" style={{ color: theme.primary }}>
                              K {fmtZMW(h.total_expected)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
