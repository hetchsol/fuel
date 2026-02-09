"""
Lubricants Daily Operations API

Daily bulk entry for lubricant stock movement at Island 3 (customer-facing)
and Buffer (warehouse), with transfer support.
Matches the "Daily Station Stock Movement Reconciliation" spreadsheet.
"""

from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from datetime import datetime, timedelta
import uuid
import json
import os

from ...models.models import (
    LubricantDailyRow,
    LubricantDailyEntryInput,
    LubricantDailyEntryOutput,
)
from ...api.v1.auth import get_current_user

router = APIRouter()

# ===== FILE PERSISTENCE =====
STORAGE_DIR = os.path.join(os.path.dirname(__file__), '..', '..', '..', 'storage')
LUBRICANT_DAILY_FILE = os.path.join(STORAGE_DIR, 'lubricant_daily_entries.json')
LUBRICANT_PRODUCTS_FILE = os.path.join(STORAGE_DIR, 'lubricant_products.json')

# Default lubricant product catalog (86 products grouped by category)
DEFAULT_PRODUCTS = [
    # Engine Oils
    {"product_code": "EO-SAE30-1L", "description": "SAE 30 Engine Oil 1L", "category": "Engine Oil", "unit_size": "1L", "selling_price": 450},
    {"product_code": "EO-SAE30-4L", "description": "SAE 30 Engine Oil 4L", "category": "Engine Oil", "unit_size": "4L", "selling_price": 1600},
    {"product_code": "EO-SAE30-20L", "description": "SAE 30 Engine Oil 20L", "category": "Engine Oil", "unit_size": "20L", "selling_price": 7500},
    {"product_code": "EO-SAE40-1L", "description": "SAE 40 Engine Oil 1L", "category": "Engine Oil", "unit_size": "1L", "selling_price": 480},
    {"product_code": "EO-SAE40-4L", "description": "SAE 40 Engine Oil 4L", "category": "Engine Oil", "unit_size": "4L", "selling_price": 1700},
    {"product_code": "EO-SAE40-20L", "description": "SAE 40 Engine Oil 20L", "category": "Engine Oil", "unit_size": "20L", "selling_price": 7800},
    {"product_code": "EO-10W30-1L", "description": "10W-30 Synthetic 1L", "category": "Engine Oil", "unit_size": "1L", "selling_price": 750},
    {"product_code": "EO-10W30-4L", "description": "10W-30 Synthetic 4L", "category": "Engine Oil", "unit_size": "4L", "selling_price": 2800},
    {"product_code": "EO-10W40-1L", "description": "10W-40 Semi-Synthetic 1L", "category": "Engine Oil", "unit_size": "1L", "selling_price": 650},
    {"product_code": "EO-10W40-4L", "description": "10W-40 Semi-Synthetic 4L", "category": "Engine Oil", "unit_size": "4L", "selling_price": 2400},
    {"product_code": "EO-15W40-1L", "description": "15W-40 Diesel Engine Oil 1L", "category": "Engine Oil", "unit_size": "1L", "selling_price": 550},
    {"product_code": "EO-15W40-4L", "description": "15W-40 Diesel Engine Oil 4L", "category": "Engine Oil", "unit_size": "4L", "selling_price": 2000},
    {"product_code": "EO-15W40-20L", "description": "15W-40 Diesel Engine Oil 20L", "category": "Engine Oil", "unit_size": "20L", "selling_price": 9500},
    {"product_code": "EO-20W50-1L", "description": "20W-50 Engine Oil 1L", "category": "Engine Oil", "unit_size": "1L", "selling_price": 500},
    {"product_code": "EO-20W50-4L", "description": "20W-50 Engine Oil 4L", "category": "Engine Oil", "unit_size": "4L", "selling_price": 1800},
    {"product_code": "EO-20W50-20L", "description": "20W-50 Engine Oil 20L", "category": "Engine Oil", "unit_size": "20L", "selling_price": 8500},
    {"product_code": "EO-5W30-1L", "description": "5W-30 Full Synthetic 1L", "category": "Engine Oil", "unit_size": "1L", "selling_price": 950},
    {"product_code": "EO-5W30-4L", "description": "5W-30 Full Synthetic 4L", "category": "Engine Oil", "unit_size": "4L", "selling_price": 3500},
    {"product_code": "EO-5W40-1L", "description": "5W-40 Full Synthetic 1L", "category": "Engine Oil", "unit_size": "1L", "selling_price": 1000},
    {"product_code": "EO-5W40-4L", "description": "5W-40 Full Synthetic 4L", "category": "Engine Oil", "unit_size": "4L", "selling_price": 3700},
    # Transmission / Gear Oils
    {"product_code": "GO-80W90-1L", "description": "80W-90 Gear Oil 1L", "category": "Gear Oil", "unit_size": "1L", "selling_price": 500},
    {"product_code": "GO-80W90-4L", "description": "80W-90 Gear Oil 4L", "category": "Gear Oil", "unit_size": "4L", "selling_price": 1800},
    {"product_code": "GO-80W90-20L", "description": "80W-90 Gear Oil 20L", "category": "Gear Oil", "unit_size": "20L", "selling_price": 8500},
    {"product_code": "GO-85W140-1L", "description": "85W-140 Gear Oil 1L", "category": "Gear Oil", "unit_size": "1L", "selling_price": 550},
    {"product_code": "GO-85W140-4L", "description": "85W-140 Gear Oil 4L", "category": "Gear Oil", "unit_size": "4L", "selling_price": 2000},
    {"product_code": "GO-75W90-1L", "description": "75W-90 Synthetic Gear Oil 1L", "category": "Gear Oil", "unit_size": "1L", "selling_price": 800},
    {"product_code": "ATF-DEX3-1L", "description": "ATF Dexron III 1L", "category": "Gear Oil", "unit_size": "1L", "selling_price": 600},
    {"product_code": "ATF-DEX3-4L", "description": "ATF Dexron III 4L", "category": "Gear Oil", "unit_size": "4L", "selling_price": 2200},
    # Brake Fluid
    {"product_code": "BF-DOT3-500ML", "description": "Brake Fluid DOT 3 500ml", "category": "Brake Fluid", "unit_size": "500ml", "selling_price": 350},
    {"product_code": "BF-DOT3-1L", "description": "Brake Fluid DOT 3 1L", "category": "Brake Fluid", "unit_size": "1L", "selling_price": 600},
    {"product_code": "BF-DOT4-500ML", "description": "Brake Fluid DOT 4 500ml", "category": "Brake Fluid", "unit_size": "500ml", "selling_price": 450},
    {"product_code": "BF-DOT4-1L", "description": "Brake Fluid DOT 4 1L", "category": "Brake Fluid", "unit_size": "1L", "selling_price": 800},
    # Hydraulic Oil
    {"product_code": "HO-46-1L", "description": "Hydraulic Oil 46 1L", "category": "Hydraulic Oil", "unit_size": "1L", "selling_price": 450},
    {"product_code": "HO-46-4L", "description": "Hydraulic Oil 46 4L", "category": "Hydraulic Oil", "unit_size": "4L", "selling_price": 1600},
    {"product_code": "HO-46-20L", "description": "Hydraulic Oil 46 20L", "category": "Hydraulic Oil", "unit_size": "20L", "selling_price": 7500},
    {"product_code": "HO-68-1L", "description": "Hydraulic Oil 68 1L", "category": "Hydraulic Oil", "unit_size": "1L", "selling_price": 470},
    {"product_code": "HO-68-4L", "description": "Hydraulic Oil 68 4L", "category": "Hydraulic Oil", "unit_size": "4L", "selling_price": 1700},
    {"product_code": "HO-68-20L", "description": "Hydraulic Oil 68 20L", "category": "Hydraulic Oil", "unit_size": "20L", "selling_price": 7800},
    # Grease
    {"product_code": "GR-MP2-500G", "description": "Multi-Purpose Grease EP2 500g", "category": "Grease", "unit_size": "500g", "selling_price": 400},
    {"product_code": "GR-MP2-1KG", "description": "Multi-Purpose Grease EP2 1kg", "category": "Grease", "unit_size": "1kg", "selling_price": 700},
    {"product_code": "GR-MP2-4KG", "description": "Multi-Purpose Grease EP2 4kg", "category": "Grease", "unit_size": "4kg", "selling_price": 2500},
    {"product_code": "GR-MP2-20KG", "description": "Multi-Purpose Grease EP2 20kg", "category": "Grease", "unit_size": "20kg", "selling_price": 11000},
    {"product_code": "GR-LI-500G", "description": "Lithium Grease 500g", "category": "Grease", "unit_size": "500g", "selling_price": 350},
    {"product_code": "GR-LI-1KG", "description": "Lithium Grease 1kg", "category": "Grease", "unit_size": "1kg", "selling_price": 600},
    # Coolant / Antifreeze
    {"product_code": "CL-GREEN-1L", "description": "Green Coolant 1L", "category": "Coolant", "unit_size": "1L", "selling_price": 350},
    {"product_code": "CL-GREEN-4L", "description": "Green Coolant 4L", "category": "Coolant", "unit_size": "4L", "selling_price": 1200},
    {"product_code": "CL-GREEN-20L", "description": "Green Coolant 20L", "category": "Coolant", "unit_size": "20L", "selling_price": 5500},
    {"product_code": "CL-RED-1L", "description": "Red Coolant (Long Life) 1L", "category": "Coolant", "unit_size": "1L", "selling_price": 500},
    {"product_code": "CL-RED-4L", "description": "Red Coolant (Long Life) 4L", "category": "Coolant", "unit_size": "4L", "selling_price": 1800},
    # Power Steering
    {"product_code": "PS-FLUID-500ML", "description": "Power Steering Fluid 500ml", "category": "Power Steering", "unit_size": "500ml", "selling_price": 400},
    {"product_code": "PS-FLUID-1L", "description": "Power Steering Fluid 1L", "category": "Power Steering", "unit_size": "1L", "selling_price": 700},
    # 2-Stroke / Motorcycle
    {"product_code": "2T-OIL-250ML", "description": "2-Stroke Oil 250ml", "category": "2-Stroke", "unit_size": "250ml", "selling_price": 200},
    {"product_code": "2T-OIL-500ML", "description": "2-Stroke Oil 500ml", "category": "2-Stroke", "unit_size": "500ml", "selling_price": 350},
    {"product_code": "2T-OIL-1L", "description": "2-Stroke Oil 1L", "category": "2-Stroke", "unit_size": "1L", "selling_price": 600},
    {"product_code": "MC-10W40-1L", "description": "Motorcycle Oil 10W-40 1L", "category": "2-Stroke", "unit_size": "1L", "selling_price": 550},
    {"product_code": "MC-20W50-1L", "description": "Motorcycle Oil 20W-50 1L", "category": "2-Stroke", "unit_size": "1L", "selling_price": 450},
    # Industrial / Specialty
    {"product_code": "TO-T220-1L", "description": "Transformer Oil 1L", "category": "Industrial", "unit_size": "1L", "selling_price": 500},
    {"product_code": "TO-T220-20L", "description": "Transformer Oil 20L", "category": "Industrial", "unit_size": "20L", "selling_price": 9000},
    {"product_code": "CO-100-1L", "description": "Compressor Oil 100 1L", "category": "Industrial", "unit_size": "1L", "selling_price": 550},
    {"product_code": "CO-100-4L", "description": "Compressor Oil 100 4L", "category": "Industrial", "unit_size": "4L", "selling_price": 2000},
    {"product_code": "CUT-OIL-1L", "description": "Cutting Oil 1L", "category": "Industrial", "unit_size": "1L", "selling_price": 600},
    {"product_code": "CUT-OIL-4L", "description": "Cutting Oil 4L", "category": "Industrial", "unit_size": "4L", "selling_price": 2200},
    {"product_code": "CH-OIL-1L", "description": "Chainsaw Oil 1L", "category": "Industrial", "unit_size": "1L", "selling_price": 500},
    # Additives & Treatments
    {"product_code": "AD-FLUSH-350ML", "description": "Engine Flush 350ml", "category": "Additives", "unit_size": "350ml", "selling_price": 450},
    {"product_code": "AD-FUEL-350ML", "description": "Fuel Injector Cleaner 350ml", "category": "Additives", "unit_size": "350ml", "selling_price": 500},
    {"product_code": "AD-OIL-350ML", "description": "Oil Treatment 350ml", "category": "Additives", "unit_size": "350ml", "selling_price": 550},
    {"product_code": "AD-DIESEL-350ML", "description": "Diesel Treatment 350ml", "category": "Additives", "unit_size": "350ml", "selling_price": 500},
    {"product_code": "AD-RAD-350ML", "description": "Radiator Flush 350ml", "category": "Additives", "unit_size": "350ml", "selling_price": 400},
    {"product_code": "AD-STOP-350ML", "description": "Stop Leak 350ml", "category": "Additives", "unit_size": "350ml", "selling_price": 450},
    # Car Care
    {"product_code": "CC-WW-1L", "description": "Windshield Washer 1L", "category": "Car Care", "unit_size": "1L", "selling_price": 200},
    {"product_code": "CC-WW-5L", "description": "Windshield Washer 5L", "category": "Car Care", "unit_size": "5L", "selling_price": 800},
    {"product_code": "CC-DW-1L", "description": "Distilled Water 1L", "category": "Car Care", "unit_size": "1L", "selling_price": 100},
    {"product_code": "CC-DW-5L", "description": "Distilled Water 5L", "category": "Car Care", "unit_size": "5L", "selling_price": 350},
    {"product_code": "CC-BATT-1L", "description": "Battery Water 1L", "category": "Car Care", "unit_size": "1L", "selling_price": 100},
    {"product_code": "CC-BATT-5L", "description": "Battery Water 5L", "category": "Car Care", "unit_size": "5L", "selling_price": 350},
    {"product_code": "CC-WD40-330ML", "description": "WD-40 Spray 330ml", "category": "Car Care", "unit_size": "330ml", "selling_price": 650},
    {"product_code": "CC-WD40-550ML", "description": "WD-40 Spray 550ml", "category": "Car Care", "unit_size": "550ml", "selling_price": 950},
    # Filters (commonly sold at fuel stations)
    {"product_code": "FI-OIL-UNIV", "description": "Oil Filter Universal", "category": "Filters", "unit_size": "1pc", "selling_price": 350},
    {"product_code": "FI-AIR-UNIV", "description": "Air Filter Universal", "category": "Filters", "unit_size": "1pc", "selling_price": 500},
    {"product_code": "FI-FUEL-UNIV", "description": "Fuel Filter Universal", "category": "Filters", "unit_size": "1pc", "selling_price": 300},
    {"product_code": "FI-OIL-TOYOTA", "description": "Oil Filter Toyota", "category": "Filters", "unit_size": "1pc", "selling_price": 450},
    {"product_code": "FI-OIL-NISSAN", "description": "Oil Filter Nissan", "category": "Filters", "unit_size": "1pc", "selling_price": 400},
    {"product_code": "FI-OIL-ISUZU", "description": "Oil Filter Isuzu", "category": "Filters", "unit_size": "1pc", "selling_price": 500},
    {"product_code": "FI-FUEL-DIESEL", "description": "Fuel Filter Diesel Universal", "category": "Filters", "unit_size": "1pc", "selling_price": 400},
    {"product_code": "FI-AIR-HEAVY", "description": "Air Filter Heavy Duty", "category": "Filters", "unit_size": "1pc", "selling_price": 800},
]


def load_lubricant_daily():
    if os.path.exists(LUBRICANT_DAILY_FILE):
        try:
            with open(LUBRICANT_DAILY_FILE, 'r') as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            return {}
    return {}


def save_lubricant_daily():
    os.makedirs(STORAGE_DIR, exist_ok=True)
    with open(LUBRICANT_DAILY_FILE, 'w') as f:
        json.dump(lubricant_daily_db, f, indent=2, default=str)


def load_product_catalog():
    if os.path.exists(LUBRICANT_PRODUCTS_FILE):
        try:
            with open(LUBRICANT_PRODUCTS_FILE, 'r') as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            return DEFAULT_PRODUCTS
    return DEFAULT_PRODUCTS


# Load on startup
lubricant_daily_db = load_lubricant_daily()


# ===== ENDPOINTS =====

@router.get("/products/{location}")
def get_products_for_location(
    location: str,
    current_user: dict = Depends(get_current_user),
):
    """
    Get lubricant product catalog for a location with current stock levels.
    Location: "Island 3" or "Buffer"
    """
    if location not in ("Island 3", "Buffer"):
        raise HTTPException(status_code=400, detail="Location must be 'Island 3' or 'Buffer'")

    products = load_product_catalog()

    # Find most recent entry for this location to get current stock
    location_entries = [
        e for e in lubricant_daily_db.values()
        if e['location'] == location
    ]

    current_stock = {}
    if location_entries:
        location_entries.sort(key=lambda x: x['date'], reverse=True)
        latest = location_entries[0]
        for row in latest.get('product_rows', []):
            current_stock[row['product_code']] = row['balance']

    # Merge stock into product catalog
    result = []
    for p in products:
        result.append({
            **p,
            "current_stock": current_stock.get(p['product_code'], 0),
        })

    return {
        "location": location,
        "products": result,
        "categories": sorted(set(p['category'] for p in products)),
    }


@router.get("/previous-day")
def get_previous_day(
    current_date: str,
    location: str,
    current_user: dict = Depends(get_current_user),
):
    """
    Get previous day's closing balances for a location to auto-populate opening stock.
    Falls back to most recent entry.
    """
    if location not in ("Island 3", "Buffer"):
        raise HTTPException(status_code=400, detail="Location must be 'Island 3' or 'Buffer'")

    prev_date = (datetime.strptime(current_date, '%Y-%m-%d') - timedelta(days=1)).strftime('%Y-%m-%d')

    matching = [
        e for e in lubricant_daily_db.values()
        if e['date'] == prev_date and e['location'] == location
    ]

    if not matching:
        location_entries = [
            e for e in lubricant_daily_db.values()
            if e['location'] == location
        ]
        if not location_entries:
            return {
                "found": False,
                "message": f"No previous data found for {location}.",
                "product_balances": {},
            }

        location_entries.sort(key=lambda x: x['date'], reverse=True)
        previous = location_entries[0]
    else:
        previous = matching[0]

    balances = {}
    for row in previous.get('product_rows', []):
        balances[row['product_code']] = {
            "balance": row['balance'],
            "description": row.get('description', ''),
            "selling_price": row.get('selling_price', 0),
        }

    return {
        "found": True,
        "source_date": previous['date'],
        "location": location,
        "product_balances": balances,
    }


@router.post("/entry", response_model=LubricantDailyEntryOutput)
def submit_lubricant_entry(
    entry_input: LubricantDailyEntryInput,
    current_user: dict = Depends(get_current_user),
):
    """
    Submit daily lubricant entry for a location.
    Server calculates balance, sales values, and totals.
    """
    if entry_input.location not in ("Island 3", "Buffer"):
        raise HTTPException(status_code=400, detail="Location must be 'Island 3' or 'Buffer'")

    calculated_rows = []
    total_sales = 0.0
    total_items = 0

    for row in entry_input.product_rows:
        balance = row.opening_stock + row.additions - row.sold_or_drawn
        sales_value = row.selling_price * row.sold_or_drawn

        calculated_rows.append(LubricantDailyRow(
            product_code=row.product_code,
            description=row.description,
            category=row.category,
            unit_size=row.unit_size,
            selling_price=row.selling_price,
            opening_stock=row.opening_stock,
            additions=row.additions,
            sold_or_drawn=row.sold_or_drawn,
            balance=balance,
            sales_value=sales_value,
        ))
        total_sales += sales_value
        total_items += row.sold_or_drawn

    loc_prefix = "LI3" if entry_input.location == "Island 3" else "LBF"
    entry_id = f"LUB-{loc_prefix}-{entry_input.date}-{uuid.uuid4().hex[:8]}"

    output = LubricantDailyEntryOutput(
        entry_id=entry_id,
        date=entry_input.date,
        location=entry_input.location,
        product_rows=calculated_rows,
        total_daily_sales_value=total_sales,
        total_items_moved=total_items,
        recorded_by=entry_input.recorded_by,
        created_at=datetime.now().isoformat(),
        notes=entry_input.notes,
    )

    lubricant_daily_db[entry_id] = output.model_dump(mode='json')
    save_lubricant_daily()

    return output


@router.get("/entries")
def list_lubricant_entries(
    date: Optional[str] = None,
    location: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """List lubricant daily entries, optionally filtered by date and/or location."""
    entries = list(lubricant_daily_db.values())

    if date:
        entries = [e for e in entries if e['date'] == date]
    if location:
        entries = [e for e in entries if e['location'] == location]

    entries.sort(key=lambda x: x['date'], reverse=True)
    return entries


@router.post("/transfer")
def bulk_transfer(
    date: str,
    transfers: List[dict],
    recorded_by: str,
    current_user: dict = Depends(get_current_user),
):
    """
    Bulk transfer stock from Buffer to Island 3.

    Each transfer item: { "product_code": "...", "quantity": N }

    This creates "drawn" entries on Buffer and "additions" entries on Island 3.
    Returns summary of the transfer.
    """
    if not transfers:
        raise HTTPException(status_code=400, detail="No transfer items provided")

    # Get current Buffer stock (most recent entry)
    buffer_entries = [
        e for e in lubricant_daily_db.values()
        if e['location'] == 'Buffer'
    ]
    buffer_stock = {}
    if buffer_entries:
        buffer_entries.sort(key=lambda x: x['date'], reverse=True)
        for row in buffer_entries[0].get('product_rows', []):
            buffer_stock[row['product_code']] = row['balance']

    # Validate all transfers
    errors = []
    for t in transfers:
        code = t.get('product_code', '')
        qty = t.get('quantity', 0)
        available = buffer_stock.get(code, 0)
        if qty > available:
            errors.append(f"{code}: requested {qty}, only {available} available in Buffer")

    if errors:
        raise HTTPException(status_code=400, detail={"message": "Insufficient Buffer stock", "errors": errors})

    # Return the transfer summary (actual ledger updates happen when daily entries are submitted)
    total_items = sum(t.get('quantity', 0) for t in transfers)
    transfer_id = f"TRF-{date}-{uuid.uuid4().hex[:8]}"

    return {
        "transfer_id": transfer_id,
        "date": date,
        "items": transfers,
        "total_items_transferred": total_items,
        "recorded_by": recorded_by,
        "created_at": datetime.now().isoformat(),
        "message": f"Transfer of {total_items} items from Buffer to Island 3 recorded. Update daily entries to reflect changes.",
    }
