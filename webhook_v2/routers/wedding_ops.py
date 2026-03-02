"""
Wedding creation and conflict-check endpoints.

POST /wedding/create — atomic: Customer → Contacts → Sales Order → submit → Project
GET  /conflicts      — check for date conflicts
"""

import json
from datetime import date

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from webhook_v2.services.erpnext import ERPNextClient
from webhook_v2.core.logging import get_logger

log = get_logger(__name__)
router = APIRouter()


class AddonItem(BaseModel):
    item_code: str
    item_name: str
    rate: float
    include_in_commission: bool = False


class CreateWeddingRequest(BaseModel):
    couple_name: str
    email: str | None = None
    phone: str | None = None
    extra_emails: list[str] = []
    wedding_date: str              # YYYY-MM-DD
    venue: str | None = None
    wedding_type: str | None = None
    package_amount: float = 0
    addons: list[AddonItem] = []
    tax_type: str = "none"         # "vat" | "none"
    lead_planner: str | None = None
    support_planner: str | None = None
    assistants: list[str] = []     # up to 5 employee names


@router.post("/wedding/create")
def create_wedding(req: CreateWeddingRequest):
    """
    Atomic wedding creation:
    1. Create Customer
    2. Create Contact records for extra emails (best-effort)
    3. Create Sales Order with items + taxes + custom_commission_base
    4. Submit SO + set per_delivered=100
    5. Create Project with team assignments
    """
    client = ERPNextClient()

    # 1. Create Customer
    customer_values = {
        "customer_name": req.couple_name.strip(),
        "customer_type": "Individual",
        "customer_group": "Wedding Clients",
        "territory": "Vietnam",
    }
    if req.email:
        customer_values["email_id"] = req.email.strip()
    if req.phone:
        customer_values["mobile_no"] = req.phone.strip()

    try:
        customer_resp = client._post("/api/resource/Customer", customer_values)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to create customer: {e}")

    customer_id = customer_resp.get("data", {}).get("name")
    if not customer_id:
        raise HTTPException(status_code=500, detail="Customer created but name not returned")

    log.info("wedding_customer_created", customer=customer_id)

    # 2. Create Contact records for extra emails (best-effort, non-blocking)
    for extra_email in req.extra_emails:
        if not extra_email.strip():
            continue
        try:
            client._post("/api/resource/Contact", {
                "first_name": req.couple_name.strip(),
                "email_ids": [{"email_id": extra_email.strip(), "is_primary": 0}],
                "links": [{"link_doctype": "Customer", "link_name": customer_id}],
            })
        except Exception as e:
            log.warning("extra_contact_creation_failed", email=extra_email, error=str(e))

    # 3. Create Sales Order
    today = date.today().isoformat()

    commission_base = req.package_amount + sum(
        a.rate for a in req.addons if a.include_in_commission
    )

    so_values: dict = {
        "customer": customer_id,
        "transaction_date": today,
        "delivery_date": req.wedding_date,
        "custom_commission_base": commission_base,
        "items": [
            {
                "item_code": "Wedding Planning Service",
                "qty": 1,
                "rate": req.package_amount,
            },
            *[
                {"item_code": a.item_code, "qty": 1, "rate": a.rate}
                for a in req.addons
                if a.item_code and a.rate
            ],
        ],
    }
    if req.venue:
        so_values["custom_venue"] = req.venue.strip()
    if req.wedding_type:
        so_values["custom_wedding_type"] = req.wedding_type

    if req.tax_type == "vat":
        so_values["taxes"] = [{
            "charge_type": "On Net Total",
            "account_head": "Output Tax - MWP",
            "rate": 8,
            "included_in_print_rate": 1,
            "description": "VAT 8%",
        }]

    try:
        so_resp = client._post("/api/resource/Sales Order", so_values)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to create sales order: {e}")

    so_name = so_resp.get("data", {}).get("name")
    if not so_name:
        raise HTTPException(status_code=500, detail="Sales Order created but name not returned")

    log.info("wedding_so_created", so=so_name)

    # 4. Submit Sales Order (fetch full doc first to avoid TimestampMismatchError)
    try:
        full_so = client._get(f"/api/resource/Sales Order/{so_name}").get("data", {})
        client._post("/api/method/frappe.client.submit", {"doc": full_so})
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to submit sales order: {e}")

    # 4b. Mark as fully delivered
    try:
        client._post("/api/method/frappe.client.set_value", {
            "doctype": "Sales Order",
            "name": so_name,
            "fieldname": "per_delivered",
            "value": 100,
        })
    except Exception as e:
        log.warning("per_delivered_set_failed", so=so_name, error=str(e))

    # 5. Create Project with team assignments
    project_stage = "Completed" if req.wedding_date < today else "Onboarding"
    project_values: dict = {
        "project_name": f"{req.couple_name.strip()} Wedding",
        "expected_end_date": req.wedding_date,
        "sales_order": so_name,
        "customer": customer_id,
        "custom_project_stage": project_stage,
        "custom_lead_planner": req.lead_planner or None,
        "custom_support_planner": req.support_planner or None,
    }

    valid_assistants = [a for a in req.assistants if a]
    for i, asst in enumerate(valid_assistants[:5], 1):
        project_values[f"custom_assistant_{i}"] = asst

    try:
        project_resp = client._post("/api/resource/Project", project_values)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to create project: {e}")

    project_name = project_resp.get("data", {}).get("name")
    if not project_name:
        raise HTTPException(status_code=500, detail="Project created but name not returned")

    log.info("wedding_created", project=project_name, so=so_name, customer=customer_id)

    return {
        "project_name": project_name,
        "customer_name": customer_id,
        "sales_order_name": so_name,
    }
