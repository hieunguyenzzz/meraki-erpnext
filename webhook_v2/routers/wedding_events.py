"""
Wedding Event endpoint — cross-wedding events calendar.

The frontend stays dumb: this router fetches Wedding Event rows plus their
staff child rows server-side, resolves display names, and returns one JSON
response ready to render.

GET    /wedding-events            — events (optionally filtered by date range/employee/project)
POST   /wedding-events            — create an event (with staff child rows)
PUT    /wedding-events/{name}      — full replace of an event (including staff)
DELETE /wedding-events/{name}      — delete an event
"""

import json
import re

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from webhook_v2.services.erpnext import ERPNextClient
from webhook_v2.core.logging import get_logger

log = get_logger(__name__)
router = APIRouter()

_TIME_RE = re.compile(r"^(\d{1,2}):(\d{2})(?::(\d{2}))?$")


def _normalise_time(value: str | None, field: str) -> str | None:
    """
    Normalise a user-supplied time string to "HH:MM:SS", or None if blank.

    start_time/end_time/call_time are Data fields (not Time — see
    migration/phases/v092_wedding_event_model.py for why), so an explicit
    None here must be sent through to Frappe as-is to keep the field empty.
    """
    if value is None or not value.strip():
        return None
    match = _TIME_RE.match(value.strip())
    if not match:
        raise HTTPException(status_code=400, detail=f"Invalid time for {field}: {value!r}")
    hour, minute, second = match.groups()
    hour, minute, second = int(hour), int(minute), int(second or 0)
    if hour > 23 or minute > 59 or second > 59:
        raise HTTPException(status_code=400, detail=f"Invalid time for {field}: {value!r}")
    return f"{hour:02d}:{minute:02d}:{second:02d}"


class WeddingEventStaffIn(BaseModel):
    employee: str
    role: str | None = None
    call_time: str | None = None
    notes: str | None = None


class WeddingEventIn(BaseModel):
    project: str
    event_type: str
    event_date: str
    start_time: str | None = None
    end_time: str | None = None
    venue: str | None = None
    venue_area: str | None = None
    guest_count: int | None = None
    notes: str | None = None
    staff: list[WeddingEventStaffIn] = []


def _build_event_payload(req: WeddingEventIn) -> dict:
    staff = [
        {
            "employee": s.employee,
            "role": s.role,
            "call_time": _normalise_time(s.call_time, f"staff[{i}].call_time"),
            "notes": s.notes,
        }
        for i, s in enumerate(req.staff)
    ]
    return {
        "project": req.project,
        "event_type": req.event_type,
        "event_date": req.event_date,
        "start_time": _normalise_time(req.start_time, "start_time"),
        "end_time": _normalise_time(req.end_time, "end_time"),
        "venue": req.venue,
        "venue_area": req.venue_area,
        "guest_count": req.guest_count,
        "notes": req.notes,
        "staff": staff,
    }


def _display_name(emp: dict) -> str:
    # First name only (given name), same convention as projects.py
    return emp.get("first_name") or emp.get("employee_name") or emp.get("name", "")


_EVENT_FIELDS = [
    "name", "project", "event_type", "event_date", "start_time", "end_time",
    "venue", "venue_area", "guest_count", "notes",
]

_STAFF_FIELDS = ["parent", "employee", "role", "call_time", "notes", "idx"]


@router.get("/wedding-events")
def get_wedding_events(
    from_date: str | None = Query(None, alias="from"),
    to_date: str | None = Query(None, alias="to"),
    employee: str | None = Query(None),
    project: str | None = Query(None),
):
    """
    Return Wedding Event rows across all weddings, with resolved names.

    - from/to filter on event_date (only the supplied bound is applied)
    - project filters events to a single wedding
    - employee filters to events where that employee has a staff row
      (staff_counts still reflects the full from/to/project scope, ignoring
      this filter, so the UI can compare load across staff)
    """
    log.info(
        "wedding_events_query",
        from_date=from_date,
        to_date=to_date,
        employee=employee,
        project=project,
    )

    client = ERPNextClient()

    filters: list[list] = []
    if from_date:
        filters.append(["event_date", ">=", from_date])
    if to_date:
        filters.append(["event_date", "<=", to_date])
    if project:
        filters.append(["project", "=", project])

    events = client._get("/api/resource/Wedding Event", params={
        "filters": json.dumps(filters),
        "fields": json.dumps(_EVENT_FIELDS),
        "limit_page_length": 0,
    }).get("data", [])

    if not events:
        log.info("wedding_events_empty", from_date=from_date, to_date=to_date, project=project)
        return {"events": [], "staff_counts": []}

    event_names = [ev["name"] for ev in events]

    staff_rows = client._get("/api/resource/Wedding Event Staff", params={
        "parent": "Wedding Event",
        "filters": json.dumps([["parent", "in", event_names]]),
        "fields": json.dumps(_STAFF_FIELDS),
        "limit_page_length": 0,
    }).get("data", [])

    staff_by_event: dict[str, list[dict]] = {}
    for row in staff_rows:
        staff_by_event.setdefault(row["parent"], []).append(row)
    for rows in staff_by_event.values():
        rows.sort(key=lambda r: r.get("idx") or 0)

    # Resolve display names — only for the ids actually referenced by this result set
    project_ids = {ev["project"] for ev in events if ev.get("project")}
    venue_ids = {ev["venue"] for ev in events if ev.get("venue")}
    employee_ids = {row["employee"] for row in staff_rows if row.get("employee")}

    project_names = {}
    if project_ids:
        project_names = {p["name"]: p for p in client._get("/api/resource/Project", params={
            "filters": json.dumps([["name", "in", list(project_ids)]]),
            "fields": json.dumps(["name", "project_name", "customer", "sales_order", "custom_wedding_type"]),
            "limit_page_length": 0,
        }).get("data", [])}

    # custom_wedding_type disagrees on where it's written: wedding creation
    # (wedding_ops.py) writes it to the Sales Order, wedding editing
    # (wedding.py) writes it to the Project. Same fallback as projects.py.
    so_ids = {p["sales_order"] for p in project_names.values() if p.get("sales_order")}
    so_wedding_types = {}
    if so_ids:
        so_wedding_types = {s["name"]: s.get("custom_wedding_type") for s in client._get(
            "/api/resource/Sales Order", params={
                "filters": json.dumps([["name", "in", list(so_ids)]]),
                "fields": json.dumps(["name", "custom_wedding_type"]),
                "limit_page_length": 0,
            }
        ).get("data", [])}

    supplier_names = {}
    if venue_ids:
        supplier_names = {s["name"]: s.get("supplier_name", s["name"]) for s in client._get(
            "/api/resource/Supplier", params={
                "filters": json.dumps([["name", "in", list(venue_ids)]]),
                "fields": json.dumps(["name", "supplier_name"]),
                "limit_page_length": 0,
            }
        ).get("data", [])}

    employee_names = {}
    if employee_ids:
        employee_names = {e["name"]: _display_name(e) for e in client._get(
            "/api/resource/Employee", params={
                "filters": json.dumps([["name", "in", list(employee_ids)]]),
                "fields": json.dumps(["name", "employee_name", "first_name"]),
                "limit_page_length": 0,
            }
        ).get("data", [])}

    # staff_counts ignores the employee filter by design — computed before it's applied
    staff_event_count: dict[str, int] = {}
    for ev in events:
        for row in staff_by_event.get(ev["name"], []):
            emp_id = row.get("employee")
            if emp_id:
                staff_event_count[emp_id] = staff_event_count.get(emp_id, 0) + 1

    staff_counts = sorted(
        (
            {
                "employee": emp_id,
                "employee_name": employee_names.get(emp_id, emp_id),
                "event_count": count,
            }
            for emp_id, count in staff_event_count.items()
        ),
        key=lambda s: s["event_count"],
        reverse=True,
    )

    result_events = []
    for ev in events:
        event_staff = [
            {
                "employee": row.get("employee"),
                "employee_name": employee_names.get(row.get("employee"), row.get("employee")),
                "role": row.get("role"),
                "call_time": row.get("call_time"),
                "notes": row.get("notes"),
            }
            for row in staff_by_event.get(ev["name"], [])
        ]

        if employee and not any(s["employee"] == employee for s in event_staff):
            continue

        proj = project_names.get(ev.get("project") or "", {})
        wedding_type = proj.get("custom_wedding_type") or so_wedding_types.get(proj.get("sales_order") or "") or None

        result_events.append({
            "name": ev["name"],
            "project": ev.get("project"),
            "project_name": proj.get("project_name"),
            "customer": proj.get("customer"),
            "wedding_type": wedding_type,
            "event_type": ev.get("event_type"),
            "event_date": ev.get("event_date"),
            "start_time": ev.get("start_time"),
            "end_time": ev.get("end_time"),
            "venue": ev.get("venue"),
            "venue_name": supplier_names.get(ev.get("venue")) if ev.get("venue") else None,
            "venue_area": ev.get("venue_area"),
            "guest_count": ev.get("guest_count"),
            "notes": ev.get("notes"),
            "staff": event_staff,
        })

    result_events.sort(key=lambda e: (e["event_date"] or "", e["start_time"] or ""))

    return {"events": result_events, "staff_counts": staff_counts}


@router.post("/wedding-events")
def create_wedding_event(req: WeddingEventIn):
    client = ERPNextClient()
    payload = _build_event_payload(req)

    try:
        resp = client._post("/api/resource/Wedding Event", payload)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to create wedding event: {e}")

    name = resp.get("data", {}).get("name")
    if not name:
        raise HTTPException(status_code=500, detail="Wedding Event created but name not returned")

    log.info("wedding_event_created", name=name, project=req.project, event_type=req.event_type)
    return {"name": name}


@router.put("/wedding-events/{name}")
def update_wedding_event(name: str, req: WeddingEventIn):
    client = ERPNextClient()
    payload = _build_event_payload(req)

    try:
        client._put(f"/api/resource/Wedding Event/{name}", payload)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to update wedding event {name}: {e}")

    log.info("wedding_event_updated", name=name, project=req.project, event_type=req.event_type)
    return {"name": name}


@router.delete("/wedding-events/{name}")
def delete_wedding_event(name: str):
    client = ERPNextClient()

    try:
        client._delete(f"/api/resource/Wedding Event/{name}")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to delete wedding event {name}: {e}")

    log.info("wedding_event_deleted", name=name)
    return {"ok": True}
