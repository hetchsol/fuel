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
from typing import Dict, List, Any


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
