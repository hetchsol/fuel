// Attendant "start / continue your shift" landing card.
//
// A read-only wayfinding card for the attendant dashboard: it shows their active
// shift and the single next action, derived from the handover lifecycle the app
// already tracks (phase + review_status). It only issues GETs and mutates
// nothing; every link goes to an existing page. (Attendant_Flow_Simplification_Plan.md item 1.)

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { authFetch, getHeaders } from '../lib/api'

const BASE = '/api/v1'

type Tone = 'primary' | 'warn' | 'info' | 'done' | 'muted'

interface NextAction {
  tone: Tone
  title: string
  detail: string
  cta?: string
  href?: string
}

const TONE: Record<Tone, { bar: string; btnBg: string }> = {
  primary: { bar: 'var(--color-action-primary)', btnBg: 'var(--color-action-primary)' },
  warn:    { bar: 'var(--color-status-warning)', btnBg: 'var(--color-status-warning)' },
  info:    { bar: 'var(--color-action-primary)', btnBg: 'var(--color-action-primary)' },
  done:    { bar: 'var(--color-status-success)', btnBg: 'var(--color-status-success)' },
  muted:   { bar: 'var(--color-content-secondary)', btnBg: 'var(--color-action-primary)' },
}

export default function AttendantShiftCard() {
  const [loading, setLoading] = useState(true)
  const [action, setAction] = useState<NextAction | null>(null)
  const [shiftLabel, setShiftLabel] = useState('')

  useEffect(() => {
    let cancelled = false
    const opts = { headers: getHeaders() }
    const asJson = (r: Response) => (r.ok ? r.json() : null)

    async function load() {
      // Read-only: current active shift + this attendant's own handovers.
      const [mine, entries] = await Promise.all([
        authFetch(`${BASE}/handover/my-shift`, opts).then(asJson).catch(() => null),
        authFetch(`${BASE}/handover/entries`, opts).then(asJson).catch(() => null),
      ])
      if (cancelled) return

      if (!mine || !mine.found || !mine.shift) {
        setShiftLabel('')
        setAction({
          tone: 'muted',
          title: 'No active shift',
          detail: "You don't have an active shift assigned. Your supervisor assigns shifts.",
        })
        setLoading(false)
        return
      }

      const shift = mine.shift
      setShiftLabel(`${shift.shift_type || ''} shift, ${shift.date || ''}`.replace(/^ shift, /, '').trim())

      // The handover for this shift, if any (entries are this attendant's own).
      const list: any[] = Array.isArray(entries) ? entries : []
      const forShift = list.filter(h => h.shift_id === shift.shift_id && h.phase !== 'readings_superseded')
      // Prefer a returned/reopened one, else the latest.
      const handover =
        forShift.find(h => ['returned', 'reopened'].includes(h.review_status)) ||
        forShift[forShift.length - 1] || null
      const status = handover?.review_status
      const phase = handover?.phase
      const phase1 = mine.readings_verified_handover  // readings done, not yet closed

      let next: NextAction
      if (status === 'returned' || status === 'reopened') {
        next = {
          tone: 'warn',
          title: 'Readings returned — action needed',
          detail: 'A supervisor sent your handover back. Redo your readings and resubmit.',
          cta: 'Redo readings', href: '/my-shift',
        }
      } else if (status === 'approved') {
        next = {
          tone: 'done',
          title: 'Shift approved',
          detail: 'Your handover was approved — nothing more to do.',
          cta: 'View', href: '/my-shift',
        }
      } else if (phase === 'completed') {
        next = {
          tone: 'info',
          title: 'Submitted — awaiting review',
          detail: 'Your shift closing is in with the supervisor for review.',
          cta: 'View', href: '/my-shift',
        }
      } else if (phase1) {
        next = {
          tone: 'primary',
          title: 'Readings done — close your shift',
          detail: 'Count your cash and submit the shift closing.',
          cta: 'Close shift', href: '/shift-closing',
        }
      } else {
        next = {
          tone: 'primary',
          title: 'Start your shift readings',
          detail: 'Enter your nozzle readings and stock counts for this shift.',
          cta: 'Enter readings', href: '/my-shift',
        }
      }
      setAction(next)
      setLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, [])

  if (loading) {
    return <div className="glass-card p-6 h-28 animate-pulse" />
  }
  if (!action) return null

  const tone = TONE[action.tone]
  return (
    <div className="glass-card p-6 border-l-4" style={{ borderLeftColor: tone.bar }}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-content-secondary mb-1">
            {shiftLabel || 'My shift'}
          </p>
          <h2 className="text-lg font-semibold text-content-primary">{action.title}</h2>
          <p className="text-sm text-content-secondary mt-0.5">{action.detail}</p>
        </div>
        {action.cta && action.href && (
          <Link
            href={action.href}
            className="shrink-0 px-5 py-3 text-sm font-semibold rounded-btn text-white text-center"
            style={{ backgroundColor: tone.btnBg }}
          >
            {action.cta}
          </Link>
        )}
      </div>
    </div>
  )
}
