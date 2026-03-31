"""
Stations Management API
Owner-only endpoints for creating and managing fuel stations.
"""
import shutil
import os
import logging
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import List, Optional
from ...models.models import Station
from ...database import stations_registry
from ...database.stations_registry import (
    get_station, list_stations, save_stations,
    create_station as registry_create_station
)
from ...database.storage import get_station_storage, STATIONS_STORAGE
from ...database.seed_defaults import seed_station_defaults
from ...database.db import (
    is_db_active,
    db_delete_station, db_delete_station_storage, db_delete_station_files,
    db_deactivate_station_users, db_reactivate_station_users,
)
from .auth import get_current_user, require_owner

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/", response_model=List[Station])
def get_all_stations(
    current_user: dict = Depends(get_current_user),
    include_disabled: Optional[bool] = Query(False),
):
    """List all stations. Pass include_disabled=true to see disabled stations."""
    all_stations = list_stations()
    if not include_disabled:
        all_stations = [s for s in all_stations if s.get("status", "active") != "disabled"]
    return [Station(**s) for s in all_stations]


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


@router.patch("/{station_id}/toggle-status")
def toggle_station_status(station_id: str, current_user: dict = Depends(require_owner)):
    """Disable or re-enable a station (owner only)."""
    if station_id not in stations_registry.STATIONS:
        raise HTTPException(status_code=404, detail="Station not found")

    station = stations_registry.STATIONS[station_id]
    current_status = station.get("status", "active")
    new_status = "disabled" if current_status == "active" else "active"

    # Cannot disable the last active station
    if new_status == "disabled":
        active_count = sum(1 for s in stations_registry.STATIONS.values() if s.get("status", "active") == "active")
        if active_count <= 1:
            raise HTTPException(status_code=400, detail="Cannot disable the last active station")

    station["status"] = new_status
    save_stations()

    # Deactivate/reactivate staff assigned to this station
    staff_affected = 0
    if is_db_active():
        if new_status == "disabled":
            staff_affected = db_deactivate_station_users(station_id)
        else:
            staff_affected = db_reactivate_station_users(station_id)

    action = "disabled" if new_status == "disabled" else "enabled"
    logger.info(f"[stations] Station {station_id} {action}. {staff_affected} staff affected.")

    return {
        "status": "success",
        "message": f"Station {action}",
        "station": Station(**station),
        "staff_affected": staff_affected,
    }


@router.delete("/{station_id}")
def delete_station(station_id: str, current_user: dict = Depends(require_owner)):
    """Permanently delete a station and all its data (owner only)."""
    if station_id not in stations_registry.STATIONS:
        raise HTTPException(status_code=404, detail="Station not found")

    # Cannot delete the last station
    if len(stations_registry.STATIONS) <= 1:
        raise HTTPException(status_code=400, detail="Cannot delete the last station")

    # Check for active shifts
    storage = get_station_storage(station_id)
    active_shifts = [s for s in storage.get("shifts", {}).values()
                     if s.get("status") in ("active", "open")]
    if active_shifts:
        raise HTTPException(status_code=400, detail=f"Station has {len(active_shifts)} active shift(s). Close all shifts before deleting.")

    station_name = stations_registry.STATIONS[station_id].get("name", station_id)

    # Deactivate assigned staff
    staff_affected = 0
    if is_db_active():
        staff_affected = db_deactivate_station_users(station_id)

    # Delete from PostgreSQL
    if is_db_active():
        db_delete_station_files(station_id)
        db_delete_station_storage(station_id)
        db_delete_station(station_id)

    # Delete from in-memory
    STATIONS_STORAGE.pop(station_id, None)
    del stations_registry.STATIONS[station_id]
    save_stations()

    # Delete file system data
    storage_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))), "storage", "stations", station_id)
    if os.path.exists(storage_dir):
        shutil.rmtree(storage_dir)

    logger.info(f"[stations] Station {station_id} ({station_name}) permanently deleted. {staff_affected} staff deactivated.")

    return {
        "status": "success",
        "message": f"Station '{station_name}' permanently deleted",
        "staff_deactivated": staff_affected,
    }
