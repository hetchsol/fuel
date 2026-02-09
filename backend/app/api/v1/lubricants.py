"""
Lubricants Inventory and Sales API
Handles lubricants across Island 3 and Buffer locations
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import List
from ...models.models import Lubricant, LubricantSale
from ...services.crud import increment_stock, decrement_stock
from ...services.inventory import process_stock_sale, get_sales_summary
from .auth import get_station_context

router = APIRouter()


@router.get("/", response_model=List[Lubricant])
async def get_all_lubricants(ctx: dict = Depends(get_station_context)):
    """
    Get all lubricants from all locations
    """
    storage = ctx["storage"]
    lubricants_inventory = storage['lubricants']
    return [Lubricant(**item) for item in lubricants_inventory.values()]


@router.get("/location/{location}")
async def get_lubricants_by_location(location: str, ctx: dict = Depends(get_station_context)):
    """
    Get lubricants from specific location (Island 3 or Buffer)
    """
    storage = ctx["storage"]
    lubricants_inventory = storage['lubricants']
    return [
        Lubricant(**item) for item in lubricants_inventory.values()
        if item.get("location") == location
    ]


@router.get("/{product_code}", response_model=Lubricant)
async def get_lubricant(product_code: str, ctx: dict = Depends(get_station_context)):
    """
    Get specific lubricant details
    """
    storage = ctx["storage"]
    lubricants_inventory = storage['lubricants']
    if product_code not in lubricants_inventory:
        raise HTTPException(status_code=404, detail="Lubricant not found")
    return Lubricant(**lubricants_inventory[product_code])


@router.post("/sales", response_model=LubricantSale)
async def record_lubricant_sale(sale: LubricantSale, ctx: dict = Depends(get_station_context)):
    """
    Record lubricant sale
    Updates inventory at Island 3
    """
    storage = ctx["storage"]
    lubricants_inventory = storage['lubricants']
    lubricants_sales_data = storage['lubricant_sales']

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
async def get_shift_lubricant_sales(shift_id: str, ctx: dict = Depends(get_station_context)):
    """
    Get all lubricant sales for a specific shift
    """
    storage = ctx["storage"]
    lubricants_sales_data = storage['lubricant_sales']

    return get_sales_summary(
        sales_log=lubricants_sales_data,
        shift_id=shift_id,
        model_class=LubricantSale
    )


@router.post("/transfer")
async def transfer_from_buffer(product_code: str, quantity: int, ctx: dict = Depends(get_station_context)):
    """
    Transfer stock from Buffer to Island 3
    """
    storage = ctx["storage"]
    lubricants_inventory = storage['lubricants']

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
async def restock_lubricant(product_code: str, quantity: int, ctx: dict = Depends(get_station_context)):
    """
    Add stock to lubricant inventory (usually to Buffer)
    """
    storage = ctx["storage"]
    lubricants_inventory = storage['lubricants']

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
async def get_inventory_summary(ctx: dict = Depends(get_station_context)):
    """
    Get inventory summary by location and category
    """
    storage = ctx["storage"]
    lubricants_inventory = storage['lubricants']

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
