"""
Customer Service - Manages diesel customer types and allocations
Implements customer master data and allocation logic for diesel sales
"""

import json
import uuid
from datetime import datetime
from typing import List, Dict, Optional
from pathlib import Path

# In-memory storage (replace with actual database in production)
CUSTOMERS_FILE = Path(__file__).parent.parent / 'data' / 'customers.json'
CUSTOMERS_FILE.parent.mkdir(parents=True, exist_ok=True)

def load_customers() -> Dict:
    """Load customers from JSON file"""
    if CUSTOMERS_FILE.exists():
        with open(CUSTOMERS_FILE, 'r') as f:
            return json.load(f)
    return {}

def save_customers(customers: Dict):
    """Save customers to JSON file"""
    with open(CUSTOMERS_FILE, 'w') as f:
        json.dump(customers, f, indent=2)

def initialize_default_customers():
    """
    Initialize default diesel customer types based on Excel sheet
    Diesel sheet has columns: AR (Drive-In), AS (Volcano), AT (Hammington),
    AU (Special Customer 3), AV (Special Customer 4)
    """
    customers = load_customers()

    if not customers:  # Only initialize if empty
        default_customers = [
            {
                "customer_id": "CUST-DRIVE-IN",
                "customer_name": "Drive-In Customers",
                "customer_type": "Drive-In",
                "default_price_per_liter": 26.98,  # Standard diesel price
                "is_active": True,
                "created_at": datetime.now().isoformat(),
                "notes": "Walk-in cash customers (Column AR)"
            },
            {
                "customer_id": "CUST-VOLCANO",
                "customer_name": "Volcano",
                "customer_type": "Corporate",
                "default_price_per_liter": 26.98,  # Can be customized per customer
                "is_active": True,
                "created_at": datetime.now().isoformat(),
                "notes": "Corporate account - Volcano (Column AS)"
            },
            {
                "customer_id": "CUST-HAMMINGTON",
                "customer_name": "Hammington",
                "customer_type": "Corporate",
                "default_price_per_liter": 26.98,
                "is_active": True,
                "created_at": datetime.now().isoformat(),
                "notes": "Corporate account - Hammington (Column AT)"
            },
            {
                "customer_id": "CUST-SPECIAL-3",
                "customer_name": "Special Customer 3",
                "customer_type": "Corporate",
                "default_price_per_liter": 26.98,
                "is_active": True,
                "created_at": datetime.now().isoformat(),
                "notes": "Special customer account (Column AU)"
            },
            {
                "customer_id": "CUST-SPECIAL-4",
                "customer_name": "Special Customer 4",
                "customer_type": "Corporate",
                "default_price_per_liter": 26.98,
                "is_active": True,
                "created_at": datetime.now().isoformat(),
                "notes": "Special customer account (Column AV)"
            }
        ]

        customers_dict = {c["customer_id"]: c for c in default_customers}
        save_customers(customers_dict)
        return customers_dict

    return customers

def get_all_customers(active_only: bool = True) -> List[Dict]:
    """
    Get all customers

    Args:
        active_only: If True, return only active customers

    Returns:
        List of customer dictionaries
    """
    customers = load_customers()

    if not customers:
        customers = initialize_default_customers()

    customer_list = list(customers.values())

    if active_only:
        customer_list = [c for c in customer_list if c.get("is_active", True)]

    return customer_list

def get_customer(customer_id: str) -> Optional[Dict]:
    """Get a specific customer by ID"""
    customers = load_customers()
    return customers.get(customer_id)

def create_customer(customer_data: Dict) -> Dict:
    """
    Create a new customer

    Args:
        customer_data: Dictionary with customer fields

    Returns:
        Created customer dictionary
    """
    customers = load_customers()

    customer_id = customer_data.get("customer_id") or f"CUST-{str(uuid.uuid4())[:8].upper()}"

    customer = {
        "customer_id": customer_id,
        "customer_name": customer_data["customer_name"],
        "customer_type": customer_data.get("customer_type", "Corporate"),
        "default_price_per_liter": customer_data.get("default_price_per_liter"),
        "is_active": customer_data.get("is_active", True),
        "created_at": datetime.now().isoformat(),
        "notes": customer_data.get("notes")
    }

    customers[customer_id] = customer
    save_customers(customers)

    return customer

def update_customer(customer_id: str, customer_data: Dict) -> Optional[Dict]:
    """Update an existing customer"""
    customers = load_customers()

    if customer_id not in customers:
        return None

    # Update fields
    for key, value in customer_data.items():
        if key != "customer_id" and key != "created_at":
            customers[customer_id][key] = value

    save_customers(customers)
    return customers[customer_id]

def delete_customer(customer_id: str) -> bool:
    """Soft delete a customer (set is_active to False)"""
    customers = load_customers()

    if customer_id not in customers:
        return False

    customers[customer_id]["is_active"] = False
    save_customers(customers)

    return True

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

# Initialize default customers on module load
initialize_default_customers()
