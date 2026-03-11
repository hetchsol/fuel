"""
Customer Service - Allocation validation and revenue calculation.

CRUD operations for customers are handled by the station-aware API route
(backend/app/api/v1/customers.py) using load_station_json/save_station_json.
This module provides only the pure calculation helpers.
"""

from typing import List, Dict


def validate_allocations(allocations: List[Dict], total_electronic: float, tolerance: float = 0.01) -> Dict:
    """
    Validate that customer allocations balance with total electronic dispensed
    Excel Column AW: Check = Total Electronic - Sum(Allocations) should equal zero

    Args:
        allocations: List of customer allocation dictionaries
        total_electronic: Total electronic volume dispensed
        tolerance: Acceptable difference (default 0.01 liters)

    Returns:
        Dictionary with validation results
    """
    if not allocations:
        return {
            "valid": False,
            "message": "No customer allocations provided",
            "balance": total_electronic,
            "sum_allocations": 0,
            "difference": total_electronic
        }

    sum_allocations = sum(alloc.get("volume", 0) for alloc in allocations)
    difference = total_electronic - sum_allocations

    valid = abs(difference) <= tolerance

    return {
        "valid": valid,
        "message": "Allocations balance" if valid else f"Allocations do not balance. Difference: {difference:.3f} L",
        "balance": difference,
        "sum_allocations": sum_allocations,
        "total_electronic": total_electronic,
        "difference": difference,
        "percentage_diff": (difference / total_electronic * 100) if total_electronic > 0 else 0
    }

def calculate_customer_revenue(allocations: List[Dict]) -> Dict:
    """
    Calculate total revenue by customer type

    Args:
        allocations: List of customer allocation dictionaries

    Returns:
        Dictionary with customer revenue breakdown
    """
    total_revenue = 0
    customer_breakdown = {}

    for alloc in allocations:
        customer_id = alloc.get("customer_id")
        customer_name = alloc.get("customer_name")
        volume = alloc.get("volume", 0)
        price = alloc.get("price_per_liter", 0)
        amount = alloc.get("amount", volume * price)

        total_revenue += amount

        if customer_id not in customer_breakdown:
            customer_breakdown[customer_id] = {
                "customer_id": customer_id,
                "customer_name": customer_name,
                "total_volume": 0,
                "total_amount": 0,
                "allocations_count": 0
            }

        customer_breakdown[customer_id]["total_volume"] += volume
        customer_breakdown[customer_id]["total_amount"] += amount
        customer_breakdown[customer_id]["allocations_count"] += 1

    return {
        "total_revenue": total_revenue,
        "customer_breakdown": list(customer_breakdown.values()),
        "num_customers": len(customer_breakdown)
    }
