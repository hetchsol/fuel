import React, { createContext, useContext, useState, useEffect } from 'react'

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

type ShiftType = 'Day' | 'Night'

interface WorkingDay {
  date: string
  shiftType: ShiftType
  setDate: (d: string) => void
  setShiftType: (s: ShiftType) => void
}

const todayStr = () => new Date().toISOString().split('T')[0]
const defaultShift = (): ShiftType => {
  const h = new Date().getHours()
  return h >= 6 && h < 18 ? 'Day' : 'Night'
}

const WorkingDayContext = createContext<WorkingDay | null>(null)

export function WorkingDayProvider({ children }: { children: React.ReactNode }) {
  const [date, setDateState] = useState<string>(todayStr())
  const [shiftType, setShiftTypeState] = useState<ShiftType>(defaultShift())

  // Hydrate from sessionStorage on the client only (avoids SSR mismatch).
  useEffect(() => {
    try {
      const d = sessionStorage.getItem('workingDate')
      const s = sessionStorage.getItem('workingShiftType')
      if (d) setDateState(d)
      if (s === 'Day' || s === 'Night') setShiftTypeState(s)
    } catch {
      /* storage unavailable — fall back to in-memory defaults */
    }
  }, [])

  const setDate = (d: string) => {
    setDateState(d)
    try { sessionStorage.setItem('workingDate', d) } catch {}
  }
  const setShiftType = (s: ShiftType) => {
    setShiftTypeState(s)
    try { sessionStorage.setItem('workingShiftType', s) } catch {}
  }

  return (
    <WorkingDayContext.Provider value={{ date, shiftType, setDate, setShiftType }}>
      {children}
    </WorkingDayContext.Provider>
  )
}

// Returns the shared working day. Safe to call without a provider (falls back to
// today / current-shift, in-memory) so a page can never crash on it.
export function useWorkingDay(): WorkingDay {
  const ctx = useContext(WorkingDayContext)
  if (ctx) return ctx
  // Fallback: behaves like an isolated local state for this render.
  // (Should not happen in-app since _app wraps everything in the provider.)
  return {
    date: todayStr(),
    shiftType: defaultShift(),
    setDate: () => {},
    setShiftType: () => {},
  }
}
