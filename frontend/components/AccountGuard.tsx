import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { authFetch, PASSWORD_CHANGE_EVENT } from '../lib/api'
import { formatDateToDisplay } from '../lib/dateUtils'
import ChangePasswordForm from './ChangePasswordForm'

const BASE = '/api/v1'

// Window events other screens use to reach this component
export const OPEN_CHANGE_PASSWORD_EVENT = 'open-change-password'
export const HANDOVER_SUBMITTED_EVENT = 'handover-submitted'
// Set at every sign-in (login page); sessionStorage, so it is gone once the browser is closed
export const SESSION_MARK = 'sharedSessionAlive'

const IDLE_LIMIT_MS = 5 * 60 * 1000          // shared devices sign out after 5 minutes without activity
const IDLE_WARN_MS = IDLE_LIMIT_MS - 30 * 1000
const CHANNEL = 'fuel-shared-session'

interface PasswordStatus {
  exempt: boolean
  due_at: string | null
  days_left: number | null
  must_change: boolean
  remind: boolean
}

interface Campaign {
  deadline: string
  days_left: number
  deadline_passed: boolean
  total: number
  changed: number
  pending: { username: string; full_name: string }[]
}

/** Zambia-time calendar date (YYYY-MM-DD) of an ISO timestamp. */
function catDate(iso: string | number): string {
  return new Date(new Date(iso).getTime() + 2 * 3600 * 1000).toISOString().slice(0, 10)
}

function dismissKey(kind: string, username: string): string {
  const token = (typeof window !== 'undefined' && localStorage.getItem('accessToken')) || ''
  // A new sign-in (new token) or a new day brings the reminder back
  return `pwReminderOk:${kind}:${username}:${token.slice(-12)}:${catDate(Date.now())}`
}

function isDismissed(key: string): boolean {
  try { return localStorage.getItem(key) === '1' } catch { return false }
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

/**
 * Lives in the Layout for every signed-in user:
 *  - password reminder (last 7 days before it is due) on each sign-in and each new day, OK hides it;
 *  - the owner's countdown for staff (days left, how many have changed);
 *  - a window that cannot be closed once the password has expired;
 *  - "Change password" from the name menu;
 *  - on a shared device: sign out after 5 minutes without activity, when the browser
 *    is closed, and after the attendant submits their handover.
 */
export default function AccountGuard({ username, role, onLogout }: {
  username: string
  role: string
  onLogout: (reason?: string) => void
}) {
  const [status, setStatus] = useState<PasswordStatus | null>(null)
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [shared, setShared] = useState<boolean>(() => {
    try { return localStorage.getItem('sharedDevice') === '1' } catch { return false }
  })
  const [forced, setForced] = useState(false)
  const [showChange, setShowChange] = useState(false)
  const [, setTick] = useState(0)                       // re-render after OK
  const [idleWarnLeft, setIdleWarnLeft] = useState<number | null>(null)
  const lastActivity = useRef(Date.now())
  // The Layout passes a new function each render; keep the latest without restarting timers
  const logoutRef = useRef(onLogout)
  logoutRef.current = onLogout

  const load = useCallback(async () => {
    try {
      const res = await authFetch(`${BASE}/auth/password-status`)
      if (!res.ok) return
      const data = await res.json()
      setStatus(data.password_status)
      setCampaign(data.campaign || null)
      setShared(!!data.device_shared)
      try { localStorage.setItem('sharedDevice', data.device_shared ? '1' : '0') } catch {}
      if (data.password_status?.must_change) setForced(true)
    } catch {
      // Not critical: the server still refuses requests once the password has expired.
    }
  }, [])

  // On load, every 10 minutes (the countdown changes at midnight), and when the server says it has expired
  useEffect(() => {
    load()
    const t = setInterval(load, 10 * 60 * 1000)
    const onForced = () => { setForced(true); load() }
    const onOpen = () => setShowChange(true)
    window.addEventListener(PASSWORD_CHANGE_EVENT, onForced)
    window.addEventListener(OPEN_CHANGE_PASSWORD_EVENT, onOpen)
    return () => {
      clearInterval(t)
      window.removeEventListener(PASSWORD_CHANGE_EVENT, onForced)
      window.removeEventListener(OPEN_CHANGE_PASSWORD_EVENT, onOpen)
    }
  }, [load])

  // ── shared device: no sign-in survives closing the browser ─────────
  useEffect(() => {
    if (!shared || typeof BroadcastChannel === 'undefined') return
    const ch = new BroadcastChannel(CHANNEL)
    let alive = false
    try { alive = sessionStorage.getItem(SESSION_MARK) === '1' } catch {}
    ch.onmessage = (e) => {
      if (e.data === 'ping' && alive) ch.postMessage('pong')
      if (e.data === 'pong' && !alive) {
        alive = true
        try { sessionStorage.setItem(SESSION_MARK, '1') } catch {}
      }
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    if (!alive) {
      // A tab opened from a signed-in tab is fine; a browser opened fresh is not.
      ch.postMessage('ping')
      timer = setTimeout(() => {
        if (!alive) logoutRef.current('This shared device was closed. Please sign in again.')
      }, 600)
    }
    return () => { if (timer) clearTimeout(timer); ch.close() }
  }, [shared])

  // ── shared device: sign out after 5 minutes without activity ───────
  useEffect(() => {
    if (!shared) { setIdleWarnLeft(null); return }
    lastActivity.current = Date.now()
    const touch = () => { lastActivity.current = Date.now(); setIdleWarnLeft(null) }
    const events = ['pointerdown', 'keydown', 'touchstart', 'wheel', 'scroll']
    events.forEach(ev => window.addEventListener(ev, touch, { passive: true, capture: true }))
    const t = setInterval(() => {
      const idle = Date.now() - lastActivity.current
      if (idle >= IDLE_LIMIT_MS) {
        logoutRef.current('Signed out after 5 minutes without activity.')
      } else if (idle >= IDLE_WARN_MS) {
        setIdleWarnLeft(Math.ceil((IDLE_LIMIT_MS - idle) / 1000))
      }
    }, 1000)
    return () => {
      clearInterval(t)
      events.forEach(ev => window.removeEventListener(ev, touch, { capture: true } as any))
    }
  }, [shared])

  // ── shared device: sign out once the attendant has handed over ─────
  useEffect(() => {
    const onHandover = () => {
      if (!shared) return
      toast.success('Handover submitted. Signing out of this shared device.')
      setTimeout(() => logoutRef.current(), 4000)
    }
    window.addEventListener(HANDOVER_SUBMITTED_EVENT, onHandover)
    return () => window.removeEventListener(HANDOVER_SUBMITTED_EVENT, onHandover)
  }, [shared])

  const dismiss = (kind: string) => {
    try { localStorage.setItem(dismissKey(kind, username), '1') } catch {}
    setTick(t => t + 1)
  }

  const afterChange = () => {
    setForced(false)
    setShowChange(false)
    load()
  }

  const dueDate = status?.due_at ? formatDateToDisplay(catDate(status.due_at)) : ''
  const showStaffReminder = !forced && !showChange && !!status?.remind && !isDismissed(dismissKey('staff', username))
  const campaignOpen = !!campaign && (!campaign.deadline_passed || campaign.pending.length > 0)
  const showOwnerReminder = role === 'owner' && !forced && !showChange && campaignOpen
    && !isDismissed(dismissKey('owner', username))

  return (
    <>
      {forced && (
        <Modal>
          <h2 className="text-lg font-semibold text-content-primary">Your password has expired</h2>
          <p className="text-sm text-content-secondary">
            Change it now to continue. Anything you had typed on this page is still there; save it again after
            changing your password.
          </p>
          <ChangePasswordForm username={username} shared={shared} onDone={afterChange} />
          <button onClick={() => onLogout()} className="text-xs text-content-secondary underline">Log out instead</button>
        </Modal>
      )}

      {!forced && showChange && (
        <Modal>
          <h2 className="text-lg font-semibold text-content-primary">Change password</h2>
          <ChangePasswordForm username={username} shared={shared} onDone={afterChange}
            onCancel={() => setShowChange(false)} />
        </Modal>
      )}

      {showStaffReminder && status && (
        <Modal>
          <h2 className="text-lg font-semibold text-content-primary">Your password is expiring</h2>
          <p className="text-sm text-content-primary">
            {status.days_left === 1
              ? 'Your password expires tomorrow.'
              : `Your password expires in ${plural(status.days_left || 0, 'day')}.`}
            {dueDate ? ` From ${dueDate} you will have to change it before you can continue.` : ''}
          </p>
          <p className="text-sm text-content-secondary">Please change your password now.</p>
          <div className="flex justify-end gap-2">
            <button onClick={() => dismiss('staff')}
              className="px-4 py-2 text-sm rounded border border-surface-border text-content-secondary">OK</button>
            <button onClick={() => { dismiss('staff'); setShowChange(true) }}
              className="px-4 py-2 text-sm font-semibold rounded bg-action-primary text-white">Change password now</button>
          </div>
        </Modal>
      )}

      {showOwnerReminder && campaign && (
        <Modal>
          <h2 className="text-lg font-semibold text-content-primary">Staff password change</h2>
          {campaign.deadline_passed ? (
            <p className="text-sm text-content-primary">
              The deadline has passed. {plural(campaign.pending.length, 'staff member')} had not changed their
              password and must change it before they can continue.
            </p>
          ) : (
            <p className="text-sm text-content-primary">
              Attendants, supervisors and managers have {plural(campaign.days_left, 'day')} to change their
              password (deadline {formatDateToDisplay(catDate(campaign.deadline))}). A prompt has been sent to them.
            </p>
          )}
          <p className="text-sm text-content-secondary">
            {campaign.changed} of {campaign.total} have changed their password.
            {campaign.pending.length > 0 && ` Still to change: ${campaign.pending.slice(0, 6).map(p => p.full_name).join(', ')}`}
            {campaign.pending.length > 6 ? `, and ${campaign.pending.length - 6} more.` : campaign.pending.length > 0 ? '.' : ''}
          </p>
          <div className="flex justify-end gap-2">
            <Link href="/users" onClick={() => dismiss('owner')}
              className="px-4 py-2 text-sm rounded border border-surface-border text-content-secondary">View users</Link>
            <button onClick={() => dismiss('owner')}
              className="px-4 py-2 text-sm font-semibold rounded bg-action-primary text-white">OK</button>
          </div>
        </Modal>
      )}

      {idleWarnLeft !== null && !forced && (
        <Modal>
          <h2 className="text-lg font-semibold text-content-primary">Still there?</h2>
          <p className="text-sm text-content-primary">
            This is a shared device. You will be signed out in {idleWarnLeft} seconds. Anything not saved will be lost.
          </p>
          <div className="flex justify-end">
            <button onClick={() => { lastActivity.current = Date.now(); setIdleWarnLeft(null) }}
              className="px-4 py-2 text-sm font-semibold rounded bg-action-primary text-white">Stay signed in</button>
          </div>
        </Modal>
      )}
    </>
  )
}

function Modal({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <div className="bg-surface-card rounded-lg shadow-xl w-full max-w-md p-5 space-y-3" role="dialog" aria-modal="true">
        {children}
      </div>
    </div>
  )
}
