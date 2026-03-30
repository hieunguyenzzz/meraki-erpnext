"""
Expense endpoints.

Existing:
  POST /expense/quick            — create + submit Journal Entry atomically
  POST /expense/supplier-invoice — create + submit Purchase Invoice atomically

New (wedding expenses with approval):
  GET  /expenses                 — list Purchase Invoices used as expenses
  POST /expense/wedding          — create Draft PI (pending approval)
  POST /expense/{name}/approve   — submit Draft PI (finance approves)
  POST /expense/{name}/reject    — delete Draft PI (finance rejects)
  DELETE /expense/{name}         — delete expense (Draft or Submitted)
"""

import json

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from webhook_v2.services.erpnext import ERPNextClient
from webhook_v2.core.logging import get_logger
from webhook_v2.routers.wedding import _cancel, _delete_gl_entries, _delete_payment_ledger_entries

log = get_logger(__name__)
router = APIRouter()

COMPANY = "Meraki Wedding Planner"
CASH_ACCOUNT = "Cash - MWP"


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

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


class WeddingExpenseRequest(BaseModel):
    project: str           # PROJ-XXXX
    date: str              # YYYY-MM-DD
    description: str
    amount: float
    account: str           # e.g. "Travel Expenses - MWP"
    supplier: str = "Company Expense"


# ---------------------------------------------------------------------------
# Existing endpoints
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# New: Wedding expense endpoints (with approval workflow)
# ---------------------------------------------------------------------------

@router.get("/expenses")
def list_expenses(project: str | None = None):
    """List Purchase Invoices used as expenses (Draft=pending + Submitted=approved)."""
    client = ERPNextClient()

    filters = [["docstatus", "in", [0, 1]]]
    if project:
        filters.append(["project", "=", project])

    pis = client._get("/api/resource/Purchase Invoice", params={
        "filters": json.dumps(filters),
        "fields": json.dumps([
            "name", "supplier", "supplier_name", "posting_date",
            "grand_total", "project", "docstatus", "owner",
        ]),
        "order_by": "posting_date desc",
        "limit_page_length": 0,
    }).get("data", [])

    result = []
    for pi in pis:
        docstatus = pi.get("docstatus", 0)
        status = "Pending" if docstatus == 0 else "Approved" if docstatus == 1 else "Unknown"

        # Fetch first item from parent doc (child table direct access returns 403)
        pi_doc = client._get(f"/api/resource/Purchase Invoice/{pi['name']}").get("data", {})
        items = pi_doc.get("items", [])
        first_item = items[0] if items else {}

        result.append({
            "name": pi["name"],
            "posting_date": pi["posting_date"],
            "amount": pi["grand_total"],
            "description": first_item.get("item_name", ""),
            "account": first_item.get("expense_account", ""),
            "project": pi.get("project", ""),
            "supplier": pi.get("supplier", ""),
            "supplier_name": pi.get("supplier_name", ""),
            "status": status,
            "docstatus": docstatus,
            "submitted_by": pi.get("owner", ""),
        })

    return result


@router.post("/expense/wedding")
def create_wedding_expense(req: WeddingExpenseRequest):
    """Create a Draft Purchase Invoice for a wedding expense (pending approval)."""
    client = ERPNextClient()

    if req.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than 0")

    amount = round(req.amount)

    pi_values = {
        "supplier": req.supplier,
        "posting_date": req.date,
        "set_posting_time": 1,
        "company": COMPANY,
        "project": req.project,
        "update_stock": 0,
        "items": [{
            "item_code": "EXPENSE-ITEM",
            "item_name": req.description,
            "description": req.description,
            "expense_account": req.account,
            "qty": 1,
            "rate": amount,
            "project": req.project,
        }],
    }

    try:
        pi_resp = client._post("/api/resource/Purchase Invoice", pi_values)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to create expense: {e}")

    pi_name = pi_resp.get("data", {}).get("name")
    if not pi_name:
        raise HTTPException(status_code=500, detail="Purchase Invoice created but name not returned")

    log.info("wedding_expense_created", pi=pi_name, project=req.project, amount=amount)
    return {"name": pi_name, "status": "Pending"}


@router.post("/expense/{pi_name}/approve")
def approve_expense(pi_name: str):
    """Approve (submit) a Draft Purchase Invoice."""
    client = ERPNextClient()

    pi = client._get(f"/api/resource/Purchase Invoice/{pi_name}").get("data", {})
    if not pi:
        raise HTTPException(status_code=404, detail="Purchase Invoice not found")
    if pi.get("docstatus") != 0:
        raise HTTPException(status_code=400, detail="Only Draft expenses can be approved")

    try:
        client._post("/api/method/frappe.client.submit", {"doc": pi})
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to approve expense: {e}")

    log.info("expense_approved", pi=pi_name)
    return {"success": True}


@router.post("/expense/{pi_name}/reject")
def reject_expense(pi_name: str):
    """Reject (delete) a Draft Purchase Invoice."""
    client = ERPNextClient()

    pi = client._get(f"/api/resource/Purchase Invoice/{pi_name}").get("data", {})
    if not pi:
        raise HTTPException(status_code=404, detail="Purchase Invoice not found")
    if pi.get("docstatus") != 0:
        raise HTTPException(status_code=400, detail="Only Draft expenses can be rejected")

    try:
        client._delete(f"/api/resource/Purchase Invoice/{pi_name}")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to reject expense: {e}")

    log.info("expense_rejected", pi=pi_name)
    return {"success": True}


@router.delete("/expense/{pi_name}")
def delete_expense(pi_name: str):
    """Delete a Purchase Invoice (Draft: just delete; Submitted: cancel first)."""
    client = ERPNextClient()

    pi = client._get(f"/api/resource/Purchase Invoice/{pi_name}").get("data", {})
    if not pi:
        raise HTTPException(status_code=404, detail="Purchase Invoice not found")

    docstatus = pi.get("docstatus", 0)

    if docstatus == 1:
        # Submitted — cancel, then clean up ledger entries
        _cancel(client, "Purchase Invoice", pi_name)
        _delete_gl_entries(client, pi_name)
        _delete_payment_ledger_entries(client, pi_name)

    try:
        client._delete(f"/api/resource/Purchase Invoice/{pi_name}")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to delete expense: {e}")

    log.info("expense_deleted", pi=pi_name, was_submitted=(docstatus == 1))
    return {"success": True}
