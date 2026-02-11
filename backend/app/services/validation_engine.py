"""
Validation Engine
Core validation logic for foreign keys and referential integrity
"""
from fastapi import HTTPException
from typing import Dict, List, Any, Optional
from ..database.storage import entity_exists, filter_list_storage
from ..database import storage as storage_module
from ..database.relationships import (
    get_foreign_keys,
    get_dependents,
    is_foreign_key_required,
    get_referenced_entity
)


class DependentInfo:
    """Information about dependent records"""
    def __init__(self, entity_type: str, count: int, description: str = ""):
        self.entity_type = entity_type
        self.count = count
        self.description = description

    def to_dict(self) -> Dict[str, Any]:
        return {
            'type': self.entity_type,
            'count': self.count,
            'description': self.description
        }


def validate_foreign_keys(entity_type: str, data: Dict[str, Any], storage: Dict[str, Any] = None) -> None:
    """
    Validate all foreign key references exist

    Args:
        entity_type: Type of entity being validated (e.g., 'readings', 'shifts')
        data: Entity data dict to validate

    Raises:
        HTTPException: 400 if any foreign key validation fails
    """
    foreign_keys = get_foreign_keys(entity_type)

    if not foreign_keys:
        return  # No foreign keys to validate

    errors = []

    for field_name, fk_definition in foreign_keys.items():
        field_value = data.get(field_name)
        required = fk_definition.get('required', True)
        referenced_entity = fk_definition['references']
        description = fk_definition.get('description', '')

        # Skip validation if field is None/empty and not required
        if not field_value and not required:
            continue

        # If field has a value (or is required), validate it exists
        if field_value:
            store = storage if storage is not None else storage_module.STORAGE
            exists = False
            if referenced_entity == 'nozzles':
                from ..database.storage import get_nozzle
                exists = get_nozzle(field_value, store) is not None
            elif isinstance(store.get(referenced_entity), dict):
                exists = field_value in store.get(referenced_entity, {})
            else:
                exists = entity_exists(referenced_entity, field_value)
            if not exists:
                referenced_name = referenced_entity.rstrip('s').capitalize()  # 'shifts' -> 'Shift'
                error_msg = (
                    f"Invalid {field_name}: '{field_value}' - "
                    f"{referenced_name} not found. "
                    f"{description}. "
                    f"Create the {referenced_name} first or use an existing ID."
                )
                errors.append(error_msg)
        elif required:
            # Field is required but missing/empty
            error_msg = f"Missing required field: {field_name}. {description}."
            errors.append(error_msg)

    if errors:
        raise HTTPException(
            status_code=400,
            detail={
                'error_type': 'foreign_key_violation',
                'message': 'Foreign key validation failed',
                'entity_type': entity_type,
                'errors': errors
            }
        )


def check_dependents(entity_type: str, entity_id: str, storage: Dict[str, Any] = None) -> List[DependentInfo]:
    """
    Check if entity has any dependent records

    Args:
        entity_type: Type of entity (e.g., 'shifts', 'accounts')
        entity_id: ID of the entity

    Returns:
        List of DependentInfo objects describing dependencies
    """
    dependents_def = get_dependents(entity_type)
    dependent_info_list = []

    for dep_name, dep_definition in dependents_def.items():
        storage_key = dep_definition['storage_key']
        foreign_key_field = dep_definition['foreign_key_field']
        description = dep_definition.get('description', '')
        is_nested = dep_definition.get('nested', False)

        # Special handling for nested nozzles
        if is_nested and dep_name == 'nozzles':
            from ..database.storage import get_all_nozzles
            all_nozzles = get_all_nozzles(storage)
            matching_nozzles = [n for n in all_nozzles if n.get('island_id') == entity_id]
            count = len(matching_nozzles)
        else:
            # Check in storage
            store = storage if storage is not None else storage_module.STORAGE
            storage_data = store.get(storage_key)

            if isinstance(storage_data, dict):
                # Dict-based storage: check all values
                count = sum(
                    1 for item in storage_data.values()
                    if item.get(foreign_key_field) == entity_id
                )
            elif isinstance(storage_data, list):
                # List-based storage: filter by field
                count = sum(
                    1 for item in storage_data
                    if item.get(foreign_key_field) == entity_id
                )
            else:
                count = 0

        if count > 0:
            dependent_info_list.append(
                DependentInfo(dep_name, count, description)
            )

    return dependent_info_list


def validate_delete(entity_type: str, entity_id: str, cascade: bool = False, storage: Dict[str, Any] = None) -> None:
    """
    Validate that an entity can be deleted
    Optionally performs cascade delete

    Args:
        entity_type: Type of entity (e.g., 'shifts', 'users')
        entity_id: ID of entity to delete
        cascade: If True, delete all dependent records recursively

    Raises:
        HTTPException: 409 if dependents exist and cascade=False
    """
    dependent_info = check_dependents(entity_type, entity_id, storage)

    if not dependent_info:
        return  # No dependents, safe to delete

    if not cascade:
        # Build detailed error message
        dependent_details = [
            f"- {info.count} {info.entity_type} ({info.description})"
            for info in dependent_info
        ]
        total_count = sum(info.count for info in dependent_info)

        error_message = (
            f"Cannot delete {entity_type.rstrip('s')} '{entity_id}': "
            f"{total_count} dependent record(s) exist.\n" +
            "\n".join(dependent_details) +
            f"\n\nDelete dependent records first, or use cascade=True to delete all."
        )

        raise HTTPException(
            status_code=409,
            detail={
                'error_type': 'dependent_records_exist',
                'message': error_message,
                'entity_type': entity_type,
                'entity_id': entity_id,
                'dependents': [info.to_dict() for info in dependent_info],
                'suggestion': 'Delete dependent records first, or use cascade=True'
            }
        )

    # Cascade delete: Delete all dependents recursively
    _cascade_delete_dependents(entity_type, entity_id, dependent_info, storage)


def _cascade_delete_dependents(
    entity_type: str,
    entity_id: str,
    dependent_info: List[DependentInfo],
    storage: Dict[str, Any] = None
) -> None:
    """
    Recursively delete all dependent records

    Args:
        entity_type: Type of parent entity
        entity_id: ID of parent entity
        dependent_info: List of dependent information
    """
    dependents_def = get_dependents(entity_type)

    for dep_info in dependent_info:
        dep_name = dep_info.entity_type
        dep_definition = dependents_def[dep_name]
        storage_key = dep_definition['storage_key']
        foreign_key_field = dep_definition['foreign_key_field']
        is_nested = dep_definition.get('nested', False)

        # Special handling for nested nozzles
        if is_nested and dep_name == 'nozzles':
            # Can't easily delete nested nozzles in cascade
            # Would need to modify island data structure
            continue

        store = storage if storage is not None else storage_module.STORAGE
        storage_data = store.get(storage_key)

        if isinstance(storage_data, dict):
            # Dict-based storage: find and delete all matching items
            ids_to_delete = [
                item_id for item_id, item in storage_data.items()
                if item.get(foreign_key_field) == entity_id
            ]
            for item_id in ids_to_delete:
                # Recursively check if this item has dependents
                sub_dependents = check_dependents(storage_key, item_id, storage)
                if sub_dependents:
                    _cascade_delete_dependents(storage_key, item_id, sub_dependents, storage)
                # Delete the item
                del storage_data[item_id]

        elif isinstance(storage_data, list):
            # List-based storage: filter out matching items
            items_to_remove = [
                item for item in storage_data
                if item.get(foreign_key_field) == entity_id
            ]

            # For list storage, we need to know the ID field
            id_field_map = {
                'readings': 'reading_id',
                'lpg_sales': 'sale_id',
                'lubricant_sales': 'sale_id',
                'credit_sales': 'sale_id',
                'shift_reconciliations': 'shift_id',
                'tank_reconciliations': 'tank_id',
            }
            id_field = id_field_map.get(storage_key)

            if id_field:
                for item in items_to_remove:
                    item_id = item.get(id_field)
                    if item_id:
                        sub_dependents = check_dependents(storage_key, item_id, storage)
                        if sub_dependents:
                            _cascade_delete_dependents(storage_key, item_id, sub_dependents, storage)

            # Now remove from list
            store[storage_key] = [
                item for item in storage_data
                if item.get(foreign_key_field) != entity_id
            ]


def validate_unique_constraint(
    entity_type: str,
    field_name: str,
    field_value: Any,
    exclude_id: Optional[str] = None,
    storage: Dict[str, Any] = None
) -> None:
    """
    Validate that a field value is unique (for one-to-one relationships)

    Args:
        entity_type: Type of entity
        field_name: Field to check for uniqueness
        field_value: Value to check
        exclude_id: Optional ID to exclude from check (for updates)

    Raises:
        HTTPException: 400 if value is not unique
    """
    foreign_keys = get_foreign_keys(entity_type)
    fk_def = foreign_keys.get(field_name, {})

    if not fk_def.get('unique', False):
        return  # Not a unique constraint

    store = storage if storage is not None else storage_module.STORAGE
    storage_data = store.get(entity_type)

    if isinstance(storage_data, dict):
        # Check if any other record has this value
        for item_id, item in storage_data.items():
            if item_id == exclude_id:
                continue  # Skip the item being updated
            if item.get(field_name) == field_value:
                raise HTTPException(
                    status_code=400,
                    detail={
                        'error_type': 'unique_constraint_violation',
                        'message': f"A {entity_type.rstrip('s')} with {field_name}='{field_value}' already exists. This is a one-to-one relationship.",
                        'field': field_name,
                        'value': field_value
                    }
                )

    elif isinstance(storage_data, list):
        # Check if any item has this value
        id_field_map = {
            'shift_reconciliations': 'shift_id',
        }
        id_field = id_field_map.get(entity_type)

        for item in storage_data:
            if id_field and item.get(id_field) == exclude_id:
                continue  # Skip the item being updated
            if item.get(field_name) == field_value:
                raise HTTPException(
                    status_code=400,
                    detail={
                        'error_type': 'unique_constraint_violation',
                        'message': f"A {entity_type.rstrip('s')} with {field_name}='{field_value}' already exists. This is a one-to-one relationship.",
                        'field': field_name,
                        'value': field_value
                    }
                )
