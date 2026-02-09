"""
Relational Query Service
Implements relationship-based queries across all entities in the system
"""
from typing import List, Dict, Any, Optional
from collections import defaultdict


class RelationalQueryService:
    """
    Service for querying related data across multiple entities
    Implements the relationships defined in the database schema
    """

    def __init__(self, data_stores: Dict[str, Any]):
        """
        Initialize with all data stores

        Args:
            data_stores: Dictionary containing all in-memory data stores
                {
                    'users': [],
                    'shifts': [],
                    'readings': [],
                    'nozzles': [],
                    'islands': [],
                    'sales': [],
                    'tanks': [],
                    'accounts': [],
                    'reconciliations': []
                }
        """
        self.data_stores = data_stores

    # ==================== STAFF RELATIONSHIPS ====================

    def get_nozzles_by_staff(self, staff_name: str) -> List[Dict[str, Any]]:
        """
        Get all nozzles used by a specific staff member
        Relationship: User -> Readings -> Nozzles
        """
        readings = self.data_stores.get('readings', [])

        # Get unique nozzle IDs used by this staff member
        nozzle_ids = set()
        for reading in readings:
            reader = reading.get('user') or reading.get('staff_name') or reading.get('attendant')
            if reader and reader.lower() == staff_name.lower():
                nozzle_id = reading.get('nozzle_id')
                if nozzle_id:
                    nozzle_ids.add(nozzle_id)

        return list(nozzle_ids)

    def get_shifts_by_staff(self, staff_name: str) -> List[Dict[str, Any]]:
        """
        Get all shifts where a staff member recorded readings
        Relationship: User -> Readings -> Shifts
        """
        readings = self.data_stores.get('readings', [])
        shifts = self.data_stores.get('shifts', [])

        # Get unique shift IDs
        shift_ids = set()
        for reading in readings:
            reader = reading.get('user') or reading.get('staff_name') or reading.get('attendant')
            if reader and reader.lower() == staff_name.lower():
                shift_id = reading.get('shift_id')
                if shift_id:
                    shift_ids.add(shift_id)

        # Return matching shifts
        return [shift for shift in shifts if shift.get('shift_id') in shift_ids]

    def get_products_by_staff(self, staff_name: str) -> List[str]:
        """
        Get all product types handled by a staff member
        Relationship: User -> Readings -> Product Types
        """
        readings = self.data_stores.get('readings', [])

        product_types = set()
        for reading in readings:
            reader = reading.get('user') or reading.get('staff_name') or reading.get('attendant')
            if reader and reader.lower() == staff_name.lower():
                product = reading.get('product_type') or reading.get('fuel_type')
                if product:
                    product_types.add(product)

        return list(product_types)

    # ==================== NOZZLE RELATIONSHIPS ====================

    def get_staff_by_nozzle(self, nozzle_id: str) -> List[str]:
        """
        Get all staff who have used a specific nozzle
        Relationship: Nozzle -> Readings -> Users
        """
        readings = self.data_stores.get('readings', [])

        staff_names = set()
        for reading in readings:
            if reading.get('nozzle_id') == nozzle_id:
                reader = reading.get('user') or reading.get('staff_name') or reading.get('attendant')
                if reader:
                    staff_names.add(reader)

        return list(staff_names)

    def get_island_by_nozzle(self, nozzle_id: str) -> Optional[str]:
        """
        Get the island that a nozzle belongs to
        Relationship: Nozzle -> Island
        """
        nozzles = self.data_stores.get('nozzles', [])
        readings = self.data_stores.get('readings', [])

        # Try from nozzles data first
        for nozzle in nozzles:
            if nozzle.get('nozzle_id') == nozzle_id:
                return nozzle.get('island_id')

        # Fall back to readings
        for reading in readings:
            if reading.get('nozzle_id') == nozzle_id:
                island_id = reading.get('island_id')
                if island_id:
                    return island_id

        # Try to extract from nozzle_id pattern (e.g., ISLAND-1-ULP-001)
        if 'ISLAND' in nozzle_id.upper():
            parts = nozzle_id.split('-')
            if len(parts) >= 2:
                return f"{parts[0]}-{parts[1]}"

        return None

    def get_shifts_by_nozzle(self, nozzle_id: str) -> List[Dict[str, Any]]:
        """
        Get all shifts where a nozzle was used
        Relationship: Nozzle -> Readings -> Shifts
        """
        readings = self.data_stores.get('readings', [])
        shifts = self.data_stores.get('shifts', [])

        shift_ids = set()
        for reading in readings:
            if reading.get('nozzle_id') == nozzle_id:
                shift_id = reading.get('shift_id')
                if shift_id:
                    shift_ids.add(shift_id)

        return [shift for shift in shifts if shift.get('shift_id') in shift_ids]

    # ==================== ISLAND RELATIONSHIPS ====================

    def get_nozzles_by_island(self, island_id: str) -> List[str]:
        """
        Get all nozzles on a specific island
        Relationship: Island -> Nozzles
        """
        nozzles = self.data_stores.get('nozzles', [])
        readings = self.data_stores.get('readings', [])

        nozzle_ids = set()

        # From nozzles data
        for nozzle in nozzles:
            if nozzle.get('island_id') == island_id:
                nozzle_ids.add(nozzle.get('nozzle_id'))

        # From readings
        for reading in readings:
            if reading.get('island_id') == island_id:
                nozzle_id = reading.get('nozzle_id')
                if nozzle_id:
                    nozzle_ids.add(nozzle_id)

        return list(nozzle_ids)

    def get_staff_by_island(self, island_id: str) -> List[str]:
        """
        Get all staff who have worked on a specific island
        Relationship: Island -> Readings -> Users
        """
        readings = self.data_stores.get('readings', [])

        staff_names = set()
        for reading in readings:
            if reading.get('island_id') == island_id:
                reader = reading.get('user') or reading.get('staff_name') or reading.get('attendant')
                if reader:
                    staff_names.add(reader)

        return list(staff_names)

    # ==================== SHIFT RELATIONSHIPS ====================

    def get_staff_by_shift(self, shift_id: str) -> List[str]:
        """
        Get all staff who worked during a specific shift
        Relationship: Shift -> Readings -> Users
        """
        readings = self.data_stores.get('readings', [])

        staff_names = set()
        for reading in readings:
            if reading.get('shift_id') == shift_id:
                reader = reading.get('user') or reading.get('staff_name') or reading.get('attendant')
                if reader:
                    staff_names.add(reader)

        return list(staff_names)

    def get_nozzles_by_shift(self, shift_id: str) -> List[str]:
        """
        Get all nozzles used during a specific shift
        Relationship: Shift -> Readings -> Nozzles
        """
        readings = self.data_stores.get('readings', [])

        nozzle_ids = set()
        for reading in readings:
            if reading.get('shift_id') == shift_id:
                nozzle_id = reading.get('nozzle_id')
                if nozzle_id:
                    nozzle_ids.add(nozzle_id)

        return list(nozzle_ids)

    def get_reconciliation_by_shift(self, shift_id: str) -> Optional[Dict[str, Any]]:
        """
        Get reconciliation for a specific shift
        Relationship: Shift -> Reconciliation (one-to-one)
        """
        reconciliations = self.data_stores.get('reconciliations', [])

        for recon in reconciliations:
            if recon.get('shift_id') == shift_id:
                return recon

        return None

    # ==================== PRODUCT RELATIONSHIPS ====================

    def get_nozzles_by_product(self, product_type: str) -> List[str]:
        """
        Get all nozzles that dispense a specific product
        Relationship: Product -> Nozzles
        """
        nozzles = self.data_stores.get('nozzles', [])
        readings = self.data_stores.get('readings', [])

        nozzle_ids = set()

        # From nozzles data
        for nozzle in nozzles:
            nozzle_product = nozzle.get('product_type') or nozzle.get('fuel_type')
            if nozzle_product and product_type.upper() in nozzle_product.upper():
                nozzle_ids.add(nozzle.get('nozzle_id'))

        # From readings
        for reading in readings:
            reading_product = reading.get('product_type') or reading.get('fuel_type')
            if reading_product and product_type.upper() in reading_product.upper():
                nozzle_id = reading.get('nozzle_id')
                if nozzle_id:
                    nozzle_ids.add(nozzle_id)

        return list(nozzle_ids)

    def get_staff_by_product(self, product_type: str) -> List[str]:
        """
        Get all staff who have handled a specific product
        Relationship: Product -> Readings -> Users
        """
        readings = self.data_stores.get('readings', [])

        staff_names = set()
        for reading in readings:
            reading_product = reading.get('product_type') or reading.get('fuel_type')
            if reading_product and product_type.upper() in reading_product.upper():
                reader = reading.get('user') or reading.get('staff_name') or reading.get('attendant')
                if reader:
                    staff_names.add(reader)

        return list(staff_names)

    # ==================== AGGREGATE QUERIES ====================

    def get_entity_summary(self, entity_type: str, entity_id: str) -> Dict[str, Any]:
        """
        Get a comprehensive summary of all relationships for an entity

        Args:
            entity_type: Type of entity (staff, nozzle, island, shift, product)
            entity_id: ID of the entity

        Returns:
            Dictionary with all related entities and counts
        """
        if entity_type == 'staff':
            return {
                'entity_type': 'staff',
                'entity_id': entity_id,
                'nozzles_used': self.get_nozzles_by_staff(entity_id),
                'shifts_worked': len(self.get_shifts_by_staff(entity_id)),
                'products_handled': self.get_products_by_staff(entity_id)
            }

        elif entity_type == 'nozzle':
            return {
                'entity_type': 'nozzle',
                'entity_id': entity_id,
                'staff_members': self.get_staff_by_nozzle(entity_id),
                'island': self.get_island_by_nozzle(entity_id),
                'shifts_used': len(self.get_shifts_by_nozzle(entity_id))
            }

        elif entity_type == 'island':
            return {
                'entity_type': 'island',
                'entity_id': entity_id,
                'nozzles': self.get_nozzles_by_island(entity_id),
                'staff_members': self.get_staff_by_island(entity_id)
            }

        elif entity_type == 'shift':
            return {
                'entity_type': 'shift',
                'entity_id': entity_id,
                'staff_members': self.get_staff_by_shift(entity_id),
                'nozzles_used': self.get_nozzles_by_shift(entity_id),
                'reconciliation': self.get_reconciliation_by_shift(entity_id)
            }

        elif entity_type == 'product':
            return {
                'entity_type': 'product',
                'entity_id': entity_id,
                'nozzles': self.get_nozzles_by_product(entity_id),
                'staff_members': self.get_staff_by_product(entity_id)
            }

        return {}
