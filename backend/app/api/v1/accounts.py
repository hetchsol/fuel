"""
Account Holders and Credit Sales API
Tracks credit customers and their transactions
"""
from fastapi import APIRouter, HTTPException
from typing import List
from ...models.models import AccountHolder, CreditSale
from ...services.validated_crud import ValidatedCRUDService
from ...services.inventory import process_credit_sale
from ...services.relationship_validation import validate_create
from ...database.storage import STORAGE

router = APIRouter()

# Use central storage
accounts_data = STORAGE['accounts']
credit_sales_data = STORAGE['credit_sales']

# Initialize CRUD service for accounts with validation
accounts_service = ValidatedCRUDService(
    storage=accounts_data,
    model=AccountHolder,
    id_field='account_id',
    name='account',
    entity_type='accounts'  # Enable relationship validation
)

# Initialize with sample account holders from the spreadsheet
STORAGE['accounts'] = {
    "ACC-POS": {
        "account_id": "ACC-POS",
        "account_name": "POS Terminals",
        "account_type": "Corporate",
        "credit_limit": 100000.0,
        "current_balance": 0.0
    },
    "ACC-GENSET": {
        "account_id": "ACC-GENSET",
        "account_name": "GenSet Fuel",
        "account_type": "Internal",
        "credit_limit": 50000.0,
        "current_balance": 0.0
    },
    "ACC-KAFUBU": {
        "account_id": "ACC-KAFUBU",
        "account_name": "Kafubu",
        "account_type": "Corporate",
        "credit_limit": 200000.0,
        "current_balance": 0.0
    },
    "ACC-RONGO": {
        "account_id": "ACC-RONGO",
        "account_name": "Rongo Rongo",
        "account_type": "Corporate",
        "credit_limit": 150000.0,
        "current_balance": 0.0
    },
    "ACC-BOLATO": {
        "account_id": "ACC-BOLATO",
        "account_name": "Bolato",
        "account_type": "Corporate",
        "credit_limit": 100000.0,
        "current_balance": 0.0
    },
    "ACC-DEBS": {
        "account_id": "ACC-DEBS",
        "account_name": "Luanshya DEBS",
        "account_type": "Institution",
        "credit_limit": 300000.0,
        "current_balance": 0.0,
        "contact_person": "Director"
    },
    "ACC-VOLCANO": {
        "account_id": "ACC-VOLCANO",
        "account_name": "Volcano",
        "account_type": "Corporate",
        "credit_limit": 250000.0,
        "current_balance": 0.0
    },
    "ACC-ENGEN": {
        "account_id": "ACC-ENGEN",
        "account_name": "Engen Filling Station",
        "account_type": "Corporate",
        "credit_limit": 150000.0,
        "current_balance": 0.0
    },
    "ACC-POLICE": {
        "account_id": "ACC-POLICE",
        "account_name": "Zambia Police",
        "account_type": "Institution",
        "credit_limit": 500000.0,
        "current_balance": 0.0
    },
    "ACC-ZACODE": {
        "account_id": "ACC-ZACODE",
        "account_name": "Ministry of Education - ZACODE",
        "account_type": "Institution",
        "credit_limit": 400000.0,
        "current_balance": 0.0
    },
    "ACC-MASAITI": {
        "account_id": "ACC-MASAITI",
        "account_name": "Masaiti Council",
        "account_type": "Institution",
        "credit_limit": 300000.0,
        "current_balance": 0.0
    },
    "ACC-ORYX": {
        "account_id": "ACC-ORYX",
        "account_name": "Oryx Card",
        "account_type": "Corporate",
        "credit_limit": 200000.0,
        "current_balance": 0.0
    },
    "ACC-MUNYEMESHA": {
        "account_id": "ACC-MUNYEMESHA",
        "account_name": "Munyemesha Primary School",
        "account_type": "Institution",
        "credit_limit": 50000.0,
        "current_balance": 0.0
    },
    "ACC-MIKOMFWA": {
        "account_id": "ACC-MIKOMFWA",
        "account_name": "Mikomfwa School",
        "account_type": "Institution",
        "credit_limit": 50000.0,
        "current_balance": 0.0
    }
}

@router.get("/", response_model=List[AccountHolder])
def get_all_accounts():
    """
    Get all account holders
    """
    return accounts_service.get_all()

@router.get("/{account_id}", response_model=AccountHolder)
def get_account(account_id: str):
    """
    Get specific account details
    """
    return accounts_service.get_by_id(account_id)

@router.post("/", response_model=AccountHolder)
def create_account(account: AccountHolder):
    """
    Create new account holder
    """
    return accounts_service.create(account)

@router.put("/{account_id}")
def update_account(account_id: str, account: AccountHolder):
    """
    Update account details
    """
    return accounts_service.update(account_id, account)

@router.post("/sales", response_model=CreditSale)
def record_credit_sale(sale: CreditSale):
    """
    Record a credit sale transaction
    Updates account balance
    """
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
def get_shift_credit_sales(shift_id: str):
    """
    Get all credit sales for a specific shift
    """
    shift_sales = [
        CreditSale(**sale) for sale in credit_sales_data
        if sale["shift_id"] == shift_id
    ]
    return shift_sales

@router.get("/sales/account/{account_id}")
def get_account_sales(account_id: str):
    """
    Get all sales for a specific account
    """
    account_sales = [
        CreditSale(**sale) for sale in credit_sales_data
        if sale["account_id"] == account_id
    ]
    return account_sales

@router.post("/{account_id}/payment")
def record_payment(account_id: str, amount: float, reference: str = None):
    """
    Record payment received from account holder
    Reduces account balance
    """
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
def get_accounts_summary():
    """
    Get summary of all accounts
    """
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
