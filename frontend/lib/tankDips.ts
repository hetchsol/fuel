import { BASE, authFetch, getHeaders } from './api'

function getAuthHeaders() {
  return { 'Content-Type': 'application/json', ...getHeaders() }
}

export interface TankInfo {
  tank_id: string
  fuel_type: string
  display_name: string
}

export interface TankDipState {
  closing_dip_cm: string
  already_recorded: boolean
}

export interface TankDipsLoadResult {
  tanks: TankInfo[]
  dips: Record<string, TankDipState>
  allComplete: boolean
}

// Shift-type-scoped on purpose — a Day dip must not read as satisfying a
// Night check on the same date, matching the backend gate exactly.
export async function loadTankDips(date: string, shiftType: string): Promise<TankDipsLoadResult> {
  const [tanksRes, dipsRes] = await Promise.all([
    authFetch(`${BASE}/tanks/`, { headers: getAuthHeaders() }),
    authFetch(`${BASE}/tank-readings/dips?date=${date}&shift_type=${shiftType}`, { headers: getAuthHeaders() }),
  ])
  const tanks: TankInfo[] = tanksRes.ok ? await tanksRes.json() : []
  const existingDips: any[] = dipsRes.ok ? await dipsRes.json() : []
  const dips: Record<string, TankDipState> = {}
  for (const t of tanks) {
    const found = existingDips.find((d: any) => d.tank_id === t.tank_id)
    dips[t.tank_id] = {
      closing_dip_cm: found?.closing_dip_cm != null ? String(found.closing_dip_cm) : '',
      already_recorded: found?.closing_dip_cm != null,
    }
  }
  const allComplete = tanks.length === 0 || tanks.every(t => (dips[t.tank_id]?.closing_dip_cm || '') !== '')
  return { tanks, dips, allComplete }
}

export async function saveTankDips(
  date: string,
  shiftType: string,
  tanks: TankInfo[],
  dips: Record<string, TankDipState>,
  delegateReason?: string,
) {
  const userData = typeof window !== 'undefined' ? localStorage.getItem('user') : null
  const userId = userData ? JSON.parse(userData).user_id : ''
  for (const tank of tanks) {
    const dip = dips[tank.tank_id]
    if (!dip?.closing_dip_cm) continue
    const params = new URLSearchParams({
      tank_id: tank.tank_id,
      date,
      shift_type: shiftType,
      recorded_by: userId,
      closing_dip_cm: dip.closing_dip_cm,
      ...(delegateReason ? { delegate_reason: delegateReason } : {}),
    })
    await authFetch(`${BASE}/tank-readings/dips?${params}`, { method: 'POST', headers: getAuthHeaders() })
  }
}
