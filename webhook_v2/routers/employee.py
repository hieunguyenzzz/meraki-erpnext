"""
Employee management endpoints.

Uses frappe.db.set_value via RPC to update individual fields
without triggering full-document link validation (e.g. leave_approver).
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from webhook_v2.services.erpnext import ERPNextClient
from webhook_v2.core.logging import get_logger

log = get_logger(__name__)
router = APIRouter()

# Fields allowed to be updated via this endpoint
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
}


class EmployeeUpdateRequest(BaseModel):
    values: dict


@router.patch("/employee/{employee_id}")
async def update_employee(employee_id: str, request: EmployeeUpdateRequest):
    """
    Update employee fields using frappe.db.set_value to bypass link validation.

    Only fields in ALLOWED_FIELDS are accepted. Unknown fields are ignored.
    """
    client = ERPNextClient()

    # Filter to only allowed fields
    updates = {k: v for k, v in request.values.items() if k in ALLOWED_FIELDS}
    if not updates:
        raise HTTPException(status_code=400, detail="No valid fields to update")

    errors = []
    for field, value in updates.items():
        try:
            client._post(
                "/api/method/frappe.client.set_value",
                {
                    "doctype": "Employee",
                    "name": employee_id,
                    "fieldname": field,
                    "value": value,
                },
            )
        except Exception as e:
            log.error("employee_field_update_failed", employee=employee_id, field=field, error=str(e))
            errors.append(f"{field}: {str(e)}")

    if errors:
        raise HTTPException(status_code=500, detail="; ".join(errors))

    log.info("employee_updated", employee=employee_id, fields=list(updates.keys()))
    return {"status": "ok", "updated": list(updates.keys())}
