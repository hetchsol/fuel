import React, { createContext, useContext, useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { getCurrentShift } from '../lib/dateUtils'

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
// Following the clock: by default the working day is the shift running now
// (getCurrentShift). A day/shift the user picks is remembered together with the
// real shift it was picked during; once the real shift has moved on (e.g. Day
// to Night at 18:00) the pick is dropped and the working day follows the clock
// again. This is re-checked on app load and on each page navigation only, never
// on a timer, so a form that is already open never has its shift changed under it.

type ShiftType = 'Day' | 'Night'

interface WorkingDay {
  date: string
  shiftType: ShiftType
  setDate: (d: string) => void
  setShiftType: (s: ShiftType) => void
}

const shiftKey = () => {
  const c = getCurrentShift()
  return `${c.date}-${c.shiftType}`
}

const WorkingDayContext = createContext<WorkingDay | null>(null)

export function WorkingDayProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [date, setDateState] = useState<string>(() => getCurrentShift().date)
  const [shiftType, setShiftTypeState] = useState<ShiftType>(() => getCurrentShift().shiftType)

  // Bring the working day in line with the clock. A stored pick is kept only
  // while the real shift is still the one it was made during.
  const sync = () => {
    const cur = getCurrentShift()
    try {
      if (sessionStorage.getItem('workingPickedDuring') === shiftKey()) {
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
      /* storage unavailable — fall back to the clock */
    }
    setDateState(cur.date)
    setShiftTypeState(cur.shiftType)
  }

  // Client only (avoids SSR mismatch): on load, then before each page change
  // so the next page seeds its pickers from an up-to-date working day.
  useEffect(() => {
    sync()
    router.events.on('routeChangeStart', sync)
    return () => router.events.off('routeChangeStart', sync)
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
// the current shift, in-memory) so a page can never crash on it.
export function useWorkingDay(): WorkingDay {
  const ctx = useContext(WorkingDayContext)
  if (ctx) return ctx
  // Fallback: behaves like an isolated local state for this render.
  // (Should not happen in-app since _app wraps everything in the provider.)
  const cur = getCurrentShift()
  return {
    date: cur.date,
    shiftType: cur.shiftType,
    setDate: () => {},
    setShiftType: () => {},
  }
}
