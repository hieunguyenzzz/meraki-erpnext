"""
Personal Home endpoints (MWP-98).

One call per screen, so the browser never downloads whole lists just to count or filter them.
Everything is scoped to the session user; sections the caller's roles don't cover come back null.

GET  /home/planner             — next wedding (+ checklist), upcoming weddings, leave rows, open-lead and
                                 active-staff counts, latest payslip, the caller's open tasks
POST /home/tasks/{task}/done   — tick / untick one of the caller's own tasks
"""

import json
from datetime import date
from urllib.parse import quote

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel

from webhook_v2.auth import CRM, HR, PLANNER, get_current_user, has_roles, resolve_employee
from webhook_v2.core.logging import get_logger
from webhook_v2.routers.leaves import get_leave_balance
from webhook_v2.routers.my_weddings import (
    _get_in, assigned_wedding_items, bind_correlation_id, local_today,
)
from webhook_v2.routers.wedding_events import get_wedding_events
from webhook_v2.services.erpnext import ERPNextClient

log = get_logger(__name__)
router = APIRouter()

TASKS_SHOWN = 5
UPCOMING_SHOWN = 5
CLOSED_TASK_STATUSES = ["Completed", "Cancelled"]
TASK_FIELDS = ["name", "subject", "project", "exp_end_date", "_assign", "custom_shared_with", "owner"]
NON_LEAD_STATUSES = ["Converted", "Do Not Contact"]


def _count(client: ERPNextClient, doctype: str, filters: list) -> int:
    return client._get("/api/method/frappe.client.get_count", params={
        "doctype": doctype, "filters": json.dumps(filters),
    }).get("message", 0)


def _is_mine(task: dict, user: str, employee: str | None) -> bool:
    """Assigned to, shared with, or created by the caller (the SQL `like` is only a pre-filter)."""
    try:
        assigned = user in json.loads(task.get("_assign") or "[]")
    except ValueError:
        assigned = False
    shared = [s.strip() for s in (task.get("custom_shared_with") or "").split(",")]
    return assigned or task.get("owner") == user or (employee is not None and employee in shared)


def _my_task_candidates(client: ERPNextClient, user: str, employee: str | None, extra_filters: list) -> list[dict]:
    or_filters = [["owner", "=", user], ["_assign", "like", f'%"{user}"%']]
    if employee:
        or_filters.append(["custom_shared_with", "like", f"%{employee}%"])
    rows = client._get("/api/resource/Task", params={
        "filters": json.dumps(extra_filters),
        "or_filters": json.dumps(or_filters),
        "fields": json.dumps(TASK_FIELDS),
        "limit_page_length": 0,
    }).get("data", [])
    return [t for t in rows if _is_mine(t, user, employee)]


def _my_open_tasks(client: ERPNextClient, user: str, employee: str | None, today: date) -> dict:
    tasks = _my_task_candidates(client, user, employee, [["status", "not in", CLOSED_TASK_STATUSES]])
    # Soonest due first (overdue lead), undated last.
    tasks.sort(key=lambda t: (t.get("exp_end_date") is None, t.get("exp_end_date") or ""))
    shown = tasks[:TASKS_SHOWN]
    project_ids = {t["project"] for t in shown if t.get("project")}
    names = {p["name"]: p.get("project_name") or p["name"]
             for p in _get_in(client, "Project", project_ids, ["name", "project_name"])} if project_ids else {}
    return {
        "open_count": len(tasks),
        "items": [
            {
                "name": t["name"],
                "subject": t["subject"],
                "project": t.get("project"),
                "project_name": names.get(t.get("project")),
                "exp_end_date": t.get("exp_end_date"),
                "due_in_days": (date.fromisoformat(t["exp_end_date"]) - today).days if t.get("exp_end_date") else None,
                "done": False,
            }
            for t in shown
        ],
    }


def _checklist(client: ERPNextClient, project: str) -> dict | None:
    """Done vs total tasks on the wedding (cancelled ones don't count); null when it has none."""
    rows = client._get("/api/resource/Task", params={
        "filters": json.dumps([["project", "=", project], ["status", "!=", "Cancelled"]]),
        "fields": json.dumps(["status"]),
        "limit_page_length": 0,
    }).get("data", [])
    if not rows:
        return None
    return {"done": sum(1 for r in rows if r["status"] == "Completed"), "total": len(rows)}


def _guest_count(project: str) -> int | None:
    try:
        events = get_wedding_events(from_date=None, to_date=None, employee=None, project=project)["events"]
    except Exception as e:  # a missing guest count must not take the whole Home down
        log.warning("home_guest_count_failed", project=project, error=str(e))
        return None
    return max((ev.get("guest_count") or 0 for ev in events), default=0) or None


def _latest_payslip(client: ERPNextClient, employee: str) -> dict | None:
    rows = client._get("/api/resource/Salary Slip", params={
        "filters": json.dumps([["employee", "=", employee], ["docstatus", "=", 1]]),
        "fields": json.dumps(["name", "start_date", "net_pay"]),
        "order_by": "start_date desc",
        "limit_page_length": 1,
    }).get("data", [])
    return {"name": rows[0]["name"], "start_date": rows[0]["start_date"], "net_pay": rows[0]["net_pay"]} if rows else None


def _leave_rows(request: Request, employee: str) -> tuple[list[dict] | None, bool]:
    """(balance rows, failed). A failed lookup shows "Unavailable" on the tile; the rest of Home still loads."""
    try:
        return get_leave_balance(employee=employee, request=request)["data"], False
    except Exception as e:
        log.error("home_leave_balance_failed", employee=employee, error=str(e))
        return None, True


def _weddings_section(client: ERPNextClient, employee: str, today: date) -> tuple[dict | None, list[dict]]:
    items = assigned_wedding_items(client, employee, today)
    upcoming = [w for w in items if not w["finished"] and w["days_to_go"] is not None and w["days_to_go"] >= 0]
    if not upcoming:
        return None, []
    nxt = {**upcoming[0], "guest_count": _guest_count(upcoming[0]["id"]), "checklist": _checklist(client, upcoming[0]["id"])}
    return nxt, upcoming[1:1 + UPCOMING_SHOWN]


@router.get("/home/planner")
def planner_home(request: Request, response: Response):
    bind_correlation_id(request, response)
    user = get_current_user(request)
    client = ERPNextClient()
    today = local_today()
    try:
        employee = resolve_employee(request, None)
    except HTTPException as e:
        if e.status_code != 403:
            raise
        employee = None  # e.g. Administrator: no personal records, still sees counts and tasks

    has_weddings = employee is not None and has_roles(request, PLANNER)
    next_wedding, upcoming = _weddings_section(client, employee, today) if has_weddings else (None, [])
    leave, leave_failed = _leave_rows(request, employee) if has_weddings else (None, False)
    out = {
        "has_weddings": has_weddings,
        "next_wedding": next_wedding,
        "upcoming": upcoming,
        "leave": leave,
        "leave_failed": leave_failed,
        "open_leads": _count(client, "Lead", [["status", "not in", NON_LEAD_STATUSES]]) if has_roles(request, CRM) else None,
        "active_staff": _count(client, "Employee", [["status", "=", "Active"]]) if has_roles(request, HR) else None,
        "latest_payslip": _latest_payslip(client, employee) if employee else None,
        "tasks": _my_open_tasks(client, user, employee, today),
    }
    log.info("home_planner_served", user=user, employee=employee, open_tasks=out["tasks"]["open_count"])
    return out


class TaskDoneRequest(BaseModel):
    done: bool


@router.post("/home/tasks/{task}/done")
def set_task_done(task: str, body: TaskDoneRequest, request: Request, response: Response):
    bind_correlation_id(request, response)
    user = get_current_user(request)
    try:
        employee = resolve_employee(request, None)
    except HTTPException as e:
        if e.status_code != 403:
            raise
        employee = None
    client = ERPNextClient()
    # 403 for a missing task and for someone else's alike, so the response never reveals which tasks exist.
    mine = _my_task_candidates(client, user, employee, [["name", "=", task]])
    if not mine:
        log.warning("home_task_forbidden", user=user, task=task)
        raise HTTPException(status_code=403, detail="This task is not yours")
    status = "Completed" if body.done else "Open"
    try:
        client._put(f"/api/resource/Task/{quote(task, safe='')}", {"status": status})
    except Exception as e:
        log.error("home_task_update_failed", user=user, task=task, status=status, error=str(e))
        raise HTTPException(status_code=400, detail=f"Could not update the task: {e}")
    log.info("home_task_updated", user=user, task=task, status=status)
    return {"name": task, "status": status}
