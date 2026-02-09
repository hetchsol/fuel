"""
Station File Paths
Maps station_id + filename to storage/stations/{station_id}/filename.json
Also handles migrating existing flat files into ST001 directory.
"""
import os
import shutil
import json

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
