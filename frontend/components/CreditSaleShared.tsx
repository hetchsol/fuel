import { useState } from 'react'
import { authFetch, getHeaders } from '../lib/api'

const BASE = '/api/v1'

function getAuthHeaders() {
  return { 'Content-Type': 'application/json', ...getHeaders() }
}

export interface OtherProduct {
  code: string
  label: string
  unit_price: number
  category: string
}

export interface CreditItem {
  account_id: string
  account_name: string
  // Client-only — decides which picker/inputs the row renders. Backend only
  // ever sees fuel_type as a free-text label, so this never needs to travel.
  item_kind: 'fuel' | 'other'
  fuel_type: string        // "Diesel"/"Petrol" for fuel rows; product description for other rows
  product_code?: string    // client-only, lets the price re-fill if the product selection changes
  volume: string           // liters for fuel; unit quantity for other products
  price_per_liter: number  // read-only in the UI — set from account/fuel price or product catalog
  amount: number
  // Client-only — which of volume/amount the manager is directly typing into;
  // the other is derived from price_per_liter so the backend always gets volume.
  entry_mode: 'liters' | 'amount'
}

// The non-fuel products a credit sale can be entered against — the same
// priced catalogs the stock-count pages already draw on, so a credit sale
// for one of these always matches revenue already counted in the shift's
// total_expected. Every credit-sale entry point (Close & Approve, the
// post-approval CreditPanel, shift-closing) fetches this independently to
// match each screen's own self-contained data-loading style.
export async function fetchOtherProducts(): Promise<OtherProduct[]> {
  try {
    const [lubricants, accessories] = await Promise.all([
      authFetch(`${BASE}/lubricants-daily/products`, { headers: getAuthHeaders() }).then(r => r.ok ? r.json() : []),
      authFetch(`${BASE}/lpg-daily/accessories/inventory`, { headers: getAuthHeaders() }).then(r => r.ok ? r.json() : []),
    ])
    const seenLubricantCodes = new Set<string>()
    const lubricantProducts: OtherProduct[] = []
    for (const p of (lubricants || [])) {
      const baseCode = String(p.product_code || '').replace(/-BUF$/, '')
      if (seenLubricantCodes.has(baseCode)) continue
      seenLubricantCodes.add(baseCode)
      lubricantProducts.push({ code: baseCode, label: p.description, unit_price: p.unit_price || 0, category: 'Lubricant' })
    }
    const accessoryProducts: OtherProduct[] = (accessories || []).map((p: any) => ({
      code: p.product_code, label: p.description, unit_price: p.unit_price || 0, category: 'Accessory',
    }))
    return [...lubricantProducts, ...accessoryProducts]
  } catch {
    return []
  }
}

// Inline "create credit account" — shared by every credit-sale entry point,
// all of which need the same escape hatch when the account they want isn't
// set up yet. POSTs to the same /accounts/ endpoint the standalone Accounts
// page uses.
export function NewAccountModal({ theme, onClose, onCreated }: { theme: any; onClose: () => void; onCreated: (acct: any) => void }) {
  const [name, setName] = useState('')
  const [type, setType] = useState<'Post-Paid' | 'Pre-Paid'>('Post-Paid')
  const [creditLimit, setCreditLimit] = useState('')
  const [openingBalance, setOpeningBalance] = useState('')
  const [defaultPrice, setDefaultPrice] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const inputStyle = { backgroundColor: theme.background, color: theme.textPrimary, borderColor: theme.border }

  const submit = async () => {
    if (!name.trim()) { setError('Account name is required.'); return }
    setSaving(true)
    setError('')
    try {
      const isPrePaid = type === 'Pre-Paid'
      const res = await authFetch(`${BASE}/accounts/`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          account_id: '',
          account_name: name.trim(),
          account_type: type,
          credit_limit: isPrePaid ? 0 : (parseFloat(creditLimit) || 0),
          opening_balance: isPrePaid ? (parseFloat(openingBalance) || 0) : null,
          current_balance: 0,
          approved_overdraft: 0,
          default_price_per_liter: defaultPrice ? parseFloat(defaultPrice) : null,
        }),
      })
      const acct = await res.json().catch(() => null)
      if (!res.ok) {
        const detail = Array.isArray(acct?.detail) ? acct.detail.map((d: any) => d.msg || d).join(', ') : (acct?.detail || 'Failed to create account')
        throw new Error(detail)
      }
      onCreated(acct)
    } catch (e: any) {
      setError(e.message || 'Failed to create account')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="rounded-lg shadow-xl w-full max-w-sm p-4 space-y-3"
        style={{ backgroundColor: theme.cardBg, borderColor: theme.border, borderWidth: 1 }}
        onClick={e => e.stopPropagation()}>
        <div className="font-semibold text-sm" style={{ color: theme.textPrimary }}>New Credit Account</div>
        {error && (
          <div className="text-xs p-2 rounded" style={{ backgroundColor: 'var(--color-status-error-light)', color: 'var(--color-status-error)' }}>
            {error}
          </div>
        )}
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: theme.textSecondary }}>Account Name *</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)}
            className="w-full px-3 py-2 rounded border text-sm" style={inputStyle} autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: theme.textSecondary }}>Type</label>
            <select value={type} onChange={e => setType(e.target.value as 'Post-Paid' | 'Pre-Paid')}
              className="w-full px-3 py-2 rounded border text-sm" style={inputStyle}>
              <option value="Post-Paid">Post-Paid</option>
              <option value="Pre-Paid">Pre-Paid</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: theme.textSecondary }}>
              {type === 'Pre-Paid' ? 'Opening Balance' : 'Credit Limit'}
            </label>
            <input type="number" min={0} step="0.01"
              value={type === 'Pre-Paid' ? openingBalance : creditLimit}
              onChange={e => type === 'Pre-Paid' ? setOpeningBalance(e.target.value) : setCreditLimit(e.target.value)}
              className="w-full px-3 py-2 rounded border text-sm text-right font-mono" style={inputStyle} />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: theme.textSecondary }}>
            Default Price / Liter (optional — overrides the standard fuel price for this account)
          </label>
          <input type="number" min={0} step="0.01" value={defaultPrice} onChange={e => setDefaultPrice(e.target.value)}
            className="w-full px-3 py-2 rounded border text-sm text-right font-mono" style={inputStyle} />
        </div>
        <div className="flex gap-2 justify-end pt-1">
          <button onClick={onClose}
            className="px-4 py-2 text-sm rounded" style={{ color: theme.textSecondary, borderWidth: 1, borderColor: theme.border }}>
            Cancel
          </button>
          <button onClick={submit} disabled={saving || !name.trim()}
            className="px-4 py-2 text-sm font-semibold rounded text-white disabled:opacity-50"
            style={{ backgroundColor: 'var(--color-action-primary)' }}>
            {saving ? 'Creating...' : 'Create Account'}
          </button>
        </div>
      </div>
    </div>
  )
}
