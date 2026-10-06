"""
Account Holders and Credit Sales API
Tracks credit customers and their transactions
"""
import re
from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from datetime import datetime
from ...models.models import AccountHolder, CreditSale
from ...services.inventory import process_credit_sale
from ...config import resolve_fuel_price
from ...services.relationship_validation import validate_create
from ...services.credit_sale_owner import (
    resolve_sale_attendant, creating_handover_id, shift_attendants, find_credit_duplicate, describe_duplicate,
)
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


@router.get("/sales")
async def search_credit_sales(
    account_id: Optional[str] = None,
    date: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    shift_type: Optional[str] = None,
    attendant_id: Optional[str] = None,
    fuel_type: Optional[str] = None,
    ctx: dict = Depends(get_station_context),
):
    """
    Search credit sales across every account with optional filters, instead
    of only being able to pull one account's entire history via
    /sales/account/{account_id}: date (exact, or a from_date/to_date range),
    shift_type, attendant_id, and fuel_type.

    Each result carries the attendant the sale is bound to (see
    services/credit_sale_owner): the stamped attendant_id, else the handover
    that created it, else the only attendant on that shift. Historical sales
    with none of those simply show blank attendant fields — attendant binding
    applies to sales recorded from its rollout onward and older records are
    deliberately left as they are. shift_type comes from the shift record
    (falling back to the handover).

    Declared here, before GET /{account_id}, deliberately — that catch-all
    single-segment route would otherwise swallow "GET /sales" by matching
    "sales" as an account_id, since FastAPI matches routes in declaration
    order and both are exactly one path segment.
    """
    from .attendant_handover import _load_handovers

    station_id = ctx["station_id"]
    storage = ctx["storage"]
    accounts_data = storage.get('accounts', {})
    credit_sales_data = storage.get('credit_sales', [])
    handovers = _load_handovers(station_id)
    shifts = storage.get('shifts', {})

    results = []
    for sale in credit_sales_data:
        if sale.get("voided"):
            continue
        if account_id and sale.get("account_id") != account_id:
            continue
        sale_date = sale.get("date", "")
        if date and sale_date != date:
            continue
        if from_date and sale_date < from_date:
            continue
        if to_date and sale_date > to_date:
            continue
        if fuel_type and (sale.get("fuel_type") or "").lower() != fuel_type.lower():
            continue

        owner = resolve_sale_attendant(sale, handovers, shifts)
        sale_attendant_id = owner[0] if owner else ""
        if attendant_id and sale_attendant_id != attendant_id:
            continue

        ho = handovers.get(creating_handover_id(sale) or "", {})
        sale_shift_type = (shifts.get(sale.get("shift_id", ""), {}).get("shift_type")
                           or ho.get("shift_type", "") or "")
        if shift_type and sale_shift_type.lower() != shift_type.lower():
            continue

        results.append({
            **{k: v for k, v in sale.items() if k != "voided"},
            "account_name": accounts_data.get(sale.get("account_id", ""), {}).get("account_name", sale.get("account_id", "")),
            "attendant_id": sale_attendant_id,
            "attendant_name": owner[1] if owner else "",
            "shift_type": sale_shift_type,
        })

    results.sort(key=lambda s: (s.get("date", ""), s.get("sale_id", "")), reverse=True)
    return results


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


def _gate_sale_attendant(storage: dict, station_id: str, shift_id: str, attendant_id: Optional[str], ctx: dict):
    """
    The attendant gate every credit sale entered outside a handover must pass.
    Returns (shift, attendant_name, canonical_handover_or_None).

    A sale is accepted only for a real shift, a named attendant who is on that
    shift's roster, and while that attendant's handover can still change (not
    approved, day not closed, shift not locked). An attendant can only record
    sales against themselves.
    """
    from .attendant_handover import _load_handovers
    from ...services.handover_lookup import get_canonical_handover
    from ...services.shift_status import assert_shift_editable
    from ...database.station_files import load_station_json

    shift = storage.get('shifts', {}).get(shift_id or "")
    if not shift:
        raise HTTPException(status_code=400, detail="Select the shift this sale was made on.")
    if not attendant_id:
        raise HTTPException(status_code=400, detail="Select the attendant who made this sale.")
    roster = shift_attendants(shift)
    if attendant_id not in roster:
        raise HTTPException(status_code=400,
                            detail=f"That attendant is not assigned to shift {shift_id}.")
    role = ctx.get("role")
    role_str = role.value if hasattr(role, "value") else str(role)
    if role_str == "user" and attendant_id != ctx.get("user_id"):
        raise HTTPException(status_code=403, detail="You can only record sales made by yourself.")
    assert_shift_editable(shift)
    close_offs = load_station_json(station_id, "daily_close_offs.json", default={})
    if shift.get("date", "") in close_offs:
        raise HTTPException(status_code=400, detail=f"Day {shift.get('date')} has been closed off.")
    handover = get_canonical_handover(station_id, shift_id, attendant_id, handovers=_load_handovers(station_id))
    if handover and handover.get("review_status") == "approved":
        raise HTTPException(
            status_code=400,
            detail=f"{roster[attendant_id]}'s handover for this shift is already approved. "
                   "It must be voided before more sales can be added to it.")
    return shift, roster[attendant_id], handover


def _attach_sale_to_handover(station_id: str, storage: dict, handover_id: str, sale_dict: dict,
                             account_name: str, performed_by: str):
    """
    Add a just-recorded sale to its attendant's already-closed handover so the
    handover's credit total and cash variance reflect it straight away. A
    handover still at readings stage picks the sale up when it's closed
    (submit_closing pulls in every sale bound to that attendant).
    """
    from .attendant_handover import (
        _load_handovers, _save_handovers, _recalculate_reconciliation, _record_reconciliation_adjustment,
    )
    handovers = _load_handovers(station_id)
    handover = handovers.get(handover_id)
    if not handover or handover.get("phase") != "completed":
        return
    difference_before = handover.get("difference", 0)
    details = list(handover.get("credit_sale_details") or [])
    details.append({
        "account_id": sale_dict["account_id"], "account_name": account_name,
        "fuel_type": sale_dict["fuel_type"], "volume": sale_dict["volume"],
        "price_per_liter": round(sale_dict["amount"] / sale_dict["volume"], 2) if sale_dict.get("volume") else 0,
        "amount": sale_dict["amount"], "source": "pre_existing", "sale_id": sale_dict["sale_id"],
        "driver_name": sale_dict.get("driver_name"), "vehicle_reg": sale_dict.get("vehicle_reg"),
        "coupon_serial": sale_dict.get("coupon_serial"), "auth_reference": sale_dict.get("auth_reference"),
    })
    handover["credit_sale_details"] = details
    handover["credit_sales"] = round((handover.get("credit_sales") or 0) + sale_dict["amount"], 2)
    _recalculate_reconciliation(handover, storage)
    _record_reconciliation_adjustment(
        handover, "credit_sale", f"Credit sale {sale_dict['sale_id']} added from Accounts",
        sale_dict["amount"], difference_before, performed_by,
    )
    _save_handovers(handovers, station_id)


@router.post("/sales", response_model=CreditSale)
async def record_credit_sale(sale: CreditSale, ctx: dict = Depends(get_station_context)):
    """
    Record a credit sale (prepaid or postpaid account) made by a named attendant
    on a named shift. Passes the attendant gate (_gate_sale_attendant) first;
    the attendant is stamped on the record and can't be changed afterwards.
    Generates auth_reference from client code, vehicle reg, date and coupon serial.
    """
    storage = ctx["storage"]
    station_id = ctx["station_id"]
    accounts_data = storage.get('accounts', {})
    credit_sales_data = storage.setdefault('credit_sales', [])

    account = accounts_data.get(sale.account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    if account.get("is_suspended"):
        raise HTTPException(status_code=400, detail=f"Account '{account.get('account_name')}' is suspended and cannot receive credit sales.")

    shift, attendant_name, handover = _gate_sale_attendant(storage, station_id, sale.shift_id, sale.attendant_id, ctx)

    # Same duplicate rule as handover entry, across every attendant: a coupon
    # already recorded by anyone can't be charged to the client again.
    dup = find_credit_duplicate(credit_sales_data, sale.account_id, sale.fuel_type, sale.coupon_serial, sale.shift_id)
    if dup:
        from .attendant_handover import _load_handovers
        raise HTTPException(status_code=409, detail=f"{account.get('account_name', sale.account_id)}: "
                            f"{describe_duplicate(dup, _load_handovers(station_id), storage.get('shifts', {}))}.")

    sale_dict = sale.dict()
    # Server-owned identity and attribution: the client can't pick the id,
    # the date (it's the shift's date), or rename the attendant.
    sale_dict['sale_id'] = f"CS-{datetime.now().strftime('%Y%m%d%H%M%S%f')}"
    sale_dict['date'] = shift.get("date", sale.date)
    sale_dict['attendant_name'] = attendant_name
    sale_dict['handover_id'] = None

    # Price is always resolved server-side — never trust a client-supplied
    # amount. The account's negotiated rate wins when configured, otherwise
    # the current fuel price list applies. This form only sells fuel, so
    # resolve_fuel_price (Diesel/Petrol) always applies.
    price = account.get('default_price_per_liter') or resolve_fuel_price(sale.fuel_type, storage)
    if not price or price <= 0:
        raise HTTPException(status_code=400, detail=f"No price available for '{sale.fuel_type}'.")
    sale_dict['amount'] = round(sale.volume * price, 2)

    # Generate auth reference when coupon details are present
    if sale.coupon_serial and sale.vehicle_reg:
        client_code = account.get('client_code') or ''
        if not client_code:
            existing_codes = {a.get('client_code', '') for a in accounts_data.values()}
            client_code = generate_client_code(account.get('account_name', ''), existing_codes)
            account['client_code'] = client_code
        sale_dict['auth_reference'] = generate_auth_reference(
            client_code, sale.vehicle_reg, sale_dict["date"], sale.coupon_serial
        )

    validate_create('credit_sales', sale_dict, storage=storage)

    process_credit_sale(
        accounts=accounts_data,
        sales_log=credit_sales_data,
        account_id=sale.account_id,
        amount=sale_dict['amount'],
        sale_data=sale_dict,
    )

    attached = bool(handover and handover.get("phase") == "completed")
    if attached:
        _attach_sale_to_handover(station_id, storage, handover["handover_id"], sale_dict,
                                 account.get("account_name", sale.account_id), ctx["username"])

    log_audit_event(
        station_id=station_id, action="credit_sale_recorded",
        performed_by=ctx["username"], entity_type="credit_sale", entity_id=sale_dict['sale_id'],
        details={"account_id": sale.account_id, "shift_id": sale.shift_id, "amount": sale_dict['amount'],
                 "attendant_id": sale.attendant_id, "attendant_name": attendant_name,
                 "attached_to_handover": handover["handover_id"] if attached else None},
    )
    save_station_storage(station_id)
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
        if sale["shift_id"] == shift_id and not sale.get("voided")
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
        if sale["account_id"] == account_id and not sale.get("voided")
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
