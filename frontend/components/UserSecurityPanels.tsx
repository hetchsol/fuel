import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import { authFetch } from '../lib/api'
import { formatDateToDisplay, formatDateTimeToDisplay } from '../lib/dateUtils'

const BASE = '/api/v1'

export interface PasswordStatus {
  exempt: boolean
  due_at: string | null
  days_left: number | null
  must_change: boolean
  remind: boolean
  changed_at: string | null
}

interface Campaign {
  started_at: string
  started_by: string | null
  deadline: string
  days_left: number
  deadline_passed: boolean
  total: number
  changed: number
  pending: { username: string; full_name: string }[]
}

interface Device {
  device_id: string
  label: string
  override: 'shared' | 'personal' | null
  shared: boolean
  first_seen: string | null
  last_seen: string | null
  user_agent: string
  users: { username: string; full_name: string; last_seen: string }[]
}

/** Zambia-time calendar date (YYYY-MM-DD) of an ISO timestamp. */
const catDate = (iso: string) => new Date(new Date(iso).getTime() + 2 * 3600 * 1000).toISOString().slice(0, 10)

/** Short plain-words password state for the Users table. */
export function passwordLabel(st?: PasswordStatus | null): { text: string; tone: 'ok' | 'warn' | 'bad' | 'muted' } {
  if (!st) return { text: '-', tone: 'muted' }
  if (st.exempt) return { text: 'Not required', tone: 'muted' }
  if (st.must_change) return { text: 'Must change now', tone: 'bad' }
  if (st.remind) return { text: `${st.days_left} day${st.days_left === 1 ? '' : 's'} left`, tone: 'warn' }
  if (st.changed_at) return { text: `Changed ${formatDateToDisplay(catDate(st.changed_at))}`, tone: 'ok' }
  return { text: 'Not changed yet', tone: 'muted' }
}

function describeBrowser(ua: string): string {
  if (!ua) return 'Unknown browser'
  const os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iPhone/iPad'
    : /Windows/i.test(ua) ? 'Windows' : /Mac OS/i.test(ua) ? 'Mac' : /Linux/i.test(ua) ? 'Linux' : 'Other'
  const br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox'
    : /Safari\//.test(ua) ? 'Safari' : 'Browser'
  return `${br} on ${os}`
}

/** Owner: start the 7-day countdown for all staff, then follow who has changed. */
export function StaffPasswordPanel({ onChanged }: { onChanged: () => void }) {
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await authFetch(`${BASE}/auth/password-status`)
      if (res.ok) setCampaign((await res.json()).campaign || null)
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const start = async () => {
    setBusy(true)
    try {
      const res = await authFetch(`${BASE}/auth/password-campaign`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Could not start the countdown.')
      setCampaign(data)
      setConfirming(false)
      toast.success(`Countdown started. ${data.total} staff have been asked to change their password.`)
      onChanged()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (!loaded) return null
  const running = campaign && !campaign.deadline_passed

  return (
    <div className="mb-6 rounded-lg border border-surface-border bg-surface-card p-4">
      <p className="text-sm font-semibold text-content-primary">Staff passwords</p>
      {running && campaign ? (
        <p className="text-sm text-content-secondary mt-1">
          Countdown running{campaign.started_by === 'system' ? ' (started by the system)' : ''}:{' '}
          {campaign.days_left} day{campaign.days_left === 1 ? '' : 's'} left (deadline{' '}
          {formatDateToDisplay(catDate(campaign.deadline))}). {campaign.changed} of {campaign.total} have changed their
          password. A prompt has been sent to the rest.
        </p>
      ) : (
        <>
          <p className="text-sm text-content-secondary mt-1">
            {campaign
              ? `Last countdown ended ${formatDateToDisplay(catDate(campaign.deadline))}: ${campaign.changed} of ${campaign.total} changed in time. `
              : ''}
            Every attendant, supervisor and manager is shown a reminder at each sign-in and must change their password
            within 7 days, then every 90 days. Owner passwords are not affected.
          </p>
          {!confirming ? (
            <button onClick={() => setConfirming(true)}
              className="mt-3 px-3 py-1.5 text-xs font-semibold rounded bg-action-primary text-white">
              Require all staff to change their password
            </button>
          ) : (
            <div className="mt-3 rounded border border-status-warning bg-status-warning/5 p-3 space-y-2">
              <p className="text-sm text-content-primary">
                Start a 7-day countdown now? Staff who have not changed their password by the deadline will have to
                change it before they can do anything else.
              </p>
              <div className="flex gap-2">
                <button onClick={start} disabled={busy}
                  className="px-3 py-1.5 text-xs font-semibold rounded bg-action-primary text-white disabled:opacity-50">
                  {busy ? 'Starting...' : 'Start countdown'}
                </button>
                <button onClick={() => setConfirming(false)} disabled={busy}
                  className="px-3 py-1.5 text-xs rounded border border-surface-border text-content-secondary">Cancel</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

/** Manager/owner: devices people sign in on, and which count as shared. */
export function DevicesPanel() {
  const [devices, setDevices] = useState<Device[]>([])
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await authFetch(`${BASE}/auth/devices`)
      if (res.ok) setDevices(await res.json())
    } catch {}
  }, [])

  useEffect(() => { load() }, [load])

  const update = async (d: Device, override: Device['override'], label?: string) => {
    setBusy(d.device_id)
    try {
      const res = await authFetch(`${BASE}/auth/devices/${encodeURIComponent(d.device_id)}`, {
        method: 'PATCH', body: JSON.stringify({ override, label: label ?? d.label }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Could not update the device.')
      load()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mt-8 rounded-lg border border-surface-border bg-surface-card overflow-hidden">
      <div className="px-4 py-3 border-b border-surface-border">
        <p className="text-sm font-semibold text-content-primary">Devices</p>
        <p className="text-xs text-content-secondary mt-0.5">
          A device two or more people sign in on is treated as shared: it signs out after 5 minutes without
          activity, when the browser is closed, and after an attendant hands over, and asks the browser not to save
          passwords. Also turn off &quot;Offer to save passwords&quot; in Chrome settings on every shared tablet - a
          website cannot fully stop the browser saving them.
        </p>
      </div>
      {devices.length === 0 ? (
        <p className="px-4 py-3 text-xs text-content-secondary">No sign-ins recorded yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-surface-bg">
              <tr>
                {['Device', 'Used by', 'Last used', 'Treated as', 'Setting'].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-xs font-medium uppercase text-content-secondary whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {devices.map(d => (
                <tr key={d.device_id} className="border-t border-surface-border align-top">
                  <td className="px-3 py-2">
                    <input defaultValue={d.label} placeholder={describeBrowser(d.user_agent)}
                      onBlur={e => { if (e.target.value.trim() !== d.label) update(d, d.override, e.target.value) }}
                      className="w-44 px-2 py-1 text-sm rounded border border-surface-border bg-surface-bg text-content-primary" />
                    <p className="text-xs text-content-secondary mt-0.5">{describeBrowser(d.user_agent)}</p>
                  </td>
                  <td className="px-3 py-2 text-content-primary">
                    {d.users.slice(0, 4).map(u => u.full_name).join(', ')}
                    {d.users.length > 4 ? `, and ${d.users.length - 4} more` : ''}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-content-secondary">
                    {d.last_seen ? formatDateTimeToDisplay(d.last_seen) : '-'}
                  </td>
                  <td className={`px-3 py-2 font-medium ${d.shared ? 'text-status-warning' : 'text-content-primary'}`}>
                    {d.shared ? 'Shared' : 'Personal'}
                  </td>
                  <td className="px-3 py-2">
                    <select value={d.override || 'auto'} disabled={busy === d.device_id}
                      onChange={e => update(d, e.target.value === 'auto' ? null : e.target.value as Device['override'])}
                      className="px-2 py-1 text-sm rounded border border-surface-border bg-surface-bg text-content-primary">
                      <option value="auto">Automatic</option>
                      <option value="shared">Always shared</option>
                      <option value="personal">Always personal</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
