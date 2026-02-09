"""
Centralized Storage Registry
Provides unified access to all in-memory data storage
"""
from typing import Dict, List, Any, Optional

# Centralized storage for all entities
# This replaces scattered storage dictionaries across API modules
STORAGE: Dict[str, Any] = {
    # Core entities
    'users': {},                    # user_id -> User dict
    'shifts': {},                   # shift_id -> Shift dict
    'islands': {},                  # island_id -> Island dict
    'tanks': {},                    # tank_id -> Tank dict
    'accounts': {},                 # account_id -> AccountHolder dict

    # Products
    'lubricants': {},               # product_code -> Lubricant dict
    'lpg_accessories': {},          # product_code -> LPGAccessory dict

    # Transactional data (using lists for now, may migrate to dicts)
    'readings': [],                 # List of DualReading dicts
    'lpg_sales': [],                # List of LPGSale dicts
    'lubricant_sales': [],          # List of LubricantSale dicts
    'credit_sales': [],             # List of CreditSale dicts
    'shift_reconciliations': [],    # List of ShiftReconciliation dicts
    'tank_reconciliations': [],     # List of TankReconciliation dicts

    # LPG & Lubricants Daily Operations
    'lpg_daily_entries': {},        # entry_id -> LPG shift entry dict
    'lpg_accessories_daily': {},    # entry_id -> LPG accessories daily dict
    'lubricant_daily_entries': {},  # entry_id -> Lubricant daily entry dict

    # Settings
    'fuel_settings': {},            # Singleton for FuelSettings
}


def get_nozzle(nozzle_id: str) -> Optional[Dict[str, Any]]:
    """
    Find a nozzle across all islands
    Nozzles are nested in islands -> pump_station -> nozzles

    Args:
        nozzle_id: The nozzle ID to find

    Returns:
        Nozzle dict if found, None otherwise
    """
    for island_id, island_data in STORAGE['islands'].items():
        if island_data.get('pump_station'):
            pump_station = island_data['pump_station']
            if pump_station.get('nozzles'):
                for nozzle in pump_station['nozzles']:
                    if nozzle.get('nozzle_id') == nozzle_id:
                        return nozzle
    return None


def nozzle_exists(nozzle_id: str) -> bool:
    """
    Check if a nozzle exists

    Args:
        nozzle_id: The nozzle ID to check

    Returns:
        True if nozzle exists, False otherwise
    """
    return get_nozzle(nozzle_id) is not None


def get_all_nozzles() -> List[Dict[str, Any]]:
    """
    Get all nozzles across all islands

    Returns:
        List of all nozzle dicts
    """
    nozzles = []
    for island_id, island_data in STORAGE['islands'].items():
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
    """
    Find an item in list-based storage by field value

    Args:
        storage_key: Key in STORAGE dict (e.g., 'readings', 'lpg_sales')
        field: Field name to search by
        value: Value to match

    Returns:
        First matching dict if found, None otherwise
    """
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
    """
    Filter items in list-based storage by multiple field values

    Args:
        storage_key: Key in STORAGE dict
        **filters: Field name and value pairs to filter by

    Returns:
        List of matching dicts
    """
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
    """
    Check if an entity exists in storage

    Args:
        entity_type: Type of entity (e.g., 'users', 'shifts', 'nozzles')
        entity_id: ID of the entity

    Returns:
        True if entity exists, False otherwise
    """
    # Special handling for nozzles (nested)
    if entity_type == 'nozzles':
        return nozzle_exists(entity_id)

    # For dict-based storage
    storage = STORAGE.get(entity_type)
    if isinstance(storage, dict):
        return entity_id in storage

    # For list-based storage, need to know the ID field
    # This is a simplified check - may need enhancement
    if isinstance(storage, list):
        # Determine ID field based on entity type
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
    """
    Get an entity from storage

    Args:
        entity_type: Type of entity
        entity_id: ID of the entity

    Returns:
        Entity dict if found, None otherwise
    """
    # Special handling for nozzles
    if entity_type == 'nozzles':
        return get_nozzle(entity_id)

    # For dict-based storage
    storage = STORAGE.get(entity_type)
    if isinstance(storage, dict):
        return storage.get(entity_id)

    # For list-based storage
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
