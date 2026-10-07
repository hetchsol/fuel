"""
Stores / Stock Dashboard API (manager & owner only).

Two-bin inventory (stores + forecourt) sitting above the existing forecourt
sales flows. See services/stock_service.py for the model.
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from .auth import get_station_context, require_manager_or_owner, require_owner
from ...database.station_files import load_station_json
from ...services import stock_service as svc
from ...services.audit_service import log_audit_event

router = APIRouter()


# ── request models ──────────────────────────────────────────────────

class ItemInput(BaseModel):
    category: str
    product_code: str
    name: str
    unit: str = "ea"
    reorder_level: float = 0
    reorder_qty: float = 0
    unit_cost: Optional[float] = None
    # Fields synced to the pricing catalog (lubricants / accessories only)
    selling_price: Optional[float] = None
    sub_category: Optional[str] = None   # lubricant sub-category ("Engine Oil", etc.)
    unit_size: Optional[str] = None      # lubricant unit size ("1L", "4L", etc.)


class ReceiveInput(BaseModel):
    item_key: str
    qty: float
    note: str = ""
    unit_cost: Optional[float] = None


class IssueInput(BaseModel):
    item_key: str
    qty: float
    note: str = ""


class SupplierReturnInput(BaseModel):
    item_key: str                 # a cylinder_empty:{size}kg item
    qty: float
    supplier: str
    reference: str = ""           # supplier delivery note / exchange slip number
    bin: str = "forecourt"
    note: str = ""


class DamageInput(BaseModel):
    item_key: str
    qty: float
    bin: str = "stores"
    note: str


class AdjustInput(BaseModel):
    item_key: str
    bin: str
    new_qty: float
    reason: str


class StockTakeCreateInput(BaseModel):
    bin: str = "stores"
    scope_item_keys: Optional[list] = None


class StockTakeLineUpdate(BaseModel):
    item_key: str
    counted_qty: Optional[float] = None
    note: Optional[str] = None


class StockTakeLinesPatch(BaseModel):
    counts: list[StockTakeLineUpdate]


# ── reads ───────────────────────────────────────────────────────────

@router.get("/dashboard", dependencies=[Depends(require_manager_or_owner)])
def get_dashboard(ctx: dict = Depends(get_station_context)):
    return svc.dashboard(ctx["station_id"])


@router.get("/items", dependencies=[Depends(require_manager_or_owner)])
def list_items(ctx: dict = Depends(get_station_context)):
    return list(svc.load_items(ctx["station_id"]).values())


@router.get("/movements", dependencies=[Depends(require_manager_or_owner)])
def list_movements(item_key: str = None, type: str = None, limit: int = 200,
                   ctx: dict = Depends(get_station_context)):
    movements = svc.load_movements(ctx["station_id"])
    if item_key:
        movements = [m for m in movements if m.get("item_key") == item_key]
    if type:
        movements = [m for m in movements if m.get("type") == type]
    movements.sort(key=lambda m: m.get("timestamp", ""), reverse=True)
    return movements[:limit]


# ── catalog + movements (writes) ────────────────────────────────────

@router.post("/items", dependencies=[Depends(require_manager_or_owner)])
def upsert_item(data: ItemInput, ctx: dict = Depends(get_station_context)):
    item = svc.upsert_item(
        ctx["station_id"], data.category, data.product_code, data.name,
        data.unit, data.reorder_level, data.reorder_qty, data.unit_cost,
    )
    # Sync selling_price (and catalog metadata) to the appropriate pricing catalog
    if data.selling_price is not None:
        station_id = ctx["station_id"]
        if data.category == "lubricant":
            from .lubricants_daily import load_product_catalog, save_product_catalog
            catalog = load_product_catalog(station_id)
            found = next((p for p in catalog if p["product_code"] == data.product_code), None)
            if found:
                found["selling_price"] = data.selling_price
                if data.sub_category:
                    found["category"] = data.sub_category
                if data.unit_size:
                    found["unit_size"] = data.unit_size
                found["description"] = data.name
            else:
                catalog.append({
                    "product_code": data.product_code,
                    "description": data.name,
                    "category": data.sub_category or "Other",
                    "unit_size": data.unit_size or data.unit,
                    "selling_price": data.selling_price,
                    "reorder_level": int(data.reorder_level) if data.reorder_level else 0,
                })
            save_product_catalog(station_id, catalog)
        elif data.category == "lpg_accessory":
            from .lpg_daily import load_accessories_catalog, save_accessories_catalog
            catalog = load_accessories_catalog(station_id)
            found = next((a for a in catalog if a["product_code"] == data.product_code), None)
            if found:
                found["selling_price"] = data.selling_price
                found["description"] = data.name
                if data.reorder_level:
                    found["reorder_level"] = int(data.reorder_level)
            else:
                catalog.append({
                    "product_code": data.product_code,
                    "description": data.name,
                    "selling_price": data.selling_price,
                    "reorder_level": int(data.reorder_level) if data.reorder_level else 0,
                })
            save_accessories_catalog(station_id, catalog)
    return item


@router.delete("/items/{item_key}", dependencies=[Depends(require_manager_or_owner)])
def delete_item(item_key: str, ctx: dict = Depends(get_station_context)):
    station_id = ctx["station_id"]
    deleted = svc.delete_item(station_id, item_key, ctx["username"])
    # Mirror removal in the pricing catalog
    parts = item_key.split(":", 1)
    if len(parts) == 2:
        category, product_code = parts
        if category == "lubricant":
            from .lubricants_daily import load_product_catalog, save_product_catalog
            catalog = load_product_catalog(station_id)
            save_product_catalog(station_id, [p for p in catalog if p["product_code"] != product_code])
        elif category == "lpg_accessory":
            from .lpg_daily import load_accessories_catalog, save_accessories_catalog
            catalog = load_accessories_catalog(station_id)
            save_accessories_catalog(station_id, [a for a in catalog if a["product_code"] != product_code])
    return {"status": "deleted", "item_key": item_key, "name": deleted.get("name")}


@router.post("/receive", dependencies=[Depends(require_manager_or_owner)])
def receive(data: ReceiveInput, ctx: dict = Depends(get_station_context)):
    return svc.receive(ctx["station_id"], data.item_key, data.qty,
                       ctx["username"], data.note, data.unit_cost)


@router.post("/issue", dependencies=[Depends(require_manager_or_owner)])
def issue(data: IssueInput, ctx: dict = Depends(get_station_context)):
    return svc.issue(ctx["station_id"], data.item_key, data.qty, ctx["username"], data.note)


@router.post("/return-to-store", dependencies=[Depends(require_manager_or_owner)])
def return_to_store(data: IssueInput, ctx: dict = Depends(get_station_context)):
    return svc.return_to_store(ctx["station_id"], data.item_key, data.qty, ctx["username"], data.note)


@router.post("/return-to-supplier", dependencies=[Depends(require_manager_or_owner)])
def return_to_supplier(data: SupplierReturnInput, ctx: dict = Depends(get_station_context)):
    """Empty cylinders handed back to the supplier. Manager/owner only."""
    return svc.return_to_supplier(ctx["station_id"], data.item_key, data.qty, data.bin,
                                  data.supplier, data.reference, ctx["username"], data.note)


@router.post("/damage", dependencies=[Depends(require_manager_or_owner)])
def damage(data: DamageInput, ctx: dict = Depends(get_station_context)):
    return svc.damage(ctx["station_id"], data.item_key, data.qty, data.bin,
                      ctx["username"], data.note)


@router.post("/adjust", dependencies=[Depends(require_manager_or_owner)])
def adjust(data: AdjustInput, ctx: dict = Depends(get_station_context)):
    return svc.adjust(ctx["station_id"], data.item_key, data.bin, data.new_qty,
                      ctx["username"], data.reason)


# ── convenience: seed the catalog from existing product lists ───────

# Common cylinder sizes (kg). Each becomes a full + empty stores item.
_CYLINDER_SIZES = [3, 6, 9, 19, 45, 48]


def _seed_catalog(station_id: str) -> int:
    """
    Best-effort import of item definitions (zero balances) from the existing
    lubricant / LPG-accessory catalogs + cylinder sizes. Existing items (and
    their balances) are preserved. Returns the number of items created/updated.
    """
    created = 0
    existing = svc.load_items(station_id)

    def _upsert(category, code, name, unit="ea"):
        nonlocal created
        if f"{category}:{code}" in existing:
            return  # upsert_item would reset the manager's name, unit and re-order settings
        try:
            svc.upsert_item(station_id, category, str(code), name, unit)
            created += 1
        except Exception:
            pass

    # Cylinders (full + empty) by size - the sizes attendants count, plus common extras
    try:
        from .lpg_daily import LPG_SIZES
        sizes = sorted(set(_CYLINDER_SIZES) | set(LPG_SIZES))
    except Exception:
        sizes = _CYLINDER_SIZES
    for size in sizes:
        _upsert("cylinder_full", f"{size}kg", f"{size}kg cylinder (full)", "cylinder")
        _upsert("cylinder_empty", f"{size}kg", f"{size}kg cylinder (empty)", "cylinder")

    # Lubricants
    try:
        lubes = load_station_json(station_id, "lubricant_products.json", default=[])
        for p in (lubes.values() if isinstance(lubes, dict) else lubes):
            code = p.get("product_code")
            if code:
                _upsert("lubricant", code, p.get("description", code))
    except Exception:
        pass

    # LPG accessories — from the actual pricing catalog (falls back to the
    # station's default accessory list when no catalog has been saved yet),
    # not the daily-entry history, so a fresh station still seeds correctly.
    try:
        from .lpg_daily import load_accessories_catalog
        accs = load_accessories_catalog(station_id)
        for p in accs:
            code = p.get("product_code")
            if code:
                _upsert("lpg_accessory", code, p.get("description", code))
    except Exception:
        pass
    return created


@router.post("/seed-catalog", dependencies=[Depends(require_manager_or_owner)])
def seed_catalog(ctx: dict = Depends(get_station_context)):
    """
    Best-effort import of item definitions (zero balances) from the existing
    lubricant / LPG-accessory catalogs + cylinder sizes. Existing items (and
    their balances) are preserved. Returns the number of items created/updated.
    """
    station_id = ctx["station_id"]
    created = _seed_catalog(station_id)
    return {"status": "success", "items_seeded": created,
            "total_items": len(svc.load_items(station_id))}


# ── Forecourt go-live ───────────────────────────────────────────────

class GoLiveInput(BaseModel):
    # "last_closing": set every Forecourt count to the last shift's closing count.
    # "current_counts": keep the Forecourt counts as they are (already counted,
    # e.g. through a Forecourt stock take).
    source: str = "last_closing"
    dry_run: bool = True


def _go_live_rows(station_id: str, storage: dict) -> list:
    """Each forecourt item with its current count and the last shift's closing count."""
    from .attendant_handover import _compute_stock_opening
    opening = _compute_stock_opening(station_id, storage, use_forecourt=False)
    prev = opening.get("previous_handovers", {})
    items = svc.load_items(station_id)
    rows = []

    def _row(item_key, name, closing, source, ho):
        it = items.get(item_key)
        rows.append({
            "item_key": item_key, "name": (it or {}).get("name") or name,
            "forecourt_now": (it or {}).get("forecourt"),
            "last_closing": closing, "closing_source": source, "handover_id": ho,
        })

    for r in opening["lpg_cylinders"]:
        size = r["size_kg"]
        _row(f"cylinder_full:{size}kg", f"{size}kg cylinder (full)", r["opening_full"], r["source"], prev.get("lpg"))
        _row(f"cylinder_empty:{size}kg", f"{size}kg cylinder (empty)", r["opening_empty"], r["source"], prev.get("lpg"))
    for r in opening["accessories"]:
        _row(f"lpg_accessory:{r['product_code']}", r["description"], r["opening_stock"], r["source"], prev.get("acc"))
    for r in opening["lubricants"]:
        _row(f"lubricant:{r['product_code']}", r["description"], r["opening_stock"], r["source"], prev.get("lub"))
    return rows


@router.get("/forecourt-status", dependencies=[Depends(require_manager_or_owner)])
def forecourt_status(ctx: dict = Depends(get_station_context)):
    settings = svc.load_settings(ctx["station_id"]) or {}
    pending = sum(1 for v in svc.load_opening_variances(ctx["station_id"]).values()
                  if v.get("status") == "pending")
    return {
        "live_since": settings.get("forecourt_live_since"),
        "live_by": settings.get("forecourt_live_by"),
        "source": settings.get("forecourt_live_source"),
        "pending_count_differences": pending,
    }


@router.post("/forecourt-go-live", dependencies=[Depends(require_owner)])
def forecourt_go_live(data: GoLiveInput, ctx: dict = Depends(get_station_context)):
    """
    Switch the station to the Forecourt count as the source of every
    attendant's opening stock. Owner only, once per station.

    dry_run=True (default) only previews. Applying:
      1. creates any missing catalog items;
      2. with source="last_closing", sets each Forecourt count to the last
         shift's closing count (recorded as adjustments);
      3. records the go-live time. Shifts started before it keep the old
         behaviour, and their handovers no longer move stock (their sales are
         already inside the counts just set - see stock_service.moves_live_stock).
         No existing handover or historical record is modified.
    """
    station_id = ctx["station_id"]
    if data.source not in ("last_closing", "current_counts"):
        raise HTTPException(status_code=400, detail="source must be 'last_closing' or 'current_counts'.")
    if svc.forecourt_live_since(station_id):
        raise HTTPException(status_code=400, detail="This station is already live on the Forecourt count.")

    if data.dry_run:
        return {"dry_run": True, "source": data.source, "rows": _go_live_rows(station_id, ctx["storage"])}

    _seed_catalog(station_id)
    rows = _go_live_rows(station_id, ctx["storage"])
    changed = 0
    if data.source == "last_closing":
        for r in rows:
            target = r["last_closing"] or 0
            if r["forecourt_now"] is None or abs((r["forecourt_now"] or 0) - target) < 1e-9:
                continue
            svc.adjust(station_id, r["item_key"], "forecourt", target, ctx["username"],
                       reason="Forecourt go-live: last shift closing count"
                              + (f" ({r['handover_id']})" if r.get("handover_id") else ""))
            changed += 1

    settings = svc.set_forecourt_live(station_id, ctx["username"], data.source)
    try:
        log_audit_event(station_id=station_id, action="forecourt_go_live", performed_by=ctx["username"],
                        entity_type="station", entity_id=station_id,
                        details={"source": data.source, "counts_changed": changed})
    except Exception:
        pass
    return {"dry_run": False, "source": data.source, "counts_changed": changed,
            "live_since": settings["forecourt_live_since"],
            "rows": _go_live_rows(station_id, ctx["storage"])}


# ── shift-start count differences ───────────────────────────────────

class ResolveCountInput(BaseModel):
    responsibility: str              # previous_shift | this_attendant | stores_error
    note: str
    confirmed_qty: Optional[float] = None   # defaults to the attendant's count


@router.get("/opening-variances", dependencies=[Depends(require_manager_or_owner)])
def list_opening_variances(status: Optional[str] = None, limit: int = 200,
                           ctx: dict = Depends(get_station_context)):
    rows = list(svc.load_opening_variances(ctx["station_id"]).values())
    if status:
        rows = [v for v in rows if v.get("status") == status]
    rows.sort(key=lambda v: v.get("created_at", ""), reverse=True)
    return rows[:limit]


@router.post("/opening-variances/{variance_id}/resolve", dependencies=[Depends(require_manager_or_owner)])
def resolve_opening_variance(variance_id: str, data: ResolveCountInput,
                             ctx: dict = Depends(get_station_context)):
    return svc.resolve_opening_variance(ctx["station_id"], variance_id, data.confirmed_qty,
                                        data.responsibility, data.note, ctx["username"])


# ── stock-take sessions ─────────────────────────────────────────────

@router.post("/stock-takes", dependencies=[Depends(require_manager_or_owner)])
def create_take(data: StockTakeCreateInput, ctx: dict = Depends(get_station_context)):
    """Open a draft stock-take session. Snapshots system_qty per in-scope item."""
    return svc.create_stock_take(
        ctx["station_id"], bin=data.bin,
        scope_item_keys=data.scope_item_keys,
        performed_by=ctx["username"],
    )


@router.get("/stock-takes", dependencies=[Depends(require_manager_or_owner)])
def list_takes(status: Optional[str] = None,
               ctx: dict = Depends(get_station_context)):
    takes = list(svc.load_takes(ctx["station_id"]).values())
    if status:
        takes = [t for t in takes if t.get("status") == status]
    takes.sort(key=lambda t: t.get("started_at", ""), reverse=True)
    return takes


@router.get("/stock-takes/{take_id}", dependencies=[Depends(require_manager_or_owner)])
def get_take(take_id: str, ctx: dict = Depends(get_station_context)):
    take = svc.load_takes(ctx["station_id"]).get(take_id)
    if not take:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Stock take not found.")
    return take


@router.patch("/stock-takes/{take_id}/lines",
              dependencies=[Depends(require_manager_or_owner)])
def update_take_lines(take_id: str, data: StockTakeLinesPatch,
                      ctx: dict = Depends(get_station_context)):
    counts = [c.model_dump() for c in data.counts]
    return svc.upsert_stock_take_lines(ctx["station_id"], take_id, counts)


@router.post("/stock-takes/{take_id}/submit",
             dependencies=[Depends(require_manager_or_owner)])
def submit_take(take_id: str, ctx: dict = Depends(get_station_context)):
    """Apply counted values via adjust() and flip the take to 'submitted'."""
    return svc.submit_stock_take(ctx["station_id"], take_id, ctx["username"])


@router.post("/stock-takes/{take_id}/approve",
             dependencies=[Depends(require_owner)])
def approve_take(take_id: str, ctx: dict = Depends(get_station_context)):
    """Owner sign-off on a submitted stock take."""
    return svc.approve_stock_take(ctx["station_id"], take_id, ctx["username"])
