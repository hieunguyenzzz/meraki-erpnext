"""
Project kanban endpoint — pre-joined project data for the kanban/list view.

GET /projects/kanban  — enriched project list with SO, invoice, employee, venue data
"""

import json
from fastapi import APIRouter
from webhook_v2.services.erpnext import ERPNextClient
from webhook_v2.core.logging import get_logger

log = get_logger(__name__)
router = APIRouter()


def _display_name(emp: dict) -> str:
    parts = [emp.get("last_name"), emp.get("first_name")]
    name = " ".join(p for p in parts if p)
    return name or emp.get("employee_name") or emp.get("name", "")


@router.get("/projects/kanban")
def projects_kanban():
    """
    Return enriched project list ready for kanban/list display.

    Joins:
    - Projects (Open + Completed)
    - Sales Orders (for venue, amount, commission base, tax info)
    - Sales Invoices (for per_billed calculation)
    - Employees (for planner names)
    - Suppliers (for venue names)
    - Customers (for customer names)

    per_billed is computed as:
        sum(grand_total - outstanding_amount for submitted invoices where project=X) / SO.grand_total * 100
    """
    client = ERPNextClient()

    # Fetch projects — custom_service_type may not exist on all environments
    _project_fields = [
        "name", "project_name", "status", "custom_project_stage",
        "customer", "expected_end_date", "sales_order",
        "custom_lead_planner", "custom_support_planner",
        "custom_assistant_1", "custom_assistant_2",
        "custom_assistant_3", "custom_assistant_4", "custom_assistant_5",
    ]
    try:
        projects = client._get("/api/resource/Project", params={
            "filters": json.dumps([["status", "in", ["Open", "Completed"]]]),
            "fields": json.dumps(_project_fields + ["custom_service_type"]),
            "limit_page_length": 1000,
        }).get("data", [])
    except Exception:
        projects = client._get("/api/resource/Project", params={
            "filters": json.dumps([["status", "in", ["Open", "Completed"]]]),
            "fields": json.dumps(_project_fields),
            "limit_page_length": 1000,
        }).get("data", [])

    # Fetch sales orders
    sales_orders = client._get("/api/resource/Sales Order", params={
        "filters": json.dumps([["docstatus", "in", [0, 1]]]),
        "fields": json.dumps([
            "name", "customer_name", "custom_venue", "grand_total",
            "total_taxes_and_charges", "custom_commission_base",
        ]),
        "limit_page_length": 1000,
    }).get("data", [])

    # Fetch submitted sales invoices for per_billed calculation
    invoices = client._get("/api/resource/Sales Invoice", params={
        "filters": json.dumps([["docstatus", "=", 1]]),
        "fields": json.dumps(["name", "project", "grand_total", "outstanding_amount"]),
        "limit_page_length": 2000,
    }).get("data", [])

    # Fetch employees (all statuses for planner name resolution)
    employees = client._get("/api/resource/Employee", params={
        "fields": json.dumps(["name", "employee_name", "first_name", "last_name"]),
        "limit_page_length": 500,
    }).get("data", [])

    # Fetch suppliers for venue names
    suppliers = client._get("/api/resource/Supplier", params={
        "fields": json.dumps(["name", "supplier_name"]),
        "limit_page_length": 500,
    }).get("data", [])

    # Fetch customers
    customers = client._get("/api/resource/Customer", params={
        "fields": json.dumps(["name", "customer_name"]),
        "limit_page_length": 500,
    }).get("data", [])

    # Build lookup maps
    so_map = {so["name"]: so for so in sales_orders}
    emp_map = {e["name"]: _display_name(e) for e in employees}
    supplier_map = {s["name"]: s.get("supplier_name", s["name"]) for s in suppliers}
    customer_map = {c["name"]: c for c in customers}

    # Build per-project paid amount from submitted invoices
    paid_by_project: dict[str, float] = {}
    for inv in invoices:
        proj = inv.get("project")
        if not proj:
            continue
        paid = (inv.get("grand_total") or 0) - (inv.get("outstanding_amount") or 0)
        paid_by_project[proj] = paid_by_project.get(proj, 0) + paid

    # Build result items
    items = []
    for p in projects:
        linked_so = so_map.get(p.get("sales_order") or "") if p.get("sales_order") else None
        linked_customer = customer_map.get(p.get("customer") or "") if p.get("customer") else None

        # Customer display name
        customer_name = (
            (linked_customer or {}).get("customer_name")
            or (linked_so or {}).get("customer_name")
            or p.get("project_name", "")
        )

        # Venue name resolution
        venue_name = None
        if linked_so and linked_so.get("custom_venue"):
            venue_name = supplier_map.get(linked_so["custom_venue"], linked_so["custom_venue"])

        # per_billed = sum(paid invoices) / SO.grand_total * 100
        grand_total = (linked_so or {}).get("grand_total") or 0
        per_billed = None
        if grand_total > 0:
            paid = paid_by_project.get(p["name"], 0)
            per_billed = round(paid / grand_total * 100)

        # Tax type
        tax_type = None
        if linked_so:
            tax_type = "vat_included" if (linked_so.get("total_taxes_and_charges") or 0) > 0 else "tax_free"

        items.append({
            "id": p["name"],
            "project_name": p.get("project_name", ""),
            "status": p.get("status", ""),
            "custom_project_stage": p.get("custom_project_stage") or "Planning",
            "customer": p.get("customer"),
            "customer_name": customer_name,
            "expected_end_date": p.get("expected_end_date"),
            "sales_order": p.get("sales_order"),
            "venue_name": venue_name,
            "lead_planner_name": emp_map.get(p.get("custom_lead_planner") or ""),
            "support_planner_name": emp_map.get(p.get("custom_support_planner") or ""),
            "package_amount": grand_total if grand_total > 0 else None,
            "per_billed": per_billed,
            "tax_type": tax_type,
            "commission_base": (linked_so or {}).get("custom_commission_base") or grand_total or None,
            "custom_lead_planner": p.get("custom_lead_planner"),
            "custom_support_planner": p.get("custom_support_planner"),
            "custom_assistant_1": p.get("custom_assistant_1"),
            "custom_assistant_2": p.get("custom_assistant_2"),
            "custom_assistant_3": p.get("custom_assistant_3"),
            "custom_assistant_4": p.get("custom_assistant_4"),
            "custom_assistant_5": p.get("custom_assistant_5"),
            "custom_service_type": p.get("custom_service_type") or None,
        })

    return {"data": items}
