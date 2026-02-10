"""
Stations Management API
Owner-only endpoints for creating and managing fuel stations.
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import List
from ...models.models import Station
from ...database.stations_registry import (
    STATIONS, load_stations, save_stations, get_station,
    list_stations, create_station as registry_create_station
)
from ...database.storage import get_station_storage
from ...database.seed_defaults import seed_station_defaults
from .auth import get_current_user

router = APIRouter()


@router.get("/", response_model=List[Station])
def get_all_stations(current_user: dict = Depends(get_current_user)):
    """List all stations"""
    return [Station(**s) for s in list_stations()]


@router.get("/{station_id}", response_model=Station)
def get_station_detail(station_id: str, current_user: dict = Depends(get_current_user)):
    """Get station details"""
    station = get_station(station_id)
    if not station:
        raise HTTPException(status_code=404, detail="Station not found")
    return Station(**station)


@router.post("/", response_model=Station)
def create_new_station(station: Station, current_user: dict = Depends(get_current_user)):
    """Create a new station (owner only)"""
    role = current_user.get("role", "")
    role_str = role.value if hasattr(role, 'value') else str(role)
    if role_str != "owner":
        raise HTTPException(status_code=403, detail="Only owners can create stations")

    if station.station_id in STATIONS:
        raise HTTPException(status_code=400, detail="Station ID already exists")

    created = registry_create_station(
        station_id=station.station_id,
        name=station.name,
        location=station.location or "",
        created_by=current_user["user_id"],
    )

    # Initialize empty storage for the station
    get_station_storage(station.station_id)

    return Station(**created)


@router.put("/{station_id}", response_model=Station)
def update_station(station_id: str, station: Station, current_user: dict = Depends(get_current_user)):
    """Update station name/location (owner only)"""
    role = current_user.get("role", "")
    role_str = role.value if hasattr(role, 'value') else str(role)
    if role_str != "owner":
        raise HTTPException(status_code=403, detail="Only owners can update stations")

    if station_id not in STATIONS:
        raise HTTPException(status_code=404, detail="Station not found")

    STATIONS[station_id]["name"] = station.name
    if station.location is not None:
        STATIONS[station_id]["location"] = station.location
    save_stations()

    return Station(**STATIONS[station_id])


@router.post("/{station_id}/setup-wizard")
def run_setup_wizard(station_id: str, current_user: dict = Depends(get_current_user)):
    """
    Seed default infrastructure (2 islands, 8 nozzles, 2 tanks, accounts, etc.)
    for a station. Owner only.
    """
    role = current_user.get("role", "")
    role_str = role.value if hasattr(role, 'value') else str(role)
    if role_str != "owner":
        raise HTTPException(status_code=403, detail="Only owners can run setup wizard")

    if station_id not in STATIONS:
        raise HTTPException(status_code=404, detail="Station not found")

    storage = get_station_storage(station_id)
    seed_station_defaults(storage)

    return {
        "status": "success",
        "message": f"Station {station_id} seeded with default infrastructure",
        "islands": len(storage.get('islands', {})),
        "tanks": len(storage.get('tanks', {})),
        "nozzles": sum(
            len(isl.get('pump_station', {}).get('nozzles', []))
            for isl in storage.get('islands', {}).values()
        ),
        "accounts": len(storage.get('accounts', {})),
    }
