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
