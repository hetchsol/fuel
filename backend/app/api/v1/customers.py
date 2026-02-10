"""
Customer Management API
Endpoints for managing diesel customer types and allocations.
All endpoints are station-aware via get_station_context dependency.
"""

from fastapi import APIRouter, HTTPException, Depends
from typing import List
from app.models.models import Customer, CustomerAllocation
from app.services.customer_service import validate_allocations, calculate_customer_revenue
from app.api.v1.auth import get_current_user, get_station_context
from ...database.station_files import get_station_file
import json
import os
import uuid
from datetime import datetime

router = APIRouter()


# ──────────────────────────────────────────────────────────
# Station-aware customer file helpers
# ──────────────────────────────────────────────────────────

def _load_customers(station_id: str) -> dict:
    """Load customers from the station-specific customers.json file"""
    path = get_station_file(station_id, 'customers.json')
    if os.path.exists(path):
        with open(path, 'r') as f:
            return json.load(f)
    return {}


def _save_customers(customers: dict, station_id: str):
    """Save customers to the station-specific customers.json file"""
    path = get_station_file(station_id, 'customers.json')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w') as f:
        json.dump(customers, f, indent=2)


def _initialize_default_customers(station_id: str) -> dict:
    """
    Initialize default diesel customer types if none exist for this station.
    Based on original Excel columns: AR (Drive-In), AS (Volcano), AT (Hammington),
    AU (Special Customer 3), AV (Special Customer 4).
    """
    customers = _load_customers(station_id)

    if not customers:
        default_customers = [
            {
                "customer_id": "CUST-DRIVE-IN",
                "customer_name": "Drive-In Customers",
                "customer_type": "Drive-In",
                "default_price_per_liter": 26.98,
                "is_active": True,
                "created_at": datetime.now().isoformat(),
                "notes": "Walk-in cash customers (Column AR)"
            },
            {
                "customer_id": "CUST-VOLCANO",
                "customer_name": "Volcano",
                "customer_type": "Corporate",
                "default_price_per_liter": 26.98,
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

        customers = {c["customer_id"]: c for c in default_customers}
        _save_customers(customers, station_id)

    return customers


# ──────────────────────────────────────────────────────────
# Endpoints
# ──────────────────────────────────────────────────────────

@router.get("/", response_model=List[Customer])
def get_customers(
    active_only: bool = True,
    ctx: dict = Depends(get_station_context)
):
    """
    Get all customers

    Query Parameters:
        - active_only: Return only active customers (default: true)
    """
    station_id = ctx["station_id"]
    customers = _load_customers(station_id)

    if not customers:
        customers = _initialize_default_customers(station_id)

    customer_list = list(customers.values())

    if active_only:
        customer_list = [c for c in customer_list if c.get("is_active", True)]

    return customer_list


@router.get("/{customer_id}", response_model=Customer)
def get_customer(
    customer_id: str,
    ctx: dict = Depends(get_station_context)
):
    """Get a specific customer by ID"""
    station_id = ctx["station_id"]
    customers = _load_customers(station_id)
    customer = customers.get(customer_id)

    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    return customer


@router.post("/", response_model=Customer)
def create_customer(
    customer: Customer,
    ctx: dict = Depends(get_station_context)
):
    """
    Create a new customer

    Requires: owner or supervisor role
    """
    current_user = ctx
    if current_user.get("role") not in ["owner", "supervisor"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    station_id = ctx["station_id"]
    customers = _load_customers(station_id)

    customer_data = customer.dict()
    customer_id = customer_data.get("customer_id") or f"CUST-{str(uuid.uuid4())[:8].upper()}"

    new_customer = {
        "customer_id": customer_id,
        "customer_name": customer_data["customer_name"],
        "customer_type": customer_data.get("customer_type", "Corporate"),
        "default_price_per_liter": customer_data.get("default_price_per_liter"),
        "is_active": customer_data.get("is_active", True),
        "created_at": datetime.now().isoformat(),
        "notes": customer_data.get("notes")
    }

    customers[customer_id] = new_customer
    _save_customers(customers, station_id)

    return new_customer


@router.put("/{customer_id}", response_model=Customer)
def update_customer(
    customer_id: str,
    customer: Customer,
    ctx: dict = Depends(get_station_context)
):
    """
    Update an existing customer

    Requires: owner or supervisor role
    """
    current_user = ctx
    if current_user.get("role") not in ["owner", "supervisor"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    station_id = ctx["station_id"]
    customers = _load_customers(station_id)

    if customer_id not in customers:
        raise HTTPException(status_code=404, detail="Customer not found")

    # Update fields
    customer_data = customer.dict()
    for key, value in customer_data.items():
        if key != "customer_id" and key != "created_at":
            customers[customer_id][key] = value

    _save_customers(customers, station_id)
    return customers[customer_id]


@router.delete("/{customer_id}")
def delete_customer(
    customer_id: str,
    ctx: dict = Depends(get_station_context)
):
    """
    Delete (soft delete) a customer

    Requires: owner role
    """
    current_user = ctx
    if current_user.get("role") != "owner":
        raise HTTPException(status_code=403, detail="Only owners can delete customers")

    station_id = ctx["station_id"]
    customers = _load_customers(station_id)

    if customer_id not in customers:
        raise HTTPException(status_code=404, detail="Customer not found")

    customers[customer_id]["is_active"] = False
    _save_customers(customers, station_id)

    return {"message": "Customer deleted successfully"}


@router.post("/validate-allocations")
def validate_customer_allocations(
    allocations: List[CustomerAllocation],
    total_electronic: float,
    ctx: dict = Depends(get_station_context)
):
    """
    Validate that customer allocations balance with total electronic dispensed

    Body:
        - allocations: List of customer allocations
        - total_electronic: Total electronic volume dispensed

    Returns:
        Validation result with balance check
    """
    allocations_list = [alloc.dict() for alloc in allocations]
    validation_result = validate_allocations(allocations_list, total_electronic)

    return validation_result


@router.post("/calculate-revenue")
def calculate_revenue(
    allocations: List[CustomerAllocation],
    ctx: dict = Depends(get_station_context)
):
    """
    Calculate total revenue breakdown by customer

    Body:
        - allocations: List of customer allocations

    Returns:
        Revenue breakdown by customer type
    """
    allocations_list = [alloc.dict() for alloc in allocations]
    revenue_data = calculate_customer_revenue(allocations_list)

    return revenue_data
