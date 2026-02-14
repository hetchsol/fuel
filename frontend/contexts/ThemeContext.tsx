import React, { createContext, useContext, useState, useEffect } from 'react'

/* ── Backward-compatible theme object ──────────────────────── */
interface ThemeColors {
  primary: string
  secondary: string
  accent: string
  primaryLight: string
  secondaryLight: string
  accentLight: string
  background: string
  cardBg: string
  textPrimary: string
  textSecondary: string
  border: string
}

const theme: ThemeColors = {
  primary: 'var(--color-action-primary)',
  secondary: 'var(--color-action-secondary)',
  accent: 'var(--color-status-warning)',
  primaryLight: 'var(--color-action-primary-light)',
  secondaryLight: 'var(--color-action-secondary-light)',
  accentLight: 'var(--color-status-warning-light)',
  background: 'var(--color-bg)',
  cardBg: 'var(--color-bg-card)',
  textPrimary: 'var(--color-text-primary)',
  textSecondary: 'var(--color-text-secondary)',
  border: 'var(--color-border)',
}

/* ── Fuel color helper (fixed, never theme-dependent) ──────── */
export interface FuelColorSet {
  main: string
  light: string
  border: string
  cssMain: string
  cssLight: string
  cssBorder: string
}

export function getFuelColorSet(fuelType: 'diesel' | 'petrol' | 'Diesel' | 'Petrol'): FuelColorSet {
  const ft = fuelType.toLowerCase()
  if (ft === 'diesel') {
    return {
      main: 'var(--color-fuel-diesel)',
      light: 'var(--color-fuel-diesel-light)',
      border: 'var(--color-fuel-diesel-border)',
      cssMain: '#6A1B9A',
      cssLight: '#F3E5F5',
      cssBorder: '#CE93D8',
    }
  }
  return {
    main: 'var(--color-fuel-petrol)',
    light: 'var(--color-fuel-petrol-light)',
    border: 'var(--color-fuel-petrol-border)',
    cssMain: '#2E7D32',
    cssLight: '#E8F5E9',
    cssBorder: '#A5D6A7',
  }
}

/* ── Status color constants ──────────────────────────────────── */
export const statusColors = {
  success:      { bg: 'var(--color-status-success-light)', fg: 'var(--color-status-success)', cssFg: '#00897B', cssBg: '#E0F2F1' },
  pending:      { bg: 'var(--color-status-pending-light)', fg: 'var(--color-status-pending)', cssFg: '#FBC02D', cssBg: '#FFF9C4' },
  warning:      { bg: 'var(--color-status-warning-light)', fg: 'var(--color-status-warning)', cssFg: '#FFB300', cssBg: '#FFF8E1' },
  error:        { bg: 'var(--color-status-error-light)',   fg: 'var(--color-status-error)',   cssFg: '#D32F2F', cssBg: '#FFEBEE' },
}

/* ── Context ─────────────────────────────────────────────────── */
interface ThemeContextType {
  theme: ThemeColors
  isDark: boolean
  toggleDark: () => void
  // Kept as no-ops for backward compatibility during migration
  fuelType: 'diesel' | 'petrol' | null
  setFuelType: (fuel: 'diesel' | 'petrol' | null) => void
}

const ThemeContext = createContext<ThemeContextType>({
  theme,
  isDark: false,
  toggleDark: () => {},
  fuelType: null,
  setFuelType: () => {},
})

export const useTheme = () => useContext(ThemeContext)

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isDark, setIsDark] = useState(false)
  const [fuelType, setFuelType] = useState<'diesel' | 'petrol' | null>(null)

  // Hydrate dark-mode preference from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('theme-mode')
    if (stored === 'dark') {
      setIsDark(true)
      document.documentElement.classList.add('dark')
    }
  }, [])

  const toggleDark = () => {
    setIsDark(prev => {
      const next = !prev
      if (next) {
        document.documentElement.classList.add('dark')
        localStorage.setItem('theme-mode', 'dark')
      } else {
        document.documentElement.classList.remove('dark')
        localStorage.setItem('theme-mode', 'light')
      }
      return next
    })
  }

  return (
    <ThemeContext.Provider value={{ theme, isDark, toggleDark, fuelType, setFuelType }}>
      {children}
    </ThemeContext.Provider>
  )
}
