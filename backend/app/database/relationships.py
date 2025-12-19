"""
Relationship Registry
Defines all foreign key relationships and dependents for validation
Based on backend/app/database/schema.py
"""
from typing import Dict, List, Any

# Comprehensive relationship definitions for validation
RELATIONSHIPS: Dict[str, Dict[str, Any]] = {
    'users': {
        'foreign_keys': {},  # Users have no foreign keys
        'dependents': {
            'readings': {
                'storage_key': 'readings',
                'foreign_key_field': 'user_id',
                'description': 'Readings recorded by this user'
            },
            'shifts': {
                'storage_key': 'shifts',
                'foreign_key_field': 'supervisor_id',  # Users can supervise shifts
                'description': 'Shifts supervised by this user',
                'optional': True  # supervisor_id can be None
            }
        }
    },

    'shifts': {
        'foreign_keys': {
            'supervisor_id': {
                'references': 'users',
                'reference_field': 'user_id',
                'required': False,  # Optional foreign key
                'description': 'Supervisor for this shift'
            }
        },
        'dependents': {
            'readings': {
                'storage_key': 'readings',
                'foreign_key_field': 'shift_id',
                'description': 'Readings taken during this shift'
            },
            'credit_sales': {
                'storage_key': 'credit_sales',
                'foreign_key_field': 'shift_id',
                'description': 'Credit sales during this shift'
            },
            'lpg_sales': {
                'storage_key': 'lpg_sales',
                'foreign_key_field': 'shift_id',
                'description': 'LPG sales during this shift'
            },
            'lubricant_sales': {
                'storage_key': 'lubricant_sales',
                'foreign_key_field': 'shift_id',
                'description': 'Lubricant sales during this shift'
            },
            'shift_reconciliations': {
                'storage_key': 'shift_reconciliations',
                'foreign_key_field': 'shift_id',
                'description': 'Reconciliation for this shift',
                'one_to_one': True  # Only one reconciliation per shift
            },
            'tank_reconciliations': {
                'storage_key': 'tank_reconciliations',
                'foreign_key_field': 'shift_id',
                'description': 'Tank reconciliations for this shift'
            }
        }
    },

    'islands': {
        'foreign_keys': {},  # Islands have no foreign keys
        'dependents': {
            'nozzles': {
                'storage_key': 'nozzles',  # Note: nested in islands
                'foreign_key_field': 'island_id',
                'description': 'Nozzles on this island',
                'nested': True  # Special handling for nested structure
            },
            'readings': {
                'storage_key': 'readings',
                'foreign_key_field': 'island_id',
                'description': 'Readings from nozzles on this island'
            }
        }
    },

    'nozzles': {
        'foreign_keys': {
            'island_id': {
                'references': 'islands',
                'reference_field': 'island_id',
                'required': True,
                'description': 'Island where this nozzle is located'
            }
        },
        'dependents': {
            'readings': {
                'storage_key': 'readings',
                'foreign_key_field': 'nozzle_id',
                'description': 'Readings from this nozzle'
            }
        }
    },

    'readings': {
        'foreign_keys': {
            'nozzle_id': {
                'references': 'nozzles',
                'reference_field': 'nozzle_id',
                'required': True,
                'description': 'Nozzle where reading was taken'
            },
            'shift_id': {
                'references': 'shifts',
                'reference_field': 'shift_id',
                'required': True,
                'description': 'Shift when reading was taken'
            },
            'user_id': {
                'references': 'users',
                'reference_field': 'user_id',
                'required': False,  # Attendant name is stored, user_id may be optional
                'description': 'User who recorded the reading'
            }
        },
        'dependents': {}  # Readings have no dependents
    },

    'tanks': {
        'foreign_keys': {},  # Tanks have no foreign keys
        'dependents': {
            'tank_reconciliations': {
                'storage_key': 'tank_reconciliations',
                'foreign_key_field': 'tank_id',
                'description': 'Reconciliations for this tank'
            }
        }
    },

    'tank_reconciliations': {
        'foreign_keys': {
            'tank_id': {
                'references': 'tanks',
                'reference_field': 'tank_id',
                'required': True,
                'description': 'Tank being reconciled'
            },
            'shift_id': {
                'references': 'shifts',
                'reference_field': 'shift_id',
                'required': True,
                'description': 'Shift for this reconciliation'
            }
        },
        'dependents': {}
    },

    'accounts': {
        'foreign_keys': {},  # Account holders have no foreign keys
        'dependents': {
            'credit_sales': {
                'storage_key': 'credit_sales',
                'foreign_key_field': 'account_id',
                'description': 'Credit sales to this account'
            }
        }
    },

    'credit_sales': {
        'foreign_keys': {
            'account_id': {
                'references': 'accounts',
                'reference_field': 'account_id',
                'required': True,
                'description': 'Account holder for this credit sale'
            },
            'shift_id': {
                'references': 'shifts',
                'reference_field': 'shift_id',
                'required': True,
                'description': 'Shift when sale occurred'
            }
        },
        'dependents': {}
    },

    'lpg_sales': {
        'foreign_keys': {
            'shift_id': {
                'references': 'shifts',
                'reference_field': 'shift_id',
                'required': True,
                'description': 'Shift when LPG sale occurred'
            }
        },
        'dependents': {}
    },

    'lubricants': {
        'foreign_keys': {},  # Lubricant products have no foreign keys
        'dependents': {
            'lubricant_sales': {
                'storage_key': 'lubricant_sales',
                'foreign_key_field': 'product_code',
                'description': 'Sales of this lubricant product'
            }
        }
    },

    'lubricant_sales': {
        'foreign_keys': {
            'shift_id': {
                'references': 'shifts',
                'reference_field': 'shift_id',
                'required': True,
                'description': 'Shift when sale occurred'
            },
            'product_code': {
                'references': 'lubricants',
                'reference_field': 'product_code',
                'required': True,
                'description': 'Lubricant product sold'
            }
        },
        'dependents': {}
    },

    'lpg_accessories': {
        'foreign_keys': {},  # LPG accessories have no foreign keys
        'dependents': {}  # No explicit sales tracking for accessories yet
    },

    'shift_reconciliations': {
        'foreign_keys': {
            'shift_id': {
                'references': 'shifts',
                'reference_field': 'shift_id',
                'required': True,
                'description': 'Shift being reconciled',
                'unique': True  # One-to-one relationship
            }
        },
        'dependents': {}
    }
}


def get_foreign_keys(entity_type: str) -> Dict[str, Any]:
    """
    Get all foreign keys for an entity type

    Args:
        entity_type: Type of entity (e.g., 'readings', 'shifts')

    Returns:
        Dict of foreign key definitions
    """
    return RELATIONSHIPS.get(entity_type, {}).get('foreign_keys', {})


def get_dependents(entity_type: str) -> Dict[str, Any]:
    """
    Get all dependent relationships for an entity type

    Args:
        entity_type: Type of entity

    Returns:
        Dict of dependent relationship definitions
    """
    return RELATIONSHIPS.get(entity_type, {}).get('dependents', {})


def has_foreign_keys(entity_type: str) -> bool:
    """
    Check if entity type has any foreign keys

    Args:
        entity_type: Type of entity

    Returns:
        True if entity has foreign keys, False otherwise
    """
    return len(get_foreign_keys(entity_type)) > 0


def has_dependents(entity_type: str) -> bool:
    """
    Check if entity type has any dependents

    Args:
        entity_type: Type of entity

    Returns:
        True if entity has dependents, False otherwise
    """
    return len(get_dependents(entity_type)) > 0


def is_foreign_key_required(entity_type: str, field_name: str) -> bool:
    """
    Check if a foreign key field is required

    Args:
        entity_type: Type of entity
        field_name: Name of the foreign key field

    Returns:
        True if required, False if optional
    """
    fk_def = get_foreign_keys(entity_type).get(field_name, {})
    return fk_def.get('required', True)  # Default to required


def get_referenced_entity(entity_type: str, field_name: str) -> str:
    """
    Get the entity type that a foreign key references

    Args:
        entity_type: Type of entity
        field_name: Name of the foreign key field

    Returns:
        Referenced entity type (e.g., 'shifts', 'users')
    """
    fk_def = get_foreign_keys(entity_type).get(field_name, {})
    return fk_def.get('references', '')
