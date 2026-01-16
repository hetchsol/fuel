
from fastapi import APIRouter, HTTPException
from typing import List
import json
import os
from datetime import datetime
from ...models.models import SaleIn, SaleOut
from ...services.sales_calculator import calculate_sale

router = APIRouter()

SALES_FILE = "storage/sales.json"


def load_sales() -> List[dict]:
    """Load sales from file"""
    if not os.path.exists(SALES_FILE):
        return []

    try:
        with open(SALES_FILE, 'r') as f:
            return json.load(f)
    except Exception as e:
        print(f"Error loading sales: {e}")
        return []


def save_sales(sales: List[dict]):
    """Save sales to file"""
    os.makedirs(os.path.dirname(SALES_FILE), exist_ok=True)

    try:
        with open(SALES_FILE, 'w') as f:
            json.dump(sales, f, indent=2)
    except Exception as e:
        print(f"Error saving sales: {e}")
        raise


@router.post("", response_model=SaleOut)
def record_sale(payload: SaleIn):
    """
    Calculate daily sale from opening and closing readings
    Validates mechanical vs electronic readings within 0.03% tolerance
    """
    try:
        sale = calculate_sale(
            shift_id=payload.shift_id,
            fuel_type=payload.fuel_type,
            mechanical_opening=payload.mechanical_opening,
            mechanical_closing=payload.mechanical_closing,
            electronic_opening=payload.electronic_opening,
            electronic_closing=payload.electronic_closing
        )

        # If validation failed, raise HTTP error
        if sale["validation_status"] == "FAIL":
            raise HTTPException(
                status_code=400,
                detail=sale["validation_message"]
            )

        # Add timestamp for reporting
        sale["created_at"] = datetime.now().isoformat()

        # Extract date from shift_id for easier querying (e.g., DAY_19_12_2025 -> 2025-12-19)
        try:
            parts = sale["shift_id"].split("_")
            if len(parts) == 4:
                day, month, year = parts[1], parts[2], parts[3]
                sale["date"] = f"{year}-{month}-{day}"
            else:
                sale["date"] = datetime.now().strftime("%Y-%m-%d")
        except:
            sale["date"] = datetime.now().strftime("%Y-%m-%d")

        # Load existing sales
        sales = load_sales()

        # Add new sale
        sales.append(sale)

        # Save back to file
        save_sales(sales)

        return SaleOut(**sale)

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error calculating sale: {str(e)}")


@router.get("", response_model=List[SaleOut])
def get_all_sales():
    """Get all sales"""
    try:
        sales = load_sales()
        return [SaleOut(**s) for s in sales]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving sales: {str(e)}")


@router.get("/date/{date}", response_model=List[SaleOut])
def get_sales_by_date(date: str):
    """
    Get sales for a specific date

    Args:
        date: Date in format YYYY-MM-DD (e.g., 2025-12-19)
    """
    try:
        sales = load_sales()
        filtered_sales = [s for s in sales if s.get("date") == date]
        return [SaleOut(**s) for s in filtered_sales]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving sales: {str(e)}")
