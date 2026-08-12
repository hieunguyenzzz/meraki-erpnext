"""
Report endpoints — server-side computed reports.

GET /reports/leave-report                — monthly breakdown, old/new period balances, accrual
GET /reports/wedding-expenses            — expenses for a specific wedding project
GET /reports/wedding-expenses/projects   — lightweight project list for dropdown
"""

import json
from datetime import date, timedelta
from fastapi import APIRouter, Query
from webhook_v2.services.erpnext import ERPNextClient
from webhook_v2.services.leave_balance import build_pools
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


def _count_working_days(start: date, end: date, holidays: set) -> int:
    """Count Mon–Fri non-holiday days in [start, end]."""
    count = 0
    d = start
    while d <= end:
        if d.weekday() < 5 and d.isoformat() not in holidays:
            count += 1
        d += timedelta(days=1)
    return count


def _leave_days_in_month(
    app_from: date, app_to: date, total_leave_days: float,
    year: int, month: int, holidays: set,
) -> float:
    """Working-day leave count for a specific month from a leave application."""
    import calendar
    month_start = date(year, month, 1)
    month_end = date(year, month, calendar.monthrange(year, month)[1])

    overlap_start = max(app_from, month_start)
    overlap_end = min(app_to, month_end)

    if overlap_start > overlap_end:
        return 0.0

    # Count actual working days in the full app range and in this month's overlap
    app_working = _count_working_days(app_from, app_to, holidays)
    if app_working <= 0:
        return 0.0
    month_working = _count_working_days(overlap_start, overlap_end, holidays)
    return round((month_working / app_working) * total_leave_days * 10) / 10


def _display_name(emp: dict) -> str:
    parts = [emp.get("first_name"), emp.get("last_name")]
    name = " ".join(p for p in parts if p)
    return name or emp.get("employee_name") or emp.get("name", "")


@router.get("/reports/leave-report")
def leave_report(status: str = "Active"):
    """
    Compute the full leave report server-side.

    status: "Active" | "Left" | "All"
    """
    client = ERPNextClient()
    current_year = date.today().year
    today = date.today()

    # ctc > 0 guards against placeholder accounts for Active only;
    # Left employees may have ctc zeroed on exit. Employees with no allocations
    # are skipped later regardless, so no extra CTC guard is needed for Left/All.
    if status == "Active":
        filters = [["ctc", ">", 0], ["status", "=", "Active"]]
    elif status == "Left":
        filters = [["status", "=", "Left"]]
    else:  # All
        filters = [["status", "in", ["Active", "Left"]]]

    employees = client._get("/api/resource/Employee", params={
        "filters": json.dumps(filters),
        "fields": json.dumps([
            "name", "employee_name", "first_name", "last_name",
            "date_of_joining", "relieving_date", "status", "ctc",
        ]),
        "order_by": "employee_name asc",
        "limit_page_length": 500,
    }).get("data", [])

    # Fetch all submitted Annual Leave allocations
    allocations = client._get("/api/resource/Leave Allocation", params={
        "filters": json.dumps([
            ["leave_type", "=", "Annual Leave"],
            ["docstatus", "=", 1],
        ]),
        "fields": json.dumps([
            "name", "employee", "leave_type", "from_date", "to_date",
            "new_leaves_allocated", "total_leaves_allocated",
        ]),
        "limit_page_length": 1000,
    }).get("data", [])

    # Fetch Annual Leave applications in range. Pending ones are included so this
    # report reserves them like every other surface does (MWP-56); the monthly
    # breakdown below still counts approved leave only.
    applications = client._get("/api/resource/Leave Application", params={
        "filters": json.dumps([
            ["leave_type", "=", "Annual Leave"],
            ["docstatus", "!=", 2],
            ["status", "!=", "Rejected"],
            ["from_date", ">=", f"{current_year - 1}-01-01"],
            ["to_date", "<=", f"{current_year + 1}-12-31"],
        ]),
        "fields": json.dumps([
            "name", "employee", "leave_type", "from_date", "to_date",
            "total_leave_days", "status", "docstatus",
        ]),
        "limit_page_length": 2000,
    }).get("data", [])

    # Fetch holiday list for working-day calculation
    company = client._get("/api/resource/Company/Meraki Wedding Planner").get("data", {})
    holiday_list_name = company.get("default_holiday_list", "")
    holidays: set[str] = set()
    if holiday_list_name:
        hl_data = client._get(f"/api/resource/Holiday List/{holiday_list_name}").get("data", {})
        for h in (hl_data.get("holidays") or []):
            d = (h.get("holiday_date") or "")[:10]
            if d:
                holidays.add(d)

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

        # Charge applications to pools via the shared helper so this report
        # agrees with the apply path and the self-service pages (MWP-56).
        doj_str = (emp.get("date_of_joining") or "")[:10]
        rel_str = (emp.get("relieving_date") or "")[:10]
        pools = build_pools(
            emp_allocs, emp_apps,
            today=today,
            date_of_joining=_parse_date(doj_str) if doj_str else None,
            relieving_date=_parse_date(rel_str) if rel_str else None,
        ).get("Annual Leave", [])

        if not pools:
            continue

        # "old" = the carry-over pool (short, expires first); "new" = the
        # accruing annual pool. Derived from the allocations, not the month.
        carry = [p for p in pools if not p.is_accruing]
        annual = [p for p in pools if p.is_accruing]

        old_allocation_days = sum(p.allocated for p in carry)
        capped_old_taken = sum(p.taken + p.pending for p in carry)
        old_balance = sum(p.balance for p in carry if p.covers(today))

        new_allocation_days = sum(p.allocated for p in annual)
        effective_new_taken = sum(p.taken + p.pending for p in annual)
        new_accrued = sum(p.usable for p in annual)
        new_usable = new_accrued
        new_balance = sum(p.balance for p in annual)

        # Monthly breakdown for current year — approved leave only
        approved_apps = [a for a in emp_apps if a.get("status") == "Approved"]
        monthly_leave = []
        for month_idx in range(12):
            total = 0.0
            for app in approved_apps:
                total += _leave_days_in_month(
                    _parse_date(app["from_date"]),
                    _parse_date(app["to_date"]),
                    float(app.get("total_leave_days", 0)),
                    current_year, month_idx + 1, holidays,
                )
            monthly_leave.append(round(total * 10) / 10)

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


# ---------------------------------------------------------------------------
# Wedding Expense Report
# ---------------------------------------------------------------------------

@router.get("/reports/wedding-expenses/projects")
def wedding_expense_projects():
    """Lightweight project list for the wedding expense report dropdown."""
    client = ERPNextClient()
    projects = client._get("/api/resource/Project", params={
        "filters": json.dumps([["status", "!=", "Cancelled"]]),
        "fields": json.dumps(["name", "project_name", "expected_end_date"]),
        "order_by": "expected_end_date desc",
        "limit_page_length": 0,
    }).get("data", [])
    return {"data": projects}


@router.get("/reports/wedding-expenses")
def wedding_expense_report(project: str = Query(...)):
    """Detailed expense report for a single wedding project."""
    client = ERPNextClient()

    # Fetch all PIs for this project (Draft + Submitted)
    pis = client._get("/api/resource/Purchase Invoice", params={
        "filters": json.dumps([
            ["project", "=", project],
            ["docstatus", "in", [0, 1]],
        ]),
        "fields": json.dumps([
            "name", "supplier", "supplier_name", "posting_date",
            "grand_total", "docstatus", "custom_rejected", "custom_expense_staff",
        ]),
        "order_by": "posting_date asc",
        "limit_page_length": 0,
    }).get("data", [])

    # Batch-fetch attached files for receipt thumbnails
    pi_names = [pi["name"] for pi in pis]
    file_map: dict[str, str] = {}
    if pi_names:
        try:
            files = client._get("/api/resource/File", params={
                "filters": json.dumps([
                    ["attached_to_doctype", "=", "Purchase Invoice"],
                    ["attached_to_name", "in", pi_names],
                    ["file_url", "is", "set"],
                ]),
                "fields": json.dumps(["attached_to_name", "file_url"]),
                "limit_page_length": 0,
            }).get("data", [])
            for f in files:
                doc_name = f.get("attached_to_name")
                if doc_name and doc_name not in file_map:
                    file_map[doc_name] = f["file_url"]
        except Exception:
            pass

    # Collect unique staff IDs for batch name lookup
    staff_ids = {pi["custom_expense_staff"] for pi in pis if pi.get("custom_expense_staff")}
    staff_names: dict[str, str] = {}
    if staff_ids:
        emps = client._get("/api/resource/Employee", params={
            "filters": json.dumps([["name", "in", list(staff_ids)]]),
            "fields": json.dumps(["name", "employee_name"]),
            "limit_page_length": 0,
        }).get("data", [])
        staff_names = {e["name"]: e["employee_name"] for e in emps}

    # Build result rows — must fetch each PI doc for items (child table 403)
    rows = []
    total = 0.0
    approved_total = 0.0
    pending_total = 0.0
    for pi in pis:
        docstatus = pi.get("docstatus", 0)
        rejected = pi.get("custom_rejected", 0)
        if docstatus == 0 and rejected:
            status = "Rejected"
        elif docstatus == 0:
            status = "Pending"
        else:
            status = "Approved"

        pi_doc = client._get(f"/api/resource/Purchase Invoice/{pi['name']}").get("data", {})
        items = pi_doc.get("items", [])
        first_item = items[0] if items else {}

        amount = float(pi.get("grand_total", 0))
        category = first_item.get("expense_account", "")
        description = first_item.get("item_name", "")
        staff_id = pi.get("custom_expense_staff", "")

        total += amount
        if status == "Approved":
            approved_total += amount
        elif status == "Pending":
            pending_total += amount

        rows.append({
            "name": pi["name"],
            "posting_date": pi["posting_date"],
            "description": description,
            "amount": amount,
            "category": category,
            "category_label": category.replace(" - MWP", "") if category else "",
            "status": status,
            "staff": staff_id,
            "staff_name": staff_names.get(staff_id, ""),
            "supplier_name": pi.get("supplier_name", ""),
            "receipt_url": file_map.get(pi["name"]),
        })

    return {
        "data": rows,
        "summary": {
            "total": total,
            "approved": approved_total,
            "pending": pending_total,
            "count": len(rows),
        },
    }
