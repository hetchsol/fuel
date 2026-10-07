"""
Stores / Stock service.

A two-bin inventory model that sits ABOVE the existing forecourt sales flows:
each item has a `stores` (backroom) bin and a `forecourt` (sales floor) bin.
Movements drive the bins and are ledgered for audit:

  receive         : external  -> stores
  issue           : stores    -> forecourt
  return_to_store : forecourt -> stores   (reverse of issue)
  damage          : bin       -> write-off
  adjust          : set a bin to a counted value (physical-count correction)
  sale            : forecourt -> out   (fed from daily reconciliation — Phase 3)

Balances live on the item record (fast dashboard reads); `stock_movements.json`
is the append-only history. Per-station, persisted via load/save_station_json.
"""
from datetime import datetime
from typing import Optional

from fastapi import HTTPException

from ..database.station_files import load_station_json, save_station_json
from .audit_service import log_audit_event
from .notification_service import create_notification

ITEMS_FILE = "stock_items.json"
MOVEMENTS_FILE = "stock_movements.json"
TAKES_FILE = "stock_takes.json"

CATEGORIES = ("lubricant", "lpg_accessory", "cylinder_full", "cylinder_empty", "accessory")
BINS = ("stores", "forecourt")


# ── persistence helpers ────────────────────────────────────────────

def load_items(station_id: str) -> dict:
    return load_station_json(station_id, ITEMS_FILE, default={})


def save_items(station_id: str, items: dict):
    save_station_json(station_id, ITEMS_FILE, items)


def load_movements(station_id: str) -> list:
    return load_station_json(station_id, MOVEMENTS_FILE, default=[])


def make_key(category: str, product_code: str) -> str:
    if category not in CATEGORIES:
        raise HTTPException(status_code=400, detail=f"Unknown category '{category}'.")
    return f"{category}:{product_code}"


def _require_item(items: dict, item_key: str) -> dict:
    item = items.get(item_key)
    if not item:
        raise HTTPException(status_code=404, detail=f"Stock item '{item_key}' not found.")
    return item


def _require_positive(qty) -> float:
    try:
        qty = float(qty)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Quantity must be a number.")
    if qty <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be greater than zero.")
    return qty


def _record_movement(station_id: str, mtype: str, item: dict, qty: float,
                     from_bin: Optional[str], to_bin: Optional[str],
                     performed_by: str, note: str = "", ref: str = ""):
    movements = load_movements(station_id)
    movements.append({
        "timestamp": datetime.now().isoformat(),
        "type": mtype,
        "item_key": item["item_key"],
        "name": item.get("name", ""),
        "category": item.get("category", ""),
        "qty": qty,
        "from_bin": from_bin,
        "to_bin": to_bin,
        "stores_after": item["stores"],
        "forecourt_after": item["forecourt"],
        "performed_by": performed_by,
        "note": note or "",
        "ref": ref or "",
    })
    save_station_json(station_id, MOVEMENTS_FILE, movements)
    try:
        log_audit_event(
            station_id=station_id, action=f"stock_{mtype}", performed_by=performed_by,
            entity_type="stock_item", entity_id=item["item_key"],
            details={"qty": qty, "from_bin": from_bin, "to_bin": to_bin,
                     "stores_after": item["stores"], "forecourt_after": item["forecourt"]},
            notes=note or None,
        )
    except Exception:
        pass


def _check_reorder(station_id: str, item: dict):
    """Fire a LOW_STOCK notification when stores crosses to/below the reorder level."""
    level = item.get("reorder_level") or 0
    if level and item["stores"] <= level:
        try:
            create_notification(
                station_id=station_id, type="LOW_STOCK", severity="warning",
                title="Stock at/below re-order level",
                message=f"{item.get('name', item['item_key'])}: stores {item['stores']} "
                        f"(re-order level {level}).",
                entity_type="stock_item", entity_id=item["item_key"],
            )
        except Exception:
            pass


# ── catalog ─────────────────────────────────────────────────────────

def upsert_item(station_id: str, category: str, product_code: str, name: str,
                unit: str = "ea", reorder_level: float = 0, reorder_qty: float = 0,
                unit_cost: Optional[float] = None) -> dict:
    """Create or update a catalog item. Does not change balances."""
    if not product_code or not name:
        raise HTTPException(status_code=400, detail="product_code and name are required.")
    items = load_items(station_id)
    key = make_key(category, product_code)
    item = items.get(key, {
        "item_key": key, "category": category, "product_code": product_code,
        "stores": 0, "forecourt": 0,
    })
    item.update({
        "name": name, "unit": unit or "ea",
        "reorder_level": reorder_level or 0, "reorder_qty": reorder_qty or 0,
    })
    if unit_cost is not None:
        item["unit_cost"] = unit_cost
    items[key] = item
    save_items(station_id, items)
    return item


# ── movements ───────────────────────────────────────────────────────

def receive(station_id: str, item_key: str, qty, performed_by: str,
            note: str = "", unit_cost: Optional[float] = None) -> dict:
    qty = _require_positive(qty)
    items = load_items(station_id)
    item = _require_item(items, item_key)
    item["stores"] += qty
    if unit_cost is not None:
        item["unit_cost"] = unit_cost
    save_items(station_id, items)
    _record_movement(station_id, "receive", item, qty, None, "stores", performed_by, note)
    return item


def issue(station_id: str, item_key: str, qty, performed_by: str, note: str = "") -> dict:
    qty = _require_positive(qty)
    items = load_items(station_id)
    item = _require_item(items, item_key)
    if qty > item["stores"]:
        raise HTTPException(status_code=400,
                            detail=f"Cannot issue {qty}: only {item['stores']} in stores.")
    item["stores"] -= qty
    item["forecourt"] += qty
    save_items(station_id, items)
    _record_movement(station_id, "issue", item, qty, "stores", "forecourt", performed_by, note)
    _check_reorder(station_id, item)
    return item


def return_to_store(station_id: str, item_key: str, qty, performed_by: str, note: str = "") -> dict:
    """Move stock back from the forecourt bin to stores (backroom) — the reverse of issue()."""
    qty = _require_positive(qty)
    items = load_items(station_id)
    item = _require_item(items, item_key)
    if qty > item["forecourt"]:
        raise HTTPException(status_code=400,
                            detail=f"Cannot return {qty}: only {item['forecourt']} on the forecourt.")
    item["forecourt"] -= qty
    item["stores"] += qty
    save_items(station_id, items)
    _record_movement(station_id, "return_to_store", item, qty, "forecourt", "stores", performed_by, note)
    return item


def return_to_supplier(station_id: str, item_key: str, qty, bin: str, supplier: str,
                       reference: str, performed_by: str, note: str = "") -> dict:
    """
    Empty LPG cylinders handed back to the supplier (usually in exchange for
    full ones, which are booked separately via receive()). Takes them out of
    the chosen bin — forecourt by default, since that's where every refill's
    returned empty lands (see apply_handover_sales). Never lets the count go
    below zero: you can't hand over empties the station doesn't have.
    """
    qty = _require_positive(qty)
    if qty != int(qty):
        raise HTTPException(status_code=400, detail="Cylinder count must be a whole number.")
    if bin not in BINS:
        raise HTTPException(status_code=400, detail=f"bin must be one of {BINS}.")
    if not (supplier or "").strip():
        raise HTTPException(status_code=400, detail="Supplier is required.")
    items = load_items(station_id)
    item = _require_item(items, item_key)
    if item.get("category") != "cylinder_empty":
        raise HTTPException(status_code=400, detail="Only empty cylinders can be returned to the supplier.")
    if qty > item[bin]:
        raise HTTPException(status_code=400,
                            detail=f"Cannot return {int(qty)}: only {item[bin]:g} empty in {bin}.")
    item[bin] = round(item[bin] - qty, 4)
    save_items(station_id, items)
    detail = f"Supplier: {supplier.strip()}" + (f"; ref {reference.strip()}" if (reference or "").strip() else "")
    _record_movement(station_id, "return_to_supplier", item, qty, bin, None, performed_by,
                     note=f"{detail}. {note}".strip() if note else detail, ref=(reference or "").strip())
    return item


def damage(station_id: str, item_key: str, qty, bin: str, performed_by: str, note: str) -> dict:
    qty = _require_positive(qty)
    if bin not in BINS:
        raise HTTPException(status_code=400, detail=f"bin must be one of {BINS}.")
    if not (note or "").strip():
        raise HTTPException(status_code=400, detail="A note/reason is required to record damage.")
    items = load_items(station_id)
    item = _require_item(items, item_key)
    if qty > item[bin]:
        raise HTTPException(status_code=400,
                            detail=f"Cannot write off {qty}: only {item[bin]} in {bin}.")
    item[bin] -= qty
    save_items(station_id, items)
    _record_movement(station_id, "damage", item, qty, bin, None, performed_by, note)
    if bin == "stores":
        _check_reorder(station_id, item)
    return item


def adjust(station_id: str, item_key: str, bin: str, new_qty, performed_by: str, reason: str) -> dict:
    if bin not in BINS:
        raise HTTPException(status_code=400, detail=f"bin must be one of {BINS}.")
    try:
        new_qty = float(new_qty)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="new_qty must be a number.")
    if new_qty < 0:
        raise HTTPException(status_code=400, detail="new_qty cannot be negative.")
    if not (reason or "").strip():
        raise HTTPException(status_code=400, detail="A reason is required to adjust stock.")
    items = load_items(station_id)
    item = _require_item(items, item_key)
    delta = round(new_qty - item[bin], 4)
    item[bin] = new_qty
    save_items(station_id, items)
    _record_movement(station_id, "adjust", item, delta, bin, bin, performed_by,
                     note=f"{reason} (set {bin} to {new_qty})")
    if bin == "stores":
        _check_reorder(station_id, item)
    return item


def delete_item(station_id: str, item_key: str, performed_by: str = "system") -> dict:
    """Remove an item from the catalog. Stock quantities are lost."""
    items = load_items(station_id)
    item = _require_item(items, item_key)
    del items[item_key]
    save_items(station_id, items)
    try:
        log_audit_event(
            station_id=station_id, action="stock_delete", performed_by=performed_by,
            entity_type="stock_item", entity_id=item_key,
            details={"name": item.get("name"), "stores": item.get("stores"), "forecourt": item.get("forecourt")},
        )
    except Exception:
        pass
    return item


def record_sale(station_id: str, item_key: str, qty, performed_by: str = "system", ref: str = "") -> Optional[dict]:
    """Decrement the forecourt bin by quantity sold (Phase 3 reconciliation feed).

    Lenient: clamps at zero and is a no-op for unknown items, so a reconciliation
    pass never fails because of a catalog mismatch.
    """
    try:
        qty = float(qty)
    except (TypeError, ValueError):
        return None
    if qty <= 0:
        return None
    items = load_items(station_id)
    item = items.get(item_key)
    if not item:
        return None
    item["forecourt"] = max(0, round(item["forecourt"] - qty, 4))
    save_items(station_id, items)
    _record_movement(station_id, "sale", item, qty, "forecourt", None, performed_by, ref=ref)
    return item


def record_forecourt_return(station_id: str, item_key: str, qty, performed_by: str = "system", ref: str = "") -> Optional[dict]:
    """Add returned stock back to the forecourt bin (e.g. empties from LPG refills).
    Lenient: no-op for non-positive qty or unknown items."""
    try:
        qty = float(qty)
    except (TypeError, ValueError):
        return None
    if qty <= 0:
        return None
    items = load_items(station_id)
    item = items.get(item_key)
    if not item:
        return None
    item["forecourt"] = round(item["forecourt"] + qty, 4)
    save_items(station_id, items)
    _record_movement(station_id, "return", item, qty, None, "forecourt", performed_by, ref=ref)
    return item


def sync_forecourt_deltas(station_id: str, previous: dict, current: dict,
                          performed_by: str = "system", ref: str = "",
                          entry_date: Optional[str] = None) -> dict:
    """
    Reconcile the forecourt bin to a NEW cumulative quantity-consumed total per
    item, given the PREVIOUS cumulative total already applied for the same
    entry (e.g. a Daily Entry record). Only the delta is applied — a resubmit
    of an unchanged entry is a no-op, and a downward correction credits stock
    back instead of ignoring the drop.

    Used by every entry point that records lubricant/LPG/accessory sales
    (manual Daily Entry pages, and the auto-feed from shift approval) so
    re-editing a day's entry never double-counts what an earlier save of the
    same entry already pushed to Stores.

    previous / current: {item_key: cumulative_qty}, where a positive quantity
    means "consumed from forecourt" (sold or damaged) and a negative quantity
    means "returned to forecourt" (e.g. empties from LPG refills, tracked as
    a negative running total so the same delta math applies uniformly).
    Missing keys are treated as 0. Returns `current` unchanged, for the
    caller to persist as the new baseline.

    Once the station is live on Forecourt counts, a correction to an entry
    dated before go-live does not move stock: the go-live counts already
    include whatever happened on those days.
    """
    live = forecourt_live_since(station_id)
    if live and entry_date and entry_date < live[:10]:
        return current
    for key in set(previous) | set(current):
        delta = round((current.get(key, 0) or 0) - (previous.get(key, 0) or 0), 4)
        if delta > 0:
            record_sale(station_id, key, delta, performed_by, ref=ref)
        elif delta < 0:
            record_forecourt_return(station_id, key, -delta, performed_by, ref=ref)
    return current


def rebase_manual_contribution(by_handover: Optional[dict], current: dict) -> Optional[dict]:
    """
    A manual Daily Entry save has just synced Stores to `current` (the entry's
    whole cumulative total). Keep the per-handover breakdown of that baseline
    consistent: every handover keeps its own share and whatever is left over
    is the manual page's own share (`_manual`), so the breakdown still adds up
    to `current`. Returns None for entries that never had a breakdown, whose
    bare `stores_applied` stays authoritative as before.
    """
    if by_handover is None:
        return None
    others = {k: v for k, v in by_handover.items() if k != "_manual"}
    sums: dict = {}
    for contrib in others.values():
        for k, v in (contrib or {}).items():
            sums[k] = sums.get(k, 0) + (v or 0)
    manual = {k: round((current.get(k, 0) or 0) - sums.get(k, 0), 4) for k in set(current) | set(sums)}
    manual = {k: v for k, v in manual.items() if v}
    if manual:
        others["_manual"] = manual
    return others


def _add_delta(acc: dict, key: Optional[str], qty):
    if key and qty:
        acc[key] = acc.get(key, 0) + qty


def _compute_stock_deltas(snap: dict) -> tuple:
    """
    Derive (sold, empties_in) forecourt deltas from a handover's stock_snapshot.
    Shared by apply_handover_sales and reverse_handover_sales so the two stay
    in lockstep — a delta either function doesn't know about can't be applied
    without also being reversible.

    lpg_trades are folded in here too: a trade is physically a full-cylinder
    sale of the new size plus an empty-cylinder return of the old size — the
    same two primitives as a plain sale, just sourced from a trade row instead
    of sold_refill/sold_with_cylinder.
    """
    sold: dict = {}
    empties_in: dict = {}

    for r in snap.get("lubricants", []) or []:
        _add_delta(sold, f"lubricant:{r.get('product_code')}", (r.get("sold", 0) or 0) + (r.get("damaged", 0) or 0))
    for r in snap.get("accessories", []) or []:
        _add_delta(sold, f"lpg_accessory:{r.get('product_code')}", (r.get("sold", 0) or 0) + (r.get("damaged", 0) or 0))
    for r in snap.get("lpg_cylinders", []) or []:
        size = r.get("size_kg")
        if size is None:
            continue
        total = r.get("total_sold")
        if total is None:
            total = (r.get("sold_refill", 0) or 0) + (r.get("sold_with_cylinder", 0) or 0)
        total = (total or 0) + (r.get("damaged", 0) or 0)
        _add_delta(sold, f"cylinder_full:{size}kg", total)
        _add_delta(empties_in, f"cylinder_empty:{size}kg", r.get("sold_refill", 0) or 0)
    for t in snap.get("lpg_trades", []) or []:
        qty = t.get("quantity", 0) or 0
        if not qty:
            continue
        _add_delta(sold, f"cylinder_full:{t.get('to_size_kg')}kg", qty)
        _add_delta(empties_in, f"cylinder_empty:{t.get('from_size_kg')}kg", qty)

    return sold, empties_in


def apply_handover_sales(station_id: str, handover: dict, performed_by: str = "system") -> dict:
    """
    Apply ONE handover's stock snapshot to the forecourt bins — called when the
    attendant submits it, so stock on hand is real time (approval calls it
    again, which is a no-op thanks to the idempotency flag below):
      - decrement forecourt by quantity sold + damaged (lubricants, LPG
        accessories, full cylinders = refills + with-cylinder sales + traded-out
        — damaged stock leaves the sellable forecourt count the same as a sale);
      - return empties to forecourt for each refill and each traded-in cylinder
        (full→empty swap).

    Uses the same "sold + damaged" formula as the manual Daily Entry endpoints
    (lpg_daily.py / lubricants_daily.py) so every entry point that records
    these sales has the same net effect on Stores, regardless of which one
    is used.

    Idempotent: sets `handover["stock_applied"] = True` and returns early if it
    was already applied (the CALLER is responsible for persisting the handover so
    the flag sticks). Fully lenient — clamps at zero, skips unknown items.
    """
    if not handover or handover.get("stock_applied") or not moves_live_stock(station_id, handover):
        return {"applied": False}

    snap = handover.get("stock_snapshot") or {}
    ref = handover.get("handover_id", "")
    sold, empties_in = _compute_stock_deltas(snap)

    sales_applied = sum(1 for k, q in sold.items()
                        if record_sale(station_id, k, q, performed_by, ref=ref) is not None)
    returns_applied = sum(1 for k, q in empties_in.items()
                          if record_forecourt_return(station_id, k, q, performed_by, ref=ref) is not None)
    handover["stock_applied"] = True
    return {"applied": True, "items_sold": len(sold), "sales_applied": sales_applied,
            "empty_returns_applied": returns_applied}


def reverse_handover_sales(station_id: str, handover: dict, performed_by: str = "system") -> dict:
    """
    Undo `apply_handover_sales` for a handover being voided — recomputes the
    same sold/empties_in quantities from the handover's stored
    `stock_snapshot` and applies each stock movement in reverse: forecourt
    stock decremented by a sale is credited back (`record_forecourt_return`),
    forecourt stock credited by an empty-cylinder return is debited back
    (`record_sale`). Resets `stock_applied` back to False (rather than a
    separate "reversed" flag) so `apply_handover_sales`'s own idempotency
    guard can be reused as-is to re-apply cleanly if the void is undone.
    """
    if not handover or not handover.get("stock_applied") or not moves_live_stock(station_id, handover):
        return {"reversed": False}

    snap = handover.get("stock_snapshot") or {}
    ref = handover.get("handover_id", "")
    sold, empties_in = _compute_stock_deltas(snap)

    # Reverse of apply_handover_sales: what was sold+damaged (decremented) is
    # credited back, what came back as empties (incremented) is debited back out.
    returns_applied = sum(1 for k, q in sold.items()
                          if record_forecourt_return(station_id, k, q, performed_by, ref=f"void-{ref}") is not None)
    sales_applied = sum(1 for k, q in empties_in.items()
                        if record_sale(station_id, k, q, performed_by, ref=f"void-{ref}") is not None)
    handover["stock_applied"] = False
    return {"reversed": True, "items_reversed": len(sold),
            "sales_applied": sales_applied, "returns_applied": returns_applied}


# ── Forecourt go-live + shift-start counts ──────────────────────────
#
# Until a station "goes live" on the Forecourt bin, attendants' opening stock
# carries forward from the previous handover's closing count and the bin is
# not trusted. Going live sets every Forecourt count once (from the last
# closings, or as already counted) and from then on the bin is the system
# count each attendant confirms or corrects at shift start.

SETTINGS_FILE = "stock_settings.json"
OPENING_VARIANCES_FILE = "opening_stock_variances.json"

# Manager movements that change what is on the forecourt during a shift and
# therefore count as the attendant's "additions" (negative when stock is
# taken away). Handover-driven sale/return rows and count corrections
# (adjust) are deliberately excluded.
_ADDITION_SIGNS = {
    ("issue", "to"): 1,
    ("return_to_store", "from"): -1,
    ("return_to_supplier", "from"): -1,
    ("damage", "from"): -1,
}


def load_settings(station_id: str) -> dict:
    return load_station_json(station_id, SETTINGS_FILE, default={})


def forecourt_live_since(station_id: str) -> Optional[str]:
    """ISO timestamp the station went live on the Forecourt bin, or None."""
    return (load_settings(station_id) or {}).get("forecourt_live_since")


def moves_live_stock(station_id: str, handover: dict) -> bool:
    """
    Whether this handover's sales may move the Forecourt counts. Before
    go-live every handover does (as before). After go-live only handovers
    for shifts started under live counts do (`counts_live`, stamped when the
    handover is created): the go-live counts already include every earlier
    shift, so approving, correcting, voiding or un-voiding one of those must
    not move stock again. Older records are never modified to achieve this.
    """
    if not forecourt_live_since(station_id):
        return True
    return bool(handover.get("counts_live"))


def set_forecourt_live(station_id: str, performed_by: str, source: str) -> dict:
    settings = load_settings(station_id) or {}
    settings.update({
        "forecourt_live_since": datetime.now().isoformat(),
        "forecourt_live_by": performed_by,
        "forecourt_live_source": source,
    })
    save_station_json(station_id, SETTINGS_FILE, settings)
    return settings


def forecourt_additions(station_id: str, since_iso: str, until_iso: Optional[str] = None) -> dict:
    """
    Net quantity a manager put on (+) or took off (-) the forecourt per item
    between two timestamps: issues, returns to stores, empties returned to
    the supplier and forecourt write-offs. {item_key: net_qty}, zero nets dropped.
    """
    net: dict = {}
    if not since_iso:
        return net
    for m in load_movements(station_id):
        ts = m.get("timestamp", "")
        if ts < since_iso or (until_iso and ts > until_iso):
            continue
        mtype = m.get("type")
        sign = 0
        if m.get("to_bin") == "forecourt":
            sign = _ADDITION_SIGNS.get((mtype, "to"), 0)
        elif m.get("from_bin") == "forecourt":
            sign = _ADDITION_SIGNS.get((mtype, "from"), 0)
        if sign:
            key = m.get("item_key")
            net[key] = round(net.get(key, 0) + sign * (m.get("qty", 0) or 0), 4)
    return {k: v for k, v in net.items() if v}


def correct_forecourt_by(station_id: str, item_key: str, delta, performed_by: str,
                         reason: str, ref: str = "") -> Optional[dict]:
    """
    Move a Forecourt count by a signed difference found in a count (as opposed
    to adjust(), which sets an absolute figure and would wipe out sales booked
    since the count was taken). Clamps at zero; no-op for unknown items.
    """
    try:
        delta = round(float(delta), 4)
    except (TypeError, ValueError):
        return None
    if not delta:
        return None
    items = load_items(station_id)
    item = items.get(item_key)
    if not item:
        return None
    item["forecourt"] = max(0, round(item["forecourt"] + delta, 4))
    save_items(station_id, items)
    _record_movement(station_id, "adjust", item, delta, "forecourt", "forecourt",
                     performed_by, note=reason, ref=ref)
    return item


def load_opening_variances(station_id: str) -> dict:
    return load_station_json(station_id, OPENING_VARIANCES_FILE, default={})


def save_opening_variances(station_id: str, data: dict):
    save_station_json(station_id, OPENING_VARIANCES_FILE, data)


RESPONSIBILITY = ("previous_shift", "this_attendant", "stores_error")


def resolve_opening_variance(station_id: str, variance_id: str, confirmed_qty,
                             responsibility: str, note: str, performed_by: str) -> dict:
    """
    Manager decision on a shift-start count that did not match the system.
    The Forecourt count moves by (confirmed - system), so the bin ends up at
    what was physically there at shift start whichever way responsibility
    falls. `confirmed_qty` defaults to the attendant's own count; a manager
    recount can override it (e.g. the attendant under-declared).
    """
    if responsibility not in RESPONSIBILITY:
        raise HTTPException(status_code=400, detail=f"responsibility must be one of {RESPONSIBILITY}.")
    if not (note or "").strip():
        raise HTTPException(status_code=400, detail="A note is required to resolve a count difference.")
    variances = load_opening_variances(station_id)
    v = variances.get(variance_id)
    if not v:
        raise HTTPException(status_code=404, detail="Count difference not found.")
    if v.get("status") != "pending":
        raise HTTPException(status_code=400, detail="This count difference has already been resolved.")
    if confirmed_qty is None:
        confirmed_qty = v.get("counted_qty", 0)
    try:
        confirmed_qty = float(confirmed_qty)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Confirmed count must be a number.")
    if confirmed_qty < 0 or confirmed_qty != int(confirmed_qty):
        raise HTTPException(status_code=400, detail="Confirmed count must be a whole number, zero or more.")

    delta = round(confirmed_qty - (v.get("system_qty", 0) or 0), 4)
    bin_moved = False
    if v.get("forecourt_live") and delta:
        bin_moved = correct_forecourt_by(
            station_id, v["item_key"], delta, performed_by,
            reason=(f"Shift-start count {v.get('shift_id')} ({v.get('attendant_name')}): "
                    f"system {v.get('system_qty', 0):g}, confirmed {confirmed_qty:g}. {note.strip()}"),
            ref=variance_id) is not None

    v.update({
        "status": "resolved",
        "confirmed_qty": confirmed_qty,
        "responsibility": responsibility,
        "resolution_note": note.strip(),
        "resolved_by": performed_by,
        "resolved_at": datetime.now().isoformat(),
        "forecourt_corrected_by": delta if bin_moved else 0,
    })
    save_opening_variances(station_id, variances)
    try:
        log_audit_event(
            station_id=station_id, action="opening_count_resolved", performed_by=performed_by,
            entity_type="stock_item", entity_id=v["item_key"],
            details={"variance_id": variance_id, "system_qty": v.get("system_qty"),
                     "counted_qty": v.get("counted_qty"), "confirmed_qty": confirmed_qty,
                     "responsibility": responsibility},
            notes=note.strip(),
        )
    except Exception:
        pass
    return v


# ── stock-take sessions ─────────────────────────────────────────────

def load_takes(station_id: str) -> dict:
    return load_station_json(station_id, TAKES_FILE, default={})


def save_takes(station_id: str, takes: dict):
    save_station_json(station_id, TAKES_FILE, takes)


def _take_status_or_400(take: Optional[dict], expected: str) -> dict:
    if not take:
        raise HTTPException(status_code=404, detail="Stock take not found.")
    if take.get("status") != expected:
        raise HTTPException(
            status_code=400,
            detail=f"Stock take is '{take.get('status')}', not '{expected}'.",
        )
    return take


def create_stock_take(station_id: str, bin: str = "stores",
                      scope_item_keys: Optional[list] = None,
                      performed_by: str = "") -> dict:
    """
    Open a draft stock-take session. Snapshots the current `bin` quantity per
    in-scope item — those become the baseline for variance, so concurrent
    movements between create and submit don't invalidate the count.
    """
    if bin not in BINS:
        raise HTTPException(status_code=400, detail=f"bin must be one of {BINS}.")
    items = load_items(station_id)
    if scope_item_keys:
        scoped = {k: items[k] for k in scope_item_keys if k in items}
    else:
        scoped = items
    if not scoped:
        raise HTTPException(status_code=400, detail="No matching catalog items to count.")

    now = datetime.now()
    take_id = f"ST-{now.strftime('%Y%m%d')}-{now.strftime('%H%M%S')}"
    take = {
        "take_id": take_id,
        "date": now.strftime("%Y-%m-%d"),
        "bin": bin,
        "scope_item_keys": list(scope_item_keys) if scope_item_keys else None,
        "status": "draft",
        "started_by": performed_by,
        "started_at": now.isoformat(),
        "submitted_by": None,
        "submitted_at": None,
        "approved_by": None,
        "approved_at": None,
        "lines": [
            {
                "item_key": k,
                "name": it.get("name", ""),
                "category": it.get("category", ""),
                "system_qty_at_open": it.get(bin, 0),
                "counted_qty": None,
                "variance": None,
                "note": "",
            }
            for k, it in scoped.items()
        ],
    }
    takes = load_takes(station_id)
    takes[take_id] = take
    save_takes(station_id, takes)
    try:
        log_audit_event(
            station_id=station_id, action="stock_take_create",
            performed_by=performed_by, entity_type="stock_take",
            entity_id=take_id,
            details={"bin": bin, "line_count": len(take["lines"])},
        )
    except Exception:
        pass
    return take


def upsert_stock_take_lines(station_id: str, take_id: str, counts: list) -> dict:
    """
    Update counted quantities (and optional per-line notes) on a draft take.
    Each entry: {item_key, counted_qty?, note?}. counted_qty may be None to
    clear it. Variance is recomputed against the line's baseline.
    """
    takes = load_takes(station_id)
    take = _take_status_or_400(takes.get(take_id), "draft")
    by_key = {ln["item_key"]: ln for ln in take["lines"]}
    for c in counts or []:
        key = c.get("item_key")
        if not key or key not in by_key:
            continue
        line = by_key[key]
        if "counted_qty" in c:
            val = c.get("counted_qty")
            if val is None or val == "":
                line["counted_qty"] = None
                line["variance"] = None
            else:
                try:
                    cnt = float(val)
                except (ValueError, TypeError):
                    raise HTTPException(
                        status_code=400,
                        detail=f"counted_qty for {key} must be a number.",
                    )
                if cnt < 0:
                    raise HTTPException(
                        status_code=400,
                        detail=f"counted_qty for {key} cannot be negative.",
                    )
                line["counted_qty"] = cnt
                line["variance"] = round(cnt - (line.get("system_qty_at_open") or 0), 4)
        if "note" in c:
            line["note"] = c.get("note") or ""
    save_takes(station_id, takes)
    return take


def submit_stock_take(station_id: str, take_id: str, performed_by: str = "") -> dict:
    """
    Apply counted quantities to the bin via `adjust` for each line where a
    count was entered. The take becomes 'submitted'. Lines without a counted
    value are skipped (treated as "not counted"). Idempotent in practice
    because the take's status is gated.
    """
    takes = load_takes(station_id)
    take = _take_status_or_400(takes.get(take_id), "draft")
    bin = take["bin"]
    applied = 0
    skipped = 0
    for line in take["lines"]:
        if line.get("counted_qty") is None:
            skipped += 1
            continue
        try:
            adjust(
                station_id, line["item_key"], bin, line["counted_qty"],
                performed_by,
                reason=f"Stock take {take_id} ({take['date']})"
                       + (f" — {line['note']}" if line.get("note") else ""),
            )
            applied += 1
        except HTTPException:
            # Item deleted between open and submit, or another adjust precondition.
            skipped += 1
    take["status"] = "submitted"
    take["submitted_by"] = performed_by
    take["submitted_at"] = datetime.now().isoformat()
    save_takes(station_id, takes)
    try:
        log_audit_event(
            station_id=station_id, action="stock_take_submit",
            performed_by=performed_by, entity_type="stock_take",
            entity_id=take_id,
            details={"applied": applied, "skipped": skipped, "bin": bin},
        )
    except Exception:
        pass
    return take


def approve_stock_take(station_id: str, take_id: str, performed_by: str = "") -> dict:
    """Owner sign-off on a submitted stock take."""
    takes = load_takes(station_id)
    take = _take_status_or_400(takes.get(take_id), "submitted")
    take["status"] = "approved"
    take["approved_by"] = performed_by
    take["approved_at"] = datetime.now().isoformat()
    save_takes(station_id, takes)
    try:
        log_audit_event(
            station_id=station_id, action="stock_take_approve",
            performed_by=performed_by, entity_type="stock_take",
            entity_id=take_id,
        )
    except Exception:
        pass
    return take


# ── dashboard ───────────────────────────────────────────────────────

def dashboard(station_id: str) -> dict:
    items = load_items(station_id)
    rows = []
    for item in items.values():
        level = item.get("reorder_level") or 0
        rows.append({**item, "needs_reorder": bool(level) and item["stores"] <= level})
    rows.sort(key=lambda r: (not r["needs_reorder"], r.get("category", ""), r.get("name", "")))
    reorder = [r for r in rows if r["needs_reorder"]]
    recent = sorted(load_movements(station_id), key=lambda m: m.get("timestamp", ""), reverse=True)[:25]
    return {
        "items": rows,
        "summary": {
            "item_count": len(rows),
            "reorder_count": len(reorder),
            "total_stores_units": round(sum(r.get("stores", 0) for r in rows), 3),
            "total_forecourt_units": round(sum(r.get("forecourt", 0) for r in rows), 3),
            # Empty cylinders on hand per size (both bins), for the empties tile.
            "empties_on_hand": {
                r.get("product_code"): round((r.get("stores", 0) or 0) + (r.get("forecourt", 0) or 0), 3)
                for r in rows if r.get("category") == "cylinder_empty"
            },
        },
        "reorder_alerts": reorder,
        "recent_movements": recent,
    }
