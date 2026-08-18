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
  // false when opening_dip_cm had to be carried forward (or is still missing)
  // rather than already recorded on this tank's own record — drives whether
  // the field renders read-only or as an input the manager must fill in.
  opening_resolved: boolean
  closing_dip_cm: string
  already_recorded: boolean
}

export interface TankDipsLoadResult {
  tanks: TankInfo[]
  dips: Record<string, TankDipState>
  allComplete: boolean
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

// Shift-type-scoped on purpose — a Day dip must not read as satisfying a
// Night check on the same date, matching the backend gate exactly.
//
// allComplete mirrors the backend's actual gate (opening AND closing, not
// just closing) — otherwise the pre-flight check can wave a manager through
// to the cash form only for the real submit to 409 on a missing opening dip,
// which is what caused the modal to loop: closing alone looked "complete"
// here but never satisfied the backend, so re-saving it changed nothing.
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
  await Promise.all(tanks.map(async t => {
    const found = existingDips.find((d: any) => d.tank_id === t.tank_id)
    let openingDipCm = found?.opening_dip_cm != null ? String(found.opening_dip_cm) : null
    let openingResolved = openingDipCm != null
    if (openingDipCm == null) {
      // Not recorded on this tank's own record yet — try to carry it forward
      // from the previous shift so the manager isn't asked to re-key a value
      // that's already known. Still editable if that lookup comes up empty.
      openingDipCm = await resolveOpeningDip(t.tank_id, date, shiftType)
      openingResolved = openingDipCm != null
    }
    dips[t.tank_id] = {
      opening_dip_cm: openingDipCm,
      opening_resolved: openingResolved,
      closing_dip_cm: found?.closing_dip_cm != null ? String(found.closing_dip_cm) : '',
      already_recorded: found?.closing_dip_cm != null,
    }
  }))
  const allComplete = tanks.length === 0 || tanks.every(t => {
    const d = dips[t.tank_id]
    return !!d && d.closing_dip_cm !== '' && !!d.opening_dip_cm
  })
  return { tanks, dips, allComplete }
}

export interface TankDeliveryInfo {
  supplier: string
  invoice?: string
  time?: string
  volume?: string
}

export async function saveTankDips(
  date: string,
  shiftType: string,
  tanks: TankInfo[],
  dips: Record<string, TankDipState>,
  delegateReason?: string,
  deliveries?: Record<string, TankDeliveryInfo>,
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

    const delivery = deliveries?.[tank.tank_id]

    const params = new URLSearchParams({
      tank_id: tank.tank_id,
      date,
      shift_type: shiftType,
      recorded_by: userId,
      closing_dip_cm: dip.closing_dip_cm,
      ...(openingDipCm ? { opening_dip_cm: openingDipCm } : {}),
      ...(delegateReason ? { delegate_reason: delegateReason } : {}),
      // Backend requires a delivery on the same request whenever closing > opening
      // — writes to tank_deliveries.json in that one call, same as the standalone
      // Tank Dips page already does. Volume is left for the server to derive from
      // the dip change when not given explicitly.
      ...(delivery?.supplier ? { delivery_supplier: delivery.supplier } : {}),
      ...(delivery?.invoice ? { delivery_invoice_number: delivery.invoice } : {}),
      ...(delivery?.time ? { delivery_time: delivery.time } : {}),
      ...(delivery?.volume ? { delivery_volume_liters: delivery.volume } : {}),
    })
    const res = await authFetch(`${BASE}/tank-readings/dips?${params}`, { method: 'POST', headers: getAuthHeaders() })
    if (!res.ok) {
      // Silently swallowing this used to be the bug: the caller (and the
      // modal) would believe the dip saved and move on, the record stayed
      // incomplete, and the close would fail the same gate again — reading
      // as "I entered it and the dialog just keeps popping back up." Most
      // common causes: the shift is already locked (completed/reconciled),
      // or the closing dip exceeds the opening dip and needs a delivery
      // recorded, which this quick-entry form doesn't collect.
      const err = await res.json().catch(() => ({ detail: 'Failed to save tank dip' }))
      const label = tank.display_name || tank.fuel_type || tank.tank_id
      throw new Error(`${label}: ${err.detail || 'Failed to save tank dip'}`)
    }
  }
}
