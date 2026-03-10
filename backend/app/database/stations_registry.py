"""
Stations Registry
Persists station metadata to PostgreSQL (or storage/stations.json as fallback).
"""
import json
import os
import logging
from typing import Dict, Optional, List
from datetime import datetime

logger = logging.getLogger(__name__)

STATIONS_FILE = os.path.join(os.path.dirname(__file__), '..', '..', 'storage', 'stations.json')

# Global stations dict: station_id -> station metadata
STATIONS: Dict[str, dict] = {}


def load_stations():
    """Load stations from DB (or JSON file fallback) into STATIONS dict"""
    global STATIONS
    from .db import DATABASE_URL, db_load_stations

    if DATABASE_URL:
        try:
            STATIONS = db_load_stations()
            logger.info(f"[stations] Loaded {len(STATIONS)} stations from database")
        except Exception as e:
            logger.error(f"[stations] DB load failed, falling back to file: {e}")
            _load_from_file()
    else:
        _load_from_file()

    # Seed default station if none exist
    if not STATIONS:
        STATIONS["ST001"] = {
            "station_id": "ST001",
            "name": "Luanshya Station",
            "location": "Luanshya",
            "created_by": "system",
            "created_at": datetime.now().isoformat(),
        }
        save_stations()


def _load_from_file():
    """Load stations from JSON file (fallback for local dev)."""
    global STATIONS
    if os.path.exists(STATIONS_FILE):
        try:
            with open(STATIONS_FILE, 'r') as f:
                STATIONS = json.load(f)
        except (json.JSONDecodeError, IOError):
            STATIONS = {}
    else:
        STATIONS = {}


def save_stations():
    """Save STATIONS dict to DB (or JSON file fallback)"""
    from .db import DATABASE_URL, db_save_all_stations

    if DATABASE_URL:
        try:
            db_save_all_stations(STATIONS)
            return
        except Exception as e:
            logger.error(f"[stations] DB save failed, falling back to file: {e}")

    # File fallback
    os.makedirs(os.path.dirname(STATIONS_FILE), exist_ok=True)
    with open(STATIONS_FILE, 'w') as f:
        json.dump(STATIONS, f, indent=2)


def get_station(station_id: str) -> Optional[dict]:
    """Get a station by ID"""
    return STATIONS.get(station_id)


def list_stations() -> List[dict]:
    """List all stations"""
    return list(STATIONS.values())


def create_station(station_id: str, name: str, location: str = "", created_by: str = "system") -> dict:
    """Create and persist a new station"""
    station = {
        "station_id": station_id,
        "name": name,
        "location": location,
        "created_by": created_by,
        "created_at": datetime.now().isoformat(),
    }
    STATIONS[station_id] = station
    save_stations()
    return station
