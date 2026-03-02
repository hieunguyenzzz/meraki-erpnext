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


def _get_casual_leave_balance(client: ERPNextClient, employee: str) -> int:
    """Sum Leave Ledger entries for Casual Leave (submitted, not expired)."""
    filters = (
        f'[["employee","=","{employee}"]'
        ',["leave_type","=","Casual Leave"]'
        ',["docstatus","=",1],["is_expired","=",0]]'
    )
    data = client._get(
        f"/api/resource/Leave Ledger Entry?filters={filters}&fields=[%22leaves%22]&limit=200"
    )
    return int(sum(float(e.get("leaves", 0)) for e in (data.get("data") or [])))


def _count_working_days(from_str: str, to_str: str) -> int:
    """Count Mon-Fri days between two dates (inclusive)."""
    start = date.fromisoformat(from_str)
    end   = date.fromisoformat(to_str)
    return sum(1 for n in range((end - start).days + 1)
               if (start + timedelta(days=n)).weekday() < 5)


def _end_date_for_n_working_days(start_str: str, n: int) -> str:
    """Return ISO date that is the n-th Mon-Fri working day from start (inclusive)."""
    current = date.fromisoformat(start_str)
    count = 0
    while True:
        if current.weekday() < 5:
            count += 1
            if count >= n:
                return current.isoformat()
        current += timedelta(days=1)


def _next_working_day(d_str: str) -> str:
    """Return the next Mon-Fri day after d_str."""
    current = date.fromisoformat(d_str) + timedelta(days=1)
    while current.weekday() >= 5:
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

    # Non-Casual Leave: create directly, no special logic
    if body.leave_type != "Casual Leave":
        try:
            app = _create_leave_application(
                client, body.employee, body.leave_type,
                body.from_date, body.to_date, body.description)
        except Exception as e:
            raise HTTPException(status_code=400, detail=str(e))
        return {"created": [app], "message": None}

    # Casual Leave — check balance and auto-split if needed
    balance   = _get_casual_leave_balance(client, body.employee)
    requested = _count_working_days(body.from_date, body.to_date)

    # Case 1: enough balance
    if balance >= requested:
        try:
            app = _create_leave_application(
                client, body.employee, "Casual Leave",
                body.from_date, body.to_date, body.description)
        except Exception as e:
            raise HTTPException(status_code=400, detail=str(e))
        return {"created": [app], "message": None}

    # Case 2: zero balance — full LWP
    if balance <= 0:
        try:
            app = _create_leave_application(
                client, body.employee, "Leave Without Pay",
                body.from_date, body.to_date, body.description)
        except Exception as e:
            raise HTTPException(status_code=400, detail=str(e))
        return {
            "created": [app],
            "message": (
                f"Your Casual Leave balance is exhausted. "
                f"All {requested} day(s) have been submitted as Leave Without Pay (Unpaid)."
            ),
        }

    # Case 3: partial balance — split Casual + LWP
    lwp_days   = requested - balance
    casual_end = _end_date_for_n_working_days(body.from_date, balance)
    lwp_start  = _next_working_day(casual_end)
    created    = []

    try:
        created.append(_create_leave_application(
            client, body.employee, "Casual Leave",
            body.from_date, casual_end, body.description))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to create Casual Leave portion: {e}")

    try:
        created.append(_create_leave_application(
            client, body.employee, "Leave Without Pay",
            lwp_start, body.to_date, body.description))
    except Exception as e:
        # Rollback: cancel the casual leave we just created
        try:
            client._post("/api/method/frappe.client.cancel",
                         {"doctype": "Leave Application", "name": created[0].get("name", "")})
        except Exception:
            pass
        raise HTTPException(status_code=400, detail=f"Failed to create Leave Without Pay portion: {e}")

    log.info("leave_applied_split", employee=body.employee,
             casual_days=balance, lwp_days=lwp_days)
    return {
        "created": created,
        "message": (
            f"Your leave has been split: {balance} day(s) as Casual Leave "
            f"and {lwp_days} day(s) as Leave Without Pay (Unpaid), "
            f"since your remaining Casual Leave balance was {balance} day(s)."
        ),
    }
