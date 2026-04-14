"""
Seed Default Data for Stations
Extracts hardcoded defaults from API modules into one reusable function.
"""
from datetime import datetime


def seed_station_defaults(storage: dict):
    """
    Populate a station's storage dict with default island layout and settings.
    Tanks, accounts, accessories, and lubricants are configured by the owner
    through the setup wizard or respective UI pages.

    Skip seeding entirely if setup_completed is explicitly False (bare metal state).
    The setup wizard will configure everything.
    """
    sys_settings = storage.get('system_settings')
    if sys_settings and sys_settings.get('setup_completed') is False and not storage.get('islands'):
        # Bare metal — owner will configure via setup wizard
        return

    _seed_islands(storage)
    _migrate_islands_add_display_fields(storage)
    _migrate_islands_default_active(storage)
    _migrate_islands_assign_product_types(storage)
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

    # Pre-assigned layout: 6 islands, 1 pump each, 2 nozzles per pump.
    # ISL-001/002/003 = Diesel (LSD), ISL-004/005/006 = Petrol (UNL)
    island_config = [
        (1, "Diesel", "LSD", "TANK-DIESEL", 1),
        (2, "Diesel", "LSD", "TANK-DIESEL", 2),
        (3, "Diesel", "LSD", "TANK-DIESEL", 3),
        (4, "Petrol", "UNL", "TANK-PETROL", 1),
        (5, "Petrol", "UNL", "TANK-PETROL", 2),
        (6, "Petrol", "UNL", "TANK-PETROL", 3),
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



# NOTE: _seed_tanks, _seed_accounts, _seed_lpg_accessories, _seed_lubricants
# were removed. Tanks are created via setup wizard. Accounts, LPG accessories,
# and lubricants are configured by the owner via the UI. No pre-seeded data.


def _seed_settings(storage: dict):
    if 'fuel_settings' not in storage or not storage['fuel_settings']:
        from ..config import (
            DIESEL_PRICE_PER_LITER, PETROL_PRICE_PER_LITER,
            DIESEL_ALLOWABLE_LOSS_PERCENT, PETROL_ALLOWABLE_LOSS_PERCENT,
            NOZZLE_ALLOWABLE_LOSS_LITERS,
            BUSINESS_NAME, LICENSE_KEY, CONTACT_EMAIL, CONTACT_PHONE,
            LICENSE_EXPIRY_DATE, SOFTWARE_VERSION, STATION_LOCATION,
        )
        storage['fuel_settings'] = {
            "diesel_price_per_liter": DIESEL_PRICE_PER_LITER,
            "petrol_price_per_liter": PETROL_PRICE_PER_LITER,
            "diesel_allowable_loss_percent": DIESEL_ALLOWABLE_LOSS_PERCENT,
            "petrol_allowable_loss_percent": PETROL_ALLOWABLE_LOSS_PERCENT,
            "nozzle_allowable_loss_liters": NOZZLE_ALLOWABLE_LOSS_LITERS,
        }
        storage['system_settings'] = {
            "business_name": BUSINESS_NAME,
            "license_key": LICENSE_KEY,
            "contact_email": CONTACT_EMAIL,
            "contact_phone": CONTACT_PHONE,
            "license_expiry_date": LICENSE_EXPIRY_DATE,
            "software_version": SOFTWARE_VERSION,
            "station_location": STATION_LOCATION,
            "setup_completed": False,
        }
        storage['validation_thresholds'] = {
            "pass_threshold": 0.5,
            "warning_threshold": 1.0,
            "meter_discrepancy_threshold": 0.5,
        }

    # Migration guard: backfill meter_discrepancy_threshold for existing stations
    vt = storage.get('validation_thresholds', {})
    if 'meter_discrepancy_threshold' not in vt:
        vt['meter_discrepancy_threshold'] = 0.5

    # Seed email settings if missing
    if 'email_settings' not in storage or not storage['email_settings']:
        storage['email_settings'] = {
            "enabled": False,
            "from_address": "NextStop <onboarding@resend.dev>",
            "recipients": [],
        }

    # Seed tax & levy settings if missing
    if 'tax_levy_settings' not in storage or not storage['tax_levy_settings']:
        from ..config import VAT_RATE, FUEL_LEVY_PER_LITER
        storage['tax_levy_settings'] = {
            "vat_rate": VAT_RATE,
            "fuel_levy_per_liter": FUEL_LEVY_PER_LITER,
        }

    # Seed stock alert settings if missing
    if 'stock_alert_settings' not in storage or not storage['stock_alert_settings']:
        from ..config import LOW_STOCK_THRESHOLD_PERCENT, CRITICAL_STOCK_THRESHOLD_PERCENT
        storage['stock_alert_settings'] = {
            "low_stock_threshold_percent": LOW_STOCK_THRESHOLD_PERCENT,
            "critical_stock_threshold_percent": CRITICAL_STOCK_THRESHOLD_PERCENT,
        }

    # Seed reconciliation tolerance settings if missing
    if 'reconciliation_tolerance_settings' not in storage or not storage['reconciliation_tolerance_settings']:
        storage['reconciliation_tolerance_settings'] = {
            "volume_tolerance_mode": "percentage",
            "volume_tolerance_minor": 50.0,
            "volume_tolerance_investigation": 200.0,
            "volume_cap_minor": 0.0,
            "volume_cap_investigation": 0.0,
            "percent_tolerance_minor": 0.5,
            "percent_tolerance_investigation": 2.0,
            "volume_tiers": [],
            "cash_tolerance_minor": 500.0,
            "cash_tolerance_investigation": 2000.0,
            "min_volume_for_percent": 100.0,
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

    default_ids = ["ISL-001", "ISL-002", "ISL-003", "ISL-004", "ISL-005", "ISL-006"]
    # All 6 default islands must exist
    if not all(isl_id in islands for isl_id in default_ids):
        return

    # Skip if ANY island already has a product_type assigned
    if any(islands[isl_id].get("product_type") for isl_id in default_ids):
        return

    # Assign product types matching the spreadsheet layout
    assignments = {
        "ISL-001": ("Diesel", "TANK-DIESEL"),
        "ISL-002": ("Diesel", "TANK-DIESEL"),
        "ISL-003": ("Diesel", "TANK-DIESEL"),
        "ISL-004": ("Petrol", "TANK-PETROL"),
        "ISL-005": ("Petrol", "TANK-PETROL"),
        "ISL-006": ("Petrol", "TANK-PETROL"),
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
