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


def _delete_single_invoice(client: ERPNextClient, invoice_name: str) -> int:
    """Delete a single Sales Invoice and its Payment Entries. Returns PE count deleted."""
    pe_data = client._get("/api/resource/Payment Entry", params={
        "filters": json.dumps([
            ["Payment Entry Reference", "reference_name", "=", invoice_name],
        ]),
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
        except Exception as e:
            log.warning("pe_delete_error", pe=pe["name"], error=str(e))

    inv = client._get(f"/api/resource/Sales Invoice/{invoice_name}").get("data", {})
    if inv.get("docstatus") == 1:
        _cancel(client, "Sales Invoice", invoice_name)
    _delete_gl_entries(client, invoice_name)
    _delete_payment_ledger_entries(client, invoice_name)
    try:
        client._delete(f"/api/resource/Sales Invoice/{invoice_name}")
    except Exception as e:
        log.warning("invoice_delete_error", invoice=invoice_name, error=str(e))

    return len(pe_data)


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
        total_pe += _delete_single_invoice(client, inv["name"])

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


@router.put("/wedding/{project_name}/milestone/{invoice_name}")
def edit_milestone(project_name: str, invoice_name: str, req: MilestoneRequest):
    """Edit a payment milestone by deleting the old one and recreating with new values."""
    client = ERPNextClient()

    # Verify invoice belongs to this project
    inv = client._get(f"/api/resource/Sales Invoice/{invoice_name}").get("data", {})
    if inv.get("project") != project_name:
        raise HTTPException(status_code=404, detail="Invoice not found for this project")

    # Delete old invoice + payment entries
    _delete_single_invoice(client, invoice_name)

    # Recreate with new values (same logic as create_milestone)
    project = client._get(f"/api/resource/Project/{project_name}").get("data", {})
    customer = project.get("customer")

    item_name = f"{req.label} \u2014 Wedding Planning Service" if req.label else "Wedding Planning Service"

    new_inv = client._post("/api/resource/Sales Invoice", {
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
    new_inv_name = new_inv["name"]
    full_inv = client._get(f"/api/resource/Sales Invoice/{new_inv_name}").get("data", {})
    client._post("/api/method/frappe.client.submit", {"doc": full_inv})

    submitted_inv = client._get(f"/api/resource/Sales Invoice/{new_inv_name}").get("data", {})
    actual_amount = submitted_inv.get("outstanding_amount") or req.amount

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
                "reference_name": new_inv_name,
                "allocated_amount": actual_amount,
                "total_amount": actual_amount,
                "outstanding_amount": actual_amount,
            }],
        }).get("data", {})
    except Exception as e:
        _cancel(client, "Sales Invoice", new_inv_name)
        _delete_gl_entries(client, new_inv_name)
        _delete_payment_ledger_entries(client, new_inv_name)
        try:
            client._delete(f"/api/resource/Sales Invoice/{new_inv_name}")
        except Exception:
            pass
        raise HTTPException(status_code=400, detail=f"Payment Entry creation failed: {str(e)}")
    pe_name = pe["name"]
    full_pe = client._get(f"/api/resource/Payment Entry/{pe_name}").get("data", {})
    client._post("/api/method/frappe.client.submit", {"doc": full_pe})

    log.info("milestone_edited", project=project_name, old_invoice=invoice_name, new_invoice=new_inv_name, payment_entry=pe_name)
    return {"success": True, "invoice": new_inv_name, "payment_entry": pe_name}


@router.delete("/wedding/{project_name}/milestone/{invoice_name}")
def delete_milestone(project_name: str, invoice_name: str):
    """Delete a single payment milestone (Sales Invoice + Payment Entries)."""
    client = ERPNextClient()

    inv = client._get(f"/api/resource/Sales Invoice/{invoice_name}").get("data", {})
    if inv.get("project") != project_name:
        raise HTTPException(status_code=404, detail="Invoice not found for this project")

    _delete_single_invoice(client, invoice_name)

    log.info("milestone_deleted", project=project_name, invoice=invoice_name)
    return {"success": True}


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
    default_wh = "Stores - MWP"
    planning_service_rows = [
        {
            "docname": item["name"],
            "item_code": item["item_code"],
            "item_name": item["item_name"],
            "qty": item["qty"],
            "rate": item["rate"],
            "conversion_factor": item.get("conversion_factor", 1),
            "warehouse": item.get("warehouse") or default_wh,
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
        if not addon.item_code:
            continue
        existing = existing_addon_by_code.get(addon.item_code)
        row = {
            "item_code": addon.item_code,
            "item_name": addon.item_name,
            "qty": addon.qty,
            "rate": addon.rate,
            "conversion_factor": 1,
            "warehouse": (existing.get("warehouse") if existing else None) or default_wh,
        }
        # If this item_code already exists on the SO, pass its docname so it's
        # treated as an update rather than a new insert.
        if existing:
            row["docname"] = existing["name"]
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
    tax_type: str | None = None  # "vat" or "none", None = no change


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

    # 2. Update tax type via server script
    if req.tax_type in ("vat", "none"):
        try:
            client._post("/api/method/meraki_update_so_taxes", {
                "so_name": so_name,
                "tax_type": req.tax_type,
            })
            # Re-fetch SO after tax change (totals changed)
            so = client._get(f"/api/resource/Sales Order/{so_name}").get("data", {})
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to update tax: {e}")

    # 3. Update add-on items via update_child_qty_rate
    original_items = so.get("items", [])
    default_wh = "Stores - MWP"
    planning_service_rows = [
        {
            "docname": item["name"],
            "item_code": item["item_code"],
            "item_name": item["item_name"],
            "qty": item["qty"],
            "rate": item["rate"],
            "conversion_factor": item.get("conversion_factor", 1),
            "warehouse": item.get("warehouse") or default_wh,
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
        if not addon.item_code:
            continue
        existing = existing_addon_by_code.get(addon.item_code)
        row = {
            "item_code": addon.item_code,
            "item_name": addon.item_name,
            "qty": addon.qty,
            "rate": addon.rate,
            "conversion_factor": 1,
            "warehouse": (existing.get("warehouse") if existing else None) or default_wh,
        }
        if existing:
            row["docname"] = existing["name"]
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

    # 4. Recalculate commission_base (use net_rate = pre-tax when VAT included)
    # Re-fetch SO to get updated net_rate values after tax/item changes
    so = client._get(f"/api/resource/Sales Order/{so_name}").get("data", {})
    updated_items = so.get("items", [])
    has_tax = bool(so.get("taxes"))
    rate_field = "net_rate" if has_tax else "rate"
    package_rate = next(
        (item[rate_field] for item in updated_items if item.get("item_code") == "Wedding Planning Service"),
        0,
    )
    addon_commission = sum(
        item[rate_field] for item in updated_items
        if item.get("item_code") != "Wedding Planning Service"
        and item.get("item_code") in {a.item_code for a in req.addons if a.include_in_commission}
    )
    commission_base = package_rate + addon_commission
    try:
        client._post("/api/method/frappe.client.set_value", {
            "doctype": "Sales Order",
            "name": so_name,
            "fieldname": "custom_commission_base",
            "value": commission_base,
        })
    except Exception as e:
        log.warning("commission_base_update_failed", so=so_name, error=str(e))

    # 5. Persist include_in_commission flag on each addon Item
    for addon in req.addons:
        if not addon.item_code or addon.item_code == "Wedding Planning Service":
            continue
        try:
            client._post("/api/method/frappe.client.set_value", {
                "doctype": "Item",
                "name": addon.item_code,
                "fieldname": "custom_include_in_commission",
                "value": 1 if addon.include_in_commission else 0,
            })
        except Exception:
            pass  # non-critical, best-effort

    log.info("wedding_details_updated", project=project_name, so=so_name, commission_base=commission_base)
    return {"success": True, "commission_base": commission_base}


class VendorItem(BaseModel):
    category: str
    supplier: str
    amount: float = 0
    notes: str = ""


class VendorsRequest(BaseModel):
    vendors: list[VendorItem]


@router.put("/wedding/{project_name}/vendors")
def update_vendors(project_name: str, req: VendorsRequest):
    """Overwrite the custom_wedding_vendors child table on a Project."""
    client = ERPNextClient()

    # Fetch full project doc, replace child table, save via PUT
    project = client._get(f"/api/resource/Project/{project_name}").get("data", {})
    if not project:
        raise HTTPException(status_code=404, detail=f"Project not found: {project_name}")

    project["custom_wedding_vendors"] = [
        {"category": v.category, "supplier": v.supplier, "amount": v.amount, "notes": v.notes}
        for v in req.vendors
    ]

    try:
        client._put(f"/api/resource/Project/{project_name}", project)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to update vendors: {e}")

    log.info("vendors_updated", project=project_name, count=len(req.vendors))
    return {"success": True, "count": len(req.vendors)}


class CreateSupplierRequest(BaseModel):
    supplier_name: str


@router.post("/wedding/vendors/create-supplier")
def create_vendor_supplier(req: CreateSupplierRequest):
    """Create a Supplier in the 'Wedding Vendors' group."""
    client = ERPNextClient()
    supplier_name = req.supplier_name.strip()

    # Return existing supplier if already present
    existing = client._get("/api/resource/Supplier", params={
        "filters": json.dumps([["supplier_name", "=", supplier_name]]),
        "fields": json.dumps(["name", "supplier_name"]),
        "limit_page_length": 1,
    }).get("data", [])
    if existing:
        s = existing[0]
        return {"name": s["name"], "supplier_name": s["supplier_name"]}

    result = client._post("/api/resource/Supplier", {
        "supplier_name": supplier_name,
        "supplier_group": "Wedding Vendors",
        "supplier_type": "Company",
    }).get("data", {})

    return {"name": result.get("name"), "supplier_name": result.get("supplier_name")}


class AddonItemCreateRequest(BaseModel):
    item_name: str

@router.get("/wedding/addon-items")
def list_addon_items():
    """Return all Items in the 'Add-on Services' group."""
    client = ERPNextClient()
    data = client._get("/api/resource/Item", params={
        "filters": json.dumps([["item_group", "=", "Add-on Services"]]),
        "fields": json.dumps(["name", "item_name", "custom_include_in_commission"]),
        "limit_page_length": 0,
    }).get("data", [])
    return {"data": data}

@router.post("/wedding/addon-item")
def create_addon_item(req: AddonItemCreateRequest):
    """Create a new add-on Item in ERPNext, or return the existing one."""
    client = ERPNextClient()
    item_name = req.item_name.strip()
    # Check if item already exists
    existing = client._get("/api/resource/Item", params={
        "filters": json.dumps([["item_code", "=", item_name]]),
        "fields": '["name","item_name"]',
        "limit_page_length": 1,
    })
    if existing.get("data"):
        item = existing["data"][0]
        return {"name": item["name"], "item_name": item["item_name"]}
    result = client._post("/api/resource/Item", {
        "item_name": item_name,
        "item_code": item_name,
        "item_group": "Add-on Services",
        "is_sales_item": 1,
        "is_stock_item": 0,
        "stock_uom": "Nos",
    })
    item = result.get("data", {})
    return {"name": item.get("name"), "item_name": item.get("item_name")}
