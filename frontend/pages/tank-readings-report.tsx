import { authFetch, BASE, getHeaders } from '../lib/api'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import ExportButtons from '../components/ExportButtons'
import { ExportConfig } from '../lib/exportUtils'
import { useTanks, tankLabel } from '../hooks/useTanks'

interface NozzleReading {
  nozzle_id: string
  attendant: string
  electronic_opening: number
  electronic_closing: number
  electronic_movement: number
  mechanical_opening: number
  mechanical_closing: number
  mechanical_movement: number
}

interface TankReading {
  reading_id: string
  tank_id: string
  fuel_type?: string
  date: string
  shift_type: string
  opening_dip_cm: number | null
  closing_dip_cm: number | null
  opening_volume: number | null
  closing_volume: number | null
  tank_volume_movement: number
  total_electronic_dispensed: number
  electronic_vs_tank_variance: number
  electronic_vs_tank_percent: number
  expected_amount_electronic: number
  price_per_liter: number
  validation_status: string
  nozzle_readings: NozzleReading[]
  deliveries?: any[]
  delivery_id?: string | null
  delivery_timeline?: any
  recorded_by?: string
  created_at?: string
  notes?: string
}

interface LedgerRecord {
  reading_id: string
  tank_id: string
  fuel_type?: string
  date: string
  shift_type: string
  opening_dip_cm: number | null
  closing_dip_cm: number | null
  opening_volume: number | null
  closing_volume: number | null
  tank_volume_movement: number
  validation_status: string
  deliveries?: any[]
  delivery_id?: string | null
  recorded_by?: string
}

function statusBadge(status: string) {
  const cls =
    status === 'PASS' ? 'bg-status-success-light text-status-success border-status-success' :
    status === 'WARNING' ? 'bg-status-pending-light text-status-warning border-status-warning' :
    status === 'FAIL' ? 'bg-status-error-light text-status-error border-status-error' :
    'bg-surface-bg text-content-secondary border-surface-border'
  return (
    <span className={`px-2 py-0.5 text-xs font-semibold rounded-full border ${cls}`}>
      {status || 'PASS'}
    </span>
  )
}

function fmtVol(v: number | null | undefined) {
  if (v == null) return '-'
  return v.toLocaleString('en-ZM', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' L'
}

function fmtCm(v: number | null | undefined) {
  if (v == null) return '-'
  return v.toFixed(1) + ' cm'
}

function fmtMove(v: number) {
  if (!v && v !== 0) return '-'
  const cls = v >= 0 ? 'text-status-success font-semibold' : 'text-status-error font-semibold'
  return <span className={cls}>{v >= 0 ? '+' : ''}{v.toFixed(1)} L</span>
}

function deliveryBadge(deliveries: any[] | undefined, delivery_id: string | null | undefined) {
  if (deliveries && deliveries.length > 0) {
    const d = deliveries[0]
    return (
      <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-action-primary-light text-action-primary border border-action-primary">
        {d.supplier || 'Delivery'} {d.volume_delivered ? `${Math.round(d.volume_delivered)} L` : ''}
      </span>
    )
  }
  if (delivery_id) {
    return (
      <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-action-primary-light text-action-primary border border-action-primary">
        Delivery linked
      </span>
    )
  }
  return <span className="text-content-secondary text-sm">-</span>
}

export default function TankReadingsReport() {
  const router = useRouter()
  const { tanks: availableTanks } = useTanks()
  const [activeTab, setActiveTab] = useState<'readings' | 'ledger'>('readings')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [selectedTank, setSelectedTank] = useState('')
  const [readings, setReadings] = useState<TankReading[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectedReading, setSelectedReading] = useState<TankReading | null>(null)
  const [user, setUser] = useState<any>(null)

  // Dip ledger state
  const [ledger, setLedger] = useState<LedgerRecord[]>([])
  const [ledgerLoading, setLedgerLoading] = useState(false)
  const [ledgerTankFilter, setLedgerTankFilter] = useState('ALL')
  const [ledgerStatusFilter, setLedgerStatusFilter] = useState('ALL')

  useEffect(() => {
    const u = localStorage.getItem('user')
    if (u) setUser(JSON.parse(u))
    if (router.query.tab === 'ledger') setActiveTab('ledger')
  }, [router.query.tab])

  useEffect(() => {
    const today = new Date()
    const ago = new Date()
    ago.setDate(today.getDate() - 7)
    setEndDate(today.toISOString().split('T')[0])
    setStartDate(ago.toISOString().split('T')[0])
  }, [])

  useEffect(() => {
    if (!selectedTank && availableTanks.length > 0) {
      setSelectedTank(availableTanks[0].tank_id)
    }
  }, [availableTanks, selectedTank])

  useEffect(() => {
    if (startDate && endDate && selectedTank) loadReadings()
  }, [startDate, endDate, selectedTank])

  useEffect(() => {
    if (activeTab === 'ledger' && startDate && endDate) loadLedger()
  }, [activeTab, startDate, endDate])

  const loadReadings = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await authFetch(
        `${BASE}/tank-readings/readings/${selectedTank}?start_date=${startDate}&end_date=${endDate}`,
        { headers: getHeaders() }
      )
      if (!res.ok) throw new Error('Failed to load readings')
      setReadings(await res.json())
    } catch (err: any) {
      setError(err.message || 'Error loading readings')
    } finally {
      setLoading(false)
    }
  }

  const loadLedger = async () => {
    setLedgerLoading(true)
    try {
      const res = await authFetch(
        `${BASE}/tank-readings/dip-ledger?start_date=${startDate}&end_date=${endDate}`,
        { headers: getHeaders() }
      )
      if (res.ok) setLedger(await res.json())
    } catch {
      // silent — empty ledger shown
    } finally {
      setLedgerLoading(false)
    }
  }

  const filteredLedger = ledger.filter(r => {
    if (ledgerTankFilter !== 'ALL' && r.tank_id !== ledgerTankFilter) return false
    if (ledgerStatusFilter !== 'ALL' && r.validation_status !== ledgerStatusFilter) return false
    return true
  })

  const ledgerStats = {
    total: ledger.length,
    complete: ledger.filter(r => r.opening_dip_cm != null && r.closing_dip_cm != null).length,
    partial: ledger.filter(r => (r.opening_dip_cm != null) !== (r.closing_dip_cm != null)).length,
    missing: ledger.filter(r => r.opening_dip_cm == null && r.closing_dip_cm == null).length,
  }

  const getExportConfig = useCallback((): ExportConfig | null => {
    if (activeTab === 'readings') {
      if (!readings.length) return null
      return {
        title: 'Tank Readings',
        filename: `tank_readings_${selectedTank}_${startDate}_${endDate}`,
        columns: [
          { header: 'Date', key: 'date' },
          { header: 'Shift', key: 'shift_type' },
          { header: 'Opening cm', key: 'opening_dip_cm', format: 'number' },
          { header: 'Opening L', key: 'opening_volume', format: 'number' },
          { header: 'Closing cm', key: 'closing_dip_cm', format: 'number' },
          { header: 'Closing L', key: 'closing_volume', format: 'number' },
          { header: 'Movement L', key: 'tank_volume_movement', format: 'number' },
          { header: 'Status', key: 'validation_status' },
        ],
        data: readings,
      }
    }
    if (!filteredLedger.length) return null
    return {
      title: 'Dip Ledger',
      filename: `dip_ledger_${startDate}_${endDate}`,
      columns: [
        { header: 'Date', key: 'date' },
        { header: 'Shift', key: 'shift_type' },
        { header: 'Tank', key: 'tank_id' },
        { header: 'Fuel', key: 'fuel_type' },
        { header: 'Opening cm', key: 'opening_dip_cm', format: 'number' },
        { header: 'Opening L', key: 'opening_volume', format: 'number' },
        { header: 'Closing cm', key: 'closing_dip_cm', format: 'number' },
        { header: 'Closing L', key: 'closing_volume', format: 'number' },
        { header: 'Movement L', key: 'tank_volume_movement', format: 'number' },
        { header: 'Status', key: 'validation_status' },
      ],
      data: filteredLedger,
    }
  }, [activeTab, readings, filteredLedger, selectedTank, startDate, endDate])

  const canSeeLedger = user?.role && ['supervisor', 'manager', 'owner'].includes(user.role)

  return (
    <div className="min-h-screen bg-surface-bg p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-content-primary">Tank Readings</h1>
            <p className="text-sm text-content-secondary mt-1">
              Dip readings history and multi-tank ledger
            </p>
          </div>
          <ExportButtons getConfig={getExportConfig} />
        </div>

        {/* Related pages */}
        <div className="mb-6 flex flex-wrap gap-2">
          <span className="text-sm text-content-secondary self-center">Related:</span>
          <Link href="/tank-dips" className="text-sm px-3 py-1.5 bg-surface-card border border-surface-border rounded-lg hover:border-action-primary hover:text-action-primary transition-colors">
            Enter Tank Dips
          </Link>
          <Link href="/three-way-reconciliation" className="text-sm px-3 py-1.5 bg-surface-card border border-surface-border rounded-lg hover:border-action-primary hover:text-action-primary transition-colors">
            Three-Way Reconciliation
          </Link>
          <Link href="/shift-reconciliation" className="text-sm px-3 py-1.5 bg-surface-card border border-surface-border rounded-lg hover:border-action-primary hover:text-action-primary transition-colors">
            Shift Reconciliation
          </Link>
        </div>

        {/* Date range (shared across tabs) */}
        <div className="bg-surface-card border border-surface-border rounded-xl p-4 mb-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-content-secondary mb-1">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full px-3 py-2 bg-surface-bg border border-surface-border rounded-lg text-sm text-content-primary focus:outline-none focus:ring-1 focus:ring-action-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-content-secondary mb-1">End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="w-full px-3 py-2 bg-surface-bg border border-surface-border rounded-lg text-sm text-content-primary focus:outline-none focus:ring-1 focus:ring-action-primary"
              />
            </div>
            {activeTab === 'readings' && (
              <div>
                <label className="block text-xs font-medium text-content-secondary mb-1">Tank</label>
                <select
                  value={selectedTank}
                  onChange={e => setSelectedTank(e.target.value)}
                  className="w-full px-3 py-2 bg-surface-bg border border-surface-border rounded-lg text-sm text-content-primary focus:outline-none focus:ring-1 focus:ring-action-primary"
                >
                  {availableTanks.map(t => (
                    <option key={t.tank_id} value={t.tank_id}>{tankLabel(t)}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex items-end">
              <button
                onClick={activeTab === 'readings' ? loadReadings : loadLedger}
                disabled={loading || ledgerLoading}
                className="w-full px-4 py-2 bg-action-primary text-white rounded-lg text-sm font-medium hover:bg-action-primary-hover disabled:opacity-50 transition-colors"
              >
                {(loading || ledgerLoading) ? 'Loading...' : 'Refresh'}
              </button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-6 border-b border-surface-border">
          <nav className="-mb-px flex gap-6">
            <button
              onClick={() => setActiveTab('readings')}
              className={`py-3 px-1 border-b-2 text-sm font-medium transition-colors ${
                activeTab === 'readings'
                  ? 'border-action-primary text-action-primary'
                  : 'border-transparent text-content-secondary hover:text-content-primary'
              }`}
            >
              Tank Readings
            </button>
            {canSeeLedger && (
              <button
                onClick={() => setActiveTab('ledger')}
                className={`py-3 px-1 border-b-2 text-sm font-medium transition-colors ${
                  activeTab === 'ledger'
                    ? 'border-action-primary text-action-primary'
                    : 'border-transparent text-content-secondary hover:text-content-primary'
                }`}
              >
                Dip Ledger
              </button>
            )}
          </nav>
        </div>

        {/* ── TAB: TANK READINGS ── */}
        {activeTab === 'readings' && (
          <>
            {error && (
              <div className="bg-status-error-light border border-status-error rounded-lg p-4 mb-4 text-sm text-status-error">
                {error}
              </div>
            )}

            {/* Summary cards */}
            {readings.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                <div className="bg-surface-card border border-surface-border rounded-xl p-4">
                  <div className="text-xs text-content-secondary mb-1">Readings</div>
                  <div className="text-2xl font-bold text-content-primary">{readings.length}</div>
                </div>
                <div className="bg-surface-card border border-surface-border rounded-xl p-4">
                  <div className="text-xs text-content-secondary mb-1">Total Dispensed</div>
                  <div className="text-lg font-bold text-content-primary">
                    {readings.reduce((s, r) => s + (r.tank_volume_movement || 0), 0).toLocaleString('en-ZM', { maximumFractionDigits: 0 })} L
                  </div>
                </div>
                <div className="bg-surface-card border border-surface-border rounded-xl p-4">
                  <div className="text-xs text-content-secondary mb-1">With Delivery</div>
                  <div className="text-2xl font-bold text-content-primary">
                    {readings.filter(r => (r.deliveries && r.deliveries.length > 0) || r.delivery_id).length}
                  </div>
                </div>
                <div className="bg-surface-card border border-surface-border rounded-xl p-4">
                  <div className="text-xs text-content-secondary mb-1">Issues</div>
                  <div className="text-2xl font-bold text-status-error">
                    {readings.filter(r => r.validation_status === 'FAIL' || r.validation_status === 'WARNING').length}
                  </div>
                </div>
              </div>
            )}

            {loading ? (
              <div className="bg-surface-card border border-surface-border rounded-xl p-8 text-center text-content-secondary text-sm">
                Loading readings...
              </div>
            ) : readings.length === 0 ? (
              <div className="bg-surface-card border border-surface-border rounded-xl p-8 text-center text-content-secondary text-sm">
                No readings found for the selected period.
              </div>
            ) : (
              <div className="bg-surface-card border border-surface-border rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-surface-border">
                    <thead className="bg-surface-bg">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase">Date / Shift</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase">Opening</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase">Closing</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase">Movement</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase">Delivery</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-border">
                      {readings.map(r => (
                        <tr key={r.reading_id} className="hover:bg-surface-bg transition-colors">
                          <td className="px-4 py-3">
                            <div className="text-sm font-medium text-content-primary">{r.date}</div>
                            <div className="text-xs text-content-secondary">{r.shift_type}</div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-sm text-content-primary font-mono">{fmtCm(r.opening_dip_cm)}</div>
                            <div className="text-xs text-content-secondary">{fmtVol(r.opening_volume)}</div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-sm text-content-primary font-mono">{fmtCm(r.closing_dip_cm)}</div>
                            <div className="text-xs text-content-secondary">{fmtVol(r.closing_volume)}</div>
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {fmtMove(r.tank_volume_movement)}
                          </td>
                          <td className="px-4 py-3">
                            {deliveryBadge(r.deliveries, r.delivery_id)}
                          </td>
                          <td className="px-4 py-3">
                            {statusBadge(r.validation_status)}
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => setSelectedReading(r)}
                              className="text-sm text-action-primary hover:underline font-medium"
                            >
                              View
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── TAB: DIP LEDGER ── */}
        {activeTab === 'ledger' && canSeeLedger && (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              <div className="bg-surface-card border border-surface-border rounded-xl p-4">
                <div className="text-xs text-content-secondary mb-1">Total Records</div>
                <div className="text-2xl font-bold text-content-primary">{ledgerStats.total}</div>
              </div>
              <div className="bg-surface-card border-l-4 border-status-success rounded-xl p-4">
                <div className="text-xs text-content-secondary mb-1">Both Dips Entered</div>
                <div className="text-2xl font-bold text-status-success">{ledgerStats.complete}</div>
              </div>
              <div className="bg-surface-card border-l-4 border-status-warning rounded-xl p-4">
                <div className="text-xs text-content-secondary mb-1">Partial (1 of 2)</div>
                <div className="text-2xl font-bold text-status-warning">{ledgerStats.partial}</div>
              </div>
              <div className="bg-surface-card border-l-4 border-status-error rounded-xl p-4">
                <div className="text-xs text-content-secondary mb-1">Missing</div>
                <div className="text-2xl font-bold text-status-error">{ledgerStats.missing}</div>
              </div>
            </div>

            {/* Filters */}
            <div className="bg-surface-card border border-surface-border rounded-xl p-4 mb-4 flex flex-wrap gap-4">
              <div>
                <label className="block text-xs font-medium text-content-secondary mb-1">Tank</label>
                <select
                  value={ledgerTankFilter}
                  onChange={e => setLedgerTankFilter(e.target.value)}
                  className="px-3 py-2 bg-surface-bg border border-surface-border rounded-lg text-sm text-content-primary focus:outline-none focus:ring-1 focus:ring-action-primary"
                >
                  <option value="ALL">All Tanks</option>
                  {availableTanks.map(t => (
                    <option key={t.tank_id} value={t.tank_id}>{tankLabel(t)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-content-secondary mb-1">Status</label>
                <select
                  value={ledgerStatusFilter}
                  onChange={e => setLedgerStatusFilter(e.target.value)}
                  className="px-3 py-2 bg-surface-bg border border-surface-border rounded-lg text-sm text-content-primary focus:outline-none focus:ring-1 focus:ring-action-primary"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="PASS">Pass</option>
                  <option value="WARNING">Warning</option>
                  <option value="FAIL">Fail</option>
                </select>
              </div>
            </div>

            {ledgerLoading ? (
              <div className="bg-surface-card border border-surface-border rounded-xl p-8 text-center text-content-secondary text-sm">
                Loading ledger...
              </div>
            ) : filteredLedger.length === 0 ? (
              <div className="bg-surface-card border border-surface-border rounded-xl p-8 text-center text-content-secondary text-sm">
                No dip records found for this period.
              </div>
            ) : (
              <div className="bg-surface-card border border-surface-border rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-surface-border">
                    <thead className="bg-surface-bg">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase">Date / Shift</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase">Tank</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase">Opening</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase">Closing</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase">Movement</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase">Delivery</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-border">
                      {filteredLedger.map(r => {
                        const hasBoth = r.opening_dip_cm != null && r.closing_dip_cm != null
                        const hasNeither = r.opening_dip_cm == null && r.closing_dip_cm == null
                        const rowCls = hasBoth ? '' : hasNeither ? 'bg-status-error-light/30' : 'bg-status-pending-light/30'
                        return (
                          <tr key={r.reading_id} className={`hover:bg-surface-bg transition-colors ${rowCls}`}>
                            <td className="px-4 py-3">
                              <div className="text-sm font-medium text-content-primary">{r.date}</div>
                              <div className="text-xs text-content-secondary">{r.shift_type}</div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="text-sm font-medium text-content-primary">{r.tank_id}</div>
                              <div className="text-xs text-content-secondary">{r.fuel_type || ''}</div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="text-sm text-content-primary font-mono">{fmtCm(r.opening_dip_cm)}</div>
                              <div className="text-xs text-content-secondary">{fmtVol(r.opening_volume)}</div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="text-sm text-content-primary font-mono">{fmtCm(r.closing_dip_cm)}</div>
                              <div className="text-xs text-content-secondary">{fmtVol(r.closing_volume)}</div>
                            </td>
                            <td className="px-4 py-3 text-sm">
                              {hasBoth ? fmtMove(r.tank_volume_movement) : <span className="text-content-secondary">-</span>}
                            </td>
                            <td className="px-4 py-3">
                              {deliveryBadge(r.deliveries, r.delivery_id)}
                            </td>
                            <td className="px-4 py-3">
                              {statusBadge(r.validation_status)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── READING DETAIL MODAL ── */}
        {selectedReading && (
          <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
            onClick={() => setSelectedReading(null)}
          >
            <div
              className="bg-surface-card rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-6">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h2 className="text-xl font-bold text-content-primary">Reading Details</h2>
                    <p className="text-sm text-content-secondary mt-0.5">
                      {selectedReading.date} - {selectedReading.shift_type} Shift
                      {selectedReading.fuel_type && ` - ${selectedReading.fuel_type}`}
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedReading(null)}
                    className="text-content-secondary hover:text-content-primary text-2xl leading-none"
                  >
                    &times;
                  </button>
                </div>

                {/* Dip Readings */}
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-content-secondary uppercase tracking-wide mb-3">
                    Tank Dip Readings
                  </h3>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-surface-bg rounded-lg p-4 text-center">
                      <div className="text-xs text-content-secondary mb-1">Opening</div>
                      <div className="text-xl font-bold text-content-primary font-mono">
                        {fmtCm(selectedReading.opening_dip_cm)}
                      </div>
                      <div className="text-sm text-content-secondary">{fmtVol(selectedReading.opening_volume)}</div>
                    </div>
                    <div className="bg-surface-bg rounded-lg p-4 text-center">
                      <div className="text-xs text-content-secondary mb-1">Closing</div>
                      <div className="text-xl font-bold text-content-primary font-mono">
                        {fmtCm(selectedReading.closing_dip_cm)}
                      </div>
                      <div className="text-sm text-content-secondary">{fmtVol(selectedReading.closing_volume)}</div>
                    </div>
                    <div className="bg-surface-bg rounded-lg p-4 text-center">
                      <div className="text-xs text-content-secondary mb-1">Movement</div>
                      <div className="text-xl font-bold">
                        {fmtMove(selectedReading.tank_volume_movement)}
                      </div>
                      <div className="mt-1">{statusBadge(selectedReading.validation_status)}</div>
                    </div>
                  </div>
                </div>

                {/* Delivery */}
                {((selectedReading.deliveries && selectedReading.deliveries.length > 0) || selectedReading.delivery_id) && (
                  <div className="mb-6">
                    <h3 className="text-sm font-semibold text-content-secondary uppercase tracking-wide mb-3">
                      Delivery
                    </h3>
                    <div className="bg-action-primary-light border border-action-primary rounded-lg p-4 space-y-2">
                      {(selectedReading.deliveries && selectedReading.deliveries.length > 0 ? selectedReading.deliveries : [{ delivery_id: selectedReading.delivery_id }]).map((d: any, i: number) => (
                        <div key={i} className="flex flex-wrap gap-4 text-sm text-action-primary">
                          {d.supplier && <span><strong>Supplier:</strong> {d.supplier}</span>}
                          {d.volume_delivered && <span><strong>Volume:</strong> {Math.round(d.volume_delivered)} L</span>}
                          {d.delivery_time && <span><strong>Time:</strong> {d.delivery_time}</span>}
                          {d.invoice_number && <span><strong>Invoice:</strong> {d.invoice_number}</span>}
                          {d.delivery_id && <span className="text-xs opacity-60">{d.delivery_id}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Delivery timeline (from comprehensive readings) */}
                {selectedReading.delivery_timeline?.has_deliveries && (
                  <div className="mb-6">
                    <h3 className="text-sm font-semibold text-content-secondary uppercase tracking-wide mb-3">
                      Delivery Timeline
                    </h3>
                    {selectedReading.delivery_timeline.timeline?.filter((e: any) => e.event_type === 'DELIVERY').map((event: any, idx: number) => (
                      <div key={idx} className="flex items-center gap-3 mb-2 p-2 bg-action-primary-light rounded border border-action-primary text-sm text-action-primary">
                        <span className="w-6 h-6 rounded-full bg-action-primary text-white flex items-center justify-center text-xs font-bold">
                          {idx + 1}
                        </span>
                        +{event.change?.toLocaleString('en-ZM', { maximumFractionDigits: 0 })} L
                        {event.supplier && <> from <strong>{event.supplier}</strong></>}
                        {event.time && <> at {event.time}</>}
                      </div>
                    ))}
                  </div>
                )}

                {/* Nozzle Readings */}
                {selectedReading.nozzle_readings && selectedReading.nozzle_readings.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-sm font-semibold text-content-secondary uppercase tracking-wide mb-3">
                      Nozzle Readings
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {selectedReading.nozzle_readings.map(nozzle => (
                        <div key={nozzle.nozzle_id} className="bg-surface-bg rounded-lg p-3 border border-surface-border">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-sm font-bold text-content-primary">{nozzle.nozzle_id}</span>
                            <span className="text-xs text-content-secondary">{nozzle.attendant}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-1 text-xs">
                            <span className="text-content-secondary">Electronic:</span>
                            <span className="text-right font-mono text-content-primary">{(nozzle.electronic_movement ?? 0).toFixed(3)} L</span>
                            <span className="text-content-secondary">Mechanical:</span>
                            <span className="text-right font-mono text-content-primary">{(nozzle.mechanical_movement ?? 0).toFixed(3)} L</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Financial (only if price data exists) */}
                {(selectedReading.price_per_liter ?? 0) > 0 && (
                  <div className="mb-6">
                    <h3 className="text-sm font-semibold text-content-secondary uppercase tracking-wide mb-3">
                      Financial
                    </h3>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="bg-surface-bg rounded-lg p-3">
                        <div className="text-xs text-content-secondary mb-1">Price per Litre</div>
                        <div className="font-bold text-content-primary">
                          K{(selectedReading.price_per_liter ?? 0).toLocaleString('en-ZM', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      </div>
                      <div className="bg-surface-bg rounded-lg p-3">
                        <div className="text-xs text-content-secondary mb-1">Expected Revenue</div>
                        <div className="font-bold text-content-primary">
                          K{(selectedReading.expected_amount_electronic ?? 0).toLocaleString('en-ZM', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {selectedReading.recorded_by && (
                  <div className="text-xs text-content-secondary border-t border-surface-border pt-3 mt-3">
                    Recorded by {selectedReading.recorded_by}
                    {selectedReading.created_at && ` on ${new Date(selectedReading.created_at).toLocaleString('en-ZM')}`}
                  </div>
                )}

                <div className="flex justify-end mt-6">
                  <button
                    onClick={() => setSelectedReading(null)}
                    className="px-5 py-2 bg-action-primary text-white rounded-lg text-sm font-medium hover:bg-action-primary-hover transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
