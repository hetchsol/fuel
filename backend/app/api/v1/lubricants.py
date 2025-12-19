"""
Lubricants Inventory and Sales API
Handles lubricants across Island 3 and Buffer locations
"""
from fastapi import APIRouter, HTTPException
from typing import List
from ...models.models import Lubricant, LubricantSale
from ...services.validated_crud import ValidatedCRUDService
from ...services.crud import increment_stock, decrement_stock
from ...services.inventory import process_stock_sale, get_sales_summary
from ...database.storage import STORAGE

router = APIRouter()

# Use central storage
lubricants_inventory = STORAGE['lubricants']
lubricants_sales_data = STORAGE['lubricant_sales']

# Initialize CRUD service for lubricants with validation
lubricants_service = ValidatedCRUDService(
    storage=lubricants_inventory,
    model=Lubricant,
    id_field='product_code',
    name='lubricant',
    entity_type='lubricants'  # Enable relationship validation
)

# Initialize with sample lubricants
STORAGE['lubricants'] = {
    "OIL-10W30": {
        "product_code": "OIL-10W30",
        "description": "Engine Oil 10W-30 (1L)",
        "category": "Engine Oil",
        "unit_price": 85.0,
        "location": "Island 3",
        "opening_stock": 50,
        "current_stock": 50
    },
    "OIL-15W40": {
        "product_code": "OIL-15W40",
        "description": "Engine Oil 15W-40 (1L)",
        "category": "Engine Oil",
        "unit_price": 90.0,
        "location": "Island 3",
        "opening_stock": 45,
        "current_stock": 45
    },
    "OIL-20W50": {
        "product_code": "OIL-20W50",
        "description": "Engine Oil 20W-50 (1L)",
        "category": "Engine Oil",
        "unit_price": 95.0,
        "location": "Island 3",
        "opening_stock": 40,
        "current_stock": 40
    },
    "TF-ATF": {
        "product_code": "TF-ATF",
        "description": "Automatic Transmission Fluid",
        "category": "Transmission Fluid",
        "unit_price": 120.0,
        "location": "Island 3",
        "opening_stock": 30,
        "current_stock": 30
    },
    "BF-DOT3": {
        "product_code": "BF-DOT3",
        "description": "Brake Fluid DOT 3",
        "category": "Brake Fluid",
        "unit_price": 45.0,
        "location": "Island 3",
        "opening_stock": 25,
        "current_stock": 25
    },
    "COOL-GREEN": {
        "product_code": "COOL-GREEN",
        "description": "Coolant Green (1L)",
        "category": "Coolant",
        "unit_price": 55.0,
        "location": "Island 3",
        "opening_stock": 35,
        "current_stock": 35
    },
    "OIL-10W30-BUF": {
        "product_code": "OIL-10W30-BUF",
        "description": "Engine Oil 10W-30 (1L) - Buffer Stock",
        "category": "Engine Oil",
        "unit_price": 85.0,
        "location": "Buffer",
        "opening_stock": 100,
        "current_stock": 100
    },
    "OIL-15W40-BUF": {
        "product_code": "OIL-15W40-BUF",
        "description": "Engine Oil 15W-40 (1L) - Buffer Stock",
        "category": "Engine Oil",
        "unit_price": 90.0,
        "location": "Buffer",
        "opening_stock": 100,
        "current_stock": 100
    }
}

@router.get("/", response_model=List[Lubricant])
def get_all_lubricants():
    """
    Get all lubricants from all locations
    """
    return lubricants_service.get_all()

@router.get("/location/{location}")
def get_lubricants_by_location(location: str):
    """
    Get lubricants from specific location (Island 3 or Buffer)
    """
    return lubricants_service.filter(location=location)

@router.get("/{product_code}", response_model=Lubricant)
def get_lubricant(product_code: str):
    """
    Get specific lubricant details
    """
    return lubricants_service.get_by_id(product_code)

@router.post("/sales", response_model=LubricantSale)
def record_lubricant_sale(sale: LubricantSale):
    """
    Record lubricant sale
    Updates inventory at Island 3
    """
    process_stock_sale(
        inventory=lubricants_inventory,
        sales_log=lubricants_sales_data,
        item_id=sale.product_code,
        quantity=sale.quantity,
        sale_data=sale.dict(),
        item_name='lubricant'
    )

    return sale

@router.get("/sales/shift/{shift_id}")
def get_shift_lubricant_sales(shift_id: str):
    """
    Get all lubricant sales for a specific shift
    """
    return get_sales_summary(
        sales_log=lubricants_sales_data,
        shift_id=shift_id,
        model_class=LubricantSale
    )

@router.post("/transfer")
def transfer_from_buffer(product_code: str, quantity: int):
    """
    Transfer stock from Buffer to Island 3
    """
    # Find buffer product
    buffer_code = f"{product_code}-BUF" if not product_code.endswith("-BUF") else product_code
    island_code = product_code.replace("-BUF", "") if product_code.endswith("-BUF") else product_code

    if buffer_code not in lubricants_inventory:
        raise HTTPException(status_code=404, detail="Buffer product not found")

    if island_code not in lubricants_inventory:
        raise HTTPException(status_code=404, detail="Island product not found")

    buffer_item = lubricants_inventory[buffer_code]
    island_item = lubricants_inventory[island_code]

    if buffer_item["current_stock"] < quantity:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient buffer stock. Available: {buffer_item['current_stock']}, Requested: {quantity}"
        )

    # Transfer stock
    buffer_item["current_stock"] -= quantity
    island_item["current_stock"] += quantity

    return {
        "status": "success",
        "product": island_item["description"],
        "quantity_transferred": quantity,
        "buffer_remaining": buffer_item["current_stock"],
        "island_new_stock": island_item["current_stock"]
    }

@router.post("/{product_code}/restock")
def restock_lubricant(product_code: str, quantity: int):
    """
    Add stock to lubricant inventory (usually to Buffer)
    """
    result = increment_stock(
        storage=lubricants_inventory,
        item_id=product_code,
        quantity=quantity,
        item_name='lubricant'
    )
    # Rename field to match existing API response
    result['product_code'] = result.pop('lubricant_id')
    return result

@router.get("/inventory/summary")
def get_inventory_summary():
    """
    Get inventory summary by location and category
    """
    island3_items = [item for item in lubricants_inventory.values() if item["location"] == "Island 3"]
    buffer_items = [item for item in lubricants_inventory.values() if item["location"] == "Buffer"]

    island3_value = sum(item["current_stock"] * item["unit_price"] for item in island3_items)
    buffer_value = sum(item["current_stock"] * item["unit_price"] for item in buffer_items)

    categories = {}
    for item in lubricants_inventory.values():
        cat = item["category"]
        if cat not in categories:
            categories[cat] = {"count": 0, "total_stock": 0, "value": 0}
        categories[cat]["count"] += 1
        categories[cat]["total_stock"] += item["current_stock"]
        categories[cat]["value"] += item["current_stock"] * item["unit_price"]

    return {
        "island_3": {
            "items_count": len(island3_items),
            "total_units": sum(item["current_stock"] for item in island3_items),
            "total_value": island3_value
        },
        "buffer": {
            "items_count": len(buffer_items),
            "total_units": sum(item["current_stock"] for item in buffer_items),
            "total_value": buffer_value
        },
        "by_category": categories,
        "grand_total_value": island3_value + buffer_value
    }
