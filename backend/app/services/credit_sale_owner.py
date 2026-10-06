"""
Credit sale ownership — which attendant a credit sale belongs to.

Every credit sale must be tied to exactly one attendant so it can never be
counted in another attendant's handover. New sales carry `attendant_id`
(stamped server-side when recorded, never changed afterwards). Older records
predate that field; for those the owner is derived, in order:

  1. the handover that created it (`handover_id`, or the CS-HO-{handover_id}-N
     sale_id convention every handover-created sale has always used);
  2. the shift itself, but only when exactly one attendant worked it.

Anything still unresolved is excluded from every attendant's handover rather
than guessed at. Historical records are never rewritten: binding applies from
rollout onward, and closed handovers keep the credit details they were saved with.
"""
from typing import Optional


def shift_attendants(shift: Optional[dict]) -> dict:
    """{attendant_id: attendant_name} for everyone assigned to the shift."""
    out = {}
    for a in (shift or {}).get("assignments", []) or []:
        aid = a.get("attendant_id")
        if aid:
            out[aid] = a.get("attendant_name") or aid
    return out


def handover_id_from_sale_id(sale_id: str) -> Optional[str]:
    """CS-HO-{handover_id}-{n} / CS-HO-{handover_id}-P{n} -> handover_id.

    The handover_id itself starts with "HO-", so a real one reads
    CS-HO-HO-2026-10-01-Day-STF001-143005-0.
    """
    if not sale_id or not sale_id.startswith("CS-HO-"):
        return None
    body = sale_id[len("CS-HO-"):]
    head, sep, _ = body.rpartition("-")
    return head if sep else None


def creating_handover_id(sale: dict) -> Optional[str]:
    """The handover that created this sale, if any (field, sale_id convention, or invoice tag)."""
    hid = sale.get("handover_id") or handover_id_from_sale_id(sale.get("sale_id", ""))
    if not hid:
        inv = sale.get("invoice_number") or ""
        hid = inv[len("Handover "):] if inv.startswith("Handover ") else None
    return hid


def derive_sale_attendant(sale: dict, handovers: dict) -> Optional[tuple]:
    """(attendant_id, attendant_name, how) from the stamped field or the creating handover."""
    if sale.get("attendant_id"):
        return sale["attendant_id"], sale.get("attendant_name") or sale["attendant_id"], "stamped"
    hid = creating_handover_id(sale)
    ho = handovers.get(hid) if hid else None
    if ho and ho.get("attendant_id"):
        return ho["attendant_id"], ho.get("attendant_name") or ho["attendant_id"], "handover"
    return None


def resolve_sale_attendant(sale: dict, handovers: dict, shifts: dict) -> Optional[tuple]:
    """derive_sale_attendant, falling back to a single-attendant shift. None = unassigned."""
    found = derive_sale_attendant(sale, handovers)
    if found:
        return found
    roster = shift_attendants(shifts.get(sale.get("shift_id", "")))
    if len(roster) == 1:
        aid, name = next(iter(roster.items()))
        return aid, name, "only_attendant_on_shift"
    return None


def find_credit_duplicate(sales: list, account_id: str, fuel_type: str, coupon_serial: Optional[str],
                          shift_id: str, exclude_sale_id: Optional[str] = None) -> Optional[dict]:
    """
    The live sale a new/edited credit sale would duplicate, across EVERY
    attendant — ownership decides whose handover a sale counts in, but a
    duplicate is a duplicate whoever entered it first.

      - With a coupon serial: the same client's coupon is single-use, so any
        live sale with that (account, serial) on any shift or date is a match.
      - Without one: same client + same fuel type on the same shift, the
        rule handovers have always used.
    """
    cs = (coupon_serial or "").strip().upper()
    for s in sales:
        if s.get("voided") or (exclude_sale_id and s.get("sale_id") == exclude_sale_id):
            continue
        if s.get("account_id") != account_id:
            continue
        other_cs = (s.get("coupon_serial") or "").strip().upper()
        if cs:
            if other_cs == cs:
                return s
        elif not other_cs and s.get("shift_id") == shift_id and s.get("fuel_type") == fuel_type:
            return s
    return None


def describe_duplicate(dup: dict, handovers: dict, shifts: dict) -> str:
    """Who already recorded it and when, for the rejection message."""
    owner = resolve_sale_attendant(dup, handovers, shifts)
    who = owner[1] if owner else "another entry"
    what = f"coupon {dup['coupon_serial']}" if dup.get("coupon_serial") else dup.get("fuel_type", "this sale")
    return f"{what} already recorded by {who} on {dup.get('date', '')} ({dup.get('shift_id', '')})"


def sale_belongs_to(sale: dict, shift_id: str, attendant_id: str,
                    handovers: dict, shifts: dict) -> bool:
    """True if this live (non-voided) sale should count in this attendant's handover for this shift."""
    if sale.get("voided") or sale.get("shift_id") != shift_id:
        return False
    owner = resolve_sale_attendant(sale, handovers, shifts)
    return bool(owner) and owner[0] == attendant_id
