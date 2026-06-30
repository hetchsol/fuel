import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/router'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { getHeaders, authFetch } from '../lib/api'
import { useTanks, tankLabel } from '../hooks/useTanks'
import ExportButtons from '../components/ExportButtons'
import { ExportConfig } from '../lib/exportUtils'
import { formatDateToDisplay } from '../lib/dateUtils'

const BASE = '/api/v1'

interface TankReading {
  reading_id: string
  tank_id: string
  fuel_type: string
  date: string
  opening_volume: number
  closing_volume: number
  before_offload_volume?: number
  after_offload_volume?: number
  tank_volume_movement: number
  delivery_occurred: boolean
  delivery_volume?: number
  validation_status: string
  validation_messages: string[]
  recorded_by: string
  created_at: string
  supplier?: string
  invoice_number?: string
  notes?: string
}

interface Delivery {
  delivery_id: string
  tank_id: string
  fuel_type: string
  date: string
  time: string
  before_delivery_dip_cm?: number
  after_delivery_dip_cm?: number
  volume_before: number
  volume_after: number
  actual_volume_delivered: number
  invoice_volume_liters?: number
  expected_volume?: number
  flowmeter_volume?: number
  delivery_variance?: number
  variance_percent?: number
  supplier: string
  invoice_number?: string
  validation_status: string
  validation_message: string
  recon_invoice_vs_flowmeter?: number
  recon_flowmeter_vs_tank?: number
  recon_invoice_vs_tank?: number
  recon_status?: string
  recon_outlier?: string
  recorded_by: string
  created_at: string
}

interface QueuedTankDelivery {
  id: string
  date: string
  time: string
  before_delivery_dip_cm: string
  after_delivery_dip_cm: string
  computed_before_vol?: number
  computed_after_vol?: number
  supplier: string
  invoice_number: string
  invoice_volume_liters: string
  flowmeter_volume: string
  temperature: string
  notes: string
  status: 'pending' | 'submitted' | 'error'
  result?: any
  error?: string
}

export default function FuelOperations() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [activeTab, setActiveTab] = useState<'levels' | 'readings' | 'deliveries' | 'summary'>('levels')
  const canManageDeliveries = user?.role === 'manager' || user?.role === 'owner'
  const { tanks: availableTanks } = useTanks()
  const [selectedTank, setSelectedTank] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [showDeliveryForm, setShowDeliveryForm] = useState(false)

  useEffect(() => {
    if (!selectedTank && availableTanks.length > 0) {
      setSelectedTank(availableTanks[0].tank_id)
    }
  }, [availableTanks, selectedTank])

  useEffect(() => {
    authFetch(`${BASE}/settings/fuel`, { headers: getHeaders() })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data) setFuelPrices({ Petrol: data.petrol_price_per_liter || 0, Diesel: data.diesel_price_per_liter || 0 })
      })
      .catch(() => {})
  }, [])

  const [readingForm, setReadingForm] = useState({
    date: new Date().toISOString().split('T')[0],
    opening_volume: '',
    closing_volume: '',
    notes: ''
  })

  const [deliveryForm, setDeliveryForm] = useState({
    date: new Date().toISOString().split('T')[0],
    time: '',
    before_delivery_dip_cm: '',
    after_delivery_dip_cm: '',
    supplier: '',
    invoice_number: '',
    invoice_volume_liters: '',
    flowmeter_volume: '',
    temperature: '',
    notes: ''
  })
  const [beforeVolPreview, setBeforeVolPreview] = useState<number | null>(null)
  const [afterVolPreview, setAfterVolPreview] = useState<number | null>(null)

  const [readings, setReadings] = useState<TankReading[]>([])
  const [deliveries, setDeliveries] = useState<Delivery[]>([])
  const [deliveryQueue, setDeliveryQueue] = useState<QueuedTankDelivery[]>([])
  const [submittingQueue, setSubmittingQueue] = useState(false)
  const [loading, setLoading] = useState(false)
  const [fuelPrices, setFuelPrices] = useState<Record<string, number>>({ Petrol: 0, Diesel: 0 })

  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [summaryMovements, setSummaryMovements] = useState<any>(null)
  const [summarySales, setSummarySales] = useState<any[]>([])
  const [summaryLoading, setSummaryLoading] = useState(false)

  const today = new Date().toISOString().split('T')[0]

  // Always fetch so summary strip stays live regardless of active tab
  const { data: tankLevels, mutate: mutateLevels } = useSWR(
    selectedTank ? 'tank-levels' : null,
    () => authFetch(`${BASE}/tanks/levels`, { headers: getHeaders() }).then(r => r.ok ? r.json() : []),
    { refreshInterval: 10000 }
  )

  const { data: levelsMovements, mutate: mutateLevelsMovements } = useSWR(
    selectedTank ? `movements-${selectedTank}-${today}` : null,
    () => authFetch(`${BASE}/tanks/${selectedTank}/movements?date=${today}`, { headers: getHeaders() }).then(r => r.ok ? r.json() : null),
    { refreshInterval: 10000 }
  )

  const currentStock = tankLevels?.find((t: any) => t.tank_id === selectedTank) || null

  const calculateMovementPreview = () => {
    const opening = parseFloat(readingForm.opening_volume)
    const closing = parseFloat(readingForm.closing_volume)
    if (!opening || !closing) return 0
    return opening - closing
  }

  const calculateDeliveryPreview = () => {
    if (afterVolPreview === null || beforeVolPreview === null) return 0
    return afterVolPreview - beforeVolPreview
  }

  const fetchSummary = async () => {
    setSummaryLoading(true)
    try {
      const [movementsRes, salesRes] = await Promise.all([
        authFetch(`${BASE}/tanks/${selectedTank}/movements?date=${selectedDate}`, { headers: getHeaders() }),
        authFetch(`${BASE}/sales/date/${selectedDate}`, { headers: getHeaders() })
      ])
      if (movementsRes.ok) setSummaryMovements(await movementsRes.json())
      else setSummaryMovements(null)
      if (salesRes.ok) setSummarySales(await salesRes.json())
      else setSummarySales([])
    } catch (err) {
      console.error('Error fetching summary:', err)
    } finally {
      setSummaryLoading(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'summary') fetchSummary()
  }, [activeTab, selectedTank, selectedDate])

  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (!userData) { router.push('/login'); return }
    setUser(JSON.parse(userData))
    fetchReadings()
    fetchDeliveries()
  }, [selectedTank])

  const fetchReadings = async () => {
    try {
      const res = await authFetch(`${BASE}/tank-readings/readings/${selectedTank}`, { headers: getHeaders() })
      if (res.ok) setReadings(await res.json())
    } catch (err) { console.error(err) }
  }

  const fetchDeliveries = async () => {
    try {
      const res = await authFetch(`${BASE}/tank-readings/deliveries/${selectedTank}`, { headers: getHeaders() })
      if (res.ok) setDeliveries(await res.json())
    } catch (err) { console.error(err) }
  }

  const submitReading = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const payload = {
        tank_id: selectedTank,
        date: readingForm.date,
        opening_volume: parseFloat(readingForm.opening_volume),
        closing_volume: parseFloat(readingForm.closing_volume),
        delivery_occurred: false,
        recorded_by: user.user_id,
        notes: readingForm.notes || null
      }
      const res = await authFetch(`${BASE}/tank-readings/readings`, {
        method: 'POST',
        headers: { ...getHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.detail?.message || errorData.detail || 'Failed to submit reading')
      }
      toast.success('Tank reading submitted')
      setShowForm(false)
      setReadingForm({ date: new Date().toISOString().split('T')[0], opening_volume: '', closing_volume: '', notes: '' })
      fetchReadings()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  const fetchDipVolume = async (dipCm: string, setter: (v: number | null) => void) => {
    if (!selectedTank || !dipCm || isNaN(parseFloat(dipCm))) { setter(null); return }
    try {
      const res = await authFetch(
        `${BASE}/settings/tank-calibration/${selectedTank}/convert?dip_cm=${parseFloat(dipCm)}`,
        { headers: getHeaders() }
      )
      if (res.ok) { const data = await res.json(); setter(data.volume_liters ?? null) }
      else setter(null)
    } catch { setter(null) }
  }

  const addDeliveryToQueue = (e: React.FormEvent) => {
    e.preventDefault()
    const newDelivery: QueuedTankDelivery = {
      id: crypto.randomUUID(),
      date: deliveryForm.date,
      time: deliveryForm.time,
      before_delivery_dip_cm: deliveryForm.before_delivery_dip_cm,
      after_delivery_dip_cm: deliveryForm.after_delivery_dip_cm,
      computed_before_vol: beforeVolPreview ?? undefined,
      computed_after_vol: afterVolPreview ?? undefined,
      supplier: deliveryForm.supplier,
      invoice_number: deliveryForm.invoice_number,
      invoice_volume_liters: deliveryForm.invoice_volume_liters,
      flowmeter_volume: deliveryForm.flowmeter_volume,
      temperature: deliveryForm.temperature,
      notes: deliveryForm.notes,
      status: 'pending',
    }
    setDeliveryQueue(prev => [...prev, newDelivery].sort((a, b) => a.time.localeCompare(b.time)))
    setBeforeVolPreview(null)
    setAfterVolPreview(null)
    setDeliveryForm({ ...deliveryForm, time: '', before_delivery_dip_cm: '', after_delivery_dip_cm: '', supplier: '', invoice_number: '', invoice_volume_liters: '', flowmeter_volume: '', temperature: '', notes: '' })
  }

  const removeFromDeliveryQueue = (id: string) => {
    setDeliveryQueue(prev => prev.filter(d => d.id !== id))
  }

  const clearCompletedDeliveries = () => {
    setDeliveryQueue(prev => prev.filter(d => d.status === 'pending' || d.status === 'error'))
  }

  const submitAllDeliveries = async () => {
    setSubmittingQueue(true)
    const pending = deliveryQueue.filter(d => d.status === 'pending' || d.status === 'error')
    for (const delivery of pending) {
      setDeliveryQueue(prev => prev.map(d => d.id === delivery.id ? { ...d, status: 'pending' as const, error: undefined } : d))
      try {
        const payload = {
          tank_id: selectedTank,
          date: delivery.date,
          time: delivery.time,
          before_delivery_dip_cm: parseFloat(delivery.before_delivery_dip_cm),
          after_delivery_dip_cm: parseFloat(delivery.after_delivery_dip_cm),
          supplier: delivery.supplier,
          invoice_number: delivery.invoice_number || null,
          invoice_volume_liters: delivery.invoice_volume_liters ? parseFloat(delivery.invoice_volume_liters) : null,
          flowmeter_volume: delivery.flowmeter_volume ? parseFloat(delivery.flowmeter_volume) : null,
          temperature: delivery.temperature ? parseFloat(delivery.temperature) : null,
          recorded_by: user.user_id,
          notes: delivery.notes || null
        }
        const res = await authFetch(`${BASE}/tank-readings/deliveries`, {
          method: 'POST',
          headers: { ...getHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
        if (!res.ok) {
          const errorData = await res.json()
          throw new Error(errorData.detail || 'Failed to record delivery')
        }
        const data = await res.json()
        setDeliveryQueue(prev => prev.map(d => d.id === delivery.id ? { ...d, status: 'submitted' as const, result: data } : d))
      } catch (err: any) {
        setDeliveryQueue(prev => prev.map(d => d.id === delivery.id ? { ...d, status: 'error' as const, error: err.message || 'Failed' } : d))
      }
    }
    fetchDeliveries()
    mutateLevels()
    mutateLevelsMovements()
    setSubmittingQueue(false)
    if (pending.length > 0) toast.success('Batch submission complete')
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PASS': return 'text-status-success bg-status-success/10'
      case 'WARNING': return 'text-status-warning bg-status-warning/10'
      case 'FAIL': return 'text-status-error bg-status-error/10'
      default: return 'text-content-secondary bg-surface-bg'
    }
  }

  const getExportConfig = useCallback((): ExportConfig | null => {
    if (deliveries.length > 0) {
      return {
        title: 'Fuel Operations — Deliveries',
        filename: `fuel_operations_${new Date().toISOString().slice(0, 10)}`,
        columns: [
          { header: 'Date', key: 'date' },
          { header: 'Tank', key: 'tank_id' },
          { header: 'Supplier', key: 'supplier' },
          { header: 'Invoice', key: 'invoice_number' },
          { header: 'Expected (L)', key: 'expected_volume', format: 'number' },
          { header: 'Flowmeter (L)', key: 'flowmeter_volume', format: 'number' },
          { header: 'Actual (L)', key: 'actual_volume', format: 'number' },
          { header: 'Variance (L)', key: 'variance', format: 'number' },
        ],
        data: deliveries,
      }
    }
    if (readings.length > 0) {
      return {
        title: 'Fuel Operations — Readings',
        filename: `fuel_readings_${new Date().toISOString().slice(0, 10)}`,
        columns: [
          { header: 'Date', key: 'date' },
          { header: 'Tank', key: 'tank_id' },
          { header: 'Opening Vol (L)', key: 'opening_volume', format: 'number' },
          { header: 'Closing Vol (L)', key: 'closing_volume', format: 'number' },
          { header: 'Movement (L)', key: 'tank_volume_movement', format: 'number' },
        ],
        data: readings,
      }
    }
    return null
  }, [deliveries, readings])

  const fuelType = availableTanks.find(t => t.tank_id === selectedTank)?.fuel_type || 'Diesel'
  const ppl = fuelPrices[fuelType] || 0
  const todayDelivered = levelsMovements?.summary?.total_delivered ?? 0
  const todaySold = levelsMovements?.summary?.total_sold ?? 0

  return (
    <div className="min-h-screen bg-surface-bg p-4 sm:p-6">
      <div className="max-w-7xl mx-auto space-y-4">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-content-primary">Fuel Operations</h1>
            <p className="text-sm text-content-secondary mt-0.5">Tank levels, deliveries, readings and movement summary</p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={selectedTank}
              onChange={e => setSelectedTank(e.target.value)}
              className="px-3 py-2 border border-surface-border rounded-lg bg-surface-card text-content-primary text-sm focus:outline-none focus:ring-2 focus:ring-action-primary"
            >
              {availableTanks.map(t => (
                <option key={t.tank_id} value={t.tank_id}>{tankLabel(t)}</option>
              ))}
            </select>
            <ExportButtons getConfig={getExportConfig} />
          </div>
        </div>

        {/* Summary strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-surface-card border border-surface-border rounded-lg p-3">
            <p className="text-xs font-medium text-content-secondary">Current Level</p>
            <p className="text-xl font-bold text-content-primary mt-0.5">
              {currentStock?.current_level != null
                ? `${currentStock.current_level.toLocaleString(undefined, { maximumFractionDigits: 0 })} L`
                : '—'}
            </p>
            {currentStock && (
              <div className="mt-1.5 space-y-1">
                <div className="w-full bg-surface-bg rounded-full h-1.5">
                  <div
                    className={`h-1.5 rounded-full ${
                      currentStock.percentage >= 95 ? 'bg-status-error' :
                      currentStock.percentage >= 85 ? 'bg-status-warning' :
                      'bg-action-primary'
                    }`}
                    style={{ width: `${Math.min(currentStock.percentage || 0, 100)}%` }}
                  />
                </div>
                <p className="text-[10px] text-content-secondary">{currentStock.percentage?.toFixed(1)}% of {currentStock.capacity?.toLocaleString(undefined, { maximumFractionDigits: 0 })} L</p>
              </div>
            )}
          </div>

          <div className="bg-surface-card border border-surface-border rounded-lg p-3">
            <p className="text-xs font-medium text-content-secondary">Delivered Today</p>
            <p className="text-xl font-bold text-status-success mt-0.5">
              {todayDelivered.toLocaleString(undefined, { maximumFractionDigits: 0 })} L
            </p>
            {ppl > 0 && (
              <p className="text-[10px] text-content-secondary mt-0.5 font-mono">
                K{(todayDelivered * ppl).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            )}
          </div>

          <div className="bg-surface-card border border-surface-border rounded-lg p-3">
            <p className="text-xs font-medium text-content-secondary">Sold Today</p>
            <p className="text-xl font-bold text-status-error mt-0.5">
              {todaySold.toLocaleString(undefined, { maximumFractionDigits: 0 })} L
            </p>
            {ppl > 0 && (
              <p className="text-[10px] text-content-secondary mt-0.5 font-mono">
                K{(todaySold * ppl).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            )}
          </div>

          <div className={`bg-surface-card border rounded-lg p-3 ${currentStock?.percentage >= 90 ? 'border-status-warning' : 'border-surface-border'}`}>
            <p className="text-xs font-medium text-content-secondary">Net Today</p>
            {(() => {
              const net = todayDelivered - todaySold
              return (
                <>
                  <p className={`text-xl font-bold mt-0.5 ${net >= 0 ? 'text-status-success' : 'text-status-error'}`}>
                    {net >= 0 ? '+' : ''}{net.toLocaleString(undefined, { maximumFractionDigits: 0 })} L
                  </p>
                  {currentStock?.percentage >= 90 && (
                    <p className="text-[10px] text-status-warning mt-0.5">Tank {currentStock.percentage?.toFixed(0)}% full</p>
                  )}
                </>
              )
            })()}
          </div>
        </div>

        {/* Tabs + content */}
        <div className="bg-surface-card rounded-lg border border-surface-border">
          <div className="border-b border-surface-border">
            <nav className="flex -mb-px overflow-x-auto">
              {([
                { key: 'levels', label: 'Tank Levels' },
                ...(canManageDeliveries ? [{ key: 'deliveries', label: 'Deliveries' }] : []),
                { key: 'readings', label: 'Tank Readings' },
                { key: 'summary', label: 'Summary' },
              ] as { key: typeof activeTab; label: string }[]).map(tab => (
                <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                  className={`px-5 py-3 font-medium text-sm border-b-2 whitespace-nowrap flex-shrink-0 ${
                    activeTab === tab.key
                      ? 'border-action-primary text-action-primary'
                      : 'border-transparent text-content-secondary hover:text-content-primary'
                  }`}>
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          <div className="p-4 sm:p-6">

            {/* ── Tank Levels tab ── */}
            {activeTab === 'levels' && (
              <div className="space-y-6">

                {/* Compact fill bar + headroom */}
                {currentStock && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-content-secondary">
                      <span>{currentStock.current_level?.toLocaleString(undefined, { maximumFractionDigits: 0 })} L remaining</span>
                      <span>Capacity {currentStock.capacity?.toLocaleString(undefined, { maximumFractionDigits: 0 })} L</span>
                    </div>
                    <div className="w-full bg-surface-bg rounded-full h-3">
                      <div
                        className={`h-3 rounded-full transition-all duration-300 ${
                          currentStock.percentage >= 95 ? 'bg-status-error' :
                          currentStock.percentage >= 85 ? 'bg-status-warning' :
                          'bg-action-primary'
                        }`}
                        style={{ width: `${Math.min(currentStock.percentage || 0, 100)}%` }}
                      />
                    </div>
                    {currentStock.percentage >= 90 && (
                      <p className="text-xs text-status-warning">
                        Tank is {currentStock.percentage?.toFixed(1)}% full — {(currentStock.capacity - currentStock.current_level).toLocaleString(undefined, { maximumFractionDigits: 0 })} L available space
                      </p>
                    )}
                    <button onClick={() => mutateLevels()} className="text-xs text-action-primary hover:underline">
                      Refresh
                    </button>
                  </div>
                )}

                {/* Today's Activity */}
                <div>
                  <h2 className="text-base font-semibold text-content-primary mb-3">
                    Today's Activity — {fuelType}
                    {ppl > 0 && <span className="text-sm font-normal text-content-secondary ml-1">@ K{ppl}/L</span>}
                  </h2>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-content-secondary w-16">Delivered</span>
                      <div className="flex-1 bg-surface-bg rounded-full h-3">
                        <div className="bg-status-success h-3 rounded-full transition-all"
                          style={{ width: `${Math.max(todayDelivered, todaySold) > 0 ? (todayDelivered / Math.max(todayDelivered, todaySold)) * 100 : 0}%` }} />
                      </div>
                      <span className="text-xs font-mono text-status-success w-20 text-right">
                        {todayDelivered.toLocaleString(undefined, { maximumFractionDigits: 0 })} L
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-content-secondary w-16">Sold</span>
                      <div className="flex-1 bg-surface-bg rounded-full h-3">
                        <div className="bg-status-error h-3 rounded-full transition-all"
                          style={{ width: `${Math.max(todayDelivered, todaySold) > 0 ? (todaySold / Math.max(todayDelivered, todaySold)) * 100 : 0}%` }} />
                      </div>
                      <span className="text-xs font-mono text-status-error w-20 text-right">
                        {todaySold.toLocaleString(undefined, { maximumFractionDigits: 0 })} L
                      </span>
                    </div>
                  </div>
                </div>

                {/* Stock Movements Timeline */}
                <div>
                  <h2 className="text-base font-semibold text-content-primary mb-3">Stock Movements — {today}</h2>
                  {!levelsMovements && (
                    <p className="text-sm text-content-secondary">Loading movements...</p>
                  )}
                  {levelsMovements && levelsMovements.movements?.length === 0 && (
                    <p className="text-sm text-content-secondary">No movements recorded today</p>
                  )}
                  {levelsMovements && levelsMovements.movements?.length > 0 && (
                    <div className="overflow-x-auto rounded-lg border border-surface-border">
                      <table className="min-w-full divide-y divide-surface-border text-sm">
                        <thead className="bg-surface-bg">
                          <tr>
                            {['Time', 'Type', 'Volume', 'Value', 'Reference', 'Description', 'Running Net'].map((h, i) => (
                              <th key={h} className={`px-4 py-2.5 text-xs font-medium text-content-secondary uppercase ${i === 6 ? 'text-right' : 'text-left'}`}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-surface-border">
                          {levelsMovements.movements.map((m: any, idx: number) => {
                            const runningNet = levelsMovements.movements
                              .slice(0, idx + 1)
                              .reduce((sum: number, mv: any) => sum + mv.volume, 0)
                            return (
                              <tr key={idx} className="hover:bg-surface-bg">
                                <td className="px-4 py-2.5 text-xs font-mono text-content-secondary">
                                  {m.timestamp ? new Date(m.timestamp).toLocaleTimeString() : '-'}
                                </td>
                                <td className="px-4 py-2.5">
                                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                    m.type === 'DELIVERY' ? 'bg-status-success/10 text-status-success' : 'bg-status-error/10 text-status-error'
                                  }`}>{m.type}</span>
                                </td>
                                <td className={`px-4 py-2.5 text-sm font-semibold ${m.volume >= 0 ? 'text-status-success' : 'text-status-error'}`}>
                                  {m.volume >= 0 ? '+' : ''}{m.volume.toLocaleString(undefined, { maximumFractionDigits: 1 })} L
                                </td>
                                <td className={`px-4 py-2.5 text-xs font-mono ${m.volume >= 0 ? 'text-status-success' : 'text-status-error'}`}>
                                  {ppl > 0 ? `K${(Math.abs(m.volume) * ppl).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                                </td>
                                <td className="px-4 py-2.5 text-xs font-mono text-content-secondary">{m.reference_id}</td>
                                <td className="px-4 py-2.5 text-xs text-content-secondary">{m.description}</td>
                                <td className={`px-4 py-2.5 text-sm font-semibold text-right ${runningNet >= 0 ? 'text-status-success' : 'text-status-error'}`}>
                                  {runningNet >= 0 ? '+' : ''}{runningNet.toLocaleString(undefined, { maximumFractionDigits: 1 })} L
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Tank Readings tab ── */}
            {activeTab === 'readings' && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-semibold text-content-primary">Daily Tank Readings</h2>
                  <button onClick={() => setShowForm(true)}
                    className="px-3 py-1.5 text-sm font-medium rounded bg-action-primary text-white">
                    + New Reading
                  </button>
                </div>
                <div className="space-y-3">
                  {readings.length === 0 ? (
                    <p className="text-center text-sm text-content-secondary py-8">No readings found for this tank</p>
                  ) : (
                    readings.map(reading => (
                      <div key={reading.reading_id} className="border border-surface-border rounded-lg p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <p className="font-semibold text-content-primary">{formatDateToDisplay(reading.date)}</p>
                            <p className="text-xs text-content-secondary">{reading.fuel_type}</p>
                          </div>
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(reading.validation_status)}`}>
                            {reading.validation_status}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-2">
                          <div>
                            <p className="text-xs text-content-secondary">Opening</p>
                            <p className="text-sm font-semibold text-content-primary">{(reading.opening_volume ?? 0).toLocaleString()} L</p>
                          </div>
                          <div>
                            <p className="text-xs text-content-secondary">Closing</p>
                            <p className="text-sm font-semibold text-content-primary">{(reading.closing_volume ?? 0).toLocaleString()} L</p>
                          </div>
                          <div>
                            <p className="text-xs text-content-secondary">Movement</p>
                            <p className="text-sm font-semibold text-action-primary">{(reading.tank_volume_movement ?? 0).toLocaleString()} L</p>
                          </div>
                          {reading.delivery_occurred && reading.delivery_volume && (
                            <div>
                              <p className="text-xs text-content-secondary">Delivered</p>
                              <p className="text-sm font-semibold text-status-success">{reading.delivery_volume.toLocaleString()} L</p>
                            </div>
                          )}
                        </div>
                        {reading.delivery_occurred && (
                          <div className="bg-status-success/5 border border-status-success/30 rounded p-2 mb-2 text-xs text-status-success">
                            Delivery: {reading.before_offload_volume?.toLocaleString()} L to {reading.after_offload_volume?.toLocaleString()} L
                            {reading.supplier && ` — ${reading.supplier}`}
                          </div>
                        )}
                        {(reading.validation_messages?.length ?? 0) > 0 && (
                          <div className="text-xs text-status-warning bg-status-warning/10 border border-status-warning/30 p-2 rounded">
                            {reading.validation_messages.map((msg, i) => <p key={i}>{msg}</p>)}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* ── Deliveries tab ── */}
            {activeTab === 'deliveries' && canManageDeliveries && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-semibold text-content-primary">Fuel Deliveries</h2>
                  <button onClick={() => setShowDeliveryForm(!showDeliveryForm)}
                    className="px-3 py-1.5 text-sm font-medium rounded bg-status-success text-white">
                    {showDeliveryForm ? 'Cancel' : '+ Record Delivery'}
                  </button>
                </div>

                {showDeliveryForm && (
                  <form onSubmit={addDeliveryToQueue} className="bg-surface-bg rounded-lg p-5 mb-5 border border-surface-border space-y-4">
                    <h3 className="text-sm font-semibold text-content-primary">Record Fuel Delivery</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-content-secondary mb-1">Date</label>
                        <input type="date" value={deliveryForm.date}
                          onChange={e => setDeliveryForm({ ...deliveryForm, date: e.target.value })}
                          className="w-full px-3 py-2 text-sm border border-surface-border rounded-lg focus:outline-none focus:ring-2 focus:ring-action-primary" required />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-content-secondary mb-1">Time</label>
                        <input type="time" value={deliveryForm.time}
                          onChange={e => setDeliveryForm({ ...deliveryForm, time: e.target.value })}
                          className="w-full px-3 py-2 text-sm border border-surface-border rounded-lg focus:outline-none focus:ring-2 focus:ring-action-primary" required />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-content-secondary mb-1">Dip Before Delivery (cm)</label>
                        <input type="number" step="0.1" min="0" value={deliveryForm.before_delivery_dip_cm}
                          onChange={e => setDeliveryForm({ ...deliveryForm, before_delivery_dip_cm: e.target.value })}
                          onBlur={e => fetchDipVolume(e.target.value, setBeforeVolPreview)}
                          className="w-full px-3 py-2 text-sm border border-surface-border rounded-lg focus:outline-none focus:ring-2 focus:ring-action-primary" required />
                        {beforeVolPreview !== null && (
                          <p className="text-xs text-content-secondary mt-1">= {beforeVolPreview.toFixed(0)} L</p>
                        )}
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-content-secondary mb-1">Dip After Delivery (cm)</label>
                        <input type="number" step="0.1" min="0" value={deliveryForm.after_delivery_dip_cm}
                          onChange={e => setDeliveryForm({ ...deliveryForm, after_delivery_dip_cm: e.target.value })}
                          onBlur={e => fetchDipVolume(e.target.value, setAfterVolPreview)}
                          className="w-full px-3 py-2 text-sm border border-surface-border rounded-lg focus:outline-none focus:ring-2 focus:ring-action-primary" required />
                        {afterVolPreview !== null && (
                          <p className="text-xs text-content-secondary mt-1">
                            = {afterVolPreview.toFixed(0)} L
                            {beforeVolPreview !== null && ` (delivery: ${(afterVolPreview - beforeVolPreview).toFixed(0)} L)`}
                          </p>
                        )}
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-content-secondary mb-1">Supplier</label>
                        <input type="text" value={deliveryForm.supplier}
                          onChange={e => setDeliveryForm({ ...deliveryForm, supplier: e.target.value })}
                          className="w-full px-3 py-2 text-sm border border-surface-border rounded-lg focus:outline-none focus:ring-2 focus:ring-action-primary" required />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-content-secondary mb-1">Invoice Number</label>
                        <input type="text" value={deliveryForm.invoice_number}
                          onChange={e => setDeliveryForm({ ...deliveryForm, invoice_number: e.target.value })}
                          className="w-full px-3 py-2 text-sm border border-surface-border rounded-lg focus:outline-none focus:ring-2 focus:ring-action-primary" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-content-secondary mb-1">Invoice Volume (L) — optional</label>
                        <input type="number" step="0.01" min="0" value={deliveryForm.invoice_volume_liters}
                          onChange={e => setDeliveryForm({ ...deliveryForm, invoice_volume_liters: e.target.value })}
                          className="w-full px-3 py-2 text-sm border border-surface-border rounded-lg focus:outline-none focus:ring-2 focus:ring-action-primary"
                          placeholder="Volume on supplier invoice" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-content-secondary mb-1">Flowmeter Reading (L) — optional</label>
                        <input type="number" step="0.01" min="0" value={deliveryForm.flowmeter_volume}
                          onChange={e => setDeliveryForm({ ...deliveryForm, flowmeter_volume: e.target.value })}
                          className="w-full px-3 py-2 text-sm border border-surface-border rounded-lg focus:outline-none focus:ring-2 focus:ring-action-primary"
                          placeholder="Gauge reading from delivery pipe" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-content-secondary mb-1">Temperature (C) — optional</label>
                        <input type="number" step="0.1" value={deliveryForm.temperature}
                          onChange={e => setDeliveryForm({ ...deliveryForm, temperature: e.target.value })}
                          className="w-full px-3 py-2 text-sm border border-surface-border rounded-lg focus:outline-none focus:ring-2 focus:ring-action-primary" />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-medium text-content-secondary mb-1">Notes</label>
                        <textarea value={deliveryForm.notes}
                          onChange={e => setDeliveryForm({ ...deliveryForm, notes: e.target.value })}
                          className="w-full px-3 py-2 text-sm border border-surface-border rounded-lg focus:outline-none focus:ring-2 focus:ring-action-primary" rows={2} />
                      </div>
                    </div>

                    {beforeVolPreview !== null && afterVolPreview !== null && (
                      <div className="bg-action-primary/10 border border-action-primary/30 rounded-lg p-3">
                        <p className="text-sm font-medium text-action-primary">
                          Calculated delivery: {calculateDeliveryPreview().toFixed(0)} L
                        </p>
                        {deliveryForm.invoice_volume_liters && (
                          <p className="text-xs text-action-primary mt-0.5">
                            Variance vs invoice: {(calculateDeliveryPreview() - parseFloat(deliveryForm.invoice_volume_liters)).toFixed(0)} L
                          </p>
                        )}
                      </div>
                    )}

                    <div className="flex gap-2">
                      <button type="submit" className="px-4 py-2 text-sm font-medium bg-status-success text-white rounded-lg">
                        + Add to Queue
                      </button>
                      <button type="button" onClick={() => setShowDeliveryForm(false)}
                        className="px-4 py-2 text-sm text-content-secondary border border-surface-border rounded-lg hover:bg-surface-bg">
                        Cancel
                      </button>
                    </div>
                  </form>
                )}

                {/* Delivery Queue */}
                {deliveryQueue.length > 0 && (
                  <div className="bg-surface-bg rounded-lg p-5 mb-5 border border-surface-border space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-content-primary">
                        Delivery Queue ({deliveryQueue.filter(d => d.status === 'pending').length} pending)
                      </h3>
                      {deliveryQueue.some(d => d.status === 'submitted') && (
                        <button onClick={clearCompletedDeliveries}
                          className="text-xs text-content-secondary hover:text-content-primary underline">
                          Clear completed
                        </button>
                      )}
                    </div>

                    {/* Timeline preview */}
                    {deliveryQueue.filter(d => d.status === 'pending').length >= 2 && (
                      <div className="p-3 bg-surface-card rounded-lg border border-surface-border">
                        <p className="text-xs font-medium text-content-secondary mb-2">Timeline Preview</p>
                        <div className="relative pl-5">
                          {deliveryQueue
                            .filter(d => d.status === 'pending')
                            .sort((a, b) => a.time.localeCompare(b.time))
                            .map((delivery, idx, arr) => {
                              const bVol = delivery.computed_before_vol
                              const aVol = delivery.computed_after_vol
                              const vol = bVol != null && aVol != null ? aVol - bVol : null
                              return (
                                <div key={delivery.id} className="relative pb-3">
                                  {idx < arr.length - 1 && (
                                    <div className="absolute left-[-14px] top-3 bottom-0 w-0.5 bg-action-primary/40" />
                                  )}
                                  <div className="absolute left-[-18px] top-1.5 w-2.5 h-2.5 rounded-full bg-action-primary border-2 border-surface-card" />
                                  <div className="flex items-baseline gap-2 flex-wrap">
                                    <span className="text-xs font-mono font-semibold text-action-primary">{delivery.time}</span>
                                    <span className="text-xs text-content-primary">
                                      {delivery.before_delivery_dip_cm} cm to {delivery.after_delivery_dip_cm} cm
                                      {bVol != null && aVol != null && (
                                        <span className="text-content-secondary ml-1">({bVol.toFixed(0)} L to {aVol.toFixed(0)} L)</span>
                                      )}
                                    </span>
                                    {vol != null && <span className="text-xs font-medium text-status-success">+{vol.toFixed(0)} L</span>}
                                  </div>
                                  {delivery.supplier && <p className="text-[10px] text-content-secondary">{delivery.supplier}</p>}
                                </div>
                              )
                            })}
                        </div>
                      </div>
                    )}

                    {/* Dip sequence warnings */}
                    {(() => {
                      const sorted = deliveryQueue.filter(d => d.status === 'pending').sort((a, b) => a.time.localeCompare(b.time))
                      const warnings: string[] = []
                      for (let i = 1; i < sorted.length; i++) {
                        const prevAfter = parseFloat(sorted[i - 1].after_delivery_dip_cm)
                        const currBefore = parseFloat(sorted[i].before_delivery_dip_cm)
                        if (!isNaN(prevAfter) && !isNaN(currBefore) && currBefore > prevAfter) {
                          warnings.push(`Delivery at ${sorted[i].time}: before dip (${currBefore} cm) > previous after dip (${prevAfter} cm)`)
                        }
                      }
                      if (!warnings.length) return null
                      return (
                        <div className="p-3 bg-status-warning/10 border border-status-warning/30 rounded-lg">
                          <p className="text-xs font-semibold text-status-warning mb-1">Dip sequence warnings:</p>
                          {warnings.map((w, i) => <p key={i} className="text-xs text-status-warning">{w}</p>)}
                        </div>
                      )
                    })()}

                    {/* Queue items */}
                    <div className="space-y-2">
                      {deliveryQueue.map(delivery => {
                        const vol = delivery.computed_before_vol != null && delivery.computed_after_vol != null
                          ? delivery.computed_after_vol - delivery.computed_before_vol : null
                        return (
                          <div key={delivery.id} className={`p-3 rounded-lg border ${
                            delivery.status === 'submitted' ? 'bg-status-success/5 border-status-success/40' :
                            delivery.status === 'error' ? 'bg-status-error/5 border-status-error/40' :
                            'bg-surface-card border-surface-border'
                          }`}>
                            <div className="flex items-start justify-between">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-0.5">
                                  <span className="text-sm font-semibold text-content-primary">
                                    {formatDateToDisplay(delivery.date)} at {delivery.time}
                                  </span>
                                  {delivery.status === 'submitted' && <span className="text-xs text-status-success font-medium">submitted</span>}
                                  {delivery.status === 'error' && <span className="text-xs text-status-error font-medium">error</span>}
                                </div>
                                <div className="flex gap-3 text-xs text-content-secondary flex-wrap">
                                  <span>{delivery.before_delivery_dip_cm} cm to {delivery.after_delivery_dip_cm} cm</span>
                                  {vol != null && <span className="font-medium text-status-success">+{vol.toFixed(0)} L</span>}
                                  {delivery.supplier && <span>{delivery.supplier}</span>}
                                </div>
                                {delivery.status === 'submitted' && delivery.result && (
                                  <div className="mt-1 text-xs">
                                    <span className="text-status-success">ID: {delivery.result.delivery_id}</span>
                                    {delivery.result.validation_status && (
                                      <span className={`ml-2 px-1.5 py-0.5 rounded ${getStatusColor(delivery.result.validation_status)}`}>
                                        {delivery.result.validation_status}
                                      </span>
                                    )}
                                  </div>
                                )}
                                {delivery.status === 'error' && delivery.error && (
                                  <p className="mt-1 text-xs text-status-error">{delivery.error}</p>
                                )}
                              </div>
                              {delivery.status === 'pending' && (
                                <button onClick={() => removeFromDeliveryQueue(delivery.id)}
                                  className="ml-2 text-content-secondary hover:text-status-error text-lg leading-none" title="Remove">
                                  &times;
                                </button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {deliveryQueue.some(d => d.status === 'pending' || d.status === 'error') && (
                      <button onClick={submitAllDeliveries} disabled={submittingQueue}
                        className="w-full py-2 text-sm font-medium bg-status-success text-white rounded-lg disabled:opacity-50">
                        {submittingQueue ? 'Submitting...' : `Submit All (${deliveryQueue.filter(d => d.status === 'pending' || d.status === 'error').length})`}
                      </button>
                    )}
                  </div>
                )}

                {/* Deliveries list */}
                <div className="space-y-3">
                  {deliveries.length === 0 ? (
                    <p className="text-center text-sm text-content-secondary py-8">No deliveries recorded for this tank</p>
                  ) : (
                    deliveries.map(delivery => (
                      <div key={delivery.delivery_id} className="border border-surface-border rounded-lg p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <p className="font-semibold text-content-primary">{formatDateToDisplay(delivery.date)} at {delivery.time}</p>
                            <p className="text-xs text-content-secondary">{delivery.supplier}</p>
                          </div>
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(delivery.validation_status)}`}>
                            {delivery.validation_status}
                          </span>
                        </div>

                        <div className="grid grid-cols-3 gap-3 mb-2">
                          <div>
                            <p className="text-xs text-content-secondary">Before</p>
                            <p className="text-sm font-semibold text-content-primary">{delivery.volume_before.toLocaleString()} L</p>
                            {delivery.before_delivery_dip_cm != null && (
                              <p className="text-xs text-content-secondary">{delivery.before_delivery_dip_cm} cm</p>
                            )}
                          </div>
                          <div>
                            <p className="text-xs text-content-secondary">After</p>
                            <p className="text-sm font-semibold text-content-primary">{delivery.volume_after.toLocaleString()} L</p>
                            {delivery.after_delivery_dip_cm != null && (
                              <p className="text-xs text-content-secondary">{delivery.after_delivery_dip_cm} cm</p>
                            )}
                          </div>
                          <div>
                            <p className="text-xs text-content-secondary">Delivered</p>
                            <p className="text-sm font-semibold text-status-success">{delivery.actual_volume_delivered.toLocaleString()} L</p>
                          </div>
                        </div>

                        {(delivery.invoice_volume_liters ?? delivery.expected_volume) && (
                          <div className="bg-action-primary/5 border border-action-primary/20 rounded p-2 mb-2 text-xs text-action-primary">
                            Invoice: {(delivery.invoice_volume_liters ?? delivery.expected_volume)?.toLocaleString()} L
                            {' | '}Variance: {delivery.delivery_variance?.toFixed(2)} L ({delivery.variance_percent?.toFixed(2)}%)
                          </div>
                        )}

                        {delivery.recon_status && (
                          <div className={`rounded-lg p-3 mb-2 border ${
                            delivery.recon_status === 'BALANCED' ? 'bg-status-success/5 border-status-success/30' :
                            delivery.recon_status === 'VARIANCE_MINOR' ? 'bg-status-warning/10 border-status-warning/30' :
                            'bg-status-error/5 border-status-error/30'
                          }`}>
                            <p className={`text-xs font-semibold mb-2 ${
                              delivery.recon_status === 'BALANCED' ? 'text-status-success' :
                              delivery.recon_status === 'VARIANCE_MINOR' ? 'text-status-warning' :
                              'text-status-error'
                            }`}>
                              Reconciliation: {delivery.recon_status.replace(/_/g, ' ')}
                            </p>
                            <div className="grid grid-cols-3 gap-2 text-xs mb-2">
                              <div>
                                <p className="text-content-secondary">OMC Invoice</p>
                                <p className="font-semibold text-content-primary">{(delivery.invoice_volume_liters ?? delivery.expected_volume)?.toLocaleString() ?? '—'} L</p>
                              </div>
                              <div>
                                <p className="text-content-secondary">Flowmeter</p>
                                <p className="font-semibold text-content-primary">{delivery.flowmeter_volume?.toLocaleString() ?? '—'} L</p>
                              </div>
                              <div>
                                <p className="text-content-secondary">Tank Dip</p>
                                <p className="font-semibold text-content-primary">{delivery.actual_volume_delivered.toLocaleString()} L</p>
                              </div>
                            </div>
                            <div className="text-xs space-y-0.5 text-content-secondary">
                              <p>Invoice vs Flowmeter: <span className="font-mono font-medium text-content-primary">{delivery.recon_invoice_vs_flowmeter?.toFixed(2)} L</span></p>
                              <p>Flowmeter vs Tank: <span className="font-mono font-medium text-content-primary">{delivery.recon_flowmeter_vs_tank?.toFixed(2)} L</span></p>
                              <p>Invoice vs Tank: <span className="font-mono font-medium text-content-primary">{delivery.recon_invoice_vs_tank?.toFixed(2)} L</span></p>
                            </div>
                            {delivery.recon_outlier && delivery.recon_outlier !== 'MULTIPLE' && (
                              <p className="text-xs mt-1.5 font-medium text-content-primary">
                                Likely issue: <span className="font-bold">{delivery.recon_outlier}</span>
                                {delivery.recon_outlier === 'TANK' && ' (dip error or leak)'}
                                {delivery.recon_outlier === 'FLOWMETER' && ' (gauge malfunction)'}
                                {delivery.recon_outlier === 'INVOICE' && ' (OMC short-shipped)'}
                              </p>
                            )}
                            {delivery.recon_outlier === 'MULTIPLE' && (
                              <p className="text-xs mt-1.5 font-medium text-content-primary">Multiple sources differ — investigation required</p>
                            )}
                          </div>
                        )}

                        <p className="text-xs text-content-secondary">{delivery.validation_message}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* ── Summary tab ── */}
            {activeTab === 'summary' && (
              <div>
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-base font-semibold text-content-primary">Tank Movement Summary</h2>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-content-secondary">Date:</label>
                    <input type="date" value={selectedDate}
                      onChange={e => setSelectedDate(e.target.value)}
                      className="px-3 py-1.5 text-sm border border-surface-border rounded-lg focus:outline-none focus:ring-2 focus:ring-action-primary" />
                  </div>
                </div>

                {summaryLoading && <p className="text-sm text-content-secondary text-center py-8">Loading summary...</p>}

                {!summaryLoading && (
                  <div className="space-y-5">
                    {summaryMovements && (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="bg-status-success/5 border border-status-success/30 rounded-lg p-3">
                          <p className="text-xs font-medium text-status-success">Total Delivered</p>
                          <p className="text-xl font-bold text-status-success mt-0.5">
                            {summaryMovements.summary.total_delivered.toLocaleString(undefined, { maximumFractionDigits: 0 })} L
                          </p>
                        </div>
                        <div className="bg-status-error/5 border border-status-error/30 rounded-lg p-3">
                          <p className="text-xs font-medium text-status-error">Total Sold</p>
                          <p className="text-xl font-bold text-status-error mt-0.5">
                            {summaryMovements.summary.total_sold.toLocaleString(undefined, { maximumFractionDigits: 0 })} L
                          </p>
                        </div>
                        <div className={`rounded-lg p-3 border ${
                          summaryMovements.summary.net_change >= 0
                            ? 'bg-status-success/5 border-status-success/30'
                            : 'bg-status-error/5 border-status-error/30'
                        }`}>
                          <p className={`text-xs font-medium ${summaryMovements.summary.net_change >= 0 ? 'text-status-success' : 'text-status-error'}`}>Net Change</p>
                          <p className={`text-xl font-bold mt-0.5 ${summaryMovements.summary.net_change >= 0 ? 'text-status-success' : 'text-status-error'}`}>
                            {summaryMovements.summary.net_change >= 0 ? '+' : ''}{summaryMovements.summary.net_change.toLocaleString(undefined, { maximumFractionDigits: 0 })} L
                          </p>
                        </div>
                        <div className="bg-surface-bg border border-surface-border rounded-lg p-3">
                          <p className="text-xs font-medium text-content-secondary">Movements</p>
                          <p className="text-xl font-bold text-content-primary mt-0.5">{summaryMovements.summary.movement_count}</p>
                        </div>
                      </div>
                    )}

                    {/* Reconciliation */}
                    {(() => {
                      const dayReadings = readings.filter(r => r.date === selectedDate)
                      const daySales = summarySales.filter((s: any) => s.fuel_type === fuelType)
                      const totalNozzleSales = daySales.reduce((sum: number, s: any) => sum + (s.average_volume || 0), 0)

                      if (dayReadings.length > 0 && summaryMovements) {
                        const reading = dayReadings[0]
                        const tankMovement = reading.tank_volume_movement
                        const variance = totalNozzleSales > 0 ? Math.abs(totalNozzleSales - tankMovement) : 0
                        const variancePercent = tankMovement > 0 ? (variance / tankMovement) * 100 : 0
                        const status = variancePercent <= 0.5 ? 'PASS' : variancePercent <= 1.0 ? 'WARNING' : 'FAIL'

                        return (
                          <div className={`rounded-lg p-4 border ${
                            status === 'PASS' ? 'bg-status-success/5 border-status-success/30' :
                            status === 'WARNING' ? 'bg-status-warning/10 border-status-warning/30' :
                            'bg-status-error/5 border-status-error/30'
                          }`}>
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-sm font-semibold text-content-primary">Reconciliation</p>
                                <p className="text-xs text-content-secondary mt-1">
                                  Tank movement: {tankMovement.toLocaleString()} L
                                  {' | '}Nozzle sales: {totalNozzleSales.toLocaleString(undefined, { maximumFractionDigits: 0 })} L
                                  {' | '}Variance: {variance.toFixed(1)} L ({variancePercent.toFixed(2)}%)
                                </p>
                              </div>
                              <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${getStatusColor(status)}`}>{status}</span>
                            </div>
                          </div>
                        )
                      }

                      return (
                        <div className="rounded-lg p-4 border bg-surface-bg border-surface-border">
                          <p className="text-sm text-content-secondary">
                            No tank readings for {selectedDate} — reconciliation unavailable.
                            {totalNozzleSales > 0 && ` (${daySales.length} sales totaling ${totalNozzleSales.toLocaleString(undefined, { maximumFractionDigits: 0 })} L recorded)`}
                          </p>
                        </div>
                      )
                    })()}

                    {/* Movement Timeline */}
                    <div>
                      <h3 className="text-sm font-semibold text-content-primary mb-3">Stock Movement Timeline</h3>
                      {summaryMovements && summaryMovements.movements?.length > 0 ? (
                        <div className="overflow-x-auto rounded-lg border border-surface-border">
                          <table className="min-w-full divide-y divide-surface-border text-sm">
                            <thead className="bg-surface-bg">
                              <tr>
                                {['Time', 'Type', 'Volume', 'Reference', 'Description', 'Running Net'].map((h, i) => (
                                  <th key={h} className={`px-4 py-2.5 text-xs font-medium text-content-secondary uppercase ${i === 5 ? 'text-right' : 'text-left'}`}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-surface-border">
                              {summaryMovements.movements.map((m: any, idx: number) => {
                                const runningNet = summaryMovements.movements
                                  .slice(0, idx + 1)
                                  .reduce((sum: number, mv: any) => sum + mv.volume, 0)
                                return (
                                  <tr key={idx} className="hover:bg-surface-bg">
                                    <td className="px-4 py-2.5 text-xs font-mono text-content-secondary">
                                      {m.timestamp ? new Date(m.timestamp).toLocaleTimeString() : '-'}
                                    </td>
                                    <td className="px-4 py-2.5">
                                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                        m.type === 'DELIVERY' ? 'bg-status-success/10 text-status-success' : 'bg-status-error/10 text-status-error'
                                      }`}>{m.type}</span>
                                    </td>
                                    <td className={`px-4 py-2.5 text-sm font-semibold ${m.volume >= 0 ? 'text-status-success' : 'text-status-error'}`}>
                                      {m.volume >= 0 ? '+' : ''}{m.volume.toLocaleString(undefined, { maximumFractionDigits: 1 })} L
                                    </td>
                                    <td className="px-4 py-2.5 text-xs font-mono text-content-secondary">{m.reference_id}</td>
                                    <td className="px-4 py-2.5 text-xs text-content-secondary">{m.description}</td>
                                    <td className={`px-4 py-2.5 text-sm font-semibold text-right ${runningNet >= 0 ? 'text-status-success' : 'text-status-error'}`}>
                                      {runningNet >= 0 ? '+' : ''}{runningNet.toLocaleString(undefined, { maximumFractionDigits: 1 })} L
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="text-sm text-content-secondary text-center py-6">No stock movements for {selectedDate}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      </div>

      {/* Reading form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-surface-card rounded-xl border border-surface-border w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border">
              <h3 className="text-base font-semibold text-content-primary">Submit Tank Reading</h3>
              <button onClick={() => setShowForm(false)} className="text-content-secondary hover:text-content-primary text-2xl leading-none">&times;</button>
            </div>
            <form onSubmit={submitReading} className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-content-secondary mb-1">Date</label>
                  <input type="date" value={readingForm.date}
                    onChange={e => setReadingForm({ ...readingForm, date: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-surface-border rounded-lg focus:outline-none focus:ring-2 focus:ring-action-primary" required />
                </div>
                <div>
                  <label className="block text-xs font-medium text-content-secondary mb-1">Opening Volume (L)</label>
                  <input type="number" step="0.01" value={readingForm.opening_volume}
                    onChange={e => setReadingForm({ ...readingForm, opening_volume: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-surface-border rounded-lg focus:outline-none focus:ring-2 focus:ring-action-primary"
                    placeholder="e.g. 26887.21" required />
                </div>
                <div>
                  <label className="block text-xs font-medium text-content-secondary mb-1">Closing Volume (L)</label>
                  <input type="number" step="0.01" value={readingForm.closing_volume}
                    onChange={e => setReadingForm({ ...readingForm, closing_volume: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-surface-border rounded-lg focus:outline-none focus:ring-2 focus:ring-action-primary"
                    placeholder="e.g. 25117.64" required />
                </div>
              </div>

              {/* Delivery reference notice */}
              {(() => {
                const todayDeliveries = deliveries.filter(d => d.date === readingForm.date)
                const queuedToday = deliveryQueue.filter(d => d.date === readingForm.date && d.status === 'pending')
                const total = todayDeliveries.length + queuedToday.length
                if (!total) return null
                return (
                  <div className="bg-action-primary/10 border border-action-primary/30 rounded-lg p-3 text-xs text-action-primary">
                    {total} delivery(ies) recorded for this tank on {readingForm.date} — automatically linked by the system.
                  </div>
                )
              })()}

              <div>
                <label className="block text-xs font-medium text-content-secondary mb-1">Notes (optional)</label>
                <textarea value={readingForm.notes}
                  onChange={e => setReadingForm({ ...readingForm, notes: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-surface-border rounded-lg focus:outline-none focus:ring-2 focus:ring-action-primary" rows={2} />
              </div>

              {readingForm.opening_volume && readingForm.closing_volume && (
                <div className="bg-status-success/10 border border-status-success/30 rounded-lg p-3">
                  <p className="text-sm font-medium text-status-success">
                    Movement: {calculateMovementPreview().toFixed(2)} L
                  </p>
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={loading}
                  className="px-4 py-2 text-sm font-medium bg-action-primary text-white rounded-lg disabled:opacity-50">
                  {loading ? 'Submitting...' : 'Submit Reading'}
                </button>
                <button type="button" onClick={() => setShowForm(false)}
                  className="px-4 py-2 text-sm text-content-secondary border border-surface-border rounded-lg hover:bg-surface-bg">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
