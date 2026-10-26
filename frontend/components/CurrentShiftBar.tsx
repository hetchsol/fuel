// Strip under the top menu showing the shift running right now: Day or Night,
// the weekday and date it belongs to, and who is assigned to it.
//
// Read-only. It reads /shifts/date/{date} (side-effect free) and picks out the
// current shift — it deliberately does NOT call /shifts/current/active, which
// creates a shift record when none exists.
//
// The shift itself comes from getCurrentShift(), so it moves at 06:00 and 18:00
// and the hours after midnight show the previous date's Night shift. Checked
// every minute; the assigned names are re-fetched when the shift changes and
// every 5 minutes otherwise, so a newly assigned attendant appears on its own.

import { useEffect, useState } from 'react'
import { authFetch, BASE, getHeaders } from '../lib/api'
import { formatDayDateToDisplay, getCurrentShift } from '../lib/dateUtils'

const SHIFT_HOURS: Record<'Day' | 'Night', string> = {
  Day: '06:00 to 18:00',
  Night: '18:00 to 06:00',
}

export default function CurrentShiftBar({ stationId }: { stationId?: string }) {
  const [current, setCurrent] = useState(() => getCurrentShift())
  const [names, setNames] = useState<string[] | null>(null)  // null = not loaded yet
  const [hasShift, setHasShift] = useState(false)

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

  // Who is on the current shift.
  useEffect(() => {
    let cancelled = false
    const load = () => {
      authFetch(`${BASE}/shifts/date/${current.date}`, { headers: getHeaders() })
        .then(r => (r.ok ? r.json() : []))
        .then((shifts: any[]) => {
          if (cancelled) return
          const shift = (Array.isArray(shifts) ? shifts : []).find(s => s.shift_type === current.shiftType)
          const fromAssignments = (shift?.assignments || []).map((a: any) => a.attendant_name).filter(Boolean)
          const list: string[] = fromAssignments.length ? fromAssignments : (shift?.attendants || []).filter(Boolean)
          setHasShift(!!shift)
          setNames(Array.from(new Set(list)))
        })
        .catch(() => { if (!cancelled) setNames([]) })
    }
    setNames(null)
    load()
    const interval = setInterval(load, 5 * 60000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [current.date, current.shiftType, stationId])

  const isDay = current.shiftType === 'Day'

  let onShift: string
  if (names === null) onShift = 'Loading...'
  else if (names.length) onShift = names.join(', ')
  else onShift = hasShift ? 'No attendants assigned yet' : 'Shift not set up yet'

  return (
    <div className="border-t border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/80">
        <span
          className={`px-2 py-0.5 rounded-full font-semibold text-white ${isDay ? 'bg-status-warning/40' : 'bg-action-primary/50'}`}
        >
          {current.shiftType} Shift
        </span>
        <span className="font-medium text-white">{formatDayDateToDisplay(current.date)}</span>
        <span className="text-white/60">{SHIFT_HOURS[current.shiftType]}</span>
        <span className="min-w-0">
          <span className="text-white/60">On shift: </span>
          <span className={names && names.length ? 'font-medium text-white' : 'italic text-white/60'}>{onShift}</span>
        </span>
      </div>
    </div>
  )
}
