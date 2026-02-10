"""
Islands, Pump Stations, and Nozzles Management API
"""
from fastapi import APIRouter, HTTPException
from typing import List
from ...models.models import Island, PumpStation, Nozzle
from ...services.relationship_validation import validate_create, validate_delete_operation
from ...database.storage import STORAGE

router = APIRouter()

# Use central storage
islands_data = STORAGE['islands']

# Initialize default configuration if empty
# Configuration matches Luanshya Station: 2 Islands, each with 1 pump station containing 2 nozzles (1 for each fuel type)
if not islands_data:
    STORAGE['islands'] = {
    "ISL-001": {
        "island_id": "ISL-001",
        "name": "Island 1",
        "location": "Main Station",
        "pump_station": {
            "pump_station_id": "PS-001",
            "island_id": "ISL-001",
            "name": "Pump Station 1",
            "tank_id": "TANK-PETROL",  # This pump draws from Petrol tank
            "nozzles": [
                {
                    "nozzle_id": "UNL-1A",
                    "pump_station_id": "PS-001",
                    "fuel_type": "Petrol",
                    "status": "Active",
                    "electronic_reading": 609176.526,
                    "mechanical_reading": 611984
                },
                {
                    "nozzle_id": "UNL-1B",
                    "pump_station_id": "PS-001",
                    "fuel_type": "Petrol",
                    "status": "Active",
                    "electronic_reading": 825565.474,
                    "mechanical_reading": 829030
                },
                {
                    "nozzle_id": "LSD-1A",
                    "pump_station_id": "PS-001",
                    "fuel_type": "Diesel",
                    "status": "Active",
                    "electronic_reading": 211532.970,
                    "mechanical_reading": 281964
                },
                {
                    "nozzle_id": "LSD-1B",
                    "pump_station_id": "PS-001",
                    "fuel_type": "Diesel",
                    "status": "Active",
                    "electronic_reading": 216085.638,
                    "mechanical_reading": 284970
                }
            ]
        }
    },
    "ISL-002": {
        "island_id": "ISL-002",
        "name": "Island 2",
        "location": "Main Station",
        "pump_station": {
            "pump_station_id": "PS-002",
            "island_id": "ISL-002",
            "name": "Pump Station 2",
            "tank_id": "TANK-DIESEL",  # This pump draws from Diesel tank
            "nozzles": [
                {
                    "nozzle_id": "UNL-2A",
                    "pump_station_id": "PS-002",
                    "fuel_type": "Petrol",
                    "status": "Active",
                    "electronic_reading": 801332.477,
                    "mechanical_reading": 801430
                },
                {
                    "nozzle_id": "UNL-2B",
                    "pump_station_id": "PS-002",
                    "fuel_type": "Petrol",
                    "status": "Active",
                    "electronic_reading": 1270044.517,
                    "mechanical_reading": 1270144
                },
                {
                    "nozzle_id": "LSD-2A",
                    "pump_station_id": "PS-002",
                    "fuel_type": "Diesel",
                    "status": "Active",
                    "electronic_reading": 448641.242,
                    "mechanical_reading": 448887
                },
                {
                    "nozzle_id": "LSD-2B",
                    "pump_station_id": "PS-002",
                    "fuel_type": "Diesel",
                    "status": "Active",
                    "electronic_reading": 639272.611,
                    "mechanical_reading": 639579
                }
            ]
        }
    }
}
    islands_data = STORAGE['islands']  # Re-assign after initialization
    print(f"[STARTUP] Islands seeded: {list(STORAGE['islands'].keys())}")

@router.get("/", response_model=List[Island])
def get_all_islands():
    """
    Get all islands with their pump stations and nozzles
    """
    return [Island(**island) for island in islands_data.values()]

@router.get("/{island_id}", response_model=Island)
def get_island(island_id: str):
    """
    Get specific island details
    """
    if island_id not in islands_data:
        raise HTTPException(status_code=404, detail="Island not found")

    return Island(**islands_data[island_id])

@router.get("/{island_id}/pump-station", response_model=PumpStation)
def get_pump_station(island_id: str):
    """
    Get pump station for a specific island
    """
    if island_id not in islands_data:
        raise HTTPException(status_code=404, detail="Island not found")

    pump_station = islands_data[island_id].get("pump_station")
    if not pump_station:
        raise HTTPException(status_code=404, detail="Pump station not found")

    return PumpStation(**pump_station)

@router.get("/{island_id}/nozzles", response_model=List[Nozzle])
def get_island_nozzles(island_id: str):
    """
    Get all nozzles for a specific island
    """
    if island_id not in islands_data:
        raise HTTPException(status_code=404, detail="Island not found")

    pump_station = islands_data[island_id].get("pump_station")
    if not pump_station:
        return []

    return [Nozzle(**nozzle) for nozzle in pump_station.get("nozzles", [])]

@router.get("/nozzle/{nozzle_id}")
def get_nozzle_info(nozzle_id: str):
    """
    Get nozzle info including its island and pump station
    """
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
def create_island(island: Island):
    """
    Create a new island with pump station and nozzles
    """
    if island.island_id in islands_data:
        return {"error": "Island already exists"}

    islands_data[island.island_id] = island.dict()
    return {"status": "success", "island": island}

@router.put("/{island_id}/nozzle/{nozzle_id}/status")
def update_nozzle_status(island_id: str, nozzle_id: str, status: str):
    """
    Update nozzle status (Active, Inactive, Maintenance)
    """
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
def delete_island(island_id: str, cascade: bool = False):
    """
    Delete an island (Owner only)

    Args:
        island_id: Island ID to delete
        cascade: If True, delete all dependent records (readings, sales)
    """
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
def update_pump_tank_mapping(island_id: str, tank_id: str):
    """
    Update which tank the pump station draws fuel from (Owner only)

    Args:
        island_id: Island ID
        tank_id: Tank ID (TANK-DIESEL or TANK-PETROL)
    """
    if island_id not in islands_data:
        raise HTTPException(status_code=404, detail="Island not found")

    # Validate tank exists
    if tank_id not in STORAGE['tanks']:
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
def add_nozzle(island_id: str, nozzle: Nozzle):
    """
    Add a nozzle to an island's pump station (Owner only)

    Note: Typically each pump has 2 nozzles
    """
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
def remove_nozzle(island_id: str, nozzle_id: str):
    """
    Remove a nozzle from an island's pump station (Owner only)
    """
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
