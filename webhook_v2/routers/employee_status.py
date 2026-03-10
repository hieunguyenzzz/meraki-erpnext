"""
Employee activation/deactivation endpoints.
Sets Employee.status and disables/enables the linked User account.
"""

import re
from datetime import date

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
        # Set relieving_date first (required by ERPNext for "Left" status)
        client._post("/api/method/frappe.client.set_value", {
            "doctype": "Employee",
            "name": employee_name,
            "fieldname": "relieving_date",
            "value": str(date.today()),
        })
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

    # Re-enable user BEFORE setting employee status (ERPNext validates user is enabled)
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

    try:
        client._post("/api/method/frappe.client.set_value", {
            "doctype": "Employee",
            "name": employee_name,
            "fieldname": "status",
            "value": "Active",
        })
        # Clear relieving_date after reactivation
        client._post("/api/method/frappe.client.set_value", {
            "doctype": "Employee",
            "name": employee_name,
            "fieldname": "relieving_date",
            "value": "",
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update employee status: {e}")

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

    # Step 1: Remove employee from Payroll Entries (or cancel+delete if submitted)
    # Child table (Payroll Employee Detail) returns 403 on direct query,
    # so we list all PEs and check each one's employees list.
    try:
        all_pe = client._get("/api/resource/Payroll Entry", params={
            "fields": '["name","docstatus"]',
            "limit_page_length": 0,
        }).get("data", [])
        for pe_summary in all_pe:
            pe_name = pe_summary["name"]
            try:
                pe = client._get(f"/api/resource/Payroll Entry/{pe_name}").get("data", {})
                emp_rows = [r for r in pe.get("employees", []) if r.get("employee") == employee_name]
                if not emp_rows:
                    continue
                if pe.get("docstatus") == 1:
                    # Submitted: must cancel + delete the whole PE
                    client._post("/api/method/frappe.client.cancel", {
                        "doctype": "Payroll Entry", "name": pe_name,
                    })
                    client._delete(f"/api/resource/Payroll Entry/{pe_name}")
                    log.info("payroll_entry_cancelled_deleted", name=pe_name, employee=employee_name)
                else:
                    # Draft: remove only this employee's row from the PE
                    remaining = [r for r in pe.get("employees", []) if r.get("employee") != employee_name]
                    client._put(f"/api/resource/Payroll Entry/{pe_name}", {
                        "employees": remaining,
                    })
                    log.info("payroll_entry_row_removed", name=pe_name, employee=employee_name)
            except Exception as e:
                log.warning("payroll_entry_cleanup_failed", name=pe_name, error=str(e))
    except Exception as e:
        log.warning("payroll_entry_list_failed", error=str(e))

    # Step 2: Clear employee references from Projects (custom link fields)
    PROJECT_EMPLOYEE_FIELDS = [
        "custom_lead_planner", "custom_support_planner",
        "custom_assistant_1", "custom_assistant_2",
    ]
    for field in PROJECT_EMPLOYEE_FIELDS:
        try:
            projects = client._get("/api/resource/Project", params={
                "filters": f'[["{field}","=","{employee_name}"]]',
                "fields": '["name"]',
                "limit_page_length": 0,
            }).get("data", [])
            for proj in projects:
                try:
                    client._put(f"/api/resource/Project/{proj['name']}", {field: ""})
                    log.info("project_employee_ref_cleared", project=proj["name"], field=field)
                except Exception as e:
                    log.warning("project_ref_clear_failed", project=proj["name"], field=field, error=str(e))
        except Exception:
            pass

    # Step 3: Delete remaining per-employee linked docs
    LINKED_DOCTYPES = [
        "Attendance Request",
        "Leave Application",
        "Leave Allocation",
        "Attendance",
        "Salary Slip",
        "Salary Structure Assignment",
        "Additional Salary",
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
                    if doc.get("docstatus") == 1:
                        client._post("/api/method/frappe.client.cancel", {
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
