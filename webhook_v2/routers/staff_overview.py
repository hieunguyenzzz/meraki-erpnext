"""
Staff overview endpoint — pre-joined employee + leave + review data.

GET /staff/overview  — enriched employee list with leave balances and review status
"""

import json
from datetime import date
from fastapi import APIRouter, Depends
from webhook_v2.services.erpnext import ERPNextClient
from webhook_v2.services.leave_balance import build_pools
from webhook_v2.core.logging import get_logger
from webhook_v2.auth import require_roles, HR

log = get_logger(__name__)
router = APIRouter(dependencies=[Depends(require_roles(*HR))])


def _display_name(emp: dict) -> str:
    parts = [emp.get("last_name"), emp.get("first_name")]
    name = " ".join(p for p in parts if p)
    return name or emp.get("employee_name") or emp.get("name", "")


def _months_difference(from_date: date, to_date: date) -> int:
    months = (to_date.year - from_date.year) * 12 + (to_date.month - from_date.month)
    if to_date.day < from_date.day:
        months -= 1
    return months


def _review_status(last_review_date: str | None) -> str:
    if not last_review_date:
        return "never-reviewed"
    last_review = date.fromisoformat(last_review_date[:10])
    months_ago = _months_difference(last_review, date.today())
    if months_ago > 6:
        return "overdue"
    if months_ago >= 5:
        return "due-soon"
    return "up-to-date"


def _review_status_text(last_review_date: str | None) -> str:
    if not last_review_date:
        return "Never reviewed"
    last_review = date.fromisoformat(last_review_date[:10])
    months_ago = _months_difference(last_review, date.today())
    status = _review_status(last_review_date)

    if months_ago == 0:
        time_ago = "This month"
    elif months_ago == 1:
        time_ago = "1 month ago"
    else:
        time_ago = f"{months_ago} months ago"

    if status == "overdue":
        return f"{time_ago} - OVERDUE"
    if status == "due-soon":
        return f"{time_ago} - Review soon"
    return time_ago


@router.get("/staff/overview")
def staff_overview():
    """
    Return enriched employee list with leave balance and review status.

    Joins:
    - Employees (active)
    - Leave Allocations (submitted)
    - Leave Applications (approved + pending)

    Returns each employee with:
    - Basic info (name, designation, department, etc.)
    - Annual Leave balance for the live pools (allocated, taken, remaining)
    - Review status (computed from custom_last_review_date)
    """
    client = ERPNextClient()
    today = date.today()

    # Fetch active employees
    employees = client._get("/api/resource/Employee", params={
        "filters": json.dumps([["status", "=", "Active"]]),
        "fields": json.dumps([
            "name", "employee_name", "first_name", "last_name",
            "designation", "department", "date_of_joining",
            "custom_last_review_date", "custom_review_notes",
            "custom_display_order", "user_id", "custom_meraki_id", "custom_is_probation",
        ]),
        "order_by": "employee_name asc",
        "limit_page_length": 500,
    }).get("data", [])

    # Fetch submitted leave allocations
    allocations = client._get("/api/resource/Leave Allocation", params={
        "filters": json.dumps([["docstatus", "=", 1], ["leave_type", "=", "Annual Leave"]]),
        "fields": json.dumps([
            "name", "employee", "leave_type", "from_date", "to_date",
            "total_leaves_allocated", "new_leaves_allocated",
        ]),
        "limit_page_length": 2000,
    }).get("data", [])

    # Include pending requests so reserved days aren't shown as available
    applications = client._get("/api/resource/Leave Application", params={
        "filters": json.dumps([
            ["docstatus", "!=", 2],
            ["status", "!=", "Rejected"],
            ["leave_type", "=", "Annual Leave"],
        ]),
        "fields": json.dumps([
            "name", "employee", "leave_type", "from_date",
            "total_leave_days", "status", "docstatus",
        ]),
        "limit_page_length": 2000,
    }).get("data", [])

    allocs_by_emp: dict[str, list] = {}
    for alloc in allocations:
        allocs_by_emp.setdefault(alloc["employee"], []).append(alloc)

    apps_by_emp: dict[str, list] = {}
    for app in applications:
        apps_by_emp.setdefault(app["employee"], []).append(app)

    # Build result
    rows = []
    for emp in employees:
        emp_id = emp["name"]
        # Annual Leave only, and only pools that are still live — an expired
        # carry-over pool's unused days are forfeited, not "remaining" (MWP-56).
        doj = emp.get("date_of_joining")
        rel = emp.get("relieving_date")
        pools = build_pools(
            allocs_by_emp.get(emp_id, []), apps_by_emp.get(emp_id, []),
            today=today,
            date_of_joining=date.fromisoformat(doj[:10]) if doj else None,
            relieving_date=date.fromisoformat(rel[:10]) if rel else None,
        ).get("Annual Leave", [])
        live = [p for p in pools if p.covers(today)]
        allocated = sum(p.usable for p in live)
        taken = sum(p.taken + p.pending for p in live)
        remaining = sum(p.balance for p in live)

        review_date = emp.get("custom_last_review_date")
        status = _review_status(review_date)

        rows.append({
            "name": emp_id,
            "employee_name": emp.get("employee_name", ""),
            "display_name": _display_name(emp),
            "first_name": emp.get("first_name"),
            "last_name": emp.get("last_name"),
            "designation": emp.get("designation") or "-",
            "department": emp.get("department") or "-",
            "date_of_joining": emp.get("date_of_joining"),
            "custom_last_review_date": review_date,
            "custom_review_notes": emp.get("custom_review_notes"),
            "custom_display_order": emp.get("custom_display_order"),
            "user_id": emp.get("user_id"),
            "custom_meraki_id": emp.get("custom_meraki_id"),
            "review_status": status,
            "review_status_text": _review_status_text(review_date),
            "is_probation": bool(emp.get("custom_is_probation")),
            "leave_allocated": allocated,
            "leave_taken": taken,
            "leave_remaining": remaining,
        })

    # Summary counts
    overdue = sum(1 for r in rows if r["review_status"] in ("overdue", "never-reviewed"))
    due_soon = sum(1 for r in rows if r["review_status"] == "due-soon")
    up_to_date = sum(1 for r in rows if r["review_status"] == "up-to-date")

    return {
        "data": rows,
        "summary": {
            "total": len(rows),
            "overdue": overdue,
            "due_soon": due_soon,
            "up_to_date": up_to_date,
        },
    }
