"""
LPG and Accessories API
Handles LPG sales and accessories inventory
"""
from fastapi import APIRouter, HTTPException
from typing import List
from ...models.models import LPGSale, LPGAccessory, LPGAccessorySale
from ...services.validated_crud import ValidatedCRUDService
from ...services.crud import increment_stock, decrement_stock
from ...services.inventory import process_stock_sale, get_sales_summary
from ...services.relationship_validation import validate_create
from ...database.storage import STORAGE

router = APIRouter()

# Use central storage
lpg_sales_data = STORAGE['lpg_sales']
accessories_inventory = STORAGE['lpg_accessories']
accessories_sales_data = []  # Not yet in central storage

# Initialize CRUD service for accessories with validation
accessories_service = ValidatedCRUDService(
    storage=accessories_inventory,
    model=LPGAccessory,
    id_field='product_code',
    name='accessory',
    entity_type='lpg_accessories'
)

# Initialize with sample accessories from spreadsheet
STORAGE['lpg_accessories'] = {
    "COK007": {
        "product_code": "COK007",
        "description": "2 Plate Stove with Swivel Regulator",
        "unit_price": 1373.0,
        "opening_stock": 6,
        "current_stock": 6
    },
    "COK008": {
        "product_code": "COK008",
        "description": "2 Plate Stove with Bullnose Regulator",
        "unit_price": 1437.0,
        "opening_stock": 7,
        "current_stock": 7
    },
    "COK002": {
        "product_code": "COK002",
        "description": "Cadac Cooker Top",
        "unit_price": 305.0,
        "opening_stock": 9,
        "current_stock": 9
    },
    "LPGH001": {
        "product_code": "LPGH001",
        "description": "LPG Hose",
        "unit_price": 56.0,
        "opening_stock": 51,
        "current_stock": 51
    }
}

@router.post("/sales", response_model=LPGSale)
def record_lpg_sale(sale: LPGSale):
    """
    Record LPG gas sale (by weight)
    """
    # Validate foreign keys (shift_id)
    validate_create('lpg_sales', sale.dict())

    lpg_sales_data.append(sale.dict())
    return sale

@router.get("/sales/shift/{shift_id}")
def get_shift_lpg_sales(shift_id: str):
    """
    Get all LPG sales for a specific shift
    """
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
def get_all_accessories():
    """
    Get all LPG accessories inventory
    """
    return accessories_service.get_all()

@router.get("/accessories/{product_code}", response_model=LPGAccessory)
def get_accessory(product_code: str):
    """
    Get specific accessory details
    """
    return accessories_service.get_by_id(product_code)

@router.post("/accessories/sales", response_model=LPGAccessorySale)
def record_accessory_sale(sale: LPGAccessorySale):
    """
    Record LPG accessory sale
    Updates inventory
    """
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
def get_shift_accessory_sales(shift_id: str):
    """
    Get all accessory sales for a specific shift
    """
    return get_sales_summary(
        sales_log=accessories_sales_data,
        shift_id=shift_id,
        model_class=LPGAccessorySale
    )

@router.post("/accessories/{product_code}/restock")
def restock_accessory(product_code: str, quantity: int):
    """
    Add stock to accessory inventory
    """
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
def get_lpg_shift_summary(shift_id: str):
    """
    Get complete LPG summary for a shift (gas + accessories)
    """
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
