"""
Wedding management endpoints - server-side cascade delete.

Full deletion order:
  Payment Entries → cancel + delete
  Sales Invoices → cancel + delete GL entries + delete
  Sales Order → cancel + delete
  Project → delete
"""

import json

from fastapi import APIRouter
from webhook_v2.services.erpnext import ERPNextClient
from webhook_v2.core.logging import get_logger

log = get_logger(__name__)
router = APIRouter()


def _cancel(client: ERPNextClient, doctype: str, name: str) -> None:
    try:
        client._post(
            "/api/method/frappe.client.cancel",
            {"doctype": doctype, "name": name},
        )
    except Exception as e:
        log.warning("cancel_error", doctype=doctype, name=name, error=str(e))


def _delete_gl_entries(client: ERPNextClient, voucher_no: str) -> int:
    """Delete all GL entries for a voucher (required before deleting the parent doc)."""
    gl_entries = client._get("/api/resource/GL Entry", params={
        "filters": json.dumps([["voucher_no", "=", voucher_no]]),
        "fields": json.dumps(["name"]),
        "limit_page_length": 500,
    }).get("data", [])
    for gl in gl_entries:
        try:
            client._delete(f"/api/resource/GL Entry/{gl['name']}")
        except Exception as e:
            log.warning("gl_entry_delete_error", entry=gl["name"], error=str(e))
    return len(gl_entries)


@router.post("/wedding/{project_name}/delete")
def delete_wedding(project_name: str):
    """Fully delete a wedding project and all linked documents."""
    client = ERPNextClient()

    # 1. Find all Sales Invoices linked to this project
    invoices = client._get("/api/resource/Sales Invoice", params={
        "filters": json.dumps([["project", "=", project_name]]),
        "fields": json.dumps(["name", "docstatus"]),
        "limit_page_length": 100,
    }).get("data", [])

    total_pe = 0

    for inv in invoices:
        # 2. Find Payment Entries referencing this invoice
        pe_data = client._get("/api/resource/Payment Entry", params={
            "filters": json.dumps([
                ["Payment Entry Reference", "reference_name", "=", inv["name"]],
            ]),
            "fields": json.dumps(["name", "docstatus"]),
            "limit_page_length": 100,
        }).get("data", [])

        # 3. Cancel + delete GL entries + delete each Payment Entry
        for pe in pe_data:
            if pe["docstatus"] == 1:
                _cancel(client, "Payment Entry", pe["name"])
            _delete_gl_entries(client, pe["name"])
            try:
                client._delete(f"/api/resource/Payment Entry/{pe['name']}")
            except Exception as e:
                log.warning("pe_delete_error", pe=pe["name"], error=str(e))
            total_pe += 1

        # 4. Cancel + delete GL entries + delete the Invoice
        if inv["docstatus"] == 1:
            _cancel(client, "Sales Invoice", inv["name"])
        _delete_gl_entries(client, inv["name"])
        try:
            client._delete(f"/api/resource/Sales Invoice/{inv['name']}")
        except Exception as e:
            log.warning("invoice_delete_error", invoice=inv["name"], error=str(e))

    # 5. Cancel + delete the Sales Order (no GL entries)
    so_name = None
    try:
        project_doc = client._get(f"/api/resource/Project/{project_name}").get("data", {})
        so_name = project_doc.get("sales_order")
        if so_name:
            so = client._get(f"/api/resource/Sales Order/{so_name}").get("data", {})
            if so.get("docstatus") == 1:
                _cancel(client, "Sales Order", so_name)
            client._delete(f"/api/resource/Sales Order/{so_name}")
    except Exception as e:
        log.warning("so_delete_error", project=project_name, error=str(e))

    # 6. Delete the Project
    client._delete(f"/api/resource/Project/{project_name}")

    log.info("wedding_deleted", project=project_name, invoices=len(invoices), payment_entries=total_pe)
    return {"success": True, "project": project_name}
