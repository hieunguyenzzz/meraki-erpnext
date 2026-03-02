"""
Wedding management endpoints - server-side cascade delete.

Full deletion order:
  Payment Entries → cancel + delete
  Sales Invoices → cancel + delete GL entries + delete
  Sales Order → cancel + delete
  Project → delete
"""

import json

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from webhook_v2.services.erpnext import ERPNextClient
from webhook_v2.core.logging import get_logger

log = get_logger(__name__)
router = APIRouter()


class MilestoneRequest(BaseModel):
    amount: float
    label: str = ""
    invoice_date: str  # YYYY-MM-DD


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


def _delete_payment_ledger_entries(client: ERPNextClient, voucher_no: str) -> int:
    """Delete all Payment Ledger Entries for a voucher (blocks deletion of invoices/PEs)."""
    entries = client._get("/api/resource/Payment Ledger Entry", params={
        "filters": json.dumps([["voucher_no", "=", voucher_no]]),
        "fields": json.dumps(["name"]),
        "limit_page_length": 500,
    }).get("data", [])
    for entry in entries:
        try:
            client._delete(f"/api/resource/Payment Ledger Entry/{entry['name']}")
        except Exception as e:
            log.warning("payment_ledger_delete_error", entry=entry["name"], error=str(e))
    return len(entries)


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

        # 3. Cancel + delete GL/ledger entries + delete each Payment Entry
        for pe in pe_data:
            if pe["docstatus"] == 1:
                _cancel(client, "Payment Entry", pe["name"])
            _delete_gl_entries(client, pe["name"])
            _delete_payment_ledger_entries(client, pe["name"])
            try:
                client._delete(f"/api/resource/Payment Entry/{pe['name']}")
            except Exception as e:
                log.warning("pe_delete_error", pe=pe["name"], error=str(e))
            total_pe += 1

        # 4. Cancel + delete GL/ledger entries + delete the Invoice
        if inv["docstatus"] == 1:
            _cancel(client, "Sales Invoice", inv["name"])
        _delete_gl_entries(client, inv["name"])
        _delete_payment_ledger_entries(client, inv["name"])
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


@router.post("/wedding/{project_name}/milestone")
def create_milestone(project_name: str, req: MilestoneRequest):
    """Create a Sales Invoice and Payment Entry atomically (milestone paid immediately)."""
    client = ERPNextClient()

    # 1. Get customer from project
    project = client._get(f"/api/resource/Project/{project_name}").get("data", {})
    customer = project.get("customer")

    item_name = f"{req.label} \u2014 Wedding Planning Service" if req.label else "Wedding Planning Service"

    # 2. Create + submit Sales Invoice
    inv = client._post("/api/resource/Sales Invoice", {
        "customer": customer,
        "company": "Meraki Wedding Planner",
        "set_posting_time": 1,
        "posting_date": req.invoice_date,
        "due_date": req.invoice_date,
        "currency": "VND",
        "selling_price_list": "Standard Selling VND",
        "project": project_name,
        "items": [{"item_code": "Wedding Planning Service", "item_name": item_name, "qty": 1, "rate": req.amount}],
    }).get("data", {})
    inv_name = inv["name"]
    full_inv = client._get(f"/api/resource/Sales Invoice/{inv_name}").get("data", {})
    client._post("/api/method/frappe.client.submit", {"doc": full_inv})

    # Refetch submitted invoice to get actual outstanding_amount after ERPNext rounding
    submitted_inv = client._get(f"/api/resource/Sales Invoice/{inv_name}").get("data", {})
    actual_amount = submitted_inv.get("outstanding_amount") or req.amount

    # 3. Create + submit Payment Entry using actual_amount (avoids 417 when ERPNext rounds)
    try:
        pe = client._post("/api/resource/Payment Entry", {
            "payment_type": "Receive",
            "party_type": "Customer",
            "party": customer,
            "paid_from": "Debtors - MWP",
            "paid_to": "Cash - MWP",
            "paid_from_account_currency": "VND",
            "paid_to_account_currency": "VND",
            "paid_amount": actual_amount,
            "received_amount": actual_amount,
            "posting_date": req.invoice_date,
            "company": "Meraki Wedding Planner",
            "references": [{
                "reference_doctype": "Sales Invoice",
                "reference_name": inv_name,
                "allocated_amount": actual_amount,
                "total_amount": actual_amount,
                "outstanding_amount": actual_amount,
            }],
        }).get("data", {})
    except Exception as e:
        # Rollback: cancel + delete the orphaned invoice
        _cancel(client, "Sales Invoice", inv_name)
        _delete_gl_entries(client, inv_name)
        _delete_payment_ledger_entries(client, inv_name)
        try:
            client._delete(f"/api/resource/Sales Invoice/{inv_name}")
        except Exception:
            pass
        raise HTTPException(status_code=400, detail=f"Payment Entry creation failed: {str(e)}")
    pe_name = pe["name"]
    full_pe = client._get(f"/api/resource/Payment Entry/{pe_name}").get("data", {})
    client._post("/api/method/frappe.client.submit", {"doc": full_pe})

    log.info("milestone_created", project=project_name, invoice=inv_name, payment_entry=pe_name)
    return {"success": True, "invoice": inv_name, "payment_entry": pe_name}


class AddonItem(BaseModel):
    item_code: str
    item_name: str
    qty: float = 1
    rate: float


class AddonsRequest(BaseModel):
    items: list[AddonItem]


@router.put("/wedding/{project_name}/addons")
def update_addons(project_name: str, req: AddonsRequest):
    """Update add-on items on a wedding's Sales Order using ERPNext's update_child_qty_rate API."""
    client = ERPNextClient()

    # 1. Get project → sales_order name
    project = client._get(f"/api/resource/Project/{project_name}").get("data", {})
    so_name = project.get("sales_order")
    if not so_name:
        raise HTTPException(status_code=404, detail="No Sales Order linked to this project")

    # 2. Get current SO and its items
    so = client._get(f"/api/resource/Sales Order/{so_name}").get("data", {})
    if so.get("docstatus") == 2:
        raise HTTPException(status_code=400, detail="Sales Order is already cancelled")

    if so.get("docstatus") == 0:
        raise HTTPException(status_code=400, detail="Sales Order is not submitted yet")

    # 3. Build trans_items: keep all "Wedding Planning Service" rows (with their name/docname
    #    so update_child_qty_rate treats them as existing rows, not new ones) + new add-on rows.
    original_items = so.get("items", [])
    planning_service_rows = [
        {
            "docname": item["name"],
            "item_code": item["item_code"],
            "item_name": item["item_name"],
            "qty": item["qty"],
            "rate": item["rate"],
            "conversion_factor": item.get("conversion_factor", 1),
        }
        for item in original_items
        if item.get("item_code") == "Wedding Planning Service"
    ]

    # Existing add-on rows keyed by item_code so we can carry their docname
    existing_addon_by_code = {
        item["item_code"]: item
        for item in original_items
        if item.get("item_code") != "Wedding Planning Service"
    }

    addon_rows = []
    for addon in req.items:
        row = {
            "item_code": addon.item_code,
            "item_name": addon.item_name,
            "qty": addon.qty,
            "rate": addon.rate,
            "conversion_factor": 1,
        }
        # If this item_code already exists on the SO, pass its docname so it's
        # treated as an update rather than a new insert.
        if addon.item_code in existing_addon_by_code:
            row["docname"] = existing_addon_by_code[addon.item_code]["name"]
        addon_rows.append(row)

    trans_items = planning_service_rows + addon_rows

    # 4. Call ERPNext's standard update_child_qty_rate — accounting-safe, works
    #    even when invoices exist (as long as per_billed < 100% for rate changes;
    #    adding new rows is allowed at any billing percentage).
    import json as _json
    client._post(
        "/api/method/erpnext.controllers.accounts_controller.update_child_qty_rate",
        {
            "parent_doctype": "Sales Order",
            "trans_items": _json.dumps(trans_items),
            "parent_doctype_name": so_name,
            "child_docname": "items",
        },
    )

    log.info("addons_updated", project=project_name, so=so_name, addon_count=len(addon_rows))
    return {"success": True, "sales_order": so_name}


class UpdateDetailsAddonItem(BaseModel):
    item_code: str
    item_name: str
    qty: float = 1
    rate: float
    include_in_commission: bool = False


class UpdateWeddingDetailsRequest(BaseModel):
    venue: str | None = None
    addons: list[UpdateDetailsAddonItem] = []


@router.put("/wedding/{project_name}/details")
def update_wedding_details(project_name: str, req: UpdateWeddingDetailsRequest):
    """
    Update wedding details atomically:
    1. set_value custom_venue on Sales Order
    2. Update add-on items via update_child_qty_rate
    3. Recalculate and set_value custom_commission_base on Sales Order
    """
    import json as _json
    client = ERPNextClient()

    # Get project → sales_order
    project = client._get(f"/api/resource/Project/{project_name}").get("data", {})
    so_name = project.get("sales_order")
    if not so_name:
        raise HTTPException(status_code=404, detail="No Sales Order linked to this project")

    # Get current SO
    so = client._get(f"/api/resource/Sales Order/{so_name}").get("data", {})
    if so.get("docstatus") != 1:
        raise HTTPException(status_code=400, detail="Sales Order is not submitted")

    # 1. Update venue
    if req.venue is not None:
        try:
            client._post("/api/method/frappe.client.set_value", {
                "doctype": "Sales Order",
                "name": so_name,
                "fieldname": "custom_venue",
                "value": req.venue,
            })
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to update venue: {e}")

    # 2. Update add-on items via update_child_qty_rate
    original_items = so.get("items", [])
    planning_service_rows = [
        {
            "docname": item["name"],
            "item_code": item["item_code"],
            "item_name": item["item_name"],
            "qty": item["qty"],
            "rate": item["rate"],
            "conversion_factor": item.get("conversion_factor", 1),
        }
        for item in original_items
        if item.get("item_code") == "Wedding Planning Service"
    ]

    existing_addon_by_code = {
        item["item_code"]: item
        for item in original_items
        if item.get("item_code") != "Wedding Planning Service"
    }

    addon_rows = []
    for addon in req.addons:
        row = {
            "item_code": addon.item_code,
            "item_name": addon.item_name,
            "qty": addon.qty,
            "rate": addon.rate,
            "conversion_factor": 1,
        }
        if addon.item_code in existing_addon_by_code:
            row["docname"] = existing_addon_by_code[addon.item_code]["name"]
        addon_rows.append(row)

    trans_items = planning_service_rows + addon_rows
    try:
        client._post(
            "/api/method/erpnext.controllers.accounts_controller.update_child_qty_rate",
            {
                "parent_doctype": "Sales Order",
                "trans_items": _json.dumps(trans_items),
                "parent_doctype_name": so_name,
                "child_docname": "items",
            },
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to update add-ons: {e}")

    # 3. Recalculate commission_base
    package_rate = next(
        (item["rate"] for item in original_items if item.get("item_code") == "Wedding Planning Service"),
        0,
    )
    commission_base = package_rate + sum(
        a.rate for a in req.addons if a.include_in_commission
    )
    try:
        client._post("/api/method/frappe.client.set_value", {
            "doctype": "Sales Order",
            "name": so_name,
            "fieldname": "custom_commission_base",
            "value": commission_base,
        })
    except Exception as e:
        log.warning("commission_base_update_failed", so=so_name, error=str(e))

    log.info("wedding_details_updated", project=project_name, so=so_name, commission_base=commission_base)
    return {"success": True, "commission_base": commission_base}


class AddonItemCreateRequest(BaseModel):
    item_name: str

@router.post("/wedding/addon-item")
def create_addon_item(req: AddonItemCreateRequest):
    """Create a new add-on Item in ERPNext using server-side API key auth."""
    client = ERPNextClient()
    result = client._post("/api/resource/Item", {
        "item_name": req.item_name.strip(),
        "item_code": req.item_name.strip(),
        "item_group": "Add-on Services",
        "is_sales_item": 1,
        "is_stock_item": 0,
        "stock_uom": "Nos",
    })
    item = result.get("data", {})
    return {"name": item.get("name"), "item_name": item.get("item_name")}
