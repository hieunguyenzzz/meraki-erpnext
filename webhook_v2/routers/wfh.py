"""
WFH (Attendance Request) endpoints.

POST /wfh/{req_id}/approve  — submit Attendance Request
POST /wfh/{req_id}/reject   — set workflow_state=Rejected + submit
POST /wfh/apply             — create WFH request + notify approver
GET  /wfh/list              — list WFH for one employee
GET  /wfh/list-all          — list all WFH (admin)
"""

import re
from datetime import date
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from webhook_v2.services.erpnext import ERPNextClient
from webhook_v2.core.logging import get_logger
from webhook_v2.routers.helpers import fmt_days, format_date_range, get_employee_name, submit_doc

log = get_logger(__name__)
router = APIRouter()


def _clean_error(msg: str) -> str:
    """Strip HTML and rewrite ERPNext error messages to be user-friendly."""
    clean = re.sub(r"<[^>]+>", "", str(msg)).strip()
    if "already has an Attendance Request" in clean and "overlaps" in clean:
        return "You already have a WFH request that overlaps with this period"
    return clean


def _create_wfh_notification(client: ERPNextClient, to_user: str, message: str, ref_name: str) -> None:
    """Create a PWA Notification for a WFH (Attendance Request) action."""
    try:
        client._post("/api/resource/PWA Notification", {
            "to_user": to_user,
            "message": message,
            "reference_document_type": "Attendance Request",
            "reference_document_name": ref_name,
        })
    except Exception as e:
        log.warning("wfh_notification_failed", to=to_user, ref=ref_name, error=str(e))


def _get_wfh_details(client: ERPNextClient, req_id: str) -> dict:
    """Fetch Attendance Request and return employee, dates, days, user_id."""
    ar = client._get(f"/api/resource/Attendance Request/{req_id}").get("data", {})
    emp_id = ar.get("employee", "")
    from_d = (ar.get("from_date") or "")[:10]
    to_d = (ar.get("to_date") or "")[:10]
    days = (date.fromisoformat(to_d) - date.fromisoformat(from_d)).days + 1 if from_d and to_d else 0
    emp = client._get(f"/api/resource/Employee/{emp_id}").get("data", {}) if emp_id else {}
    return {
        "employee": emp_id,
        "employee_name": get_employee_name(client, emp_id),
        "user_id": emp.get("user_id", ""),
        "from_date": from_d,
        "to_date": to_d,
        "days": days,
        "date_range": format_date_range(from_d, to_d) if from_d and to_d else "",
    }


@router.post("/wfh/{req_id}/approve")
def approve_wfh(req_id: str):
    """Submit Attendance Request (approve WFH)."""
    client = ERPNextClient()
    try:
        submit_doc(client, "Attendance Request", req_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to approve WFH request: {e}")

    try:
        info = _get_wfh_details(client, req_id)
        if info["user_id"]:
            msg = f"Your WFH request ({info['date_range']}, {fmt_days(info['days'])} days) has been Approved"
            _create_wfh_notification(client, info["user_id"], msg, req_id)
    except Exception:
        pass

    log.info("wfh_approved", request=req_id)
    return {"success": True}


@router.post("/wfh/{req_id}/reject")
def reject_wfh(req_id: str):
    """Set Attendance Request workflow_state to Rejected and submit."""
    client = ERPNextClient()
    try:
        client._post("/api/method/frappe.client.set_value", {
            "doctype": "Attendance Request",
            "name": req_id,
            "fieldname": "workflow_state",
            "value": "Rejected",
        })
        submit_doc(client, "Attendance Request", req_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to reject WFH request: {e}")

    try:
        info = _get_wfh_details(client, req_id)
        if info["user_id"]:
            msg = f"Your WFH request ({info['date_range']}, {fmt_days(info['days'])} days) has been Rejected"
            _create_wfh_notification(client, info["user_id"], msg, req_id)
    except Exception:
        pass

    log.info("wfh_rejected", request=req_id)
    return {"success": True}


def _resolve_employee_names(client: ERPNextClient, reqs: list) -> list:
    """Ensure employee_name is the actual name, not the employee ID."""
    # Collect employee IDs that need resolution
    ids_to_resolve = set()
    for r in reqs:
        emp_id = r.get("employee", "")
        emp_name = r.get("employee_name", "")
        if not emp_name or emp_name == emp_id or emp_name.startswith("HR-EMP-"):
            ids_to_resolve.add(emp_id)

    if not ids_to_resolve:
        return reqs

    # Batch-fetch employee names
    name_map = {}
    for emp_id in ids_to_resolve:
        name_map[emp_id] = get_employee_name(client, emp_id)

    # Patch records
    for r in reqs:
        emp_id = r.get("employee", "")
        if emp_id in name_map:
            r["employee_name"] = name_map[emp_id]

    return reqs


@router.get("/wfh/list-all")
def list_all_wfh_requests():
    """Return all WFH (Attendance Request) records for admin management."""
    client = ERPNextClient()
    reqs = client._get("/api/resource/Attendance Request", params={
        "filters": '[["reason","=","Work From Home"]]',
        "fields": '["name","employee","employee_name","from_date","to_date","reason","explanation","docstatus"]',
        "order_by": "creation desc",
        "limit_page_length": 200,
    }).get("data", [])
    return {"data": _resolve_employee_names(client, reqs)}


@router.get("/wfh/list")
def list_wfh_requests(employee: str):
    """Return WFH (Attendance Request) records for an employee."""
    client = ERPNextClient()
    reqs = client._get("/api/resource/Attendance Request", params={
        "filters": f'[["employee","=","{employee}"],["reason","=","Work From Home"]]',
        "fields": '["name","employee","employee_name","from_date","to_date","reason","explanation","docstatus"]',
        "order_by": "creation desc",
        "limit_page_length": 100,
    }).get("data", [])
    return {"data": _resolve_employee_names(client, reqs)}


class WfhApplyRequest(BaseModel):
    employee: str
    from_date: str
    to_date: str
    explanation: str = ""


@router.post("/wfh/apply")
def apply_wfh_request(body: WfhApplyRequest):
    """Create a Work From Home Attendance Request."""
    client = ERPNextClient()
    try:
        result = client._post("/api/resource/Attendance Request", {
            "employee": body.employee,
            "from_date": body.from_date,
            "to_date": body.to_date,
            "reason": "Work From Home",
            "explanation": body.explanation,
        })
        ar_data = result.get("data", {})

        # Notify leave approver
        try:
            ar_name = ar_data.get("name", "")
            emp_name = get_employee_name(client, body.employee)
            from_d = body.from_date[:10]
            to_d = body.to_date[:10]
            days = (date.fromisoformat(to_d) - date.fromisoformat(from_d)).days + 1
            date_range = format_date_range(from_d, to_d)
            details = client._get(
                "/api/method/hrms.hr.doctype.leave_application.leave_application.get_leave_details",
                params={"employee": body.employee, "date": from_d}
            )
            leave_approver = (details.get("message") or {}).get("leave_approver")
            if leave_approver and ar_name:
                reason_part = f" — {body.explanation}" if body.explanation else ""
                msg = f"{emp_name} requests WFH: {date_range} ({fmt_days(days)} days){reason_part}"
                _create_wfh_notification(client, leave_approver, msg, ar_name)
        except Exception:
            pass

        return {"data": ar_data}
    except Exception as e:
        raise HTTPException(status_code=400, detail=_clean_error(e))
