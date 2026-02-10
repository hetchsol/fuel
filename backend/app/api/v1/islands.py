"""
Islands, Pump Stations, and Nozzles Management API
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import List
from ...models.models import Island, PumpStation, Nozzle
from ...services.relationship_validation import validate_create, validate_delete_operation
from .auth import get_station_context

router = APIRouter()


@router.get("/", response_model=List[Island])
async def get_all_islands(ctx: dict = Depends(get_station_context)):
    """
    Get all islands with their pump stations and nozzles
    """
    storage = ctx["storage"]
    islands_data = storage['islands']
    return [Island(**island) for island in islands_data.values()]


@router.get("/{island_id}", response_model=Island)
async def get_island(island_id: str, ctx: dict = Depends(get_station_context)):
    """
    Get specific island details
    """
    storage = ctx["storage"]
    islands_data = storage['islands']

    if island_id not in islands_data:
        raise HTTPException(status_code=404, detail="Island not found")

    return Island(**islands_data[island_id])


@router.get("/{island_id}/pump-station", response_model=PumpStation)
async def get_pump_station(island_id: str, ctx: dict = Depends(get_station_context)):
    """
    Get pump station for a specific island
    """
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
    """
    Get all nozzles for a specific island
    """
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
    """
    Get nozzle info including its island and pump station
    """
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


@router.post("/")
async def create_island(island: Island, ctx: dict = Depends(get_station_context)):
    """
    Create a new island with pump station and nozzles
    """
    storage = ctx["storage"]
    islands_data = storage['islands']

    if island.island_id in islands_data:
        return {"error": "Island already exists"}

    islands_data[island.island_id] = island.dict()
    return {"status": "success", "island": island}


@router.put("/{island_id}/nozzle/{nozzle_id}/status")
async def update_nozzle_status(island_id: str, nozzle_id: str, status: str, ctx: dict = Depends(get_station_context)):
    """
    Update nozzle status (Active, Inactive, Maintenance)
    """
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


@router.delete("/{island_id}")
async def delete_island(island_id: str, cascade: bool = False, ctx: dict = Depends(get_station_context)):
    """
    Delete an island (Owner only)

    Args:
        island_id: Island ID to delete
        cascade: If True, delete all dependent records (readings, sales)
    """
    storage = ctx["storage"]
    islands_data = storage['islands']

    if island_id not in islands_data:
        raise HTTPException(status_code=404, detail="Island not found")

    # Validate deletion (check for dependent records)
    validate_delete_operation('islands', island_id, cascade)

    # Delete the island
    deleted_island = islands_data.pop(island_id)

    return {
        "status": "success",
        "message": f"Island {island_id} deleted successfully",
        "deleted_island": deleted_island["name"],
        "cascade": cascade
    }


@router.put("/{island_id}/pump-station/tank")
async def update_pump_tank_mapping(island_id: str, tank_id: str, ctx: dict = Depends(get_station_context)):
    """
    Update which tank the pump station draws fuel from (Owner only)

    Args:
        island_id: Island ID
        tank_id: Tank ID (TANK-DIESEL or TANK-PETROL)
    """
    storage = ctx["storage"]
    islands_data = storage['islands']

    if island_id not in islands_data:
        raise HTTPException(status_code=404, detail="Island not found")

    # Validate tank exists
    if tank_id not in storage['tanks']:
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
        "new_tank_id": tank_id
    }


@router.post("/{island_id}/nozzle")
async def add_nozzle(island_id: str, nozzle: Nozzle, ctx: dict = Depends(get_station_context)):
    """
    Add a nozzle to an island's pump station (Owner only)

    Note: Typically each pump has 2 nozzles
    """
    storage = ctx["storage"]
    islands_data = storage['islands']

    if island_id not in islands_data:
        raise HTTPException(status_code=404, detail="Island not found")

    pump_station = islands_data[island_id].get("pump_station")
    if not pump_station:
        raise HTTPException(status_code=404, detail="Pump station not found")

    # Check if nozzle already exists
    for existing_nozzle in pump_station.get("nozzles", []):
        if existing_nozzle["nozzle_id"] == nozzle.nozzle_id:
            raise HTTPException(status_code=400, detail="Nozzle ID already exists")

    # Add the nozzle
    pump_station["nozzles"].append(nozzle.dict())

    return {
        "status": "success",
        "message": f"Nozzle {nozzle.nozzle_id} added successfully",
        "nozzle": nozzle,
        "island_id": island_id,
        "total_nozzles": len(pump_station["nozzles"])
    }


@router.delete("/{island_id}/nozzle/{nozzle_id}")
async def remove_nozzle(island_id: str, nozzle_id: str, ctx: dict = Depends(get_station_context)):
    """
    Remove a nozzle from an island's pump station (Owner only)
    """
    storage = ctx["storage"]
    islands_data = storage['islands']

    if island_id not in islands_data:
        raise HTTPException(status_code=404, detail="Island not found")

    pump_station = islands_data[island_id].get("pump_station")
    if not pump_station:
        raise HTTPException(status_code=404, detail="Pump station not found")

    # Find and remove the nozzle
    nozzles = pump_station.get("nozzles", [])
    original_count = len(nozzles)

    pump_station["nozzles"] = [n for n in nozzles if n["nozzle_id"] != nozzle_id]

    if len(pump_station["nozzles"]) == original_count:
        raise HTTPException(status_code=404, detail="Nozzle not found")

    return {
        "status": "success",
        "message": f"Nozzle {nozzle_id} removed successfully",
        "island_id": island_id,
        "remaining_nozzles": len(pump_station["nozzles"])
    }
