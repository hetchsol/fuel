"""
Standalone Relationship Validation Functions
For use in API endpoints that don't use CRUDService
"""
from typing import Dict, Any
from .validation_engine import (
    validate_foreign_keys as _validate_foreign_keys,
    validate_delete as _validate_delete,
    validate_unique_constraint as _validate_unique_constraint
)


def validate_create(entity_type: str, data: Dict[str, Any]) -> None:
    """
    Validate entity data before creating

    This function checks:
    - All foreign keys reference existing entities
    - Required foreign keys are present
    - Unique constraints are satisfied (for one-to-one relationships)

    Args:
        entity_type: Type of entity (e.g., 'shifts', 'readings', 'credit_sales')
        data: Entity data dict to validate

    Raises:
        HTTPException: 400 if validation fails

    Example:
        ```python
        @router.post("/", response_model=Shift)
        def create_shift(shift: Shift):
            # Validate before creating
            validate_create('shifts', shift.dict())

            if shift.shift_id in shifts_data:
                raise HTTPException(400, detail="Shift already exists")

            shifts_data[shift.shift_id] = shift.dict()
            return shift
        ```
    """
    # Validate foreign keys
    _validate_foreign_keys(entity_type, data)

    # Validate unique constraints
    from ..database.relationships import get_foreign_keys
    fks = get_foreign_keys(entity_type)
    for field_name, fk_def in fks.items():
        if fk_def.get('unique', False):
            field_value = data.get(field_name)
            if field_value:
                _validate_unique_constraint(entity_type, field_name, field_value)


def validate_update(entity_type: str, entity_id: str, data: Dict[str, Any]) -> None:
    """
    Validate entity data before updating

    This function checks:
    - All foreign keys reference existing entities
    - Required foreign keys are present
    - Unique constraints are satisfied (excluding the current entity)

    Args:
        entity_type: Type of entity
        entity_id: ID of entity being updated
        data: New entity data dict to validate

    Raises:
        HTTPException: 400 if validation fails

    Example:
        ```python
        @router.put("/{shift_id}", response_model=Shift)
        def update_shift(shift_id: str, shift: Shift):
            if shift_id not in shifts_data:
                raise HTTPException(404, detail="Shift not found")

            # Validate before updating
            validate_update('shifts', shift_id, shift.dict())

            shifts_data[shift_id] = shift.dict()
            return shift
        ```
    """
    # Validate foreign keys
    _validate_foreign_keys(entity_type, data)

    # Validate unique constraints (excluding the current entity)
    from ..database.relationships import get_foreign_keys
    fks = get_foreign_keys(entity_type)
    for field_name, fk_def in fks.items():
        if fk_def.get('unique', False):
            field_value = data.get(field_name)
            if field_value:
                _validate_unique_constraint(
                    entity_type,
                    field_name,
                    field_value,
                    exclude_id=entity_id
                )


def validate_delete_operation(
    entity_type: str,
    entity_id: str,
    cascade: bool = False
) -> None:
    """
    Validate entity can be deleted before deleting

    This function checks:
    - Whether any dependent records exist
    - If cascade=True, recursively deletes all dependents

    Args:
        entity_type: Type of entity (e.g., 'shifts', 'accounts')
        entity_id: ID of entity to delete
        cascade: If True, delete all dependent records recursively

    Raises:
        HTTPException: 409 if dependents exist and cascade=False

    Example:
        ```python
        @router.delete("/{shift_id}")
        def delete_shift(shift_id: str, cascade: bool = False):
            if shift_id not in shifts_data:
                raise HTTPException(404, detail="Shift not found")

            # Validate before deleting
            validate_delete_operation('shifts', shift_id, cascade)

            del shifts_data[shift_id]
            return {"status": "success"}
        ```

    Example with cascade:
        ```python
        @router.delete("/{shift_id}")
        def delete_shift(shift_id: str, cascade: bool = False):
            # This will delete the shift AND all readings, sales, reconciliations
            # that reference this shift
            validate_delete_operation('shifts', shift_id, cascade=True)
            del shifts_data[shift_id]
            return {"status": "success", "cascade": cascade}
        ```
    """
    _validate_delete(entity_type, entity_id, cascade)


def check_foreign_key(
    entity_type: str,
    foreign_key_field: str,
    foreign_key_value: str
) -> bool:
    """
    Check if a specific foreign key reference is valid

    This is a lightweight validation function that only checks one foreign key.
    Use validate_create() or validate_update() for comprehensive validation.

    Args:
        entity_type: Type of entity that has the foreign key
        foreign_key_field: Name of the foreign key field
        foreign_key_value: Value to check

    Returns:
        True if foreign key is valid, False otherwise

    Example:
        ```python
        if not check_foreign_key('readings', 'shift_id', shift_id):
            raise HTTPException(400, detail="Invalid shift_id")
        ```
    """
    from ..database.relationships import get_referenced_entity
    from ..database.storage import entity_exists

    referenced_entity = get_referenced_entity(entity_type, foreign_key_field)
    if not referenced_entity:
        return True  # No foreign key defined for this field

    return entity_exists(referenced_entity, foreign_key_value)


def get_dependent_count(entity_type: str, entity_id: str) -> int:
    """
    Get the total count of dependent records for an entity

    This is useful for showing users information before they delete something.

    Args:
        entity_type: Type of entity
        entity_id: ID of entity

    Returns:
        Total number of dependent records

    Example:
        ```python
        @router.get("/{shift_id}/dependents")
        def get_shift_dependents(shift_id: str):
            count = get_dependent_count('shifts', shift_id)
            return {
                "shift_id": shift_id,
                "dependent_count": count,
                "can_delete": count == 0
            }
        ```
    """
    from .validation_engine import check_dependents

    dependents = check_dependents(entity_type, entity_id)
    return sum(dep.count for dep in dependents)


def get_dependent_details(entity_type: str, entity_id: str) -> Dict[str, Any]:
    """
    Get detailed information about dependent records

    Args:
        entity_type: Type of entity
        entity_id: ID of entity

    Returns:
        Dict with detailed dependent information

    Example:
        ```python
        @router.get("/{shift_id}/dependents/details")
        def get_shift_dependent_details(shift_id: str):
            return get_dependent_details('shifts', shift_id)
        ```

        Returns:
        ```json
        {
            "entity_type": "shifts",
            "entity_id": "SHIFT-001",
            "total_dependents": 15,
            "dependents": [
                {
                    "type": "readings",
                    "count": 12,
                    "description": "Readings taken during this shift"
                },
                {
                    "type": "sales",
                    "count": 3,
                    "description": "Sales during this shift"
                }
            ]
        }
        ```
    """
    from .validation_engine import check_dependents

    dependents = check_dependents(entity_type, entity_id)

    return {
        'entity_type': entity_type,
        'entity_id': entity_id,
        'total_dependents': sum(dep.count for dep in dependents),
        'dependents': [dep.to_dict() for dep in dependents],
        'can_delete_without_cascade': len(dependents) == 0
    }
