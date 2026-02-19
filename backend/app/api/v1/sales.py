"""
Sales API - Station-aware file-based persistence
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import List
import json
import os
from datetime import datetime
from ...models.models import SaleIn, SaleOut
from ...services.sales_calculator import calculate_sale
from .auth import get_station_context
from ...database.station_files import get_station_file

router = APIRouter()


def load_sales(station_id: str) -> List[dict]:
    """Load sales from station-specific file"""
    path = get_station_file(station_id, 'sales.json')
    if not os.path.exists(path):
        return []

    try:
        with open(path, 'r') as f:
            return json.load(f)
    except Exception as e:
        print(f"Error loading sales: {e}")
        return []


def save_sales(sales: List[dict], station_id: str):
    """Save sales to station-specific file"""
    path = get_station_file(station_id, 'sales.json')
    os.makedirs(os.path.dirname(path), exist_ok=True)

    try:
        with open(path, 'w') as f:
            json.dump(sales, f, indent=2)
    except Exception as e:
        print(f"Error saving sales: {e}")
        raise


@router.post("", response_model=SaleOut)
def record_sale(payload: SaleIn, ctx: dict = Depends(get_station_context)):
    """
    Calculate daily sale from opening and closing readings
    Validates mechanical vs electronic readings within 0.03% tolerance
    """
    station_id = ctx["station_id"]

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

        # Auto-deduct from tank level on successful sale
        if sale["validation_status"] == "PASS":
            storage = ctx["storage"]
            tank_data = storage['tanks']

            # Find tank matching this fuel type
            target_tank = None
            for tid, tdata in tank_data.items():
                if tdata["fuel_type"] == payload.fuel_type:
                    target_tank = tid
                    break

            if target_tank:
                tank_data[target_tank]["current_level"] = max(
                    0, tank_data[target_tank]["current_level"] - sale["average_volume"]
                )
                tank_data[target_tank]["last_updated"] = datetime.now().isoformat()
                sale["tank_id"] = target_tank
                sale["tank_level_after"] = tank_data[target_tank]["current_level"]

        # Load existing sales
        sales = load_sales(station_id)

        # Add new sale
        sales.append(sale)

        # Save back to file
        save_sales(sales, station_id)

        return SaleOut(**sale)

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error calculating sale: {str(e)}")


@router.get("", response_model=List[SaleOut])
def get_all_sales(ctx: dict = Depends(get_station_context)):
    """Get all sales"""
    station_id = ctx["station_id"]

    try:
        sales = load_sales(station_id)
        return [SaleOut(**s) for s in sales]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving sales: {str(e)}")


@router.get("/date/{date}", response_model=List[SaleOut])
def get_sales_by_date(date: str, ctx: dict = Depends(get_station_context)):
    """
    Get sales for a specific date

    Args:
        date: Date in format YYYY-MM-DD (e.g., 2025-12-19)
    """
    station_id = ctx["station_id"]

    try:
        sales = load_sales(station_id)
        filtered_sales = [s for s in sales if s.get("date") == date]
        return [SaleOut(**s) for s in filtered_sales]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving sales: {str(e)}")
