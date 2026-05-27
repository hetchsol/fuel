"""
Stores / Stock service.

A two-bin inventory model that sits ABOVE the existing forecourt sales flows:
each item has a `stores` (backroom) bin and a `forecourt` (sales floor) bin.
Movements drive the bins and are ledgered for audit:

  receive  : external  -> stores
  issue    : stores    -> forecourt
  damage   : bin       -> write-off
  adjust   : set a bin to a counted value (physical-count correction)
  sale     : forecourt -> out   (fed from daily reconciliation — Phase 3)

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


def apply_handover_sales(station_id: str, handover: dict, performed_by: str = "system") -> dict:
    """
    Apply ONE handover's stock snapshot to the forecourt bins — called when the
    handover is approved (per-shift, not at day close):
      - decrement forecourt by quantity sold (lubricants, LPG accessories, full
        cylinders = refills + with-cylinder sales);
      - return empties to forecourt for each refill (full→empty swap).

    Idempotent: sets `handover["stock_applied"] = True` and returns early if it
    was already applied (the CALLER is responsible for persisting the handover so
    the flag sticks). Fully lenient — clamps at zero, skips unknown items.
    """
    if not handover or handover.get("stock_applied"):
        return {"applied": False}

    snap = handover.get("stock_snapshot") or {}
    ref = handover.get("handover_id", "")
    sold: dict = {}
    empties_in: dict = {}

    def _add(acc: dict, key: Optional[str], qty):
        if key and qty:
            acc[key] = acc.get(key, 0) + qty

    for r in snap.get("lubricants", []) or []:
        _add(sold, f"lubricant:{r.get('product_code')}", r.get("sold", 0) or 0)
    for r in snap.get("accessories", []) or []:
        _add(sold, f"lpg_accessory:{r.get('product_code')}", r.get("sold", 0) or 0)
    for r in snap.get("lpg_cylinders", []) or []:
        size = r.get("size_kg")
        if size is None:
            continue
        total = r.get("total_sold")
        if total is None:
            total = (r.get("sold_refill", 0) or 0) + (r.get("sold_with_cylinder", 0) or 0)
        _add(sold, f"cylinder_full:{size}kg", total or 0)
        _add(empties_in, f"cylinder_empty:{size}kg", r.get("sold_refill", 0) or 0)

    sales_applied = sum(1 for k, q in sold.items()
                        if record_sale(station_id, k, q, performed_by, ref=ref) is not None)
    returns_applied = sum(1 for k, q in empties_in.items()
                          if record_forecourt_return(station_id, k, q, performed_by, ref=ref) is not None)
    handover["stock_applied"] = True
    return {"applied": True, "items_sold": len(sold), "sales_applied": sales_applied,
            "empty_returns_applied": returns_applied}


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
        },
        "reorder_alerts": reorder,
        "recent_movements": recent,
    }
