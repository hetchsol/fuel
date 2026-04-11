"""
Centralized Storage Registry
Provides unified access to all in-memory data storage.
Supports per-station isolated storage.

When DATABASE_URL is set, storage is persisted to PostgreSQL.
Otherwise it lives only in memory (original behavior).
"""
from typing import Dict, List, Any, Optional
from collections import defaultdict
import copy
import logging
import threading

logger = logging.getLogger(__name__)

# Per-station locks to prevent concurrent read-modify-write race conditions
_storage_locks: Dict[str, threading.Lock] = defaultdict(threading.Lock)


def _make_empty_storage() -> Dict[str, Any]:
    """Create a fresh empty storage dict template"""
    return {
        # Core entities
        'users': {},
        'shifts': {},
        'islands': {},
        'tanks': {},
        'accounts': {},

        # Products
        'lubricants': {},
        'lpg_accessories': {},

        # Transactional data
        'readings': [],
        'lpg_sales': [],
        'lubricant_sales': [],
        'credit_sales': [],
        'shift_reconciliations': [],
        'tank_reconciliations': [],

        # LPG & Lubricants Daily Operations
        'lpg_daily_entries': {},
        'lpg_accessories_daily': {},
        'lubricant_daily_entries': {},

        # Settings
        'fuel_settings': {},
        'system_settings': {},
        'validation_thresholds': {},
        'email_settings': {},
        'tax_levy_settings': {},
        'stock_alert_settings': {},
        'reconciliation_tolerance_settings': {},

        # Reconciliation (previously module-level lists)
        'reconciliations_data': [],
        'tank_reconciliations_data': [],

        # Delivery history (previously module-level in tanks.py)
        'delivery_history': [],
        'dip_readings_data': {},

        # Accessories sales (previously module-level in lpg.py)
        'accessories_sales': [],
    }


# Per-station storage: station_id -> storage dict
STATIONS_STORAGE: Dict[str, Dict[str, Any]] = {}

# Global STORAGE points to ST001 by default (backward compat)
STORAGE: Dict[str, Any] = _make_empty_storage()


def get_station_storage(station_id: str) -> Dict[str, Any]:
    """
    Get or create the storage dict for a station.
    On first access, attempts to load from PostgreSQL if DATABASE_URL is set.
    Thread-safe via per-station locking.
    """
    with _storage_locks[station_id]:
      if station_id not in STATIONS_STORAGE:
        # Try loading from DB first
        from .db import DATABASE_URL, db_load_storage, is_db_active
        if DATABASE_URL and is_db_active():
            db_data = db_load_storage(station_id)
            if db_data:
                logger.info(f"[storage] Loaded station {station_id} from database")
                STATIONS_STORAGE[station_id] = db_data
            else:
                STATIONS_STORAGE[station_id] = _make_empty_storage()
        else:
            STATIONS_STORAGE[station_id] = _make_empty_storage()
    return STATIONS_STORAGE[station_id]


def reload_station_from_db(station_id: str) -> Dict[str, Any]:
    """
    Force-reload a station's storage from the database, replacing the in-memory copy.
    Used when external changes (e.g. DB wipe) need to be picked up without restart.
    """
    from .db import DATABASE_URL, db_load_storage, is_db_active
    with _storage_locks[station_id]:
        if DATABASE_URL and is_db_active():
            db_data = db_load_storage(station_id)
            if db_data:
                STATIONS_STORAGE[station_id] = db_data
                logger.info(f"[storage] Reloaded station {station_id} from database")
            else:
                STATIONS_STORAGE[station_id] = _make_empty_storage()
                logger.info(f"[storage] Station {station_id} not in DB — reset to empty")
    return STATIONS_STORAGE.get(station_id, _make_empty_storage())


def save_station_storage(station_id: str):
    """
    Persist the in-memory storage dict for a station to PostgreSQL.
    No-op if DATABASE_URL is not set or DB is not active.
    Thread-safe via per-station locking.
    """
    from .db import DATABASE_URL, db_save_storage, is_db_active
    if not DATABASE_URL or not is_db_active():
        return
    with _storage_locks[station_id]:
        if station_id in STATIONS_STORAGE:
            db_save_storage(station_id, STATIONS_STORAGE[station_id])


def save_all_stations_storage():
    """Persist all stations' storage dicts to PostgreSQL."""
    from .db import DATABASE_URL, db_save_storage, is_db_active
    if not DATABASE_URL or not is_db_active():
        return
    for station_id, storage in STATIONS_STORAGE.items():
        db_save_storage(station_id, storage)


def archive_old_data(station_id: str, days: int = 90) -> dict:
    """
    Trim storage lists older than N days for a station.
    Returns count of items removed per key. Owner-triggered only.
    """
    from datetime import datetime, timedelta

    storage = get_station_storage(station_id)
    cutoff = (datetime.now() - timedelta(days=days)).isoformat()
    removed = {}

    archivable_keys = ['readings', 'reconciliations_data', 'tank_reconciliations_data',
                        'delivery_history', 'lpg_sales', 'lubricant_sales',
                        'credit_sales', 'accessories_sales']

    with _storage_locks[station_id]:
        for key in archivable_keys:
            items = storage.get(key, [])
            if not isinstance(items, list):
                continue
            before = len(items)
            storage[key] = [i for i in items if (i.get('date') or i.get('created_at') or '') > cutoff]
            after = len(storage[key])
            if before > after:
                removed[key] = before - after

    return removed


# ──────────────────────────────────────────────────────────
# Helper functions — operate on global STORAGE by default
# (kept for backward compat with services/validation_engine)
# ──────────────────────────────────────────────────────────

def get_nozzle(nozzle_id: str, storage: Dict[str, Any] = None) -> Optional[Dict[str, Any]]:
    """Find a nozzle across all islands"""
    store = storage if storage is not None else STORAGE
    for island_id, island_data in store.get('islands', {}).items():
        if island_data.get('pump_station'):
            pump_station = island_data['pump_station']
            if pump_station.get('nozzles'):
                for nozzle in pump_station['nozzles']:
                    if nozzle.get('nozzle_id') == nozzle_id:
                        return nozzle
    return None


def nozzle_exists(nozzle_id: str) -> bool:
    """Check if a nozzle exists"""
    return get_nozzle(nozzle_id) is not None


def get_all_nozzles(storage: Dict[str, Any] = None) -> List[Dict[str, Any]]:
    """Get all nozzles across all islands"""
    store = storage if storage is not None else STORAGE
    nozzles = []
    for island_id, island_data in store.get('islands', {}).items():
        if island_data.get('pump_station'):
            pump_station = island_data['pump_station']
            if pump_station.get('nozzles'):
                nozzles.extend(pump_station['nozzles'])
    return nozzles


def find_in_list_storage(
    storage_key: str,
    field: str,
    value: Any
) -> Optional[Dict[str, Any]]:
    storage = STORAGE.get(storage_key, [])
    if not isinstance(storage, list):
        return None
    for item in storage:
        if item.get(field) == value:
            return item
    return None


def filter_list_storage(
    storage_key: str,
    **filters
) -> List[Dict[str, Any]]:
    storage = STORAGE.get(storage_key, [])
    if not isinstance(storage, list):
        return []
    results = []
    for item in storage:
        match = True
        for field, value in filters.items():
            if item.get(field) != value:
                match = False
                break
        if match:
            results.append(item)
    return results


def get_tank_id_for_nozzle(station_id: str = None, nozzle_id: str = None, storage: Dict[str, Any] = None) -> Optional[str]:
    """
    Resolve nozzle → pump_station → tank_id by scanning the islands data.
    Returns the tank_id that the nozzle's pump station draws from, or None if not found.
    """
    store = storage
    if store is None:
        if station_id:
            store = get_station_storage(station_id)
        else:
            store = STORAGE
    for island_id, island_data in store.get('islands', {}).items():
        ps = island_data.get('pump_station')
        if not ps:
            continue
        for nozzle in ps.get('nozzles', []):
            if nozzle.get('nozzle_id') == nozzle_id:
                return ps.get('tank_id')
    return None


def get_nozzle_ids_for_tank(station_id: str = None, tank_id: str = None, storage: Dict[str, Any] = None) -> List[str]:
    """
    Reverse lookup: returns all nozzle_ids assigned to a given tank
    by scanning pump_station.tank_id across all islands.
    """
    store = storage
    if store is None:
        if station_id:
            store = get_station_storage(station_id)
        else:
            store = STORAGE
    nozzle_ids = []
    for island_id, island_data in store.get('islands', {}).items():
        ps = island_data.get('pump_station')
        if not ps:
            continue
        if ps.get('tank_id') == tank_id:
            for nozzle in ps.get('nozzles', []):
                nid = nozzle.get('nozzle_id')
                if nid:
                    nozzle_ids.append(nid)
    return nozzle_ids


def entity_exists(entity_type: str, entity_id: str) -> bool:
    """Check if an entity exists in storage"""
    if entity_type == 'nozzles':
        return nozzle_exists(entity_id)

    storage = STORAGE.get(entity_type)
    if isinstance(storage, dict):
        return entity_id in storage

    if isinstance(storage, list):
        id_field_map = {
            'readings': 'reading_id',
            'lpg_sales': 'sale_id',
            'lubricant_sales': 'sale_id',
            'credit_sales': 'sale_id',
            'shift_reconciliations': 'shift_id',
            'tank_reconciliations': 'tank_id',
        }
        id_field = id_field_map.get(entity_type)
        if id_field:
            return find_in_list_storage(entity_type, id_field, entity_id) is not None

    return False


def get_entity(entity_type: str, entity_id: str) -> Optional[Dict[str, Any]]:
    """Get an entity from storage"""
    if entity_type == 'nozzles':
        return get_nozzle(entity_id)

    storage = STORAGE.get(entity_type)
    if isinstance(storage, dict):
        return storage.get(entity_id)

    if isinstance(storage, list):
        id_field_map = {
            'readings': 'reading_id',
            'lpg_sales': 'sale_id',
            'lubricant_sales': 'sale_id',
            'credit_sales': 'sale_id',
            'shift_reconciliations': 'shift_id',
            'tank_reconciliations': 'tank_id',
        }
        id_field = id_field_map.get(entity_type)
        if id_field:
            return find_in_list_storage(entity_type, id_field, entity_id)

    return None
