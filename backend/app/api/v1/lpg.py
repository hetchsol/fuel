"""
LPG and Accessories API
Handles LPG sales and accessories inventory
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import List
from ...models.models import LPGSale, LPGAccessory, LPGAccessorySale
from ...services.crud import increment_stock, decrement_stock
from ...services.inventory import process_stock_sale, get_sales_summary
from ...services.relationship_validation import validate_create
from .auth import get_station_context

router = APIRouter()


@router.post("/sales", response_model=LPGSale)
async def record_lpg_sale(sale: LPGSale, ctx: dict = Depends(get_station_context)):
    """
    Record LPG gas sale (by weight)
    """
    storage = ctx["storage"]
    lpg_sales_data = storage['lpg_sales']

    # Validate foreign keys (shift_id)
    validate_create('lpg_sales', sale.dict())

    lpg_sales_data.append(sale.dict())
    return sale


@router.get("/sales/shift/{shift_id}")
async def get_shift_lpg_sales(shift_id: str, ctx: dict = Depends(get_station_context)):
    """
    Get all LPG sales for a specific shift
    """
    storage = ctx["storage"]
    lpg_sales_data = storage['lpg_sales']

    shift_sales = [
        LPGSale(**sale) for sale in lpg_sales_data
        if sale["shift_id"] == shift_id
    ]

    total_kg = sum(sale.quantity_kg for sale in shift_sales)
    total_revenue = sum(sale.total_amount for sale in shift_sales)

    return {
        "shift_id": shift_id,
        "sales": shift_sales,
        "total_kg": total_kg,
        "total_revenue": total_revenue
    }


@router.get("/accessories", response_model=List[LPGAccessory])
async def get_all_accessories(ctx: dict = Depends(get_station_context)):
    """
    Get all LPG accessories inventory
    """
    storage = ctx["storage"]
    accessories_inventory = storage['lpg_accessories']
    return [LPGAccessory(**item) for item in accessories_inventory.values()]


@router.get("/accessories/{product_code}", response_model=LPGAccessory)
async def get_accessory(product_code: str, ctx: dict = Depends(get_station_context)):
    """
    Get specific accessory details
    """
    storage = ctx["storage"]
    accessories_inventory = storage['lpg_accessories']
    if product_code not in accessories_inventory:
        raise HTTPException(status_code=404, detail="Accessory not found")
    return LPGAccessory(**accessories_inventory[product_code])


@router.post("/accessories/sales", response_model=LPGAccessorySale)
async def record_accessory_sale(sale: LPGAccessorySale, ctx: dict = Depends(get_station_context)):
    """
    Record LPG accessory sale
    Updates inventory
    """
    storage = ctx["storage"]
    accessories_inventory = storage['lpg_accessories']
    accessories_sales_data = storage['accessories_sales']

    process_stock_sale(
        inventory=accessories_inventory,
        sales_log=accessories_sales_data,
        item_id=sale.product_code,
        quantity=sale.quantity,
        sale_data=sale.dict(),
        item_name='accessory'
    )

    return sale


@router.get("/accessories/sales/shift/{shift_id}")
async def get_shift_accessory_sales(shift_id: str, ctx: dict = Depends(get_station_context)):
    """
    Get all accessory sales for a specific shift
    """
    storage = ctx["storage"]
    accessories_sales_data = storage['accessories_sales']

    return get_sales_summary(
        sales_log=accessories_sales_data,
        shift_id=shift_id,
        model_class=LPGAccessorySale
    )


@router.post("/accessories/{product_code}/restock")
async def restock_accessory(product_code: str, quantity: int, ctx: dict = Depends(get_station_context)):
    """
    Add stock to accessory inventory
    """
    storage = ctx["storage"]
    accessories_inventory = storage['lpg_accessories']

    result = increment_stock(
        storage=accessories_inventory,
        item_id=product_code,
        quantity=quantity,
        item_name='accessory'
    )
    # Rename field to match existing API response
    result['product_code'] = result.pop('accessory_id')
    return result


@router.get("/summary/shift/{shift_id}")
async def get_lpg_shift_summary(shift_id: str, ctx: dict = Depends(get_station_context)):
    """
    Get complete LPG summary for a shift (gas + accessories)
    """
    storage = ctx["storage"]
    lpg_sales_data = storage['lpg_sales']
    accessories_sales_data = storage['accessories_sales']

    # LPG gas sales
    gas_sales = [sale for sale in lpg_sales_data if sale["shift_id"] == shift_id]
    gas_revenue = sum(sale["total_amount"] for sale in gas_sales)

    # Accessory sales
    acc_sales = [sale for sale in accessories_sales_data if sale["shift_id"] == shift_id]
    acc_revenue = sum(sale["total_amount"] for sale in acc_sales)

    return {
        "shift_id": shift_id,
        "lpg_gas_sales_count": len(gas_sales),
        "lpg_gas_revenue": gas_revenue,
        "accessories_sales_count": len(acc_sales),
        "accessories_revenue": acc_revenue,
        "total_lpg_revenue": gas_revenue + acc_revenue
    }
