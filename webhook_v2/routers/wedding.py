"""
Wedding management endpoints - server-side cascade delete.
"""

import json

from fastapi import APIRouter, HTTPException
from webhook_v2.services.erpnext import ERPNextClient
from webhook_v2.core.logging import get_logger

log = get_logger(__name__)
router = APIRouter()


@router.post("/wedding/{project_name}/delete")
def delete_wedding(project_name: str):
    """
    Cascade-delete a wedding project and all linked documents.

    Order: Payment Entries → Sales Invoices → Sales Order → Project
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
        # 2. Find Payment Entries referencing this invoice
        pe_refs = client._get("/api/resource/Payment Entry Reference", params={
            "filters": json.dumps([
                ["reference_doctype", "=", "Sales Invoice"],
                ["reference_name", "=", inv["name"]],
            ]),
            "fields": json.dumps(["name", "parent"]),
            "limit_page_length": 100,
        }).get("data", [])
        pe_names = list({r["parent"] for r in pe_refs})

        # 3. Cancel + delete each Payment Entry
        for pe_name in pe_names:
            try:
                client._post(
                    "/api/method/frappe.client.cancel",
                    {"doc": {"doctype": "Payment Entry", "name": pe_name}},
                )
            except Exception as e:
                log.warning("payment_entry_cancel_error", pe=pe_name, error=str(e))
            client._delete(f"/api/resource/Payment Entry/{pe_name}")
            total_payment_entries += 1

        # 4. Cancel + delete the Invoice
        if inv["docstatus"] == 1:
            try:
                client._post(
                    "/api/method/frappe.client.cancel",
                    {"doc": {"doctype": "Sales Invoice", "name": inv["name"]}},
                )
            except Exception as e:
                log.warning("invoice_cancel_error", invoice=inv["name"], error=str(e))
        client._delete(f"/api/resource/Sales Invoice/{inv['name']}")

    # 5. Find + cancel + delete the Sales Order
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
    except Exception as e:
        log.warning("sales_order_delete_error", project=project_name, error=str(e))

    # 6. Delete the Project
    client._delete(f"/api/resource/Project/{project_name}")

    log.info(
        "wedding_deleted",
        project=project_name,
        invoices=len(invoices),
        payment_entries=total_payment_entries,
    )
    return {"success": True, "project": project_name}
