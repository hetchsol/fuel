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
  opening_dip_cm: string | null
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
    // Not "/tanks/" — that route doesn't exist (404), which used to silently
    // make every shift look like it had zero tanks to gate on.
    authFetch(`${BASE}/tanks/levels`, { headers: getAuthHeaders() }),
    authFetch(`${BASE}/tank-readings/dips?date=${date}&shift_type=${shiftType}`, { headers: getAuthHeaders() }),
  ])
  const tanks: TankInfo[] = tanksRes.ok ? await tanksRes.json() : []
  const existingDips: any[] = dipsRes.ok ? await dipsRes.json() : []
  const dips: Record<string, TankDipState> = {}
  for (const t of tanks) {
    const found = existingDips.find((d: any) => d.tank_id === t.tank_id)
    dips[t.tank_id] = {
      opening_dip_cm: found?.opening_dip_cm != null ? String(found.opening_dip_cm) : null,
      closing_dip_cm: found?.closing_dip_cm != null ? String(found.closing_dip_cm) : '',
      already_recorded: found?.closing_dip_cm != null,
    }
  }
  const allComplete = tanks.length === 0 || tanks.every(t => (dips[t.tank_id]?.closing_dip_cm || '') !== '')
  return { tanks, dips, allComplete }
}

// The backend's dip-completeness gate requires BOTH an opening and a closing
// dip on the record — closing alone can never satisfy it. If a tank has no
// opening dip yet, carry it forward from the previous shift's closing dip
// (the same lookup the standalone Tank Dips page already uses) so entering
// just the closing reading here is actually enough to unblock the shift.
async function resolveOpeningDip(tankId: string, date: string, shiftType: string): Promise<string | null> {
  try {
    const res = await authFetch(
      `${BASE}/tank-readings/readings/${tankId}/previous-shift?current_date=${date}&shift_type=${shiftType}`,
      { headers: getAuthHeaders() },
    )
    if (!res.ok) return null
    const data = await res.json()
    return data?.opening_dip_cm != null ? String(data.opening_dip_cm) : null
  } catch {
    return null
  }
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

    let openingDipCm = dip.opening_dip_cm
    if (!openingDipCm) {
      openingDipCm = await resolveOpeningDip(tank.tank_id, date, shiftType)
    }

    const params = new URLSearchParams({
      tank_id: tank.tank_id,
      date,
      shift_type: shiftType,
      recorded_by: userId,
      closing_dip_cm: dip.closing_dip_cm,
      ...(openingDipCm ? { opening_dip_cm: openingDipCm } : {}),
      ...(delegateReason ? { delegate_reason: delegateReason } : {}),
    })
    await authFetch(`${BASE}/tank-readings/dips?${params}`, { method: 'POST', headers: getAuthHeaders() })
  }
}
