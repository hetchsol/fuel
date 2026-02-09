"""
Database Schema with Relationships
Defines the relational structure of the fuel management system
"""

# DATABASE SCHEMA RELATIONSHIPS
# This defines how all entities in the system relate to each other

SCHEMA = {
    # Core Entities
    "users": {
        "primary_key": "user_id",
        "fields": {
            "user_id": "string",
            "username": "string",
            "full_name": "string",
            "role": "string",  # user, supervisor, owner
            "created_at": "datetime"
        },
        "relationships": {
            "readings": "one_to_many",  # One user can record many readings
            "shifts": "one_to_many",     # One user can work many shifts
            "sales": "one_to_many"       # One user can make many sales
        }
    },

    "shifts": {
        "primary_key": "shift_id",
        "fields": {
            "shift_id": "string",
            "date": "date",
            "shift_type": "string",  # Day, Night
            "start_time": "datetime",
            "end_time": "datetime",
            "status": "string",
            "supervisor_id": "string"
        },
        "foreign_keys": {
            "supervisor_id": "users.user_id"
        },
        "relationships": {
            "readings": "one_to_many",        # One shift has many readings
            "sales": "one_to_many",           # One shift has many sales
            "reconciliation": "one_to_one",   # One shift has one reconciliation
            "supervisor": "many_to_one"       # Many shifts to one supervisor
        }
    },

    "islands": {
        "primary_key": "island_id",
        "fields": {
            "island_id": "string",
            "island_name": "string",
            "location": "string",
            "status": "string"
        },
        "relationships": {
            "nozzles": "one_to_many",   # One island has many nozzles
            "readings": "one_to_many"   # One island has many readings
        }
    },

    "nozzles": {
        "primary_key": "nozzle_id",
        "fields": {
            "nozzle_id": "string",
            "nozzle_name": "string",
            "island_id": "string",
            "product_type": "string",  # Petrol, Diesel
            "status": "string"
        },
        "foreign_keys": {
            "island_id": "islands.island_id"
        },
        "relationships": {
            "island": "many_to_one",    # Many nozzles to one island
            "readings": "one_to_many",  # One nozzle has many readings
            "sales": "one_to_many"      # One nozzle has many sales
        }
    },

    "readings": {
        "primary_key": "reading_id",
        "fields": {
            "reading_id": "string",
            "nozzle_id": "string",
            "island_id": "string",
            "shift_id": "string",
            "user_id": "string",
            "reading_type": "string",  # opening, closing
            "reading_value": "float",
            "volume": "float",
            "timestamp": "datetime",
            "product_type": "string"
        },
        "foreign_keys": {
            "nozzle_id": "nozzles.nozzle_id",
            "island_id": "islands.island_id",
            "shift_id": "shifts.shift_id",
            "user_id": "users.user_id"
        },
        "relationships": {
            "nozzle": "many_to_one",   # Many readings to one nozzle
            "island": "many_to_one",   # Many readings to one island
            "shift": "many_to_one",    # Many readings to one shift
            "user": "many_to_one"      # Many readings recorded by one user
        }
    },

    "tanks": {
        "primary_key": "tank_id",
        "fields": {
            "tank_id": "string",
            "fuel_type": "string",  # Petrol, Diesel
            "capacity": "float",
            "current_level": "float",
            "last_updated": "datetime"
        },
        "relationships": {
            "dip_readings": "one_to_many",  # One tank has many dip readings
            "deliveries": "one_to_many"      # One tank has many deliveries
        }
    },

    "dip_readings": {
        "primary_key": "dip_reading_id",
        "fields": {
            "dip_reading_id": "string",
            "tank_id": "string",
            "shift_id": "string",
            "user_id": "string",
            "reading_type": "string",  # opening_dip, closing_dip
            "dip_value": "float",
            "volume": "float",
            "timestamp": "datetime"
        },
        "foreign_keys": {
            "tank_id": "tanks.tank_id",
            "shift_id": "shifts.shift_id",
            "user_id": "users.user_id"
        },
        "relationships": {
            "tank": "many_to_one",
            "shift": "many_to_one",
            "user": "many_to_one"
        }
    },

    "validated_readings": {
        "primary_key": "reading_id",
        "fields": {
            "reading_id": "string",
            "shift_id": "string",
            "tank_id": "string",
            "reading_type": "string",  # opening, closing
            "mechanical_reading": "float",
            "electronic_reading": "float",
            "dip_reading_cm": "float",
            "dip_reading_liters": "float",
            "recorded_by": "string",  # user_id
            "timestamp": "datetime",
            "validation_status": "string",  # PASS, FAIL, WARNING
            "discrepancy_mech_elec_percent": "float",
            "discrepancy_mech_dip_percent": "float",
            "discrepancy_elec_dip_percent": "float",
            "max_discrepancy_percent": "float",
            "validation_message": "string",
            "notes": "string"
        },
        "foreign_keys": {
            "shift_id": "shifts.shift_id",
            "tank_id": "tanks.tank_id",
            "recorded_by": "users.user_id"
        },
        "relationships": {
            "shift": "many_to_one",
            "tank": "many_to_one",
            "user": "many_to_one"
        }
    },

    "sales": {
        "primary_key": "sale_id",
        "fields": {
            "sale_id": "string",
            "shift_id": "string",
            "nozzle_id": "string",
            "user_id": "string",
            "account_id": "string",  # For credit sales
            "product_type": "string",
            "volume": "float",
            "price_per_unit": "float",
            "total_amount": "float",
            "payment_type": "string",  # cash, credit
            "timestamp": "datetime"
        },
        "foreign_keys": {
            "shift_id": "shifts.shift_id",
            "nozzle_id": "nozzles.nozzle_id",
            "user_id": "users.user_id",
            "account_id": "accounts.account_id"
        },
        "relationships": {
            "shift": "many_to_one",
            "nozzle": "many_to_one",
            "user": "many_to_one",
            "account": "many_to_one"
        }
    },

    "accounts": {
        "primary_key": "account_id",
        "fields": {
            "account_id": "string",
            "account_name": "string",
            "account_type": "string",
            "credit_limit": "float",
            "current_balance": "float"
        },
        "relationships": {
            "sales": "one_to_many"  # One account has many credit sales
        }
    },

    "reconciliations": {
        "primary_key": "reconciliation_id",
        "fields": {
            "reconciliation_id": "string",
            "shift_id": "string",
            "date": "date",
            "petrol_revenue": "float",
            "diesel_revenue": "float",
            "lpg_revenue": "float",
            "lubricants_revenue": "float",
            "total_expected": "float",
            "actual_deposited": "float",
            "difference": "float",
            "cumulative_difference": "float"
        },
        "foreign_keys": {
            "shift_id": "shifts.shift_id"
        },
        "relationships": {
            "shift": "one_to_one"  # One reconciliation per shift
        }
    },

    "lpg_products": {
        "primary_key": "product_id",
        "fields": {
            "product_id": "string",
            "product_name": "string",
            "category": "string",  # cylinder, accessory
            "price": "float",
            "stock_quantity": "int"
        },
        "relationships": {
            "sales": "one_to_many"
        }
    },

    "lubricants": {
        "primary_key": "lubricant_id",
        "fields": {
            "lubricant_id": "string",
            "product_name": "string",
            "brand": "string",
            "price": "float",
            "stock_quantity": "int"
        },
        "relationships": {
            "sales": "one_to_many"
        }
    },

    "customers": {
        "primary_key": "customer_id",
        "fields": {
            "customer_id": "string",
            "customer_name": "string",
            "customer_type": "string",  # Drive-In, Corporate, Institution
            "default_price_per_liter": "float",  # Customer-specific diesel price
            "is_active": "boolean",
            "created_at": "datetime",
            "notes": "string"
        },
        "relationships": {
            "allocations": "one_to_many"  # One customer has many allocations
        }
    },

    "tank_deliveries": {
        "primary_key": "delivery_id",
        "fields": {
            "delivery_id": "string",
            "tank_id": "string",
            "fuel_type": "string",
            "date": "date",
            "time": "string",  # HH:MM
            "volume_before": "float",
            "volume_after": "float",
            "actual_volume_delivered": "float",
            "expected_volume": "float",
            "delivery_variance": "float",
            "variance_percent": "float",
            "supplier": "string",
            "invoice_number": "string",
            "temperature": "float",
            "validation_status": "string",  # PASS, WARNING, FAIL
            "validation_message": "string",
            "linked_reading_id": "string",  # NEW: FK to tank_readings (nullable)
            "recorded_by": "string",  # user_id
            "created_at": "datetime",
            "notes": "string"
        },
        "foreign_keys": {
            "tank_id": "tanks.tank_id",
            "linked_reading_id": "tank_readings.reading_id",  # NEW: Link to tank reading
            "recorded_by": "users.user_id"
        },
        "relationships": {
            "tank": "many_to_one",
            "tank_reading": "many_to_one",  # NEW: Many deliveries to one reading
            "user": "many_to_one"
        }
    },

    "tank_readings": {
        "primary_key": "reading_id",
        "fields": {
            "reading_id": "string",
            "tank_id": "string",
            "fuel_type": "string",  # Diesel or Petrol
            "date": "date",
            "shift_type": "string",  # Day or Night
            "opening_dip_cm": "float",
            "closing_dip_cm": "float",
            "after_delivery_dip_cm": "float",
            "opening_volume": "float",
            "closing_volume": "float",
            "before_offload_volume": "float",
            "after_offload_volume": "float",
            "tank_volume_movement": "float",
            "total_electronic_dispensed": "float",
            "total_mechanical_dispensed": "float",
            "electronic_vs_tank_variance": "float",
            "mechanical_vs_tank_variance": "float",
            "electronic_vs_tank_percent": "float",
            "mechanical_vs_tank_percent": "float",
            "price_per_liter": "float",
            "expected_amount_electronic": "float",
            "actual_cash_banked": "float",
            "cash_difference": "float",
            "delivery_occurred": "boolean",
            "delivery_volume": "float",
            "delivery_time": "string",
            "supplier": "string",
            "invoice_number": "string",
            "deliveries": "array",  # NEW: Array of DeliveryReference objects
            "total_delivery_volume": "float",  # NEW: Sum of all deliveries
            "delivery_count": "integer",  # NEW: Number of deliveries
            "validation_status": "string",  # PASS, WARNING, FAIL
            "recorded_by": "string",  # user_id
            "created_at": "datetime",
            "notes": "string"
        },
        "foreign_keys": {
            "tank_id": "tanks.tank_id",
            "recorded_by": "users.user_id"
        },
        "relationships": {
            "tank": "many_to_one",
            "user": "many_to_one",
            "nozzle_readings": "one_to_many",
            "customer_allocations": "one_to_many",  # One reading has many customer allocations
            "deliveries": "one_to_many"  # NEW: One reading has many deliveries
        }
    },

    "nozzle_readings": {
        "primary_key": "nozzle_reading_id",
        "fields": {
            "nozzle_reading_id": "string",
            "reading_id": "string",  # Foreign key to tank_readings
            "nozzle_id": "string",
            "attendant": "string",
            "electronic_opening": "float",
            "electronic_closing": "float",
            "electronic_movement": "float",
            "mechanical_opening": "float",
            "mechanical_closing": "float",
            "mechanical_movement": "float"
        },
        "foreign_keys": {
            "reading_id": "tank_readings.reading_id",
            "nozzle_id": "nozzles.nozzle_id"
        },
        "relationships": {
            "tank_reading": "many_to_one",
            "nozzle": "many_to_one"
        }
    },

    "customer_allocations": {
        "primary_key": "allocation_id",
        "fields": {
            "allocation_id": "string",
            "reading_id": "string",  # Foreign key to tank_readings
            "customer_id": "string",  # Foreign key to customers
            "customer_name": "string",  # Denormalized
            "volume": "float",  # Liters allocated to this customer
            "price_per_liter": "float",  # Price for this customer
            "amount": "float"  # Calculated: volume * price_per_liter
        },
        "foreign_keys": {
            "reading_id": "tank_readings.reading_id",
            "customer_id": "customers.customer_id"
        },
        "relationships": {
            "tank_reading": "many_to_one",
            "customer": "many_to_one"
        }
    }
}


# RELATIONSHIP QUERIES
# These define how to query related data across tables

RELATIONSHIP_QUERIES = {
    "staff_nozzles": {
        "description": "Get all nozzles used by a specific staff member",
        "query": """
            SELECT DISTINCT readings.nozzle_id
            FROM readings
            WHERE readings.user_id = :staff_id
        """
    },

    "staff_shifts": {
        "description": "Get all shifts worked by a staff member",
        "query": """
            SELECT shifts.*
            FROM shifts
            INNER JOIN readings ON shifts.shift_id = readings.shift_id
            WHERE readings.user_id = :staff_id
            GROUP BY shifts.shift_id
        """
    },

    "nozzle_staff": {
        "description": "Get all staff who have used a specific nozzle",
        "query": """
            SELECT DISTINCT users.user_id, users.full_name
            FROM users
            INNER JOIN readings ON users.user_id = readings.user_id
            WHERE readings.nozzle_id = :nozzle_id
        """
    },

    "island_nozzles": {
        "description": "Get all nozzles on a specific island",
        "query": """
            SELECT nozzles.*
            FROM nozzles
            WHERE nozzles.island_id = :island_id
        """
    },

    "shift_readings": {
        "description": "Get all readings for a specific shift",
        "query": """
            SELECT readings.*
            FROM readings
            WHERE readings.shift_id = :shift_id
        """
    },

    "shift_sales": {
        "description": "Get all sales for a specific shift",
        "query": """
            SELECT sales.*
            FROM sales
            WHERE sales.shift_id = :shift_id
        """
    },

    "product_nozzles": {
        "description": "Get all nozzles that dispense a specific product",
        "query": """
            SELECT nozzles.*
            FROM nozzles
            WHERE nozzles.product_type = :product_type
        """
    },

    "staff_revenue": {
        "description": "Get total revenue generated by staff member",
        "query": """
            SELECT SUM(sales.total_amount) as total_revenue
            FROM sales
            WHERE sales.user_id = :staff_id
            AND sales.timestamp BETWEEN :start_date AND :end_date
        """
    }
}


def get_related_entities(entity_type: str, entity_id: str, relation_type: str):
    """
    Get related entities based on database relationships

    Args:
        entity_type: Type of entity (staff, nozzle, island, etc.)
        entity_id: ID of the specific entity
        relation_type: Type of relationship to query

    Returns:
        List of related entities
    """
    # This would execute the appropriate query based on relationships
    pass
