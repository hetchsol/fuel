"""
Unified Inventory Transaction Service

Provides reusable functions for inventory and account transactions
Handles the common pattern of:
1. Check if item exists
2. Check if quantity/balance is available
3. Deduct from inventory/balance
4. Record transaction
"""
from fastapi import HTTPException
from typing import Dict, List, Any, Optional, Callable


def process_stock_sale(
    inventory: Dict[str, Dict[str, Any]],
    sales_log: List[Dict[str, Any]],
    item_id: str,
    quantity: int,
    sale_data: Dict[str, Any],
    item_id_field: str = 'product_code',
    stock_field: str = 'current_stock',
    quantity_field: str = 'quantity',
    item_name: str = 'item'
) -> Dict[str, Any]:
    """
    Process a stock-based sale transaction

    Generic function that handles:
    - Product existence check
    - Stock availability check
    - Stock deduction
    - Sale recording

    Args:
        inventory: Inventory dictionary storage
        sales_log: List to append sale records to
        item_id: ID of item being sold
        quantity: Quantity to sell
        sale_data: Complete sale data to record
        item_id_field: Name of the ID field (default: 'product_code')
        stock_field: Name of the stock field (default: 'current_stock')
        quantity_field: Name of the quantity field in sale_data (default: 'quantity')
        item_name: Human-readable name for error messages

    Returns:
        Sale data dictionary

    Raises:
        HTTPException: 404 if item not found, 400 if insufficient stock

    Example:
        >>> result = process_stock_sale(
        ...     inventory=accessories_inventory,
        ...     sales_log=accessories_sales_data,
        ...     item_id=sale.product_code,
        ...     quantity=sale.quantity,
        ...     sale_data=sale.dict(),
        ...     item_name='accessory'
        ... )
    """
    # Check if item exists
    if item_id not in inventory:
        raise HTTPException(
            status_code=404,
            detail=f"{item_name.capitalize()} not found"
        )

    item = inventory[item_id]

    # Check stock availability
    current_stock = item.get(stock_field, 0)
    if current_stock < quantity:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient stock. Available: {current_stock}, Requested: {quantity}"
        )

    # Deduct stock
    item[stock_field] -= quantity

    # Record sale
    sales_log.append(sale_data)

    return sale_data


def process_credit_sale(
    accounts: Dict[str, Dict[str, Any]],
    sales_log: List[Dict[str, Any]],
    account_id: str,
    amount: float,
    sale_data: Dict[str, Any],
    balance_field: str = 'current_balance',
    limit_field: str = 'credit_limit'
) -> Dict[str, Any]:
    """
    Process a credit-based sale transaction

    Generic function that handles:
    - Account existence check
    - Credit limit check
    - Balance update
    - Sale recording

    Args:
        accounts: Accounts dictionary storage
        sales_log: List to append sale records to
        account_id: ID of account
        amount: Amount to charge
        sale_data: Complete sale data to record
        balance_field: Name of the balance field (default: 'current_balance')
        limit_field: Name of the credit limit field (default: 'credit_limit')

    Returns:
        Sale data dictionary

    Raises:
        HTTPException: 404 if account not found, 400 if credit limit exceeded

    Example:
        >>> result = process_credit_sale(
        ...     accounts=accounts_data,
        ...     sales_log=credit_sales_data,
        ...     account_id=sale.account_id,
        ...     amount=sale.amount,
        ...     sale_data=sale.dict()
        ... )
    """
    # Check if account exists
    if account_id not in accounts:
        raise HTTPException(
            status_code=404,
            detail="Account not found"
        )

    account = accounts[account_id]

    # Check credit limit
    current_balance = account.get(balance_field, 0)
    credit_limit = account.get(limit_field, 0)
    new_balance = current_balance + amount

    if new_balance > credit_limit:
        raise HTTPException(
            status_code=400,
            detail=f"Credit limit exceeded. Limit: {credit_limit}, Current: {current_balance}, Requested: {amount}"
        )

    # Update balance
    account[balance_field] = new_balance

    # Record sale
    sales_log.append(sale_data)

    return sale_data


def get_shift_sales(
    sales_log: List[Dict[str, Any]],
    shift_id: str,
    model_class: Optional[Any] = None
) -> List[Any]:
    """
    Get all sales for a specific shift

    Args:
        sales_log: Sales data list
        shift_id: Shift ID to filter by
        model_class: Optional Pydantic model to convert results to

    Returns:
        List of sales (as model instances if model_class provided, else dicts)

    Example:
        >>> shift_sales = get_shift_sales(
        ...     sales_log=lubricants_sales_data,
        ...     shift_id='SHIFT-001',
        ...     model_class=LubricantSale
        ... )
    """
    filtered_sales = [
        sale for sale in sales_log
        if sale.get("shift_id") == shift_id
    ]

    if model_class:
        return [model_class(**sale) for sale in filtered_sales]

    return filtered_sales


def calculate_shift_revenue(
    sales_log: List[Dict[str, Any]],
    shift_id: str,
    amount_field: str = 'total_amount'
) -> float:
    """
    Calculate total revenue for a shift

    Args:
        sales_log: Sales data list
        shift_id: Shift ID to filter by
        amount_field: Name of the amount field (default: 'total_amount')

    Returns:
        Total revenue for the shift

    Example:
        >>> revenue = calculate_shift_revenue(
        ...     sales_log=accessories_sales_data,
        ...     shift_id='SHIFT-001'
        ... )
    """
    shift_sales = [
        sale for sale in sales_log
        if sale.get("shift_id") == shift_id
    ]

    return sum(sale.get(amount_field, 0) for sale in shift_sales)


def get_sales_summary(
    sales_log: List[Dict[str, Any]],
    shift_id: str,
    model_class: Optional[Any] = None,
    amount_field: str = 'total_amount',
    quantity_field: Optional[str] = None
) -> Dict[str, Any]:
    """
    Get comprehensive sales summary for a shift

    Args:
        sales_log: Sales data list
        shift_id: Shift ID to filter by
        model_class: Optional Pydantic model to convert sales to
        amount_field: Name of the amount field (default: 'total_amount')
        quantity_field: Optional quantity field for quantity-based summaries

    Returns:
        Dictionary with shift_id, sales list, total_revenue, and optionally total_quantity

    Example:
        >>> summary = get_sales_summary(
        ...     sales_log=lpg_sales_data,
        ...     shift_id='SHIFT-001',
        ...     model_class=LPGSale,
        ...     quantity_field='quantity_kg'
        ... )
    """
    sales = get_shift_sales(sales_log, shift_id, model_class)
    revenue = calculate_shift_revenue(sales_log, shift_id, amount_field)

    result = {
        "shift_id": shift_id,
        "sales": sales,
        "total_revenue": revenue
    }

    # Add quantity summary if quantity field provided
    if quantity_field:
        raw_sales = [s for s in sales_log if s.get("shift_id") == shift_id]
        total_quantity = sum(sale.get(quantity_field, 0) for sale in raw_sales)
        result["total_quantity"] = total_quantity

    return result


def check_stock_availability(
    inventory: Dict[str, Dict[str, Any]],
    item_id: str,
    required_quantity: int,
    stock_field: str = 'current_stock'
) -> tuple[bool, int]:
    """
    Check if sufficient stock is available

    Args:
        inventory: Inventory dictionary
        item_id: Item ID to check
        required_quantity: Quantity needed
        stock_field: Name of the stock field

    Returns:
        Tuple of (is_available: bool, current_stock: int)

    Example:
        >>> available, stock = check_stock_availability(
        ...     inventory=lubricants_inventory,
        ...     item_id='OIL-10W30',
        ...     required_quantity=5
        ... )
    """
    if item_id not in inventory:
        return False, 0

    current_stock = inventory[item_id].get(stock_field, 0)
    return current_stock >= required_quantity, current_stock


def get_low_stock_items(
    inventory: Dict[str, Dict[str, Any]],
    threshold: int,
    stock_field: str = 'current_stock',
    id_field: str = 'product_code'
) -> List[Dict[str, Any]]:
    """
    Get list of items with stock below threshold

    Args:
        inventory: Inventory dictionary
        threshold: Stock level threshold
        stock_field: Name of the stock field
        id_field: Name of the ID field

    Returns:
        List of items with low stock

    Example:
        >>> low_stock = get_low_stock_items(
        ...     inventory=accessories_inventory,
        ...     threshold=10
        ... )
    """
    low_stock_items = []

    for item in inventory.values():
        if item.get(stock_field, 0) < threshold:
            low_stock_items.append(item)

    return low_stock_items
