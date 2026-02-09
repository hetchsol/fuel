import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { useTheme } from '../contexts/ThemeContext'

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000/api/v1'

interface NozzleReading {
  nozzle_id: string
  attendant: string
  electronic_opening: string
  electronic_closing: string
  electronic_movement: number
  mechanical_opening: string
  mechanical_closing: string
  mechanical_movement: number
}

export default function DailyTankReading() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [selectedTank, setSelectedTank] = useState('TANK-DIESEL')
  const [activeSection, setActiveSection] = useState(1)
  const { theme, setFuelType } = useTheme()

  // Get fuel type prefix and color based on selected tank
  const getFuelTypePrefix = () => {
    return selectedTank === 'TANK-DIESEL' ? 'LSD' : 'UNL'
  }

  const getFuelColor = () => {
    return selectedTank === 'TANK-DIESEL' ? '#9333EA' : '#10B981' // Purple for diesel, Green for petrol
  }

  const getFuelLightColor = () => {
    return selectedTank === 'TANK-DIESEL' ? '#F3E8FF' : '#D1FAE5' // Light purple for diesel, Light green for petrol
  }

  // Available attendants list
  const attendantsList = [
    'Shaka',
    'Trevor',
    'Violet',
    'Joseph',
    'Mary',
    'Patrick',
    'Elizabeth',
    'John'
  ]

  // Form state matching Excel structure
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    shift_type: 'Day',

    // Tank Dip Readings (Columns AF, AG, AH)
    opening_dip_cm: '',
    closing_dip_cm: '',
    after_delivery_dip_cm: '',

    // Tank Level Volumes (Columns AI, AL)
    opening_volume: '',
    closing_volume: '',

    // Nozzle Readings (Columns D-AE)
    nozzles: [
      { nozzle_id: '1A', attendant: '', electronic_opening: '', electronic_closing: '', mechanical_opening: '', mechanical_closing: '' },
      { nozzle_id: '1B', attendant: '', electronic_opening: '', electronic_closing: '', mechanical_opening: '', mechanical_closing: '' },
      { nozzle_id: '2A', attendant: '', electronic_opening: '', electronic_closing: '', mechanical_opening: '', mechanical_closing: '' },
      { nozzle_id: '2B', attendant: '', electronic_opening: '', electronic_closing: '', mechanical_opening: '', mechanical_closing: '' },
    ] as any[],

    // Delivery info
    delivery_occurred: false,
    before_offload_volume: '',
    after_offload_volume: '',
    delivery_time: '',
    supplier: '',
    invoice_number: '',

    // Financial (Columns AR, AT)
    price_per_liter: '29.92', // Default price
    expected_cash: '', // Auto-calculated: Total Electronic * Price per Liter
    actual_cash_banked: '', // Manually entered after adjustments

    notes: ''
  })

  const [calculatedValues, setCalculatedValues] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Customer allocation state (DIESEL ONLY)
  const [customers, setCustomers] = useState<any[]>([])
  const [customerAllocations, setCustomerAllocations] = useState<any[]>([])
  const [allocationBalance, setAllocationBalance] = useState<any>(null)

  // NEW: Multiple deliveries state
  const [deliveries, setDeliveries] = useState<Array<{
    id: string;
    time: string;
    supplier: string;
    invoice_number: string;
    fuel_type: string;  // NEW: diesel or petrol
    before_volume: string;
    after_volume: string;
    volume_delivered: number;
  }>>([])
  const [availableDeliveries, setAvailableDeliveries] = useState<any[]>([])

  // NEW: Auto-populate state
  const [autoPopulated, setAutoPopulated] = useState<{
    active: boolean;
    sourceDate: string;
    sourceShift: string;
  } | null>(null)
  const [fetchingPrevious, setFetchingPrevious] = useState(false)

  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (!userData) {
      router.push('/login')
      return
    }
    setUser(JSON.parse(userData))
  }, [])

  // Fetch customers for allocation (diesel only)
  useEffect(() => {
    if (selectedTank === 'TANK-DIESEL') {
      fetchCustomers()
    }
  }, [selectedTank])

  const fetchCustomers = async () => {
    try {
      const token = localStorage.getItem('accessToken')
      const response = await fetch(`${BASE}/customers?active_only=true`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        setCustomers(data)

        // Initialize allocations with empty values for each customer
        const initialAllocations = data.map((customer: any) => ({
          customer_id: customer.customer_id,
          customer_name: customer.customer_name,
          volume: '',
          price_per_liter: customer.default_price_per_liter?.toString() || formData.price_per_liter,
          amount: 0
        }))
        setCustomerAllocations(initialAllocations)
      }
    } catch (err) {
      console.error('Error fetching customers:', err)
    }
  }

  // NEW: Fetch unlinked deliveries when tank, date, or shift changes
  useEffect(() => {
    if (selectedTank && formData.date && formData.shift_type) {
      fetchUnlinkedDeliveries()
    }
  }, [selectedTank, formData.date, formData.shift_type])

  // NEW: Fetch unlinked deliveries for auto-linking
  const fetchUnlinkedDeliveries = async () => {
    try {
      const token = localStorage.getItem('accessToken')
      const response = await fetch(
        `${BASE}/tank-readings/deliveries/${selectedTank}?date=${formData.date}&shift_type=${formData.shift_type}&unlinked_only=true`,
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      )

      if (response.ok) {
        const data = await response.json()
        setAvailableDeliveries(data)
      }
    } catch (err) {
      console.error('Error fetching unlinked deliveries:', err)
    }
  }

  // NEW: Fetch previous shift closing readings to auto-populate opening values
  const fetchPreviousShiftData = async () => {
    try {
      setFetchingPrevious(true)
      const token = localStorage.getItem('accessToken')
      const response = await fetch(
        `${BASE}/tank-readings/readings/${selectedTank}/previous-shift?current_date=${formData.date}&shift_type=${formData.shift_type}`,
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      )

      if (response.ok) {
        const data = await response.json()

        if (data.found) {
          // Auto-populate opening values from previous shift's closing values
          setFormData(prev => {
            const updatedNozzles = [...prev.nozzles]

            // Update nozzle opening readings from previous closing
            data.nozzle_readings?.forEach((prevNozzle: any) => {
              const nozzleIndex = updatedNozzles.findIndex(n => n.nozzle_id === prevNozzle.nozzle_id)
              if (nozzleIndex !== -1) {
                updatedNozzles[nozzleIndex] = {
                  ...updatedNozzles[nozzleIndex],
                  electronic_opening: prevNozzle.electronic_opening?.toString() || '',
                  mechanical_opening: prevNozzle.mechanical_opening?.toString() || ''
                }
              }
            })

            return {
              ...prev,
              opening_dip_cm: data.opening_dip_cm?.toString() || '',
              opening_volume: data.opening_volume?.toString() || '',
              nozzles: updatedNozzles
            }
          })

          // Set auto-populated indicator
          setAutoPopulated({
            active: true,
            sourceDate: data.source_date,
            sourceShift: data.source_shift
          })
        }
      }
    } catch (err) {
      console.error('Error fetching previous shift data:', err)
    } finally {
      setFetchingPrevious(false)
    }
  }

  // NEW: Auto-fetch previous shift data when tank, date, or shift changes
  useEffect(() => {
    if (selectedTank && formData.date && formData.shift_type) {
      // Only auto-fetch if opening values are empty
      const hasOpeningValues = formData.opening_dip_cm || formData.opening_volume ||
        formData.nozzles.some(n => n.electronic_opening || n.mechanical_opening)

      if (!hasOpeningValues) {
        fetchPreviousShiftData()
      }
    }
  }, [selectedTank, formData.date, formData.shift_type])

  // NEW: Get current tank reading estimate for new delivery
  const getCurrentTankReading = () => {
    const sortedDeliveries = getSortedDeliveries()

    if (sortedDeliveries.length === 0) {
      // First delivery: use opening volume
      return parseFloat(formData.opening_volume) || 0
    } else {
      // Use last delivery's after_volume
      const lastDelivery = sortedDeliveries[sortedDeliveries.length - 1]
      return parseFloat(lastDelivery.after_volume) || 0
    }
  }

  // NEW: Add new delivery inline with auto-timestamp (FULL FORMAT)
  const addDelivery = () => {
    // Get current date and time in DD-MM-YYYY HH:MM format
    const now = new Date()
    const day = String(now.getDate()).padStart(2, '0')
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const year = now.getFullYear()
    const hours = String(now.getHours()).padStart(2, '0')
    const minutes = String(now.getMinutes()).padStart(2, '0')
    const fullTimestamp = `${day}-${month}-${year} ${hours}:${minutes}`

    // Get estimated current tank reading
    const estimatedTankLevel = getCurrentTankReading()

    // Determine fuel type from selected tank
    const fuelType = selectedTank === 'TANK-DIESEL' ? 'Diesel' : 'Petrol'

    const newDelivery = {
      id: `temp-${Date.now()}`,
      time: fullTimestamp,  // AUTO-POPULATED with full timestamp DD-MM-YYYY HH:MM
      supplier: '',
      invoice_number: '',
      fuel_type: fuelType,  // AUTO-POPULATED from selected tank
      before_volume: estimatedTankLevel > 0 ? estimatedTankLevel.toString() : '',  // AUTO-POPULATED
      after_volume: '',
      volume_delivered: 0
    }
    setDeliveries([...deliveries, newDelivery])
  }

  // NEW: Update delivery field with smart auto-calculation
  const updateDelivery = (index: number, field: string, value: string) => {
    const updated = [...deliveries]
    updated[index] = { ...updated[index], [field]: value }

    // Smart auto-calculation based on what user is entering
    if (field === 'volume_delivered') {
      // User entered delivery volume directly (from invoice/delivery note)
      const delivered = parseFloat(value) || 0
      const before = parseFloat(updated[index].before_volume) || 0

      // If before_volume exists, calculate after_volume
      if (before > 0) {
        updated[index].after_volume = (before + delivered).toString()
      }
      updated[index].volume_delivered = delivered
    } else if (field === 'before_volume') {
      // User entered before volume, calculate after using delivery volume
      const before = parseFloat(value) || 0
      const delivered = updated[index].volume_delivered || 0

      if (delivered > 0) {
        updated[index].after_volume = (before + delivered).toString()
      }
    } else if (field === 'after_volume') {
      // User entered after volume, calculate delivery volume
      const after = parseFloat(value) || 0
      const before = parseFloat(updated[index].before_volume) || 0

      if (before > 0) {
        updated[index].volume_delivered = after - before
      }
    }

    setDeliveries(updated)
  }

  // NEW: Remove delivery
  const removeDelivery = (id: string) => {
    setDeliveries(deliveries.filter(d => d.id !== id))
  }

  // NEW: Link standalone delivery
  const linkStandaloneDelivery = (deliveryId: string) => {
    const standalone = availableDeliveries.find(d => d.delivery_id === deliveryId)
    if (standalone) {
      const linked = {
        id: standalone.delivery_id,
        time: standalone.time,
        supplier: standalone.supplier,
        invoice_number: standalone.invoice_number || '',
        fuel_type: standalone.fuel_type || (selectedTank === 'TANK-DIESEL' ? 'Diesel' : 'Petrol'),
        before_volume: standalone.volume_before.toString(),
        after_volume: standalone.volume_after.toString(),
        volume_delivered: standalone.actual_volume_delivered
      }
      setDeliveries([...deliveries, linked])
      setAvailableDeliveries(availableDeliveries.filter(d => d.delivery_id !== deliveryId))
    }
  }

  // NEW: Calculate total delivered volume
  const getTotalDelivered = () => {
    return deliveries.reduce((sum, d) => {
      const vol = parseFloat(d.after_volume) - parseFloat(d.before_volume)
      return sum + (isNaN(vol) ? 0 : vol)
    }, 0)
  }

  // NEW: Get deliveries sorted by time
  const getSortedDeliveries = () => {
    return [...deliveries].sort((a, b) => {
      if (!a.time || !b.time) return 0
      return a.time.localeCompare(b.time)
    })
  }

  // NEW: Calculate expected tank level before a delivery
  const calculateExpectedBeforeVolume = (deliveryIndex: number) => {
    const sortedDeliveries = getSortedDeliveries()
    const delivery = sortedDeliveries[deliveryIndex]

    if (!delivery || !delivery.time) return null

    const openingVol = parseFloat(formData.opening_volume) || 0
    const { totalElectronic } = calculateTotals()

    if (deliveryIndex === 0) {
      // First delivery: Opening - sales up to this point
      // We don't know exact sales timing, so estimate proportionally
      return openingVol // Simplified: just show opening for now
    } else {
      // Subsequent delivery: Previous after_volume - sales since then
      const previousDelivery = sortedDeliveries[deliveryIndex - 1]
      const prevAfter = parseFloat(previousDelivery.after_volume) || 0
      return prevAfter // Simplified: show previous after volume
    }
  }

  // NEW: Validate delivery sequence
  const validateDeliverySequence = () => {
    const sorted = getSortedDeliveries()
    const warnings = []

    for (let i = 0; i < sorted.length; i++) {
      const delivery = sorted[i]
      const beforeVol = parseFloat(delivery.before_volume) || 0
      const afterVol = parseFloat(delivery.after_volume) || 0
      const delivered = delivery.volume_delivered || 0

      // Check if after = before + delivered
      if (beforeVol > 0 && afterVol > 0) {
        const calculated = beforeVol + delivered
        const diff = Math.abs(afterVol - calculated)
        if (diff > 10) {
          warnings.push(`Delivery #${i + 1}: After volume (${afterVol.toFixed(0)}L) doesn't match before (${beforeVol.toFixed(0)}L) + delivered (${delivered.toFixed(0)}L)`)
        }
      }

      // Check sequence: before_volume should be less than after_volume
      if (beforeVol >= afterVol && afterVol > 0) {
        warnings.push(`Delivery #${i + 1}: Before volume should be less than after volume`)
      }

      // Check if before_volume makes sense relative to previous delivery
      if (i > 0) {
        const prevDelivery = sorted[i - 1]
        const prevAfter = parseFloat(prevDelivery.after_volume) || 0
        if (prevAfter > 0 && beforeVol > prevAfter) {
          warnings.push(`Delivery #${i + 1}: Before volume (${beforeVol.toFixed(0)}L) is higher than previous after volume (${prevAfter.toFixed(0)}L) - tank can't gain fuel between deliveries`)
        }
      }
    }

    return warnings
  }

  // NEW: Calculate tank state at each point in time
  const calculateTimeline = () => {
    const opening = parseFloat(formData.opening_volume) || 0
    const closing = parseFloat(formData.closing_volume) || 0
    const { totalElectronic } = calculateTotals()
    const sortedDeliveries = getSortedDeliveries()

    const timeline = []

    // Start point
    timeline.push({
      time: 'Start',
      description: 'Shift Opening',
      volume: opening,
      type: 'opening'
    })

    // Add deliveries with estimated sales between them
    let cumulativeDeliveries = 0
    sortedDeliveries.forEach((delivery, index) => {
      cumulativeDeliveries += delivery.volume_delivered || 0

      // Add delivery point
      timeline.push({
        time: delivery.time || 'Unknown',
        description: `Delivery from ${delivery.supplier}`,
        volume: parseFloat(delivery.after_volume) || null,
        deliveredVolume: delivery.volume_delivered,
        type: 'delivery'
      })
    })

    // End point
    timeline.push({
      time: 'End',
      description: 'Shift Closing',
      volume: closing,
      type: 'closing'
    })

    return timeline
  }

  // Auto-calculate Expected Cash based on Total Electronic * Price per Liter
  useEffect(() => {
    const { totalElectronic } = calculateTotals()
    const pricePerLiter = parseFloat(formData.price_per_liter) || 0

    if (totalElectronic > 0 && pricePerLiter > 0) {
      const expectedCash = totalElectronic * pricePerLiter
      setFormData(prev => ({
        ...prev,
        expected_cash: expectedCash.toFixed(2),
        // Auto-populate actual_cash_banked only if it's empty
        actual_cash_banked: prev.actual_cash_banked || expectedCash.toFixed(2)
      }))
    }
  }, [formData.nozzles, formData.price_per_liter])

  // Calculate nozzle movements
  const calculateNozzleMovement = (opening: string, closing: string) => {
    const open = parseFloat(opening)
    const close = parseFloat(closing)
    if (!open || !close) return 0
    return close - open
  }

  // Get calculated nozzle data
  const getNozzleReadings = () => {
    return formData.nozzles.map(nozzle => ({
      nozzle_id: nozzle.nozzle_id,
      attendant: nozzle.attendant,
      electronic_opening: parseFloat(nozzle.electronic_opening) || 0,
      electronic_closing: parseFloat(nozzle.electronic_closing) || 0,
      electronic_movement: calculateNozzleMovement(nozzle.electronic_opening, nozzle.electronic_closing),
      mechanical_opening: parseFloat(nozzle.mechanical_opening) || 0,
      mechanical_closing: parseFloat(nozzle.mechanical_closing) || 0,
      mechanical_movement: calculateNozzleMovement(nozzle.mechanical_opening, nozzle.mechanical_closing)
    }))
  }

  // Calculate totals
  const calculateTotals = () => {
    const readings = getNozzleReadings()
    const totalElectronic = readings.reduce((sum, n) => sum + n.electronic_movement, 0)
    const totalMechanical = readings.reduce((sum, n) => sum + n.mechanical_movement, 0)
    return { totalElectronic, totalMechanical, readings }
  }

  // NEW: Calculate Tank Volume Movement with multiple deliveries support
  const calculateTankVolumeMovement = () => {
    const openingVol = parseFloat(formData.opening_volume) || 0
    const closingVol = parseFloat(formData.closing_volume) || 0
    const totalDelivered = getTotalDelivered()

    // NEW SIMPLIFIED FORMULA: Tank Movement = (Opening - Closing) + Total Delivered
    // This accounts for multiple deliveries correctly
    if (deliveries.length > 0) {
      return (openingVol - closingVol) + totalDelivered
    }

    // LEGACY: Old single delivery formula (for backward compatibility)
    const beforeOffload = parseFloat(formData.before_offload_volume) || 0
    const afterOffload = parseFloat(formData.after_offload_volume) || 0

    // Excel Column AM Formula: =IF(AL>0,IF(AK>0,(AK-AL)+(AI-AJ),AI-AL),0)
    // AL = closing_volume, AK = after_offload_volume, AI = opening_volume, AJ = before_offload_volume
    if (closingVol > 0) {
      if (afterOffload > 0) {
        // Delivery occurred
        return (afterOffload - closingVol) + (openingVol - beforeOffload)
      } else {
        // No delivery
        return openingVol - closingVol
      }
    }
    return 0
  }

  // Calculate variance and financial metrics
  const calculateFinancialMetrics = () => {
    const { totalElectronic, totalMechanical } = calculateTotals()
    const tankMovement = calculateTankVolumeMovement()
    const pricePerLiter = parseFloat(formData.price_per_liter) || 0
    const actualCashBanked = parseFloat(formData.actual_cash_banked) || 0

    // Column AP: Electronic vs Tank Variance (Liters)
    const electronicVsTankVariance = totalElectronic - tankMovement

    // Column AQ: Mechanical vs Tank Variance (Liters)
    const mechanicalVsTankVariance = totalMechanical - tankMovement

    // Column AS: Expected Amount Electronic (Total Electronic * Price per Liter)
    const expectedAmountElectronic = totalElectronic * pricePerLiter

    // Column AU: Cash Difference (Actual Cash Banked - Expected Amount)
    const cashDifference = actualCashBanked - expectedAmountElectronic

    // Column AV: Loss/Gain Percent
    const lossPercent = expectedAmountElectronic > 0
      ? (cashDifference / expectedAmountElectronic) * 100
      : 0

    // Column AW: Validation Status
    let validationStatus = 'PASS'
    const electronicVariancePercent = tankMovement > 0
      ? Math.abs((electronicVsTankVariance / tankMovement) * 100)
      : 0
    const mechanicalVariancePercent = tankMovement > 0
      ? Math.abs((mechanicalVsTankVariance / tankMovement) * 100)
      : 0

    if (electronicVariancePercent > 1 || mechanicalVariancePercent > 1 || Math.abs(lossPercent) > 2) {
      validationStatus = 'FAIL'
    } else if (electronicVariancePercent > 0.5 || mechanicalVariancePercent > 0.5 || Math.abs(lossPercent) > 1) {
      validationStatus = 'WARNING'
    }

    return {
      electronicVsTankVariance,
      electronicVariancePercent,
      mechanicalVsTankVariance,
      mechanicalVariancePercent,
      expectedAmountElectronic,
      cashDifference,
      lossPercent,
      validationStatus,
      tankMovement,
      totalElectronic,
      totalMechanical
    }
  }

  // Customer allocation functions (DIESEL ONLY)
  const updateCustomerAllocation = (index: number, field: string, value: string) => {
    const newAllocations = [...customerAllocations]
    newAllocations[index] = { ...newAllocations[index], [field]: value }

    // Auto-calculate amount when volume or price changes
    if (field === 'volume' || field === 'price_per_liter') {
      const volume = parseFloat(field === 'volume' ? value : newAllocations[index].volume) || 0
      const price = parseFloat(field === 'price_per_liter' ? value : newAllocations[index].price_per_liter) || 0
      newAllocations[index].amount = volume * price
    }

    setCustomerAllocations(newAllocations)
    validateAllocations(newAllocations)
  }

  const validateAllocations = (allocations: any[]) => {
    const { totalElectronic } = calculateTotals()
    const sumAllocations = allocations.reduce((sum, alloc) => sum + (parseFloat(alloc.volume) || 0), 0)
    const difference = totalElectronic - sumAllocations
    const valid = Math.abs(difference) <= 0.01

    setAllocationBalance({
      valid,
      totalElectronic,
      sumAllocations,
      difference,
      percentageDiff: totalElectronic > 0 ? (difference / totalElectronic * 100) : 0
    })
  }

  // Auto-validate allocations when nozzle readings change (for diesel)
  useEffect(() => {
    if (selectedTank === 'TANK-DIESEL' && customerAllocations.length > 0) {
      validateAllocations(customerAllocations)
    }
  }, [formData.nozzles, customerAllocations, selectedTank])

  const updateNozzle = (index: number, field: string, value: string) => {
    const newNozzles = [...formData.nozzles]
    newNozzles[index] = { ...newNozzles[index], [field]: value }
    setFormData({ ...formData, nozzles: newNozzles })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')

    try {
      const token = localStorage.getItem('accessToken')

      // Prepare nozzle readings
      const nozzleReadings = getNozzleReadings().filter(n => n.attendant) // Only include filled nozzles

      if (nozzleReadings.length === 0) {
        throw new Error('Please enter at least one nozzle reading')
      }

      // NEW: Prepare deliveries array (prioritize new format)
      const deliveriesPayload = deliveries.length > 0
        ? deliveries.map(d => {
            const volumeDelivered = typeof d.volume_delivered === 'number'
              ? d.volume_delivered
              : parseFloat(d.volume_delivered) || 0

            // If before/after volumes are provided, use them; otherwise calculate from delivery volume
            const beforeVol = d.before_volume ? parseFloat(d.before_volume) : 0
            const afterVol = d.after_volume ? parseFloat(d.after_volume) : (beforeVol + volumeDelivered)

            return {
              delivery_id: d.id.startsWith('temp-') ? null : d.id,  // null for new inline, ID for linked
              delivery_time: d.time,
              supplier: d.supplier,
              fuel_type: d.fuel_type || (selectedTank === 'TANK-DIESEL' ? 'Diesel' : 'Petrol'),  // NEW
              invoice_number: d.invoice_number || null,
              before_volume: beforeVol,
              after_volume: afterVol,
              volume_delivered: volumeDelivered
            }
          })
        : []

      const payload = {
        tank_id: selectedTank,
        date: formData.date,
        shift_type: formData.shift_type,

        // Tank dip readings
        opening_dip_cm: parseFloat(formData.opening_dip_cm),
        closing_dip_cm: parseFloat(formData.closing_dip_cm),
        after_delivery_dip_cm: formData.after_delivery_dip_cm ? parseFloat(formData.after_delivery_dip_cm) : null,

        // Tank volume levels (optional - can be entered manually or auto-calculated)
        opening_volume: formData.opening_volume ? parseFloat(formData.opening_volume) : null,
        closing_volume: formData.closing_volume ? parseFloat(formData.closing_volume) : null,

        // Nozzle readings
        nozzle_readings: nozzleReadings,

        // NEW: Multiple deliveries array (PRIORITY)
        deliveries: deliveriesPayload,

        // LEGACY: Single delivery fields (backward compatibility - only used if no deliveries array)
        delivery_occurred: deliveries.length === 0 ? formData.delivery_occurred : false,
        before_offload_volume: deliveries.length === 0 && formData.before_offload_volume ? parseFloat(formData.before_offload_volume) : null,
        after_offload_volume: deliveries.length === 0 && formData.after_offload_volume ? parseFloat(formData.after_offload_volume) : null,
        delivery_time: deliveries.length === 0 ? (formData.delivery_time || null) : null,
        supplier: deliveries.length === 0 ? (formData.supplier || null) : null,
        invoice_number: deliveries.length === 0 ? (formData.invoice_number || null) : null,

        // Financial
        price_per_liter: formData.price_per_liter ? parseFloat(formData.price_per_liter) : null,
        actual_cash_banked: formData.actual_cash_banked ? parseFloat(formData.actual_cash_banked) : null,

        // Customer allocations (DIESEL ONLY - Columns AR-BB)
        customer_allocations: selectedTank === 'TANK-DIESEL'
          ? customerAllocations.filter(alloc => parseFloat(alloc.volume) > 0).map(alloc => ({
              customer_id: alloc.customer_id,
              customer_name: alloc.customer_name,
              volume: parseFloat(alloc.volume),
              price_per_liter: parseFloat(alloc.price_per_liter),
              amount: alloc.amount
            }))
          : [],

        recorded_by: user.user_id,
        notes: formData.notes || null
      }

      // Validate diesel allocations before submission
      if (selectedTank === 'TANK-DIESEL' && allocationBalance && !allocationBalance.valid) {
        if (!confirm(`Customer allocations do not balance (difference: ${allocationBalance.difference.toFixed(3)}L). Continue anyway?`)) {
          throw new Error('Allocation validation cancelled by user')
        }
      }

      const res = await fetch(`${BASE}/tank-readings/readings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.detail?.message || errorData.detail || 'Failed to submit reading')
      }

      const result = await res.json()
      setCalculatedValues(result)
      setSuccess('Daily reading submitted successfully! All Excel calculations completed.')
      setActiveSection(4) // Show results
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const { totalElectronic, totalMechanical } = calculateTotals()

  return (
    <div className="min-h-screen p-6 transition-colors duration-300" style={{ backgroundColor: theme.background }}>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold transition-colors duration-300" style={{ color: theme.textPrimary }}>Daily Tank Reading</h1>
          <p className="mt-1 transition-colors duration-300" style={{ color: theme.textSecondary }}>Complete Excel-format daily reading (Columns D-BF)</p>
        </div>

        {/* Tank Selector */}
        <div className="rounded-lg shadow p-4 mb-6 border-2 transition-all duration-300" style={{
          backgroundColor: getFuelLightColor(),
          borderColor: getFuelColor()
        }}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-bold mb-2" style={{ color: getFuelColor() }}>Tank</label>
              <select
                value={selectedTank}
                onChange={(e) => {
                  const value = e.target.value
                  setSelectedTank(value)
                  // Update theme based on tank selection
                  if (value === 'TANK-DIESEL') {
                    setFuelType('diesel')
                  } else if (value === 'TANK-PETROL') {
                    setFuelType('petrol')
                  }
                }}
                className="w-full px-4 py-2 border-2 rounded-md focus:ring-2 font-bold transition-colors duration-300"
                style={{
                  borderColor: getFuelColor(),
                  backgroundColor: theme.cardBg,
                  color: getFuelColor()
                }}
              >
                <option value="TANK-DIESEL">🟣 Diesel Tank (LSD)</option>
                <option value="TANK-PETROL">🟢 Petrol Tank (UNL)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2 transition-colors duration-300" style={{ color: theme.textPrimary }}>Date</label>
              <input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className="w-full px-4 py-2 rounded-md focus:ring-2 transition-colors duration-300"
                style={{
                  backgroundColor: theme.cardBg,
                  color: theme.textPrimary,
                  borderColor: theme.border,
                  borderWidth: '1px'
                }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2 transition-colors duration-300" style={{ color: theme.textPrimary }}>Shift Type</label>
              <select
                value={formData.shift_type}
                onChange={(e) => setFormData({ ...formData, shift_type: e.target.value })}
                className="w-full px-4 py-2 rounded-md focus:ring-2 transition-colors duration-300"
                style={{
                  backgroundColor: theme.cardBg,
                  color: theme.textPrimary,
                  borderColor: theme.border,
                  borderWidth: '1px'
                }}
              >
                <option value="Day">Day</option>
                <option value="Night">Night</option>
              </select>
            </div>
          </div>
        </div>

        {/* Success/Error Messages */}
        {success && (
          <div className="bg-green-50 border border-green-200 rounded-md p-4 mb-6">
            <p className="text-green-700">{success}</p>
          </div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
            <p className="text-red-700">{error}</p>
          </div>
        )}

        {/* Progress Indicator */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex justify-between">
            {[
              { num: 1, label: 'Tank Dips' },
              { num: 2, label: 'Nozzle Readings' },
              { num: 3, label: 'Financial & Delivery' },
              { num: 4, label: 'Review & Submit' }
            ].map((step) => (
              <button
                key={step.num}
                onClick={() => setActiveSection(step.num)}
                className="flex-1 py-2 text-center border-b-2 transition"
                style={{
                  borderColor: activeSection === step.num ? theme.primary : '#D1D5DB',
                  color: activeSection === step.num ? theme.primary : '#6B7280',
                  fontWeight: activeSection === step.num ? '600' : '400'
                }}
              >
                <div className="text-sm">{step.num}</div>
                <div className="text-xs">{step.label}</div>
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Section 1: Tank Dip Readings (Columns AF, AG, AH) */}
          {activeSection === 1 && (
            <div className="rounded-lg shadow p-6 mb-6 transition-colors duration-300" style={{ backgroundColor: theme.cardBg }}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold transition-colors duration-300" style={{ color: theme.textPrimary }}>📏 Tank Dip Readings & Volume Levels</h2>
                {!autoPopulated?.active && !fetchingPrevious && (
                  <button
                    type="button"
                    onClick={fetchPreviousShiftData}
                    className="px-4 py-2 text-sm font-medium rounded-lg transition-colors"
                    style={{ backgroundColor: '#EFF6FF', color: '#2563EB', border: '1px solid #3B82F6' }}
                  >
                    ↻ Load Previous Shift
                  </button>
                )}
              </div>
              <p className="text-sm mb-6 transition-colors duration-300" style={{ color: theme.textSecondary }}>Physical measurements in centimeters and volume levels in liters (Columns AF-AH, AI, AL)</p>

              {/* Auto-populated indicator */}
              {fetchingPrevious && (
                <div className="mb-4 p-3 rounded-lg flex items-center gap-2" style={{ backgroundColor: '#EFF6FF', borderColor: '#3B82F6', borderWidth: '1px' }}>
                  <svg className="animate-spin h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span className="text-blue-700 text-sm font-medium">Loading previous shift data...</span>
                </div>
              )}

              {autoPopulated?.active && !fetchingPrevious && (
                <div className="mb-4 p-3 rounded-lg flex items-center justify-between" style={{ backgroundColor: '#ECFDF5', borderColor: '#10B981', borderWidth: '1px' }}>
                  <div className="flex items-center gap-2">
                    <span className="text-green-600 text-lg">✓</span>
                    <span className="text-green-700 text-sm font-medium">
                      Opening values auto-populated from {autoPopulated.sourceShift} shift ({autoPopulated.sourceDate})
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setAutoPopulated(null)
                      setFormData(prev => ({
                        ...prev,
                        opening_dip_cm: '',
                        opening_volume: '',
                        nozzles: prev.nozzles.map(n => ({
                          ...n,
                          electronic_opening: '',
                          mechanical_opening: ''
                        }))
                      }))
                    }}
                    className="text-green-600 hover:text-green-800 text-sm underline"
                  >
                    Clear & enter manually
                  </button>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="rounded-lg p-4" style={{ backgroundColor: theme.primaryLight, borderColor: theme.primary, borderWidth: '1px' }}>
                  <label className="block text-sm font-medium mb-2" style={{ color: theme.primary }}>
                    Opening Dip (cm) <span className="text-red-500">*</span>
                    <span className="text-xs ml-2 opacity-75">Excel Column: AF</span>
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.opening_dip_cm}
                    onChange={(e) => setFormData({ ...formData, opening_dip_cm: e.target.value })}
                    className="w-full px-4 py-3 border rounded-md text-lg focus:ring-2"
                    style={{ borderColor: theme.primary + '80' }}
                    placeholder="e.g., 164.5"
                    required
                  />
                  <p className="text-xs mt-1 opacity-75" style={{ color: theme.primary }}>Physical measurement at start of shift</p>
                </div>

                <div className="rounded-lg p-4" style={{ backgroundColor: theme.secondaryLight, borderColor: theme.secondary, borderWidth: '1px' }}>
                  <label className="block text-sm font-medium mb-2" style={{ color: theme.secondary }}>
                    Closing Dip (cm) <span className="text-red-500">*</span>
                    <span className="text-xs ml-2 opacity-75">Excel Column: AH</span>
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.closing_dip_cm}
                    onChange={(e) => setFormData({ ...formData, closing_dip_cm: e.target.value })}
                    className="w-full px-4 py-3 border rounded-md text-lg focus:ring-2"
                    style={{ borderColor: theme.secondary + '80' }}
                    placeholder="e.g., 155.4"
                    required
                  />
                  <p className="text-xs mt-1 opacity-75" style={{ color: theme.secondary }}>Physical measurement at end of shift</p>
                </div>

                {/* Tank Level Volumes (Columns AI, AL) */}
                <div className="rounded-lg p-4" style={{ backgroundColor: theme.primaryLight, borderColor: theme.primary, borderWidth: '1px' }}>
                  <label className="block text-sm font-medium mb-2" style={{ color: theme.primary }}>
                    Tank Level Opening (Volume in Liters)
                    <span className="text-xs ml-2 opacity-75">Excel Column: AI</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.opening_volume}
                    onChange={(e) => setFormData({ ...formData, opening_volume: e.target.value })}
                    className="w-full px-4 py-3 border rounded-md text-lg focus:ring-2"
                    style={{
                      borderColor: theme.primary + '80',
                      backgroundColor: theme.cardBg,
                      color: theme.textPrimary
                    }}
                    placeholder="e.g., 26887.21"
                  />
                  <p className="text-xs mt-1 opacity-75" style={{ color: theme.primary }}>Tank volume at start of shift (liters)</p>
                </div>

                <div className="rounded-lg p-4" style={{ backgroundColor: theme.secondaryLight, borderColor: theme.secondary, borderWidth: '1px' }}>
                  <label className="block text-sm font-medium mb-2" style={{ color: theme.secondary }}>
                    Tank Level Closing (Volume in Liters)
                    <span className="text-xs ml-2 opacity-75">Excel Column: AL</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.closing_volume}
                    onChange={(e) => setFormData({ ...formData, closing_volume: e.target.value })}
                    className="w-full px-4 py-3 border rounded-md text-lg focus:ring-2"
                    style={{
                      borderColor: theme.secondary + '80',
                      backgroundColor: theme.cardBg,
                      color: theme.textPrimary
                    }}
                    placeholder="e.g., 25117.64"
                  />
                  <p className="text-xs mt-1 opacity-75" style={{ color: theme.secondary }}>Tank volume at end of shift (liters)</p>
                </div>

                {/* Tank Volume Movement Display (Column AM) */}
                {(formData.opening_volume || formData.closing_volume) && (
                  <div className="md:col-span-2">
                    <div className="rounded-lg p-4 transition-all duration-300" style={{
                      backgroundColor: theme.accentLight,
                      borderColor: theme.accent,
                      borderWidth: '2px',
                      borderStyle: 'solid'
                    }}>
                      <div className="flex items-center justify-between">
                        <div>
                          <label className="block text-sm font-medium mb-1" style={{ color: theme.accent }}>
                            📊 Tank Volume Movement (Calculated)
                            <span className="text-xs ml-2 opacity-75">Excel Column: AM</span>
                          </label>
                          <p className="text-xs opacity-75" style={{ color: theme.accent }}>
                            Automatic calculation based on opening, closing, and delivery volumes
                          </p>
                        </div>
                        <div className="text-right">
                          <div className="text-3xl font-bold" style={{ color: theme.accent }}>
                            {calculateTankVolumeMovement().toFixed(3)}
                          </div>
                          <div className="text-sm font-medium" style={{ color: theme.accent }}>Liters</div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="md:col-span-2">
                  <label className="flex items-center mb-3">
                    <input
                      type="checkbox"
                      checked={formData.delivery_occurred}
                      onChange={(e) => setFormData({ ...formData, delivery_occurred: e.target.checked })}
                      className="mr-2 w-5 h-5"
                    />
                    <span className="text-sm font-medium transition-colors duration-300" style={{ color: theme.textPrimary }}>Delivery Occurred During Shift</span>
                  </label>

                  {formData.delivery_occurred && (
                    <div className="rounded-lg p-4" style={{ backgroundColor: theme.accentLight, borderColor: theme.accent, borderWidth: '1px' }}>
                      <label className="block text-sm font-medium mb-2" style={{ color: theme.accent }}>
                        After Delivery Dip (cm)
                        <span className="text-xs ml-2 opacity-75">Excel Column: AG</span>
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        value={formData.after_delivery_dip_cm}
                        onChange={(e) => setFormData({ ...formData, after_delivery_dip_cm: e.target.value })}
                        className="w-full px-4 py-3 border rounded-md text-lg focus:ring-2"
                        style={{ borderColor: theme.accent + '80' }}
                        placeholder="e.g., 180.0"
                      />
                      <p className="text-xs mt-1 opacity-75" style={{ color: theme.accent }}>Physical measurement immediately after fuel delivery</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  type="button"
                  onClick={() => setActiveSection(2)}
                  className="px-6 py-2 text-white rounded-md hover:opacity-90 transition"
                  style={{ backgroundColor: theme.primary }}
                >
                  Next: Nozzle Readings →
                </button>
              </div>
            </div>
          )}

          {/* Section 2: Nozzle Readings (Columns D-AE) */}
          {activeSection === 2 && (
            <div className="rounded-lg shadow p-6 mb-6 transition-colors duration-300" style={{ backgroundColor: theme.cardBg }}>
              <h2 className="text-xl font-semibold mb-4 transition-colors duration-300" style={{ color: theme.textPrimary }}>⛽ Nozzle Readings (Columns D-AE)</h2>
              <p className="text-sm mb-6 transition-colors duration-300" style={{ color: theme.textSecondary }}>Individual pump nozzle readings with attendant assignments</p>

              {/* Auto-populated indicator for nozzle readings */}
              {autoPopulated?.active && (
                <div className="mb-4 p-3 rounded-lg flex items-center gap-2" style={{ backgroundColor: '#ECFDF5', borderColor: '#10B981', borderWidth: '1px' }}>
                  <span className="text-green-600 text-lg">✓</span>
                  <span className="text-green-700 text-sm font-medium">
                    Opening meter readings auto-populated from {autoPopulated.sourceShift} shift ({autoPopulated.sourceDate})
                  </span>
                </div>
              )}

              <div className="space-y-6">
                {formData.nozzles.map((nozzle, index) => {
                  const elecMovement = calculateNozzleMovement(nozzle.electronic_opening, nozzle.electronic_closing)
                  const mechMovement = calculateNozzleMovement(nozzle.mechanical_opening, nozzle.mechanical_closing)
                  const fuelPrefix = getFuelTypePrefix()
                  const fuelColor = getFuelColor()
                  const fuelLightColor = getFuelLightColor()

                  return (
                    <div
                      key={nozzle.nozzle_id}
                      className="border-2 rounded-lg p-4 transition-all duration-300"
                      style={{
                        borderColor: fuelColor,
                        backgroundColor: fuelLightColor
                      }}
                    >
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-xl font-bold" style={{ color: fuelColor }}>
                          {fuelPrefix} {nozzle.nozzle_id}
                          <span className="text-xs ml-2 opacity-75">
                            (Excel Columns {index === 0 ? 'D-J' : index === 1 ? 'K-Q' : index === 2 ? 'R-X' : 'Y-AE'})
                          </span>
                        </h3>
                        {elecMovement > 0 && (
                          <div className="text-sm font-bold px-3 py-1 rounded-full" style={{
                            color: fuelColor,
                            backgroundColor: theme.cardBg
                          }}>
                            ✓ Movement: {elecMovement.toFixed(3)}L
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* Attendant */}
                        <div className="md:col-span-3">
                          <label className="block text-sm font-bold mb-1" style={{ color: fuelColor }}>
                            Attendant Name <span className="text-red-500">*</span>
                          </label>
                          <select
                            value={nozzle.attendant}
                            onChange={(e) => updateNozzle(index, 'attendant', e.target.value)}
                            className="w-full px-3 py-2 border-2 rounded-md focus:ring-2 transition-colors duration-300"
                            style={{
                              borderColor: fuelColor,
                              backgroundColor: theme.cardBg,
                              color: theme.textPrimary
                            }}
                          >
                            <option value="">-- Select Attendant --</option>
                            {attendantsList.map((name) => (
                              <option key={name} value={name}>{name}</option>
                            ))}
                          </select>
                        </div>

                        {/* Electronic Readings */}
                        <div>
                          <label className="block text-sm font-bold mb-1" style={{ color: fuelColor }}>
                            Electronic Opening
                          </label>
                          <input
                            type="number"
                            step="0.001"
                            value={nozzle.electronic_opening}
                            onChange={(e) => updateNozzle(index, 'electronic_opening', e.target.value)}
                            className="w-full px-3 py-2 border-2 rounded-md focus:ring-2 transition-colors duration-300"
                            style={{
                              borderColor: fuelColor,
                              backgroundColor: theme.cardBg,
                              color: theme.textPrimary
                            }}
                            placeholder="609176.526"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-bold mb-1" style={{ color: fuelColor }}>
                            Electronic Closing
                          </label>
                          <input
                            type="number"
                            step="0.001"
                            value={nozzle.electronic_closing}
                            onChange={(e) => updateNozzle(index, 'electronic_closing', e.target.value)}
                            className="w-full px-3 py-2 border-2 rounded-md focus:ring-2 transition-colors duration-300"
                            style={{
                              borderColor: fuelColor,
                              backgroundColor: theme.cardBg,
                              color: theme.textPrimary
                            }}
                            placeholder="609454.572"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-bold mb-1" style={{ color: fuelColor }}>
                            Electronic Movement
                          </label>
                          <div className="w-full px-3 py-2 border-2 rounded-md font-bold" style={{
                            borderColor: fuelColor,
                            backgroundColor: fuelLightColor,
                            color: fuelColor
                          }}>
                            {elecMovement.toFixed(3)} L
                          </div>
                        </div>

                        {/* Mechanical Readings */}
                        <div>
                          <label className="block text-sm font-bold mb-1" style={{ color: fuelColor }}>
                            Mechanical Opening
                          </label>
                          <input
                            type="number"
                            step="0.001"
                            value={nozzle.mechanical_opening}
                            onChange={(e) => updateNozzle(index, 'mechanical_opening', e.target.value)}
                            className="w-full px-3 py-2 border-2 rounded-md focus:ring-2 transition-colors duration-300"
                            style={{
                              borderColor: fuelColor,
                              backgroundColor: theme.cardBg,
                              color: theme.textPrimary
                            }}
                            placeholder="611984"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-bold mb-1" style={{ color: fuelColor }}>
                            Mechanical Closing
                          </label>
                          <input
                            type="number"
                            step="0.001"
                            value={nozzle.mechanical_closing}
                            onChange={(e) => updateNozzle(index, 'mechanical_closing', e.target.value)}
                            className="w-full px-3 py-2 border-2 rounded-md focus:ring-2 transition-colors duration-300"
                            style={{
                              borderColor: fuelColor,
                              backgroundColor: theme.cardBg,
                              color: theme.textPrimary
                            }}
                            placeholder="612262"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-bold mb-1" style={{ color: fuelColor }}>
                            Mechanical Movement
                          </label>
                          <div className="w-full px-3 py-2 border-2 rounded-md font-bold" style={{
                            borderColor: fuelColor,
                            backgroundColor: fuelLightColor,
                            color: fuelColor
                          }}>
                            {mechMovement.toFixed(3)} L
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Totals Preview */}
              <div className="mt-6 rounded-lg p-4 border-2 transition-colors duration-300" style={{
                backgroundColor: getFuelLightColor(),
                borderColor: getFuelColor()
              }}>
                <h4 className="font-bold mb-3 text-lg" style={{ color: getFuelColor() }}>
                  Calculated Totals (Columns AN, AO):
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-lg p-4 border-2 transition-colors duration-300" style={{
                    backgroundColor: theme.cardBg,
                    borderColor: getFuelColor()
                  }}>
                    <p className="text-sm font-medium mb-1" style={{ color: getFuelColor() }}>Total Electronic (AN)</p>
                    <p className="text-3xl font-bold" style={{ color: getFuelColor() }}>{totalElectronic.toFixed(3)} L</p>
                  </div>
                  <div className="rounded-lg p-4 border-2 transition-colors duration-300" style={{
                    backgroundColor: theme.cardBg,
                    borderColor: getFuelColor()
                  }}>
                    <p className="text-sm font-medium mb-1" style={{ color: getFuelColor() }}>Total Mechanical (AO)</p>
                    <p className="text-3xl font-bold" style={{ color: getFuelColor() }}>{totalMechanical.toFixed(3)} L</p>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex justify-between">
                <button
                  type="button"
                  onClick={() => setActiveSection(1)}
                  className="px-6 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
                >
                  ← Back: Tank Dips
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSection(3)}
                  className="px-6 py-2 text-white rounded-md hover:opacity-90 transition"
                  style={{ backgroundColor: theme.primary }}
                >
                  Next: Financial & Delivery →
                </button>
              </div>
            </div>
          )}

          {/* Section 3: Financial & Delivery (Columns AR, AT + Delivery) */}
          {activeSection === 3 && (
            <div className="rounded-lg shadow p-6 mb-6 transition-colors duration-300" style={{ backgroundColor: theme.cardBg }}>
              <h2 className="text-xl font-semibold mb-4 transition-colors duration-300" style={{ color: theme.textPrimary }}>💰 Financial & Delivery Information</h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div className="rounded-lg p-4" style={{ backgroundColor: theme.primaryLight, borderColor: theme.primary, borderWidth: '1px' }}>
                  <label className="block text-sm font-medium mb-2" style={{ color: theme.primary }}>
                    Price per Liter (ZMW)
                    <span className="text-xs ml-2 opacity-75">Excel Column: AR</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.price_per_liter}
                    onChange={(e) => setFormData({ ...formData, price_per_liter: e.target.value })}
                    className="w-full px-4 py-3 border rounded-md text-lg focus:ring-2 transition-colors duration-300"
                    style={{ borderColor: theme.primary + '80', backgroundColor: theme.cardBg, color: theme.textPrimary }}
                    placeholder="29.92"
                  />
                  <p className="text-xs mt-1 opacity-75" style={{ color: theme.primary }}>Current selling price per liter</p>
                </div>

                <div className="rounded-lg p-4" style={{ backgroundColor: theme.accentLight, borderColor: theme.accent, borderWidth: '1px' }}>
                  <label className="block text-sm font-medium mb-2" style={{ color: theme.accent }}>
                    Expected Cash (ZMW) <span className="text-xs ml-2 opacity-75">Auto-calculated</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.expected_cash}
                    readOnly
                    disabled
                    className="w-full px-4 py-3 border rounded-md text-lg focus:ring-2 transition-colors duration-300 cursor-not-allowed"
                    style={{
                      borderColor: theme.accent + '80',
                      backgroundColor: theme.accentLight,
                      color: theme.accent,
                      fontWeight: 'bold'
                    }}
                  />
                  <p className="text-xs mt-1 opacity-75" style={{ color: theme.accent }}>Total Electronic × Price per Liter</p>
                </div>

                <div className="md:col-span-2 rounded-lg p-4" style={{ backgroundColor: theme.secondaryLight, borderColor: theme.secondary, borderWidth: '2px' }}>
                  <label className="block text-sm font-medium mb-2" style={{ color: theme.secondary }}>
                    Actual Cash Banked (ZMW)
                    <span className="text-xs ml-2 opacity-75">Excel Column: AT</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.actual_cash_banked}
                    onChange={(e) => setFormData({ ...formData, actual_cash_banked: e.target.value })}
                    className="w-full px-4 py-3 border rounded-md text-lg focus:ring-2 transition-colors duration-300"
                    style={{
                      borderColor: theme.secondary + '80',
                      backgroundColor: theme.cardBg,
                      color: theme.textPrimary
                    }}
                    placeholder="Enter actual cash after adjustments"
                  />
                  <p className="text-xs mt-1 opacity-75" style={{ color: theme.secondary }}>
                    Manually enter the actual cash deposited to bank (after credit sales, shortages, etc.)
                  </p>
                </div>
              </div>

              {/* Real-time Financial Metrics Display (Columns AP, AQ, AS, AU, AV, AW) */}
              {formData.opening_volume && formData.closing_volume && totalElectronic > 0 && (
                <div className="mb-6 rounded-lg p-6 transition-colors duration-300" style={{ backgroundColor: theme.primaryLight, borderColor: theme.primary, borderWidth: '2px' }}>
                  <h3 className="text-lg font-semibold mb-4" style={{ color: theme.primary }}>📊 Real-time Analysis & Variance</h3>

                  {(() => {
                    const metrics = calculateFinancialMetrics()

                    return (
                      <div className="space-y-4">
                        {/* Variance Analysis */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className={`rounded-lg p-4 border-2 ${
                            Math.abs(metrics.electronicVariancePercent) > 1 ? 'bg-red-50 border-red-300' :
                            Math.abs(metrics.electronicVariancePercent) > 0.5 ? 'bg-yellow-50 border-yellow-300' :
                            'bg-green-50 border-green-300'
                          }`}>
                            <p className="text-xs font-medium mb-1 opacity-75">Column AP: Electronic vs Tank Variance</p>
                            <p className="text-2xl font-bold">
                              {metrics.electronicVsTankVariance.toFixed(3)} L
                            </p>
                            <p className="text-sm mt-1">
                              ({metrics.electronicVariancePercent.toFixed(2)}%)
                            </p>
                          </div>

                          <div className={`rounded-lg p-4 border-2 ${
                            Math.abs(metrics.mechanicalVariancePercent) > 1 ? 'bg-red-50 border-red-300' :
                            Math.abs(metrics.mechanicalVariancePercent) > 0.5 ? 'bg-yellow-50 border-yellow-300' :
                            'bg-green-50 border-green-300'
                          }`}>
                            <p className="text-xs font-medium mb-1 opacity-75">Column AQ: Mechanical vs Tank Variance</p>
                            <p className="text-2xl font-bold">
                              {metrics.mechanicalVsTankVariance.toFixed(3)} L
                            </p>
                            <p className="text-sm mt-1">
                              ({metrics.mechanicalVariancePercent.toFixed(2)}%)
                            </p>
                          </div>
                        </div>

                        {/* Financial Summary */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="rounded-lg p-4" style={{ backgroundColor: theme.secondaryLight, borderColor: theme.secondary, borderWidth: '2px', borderStyle: 'solid' }}>
                            <p className="text-xs font-medium mb-1 opacity-75" style={{ color: theme.secondary }}>Column AS: Expected Amount (Electronic)</p>
                            <p className="text-xl font-bold" style={{ color: theme.secondary }}>
                              ZMW {metrics.expectedAmountElectronic.toFixed(2)}
                            </p>
                            <p className="text-xs mt-1 opacity-75" style={{ color: theme.secondary }}>
                              {metrics.totalElectronic.toFixed(3)}L × ZMW {parseFloat(formData.price_per_liter).toFixed(2)}
                            </p>
                          </div>

                          <div className={`rounded-lg p-4 border-2 ${
                            Math.abs(metrics.lossPercent) > 2 ? 'bg-red-50 border-red-300' :
                            Math.abs(metrics.lossPercent) > 1 ? 'bg-yellow-50 border-yellow-300' :
                            'bg-green-50 border-green-300'
                          }`}>
                            <p className="text-xs font-medium mb-1 opacity-75">Column AU: Cash Difference</p>
                            <p className="text-xl font-bold">
                              ZMW {metrics.cashDifference.toFixed(2)}
                            </p>
                            <p className="text-xs mt-1 opacity-75">
                              Actual - Expected
                            </p>
                          </div>

                          <div className={`rounded-lg p-4 border-2 ${
                            Math.abs(metrics.lossPercent) > 2 ? 'bg-red-50 border-red-300' :
                            Math.abs(metrics.lossPercent) > 1 ? 'bg-yellow-50 border-yellow-300' :
                            'bg-green-50 border-green-300'
                          }`}>
                            <p className="text-xs font-medium mb-1 opacity-75">Column AV: Loss/Gain %</p>
                            <p className="text-xl font-bold">
                              {metrics.lossPercent.toFixed(2)}%
                            </p>
                            <p className="text-xs mt-1 opacity-75">
                              {metrics.lossPercent > 0 ? 'Gain' : metrics.lossPercent < 0 ? 'Loss' : 'Balanced'}
                            </p>
                          </div>
                        </div>

                        {/* Validation Status */}
                        <div className="flex items-center justify-center pt-4">
                          <div className={`px-8 py-3 rounded-full text-lg font-bold transition-colors duration-300 ${
                            metrics.validationStatus === 'PASS' ? 'bg-green-100 border-2 border-green-500 text-green-800' :
                            metrics.validationStatus === 'WARNING' ? 'bg-yellow-100 border-2 border-yellow-500 text-yellow-800' :
                            'bg-red-100 border-2 border-red-500 text-red-800'
                          }`}>
                            Column AW: {metrics.validationStatus}
                          </div>
                        </div>

                        <div className="text-center text-xs opacity-75 mt-2" style={{ color: theme.primary }}>
                          <p>✓ PASS: Variance &lt; 0.5% and Loss &lt; 1%</p>
                          <p>⚠ WARNING: Variance 0.5-1% or Loss 1-2%</p>
                          <p>✗ FAIL: Variance &gt; 1% or Loss &gt; 2%</p>
                        </div>
                      </div>
                    )
                  })()}
                </div>
              )}

              {/* NEW: Multiple Deliveries Section */}
              <div className="rounded-lg p-6 mb-6 transition-colors duration-300" style={{
                backgroundColor: theme.accentLight,
                borderColor: theme.accent,
                borderWidth: '2px'
              }}>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold" style={{ color: theme.accent }}>
                      🚚 Fuel Deliveries (Multiple Supported)
                    </h3>
                    <p className="text-sm opacity-75 mt-1" style={{ color: theme.accent }}>
                      Add multiple deliveries or link existing standalone deliveries
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={addDelivery}
                    className="px-4 py-2 text-white rounded-md hover:opacity-90 transition flex items-center gap-2"
                    style={{ backgroundColor: theme.accent }}
                  >
                    <span className="text-xl">+</span>
                    Add Delivery
                  </button>
                </div>

                {/* Auto-Link Suggestion Box */}
                {availableDeliveries.length > 0 && (
                  <div className="bg-yellow-50 border-2 border-yellow-400 rounded-lg p-4 mb-4">
                    <div className="flex items-start gap-3">
                      <div className="text-2xl">💡</div>
                      <div className="flex-1">
                        <h4 className="font-semibold text-yellow-900 mb-2">
                          {availableDeliveries.length} Standalone Delivery(s) Available
                        </h4>
                        <p className="text-sm text-yellow-800 mb-3">
                          These deliveries were recorded separately and match this tank/date/shift. Link them to this reading:
                        </p>
                        <div className="space-y-2">
                          {availableDeliveries.map((delivery) => (
                            <div
                              key={delivery.delivery_id}
                              className="bg-white rounded-lg p-3 border border-yellow-300 flex items-center justify-between"
                            >
                              <div className="flex-1">
                                <p className="font-medium text-gray-900">
                                  {delivery.supplier} - {delivery.time}
                                </p>
                                <p className="text-sm text-gray-600">
                                  Volume: {delivery.actual_volume_delivered.toFixed(2)}L
                                  {delivery.invoice_number && ` • Invoice: ${delivery.invoice_number}`}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => linkStandaloneDelivery(delivery.delivery_id)}
                                className="px-3 py-1 bg-yellow-500 text-white rounded-md hover:bg-yellow-600 transition text-sm"
                              >
                                Link
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Deliveries List */}
                {deliveries.length > 0 ? (
                  <div className="space-y-4">
                    {/* Chronological order note */}
                    {deliveries.length > 1 && (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                        <p className="text-sm text-blue-800">
                          📋 <strong>Deliveries are displayed in chronological order</strong> based on delivery time.
                          This helps track the tank state throughout the shift.
                        </p>
                      </div>
                    )}

                    {getSortedDeliveries().map((delivery, index) => {
                      // Find the original index for updating
                      const originalIndex = deliveries.findIndex(d => d.id === delivery.id)

                      return (
                      <div
                        key={delivery.id}
                        className="rounded-lg p-4 border-2 transition-colors duration-300"
                        style={{
                          backgroundColor: theme.cardBg,
                          borderColor: theme.accent
                        }}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold text-lg">
                              {index + 1}
                            </div>
                            <div>
                              <h4 className="font-semibold" style={{ color: theme.accent }}>
                                Delivery #{index + 1}
                                {delivery.id.startsWith('temp-') ? ' (New)' : ' (Linked)'}
                              </h4>
                              <p className="text-xs opacity-75" style={{ color: theme.accent }}>
                                {delivery.time ? `⏰ ${delivery.time}` : 'Time not set'}
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeDelivery(delivery.id)}
                            className="px-3 py-1 bg-red-500 text-white rounded-md hover:bg-red-600 transition text-sm"
                          >
                            Remove
                          </button>
                        </div>

                        {/* Current Tank Reading Display */}
                        {delivery.before_volume && (
                          <div className="mb-4 rounded-lg p-4 border-2 border-green-400 bg-green-50">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-xs font-medium text-green-800 mb-1">
                                  📊 Current Tank Reading (Before This Delivery)
                                </p>
                                <p className="text-xs text-green-700">
                                  {index === 0
                                    ? 'Based on shift opening volume'
                                    : `Based on previous delivery's after-volume`}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="text-3xl font-bold text-green-600">
                                  {parseFloat(delivery.before_volume).toFixed(0)}
                                </p>
                                <p className="text-xs text-green-700">Liters</p>
                              </div>
                            </div>
                          </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* Row 1: Time and Fuel Type */}
                          <div>
                            <label className="block text-xs font-medium mb-1" style={{ color: theme.accent }}>
                              Delivery Time <span className="text-red-500">*</span>
                              <span className="text-xs ml-2 opacity-75">(Auto-filled)</span>
                            </label>
                            <input
                              type="time"
                              value={delivery.time}
                              onChange={(e) => updateDelivery(originalIndex, 'time', e.target.value)}
                              className="w-full px-3 py-2 border-2 rounded-md focus:ring-2 transition-colors duration-300"
                              style={{
                                borderColor: theme.accent,
                                backgroundColor: theme.cardBg,
                                color: theme.textPrimary
                              }}
                              required
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-medium mb-1" style={{ color: theme.accent }}>
                              Fuel Type <span className="text-red-500">*</span>
                            </label>
                            <select
                              value={delivery.fuel_type || ''}
                              onChange={(e) => updateDelivery(originalIndex, 'fuel_type', e.target.value)}
                              className="w-full px-3 py-2 border-2 rounded-md focus:ring-2 font-medium transition-colors duration-300"
                              style={{
                                borderColor: theme.accent,
                                backgroundColor: theme.cardBg,
                                color: delivery.fuel_type === 'Diesel' ? '#9333EA' : '#10B981'
                              }}
                              required
                            >
                              <option value="">Select Fuel Type</option>
                              <option value="Diesel" style={{ color: '#9333EA' }}>🟣 Diesel (LSD)</option>
                              <option value="Petrol" style={{ color: '#10B981' }}>🟢 Petrol (UNL)</option>
                            </select>
                          </div>

                          {/* Row 2: Supplier and Invoice */}
                          <div>
                            <label className="block text-xs font-medium mb-1" style={{ color: theme.accent }}>
                              Supplier <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="text"
                              value={delivery.supplier}
                              onChange={(e) => updateDelivery(originalIndex, 'supplier', e.target.value)}
                              className="w-full px-3 py-2 border-2 rounded-md focus:ring-2 transition-colors duration-300"
                              style={{
                                borderColor: theme.accent,
                                backgroundColor: theme.cardBg,
                                color: theme.textPrimary
                              }}
                              placeholder="e.g., Puma Energy"
                              required
                            />
                          </div>

                          {/* Row 2: Invoice and Volume Delivered (PRIMARY) */}
                          <div>
                            <label className="block text-xs font-medium mb-1" style={{ color: theme.accent }}>
                              Invoice Number
                            </label>
                            <input
                              type="text"
                              value={delivery.invoice_number}
                              onChange={(e) => updateDelivery(originalIndex, 'invoice_number', e.target.value)}
                              className="w-full px-3 py-2 border-2 rounded-md focus:ring-2 transition-colors duration-300"
                              style={{
                                borderColor: theme.accent,
                                backgroundColor: theme.cardBg,
                                color: theme.textPrimary
                              }}
                              placeholder="INV-12345"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-medium mb-1" style={{ color: theme.accent }}>
                              Volume Delivered (Liters) <span className="text-red-500">*</span>
                              <span className="text-xs ml-2 opacity-75">From delivery note/invoice</span>
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              value={delivery.volume_delivered || ''}
                              onChange={(e) => updateDelivery(originalIndex, 'volume_delivered', e.target.value)}
                              className="w-full px-3 py-2 border-2 rounded-md focus:ring-2 font-bold text-lg transition-colors duration-300"
                              style={{
                                borderColor: theme.accent,
                                backgroundColor: theme.cardBg,
                                color: theme.accent
                              }}
                              placeholder="15000.00"
                              required
                            />
                          </div>

                          {/* Row 3: Optional Verification Fields */}
                          <div className="md:col-span-2">
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3">
                              <p className="text-xs text-blue-800">
                                <strong>💡 Optional Verification:</strong> Enter tank dip readings before/after this delivery to verify the volume.
                                These fields auto-calculate each other based on the delivery volume above.
                              </p>
                            </div>
                          </div>

                          <div>
                            <label className="block text-xs font-medium mb-1" style={{ color: theme.accent }}>
                              Tank Level Before Delivery (L)
                              <span className="text-xs ml-2 opacity-75">Optional - for verification</span>
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              value={delivery.before_volume}
                              onChange={(e) => updateDelivery(originalIndex, 'before_volume', e.target.value)}
                              className="w-full px-3 py-2 border-2 rounded-md focus:ring-2 transition-colors duration-300"
                              style={{
                                borderColor: theme.accent + '80',
                                backgroundColor: theme.cardBg,
                                color: theme.textPrimary
                              }}
                              placeholder="e.g., 5000.00"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-medium mb-1" style={{ color: theme.accent }}>
                              Tank Level After Delivery (L)
                              <span className="text-xs ml-2 opacity-75">Optional - for verification</span>
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              value={delivery.after_volume}
                              onChange={(e) => updateDelivery(originalIndex, 'after_volume', e.target.value)}
                              className="w-full px-3 py-2 border-2 rounded-md focus:ring-2 transition-colors duration-300"
                              style={{
                                borderColor: theme.accent + '80',
                                backgroundColor: theme.cardBg,
                                color: theme.textPrimary
                              }}
                              placeholder="e.g., 20000.00"
                            />
                            {delivery.before_volume && delivery.after_volume && (
                              <p className="text-xs mt-1" style={{ color: theme.accent }}>
                                ✓ Calculated: {(parseFloat(delivery.after_volume) - parseFloat(delivery.before_volume)).toFixed(2)}L
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    )})}

                    {/* Sequence Validation Warnings */}
                    {deliveries.length > 0 && (() => {
                      const warnings = validateDeliverySequence()
                      if (warnings.length > 0) {
                        return (
                          <div className="bg-yellow-50 border-2 border-yellow-400 rounded-lg p-4">
                            <div className="flex items-start gap-3">
                              <div className="text-2xl">⚠️</div>
                              <div className="flex-1">
                                <h4 className="font-semibold text-yellow-900 mb-2">Delivery Sequence Warnings</h4>
                                <ul className="text-sm text-yellow-800 space-y-1">
                                  {warnings.map((warning, i) => (
                                    <li key={i}>• {warning}</li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                          </div>
                        )
                      }
                      return null
                    })()}

                    {/* Timeline Visualization */}
                    {deliveries.length > 0 && formData.opening_volume && formData.closing_volume && (
                      <div className="rounded-lg p-6 border-2" style={{
                        backgroundColor: theme.cardBg,
                        borderColor: theme.primary
                      }}>
                        <h4 className="font-semibold mb-4 flex items-center gap-2" style={{ color: theme.primary }}>
                          <span className="text-2xl">📈</span>
                          Shift Timeline (Chronological Order)
                        </h4>
                        <div className="space-y-3">
                          {calculateTimeline().map((event, index) => {
                            const isOpening = event.type === 'opening'
                            const isClosing = event.type === 'closing'
                            const isDelivery = event.type === 'delivery'

                            return (
                              <div key={index} className="flex items-start gap-4">
                                {/* Timeline line */}
                                <div className="flex flex-col items-center">
                                  <div className={`w-4 h-4 rounded-full ${
                                    isOpening ? 'bg-green-500' :
                                    isClosing ? 'bg-red-500' :
                                    'bg-blue-500'
                                  }`} />
                                  {index < calculateTimeline().length - 1 && (
                                    <div className="w-0.5 h-12 bg-gray-300" />
                                  )}
                                </div>

                                {/* Event details */}
                                <div className="flex-1 pb-4">
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-sm font-semibold" style={{ color: theme.textPrimary }}>
                                      {event.time === 'Start' || event.time === 'End' ? event.time : `⏰ ${event.time}`}
                                    </span>
                                    {event.volume !== null && (
                                      <span className={`text-xl font-bold ${
                                        isOpening ? 'text-green-600' :
                                        isClosing ? 'text-red-600' :
                                        'text-blue-600'
                                      }`}>
                                        {event.volume.toFixed(0)} L
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-sm opacity-75" style={{ color: theme.textSecondary }}>
                                    {event.description}
                                  </p>
                                  {isDelivery && event.deliveredVolume && (
                                    <div className="mt-2 inline-block px-3 py-1 rounded-full bg-blue-100 border border-blue-300">
                                      <span className="text-xs font-medium text-blue-800">
                                        +{event.deliveredVolume.toFixed(0)}L delivered
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>

                        {/* Summary calculation */}
                        <div className="mt-6 pt-4 border-t-2" style={{ borderColor: theme.primary + '40' }}>
                          <div className="grid grid-cols-3 gap-4 text-center">
                            <div>
                              <p className="text-xs opacity-75 mb-1" style={{ color: theme.textSecondary }}>Opening</p>
                              <p className="text-lg font-bold text-green-600">{parseFloat(formData.opening_volume).toFixed(0)}L</p>
                            </div>
                            <div>
                              <p className="text-xs opacity-75 mb-1" style={{ color: theme.textSecondary }}>Total Delivered</p>
                              <p className="text-lg font-bold text-blue-600">+{getTotalDelivered().toFixed(0)}L</p>
                            </div>
                            <div>
                              <p className="text-xs opacity-75 mb-1" style={{ color: theme.textSecondary }}>Closing</p>
                              <p className="text-lg font-bold text-red-600">{parseFloat(formData.closing_volume).toFixed(0)}L</p>
                            </div>
                          </div>
                          <div className="text-center mt-4">
                            <p className="text-xs opacity-75 mb-1" style={{ color: theme.textSecondary }}>Total Sales (Calculated)</p>
                            <p className="text-2xl font-bold" style={{ color: theme.primary }}>
                              {calculateTankVolumeMovement().toFixed(3)} L
                            </p>
                            <p className="text-xs mt-1 font-mono" style={{ color: theme.textSecondary }}>
                              ({parseFloat(formData.opening_volume).toFixed(0)} - {parseFloat(formData.closing_volume).toFixed(0)}) + {getTotalDelivered().toFixed(0)} = {calculateTankVolumeMovement().toFixed(0)}L
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Total Deliveries Summary - ENHANCED */}
                    <div className="rounded-lg p-6 border-4" style={{
                      backgroundColor: theme.accentLight,
                      borderColor: theme.accent,
                      boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
                    }}>
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <p className="text-xs font-medium opacity-75 mb-1" style={{ color: theme.accent }}>
                            TOTAL DELIVERIES
                          </p>
                          <div className="flex items-baseline gap-4">
                            <div>
                              <p className="text-5xl font-bold" style={{ color: theme.accent }}>
                                {deliveries.length}
                              </p>
                              <p className="text-sm mt-1 opacity-75" style={{ color: theme.accent }}>
                                Delivery(s)
                              </p>
                            </div>
                            <div className="border-l-2 pl-4" style={{ borderColor: theme.accent }}>
                              <p className="text-5xl font-bold" style={{ color: theme.accent }}>
                                {getTotalDelivered().toFixed(0)}
                              </p>
                              <p className="text-sm mt-1 opacity-75" style={{ color: theme.accent }}>
                                Liters
                              </p>
                            </div>
                          </div>
                          <p className="text-xs mt-3 opacity-75" style={{ color: theme.accent }}>
                            💧 Total volume: {getTotalDelivered().toFixed(3)} L •
                            Average per delivery: {deliveries.length > 0 ? (getTotalDelivered() / deliveries.length).toFixed(2) : '0.00'} L
                          </p>
                        </div>
                        <div className="text-right">
                          <div className="bg-white rounded-lg p-4 shadow-inner" style={{ borderColor: theme.accent, borderWidth: '2px' }}>
                            <p className="text-xs font-medium mb-1" style={{ color: theme.accent }}>BREAKDOWN</p>
                            <div className="space-y-1 text-left">
                              {deliveries.map((d, i) => (
                                <div key={d.id} className="flex items-center justify-between gap-2 text-xs">
                                  <span style={{ color: theme.accent }} className="opacity-75">#{i + 1}</span>
                                  <span style={{ color: theme.accent }} className="font-mono font-bold">
                                    {d.volume_delivered ? d.volume_delivered.toFixed(0) : '0'}L
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Updated Tank Movement Display with Multiple Deliveries */}
                    {(formData.opening_volume && formData.closing_volume) && (
                      <div className="rounded-lg p-4 border-2" style={{
                        backgroundColor: theme.primaryLight,
                        borderColor: theme.primary,
                        borderWidth: '2px'
                      }}>
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <label className="block text-sm font-medium mb-1" style={{ color: theme.primary }}>
                              📊 Tank Volume Movement (With Multiple Deliveries)
                              <span className="text-xs ml-2 opacity-75">Excel Column: AM</span>
                            </label>
                            <p className="text-xs opacity-75" style={{ color: theme.primary }}>
                              NEW Formula: (Opening - Closing) + Total Delivered
                            </p>
                          </div>
                          <div className="text-right">
                            <div className="text-4xl font-bold" style={{ color: theme.primary }}>
                              {calculateTankVolumeMovement().toFixed(3)}
                            </div>
                            <div className="text-sm font-medium" style={{ color: theme.primary }}>Liters</div>
                          </div>
                        </div>

                        {/* Formula Breakdown */}
                        <div className="mt-3 pt-3 border-t-2" style={{ borderColor: theme.primary + '40' }}>
                          <p className="text-xs font-medium mb-2" style={{ color: theme.primary }}>Calculation Breakdown:</p>
                          <div className="grid grid-cols-3 gap-2 text-xs">
                            <div className="rounded p-2" style={{ backgroundColor: theme.cardBg }}>
                              <p className="opacity-75" style={{ color: theme.primary }}>Opening Volume</p>
                              <p className="font-bold" style={{ color: theme.primary }}>{parseFloat(formData.opening_volume).toFixed(3)}L</p>
                            </div>
                            <div className="rounded p-2" style={{ backgroundColor: theme.cardBg }}>
                              <p className="opacity-75" style={{ color: theme.primary }}>Closing Volume</p>
                              <p className="font-bold" style={{ color: theme.primary }}>{parseFloat(formData.closing_volume).toFixed(3)}L</p>
                            </div>
                            <div className="rounded p-2" style={{ backgroundColor: theme.cardBg }}>
                              <p className="opacity-75" style={{ color: theme.primary }}>Total Delivered</p>
                              <p className="font-bold" style={{ color: theme.primary }}>{getTotalDelivered().toFixed(3)}L</p>
                            </div>
                          </div>
                          <p className="text-xs mt-2 text-center font-mono" style={{ color: theme.primary }}>
                            ({parseFloat(formData.opening_volume).toFixed(3)} - {parseFloat(formData.closing_volume).toFixed(3)}) + {getTotalDelivered().toFixed(3)} = {calculateTankVolumeMovement().toFixed(3)}L
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8 rounded-lg border-2 border-dashed transition-colors duration-300" style={{
                    borderColor: theme.accent,
                    backgroundColor: theme.cardBg
                  }}>
                    <p className="text-sm opacity-75 mb-2" style={{ color: theme.textSecondary }}>
                      No deliveries added yet
                    </p>
                    <p className="text-xs opacity-60" style={{ color: theme.textSecondary }}>
                      Click "Add Delivery" to record a fuel delivery, or link an existing standalone delivery above
                    </p>
                  </div>
                )}
              </div>

              {/* Customer Allocation Section (DIESEL ONLY - Columns AR-BB) */}
              {selectedTank === 'TANK-DIESEL' && customers.length > 0 && (
                <div className="rounded-lg p-6 mb-6 transition-colors duration-300" style={{
                  backgroundColor: '#F3E8FF',
                  borderColor: '#9333EA',
                  borderWidth: '2px'
                }}>
                  <h3 className="text-lg font-semibold mb-2" style={{ color: '#9333EA' }}>
                    👥 Customer Allocation (Excel Columns AR-BB)
                  </h3>
                  <p className="text-sm mb-4 opacity-75" style={{ color: '#9333EA' }}>
                    Allocate diesel volume to different customer types. Total must match Total Electronic Dispensed.
                  </p>

                  {/* Balance Check Display */}
                  {allocationBalance && (
                    <div className={`rounded-lg p-4 mb-4 border-2 ${
                      allocationBalance.valid ? 'bg-green-50 border-green-500' :
                      Math.abs(allocationBalance.percentageDiff) < 1 ? 'bg-yellow-50 border-yellow-500' :
                      'bg-red-50 border-red-500'
                    }`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">
                            {allocationBalance.valid ? '✅ Allocations Balance!' : '⚠️ Allocation Mismatch'}
                          </p>
                          <p className="text-xs opacity-75 mt-1">
                            Column AW Check: Total Electronic - Sum(Allocations) = {allocationBalance.difference.toFixed(3)}L
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold">
                            {allocationBalance.totalElectronic.toFixed(3)}L
                          </p>
                          <p className="text-xs">Total Electronic</p>
                        </div>
                      </div>
                      <div className="mt-2 text-xs opacity-75">
                        <p>Sum of Allocations: {allocationBalance.sumAllocations.toFixed(3)}L</p>
                      </div>
                    </div>
                  )}

                  {/* Customer Allocation Table */}
                  <div className="space-y-3">
                    {customerAllocations.map((allocation, index) => {
                      const customer = customers[index]
                      const volume = parseFloat(allocation.volume) || 0
                      const price = parseFloat(allocation.price_per_liter) || 0
                      const amount = volume * price

                      return (
                        <div key={allocation.customer_id} className="rounded-lg p-4 border-2 transition-all duration-300" style={{
                          backgroundColor: theme.cardBg,
                          borderColor: volume > 0 ? '#9333EA' : theme.border
                        }}>
                          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div>
                              <label className="block text-sm font-bold mb-1" style={{ color: '#9333EA' }}>
                                {allocation.customer_name}
                              </label>
                              <p className="text-xs opacity-75" style={{ color: theme.textSecondary }}>
                                {customer?.customer_type || 'Customer'}
                              </p>
                            </div>

                            <div>
                              <label className="block text-xs font-medium mb-1" style={{ color: '#9333EA' }}>
                                Volume (L)
                              </label>
                              <input
                                type="number"
                                step="0.001"
                                value={allocation.volume}
                                onChange={(e) => updateCustomerAllocation(index, 'volume', e.target.value)}
                                className="w-full px-3 py-2 border-2 rounded-md focus:ring-2 transition-colors duration-300"
                                style={{
                                  borderColor: '#9333EA',
                                  backgroundColor: theme.cardBg,
                                  color: theme.textPrimary
                                }}
                                placeholder="0.000"
                              />
                            </div>

                            <div>
                              <label className="block text-xs font-medium mb-1" style={{ color: '#9333EA' }}>
                                Price/L (ZMW)
                              </label>
                              <input
                                type="number"
                                step="0.01"
                                value={allocation.price_per_liter}
                                onChange={(e) => updateCustomerAllocation(index, 'price_per_liter', e.target.value)}
                                className="w-full px-3 py-2 border-2 rounded-md focus:ring-2 transition-colors duration-300"
                                style={{
                                  borderColor: '#9333EA',
                                  backgroundColor: theme.cardBg,
                                  color: theme.textPrimary
                                }}
                                placeholder="26.98"
                              />
                            </div>

                            <div>
                              <label className="block text-xs font-medium mb-1" style={{ color: '#9333EA' }}>
                                Amount (ZMW)
                              </label>
                              <div className="w-full px-3 py-2 border-2 rounded-md font-bold text-lg" style={{
                                borderColor: '#9333EA',
                                backgroundColor: '#F3E8FF',
                                color: '#9333EA'
                              }}>
                                {amount.toFixed(2)}
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Total Customer Revenue */}
                  <div className="mt-4 rounded-lg p-4 border-2" style={{
                    backgroundColor: '#F3E8FF',
                    borderColor: '#9333EA'
                  }}>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium" style={{ color: '#9333EA' }}>
                        Total Customer Revenue
                      </span>
                      <span className="text-2xl font-bold" style={{ color: '#9333EA' }}>
                        ZMW {customerAllocations.reduce((sum, alloc) => sum + ((parseFloat(alloc.volume) || 0) * (parseFloat(alloc.price_per_liter) || 0)), 0).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {formData.delivery_occurred && (
                <div className="rounded-lg p-6 mb-6 transition-colors duration-300" style={{ backgroundColor: theme.accentLight, borderColor: theme.accent, borderWidth: '1px' }}>
                  <h3 className="text-lg font-semibold mb-4" style={{ color: theme.accent }}>🚚 Delivery Details</h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1" style={{ color: theme.accent }}>Delivery Time</label>
                      <input
                        type="time"
                        value={formData.delivery_time}
                        onChange={(e) => setFormData({ ...formData, delivery_time: e.target.value })}
                        className="w-full px-3 py-2 border rounded-md focus:ring-2 transition-colors duration-300"
                        style={{ borderColor: theme.accent + '80', backgroundColor: theme.cardBg, color: theme.textPrimary }}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-1" style={{ color: theme.accent }}>Supplier</label>
                      <input
                        type="text"
                        value={formData.supplier}
                        onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
                        className="w-full px-3 py-2 border rounded-md focus:ring-2 transition-colors duration-300"
                        style={{ borderColor: theme.accent + '80', backgroundColor: theme.cardBg, color: theme.textPrimary }}
                        placeholder="e.g., Puma Energy"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-1" style={{ color: theme.accent }}>Invoice Number</label>
                      <input
                        type="text"
                        value={formData.invoice_number}
                        onChange={(e) => setFormData({ ...formData, invoice_number: e.target.value })}
                        className="w-full px-3 py-2 border rounded-md focus:ring-2 transition-colors duration-300"
                        style={{ borderColor: theme.accent + '80', backgroundColor: theme.cardBg, color: theme.textPrimary }}
                        placeholder="INV-12345"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-1" style={{ color: theme.accent }}>
                        Before Offload Volume (L)
                        <span className="text-xs ml-2 opacity-75">Column: AJ</span>
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={formData.before_offload_volume}
                        onChange={(e) => setFormData({ ...formData, before_offload_volume: e.target.value })}
                        className="w-full px-3 py-2 border rounded-md focus:ring-2 transition-colors duration-300"
                        style={{ borderColor: theme.accent + '80', backgroundColor: theme.cardBg, color: theme.textPrimary }}
                        placeholder="5000.00"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium mb-1" style={{ color: theme.accent }}>
                        After Offload Volume (L)
                        <span className="text-xs ml-2 opacity-75">Column: AK</span>
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={formData.after_offload_volume}
                        onChange={(e) => setFormData({ ...formData, after_offload_volume: e.target.value })}
                        className="w-full px-3 py-2 border rounded-md focus:ring-2 transition-colors duration-300"
                        style={{ borderColor: theme.accent + '80', backgroundColor: theme.cardBg, color: theme.textPrimary }}
                        placeholder="25000.00"
                      />
                    </div>

                    {/* Tank Volume Movement Display in Delivery Section */}
                    {(formData.opening_volume && formData.closing_volume) && (
                      <div className="md:col-span-2 mt-4">
                        <div className="rounded-lg p-4 transition-all duration-300" style={{
                          backgroundColor: theme.accentLight,
                          borderColor: theme.accent,
                          borderWidth: '2px',
                          borderStyle: 'solid'
                        }}>
                          <div className="flex items-center justify-between">
                            <div>
                              <label className="block text-sm font-medium mb-1" style={{ color: theme.accent }}>
                                📊 Tank Volume Movement (With Delivery)
                                <span className="text-xs ml-2 opacity-75">Excel Column: AM</span>
                              </label>
                              <p className="text-xs opacity-75" style={{ color: theme.accent }}>
                                Updated calculation including delivery volumes
                              </p>
                            </div>
                            <div className="text-right">
                              <div className="text-3xl font-bold" style={{ color: theme.accent }}>
                                {calculateTankVolumeMovement().toFixed(3)}
                              </div>
                              <div className="text-sm font-medium" style={{ color: theme.accent }}>Liters</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium transition-colors duration-300 mb-1" style={{ color: theme.textPrimary }}>Notes (Optional)</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  rows={3}
                  placeholder="Any additional notes or observations..."
                />
              </div>

              <div className="mt-6 flex justify-between">
                <button
                  type="button"
                  onClick={() => setActiveSection(2)}
                  className="px-6 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
                >
                  ← Back: Nozzle Readings
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSection(4)}
                  className="px-6 py-2 text-white rounded-md hover:opacity-90 transition"
                  style={{ backgroundColor: theme.primary }}
                >
                  Next: Review & Submit →
                </button>
              </div>
            </div>
          )}

          {/* Section 4: Review & Submit */}
          {activeSection === 4 && (
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <h2 className="text-xl font-semibold mb-4">📋 Review & Submit</h2>

              {!calculatedValues ? (
                <>
                  <div className="rounded-lg p-6 mb-6" style={{ backgroundColor: theme.primaryLight, borderColor: theme.primary, borderWidth: '1px' }}>
                    <h3 className="font-semibold mb-3" style={{ color: theme.primary }}>Summary</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <p className="text-sm opacity-75" style={{ color: theme.primary }}>Date</p>
                        <p className="font-semibold">{formData.date}</p>
                      </div>
                      <div>
                        <p className="text-sm opacity-75" style={{ color: theme.primary }}>Shift</p>
                        <p className="font-semibold">{formData.shift_type}</p>
                      </div>
                      <div>
                        <p className="text-sm opacity-75" style={{ color: theme.primary }}>Tank</p>
                        <p className="font-semibold">{selectedTank}</p>
                      </div>
                      <div>
                        <p className="text-sm opacity-75" style={{ color: theme.primary }}>Nozzles Filled</p>
                        <p className="font-semibold">{formData.nozzles.filter(n => n.attendant).length} / 4</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-between">
                    <button
                      type="button"
                      onClick={() => setActiveSection(3)}
                      className="px-6 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
                    >
                      ← Back to Edit
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="px-8 py-3 text-white font-semibold rounded-md hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition"
                      style={{ backgroundColor: theme.secondary }}
                    >
                      {loading ? 'Processing...' : '✓ Submit Daily Reading'}
                    </button>
                  </div>
                </>
              ) : (
                <div className="space-y-6">
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <h3 className="font-semibold text-green-900 text-lg mb-2">✓ Reading Submitted Successfully!</h3>
                    <p className="text-sm text-green-700">All Excel calculations completed automatically</p>
                  </div>

                  {/* Tank Movement Results */}
                  <div className="bg-white border border-gray-200 rounded-lg p-4">
                    <h4 className="font-semibold text-gray-900 mb-3">Tank Movement (Column AM)</h4>
                    <div className="text-3xl font-bold text-blue-600">
                      {calculatedValues.tank_volume_movement.toFixed(2)} L
                    </div>
                    <p className="text-sm text-gray-600 mt-1">Fuel dispensed from tank</p>
                  </div>

                  {/* Variance Analysis */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className={`border rounded-lg p-4 ${
                      Math.abs(calculatedValues.electronic_vs_tank_percent) > 1 ? 'bg-red-50 border-red-200' :
                      Math.abs(calculatedValues.electronic_vs_tank_percent) > 0.5 ? 'bg-yellow-50 border-yellow-200' :
                      'bg-green-50 border-green-200'
                    }`}>
                      <h4 className="font-semibold mb-2">Electronic vs Tank (Column AP)</h4>
                      <p className="text-2xl font-bold">{calculatedValues.electronic_vs_tank_variance.toFixed(2)} L</p>
                      <p className="text-sm">({calculatedValues.electronic_vs_tank_percent.toFixed(2)}%)</p>
                    </div>

                    <div className={`border rounded-lg p-4 ${
                      Math.abs(calculatedValues.mechanical_vs_tank_percent) > 1 ? 'bg-red-50 border-red-200' :
                      Math.abs(calculatedValues.mechanical_vs_tank_percent) > 0.5 ? 'bg-yellow-50 border-yellow-200' :
                      'bg-green-50 border-green-200'
                    }`}>
                      <h4 className="font-semibold mb-2">Mechanical vs Tank (Column AQ)</h4>
                      <p className="text-2xl font-bold">{calculatedValues.mechanical_vs_tank_variance.toFixed(2)} L</p>
                      <p className="text-sm">({calculatedValues.mechanical_vs_tank_percent.toFixed(2)}%)</p>
                    </div>
                  </div>

                  {/* Financial Summary */}
                  {calculatedValues.expected_amount_electronic && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <h4 className="font-semibold text-blue-900 mb-3">Financial Summary (Columns AR-AU)</h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                          <p className="text-sm text-blue-700">Expected (Electronic)</p>
                          <p className="text-lg font-bold">ZMW {calculatedValues.expected_amount_electronic.toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-sm text-blue-700">Actual Banked</p>
                          <p className="text-lg font-bold">ZMW {calculatedValues.actual_cash_banked?.toFixed(2) || '0.00'}</p>
                        </div>
                        <div>
                          <p className="text-sm text-blue-700">Cash Difference</p>
                          <p className="text-lg font-bold">{calculatedValues.cash_difference?.toFixed(2) || '0.00'}</p>
                        </div>
                        <div>
                          <p className="text-sm text-blue-700">Loss %</p>
                          <p className="text-lg font-bold">{calculatedValues.loss_percent.toFixed(2)}%</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Status Badge */}
                  <div className="flex items-center justify-center">
                    <span className={`px-6 py-3 rounded-full text-lg font-semibold ${
                      calculatedValues.validation_status === 'PASS' ? 'bg-green-100 text-green-800' :
                      calculatedValues.validation_status === 'WARNING' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {calculatedValues.validation_status}
                    </span>
                  </div>

                  <div className="flex justify-center">
                    <button
                      type="button"
                      onClick={() => window.location.reload()}
                      className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                    >
                      Submit Another Reading
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </form>
      </div>
    </div>
  )
}
