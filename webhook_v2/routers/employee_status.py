"""
Employee activation/deactivation endpoints.
Sets Employee.status and disables/enables the linked User account.
"""

from fastapi import APIRouter, HTTPException
from webhook_v2.services.erpnext import ERPNextClient
from webhook_v2.core.logging import get_logger

log = get_logger(__name__)
router = APIRouter()


@router.post("/employee/{employee_name}/deactivate")
async def deactivate_employee(employee_name: str):
    client = ERPNextClient()

    try:
        resp = client._get(f"/api/resource/Employee/{employee_name}")
        emp = resp.get("data", {})
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Employee not found: {employee_name}")

    user_id = emp.get("user_id")

    try:
        client._post("/api/method/frappe.client.set_value", {
            "doctype": "Employee",
            "name": employee_name,
            "fieldname": "status",
            "value": "Left",
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update employee status: {e}")

    user_disabled = False
    if user_id:
        try:
            client._post("/api/method/frappe.client.set_value", {
                "doctype": "User",
                "name": user_id,
                "fieldname": "enabled",
                "value": 0,
            })
            user_disabled = True
            log.info("user_disabled", user=user_id, employee=employee_name)
        except Exception as e:
            log.warning("user_disable_failed", user=user_id, error=str(e))

    log.info("employee_deactivated", employee=employee_name, user_disabled=user_disabled)
    return {"status": "ok", "employee": employee_name, "new_status": "Left", "user_disabled": user_disabled}


@router.post("/employee/{employee_name}/activate")
async def activate_employee(employee_name: str):
    client = ERPNextClient()

    try:
        resp = client._get(f"/api/resource/Employee/{employee_name}")
        emp = resp.get("data", {})
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Employee not found: {employee_name}")

    user_id = emp.get("user_id")

    try:
        client._post("/api/method/frappe.client.set_value", {
            "doctype": "Employee",
            "name": employee_name,
            "fieldname": "status",
            "value": "Active",
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update employee status: {e}")

    user_enabled = False
    if user_id:
        try:
            client._post("/api/method/frappe.client.set_value", {
                "doctype": "User",
                "name": user_id,
                "fieldname": "enabled",
                "value": 1,
            })
            user_enabled = True
            log.info("user_enabled", user=user_id, employee=employee_name)
        except Exception as e:
            log.warning("user_enable_failed", user=user_id, error=str(e))

    log.info("employee_activated", employee=employee_name, user_enabled=user_enabled)
    return {"status": "ok", "employee": employee_name, "new_status": "Active", "user_enabled": user_enabled}
