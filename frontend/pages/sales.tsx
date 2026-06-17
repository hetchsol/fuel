import { authFetch, BASE, getHeaders } from '../lib/api'
import { useState, useEffect } from 'react'
import Pagination from '../components/Pagination'

const PAGE_SIZE = 25

interface SaleRecord {
  sale_id: string
  shift_id: string
  fuel_type: string
  mechanical_volume: number
  electronic_volume: number
  average_volume: number
  discrepancy_percent: number
  unit_price: number
  total_amount: number
  validation_status: string
  nozzle_id?: string
  date?: string
  created_at?: string
}

export default function Sales() {
  const [records, setRecords] = useState<SaleRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)

  useEffect(() => {
    async function fetchSales() {
      try {
        const res = await authFetch(`${BASE}/sales`, { headers: getHeaders() })
        if (!res.ok) {
          setError('Failed to load sale records')
          return
        }
        const data = await res.json()
        // Sort newest first
        const sorted = [...data].sort((a, b) => {
          const da = a.date || a.created_at || ''
          const db = b.date || b.created_at || ''
          return db.localeCompare(da)
        })
        setRecords(sorted)
      } catch {
        setError('Failed to load sale records')
      } finally {
        setLoading(false)
      }
    }
    fetchSales()
  }, [])

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-content-primary">Sale Records</h1>
        <p className="mt-2 text-sm text-content-secondary">
          Historical standalone sale calculations. Authoritative nozzle readings are entered
          through Start Shift and End Shift.
        </p>
      </div>

      <div className="mb-6 p-4 bg-surface-card border border-surface-border rounded-lg">
        <p className="text-sm font-medium text-content-primary">Note</p>
        <p className="text-sm text-content-secondary mt-1">
          Records here were created through the standalone sale calculator. They are not linked
          to shift handovers and do not appear in shift reconciliation. All current nozzle
          readings are captured automatically when attendants close their shifts.
        </p>
      </div>

      {loading && (
        <div className="text-center py-12 text-content-secondary">Loading...</div>
      )}

      {error && (
        <div className="p-4 bg-status-error-light border border-status-error rounded-md">
          <p className="text-sm text-status-error">{error}</p>
        </div>
      )}

      {!loading && !error && records.length === 0 && (
        <div className="text-center py-12 text-content-secondary">No sale records found.</div>
      )}

      {!loading && records.length > 0 && (
        <div className="bg-surface-card rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-surface-border">
            <thead className="bg-surface-bg">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase">Shift ID</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase">Fuel</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase">Nozzle</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-content-secondary uppercase">Mech. (L)</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-content-secondary uppercase">Elec. (L)</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-content-secondary uppercase">Avg. (L)</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-content-secondary uppercase">Total (K)</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-content-secondary uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {records.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((r) => (
                <tr key={r.sale_id} className="hover:bg-surface-bg">
                  <td className="px-4 py-3 text-sm text-content-primary">
                    {r.date || (r.created_at ? r.created_at.slice(0, 10) : '-')}
                  </td>
                  <td className="px-4 py-3 text-sm text-content-secondary font-mono">{r.shift_id}</td>
                  <td className="px-4 py-3 text-sm text-content-primary">{r.fuel_type}</td>
                  <td className="px-4 py-3 text-sm text-content-secondary">{r.nozzle_id || '-'}</td>
                  <td className="px-4 py-3 text-sm text-right font-mono">{r.mechanical_volume.toFixed(2)}</td>
                  <td className="px-4 py-3 text-sm text-right font-mono">{r.electronic_volume.toFixed(2)}</td>
                  <td className="px-4 py-3 text-sm text-right font-mono">{r.average_volume.toFixed(2)}</td>
                  <td className="px-4 py-3 text-sm text-right font-mono font-semibold">{r.total_amount.toFixed(2)}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                      r.validation_status === 'PASS'
                        ? 'bg-status-success-light text-status-success'
                        : 'bg-status-error-light text-status-error'
                    }`}>
                      {r.validation_status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination total={records.length} pageSize={PAGE_SIZE} page={page} onPageChange={setPage} />
        </div>
      )}
    </div>
  )
}
