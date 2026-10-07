import React from 'react'

export interface PosType { type_id: string; name: string; is_active: boolean; is_terminal?: boolean }

export interface PosSlip {
  key: string          // client-side row id
  type_id: string
  bank: string
  reference: string
  amount: string
}

let seq = 0
export const newSlip = (type_id = ''): PosSlip => ({ key: `slip-${Date.now()}-${seq++}`, type_id, bank: '', reference: '', amount: '' })

/** Slips with an amount, as the API expects them. */
export const slipsToItems = (slips: PosSlip[], types: PosType[]) => slips
  .map(s => {
    const t = types.find(x => x.type_id === s.type_id)
    return {
      type_id: s.type_id,
      type_name: t?.name || s.type_id,
      amount: parseFloat(s.amount) || 0,
      reference: s.reference.trim() || undefined,
      bank: t?.is_terminal && s.bank ? s.bank : undefined,
    }
  })
  .filter(i => i.amount > 0)

export const slipsTotal = (slips: PosSlip[]) => slips.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0)

/** First problem that stops the slips being submitted, or '' when they are fine. */
export const slipsProblem = (slips: PosSlip[], referenceRequired = true) => {
  const used = slips.filter(s => (parseFloat(s.amount) || 0) > 0)
  if (used.some(s => !s.type_id)) return 'Choose the payment type for every slip.'
  if (referenceRequired && used.some(s => !s.reference.trim())) return 'Every slip needs its reference number.'
  const refs = used.map(s => s.reference.trim().toLowerCase()).filter(r => r)
  const dup = refs.find((r, i) => refs.indexOf(r) !== i)
  if (dup) return `Reference ${dup} is entered twice.`
  return ''
}

interface Props {
  types: PosType[]
  banks: string[]
  slips: PosSlip[]
  onChange: (slips: PosSlip[]) => void
  theme: any
  referenceRequired?: boolean   // false only for back-filling shifts dated before references were required
}

/**
 * One row per payment slip: type, bank (card machines only, optional),
 * reference (required) and amount. An attendant accounts for the sum of
 * their own slips; the card machine's printed total is checked once per
 * shift against every attendant's slips combined, not here.
 */
export default function PosSlipsInput({ types, banks, slips, onChange, theme, referenceRequired = true }: Props) {
  const active = types.filter(t => t.is_active)
  const inputStyle = { backgroundColor: theme.cardBg, color: theme.textPrimary, borderColor: theme.border }
  const update = (key: string, patch: Partial<PosSlip>) =>
    onChange(slips.map(s => s.key === key ? { ...s, ...patch } : s))
  const total = slipsTotal(slips)
  const problem = slipsProblem(slips, referenceRequired)

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs font-medium uppercase" style={{ color: theme.textSecondary }}>
          Non-cash payments (one line per slip)
        </label>
        {total > 0 && (
          <span className="text-xs font-mono font-semibold" style={{ color: theme.textPrimary }}>
            K{total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        )}
      </div>
      <div className="space-y-2">
        {slips.map(s => {
          const type = types.find(t => t.type_id === s.type_id)
          const missingRef = referenceRequired && (parseFloat(s.amount) || 0) > 0 && !s.reference.trim()
          return (
            <div key={s.key} className="flex flex-wrap items-center gap-2">
              <select value={s.type_id} onChange={e => update(s.key, { type_id: e.target.value, bank: '' })}
                aria-label="Payment type"
                className="px-2 py-1.5 rounded border text-xs w-32" style={inputStyle}>
                <option value="">Type</option>
                {active.map(t => <option key={t.type_id} value={t.type_id}>{t.name}</option>)}
              </select>
              {type?.is_terminal && (
                <select value={s.bank} onChange={e => update(s.key, { bank: e.target.value })}
                  aria-label="Bank (optional)"
                  className="px-2 py-1.5 rounded border text-xs w-28" style={inputStyle}>
                  <option value="">Bank (optional)</option>
                  {banks.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              )}
              <input type="text" value={s.reference} placeholder={referenceRequired ? 'Slip reference' : 'Slip reference (if on record)'}
                aria-label="Slip reference"
                onChange={e => update(s.key, { reference: e.target.value })}
                className="flex-1 min-w-[8rem] px-2 py-1.5 rounded border text-xs"
                style={{ ...inputStyle, borderColor: missingRef ? 'var(--color-status-error)' : theme.border }} />
              <input type="number" min={0} step="0.01" value={s.amount} placeholder="0.00"
                aria-label="Amount"
                onChange={e => update(s.key, { amount: e.target.value })}
                className="w-28 px-2 py-1.5 rounded border text-sm text-right font-mono" style={inputStyle} />
              <button type="button" onClick={() => onChange(slips.filter(x => x.key !== s.key))}
                className="text-xs px-2 py-1" style={{ color: theme.textSecondary }}>
                Remove
              </button>
            </div>
          )
        })}
      </div>
      <button type="button" onClick={() => onChange([...slips, newSlip(slips[slips.length - 1]?.type_id || '')])}
        className="mt-2 px-3 py-1.5 text-xs font-medium rounded border"
        style={{ borderColor: theme.border, color: theme.textPrimary }}>
        Add slip
      </button>
      {problem && slips.some(s => (parseFloat(s.amount) || 0) > 0) && (
        <p className="text-xs mt-1.5" style={{ color: 'var(--color-status-error)' }}>{problem}</p>
      )}
    </div>
  )
}
