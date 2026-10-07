import { useEffect, useState } from 'react'
import { getHeaders, authFetch } from '../lib/api'
import { formatDateTimeToDisplay } from '../lib/dateUtils'

const BASE = '/api/v1'

interface OpeningData {
  attendant_name: string
  started: boolean
  verified_at: string | null
  discrepancy_note: string | null
  handover_phase: string | null
  nozzles: {
    nozzle_id: string; display_label: string | null; fuel_type_abbrev: string | null; fuel_type: string
    electronic: number; mechanical: number; source: string
  }[]
  stock_count_confirmed: boolean
  stock_count_note: string | null
  forecourt_live: boolean
  stock: {
    group: string; label: string; item_key: string; system: number; counted: number; additions: number
    review: { status: string; responsibility: string | null; confirmed_qty: number | null } | null
  }[]
}

const SOURCE_LABEL: Record<string, string> = {
  attendant_entry: 'Entered by attendant',
  previous_shift: 'Previous shift closing',
  nozzle_current: 'Current meter',
}

const RESPONSIBILITY_LABEL: Record<string, string> = {
  previous_shift: 'previous shift',
  this_attendant: 'this attendant',
  stores_error: 'stores error',
}

const fmtReading = (v: number) => Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })

/**
 * Manager+ view of one attendant on a shift: whether they have started, their
 * opening meter readings, and the Forecourt count they took over (system vs
 * counted, any difference's review status, stock issued since they started).
 */
export default function AttendantOpeningPanel({ shiftId, attendantId }: { shiftId: string; attendantId: string }) {
  const [data, setData] = useState<OpeningData | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setData(null)
    setError('')
    authFetch(`${BASE}/handover/attendant-opening?shift_id=${encodeURIComponent(shiftId)}&attendant_id=${encodeURIComponent(attendantId)}`,
      { headers: getHeaders() })
      .then(async r => {
        const body = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(body.detail || 'Could not load opening details')
        return body
      })
      .then(d => { if (!cancelled) setData(d) })
      .catch(e => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [shiftId, attendantId])

  if (error) return <p className="text-sm text-status-error mt-3">{error}</p>
  if (!data) return <p className="text-sm text-content-secondary mt-3">Loading opening details...</p>

  const anyAdditions = data.stock.some(s => s.additions !== 0)

  return (
    <div className="mt-3 space-y-4 border-t border-surface-border pt-3">
      <p className="text-sm">
        {data.started ? (
          <span className="text-status-success font-medium">
            Started{data.verified_at ? ` ${formatDateTimeToDisplay(data.verified_at)}` : ''}
          </span>
        ) : (
          <span className="text-status-warning font-medium">Not started yet</span>
        )}
        {data.discrepancy_note && (
          <span className="block text-xs text-content-secondary mt-1">Attendant's note on readings: {data.discrepancy_note}</span>
        )}
      </p>

      <div>
        <p className="text-xs font-semibold uppercase text-content-secondary mb-1">Opening meter readings</p>
        {data.nozzles.length === 0 ? (
          <p className="text-sm text-content-secondary">No nozzles assigned.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-surface-bg">
                  {['Nozzle', 'Electronic', 'Mechanical', 'From'].map(h => (
                    <th key={h} className="px-3 py-1.5 text-left text-xs font-medium text-content-secondary">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.nozzles.map(n => (
                  <tr key={n.nozzle_id} className="border-t border-surface-border">
                    <td className="px-3 py-1.5 text-content-primary">
                      {n.fuel_type_abbrev && n.display_label ? `${n.fuel_type_abbrev} ${n.display_label}` : n.display_label || n.nozzle_id}
                    </td>
                    <td className="px-3 py-1.5 font-mono text-content-primary">{fmtReading(n.electronic)}</td>
                    <td className="px-3 py-1.5 font-mono text-content-primary">{fmtReading(n.mechanical)}</td>
                    <td className="px-3 py-1.5 text-xs text-content-secondary">{SOURCE_LABEL[n.source] || n.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {data.stock.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase text-content-secondary mb-1">Forecourt count</p>
          <p className="text-xs text-content-secondary mb-2">
            {data.stock_count_confirmed
              ? 'Counted by the attendant at shift start.'
              : data.started
                ? 'Shift started before shift-start counts were in use; figures are the system count.'
                : 'Not counted yet. This is the system count the attendant will be asked to confirm.'}
          </p>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-surface-bg">
                  {['Item', 'System', ...(data.stock_count_confirmed ? ['Counted', 'Difference'] : []),
                    ...(anyAdditions ? ['Issued since start'] : [])].map(h => (
                    <th key={h} className="px-3 py-1.5 text-left text-xs font-medium text-content-secondary">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.stock.map(s => {
                  const diff = s.counted - s.system
                  return (
                    <tr key={s.item_key} className="border-t border-surface-border">
                      <td className="px-3 py-1.5 text-content-primary">
                        <span className="text-xs text-content-secondary mr-1">{s.group}</span>{s.label}
                      </td>
                      <td className="px-3 py-1.5 font-mono text-content-primary">{s.system}</td>
                      {data.stock_count_confirmed && (
                        <>
                          <td className="px-3 py-1.5 font-mono text-content-primary">{s.counted}</td>
                          <td className="px-3 py-1.5 text-xs">
                            {diff === 0 ? (
                              <span className="text-status-success">Matches</span>
                            ) : (
                              <span className={diff < 0 ? 'text-status-error' : 'text-status-warning'}>
                                {diff > 0 ? '+' : ''}{diff}
                                {s.review && (s.review.status === 'resolved'
                                  ? ` (resolved${s.review.responsibility ? `: ${RESPONSIBILITY_LABEL[s.review.responsibility] || s.review.responsibility}` : ''})`
                                  : ' (pending review)')}
                              </span>
                            )}
                          </td>
                        </>
                      )}
                      {anyAdditions && (
                        <td className="px-3 py-1.5 font-mono text-content-primary">
                          {s.additions === 0 ? '' : `${s.additions > 0 ? '+' : ''}${s.additions}`}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {data.stock_count_note && (
            <p className="text-xs text-content-secondary mt-1">Attendant's note on the count: {data.stock_count_note}</p>
          )}
        </div>
      )}
    </div>
  )
}
