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
    Process a credit sale, enforcing Pre-Paid or Post-Paid rules.

    Pre-Paid:  current_balance = remaining funds (decreases with sales).
               Blocked when sale.amount > current_balance + approved_overdraft.
    Post-Paid: current_balance = amount owed (increases with sales).
               Blocked when current_balance + sale.amount > credit_limit + approved_overdraft.

    approved_overdraft is a fixed extra allowance the owner sets via the
    approve-overdraft endpoint — it is only ever changed by that manual
    action, never consumed automatically here. (Auto-decrementing it per
    sale used to double-count usage: the balance already reflects the
    draw, so also shrinking the overdraft shrank the ceiling faster than
    the balance grew, leaving accounts blocked while the UI still showed
    unused overdraft remaining.)
    Unknown/legacy account_type values are treated as Post-Paid.
    """
    if account_id not in accounts:
        raise HTTPException(status_code=404, detail="Account not found")

    account = accounts[account_id]
    account_type = account.get('account_type', 'Post-Paid')
    if account_type not in ('Pre-Paid', 'Post-Paid'):
        account_type = 'Post-Paid'

    current_balance = account.get('current_balance', 0.0)
    approved_overdraft = account.get('approved_overdraft', 0.0)

    if account_type == 'Pre-Paid':
        available = round(current_balance + approved_overdraft, 2)
        if amount > available:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient balance. Available: {available:.2f}, Requested: {amount:.2f}"
            )
        # current_balance can go negative here (drawing into the overdraft
        # allowance) — approved_overdraft itself is untouched; it's a fixed
        # ceiling addition the owner manages, not a per-sale wallet.
        account['current_balance'] = round(current_balance - amount, 2)
    else:
        credit_limit = account.get('credit_limit', 0.0)
        effective_ceiling = round(credit_limit + approved_overdraft, 2)
        if round(current_balance + amount, 2) > effective_ceiling:
            raise HTTPException(
                status_code=400,
                detail=f"Credit ceiling reached. Ceiling: {credit_limit:.2f}, Owed: {current_balance:.2f}, Requested: {amount:.2f}"
            )
        account['current_balance'] = round(current_balance + amount, 2)

    sales_log.append(sale_data)
    return sale_data


def reverse_credit_sale(
    accounts: Dict[str, Dict[str, Any]],
    account_id: str,
    amount: float,
    balance_field: str = 'current_balance',
) -> None:
    """
    Undo the balance side of `process_credit_sale` for a voided sale.

    current_balance is a plain running total in both directions — never
    clamped, since approved_overdraft is a fixed ceiling addition rather
    than a wallet process_credit_sale draws from — so this is exactly
    reversible regardless of how many other sales have landed on the
    account since.
    """
    account = accounts.get(account_id)
    if not account:
        return
    account_type = account.get('account_type', 'Post-Paid')
    if account_type not in ('Pre-Paid', 'Post-Paid'):
        account_type = 'Post-Paid'

    current_balance = account.get(balance_field, 0.0)
    if account_type == 'Pre-Paid':
        account[balance_field] = round(current_balance + amount, 2)
    else:
        account[balance_field] = round(current_balance - amount, 2)


def reapply_credit_sale(
    accounts: Dict[str, Dict[str, Any]],
    account_id: str,
    amount: float,
    balance_field: str = 'current_balance',
) -> None:
    """
    Re-apply the balance side of `process_credit_sale` for a sale being
    un-voided — the mirror of `reverse_credit_sale`. Deliberately skips the
    ceiling/limit checks `process_credit_sale` enforces on a brand-new sale:
    this is restoring a sale that already happened, not creating one, so it
    must succeed even if the account is now closer to its limit than it was
    at the time.
    """
    account = accounts.get(account_id)
    if not account:
        return
    account_type = account.get('account_type', 'Post-Paid')
    if account_type not in ('Pre-Paid', 'Post-Paid'):
        account_type = 'Post-Paid'

    current_balance = account.get(balance_field, 0.0)
    if account_type == 'Pre-Paid':
        account[balance_field] = round(current_balance - amount, 2)
    else:
        account[balance_field] = round(current_balance + amount, 2)


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
