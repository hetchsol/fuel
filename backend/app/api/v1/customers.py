"""
Customer Management API
Endpoints for managing diesel customer types and allocations
"""

from fastapi import APIRouter, HTTPException, Depends
from typing import List
from app.models.models import Customer, CustomerAllocation
from app.services import customer_service
from app.api.v1.auth import get_current_user

router = APIRouter()

@router.get("/", response_model=List[Customer])
def get_customers(
    active_only: bool = True,
    current_user: dict = Depends(get_current_user)
):
    """
    Get all customers

    Query Parameters:
        - active_only: Return only active customers (default: true)
    """
    customers = customer_service.get_all_customers(active_only=active_only)
    return customers

@router.get("/{customer_id}", response_model=Customer)
def get_customer(
    customer_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific customer by ID"""
    customer = customer_service.get_customer(customer_id)

    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    return customer

@router.post("/", response_model=Customer)
def create_customer(
    customer: Customer,
    current_user: dict = Depends(get_current_user)
):
    """
    Create a new customer

    Requires: owner or supervisor role
    """
    # Check role
    if current_user.get("role") not in ["owner", "supervisor"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    try:
        created_customer = customer_service.create_customer(customer.dict())
        return created_customer
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.put("/{customer_id}", response_model=Customer)
def update_customer(
    customer_id: str,
    customer: Customer,
    current_user: dict = Depends(get_current_user)
):
    """
    Update an existing customer

    Requires: owner or supervisor role
    """
    # Check role
    if current_user.get("role") not in ["owner", "supervisor"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    updated_customer = customer_service.update_customer(customer_id, customer.dict())

    if not updated_customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    return updated_customer

@router.delete("/{customer_id}")
def delete_customer(
    customer_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Delete (soft delete) a customer

    Requires: owner role
    """
    # Check role
    if current_user.get("role") != "owner":
        raise HTTPException(status_code=403, detail="Only owners can delete customers")

    success = customer_service.delete_customer(customer_id)

    if not success:
        raise HTTPException(status_code=404, detail="Customer not found")

    return {"message": "Customer deleted successfully"}

@router.post("/validate-allocations")
def validate_allocations(
    allocations: List[CustomerAllocation],
    total_electronic: float,
    current_user: dict = Depends(get_current_user)
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
    validation_result = customer_service.validate_allocations(allocations_list, total_electronic)

    return validation_result

@router.post("/calculate-revenue")
def calculate_revenue(
    allocations: List[CustomerAllocation],
    current_user: dict = Depends(get_current_user)
):
    """
    Calculate total revenue breakdown by customer

    Body:
        - allocations: List of customer allocations

    Returns:
        Revenue breakdown by customer type
    """
    allocations_list = [alloc.dict() for alloc in allocations]
    revenue_data = customer_service.calculate_customer_revenue(allocations_list)

    return revenue_data
