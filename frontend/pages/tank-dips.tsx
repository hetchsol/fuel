import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/router'
import toast from 'react-hot-toast'
import { authFetch, getHeaders, isManagerOrAbove } from '../lib/api'
import { formatDateToDisplay } from '../lib/dateUtils'

const BASE = '/api/v1'

interface Tank {
  tank_id: string
  fuel_type: string
  display_name?: string
  capacity: number
}

interface DipRow {
  tank_id: string
  opening_dip_cm: number | null
  opening_volume: number | null
  opening_source: string | null
  closing_dip_cm: string
  closing_volume: number | null
  closing_vol_error: boolean
  water_dip_cm: string
  saving: boolean
  saved: boolean
  requires_delivery: boolean
  delivery_linked: boolean
  delivery_supplier: string
  delivery_invoice: string
  delivery_time: string
  delivery_volume: string
}

interface HistoryRow {
  tank_id: string
  display_name?: string
  fuel_type: string
  date: string
  shift_type: string
  opening_dip_cm: number | null
  opening_volume: number | null
  closing_dip_cm: number | null
  closing_volume: number | null
  water_dip_cm?: number | null
  water_flagged?: boolean
  delivery_id?: string | null
  calibration_status?: 'current' | 'stale' | 'unknown' | 'no_calibration'
}

function getPreviousShift(date: string, shiftType: string): { prevDate: string; prevShift: string } {
  if (shiftType === 'Night') {
    return { prevDate: date, prevShift: 'Day' }
  }
  const d = new Date(date + 'T12:00:00')
  d.setDate(d.getDate() - 1)
  return { prevDate: d.toISOString().split('T')[0], prevShift: 'Night' }
}

function formatShiftDate(date: string, shift: string): string {
  return `${formatDateToDisplay(date)} ${shift}`
}

export default function TankDips() {
  const router = useRouter()
  const [userRole, setUserRole] = useState('')
  const [userName, setUserName] = useState('')
  const [tanks, setTanks] = useState<Tank[]>([])
  // Read directly off the URL rather than router.query — this page is only
  // ever reached by client-side navigation (no dynamic segments), so the
  // query string is already present on first render; waiting on router.isReady
  // would just cost an extra fetch-with-default-then-refetch round trip.
  const [date, setDate] = useState(() => {
    if (typeof window !== 'undefined') {
      const q = new URLSearchParams(window.location.search).get('date')
      if (q) return q
    }
    return new Date().toISOString().split('T')[0]
  })
  const [shiftType, setShiftType] = useState(() => {
    if (typeof window !== 'undefined') {
      const q = new URLSearchParams(window.location.search).get('shift_type')
      if (q === 'Day' || q === 'Night') return q
    }
    return 'Day'
  })
  const [rows, setRows] = useState<DipRow[]>([])
  const [loading, setLoading] = useState(true)

  const [activeTab, setActiveTab] = useState<'enter' | 'history'>('enter')
  const [historyStartDate, setHistoryStartDate] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 7)
    return d.toISOString().split('T')[0]
  })
  const [historyEndDate, setHistoryEndDate] = useState(() => new Date().toISOString().split('T')[0])
  const [historyShift, setHistoryShift] = useState('All')
  const [historyFuelType, setHistoryFuelType] = useState('All')
  const [historyTankId, setHistoryTankId] = useState('All')
  const [historyRows, setHistoryRows] = useState<HistoryRow[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyPage, setHistoryPage] = useState(0)
  const HISTORY_PAGE_SIZE = 20
  const [waterAlertThresholdCm, setWaterAlertThresholdCm] = useState(2.0)

  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (!userData) { router.replace('/login'); return }
    const user = JSON.parse(userData)
    if (!isManagerOrAbove(user.role)) { router.replace('/'); return }
    setUserRole(user.role)
    setUserName(user.full_name || user.username || '')
  }, [])

  useEffect(() => {
    authFetch(`${BASE}/settings/stock-alerts`, { headers: getHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.water_alert_threshold_cm != null) setWaterAlertThresholdCm(data.water_alert_threshold_cm) })
      .catch(() => {})
  }, [])

  const fetchTanks = useCallback(async () => {
    const res = await authFetch(`${BASE}/tanks/levels`, { headers: getHeaders() })
    if (res.ok) {
      const data = await res.json()
      setTanks(data)
      return data as Tank[]
    }
    return []
  }, [])

  const fetchExisting = useCallback(async (tankList: Tank[], d: string, st: string) => {
    try {
      const { prevDate, prevShift } = getPreviousShift(d, st)
      const [curRes, prevRes] = await Promise.all([
        authFetch(`${BASE}/tank-readings/dips?date=${d}&shift_type=${st}`, { headers: getHeaders() }),
        authFetch(`${BASE}/tank-readings/dips?date=${prevDate}&shift_type=${prevShift}`, { headers: getHeaders() }),
      ])
      const current: Record<string, any> = {}
      if (curRes.ok) {
        const data: any[] = await curRes.json()
        data.forEach(r => { current[r.tank_id] = r })
      }
      const prevClosing: Record<string, any> = {}
      if (prevRes.ok) {
        const data: any[] = await prevRes.json()
        data.forEach(r => { prevClosing[r.tank_id] = r })
      }

      setRows(tankList.map(t => {
        const cur = current[t.tank_id]
        const prev = prevClosing[t.tank_id]
        const openingDip: number | null = cur?.opening_dip_cm ?? prev?.closing_dip_cm ?? null
        const openingVol: number | null = cur?.opening_volume ?? prev?.closing_volume ?? null
        const openingSource: string | null = cur?.opening_dip_cm != null
          ? null
          : prev ? `from ${formatShiftDate(prevDate, prevShift)}` : null
        const closingVol: number | null = cur?.closing_volume ?? null
        const requiresDelivery = openingVol !== null && closingVol !== null && closingVol > openingVol
        return {
          tank_id: t.tank_id,
          opening_dip_cm: openingDip,
          opening_volume: openingVol,
          opening_source: openingSource,
          closing_dip_cm: cur?.closing_dip_cm != null ? String(cur.closing_dip_cm) : '',
          closing_volume: closingVol,
          closing_vol_error: false,
          water_dip_cm: cur?.water_dip_cm != null ? String(cur.water_dip_cm) : '',
          saving: false,
          saved: cur?.closing_dip_cm != null,
          requires_delivery: requiresDelivery,
          delivery_linked: !!cur?.delivery_id,
          delivery_supplier: '',
          delivery_invoice: '',
          delivery_time: '',
          delivery_volume: requiresDelivery && closingVol !== null && openingVol !== null
            ? String(Math.round(closingVol - openingVol))
            : '',
        }
      }))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTanks().then(tl => {
      if (tl.length) fetchExisting(tl, date, shiftType)
      else setLoading(false)
    })
  }, [])

  useEffect(() => {
    if (tanks.length) {
      setLoading(true)
      fetchExisting(tanks, date, shiftType)
    }
  }, [date, shiftType])

  const fetchHistory = useCallback(async (startDate: string, endDate: string, st: string) => {
    setHistoryLoading(true)
    try {
      const params = new URLSearchParams({ start_date: startDate, end_date: endDate })
      if (st !== 'All') params.set('shift_type', st)
      const res = await authFetch(
        `${BASE}/tank-readings/dips-range?${params.toString()}`,
        { headers: getHeaders() }
      )
      if (res.ok) {
        const data: any[] = await res.json()
        const mapped: HistoryRow[] = data.map(r => {
          const tank = tanks.find(t => t.tank_id === r.tank_id)
          return {
            tank_id: r.tank_id,
            display_name: tank?.display_name,
            fuel_type: tank?.fuel_type ?? '',
            date: r.date,
            shift_type: r.shift_type,
            opening_dip_cm: r.opening_dip_cm ?? null,
            opening_volume: r.opening_volume ?? null,
            closing_dip_cm: r.closing_dip_cm ?? null,
            closing_volume: r.closing_volume ?? null,
            water_dip_cm: r.water_dip_cm ?? null,
            water_flagged: r.water_flagged ?? false,
            delivery_id: r.delivery_id ?? null,
            calibration_status: r.calibration_status ?? undefined,
          }
        })
        setHistoryRows(mapped)
      } else {
        setHistoryRows([])
      }
      setHistoryPage(0)
    } finally {
      setHistoryLoading(false)
    }
  }, [tanks])

  useEffect(() => {
    if (activeTab === 'history' && tanks.length) {
      fetchHistory(historyStartDate, historyEndDate, historyShift)
    }
  }, [activeTab, historyStartDate, historyEndDate, historyShift, tanks])

  // Fuel type / tank are filtered client-side against the already-fetched
  // range, so just reset paging rather than re-fetching.
  useEffect(() => {
    setHistoryPage(0)
  }, [historyFuelType, historyTankId])

  const dipDebounceRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const convertDip = async (tankId: string, dip: string): Promise<{ volume: number | null; error: boolean }> => {
    const val = parseFloat(dip)
    if (isNaN(val) || val <= 0) return { volume: null, error: false }
    try {
      const res = await authFetch(
        `${BASE}/settings/tank-calibration/${tankId}/convert?dip_cm=${val}`,
        { headers: getHeaders() }
      )
      if (res.ok) {
        const data = await res.json()
        return { volume: data.volume_liters ?? null, error: false }
      }
      return { volume: null, error: true }
    } catch {
      return { volume: null, error: true }
    }
  }

  const applyClosingConversion = async (idx: number, value: string, tankId: string) => {
    if (!value || isNaN(parseFloat(value)) || parseFloat(value) <= 0) {
      setRows(prev => prev.map((r, i) => i !== idx ? r : {
        ...r, closing_volume: null, closing_vol_error: false, requires_delivery: false,
      }))
      return
    }
    const { volume, error } = await convertDip(tankId, value)
    setRows(prev => prev.map((r, i) => {
      if (i !== idx) return r
      const requiresDelivery = volume !== null && r.opening_volume !== null && volume > r.opening_volume
      return {
        ...r,
        closing_volume: volume,
        closing_vol_error: error,
        requires_delivery: requiresDelivery,
        delivery_volume: requiresDelivery && volume !== null && r.opening_volume !== null
          ? String(Math.round(volume - r.opening_volume))
          : r.delivery_volume,
      }
    }))
  }

  const handleClosingDipChange = (idx: number, value: string, tankId: string) => {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, closing_dip_cm: value, saved: false } : r))
    const key = `${idx}-closing`
    if (dipDebounceRef.current[key]) clearTimeout(dipDebounceRef.current[key])
    dipDebounceRef.current[key] = setTimeout(() => applyClosingConversion(idx, value, tankId), 400)
  }

  const handleClosingBlur = (idx: number, tankId: string) => {
    const key = `${idx}-closing`
    if (dipDebounceRef.current[key]) {
      clearTimeout(dipDebounceRef.current[key])
      delete dipDebounceRef.current[key]
    }
    applyClosingConversion(idx, rows[idx].closing_dip_cm, tankId)
  }

  const updateDeliveryField = (idx: number, field: 'delivery_supplier' | 'delivery_invoice' | 'delivery_time' | 'delivery_volume', value: string) => {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r))
  }

  const handleWaterDipChange = (idx: number, value: string) => {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, water_dip_cm: value, saved: false } : r))
  }

  const handleSave = async (idx: number) => {
    const row = rows[idx]
    if (!row.closing_dip_cm) {
      toast.error('Enter the closing dip reading before saving.')
      return
    }
    if (row.requires_delivery && !row.delivery_linked && !row.delivery_supplier.trim()) {
      toast.error('Enter the supplier name to record the delivery.')
      return
    }
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, saving: true } : r))
    try {
      const params = new URLSearchParams({
        tank_id: row.tank_id,
        date,
        shift_type: shiftType,
        recorded_by: userName,
      })
      if (row.opening_dip_cm != null) params.set('opening_dip_cm', String(row.opening_dip_cm))
      params.set('closing_dip_cm', row.closing_dip_cm)
      if (row.water_dip_cm !== '') params.set('water_dip_cm', row.water_dip_cm)
      if (row.requires_delivery && !row.delivery_linked && row.delivery_supplier.trim()) {
        params.set('delivery_supplier', row.delivery_supplier.trim())
        if (row.delivery_invoice.trim()) params.set('delivery_invoice_number', row.delivery_invoice.trim())
        if (row.delivery_time) params.set('delivery_time', row.delivery_time)
        if (row.delivery_volume && !isNaN(parseFloat(row.delivery_volume)))
          params.set('delivery_volume_liters', row.delivery_volume)
      }
      const res = await authFetch(`${BASE}/tank-readings/dips?${params.toString()}`, {
        method: 'POST',
        headers: getHeaders(),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || 'Save failed')
      }
      const data = await res.json()
      setRows(prev => prev.map((r, i) => i === idx ? {
        ...r,
        closing_volume: data.closing_volume ?? r.closing_volume,
        saving: false,
        saved: true,
        delivery_linked: !!data.delivery_id,
      } : r))
      toast.success(`${row.tank_id} dip saved.`)
    } catch (err: any) {
      toast.error(err.message || 'Failed to save.')
      setRows(prev => prev.map((r, i) => i === idx ? { ...r, saving: false } : r))
    }
  }

  const tankName = (t: Tank) => t.display_name || `${t.fuel_type} Tank (${t.tank_id})`

  const historyFuelTypes = Array.from(new Set(tanks.map(t => t.fuel_type))).sort()
  const historyTankOptions = historyFuelType === 'All' ? tanks : tanks.filter(t => t.fuel_type === historyFuelType)
  const filteredHistoryRows = historyRows.filter(r =>
    (historyFuelType === 'All' || r.fuel_type === historyFuelType) &&
    (historyTankId === 'All' || r.tank_id === historyTankId)
  )

  const historyPagination = !historyLoading && filteredHistoryRows.length > HISTORY_PAGE_SIZE && (
    <div className="flex items-center justify-between px-1">
      <span className="text-xs text-content-secondary">
        Showing {historyPage * HISTORY_PAGE_SIZE + 1}
        -{Math.min((historyPage + 1) * HISTORY_PAGE_SIZE, filteredHistoryRows.length)} of {filteredHistoryRows.length}
      </span>
      <div className="flex gap-2">
        <button
          onClick={() => setHistoryPage(p => Math.max(p - 1, 0))}
          disabled={historyPage === 0}
          className="px-3 py-1.5 text-xs font-medium rounded-btn border border-surface-border text-content-secondary disabled:opacity-40 disabled:cursor-not-allowed hover:bg-surface-bg">
          Previous
        </button>
        <button
          onClick={() => setHistoryPage(p => (p + 1) * HISTORY_PAGE_SIZE < filteredHistoryRows.length ? p + 1 : p)}
          disabled={(historyPage + 1) * HISTORY_PAGE_SIZE >= filteredHistoryRows.length}
          className="px-3 py-1.5 text-xs font-medium rounded-btn border border-surface-border text-content-secondary disabled:opacity-40 disabled:cursor-not-allowed hover:bg-surface-bg">
          Next
        </button>
      </div>
    </div>
  )

  if (!userRole || !isManagerOrAbove(userRole)) return null

  return (
    <div>
      <div className="mb-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold text-content-primary tracking-tight">Tank Dips</h1>
          <p className="mt-1 text-sm text-content-secondary">
            Record closing dip readings for each tank. Opening readings carry forward automatically from the previous shift.
          </p>
        </div>
        <div className="flex gap-1">
          {([['enter', 'Enter Readings'], ['history', 'History']] as const).map(([tab, label]) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className="px-4 py-1.5 text-sm font-medium rounded-full transition-colors"
              style={{
                backgroundColor: activeTab === tab ? 'var(--color-action-primary)' : 'transparent',
                color: activeTab === tab ? '#fff' : 'var(--color-content-secondary)',
                borderWidth: activeTab === tab ? 0 : 1,
                borderColor: 'var(--color-surface-border)',
              }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* History tab */}
      {activeTab === 'history' && (
        <div>
          <div className="glass-card p-4 mb-4 flex flex-wrap gap-4 items-end">
            <div>
              <label className="block text-xs font-medium text-content-secondary mb-1">From</label>
              <input type="date" value={historyStartDate}
                max={historyEndDate}
                onChange={e => setHistoryStartDate(e.target.value)}
                className="px-3 py-2 border border-surface-border rounded-input text-sm focus:outline-none focus:ring-2 focus:ring-action-primary" />
            </div>
            <div>
              <label className="block text-xs font-medium text-content-secondary mb-1">To</label>
              <input type="date" value={historyEndDate}
                min={historyStartDate}
                onChange={e => setHistoryEndDate(e.target.value)}
                className="px-3 py-2 border border-surface-border rounded-input text-sm focus:outline-none focus:ring-2 focus:ring-action-primary" />
            </div>
            <div>
              <label className="block text-xs font-medium text-content-secondary mb-1">Shift</label>
              <select value={historyShift} onChange={e => setHistoryShift(e.target.value)}
                className="px-3 py-2 border border-surface-border rounded-input text-sm focus:outline-none focus:ring-2 focus:ring-action-primary">
                <option value="All">All</option>
                <option value="Day">Day</option>
                <option value="Night">Night</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-content-secondary mb-1">Fuel Type</label>
              <select value={historyFuelType}
                onChange={e => { setHistoryFuelType(e.target.value); setHistoryTankId('All') }}
                className="px-3 py-2 border border-surface-border rounded-input text-sm focus:outline-none focus:ring-2 focus:ring-action-primary">
                <option value="All">All</option>
                {historyFuelTypes.map(ft => <option key={ft} value={ft}>{ft}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-content-secondary mb-1">Tank</label>
              <select value={historyTankId} onChange={e => setHistoryTankId(e.target.value)}
                className="px-3 py-2 border border-surface-border rounded-input text-sm focus:outline-none focus:ring-2 focus:ring-action-primary">
                <option value="All">All</option>
                {historyTankOptions.map(t => <option key={t.tank_id} value={t.tank_id}>{tankName(t)}</option>)}
              </select>
            </div>
          </div>

          <div className="mb-3">{historyPagination}</div>

          {historyLoading ? (
            <div className="glass-card p-8 text-center text-content-secondary text-sm">Loading...</div>
          ) : filteredHistoryRows.length === 0 ? (
            <div className="glass-card p-8 text-center text-content-secondary text-sm">
              No dip readings recorded between {historyStartDate} and {historyEndDate}{historyShift !== 'All' ? ` (${historyShift})` : ''}
              {historyFuelType !== 'All' ? ` for ${historyFuelType}` : ''}
              {historyTankId !== 'All' ? ` (${(() => { const t = tanks.find(t => t.tank_id === historyTankId); return t ? tankName(t) : historyTankId })()})` : ''}.
            </div>
          ) : (
            <div className="glass-card overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-border">
                    {['Date', 'Shift', 'Tank', 'Fuel Type', 'Opening Dip (cm)', 'Opening Vol (L)', 'Closing Dip (cm)', 'Closing Vol (L)', 'Water (cm)', 'Delivery', 'Calibration'].map(col => (
                      <th key={col} className="px-4 py-3 text-left text-xs font-medium uppercase text-content-secondary whitespace-nowrap">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredHistoryRows.slice(historyPage * HISTORY_PAGE_SIZE, historyPage * HISTORY_PAGE_SIZE + HISTORY_PAGE_SIZE).map((r, i) => {
                    const isDiesel = r.fuel_type === 'Diesel'
                    return (
                      <tr key={`${r.date}-${r.shift_type}-${r.tank_id}-${i}`} className="border-t border-surface-border">
                        <td className="px-4 py-3 text-content-primary whitespace-nowrap">{r.date}</td>
                        <td className="px-4 py-3 text-content-secondary whitespace-nowrap">{r.shift_type}</td>
                        <td className="px-4 py-3 font-medium text-content-primary whitespace-nowrap">
                          <span className={`inline-block w-2 h-2 rounded-full mr-2 ${isDiesel ? 'bg-fuel-diesel' : 'bg-fuel-petrol'}`} />
                          {r.display_name || r.tank_id}
                        </td>
                        <td className="px-4 py-3 text-content-secondary">{r.fuel_type}</td>
                        <td className="px-4 py-3 font-mono text-content-primary">
                          {r.opening_dip_cm != null ? r.opening_dip_cm : <span className="text-content-secondary">-</span>}
                        </td>
                        <td className="px-4 py-3 font-mono text-content-primary">
                          {r.opening_volume != null ? r.opening_volume.toLocaleString() : <span className="text-content-secondary">-</span>}
                        </td>
                        <td className="px-4 py-3 font-mono text-content-primary">
                          {r.closing_dip_cm != null ? r.closing_dip_cm : <span className="text-content-secondary">-</span>}
                        </td>
                        <td className="px-4 py-3 font-mono text-content-primary">
                          {r.closing_volume != null ? r.closing_volume.toLocaleString() : <span className="text-content-secondary">-</span>}
                        </td>
                        <td className={`px-4 py-3 font-mono ${r.water_flagged ? 'font-semibold text-status-error' : 'text-content-primary'}`}>
                          {r.water_dip_cm != null ? `${r.water_dip_cm}${r.water_flagged ? ' (ALERT)' : ''}` : <span className="text-content-secondary">-</span>}
                        </td>
                        <td className="px-4 py-3">
                          {r.delivery_id
                            ? <span className="text-xs font-semibold text-status-success">Recorded</span>
                            : <span className="text-xs text-content-secondary">-</span>
                          }
                        </td>
                        <td className="px-4 py-3">
                          {r.calibration_status === 'stale'
                            ? <span className="text-xs font-semibold text-status-warning" title="Chart was replaced after this dip was recorded — this volume may no longer match the current calibration.">Stale</span>
                            : r.calibration_status === 'no_calibration'
                            ? <span className="text-xs font-semibold text-status-warning" title="This tank has no calibration chart loaded right now.">No chart</span>
                            : <span className="text-xs text-content-secondary">-</span>
                          }
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-3">{historyPagination}</div>
        </div>
      )}

      {/* Enter Readings tab */}
      {activeTab === 'enter' && <>
        <div className="glass-card p-4 mb-6 flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-xs font-medium text-content-secondary mb-1">Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="px-3 py-2 border border-surface-border rounded-input text-sm focus:outline-none focus:ring-2 focus:ring-action-primary" />
          </div>
          <div>
            <label className="block text-xs font-medium text-content-secondary mb-1">Shift</label>
            <select value={shiftType} onChange={e => setShiftType(e.target.value)}
              className="px-3 py-2 border border-surface-border rounded-input text-sm focus:outline-none focus:ring-2 focus:ring-action-primary">
              <option value="Day">Day</option>
              <option value="Night">Night</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="glass-card p-8 text-center text-content-secondary text-sm">Loading...</div>
        ) : (
          <div className="space-y-4">
            {rows.map((row, idx) => {
              const tank = tanks.find(t => t.tank_id === row.tank_id)
              const isDiesel = tank?.fuel_type === 'Diesel'
              return (
                <div key={row.tank_id} className={`glass-card p-5 border-l-4 ${isDiesel ? 'border-l-fuel-diesel' : 'border-l-fuel-petrol'}`}>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="font-bold text-content-primary">{tank ? tankName(tank) : row.tank_id}</h3>
                      <span className={`text-xs font-semibold ${isDiesel ? 'text-fuel-diesel' : 'text-fuel-petrol'}`}>
                        {tank?.fuel_type}
                      </span>
                    </div>
                    {row.saved && (
                      <span className="text-xs font-semibold text-status-success bg-status-success-light px-2 py-1 rounded">Saved</span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
                    <div>
                      <label className="block text-xs font-medium text-content-secondary mb-1">
                        Opening Dip (cm)
                        {row.opening_source && (
                          <span className="ml-1 font-normal text-content-secondary/50">{row.opening_source}</span>
                        )}
                      </label>
                      <input type="text" readOnly
                        value={row.opening_dip_cm != null ? String(row.opening_dip_cm) : ''}
                        placeholder="No previous record"
                        className="w-full px-3 py-2 border border-surface-border rounded-input text-sm bg-surface-bg cursor-default text-content-secondary" />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-content-secondary mb-1">Opening Volume (L)</label>
                      <input type="text" readOnly
                        value={row.opening_volume != null ? row.opening_volume.toLocaleString() : ''}
                        placeholder="auto"
                        className="w-full px-3 py-2 border border-surface-border rounded-input text-sm bg-surface-bg cursor-default text-content-secondary" />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-content-secondary mb-1">Closing Dip (cm)</label>
                      <input type="number" step="0.1" min="0"
                        value={row.closing_dip_cm}
                        onChange={e => handleClosingDipChange(idx, e.target.value, row.tank_id)}
                        onBlur={() => handleClosingBlur(idx, row.tank_id)}
                        className="w-full px-3 py-2 border border-surface-border rounded-input text-sm focus:outline-none focus:ring-2 focus:ring-action-primary"
                        placeholder="e.g. 152.5" />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-content-secondary mb-1">Closing Volume (L)</label>
                      <input type="text" readOnly
                        value={row.closing_volume != null ? row.closing_volume.toLocaleString() : ''}
                        placeholder={row.closing_vol_error ? 'no calibration' : 'auto'}
                        className={`w-full px-3 py-2 border rounded-input text-sm bg-surface-bg cursor-default ${
                          row.closing_vol_error
                            ? 'border-status-warning text-status-warning'
                            : 'border-surface-border text-content-secondary'
                        }`} />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-content-secondary mb-1">Water (cm)</label>
                      <input type="number" step="0.1" min="0"
                        value={row.water_dip_cm}
                        onChange={e => handleWaterDipChange(idx, e.target.value)}
                        title="Water-finding paste reading at the tank bottom"
                        className={`w-full px-3 py-2 border rounded-input text-sm focus:outline-none focus:ring-2 focus:ring-action-primary ${
                          row.water_dip_cm !== '' && parseFloat(row.water_dip_cm) >= waterAlertThresholdCm
                            ? 'border-status-error text-status-error bg-status-error-light'
                            : 'border-surface-border'
                        }`}
                        placeholder="e.g. 0.5" />
                    </div>
                  </div>

                  {row.water_dip_cm !== '' && parseFloat(row.water_dip_cm) >= waterAlertThresholdCm && (
                    <div className="mb-4 -mt-1 p-2.5 rounded text-xs font-medium bg-status-error-light text-status-error">
                      Water detected at {row.water_dip_cm}cm — at or above the {waterAlertThresholdCm}cm alert threshold.
                      Pump out and re-check before continuing to dispense from this tank.
                    </div>
                  )}

                  {row.requires_delivery && (
                    <div className="mt-2 mb-4 pt-4 border-t border-surface-border">
                      {row.delivery_linked ? (
                        <p className="text-xs font-semibold text-status-success">Delivery recorded</p>
                      ) : (
                        <>
                          <p className="text-xs font-semibold text-status-warning mb-3">
                            Closing dip exceeds opening — record the delivery before saving.
                          </p>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-content-secondary mb-1">Supplier *</label>
                              <input type="text" value={row.delivery_supplier}
                                onChange={e => updateDeliveryField(idx, 'delivery_supplier', e.target.value)}
                                className="w-full px-3 py-2 border border-surface-border rounded-input text-sm focus:outline-none focus:ring-2 focus:ring-action-primary"
                                placeholder="e.g. Total Energies" />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-content-secondary mb-1">Invoice No.</label>
                              <input type="text" value={row.delivery_invoice}
                                onChange={e => updateDeliveryField(idx, 'delivery_invoice', e.target.value)}
                                className="w-full px-3 py-2 border border-surface-border rounded-input text-sm focus:outline-none focus:ring-2 focus:ring-action-primary"
                                placeholder="Optional" />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-content-secondary mb-1">Delivery Time</label>
                              <input type="time" value={row.delivery_time}
                                onChange={e => updateDeliveryField(idx, 'delivery_time', e.target.value)}
                                className="w-full px-3 py-2 border border-surface-border rounded-input text-sm focus:outline-none focus:ring-2 focus:ring-action-primary" />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-content-secondary mb-1">Volume (L)</label>
                              <input type="number" min="0" value={row.delivery_volume}
                                onChange={e => updateDeliveryField(idx, 'delivery_volume', e.target.value)}
                                className="w-full px-3 py-2 border border-surface-border rounded-input text-sm focus:outline-none focus:ring-2 focus:ring-action-primary" />
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  <button onClick={() => handleSave(idx)}
                    disabled={row.saving || !row.closing_dip_cm}
                    className="px-4 py-2 bg-action-primary text-white text-sm font-medium rounded-btn hover:bg-action-primary/90 disabled:opacity-50 disabled:cursor-not-allowed">
                    {row.saving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </>}
    </div>
  )
}
