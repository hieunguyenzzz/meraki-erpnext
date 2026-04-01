"""
Expense endpoints.

Existing:
  POST /expense/quick            — create + submit Journal Entry atomically
  POST /expense/supplier-invoice — create + submit Purchase Invoice atomically

New (wedding expenses with approval):
  GET  /expenses                 — list Purchase Invoices used as expenses
  POST /expense/wedding          — create Draft PI (pending approval)
  POST /expense/{name}/approve   — submit Draft PI (finance approves)
  POST /expense/{name}/reject    — mark Draft PI as rejected
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
    category: str          # expense account name (e.g. "Travel Expenses - MWP") or legacy label
    supplier: str = "Company Expense"
    staff: str | None = None  # Employee ID (e.g. "HR-EMP-00001") — who incurred the expense


# Map wedding expense categories → GL expense accounts
CATEGORY_TO_ACCOUNT = {
    "Taxi": "Travel Expenses - MWP",
    "Flight Ticket": "Travel Expenses - MWP",
    "Hotel": "Travel Expenses - MWP",
    "F&B": "Entertainment Expenses - MWP",
    "Decoration": "Miscellaneous Expenses - MWP",
    "Printing": "Office Expenses - MWP",
    "Tips / Gratuity": "Miscellaneous Expenses - MWP",
    "Equipment Rental": "Equipment Expenses - MWP",
    "Gifts": "Entertainment Expenses - MWP",
    "Other": "Miscellaneous Expenses - MWP",
}
DEFAULT_EXPENSE_ACCOUNT = "Miscellaneous Expenses - MWP"

# Accounts to hide from the category picker (internal/system accounts)
HIDDEN_EXPENSE_ACCOUNTS = {
    "Cost of Goods Sold", "Depreciation", "Exchange Gain/Loss",
    "Expenses Included In Asset Valuation", "Expenses Included In Valuation",
    "Freight and Forwarding Charges", "Gain/Loss on Asset Disposal",
    "Impairment", "Round Off", "Salary", "Social Insurance Expense",
    "Stock Adjustment", "Write Off", "Commission on Sales",
}


def _get_finance_managers(client: ERPNextClient) -> list[str]:
    """Return email addresses of users with Accounts Manager role."""
    users = client._get("/api/resource/User", params={
        "filters": json.dumps([["enabled", "=", 1], ["user_type", "=", "System User"]]),
        "fields": json.dumps(["name"]),
        "limit_page_length": 0,
    }).get("data", [])
    managers = []
    for u in users:
        user_doc = client._get(f"/api/resource/User/{u['name']}").get("data", {})
        roles = [r.get("role") for r in user_doc.get("roles", [])]
        if "Accounts Manager" in roles:
            managers.append(u["name"])
    return managers


def _notify_finance_managers(client: ERPNextClient, pi_name: str, amount: float, project: str, description: str):
    """Send PWA Notification to all Finance Managers about a new expense."""
    try:
        # Get project name for readable message
        project_name = project
        if project:
            proj = client._get(f"/api/resource/Project/{project}", params={
                "fields": json.dumps(["project_name"]),
            }).get("data", {})
            project_name = proj.get("project_name") or project

        managers = _get_finance_managers(client)
        amount_str = f"{amount:,.0f} ₫"
        message = f"New expense pending approval: <b>{amount_str}</b> for <b>{project_name}</b> — {description}"

        for email in managers:
            try:
                client._post("/api/resource/PWA Notification", {
                    "to_user": email,
                    "from_user": "Administrator",
                    "message": message,
                    "read": 0,
                    "reference_document_type": "Purchase Invoice",
                    "reference_document_name": pi_name,
                })
            except Exception as e:
                log.warning("expense_notification_failed", to_user=email, error=str(e))

        log.info("expense_notifications_sent", pi=pi_name, recipients=len(managers))
    except Exception as e:
        log.warning("expense_notification_error", pi=pi_name, error=str(e))


class CreateCategoryRequest(BaseModel):
    name: str  # e.g. "Office Rent"


@router.get("/expense/categories")
def list_expense_categories():
    """List expense accounts tagged as wedding expense categories."""
    client = ERPNextClient()
    accounts = client._get("/api/resource/Account", params={
        "filters": json.dumps([
            ["root_type", "=", "Expense"],
            ["is_group", "=", 0],
            ["is_custom_wedding_expense", "=", 1],
        ]),
        "fields": json.dumps(["name", "account_name"]),
        "limit_page_length": 0,
    }).get("data", [])
    return [
        {"name": a["name"], "account_name": a["account_name"].replace(" - MWP", "")}
        for a in accounts
        if a["account_name"] not in HIDDEN_EXPENSE_ACCOUNTS
    ]


@router.post("/expense/categories")
def create_expense_category(req: CreateCategoryRequest):
    """Create a new expense account under Indirect Expenses."""
    client = ERPNextClient()
    account_name = req.name.strip()
    if not account_name:
        raise HTTPException(status_code=400, detail="Name is required")

    # Check if already exists
    full_name = f"{account_name} - MWP"
    existing = client._get("/api/resource/Account", params={
        "filters": json.dumps([["name", "=", full_name]]),
        "fields": json.dumps(["name", "account_name"]),
        "limit_page_length": 1,
    }).get("data", [])
    if existing:
        return {"name": existing[0]["name"], "account_name": existing[0]["account_name"]}

    # Create under Indirect Expenses, tagged as wedding expense
    result = client._post("/api/resource/Account", {
        "account_name": account_name,
        "parent_account": "Indirect Expenses - MWP",
        "root_type": "Expense",
        "report_type": "Profit and Loss",
        "account_type": "Expense Account",
        "company": COMPANY,
        "is_group": 0,
        "is_custom_wedding_expense": 1,
    }).get("data", {})

    display_name = result.get("account_name", "").replace(" - MWP", "")
    return {"name": result.get("name"), "account_name": display_name}


# ---------------------------------------------------------------------------
# Existing endpoints
# ---------------------------------------------------------------------------

@router.post("/expense/quick")
def create_quick_expense(req: QuickExpenseRequest):
    """Create and submit a Purchase Invoice for a quick expense (atomic)."""
    client = ERPNextClient()

    if req.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than 0")

    amount = round(req.amount)

    pi_values = {
        "supplier": "Company Expense",
        "posting_date": req.date,
        "set_posting_time": 1,
        "company": COMPANY,
        "items": [{
            "item_code": "EXPENSE-ITEM",
            "item_name": req.description,
            "description": req.description,
            "expense_account": req.account,
            "qty": 1,
            "rate": amount,
        }],
    }
    if req.project:
        pi_values["project"] = req.project
        pi_values["items"][0]["project"] = req.project

    try:
        pi_resp = client._post("/api/resource/Purchase Invoice", pi_values)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to create expense: {e}")

    pi_name = pi_resp.get("data", {}).get("name")
    if not pi_name:
        raise HTTPException(status_code=500, detail="Purchase Invoice created but name not returned")

    # Submit
    try:
        full_pi = client._get(f"/api/resource/Purchase Invoice/{pi_name}").get("data", {})
        client._post("/api/method/frappe.client.submit", {"doc": full_pi})
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to submit expense: {e}")

    log.info("quick_expense_created", pi=pi_name, amount=amount)
    return {"purchase_invoice": pi_name}


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
            "custom_rejected", "custom_expense_staff",
        ]),
        "order_by": "posting_date desc",
        "limit_page_length": 0,
    }).get("data", [])

    # Batch-fetch attached files for all PIs (for receipt thumbnails)
    pi_names = [pi["name"] for pi in pis]
    file_map: dict[str, str] = {}  # pi_name -> first image file_url
    if pi_names:
        try:
            files = client._get("/api/resource/File", params={
                "filters": json.dumps([
                    ["attached_to_doctype", "=", "Purchase Invoice"],
                    ["attached_to_name", "in", pi_names],
                    ["file_url", "is", "set"],
                ]),
                "fields": json.dumps(["attached_to_name", "file_url"]),
                "limit_page_length": 0,
            }).get("data", [])
            for f in files:
                doc_name = f.get("attached_to_name")
                if doc_name and doc_name not in file_map:
                    file_map[doc_name] = f["file_url"]
        except Exception:
            pass

    result = []
    for pi in pis:
        docstatus = pi.get("docstatus", 0)
        rejected = pi.get("custom_rejected", 0)
        if docstatus == 0 and rejected:
            status = "Rejected"
        elif docstatus == 0:
            status = "Pending"
        elif docstatus == 1:
            status = "Approved"
        else:
            status = "Unknown"

        # Fetch first item from parent doc (child table direct access returns 403)
        pi_doc = client._get(f"/api/resource/Purchase Invoice/{pi['name']}").get("data", {})
        items = pi_doc.get("items", [])
        first_item = items[0] if items else {}

        item_name = first_item.get("item_name", "")
        category = pi_doc.get("remarks", "")
        # If no remarks, try to extract category from "Category: Description" format
        if not category and ": " in item_name:
            category = item_name.split(": ", 1)[0]
        description = item_name
        # Strip category prefix from description for cleaner display
        if category and description.startswith(f"{category}: "):
            description = description[len(f"{category}: "):]

        result.append({
            "name": pi["name"],
            "posting_date": pi["posting_date"],
            "amount": pi["grand_total"],
            "description": description,
            "category": category,
            "account": first_item.get("expense_account", ""),
            "project": pi.get("project", ""),
            "supplier": pi.get("supplier", ""),
            "supplier_name": pi.get("supplier_name", ""),
            "status": status,
            "docstatus": docstatus,
            "submitted_by": pi.get("owner", ""),
            "staff": pi.get("custom_expense_staff", ""),
            "receipt_url": file_map.get(pi["name"]),
        })

    return result


@router.post("/expense/wedding")
def create_wedding_expense(req: WeddingExpenseRequest):
    """Create a Draft Purchase Invoice for a wedding expense (pending approval)."""
    client = ERPNextClient()

    if req.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than 0")

    amount = round(req.amount)

    # Accept either a full account name ("Travel Expenses - MWP") or a legacy label ("Taxi")
    if req.category.endswith(" - MWP"):
        expense_account = req.category
    else:
        expense_account = CATEGORY_TO_ACCOUNT.get(req.category, DEFAULT_EXPENSE_ACCOUNT)
    item_name = req.description or "Expense"

    pi_values = {
        "supplier": req.supplier,
        "posting_date": req.date,
        "set_posting_time": 1,
        "company": COMPANY,
        "project": req.project,
        "update_stock": 0,
        "remarks": req.category,
        "items": [{
            "item_code": "EXPENSE-ITEM",
            "item_name": item_name,
            "description": item_name,
            "expense_account": expense_account,
            "qty": 1,
            "rate": amount,
            "project": req.project,
        }],
    }
    if req.staff:
        pi_values["custom_expense_staff"] = req.staff

    try:
        pi_resp = client._post("/api/resource/Purchase Invoice", pi_values)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to create expense: {e}")

    pi_name = pi_resp.get("data", {}).get("name")
    if not pi_name:
        raise HTTPException(status_code=500, detail="Purchase Invoice created but name not returned")

    log.info("wedding_expense_created", pi=pi_name, project=req.project, amount=amount)

    # Notify Finance Managers (fire-and-forget)
    _notify_finance_managers(client, pi_name, amount, req.project, req.description or req.category)

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
    """Reject a Draft Purchase Invoice (marks as rejected, keeps visible)."""
    client = ERPNextClient()

    pi = client._get(f"/api/resource/Purchase Invoice/{pi_name}").get("data", {})
    if not pi:
        raise HTTPException(status_code=404, detail="Purchase Invoice not found")
    if pi.get("docstatus") != 0:
        raise HTTPException(status_code=400, detail="Only Draft expenses can be rejected")

    try:
        client._put(f"/api/resource/Purchase Invoice/{pi_name}", {"custom_rejected": 1})
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to reject expense: {e}")

    log.info("expense_rejected", pi=pi_name)
    return {"success": True}


class EditExpenseRequest(BaseModel):
    amount: float
    description: str | None = None
    date: str | None = None       # YYYY-MM-DD
    account: str | None = None    # expense account


@router.put("/expense/{pi_name}")
def edit_expense(pi_name: str, req: EditExpenseRequest):
    """Edit an expense by deleting the old PI and recreating with new values."""
    client = ERPNextClient()

    if req.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than 0")

    # Fetch old PI to carry forward unchanged fields
    pi = client._get(f"/api/resource/Purchase Invoice/{pi_name}").get("data", {})
    if not pi:
        raise HTTPException(status_code=404, detail="Purchase Invoice not found")

    old_items = pi.get("items", [])
    first_item = old_items[0] if old_items else {}

    supplier = pi.get("supplier", "Company Expense")
    posting_date = req.date or pi.get("posting_date")
    description = req.description if req.description is not None else (first_item.get("item_name") or "Expense")
    expense_account = req.account or first_item.get("expense_account", DEFAULT_EXPENSE_ACCOUNT)
    project = pi.get("project", "")
    amount = round(req.amount)

    # Delete old PI fully (Payment Entries + GL + PLE + doc)
    docstatus = pi.get("docstatus", 0)
    if docstatus == 1:
        # Delete linked Payment Entries first
        pe_data = client._get("/api/resource/Payment Entry", params={
            "filters": json.dumps([["Payment Entry Reference", "reference_name", "=", pi_name]]),
            "fields": json.dumps(["name", "docstatus"]),
            "limit_page_length": 100,
        }).get("data", [])
        for pe in pe_data:
            if pe["docstatus"] == 1:
                _cancel(client, "Payment Entry", pe["name"])
            _delete_gl_entries(client, pe["name"])
            _delete_payment_ledger_entries(client, pe["name"])
            try:
                client._delete(f"/api/resource/Payment Entry/{pe['name']}")
            except Exception:
                pass

        _cancel(client, "Purchase Invoice", pi_name)
        _delete_gl_entries(client, pi_name)
        _delete_payment_ledger_entries(client, pi_name)
    try:
        client._delete(f"/api/resource/Purchase Invoice/{pi_name}")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to delete old expense: {e}")

    # Create new PI
    pi_values = {
        "supplier": supplier,
        "posting_date": posting_date,
        "set_posting_time": 1,
        "company": COMPANY,
        "items": [{
            "item_code": "EXPENSE-ITEM",
            "item_name": description,
            "description": description,
            "expense_account": expense_account,
            "qty": 1,
            "rate": amount,
        }],
    }
    if project:
        pi_values["project"] = project
        pi_values["items"][0]["project"] = project

    try:
        new_pi = client._post("/api/resource/Purchase Invoice", pi_values)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to create expense: {e}")

    new_name = new_pi.get("data", {}).get("name")

    # Submit if old one was submitted
    if docstatus == 1 and new_name:
        try:
            full_pi = client._get(f"/api/resource/Purchase Invoice/{new_name}").get("data", {})
            client._post("/api/method/frappe.client.submit", {"doc": full_pi})
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to submit expense: {e}")

    log.info("expense_edited", old=pi_name, new=new_name, amount=amount)
    return {"success": True, "name": new_name}


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
