import { authFetch, BASE } from '../lib/api'
import { useState, useEffect, useCallback } from 'react'
import { useTheme } from '../contexts/ThemeContext'


interface NozzleInfo {
  nozzle_id: string
  fuel_type: string
  opening_reading: number
  price_per_liter: number
  status: string
}

interface NozzleRow {
  nozzle_id: string
  fuel_type: string
  opening_reading: number
  closing_reading: string
  price_per_liter: number
}

interface SaleLineItem {
  id: string
  product_code: string
  description: string
  unit_price: number
  quantity: string
  amount: number
}

interface ProductOption {
  product_code: string
  description: string
  unit_price: number
  category?: string
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
  created_at: string
}


let lineIdCounter = 0
function nextLineId() { return `line-${++lineIdCounter}` }

export default function MyShift() {
  const { theme } = useTheme()
  const [user, setUser] = useState<any>(null)

  // Shift state
  const [shiftFound, setShiftFound] = useState<boolean | null>(null)
  const [shiftInfo, setShiftInfo] = useState<any>(null)
  const [assignmentInfo, setAssignmentInfo] = useState<any>(null)
  const [nozzleRows, setNozzleRows] = useState<NozzleRow[]>([])

  // Other sales — item-by-item
  const [lpgProducts, setLpgProducts] = useState<ProductOption[]>([])
  const [lubricantProducts, setLubricantProducts] = useState<ProductOption[]>([])
  const [accessoryProducts, setAccessoryProducts] = useState<ProductOption[]>([])

  const [lpgLines, setLpgLines] = useState<SaleLineItem[]>([])
  const [lubricantLines, setLubricantLines] = useState<SaleLineItem[]>([])
  const [accessoryLines, setAccessoryLines] = useState<SaleLineItem[]>([])

  const [creditSales, setCreditSales] = useState('')
  const [actualCash, setActualCash] = useState('')
  const [notes, setNotes] = useState('')

  // UI state
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [handoverResult, setHandoverResult] = useState<HandoverResult | null>(null)
  const [pastHandovers, setPastHandovers] = useState<HandoverResult[]>([])

  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (userData) setUser(JSON.parse(userData))
  }, [])

  // Fetch active shift on mount
  useEffect(() => {
    setLoading(true)
    authFetch(`${BASE}/handover/my-shift`, )
      .then(r => r.json())
      .then(data => {
        if (data.found) {
          setShiftFound(true)
          setShiftInfo(data.shift)
          setAssignmentInfo(data.assignment)
          setNozzleRows(
            (data.nozzles || []).map((n: NozzleInfo) => ({
              nozzle_id: n.nozzle_id,
              fuel_type: n.fuel_type,
              opening_reading: n.opening_reading,
              closing_reading: '',
              price_per_liter: n.price_per_liter,
            }))
          )
        } else {
          setShiftFound(false)
        }
      })
      .catch(() => setShiftFound(false))
      .finally(() => setLoading(false))
  }, [])

  // Fetch product lists for dropdowns
  const fetchProducts = useCallback(() => {
    // LPG cylinders from pricing
    authFetch(`${BASE}/lpg-daily/pricing`, )
      .then(r => r.json())
      .then(data => {
        const sizes = data.sizes || []
        setLpgProducts(sizes.map((s: any) => ({
          product_code: `LPG-${s.size_kg}KG`,
          description: `LPG ${s.size_kg}kg Refill`,
          unit_price: s.price_refill || 0,
        })))
      })
      .catch(() => {})

    // LPG Accessories
    authFetch(`${BASE}/lpg/accessories`, )
      .then(r => r.json())
      .then(data => {
        const items = Array.isArray(data) ? data : []
        setAccessoryProducts(items.map((a: any) => ({
          product_code: a.product_code,
          description: a.description,
          unit_price: a.unit_price || a.selling_price || 0,
        })))
      })
      .catch(() => {})

    // Lubricants
    authFetch(`${BASE}/lubricants-daily/products/Island 3`, )
      .then(r => r.json())
      .then(data => {
        const items = data.products || []
        setLubricantProducts(items.map((l: any) => ({
          product_code: l.product_code,
          description: l.description,
          unit_price: l.selling_price || l.unit_price || 0,
          category: l.category,
        })))
      })
      .catch(() => {})
  }, [])

  useEffect(() => { fetchProducts() }, [fetchProducts])

  // Fetch past handovers
  useEffect(() => {
    authFetch(`${BASE}/handover/entries`, )
      .then(r => r.json())
      .then(data => setPastHandovers(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [success])

  // --- Nozzle computation (inline, no useMemo) ---
  const nozzleComputations = nozzleRows.map(row => {
    const closing = parseFloat(row.closing_reading)
    if (isNaN(closing) || row.closing_reading === '') {
      return { volume: 0, revenue: 0, valid: false }
    }
    const volume = closing - row.opening_reading
    const revenue = volume >= 0 ? volume * row.price_per_liter : 0
    return { volume: Math.max(0, volume), revenue: volume >= 0 ? revenue : 0, valid: volume >= 0 }
  })

  const fuelRevenue = nozzleComputations.reduce((s, c) => s + c.revenue, 0)
  const totalVolume = nozzleComputations.reduce((s, c) => s + c.volume, 0)

  // --- Other sales line totals ---
  const computeLineAmount = (line: SaleLineItem) => {
    const qty = parseFloat(line.quantity) || 0
    return qty * line.unit_price
  }

  const lpgTotal = lpgLines.reduce((s, l) => s + computeLineAmount(l), 0)
  const lubricantTotal = lubricantLines.reduce((s, l) => s + computeLineAmount(l), 0)
  const accessoryTotal = accessoryLines.reduce((s, l) => s + computeLineAmount(l), 0)

  const creditVal = parseFloat(creditSales) || 0
  const actualCashVal = parseFloat(actualCash) || 0

  const totalExpected = fuelRevenue + lpgTotal + lubricantTotal + accessoryTotal
  const expectedCash = totalExpected - creditVal
  const difference = actualCashVal - expectedCash

  const allClosingsEntered = nozzleRows.length > 0 && nozzleRows.every(r => r.closing_reading !== '')
  const allValid = nozzleComputations.every(c => c.valid || c.volume === 0)
  const canSubmit = allClosingsEntered && allValid && actualCash !== '' && !submitting

  const updateClosingReading = (nozzleId: string, value: string) => {
    setNozzleRows(prev =>
      prev.map(r => r.nozzle_id === nozzleId ? { ...r, closing_reading: value } : r)
    )
  }

  // --- Sale line management ---
  const addLine = (
    products: ProductOption[],
    setLines: React.Dispatch<React.SetStateAction<SaleLineItem[]>>
  ) => {
    if (products.length === 0) return
    const p = products[0]
    setLines(prev => [...prev, {
      id: nextLineId(),
      product_code: p.product_code,
      description: p.description,
      unit_price: p.unit_price,
      quantity: '',
      amount: 0,
    }])
  }

  const removeLine = (
    lineId: string,
    setLines: React.Dispatch<React.SetStateAction<SaleLineItem[]>>
  ) => {
    setLines(prev => prev.filter(l => l.id !== lineId))
  }

  const updateLineProduct = (
    lineId: string,
    productCode: string,
    products: ProductOption[],
    setLines: React.Dispatch<React.SetStateAction<SaleLineItem[]>>
  ) => {
    const product = products.find(p => p.product_code === productCode)
    if (!product) return
    setLines(prev => prev.map(l =>
      l.id === lineId ? { ...l, product_code: product.product_code, description: product.description, unit_price: product.unit_price } : l
    ))
  }

  const updateLineQuantity = (
    lineId: string,
    qty: string,
    setLines: React.Dispatch<React.SetStateAction<SaleLineItem[]>>
  ) => {
    setLines(prev => prev.map(l =>
      l.id === lineId ? { ...l, quantity: qty } : l
    ))
  }

  const handleSubmit = async () => {
    if (!shiftInfo) return
    setSubmitting(true)
    setError('')
    setSuccess('')

    try {
      const res = await authFetch(`${BASE}/handover/submit`, {
        method: 'POST',
        
        body: JSON.stringify({
          shift_id: shiftInfo.shift_id,
          nozzle_readings: nozzleRows.map(r => ({
            nozzle_id: r.nozzle_id,
            opening_reading: r.opening_reading,
            closing_reading: parseFloat(r.closing_reading) || 0,
          })),
          lpg_sales: lpgTotal,
          lubricant_sales: lubricantTotal,
          accessory_sales: accessoryTotal,
          credit_sales: creditVal,
          actual_cash: actualCashVal,
          notes: notes || null,
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-lg" style={{ color: theme.textSecondary }}>Loading shift data...</div>
      </div>
    )
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

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: theme.textPrimary }}>My Shift</h1>
        <p className="text-sm mt-1" style={{ color: theme.textSecondary }}>
          Enter closing readings and cash handover for your shift
        </p>
      </div>

      {error && (
        <div className="rounded-lg p-3 mb-4 text-sm" style={{ backgroundColor: '#fef2f2', color: '#dc2626', borderColor: '#fecaca', borderWidth: 1 }}>
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg p-3 mb-4 text-sm" style={{ backgroundColor: '#f0fdf4', color: '#16a34a', borderColor: '#bbf7d0', borderWidth: 1 }}>
          {success}
        </div>
      )}

      {/* 1. Shift Info Card */}
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
            <div className="font-medium text-sm" style={{ color: '#16a34a' }}>{shiftInfo?.status}</div>
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

      {/* 2. Nozzle Readings Table */}
      <div className="rounded-lg shadow mb-6 overflow-x-auto"
        style={{ backgroundColor: theme.cardBg, borderColor: theme.border, borderWidth: 1 }}>
        <div className="p-4 font-semibold text-sm"
          style={{ borderBottomColor: theme.border, borderBottomWidth: 1, color: theme.textPrimary }}>
          Nozzle Readings
        </div>
        <table className="min-w-full text-sm">
          <thead>
            <tr style={{ backgroundColor: theme.background }}>
              {['Nozzle', 'Fuel Type', 'Opening Reading', 'Closing Reading', 'Volume (L)', 'Price/L', 'Revenue (ZMW)'].map(h => (
                <th key={h} className="px-3 py-2 text-left text-xs font-medium uppercase"
                  style={{ color: theme.textSecondary }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {nozzleRows.map((row, idx) => {
              const comp = nozzleComputations[idx]
              const closingVal = parseFloat(row.closing_reading)
              const hasError = row.closing_reading !== '' && !isNaN(closingVal) && closingVal < row.opening_reading
              return (
                <tr key={row.nozzle_id} style={{ borderTopColor: theme.border, borderTopWidth: 1 }}>
                  <td className="px-3 py-2 font-medium" style={{ color: theme.textPrimary }}>
                    {row.nozzle_id}
                  </td>
                  <td className="px-3 py-2" style={{ color: theme.textSecondary }}>
                    <span className="inline-block px-2 py-0.5 rounded text-xs font-medium"
                      style={{
                        backgroundColor: row.fuel_type === 'Petrol' ? '#dbeafe' : '#fef9c3',
                        color: row.fuel_type === 'Petrol' ? '#1d4ed8' : '#a16207',
                      }}>
                      {row.fuel_type}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-mono" style={{ color: theme.textSecondary }}>
                    {row.opening_reading.toLocaleString(undefined, { minimumFractionDigits: 3 })}
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      step="0.001"
                      value={row.closing_reading}
                      onChange={e => updateClosingReading(row.nozzle_id, e.target.value)}
                      placeholder="Enter closing"
                      className="w-36 px-2 py-1 rounded border text-sm text-right font-mono"
                      style={{
                        ...inputStyle,
                        borderColor: hasError ? '#ef4444' : theme.border,
                      }}
                    />
                    {hasError && (
                      <div className="text-xs mt-0.5" style={{ color: '#ef4444' }}>
                        Must be &ge; opening
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-medium" style={{ color: theme.textPrimary }}>
                    {comp.valid && row.closing_reading !== ''
                      ? comp.volume.toLocaleString(undefined, { minimumFractionDigits: 3 })
                      : '-'}
                  </td>
                  <td className="px-3 py-2 text-right" style={{ color: theme.textSecondary }}>
                    {row.price_per_liter.toFixed(2)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-medium" style={{ color: theme.textPrimary }}>
                    {comp.valid && row.closing_reading !== ''
                      ? comp.revenue.toLocaleString(undefined, { minimumFractionDigits: 2 })
                      : '-'}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr style={{ borderTopColor: theme.border, borderTopWidth: 2, backgroundColor: theme.background }}>
              <td colSpan={4} className="px-3 py-2 font-semibold text-right" style={{ color: theme.textPrimary }}>
                Total Fuel Revenue
              </td>
              <td className="px-3 py-2 text-right font-mono font-semibold" style={{ color: theme.textPrimary }}>
                {totalVolume.toLocaleString(undefined, { minimumFractionDigits: 3 })} L
              </td>
              <td className="px-3 py-2"></td>
              <td className="px-3 py-2 text-right font-mono font-bold" style={{ color: theme.primary }}>
                {fuelRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })} ZMW
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* 3. Other Sales — Item-by-item with dropdowns */}
      <div className="rounded-lg shadow p-4 mb-6"
        style={{ backgroundColor: theme.cardBg, borderColor: theme.border, borderWidth: 1 }}>
        <h2 className="text-sm font-semibold mb-4 uppercase tracking-wide" style={{ color: theme.textSecondary }}>
          Other Sales
        </h2>

        {/* LPG Sales */}
        <SalesLineSection
          title="LPG Sales"
          products={lpgProducts}
          lines={lpgLines}
          setLines={setLpgLines}
          total={lpgTotal}
          theme={theme}
          inputStyle={inputStyle}
          addLine={addLine}
          removeLine={removeLine}
          updateLineProduct={updateLineProduct}
          updateLineQuantity={updateLineQuantity}
          computeLineAmount={computeLineAmount}
        />

        {/* Lubricant Sales */}
        <SalesLineSection
          title="Lubricant Sales"
          products={lubricantProducts}
          lines={lubricantLines}
          setLines={setLubricantLines}
          total={lubricantTotal}
          theme={theme}
          inputStyle={inputStyle}
          addLine={addLine}
          removeLine={removeLine}
          updateLineProduct={updateLineProduct}
          updateLineQuantity={updateLineQuantity}
          computeLineAmount={computeLineAmount}
        />

        {/* Accessory Sales */}
        <SalesLineSection
          title="Accessory Sales"
          products={accessoryProducts}
          lines={accessoryLines}
          setLines={setAccessoryLines}
          total={accessoryTotal}
          theme={theme}
          inputStyle={inputStyle}
          addLine={addLine}
          removeLine={removeLine}
          updateLineProduct={updateLineProduct}
          updateLineQuantity={updateLineQuantity}
          computeLineAmount={computeLineAmount}
        />

        {/* Credit Sales */}
        <div className="mt-4 pt-4" style={{ borderTopColor: theme.border, borderTopWidth: 1 }}>
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium" style={{ color: theme.textSecondary }}>
              Credit Sales (ZMW)
            </label>
            <input type="number" min={0} step="0.01" value={creditSales}
              onChange={e => setCreditSales(e.target.value)} placeholder="0.00"
              className="w-40 px-3 py-2 rounded border text-sm text-right" style={inputStyle} />
          </div>
        </div>

        {/* Other Sales Summary */}
        <div className="mt-4 pt-4 grid grid-cols-2 md:grid-cols-4 gap-3" style={{ borderTopColor: theme.border, borderTopWidth: 1 }}>
          <div>
            <div className="text-xs" style={{ color: theme.textSecondary }}>LPG Total</div>
            <div className="font-mono font-medium text-sm" style={{ color: theme.textPrimary }}>
              {lpgTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })} ZMW
            </div>
          </div>
          <div>
            <div className="text-xs" style={{ color: theme.textSecondary }}>Lubricant Total</div>
            <div className="font-mono font-medium text-sm" style={{ color: theme.textPrimary }}>
              {lubricantTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })} ZMW
            </div>
          </div>
          <div>
            <div className="text-xs" style={{ color: theme.textSecondary }}>Accessory Total</div>
            <div className="font-mono font-medium text-sm" style={{ color: theme.textPrimary }}>
              {accessoryTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })} ZMW
            </div>
          </div>
          <div>
            <div className="text-xs" style={{ color: theme.textSecondary }}>Other Sales Grand Total</div>
            <div className="font-mono font-bold text-sm" style={{ color: theme.primary }}>
              {(lpgTotal + lubricantTotal + accessoryTotal).toLocaleString(undefined, { minimumFractionDigits: 2 })} ZMW
            </div>
          </div>
        </div>
      </div>

      {/* 4. Cash Handover Section */}
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
                {fuelRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span style={{ color: theme.textSecondary }}>+ LPG Sales</span>
              <span className="font-mono" style={{ color: theme.textPrimary }}>
                {lpgTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span style={{ color: theme.textSecondary }}>+ Lubricant Sales</span>
              <span className="font-mono" style={{ color: theme.textPrimary }}>
                {lubricantTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span style={{ color: theme.textSecondary }}>+ Accessory Sales</span>
              <span className="font-mono" style={{ color: theme.textPrimary }}>
                {accessoryTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex justify-between text-sm pt-2" style={{ borderTopColor: theme.border, borderTopWidth: 1 }}>
              <span className="font-semibold" style={{ color: theme.textPrimary }}>Total Expected</span>
              <span className="font-mono font-semibold" style={{ color: theme.textPrimary }}>
                {totalExpected.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span style={{ color: theme.textSecondary }}>- Credit Sales</span>
              <span className="font-mono" style={{ color: '#dc2626' }}>
                -{creditVal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex justify-between text-sm pt-2" style={{ borderTopColor: theme.border, borderTopWidth: 1 }}>
              <span className="font-bold" style={{ color: theme.textPrimary }}>Expected Cash</span>
              <span className="font-mono font-bold" style={{ color: theme.primary }}>
                {expectedCash.toLocaleString(undefined, { minimumFractionDigits: 2 })} ZMW
              </span>
            </div>
          </div>

          {/* Right: actual cash + difference */}
          <div className="space-y-4">
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
                  backgroundColor: difference >= 0 ? '#f0fdf4' : '#fef2f2',
                  borderWidth: 2,
                  borderColor: difference >= 0 ? '#86efac' : '#fca5a5',
                }}>
                <div className="text-xs uppercase tracking-wide mb-1"
                  style={{ color: difference >= 0 ? '#16a34a' : '#dc2626' }}>
                  {difference >= 0 ? 'Surplus' : 'Shortage'}
                </div>
                <div className="text-2xl font-bold font-mono"
                  style={{ color: difference >= 0 ? '#16a34a' : '#dc2626' }}>
                  {difference >= 0 ? '+' : ''}{difference.toLocaleString(undefined, { minimumFractionDigits: 2 })} ZMW
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: theme.textSecondary }}>
                Notes (optional)
              </label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="Any remarks about the shift..."
                rows={2}
                className="w-full px-3 py-2 rounded border text-sm"
                style={inputStyle} />
            </div>
          </div>
        </div>
      </div>

      {/* 5. Submit Button */}
      {!handoverResult && (
        <div className="flex justify-end mb-6">
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="px-6 py-3 rounded-lg text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: canSubmit ? theme.primary : '#9ca3af' }}>
            {submitting ? 'Submitting...' : 'Submit Shift Handover'}
          </button>
        </div>
      )}

      {/* 6. Result Display */}
      {handoverResult && (
        <div className="rounded-lg shadow p-6 mb-6"
          style={{ backgroundColor: theme.cardBg, borderColor: '#86efac', borderWidth: 2 }}>
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
              <span className="text-xs" style={{ color: theme.textSecondary }}>Status</span>
              <div className="font-medium" style={{ color: '#16a34a' }}>{handoverResult.status}</div>
            </div>
          </div>

          <table className="min-w-full text-sm mb-4">
            <thead>
              <tr style={{ backgroundColor: theme.background }}>
                {['Nozzle', 'Fuel', 'Opening', 'Closing', 'Volume (L)', 'Revenue (ZMW)'].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-xs font-medium uppercase"
                    style={{ color: theme.textSecondary }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {handoverResult.nozzle_summaries.map(ns => (
                <tr key={ns.nozzle_id} style={{ borderTopColor: theme.border, borderTopWidth: 1 }}>
                  <td className="px-3 py-1 font-medium" style={{ color: theme.textPrimary }}>{ns.nozzle_id}</td>
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
                  <td className="px-3 py-1 text-right font-mono font-medium" style={{ color: theme.textPrimary }}>
                    {ns.revenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
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
              backgroundColor: handoverResult.difference >= 0 ? '#f0fdf4' : '#fef2f2',
              borderWidth: 2,
              borderColor: handoverResult.difference >= 0 ? '#86efac' : '#fca5a5',
            }}>
            <div className="text-xs uppercase tracking-wide mb-1"
              style={{ color: handoverResult.difference >= 0 ? '#16a34a' : '#dc2626' }}>
              {handoverResult.difference >= 0 ? 'Surplus' : 'Shortage'}
            </div>
            <div className="text-3xl font-bold font-mono"
              style={{ color: handoverResult.difference >= 0 ? '#16a34a' : '#dc2626' }}>
              {handoverResult.difference >= 0 ? '+' : ''}{handoverResult.difference.toLocaleString(undefined, { minimumFractionDigits: 2 })} ZMW
            </div>
          </div>
        </div>
      )}

      {/* Past Handovers */}
      {pastHandovers.length > 0 && (
        <PastHandoversTable handovers={pastHandovers} theme={theme} />
      )}
    </div>
  )
}

// --- Reusable Sales Line Section Component ---
function SalesLineSection({
  title, products, lines, setLines, total, theme, inputStyle,
  addLine, removeLine, updateLineProduct, updateLineQuantity, computeLineAmount,
}: {
  title: string
  products: ProductOption[]
  lines: SaleLineItem[]
  setLines: React.Dispatch<React.SetStateAction<SaleLineItem[]>>
  total: number
  theme: any
  inputStyle: any
  addLine: (p: ProductOption[], s: React.Dispatch<React.SetStateAction<SaleLineItem[]>>) => void
  removeLine: (id: string, s: React.Dispatch<React.SetStateAction<SaleLineItem[]>>) => void
  updateLineProduct: (id: string, code: string, p: ProductOption[], s: React.Dispatch<React.SetStateAction<SaleLineItem[]>>) => void
  updateLineQuantity: (id: string, qty: string, s: React.Dispatch<React.SetStateAction<SaleLineItem[]>>) => void
  computeLineAmount: (l: SaleLineItem) => number
}) {
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium" style={{ color: theme.textPrimary }}>{title}</h3>
        <button
          onClick={() => addLine(products, setLines)}
          disabled={products.length === 0}
          className="px-3 py-1 rounded text-xs font-medium text-white disabled:opacity-40"
          style={{ backgroundColor: theme.primary }}>
          + Add Item
        </button>
      </div>

      {lines.length === 0 && (
        <div className="text-xs py-2" style={{ color: theme.textSecondary }}>
          No items added. Click "+ Add Item" to add a sale.
        </div>
      )}

      {lines.length > 0 && (
        <table className="min-w-full text-sm">
          <thead>
            <tr style={{ backgroundColor: theme.background }}>
              <th className="px-2 py-1 text-left text-xs font-medium uppercase" style={{ color: theme.textSecondary }}>Product</th>
              <th className="px-2 py-1 text-right text-xs font-medium uppercase w-24" style={{ color: theme.textSecondary }}>Unit Price</th>
              <th className="px-2 py-1 text-right text-xs font-medium uppercase w-20" style={{ color: theme.textSecondary }}>Qty</th>
              <th className="px-2 py-1 text-right text-xs font-medium uppercase w-28" style={{ color: theme.textSecondary }}>Amount</th>
              <th className="px-2 py-1 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {lines.map(line => {
              const amt = computeLineAmount(line)
              return (
                <tr key={line.id} style={{ borderTopColor: theme.border, borderTopWidth: 1 }}>
                  <td className="px-2 py-1">
                    <select
                      value={line.product_code}
                      onChange={e => updateLineProduct(line.id, e.target.value, products, setLines)}
                      className="w-full px-2 py-1 rounded border text-sm"
                      style={inputStyle}>
                      {products.map(p => (
                        <option key={p.product_code} value={p.product_code}>
                          {p.description} {p.category ? `(${p.category})` : ''}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-1 text-right font-mono" style={{ color: theme.textSecondary }}>
                    {line.unit_price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-2 py-1">
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={line.quantity}
                      onChange={e => updateLineQuantity(line.id, e.target.value, setLines)}
                      placeholder="0"
                      className="w-full px-2 py-1 rounded border text-sm text-right"
                      style={inputStyle}
                    />
                  </td>
                  <td className="px-2 py-1 text-right font-mono font-medium" style={{ color: theme.textPrimary }}>
                    {amt.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-2 py-1 text-center">
                    <button
                      onClick={() => removeLine(line.id, setLines)}
                      className="text-red-500 hover:text-red-700 text-xs font-bold px-1">
                      X
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr style={{ borderTopColor: theme.border, borderTopWidth: 2, backgroundColor: theme.background }}>
              <td colSpan={3} className="px-2 py-1 text-right font-semibold text-xs" style={{ color: theme.textPrimary }}>
                Subtotal
              </td>
              <td className="px-2 py-1 text-right font-mono font-bold" style={{ color: theme.primary }}>
                {total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </td>
              <td></td>
            </tr>
          </tfoot>
        </table>
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
        style={{ color: negative ? '#dc2626' : primary ? theme.primary : theme.textPrimary }}>
        {negative ? '-' : ''}{value.toLocaleString(undefined, { minimumFractionDigits: 2 })} ZMW
      </div>
    </div>
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
            {['Date', 'Shift', 'Attendant', 'Fuel Rev.', 'Total Expected', 'Expected Cash', 'Actual Cash', 'Difference', 'Status'].map(h => (
              <th key={h} className="px-3 py-2 text-left text-xs font-medium uppercase"
                style={{ color: theme.textSecondary }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {handovers.map(h => (
            <tr key={h.handover_id} style={{ borderTopColor: theme.border, borderTopWidth: 1 }}>
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
                style={{ color: h.difference >= 0 ? '#16a34a' : '#dc2626' }}>
                {h.difference >= 0 ? '+' : ''}{h.difference.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </td>
              <td className="px-3 py-2">
                <span className="inline-block px-2 py-0.5 rounded text-xs font-medium"
                  style={{
                    backgroundColor: h.status === 'submitted' ? '#dbeafe' : '#fef9c3',
                    color: h.status === 'submitted' ? '#1d4ed8' : '#a16207',
                  }}>
                  {h.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
