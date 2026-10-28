import React, { createContext, useContext, useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import { getCurrentShift } from '../lib/dateUtils'
import { authFetch, BASE, getHeaders } from '../lib/api'

// Shared "working day" — the date (and shift type) the user is currently
// operating on. Single-day pages initialise their existing date/shift pickers
// from here so the day is picked once and carried across navigation, instead of
// re-selecting it on every page. (Manager_Flow_Simplification_Plan.md item 2.)
//
// This is purely a UX convenience: it only seeds the *initial value* of pickers
// that already exist; every page still owns its own logic and the user can
// override the date on any page. It changes no business logic or output.
//
// Backed by sessionStorage (not localStorage): it survives reloads within the
// browser session but resets on a new session, so the app never opens on a
// stale past date the next morning.
//
// Following the set-up shift: by default the working day is the shift that has
// been set up and is open at the station (/shifts/current/open), whatever the
// time of day — so a Night shift set up at 14:00 makes forms default to Night,
// matching the shift strip. Only when no shift is open does it follow the clock
// (getCurrentShift). The open shift is checked in the background every minute
// and remembered per station in sessionStorage.
//
// A day/shift the user picks is remembered together with the live shift it was
// picked during; once the live shift has moved on the pick is dropped. The
// working day is re-checked on app load and on each page navigation only, never
// on a timer, so a form that is already open never has its shift changed under
// it. (One exception: if the open shift arrives within a few seconds of landing
// on a page and differs, it is applied then, before anyone has typed.)

type ShiftType = 'Day' | 'Night'
type Live = { date: string; shiftType: ShiftType }

const LIVE_CACHE = 'liveShift'
const APPLY_WINDOW_MS = 3000

const stationOf = () => {
  try { return localStorage.getItem('stationId') || '' } catch { return '' }
}

// The live shift: the cached open shift for this station, else the clock.
const currentLive = (): Live => {
  try {
    const raw = sessionStorage.getItem(LIVE_CACHE)
    if (raw) {
      const c = JSON.parse(raw)
      if (c && c.stationId === stationOf() && c.open
          && typeof c.open.date === 'string' && (c.open.shiftType === 'Day' || c.open.shiftType === 'Night')) {
        return c.open
      }
    }
  } catch { /* storage unavailable or bad cache — use the clock */ }
  return getCurrentShift()
}

const keyOf = (l: Live) => `${l.date}-${l.shiftType}`
const shiftKey = () => keyOf(currentLive())

interface WorkingDay {
  date: string
  shiftType: ShiftType
  setDate: (d: string) => void
  setShiftType: (s: ShiftType) => void
}

const WorkingDayContext = createContext<WorkingDay | null>(null)

export function WorkingDayProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [date, setDateState] = useState<string>(() => getCurrentShift().date)
  const [shiftType, setShiftTypeState] = useState<ShiftType>(() => getCurrentShift().shiftType)
  const landedAt = useRef(0)

  // Bring the working day in line with the live shift. A stored pick is kept
  // only while the live shift is still the one it was made during.
  const sync = () => {
    const cur = currentLive()
    try {
      if (sessionStorage.getItem('workingPickedDuring') === keyOf(cur)) {
        const d = sessionStorage.getItem('workingDate')
        const s = sessionStorage.getItem('workingShiftType')
        setDateState(d || cur.date)
        setShiftTypeState(s === 'Day' || s === 'Night' ? s : cur.shiftType)
        return
      }
      sessionStorage.removeItem('workingDate')
      sessionStorage.removeItem('workingShiftType')
      sessionStorage.removeItem('workingPickedDuring')
    } catch {
      /* storage unavailable — fall back to the live shift */
    }
    setDateState(cur.date)
    setShiftTypeState(cur.shiftType)
  }

  // Ask the server which shift is open and cache it. Resolves true when the
  // live shift changed. Read-only endpoint; skipped when not logged in.
  const refreshLive = async (): Promise<boolean> => {
    try {
      if (!localStorage.getItem('accessToken')) return false
      const before = shiftKey()
      const res = await authFetch(`${BASE}/shifts/current/open`, { headers: getHeaders() })
      if (!res.ok) return false
      const data = await res.json()
      const s = data?.shift
      const open = s && typeof s.date === 'string' && (s.shift_type === 'Day' || s.shift_type === 'Night')
        ? { date: s.date, shiftType: s.shift_type as ShiftType }
        : null
      sessionStorage.setItem(LIVE_CACHE, JSON.stringify({ stationId: stationOf(), open }))
      return shiftKey() !== before
    } catch {
      return false
    }
  }

  // Refresh after landing on a page; apply only if it arrives quickly.
  const refreshAndApply = () => {
    const started = Date.now()
    landedAt.current = started
    refreshLive().then(changed => {
      if (changed && landedAt.current === started && Date.now() - started < APPLY_WINDOW_MS) sync()
    })
  }

  // Client only (avoids SSR mismatch): on load, then before each page change
  // so the next page seeds its pickers from an up-to-date working day.
  useEffect(() => {
    sync()
    refreshAndApply()
    router.events.on('routeChangeStart', sync)
    router.events.on('routeChangeComplete', refreshAndApply)
    const interval = setInterval(() => { refreshLive() }, 60000)
    return () => {
      router.events.off('routeChangeStart', sync)
      router.events.off('routeChangeComplete', refreshAndApply)
      clearInterval(interval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const remember = (key: string, value: string) => {
    try {
      sessionStorage.setItem(key, value)
      sessionStorage.setItem('workingPickedDuring', shiftKey())
    } catch {}
  }
  const setDate = (d: string) => {
    setDateState(d)
    remember('workingDate', d)
  }
  const setShiftType = (s: ShiftType) => {
    setShiftTypeState(s)
    remember('workingShiftType', s)
  }

  return (
    <WorkingDayContext.Provider value={{ date, shiftType, setDate, setShiftType }}>
      {children}
    </WorkingDayContext.Provider>
  )
}

// Returns the shared working day. Safe to call without a provider (falls back to
// the live shift, in-memory) so a page can never crash on it.
export function useWorkingDay(): WorkingDay {
  const ctx = useContext(WorkingDayContext)
  if (ctx) return ctx
  // Fallback: behaves like an isolated local state for this render.
  // (Should not happen in-app since _app wraps everything in the provider.)
  const cur = typeof window === 'undefined' ? getCurrentShift() : currentLive()
  return {
    date: cur.date,
    shiftType: cur.shiftType,
    setDate: () => {},
    setShiftType: () => {},
  }
}
