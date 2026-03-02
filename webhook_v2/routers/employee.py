"""
Employee management endpoints.

Uses a Frappe Server Script (meraki_set_employee_fields) that calls
frappe.db.set_value — bypasses full-document link validation (e.g. invalid
leave_approver) that causes 417 errors when saving via frappe.client.set_value.

The Server Script is created by migration phase v015.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from webhook_v2.services.erpnext import ERPNextClient
from webhook_v2.core.logging import get_logger

log = get_logger(__name__)
router = APIRouter()

# Must match ALLOWED_FIELDS in migration/phases/v015_employee_set_value_script.py
# (v016 adds user_id)
ALLOWED_FIELDS = {
    "first_name",
    "middle_name",
    "last_name",
    "gender",
    "date_of_birth",
    "company_email",
    "cell_phone",
    "designation",
    "department",
    "date_of_joining",
    "custom_staff_roles",
    "ctc",
    "custom_insurance_salary",
    "custom_lead_commission_pct",
    "custom_support_commission_pct",
    "custom_assistant_commission_pct",
    "custom_sales_commission_pct",
    "user_id",
    "custom_last_review_date",
    "custom_review_notes",
    "custom_allowance_hcm_full",
    "custom_allowance_hcm_partial",
    "custom_allowance_dest_full",
    "custom_allowance_dest_partial",
    "custom_display_order",
}


class EmployeeUpdateRequest(BaseModel):
    values: dict


@router.patch("/employee/{employee_id}")
async def update_employee(employee_id: str, request: EmployeeUpdateRequest):
    """
    Update employee fields via the meraki_set_employee_fields Server Script.
    Uses frappe.db.set_value internally — no link validation.
    """
    client = ERPNextClient()

    updates = {k: v for k, v in request.values.items() if k in ALLOWED_FIELDS}
    if not updates:
        raise HTTPException(status_code=400, detail="No valid fields to update")

    # If company_email is changing and the employee has a linked User, rename the User
    if "company_email" in updates:
        try:
            emp = client._get(f"/api/resource/Employee/{employee_id}")
            current = emp.get("data", {})
            user_id = current.get("user_id")
            new_email = updates["company_email"]
            if user_id and user_id != new_email:
                try:
                    client._post("/api/method/frappe.client.rename_doc", {
                        "doctype": "User",
                        "old_name": user_id,
                        "new_name": new_email,
                        "merge": False,
                    })
                    updates["user_id"] = new_email
                    log.info("user_renamed", old=user_id, new=new_email)
                except Exception as rename_err:
                    log.warning("user_rename_failed", old=user_id, new=new_email, error=str(rename_err))
        except Exception as fetch_err:
            log.warning("employee_fetch_failed", employee=employee_id, error=str(fetch_err))

    try:
        result = client._post(
            "/api/method/meraki_set_employee_fields",
            {"employee_name": employee_id, **updates},
        )
    except Exception as e:
        log.error("employee_update_failed", employee=employee_id, error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

    updated = result.get("message", {}).get("updated", list(updates.keys()))
    log.info("employee_updated", employee=employee_id, fields=updated)
    return {"status": "ok", "updated": updated}


import json as _json
import random


class InviteStaffRequest(BaseModel):
    full_name: str
    email: str
    gender: str = "Female"
    date_of_birth: str = "2000-01-01"
    date_of_joining: str
    password: str | None = None  # if None, backend generates "Meraki-{4digits}"


@router.post("/staff/invite")
async def invite_staff(request: InviteStaffRequest):
    """
    Invite a new staff member:
    1. Create User with Employee Self Service role
    2. Fetch max custom_meraki_id from existing employees → increment
    3. Create Employee linked to that User
    Returns {employee_name, user_id, password}
    """
    client = ERPNextClient()

    # Generate password if not provided
    password = request.password or f"Meraki-{random.randint(1000, 9999)}"

    name_parts = request.full_name.strip().split(" ")
    first_name = name_parts[0]
    last_name = " ".join(name_parts[1:]) if len(name_parts) > 1 else ""

    # 1. Create User
    try:
        user_values = {
            "email": request.email.strip(),
            "first_name": first_name,
            "enabled": 1,
            "new_password": password,
            "send_welcome_email": 0,
            "roles": [{"role": "Employee Self Service"}],
        }
        if last_name:
            user_values["last_name"] = last_name
        client._post("/api/resource/User", user_values)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to create user: {e}")

    log.info("staff_user_created", email=request.email)

    # 2. Fetch max custom_meraki_id
    try:
        emp_data = client._get("/api/resource/Employee", params={
            "fields": _json.dumps(["custom_meraki_id"]),
            "limit_page_length": 500,
        }).get("data", [])
        max_id = max((int(e.get("custom_meraki_id") or 0) for e in emp_data), default=0)
        next_meraki_id = max_id + 1
    except Exception:
        next_meraki_id = 1

    # 3. Create Employee
    try:
        emp_values = {
            "first_name": first_name,
            "employee_name": request.full_name.strip(),
            "company": "Meraki Wedding Planner",
            "user_id": request.email.strip(),
            "date_of_joining": request.date_of_joining,
            "gender": request.gender,
            "date_of_birth": request.date_of_birth,
            "status": "Active",
            "custom_meraki_id": next_meraki_id,
        }
        if last_name:
            emp_values["last_name"] = last_name
        emp_resp = client._post("/api/resource/Employee", emp_values)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to create employee: {e}")

    employee_name = emp_resp.get("data", {}).get("name")
    log.info("staff_employee_created", employee=employee_name, meraki_id=next_meraki_id)

    return {
        "employee_name": employee_name,
        "user_id": request.email.strip(),
        "password": password,
    }
