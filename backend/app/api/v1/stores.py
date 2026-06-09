"""
Stores / Stock Dashboard API (manager & owner only).

Two-bin inventory (stores + forecourt) sitting above the existing forecourt
sales flows. See services/stock_service.py for the model.
"""
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from .auth import get_station_context, require_manager_or_owner, require_owner
from ...database.station_files import load_station_json
from ...services import stock_service as svc

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


@router.post("/seed-catalog", dependencies=[Depends(require_manager_or_owner)])
def seed_catalog(ctx: dict = Depends(get_station_context)):
    """
    Best-effort import of item definitions (zero balances) from the existing
    lubricant / LPG-accessory catalogs + cylinder sizes. Existing items (and
    their balances) are preserved. Returns the number of items created/updated.
    """
    station_id = ctx["station_id"]
    created = 0

    def _upsert(category, code, name, unit="ea"):
        nonlocal created
        try:
            svc.upsert_item(station_id, category, str(code), name, unit)
            created += 1
        except Exception:
            pass

    # Cylinders (full + empty) by size
    for size in _CYLINDER_SIZES:
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

    # LPG accessories
    try:
        accs = load_station_json(station_id, "lpg_accessories_daily.json", default=[])
        for p in (accs.values() if isinstance(accs, dict) else accs):
            code = p.get("product_code")
            if code:
                _upsert("lpg_accessory", code, p.get("description", code))
    except Exception:
        pass

    return {"status": "success", "items_seeded": created,
            "total_items": len(svc.load_items(station_id))}


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
