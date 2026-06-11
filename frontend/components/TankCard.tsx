import { useState, useEffect } from 'react'
import { authFetch } from '../lib/api'
import LoadingSpinner from './LoadingSpinner'

interface TankCardProps {
  fuelType: 'Diesel' | 'Petrol'
  tank: any
  tankId?: string
  tankLabel?: string
  tanksError: any
  mutateTanks: () => void
}

/* ── Animated Tank Gauge ──────────────────────────── */
function TankGauge({ percentage, color }: { percentage: number; color: string }) {
  const fillColor = percentage > 50 ? '#4DB6AC' : percentage > 25 ? '#FFC107' : '#EF5350'
  const bubbleColor = percentage > 50 ? 'rgba(77,182,172,0.3)' : percentage > 25 ? 'rgba(255,193,7,0.3)' : 'rgba(239,83,80,0.3)'

  return (
    <div className="relative w-full h-32 rounded-2xl overflow-hidden border border-white/[0.06]" style={{ background: 'rgba(0,0,0,0.2)' }}>
      {/* Fill level */}
      <div
        className="absolute bottom-0 left-0 right-0 transition-all duration-1000 ease-out"
        style={{
          height: `${percentage}%`,
          background: `linear-gradient(180deg, ${fillColor}40 0%, ${fillColor}20 100%)`,
          borderTop: `2px solid ${fillColor}60`,
        }}
      >
        {/* Animated wave effect */}
        <div className="absolute top-0 left-0 right-0 h-2 overflow-hidden opacity-40">
          <svg className="w-full" viewBox="0 0 400 8" preserveAspectRatio="none">
            <path
              d="M0 4 Q50 0 100 4 Q150 8 200 4 Q250 0 300 4 Q350 8 400 4 L400 8 L0 8 Z"
              fill={fillColor}
            >
              <animateTransform
                attributeName="transform"
                type="translate"
                values="-100,0;0,0"
                dur="3s"
                repeatCount="indefinite"
              />
            </path>
          </svg>
        </div>

        {/* Bubbles */}
        {percentage > 10 && (
          <>
            <div className="absolute bottom-2 left-[20%] w-1.5 h-1.5 rounded-full animate-bubble" style={{ background: bubbleColor, animationDelay: '0s', animationDuration: '2.5s' }} />
            <div className="absolute bottom-2 left-[50%] w-1 h-1 rounded-full animate-bubble" style={{ background: bubbleColor, animationDelay: '0.8s', animationDuration: '3s' }} />
            <div className="absolute bottom-2 left-[75%] w-1.5 h-1.5 rounded-full animate-bubble" style={{ background: bubbleColor, animationDelay: '1.5s', animationDuration: '2.8s' }} />
          </>
        )}
      </div>

      {/* Percentage overlay */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center">
          <span className="text-3xl font-extrabold tracking-tight" style={{ color: fillColor }}>
            {percentage.toFixed(1)}
          </span>
          <span className="text-sm font-medium ml-0.5" style={{ color: fillColor, opacity: 0.7 }}>%</span>
        </div>
      </div>

      {/* Tick marks */}
      <div className="absolute right-2 inset-y-0 flex flex-col justify-between py-2">
        {[100, 75, 50, 25, 0].map(tick => (
          <span key={tick} className="text-[9px] text-white/20 font-mono">{tick}</span>
        ))}
      </div>
    </div>
  )
}

const TankCard = ({
  fuelType,
  tank,
  tankId: tankIdProp,
  tankLabel,
  tanksError,
  mutateTanks
}: TankCardProps) => {
  const isDiesel = fuelType === 'Diesel'
  const accentColor = isDiesel ? 'var(--color-fuel-diesel)' : 'var(--color-fuel-petrol)'
  const accentBorder = isDiesel ? 'var(--color-fuel-diesel-border)' : 'var(--color-fuel-petrol-border)'

  const colors = isDiesel
    ? {
        gradient: 'bg-fuel-diesel-light',
        border: 'border-fuel-diesel-border',
        title: 'text-fuel-diesel',
        badge: 'text-fuel-diesel bg-fuel-diesel-light',
        text: 'text-fuel-diesel',
        boldText: 'text-fuel-diesel',
        lightText: 'text-fuel-diesel/70',
        mediumText: 'text-fuel-diesel',
        button: 'bg-fuel-diesel hover:opacity-90',
        divider: 'border-fuel-diesel-border',
        sectionBg: 'bg-fuel-diesel-light',
        sectionBorder: 'border-fuel-diesel-border',
        inputBorder: 'border-fuel-diesel-border',
        focusRing: 'focus:ring-fuel-diesel focus:border-fuel-diesel',
        lightestText: 'text-fuel-diesel/60',
        sectionDivider: 'border-fuel-diesel-border',
        badgeBg: 'bg-fuel-diesel-light text-fuel-diesel'
      }
    : {
        gradient: 'bg-fuel-petrol-light',
        border: 'border-fuel-petrol-border',
        title: 'text-fuel-petrol',
        badge: 'text-fuel-petrol bg-fuel-petrol-light',
        text: 'text-fuel-petrol',
        boldText: 'text-fuel-petrol',
        lightText: 'text-fuel-petrol/70',
        mediumText: 'text-fuel-petrol',
        button: 'bg-fuel-petrol hover:opacity-90',
        divider: 'border-fuel-petrol-border',
        sectionBg: 'bg-fuel-petrol-light',
        sectionBorder: 'border-fuel-petrol-border',
        inputBorder: 'border-fuel-petrol-border',
        focusRing: 'focus:ring-fuel-petrol focus:border-fuel-petrol',
        lightestText: 'text-fuel-petrol/60',
        sectionDivider: 'border-fuel-petrol-border',
        badgeBg: 'bg-fuel-petrol-light text-fuel-petrol'
      }

  const tankId = tankIdProp || (tank?.tank_id) || `TANK-${fuelType.toUpperCase()}`
  const displayName = tankLabel || `${fuelType} Tank`

  return (
    <div
      className="glass-card p-6 border-l-4 overflow-hidden flex flex-col"
      style={{ borderLeftColor: accentBorder }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: `${accentColor}15` }}
          >
            {isDiesel ? (
              <svg className="w-5 h-5" style={{ color: accentColor }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
              </svg>
            ) : (
              <svg className="w-5 h-5" style={{ color: accentColor }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121z" />
              </svg>
            )}
          </div>
          <div>
            <h2 className={`text-lg font-bold ${colors.title}`}>{displayName}</h2>
            <p className={`text-xs ${colors.lightestText}`}>Real-time level</p>
          </div>
        </div>
        <span className={`text-[10px] font-semibold ${colors.badge} px-2.5 py-1 rounded-badge`}>
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-current mr-1 animate-pulse" />
          LIVE
        </span>
      </div>

      {tanksError && (
        <div className="text-status-error text-sm p-3 bg-status-error-light rounded-xl">Failed to load tank data</div>
      )}
      {!tanksError && !tank && (
        <LoadingSpinner text="Loading tank data..." />
      )}

      {tank && (
        <div className="space-y-4">
          {/* Tank Gauge */}
          <TankGauge percentage={tank.percentage} color={accentColor} />

          {/* Level Info */}
          <div className="flex justify-between items-end">
            <div>
              <span className={`text-xs ${colors.lightText}`}>Current Level</span>
              <p className={`text-2xl font-bold ${colors.boldText}`}>
                {tank.current_level.toLocaleString()} <span className="text-sm font-medium">L</span>
              </p>
            </div>
            <div className="text-right">
              <span className={`text-xs ${colors.lightText}`}>Available</span>
              <p className={`text-sm font-semibold ${colors.mediumText}`}>
                {(tank.capacity - tank.current_level).toLocaleString()} L
              </p>
            </div>
          </div>

          {/* Meta */}
          <div className={`pt-3 border-t ${colors.divider} flex justify-between`}>
            <p className={`text-xs ${colors.lightText}`}>
              Capacity: {tank.capacity.toLocaleString()} L
            </p>
            <p className={`text-xs ${colors.lightestText}`}>
              {new Date(tank.last_updated).toLocaleTimeString()}
            </p>
          </div>

        </div>
      )}
    </div>
  )
}

export default TankCard
