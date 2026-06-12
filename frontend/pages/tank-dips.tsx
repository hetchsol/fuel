import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/router'
import toast from 'react-hot-toast'
import { authFetch, getHeaders, isManagerOrAbove } from '../lib/api'

const BASE = '/api/v1'

interface Tank {
  tank_id: string
  fuel_type: string
  display_name?: string
  capacity: number
}

interface DipRow {
  tank_id: string
  opening_dip_cm: string
  closing_dip_cm: string
  opening_volume: number | null
  closing_volume: number | null
  opening_vol_error: boolean
  closing_vol_error: boolean
  saving: boolean
  saved: boolean
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
}

export default function TankDips() {
  const router = useRouter()
  const [userRole, setUserRole] = useState('')
  const [userName, setUserName] = useState('')
  const [tanks, setTanks] = useState<Tank[]>([])
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0])
  const [shiftType, setShiftType] = useState('Day')
  const [rows, setRows] = useState<DipRow[]>([])
  const [loading, setLoading] = useState(true)

  // History tab
  const [activeTab, setActiveTab] = useState<'enter' | 'history'>('enter')
  const [historyDate, setHistoryDate] = useState(() => new Date().toISOString().split('T')[0])
  const [historyShift, setHistoryShift] = useState('Day')
  const [historyRows, setHistoryRows] = useState<HistoryRow[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (!userData) { router.replace('/login'); return }
    const user = JSON.parse(userData)
    if (!isManagerOrAbove(user.role)) { router.replace('/'); return }
    setUserRole(user.role)
    setUserName(user.full_name || user.username || '')
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
      const res = await authFetch(
        `${BASE}/tank-readings/dips?date=${d}&shift_type=${st}`,
        { headers: getHeaders() }
      )
      const existing: Record<string, any> = {}
      if (res.ok) {
        const data: any[] = await res.json()
        data.forEach(r => { existing[r.tank_id] = r })
      }
      setRows(tankList.map(t => {
        const e = existing[t.tank_id]
        return {
          tank_id: t.tank_id,
          opening_dip_cm: e?.opening_dip_cm != null ? String(e.opening_dip_cm) : '',
          closing_dip_cm: e?.closing_dip_cm != null ? String(e.closing_dip_cm) : '',
          opening_volume: e?.opening_volume ?? null,
          closing_volume: e?.closing_volume ?? null,
          opening_vol_error: false,
          closing_vol_error: false,
          saving: false,
          saved: !!(e?.opening_dip_cm != null || e?.closing_dip_cm != null),
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

  const fetchHistory = useCallback(async (d: string, st: string) => {
    setHistoryLoading(true)
    try {
      const res = await authFetch(
        `${BASE}/tank-readings/dips?date=${d}&shift_type=${st}`,
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
          }
        })
        setHistoryRows(mapped)
      } else {
        setHistoryRows([])
      }
    } finally {
      setHistoryLoading(false)
    }
  }, [tanks])

  useEffect(() => {
    if (activeTab === 'history' && tanks.length) {
      fetchHistory(historyDate, historyShift)
    }
  }, [activeTab, historyDate, historyShift, tanks])

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

  const applyConversion = async (idx: number, field: 'opening_dip_cm' | 'closing_dip_cm', value: string, tankId: string) => {
    const volField = field === 'opening_dip_cm' ? 'opening_volume' : 'closing_volume'
    const errField = field === 'opening_dip_cm' ? 'opening_vol_error' : 'closing_vol_error'
    if (!value || isNaN(parseFloat(value)) || parseFloat(value) <= 0) {
      setRows(prev => prev.map((r, i) => i === idx ? { ...r, [volField]: null, [errField]: false } : r))
      return
    }
    const { volume, error } = await convertDip(tankId, value)
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, [volField]: volume, [errField]: error } : r))
  }

  const handleDipChange = (idx: number, field: 'opening_dip_cm' | 'closing_dip_cm', value: string, tankId: string) => {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value, saved: false } : r))
    const key = `${idx}-${field}`
    if (dipDebounceRef.current[key]) clearTimeout(dipDebounceRef.current[key])
    dipDebounceRef.current[key] = setTimeout(() => applyConversion(idx, field, value, tankId), 400)
  }

  const handleBlur = (idx: number, field: 'opening_dip_cm' | 'closing_dip_cm', tankId: string) => {
    // Cancel debounce and fire immediately on focus loss
    const key = `${idx}-${field}`
    if (dipDebounceRef.current[key]) {
      clearTimeout(dipDebounceRef.current[key])
      delete dipDebounceRef.current[key]
    }
    applyConversion(idx, field, rows[idx][field], tankId)
  }

  const handleSave = async (idx: number) => {
    const row = rows[idx]
    if (!row.opening_dip_cm && !row.closing_dip_cm) {
      toast.error('Enter at least one dip reading before saving.')
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
      if (row.opening_dip_cm) params.set('opening_dip_cm', row.opening_dip_cm)
      if (row.closing_dip_cm) params.set('closing_dip_cm', row.closing_dip_cm)

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
        opening_volume: data.opening_volume ?? r.opening_volume,
        closing_volume: data.closing_volume ?? r.closing_volume,
        saving: false,
        saved: true,
      } : r))
      toast.success(`${row.tank_id} dip saved.`)
    } catch (err: any) {
      toast.error(err.message || 'Failed to save.')
      setRows(prev => prev.map((r, i) => i === idx ? { ...r, saving: false } : r))
    }
  }

  const tankName = (t: Tank) =>
    t.display_name || `${t.fuel_type} Tank (${t.tank_id})`

  if (!userRole || !isManagerOrAbove(userRole)) return null

  return (
    <div>
      <div className="mb-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold text-content-primary tracking-tight">Tank Dips</h1>
          <p className="mt-1 text-sm text-content-secondary">
            Record opening and closing dip readings for each tank. Values are converted using the calibration chart.
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
              <label className="block text-xs font-medium text-content-secondary mb-1">Date</label>
              <input type="date" value={historyDate}
                onChange={e => setHistoryDate(e.target.value)}
                className="px-3 py-2 border border-surface-border rounded-input text-sm focus:outline-none focus:ring-2 focus:ring-action-primary" />
            </div>
            <div>
              <label className="block text-xs font-medium text-content-secondary mb-1">Shift</label>
              <select value={historyShift} onChange={e => setHistoryShift(e.target.value)}
                className="px-3 py-2 border border-surface-border rounded-input text-sm focus:outline-none focus:ring-2 focus:ring-action-primary">
                <option value="Day">Day</option>
                <option value="Night">Night</option>
              </select>
            </div>
          </div>

          {historyLoading ? (
            <div className="glass-card p-8 text-center text-content-secondary text-sm">Loading...</div>
          ) : historyRows.length === 0 ? (
            <div className="glass-card p-8 text-center text-content-secondary text-sm">
              No dip readings recorded for {historyDate} {historyShift}.
            </div>
          ) : (
            <div className="glass-card overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-border">
                    {['Tank', 'Fuel Type', 'Opening Dip (cm)', 'Opening Vol (L)', 'Closing Dip (cm)', 'Closing Vol (L)'].map(col => (
                      <th key={col} className="px-4 py-3 text-left text-xs font-medium uppercase text-content-secondary whitespace-nowrap">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {historyRows.map(r => {
                    const isDiesel = r.fuel_type === 'Diesel'
                    return (
                      <tr key={r.tank_id} className="border-t border-surface-border">
                        <td className="px-4 py-3 font-medium text-content-primary">
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
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Enter Readings tab */}
      {activeTab === 'enter' && <>

      {/* Date + Shift selector */}
      <div className="glass-card p-4 mb-6 flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-xs font-medium text-content-secondary mb-1">Date</label>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="px-3 py-2 border border-surface-border rounded-input text-sm focus:outline-none focus:ring-2 focus:ring-action-primary"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-content-secondary mb-1">Shift</label>
          <select
            value={shiftType}
            onChange={e => setShiftType(e.target.value)}
            className="px-3 py-2 border border-surface-border rounded-input text-sm focus:outline-none focus:ring-2 focus:ring-action-primary"
          >
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
              <div
                key={row.tank_id}
                className={`glass-card p-5 border-l-4 ${isDiesel ? 'border-l-fuel-diesel' : 'border-l-fuel-petrol'}`}
              >
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-bold text-content-primary">{tank ? tankName(tank) : row.tank_id}</h3>
                    <span className={`text-xs font-semibold ${isDiesel ? 'text-fuel-diesel' : 'text-fuel-petrol'}`}>
                      {tank?.fuel_type}
                    </span>
                  </div>
                  {row.saved && (
                    <span className="text-xs font-semibold text-status-success bg-status-success-light px-2 py-1 rounded">
                      Saved
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  {/* Opening dip */}
                  <div>
                    <label className="block text-xs font-medium text-content-secondary mb-1">Opening Dip (cm)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={row.opening_dip_cm}
                      onChange={e => handleDipChange(idx, 'opening_dip_cm', e.target.value, row.tank_id)}
                      onBlur={() => handleBlur(idx, 'opening_dip_cm', row.tank_id)}
                      className="w-full px-3 py-2 border border-surface-border rounded-input text-sm focus:outline-none focus:ring-2 focus:ring-action-primary"
                      placeholder="e.g. 165.0"
                    />
                  </div>

                  {/* Opening volume (read-only, calibration-derived) */}
                  <div>
                    <label className="block text-xs font-medium text-content-secondary mb-1">Opening Volume (L)</label>
                    <input
                      type="text"
                      readOnly
                      value={row.opening_volume != null ? row.opening_volume.toLocaleString() : ''}
                      placeholder={row.opening_vol_error ? 'no calibration' : 'auto'}
                      className={`w-full px-3 py-2 border rounded-input text-sm bg-surface-bg cursor-default ${
                        row.opening_vol_error
                          ? 'border-status-warning text-status-warning'
                          : 'border-surface-border text-content-secondary'
                      }`}
                    />
                  </div>

                  {/* Closing dip */}
                  <div>
                    <label className="block text-xs font-medium text-content-secondary mb-1">Closing Dip (cm)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={row.closing_dip_cm}
                      onChange={e => handleDipChange(idx, 'closing_dip_cm', e.target.value, row.tank_id)}
                      onBlur={() => handleBlur(idx, 'closing_dip_cm', row.tank_id)}
                      className="w-full px-3 py-2 border border-surface-border rounded-input text-sm focus:outline-none focus:ring-2 focus:ring-action-primary"
                      placeholder="e.g. 152.5"
                    />
                  </div>

                  {/* Closing volume (read-only, calibration-derived) */}
                  <div>
                    <label className="block text-xs font-medium text-content-secondary mb-1">Closing Volume (L)</label>
                    <input
                      type="text"
                      readOnly
                      value={row.closing_volume != null ? row.closing_volume.toLocaleString() : ''}
                      placeholder={row.closing_vol_error ? 'no calibration' : 'auto'}
                      className={`w-full px-3 py-2 border rounded-input text-sm bg-surface-bg cursor-default ${
                        row.closing_vol_error
                          ? 'border-status-warning text-status-warning'
                          : 'border-surface-border text-content-secondary'
                      }`}
                    />
                  </div>
                </div>

                <button
                  onClick={() => handleSave(idx)}
                  disabled={row.saving || (!row.opening_dip_cm && !row.closing_dip_cm)}
                  className="px-4 py-2 bg-action-primary text-white text-sm font-medium rounded-btn hover:bg-action-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
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
