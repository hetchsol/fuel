// "Today" launchpad — a live, read-only checklist of the day's operational
// chain (shift → tank dips → handovers → close-off) with a deep link into the
// right page for each step.
//
// This is purely a navigation + status overlay. It only issues GETs and never
// mutates anything; every number it shows is computed by the same endpoints the
// individual pages already call. Removing it changes no behaviour anywhere.
// (See Manager_Flow_Simplification_Plan.md item 1.)
//
// NOTE: it deliberately does NOT call /shifts/current/active — that endpoint
// *creates* a shift as a side effect. We read /shifts/ (side-effect free) and
// pick out the day's shift instead.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { authFetch, getHeaders } from '../lib/api'

const BASE = '/api/v1'

type StepState = 'done' | 'attention' | 'todo' | 'idle'

interface Step {
  key: string
  label: string
  detail: string
  state: StepState
  href: string
  cta: string
}

const STATE_STYLES: Record<StepState, { dot: string; ring: string; symbol: string }> = {
  done:      { dot: 'bg-status-success',  ring: 'border-status-success/40',  symbol: '✓' },
  attention: { dot: 'bg-status-warning',  ring: 'border-status-warning/40',  symbol: '!' },
  todo:      { dot: 'bg-status-error',    ring: 'border-status-error/40',    symbol: '○' },
  idle:      { dot: 'bg-content-secondary/40', ring: 'border-white/10',      symbol: '·' },
}

export default function DayChecklist({ date }: { date: string }) {
  const [loading, setLoading] = useState(true)
  const [steps, setSteps] = useState<Step[]>([])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const opts = { headers: getHeaders() }
    const asJson = (r: Response) => (r.ok ? r.json() : null)

    async function load() {
      // All read-only GETs — the launchpad never mutates.
      const [shiftsRes, queueRes, closeRes] = await Promise.all([
        authFetch(`${BASE}/shifts/`, opts).then(asJson).catch(() => null),
        authFetch(`${BASE}/handover/review-queue?date=${date}`, opts).then(asJson).catch(() => null),
        authFetch(`${BASE}/daily-close-off/summary?date=${date}`, opts).then(asJson).catch(() => null),
      ])

      const shifts: any[] = Array.isArray(shiftsRes) ? shiftsRes : []
      const dayShifts = shifts.filter(s => s.date === date)
      const activeShift = dayShifts.find(s => s.status === 'active') || dayShifts[0] || null
      const attendantCount = activeShift
        ? (activeShift.assignments?.length || activeShift.attendants?.length || 0)
        : 0

      // Tank dips — only checkable once we have a shift id.
      let dips: any[] = []
      if (activeShift?.shift_id) {
        dips = (await authFetch(
          `${BASE}/shifts/${encodeURIComponent(activeShift.shift_id)}/tank-dip-readings`, opts,
        ).then(asJson).catch(() => null)) || []
      }

      if (cancelled) return

      const pending = queueRes?.pending || 0
      const flagged = queueRes?.flagged || 0
      const awaiting = queueRes?.awaiting_closing || 0
      const approvedToday = queueRes?.approved_today || 0
      const outstanding = pending + flagged + awaiting

      const closed = !!closeRes?.already_closed
      const unapproved = closeRes?.unapproved_handovers?.length || 0
      const approved = closeRes?.approved_handovers?.length || 0

      const built: Step[] = [
        {
          key: 'shift',
          label: 'Shift set up',
          state: attendantCount > 0 ? 'done' : activeShift ? 'attention' : 'todo',
          detail: attendantCount > 0
            ? `${attendantCount} attendant${attendantCount !== 1 ? 's' : ''} assigned`
            : activeShift ? 'Shift exists but no attendants assigned' : 'No shift for this day',
          href: '/shifts',
          cta: attendantCount > 0 ? 'Manage' : 'Set up',
        },
        {
          key: 'dips',
          label: 'Tank dips recorded',
          state: !activeShift ? 'idle' : dips.length > 0 ? 'done' : 'todo',
          detail: !activeShift ? 'Waiting for a shift'
            : dips.length > 0 ? `${dips.length} tank${dips.length !== 1 ? 's' : ''} recorded`
            : 'No dip readings yet',
          href: '/shifts',
          cta: 'Record',
        },
        {
          key: 'handovers',
          label: 'Handovers reviewed',
          state: outstanding > 0 ? 'attention' : approvedToday > 0 ? 'done' : 'idle',
          detail: outstanding > 0
            ? `${outstanding} outstanding — ${pending} pending, ${flagged} flagged, ${awaiting} awaiting closing`
            : approvedToday > 0 ? `${approvedToday} approved` : 'Nothing to review yet',
          href: '/handover-review',
          cta: outstanding > 0 ? 'Review' : 'Open',
        },
        {
          key: 'close',
          label: 'Day closed',
          state: closed ? 'done' : unapproved > 0 ? 'todo' : approved > 0 ? 'attention' : 'idle',
          detail: closed ? 'Closed and locked'
            : unapproved > 0 ? `${unapproved} handover(s) need approval first`
            : approved > 0 ? 'Ready to close — bank deposit pending'
            : 'Nothing to close yet',
          href: '/daily-close-off',
          cta: 'Close-off',
        },
      ]
      setSteps(built)
      setLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, [date])

  return (
    <div className="glass-card p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl bg-action-primary/10 flex items-center justify-center">
          <svg className="w-5 h-5 text-action-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7M5 5l7 7-7 7" />
          </svg>
        </div>
        <div>
          <h2 className="text-lg font-semibold text-content-primary">Today&apos;s Flow</h2>
          <p className="text-xs text-content-secondary">Where the day stands — and what&apos;s next</p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="h-12 rounded-xl bg-white/[0.03] animate-pulse" />
          ))}
        </div>
      ) : (
        <ol className="space-y-2">
          {steps.map((step, idx) => {
            const s = STATE_STYLES[step.state]
            return (
              <li
                key={step.key}
                className={`flex items-center gap-3 p-3 rounded-xl border ${s.ring} bg-white/[0.02]`}
              >
                <span className={`shrink-0 w-6 h-6 rounded-full ${s.dot} text-white text-xs font-bold flex items-center justify-center`}>
                  {s.symbol}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-content-primary">
                    <span className="text-content-secondary/60 mr-1.5">{idx + 1}.</span>
                    {step.label}
                  </p>
                  <p className="text-xs text-content-secondary truncate">{step.detail}</p>
                </div>
                <Link
                  href={step.href}
                  className="shrink-0 px-3 py-1.5 text-xs font-medium rounded-btn border border-surface-border text-action-primary hover:bg-action-primary/10 transition-colors"
                >
                  {step.cta} →
                </Link>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
