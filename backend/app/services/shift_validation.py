"""
Shift Assignment Validation Service

Validates attendant assignments to islands and nozzles in shifts.
"""
from typing import List, Dict, Any
from ..database.storage import STORAGE


def get_nozzle(nozzle_id: str, storage: Dict[str, Any] = None) -> Dict[str, Any]:
    """
    Helper function to get nozzle across all islands
    """
    store = storage if storage is not None else STORAGE
    for island_id, island in store.get('islands', {}).items():
        if island.get('pump_station') and island['pump_station'].get('nozzles'):
            for nozzle in island['pump_station']['nozzles']:
                if nozzle.get('nozzle_id') == nozzle_id:
                    return nozzle
    return None


def validate_attendant_exists(attendant_id: str) -> bool:
    """Check if attendant exists in users_db with role='user'"""
    # Import here to avoid circular dependency
    from ..api.v1.auth import users_db

    # Check if user exists in users_db
    for username, user_data in users_db.items():
        if user_data.get('user_id') == attendant_id:
            return user_data.get('role') == 'user'
    return False


def validate_island_exists(island_id: str, storage: Dict[str, Any] = None) -> bool:
    """Check if island exists in storage"""
    store = storage if storage is not None else STORAGE
    return island_id in store.get('islands', {})


def validate_nozzle_exists(nozzle_id: str, storage: Dict[str, Any] = None) -> bool:
    """Check if nozzle exists across all islands"""
    return get_nozzle(nozzle_id, storage) is not None


def validate_nozzle_belongs_to_island(nozzle_id: str, island_id: str, storage: Dict[str, Any] = None) -> bool:
    """Check if nozzle belongs to specified island"""
    store = storage if storage is not None else STORAGE
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


def validate_shift_assignments(assignments: List[Dict[str, Any]], storage: Dict[str, Any] = None) -> None:
    """Validate all assignments in a shift"""
    errors = []

    for assignment in assignments:
        attendant_id = assignment.get('attendant_id')
        island_ids = assignment.get('island_ids', [])
        nozzle_ids = assignment.get('nozzle_ids', [])

        # Validate attendant exists
        if not validate_attendant_exists(attendant_id):
            errors.append(f"Attendant {attendant_id} does not exist or is not a user")

        # Validate islands exist
        for island_id in island_ids:
            if not validate_island_exists(island_id, storage):
                errors.append(f"Island {island_id} does not exist")

        # Validate nozzles exist and belong to assigned islands
        for nozzle_id in nozzle_ids:
            if not validate_nozzle_exists(nozzle_id, storage):
                errors.append(f"Nozzle {nozzle_id} does not exist")
            elif island_ids:
                belongs_to_any = any(
                    validate_nozzle_belongs_to_island(nozzle_id, island_id, storage)
                    for island_id in island_ids
                )
                if not belongs_to_any:
                    errors.append(f"Nozzle {nozzle_id} does not belong to assigned islands")

    # Validate unique nozzle assignment
    try:
        validate_unique_nozzle_assignment(assignments)
    except ValueError as e:
        errors.append(str(e))

    if errors:
        raise ValueError("; ".join(errors))
