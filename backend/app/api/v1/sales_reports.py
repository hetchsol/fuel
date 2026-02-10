"""
Sales Reports API
Provides sales analytics and reporting
"""

from fastapi import APIRouter, HTTPException, Depends
from typing import List, Dict
import json
import os
from collections import defaultdict

from .auth import get_station_context
from ...database.station_files import get_station_file

router = APIRouter()


def load_sales(station_id: str) -> List[dict]:
    """Load sales from station-specific file"""
    filepath = get_station_file(station_id, 'sales.json')
    if not os.path.exists(filepath):
        return []

    try:
        with open(filepath, 'r') as f:
            return json.load(f)
    except Exception as e:
        print(f"Error loading sales: {e}")
        return []


@router.get("/daily/{date}")
def get_daily_sales_report(date: str, ctx: dict = Depends(get_station_context)):
    """
    Get daily sales report for a specific date

    Args:
        date: Date in format YYYY-MM-DD (e.g., 2025-12-19)

    Returns:
        Summary of sales by fuel type for the date
    """
    try:
        sales = load_sales(ctx["station_id"])

        # Filter sales for the specific date
        daily_sales = [s for s in sales if s.get("date") == date]

        if not daily_sales:
            return {
                "date": date,
                "total_sales": 0,
                "diesel": {
                    "total_volume": 0,
                    "total_amount": 0,
                    "sales_count": 0,
                    "shifts": []
                },
                "petrol": {
                    "total_volume": 0,
                    "total_amount": 0,
                    "sales_count": 0,
                    "shifts": []
                },
                "summary": {
                    "total_volume": 0,
                    "total_revenue": 0,
                    "total_transactions": 0
                }
            }

        # Group by fuel type
        diesel_sales = [s for s in daily_sales if s.get("fuel_type") == "Diesel"]
        petrol_sales = [s for s in daily_sales if s.get("fuel_type") == "Petrol"]

        # Calculate totals
        diesel_volume = sum(s.get("average_volume", 0) for s in diesel_sales)
        diesel_amount = sum(s.get("total_amount", 0) for s in diesel_sales)

        petrol_volume = sum(s.get("average_volume", 0) for s in petrol_sales)
        petrol_amount = sum(s.get("total_amount", 0) for s in petrol_sales)

        report = {
            "date": date,
            "diesel": {
                "total_volume": round(diesel_volume, 2),
                "total_amount": round(diesel_amount, 2),
                "sales_count": len(diesel_sales),
                "shifts": [s.get("shift_id") for s in diesel_sales],
                "sales": diesel_sales
            },
            "petrol": {
                "total_volume": round(petrol_volume, 2),
                "total_amount": round(petrol_amount, 2),
                "sales_count": len(petrol_sales),
                "shifts": [s.get("shift_id") for s in petrol_sales],
                "sales": petrol_sales
            },
            "summary": {
                "total_volume": round(diesel_volume + petrol_volume, 2),
                "total_revenue": round(diesel_amount + petrol_amount, 2),
                "total_transactions": len(daily_sales)
            }
        }

        return report

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating report: {str(e)}")


@router.get("/summary")
def get_sales_summary(ctx: dict = Depends(get_station_context)):
    """
    Get overall sales summary across all dates
    """
    try:
        sales = load_sales(ctx["station_id"])

        if not sales:
            return {
                "total_sales": 0,
                "dates": [],
                "fuel_types": {}
            }

        # Group by date
        by_date = defaultdict(list)
        for sale in sales:
            date = sale.get("date", "unknown")
            by_date[date].append(sale)

        # Summary by date
        date_summaries = []
        for date, date_sales in by_date.items():
            total_volume = sum(s.get("average_volume", 0) for s in date_sales)
            total_amount = sum(s.get("total_amount", 0) for s in date_sales)

            date_summaries.append({
                "date": date,
                "total_volume": round(total_volume, 2),
                "total_amount": round(total_amount, 2),
                "transaction_count": len(date_sales)
            })

        # Sort by date descending
        date_summaries.sort(key=lambda x: x["date"], reverse=True)

        return {
            "total_sales": len(sales),
            "dates": date_summaries,
            "total_revenue": round(sum(s.get("total_amount", 0) for s in sales), 2),
            "total_volume": round(sum(s.get("average_volume", 0) for s in sales), 2)
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating summary: {str(e)}")
