"""
Leave application and WFH (Attendance Request) approve/reject endpoints.

POST /leave/{leave_id}/approve    — set status=Approved + submit
POST /leave/{leave_id}/reject     — set status=Rejected + submit
POST /wfh/{req_id}/approve        — submit Attendance Request
POST /wfh/{req_id}/reject         — set workflow_state=Rejected + submit
"""

import math
from datetime import date, timedelta
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from webhook_v2.services.erpnext import ERPNextClient
from webhook_v2.core.logging import get_logger

log = get_logger(__name__)
router = APIRouter()


def _compute_accrued(allocation_days: float, period_from: date, today: date) -> float:
    """Months fully completed since period start → ceil(allocation × elapsed / 12)."""
    elapsed = (today.year - period_from.year) * 12 + (today.month - period_from.month)
    if elapsed <= 0:
        return 0.0
    return min(allocation_days, math.ceil(allocation_days * elapsed / 12))


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
    half_day: bool = False
    half_day_period: str = ""  # "AM" or "PM"


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
        # Only include actual public holidays, not weekly-off days added to the list
        day_obj = date.fromisoformat(d)
        if day_obj.weekday() < 5:  # exclude Sat/Sun — only show actual public holidays
            result.append({"date": d, "description": h.get("description", "Holiday")})
    return sorted(result, key=lambda x: x["date"])


def _is_working_day(d: date, holidays: set, weekly_off: int = 6) -> bool:
    # Always exclude Sat (5) and Sun (6) — plus any holiday list entries
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


@router.post("/leave/apply")
def apply_leave(body: LeaveApplyRequest):
    """Create leave application(s). For Annual Leave with insufficient balance,
    automatically splits into Annual Leave + Leave Without Pay."""
    client = ERPNextClient()

    # Prepend half-day AM/PM to description so it shows in notifications
    description = body.description
    if body.half_day and body.half_day_period:
        prefix = f"Half Day ({body.half_day_period})"
        description = f"{prefix} — {description}" if description else prefix

    try:
        details = client._get(
            "/api/method/hrms.hr.doctype.leave_application.leave_application.get_leave_details",
            params={"employee": body.employee, "leave_type": body.leave_type, "date": body.from_date}
        )
        leave_approver = (details.get("message") or {}).get("leave_approver")

        # Auto-split Annual Leave when balance is insufficient
        if body.leave_type == "Annual Leave":
            balance_resp = get_leave_balance(employee=body.employee, as_of=date.fromisoformat(body.from_date))
            leave_row = next(
                (r for r in balance_resp["data"] if r["leave_type"] == "Annual Leave"), None
            )
            if leave_row:
                old_avail = max(
                    leave_row["old_accrued"] - leave_row["old_taken"] - leave_row["old_pending"], 0
                )
                new_avail = max(
                    leave_row["new_accrued"] - leave_row["new_taken"] - leave_row["new_pending"], 0
                )
                balance = old_avail + new_avail  # combined: carry-over + accrued annual
            else:
                balance = 0.0
            # Round down to nearest 0.5 so half-day balances aren't truncated to 0
            balance_usable = math.floor(balance * 2) / 2
            balance_days   = int(balance_usable)   # whole days available for CL split

            # Zero/fractional-only balance: if no whole days available, send all to LWP
            # (0.5 balance cannot cover even a single whole working day in a split)
            if balance_days == 0:
                app = _create_leave_application(
                    client, body.employee, "Leave Without Pay",
                    body.from_date, body.to_date, description,
                    leave_approver=leave_approver, half_day=body.half_day)
                return {"created": [app], "split": True}

            include_holiday = _leave_type_includes_holidays(client, "Annual Leave")
            casual_to_date = lwp_from_date = requested = None

            if include_holiday:
                # ERPNext counts ALL calendar days — simple arithmetic
                start_d = date.fromisoformat(body.from_date)
                end_d   = date.fromisoformat(body.to_date)
                requested = (end_d - start_d).days + 1
                if balance_days < requested:
                    casual_to_date = (start_d + timedelta(days=balance_days - 1)).isoformat()
                    lwp_from_date  = (date.fromisoformat(casual_to_date) + timedelta(days=1)).isoformat()
            else:
                holiday_list = _get_employee_holiday_list(client, body.employee)
                weekly_off = _get_weekly_off(client, holiday_list) if holiday_list else 6
                holidays = _get_holidays_in_range(client, holiday_list, body.from_date, body.to_date) if holiday_list else set()
                requested = _count_leave_days(body.from_date, body.to_date, holidays, weekly_off)
                if balance_days < requested:
                    casual_to_date = _end_date_for_n_leave_days(body.from_date, balance_days, holidays, weekly_off)
                    lwp_from_date  = _next_leave_day(casual_to_date, holidays, weekly_off)

            if balance_days < requested:
                # Split: CL for available whole days, rest LWP
                # Only pass half_day to single-day segments — multi-day with half_day=1
                # would tell ERPNext the entire segment is 0.5 days, which is wrong
                is_single_day = body.from_date == body.to_date
                cl_app = _create_leave_application(
                    client, body.employee, "Annual Leave",
                    body.from_date, casual_to_date, description,
                    leave_approver=leave_approver,
                    half_day=body.half_day if is_single_day else False)
                try:
                    lwp_app = _create_leave_application(
                        client, body.employee, "Leave Without Pay",
                        lwp_from_date, body.to_date, description,
                        leave_approver=leave_approver,
                        half_day=body.half_day if is_single_day else False)
                except Exception:
                    # Rollback: delete the CL application if LWP creation fails
                    try:
                        client._delete(f"/api/resource/Leave Application/{cl_app.get('name', '')}")
                    except Exception:
                        pass
                    raise
                return {"created": [cl_app, lwp_app], "split": True}

        app = _create_leave_application(
            client, body.employee, body.leave_type,
            body.from_date, body.to_date, description,
            leave_approver=leave_approver, half_day=body.half_day)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"created": [app], "split": False}


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

    # Use accrual-aware balance
    balance_resp = get_leave_balance(employee=employee, as_of=date.fromisoformat(from_date))
    leave_row = next(
        (r for r in balance_resp["data"] if r["leave_type"] == "Annual Leave"), None
    )
    if leave_row:
        old_avail = max(
            leave_row["old_accrued"] - leave_row["old_taken"] - leave_row["old_pending"], 0
        )
        new_avail = max(
            leave_row["new_accrued"] - leave_row["new_taken"] - leave_row["new_pending"], 0
        )
        balance = old_avail + new_avail  # combined: carry-over + accrued annual
    else:
        balance = 0.0
    balance_usable  = math.floor(balance * 2) / 2   # nearest 0.5 for half-day precision
    balance_days    = int(balance_usable)            # whole days available for CL
    include_holiday = _leave_type_includes_holidays(client, "Annual Leave")

    if include_holiday:
        # ERPNext counts all calendar days
        start_d = date.fromisoformat(from_date)
        end_d   = date.fromisoformat(to_date)
        requested      = (end_d - start_d).days + 1
        total_weekdays = requested  # all calendar days
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
def get_leave_balance(employee: str, as_of: date | None = None):
    """Return leave allocations and taken days for an employee, computed server-side.

    This avoids field-level permission issues when the frontend queries as Employee Self Service.
    """
    client = ERPNextClient()
    today = as_of if as_of is not None else date.today()

    # Fetch all submitted allocations for this employee
    allocs = client._get("/api/resource/Leave Allocation", params={
        "filters": f'[["employee","=","{employee}"],["docstatus","=",1]]',
        "fields": '["name","leave_type","from_date","to_date","new_leaves_allocated"]',
        "limit_page_length": 100,
    }).get("data", [])

    # Fetch all non-cancelled leave applications
    apps = client._get("/api/resource/Leave Application", params={
        "filters": f'[["employee","=","{employee}"],["docstatus","!=",2]]',
        "fields": '["name","leave_type","from_date","total_leave_days","status","docstatus"]',
        "limit_page_length": 500,
    }).get("data", [])

    # Group allocations by leave type and period; also track earliest from_date per period
    result = {}
    period_starts: dict[str, dict[str, date]] = {}
    for alloc in allocs:
        lt = alloc.get("leave_type", "")
        fd_str = (alloc.get("from_date") or "")[:10]
        alloc_days = float(alloc.get("new_leaves_allocated", 0))
        # Old = expires same year it starts (e.g. Jan–Jul); New = spans into next year
        td_str = (alloc.get("to_date") or "")[:10]
        is_old = (
            bool(fd_str) and bool(td_str)
            and date.fromisoformat(fd_str).year == date.fromisoformat(td_str).year
        )

        if lt not in result:
            result[lt] = {
                "leave_type": lt,
                "old_allocation": 0, "new_allocation": 0,
                "old_taken": 0, "old_pending": 0,
                "new_taken": 0, "new_pending": 0,
            }
        if is_old:
            result[lt]["old_allocation"] += alloc_days
        else:
            result[lt]["new_allocation"] += alloc_days

        # Track earliest from_date per period for accrual calculation
        if fd_str:
            fd = date.fromisoformat(fd_str)
            period_key = "old" if is_old else "new"
            ps = period_starts.setdefault(lt, {})
            if period_key not in ps or fd < ps[period_key]:
                ps[period_key] = fd

    # Count taken/pending per period
    for app in apps:
        lt = app.get("leave_type", "")
        status = app.get("status", "")
        if status == "Rejected":
            continue
        if lt not in result:
            continue

        fd = app.get("from_date", "")[:10] if app.get("from_date") else ""
        days = float(app.get("total_leave_days", 0))
        # Leave taken before Aug = charged to carry-over; Aug+ = charged to new annual
        is_old = bool(fd) and date.fromisoformat(fd).month < 8
        is_taken = status == "Approved" or app.get("docstatus") == 1

        if is_old:
            if is_taken:
                result[lt]["old_taken"] += days
            else:
                result[lt]["old_pending"] += days
        else:
            if is_taken:
                result[lt]["new_taken"] += days
            else:
                result[lt]["new_pending"] += days

    # Overflow: if old_taken exceeds old_allocation (employee used new-period days in H1),
    # re-attribute the excess to new_taken for accurate balance display.
    for lt, data in result.items():
        overflow = max(0.0, data["old_taken"] - data["old_allocation"])
        if overflow > 0:
            data["old_taken"]  = data["old_allocation"]
            data["new_taken"] += overflow

    # Compute accrued amounts
    for lt, data in result.items():
        ps = period_starts.get(lt, {})
        new_alloc_start = ps.get("new")  # e.g. date(2026, 8, 1)

        # Old (carry-over H1): fully available while we're still in H1 (month < 8), forfeited in H2
        old_expired = today.month >= 8
        data["old_accrued"] = data["old_taken"] if old_expired else data["old_allocation"]

        # New (annual H2): accrues from Jan 1 of the year the allocation starts in
        # e.g. Aug 2026 allocation → accrual from Jan 1 2026; Aug 2027 → from Jan 1 2027
        accrual_year = new_alloc_start.year if new_alloc_start else today.year
        data["new_accrued"] = _compute_accrued(
            data["new_allocation"], date(accrual_year, 1, 1), today
        )

    return {"data": list(result.values()), "before_august": today.month < 8}


def _format_period_label(from_date: date, to_date: date) -> str:
    """Human-readable period label from allocation dates, e.g. 'Aug 2025 - Jul 2026'."""
    months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
              "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    return f"{months[from_date.month - 1]} {from_date.year} - {months[to_date.month - 1]} {to_date.year}"


def _period_key(from_str: str, to_str: str) -> str:
    """Canonical key for a period: 'YYYY-MM-DD|YYYY-MM-DD'."""
    return f"{from_str[:10]}|{to_str[:10]}"


@router.get("/leave/employee-detail")
def get_leave_employee_detail(employee: str):
    """Return period-grouped leave balance for an employee's detail page.

    Groups allocations by their [from_date, to_date] range (no hardcoded dates).
    The 'current' period is the one containing today; others are 'previous'.

    Returns:
      - periods: list of {label, from_date, to_date, is_current, allocations: [{name, leave_type, allocated, taken, balance}]}
      - summary: {allocated, taken, remaining}
    """
    client = ERPNextClient()
    today = date.today()

    # Fetch submitted allocations for this employee
    allocs = client._get("/api/resource/Leave Allocation", params={
        "filters": f'[["employee","=","{employee}"],["docstatus","=",1]]',
        "fields": '["name","leave_type","from_date","to_date","new_leaves_allocated"]',
        "limit_page_length": 200,
    }).get("data", [])

    # Fetch approved leave applications (submitted, not cancelled)
    apps = client._get("/api/resource/Leave Application", params={
        "filters": f'[["employee","=","{employee}"],["status","=","Approved"],["docstatus","=",1]]',
        "fields": '["name","leave_type","from_date","to_date","total_leave_days"]',
        "limit_page_length": 500,
    }).get("data", [])

    # Group allocations by period (from_date, to_date)
    # Each unique (from_date, to_date) pair defines a period
    periods: dict[str, dict] = {}
    for alloc in allocs:
        fd_str = (alloc.get("from_date") or "")[:10]
        td_str = (alloc.get("to_date") or "")[:10]
        if not fd_str or not td_str:
            continue
        key = _period_key(fd_str, td_str)
        fd = date.fromisoformat(fd_str)
        td = date.fromisoformat(td_str)
        if key not in periods:
            periods[key] = {
                "from_date": fd_str,
                "to_date": td_str,
                "label": _format_period_label(fd, td),
                "is_current": fd <= today <= td,
                "allocations": [],
            }
        periods[key]["allocations"].append({
            "name": alloc["name"],
            "leave_type": alloc.get("leave_type", ""),
            "allocated": float(alloc.get("new_leaves_allocated", 0)),
            "taken": 0.0,
            "balance": 0.0,
        })

    # For each leave application, find which period it belongs to
    # by matching the application's from_date against allocation periods
    for app in apps:
        app_fd_str = (app.get("from_date") or "")[:10]
        app_td_str = (app.get("to_date") or "")[:10]
        if not app_fd_str:
            continue
        app_fd = date.fromisoformat(app_fd_str)
        app_days = float(app.get("total_leave_days", 0))
        app_lt = app.get("leave_type", "")

        # Find the period whose date range contains this application's from_date
        matched = False
        for key, period in periods.items():
            p_fd = date.fromisoformat(period["from_date"])
            p_td = date.fromisoformat(period["to_date"])
            if p_fd <= app_fd <= p_td:
                # Add taken days to the matching leave_type allocation in this period
                for alloc_entry in period["allocations"]:
                    if alloc_entry["leave_type"] == app_lt:
                        alloc_entry["taken"] += app_days
                        matched = True
                        break
                if matched:
                    break

    # Compute balance for each allocation and build sorted period list
    total_allocated = 0.0
    total_taken = 0.0

    for period in periods.values():
        for alloc_entry in period["allocations"]:
            alloc_entry["taken"] = round(alloc_entry["taken"] * 10) / 10
            alloc_entry["balance"] = round((alloc_entry["allocated"] - alloc_entry["taken"]) * 10) / 10
            total_allocated += alloc_entry["allocated"]
            total_taken += alloc_entry["taken"]

    # Sort: current periods first, then older periods in reverse chronological order
    current = [p for p in periods.values() if p["is_current"]]
    previous = sorted(
        [p for p in periods.values() if not p["is_current"]],
        key=lambda p: p["from_date"],
        reverse=True,
    )
    sorted_periods = current + previous

    return {
        "periods": sorted_periods,
        "summary": {
            "allocated": total_allocated,
            "taken": round(total_taken * 10) / 10,
            "remaining": round((total_allocated - total_taken) * 10) / 10,
        },
    }
