"""
Leave application and WFH (Attendance Request) approve/reject endpoints.

POST /leave/{leave_id}/approve    — set status=Approved + submit
POST /leave/{leave_id}/reject     — set status=Rejected + submit
POST /wfh/{req_id}/approve        — submit Attendance Request
POST /wfh/{req_id}/reject         — set workflow_state=Rejected + submit
"""

from datetime import date, timedelta
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from webhook_v2.services.erpnext import ERPNextClient
from webhook_v2.core.logging import get_logger

log = get_logger(__name__)
router = APIRouter()


def _submit_doc(client: ERPNextClient, doctype: str, name: str) -> None:
    """Fetch full doc and submit."""
    full_doc = client._get(f"/api/resource/{doctype}/{name}").get("data", {})
    client._post("/api/method/frappe.client.submit", {"doc": full_doc})


@router.post("/leave/{leave_id}/approve")
def approve_leave(leave_id: str):
    """Set Leave Application status to Approved and submit."""
    client = ERPNextClient()
    try:
        client._post("/api/method/frappe.client.set_value", {
            "doctype": "Leave Application",
            "name": leave_id,
            "fieldname": "status",
            "value": "Approved",
        })
        _submit_doc(client, "Leave Application", leave_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to approve leave: {e}")

    log.info("leave_approved", leave=leave_id)
    return {"success": True}


@router.post("/leave/{leave_id}/reject")
def reject_leave(leave_id: str):
    """Set Leave Application status to Rejected and submit."""
    client = ERPNextClient()
    try:
        client._post("/api/method/frappe.client.set_value", {
            "doctype": "Leave Application",
            "name": leave_id,
            "fieldname": "status",
            "value": "Rejected",
        })
        _submit_doc(client, "Leave Application", leave_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to reject leave: {e}")

    log.info("leave_rejected", leave=leave_id)
    return {"success": True}


@router.post("/wfh/{req_id}/approve")
def approve_wfh(req_id: str):
    """Submit Attendance Request (approve WFH)."""
    client = ERPNextClient()
    try:
        _submit_doc(client, "Attendance Request", req_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to approve WFH request: {e}")

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
        _submit_doc(client, "Attendance Request", req_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to reject WFH request: {e}")

    log.info("wfh_rejected", request=req_id)
    return {"success": True}



class LeaveApplyRequest(BaseModel):
    employee: str
    leave_type: str
    from_date: str   # YYYY-MM-DD
    to_date: str     # YYYY-MM-DD
    description: str = ""


def _get_erp_leave_balance(client: ERPNextClient, employee: str, leave_type: str, date: str) -> float:
    """Get leave balance from ERPNext's own API (accounts for pending applications)."""
    result = client._get(
        "/api/method/hrms.hr.doctype.leave_application.leave_application.get_leave_details",
        params={"employee": employee, "leave_type": leave_type, "date": date}
    )
    message = result.get("message") or {}
    allocation = (message.get("leave_allocation") or {}).get(leave_type) or {}
    return float(allocation.get("remaining_leaves", 0))


def _get_employee_holiday_list(client: ERPNextClient, employee: str) -> str | None:
    """Return the holiday list name for an employee (employee-level or company default)."""
    emp = client._get(f"/api/resource/Employee/{employee}").get("data") or {}
    if emp.get("holiday_list"):
        return emp["holiday_list"]
    company = emp.get("company", "Meraki Wedding Planner")
    co = client._get(f"/api/resource/Company/{company}").get("data") or {}
    return co.get("default_holiday_list")


def _get_holidays_in_range(client: ERPNextClient, holiday_list: str, from_str: str, to_str: str) -> set:
    """Return ISO date strings of holidays within [from_str, to_str] from ERPNext."""
    if not holiday_list:
        return set()
    data = client._get(f"/api/resource/Holiday List/{holiday_list}").get("data") or {}
    holidays = data.get("holidays") or []
    result = set()
    for h in holidays:
        d = (h.get("holiday_date") or "")[:10]
        if d and from_str <= d <= to_str:
            result.add(d)
    return result


def _get_holiday_details_in_range(client: ERPNextClient, holiday_list: str, from_str: str, to_str: str) -> list:
    """Return list of {date, description} for non-weekend holidays in [from_str, to_str]."""
    if not holiday_list:
        return []
    data = client._get(f"/api/resource/Holiday List/{holiday_list}").get("data") or {}
    holidays = data.get("holidays") or []
    result = []
    for h in holidays:
        d = (h.get("holiday_date") or "")[:10]
        if not d or not (from_str <= d <= to_str):
            continue
        # Only include actual public holidays, not Sundays added to the list
        day_obj = date.fromisoformat(d)
        if day_obj.weekday() < 5:  # Mon–Fri only (exclude weekends already in list)
            result.append({"date": d, "description": h.get("description", "Holiday")})
    return sorted(result, key=lambda x: x["date"])


def _count_leave_days(from_str: str, to_str: str, holidays: set) -> int:
    """Count Mon-Fri days in [from_str, to_str] excluding given holiday dates."""
    start = date.fromisoformat(from_str)
    end   = date.fromisoformat(to_str)
    count = 0
    for n in range((end - start).days + 1):
        d = start + timedelta(days=n)
        if d.weekday() < 5 and d.isoformat() not in holidays:
            count += 1
    return count


def _end_date_for_n_leave_days(start_str: str, n: int, holidays: set) -> str:
    """Return ISO date of the n-th working non-holiday day from start (inclusive)."""
    current = date.fromisoformat(start_str)
    count = 0
    while True:
        if current.weekday() < 5 and current.isoformat() not in holidays:
            count += 1
            if count >= n:
                return current.isoformat()
        current += timedelta(days=1)


def _next_leave_day(d_str: str, holidays: set) -> str:
    """Return the next working non-holiday day after d_str."""
    current = date.fromisoformat(d_str) + timedelta(days=1)
    while current.weekday() >= 5 or current.isoformat() in holidays:
        current += timedelta(days=1)
    return current.isoformat()


def _create_leave_application(
    client: ERPNextClient,
    employee: str, leave_type: str,
    from_date: str, to_date: str, description: str,
) -> dict:
    result = client._post("/api/resource/Leave Application", {
        "employee": employee, "leave_type": leave_type,
        "from_date": from_date, "to_date": to_date,
        "description": description, "status": "Open",
    })
    return result.get("data", {})


@router.post("/leave/apply")
def apply_leave(body: LeaveApplyRequest):
    client = ERPNextClient()
    try:
        app = _create_leave_application(
            client, body.employee, body.leave_type,
            body.from_date, body.to_date, body.description)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"created": [app]}


class HolidayInfo(BaseModel):
    date: str
    description: str


class LeavePreviewResponse(BaseModel):
    requested_days: int
    total_weekdays: int
    holidays_excluded: list[HolidayInfo]
    casual_balance: float
    needs_split: bool
    casual_days: int
    lwp_days: int
    casual_to_date: str | None
    lwp_from_date: str | None


@router.get("/leave/preview")
def preview_leave(employee: str, leave_type: str, from_date: str, to_date: str):
    """Return split preview without creating any documents."""
    client = ERPNextClient()

    if leave_type != "Casual Leave":
        return LeavePreviewResponse(
            requested_days=0, total_weekdays=0, holidays_excluded=[],
            casual_balance=0, needs_split=False, casual_days=0, lwp_days=0,
            casual_to_date=None, lwp_from_date=None,
        )

    holiday_list     = _get_employee_holiday_list(client, employee)
    holidays         = _get_holidays_in_range(client, holiday_list, from_date, to_date) if holiday_list else set()
    holiday_details  = _get_holiday_details_in_range(client, holiday_list, from_date, to_date) if holiday_list else []
    total_weekdays   = _count_leave_days(from_date, to_date, set())   # raw Mon–Fri count
    requested        = _count_leave_days(from_date, to_date, holidays)
    balance          = _get_erp_leave_balance(client, employee, "Casual Leave", from_date)
    balance_int      = int(balance)

    if balance >= requested:
        return LeavePreviewResponse(
            requested_days=requested, total_weekdays=total_weekdays,
            holidays_excluded=[HolidayInfo(**h) for h in holiday_details],
            casual_balance=balance,
            needs_split=False, casual_days=requested, lwp_days=0,
            casual_to_date=None, lwp_from_date=None,
        )

    casual_days = max(balance_int, 0)
    lwp_days    = requested - casual_days
    casual_to_date = _end_date_for_n_leave_days(from_date, casual_days, holidays) if casual_days > 0 else None
    lwp_from_date  = _next_leave_day(casual_to_date, holidays) if casual_to_date else from_date

    return LeavePreviewResponse(
        requested_days=requested, total_weekdays=total_weekdays,
        holidays_excluded=[HolidayInfo(**h) for h in holiday_details],
        casual_balance=balance,
        needs_split=True,
        casual_days=casual_days,
        lwp_days=lwp_days,
        casual_to_date=casual_to_date,
        lwp_from_date=lwp_from_date,
    )
