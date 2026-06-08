import { useState, useEffect } from 'react'
import { authFetch, BASE, getHeaders } from '../lib/api'

export interface Tank {
  tank_id: string
  fuel_type: string
  current_level: number
  capacity: number
  last_updated: string
  percentage: number
  display_name?: string  // size-based label, e.g. "Diesel Tank 2 — 14,000 L"
}

// Display label for a tank: the server-computed size-based name, with a safe fallback.
export function tankLabel(t: { display_name?: string; fuel_type?: string; tank_id?: string }): string {
  return t.display_name || (t.fuel_type ? `${t.fuel_type} Tank` : (t.tank_id || 'Tank'))
}

// Fallback defaults only used when API fails and state is empty
const FALLBACK_TANKS: Tank[] = [
  { tank_id: 'TANK-DIESEL', fuel_type: 'Diesel', current_level: 0, capacity: 0, last_updated: '', percentage: 0 },
  { tank_id: 'TANK-PETROL', fuel_type: 'Petrol', current_level: 0, capacity: 0, last_updated: '', percentage: 0 },
]

export function useTanks() {
  const [tanks, setTanks] = useState<Tank[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function fetchTanks() {
      try {
        const res = await authFetch(`${BASE}/tanks/levels`, { headers: getHeaders() })
        if (!res.ok) throw new Error('Failed to fetch tanks')
        const data: Tank[] = await res.json()
        if (!cancelled && data.length > 0) {
          setTanks(data)
        }
      } catch {
        // Use fallback tanks on failure if state is still empty
        if (!cancelled) setTanks(prev => prev.length === 0 ? FALLBACK_TANKS : prev)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchTanks()
    return () => { cancelled = true }
  }, [])

  return { tanks, loading }
}
