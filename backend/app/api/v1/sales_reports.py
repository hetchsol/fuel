"""
Sales Reports API
Provides sales analytics and reporting from handover data (source of truth)
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from typing import List, Dict, Optional
from collections import defaultdict

from .auth import get_station_context
from ...database.station_files import load_station_json
from ...services.handover_sales import iter_completed_handovers

router = APIRouter()


def _load_fuel_sales_from_handovers(station_id: str, storage: dict) -> List[dict]:
    """
    Load fuel sales data from completed handovers (source of truth).
    Each handover nozzle summary becomes a sale record.
    """
    from ...services.handover_sales import iter_completed_handover_nozzles
    sales = []
    for ho, ns in iter_completed_handover_nozzles(station_id):
        volume = ns.get('volume_sold', 0)
        sales.append({
            'date': ho.get('date', ''),
            'shift_id': ho.get('shift_id', ''),
            'shift_type': ho.get('shift_type', ''),
            'attendant': ho.get('attendant_name', ''),
            'nozzle_id': ns.get('nozzle_id', ''),
            'fuel_type': ns.get('fuel_type', ''),
            'volume': volume,
            'average_volume': volume,
            'total_amount': ns.get('revenue', 0),
            'price_per_liter': ns.get('price_per_liter', 0),
            'unit_price': ns.get('price_per_liter', 0),
            'discrepancy_percent': ns.get('meter_deviation_percent'),
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

        empty_fuel = {"total_volume": 0, "total_amount": 0, "sales_count": 0, "shifts": [], "sales": []}
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
                "sales": diesel_sales,
            },
            "petrol": {
                "total_volume": round(petrol_volume, 2),
                "total_amount": round(petrol_amount, 2),
                "sales_count": len(petrol_sales),
                "shifts": list(set(s.get("shift_id") for s in petrol_sales)),
                "sales": petrol_sales,
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


@router.get("/pos")
def get_pos_report(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    type_id: Optional[str] = Query(None),
    ctx: dict = Depends(get_station_context),
):
    """
    POS receipts report. Groups pos_breakdown items by payment type.
    Supports optional date range and single type_id filter.
    Old handovers without pos_breakdown are included as a legacy lump sum.
    """
    try:
        transactions: list = []
        by_type: dict = {}

        for ho in iter_completed_handovers(ctx["station_id"]):
            date = ho.get("date", "")
            if start_date and date < start_date:
                continue
            if end_date and date > end_date:
                continue

            pos_breakdown = ho.get("pos_breakdown")
            pos_receipts = ho.get("pos_receipts") or 0

            if pos_breakdown and isinstance(pos_breakdown, list):
                for item in pos_breakdown:
                    tid = item.get("type_id", "")
                    tname = item.get("type_name", tid)
                    amount = item.get("amount") or 0
                    if type_id and tid != type_id:
                        continue
                    if not amount:
                        continue
                    transactions.append({
                        "date": date,
                        "shift_type": ho.get("shift_type", ""),
                        "attendant_name": ho.get("attendant_name", ""),
                        "handover_id": ho.get("handover_id", ""),
                        "type_id": tid,
                        "type_name": tname,
                        "amount": amount,
                        "reference": item.get("reference"),
                    })
                    if tid not in by_type:
                        by_type[tid] = {"type_id": tid, "type_name": tname, "total": 0, "shift_count": 0}
                    by_type[tid]["total"] = round(by_type[tid]["total"] + amount, 2)
                    by_type[tid]["shift_count"] += 1

            elif pos_receipts > 0 and not type_id:
                # Pre-breakdown record — include as a legacy lump sum
                transactions.append({
                    "date": date,
                    "shift_type": ho.get("shift_type", ""),
                    "attendant_name": ho.get("attendant_name", ""),
                    "handover_id": ho.get("handover_id", ""),
                    "type_id": "_legacy",
                    "type_name": "POS (legacy)",
                    "amount": pos_receipts,
                    "reference": None,
                })
                if "_legacy" not in by_type:
                    by_type["_legacy"] = {"type_id": "_legacy", "type_name": "POS (legacy)", "total": 0, "shift_count": 0}
                by_type["_legacy"]["total"] = round(by_type["_legacy"]["total"] + pos_receipts, 2)
                by_type["_legacy"]["shift_count"] += 1

        transactions.sort(key=lambda x: (x["date"], x.get("shift_type", "")), reverse=True)
        by_type_list = sorted(by_type.values(), key=lambda x: x["total"], reverse=True)
        total_pos = round(sum(t["amount"] for t in transactions), 2)

        return {
            "summary": {
                "total_pos_receipts": total_pos,
                "transaction_count": len(transactions),
            },
            "by_type": by_type_list,
            "transactions": transactions,
            "period": {"start_date": start_date or "All", "end_date": end_date or "All"},
            "type_filter": type_id,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating POS report: {str(e)}")
