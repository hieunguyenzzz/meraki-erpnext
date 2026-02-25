"""
Wedding management endpoints - server-side cascade delete.

Finance-safe deletion strategy:
- Payment Entries: cancel only (preserves GL reversal entries + audit trail)
- Sales Invoices: cancel only (preserves GL reversal entries + audit trail)
- Sales Order: cancel + delete (no GL entries, safe to remove)
- Project: delete

Cancellation already creates reverse GL entries so the account balances
are zeroed. We do NOT delete financial documents to keep the document
numbering sequence intact and preserve the accounting audit trail.
"""

import json

from fastapi import APIRouter
from webhook_v2.services.erpnext import ERPNextClient
from webhook_v2.core.logging import get_logger

log = get_logger(__name__)
router = APIRouter()


@router.post("/wedding/{project_name}/delete")
def delete_wedding(project_name: str):
    """
    Remove a wedding project while preserving accounting integrity.

    Payment Entries and Sales Invoices are cancelled (not deleted) so GL
    reversal entries remain intact and document numbering has no gaps.
    Only the Sales Order and Project are deleted from the system.
    """
    client = ERPNextClient()

    # 1. Find all Sales Invoices linked to this project
    invoices = client._get("/api/resource/Sales Invoice", params={
        "filters": json.dumps([["project", "=", project_name]]),
        "fields": json.dumps(["name", "docstatus"]),
        "limit_page_length": 100,
    }).get("data", [])

    total_payment_entries = 0

    for inv in invoices:
        # 2. Find Payment Entries referencing this invoice (filter on child table)
        pe_data = client._get("/api/resource/Payment Entry", params={
            "filters": json.dumps([
                ["Payment Entry Reference", "reference_name", "=", inv["name"]],
            ]),
            "fields": json.dumps(["name", "docstatus"]),
            "limit_page_length": 100,
        }).get("data", [])

        # 3. Cancel each Payment Entry (keep in system for audit trail)
        for pe in pe_data:
            if pe["docstatus"] == 1:
                try:
                    client._post(
                        "/api/method/frappe.client.cancel",
                        {"doc": {"doctype": "Payment Entry", "name": pe["name"]}},
                    )
                    log.info("payment_entry_cancelled", pe=pe["name"])
                except Exception as e:
                    log.warning("payment_entry_cancel_error", pe=pe["name"], error=str(e))
            total_payment_entries += 1

        # 4. Cancel the Invoice (keep in system for audit trail)
        if inv["docstatus"] == 1:
            try:
                client._post(
                    "/api/method/frappe.client.cancel",
                    {"doc": {"doctype": "Sales Invoice", "name": inv["name"]}},
                )
                log.info("invoice_cancelled", invoice=inv["name"])
            except Exception as e:
                log.warning("invoice_cancel_error", invoice=inv["name"], error=str(e))

    # 5. Find + cancel + delete the Sales Order (no GL entries, safe to delete)
    so_name = None
    try:
        project_doc = client._get(f"/api/resource/Project/{project_name}").get("data", {})
        so_name = project_doc.get("sales_order")
        if so_name:
            so = client._get(f"/api/resource/Sales Order/{so_name}").get("data", {})
            if so.get("docstatus") == 1:
                try:
                    client._post(
                        "/api/method/frappe.client.cancel",
                        {"doc": {"doctype": "Sales Order", "name": so_name}},
                    )
                except Exception as e:
                    log.warning("sales_order_cancel_error", so=so_name, error=str(e))
            client._delete(f"/api/resource/Sales Order/{so_name}")
            log.info("sales_order_deleted", so=so_name)
    except Exception as e:
        log.warning("sales_order_delete_error", project=project_name, error=str(e))

    # 6. Delete the Project
    client._delete(f"/api/resource/Project/{project_name}")

    log.info(
        "wedding_deleted",
        project=project_name,
        invoices_cancelled=len(invoices),
        payment_entries_cancelled=total_payment_entries,
        sales_order_deleted=so_name,
    )
    return {
        "success": True,
        "project": project_name,
        "invoices_cancelled": len(invoices),
        "payment_entries_cancelled": total_payment_entries,
    }
