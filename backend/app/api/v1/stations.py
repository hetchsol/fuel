"""
Stations Management API
Owner-only endpoints for creating and managing fuel stations.
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import List
from ...models.models import Station
from ...database import stations_registry
from ...database.stations_registry import (
    get_station, list_stations, save_stations,
    create_station as registry_create_station
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

    if station.station_id in stations_registry.STATIONS:
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

    if station_id not in stations_registry.STATIONS:
        raise HTTPException(status_code=404, detail="Station not found")

    stations_registry.STATIONS[station_id]["name"] = station.name
    if station.location is not None:
        stations_registry.STATIONS[station_id]["location"] = station.location
    save_stations()

    return Station(**stations_registry.STATIONS[station_id])


@router.post("/{station_id}/setup-wizard")
def run_setup_wizard(station_id: str, current_user: dict = Depends(get_current_user)):
    """
    Seed default infrastructure (4 standard islands, 2 tanks, accounts, etc.)
    for a station. All islands start inactive until configured. Owner only.
    """
    role = current_user.get("role", "")
    role_str = role.value if hasattr(role, 'value') else str(role)
    if role_str != "owner":
        raise HTTPException(status_code=403, detail="Only owners can run setup wizard")

    if station_id not in stations_registry.STATIONS:
        raise HTTPException(status_code=404, detail="Station not found")

    storage = get_station_storage(station_id)
    seed_station_defaults(storage)

    return {
        "status": "success",
        "message": f"Station {station_id} seeded with 4 standard islands (all active by default), 2 tanks, and default accounts",
        "islands": len(storage.get('islands', {})),
        "tanks": len(storage.get('tanks', {})),
        "nozzles": sum(
            len(isl.get('pump_station', {}).get('nozzles', []))
            for isl in storage.get('islands', {}).values()
        ),
        "accounts": len(storage.get('accounts', {})),
    }


@router.post("/{station_id}/seed-test-data")
def seed_test_data(station_id: str, current_user: dict = Depends(get_current_user)):
    """Seed 14 days of realistic tank readings & deliveries. Owner only."""
    import sys, os
    role = current_user.get("role", "")
    role_str = role.value if hasattr(role, 'value') else str(role)
    if role_str != "owner":
        raise HTTPException(status_code=403, detail="Only owners can seed test data")

    if station_id not in stations_registry.STATIONS:
        raise HTTPException(status_code=404, detail="Station not found")

    # Import and run the seeder
    backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
    sys.path.insert(0, backend_dir)
    import seed_test_data as seeder

    # Override the seeder's station/path
    seeder.STATION_ID = station_id
    seeder.BASE_DIR = os.path.join(backend_dir, "storage", "stations", station_id)

    readings, deliveries = seeder.generate_all()
    seeder.save_data(readings, deliveries)

    # Evict cached storage so next access reloads from disk/DB
    from ...database.storage import STATIONS_STORAGE
    STATIONS_STORAGE.pop(station_id, None)
    get_station_storage(station_id)

    return {
        "status": "success",
        "message": f"Seeded {len(readings)} tank readings and {len(deliveries)} deliveries for station {station_id}",
        "readings": len(readings),
        "deliveries": len(deliveries),
    }
