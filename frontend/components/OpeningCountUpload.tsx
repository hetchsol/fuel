import { useState, useEffect, useCallback, useRef } from 'react'
import toast from 'react-hot-toast'
import { getHeaders, authFetch } from '../lib/api'

const BASE = '/api/v1'

interface PreviewRow {
  row: number
  item_key: string | null
  category: string
  product_code: string
  name: string
  stores_now: number | null
  stores_new: number | null
  forecourt_now: number | null
  forecourt_new: number | null
  is_new_item: boolean
  stores_changes: boolean
  forecourt_changes: boolean
  errors: string[]
}

interface Preview {
  file_name: string
  rows: PreviewRow[]
  missing: { item_key: string; name: string }[]
  error_rows: number
  stores_changes: number
  forecourt_changes: number
  blocks: string[]
  can_apply: boolean
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// File uploads go through plain fetch: authFetch would force a JSON content type.
async function postSheet(path: string, file: File, extra: Record<string, string> = {}) {
  const form = new FormData()
  form.append('file', file)
  Object.entries(extra).forEach(([k, v]) => form.append(k, v))
  const res = await fetch(`${BASE}${path}`, { method: 'POST', headers: getHeaders(), body: form })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const detail = typeof data.detail === 'string' ? data.detail : 'The server could not process the sheet.'
    throw new Error(detail)
  }
  return data
}

const fmt = (n: number | null) => (n === null || n === undefined ? 'not set up' : String(n))

/**
 * Stores page, owner only, before go-live: download the stock count sheet,
 * upload it filled in, preview every change, then set all Stores and
 * Forecourt counts in one step (optionally going live on them at once).
 */
export default function OpeningCountUpload({ onChanged }: { onChanged: () => void }) {
  const [live, setLive] = useState<boolean | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [onlyChanges, setOnlyChanges] = useState(true)
  const [goLive, setGoLive] = useState(true)
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const loadStatus = useCallback(async () => {
    try {
      const res = await authFetch(`${BASE}/stores/forecourt-status`, { headers: getHeaders() })
      if (res.ok) setLive(!!(await res.json()).live_since)
    } catch {
      // Card is supplementary; the rest of the page still works without it.
    }
  }, [])

  useEffect(() => { loadStatus() }, [loadStatus])

  const reset = () => {
    setFile(null)
    setPreview(null)
    setConfirmed(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  const download = async () => {
    setBusy(true)
    try {
      const res = await authFetch(`${BASE}/stores/count-template`, { headers: getHeaders() })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.detail || 'Download failed')
      }
      const disposition = res.headers.get('Content-Disposition') || ''
      const match = disposition.match(/filename=(.+)/)
      downloadBlob(await res.blob(), match ? match[1] : 'Stock_Count.xlsx')
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  const check = async (f: File) => {
    setBusy(true)
    setFile(f)
    setPreview(null)
    setConfirmed(false)
    try {
      setPreview(await postSheet('/stores/count-upload/preview', f))
    } catch (err: any) {
      toast.error(err.message)
      reset()
    } finally {
      setBusy(false)
    }
  }

  const apply = async () => {
    if (!file) return
    setBusy(true)
    try {
      const data = await postSheet('/stores/count-upload/apply', file, { go_live: goLive ? 'true' : 'false' })
      const changed = data.stores_changed + data.forecourt_changed
      toast.success(
        `Counts set: ${changed} change${changed === 1 ? '' : 's'}` +
        (data.items_created ? `, ${data.items_created} item(s) added to Stores` : '') +
        (data.went_live ? '. Forecourt counts are now live.' : '.'))
      reset()
      loadStatus()
      onChanged()
    } catch (err: any) {
      toast.error(err.message)
      // Re-check so the screen shows what is stopping it now
      if (file) check(file)
    } finally {
      setBusy(false)
    }
  }

  if (live !== false) return null

  const rows = preview
    ? preview.rows.filter(r => !onlyChanges || r.errors.length || r.stores_changes || r.forecourt_changes || r.is_new_item)
    : []

  return (
    <div className="rounded-lg border border-surface-border bg-surface-card p-4 space-y-3">
      <div>
        <p className="text-sm font-semibold text-content-primary">Opening stock upload</p>
        <p className="text-xs text-content-secondary mt-1">
          Count every lubricant, LPG accessory and LPG cylinder (full and empty separately) at a shift change, with
          no attendant on shift. Fill in the sheet and upload it. Nothing changes until you apply, and the whole
          sheet is applied or none of it.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={download} disabled={busy}
          className="px-3 py-1.5 text-xs font-medium rounded border border-surface-border text-content-secondary hover:bg-surface-bg disabled:opacity-50">
          1. Download stock count sheet
        </button>
        <label className={`px-3 py-1.5 text-xs font-semibold rounded bg-action-primary text-white cursor-pointer ${busy ? 'opacity-50 pointer-events-none' : ''}`}>
          2. Upload filled sheet
          <input ref={inputRef} type="file" accept=".xlsx" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) check(f) }} />
        </label>
        {file && <span className="text-xs text-content-secondary">{file.name}</span>}
        {busy && !preview && file && <span className="text-xs text-content-secondary">Checking...</span>}
      </div>

      {preview && (
        <div className="space-y-3">
          <p className="text-sm text-content-primary">
            {preview.rows.length} item{preview.rows.length === 1 ? '' : 's'} on the sheet.
            {' '}{preview.stores_changes} Stores count{preview.stores_changes === 1 ? '' : 's'} and
            {' '}{preview.forecourt_changes} Forecourt count{preview.forecourt_changes === 1 ? '' : 's'} will change.
          </p>

          {(preview.blocks.length > 0 || preview.error_rows > 0 || preview.missing.length > 0) && (
            <div className="rounded border border-status-error bg-status-error/5 p-3 space-y-1">
              <p className="text-sm font-semibold text-status-error">This sheet cannot be applied yet</p>
              <ul className="text-xs text-content-secondary list-disc pl-4 space-y-0.5">
                {preview.blocks.map(b => <li key={b}>{b}.</li>)}
                {preview.error_rows > 0 && (
                  <li>{preview.error_rows} row{preview.error_rows === 1 ? ' has' : 's have'} problems - see the table. Fix them in the sheet and upload again.</li>
                )}
                {preview.missing.length > 0 && (
                  <li>
                    {preview.missing.length} item{preview.missing.length === 1 ? ' is' : 's are'} not on the sheet:
                    {' '}{preview.missing.slice(0, 8).map(m => m.name).join(', ')}
                    {preview.missing.length > 8 ? `, and ${preview.missing.length - 8} more` : ''}.
                    {' '}Download a new sheet - it lists every item.
                  </li>
                )}
              </ul>
            </div>
          )}

          <label className="flex items-center gap-2 text-xs text-content-secondary cursor-pointer">
            <input type="checkbox" checked={onlyChanges} onChange={e => setOnlyChanges(e.target.checked)} />
            Show only changes and problems
          </label>

          <div className="overflow-auto max-h-96 border border-surface-border rounded">
            <table className="min-w-full text-sm">
              <thead className="bg-surface-bg sticky top-0">
                <tr>
                  {['Row', 'Item', 'Stores now', 'Stores new', 'Forecourt now', 'Forecourt new', 'Problem'].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-medium uppercase text-content-secondary whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr><td colSpan={7} className="px-3 py-3 text-xs text-content-secondary">No changes - every count already matches.</td></tr>
                )}
                {rows.map(r => (
                  <tr key={r.row} className={`border-t border-surface-border ${r.errors.length ? 'bg-status-error/5' : ''}`}>
                    <td className="px-3 py-1.5 font-mono text-content-secondary">{r.row}</td>
                    <td className="px-3 py-1.5 text-content-primary">
                      {r.name}
                      {r.is_new_item && <span className="ml-2 text-xs text-content-secondary">(new in Stores)</span>}
                    </td>
                    <td className="px-3 py-1.5 font-mono text-content-secondary">{fmt(r.stores_now)}</td>
                    <td className={`px-3 py-1.5 font-mono ${r.stores_changes ? 'text-status-warning font-semibold' : 'text-content-primary'}`}>{r.stores_new ?? '-'}</td>
                    <td className="px-3 py-1.5 font-mono text-content-secondary">{fmt(r.forecourt_now)}</td>
                    <td className={`px-3 py-1.5 font-mono ${r.forecourt_changes ? 'text-status-warning font-semibold' : 'text-content-primary'}`}>{r.forecourt_new ?? '-'}</td>
                    <td className="px-3 py-1.5 text-xs text-status-error">{r.errors.join('; ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {preview.can_apply && (
            <div className="space-y-2">
              <label className="flex items-start gap-2 text-sm text-content-primary cursor-pointer">
                <input type="checkbox" className="mt-0.5" checked={goLive} onChange={e => setGoLive(e.target.checked)} />
                <span>
                  Go live on these counts now
                  <span className="block text-xs text-content-secondary">
                    From the next shift, each attendant confirms or corrects these Forecourt counts at shift start.
                    Doing both in one step means no shift can start in between. This can only be done once.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm text-content-primary cursor-pointer">
                <input type="checkbox" className="mt-0.5" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />
                <span>I have checked these figures against the physical count.</span>
              </label>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button onClick={reset} disabled={busy}
              className="px-4 py-2 text-sm rounded border border-surface-border text-content-secondary">Cancel</button>
            <button onClick={apply} disabled={busy || !preview.can_apply || !confirmed}
              className="px-4 py-2 text-sm font-semibold rounded bg-action-primary text-white disabled:opacity-50">
              {busy ? 'Applying...' : goLive ? 'Apply counts and go live' : 'Apply counts'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
