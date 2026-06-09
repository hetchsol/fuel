"""
Centralized Configuration for Fuel Management System

This module contains all system-wide constants and configuration values.
All modules should import from here rather than defining their own constants.
"""

# ============================================================================
# FUEL PRICING (ZMW per liter)
# ============================================================================
# NOTE: These prices should match what's in the settings API
# If you need to change prices, update via the settings API endpoint
# These are default/initial values

DIESEL_PRICE_PER_LITER = 26.98  # ZMW per liter
PETROL_PRICE_PER_LITER = 29.92  # ZMW per liter

# ============================================================================
# ALLOWABLE LOSS PERCENTAGES
# ============================================================================
# Maximum acceptable fuel loss during delivery and operations
# Values are in percentage (e.g., 0.3 = 0.3%)

DIESEL_ALLOWABLE_LOSS_PERCENT = 0.3  # 0.3% allowable loss for diesel
PETROL_ALLOWABLE_LOSS_PERCENT = 0.5  # 0.5% allowable loss for petrol
NOZZLE_ALLOWABLE_LOSS_LITERS = 0.8  # per-nozzle allowable loss in liters

# ============================================================================
# SYSTEM/BUSINESS INFORMATION
# ============================================================================
# Default values for business/license information
# These can be updated at runtime via the settings API

BUSINESS_NAME = "Fuel Management System"
LICENSE_KEY = "DEMO-LICENSE-2025"
CONTACT_EMAIL = ""
CONTACT_PHONE = ""
LICENSE_EXPIRY_DATE = ""  # YYYY-MM-DD format
SOFTWARE_VERSION = "1.0.0"
STATION_LOCATION = ""

# ============================================================================
# TOLERANCE VALUES FOR READINGS
# ============================================================================
# Used for validating fuel readings and detecting discrepancies

TOLERANCE_ABSOLUTE = 0.2  # Absolute tolerance for readings
TOLERANCE_PERCENT = 0.05   # Percentage tolerance (5%)

# ============================================================================
# TANK SPECIFICATIONS
# ============================================================================
# Physical tank parameters

# Tank conversion factor: liters per centimeter of dip reading
# This is based on the tank's diameter and shape
# For a cylindrical tank with diameter ~100cm, ~785.4 liters per cm
TANK_CONVERSION_FACTOR = 785.4  # liters per cm

# Default tank capacities (can be overridden in tank_data)
DIESEL_TANK_CAPACITY = 20000.0  # liters
PETROL_TANK_CAPACITY = 25000.0  # liters

# ============================================================================
# TANK IDS (DEPRECATED — valid only for default single-tank setups)
# ============================================================================
# These constants remain valid for the default TANK-DIESEL and TANK-PETROL tanks.
# For multi-tank setups, use the tank_id from the tanks API or island configuration.
# Do NOT add new constants here for additional tanks.

TANK_ID_DIESEL = "TANK-DIESEL"
TANK_ID_PETROL = "TANK-PETROL"

# ============================================================================
# FUEL TYPES
# ============================================================================
# Standardized fuel type names

FUEL_TYPE_DIESEL = "Diesel"
FUEL_TYPE_PETROL = "Petrol"

# ============================================================================
# BUSINESS RULES
# ============================================================================

# Low stock warning threshold (percentage)
LOW_STOCK_THRESHOLD_PERCENT = 25.0

# Critical stock threshold (percentage)
CRITICAL_STOCK_THRESHOLD_PERCENT = 10.0

# ============================================================================
# API CONFIGURATION
# ============================================================================

# Default pagination limit for list endpoints
DEFAULT_PAGE_LIMIT = 100

# Maximum number of flags/discrepancies to return
MAX_FLAGS_RETURN = 50

# ============================================================================
# VAT / LEVY CONSTANTS (Zambia)
# ============================================================================

VAT_RATE = 0.16              # 16% VAT
FUEL_LEVY_PER_LITER = 1.44   # ZMW levy deduction per liter
VAT_INCLUSIVE_DIVISOR = 1.16  # 1 + VAT_RATE

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================


def get_fuel_price(fuel_type: str) -> float:
    """
    Get price per liter for a given fuel type

    Args:
        fuel_type: "Diesel" or "Petrol"

    Returns:
        Price per liter in ZMW

    Raises:
        ValueError: If fuel type is unknown
    """
    fuel_type_upper = fuel_type.upper()
    if "DIESEL" in fuel_type_upper:
        return DIESEL_PRICE_PER_LITER
    elif "PETROL" in fuel_type_upper or "GASOLINE" in fuel_type_upper:
        return PETROL_PRICE_PER_LITER
    else:
        raise ValueError(f"Unknown fuel type: {fuel_type}")


def get_allowable_loss_percent(fuel_type: str) -> float:
    """
    Get allowable loss percentage for a given fuel type

    Args:
        fuel_type: "Diesel" or "Petrol"

    Returns:
        Allowable loss percentage

    Raises:
        ValueError: If fuel type is unknown
    """
    fuel_type_upper = fuel_type.upper()
    if "DIESEL" in fuel_type_upper:
        return DIESEL_ALLOWABLE_LOSS_PERCENT
    elif "PETROL" in fuel_type_upper or "GASOLINE" in fuel_type_upper:
        return PETROL_ALLOWABLE_LOSS_PERCENT
    else:
        raise ValueError(f"Unknown fuel type: {fuel_type}")


def get_tank_id(fuel_type: str) -> str:
    """
    Get standard tank ID for a given fuel type.

    DEPRECATED: Returns only the default tank ID for a fuel type.
    For multi-tank setups, resolve tank_id via island pump_station configuration
    or the nozzle-to-tank utilities in storage.py.

    Args:
        fuel_type: "Diesel" or "Petrol"

    Returns:
        Tank ID string

    Raises:
        ValueError: If fuel type is unknown
    """
    fuel_type_upper = fuel_type.upper()
    if "DIESEL" in fuel_type_upper:
        return TANK_ID_DIESEL
    elif "PETROL" in fuel_type_upper or "GASOLINE" in fuel_type_upper:
        return TANK_ID_PETROL
    else:
        raise ValueError(f"Unknown fuel type: {fuel_type}")


def convert_dip_to_volume(dip_reading_cm: float) -> float:
    """
    Convert dip reading in centimeters to volume in liters

    Args:
        dip_reading_cm: Dip reading in centimeters

    Returns:
        Volume in liters
    """
    return dip_reading_cm * TANK_CONVERSION_FACTOR


def convert_volume_to_dip(volume_liters: float) -> float:
    """
    Convert volume in liters to dip reading in centimeters

    Args:
        volume_liters: Volume in liters

    Returns:
        Dip reading in centimeters
    """
    return volume_liters / TANK_CONVERSION_FACTOR


def resolve_fuel_price(fuel_type: str, storage: dict = None) -> float:
    """
    Resolve the current fuel price from runtime settings, falling back to config constants.

    Priority:
    1. storage['fuel_settings'] (set via Settings API at runtime)
    2. Config constants (DIESEL_PRICE_PER_LITER / PETROL_PRICE_PER_LITER)

    Args:
        fuel_type: "Diesel" or "Petrol"
        storage: Runtime storage dict (from station context)

    Returns:
        Price per liter in ZMW
    """
    # Try runtime settings first
    if storage:
        fuel_settings = storage.get('fuel_settings')
        if fuel_settings:
            fuel_type_upper = fuel_type.upper()
            if "DIESEL" in fuel_type_upper:
                price = fuel_settings.get('diesel_price_per_liter')
                if price is not None:
                    return float(price)
            elif "PETROL" in fuel_type_upper or "GASOLINE" in fuel_type_upper:
                price = fuel_settings.get('petrol_price_per_liter')
                if price is not None:
                    return float(price)

    # Fall back to config constants
    return get_fuel_price(fuel_type)


def apply_due_price_changes(storage: dict, station_id: str = None) -> list:
    """
    Lazily apply any scheduled price changes whose effective date+time has passed.
    Snapshots the old price before updating. Returns list of applied changes.
    """
    from datetime import datetime
    scheduled = storage.get('scheduled_price_changes', [])
    if not scheduled:
        return []

    now = datetime.now()
    applied = []
    fuel_settings = storage.setdefault('fuel_settings', {})

    for entry in scheduled:
        if entry.get('applied') or not entry.get('effective_date'):
            continue
        effective_time = entry.get('effective_time', '00:00') or '00:00'
        try:
            effective_dt = datetime.strptime(f"{entry['effective_date']} {effective_time}", "%Y-%m-%d %H:%M")
        except (ValueError, TypeError):
            continue
        if effective_dt > now:
            continue

        fuel_type = entry.get('fuel_type', '').upper()
        if 'DIESEL' in fuel_type:
            entry['old_price_per_liter'] = fuel_settings.get('diesel_price_per_liter', DIESEL_PRICE_PER_LITER)
            fuel_settings['diesel_price_per_liter'] = entry['new_price_per_liter']
        elif 'PETROL' in fuel_type or 'GASOLINE' in fuel_type:
            entry['old_price_per_liter'] = fuel_settings.get('petrol_price_per_liter', PETROL_PRICE_PER_LITER)
            fuel_settings['petrol_price_per_liter'] = entry['new_price_per_liter']

        entry['applied'] = True
        entry['applied_at'] = datetime.now().isoformat()
        applied.append(entry)

    if applied and station_id:
        from .database.station_files import save_station_json
        save_station_json(station_id, 'scheduled_price_changes.json', scheduled)
        # Write a pending snapshot prompt into every active shift so attendants
        # can submit a blind meter reading at the price-change boundary.
        _create_price_change_prompts(storage, applied)

    return applied


def _create_price_change_prompts(storage: dict, applied_changes: list) -> None:
    """
    For each active shift, record a pending price-change snapshot prompt per nozzle
    so the attendant is asked for a blind meter reading at the changeover boundary.
    """
    from datetime import datetime
    shifts = storage.get('shifts', {})
    islands = storage.get('islands', {})

    # Build nozzle→fuel_type map from islands
    nozzle_fuel: dict = {}
    for isl in islands.values():
        ps = isl.get('pump_station') or {}
        for nozzle in ps.get('nozzles', []):
            nid = nozzle.get('nozzle_id') or nozzle.get('id')
            ft  = (ps.get('fuel_type') or nozzle.get('fuel_type') or '').upper()
            if nid:
                nozzle_fuel[nid] = ft

    now_iso = datetime.now().isoformat()

    for shift in shifts.values():
        if shift.get('status') not in ('active', 'started'):
            continue
        prompts = shift.setdefault('price_change_prompts', [])
        # Collect nozzle ids for this shift
        shift_nozzles: list = []
        for ps_data in shift.get('pump_stations', {}).values():
            for n in ps_data.get('nozzles', []):
                nid = n.get('nozzle_id') or n.get('id')
                if nid:
                    shift_nozzles.append(nid)

        for change in applied_changes:
            change_fuel = (change.get('fuel_type') or '').upper()
            price_change_ref = f"{change.get('effective_date')}T{change.get('effective_time', '00:00')}"
            for nozzle_id in shift_nozzles:
                nozzle_ft = nozzle_fuel.get(nozzle_id, '')
                fuel_match = ('DIESEL' in change_fuel and 'DIESEL' in nozzle_ft) or \
                             (('PETROL' in change_fuel or 'GASOLINE' in change_fuel) and
                              ('PETROL' in nozzle_ft or 'GASOLINE' in nozzle_ft))
                if not fuel_match:
                    continue
                # Avoid duplicate prompts for the same nozzle+price_change
                already = any(
                    p.get('nozzle_id') == nozzle_id and p.get('price_change_ref') == price_change_ref
                    for p in prompts
                )
                if not already:
                    prompts.append({
                        'nozzle_id': nozzle_id,
                        'price_change_ref': price_change_ref,
                        'triggered_at': now_iso,
                        'status': 'pending',
                        'reading_value': None,
                        'submitted_at': None,
                        'submitted_by': None,
                    })


def resolve_fuel_price_for_shift(fuel_type: str, shift_date: str, shift_type: str, storage: dict = None) -> dict:
    """
    Determine whether a price change occurred during a shift window and return
    both prices so the caller can split expected cash by segment.

    Shift windows:
      Day   shift on date D: 06:00 D  to 18:00 D
      Night shift on date D: 18:00 D  to 06:00 D+1

    Returns:
        {
            "price": float,               # current price (backward compat — new price if change, else single price)
            "has_price_change": bool,
            "old_price": float | None,
            "new_price": float | None,
            "effective_date": str | None,
            "effective_time": str | None,
            "shift_start": datetime | None,   # shift window start (for split arithmetic)
            "shift_end":   datetime | None,   # shift window end
            "change_dt":   datetime | None,   # exact moment price changed
        }
    """
    from datetime import datetime, timedelta
    current_price = resolve_fuel_price(fuel_type, storage)
    result = {
        "price": current_price, "has_price_change": False,
        "old_price": None, "new_price": None,
        "effective_date": None, "effective_time": None,
        "shift_start": None, "shift_end": None, "change_dt": None,
    }

    if not storage or not shift_type or not shift_date:
        return result

    scheduled = storage.get('scheduled_price_changes', [])
    if not scheduled:
        return result

    try:
        shift_d = datetime.strptime(shift_date, "%Y-%m-%d")
    except (ValueError, TypeError):
        return result

    shift_upper = shift_type.upper()
    if shift_upper == "NIGHT":
        shift_start = shift_d.replace(hour=18, minute=0, second=0, microsecond=0)
        shift_end   = (shift_d + timedelta(days=1)).replace(hour=6, minute=0, second=0, microsecond=0)
    elif shift_upper == "DAY":
        shift_start = shift_d.replace(hour=6, minute=0, second=0, microsecond=0)
        shift_end   = shift_d.replace(hour=18, minute=0, second=0, microsecond=0)
    else:
        return result

    fuel_upper = fuel_type.upper()

    for entry in scheduled:
        if not entry.get('applied'):
            continue
        entry_fuel = (entry.get('fuel_type') or '').upper()
        matches_fuel = ('DIESEL' in fuel_upper and 'DIESEL' in entry_fuel) or \
                       (('PETROL' in fuel_upper or 'GASOLINE' in fuel_upper) and
                        ('PETROL' in entry_fuel or 'GASOLINE' in entry_fuel))
        if not matches_fuel:
            continue

        effective_time = entry.get('effective_time', '00:00') or '00:00'
        entry_date = entry.get('effective_date', '')
        try:
            change_dt = datetime.strptime(f"{entry_date} {effective_time}", "%Y-%m-%d %H:%M")
        except (ValueError, TypeError):
            continue

        # Change must fall strictly inside the shift window (not at the boundary)
        if shift_start < change_dt < shift_end:
            result["has_price_change"] = True
            result["old_price"]       = entry.get('old_price_per_liter')
            result["new_price"]       = entry.get('new_price_per_liter')
            result["price"]           = entry.get('new_price_per_liter', current_price)
            result["effective_date"]  = entry_date
            result["effective_time"]  = effective_time
            result["shift_start"]     = shift_start
            result["shift_end"]       = shift_end
            result["change_dt"]       = change_dt
            break

    return result


def resolve_vat_rate(storage: dict = None) -> float:
    """Resolve VAT rate from runtime settings, falling back to config constant."""
    if storage:
        tls = storage.get('tax_levy_settings')
        if tls and tls.get('vat_rate') is not None:
            return float(tls['vat_rate'])
    return VAT_RATE


def resolve_fuel_levy(storage: dict = None) -> float:
    """Resolve fuel levy per liter from runtime settings, falling back to config constant."""
    if storage:
        tls = storage.get('tax_levy_settings')
        if tls and tls.get('fuel_levy_per_liter') is not None:
            return float(tls['fuel_levy_per_liter'])
    return FUEL_LEVY_PER_LITER


def resolve_stock_thresholds(storage: dict = None) -> dict:
    """Resolve stock alert thresholds from runtime settings, falling back to config constants."""
    if storage:
        sas = storage.get('stock_alert_settings')
        if sas:
            return {
                'low_stock_threshold_percent': float(sas.get('low_stock_threshold_percent', LOW_STOCK_THRESHOLD_PERCENT)),
                'critical_stock_threshold_percent': float(sas.get('critical_stock_threshold_percent', CRITICAL_STOCK_THRESHOLD_PERCENT)),
            }
    return {
        'low_stock_threshold_percent': LOW_STOCK_THRESHOLD_PERCENT,
        'critical_stock_threshold_percent': CRITICAL_STOCK_THRESHOLD_PERCENT,
    }
