"""
Staff-facing "My weddings" endpoints (MWP-97).

Employee-only staff (no CRM/planner/HR/finance role) may see the weddings they
are assigned to. webhook_v2 talks to ERPNext with the admin API key, so the
user's DocPerms never apply here — scoping is done in this module:

  * a caller only ever sees Projects where their OWN Employee (resolved from
    the session, never a client-supplied id) is in an assignment field;
  * the detail view is read-only and omits commission, price and payment data.

GET /my/weddings            — assigned weddings: Open, plus Completed within the last 30 days
GET /my/weddings/{project}  — read-only detail for one assigned wedding (403 otherwise)
GET /wedding/{project}/team-contacts — teammates' mobile numbers, for whoever can see the wedding
"""

import json
import uuid
from datetime import date, timedelta

from urllib.parse import quote

import requests
from fastapi import APIRouter, HTTPException, Request, Response

from webhook_v2.auth import (
    FINANCE, PLANNER, WEDDING_EXPENSE, get_current_user, has_roles, resolve_employee,
)
from webhook_v2.core.logging import bind_context, get_logger
from webhook_v2.routers.wedding_events import get_wedding_events
from webhook_v2.services.erpnext import ERPNextClient

log = get_logger(__name__)
router = APIRouter()

ASSIGNMENT_ROLES = {
    "custom_lead_planner": "lead",
    "custom_support_planner": "support",
    "custom_assistant_1": "assistant",
    "custom_assistant_2": "assistant",
    "custom_assistant_3": "assistant",
    "custom_assistant_4": "assistant",
    "custom_assistant_5": "assistant",
}
# Roles that already see every wedding elsewhere in the app (frontend: seesAllWeddings + planners).
ALL_WEDDINGS_ROLES = tuple(set(PLANNER) | set(FINANCE) | set(WEDDING_EXPENSE))
RECENT_DAYS = 30

_LIST_FIELDS = [
    "name", "project_name", "status", "custom_project_stage", "customer",
    "expected_end_date", "sales_order", "custom_wedding_type", "custom_service_type",
    *ASSIGNMENT_ROLES,
]


def bind_correlation_id(request: Request, response: Response | None = None) -> None:
    """Tag every log line of this request with one id (client's X-Request-ID if sent) and echo it back."""
    cid = request.headers.get("x-request-id") or uuid.uuid4().hex[:12]
    bind_context(correlation_id=cid)
    if response is not None:
        response.headers["X-Request-ID"] = cid


def role_on_project(project: dict, employee: str) -> str | None:
    """'lead' / 'support' / 'assistant' if `employee` is on the project, else None."""
    for field, role in ASSIGNMENT_ROLES.items():
        if project.get(field) == employee:
            return role
    return None


def _load_assigned_project(client: ERPNextClient, project: str, employee: str, user: str) -> tuple[dict, str]:
    """Return (Project doc, caller's role on it). A missing project is a 403 exactly like an
    unassigned one, so the response never reveals which weddings exist."""
    doc: dict = {}
    try:
        doc = client._get(f"/api/resource/Project/{quote(project, safe='')}").get("data", {})
    except requests.HTTPError as e:
        if e.response is None or e.response.status_code not in (403, 404):
            raise
    role = role_on_project(doc, employee)
    if not role:
        log.warning("my_weddings_forbidden", user=user, employee=employee, project=project, found=bool(doc))
        raise HTTPException(status_code=403, detail="You are not assigned to this wedding")
    return doc, role


def require_assigned_unless_privileged(request: Request, project: str, employee: str | None = None) -> None:
    """403 unless the caller sees all weddings anyway or is assigned to `project`."""
    bind_correlation_id(request)
    if has_roles(request, ALL_WEDDINGS_ROLES):
        return
    employee = employee or resolve_employee(request, None)
    _load_assigned_project(ERPNextClient(), project, employee, get_current_user(request))


def _venue_names(client: ERPNextClient, sales_order_ids: set[str]) -> dict[str, str]:
    """Sales Order name -> venue display name."""
    if not sales_order_ids:
        return {}
    sos = client._get("/api/resource/Sales Order", params={
        "filters": json.dumps([["name", "in", list(sales_order_ids)]]),
        "fields": json.dumps(["name", "custom_venue"]),
        "limit_page_length": 0,
    }).get("data", [])
    venue_ids = {so["custom_venue"] for so in sos if so.get("custom_venue")}
    suppliers = {}
    if venue_ids:
        suppliers = {s["name"]: s.get("supplier_name") or s["name"] for s in client._get(
            "/api/resource/Supplier", params={
                "filters": json.dumps([["name", "in", list(venue_ids)]]),
                "fields": json.dumps(["name", "supplier_name"]),
                "limit_page_length": 0,
            }).get("data", [])}
    return {so["name"]: suppliers.get(so.get("custom_venue"), so.get("custom_venue")) for so in sos if so.get("custom_venue")}


def _days_to_go(wedding_date: str | None, today: date) -> int | None:
    return (date.fromisoformat(wedding_date) - today).days if wedding_date else None


def list_assigned_projects(client: ERPNextClient, employee: str, today: date) -> list[dict]:
    """Projects `employee` is assigned to: Open, plus Completed within the last RECENT_DAYS days."""
    projects = client._get("/api/resource/Project", params={
        "or_filters": json.dumps([[f, "=", employee] for f in ASSIGNMENT_ROLES]),
        "filters": json.dumps([["status", "in", ["Open", "Completed"]]]),
        "fields": json.dumps(_LIST_FIELDS),
        "limit_page_length": 0,
    }).get("data", [])
    cutoff = (today - timedelta(days=RECENT_DAYS)).isoformat()
    return [p for p in projects if p["status"] == "Open" or (p.get("expected_end_date") or "") >= cutoff]


@router.get("/my/weddings")
def my_weddings(request: Request, response: Response):
    bind_correlation_id(request, response)
    user = get_current_user(request)
    try:
        employee = resolve_employee(request, None)
    except HTTPException as e:
        if e.status_code != 403:
            raise
        log.info("my_weddings_no_employee", user=user)
        return {"data": []}

    client = ERPNextClient()
    today = date.today()
    projects = list_assigned_projects(client, employee, today)
    venues = _venue_names(client, {p["sales_order"] for p in projects if p.get("sales_order")})

    items = []
    for p in projects:
        items.append({
            "id": p["name"],
            "project_name": p.get("project_name") or p["name"],
            "wedding_date": p.get("expected_end_date"),
            "days_to_go": _days_to_go(p.get("expected_end_date"), today),
            "venue_name": venues.get(p.get("sales_order") or ""),
            "stage": p.get("custom_project_stage") or "Planning",
            "status": p["status"],
            "my_role": role_on_project(p, employee),
        })
    # Upcoming (soonest first), then past (most recent first); undated last.
    items.sort(key=lambda i: (
        i["days_to_go"] is None,
        i["days_to_go"] is not None and i["days_to_go"] < 0,
        abs(i["days_to_go"] or 0),
    ))
    log.info("my_weddings_listed", user=user, employee=employee, count=len(items))
    return {"data": items}


@router.get("/my/weddings/{project}")
def my_wedding_detail(project: str, request: Request, response: Response):
    bind_correlation_id(request, response)
    user = get_current_user(request)
    employee = resolve_employee(request, None)
    client = ERPNextClient()

    doc, my_role = _load_assigned_project(client, project, employee, user)

    team_ids = [doc.get(f) for f in ASSIGNMENT_ROLES if doc.get(f)]
    members = {e["name"]: e for e in client._get(
        "/api/resource/Employee", params={
            "filters": json.dumps([["name", "in", team_ids]]),
            "fields": json.dumps(["name", "employee_name", "first_name", "cell_number"]),
            "limit_page_length": 0,
        }).get("data", [])} if team_ids else {}
    team = [
        {
            "employee": doc[f],
            "name": members.get(doc[f], {}).get("first_name") or members.get(doc[f], {}).get("employee_name") or doc[f],
            "role": role,
            "phone": members.get(doc[f], {}).get("cell_number") or None,
        }
        for f, role in ASSIGNMENT_ROLES.items() if doc.get(f)
    ]

    venue = _venue_names(client, {doc["sales_order"]} if doc.get("sales_order") else set()).get(doc.get("sales_order") or "")
    customer_name = None
    if doc.get("customer"):
        customer_name = client._get(f"/api/resource/Customer/{quote(doc['customer'], safe='')}").get("data", {}).get("customer_name")

    events = get_wedding_events(from_date=None, to_date=None, employee=None, project=project)["events"]
    events = [
        {k: ev.get(k) for k in ("name", "event_type", "event_date", "start_time", "end_time", "venue_name", "venue_area", "guest_count", "notes")}
        | {"staff": [{"name": s["employee_name"], "role": s.get("role"), "call_time": s.get("call_time")} for s in ev.get("staff", [])]}
        for ev in events
    ]
    guests = max((ev["guest_count"] or 0 for ev in events), default=0) or None

    today = date.today()
    result = {
        "id": doc["name"],
        "project_name": doc.get("project_name") or doc["name"],
        "customer_name": customer_name,
        "wedding_date": doc.get("expected_end_date"),
        "days_to_go": _days_to_go(doc.get("expected_end_date"), today),
        "venue_name": venue,
        "guest_count": guests,
        "package": doc.get("custom_service_type") or None,
        "wedding_type": doc.get("custom_wedding_type") or None,
        "stage": doc.get("custom_project_stage") or "Planning",
        "status": doc.get("status"),
        "my_role": my_role,
        "team": team,
        "events": events,
        "my_expenses": _my_expenses(client, project, employee),
    }
    log.info("my_wedding_read", user=user, employee=employee, project=project, events=len(events))
    return {"data": result}


def load_project_visible_to_caller(client: ERPNextClient, request: Request, project: str) -> dict:
    """The Project doc if the caller may see it (privileged roles: any wedding; others: assigned only).
    A missing wedding is a 404 for privileged callers and a 403 for everyone else."""
    if has_roles(request, ALL_WEDDINGS_ROLES):
        try:
            doc = client._get(f"/api/resource/Project/{quote(project, safe='')}").get("data", {})
        except requests.HTTPError as e:
            if e.response is None or e.response.status_code not in (403, 404):
                raise
            doc = {}
        if not doc:
            raise HTTPException(status_code=404, detail="Wedding not found")
        return doc
    employee = resolve_employee(request, None)
    doc, _role = _load_assigned_project(client, project, employee, get_current_user(request))
    return doc


@router.get("/wedding/{project}/team-contacts")
def wedding_team_contacts(project: str, request: Request, response: Response):
    """Employee id -> mobile number for the people on one wedding. Same visibility as the wedding itself:
    planners/finance see any wedding, everyone else only the ones they are assigned to."""
    bind_correlation_id(request, response)
    client = ERPNextClient()
    doc = load_project_visible_to_caller(client, request, project)
    team_ids = [doc.get(f) for f in ASSIGNMENT_ROLES if doc.get(f)]
    rows = client._get("/api/resource/Employee", params={
        "filters": json.dumps([["name", "in", team_ids]]),
        "fields": json.dumps(["name", "cell_number"]),
        "limit_page_length": 0,
    }).get("data", []) if team_ids else []
    log.info("wedding_team_contacts_read", user=get_current_user(request), project=project, count=len(rows))
    return {"data": {r["name"]: r["cell_number"] for r in rows if r.get("cell_number")}}


def _my_expenses(client: ERPNextClient, project: str, employee: str) -> list[dict]:
    """The caller's own expenses on this wedding (Draft = pending, Submitted = approved).

    One list call joins the first line item's name (child rows can't be listed directly);
    the join yields one row per item, so keep the lowest idx per invoice.
    """
    rows = client._get("/api/resource/Purchase Invoice", params={
        "filters": json.dumps([
            ["docstatus", "in", [0, 1]], ["project", "=", project], ["custom_expense_staff", "=", employee],
        ]),
        "fields": json.dumps([
            "name", "posting_date", "grand_total", "docstatus", "custom_rejected",
            "`tabPurchase Invoice Item`.idx", "`tabPurchase Invoice Item`.item_name",
        ]),
        "order_by": "posting_date desc",
        "limit_page_length": 0,
    }).get("data", [])
    first: dict[str, dict] = {}
    for row in rows:
        if row["name"] not in first or (row.get("idx") or 999) < (first[row["name"]].get("idx") or 999):
            first[row["name"]] = row
    return [
        {
            "name": pi["name"],
            "date": pi["posting_date"],
            "amount": pi["grand_total"],
            "description": pi.get("item_name") or "",
            "status": "Approved" if pi["docstatus"] == 1 else "Rejected" if pi.get("custom_rejected") else "Pending",
        }
        for pi in first.values()
    ]
