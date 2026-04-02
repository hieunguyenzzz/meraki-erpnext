"""
Leave report endpoint — computes the full leave calendar server-side.

GET /reports/leave-report  — monthly breakdown, old/new period balances, accrual
"""

import json
import math
from datetime import date, timedelta
from fastapi import APIRouter
from webhook_v2.services.erpnext import ERPNextClient
from webhook_v2.core.logging import get_logger

log = get_logger(__name__)
router = APIRouter()

MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def _parse_date(s: str) -> date:
    return date.fromisoformat(s[:10])


def _seniority_years(date_of_joining: str) -> int:
    doj = _parse_date(date_of_joining)
    today = date.today()
    years = today.year - doj.year
    if (today.month, today.day) < (doj.month, doj.day):
        years -= 1
    return max(0, years)


def _compute_accrued(allocation: float, accrual_start: date, today: date) -> float:
    """Accrued days: ceil(allocation * elapsed_months / 12), capped at allocation."""
    if allocation <= 0:
        return 0.0
    elapsed = (today.year - accrual_start.year) * 12 + (today.month - accrual_start.month)
    if elapsed <= 0:
        return 0.0
    return min(allocation, math.ceil(allocation * elapsed / 12))


def _leave_days_in_month(
    app_from: date, app_to: date, total_leave_days: float,
    year: int, month: int,
) -> float:
    """Proportional leave days for a specific month from a leave application."""
    import calendar
    month_start = date(year, month, 1)
    month_end = date(year, month, calendar.monthrange(year, month)[1])

    overlap_start = max(app_from, month_start)
    overlap_end = min(app_to, month_end)

    if overlap_start > overlap_end:
        return 0.0

    app_total_days = (app_to - app_from).days + 1
    overlap_days = (overlap_end - overlap_start).days + 1

    if app_total_days <= 0:
        return 0.0
    return round((overlap_days / app_total_days) * total_leave_days * 10) / 10


def _display_name(emp: dict) -> str:
    parts = [emp.get("first_name"), emp.get("last_name")]
    name = " ".join(p for p in parts if p)
    return name or emp.get("employee_name") or emp.get("name", "")


@router.get("/reports/leave-report")
def leave_report():
    """
    Compute the full leave report server-side.

    Returns employee rows with:
    - Monthly leave breakdown for current year
    - Old period (2025) allocation/taken/balance
    - New period (2026) allocation/taken/balance/accrued/usable
    - Total balance
    """
    client = ERPNextClient()
    current_year = date.today().year
    today = date.today()

    # Fetch active employees
    employees = client._get("/api/resource/Employee", params={
        "filters": json.dumps([["status", "=", "Active"]]),
        "fields": json.dumps([
            "name", "employee_name", "first_name", "last_name",
            "date_of_joining", "status",
        ]),
        "order_by": "employee_name asc",
        "limit_page_length": 500,
    }).get("data", [])

    # Fetch all submitted Casual Leave allocations
    allocations = client._get("/api/resource/Leave Allocation", params={
        "filters": json.dumps([
            ["leave_type", "=", "Casual Leave"],
            ["docstatus", "=", 1],
        ]),
        "fields": json.dumps([
            "name", "employee", "from_date", "to_date", "new_leaves_allocated",
            "total_leaves_allocated",
        ]),
        "limit_page_length": 1000,
    }).get("data", [])

    # Fetch approved Casual Leave applications in range
    applications = client._get("/api/resource/Leave Application", params={
        "filters": json.dumps([
            ["leave_type", "=", "Casual Leave"],
            ["status", "=", "Approved"],
            ["from_date", ">=", f"{current_year - 1}-01-01"],
            ["to_date", "<=", f"{current_year + 1}-12-31"],
        ]),
        "fields": json.dumps([
            "name", "employee", "from_date", "to_date", "total_leave_days", "status",
        ]),
        "limit_page_length": 2000,
    }).get("data", [])

    # Index allocations and applications by employee
    alloc_by_emp: dict[str, list] = {}
    for a in allocations:
        alloc_by_emp.setdefault(a["employee"], []).append(a)

    apps_by_emp: dict[str, list] = {}
    for a in applications:
        apps_by_emp.setdefault(a["employee"], []).append(a)

    rows = []
    for emp in employees:
        emp_id = emp["name"]
        emp_allocs = alloc_by_emp.get(emp_id, [])
        emp_apps = apps_by_emp.get(emp_id, [])

        # Classify allocations: "old" = same-year (carry-over), "new" = cross-year (annual)
        old_allocation_days = 0.0
        new_allocation_days = 0.0
        new_alloc_from: date | None = None  # earliest from_date of new-period allocation
        old_alloc_to: date | None = None    # to_date of old-period allocation (= cutoff)
        for a in emp_allocs:
            fd_str = (a.get("from_date") or "")[:10]
            td_str = (a.get("to_date") or "")[:10]
            if not fd_str or not td_str:
                continue
            days = float(a.get("new_leaves_allocated", 0))
            if _parse_date(fd_str).year == _parse_date(td_str).year:
                # Old (carry-over): e.g. Jan 1 2026 → Jul 31 2026
                old_allocation_days += days
                old_alloc_to = _parse_date(td_str)
            else:
                # New (annual): e.g. Aug 1 2026 → Jul 31 2027
                new_allocation_days += days
                fd = _parse_date(fd_str)
                if new_alloc_from is None or fd < new_alloc_from:
                    new_alloc_from = fd

        # Skip employees with no allocations at all
        if old_allocation_days == 0 and new_allocation_days == 0:
            continue

        # Cutoff between old/new: day after old period ends, or new period start
        old_cutoff = (old_alloc_to + timedelta(days=1)) if old_alloc_to else new_alloc_from
        if old_cutoff is None:
            old_cutoff = date(current_year, 8, 1)  # fallback

        # Taken for old period (apps with from_date before cutoff)
        old_apps = [a for a in emp_apps if _parse_date(a["from_date"]) < old_cutoff]
        old_taken_raw = sum(float(a.get("total_leave_days", 0)) for a in old_apps)

        # Taken for new period (apps with from_date >= cutoff)
        new_apps = [a for a in emp_apps if _parse_date(a["from_date"]) >= old_cutoff]
        new_taken_raw = sum(float(a.get("total_leave_days", 0)) for a in new_apps)

        # Cap old taken at allocation; overflow spills into new period
        capped_old_taken = min(old_taken_raw, old_allocation_days)
        overflow = old_taken_raw - capped_old_taken
        effective_new_taken = new_taken_raw + overflow

        # Monthly breakdown for current year
        monthly_leave = []
        for month_idx in range(12):
            total = 0.0
            for app in emp_apps:
                total += _leave_days_in_month(
                    _parse_date(app["from_date"]),
                    _parse_date(app["to_date"]),
                    float(app.get("total_leave_days", 0)),
                    current_year, month_idx + 1,
                )
            monthly_leave.append(round(total * 10) / 10)

        # Accrual for new period: from Jan 1 of the year the new allocation starts
        accrual_year = new_alloc_from.year if new_alloc_from else current_year
        accrual_start = date(accrual_year, 1, 1)
        new_accrued = _compute_accrued(new_allocation_days, accrual_start, today)
        new_usable = max(0, new_accrued - effective_new_taken)

        old_balance = old_allocation_days - capped_old_taken
        new_balance = new_allocation_days - effective_new_taken

        rows.append({
            "employee": emp_id,
            "employee_name": _display_name(emp),
            "date_of_joining": emp.get("date_of_joining"),
            "seniority_years": _seniority_years(emp["date_of_joining"]) if emp.get("date_of_joining") else 0,
            "monthly_leave": monthly_leave,
            "old_allocation_days": old_allocation_days,
            "old_taken": capped_old_taken,
            "old_balance": old_balance,
            "new_allocation_days": new_allocation_days,
            "new_taken": effective_new_taken,
            "new_balance": new_balance,
            "new_accrued": new_accrued,
            "new_usable": new_usable,
            "total_balance": old_balance + new_balance,
        })

    return {
        "data": rows,
        "current_year": current_year,
        "months": MONTHS,
        "employee_count": len(rows),
    }
