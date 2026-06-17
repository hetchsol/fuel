import { useState, useEffect } from 'react'
import useSWR from 'swr'
import { getDaily, getFlags, getTankLevels, isManagerOrAbove, authFetch, getHeaders } from '../lib/api'
import TankCard from '../components/TankCard'
import DayChecklist from '../components/DayChecklist'
import AttendantShiftCard from '../components/AttendantShiftCard'
import LoadingSpinner from '../components/LoadingSpinner'
import { useWorkingDay } from '../contexts/WorkingDayContext'
import { formatDateToDisplay } from '../lib/dateUtils'

function fmtZMW(n: number) {
  return `ZMW ${n.toLocaleString('en-ZM', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtL(n: number) {
  return `${n.toLocaleString('en-ZM', { minimumFractionDigits: 0, maximumFractionDigits: 1 })} L`
}

const BASE = '/api/v1'
type CardPeriod = 'today' | 'week' | 'month'
const PERIOD_LABELS: Record<CardPeriod, string> = { today: 'TODAY', week: 'THIS WEEK', month: 'THIS MONTH' }
const NEXT_PERIOD: Record<CardPeriod, CardPeriod> = { today: 'week', week: 'month', month: 'today' }

function getPeriodTotals(salesSummary: any, daily: any, date: string, period: CardPeriod) {
  const dates: any[] = salesSummary?.dates || []
  if (period === 'today') {
    const d = dates.find((x: any) => x.date === date)
    return {
      volume:  d?.total_volume  ?? daily?.summary?.total_volume  ?? null,
      revenue: d?.total_amount  ?? daily?.summary?.total_revenue ?? null,
    }
  }
  const cutoff = new Date(date)
  cutoff.setDate(cutoff.getDate() - (period === 'week' ? 6 : 29))
  const cutoffStr = cutoff.toISOString().slice(0, 10)
  const relevant = dates.filter((x: any) => x.date >= cutoffStr && x.date <= date)
  return {
    volume:  relevant.reduce((s: number, x: any) => s + (x.total_volume ?? 0), 0),
    revenue: relevant.reduce((s: number, x: any) => s + (x.total_amount ?? 0), 0),
  }
}

/* ── Empty State Illustration ─────────────────────── */
function EmptyState({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 animate-fade-in-up">
      <svg className="w-20 h-20 text-content-secondary/30 mb-4 animate-float" fill="none" viewBox="0 0 80 80" stroke="currentColor" strokeWidth={1}>
        <rect x="10" y="16" width="60" height="48" rx="6" />
        <path d="M10 28h60" />
        <circle cx="20" cy="22" r="2" fill="currentColor" />
        <circle cx="28" cy="22" r="2" fill="currentColor" />
        <circle cx="36" cy="22" r="2" fill="currentColor" />
        <path d="M24 42h32M24 50h20" strokeLinecap="round" />
      </svg>
      <p className="text-sm font-medium text-content-secondary/60">{title}</p>
      <p className="text-xs text-content-secondary/40 mt-1">{subtitle}</p>
    </div>
  )
}

export default function Home() {
  const { date, setDate } = useWorkingDay()
  const [userRole, setUserRole] = useState<string>('')
  const [cardPeriod, setCardPeriod] = useState<CardPeriod>('today')
  const [alertsExpanded, setAlertsExpanded] = useState(false)

  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (userData) setUserRole(JSON.parse(userData).role || '')
  }, [])

  const { data: daily, error: dailyError } = useSWR(['daily', date], () => getDaily(date))
  const { data: flags, error: flagsError } = useSWR('flags', () => getFlags(10))
  const { data: tanks, error: tanksError, mutate: mutateTanks } = useSWR('tanks', getTankLevels, {
    refreshInterval: 30000,
  })
  const { data: salesSummary } = useSWR(
    isManagerOrAbove(userRole) ? 'salesSummary' : null,
    () => authFetch(`${BASE}/sales-reports/summary`, { headers: getHeaders() }).then(r => r.ok ? r.json() : null),
  )
  const { data: notifications } = useSWR(
    isManagerOrAbove(userRole) ? 'notifications-brief' : null,
    () => authFetch(`${BASE}/notifications/?limit=50`, { headers: getHeaders() }).then(r => r.ok ? r.json() : []),
  )
  const { data: allShifts } = useSWR('shifts-dashboard', () =>
    authFetch(`${BASE}/shifts/`, { headers: getHeaders() }).then(r => r.ok ? r.json() : []),
  )

  const allTanks = tanks || []
  const periodTotals = getPeriodTotals(salesSummary, daily, date, cardPeriod)
  const todayShift = (allShifts || []).find((s: any) => s.date === date && s.status === 'active')
  const onShiftNames: string[] = todayShift?.attendants || []
  const shiftType: string = todayShift?.shift_type || ''
  const notifs: any[] = Array.isArray(notifications) ? notifications : []
  const notifCounts = {
    critical: notifs.filter(n => n.severity === 'critical').length,
    high:     notifs.filter(n => n.severity === 'high').length,
    medium:   notifs.filter(n => n.severity === 'medium').length,
    info:     notifs.filter(n => n.severity === 'info').length,
  }

  return (
    <div>
      {/* Page Header */}
      <div className="mb-8 animate-fade-in-up-1">
        <h1 className="text-3xl font-bold text-content-primary tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-content-secondary">Overview of daily operations and alerts</p>
      </div>

      {/* Date Picker */}
      <div className="mb-6 animate-fade-in-up-2">
        <label className="block text-sm font-medium text-content-secondary mb-2">
          Select Date
        </label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="block w-full sm:w-auto px-3 py-2 border border-surface-border rounded-input shadow-sm focus:outline-none focus:ring-action-primary focus:border-action-primary"
        />
      </div>

      {/* Today's Flow launchpad — read-only day-chain status for managers/owners */}
      {isManagerOrAbove(userRole) && (
        <div className="mb-6 animate-fade-in-up-2">
          <DayChecklist date={date} />
        </div>
      )}

      {/* Attendant "start / continue your shift" landing card */}
      {userRole === 'user' && (
        <div className="mb-6 animate-fade-in-up-2">
          <AttendantShiftCard />
        </div>
      )}

      {/* On Shift Now */}
      <div className="mb-6 animate-fade-in-up-2">
        <div className="glass-card-static p-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-center gap-3 shrink-0">
              <div className="w-9 h-9 rounded-xl bg-action-secondary/15 flex items-center justify-center">
                <svg className="w-5 h-5 text-action-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <div>
                <p className="text-xs font-semibold text-content-secondary uppercase tracking-wide">On Shift Now</p>
                {shiftType && <p className="text-[10px] text-content-secondary/50">{shiftType} Shift</p>}
              </div>
            </div>
            <div className="flex-1 flex flex-wrap gap-2">
              {!allShifts ? (
                <span className="text-xs text-content-secondary/50">Loading...</span>
              ) : onShiftNames.length === 0 ? (
                <span className="text-xs text-content-secondary/50">No active shift for this date</span>
              ) : (
                onShiftNames.map((name, i) => (
                  <span key={i} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-action-secondary/10 border border-action-secondary/20 text-xs font-medium text-action-secondary">
                    <span className="w-1.5 h-1.5 rounded-full bg-action-secondary animate-pulse" />
                    {name}
                  </span>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tank Cards */}
      <div className="grid gap-6 mb-6 animate-fade-in-up-2" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, 320px), 1fr))` }}>
        {!tanks && !tanksError && (
          <div className="col-span-full"><LoadingSpinner text="Loading tanks..." /></div>
        )}
        {tanksError && (
          <div className="col-span-full text-status-error text-sm p-3 bg-status-error-light rounded-btn">Failed to load tank data</div>
        )}
        {tanks && allTanks.length === 0 && (
          <div className="col-span-full">
            <EmptyState title="No tanks configured" subtitle="Add tanks in Infrastructure settings" />
          </div>
        )}
        {allTanks.map((tank: any) => {
          const fuelType = tank.fuel_type as 'Diesel' | 'Petrol'
          const tankLabel = tank.display_name || undefined
          return (
            <TankCard
              key={tank.tank_id}
              fuelType={fuelType}
              tank={tank}
              tankId={tank.tank_id}
              tankLabel={tankLabel}
              tanksError={tanksError}
              mutateTanks={mutateTanks}
            />
          )
        })}
      </div>

      {/* Summary + Discrepancies */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6 animate-fade-in-up-3">
        {/* Daily Summary */}
        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-action-primary/10 flex items-center justify-center">
              <svg className="w-5 h-5 text-action-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-content-primary">Daily Summary</h2>
          </div>
          {dailyError && (
            <div className="text-status-error text-sm p-3 bg-status-error-light rounded-btn">Failed to load daily summary</div>
          )}
          {!dailyError && !daily && (
            <LoadingSpinner text="Loading..." />
          )}
          {daily && (
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'Date', value: formatDateToDisplay(daily.date) || 'N/A' },
                { label: 'Transactions', value: daily.summary?.total_transactions ?? 0 },
                { label: 'Volume Sold', value: daily.summary?.total_volume != null ? fmtL(daily.summary.total_volume) : '—' },
                { label: 'Revenue', value: daily.summary?.total_revenue != null ? fmtZMW(daily.summary.total_revenue) : '—' },
              ].map((item) => (
                <div key={item.label} className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.04]">
                  <p className="text-xs text-content-secondary mb-1">{item.label}</p>
                  <p className="text-xl font-bold text-content-primary">{item.value}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Discrepancies */}
        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-status-error/10 flex items-center justify-center">
              <svg className="w-5 h-5 text-status-error" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-content-primary">Recent Discrepancies</h2>
          </div>
          {flagsError && (
            <div className="text-status-error text-sm p-3 bg-status-error-light rounded-btn">Failed to load discrepancies</div>
          )}
          {!flagsError && !flags && (
            <LoadingSpinner text="Loading..." />
          )}
          {flags && (
            <div>
              {flags.length === 0 ? (
                <EmptyState title="No discrepancies found" subtitle="All systems operating normally" />
              ) : (
                <ul className="space-y-2 max-h-64 overflow-y-auto">
                  {flags.map((flag: any, idx: number) => (
                    <li key={idx} className="p-3 bg-status-error-light/50 border border-status-error/30 rounded-xl">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[10px] font-bold uppercase tracking-wide text-status-error/70">{flag.severity}</span>
                        <span className="text-[10px] text-status-error/50">{flag.tank_id} - {flag.fuel_type}</span>
                      </div>
                      <p className="text-sm font-medium text-status-error">{flag.message}</p>
                      <p className="text-xs text-status-error/60 mt-1">{formatDateToDisplay(flag.date)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 animate-fade-in-up-4">
        {/* Volume Sold — click cycles today / week / month */}
        <button
          onClick={() => setCardPeriod(p => NEXT_PERIOD[p])}
          className="stat-card glass-card border border-action-primary/20 text-left"
          style={{ background: 'linear-gradient(135deg, rgba(0,122,255,0.08) 0%, rgba(22,42,74,0.65) 100%)' }}
        >
          <div className="flex items-start justify-between mb-4">
            <div className="w-12 h-12 rounded-2xl bg-action-primary/15 flex items-center justify-center shadow-glow-blue">
              <svg className="w-6 h-6 text-action-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
              </svg>
            </div>
            <span className="text-[10px] font-semibold text-action-primary bg-action-primary/10 px-2 py-1 rounded-badge">{PERIOD_LABELS[cardPeriod]}</span>
          </div>
          <p className="text-2xl font-extrabold text-action-primary tracking-tight">
            {periodTotals.volume != null ? fmtL(periodTotals.volume) : '-'}
          </p>
          <p className="text-sm font-medium text-content-secondary mt-1">Volume Sold</p>
          <p className="text-xs text-content-secondary/50 mt-0.5">Tap to cycle period</p>
        </button>

        {/* Revenue — shares same period */}
        <button
          onClick={() => setCardPeriod(p => NEXT_PERIOD[p])}
          className="stat-card glass-card border border-status-success/20 text-left"
          style={{ background: 'linear-gradient(135deg, rgba(77,182,172,0.08) 0%, rgba(22,42,74,0.65) 100%)' }}
        >
          <div className="flex items-start justify-between mb-4">
            <div className="w-12 h-12 rounded-2xl bg-status-success/15 flex items-center justify-center shadow-glow-success">
              <svg className="w-6 h-6 text-status-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <span className="text-[10px] font-semibold text-status-success bg-status-success/10 px-2 py-1 rounded-badge">{PERIOD_LABELS[cardPeriod]}</span>
          </div>
          <p className="text-2xl font-extrabold text-status-success tracking-tight">
            {periodTotals.revenue != null ? fmtZMW(periodTotals.revenue) : '-'}
          </p>
          <p className="text-sm font-medium text-content-secondary mt-1">Revenue</p>
          <p className="text-xs text-content-secondary/50 mt-0.5">Tap to cycle period</p>
        </button>

        {/* Alerts — click toggles to notification severity breakdown */}
        <button
          onClick={() => setAlertsExpanded(e => !e)}
          className="stat-card glass-card border border-status-warning/20 text-left"
          style={{ background: 'linear-gradient(135deg, rgba(255,193,7,0.08) 0%, rgba(22,42,74,0.65) 100%)' }}
        >
          <div className="flex items-start justify-between mb-4">
            <div className="w-12 h-12 rounded-2xl bg-status-warning/15 flex items-center justify-center shadow-glow-warning">
              <svg className="w-6 h-6 text-status-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </div>
            <span className="text-[10px] font-semibold text-status-warning bg-status-warning/10 px-2 py-1 rounded-badge">ALERTS</span>
          </div>
          {!alertsExpanded ? (
            <>
              <p className="text-4xl font-extrabold text-status-warning tracking-tight">{flags?.length || 0}</p>
              <p className="text-sm font-medium text-content-secondary mt-1">Discrepancies</p>
              <p className="text-xs text-content-secondary/50 mt-0.5">Tap to see notifications</p>
            </>
          ) : (
            <>
              <div className="space-y-2 mt-1">
                {([
                  { label: 'Critical', count: notifCounts.critical, color: 'text-status-error' },
                  { label: 'High',     count: notifCounts.high,     color: 'text-status-warning' },
                  { label: 'Medium',   count: notifCounts.medium,   color: 'text-action-primary' },
                  { label: 'Info',     count: notifCounts.info,     color: 'text-content-secondary' },
                ] as const).map(row => (
                  <div key={row.label} className="flex items-center justify-between">
                    <span className={`text-xs font-medium ${row.color}`}>{row.label}</span>
                    <span className={`text-sm font-bold ${row.color}`}>{row.count}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-content-secondary/50 mt-3">Tap to go back</p>
            </>
          )}
        </button>
      </div>
    </div>
  )
}
