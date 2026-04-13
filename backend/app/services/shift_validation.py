"""
Shift Assignment Validation Service

Validates attendant assignments to islands and nozzles in shifts.
"""
from typing import List, Dict, Any
from ..database import storage as storage_module


def get_nozzle(nozzle_id: str, storage: Dict[str, Any] = None) -> Dict[str, Any]:
    """
    Helper function to get nozzle across all islands
    """
    store = storage if storage is not None else storage_module.STORAGE
    for island_id, island in store.get('islands', {}).items():
        if island.get('pump_station') and island['pump_station'].get('nozzles'):
            for nozzle in island['pump_station']['nozzles']:
                if nozzle.get('nozzle_id') == nozzle_id:
                    return nozzle
    return None


def validate_attendant_exists(attendant_id: str) -> bool:
    """Check if attendant exists with role='user'"""
    from ..database.db import DATABASE_URL
    if DATABASE_URL:
        from ..database.db import db_get_all_users
        for user in db_get_all_users():
            if user.get('user_id') == attendant_id:
                return user.get('role') == 'user'
        return False
    else:
        # Import here to avoid circular dependency
        from ..api.v1.auth import users_db
        for username, user_data in users_db.items():
            if user_data.get('user_id') == attendant_id:
                return user_data.get('role') == 'user'
        return False


def validate_island_exists(island_id: str, storage: Dict[str, Any] = None) -> bool:
    """Check if island exists in storage"""
    store = storage if storage is not None else storage_module.STORAGE
    return island_id in store.get('islands', {})


def validate_nozzle_exists(nozzle_id: str, storage: Dict[str, Any] = None) -> bool:
    """Check if nozzle exists across all islands"""
    return get_nozzle(nozzle_id, storage) is not None


def validate_nozzle_belongs_to_island(nozzle_id: str, island_id: str, storage: Dict[str, Any] = None) -> bool:
    """Check if nozzle belongs to specified island"""
    store = storage if storage is not None else storage_module.STORAGE
    island = store.get('islands', {}).get(island_id)
    if not island or not island.get('pump_station'):
        return False

    nozzles = island['pump_station'].get('nozzles', [])
    return any(n.get('nozzle_id') == nozzle_id for n in nozzles)


def validate_unique_nozzle_assignment(assignments: List[Dict[str, Any]]) -> None:
    """Ensure no nozzle is assigned to multiple attendants"""
    all_nozzles = []
    for assignment in assignments:
        all_nozzles.extend(assignment.get('nozzle_ids', []))

    duplicates = [n for n in set(all_nozzles) if all_nozzles.count(n) > 1]
    if duplicates:
        raise ValueError(f"Nozzles assigned to multiple attendants: {', '.join(duplicates)}")


def derive_island_ids_from_nozzles(nozzle_ids: List[str], storage: Dict[str, Any] = None) -> List[str]:
    """Derive the set of island IDs that own the given nozzles."""
    store = storage if storage is not None else storage_module.STORAGE
    island_ids = []
    for island_id, island in store.get('islands', {}).items():
        ps = island.get('pump_station')
        if not ps:
            continue
        for nozzle in ps.get('nozzles', []):
            if nozzle.get('nozzle_id') in nozzle_ids:
                if island_id not in island_ids:
                    island_ids.append(island_id)
    return island_ids


def validate_shift_assignments(assignments: List[Dict[str, Any]], storage: Dict[str, Any] = None) -> None:
    """Validate all assignments in a shift"""
    errors = []

    for assignment in assignments:
        attendant_id = assignment.get('attendant_id')
        nozzle_ids = assignment.get('nozzle_ids', [])

        # Validate attendant exists
        if not validate_attendant_exists(attendant_id):
            errors.append(f"Attendant {attendant_id} does not exist or is not a user")

        # Validate nozzles exist
        for nozzle_id in nozzle_ids:
            if not validate_nozzle_exists(nozzle_id, storage):
                errors.append(f"Nozzle {nozzle_id} does not exist")

    # Validate unique nozzle assignment
    try:
        validate_unique_nozzle_assignment(assignments)
    except ValueError as e:
        errors.append(str(e))

    if errors:
        raise ValueError("; ".join(errors))
