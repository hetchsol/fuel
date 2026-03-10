"""
Station File Paths & Persistence
Maps station_id + filename to storage/stations/{station_id}/filename.json
Also handles migrating existing flat files into ST001 directory.

When DATABASE_URL is set, load_station_json/save_station_json use PostgreSQL.
Otherwise they fall back to local JSON files (for local development).
"""
import os
import shutil
import json
import logging
from typing import Any

logger = logging.getLogger(__name__)

STORAGE_ROOT = os.path.join(os.path.dirname(__file__), '..', '..', 'storage')


def get_station_dir(station_id: str) -> str:
    """Get the directory for a station's files"""
    return os.path.join(STORAGE_ROOT, 'stations', station_id)


def get_station_file(station_id: str, filename: str) -> str:
    """Get the full path for a station-specific JSON file"""
    station_dir = get_station_dir(station_id)
    os.makedirs(station_dir, exist_ok=True)
    return os.path.join(station_dir, filename)


# Files that should be migrated from flat storage/ into stations/ST001/
MIGRATABLE_FILES = [
    'sales.json',
    'tank_readings.json',
    'tank_deliveries.json',
    'lpg_daily_entries.json',
    'lpg_accessories_daily.json',
    'lpg_pricing.json',
    'lubricant_daily_entries.json',
    'lubricant_products.json',
    'validated_readings.json',
    'attendant_handovers.json',
    'attendant_readings.json',
]


def migrate_existing_data():
    """
    Move existing flat JSON files from storage/ into storage/stations/ST001/
    Only runs once — skips files that don't exist or have already been moved.
    """
    st001_dir = get_station_dir('ST001')
    os.makedirs(st001_dir, exist_ok=True)

    for filename in MIGRATABLE_FILES:
        src = os.path.join(STORAGE_ROOT, filename)
        dst = os.path.join(st001_dir, filename)
        if os.path.exists(src) and not os.path.exists(dst):
            shutil.move(src, dst)
            print(f"[migrate] Moved {filename} -> stations/ST001/{filename}")

    # Also migrate customers.json from data/ directory
    customers_src = os.path.join(os.path.dirname(__file__), '..', 'data', 'customers.json')
    customers_dst = os.path.join(st001_dir, 'customers.json')
    if os.path.exists(customers_src) and not os.path.exists(customers_dst):
        shutil.copy2(customers_src, customers_dst)
        print(f"[migrate] Copied customers.json -> stations/ST001/customers.json")


# ──────────────────────────────────────────────────────────
# Dual-mode JSON persistence (DB or file)
# ──────────────────────────────────────────────────────────

def load_station_json(station_id: str, filename: str, default: Any = None) -> Any:
    """
    Load JSON data for a station.
    Uses PostgreSQL when DATABASE_URL is set, otherwise falls back to local files.
    """
    from .db import DATABASE_URL, db_load_json

    if DATABASE_URL:
        result = db_load_json(station_id, filename, default)
        return result if result is not None else (default if default is not None else None)

    # File fallback
    filepath = get_station_file(station_id, filename)
    if not os.path.exists(filepath):
        return default if default is not None else None
    try:
        with open(filepath, 'r') as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError):
        return default if default is not None else None


def save_station_json(station_id: str, filename: str, data: Any):
    """
    Save JSON data for a station.
    Uses PostgreSQL when DATABASE_URL is set, otherwise falls back to local files.
    """
    from .db import DATABASE_URL, db_save_json

    if DATABASE_URL:
        db_save_json(station_id, filename, data)
        return

    # File fallback
    filepath = get_station_file(station_id, filename)
    with open(filepath, 'w') as f:
        json.dump(data, f, indent=2, default=str)
