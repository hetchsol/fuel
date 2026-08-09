"""
Retroactive Price Correction Service

When a fuel price changes, shifts closed since the *previous* price took
effect were priced under the old rate. This computes what those shifts'
revenue would have been at the new price and, on approval, persists that as
a separate adjustment record — the original handover/shift is never edited,
so shift locking (assert_shift_editable, daily close-off) never comes into
play here.
"""
import uuid
from datetime import datetime
from typing import Optional

from ..database.station_files import load_station_json, save_station_json
from .audit_service import get_audit_log


def _fuel_field(fuel_type: str) -> str:
    return f"{fuel_type.strip().lower()}_price_per_liter"


def find_price_change_boundary(station_id: str, fuel_type: str) -> Optional[dict]:
    """
    Find the most recent point at which `fuel_type`'s price changed to its
    current value, from either of the two paths a price change can take:
    a direct edit (audit_log "price_change" entries) or a scheduled change
    that has since applied (scheduled_price_changes.json, applied=True).

    Returns {"since": iso_timestamp, "old_price": float} for the most recent
    change, or None if neither source has a record for this fuel type.
    """
    field = _fuel_field(fuel_type)
    candidates: list = []

    for entry in get_audit_log(station_id, action="price_change", limit=1000):
        details = entry.get("details") or {}
        old = (details.get("old") or {}).get(field)
        new = (details.get("new") or {}).get(field)
        ts = entry.get("timestamp")
        if ts and old is not None and new is not None and old != new:
            candidates.append((ts, old))

    scheduled = load_station_json(station_id, 'scheduled_price_changes.json', default=[])
    for sp in scheduled:
        if sp.get("fuel_type") == fuel_type and sp.get("applied") and sp.get("applied_at"):
            old = sp.get("old_price_per_liter")
            if old is not None:
                candidates.append((sp["applied_at"], old))

    if not candidates:
        return None

    candidates.sort(key=lambda c: c[0])
    since, old_price = candidates[-1]
    return {"since": since, "old_price": old_price}


def _nozzle_totals(handover: dict, fuel_type: str) -> tuple:
    """(volume_sold, recorded_revenue) summed across nozzles matching fuel_type."""
    volume = 0.0
    revenue = 0.0
    for ns in handover.get("nozzle_summaries", []):
        if ns.get("fuel_type") != fuel_type:
            continue
        volume += ns.get("volume_sold") or 0.0
        revenue += ns.get("revenue") or 0.0
    return volume, revenue


def _already_corrected_handover_ids(station_id: str, fuel_type: str) -> set:
    corrections = load_station_json(station_id, 'price_corrections.json', default={})
    return {
        c.get("handover_id") for c in corrections.values()
        if c.get("fuel_type") == fuel_type
    }


def compute_correction_preview(
    station_id: str, fuel_type: str, new_price: float, since_override: Optional[str] = None,
) -> dict:
    """
    List completed handovers since the price-change boundary whose fuel_type
    volume would earn different revenue at new_price, excluding handovers
    already corrected for this fuel type.
    """
    boundary = find_price_change_boundary(station_id, fuel_type)
    since = since_override or (boundary["since"] if boundary else None)

    empty = {
        "boundary_found": boundary is not None,
        "since": since,
        "old_price": boundary["old_price"] if boundary else None,
        "rows": [],
        "total_old_revenue": 0.0,
        "total_new_revenue": 0.0,
        "total_variance": 0.0,
    }
    if not since:
        return empty

    since_date = since[:10]
    handovers = load_station_json(station_id, 'attendant_handovers.json', default={})
    already_corrected = _already_corrected_handover_ids(station_id, fuel_type)

    rows = []
    for hid, h in handovers.items():
        if h.get("phase") != "completed":
            continue
        if h.get("date", "") < since_date:
            continue
        if hid in already_corrected:
            continue
        volume, old_revenue = _nozzle_totals(h, fuel_type)
        if volume <= 0:
            continue
        new_revenue = volume * new_price
        rows.append({
            "handover_id": hid,
            "shift_id": h.get("shift_id"),
            "date": h.get("date"),
            "shift_type": h.get("shift_type"),
            "attendant_name": h.get("attendant_name"),
            "volume": round(volume, 2),
            "old_revenue": round(old_revenue, 2),
            "new_revenue": round(new_revenue, 2),
            "variance": round(new_revenue - old_revenue, 2),
        })

    rows.sort(key=lambda r: r["date"])
    return {
        "boundary_found": boundary is not None,
        "since": since,
        "old_price": boundary["old_price"] if boundary else None,
        "rows": rows,
        "total_old_revenue": round(sum(r["old_revenue"] for r in rows), 2),
        "total_new_revenue": round(sum(r["new_revenue"] for r in rows), 2),
        "total_variance": round(sum(r["variance"] for r in rows), 2),
    }


def apply_corrections(
    station_id: str, fuel_type: str, new_price: float, handover_ids: list, applied_by: str,
) -> list:
    """
    Recompute (server-side, not trusting client-supplied figures) and persist
    one correction record per handover_id. Skips ids with nothing to correct
    (not found, or no matching-fuel-type volume). Returns the created records.
    """
    handovers = load_station_json(station_id, 'attendant_handovers.json', default={})
    corrections = load_station_json(station_id, 'price_corrections.json', default={})
    now = datetime.now().isoformat()
    created = []

    for hid in handover_ids:
        h = handovers.get(hid)
        if not h:
            continue
        volume, old_revenue = _nozzle_totals(h, fuel_type)
        if volume <= 0:
            continue
        new_revenue = volume * new_price
        correction_id = f"PC-{uuid.uuid4().hex[:10]}"
        record = {
            "correction_id": correction_id,
            "handover_id": hid,
            "shift_id": h.get("shift_id"),
            "date": h.get("date"),
            "shift_type": h.get("shift_type"),
            "attendant_name": h.get("attendant_name"),
            "fuel_type": fuel_type,
            "new_price": new_price,
            "volume": round(volume, 2),
            "old_revenue": round(old_revenue, 2),
            "new_revenue": round(new_revenue, 2),
            "variance": round(new_revenue - old_revenue, 2),
            "applied_by": applied_by,
            "applied_at": now,
        }
        corrections[correction_id] = record
        created.append(record)

    if created:
        save_station_json(station_id, 'price_corrections.json', corrections)
    return created


def list_corrections(
    station_id: str, fuel_type: Optional[str] = None,
    start_date: Optional[str] = None, end_date: Optional[str] = None,
) -> list:
    corrections = load_station_json(station_id, 'price_corrections.json', default={})
    rows = list(corrections.values())
    if fuel_type:
        rows = [r for r in rows if r.get("fuel_type") == fuel_type]
    if start_date:
        rows = [r for r in rows if r.get("date", "") >= start_date]
    if end_date:
        rows = [r for r in rows if r.get("date", "") <= end_date]
    rows.sort(key=lambda r: r.get("applied_at", ""), reverse=True)
    return rows


# ── Time-boxed owner-to-manager delegation for applying corrections ──────
#
# Separate from the supervisor tank-dip delegate (a per-action reason check)
# — this is a standing grant the owner sets up in advance for one named
# manager, good until an expiry the owner picks, with no separate "activate"
# step: it's live the moment it's granted and lapses on its own.

def grant_delegation(
    station_id: str, manager_username: str, manager_full_name: str,
    expires_at: str, granted_by: str,
) -> dict:
    delegations = load_station_json(station_id, 'price_correction_delegations.json', default={})
    delegation_id = f"PCD-{uuid.uuid4().hex[:10]}"
    record = {
        "delegation_id": delegation_id,
        "manager_username": manager_username,
        "manager_full_name": manager_full_name,
        "granted_by": granted_by,
        "granted_at": datetime.now().isoformat(),
        "expires_at": expires_at,
        "revoked_at": None,
    }
    delegations[delegation_id] = record
    save_station_json(station_id, 'price_correction_delegations.json', delegations)
    return record


def revoke_delegation(station_id: str, delegation_id: str) -> bool:
    delegations = load_station_json(station_id, 'price_correction_delegations.json', default={})
    record = delegations.get(delegation_id)
    if not record or record.get("revoked_at"):
        return False
    record["revoked_at"] = datetime.now().isoformat()
    save_station_json(station_id, 'price_correction_delegations.json', delegations)
    return True


def is_delegated(station_id: str, username: str) -> bool:
    now = datetime.now().isoformat()
    delegations = load_station_json(station_id, 'price_correction_delegations.json', default={})
    return any(
        d.get("manager_username") == username
        and not d.get("revoked_at")
        and d.get("expires_at", "") > now
        for d in delegations.values()
    )


def list_delegations(station_id: str) -> list:
    now = datetime.now().isoformat()
    delegations = load_station_json(station_id, 'price_correction_delegations.json', default={})
    rows = []
    for d in delegations.values():
        row = dict(d)
        if row.get("revoked_at"):
            row["status"] = "revoked"
        elif row.get("expires_at", "") <= now:
            row["status"] = "expired"
        else:
            row["status"] = "active"
        rows.append(row)
    rows.sort(key=lambda r: r.get("granted_at", ""), reverse=True)
    return rows
