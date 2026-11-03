"""
Weddings the caller may log an expense against (MWP-100).

GET /expense/weddings — one list for the Add Expense picker, scoped by role:
  * Finance / Wedding Expense Manager: every Open wedding;
  * planner roles: Open weddings they are assigned to;
  * employee-only staff: the same set as /my/weddings (Open + recently Completed).
`assigned` says whether the caller's own Employee is on the wedding, which the UI
uses to pick a default. Venue names are resolved here so the picker can search them.
"""

import json
from datetime import date

from fastapi import APIRouter, HTTPException, Request, Response

from webhook_v2.auth import FINANCE, PLANNER, WEDDING_EXPENSE, get_current_user, has_roles, resolve_employee
from webhook_v2.core.logging import get_logger
from webhook_v2.routers.my_weddings import (
    _LIST_FIELDS, _venue_names, bind_correlation_id, list_assigned_projects, role_on_project,
)
from webhook_v2.services.erpnext import ERPNextClient

log = get_logger(__name__)
router = APIRouter()


def _my_employee(request: Request) -> str | None:
    """The caller's own Employee id, or None for sessions without one (e.g. Administrator)."""
    try:
        return resolve_employee(request, None)
    except HTTPException as e:
        if e.status_code != 403:
            raise
        return None


def _open_projects(client: ERPNextClient) -> list[dict]:
    return client._get("/api/resource/Project", params={
        "filters": json.dumps([["status", "=", "Open"]]),
        "fields": json.dumps(_LIST_FIELDS),
        "limit_page_length": 0,
    }).get("data", [])


def _candidate_projects(request: Request, client: ERPNextClient, employee: str | None) -> tuple[list[dict], str]:
    """(projects the caller may log against, scope name for the log)."""
    if has_roles(request, FINANCE + WEDDING_EXPENSE):
        return _open_projects(client), "all"
    if has_roles(request, PLANNER):
        return [p for p in _open_projects(client) if employee and role_on_project(p, employee)], "planner"
    return (list_assigned_projects(client, employee, date.today()) if employee else []), "employee"


@router.get("/expense/weddings")
def expense_weddings(request: Request, response: Response):
    bind_correlation_id(request, response)
    user = get_current_user(request)
    employee = _my_employee(request)
    client = ERPNextClient()

    projects, scope = _candidate_projects(request, client, employee)
    venues = _venue_names(client, {p["sales_order"] for p in projects if p.get("sales_order")})
    items = [
        {
            "id": p["name"],
            "project_name": p.get("project_name") or p["name"],
            "wedding_date": p.get("expected_end_date"),
            "venue_name": venues.get(p.get("sales_order") or ""),
            "assigned": bool(employee and role_on_project(p, employee)),
        }
        for p in projects
    ]
    log.info("expense_weddings_listed", user=user, employee=employee, scope=scope, count=len(items))
    return {"data": items}
