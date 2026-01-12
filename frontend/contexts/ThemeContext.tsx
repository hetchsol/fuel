import React, { createContext, useContext, useState } from 'react'

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

type FuelType = 'diesel' | 'petrol' | null

interface ThemeContextType {
  theme: ThemeColors
  fuelType: FuelType
  setFuelType: (fuel: FuelType) => void
}

const defaultTheme: ThemeColors = {
  primary: '#3B82F6',
  secondary: '#10B981',
  accent: '#F59E0B',
  primaryLight: '#EFF6FF',
  secondaryLight: '#D1FAE5',
  accentLight: '#FEF3C7',
  background: '#F9FAFB',
  cardBg: '#FFFFFF',
  textPrimary: '#111827',
  textSecondary: '#6B7280',
  border: '#E5E7EB'
}

const dieselTheme: ThemeColors = {
  primary: '#524F81',
  secondary: '#7A77A8',
  accent: '#3D3A61',
  primaryLight: '#E8E7F0',
  secondaryLight: '#F0EFF7',
  accentLight: '#D4D3E1',
  background: '#F5F4FA',
  cardBg: '#FFFFFF',
  textPrimary: '#111827',
  textSecondary: '#524F81',
  border: '#D4D3E1'
}

const petrolTheme: ThemeColors = {
  primary: '#006D57',
  secondary: '#009B7D',
  accent: '#004D3D',
  primaryLight: '#E0F2EE',
  secondaryLight: '#E6F7F3',
  accentLight: '#CCE8E1',
  background: '#F0FAF7',
  cardBg: '#FFFFFF',
  textPrimary: '#111827',
  textSecondary: '#006D57',
  border: '#CCE8E1'
}

const ThemeContext = createContext<ThemeContextType>({
  theme: defaultTheme,
  fuelType: null,
  setFuelType: () => {}
})

export const useTheme = () => useContext(ThemeContext)

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [fuelType, setFuelType] = useState<FuelType>(null)

  const getTheme = (): ThemeColors => {
    if (fuelType === 'diesel') return dieselTheme
    if (fuelType === 'petrol') return petrolTheme
    return defaultTheme
  }

  const theme = getTheme()

  return (
    <ThemeContext.Provider value={{ theme, fuelType, setFuelType }}>
      {children}
    </ThemeContext.Provider>
  )
}
