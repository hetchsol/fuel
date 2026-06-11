import { useState, useEffect, useCallback } from 'react'
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
  saving: boolean
  saved: boolean
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
        saving: false,
        saved: !!(e?.opening_dip_cm != null || e?.closing_dip_cm != null),
      }
    }))
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchTanks().then(tl => { if (tl.length) fetchExisting(tl, date, shiftType) })
  }, [])

  useEffect(() => {
    if (tanks.length) {
      setLoading(true)
      fetchExisting(tanks, date, shiftType)
    }
  }, [date, shiftType])

  const convertDip = async (tankId: string, dip: string): Promise<number | null> => {
    const val = parseFloat(dip)
    if (isNaN(val) || val <= 0) return null
    const res = await authFetch(
      `${BASE}/tank-calibrations/${tankId}/convert?dip_cm=${val}`,
      { headers: getHeaders() }
    )
    if (res.ok) {
      const data = await res.json()
      return data.volume_liters ?? null
    }
    return null
  }

  const handleBlur = async (idx: number, field: 'opening_dip_cm' | 'closing_dip_cm') => {
    const row = rows[idx]
    const vol = await convertDip(row.tank_id, row[field])
    const volField = field === 'opening_dip_cm' ? 'opening_volume' : 'closing_volume'
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, [volField]: vol } : r))
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
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-content-primary tracking-tight">Tank Dips</h1>
        <p className="mt-1 text-sm text-content-secondary">
          Record opening and closing dip readings for each tank. Values are converted using the calibration chart.
        </p>
      </div>

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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  {/* Opening dip */}
                  <div>
                    <label className="block text-xs font-medium text-content-secondary mb-1">Opening Dip (cm)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={row.opening_dip_cm}
                      onChange={e => setRows(prev => prev.map((r, i) => i === idx ? { ...r, opening_dip_cm: e.target.value, saved: false } : r))}
                      onBlur={() => handleBlur(idx, 'opening_dip_cm')}
                      className="w-full px-3 py-2 border border-surface-border rounded-input text-sm focus:outline-none focus:ring-2 focus:ring-action-primary"
                      placeholder="e.g. 165.0"
                    />
                    {row.opening_volume != null && (
                      <p className="text-xs text-content-secondary mt-1">
                        {Math.round(row.opening_volume).toLocaleString()} L
                      </p>
                    )}
                  </div>

                  {/* Closing dip */}
                  <div>
                    <label className="block text-xs font-medium text-content-secondary mb-1">Closing Dip (cm)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={row.closing_dip_cm}
                      onChange={e => setRows(prev => prev.map((r, i) => i === idx ? { ...r, closing_dip_cm: e.target.value, saved: false } : r))}
                      onBlur={() => handleBlur(idx, 'closing_dip_cm')}
                      className="w-full px-3 py-2 border border-surface-border rounded-input text-sm focus:outline-none focus:ring-2 focus:ring-action-primary"
                      placeholder="e.g. 152.5"
                    />
                    {row.closing_volume != null && (
                      <p className="text-xs text-content-secondary mt-1">
                        {Math.round(row.closing_volume).toLocaleString()} L
                      </p>
                    )}
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
    </div>
  )
}
