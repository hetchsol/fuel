"""
Validated CRUD Service
Extends the generic CRUDService with automatic relationship validation
"""
from typing import Dict, Any
from .crud import CRUDService, T
from .validation_engine import (
    validate_foreign_keys,
    validate_delete,
    validate_unique_constraint
)


class ValidatedCRUDService(CRUDService[T]):
    """
    Extended CRUD service with automatic relationship validation

    Usage:
        accounts_service = ValidatedCRUDService(
            storage=STORAGE['accounts'],
            model=AccountHolder,
            id_field='account_id',
            name='account',
            entity_type='accounts'  # Required for validation
        )

    This service automatically:
    - Validates foreign keys on create and update
    - Checks for dependent records before delete
    - Validates unique constraints (one-to-one relationships)
    """

    def __init__(
        self,
        storage: Dict[str, Dict[str, Any]],
        model: type[T],
        id_field: str = 'id',
        name: str = 'item',
        entity_type: str = None
    ):
        """
        Initialize Validated CRUD service

        Args:
            storage: In-memory dictionary storage
            model: Pydantic model class
            id_field: Name of the ID field
            name: Human-readable name for error messages
            entity_type: Type of entity for validation (e.g., 'accounts', 'shifts')
                        Required for validation to work
        """
        super().__init__(storage, model, id_field, name)
        self.entity_type = entity_type

        if not entity_type:
            raise ValueError(
                "entity_type is required for ValidatedCRUDService. "
                "Example: entity_type='accounts'"
            )

    def create(self, item: T) -> T:
        """
        Create a new item with foreign key validation

        Args:
            item: Model instance to create

        Returns:
            Created model instance

        Raises:
            HTTPException: 400 if item already exists or foreign keys are invalid
        """
        item_dict = item.dict()

        # Validate foreign keys
        validate_foreign_keys(self.entity_type, item_dict)

        # Validate unique constraints (e.g., one-to-one relationships)
        # This will check if any foreign keys marked as 'unique' already exist
        from ..database.relationships import get_foreign_keys
        fks = get_foreign_keys(self.entity_type)
        for field_name, fk_def in fks.items():
            if fk_def.get('unique', False):
                field_value = item_dict.get(field_name)
                if field_value:
                    validate_unique_constraint(
                        self.entity_type,
                        field_name,
                        field_value
                    )

        # Call parent create
        return super().create(item)

    def update(self, item_id: str, item: T) -> T:
        """
        Update an existing item with foreign key validation

        Args:
            item_id: ID of item to update
            item: New model instance data

        Returns:
            Updated model instance

        Raises:
            HTTPException: 404 if item not found, 400 if foreign keys are invalid
        """
        item_dict = item.dict()

        # Validate foreign keys
        validate_foreign_keys(self.entity_type, item_dict)

        # Validate unique constraints (excluding the current item)
        from ..database.relationships import get_foreign_keys
        fks = get_foreign_keys(self.entity_type)
        for field_name, fk_def in fks.items():
            if fk_def.get('unique', False):
                field_value = item_dict.get(field_name)
                if field_value:
                    validate_unique_constraint(
                        self.entity_type,
                        field_name,
                        field_value,
                        exclude_id=item_id
                    )

        # Call parent update
        return super().update(item_id, item)

    def delete(self, item_id: str, cascade: bool = False) -> Dict[str, Any]:
        """
        Delete an item with dependent record checking

        Args:
            item_id: ID of item to delete
            cascade: If True, delete all dependent records recursively

        Returns:
            Status dictionary

        Raises:
            HTTPException: 404 if item not found, 409 if dependents exist and cascade=False
        """
        # Validate delete (check for dependents)
        validate_delete(self.entity_type, item_id, cascade)

        # Call parent delete
        return super().delete(item_id)

    def delete_with_cascade(self, item_id: str) -> Dict[str, Any]:
        """
        Delete an item and all its dependent records

        This is a convenience method equivalent to delete(item_id, cascade=True)

        Args:
            item_id: ID of item to delete

        Returns:
            Status dictionary

        Raises:
            HTTPException: 404 if item not found
        """
        return self.delete(item_id, cascade=True)
