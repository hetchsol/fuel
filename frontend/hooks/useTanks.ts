import { useState, useEffect } from 'react'
import { authFetch, BASE, getHeaders } from '../lib/api'

export interface Tank {
  tank_id: string
  fuel_type: string
  current_level: number
  capacity: number
  last_updated: string
  percentage: number
}

const DEFAULT_TANKS: Tank[] = [
  { tank_id: 'TANK-DIESEL', fuel_type: 'Diesel', current_level: 0, capacity: 0, last_updated: '', percentage: 0 },
  { tank_id: 'TANK-PETROL', fuel_type: 'Petrol', current_level: 0, capacity: 0, last_updated: '', percentage: 0 },
]

export function useTanks() {
  const [tanks, setTanks] = useState<Tank[]>(DEFAULT_TANKS)
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
        // Keep default tanks on failure
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchTanks()
    return () => { cancelled = true }
  }, [])

  return { tanks, loading }
}
