"""
Account Holders and Credit Sales API
Tracks credit customers and their transactions
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import List
from datetime import datetime
from ...models.models import AccountHolder, CreditSale
from ...services.inventory import process_credit_sale
from ...services.relationship_validation import validate_create
from ...services.audit_service import log_audit_event
from ...database.storage import save_station_storage
from .auth import get_station_context, require_manager_or_owner

router = APIRouter()


@router.get("/", response_model=List[AccountHolder])
async def get_all_accounts(ctx: dict = Depends(get_station_context)):
    """
    Get all account holders
    """
    storage = ctx["storage"]
    accounts_data = storage.get('accounts', {})
    return [AccountHolder(**a) for a in accounts_data.values()]


@router.get("/{account_id}", response_model=AccountHolder)
async def get_account(account_id: str, ctx: dict = Depends(get_station_context)):
    """
    Get specific account details
    """
    storage = ctx["storage"]
    accounts_data = storage.get('accounts', {})
    if account_id not in accounts_data:
        raise HTTPException(status_code=404, detail="Account not found")
    return AccountHolder(**accounts_data[account_id])


@router.post("/", response_model=AccountHolder, dependencies=[Depends(require_manager_or_owner)])
async def create_account(account: AccountHolder, ctx: dict = Depends(get_station_context)):
    """
    Create a new credit account holder. Manager/owner only.
    """
    storage = ctx["storage"]
    accounts_data = storage.setdefault('accounts', {})
    item_dict = account.dict()

    # Auto-generate an id when the client doesn't supply one.
    if not item_dict.get('account_id'):
        item_dict['account_id'] = f"ACC-{int(datetime.now().timestamp() * 1000)}"
    account_id = item_dict['account_id']

    if account_id in accounts_data:
        raise HTTPException(status_code=400, detail="Account already exists")
    if not (item_dict.get('account_name') or "").strip():
        raise HTTPException(status_code=400, detail="Account name is required.")
    # New accounts always start with a zero balance.
    item_dict['current_balance'] = item_dict.get('current_balance') or 0.0

    accounts_data[account_id] = item_dict
    save_station_storage(ctx["station_id"])

    log_audit_event(
        station_id=ctx["station_id"],
        action="account_create",
        performed_by=ctx["username"],
        entity_type="account",
        entity_id=account_id,
        details={"account_name": item_dict.get("account_name"),
                 "account_type": item_dict.get("account_type"),
                 "credit_limit": item_dict.get("credit_limit")},
    )
    return AccountHolder(**item_dict)


@router.put("/{account_id}", dependencies=[Depends(require_manager_or_owner)])
async def update_account(account_id: str, account: AccountHolder, ctx: dict = Depends(get_station_context)):
    """Update account details. Manager/owner only. Preserves current_balance."""
    storage = ctx["storage"]
    accounts_data = storage.get('accounts', {})
    if account_id not in accounts_data:
        raise HTTPException(status_code=404, detail="Account not found")
    if not (account.account_name or "").strip():
        raise HTTPException(status_code=400, detail="Account name is required.")

    updated = account.dict()
    updated['account_id'] = account_id
    # Balance is managed by payment/sale endpoints — never overwrite it here.
    updated['current_balance'] = accounts_data[account_id].get('current_balance', 0.0)

    accounts_data[account_id] = updated
    save_station_storage(ctx["station_id"])

    log_audit_event(
        station_id=ctx["station_id"],
        action="account_update",
        performed_by=ctx["username"],
        entity_type="account",
        entity_id=account_id,
        details={"account_name": updated.get("account_name"),
                 "credit_limit": updated.get("credit_limit"),
                 "default_price_per_liter": updated.get("default_price_per_liter")},
    )
    return AccountHolder(**updated)


@router.post("/sales", response_model=CreditSale)
async def record_credit_sale(sale: CreditSale, ctx: dict = Depends(get_station_context)):
    """
    Record a credit sale transaction
    Updates account balance
    """
    storage = ctx["storage"]
    accounts_data = storage.get('accounts', {})
    credit_sales_data = storage.get('credit_sales', [])

    # Validate foreign keys (account_id, shift_id)
    validate_create('credit_sales', sale.dict())

    process_credit_sale(
        accounts=accounts_data,
        sales_log=credit_sales_data,
        account_id=sale.account_id,
        amount=sale.amount,
        sale_data=sale.dict()
    )

    return sale


@router.get("/sales/shift/{shift_id}")
async def get_shift_credit_sales(shift_id: str, ctx: dict = Depends(get_station_context)):
    """
    Get all credit sales for a specific shift
    """
    storage = ctx["storage"]
    credit_sales_data = storage.get('credit_sales', [])
    shift_sales = [
        CreditSale(**sale) for sale in credit_sales_data
        if sale["shift_id"] == shift_id
    ]
    return shift_sales


@router.get("/sales/account/{account_id}")
async def get_account_sales(account_id: str, ctx: dict = Depends(get_station_context)):
    """
    Get all sales for a specific account
    """
    storage = ctx["storage"]
    credit_sales_data = storage.get('credit_sales', [])
    account_sales = [
        CreditSale(**sale) for sale in credit_sales_data
        if sale["account_id"] == account_id
    ]
    return account_sales


@router.post("/{account_id}/payment")
async def record_payment(account_id: str, amount: float, reference: str = None, ctx: dict = Depends(get_station_context)):
    """
    Record payment received from account holder
    Reduces account balance
    """
    storage = ctx["storage"]
    accounts_data = storage.get('accounts', {})

    if account_id not in accounts_data:
        raise HTTPException(status_code=404, detail="Account not found")

    account = accounts_data[account_id]

    if amount > account["current_balance"]:
        raise HTTPException(
            status_code=400,
            detail=f"Payment exceeds balance. Balance: {account['current_balance']}, Payment: {amount}"
        )

    account["current_balance"] -= amount

    return {
        "status": "success",
        "account_id": account_id,
        "amount_paid": amount,
        "new_balance": account["current_balance"],
        "reference": reference
    }


@router.get("/summary/totals")
async def get_accounts_summary(ctx: dict = Depends(get_station_context)):
    """
    Get summary of all accounts
    """
    storage = ctx["storage"]
    accounts_data = storage.get('accounts', {})

    total_receivables = sum(account["current_balance"] for account in accounts_data.values())
    total_credit_limit = sum(account["credit_limit"] for account in accounts_data.values())
    available_credit = total_credit_limit - total_receivables

    return {
        "total_accounts": len(accounts_data),
        "total_receivables": total_receivables,
        "total_credit_limit": total_credit_limit,
        "available_credit": available_credit,
        "accounts_by_type": {
            "Corporate": len([a for a in accounts_data.values() if a["account_type"] == "Corporate"]),
            "Institution": len([a for a in accounts_data.values() if a["account_type"] == "Institution"]),
            "Internal": len([a for a in accounts_data.values() if a["account_type"] == "Internal"])
        }
    }
