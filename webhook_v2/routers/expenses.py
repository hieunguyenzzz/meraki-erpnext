"""
Expense creation endpoints.

POST /expense/quick            — create + submit Journal Entry atomically
POST /expense/supplier-invoice — create + submit Purchase Invoice atomically
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from webhook_v2.services.erpnext import ERPNextClient
from webhook_v2.core.logging import get_logger

log = get_logger(__name__)
router = APIRouter()

COMPANY = "Meraki Wedding Planner"
CASH_ACCOUNT = "Cash - MWP"


class QuickExpenseRequest(BaseModel):
    date: str              # YYYY-MM-DD
    description: str
    amount: float
    account: str           # GL debit account code
    project: str | None = None


class SupplierInvoiceItem(BaseModel):
    description: str
    account: str           # expense account
    amount: float


class SupplierInvoiceRequest(BaseModel):
    supplier: str
    date: str              # YYYY-MM-DD
    items: list[SupplierInvoiceItem]


@router.post("/expense/quick")
def create_quick_expense(req: QuickExpenseRequest):
    """Create and submit a Journal Entry for a quick expense (atomic)."""
    client = ERPNextClient()

    if req.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than 0")

    amount = round(req.amount)

    je_values = {
        "posting_date": req.date,
        "voucher_type": "Journal Entry",
        "company": COMPANY,
        "user_remark": req.description,
        "accounts": [
            {
                "account": req.account,
                "debit_in_account_currency": amount,
                "credit_in_account_currency": 0,
            },
            {
                "account": CASH_ACCOUNT,
                "debit_in_account_currency": 0,
                "credit_in_account_currency": amount,
            },
        ],
    }
    if req.project:
        je_values["project"] = req.project

    try:
        je_resp = client._post("/api/resource/Journal Entry", je_values)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to create journal entry: {e}")

    je_name = je_resp.get("data", {}).get("name")
    if not je_name:
        raise HTTPException(status_code=500, detail="Journal Entry created but name not returned")

    # Submit
    try:
        full_je = client._get(f"/api/resource/Journal Entry/{je_name}").get("data", {})
        client._post("/api/method/frappe.client.submit", {"doc": full_je})
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to submit journal entry: {e}")

    log.info("quick_expense_created", je=je_name, amount=amount)
    return {"journal_entry": je_name}


@router.post("/expense/supplier-invoice")
def create_supplier_invoice(req: SupplierInvoiceRequest):
    """Create and submit a Purchase Invoice for a supplier expense (atomic)."""
    client = ERPNextClient()

    if not req.items:
        raise HTTPException(status_code=400, detail="At least one item is required")

    for item in req.items:
        if item.amount <= 0:
            raise HTTPException(status_code=400, detail="All amounts must be greater than 0")

    pi_values = {
        "supplier": req.supplier,
        "posting_date": req.date,
        "company": COMPANY,
        "items": [
            {
                "item_code": "EXPENSE-ITEM",
                "item_name": item.description,
                "description": item.description,
                "expense_account": item.account,
                "qty": 1,
                "rate": round(item.amount),
            }
            for item in req.items
        ],
    }

    try:
        pi_resp = client._post("/api/resource/Purchase Invoice", pi_values)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to create purchase invoice: {e}")

    pi_name = pi_resp.get("data", {}).get("name")
    if not pi_name:
        raise HTTPException(status_code=500, detail="Purchase Invoice created but name not returned")

    # Submit
    try:
        full_pi = client._get(f"/api/resource/Purchase Invoice/{pi_name}").get("data", {})
        client._post("/api/method/frappe.client.submit", {"doc": full_pi})
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to submit purchase invoice: {e}")

    log.info("supplier_invoice_created", pi=pi_name)
    return {"purchase_invoice": pi_name}
