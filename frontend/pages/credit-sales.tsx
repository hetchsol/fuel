import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/router'
import LoadingSpinner from '../components/LoadingSpinner'
import { getHeaders, authFetch } from '../lib/api'
import { formatDateToDisplay } from '../lib/dateUtils'

const BASE = '/api/v1'

interface CreditSaleRow {
  sale_id: string
  account_id: string
  account_name: string
  attendant_id: string
  attendant_name: string
  shift_type: string
  date: string
  fuel_type: string
  volume: number
  amount: number
  driver_name?: string | null
  vehicle_reg?: string | null
  coupon_serial?: string | null
  auth_reference?: string | null
}

export default function CreditSales() {
  const router = useRouter()
  const [userRole, setUserRole] = useState('')
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<CreditSaleRow[]>([])
  const [accounts, setAccounts] = useState<any[]>([])
  const [staff, setStaff] = useState<any[]>([])

  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [shiftType, setShiftType] = useState('All')
  const [attendantId, setAttendantId] = useState('All')
  const [fuelType, setFuelType] = useState('All')
  const [accountId, setAccountId] = useState('All')

  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (!userData) { router.push('/login'); return }
    const user = JSON.parse(userData)
    setUserRole(user.role || '')
    if (!['manager', 'owner'].includes(user.role)) { router.push('/') }
  }, [router])

  useEffect(() => {
    authFetch(`${BASE}/accounts/`, { headers: getHeaders() })
      .then(r => r.ok ? r.json() : [])
      .then(data => setAccounts(Array.isArray(data) ? data : []))
      .catch(() => {})
    authFetch(`${BASE}/auth/staff`, { headers: getHeaders() })
      .then(r => r.ok ? r.json() : [])
      .then(data => setStaff(Array.isArray(data) ? data.filter((u: any) => u.role === 'user' || u.role === 'supervisor') : []))
      .catch(() => {})
  }, [])

  const fetchSales = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (fromDate) params.set('from_date', fromDate)
      if (toDate) params.set('to_date', toDate)
      if (shiftType !== 'All') params.set('shift_type', shiftType)
      if (attendantId !== 'All') params.set('attendant_id', attendantId)
      if (fuelType !== 'All') params.set('fuel_type', fuelType)
      if (accountId !== 'All') params.set('account_id', accountId)

      const res = await authFetch(`${BASE}/accounts/sales?${params.toString()}`, { headers: getHeaders() })
      const data = await res.json().catch(() => [])
      setRows(res.ok && Array.isArray(data) ? data : [])
    } catch {
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [fromDate, toDate, shiftType, attendantId, fuelType, accountId])

  useEffect(() => { fetchSales() }, [fetchSales])

  if (!['manager', 'owner'].includes(userRole)) return null

  const fmt = (v: number) => `K${(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const fuelTypes = Array.from(new Set(rows.map(r => r.fuel_type).filter(Boolean)))
  const totalAmount = rows.reduce((s, r) => s + (r.amount || 0), 0)
  const totalVolume = rows.reduce((s, r) => s + (r.volume || 0), 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-content-primary">Credit Sales</h1>
        <p className="text-sm text-content-secondary mt-1">
          Every credit sale, filterable by date, shift, attendant, fuel/product, and client.
        </p>
      </div>

      <div className="glass-card p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-content-secondary mb-1">From date</label>
            <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
              className="px-3 py-2 rounded-lg border border-surface-border bg-surface-bg text-content-primary text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-content-secondary mb-1">To date</label>
            <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
              className="px-3 py-2 rounded-lg border border-surface-border bg-surface-bg text-content-primary text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-content-secondary mb-1">Shift</label>
            <select value={shiftType} onChange={e => setShiftType(e.target.value)}
              className="px-3 py-2 rounded-lg border border-surface-border bg-surface-bg text-content-primary text-sm">
              {['All', 'Day', 'Night'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-content-secondary mb-1">Attendant</label>
            <select value={attendantId} onChange={e => setAttendantId(e.target.value)}
              className="px-3 py-2 rounded-lg border border-surface-border bg-surface-bg text-content-primary text-sm">
              <option value="All">All</option>
              {staff.map((s: any) => <option key={s.user_id} value={s.user_id}>{s.full_name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-content-secondary mb-1">Fuel / Product</label>
            <select value={fuelType} onChange={e => setFuelType(e.target.value)}
              className="px-3 py-2 rounded-lg border border-surface-border bg-surface-bg text-content-primary text-sm">
              <option value="All">All</option>
              {fuelTypes.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-content-secondary mb-1">Client</label>
            <select value={accountId} onChange={e => setAccountId(e.target.value)}
              className="px-3 py-2 rounded-lg border border-surface-border bg-surface-bg text-content-primary text-sm">
              <option value="All">All</option>
              {accounts.map((a: any) => <option key={a.account_id} value={a.account_id}>{a.account_name}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="glass-card p-6">
        {loading ? (
          <LoadingSpinner text="Loading credit sales..." />
        ) : rows.length === 0 ? (
          <p className="text-center text-sm text-content-secondary py-8">No credit sales match these filters.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-6 mb-4 text-sm">
              <div><span className="text-content-secondary">Sales: </span><span className="font-semibold text-content-primary">{rows.length}</span></div>
              <div><span className="text-content-secondary">Total volume: </span><span className="font-semibold text-content-primary">{totalVolume.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span></div>
              <div><span className="text-content-secondary">Total amount: </span><span className="font-semibold text-content-primary">{fmt(totalAmount)}</span></div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-border">
                    <th className="text-left py-2 px-3 text-xs font-semibold text-content-secondary">Date</th>
                    <th className="text-left py-2 px-3 text-xs font-semibold text-content-secondary">Shift</th>
                    <th className="text-left py-2 px-3 text-xs font-semibold text-content-secondary">Attendant</th>
                    <th className="text-left py-2 px-3 text-xs font-semibold text-content-secondary">Client</th>
                    <th className="text-left py-2 px-3 text-xs font-semibold text-content-secondary">Fuel / Product</th>
                    <th className="text-right py-2 px-3 text-xs font-semibold text-content-secondary">Volume</th>
                    <th className="text-right py-2 px-3 text-xs font-semibold text-content-secondary">Amount</th>
                    <th className="text-left py-2 px-3 text-xs font-semibold text-content-secondary">Vehicle / Ref.</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.sale_id} className="border-b border-surface-border/50">
                      <td className="py-2 px-3 text-content-primary">{formatDateToDisplay(r.date)}</td>
                      <td className="py-2 px-3 text-content-secondary">{r.shift_type || '-'}</td>
                      <td className="py-2 px-3 text-content-primary">{r.attendant_name || '-'}</td>
                      <td className="py-2 px-3 text-content-primary font-medium">{r.account_name}</td>
                      <td className="py-2 px-3 text-content-secondary">{r.fuel_type}</td>
                      <td className="py-2 px-3 text-right font-mono text-content-primary">{r.volume.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                      <td className="py-2 px-3 text-right font-mono font-medium text-content-primary">{fmt(r.amount)}</td>
                      <td className="py-2 px-3 text-content-secondary text-xs">
                        {r.vehicle_reg || '-'}{r.coupon_serial ? ` / ${r.coupon_serial}` : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
