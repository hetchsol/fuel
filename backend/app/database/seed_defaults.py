"""
Seed Default Data for Stations
Extracts hardcoded defaults from API modules into one reusable function.
"""
from datetime import datetime


def seed_station_defaults(storage: dict):
    """
    Populate a station's storage dict with default infrastructure data
    if the relevant keys are empty.
    """
    _seed_islands(storage)
    _migrate_islands_add_display_fields(storage)
    _migrate_islands_default_active(storage)
    _migrate_islands_assign_product_types(storage)
    _seed_tanks(storage)
    _seed_accounts(storage)
    _seed_lpg_accessories(storage)
    _seed_lubricants(storage)
    _seed_settings(storage)


def _seed_islands(storage: dict):
    existing = storage.get('islands')

    # Migration guard: if existing islands lack "status" field, wipe and re-seed
    if existing:
        first_island = next(iter(existing.values()), None)
        if first_island and "status" not in first_island:
            existing = None  # Force re-seed

    if existing:
        return

    # Pre-assigned layout matching the spreadsheet:
    # ISL-001/002 = Diesel (LSD), ISL-003/004 = Petrol (UNL)
    # Display number 1 for ISL-001/003, 2 for ISL-002/004
    island_config = [
        (1, "Diesel", "LSD", "TANK-DIESEL", 1),
        (2, "Diesel", "LSD", "TANK-DIESEL", 2),
        (3, "Petrol", "UNL", "TANK-PETROL", 1),
        (4, "Petrol", "UNL", "TANK-PETROL", 2),
    ]

    storage['islands'] = {}
    for i, product_type, abbrev, tank_id, display_num in island_config:
        isl_id = f"ISL-00{i}"
        ps_id = f"PS-00{i}"
        storage['islands'][isl_id] = {
            "island_id": isl_id,
            "name": f"Island {i}",
            "location": "Main Station",
            "status": "active",
            "product_type": product_type,
            "display_number": display_num,
            "fuel_type_abbrev": abbrev,
            "pump_station": {
                "pump_station_id": ps_id,
                "island_id": isl_id,
                "name": f"Pump Station {i}",
                "tank_id": tank_id,
                "nozzles": [
                    {
                        "nozzle_id": f"ISL{i}-A",
                        "pump_station_id": ps_id,
                        "fuel_type": product_type,
                        "status": "Active",
                        "electronic_reading": 0,
                        "mechanical_reading": 0,
                        "display_label": f"{display_num}A",
                        "custom_label": None,
                    },
                    {
                        "nozzle_id": f"ISL{i}-B",
                        "pump_station_id": ps_id,
                        "fuel_type": product_type,
                        "status": "Active",
                        "electronic_reading": 0,
                        "mechanical_reading": 0,
                        "display_label": f"{display_num}B",
                        "custom_label": None,
                    },
                ],
            },
        }

    # Safety call: recompute labels for consistency
    from ..services.naming_convention import compute_display_labels
    compute_display_labels(storage['islands'])


def _seed_tanks(storage: dict):
    if storage.get('tanks'):
        return
    storage['tanks'] = {
        "TANK-DIESEL": {
            "tank_id": "TANK-DIESEL",
            "fuel_type": "Diesel",
            "current_level": 15000.0,
            "capacity": 20000.0,
            "last_updated": datetime.now().isoformat(),
            "percentage": 75.0
        },
        "TANK-PETROL": {
            "tank_id": "TANK-PETROL",
            "fuel_type": "Petrol",
            "current_level": 18000.0,
            "capacity": 25000.0,
            "last_updated": datetime.now().isoformat(),
            "percentage": 72.0
        }
    }


def _seed_accounts(storage: dict):
    if storage.get('accounts'):
        return
    storage['accounts'] = {
        "ACC-POS": {"account_id": "ACC-POS", "account_name": "POS Terminals", "account_type": "Corporate", "credit_limit": 100000.0, "current_balance": 0.0},
        "ACC-GENSET": {"account_id": "ACC-GENSET", "account_name": "GenSet Fuel", "account_type": "Internal", "credit_limit": 50000.0, "current_balance": 0.0},
        "ACC-KAFUBU": {"account_id": "ACC-KAFUBU", "account_name": "Kafubu", "account_type": "Corporate", "credit_limit": 200000.0, "current_balance": 0.0},
        "ACC-RONGO": {"account_id": "ACC-RONGO", "account_name": "Rongo Rongo", "account_type": "Corporate", "credit_limit": 150000.0, "current_balance": 0.0},
        "ACC-BOLATO": {"account_id": "ACC-BOLATO", "account_name": "Bolato", "account_type": "Corporate", "credit_limit": 100000.0, "current_balance": 0.0},
        "ACC-DEBS": {"account_id": "ACC-DEBS", "account_name": "Luanshya DEBS", "account_type": "Institution", "credit_limit": 300000.0, "current_balance": 0.0, "contact_person": "Director"},
        "ACC-VOLCANO": {"account_id": "ACC-VOLCANO", "account_name": "Volcano", "account_type": "Corporate", "credit_limit": 250000.0, "current_balance": 0.0},
        "ACC-ENGEN": {"account_id": "ACC-ENGEN", "account_name": "Engen Filling Station", "account_type": "Corporate", "credit_limit": 150000.0, "current_balance": 0.0},
        "ACC-POLICE": {"account_id": "ACC-POLICE", "account_name": "Zambia Police", "account_type": "Institution", "credit_limit": 500000.0, "current_balance": 0.0},
        "ACC-ZACODE": {"account_id": "ACC-ZACODE", "account_name": "Ministry of Education - ZACODE", "account_type": "Institution", "credit_limit": 400000.0, "current_balance": 0.0},
        "ACC-MASAITI": {"account_id": "ACC-MASAITI", "account_name": "Masaiti Council", "account_type": "Institution", "credit_limit": 300000.0, "current_balance": 0.0},
        "ACC-ORYX": {"account_id": "ACC-ORYX", "account_name": "Oryx Card", "account_type": "Corporate", "credit_limit": 200000.0, "current_balance": 0.0},
        "ACC-MUNYEMESHA": {"account_id": "ACC-MUNYEMESHA", "account_name": "Munyemesha Primary School", "account_type": "Institution", "credit_limit": 50000.0, "current_balance": 0.0},
        "ACC-MIKOMFWA": {"account_id": "ACC-MIKOMFWA", "account_name": "Mikomfwa School", "account_type": "Institution", "credit_limit": 50000.0, "current_balance": 0.0},
    }


def _seed_lpg_accessories(storage: dict):
    if storage.get('lpg_accessories'):
        return
    storage['lpg_accessories'] = {
        "COK007": {"product_code": "COK007", "description": "2 Plate Stove with Swivel Regulator", "unit_price": 1373.0, "opening_stock": 6, "current_stock": 6},
        "COK008": {"product_code": "COK008", "description": "2 Plate Stove with Bullnose Regulator", "unit_price": 1437.0, "opening_stock": 7, "current_stock": 7},
        "COK002": {"product_code": "COK002", "description": "Cadac Cooker Top", "unit_price": 305.0, "opening_stock": 9, "current_stock": 9},
        "LPGH001": {"product_code": "LPGH001", "description": "LPG Hose", "unit_price": 56.0, "opening_stock": 51, "current_stock": 51},
    }


def _seed_lubricants(storage: dict):
    if storage.get('lubricants'):
        return
    storage['lubricants'] = {
        "OIL-10W30": {"product_code": "OIL-10W30", "description": "Engine Oil 10W-30 (1L)", "category": "Engine Oil", "unit_price": 85.0, "location": "Island 3", "opening_stock": 50, "current_stock": 50},
        "OIL-15W40": {"product_code": "OIL-15W40", "description": "Engine Oil 15W-40 (1L)", "category": "Engine Oil", "unit_price": 90.0, "location": "Island 3", "opening_stock": 45, "current_stock": 45},
        "OIL-20W50": {"product_code": "OIL-20W50", "description": "Engine Oil 20W-50 (1L)", "category": "Engine Oil", "unit_price": 95.0, "location": "Island 3", "opening_stock": 40, "current_stock": 40},
        "TF-ATF": {"product_code": "TF-ATF", "description": "Automatic Transmission Fluid", "category": "Transmission Fluid", "unit_price": 120.0, "location": "Island 3", "opening_stock": 30, "current_stock": 30},
        "BF-DOT3": {"product_code": "BF-DOT3", "description": "Brake Fluid DOT 3", "category": "Brake Fluid", "unit_price": 45.0, "location": "Island 3", "opening_stock": 25, "current_stock": 25},
        "COOL-GREEN": {"product_code": "COOL-GREEN", "description": "Coolant Green (1L)", "category": "Coolant", "unit_price": 55.0, "location": "Island 3", "opening_stock": 35, "current_stock": 35},
        "OIL-10W30-BUF": {"product_code": "OIL-10W30-BUF", "description": "Engine Oil 10W-30 (1L) - Buffer Stock", "category": "Engine Oil", "unit_price": 85.0, "location": "Buffer", "opening_stock": 100, "current_stock": 100},
        "OIL-15W40-BUF": {"product_code": "OIL-15W40-BUF", "description": "Engine Oil 15W-40 (1L) - Buffer Stock", "category": "Engine Oil", "unit_price": 90.0, "location": "Buffer", "opening_stock": 100, "current_stock": 100},
    }


def _seed_settings(storage: dict):
    if 'fuel_settings' not in storage or not storage['fuel_settings']:
        from ..config import (
            DIESEL_PRICE_PER_LITER, PETROL_PRICE_PER_LITER,
            DIESEL_ALLOWABLE_LOSS_PERCENT, PETROL_ALLOWABLE_LOSS_PERCENT,
            BUSINESS_NAME, LICENSE_KEY, CONTACT_EMAIL, CONTACT_PHONE,
            LICENSE_EXPIRY_DATE, SOFTWARE_VERSION, STATION_LOCATION,
        )
        storage['fuel_settings'] = {
            "diesel_price_per_liter": DIESEL_PRICE_PER_LITER,
            "petrol_price_per_liter": PETROL_PRICE_PER_LITER,
            "diesel_allowable_loss_percent": DIESEL_ALLOWABLE_LOSS_PERCENT,
            "petrol_allowable_loss_percent": PETROL_ALLOWABLE_LOSS_PERCENT,
        }
        storage['system_settings'] = {
            "business_name": BUSINESS_NAME,
            "license_key": LICENSE_KEY,
            "contact_email": CONTACT_EMAIL,
            "contact_phone": CONTACT_PHONE,
            "license_expiry_date": LICENSE_EXPIRY_DATE,
            "software_version": SOFTWARE_VERSION,
            "station_location": STATION_LOCATION,
        }
        storage['validation_thresholds'] = {
            "pass_threshold": 0.5,
            "warning_threshold": 1.0,
        }


def _migrate_islands_add_display_fields(storage: dict):
    """
    Migration guard: if existing islands lack display_number field,
    add defaults and recompute display labels.
    """
    islands = storage.get('islands')
    if not islands:
        return

    first_island = next(iter(islands.values()), None)
    if first_island and "display_number" in first_island:
        return  # Already migrated

    # Add missing fields to all islands and nozzles
    for island in islands.values():
        island.setdefault("display_number", None)
        island.setdefault("fuel_type_abbrev", None)
        pump_station = island.get("pump_station")
        if pump_station:
            for nozzle in pump_station.get("nozzles", []):
                nozzle.setdefault("display_label", None)
                nozzle.setdefault("custom_label", None)

    # Recompute labels for any islands that already have a product_type
    from ..services.naming_convention import compute_display_labels
    compute_display_labels(islands)


def _migrate_islands_default_active(storage: dict):
    """
    Migration: flip existing inactive islands to active.
    Islands now default to active; owner can deactivate as needed.
    """
    islands = storage.get('islands')
    if not islands:
        return
    for island in islands.values():
        if island.get("status") == "inactive":
            island["status"] = "active"


def _migrate_islands_assign_product_types(storage: dict):
    """
    Migration: assign Diesel/Petrol product types to the 4 default islands
    for existing stations that were seeded with the old defaults (product_type: None).
    Skips entirely if any island already has a product_type set (owner configured manually).
    """
    islands = storage.get('islands')
    if not islands:
        return

    default_ids = ["ISL-001", "ISL-002", "ISL-003", "ISL-004"]
    # All 4 default islands must exist
    if not all(isl_id in islands for isl_id in default_ids):
        return

    # Skip if ANY island already has a product_type assigned
    if any(islands[isl_id].get("product_type") for isl_id in default_ids):
        return

    # Assign product types matching the spreadsheet layout
    assignments = {
        "ISL-001": ("Diesel", "TANK-DIESEL"),
        "ISL-002": ("Diesel", "TANK-DIESEL"),
        "ISL-003": ("Petrol", "TANK-PETROL"),
        "ISL-004": ("Petrol", "TANK-PETROL"),
    }

    for isl_id, (product_type, tank_id) in assignments.items():
        island = islands[isl_id]
        island["product_type"] = product_type

        pump_station = island.get("pump_station")
        if pump_station:
            pump_station["tank_id"] = tank_id
            for nozzle in pump_station.get("nozzles", []):
                nozzle["fuel_type"] = product_type

    from ..services.naming_convention import compute_display_labels
    compute_display_labels(islands)
