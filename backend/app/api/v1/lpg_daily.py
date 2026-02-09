"""
LPG Daily Operations API

Shift-level bulk entry for LPG cylinder sales and daily accessories tracking.
Matches the "Daily Station Stock Movement Reconciliation" spreadsheet.
"""

from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from datetime import datetime, timedelta
import uuid
import json
import os

from ...models.models import (
    LPGCylinderShiftRow,
    LPGDailyEntryInput,
    LPGDailyEntryOutput,
    LPGAccessoryDailyRow,
    LPGAccessoriesDailyInput,
    LPGAccessoriesDailyOutput,
)
from ...api.v1.auth import get_current_user

router = APIRouter()

# ===== LPG PRICING CONSTANTS =====
LPG_PRICE_PER_KG = 49
LPG_DEPOSITS = {3: 330, 6: 550, 9: 800, 19: 1200, 45: 1700, 48: 1700}
LPG_SIZES = [3, 6, 9, 19, 45, 48]

# Default LPG accessories
DEFAULT_LPG_ACCESSORIES = [
    {"product_code": "ACC-STOVE-1B", "description": "1-Burner Stove", "selling_price": 1500},
    {"product_code": "ACC-STOVE-2B", "description": "2-Burner Stove", "selling_price": 3500},
    {"product_code": "ACC-COOKTOP", "description": "Cooker Top", "selling_price": 5000},
    {"product_code": "ACC-HOSE", "description": "Gas Hose", "selling_price": 600},
    {"product_code": "ACC-REGULATOR", "description": "Gas Regulator", "selling_price": 1200},
    {"product_code": "ACC-CLIP", "description": "Hose Clip", "selling_price": 150},
]

# ===== FILE PERSISTENCE =====
STORAGE_DIR = os.path.join(os.path.dirname(__file__), '..', '..', '..', 'storage')
LPG_DAILY_FILE = os.path.join(STORAGE_DIR, 'lpg_daily_entries.json')
LPG_ACCESSORIES_FILE = os.path.join(STORAGE_DIR, 'lpg_accessories_daily.json')


def load_lpg_daily():
    if os.path.exists(LPG_DAILY_FILE):
        try:
            with open(LPG_DAILY_FILE, 'r') as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            return {}
    return {}


def save_lpg_daily():
    os.makedirs(STORAGE_DIR, exist_ok=True)
    with open(LPG_DAILY_FILE, 'w') as f:
        json.dump(lpg_daily_db, f, indent=2, default=str)


def load_lpg_accessories():
    if os.path.exists(LPG_ACCESSORIES_FILE):
        try:
            with open(LPG_ACCESSORIES_FILE, 'r') as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            return {}
    return {}


def save_lpg_accessories():
    os.makedirs(STORAGE_DIR, exist_ok=True)
    with open(LPG_ACCESSORIES_FILE, 'w') as f:
        json.dump(lpg_accessories_db, f, indent=2, default=str)


# Load on startup
lpg_daily_db = load_lpg_daily()
lpg_accessories_db = load_lpg_accessories()


def get_pricing_for_size(size_kg: int) -> dict:
    """Calculate pricing for a given cylinder size."""
    refill = LPG_PRICE_PER_KG * size_kg
    deposit = LPG_DEPOSITS.get(size_kg, 0)
    return {
        "size_kg": size_kg,
        "price_refill": refill,
        "deposit": deposit,
        "price_with_cylinder": refill + deposit,
    }


# ===== ENDPOINTS =====

@router.get("/pricing")
def get_lpg_pricing(current_user: dict = Depends(get_current_user)):
    """Return pricing table for all 6 LPG cylinder sizes."""
    return {
        "price_per_kg": LPG_PRICE_PER_KG,
        "sizes": [get_pricing_for_size(s) for s in LPG_SIZES],
    }


@router.get("/previous-shift")
def get_previous_shift(
    current_date: str,
    shift_type: str,
    current_user: dict = Depends(get_current_user),
):
    """
    Get previous shift's closing balances to auto-populate opening balances.

    Logic:
    - Night shift → look for Day shift of same date
    - Day shift → look for Night shift of previous date
    - Fallback: most recent entry
    """
    if shift_type.lower() == 'night':
        target_date = current_date
        target_shift = 'Day'
    else:
        prev_date = datetime.strptime(current_date, '%Y-%m-%d') - timedelta(days=1)
        target_date = prev_date.strftime('%Y-%m-%d')
        target_shift = 'Night'

    # Find exact match
    matching = [
        e for e in lpg_daily_db.values()
        if e['date'] == target_date
        and e['shift_type'].lower() == target_shift.lower()
    ]

    if not matching:
        # Fallback to most recent entry
        all_entries = list(lpg_daily_db.values())
        if not all_entries:
            return {
                "found": False,
                "message": "No previous shift data found. Enter opening balances manually.",
                "cylinder_balances": {s: 0 for s in LPG_SIZES},
            }

        def sort_key(e):
            shift_order = 1 if e.get('shift_type', '').lower() == 'night' else 0
            return (e['date'], shift_order)

        all_entries.sort(key=sort_key, reverse=True)
        previous = all_entries[0]
    else:
        previous = matching[0]

    # Extract closing balances per size
    balances = {}
    for row in previous.get('cylinder_rows', []):
        balances[row['size_kg']] = row['balance']

    return {
        "found": True,
        "source_date": previous['date'],
        "source_shift": previous['shift_type'],
        "source_entry_id": previous.get('entry_id', ''),
        "cylinder_balances": balances,
    }


@router.post("/entry", response_model=LPGDailyEntryOutput)
def submit_lpg_entry(
    entry_input: LPGDailyEntryInput,
    current_user: dict = Depends(get_current_user),
):
    """
    Submit a full LPG shift entry (6 cylinder rows).
    Server calculates balance, values, and totals.
    """
    # Validate cylinder rows cover all sizes
    submitted_sizes = {row.size_kg for row in entry_input.cylinder_rows}
    expected_sizes = set(LPG_SIZES)
    if submitted_sizes != expected_sizes:
        missing = expected_sizes - submitted_sizes
        raise HTTPException(
            status_code=400,
            detail=f"Missing cylinder sizes: {sorted(missing)}. All 6 sizes required.",
        )

    # Calculate values for each row
    calculated_rows = []
    grand_total = 0.0

    for row in entry_input.cylinder_rows:
        pricing = get_pricing_for_size(row.size_kg)

        balance = row.opening_balance + row.receipts - row.sold_refill - row.sold_with_cylinder
        value_refill = pricing['price_refill'] * row.sold_refill
        value_with_cyl = pricing['price_with_cylinder'] * row.sold_with_cylinder
        total_value = value_refill + value_with_cyl

        calculated_rows.append(LPGCylinderShiftRow(
            size_kg=row.size_kg,
            opening_balance=row.opening_balance,
            receipts=row.receipts,
            sold_refill=row.sold_refill,
            sold_with_cylinder=row.sold_with_cylinder,
            balance=balance,
            value_refill=value_refill,
            value_with_cylinder=value_with_cyl,
            total_value=total_value,
        ))
        grand_total += total_value

    # Calculate population difference
    pop_diff = None
    if entry_input.book_cylinder_population is not None and entry_input.actual_cylinder_population is not None:
        pop_diff = entry_input.book_cylinder_population - entry_input.actual_cylinder_population

    entry_id = f"LPG-{entry_input.date}-{entry_input.shift_type[0]}-{uuid.uuid4().hex[:8]}"

    output = LPGDailyEntryOutput(
        entry_id=entry_id,
        date=entry_input.date,
        shift_type=entry_input.shift_type,
        salesperson=entry_input.salesperson,
        cylinder_rows=calculated_rows,
        grand_total_value=grand_total,
        book_cylinder_population=entry_input.book_cylinder_population,
        actual_cylinder_population=entry_input.actual_cylinder_population,
        population_difference=pop_diff,
        recorded_by=entry_input.recorded_by,
        created_at=datetime.now().isoformat(),
        notes=entry_input.notes,
    )

    lpg_daily_db[entry_id] = output.model_dump(mode='json')
    save_lpg_daily()

    return output


@router.get("/entries")
def list_lpg_entries(
    date: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """List LPG daily entries, optionally filtered by date."""
    entries = list(lpg_daily_db.values())

    if date:
        entries = [e for e in entries if e['date'] == date]

    entries.sort(key=lambda x: (x['date'], x.get('shift_type', '')), reverse=True)
    return entries


# ===== LPG ACCESSORIES =====

@router.get("/accessories/previous-day")
def get_accessories_previous_day(
    current_date: str,
    current_user: dict = Depends(get_current_user),
):
    """
    Get previous day's closing accessory balances to auto-populate opening stock.
    Falls back to most recent entry if exact previous day not found.
    """
    prev_date = (datetime.strptime(current_date, '%Y-%m-%d') - timedelta(days=1)).strftime('%Y-%m-%d')

    matching = [
        e for e in lpg_accessories_db.values()
        if e['date'] == prev_date
    ]

    if not matching:
        all_entries = list(lpg_accessories_db.values())
        if not all_entries:
            return {
                "found": False,
                "message": "No previous accessory data found.",
                "default_products": DEFAULT_LPG_ACCESSORIES,
                "product_balances": {},
            }

        all_entries.sort(key=lambda x: x['date'], reverse=True)
        previous = all_entries[0]
    else:
        previous = matching[0]

    balances = {}
    for row in previous.get('product_rows', []):
        balances[row['product_code']] = {
            "balance": row['balance'],
            "description": row['description'],
            "selling_price": row['selling_price'],
        }

    return {
        "found": True,
        "source_date": previous['date'],
        "product_balances": balances,
        "default_products": DEFAULT_LPG_ACCESSORIES,
    }


@router.post("/accessories/entry", response_model=LPGAccessoriesDailyOutput)
def submit_accessories_entry(
    entry_input: LPGAccessoriesDailyInput,
    current_user: dict = Depends(get_current_user),
):
    """Submit LPG accessories daily entry. Server calculates balance and sales values."""
    calculated_rows = []
    total_sales = 0.0

    for row in entry_input.product_rows:
        balance = row.opening_stock + row.additions - row.sold
        sales_value = row.selling_price * row.sold

        calculated_rows.append(LPGAccessoryDailyRow(
            product_code=row.product_code,
            description=row.description,
            selling_price=row.selling_price,
            opening_stock=row.opening_stock,
            additions=row.additions,
            sold=row.sold,
            balance=balance,
            sales_value=sales_value,
        ))
        total_sales += sales_value

    entry_id = f"LPGA-{entry_input.date}-{uuid.uuid4().hex[:8]}"

    output = LPGAccessoriesDailyOutput(
        entry_id=entry_id,
        date=entry_input.date,
        product_rows=calculated_rows,
        total_daily_sales_value=total_sales,
        recorded_by=entry_input.recorded_by,
        created_at=datetime.now().isoformat(),
        notes=entry_input.notes,
    )

    lpg_accessories_db[entry_id] = output.model_dump(mode='json')
    save_lpg_accessories()

    return output


@router.get("/accessories/entries")
def list_accessories_entries(
    date: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """List LPG accessories entries, optionally filtered by date."""
    entries = list(lpg_accessories_db.values())

    if date:
        entries = [e for e in entries if e['date'] == date]

    entries.sort(key=lambda x: x['date'], reverse=True)
    return entries
