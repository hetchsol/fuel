// Strip under the top menu showing the shift running right now: Day or Night,
// the weekday and date it belongs to, its status, and who is assigned to it.
//
// Supervisors and above can also look up any other shift with a date picker and
// a Day/Night dropdown; the strip then shows that shift (marked "Viewing") until
// "Back to current shift" is pressed. Attendants only ever see the current shift.
//
// Read-only. It reads /shifts/date/{date} (side-effect free) and picks out the
// shift — it deliberately does NOT call /shifts/current/active, which creates a
// shift record when none exists.
//
// The current shift comes from getCurrentShift(), so it moves at 06:00 and 18:00
// and the hours after midnight show the previous date's Night shift. Checked
// every minute; the assigned names are re-fetched when the shown shift changes
// and every 5 minutes otherwise, so a newly assigned attendant appears on its own.

import { useEffect, useState } from 'react'
import { authFetch, BASE, getHeaders } from '../lib/api'
import { formatDayDateToDisplay, getCurrentShift } from '../lib/dateUtils'

type ShiftType = 'Day' | 'Night'

const SHIFT_HOURS: Record<ShiftType, string> = {
  Day: '06:00 to 18:00',
  Night: '18:00 to 06:00',
}

const STATUS_LABELS: Record<string, string> = {
  active: 'Open',
  completed: 'Closed',
  reconciled: 'Reconciled',
  'auto-closed': 'Auto-closed',
  inactive: 'Inactive',
}

export default function CurrentShiftBar({ stationId, canLookUp = false }: { stationId?: string; canLookUp?: boolean }) {
  const [current, setCurrent] = useState(() => getCurrentShift())
  // A looked-up shift (supervisors and above); null = show the current shift.
  const [viewing, setViewing] = useState<{ date: string; shiftType: ShiftType } | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickDate, setPickDate] = useState('')
  const [pickType, setPickType] = useState<ShiftType>('Day')

  const [names, setNames] = useState<string[] | null>(null)  // null = not loaded yet
  const [shiftStatus, setShiftStatus] = useState<string | null>(null)  // null = no shift record

  // Follow the clock across the 06:00 / 18:00 boundaries.
  useEffect(() => {
    const tick = () => {
      const now = getCurrentShift()
      setCurrent(prev => (prev.date === now.date && prev.shiftType === now.shiftType ? prev : now))
    }
    tick()
    const interval = setInterval(tick, 60000)
    return () => clearInterval(interval)
  }, [])

  const shown = viewing || current

  // Who is on the shown shift, and its status.
  useEffect(() => {
    let cancelled = false
    const load = () => {
      authFetch(`${BASE}/shifts/date/${shown.date}`, { headers: getHeaders() })
        .then(r => (r.ok ? r.json() : []))
        .then((shifts: any[]) => {
          if (cancelled) return
          const shift = (Array.isArray(shifts) ? shifts : []).find(s => s.shift_type === shown.shiftType)
          const fromAssignments = (shift?.assignments || []).map((a: any) => a.attendant_name).filter(Boolean)
          const list: string[] = fromAssignments.length ? fromAssignments : (shift?.attendants || []).filter(Boolean)
          setShiftStatus(shift ? (shift.status || 'active') : null)
          setNames(Array.from(new Set(list)))
        })
        .catch(() => { if (!cancelled) setNames([]) })
    }
    setNames(null)
    load()
    const interval = setInterval(load, 5 * 60000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [shown.date, shown.shiftType, stationId])

  const openPicker = () => {
    setPickDate(shown.date)
    setPickType(shown.shiftType)
    setPickerOpen(true)
  }
  const applyPick = () => {
    if (!pickDate) return
    const isCurrent = pickDate === current.date && pickType === current.shiftType
    setViewing(isCurrent ? null : { date: pickDate, shiftType: pickType })
    setPickerOpen(false)
  }
  const backToCurrent = () => {
    setViewing(null)
    setPickerOpen(false)
  }

  const isDay = shown.shiftType === 'Day'

  let onShift: string
  if (names === null) onShift = 'Loading...'
  else if (names.length) onShift = names.join(', ')
  else onShift = shiftStatus ? 'No attendants assigned yet' : 'Shift not set up yet'

  const controlClass = 'px-2 py-0.5 text-xs rounded-btn border bg-white/10 text-white border-white/20 focus:outline-none focus:ring-2 focus:ring-white/40'
  const linkClass = 'text-white/70 hover:text-white underline underline-offset-2'

  return (
    <div className="border-t border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/80">
        {viewing && <span className="font-semibold uppercase tracking-wide text-status-warning">Viewing</span>}
        <span
          className={`px-2 py-0.5 rounded-full font-semibold text-white ${isDay ? 'bg-status-warning/40' : 'bg-action-primary/50'}`}
        >
          {shown.shiftType} Shift
        </span>
        <span className="font-medium text-white">{formatDayDateToDisplay(shown.date)}</span>
        <span className="text-white/60">{SHIFT_HOURS[shown.shiftType]}</span>
        {shiftStatus && (
          <span>
            <span className="text-white/60">Status: </span>
            <span className="font-medium text-white">{STATUS_LABELS[shiftStatus] || shiftStatus}</span>
          </span>
        )}
        <span className="min-w-0">
          <span className="text-white/60">On shift: </span>
          <span className={names && names.length ? 'font-medium text-white' : 'italic text-white/60'}>{onShift}</span>
        </span>

        {canLookUp && (
          <span className="flex flex-wrap items-center gap-2 sm:ml-auto">
            {pickerOpen ? (
              <>
                <input
                  type="date"
                  value={pickDate}
                  onChange={e => setPickDate(e.target.value)}
                  className={controlClass}
                  aria-label="Shift date"
                />
                <select
                  value={pickType}
                  onChange={e => setPickType(e.target.value as ShiftType)}
                  className={controlClass}
                  aria-label="Shift type"
                >
                  <option value="Day" className="bg-surface-card text-content-primary">Day</option>
                  <option value="Night" className="bg-surface-card text-content-primary">Night</option>
                </select>
                <button onClick={applyPick} disabled={!pickDate} className={`${controlClass} font-medium hover:bg-white/20 disabled:opacity-50`}>
                  Show
                </button>
                <button onClick={() => setPickerOpen(false)} className={linkClass}>Cancel</button>
              </>
            ) : (
              <button onClick={openPicker} className={linkClass}>Look up a shift</button>
            )}
            {viewing && !pickerOpen && (
              <button onClick={backToCurrent} className={linkClass}>Back to current shift</button>
            )}
          </span>
        )}
      </div>
    </div>
  )
}
