"""
Generic CRUD Service Layer
Provides reusable functions for common database operations
"""
from fastapi import HTTPException
from typing import Dict, List, Any, TypeVar, Generic, Type, Optional
from pydantic import BaseModel

T = TypeVar('T', bound=BaseModel)


class CRUDService(Generic[T]):
    """
    Generic CRUD service for in-memory dictionary storage

    Usage:
        accessories_service = CRUDService(
            storage=accessories_inventory,
            model=LPGAccessory,
            id_field='product_code',
            name='accessory'
        )

        # Then use:
        all_items = accessories_service.get_all()
        item = accessories_service.get_by_id('COK007')
        etc.
    """

    def __init__(
        self,
        storage: Dict[str, Dict[str, Any]],
        model: Type[T],
        id_field: str = 'id',
        name: str = 'item'
    ):
        """
        Initialize CRUD service

        Args:
            storage: In-memory dictionary storage (e.g., accessories_inventory)
            model: Pydantic model class (e.g., LPGAccessory)
            id_field: Name of the ID field (e.g., 'product_code', 'account_id')
            name: Human-readable name for error messages (e.g., 'accessory', 'account')
        """
        self.storage = storage
        self.model = model
        self.id_field = id_field
        self.name = name

    def get_all(self) -> List[T]:
        """
        Get all items from storage

        Returns:
            List of model instances
        """
        return [self.model(**item) for item in self.storage.values()]

    def get_by_id(self, item_id: str) -> T:
        """
        Get a single item by ID

        Args:
            item_id: The ID to look up

        Returns:
            Model instance

        Raises:
            HTTPException: 404 if item not found
        """
        if item_id not in self.storage:
            raise HTTPException(
                status_code=404,
                detail=f"{self.name.capitalize()} not found"
            )

        return self.model(**self.storage[item_id])

    def create(self, item: T) -> T:
        """
        Create a new item

        Args:
            item: Model instance to create

        Returns:
            Created model instance

        Raises:
            HTTPException: 400 if item already exists
        """
        item_dict = item.dict()
        item_id = item_dict[self.id_field]

        if item_id in self.storage:
            raise HTTPException(
                status_code=400,
                detail=f"{self.name.capitalize()} already exists"
            )

        self.storage[item_id] = item_dict
        return item

    def update(self, item_id: str, item: T) -> T:
        """
        Update an existing item

        Args:
            item_id: ID of item to update
            item: New model instance data

        Returns:
            Updated model instance

        Raises:
            HTTPException: 404 if item not found
        """
        if item_id not in self.storage:
            raise HTTPException(
                status_code=404,
                detail=f"{self.name.capitalize()} not found"
            )

        self.storage[item_id] = item.dict()
        return item

    def delete(self, item_id: str) -> Dict[str, Any]:
        """
        Delete an item

        Args:
            item_id: ID of item to delete

        Returns:
            Status dictionary

        Raises:
            HTTPException: 404 if item not found
        """
        if item_id not in self.storage:
            raise HTTPException(
                status_code=404,
                detail=f"{self.name.capitalize()} not found"
            )

        deleted_item = self.storage.pop(item_id)

        return {
            "status": "success",
            "message": f"{self.name.capitalize()} deleted successfully",
            "deleted_id": item_id
        }

    def exists(self, item_id: str) -> bool:
        """
        Check if item exists

        Args:
            item_id: ID to check

        Returns:
            True if exists, False otherwise
        """
        return item_id in self.storage

    def filter(self, **filters) -> List[T]:
        """
        Filter items by field values

        Args:
            **filters: Field name and value pairs to filter by
                      Example: filter(location="Island 3", category="Engine Oil")

        Returns:
            List of matching model instances
        """
        results = []

        for item_dict in self.storage.values():
            match = True
            for field, value in filters.items():
                if item_dict.get(field) != value:
                    match = False
                    break

            if match:
                results.append(self.model(**item_dict))

        return results

    def count(self, **filters) -> int:
        """
        Count items, optionally with filters

        Args:
            **filters: Optional field name and value pairs to filter by

        Returns:
            Count of matching items
        """
        if not filters:
            return len(self.storage)

        return len(self.filter(**filters))


def increment_stock(
    storage: Dict[str, Dict[str, Any]],
    item_id: str,
    quantity: int,
    stock_field: str = 'current_stock',
    item_name: str = 'item'
) -> Dict[str, Any]:
    """
    Generic function to increment stock quantity

    Args:
        storage: In-memory dictionary storage
        item_id: ID of item to restock
        quantity: Amount to add
        stock_field: Name of the stock field (default: 'current_stock')
        item_name: Human-readable name for error messages

    Returns:
        Status dictionary with new stock level

    Raises:
        HTTPException: 404 if item not found
    """
    if item_id not in storage:
        raise HTTPException(
            status_code=404,
            detail=f"{item_name.capitalize()} not found"
        )

    storage[item_id][stock_field] += quantity

    return {
        "status": "success",
        f"{item_name}_id": item_id,
        "quantity_added": quantity,
        "new_stock": storage[item_id][stock_field]
    }


def decrement_stock(
    storage: Dict[str, Dict[str, Any]],
    item_id: str,
    quantity: int,
    stock_field: str = 'current_stock',
    item_name: str = 'item',
    allow_negative: bool = False
) -> Dict[str, Any]:
    """
    Generic function to decrement stock quantity

    Args:
        storage: In-memory dictionary storage
        item_id: ID of item
        quantity: Amount to deduct
        stock_field: Name of the stock field (default: 'current_stock')
        item_name: Human-readable name for error messages
        allow_negative: Allow stock to go negative (default: False)

    Returns:
        Status dictionary with new stock level

    Raises:
        HTTPException: 404 if item not found, 400 if insufficient stock
    """
    if item_id not in storage:
        raise HTTPException(
            status_code=404,
            detail=f"{item_name.capitalize()} not found"
        )

    current_stock = storage[item_id][stock_field]

    if not allow_negative and current_stock < quantity:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient stock. Available: {current_stock}, Requested: {quantity}"
        )

    storage[item_id][stock_field] -= quantity

    return {
        "status": "success",
        f"{item_name}_id": item_id,
        "quantity_deducted": quantity,
        "new_stock": storage[item_id][stock_field]
    }


def get_raw_dict(storage: Dict[str, Dict[str, Any]], item_id: str) -> Optional[Dict[str, Any]]:
    """
    Get raw dictionary for an item (without Pydantic conversion)
    Useful for direct manipulation

    Args:
        storage: In-memory dictionary storage
        item_id: ID to look up

    Returns:
        Raw dictionary or None if not found
    """
    return storage.get(item_id)
