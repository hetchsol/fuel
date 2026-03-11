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
from ...config import resolve_fuel_price
from .auth import get_station_context
from ...database.station_files import load_station_json, save_station_json

router = APIRouter()


def load_sales(station_id: str) -> List[dict]:
    """Load sales from station-specific storage"""
    return load_station_json(station_id, 'sales.json', default=[])


def save_sales(sales: List[dict], station_id: str):
    """Save sales to station-specific storage"""
    save_station_json(station_id, 'sales.json', sales)


@router.post("", response_model=SaleOut)
def record_sale(payload: SaleIn, ctx: dict = Depends(get_station_context)):
    """
    Calculate daily sale from opening and closing readings
    Validates mechanical vs electronic readings within 0.03% tolerance
    """
    station_id = ctx["station_id"]

    try:
        price = resolve_fuel_price(payload.fuel_type, ctx["storage"])
        sale = calculate_sale(
            shift_id=payload.shift_id,
            fuel_type=payload.fuel_type,
            mechanical_opening=payload.mechanical_opening,
            mechanical_closing=payload.mechanical_closing,
            electronic_opening=payload.electronic_opening,
            electronic_closing=payload.electronic_closing,
            unit_price=price
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
            tank_data = storage.get('tanks', {})

            # Find tank matching this fuel type
            target_tank = None
            for tid, tdata in tank_data.items():
                if tdata.get("fuel_type") == payload.fuel_type:
                    target_tank = tid
                    break

            if target_tank:
                tank = tank_data[target_tank]
                current_level = tank.get("current_level", 0)
                tank["current_level"] = max(
                    0, current_level - sale.get("average_volume", 0)
                )
                tank["last_updated"] = datetime.now().isoformat()
                sale["tank_id"] = target_tank
                sale["tank_level_after"] = tank["current_level"]

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
