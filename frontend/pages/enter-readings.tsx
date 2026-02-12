import { useState, useEffect } from 'react'
import { useTheme } from '../contexts/ThemeContext'
import LoadingSpinner from '../components/LoadingSpinner'
import { getHeaders } from '../lib/api'

const BASE = '/api/v1'

function getAuthHeaders() {
  return { 'Content-Type': 'application/json', ...getHeaders() }
}

interface NozzleDetail {
  nozzle_id: string
  fuel_type: string
  display_label?: string | null
  fuel_type_abbrev?: string | null
  electronic_opening: number
  mechanical_opening: number
  editable: boolean
  electronic_closing?: number
  mechanical_closing?: number
}

interface NozzleSummary {
  nozzle_id: string
  fuel_type: string
  electronic_opening: number
  electronic_closing: number
  electronic_dispensed: number
  mechanical_opening: number
  mechanical_closing: number
  mechanical_dispensed: number
  average_dispensed: number
  discrepancy_percent: number
}

interface ShiftSummaryData {
  shift_id: string
  user_id: string
  user_name: string
  nozzle_summaries: NozzleSummary[]
  totals: {
    electronic_dispensed: number
    mechanical_dispensed: number
    average_dispensed: number
    discrepancy_percent: number
  }
}

// Supervisor types
interface AttendantResult {
  attendant_id: string
  attendant_name: string
  status: string
  nozzle_summaries: {
    nozzle_id: string
    fuel_type: string
    electronic_dispensed: number
    mechanical_dispensed: number
    average_dispensed: number
    discrepancy_percent: number
  }[]
}

interface Reconciliation {
  tank_id: string
  fuel_type: string
  tank_movement: number
  nozzle_total: number
  variance: number
  variance_percent: number
  verdict: string
  delivery_count?: number
  total_delivery_volume?: number
  data_source?: string
}

interface ShiftReconciliation {
  shift_id: string
  date: string
  shift_type: string
  attendants: AttendantResult[]
  fuel_totals: { diesel: number; petrol: number }
  reconciliation: Reconciliation[]
}

export default function EnterReadings() {
  const { theme } = useTheme()
  const [user, setUser] = useState<any>(null)

  // Shift state
  const [loading, setLoading] = useState(true)
  const [shiftFound, setShiftFound] = useState<boolean | null>(null)
  const [shiftInfo, setShiftInfo] = useState<any>(null)
  const [assignmentInfo, setAssignmentInfo] = useState<any>(null)
  const [nozzles, setNozzles] = useState<NozzleDetail[]>([])
  const [openingSubmitted, setOpeningSubmitted] = useState(false)
  const [closingSubmitted, setClosingSubmitted] = useState(false)

  // Form state for opening
  const [openingElectronic, setOpeningElectronic] = useState<Record<string, string>>({})
  const [openingMechanical, setOpeningMechanical] = useState<Record<string, string>>({})

  // Form state for closing
  const [closingElectronic, setClosingElectronic] = useState<Record<string, string>>({})
  const [closingMechanical, setClosingMechanical] = useState<Record<string, string>>({})

  // UI state
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Summary
  const [summary, setSummary] = useState<ShiftSummaryData | null>(null)

  // Supervisor section
  const [supervisorShiftId, setSupervisorShiftId] = useState('')
  const [shiftRecon, setShiftRecon] = useState<ShiftReconciliation | null>(null)
  const [reconLoading, setReconLoading] = useState(false)
  const [reconError, setReconError] = useState('')

  // Available shifts for supervisor dropdown
  const [allShifts, setAllShifts] = useState<any[]>([])

  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (userData) setUser(JSON.parse(userData))
  }, [])

  const isSupervisor = user && (user.role === 'supervisor' || user.role === 'owner')

  // Fetch active shift on mount
  useEffect(() => {
    setLoading(true)
    fetch(`${BASE}/enter-readings/my-shift`, { headers: getAuthHeaders() })
      .then(r => r.json())
      .then(data => {
        if (data.found) {
          setShiftFound(true)
          setShiftInfo(data.shift)
          setAssignmentInfo(data.assignment)
          setNozzles(data.nozzles || [])
          setOpeningSubmitted(data.opening_submitted)
          setClosingSubmitted(data.closing_submitted)

          // Pre-fill form values from server data
          const elecOpen: Record<string, string> = {}
          const mechOpen: Record<string, string> = {}
          const elecClose: Record<string, string> = {}
          const mechClose: Record<string, string> = {}
          for (const n of (data.nozzles || [])) {
            elecOpen[n.nozzle_id] = String(n.electronic_opening)
            mechOpen[n.nozzle_id] = String(n.mechanical_opening)
            if (n.electronic_closing !== undefined) {
              elecClose[n.nozzle_id] = String(n.electronic_closing)
            }
            if (n.mechanical_closing !== undefined) {
              mechClose[n.nozzle_id] = String(n.mechanical_closing)
            }
          }
          setOpeningElectronic(elecOpen)
          setOpeningMechanical(mechOpen)
          setClosingElectronic(elecClose)
          setClosingMechanical(mechClose)

          // If closing already submitted, auto-fetch summary
          if (data.closing_submitted) {
            fetchSummary()
          }
        } else {
          setShiftFound(false)
        }
      })
      .catch(() => setShiftFound(false))
      .finally(() => setLoading(false))
  }, [])

  // Fetch shifts list for supervisor dropdown
  useEffect(() => {
    if (isSupervisor) {
      fetch(`${BASE}/shifts/`, { headers: getAuthHeaders() })
        .then(r => r.json())
        .then(data => {
          const list = Array.isArray(data) ? data : Object.values(data)
          setAllShifts(list)
        })
        .catch(() => {})
    }
  }, [isSupervisor])

  const fetchSummary = () => {
    fetch(`${BASE}/enter-readings/my-summary`, { headers: getAuthHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setSummary(data) })
      .catch(() => {})
  }

  const handleSubmitOpening = async () => {
    if (!shiftInfo) return
    setSubmitting(true)
    setError('')
    setSuccess('')
    try {
      const nozzle_readings = nozzles.map(n => ({
        nozzle_id: n.nozzle_id,
        electronic_reading: parseFloat(openingElectronic[n.nozzle_id]) || 0,
        mechanical_reading: parseFloat(openingMechanical[n.nozzle_id]) || 0,
      }))
      const res = await fetch(`${BASE}/enter-readings/submit`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          shift_id: shiftInfo.shift_id,
          reading_type: 'Opening',
          nozzle_readings,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || 'Failed to submit opening readings')
      }
      setOpeningSubmitted(true)
      setSuccess('Opening readings confirmed!')
    } catch (err: any) {
      setError(err.message || 'Submission failed')
    } finally {
      setSubmitting(false)
    }
  }

  const handleSubmitClosing = async () => {
    if (!shiftInfo) return
    setSubmitting(true)
    setError('')
    setSuccess('')
    try {
      const nozzle_readings = nozzles.map(n => ({
        nozzle_id: n.nozzle_id,
        electronic_reading: parseFloat(closingElectronic[n.nozzle_id]) || 0,
        mechanical_reading: parseFloat(closingMechanical[n.nozzle_id]) || 0,
      }))
      const res = await fetch(`${BASE}/enter-readings/submit`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          shift_id: shiftInfo.shift_id,
          reading_type: 'Closing',
          nozzle_readings,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || 'Failed to submit closing readings')
      }
      setClosingSubmitted(true)
      setSuccess('Closing readings submitted!')
      fetchSummary()
    } catch (err: any) {
      setError(err.message || 'Submission failed')
    } finally {
      setSubmitting(false)
    }
  }

  const handleFetchRecon = async () => {
    if (!supervisorShiftId) return
    setReconLoading(true)
    setReconError('')
    setShiftRecon(null)
    try {
      const res = await fetch(`${BASE}/enter-readings/shift/${supervisorShiftId}/summary`, {
        headers: getAuthHeaders(),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || 'Failed to load shift summary')
      }
      const data = await res.json()
      setShiftRecon(data)
    } catch (err: any) {
      setReconError(err.message || 'Failed')
    } finally {
      setReconLoading(false)
    }
  }

  const inputStyle = {
    backgroundColor: theme.cardBg,
    color: theme.textPrimary,
    borderColor: theme.border,
  }

  const nozzleLabel = (n: NozzleDetail) =>
    n.fuel_type_abbrev && n.display_label
      ? `${n.fuel_type_abbrev} ${n.display_label}`
      : n.nozzle_id

  // -- Inline closing computations --
  const closingComputations = nozzles.map(n => {
    const elecOpen = parseFloat(openingElectronic[n.nozzle_id]) || 0
    const mechOpen = parseFloat(openingMechanical[n.nozzle_id]) || 0
    const elecClose = parseFloat(closingElectronic[n.nozzle_id] || '')
    const mechClose = parseFloat(closingMechanical[n.nozzle_id] || '')
    if (isNaN(elecClose) || isNaN(mechClose)) {
      return { elecDisp: 0, mechDisp: 0, avg: 0, disc: 0, valid: false }
    }
    const elecDisp = elecClose - elecOpen
    const mechDisp = mechClose - mechOpen
    const avg = (elecDisp + mechDisp) / 2
    const disc = avg > 0 ? Math.abs(elecDisp - mechDisp) / avg * 100 : 0
    return { elecDisp, mechDisp, avg, disc, valid: elecDisp >= 0 && mechDisp >= 0 }
  })

  const allClosingEntered = nozzles.length > 0 && nozzles.every(n =>
    closingElectronic[n.nozzle_id] !== undefined && closingElectronic[n.nozzle_id] !== '' &&
    closingMechanical[n.nozzle_id] !== undefined && closingMechanical[n.nozzle_id] !== ''
  )
  const allClosingValid = closingComputations.every(c => !c.valid ? true : c.elecDisp >= 0 && c.mechDisp >= 0)

  // -- Render --

  if (loading) {
    return <LoadingSpinner text="Loading readings data..." />
  }

  if (shiftFound === false) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-4" style={{ color: theme.textPrimary }}>Enter Readings</h1>
        <div className="rounded-lg shadow p-8 text-center"
          style={{ backgroundColor: theme.cardBg, borderColor: theme.border, borderWidth: 1 }}>
          <div className="text-4xl mb-4">-</div>
          <h2 className="text-lg font-semibold mb-2" style={{ color: theme.textPrimary }}>
            No Active Shift Assigned
          </h2>
          <p className="text-sm" style={{ color: theme.textSecondary }}>
            You don't have an active shift assigned to you. Please contact your supervisor to be assigned to a shift.
          </p>
        </div>
        {isSupervisor && <SupervisorSection
          theme={theme} inputStyle={inputStyle} allShifts={allShifts}
          supervisorShiftId={supervisorShiftId} setSupervisorShiftId={setSupervisorShiftId}
          handleFetchRecon={handleFetchRecon} reconLoading={reconLoading}
          reconError={reconError} shiftRecon={shiftRecon}
        />}
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: theme.textPrimary }}>Enter Readings</h1>
        <p className="text-sm mt-1" style={{ color: theme.textSecondary }}>
          Record electronic and mechanical meter readings for your assigned nozzles
        </p>
      </div>

      {error && (
        <div className="rounded-lg p-3 mb-4 text-sm" style={{ backgroundColor: '#fef2f2', color: '#dc2626', borderColor: '#fecaca', borderWidth: 1 }}>
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg p-3 mb-4 text-sm" style={{ backgroundColor: '#f0fdf4', color: '#16a34a', borderColor: '#bbf7d0', borderWidth: 1 }}>
          {success}
        </div>
      )}

      {/* Shift Info */}
      <div className="rounded-lg shadow p-4 mb-6"
        style={{ backgroundColor: theme.cardBg, borderColor: theme.border, borderWidth: 1 }}>
        <h2 className="text-sm font-semibold mb-3 uppercase tracking-wide" style={{ color: theme.textSecondary }}>
          Shift Information
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="text-xs" style={{ color: theme.textSecondary }}>Shift ID</div>
            <div className="font-medium text-sm" style={{ color: theme.textPrimary }}>{shiftInfo?.shift_id}</div>
          </div>
          <div>
            <div className="text-xs" style={{ color: theme.textSecondary }}>Date</div>
            <div className="font-medium text-sm" style={{ color: theme.textPrimary }}>{shiftInfo?.date}</div>
          </div>
          <div>
            <div className="text-xs" style={{ color: theme.textSecondary }}>Shift Type</div>
            <div className="font-medium text-sm" style={{ color: theme.textPrimary }}>{shiftInfo?.shift_type}</div>
          </div>
          <div>
            <div className="text-xs" style={{ color: theme.textSecondary }}>Attendant</div>
            <div className="font-medium text-sm" style={{ color: theme.textPrimary }}>{assignmentInfo?.attendant_name}</div>
          </div>
        </div>
        <div className="mt-3 flex gap-3">
          <StatusBadge label="Opening" done={openingSubmitted} theme={theme} />
          <StatusBadge label="Closing" done={closingSubmitted} theme={theme} />
        </div>
      </div>

      {/* Phase 3: Opening Readings */}
      {!openingSubmitted && (
        <div className="rounded-lg shadow mb-6 overflow-x-auto"
          style={{ backgroundColor: theme.cardBg, borderColor: theme.border, borderWidth: 1 }}>
          <div className="p-4 font-semibold text-sm"
            style={{ borderBottomColor: theme.border, borderBottomWidth: 1, color: theme.textPrimary }}>
            Opening Readings
          </div>
          <table className="min-w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: theme.background }}>
                {['Nozzle', 'Fuel Type', 'Electronic Opening', 'Mechanical Opening'].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-xs font-medium uppercase"
                    style={{ color: theme.textSecondary }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {nozzles.map(n => (
                <tr key={n.nozzle_id} style={{ borderTopColor: theme.border, borderTopWidth: 1 }}>
                  <td className="px-3 py-2 font-medium" style={{ color: theme.textPrimary }}>
                    {nozzleLabel(n)}
                  </td>
                  <td className="px-3 py-2">
                    <FuelBadge fuelType={n.fuel_type} />
                  </td>
                  <td className="px-3 py-2">
                    {n.editable ? (
                      <input type="number" step="0.001"
                        value={openingElectronic[n.nozzle_id] || ''}
                        onChange={e => setOpeningElectronic(prev => ({ ...prev, [n.nozzle_id]: e.target.value }))}
                        className="w-36 px-2 py-1 rounded border text-sm text-right font-mono"
                        style={inputStyle} />
                    ) : (
                      <span className="font-mono text-right block" style={{ color: theme.textPrimary }}>
                        {parseFloat(openingElectronic[n.nozzle_id] || '0').toLocaleString(undefined, { minimumFractionDigits: 3 })}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {n.editable ? (
                      <input type="number" step="0.001"
                        value={openingMechanical[n.nozzle_id] || ''}
                        onChange={e => setOpeningMechanical(prev => ({ ...prev, [n.nozzle_id]: e.target.value }))}
                        className="w-36 px-2 py-1 rounded border text-sm text-right font-mono"
                        style={inputStyle} />
                    ) : (
                      <span className="font-mono text-right block" style={{ color: theme.textPrimary }}>
                        {parseFloat(openingMechanical[n.nozzle_id] || '0').toLocaleString(undefined, { minimumFractionDigits: 3 })}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="p-4 flex justify-end">
            <button
              onClick={handleSubmitOpening}
              disabled={submitting}
              className="px-6 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: theme.primary }}>
              {submitting ? 'Submitting...' : 'Confirm Opening Readings'}
            </button>
          </div>
        </div>
      )}

      {/* Phase 4: Closing Readings */}
      {openingSubmitted && !closingSubmitted && (
        <div className="rounded-lg shadow mb-6 overflow-x-auto"
          style={{ backgroundColor: theme.cardBg, borderColor: theme.border, borderWidth: 1 }}>
          <div className="p-4 font-semibold text-sm"
            style={{ borderBottomColor: theme.border, borderBottomWidth: 1, color: theme.textPrimary }}>
            Closing Readings
          </div>
          <table className="min-w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: theme.background }}>
                {['Nozzle', 'Fuel', 'Elec Open', 'Mech Open', 'Elec Closing', 'Mech Closing', 'Elec Disp', 'Mech Disp', 'Disc %'].map(h => (
                  <th key={h} className="px-2 py-2 text-left text-xs font-medium uppercase"
                    style={{ color: theme.textSecondary }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {nozzles.map((n, idx) => {
                const comp = closingComputations[idx]
                const elecCloseVal = parseFloat(closingElectronic[n.nozzle_id] || '')
                const mechCloseVal = parseFloat(closingMechanical[n.nozzle_id] || '')
                const elecOpen = parseFloat(openingElectronic[n.nozzle_id]) || 0
                const mechOpen = parseFloat(openingMechanical[n.nozzle_id]) || 0
                const elecErr = !isNaN(elecCloseVal) && elecCloseVal < elecOpen
                const mechErr = !isNaN(mechCloseVal) && mechCloseVal < mechOpen
                return (
                  <tr key={n.nozzle_id} style={{ borderTopColor: theme.border, borderTopWidth: 1 }}>
                    <td className="px-2 py-2 font-medium" style={{ color: theme.textPrimary }}>
                      {nozzleLabel(n)}
                    </td>
                    <td className="px-2 py-2"><FuelBadge fuelType={n.fuel_type} /></td>
                    <td className="px-2 py-2 text-right font-mono" style={{ color: theme.textSecondary }}>
                      {elecOpen.toLocaleString(undefined, { minimumFractionDigits: 3 })}
                    </td>
                    <td className="px-2 py-2 text-right font-mono" style={{ color: theme.textSecondary }}>
                      {mechOpen.toLocaleString(undefined, { minimumFractionDigits: 3 })}
                    </td>
                    <td className="px-2 py-2">
                      <input type="number" step="0.001"
                        value={closingElectronic[n.nozzle_id] || ''}
                        onChange={e => setClosingElectronic(prev => ({ ...prev, [n.nozzle_id]: e.target.value }))}
                        placeholder="Electronic"
                        className="w-32 px-2 py-1 rounded border text-sm text-right font-mono"
                        style={{ ...inputStyle, borderColor: elecErr ? '#ef4444' : theme.border }} />
                      {elecErr && <div className="text-xs" style={{ color: '#ef4444' }}>Must be &ge; opening</div>}
                    </td>
                    <td className="px-2 py-2">
                      <input type="number" step="0.001"
                        value={closingMechanical[n.nozzle_id] || ''}
                        onChange={e => setClosingMechanical(prev => ({ ...prev, [n.nozzle_id]: e.target.value }))}
                        placeholder="Mechanical"
                        className="w-32 px-2 py-1 rounded border text-sm text-right font-mono"
                        style={{ ...inputStyle, borderColor: mechErr ? '#ef4444' : theme.border }} />
                      {mechErr && <div className="text-xs" style={{ color: '#ef4444' }}>Must be &ge; opening</div>}
                    </td>
                    <td className="px-2 py-2 text-right font-mono font-medium" style={{ color: theme.textPrimary }}>
                      {comp.valid ? comp.elecDisp.toLocaleString(undefined, { minimumFractionDigits: 3 }) : '-'}
                    </td>
                    <td className="px-2 py-2 text-right font-mono font-medium" style={{ color: theme.textPrimary }}>
                      {comp.valid ? comp.mechDisp.toLocaleString(undefined, { minimumFractionDigits: 3 }) : '-'}
                    </td>
                    <td className="px-2 py-2 text-right font-mono" style={{
                      color: comp.valid ? (comp.disc <= 0.5 ? '#16a34a' : comp.disc <= 1 ? '#a16207' : '#dc2626') : theme.textSecondary
                    }}>
                      {comp.valid ? comp.disc.toFixed(2) + '%' : '-'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr style={{ borderTopColor: theme.border, borderTopWidth: 2, backgroundColor: theme.background }}>
                <td colSpan={6} className="px-2 py-2 text-right font-semibold" style={{ color: theme.textPrimary }}>
                  Totals
                </td>
                <td className="px-2 py-2 text-right font-mono font-semibold" style={{ color: theme.textPrimary }}>
                  {closingComputations.reduce((s, c) => s + (c.valid ? c.elecDisp : 0), 0).toLocaleString(undefined, { minimumFractionDigits: 3 })}
                </td>
                <td className="px-2 py-2 text-right font-mono font-semibold" style={{ color: theme.textPrimary }}>
                  {closingComputations.reduce((s, c) => s + (c.valid ? c.mechDisp : 0), 0).toLocaleString(undefined, { minimumFractionDigits: 3 })}
                </td>
                <td className="px-2 py-2"></td>
              </tr>
            </tfoot>
          </table>
          <div className="p-4 flex justify-end">
            <button
              onClick={handleSubmitClosing}
              disabled={submitting || !allClosingEntered || !allClosingValid}
              className="px-6 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: (allClosingEntered && allClosingValid) ? theme.primary : '#9ca3af' }}>
              {submitting ? 'Submitting...' : 'Submit Closing Readings'}
            </button>
          </div>
        </div>
      )}

      {/* Phase 5: Summary */}
      {closingSubmitted && summary && (
        <div className="rounded-lg shadow p-4 mb-6"
          style={{ backgroundColor: theme.cardBg, borderColor: '#86efac', borderWidth: 2 }}>
          <h2 className="text-lg font-bold mb-4" style={{ color: theme.textPrimary }}>
            Readings Summary
          </h2>
          <table className="min-w-full text-sm mb-4">
            <thead>
              <tr style={{ backgroundColor: theme.background }}>
                {['Nozzle', 'Fuel', 'Elec Dispensed', 'Mech Dispensed', 'Average', 'Discrepancy'].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-xs font-medium uppercase"
                    style={{ color: theme.textSecondary }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {summary.nozzle_summaries.map(ns => (
                <tr key={ns.nozzle_id} style={{ borderTopColor: theme.border, borderTopWidth: 1 }}>
                  <td className="px-3 py-2 font-medium" style={{ color: theme.textPrimary }}>{ns.nozzle_id}</td>
                  <td className="px-3 py-2"><FuelBadge fuelType={ns.fuel_type} /></td>
                  <td className="px-3 py-2 text-right font-mono" style={{ color: theme.textPrimary }}>
                    {ns.electronic_dispensed.toLocaleString(undefined, { minimumFractionDigits: 3 })}
                  </td>
                  <td className="px-3 py-2 text-right font-mono" style={{ color: theme.textPrimary }}>
                    {ns.mechanical_dispensed.toLocaleString(undefined, { minimumFractionDigits: 3 })}
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-medium" style={{ color: theme.primary }}>
                    {ns.average_dispensed.toLocaleString(undefined, { minimumFractionDigits: 3 })}
                  </td>
                  <td className="px-3 py-2 text-right font-mono" style={{
                    color: ns.discrepancy_percent <= 0.5 ? '#16a34a' : ns.discrepancy_percent <= 1 ? '#a16207' : '#dc2626'
                  }}>
                    {ns.discrepancy_percent.toFixed(2)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals card */}
          <div className="rounded-lg p-4" style={{ backgroundColor: theme.background }}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-xs" style={{ color: theme.textSecondary }}>Total Electronic</div>
                <div className="font-mono font-bold" style={{ color: theme.textPrimary }}>
                  {summary.totals.electronic_dispensed.toLocaleString(undefined, { minimumFractionDigits: 3 })} L
                </div>
              </div>
              <div>
                <div className="text-xs" style={{ color: theme.textSecondary }}>Total Mechanical</div>
                <div className="font-mono font-bold" style={{ color: theme.textPrimary }}>
                  {summary.totals.mechanical_dispensed.toLocaleString(undefined, { minimumFractionDigits: 3 })} L
                </div>
              </div>
              <div>
                <div className="text-xs" style={{ color: theme.textSecondary }}>Average Dispensed</div>
                <div className="font-mono font-bold" style={{ color: theme.primary }}>
                  {summary.totals.average_dispensed.toLocaleString(undefined, { minimumFractionDigits: 3 })} L
                </div>
              </div>
              <div>
                <div className="text-xs" style={{ color: theme.textSecondary }}>Overall Discrepancy</div>
                <div className="font-mono font-bold" style={{
                  color: summary.totals.discrepancy_percent <= 0.5 ? '#16a34a' : summary.totals.discrepancy_percent <= 1 ? '#a16207' : '#dc2626'
                }}>
                  {summary.totals.discrepancy_percent.toFixed(2)}%
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Phase 6: Supervisor Section */}
      {isSupervisor && <SupervisorSection
        theme={theme} inputStyle={inputStyle} allShifts={allShifts}
        supervisorShiftId={supervisorShiftId} setSupervisorShiftId={setSupervisorShiftId}
        handleFetchRecon={handleFetchRecon} reconLoading={reconLoading}
        reconError={reconError} shiftRecon={shiftRecon}
      />}
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────

function StatusBadge({ label, done, theme }: { label: string; done: boolean; theme: any }) {
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
      style={{
        backgroundColor: done ? '#dcfce7' : '#fef3c7',
        color: done ? '#16a34a' : '#a16207',
      }}>
      {done ? '\u2713' : '\u2022'} {label} {done ? 'Submitted' : 'Pending'}
    </span>
  )
}

function FuelBadge({ fuelType }: { fuelType: string }) {
  return (
    <span className="inline-block px-2 py-0.5 rounded text-xs font-medium"
      style={{
        backgroundColor: fuelType === 'Petrol' ? '#dbeafe' : '#fef9c3',
        color: fuelType === 'Petrol' ? '#1d4ed8' : '#a16207',
      }}>
      {fuelType}
    </span>
  )
}

function VerdictBadge({ verdict }: { verdict: string }) {
  const colors: Record<string, { bg: string; fg: string }> = {
    PASS: { bg: '#dcfce7', fg: '#16a34a' },
    WARNING: { bg: '#fef3c7', fg: '#a16207' },
    FAIL: { bg: '#fef2f2', fg: '#dc2626' },
  }
  const c = colors[verdict] || colors.FAIL
  return (
    <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-bold"
      style={{ backgroundColor: c.bg, color: c.fg }}>
      {verdict}
    </span>
  )
}

function SupervisorSection({
  theme, inputStyle, allShifts,
  supervisorShiftId, setSupervisorShiftId,
  handleFetchRecon, reconLoading, reconError, shiftRecon,
}: {
  theme: any
  inputStyle: any
  allShifts: any[]
  supervisorShiftId: string
  setSupervisorShiftId: (v: string) => void
  handleFetchRecon: () => void
  reconLoading: boolean
  reconError: string
  shiftRecon: ShiftReconciliation | null
}) {
  return (
    <div className="mt-8">
      <h2 className="text-xl font-bold mb-4" style={{ color: theme.textPrimary }}>
        Shift Reconciliation (Supervisor)
      </h2>

      <div className="rounded-lg shadow p-4 mb-6"
        style={{ backgroundColor: theme.cardBg, borderColor: theme.border, borderWidth: 1 }}>
        <div className="flex items-end gap-4">
          <div className="flex-1">
            <label className="block text-xs font-medium mb-1" style={{ color: theme.textSecondary }}>Select Shift</label>
            <select value={supervisorShiftId}
              onChange={e => setSupervisorShiftId(e.target.value)}
              className="w-full px-3 py-2 rounded border text-sm"
              style={inputStyle}>
              <option value="">-- Select a shift --</option>
              {allShifts.map((s: any) => (
                <option key={s.shift_id} value={s.shift_id}>
                  {s.shift_id} | {s.date} | {s.shift_type} | {s.status}
                </option>
              ))}
            </select>
          </div>
          <button onClick={handleFetchRecon}
            disabled={!supervisorShiftId || reconLoading}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: theme.primary }}>
            {reconLoading ? 'Loading...' : 'View Summary'}
          </button>
        </div>
      </div>

      {reconError && (
        <div className="rounded-lg p-3 mb-4 text-sm" style={{ backgroundColor: '#fef2f2', color: '#dc2626', borderColor: '#fecaca', borderWidth: 1 }}>
          {reconError}
        </div>
      )}

      {shiftRecon && (
        <>
          {/* Attendant Status Table */}
          <div className="rounded-lg shadow mb-6 overflow-x-auto"
            style={{ backgroundColor: theme.cardBg, borderColor: theme.border, borderWidth: 1 }}>
            <div className="p-4 font-semibold text-sm"
              style={{ borderBottomColor: theme.border, borderBottomWidth: 1, color: theme.textPrimary }}>
              Attendants — {shiftRecon.shift_id} ({shiftRecon.date} {shiftRecon.shift_type})
            </div>
            <table className="min-w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: theme.background }}>
                  {['Attendant', 'Status', 'Nozzles', 'Elec Dispensed', 'Mech Dispensed', 'Avg Dispensed'].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-medium uppercase"
                      style={{ color: theme.textSecondary }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shiftRecon.attendants.map(att => {
                  const elecTotal = att.nozzle_summaries.reduce((s, ns) => s + ns.electronic_dispensed, 0)
                  const mechTotal = att.nozzle_summaries.reduce((s, ns) => s + ns.mechanical_dispensed, 0)
                  const avgTotal = att.nozzle_summaries.reduce((s, ns) => s + ns.average_dispensed, 0)
                  return (
                    <tr key={att.attendant_id} style={{ borderTopColor: theme.border, borderTopWidth: 1 }}>
                      <td className="px-3 py-2 font-medium" style={{ color: theme.textPrimary }}>{att.attendant_name}</td>
                      <td className="px-3 py-2">
                        <span className="inline-block px-2 py-0.5 rounded text-xs font-medium"
                          style={{
                            backgroundColor: att.status === 'complete' ? '#dcfce7' : att.status === 'opening_only' ? '#fef3c7' : '#fee2e2',
                            color: att.status === 'complete' ? '#16a34a' : att.status === 'opening_only' ? '#a16207' : '#dc2626',
                          }}>
                          {att.status}
                        </span>
                      </td>
                      <td className="px-3 py-2" style={{ color: theme.textSecondary }}>
                        {att.nozzle_summaries.map(ns => ns.nozzle_id).join(', ') || '-'}
                      </td>
                      <td className="px-3 py-2 text-right font-mono" style={{ color: theme.textPrimary }}>
                        {elecTotal.toLocaleString(undefined, { minimumFractionDigits: 3 })}
                      </td>
                      <td className="px-3 py-2 text-right font-mono" style={{ color: theme.textPrimary }}>
                        {mechTotal.toLocaleString(undefined, { minimumFractionDigits: 3 })}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-medium" style={{ color: theme.primary }}>
                        {avgTotal.toLocaleString(undefined, { minimumFractionDigits: 3 })}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Fuel Totals */}
          <div className="rounded-lg shadow p-4 mb-6"
            style={{ backgroundColor: theme.cardBg, borderColor: theme.border, borderWidth: 1 }}>
            <h3 className="text-sm font-semibold mb-3 uppercase tracking-wide" style={{ color: theme.textSecondary }}>
              Fuel Totals (Average Dispensed)
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg p-3" style={{ backgroundColor: '#fef9c3' }}>
                <div className="text-xs font-medium" style={{ color: '#a16207' }}>Diesel</div>
                <div className="text-lg font-bold font-mono" style={{ color: '#a16207' }}>
                  {shiftRecon.fuel_totals.diesel.toLocaleString(undefined, { minimumFractionDigits: 3 })} L
                </div>
              </div>
              <div className="rounded-lg p-3" style={{ backgroundColor: '#dbeafe' }}>
                <div className="text-xs font-medium" style={{ color: '#1d4ed8' }}>Petrol</div>
                <div className="text-lg font-bold font-mono" style={{ color: '#1d4ed8' }}>
                  {shiftRecon.fuel_totals.petrol.toLocaleString(undefined, { minimumFractionDigits: 3 })} L
                </div>
              </div>
            </div>
          </div>

          {/* Reconciliation Panel */}
          {shiftRecon.reconciliation.length > 0 && (
            <div className="rounded-lg shadow mb-6 overflow-x-auto"
              style={{ backgroundColor: theme.cardBg, borderColor: theme.border, borderWidth: 1 }}>
              <div className="p-4 font-semibold text-sm"
                style={{ borderBottomColor: theme.border, borderBottomWidth: 1, color: theme.textPrimary }}>
                Tank Reconciliation
              </div>
              <table className="min-w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: theme.background }}>
                    {['Tank', 'Fuel Type', 'Deliveries', 'Delivered (L)', 'Tank Movement (L)', 'Nozzle Total (L)', 'Variance (L)', 'Variance %', 'Verdict'].map(h => (
                      <th key={h} className="px-3 py-2 text-left text-xs font-medium uppercase"
                        style={{ color: theme.textSecondary }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shiftRecon.reconciliation.map(r => (
                    <tr key={r.tank_id} style={{ borderTopColor: theme.border, borderTopWidth: 1 }}>
                      <td className="px-3 py-2 font-medium" style={{ color: theme.textPrimary }}>{r.tank_id}</td>
                      <td className="px-3 py-2"><FuelBadge fuelType={r.fuel_type} /></td>
                      <td className="px-3 py-2 text-center font-mono" style={{ color: theme.textPrimary }}>
                        {(r.delivery_count ?? 0) > 0 ? (
                          <span className="inline-block px-2 py-0.5 rounded-full text-xs font-bold"
                            style={{ backgroundColor: '#dbeafe', color: '#1d4ed8' }}>
                            {r.delivery_count}
                          </span>
                        ) : (
                          <span style={{ color: theme.textSecondary }}>0</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-mono" style={{ color: (r.total_delivery_volume ?? 0) > 0 ? '#1d4ed8' : theme.textSecondary }}>
                        {(r.total_delivery_volume ?? 0).toLocaleString(undefined, { minimumFractionDigits: 3 })}
                      </td>
                      <td className="px-3 py-2 text-right font-mono" style={{ color: theme.textPrimary }}>
                        {r.tank_movement.toLocaleString(undefined, { minimumFractionDigits: 3 })}
                      </td>
                      <td className="px-3 py-2 text-right font-mono" style={{ color: theme.textPrimary }}>
                        {r.nozzle_total.toLocaleString(undefined, { minimumFractionDigits: 3 })}
                      </td>
                      <td className="px-3 py-2 text-right font-mono" style={{ color: theme.textPrimary }}>
                        {r.variance.toLocaleString(undefined, { minimumFractionDigits: 3 })}
                      </td>
                      <td className="px-3 py-2 text-right font-mono" style={{ color: theme.textPrimary }}>
                        {r.variance_percent.toFixed(2)}%
                      </td>
                      <td className="px-3 py-2"><VerdictBadge verdict={r.verdict} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {/* Warning when daily tank reading not submitted */}
              {shiftRecon.reconciliation.some(r => r.data_source === 'dip_only') && (
                <div className="p-3 text-sm" style={{ backgroundColor: '#fef3c7', color: '#a16207', borderTopColor: theme.border, borderTopWidth: 1 }}>
                  Note: Daily tank reading not yet submitted for one or more tanks — delivery data unavailable, using simple dip calculation.
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
