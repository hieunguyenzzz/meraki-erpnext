"""
Leave application endpoints.

POST /leave/{leave_id}/approve  — set status=Approved + submit
POST /leave/{leave_id}/reject   — set status=Rejected + submit
POST /leave/apply               — create leave application (with auto-split)
GET  /leave/preview             — preview split without creating docs
GET  /leave/balance             — accrual-aware balance for an employee
GET  /leave/employee-detail     — period-grouped balance for detail page
GET  /leave/my-applications     — list leave applications for an employee
"""

import json
import math
from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException, Request, BackgroundTasks
from pydantic import BaseModel
from webhook_v2.services.erpnext import ERPNextClient
from webhook_v2.services.google_calendar import add_ooo_event, delete_ooo_events
from webhook_v2.services.leave_balance import Pool, available_on, build_pools
from webhook_v2.core.logging import get_logger
from webhook_v2.routers.helpers import calendar_name, fmt_days, format_date_range, get_employee_name, submit_doc
from webhook_v2.auth import require_roles, resolve_employee, get_current_user, HR

log = get_logger(__name__)
router = APIRouter()


def _employee_pools(
    client: ERPNextClient,
    employee: str,
    today: date,
    leave_type: str | None = None,
) -> dict[str, list[Pool]]:
    """Fetch an employee's allocations + applications and charge one against the other.

    All the arithmetic lives in `services.leave_balance` so every surface that
    reports leave agrees on the answer (MWP-56).
    """
    emp = client._get(f"/api/resource/Employee/{employee}").get("data") or {}
    rel_str = (emp.get("relieving_date") or "")[:10]
    doj_str = (emp.get("date_of_joining") or "")[:10]

    alloc_filters = [["employee", "=", employee], ["docstatus", "=", 1]]
    app_filters = [
        ["employee", "=", employee],
        ["docstatus", "!=", 2],
        ["status", "!=", "Rejected"],
    ]
    if leave_type:
        alloc_filters.append(["leave_type", "=", leave_type])
        app_filters.append(["leave_type", "=", leave_type])

    allocs = client._get("/api/resource/Leave Allocation", params={
        "filters": json.dumps(alloc_filters),
        "fields": '["name","leave_type","from_date","to_date","new_leaves_allocated","total_leaves_allocated"]',
        "limit_page_length": 200,
    }).get("data", [])

    apps = client._get("/api/resource/Leave Application", params={
        "filters": json.dumps(app_filters),
        "fields": '["name","leave_type","from_date","to_date","total_leave_days","status","docstatus"]',
        "limit_page_length": 500,
    }).get("data", [])

    return build_pools(
        allocs, apps,
        today=today,
        date_of_joining=date.fromisoformat(doj_str) if doj_str else None,
        relieving_date=date.fromisoformat(rel_str) if rel_str else None,
    )


def _available_for_leave_date(
    client: ERPNextClient,
    employee: str,
    leave_type: str,
    leave_from_date: date,
) -> float:
    """How many days of `leave_type` are bookable on `leave_from_date`.

    Every allocation covering an application's own from_date funds it, earliest
    expiry first — so a pool expiring can't re-attribute the leave it already
    funded onto a still-live pool (MWP-56).
    """
    pools = _employee_pools(client, employee, date.today(), leave_type)
    return available_on(pools.get(leave_type, []), leave_from_date)


def _enrich_leave_notification(
    client: ERPNextClient, leave_app_name: str, message: str
) -> None:
    """Update the most recent PWA Notification for a leave application with a richer message."""
    try:
        notifs = client._get("/api/resource/PWA Notification", params={
            "filters": f'[["reference_document_type","=","Leave Application"],["reference_document_name","=","{leave_app_name}"]]',
            "fields": '["name"]',
            "order_by": "creation desc",
            "limit_page_length": 1,
        }).get("data", [])
        if notifs:
            client._post("/api/method/frappe.client.set_value", {
                "doctype": "PWA Notification",
                "name": notifs[0]["name"],
                "fieldname": "message",
                "value": message,
            })
    except Exception as e:
        log.warning("enrich_notification_failed", leave=leave_app_name, error=str(e))


@router.post("/leave/{leave_id}/approve", dependencies=[Depends(require_roles(*HR))])
def approve_leave(leave_id: str, background_tasks: BackgroundTasks):
    """Set Leave Application status to Approved and submit.

    Idempotent: a re-click on an already-decided application is a no-op, so it
    can't create duplicate calendar events.
    """
    client = ERPNextClient()
    existing = client._get(f"/api/resource/Leave Application/{leave_id}").get("data", {})
    if existing.get("docstatus") == 1 or existing.get("status") in ("Approved", "Rejected"):
        log.info("leave_approve_noop", leave=leave_id, status=existing.get("status"))
        return {"success": True, "already_processed": True}
    try:
        _approve_and_submit(client, leave_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to approve leave: {e}")

    # Enrich PWA notification with leave details + add calendar event
    try:
        app = client._get(f"/api/resource/Leave Application/{leave_id}").get("data", {})
        leave_type = app.get("leave_type", "Leave")
        from_d = (app.get("from_date") or "")[:10]
        to_d = (app.get("to_date") or "")[:10]
        days = app.get("total_leave_days", 0)
        approver_name = get_employee_name(client, app.get("leave_approver", ""))
        date_range = format_date_range(from_d, to_d) if from_d and to_d else ""
        msg = f"Your {leave_type} ({date_range}, {fmt_days(days)} days) has been Approved by {approver_name}"
        _enrich_leave_notification(client, leave_id, msg)
        # Add OOO event to Google Calendar in the background (non-blocking).
        if from_d and to_d:
            emp = client._get(f"/api/resource/Employee/{app.get('employee', '')}").get("data", {})
            background_tasks.add_task(add_ooo_event, calendar_name(emp.get("first_name", ""), emp.get("last_name", "")), from_d, to_d)
    except Exception:
        pass  # non-critical

    log.info("leave_approved", leave=leave_id)
    return {"success": True}


@router.post("/leave/{leave_id}/reject", dependencies=[Depends(require_roles(*HR))])
def reject_leave(leave_id: str):
    """Set Leave Application status to Rejected and submit.

    Idempotent: a re-click on an already-decided application is a no-op.
    """
    client = ERPNextClient()
    existing = client._get(f"/api/resource/Leave Application/{leave_id}").get("data", {})
    if existing.get("docstatus") == 1 or existing.get("status") in ("Approved", "Rejected"):
        log.info("leave_reject_noop", leave=leave_id, status=existing.get("status"))
        return {"success": True, "already_processed": True}
    try:
        client._post("/api/method/frappe.client.set_value", {
            "doctype": "Leave Application",
            "name": leave_id,
            "fieldname": "status",
            "value": "Rejected",
        })
        submit_doc(client, "Leave Application", leave_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to reject leave: {e}")

    # Enrich PWA notification with leave details
    try:
        app = client._get(f"/api/resource/Leave Application/{leave_id}").get("data", {})
        leave_type = app.get("leave_type", "Leave")
        from_d = (app.get("from_date") or "")[:10]
        to_d = (app.get("to_date") or "")[:10]
        days = app.get("total_leave_days", 0)
        approver_name = get_employee_name(client, app.get("leave_approver", ""))
        date_range = format_date_range(from_d, to_d) if from_d and to_d else ""
        msg = f"Your {leave_type} ({date_range}, {fmt_days(days)} days) has been Rejected by {approver_name}"
        _enrich_leave_notification(client, leave_id, msg)
    except Exception:
        pass  # non-critical

    log.info("leave_rejected", leave=leave_id)
    return {"success": True}


def _enrich_apply_notification(
    client: ERPNextClient, employee_id: str, leave_app: dict, reason: str
) -> None:
    """Enrich the PWA Notification created by HRMS after a leave application is inserted."""
    try:
        app_name = leave_app.get("name", "")
        if not app_name:
            return
        emp_name = get_employee_name(client, employee_id)
        leave_type = leave_app.get("leave_type", "Leave")
        from_d = (leave_app.get("from_date") or "")[:10]
        to_d = (leave_app.get("to_date") or "")[:10]
        days = leave_app.get("total_leave_days", 0)
        date_range = format_date_range(from_d, to_d) if from_d and to_d else ""
        reason_part = f" — {reason}" if reason else ""
        msg = f"{emp_name} requests {leave_type}: {date_range} ({fmt_days(days)} days){reason_part}"
        _enrich_leave_notification(client, app_name, msg)
    except Exception:
        pass  # non-critical


class LeaveApplyRequest(BaseModel):
    employee: str
    leave_type: str
    from_date: str   # YYYY-MM-DD
    to_date: str     # YYYY-MM-DD
    description: str = ""
    half_day: bool = False
    half_day_period: str = ""  # "AM" or "PM"
    auto_approve: bool = False  # HR-only: create + approve + submit in one call


def _approve_and_submit(client: ERPNextClient, leave_id: str) -> None:
    """Set Leave Application status to Approved and submit the doc."""
    client._post("/api/method/frappe.client.set_value", {
        "doctype": "Leave Application",
        "name": leave_id,
        "fieldname": "status",
        "value": "Approved",
    })
    submit_doc(client, "Leave Application", leave_id)


def _finalize_apply(
    client: ERPNextClient, body: LeaveApplyRequest, created: list[dict], split: bool
) -> dict:
    """Optionally auto-approve each created Leave Application, then return the payload.

    Skip docs already submitted via the Server Script bypass (docstatus=1).
    """
    if body.auto_approve:
        for app in created:
            name = app.get("name")
            if name and app.get("docstatus") != 1:
                _approve_and_submit(client, name)
    return {"created": created, "split": split}


def _leave_type_includes_holidays(client: ERPNextClient, leave_type: str) -> bool:
    """Return True if the leave type counts all calendar days (include_holiday=1)."""
    lt = client._get(f"/api/resource/Leave Type/{leave_type}").get("data") or {}
    return bool(lt.get("include_holiday"))


def _get_erp_leave_balance(client: ERPNextClient, employee: str, leave_type: str, date: str) -> float:
    """Get effective leave balance (remaining minus pending) to match ERPNext's own validation."""
    result = client._get(
        "/api/method/hrms.hr.doctype.leave_application.leave_application.get_leave_details",
        params={"employee": employee, "leave_type": leave_type, "date": date}
    )
    message = result.get("message") or {}
    allocation = (message.get("leave_allocation") or {}).get(leave_type) or {}
    remaining = float(allocation.get("remaining_leaves", 0))
    pending   = float(allocation.get("leaves_pending_approval", 0))
    return max(remaining - pending, 0)


_WEEKDAY_MAP = {
    "Monday": 0, "Tuesday": 1, "Wednesday": 2, "Thursday": 3,
    "Friday": 4, "Saturday": 5, "Sunday": 6,
}


def _get_employee_holiday_list(client: ERPNextClient, employee: str) -> str | None:
    """Return the holiday list name for an employee (employee-level or company default)."""
    emp = client._get(f"/api/resource/Employee/{employee}").get("data") or {}
    if emp.get("holiday_list"):
        return emp["holiday_list"]
    company = emp.get("company", "Meraki Wedding Planner")
    co = client._get(f"/api/resource/Company/{company}").get("data") or {}
    return co.get("default_holiday_list")


def _get_weekly_off(client: ERPNextClient, holiday_list: str) -> int:
    """Return the Python weekday() number for the weekly off day (Mon=0 … Sun=6)."""
    if not holiday_list:
        return 6  # default Sunday
    data = client._get(f"/api/resource/Holiday List/{holiday_list}").get("data") or {}
    weekly_off_name = data.get("weekly_off", "Sunday")
    return _WEEKDAY_MAP.get(weekly_off_name, 6)


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
        day_obj = date.fromisoformat(d)
        if day_obj.weekday() < 5:
            result.append({"date": d, "description": h.get("description", "Holiday")})
    return sorted(result, key=lambda x: x["date"])


def _is_working_day(d: date, holidays: set, weekly_off: int = 6) -> bool:
    return d.weekday() < 5 and d.isoformat() not in holidays


def _count_leave_days(from_str: str, to_str: str, holidays: set, weekly_off: int = 6) -> int:
    """Count working days in [from_str, to_str] excluding the weekly off day and holidays."""
    start = date.fromisoformat(from_str)
    end   = date.fromisoformat(to_str)
    return sum(
        1 for n in range((end - start).days + 1)
        if _is_working_day(start + timedelta(days=n), holidays, weekly_off)
    )


def _end_date_for_n_leave_days(start_str: str, n: int, holidays: set, weekly_off: int = 6) -> str:
    """Return ISO date of the n-th working non-holiday day from start (inclusive)."""
    current = date.fromisoformat(start_str)
    count = 0
    while True:
        if _is_working_day(current, holidays, weekly_off):
            count += 1
            if count >= n:
                return current.isoformat()
        current += timedelta(days=1)


def _next_leave_day(d_str: str, holidays: set, weekly_off: int = 6) -> str:
    """Return the next working non-holiday day after d_str."""
    current = date.fromisoformat(d_str) + timedelta(days=1)
    while not _is_working_day(current, holidays, weekly_off):
        current += timedelta(days=1)
    return current.isoformat()


def _create_leave_application(
    client: ERPNextClient,
    employee: str, leave_type: str,
    from_date: str, to_date: str, description: str,
    leave_approver: str | None = None,
    half_day: bool = False,
) -> dict:
    payload = {
        "employee": employee, "leave_type": leave_type,
        "from_date": from_date, "to_date": to_date,
        "description": description, "status": "Open",
    }
    if leave_approver:
        payload["leave_approver"] = leave_approver
    if half_day:
        payload["half_day"] = 1
    result = client._post("/api/resource/Leave Application", payload)
    return result.get("data", {})


def _create_approved_leave_via_script(
    client: ERPNextClient,
    employee: str, leave_type: str,
    from_date: str, to_date: str, description: str,
    total_leave_days: float,
    leave_approver: str | None = None,
    half_day: bool = False,
    half_day_period: str = "",
) -> dict:
    """Create + submit a Leave Application via Server Script, bypassing
    ERPNext's `validate_leave_balance`. Our own balance check upstream
    (`_available_for_leave_date`) is the authority.
    """
    payload = {
        "employee": employee,
        "leave_type": leave_type,
        "from_date": from_date,
        "to_date": to_date,
        "description": description,
        "status": "Approved",
        "leave_approver": leave_approver or "",
        "half_day": 1 if half_day else 0,
        "half_day_period": half_day_period if half_day else "",
        "total_leave_days": total_leave_days,
    }
    resp = client._post("/api/method/meraki_create_approved_leave", payload)
    msg = resp.get("message") if isinstance(resp.get("message"), dict) else {}
    leave_id = msg.get("leave_application") or resp.get("leave_application")
    if not leave_id:
        raise Exception(f"meraki_create_approved_leave did not return leave_application: {resp}")
    doc = client._get(f"/api/resource/Leave Application/{leave_id}").get("data") or {}
    return doc


def _compute_total_leave_days(
    from_date: str, to_date: str, half_day: bool,
    include_holiday: bool, holidays: set, weekly_off: int,
) -> float:
    """Days that the Leave Application records (matches ERPNext's own counting)."""
    if half_day:
        return 0.5
    if include_holiday:
        start_d = date.fromisoformat(from_date)
        end_d = date.fromisoformat(to_date)
        return float((end_d - start_d).days + 1)
    return float(_count_leave_days(from_date, to_date, holidays, weekly_off))


@router.delete("/leave/{leave_id}", dependencies=[Depends(require_roles(*HR))])
def delete_leave(leave_id: str):
    """Cancel (if submitted) + delete linked Attendance records + delete the leave application."""
    client = ERPNextClient()
    try:
        app = client._get(f"/api/resource/Leave Application/{leave_id}").get("data", {})
        if not app:
            raise HTTPException(status_code=404, detail="Leave application not found")

        # Cancel if submitted
        if app.get("docstatus") == 1:
            client._post("/api/method/frappe.client.cancel", {
                "doctype": "Leave Application", "name": leave_id,
            })

        # Delete linked Attendance records
        attendances = client._get("/api/resource/Attendance", params={
            "filters": f'[["leave_application","=","{leave_id}"]]',
            "fields": '["name","docstatus"]',
            "limit_page_length": 100,
        }).get("data", [])
        for att in attendances:
            if att.get("docstatus") == 1:
                client._post("/api/method/frappe.client.cancel", {
                    "doctype": "Attendance", "name": att["name"],
                })
            client._delete(f"/api/resource/Attendance/{att['name']}")

        # Delete the leave application
        client._delete(f"/api/resource/Leave Application/{leave_id}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to delete leave: {e}")

    log.info("leave_deleted", leave=leave_id)
    return {"success": True}


class CancelSelfLeaveRequest(BaseModel):
    employee: str  # must match the leave's employee — ownership check


@router.post("/leave/{leave_id}/cancel-self")
def cancel_own_leave(leave_id: str, body: CancelSelfLeaveRequest, background_tasks: BackgroundTasks, request: Request):
    """Staff-facing cancel: allowed only when from_date >= today and leave belongs to the employee.

    Ownership is checked against the session employee — the `employee` field
    in the request body is accepted for backward compatibility but ignored.
    """
    session_employee = resolve_employee(request, None)
    client = ERPNextClient()
    app = client._get(f"/api/resource/Leave Application/{leave_id}").get("data", {})
    if not app:
        raise HTTPException(status_code=404, detail="Leave application not found")
    if app.get("employee") != session_employee:
        raise HTTPException(status_code=403, detail="You can only cancel your own leave")
    if app.get("docstatus") == 2:
        raise HTTPException(status_code=400, detail="Leave is already cancelled")
    from_d = (app.get("from_date") or "")[:10]
    to_d = (app.get("to_date") or "")[:10]
    if not from_d or date.fromisoformat(from_d) < date.today():
        raise HTTPException(status_code=400, detail="Cannot cancel a leave that has already started or passed")

    # Capture name tokens before deletion so we can remove the OOO calendar event after.
    emp = client._get(f"/api/resource/Employee/{session_employee}").get("data", {})
    name_tokens = f"{emp.get('first_name', '')} {emp.get('last_name', '')}".split()

    try:
        if app.get("docstatus") == 1:
            client._post("/api/method/frappe.client.cancel", {
                "doctype": "Leave Application", "name": leave_id,
            })
        attendances = client._get("/api/resource/Attendance", params={
            "filters": f'[["leave_application","=","{leave_id}"]]',
            "fields": '["name","docstatus"]',
            "limit_page_length": 100,
        }).get("data", [])
        for att in attendances:
            if att.get("docstatus") == 1:
                client._post("/api/method/frappe.client.cancel", {
                    "doctype": "Attendance", "name": att["name"],
                })
            client._delete(f"/api/resource/Attendance/{att['name']}")
        client._delete(f"/api/resource/Leave Application/{leave_id}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to cancel leave: {e}")

    # Remove the OOO event from Google Calendar in the background (non-blocking).
    if from_d and to_d and name_tokens:
        background_tasks.add_task(delete_ooo_events, from_d, to_d, name_tokens)

    log.info("leave_cancelled_self", leave=leave_id, employee=session_employee)
    return {"success": True}


@router.post("/leave/{leave_id}/re-approve", dependencies=[Depends(require_roles(*HR))])
def re_approve_leave(leave_id: str):
    """Re-approve a Rejected leave: cancel it, recreate with same data, approve + submit."""
    client = ERPNextClient()
    try:
        app = client._get(f"/api/resource/Leave Application/{leave_id}").get("data", {})
        if app.get("status") != "Rejected":
            raise HTTPException(status_code=400, detail="Only Rejected leaves can be re-approved")

        # Cancel the rejected record
        client._post("/api/method/frappe.client.cancel", {"doctype": "Leave Application", "name": leave_id})

        # Recreate with same core fields
        new_app = client._post("/api/resource/Leave Application", {
            "employee": app["employee"],
            "leave_type": app["leave_type"],
            "from_date": app["from_date"],
            "to_date": app["to_date"],
            "description": app.get("description", ""),
            "status": "Open",
            **({"leave_approver": app["leave_approver"]} if app.get("leave_approver") else {}),
            **({"half_day": app["half_day"]} if app.get("half_day") else {}),
        }).get("data", {})

        new_name = new_app.get("name")
        if not new_name:
            raise HTTPException(status_code=500, detail="Failed to create replacement leave application")

        _approve_and_submit(client, new_name)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to re-approve leave: {e}")

    log.info("leave_re_approved", original=leave_id, new=new_name)
    return {"success": True, "new_name": new_name}


class LeaveAllocationUpdate(BaseModel):
    new_leaves_allocated: float


@router.post("/leave/allocation/{name}", dependencies=[Depends(require_roles(*HR))])
def update_leave_allocation(name: str, body: LeaveAllocationUpdate):
    """Update annual entitlement on a submitted Leave Allocation.

    Bypasses ERPNext's `frappe.client.set_value` because it triggers
    `doc.save()` → HRMS `before_submit` validation that crashes with
    `TypeError: int - NoneType` on certain allocations. Uses the
    `meraki-leave-db-update` allowlisted Server Script which writes via
    `frappe.db.set_value` (no validation chain).
    """
    client = ERPNextClient()
    try:
        alloc = client._get(f"/api/resource/Leave Allocation/{name}").get("data") or {}
        if not alloc:
            raise HTTPException(status_code=404, detail=f"Leave Allocation {name} not found")

        unused = float(alloc.get("unused_leaves") or 0)
        new_value = float(body.new_leaves_allocated)
        new_total = new_value + unused

        for fieldname, value in (
            ("new_leaves_allocated", new_value),
            ("total_leaves_allocated", new_total),
        ):
            client._post("/api/method/meraki_leave_db_update", {
                "doctype": "Leave Allocation",
                "name": name,
                "fieldname": fieldname,
                "value": value,
            })

        # Sync the corresponding Leave Ledger Entry so ERPNext's own balance
        # calculation (used by Leave Application validation) stays consistent.
        ledgers = client._get("/api/resource/Leave Ledger Entry", params={
            "filters": f'[["transaction_type","=","Leave Allocation"],["transaction_name","=","{name}"]]',
            "fields": '["name"]',
            "limit_page_length": 5,
        }).get("data", [])
        for entry in ledgers:
            client._post("/api/method/meraki_leave_db_update", {
                "doctype": "Leave Ledger Entry",
                "name": entry["name"],
                "fieldname": "leaves",
                "value": new_total,
            })
    except HTTPException:
        raise
    except Exception as e:
        log.error("leave_allocation_update_failed", name=name, error=str(e))
        raise HTTPException(status_code=400, detail=f"Failed to update allocation: {e}")

    log.info("leave_allocation_updated", name=name, new_leaves_allocated=new_value, total_leaves_allocated=new_total)
    return {"success": True, "new_leaves_allocated": new_value, "total_leaves_allocated": new_total}


@router.post("/leave/apply")
def apply_leave(body: LeaveApplyRequest, request: Request):
    """Create leave application(s). For Annual Leave with insufficient balance,
    automatically splits into Annual Leave + Leave Without Pay.

    `employee` defaults to the caller's own Employee; filing for someone else
    (HrAddLeaveSheet) requires HR.
    """
    body.employee = resolve_employee(request, body.employee, override_roles=HR)
    client = ERPNextClient()

    # Prepend half-day AM/PM to description so it shows in notifications
    description = body.description
    if body.half_day and body.half_day_period:
        prefix = f"Half Day ({body.half_day_period})"
        description = f"{prefix} — {description}" if description else prefix

    # Holiday context — needed for both balance math and total_leave_days when bypassing.
    holiday_list = _get_employee_holiday_list(client, body.employee)
    weekly_off = _get_weekly_off(client, holiday_list) if holiday_list else 6
    holidays = _get_holidays_in_range(client, holiday_list, body.from_date, body.to_date) if holiday_list else set()

    def _create(leave_type: str, from_d: str, to_d: str, half_day: bool) -> dict:
        """Create a single Leave Application, using the Server Script bypass when
        auto_approve is set so we sidestep ERPNext's broken validate_leave_balance."""
        if body.auto_approve:
            include_holiday = _leave_type_includes_holidays(client, leave_type)
            total = _compute_total_leave_days(
                from_d, to_d, half_day, include_holiday, holidays, weekly_off
            )
            return _create_approved_leave_via_script(
                client, body.employee, leave_type, from_d, to_d, description,
                total_leave_days=total,
                leave_approver=leave_approver,
                half_day=half_day,
                half_day_period=body.half_day_period,
            )
        return _create_leave_application(
            client, body.employee, leave_type, from_d, to_d, description,
            leave_approver=leave_approver, half_day=half_day,
        )

    try:
        details = client._get(
            "/api/method/hrms.hr.doctype.leave_application.leave_application.get_leave_details",
            params={"employee": body.employee, "leave_type": body.leave_type, "date": body.from_date}
        )
        leave_approver = (details.get("message") or {}).get("leave_approver")

        # Auto-split Annual Leave when balance is insufficient. Sum every Leave
        # Allocation overlapping the leave's from_date (long-span allocations are
        # treated as accruing and capped at the accrued portion / relieving_date).
        if body.leave_type == "Annual Leave":
            balance = _available_for_leave_date(
                client, body.employee, "Annual Leave", date.fromisoformat(body.from_date)
            )
            balance_usable = math.floor(balance * 2) / 2
            balance_days   = int(balance_usable)

            if balance_days == 0:
                app = _create("Leave Without Pay", body.from_date, body.to_date, body.half_day)
                _enrich_apply_notification(client, body.employee, app, description)
                return _finalize_apply(client, body, [app], True)

            include_holiday = _leave_type_includes_holidays(client, "Annual Leave")
            casual_to_date = lwp_from_date = requested = None

            if include_holiday:
                start_d = date.fromisoformat(body.from_date)
                end_d   = date.fromisoformat(body.to_date)
                requested = (end_d - start_d).days + 1
                if balance_days < requested:
                    casual_to_date = (start_d + timedelta(days=balance_days - 1)).isoformat()
                    lwp_from_date  = (date.fromisoformat(casual_to_date) + timedelta(days=1)).isoformat()
            else:
                requested = _count_leave_days(body.from_date, body.to_date, holidays, weekly_off)
                if balance_days < requested:
                    casual_to_date = _end_date_for_n_leave_days(body.from_date, balance_days, holidays, weekly_off)
                    lwp_from_date  = _next_leave_day(casual_to_date, holidays, weekly_off)

            if balance_days < requested:
                is_single_day = body.from_date == body.to_date
                cl_app = _create(
                    "Annual Leave", body.from_date, casual_to_date,
                    body.half_day if is_single_day else False,
                )
                try:
                    lwp_app = _create(
                        "Leave Without Pay", lwp_from_date, body.to_date,
                        body.half_day if is_single_day else False,
                    )
                except Exception:
                    try:
                        client._delete(f"/api/resource/Leave Application/{cl_app.get('name', '')}")
                    except Exception:
                        pass
                    raise
                _enrich_apply_notification(client, body.employee, cl_app, description)
                _enrich_apply_notification(client, body.employee, lwp_app, description)
                return _finalize_apply(client, body, [cl_app, lwp_app], True)

        app = _create(body.leave_type, body.from_date, body.to_date, body.half_day)
        _enrich_apply_notification(client, body.employee, app, description)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    return _finalize_apply(client, body, [app], False)


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
def preview_leave(employee: str, leave_type: str, from_date: str, to_date: str, request: Request):
    """Return split preview without creating any documents."""
    employee = resolve_employee(request, employee, override_roles=HR)
    client = ERPNextClient()

    if leave_type != "Annual Leave":
        return LeavePreviewResponse(
            requested_days=0, total_weekdays=0, holidays_excluded=[],
            casual_balance=0, needs_split=False, casual_days=0, lwp_days=0,
            casual_to_date=None, lwp_from_date=None,
        )

    holiday_list    = _get_employee_holiday_list(client, employee)
    weekly_off      = _get_weekly_off(client, holiday_list) if holiday_list else 6
    holidays        = _get_holidays_in_range(client, holiday_list, from_date, to_date) if holiday_list else set()
    holiday_details = _get_holiday_details_in_range(client, holiday_list, from_date, to_date) if holiday_list else []

    balance = _available_for_leave_date(
        client, employee, "Annual Leave", date.fromisoformat(from_date)
    )
    balance_usable  = math.floor(balance * 2) / 2
    balance_days    = int(balance_usable)
    include_holiday = _leave_type_includes_holidays(client, "Annual Leave")

    if include_holiday:
        start_d = date.fromisoformat(from_date)
        end_d   = date.fromisoformat(to_date)
        requested      = (end_d - start_d).days + 1
        total_weekdays = requested
        casual_days    = min(balance_days, requested)
        lwp_days       = requested - casual_days
        casual_to_date = (start_d + timedelta(days=casual_days - 1)).isoformat() if casual_days > 0 else None
        lwp_from_date  = (date.fromisoformat(casual_to_date) + timedelta(days=1)).isoformat() if casual_to_date else from_date
    else:
        total_weekdays = _count_leave_days(from_date, to_date, set(), weekly_off)
        requested      = _count_leave_days(from_date, to_date, holidays, weekly_off)
        casual_days    = min(balance_days, requested)
        lwp_days       = requested - casual_days
        casual_to_date = _end_date_for_n_leave_days(from_date, casual_days, holidays, weekly_off) if casual_days > 0 else None
        lwp_from_date  = _next_leave_day(casual_to_date, holidays, weekly_off) if casual_to_date else from_date

    needs_split = lwp_days > 0

    if not needs_split:
        return LeavePreviewResponse(
            requested_days=requested, total_weekdays=total_weekdays,
            holidays_excluded=[HolidayInfo(**h) for h in holiday_details],
            casual_balance=balance,
            needs_split=False, casual_days=requested, lwp_days=0,
            casual_to_date=None, lwp_from_date=None,
        )

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


@router.get("/leave/balance")
def get_leave_balance(employee: str, request: Request, as_of: date | None = None):
    """Return per-leave-type allocations and consumption for an employee.

    "old" is the carry-over pool (a single short period, forfeited at its
    to_date); "new" is the accruing annual pool. Both are derived from the
    allocations themselves rather than from the calendar month, so the split
    stays correct in any year (MWP-56).
    """
    employee = resolve_employee(request, employee, override_roles=HR)
    client = ERPNextClient()
    today = as_of if as_of is not None else date.today()
    pools_by_type = _employee_pools(client, employee, today)

    result = {}
    old_period_active = False
    for lt, pools in pools_by_type.items():
        carry = [p for p in pools if not p.is_accruing]
        annual = [p for p in pools if p.is_accruing]
        if any(p.covers(today) for p in carry):
            old_period_active = True

        old_allocation = sum(p.allocated for p in carry)
        old_taken = sum(p.taken for p in carry)
        old_pending = sum(p.pending for p in carry)
        # A carry-over pool that no longer covers today has lapsed: what it
        # funded stays charged to it, but nothing is left to book.
        old_usable = sum(
            p.allocated if p.covers(today) else (p.taken + p.pending) for p in carry
        )

        result[lt] = {
            "leave_type": lt,
            "old_allocation": old_allocation,
            "new_allocation": sum(p.allocated for p in annual),
            "old_taken": old_taken,
            "old_pending": old_pending,
            "new_taken": sum(p.taken for p in annual),
            "new_pending": sum(p.pending for p in annual),
            "old_accrued": old_usable,
            "new_accrued": sum(p.usable for p in annual),
            "old_balance": sum(p.balance for p in carry if p.covers(today)),
            "new_balance": sum(p.balance for p in annual),
        }

    return {
        "data": list(result.values()),
        "old_period_active": old_period_active,
        # Deprecated alias — kept so a cached frontend keeps rendering.
        "before_august": old_period_active,
    }


def _format_period_label(from_date: date, to_date: date) -> str:
    """Human-readable period label from allocation dates, e.g. 'Aug 2025 - Jul 2026'."""
    months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
              "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    return f"{months[from_date.month - 1]} {from_date.year} - {months[to_date.month - 1]} {to_date.year}"


def _period_key(from_str: str, to_str: str) -> str:
    """Canonical key for a period: 'YYYY-MM-DD|YYYY-MM-DD'."""
    return f"{from_str[:10]}|{to_str[:10]}"


@router.get("/leave/employee-detail", dependencies=[Depends(require_roles(*HR))])
def get_leave_employee_detail(employee: str):
    """Return period-grouped leave balance for an employee's detail page.

    Each application is charged to exactly one pool by the shared helper, so
    periods that share a start date no longer compete for it (MWP-56).
    """
    client = ERPNextClient()
    today = date.today()
    pools_by_type = _employee_pools(client, employee, today)

    periods: dict[str, dict] = {}
    for pools in pools_by_type.values():
        for pool in pools:
            key = _period_key(pool.from_date.isoformat(), pool.to_date.isoformat())
            if key not in periods:
                periods[key] = {
                    "from_date": pool.from_date.isoformat(),
                    "to_date": pool.to_date.isoformat(),
                    "label": _format_period_label(pool.from_date, pool.to_date),
                    "is_current": pool.covers(today),
                    "allocations": [],
                }
            periods[key]["allocations"].append({
                "name": pool.name,
                "leave_type": pool.leave_type,
                "allocated": pool.allocated,
                "usable": pool.usable,
                "taken": round(pool.taken * 10) / 10,
                "pending": round(pool.pending * 10) / 10,
                "balance": round(pool.balance * 10) / 10,
            })

    total_allocated = 0.0
    total_taken = 0.0
    total_remaining = 0.0
    for period in periods.values():
        for entry in period["allocations"]:
            total_allocated += entry["allocated"]
            total_taken += entry["taken"]
            if period["is_current"]:
                total_remaining += entry["balance"]

    current = [p for p in periods.values() if p["is_current"]]
    previous = sorted(
        [p for p in periods.values() if not p["is_current"]],
        key=lambda p: p["from_date"],
        reverse=True,
    )

    return {
        "periods": current + previous,
        "summary": {
            "allocated": total_allocated,
            "taken": round(total_taken * 10) / 10,
            # Only live pools count — expired days are forfeited, not remaining.
            "remaining": round(total_remaining * 10) / 10,
        },
    }


@router.get("/leave/my-applications")
def list_my_leave_applications(employee: str, request: Request):
    """Return leave applications for an employee (all statuses except cancelled)."""
    employee = resolve_employee(request, employee, override_roles=HR)
    client = ERPNextClient()
    apps = client._get("/api/resource/Leave Application", params={
        "filters": f'[["employee","=","{employee}"],["docstatus","!=",2]]',
        "fields": '["name","leave_type","from_date","to_date","total_leave_days","status","description","docstatus"]',
        "order_by": "creation desc",
        "limit_page_length": 200,
    }).get("data", [])
    return {"data": apps}
