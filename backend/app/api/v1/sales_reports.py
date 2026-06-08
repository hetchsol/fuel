"""
Sales Reports API
Provides sales analytics and reporting from handover data (source of truth)
"""

from fastapi import APIRouter, HTTPException, Depends
from typing import List, Dict
from collections import defaultdict

from .auth import get_station_context
from ...database.station_files import load_station_json

router = APIRouter()


def _load_fuel_sales_from_handovers(station_id: str, storage: dict) -> List[dict]:
    """
    Load fuel sales data from completed handovers (source of truth).
    Each handover nozzle summary becomes a sale record.
    """
    from ...services.handover_sales import iter_completed_handover_nozzles
    sales = []
    for ho, ns in iter_completed_handover_nozzles(station_id):
        sales.append({
            'date': ho.get('date', ''),
            'shift_id': ho.get('shift_id', ''),
            'shift_type': ho.get('shift_type', ''),
            'attendant': ho.get('attendant_name', ''),
            'nozzle_id': ns.get('nozzle_id', ''),
            'fuel_type': ns.get('fuel_type', ''),
            'volume': ns.get('volume_sold', 0),
            'total_amount': ns.get('revenue', 0),
            'price_per_liter': ns.get('price_per_liter', 0),
        })
    return sales


@router.get("/daily/{date}")
def get_daily_sales_report(date: str, ctx: dict = Depends(get_station_context)):
    """
    Get daily sales report for a specific date from handover data.
    """
    try:
        sales = _load_fuel_sales_from_handovers(ctx["station_id"], ctx["storage"])
        daily_sales = [s for s in sales if s.get("date") == date]

        empty_fuel = {"total_volume": 0, "total_amount": 0, "sales_count": 0, "shifts": []}
        if not daily_sales:
            return {
                "date": date, "total_sales": 0,
                "diesel": {**empty_fuel}, "petrol": {**empty_fuel},
                "summary": {"total_volume": 0, "total_revenue": 0, "total_transactions": 0}
            }

        diesel_sales = [s for s in daily_sales if s.get("fuel_type") == "Diesel"]
        petrol_sales = [s for s in daily_sales if s.get("fuel_type") == "Petrol"]

        diesel_volume = sum(s.get("volume", 0) for s in diesel_sales)
        diesel_amount = sum(s.get("total_amount", 0) for s in diesel_sales)
        petrol_volume = sum(s.get("volume", 0) for s in petrol_sales)
        petrol_amount = sum(s.get("total_amount", 0) for s in petrol_sales)

        return {
            "date": date,
            "diesel": {
                "total_volume": round(diesel_volume, 2),
                "total_amount": round(diesel_amount, 2),
                "sales_count": len(diesel_sales),
                "shifts": list(set(s.get("shift_id") for s in diesel_sales)),
            },
            "petrol": {
                "total_volume": round(petrol_volume, 2),
                "total_amount": round(petrol_amount, 2),
                "sales_count": len(petrol_sales),
                "shifts": list(set(s.get("shift_id") for s in petrol_sales)),
            },
            "summary": {
                "total_volume": round(diesel_volume + petrol_volume, 2),
                "total_revenue": round(diesel_amount + petrol_amount, 2),
                "total_transactions": len(daily_sales)
            }
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating report: {str(e)}")


@router.get("/summary")
def get_sales_summary(ctx: dict = Depends(get_station_context)):
    """
    Get overall sales summary across all dates from handover data.
    """
    try:
        sales = _load_fuel_sales_from_handovers(ctx["station_id"], ctx["storage"])

        if not sales:
            return {"total_sales": 0, "dates": [], "fuel_types": {},
                    "total_revenue": 0, "total_volume": 0}

        by_date = defaultdict(list)
        for sale in sales:
            by_date[sale.get("date", "unknown")].append(sale)

        date_summaries = []
        for date, date_sales in by_date.items():
            total_volume = sum(s.get("volume", 0) for s in date_sales)
            total_amount = sum(s.get("total_amount", 0) for s in date_sales)
            date_summaries.append({
                "date": date,
                "total_volume": round(total_volume, 2),
                "total_amount": round(total_amount, 2),
                "transaction_count": len(date_sales)
            })

        date_summaries.sort(key=lambda x: x["date"], reverse=True)

        return {
            "total_sales": len(sales),
            "dates": date_summaries,
            "total_revenue": round(sum(s.get("total_amount", 0) for s in sales), 2),
            "total_volume": round(sum(s.get("volume", 0) for s in sales), 2)
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating summary: {str(e)}")
