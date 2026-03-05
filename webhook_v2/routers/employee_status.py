"""
Employee activation/deactivation endpoints.
Sets Employee.status and disables/enables the linked User account.
"""

import re

from fastapi import APIRouter, HTTPException
from requests.exceptions import HTTPError
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


@router.post("/employee/{employee_name}/delete")
async def delete_employee(employee_name: str):
    client = ERPNextClient()

    # Fetch employee to get linked user_id
    try:
        resp = client._get(f"/api/resource/Employee/{employee_name}")
        emp = resp.get("data", {})
    except Exception:
        raise HTTPException(status_code=404, detail=f"Employee not found: {employee_name}")

    user_id = emp.get("user_id")

    # Delete linked docs that block employee deletion
    LINKED_DOCTYPES = [
        "Attendance Request",
        "Leave Application",
        "Leave Allocation",
        "Attendance",
        "Salary Slip",
        "Payroll Employee Detail",
    ]
    for doctype in LINKED_DOCTYPES:
        try:
            result = client._get(f"/api/resource/{doctype}", params={
                "filters": f'[["employee","=","{employee_name}"]]',
                "fields": '["name","docstatus"]',
                "limit_page_length": 0,
            })
            for doc in result.get("data", []):
                try:
                    # Cancel submitted docs before deleting
                    if doc.get("docstatus") == 1:
                        client._post(f"/api/method/frappe.client.cancel", {
                            "doctype": doctype, "name": doc["name"],
                        })
                    client._delete(f"/api/resource/{doctype}/{doc['name']}")
                    log.info("linked_doc_deleted", doctype=doctype, name=doc["name"])
                except Exception as e:
                    log.warning("linked_doc_delete_failed", doctype=doctype, name=doc["name"], error=str(e))
        except Exception:
            pass  # doctype may not exist or have no employee field

    # Delete the Employee doc
    try:
        client._delete(f"/api/resource/Employee/{employee_name}")
    except HTTPError as e:
        # Extract readable message from ERPNext error response
        msg = str(e)
        try:
            body = e.response.json()
            raw = body.get("exception", msg)
            # Strip HTML tags for cleaner message
            msg = re.sub(r"<[^>]+>", "", raw)
        except Exception:
            pass
        raise HTTPException(status_code=400, detail=msg)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Cannot delete employee: {e}")

    # Delete the linked User (best-effort)
    user_deleted = False
    if user_id:
        try:
            client._delete(f"/api/resource/User/{user_id}")
            user_deleted = True
            log.info("user_deleted", user=user_id, employee=employee_name)
        except Exception as e:
            log.warning("user_delete_failed", user=user_id, error=str(e))

    log.info("employee_deleted", employee=employee_name, user_deleted=user_deleted)
    return {"status": "ok", "employee_deleted": True, "user_deleted": user_deleted}
