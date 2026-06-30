"""
Account Holders and Credit Sales API
Tracks credit customers and their transactions
"""
import re
from fastapi import APIRouter, HTTPException, Depends
from typing import List
from datetime import datetime
from ...models.models import AccountHolder, CreditSale
from ...services.inventory import process_credit_sale
from ...services.relationship_validation import validate_create
from ...services.audit_service import log_audit_event
from ...database.storage import save_station_storage
from .auth import get_station_context, require_manager_or_owner, require_owner

router = APIRouter()

_NOISE_WORDS = {'ltd', 'limited', 'co', 'company', 'inc', 'plc', 'pvt', 'pty', 'llc', 'and', 'the', 'of', 'group'}


def generate_auth_reference(client_code: str, vehicle_reg: str, sale_date: str, coupon_serial: str) -> str:
    """Build auth reference: {client_code}-{vehicle_reg_clean}-{DDMMYYYY}-{coupon_serial}"""
    vehicle_clean = re.sub(r'\s+', '', vehicle_reg.strip()).upper()
    try:
        y, m, d = sale_date.split('-')
        date_part = f"{d}{m}{y}"
    except Exception:
        date_part = datetime.now().strftime("%d%m%Y")
    return f"{client_code}-{vehicle_clean}-{date_part}-{coupon_serial.strip().upper()}"


def generate_client_code(name: str, existing_codes: set) -> str:
    """
    Derive a unique 3-letter client code from an account name.
    Strategy:
      3+ meaningful words  -> first letter of each of first 3 words  (e.g. Copper Belt Mining -> CBM)
      2 words              -> 2 initials + second letter of longer word (e.g. John Banda -> JBA)
      1 word               -> first 3 letters                          (e.g. Mopani -> MOP)
    Noise words (Ltd, Co, etc.) are stripped before applying the rule.
    If the result collides with an existing code, a digit suffix is appended (CBM2, CBM3 ...).
    """
    words = [w for w in re.split(r'[\s\-&.,/()]+', name.strip())
             if w and w.lower() not in _NOISE_WORDS and re.search(r'[a-zA-Z]', w)]
    if not words:
        words = re.findall(r'[a-zA-Z]+', name)

    if len(words) >= 3:
        base = (words[0][0] + words[1][0] + words[2][0]).upper()
    elif len(words) == 2:
        longer = max(words, key=len)
        extra = longer[1] if len(longer) > 1 else 'X'
        base = (words[0][0] + words[1][0] + extra).upper()
    elif len(words) == 1:
        base = (words[0][:3]).upper().ljust(3, 'X')
    else:
        base = 'ACC'

    code = base
    suffix = 2
    while code in existing_codes:
        code = base[:2] + str(suffix)
        suffix += 1
    return code


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
    # Auto-generate client_code if not supplied
    if not (item_dict.get('client_code') or '').strip():
        existing_codes = {a.get('client_code', '') for a in accounts_data.values()}
        item_dict['client_code'] = generate_client_code(item_dict['account_name'], existing_codes)
    # Validate account type
    if item_dict.get('account_type') not in ('Pre-Paid', 'Post-Paid'):
        raise HTTPException(status_code=400, detail="account_type must be 'Pre-Paid' or 'Post-Paid'.")
    # Pre-Paid: opening balance becomes the starting available balance.
    # Post-Paid: always starts at zero owed.
    if item_dict['account_type'] == 'Pre-Paid':
        opening = item_dict.get('opening_balance') or 0.0
        item_dict['opening_balance'] = opening
        item_dict['current_balance'] = opening
        item_dict['credit_limit'] = 0.0
    else:
        item_dict['current_balance'] = 0.0
        item_dict['opening_balance'] = None
    item_dict.setdefault('approved_overdraft', 0.0)

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
    # Balance and overdraft are managed by dedicated endpoints — never overwrite here.
    updated['current_balance'] = accounts_data[account_id].get('current_balance', 0.0)
    updated['approved_overdraft'] = accounts_data[account_id].get('approved_overdraft', 0.0)
    # Preserve opening_balance from original record
    updated['opening_balance'] = accounts_data[account_id].get('opening_balance')

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


@router.post("/{account_id}/suspend", dependencies=[Depends(require_manager_or_owner)])
async def suspend_account(account_id: str, ctx: dict = Depends(get_station_context)):
    """Suspend a credit account. Manager/owner only. Suspended accounts cannot receive new credit sales."""
    storage = ctx["storage"]
    accounts_data = storage.get('accounts', {})
    if account_id not in accounts_data:
        raise HTTPException(status_code=404, detail="Account not found")
    if accounts_data[account_id].get('is_suspended'):
        raise HTTPException(status_code=400, detail="Account is already suspended")
    accounts_data[account_id]['is_suspended'] = True
    save_station_storage(ctx["station_id"])
    log_audit_event(
        station_id=ctx["station_id"], action="account_suspend",
        performed_by=ctx["username"], entity_type="account", entity_id=account_id,
        details={"account_name": accounts_data[account_id].get("account_name")},
    )
    return AccountHolder(**accounts_data[account_id])


@router.post("/{account_id}/unsuspend", dependencies=[Depends(require_manager_or_owner)])
async def unsuspend_account(account_id: str, ctx: dict = Depends(get_station_context)):
    """Reinstate a suspended credit account. Manager/owner only."""
    storage = ctx["storage"]
    accounts_data = storage.get('accounts', {})
    if account_id not in accounts_data:
        raise HTTPException(status_code=404, detail="Account not found")
    if not accounts_data[account_id].get('is_suspended'):
        raise HTTPException(status_code=400, detail="Account is not suspended")
    accounts_data[account_id]['is_suspended'] = False
    save_station_storage(ctx["station_id"])
    log_audit_event(
        station_id=ctx["station_id"], action="account_unsuspend",
        performed_by=ctx["username"], entity_type="account", entity_id=account_id,
        details={"account_name": accounts_data[account_id].get("account_name")},
    )
    return AccountHolder(**accounts_data[account_id])


@router.delete("/{account_id}", dependencies=[Depends(require_owner)])
async def delete_account(account_id: str, ctx: dict = Depends(get_station_context)):
    """Permanently delete a credit account. Owner only."""
    storage = ctx["storage"]
    accounts_data = storage.get('accounts', {})
    if account_id not in accounts_data:
        raise HTTPException(status_code=404, detail="Account not found")
    account_name = accounts_data[account_id].get("account_name", account_id)
    del accounts_data[account_id]
    save_station_storage(ctx["station_id"])
    log_audit_event(
        station_id=ctx["station_id"], action="account_delete",
        performed_by=ctx["username"], entity_type="account", entity_id=account_id,
        details={"account_name": account_name},
    )
    return {"deleted": account_id}


@router.post("/sales", response_model=CreditSale)
async def record_credit_sale(sale: CreditSale, ctx: dict = Depends(get_station_context)):
    """Record a credit sale transaction. Generates auth_reference from client code, vehicle reg, date and coupon serial."""
    storage = ctx["storage"]
    accounts_data = storage.get('accounts', {})
    credit_sales_data = storage.setdefault('credit_sales', [])

    account = accounts_data.get(sale.account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    if account.get("is_suspended"):
        raise HTTPException(status_code=400, detail=f"Account '{account.get('account_name')}' is suspended and cannot receive credit sales.")

    sale_dict = sale.dict()

    # Generate auth reference when coupon details are present
    if sale.coupon_serial and sale.vehicle_reg:
        client_code = account.get('client_code') or ''
        if not client_code:
            existing_codes = {a.get('client_code', '') for a in accounts_data.values()}
            client_code = generate_client_code(account.get('account_name', ''), existing_codes)
            account['client_code'] = client_code
        sale_dict['auth_reference'] = generate_auth_reference(
            client_code, sale.vehicle_reg, sale.date, sale.coupon_serial
        )

    validate_create('credit_sales', sale_dict)

    process_credit_sale(
        accounts=accounts_data,
        sales_log=credit_sales_data,
        account_id=sale.account_id,
        amount=sale.amount,
        sale_data=sale_dict,
    )

    save_station_storage(ctx["station_id"])
    return CreditSale(**sale_dict)


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


@router.post("/{account_id}/payment", dependencies=[Depends(require_manager_or_owner)])
async def record_payment(account_id: str, amount: float, reference: str = None, ctx: dict = Depends(get_station_context)):
    """Record payment received from a Post-Paid account holder. Reduces the amount owed."""
    storage = ctx["storage"]
    accounts_data = storage.get('accounts', {})
    if account_id not in accounts_data:
        raise HTTPException(status_code=404, detail="Account not found")
    account = accounts_data[account_id]
    account_type = account.get('account_type', 'Post-Paid')
    if account_type not in ('Pre-Paid', 'Post-Paid'):
        account_type = 'Post-Paid'
    if account_type == 'Pre-Paid':
        raise HTTPException(status_code=400, detail="Pre-Paid accounts do not accept payments. Use the top-up endpoint to add funds.")
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Payment amount must be greater than zero.")
    if amount > account["current_balance"]:
        raise HTTPException(status_code=400, detail=f"Payment exceeds balance owed. Owed: {account['current_balance']:.2f}, Payment: {amount:.2f}")
    account["current_balance"] = round(account["current_balance"] - amount, 2)
    save_station_storage(ctx["station_id"])
    log_audit_event(
        station_id=ctx["station_id"], action="account_payment",
        performed_by=ctx["username"], entity_type="account", entity_id=account_id,
        details={"amount": amount, "reference": reference, "new_balance": account["current_balance"]},
    )
    return {"status": "success", "account_id": account_id, "amount_paid": amount,
            "new_balance": account["current_balance"], "reference": reference}


@router.post("/{account_id}/top-up", dependencies=[Depends(require_owner)])
async def top_up_account(account_id: str, amount: float, reference: str = None, ctx: dict = Depends(get_station_context)):
    """Add funds to a Pre-Paid account. Owner only."""
    storage = ctx["storage"]
    accounts_data = storage.get('accounts', {})
    if account_id not in accounts_data:
        raise HTTPException(status_code=404, detail="Account not found")
    account = accounts_data[account_id]
    account_type = account.get('account_type', 'Post-Paid')
    if account_type not in ('Pre-Paid', 'Post-Paid'):
        account_type = 'Post-Paid'
    if account_type != 'Pre-Paid':
        raise HTTPException(status_code=400, detail="Top-up is only for Pre-Paid accounts. Use the payment endpoint for Post-Paid accounts.")
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Top-up amount must be greater than zero.")
    account["current_balance"] = round(account.get("current_balance", 0.0) + amount, 2)
    save_station_storage(ctx["station_id"])
    log_audit_event(
        station_id=ctx["station_id"], action="account_top_up",
        performed_by=ctx["username"], entity_type="account", entity_id=account_id,
        details={"amount": amount, "reference": reference, "new_balance": account["current_balance"]},
    )
    return {"status": "success", "account_id": account_id, "amount_added": amount,
            "new_balance": account["current_balance"], "reference": reference}


@router.post("/{account_id}/approve-overdraft", dependencies=[Depends(require_owner)])
async def approve_overdraft(account_id: str, amount: float, ctx: dict = Depends(get_station_context)):
    """Set the approved overdraft amount for an account. Owner only. Replaces any existing overdraft approval."""
    storage = ctx["storage"]
    accounts_data = storage.get('accounts', {})
    if account_id not in accounts_data:
        raise HTTPException(status_code=404, detail="Account not found")
    if amount < 0:
        raise HTTPException(status_code=400, detail="Overdraft amount cannot be negative.")
    account = accounts_data[account_id]
    prev = account.get("approved_overdraft", 0.0)
    account["approved_overdraft"] = round(amount, 2)
    save_station_storage(ctx["station_id"])
    log_audit_event(
        station_id=ctx["station_id"], action="account_overdraft_approved",
        performed_by=ctx["username"], entity_type="account", entity_id=account_id,
        details={"previous": prev, "approved_amount": amount, "account_type": account.get("account_type")},
    )
    return {"status": "success", "account_id": account_id, "approved_overdraft": amount}


@router.get("/summary/totals")
async def get_accounts_summary(ctx: dict = Depends(get_station_context)):
    """
    Get summary of all accounts
    """
    storage = ctx["storage"]
    accounts_data = storage.get('accounts', {})

    def _effective_type(a):
        t = a.get("account_type", "Post-Paid")
        return t if t in ("Pre-Paid", "Post-Paid") else "Post-Paid"

    post_paid = [a for a in accounts_data.values() if _effective_type(a) == "Post-Paid"]
    pre_paid  = [a for a in accounts_data.values() if _effective_type(a) == "Pre-Paid"]

    total_receivables  = round(sum(a.get("current_balance", 0) for a in post_paid), 2)
    total_credit_limit = round(sum(a.get("credit_limit", 0) for a in post_paid), 2)
    total_pre_paid_balance = round(sum(a.get("current_balance", 0) for a in pre_paid), 2)

    return {
        "total_accounts": len(accounts_data),
        "post_paid_count": len(post_paid),
        "pre_paid_count": len(pre_paid),
        "total_receivables": total_receivables,
        "total_credit_limit": total_credit_limit,
        "available_post_paid_credit": round(total_credit_limit - total_receivables, 2),
        "total_pre_paid_balance": total_pre_paid_balance,
    }
