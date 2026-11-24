import { useState } from 'react'
import toast from 'react-hot-toast'
import { authFetch } from '../lib/api'

const BASE = '/api/v1'
const MIN_LENGTH = 8

/**
 * Current password, new password twice. Used by the forced-change window and
 * by "Change password" in the name menu. The fields never let the browser
 * offer to fill in or save a password on a shared device.
 */
export default function ChangePasswordForm({ username, shared, onDone, onCancel }: {
  username: string
  shared: boolean
  onDone: () => void
  onCancel?: () => void
}) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [again, setAgain] = useState('')
  const [busy, setBusy] = useState(false)

  const problem =
    !next ? '' :
    next.length < MIN_LENGTH ? `At least ${MIN_LENGTH} characters.` :
    next === current ? 'Must be different from your current password.' :
    next.trim().toLowerCase() === (username || '').trim().toLowerCase() ? 'Cannot be your username.' :
    again && again !== next ? 'The two new passwords do not match.' : ''
  const ready = !!current && !!next && again === next && !problem

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ready) return
    setBusy(true)
    try {
      const res = await authFetch(`${BASE}/auth/change-password`, {
        method: 'POST',
        body: JSON.stringify({ current_password: current, new_password: next }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Could not change the password.')
      toast.success('Password changed.')
      setCurrent(''); setNext(''); setAgain('')
      onDone()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  // On a shared device: no autofill and no "save password" offer where the browser honours it
  const auto = (kind: 'current-password' | 'new-password') => (shared ? 'off' : kind)
  const input = 'w-full px-3 py-2 text-sm rounded border border-surface-border bg-surface-bg text-content-primary'

  return (
    <form onSubmit={submit} className="space-y-3" autoComplete={shared ? 'off' : 'on'}>
      <div>
        <label className="block text-xs font-medium text-content-secondary mb-1">Current password</label>
        <input type="password" value={current} onChange={e => setCurrent(e.target.value)}
          autoComplete={auto('current-password')} className={input} />
      </div>
      <div>
        <label className="block text-xs font-medium text-content-secondary mb-1">New password</label>
        <input type="password" value={next} onChange={e => setNext(e.target.value)}
          autoComplete={auto('new-password')} className={input} />
      </div>
      <div>
        <label className="block text-xs font-medium text-content-secondary mb-1">New password again</label>
        <input type="password" value={again} onChange={e => setAgain(e.target.value)}
          autoComplete={auto('new-password')} className={input} />
      </div>
      <p className={`text-xs ${problem ? 'text-status-error' : 'text-content-secondary'}`}>
        {problem || `At least ${MIN_LENGTH} characters, different from the old one, and not your username.`}
      </p>
      <div className="flex justify-end gap-2">
        {onCancel && (
          <button type="button" onClick={onCancel} disabled={busy}
            className="px-4 py-2 text-sm rounded border border-surface-border text-content-secondary">Cancel</button>
        )}
        <button type="submit" disabled={busy || !ready}
          className="px-4 py-2 text-sm font-semibold rounded bg-action-primary text-white disabled:opacity-50">
          {busy ? 'Saving...' : 'Change password'}
        </button>
      </div>
    </form>
  )
}
