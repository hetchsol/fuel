"""
Centralized Storage Registry
Provides unified access to all in-memory data storage.
Supports per-station isolated storage.
"""
from typing import Dict, List, Any, Optional
import copy


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
    """
    if station_id not in STATIONS_STORAGE:
        STATIONS_STORAGE[station_id] = _make_empty_storage()
    return STATIONS_STORAGE[station_id]


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
