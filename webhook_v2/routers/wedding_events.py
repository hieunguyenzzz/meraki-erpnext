"""
Wedding Event endpoint — cross-wedding events calendar.

The frontend stays dumb: this router fetches Wedding Event rows plus their
staff child rows server-side, resolves display names, and returns one JSON
response ready to render.

GET /wedding-events — events (optionally filtered by date range/employee/project)
"""

import json
from fastapi import APIRouter, Query
from webhook_v2.services.erpnext import ERPNextClient
from webhook_v2.core.logging import get_logger

log = get_logger(__name__)
router = APIRouter()


def _display_name(emp: dict) -> str:
    # First name only (given name), same convention as projects.py
    return emp.get("first_name") or emp.get("employee_name") or emp.get("name", "")


_EVENT_FIELDS = [
    "name", "project", "event_type", "event_date", "start_time", "end_time",
    "venue", "venue_area", "guest_count", "notes",
]

_STAFF_FIELDS = ["parent", "employee", "role", "call_time", "idx"]


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
            "fields": json.dumps(["name", "project_name", "customer"]),
            "limit_page_length": 0,
        }).get("data", [])}

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
            }
            for row in staff_by_event.get(ev["name"], [])
        ]

        if employee and not any(s["employee"] == employee for s in event_staff):
            continue

        proj = project_names.get(ev.get("project") or "", {})

        result_events.append({
            "name": ev["name"],
            "project": ev.get("project"),
            "project_name": proj.get("project_name"),
            "customer": proj.get("customer"),
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
