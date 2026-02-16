"""
Islands, Pump Stations, and Nozzles Management API
Default setup: 6 islands, 1 pump each, 2 nozzles per pump.
Islands are configured (product type) and activated/deactivated by the owner.
Owners retain full CRUD capabilities.
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import List, Optional
from pydantic import BaseModel
from ...models.models import Island, PumpStation, Nozzle, FUEL_TYPE_ABBREVIATIONS, FUEL_TYPE_FROM_ABBREV
from ...services.naming_convention import compute_display_labels
from .auth import get_station_context

router = APIRouter()


# ── Request models ──────────────────────────────────────

class StatusUpdate(BaseModel):
    status: str  # "active" or "inactive"

class ProductUpdate(BaseModel):
    product_type: str  # "Petrol" or "Diesel"

class NozzleLabelUpdate(BaseModel):
    custom_label: Optional[str] = None  # Set to None to clear and use auto-computed label


# ── READ endpoints ──────────────────────────────────────

@router.get("/fuel-types")
async def get_fuel_types():
    """Return fuel type abbreviation mappings used by the spreadsheet convention."""
    return {
        "abbreviations": FUEL_TYPE_ABBREVIATIONS,
        "from_abbrev": FUEL_TYPE_FROM_ABBREV,
    }


@router.get("/", response_model=List[Island])
async def get_all_islands(
    status: Optional[str] = Query(None, description="Filter by status: active or inactive"),
    ctx: dict = Depends(get_station_context),
):
    """
    Get all islands with their pump stations and nozzles.
    Optional ?status=active filter.
    """
    storage = ctx["storage"]
    islands_data = storage['islands']
    islands = [Island(**island) for island in islands_data.values()]

    if status:
        islands = [i for i in islands if i.status == status]

    return islands


@router.get("/{island_id}", response_model=Island)
async def get_island(island_id: str, ctx: dict = Depends(get_station_context)):
    """Get specific island details"""
    storage = ctx["storage"]
    islands_data = storage['islands']

    if island_id not in islands_data:
        raise HTTPException(status_code=404, detail="Island not found")

    return Island(**islands_data[island_id])


@router.get("/{island_id}/pump-station", response_model=PumpStation)
async def get_pump_station(island_id: str, ctx: dict = Depends(get_station_context)):
    """Get pump station for a specific island"""
    storage = ctx["storage"]
    islands_data = storage['islands']

    if island_id not in islands_data:
        raise HTTPException(status_code=404, detail="Island not found")

    pump_station = islands_data[island_id].get("pump_station")
    if not pump_station:
        raise HTTPException(status_code=404, detail="Pump station not found")

    return PumpStation(**pump_station)


@router.get("/{island_id}/nozzles", response_model=List[Nozzle])
async def get_island_nozzles(island_id: str, ctx: dict = Depends(get_station_context)):
    """Get all nozzles for a specific island"""
    storage = ctx["storage"]
    islands_data = storage['islands']

    if island_id not in islands_data:
        raise HTTPException(status_code=404, detail="Island not found")

    pump_station = islands_data[island_id].get("pump_station")
    if not pump_station:
        return []

    return [Nozzle(**nozzle) for nozzle in pump_station.get("nozzles", [])]


@router.get("/nozzle/{nozzle_id}")
async def get_nozzle_info(nozzle_id: str, ctx: dict = Depends(get_station_context)):
    """Get nozzle info including its island and pump station"""
    storage = ctx["storage"]
    islands_data = storage['islands']

    for island_id, island in islands_data.items():
        pump_station = island.get("pump_station")
        if pump_station:
            for nozzle in pump_station.get("nozzles", []):
                if nozzle["nozzle_id"] == nozzle_id:
                    return {
                        "nozzle": nozzle,
                        "pump_station": {
                            "pump_station_id": pump_station["pump_station_id"],
                            "name": pump_station["name"]
                        },
                        "island": {
                            "island_id": island["island_id"],
                            "name": island["name"],
                            "location": island.get("location")
                        }
                    }

    return {"error": "Nozzle not found"}


# ── Configuration endpoints ─────────────────────────────

@router.put("/{island_id}/status")
async def update_island_status(
    island_id: str,
    body: StatusUpdate,
    ctx: dict = Depends(get_station_context),
):
    """
    Toggle island active/inactive.
    Islands default to active; owner can deactivate as needed.
    """
    storage = ctx["storage"]
    islands_data = storage['islands']

    if island_id not in islands_data:
        raise HTTPException(status_code=404, detail="Island not found")

    new_status = body.status
    if new_status not in ("active", "inactive"):
        raise HTTPException(status_code=400, detail="Status must be 'active' or 'inactive'")

    island = islands_data[island_id]
    island["status"] = new_status
    return {"status": "success", "island_id": island_id, "new_status": new_status}


@router.put("/{island_id}/product")
async def update_island_product(
    island_id: str,
    body: ProductUpdate,
    ctx: dict = Depends(get_station_context),
):
    """
    Configure product type for an island.
    Atomically updates island product_type, pump tank_id, and both nozzles' fuel_type.
    """
    storage = ctx["storage"]
    islands_data = storage['islands']

    if island_id not in islands_data:
        raise HTTPException(status_code=404, detail="Island not found")

    product = body.product_type
    if product not in ("Petrol", "Diesel"):
        raise HTTPException(status_code=400, detail="product_type must be 'Petrol' or 'Diesel'")

    island = islands_data[island_id]
    island["product_type"] = product

    # Update pump station tank mapping
    tank_id = "TANK-PETROL" if product == "Petrol" else "TANK-DIESEL"
    pump_station = island.get("pump_station")
    if pump_station:
        pump_station["tank_id"] = tank_id
        # Update all nozzles' fuel_type
        for nozzle in pump_station.get("nozzles", []):
            nozzle["fuel_type"] = product

    # Recompute display labels across all islands
    compute_display_labels(islands_data)

    return {
        "status": "success",
        "island_id": island_id,
        "product_type": product,
        "tank_id": tank_id,
        "display_number": island.get("display_number"),
        "fuel_type_abbrev": island.get("fuel_type_abbrev"),
    }


@router.put("/{island_id}/nozzle/{nozzle_id}/status")
async def update_nozzle_status(island_id: str, nozzle_id: str, status: str, ctx: dict = Depends(get_station_context)):
    """Update nozzle status (Active, Inactive, Maintenance)"""
    storage = ctx["storage"]
    islands_data = storage['islands']

    if island_id not in islands_data:
        return {"error": "Island not found"}

    pump_station = islands_data[island_id].get("pump_station")
    if not pump_station:
        return {"error": "Pump station not found"}

    for nozzle in pump_station.get("nozzles", []):
        if nozzle["nozzle_id"] == nozzle_id:
            nozzle["status"] = status
            return {"status": "success", "nozzle_id": nozzle_id, "new_status": status}

    return {"error": "Nozzle not found"}


# ── Label endpoints ───────────────────────────────────────

@router.put("/{island_id}/nozzle/{nozzle_id}/label")
async def update_nozzle_label(
    island_id: str,
    nozzle_id: str,
    body: NozzleLabelUpdate,
    ctx: dict = Depends(get_station_context),
):
    """
    Set or clear a custom display label for a nozzle (Owner only).
    Setting custom_label to None reverts to the auto-computed label.
    """
    storage = ctx["storage"]
    islands_data = storage['islands']

    if island_id not in islands_data:
        raise HTTPException(status_code=404, detail="Island not found")

    pump_station = islands_data[island_id].get("pump_station")
    if not pump_station:
        raise HTTPException(status_code=404, detail="Pump station not found")

    for nozzle in pump_station.get("nozzles", []):
        if nozzle["nozzle_id"] == nozzle_id:
            nozzle["custom_label"] = body.custom_label
            # Recompute all labels (will use custom_label where set)
            compute_display_labels(islands_data)
            return {
                "status": "success",
                "nozzle_id": nozzle_id,
                "custom_label": body.custom_label,
                "display_label": nozzle.get("display_label"),
            }

    raise HTTPException(status_code=404, detail="Nozzle not found")



# ── Owner CRUD endpoints ─────────────────────────────────

@router.post("/")
async def create_island(island: Island, ctx: dict = Depends(get_station_context)):
    """
    Create a new island with pump station and nozzles (Owner only).
    New islands default to inactive with no product_type.
    """
    storage = ctx["storage"]
    islands_data = storage['islands']

    if island.island_id in islands_data:
        raise HTTPException(status_code=400, detail="Island already exists")

    islands_data[island.island_id] = island.dict()
    return {"status": "success", "island": island}


@router.delete("/{island_id}")
async def delete_island(island_id: str, ctx: dict = Depends(get_station_context)):
    """Delete an island (Owner only)"""
    storage = ctx["storage"]
    islands_data = storage['islands']

    if island_id not in islands_data:
        raise HTTPException(status_code=404, detail="Island not found")

    deleted_island = islands_data.pop(island_id)

    return {
        "status": "success",
        "message": f"Island {island_id} deleted successfully",
        "deleted_island": deleted_island["name"],
    }


@router.put("/{island_id}/pump-station/tank")
async def update_pump_tank_mapping(island_id: str, tank_id: str, ctx: dict = Depends(get_station_context)):
    """
    Update which tank the pump station draws fuel from (Owner only).
    Consider using PUT /islands/{island_id}/product instead for standardized config.
    """
    storage = ctx["storage"]
    islands_data = storage['islands']

    if island_id not in islands_data:
        raise HTTPException(status_code=404, detail="Island not found")

    if tank_id not in storage.get('tanks', {}):
        raise HTTPException(status_code=404, detail=f"Tank {tank_id} not found")

    pump_station = islands_data[island_id].get("pump_station")
    if not pump_station:
        raise HTTPException(status_code=404, detail="Pump station not found")

    old_tank_id = pump_station.get("tank_id", "Not set")
    pump_station["tank_id"] = tank_id

    return {
        "status": "success",
        "message": f"Pump station now draws from {tank_id}",
        "island_id": island_id,
        "pump_station_id": pump_station["pump_station_id"],
        "old_tank_id": old_tank_id,
        "new_tank_id": tank_id,
    }


@router.post("/{island_id}/nozzle")
async def add_nozzle(island_id: str, nozzle: Nozzle, ctx: dict = Depends(get_station_context)):
    """Add a nozzle to an island's pump station (Owner only)"""
    storage = ctx["storage"]
    islands_data = storage['islands']

    if island_id not in islands_data:
        raise HTTPException(status_code=404, detail="Island not found")

    pump_station = islands_data[island_id].get("pump_station")
    if not pump_station:
        raise HTTPException(status_code=404, detail="Pump station not found")

    for existing_nozzle in pump_station.get("nozzles", []):
        if existing_nozzle["nozzle_id"] == nozzle.nozzle_id:
            raise HTTPException(status_code=400, detail="Nozzle ID already exists")

    pump_station["nozzles"].append(nozzle.dict())

    return {
        "status": "success",
        "message": f"Nozzle {nozzle.nozzle_id} added successfully",
        "nozzle": nozzle,
        "island_id": island_id,
        "total_nozzles": len(pump_station["nozzles"]),
    }


@router.delete("/{island_id}/nozzle/{nozzle_id}")
async def remove_nozzle(island_id: str, nozzle_id: str, ctx: dict = Depends(get_station_context)):
    """Remove a nozzle from an island's pump station (Owner only)"""
    storage = ctx["storage"]
    islands_data = storage['islands']

    if island_id not in islands_data:
        raise HTTPException(status_code=404, detail="Island not found")

    pump_station = islands_data[island_id].get("pump_station")
    if not pump_station:
        raise HTTPException(status_code=404, detail="Pump station not found")

    nozzles = pump_station.get("nozzles", [])
    original_count = len(nozzles)

    pump_station["nozzles"] = [n for n in nozzles if n["nozzle_id"] != nozzle_id]

    if len(pump_station["nozzles"]) == original_count:
        raise HTTPException(status_code=404, detail="Nozzle not found")

    return {
        "status": "success",
        "message": f"Nozzle {nozzle_id} removed successfully",
        "island_id": island_id,
        "remaining_nozzles": len(pump_station["nozzles"]),
    }
