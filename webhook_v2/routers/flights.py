"""
Flight Booking endpoints (MWP-72), used by /finance/flights.

  GET   /flights               — list with filters + sync status
  GET   /flights/staff         — active employees for the passenger picker
  GET   /flights/sync-status   — just the sync block (for polling)
  GET   /flights/{name}        — one booking
  PATCH /flights/{name}        — staff edits; every changed path goes into manual_fields so the sync keeps it
  POST  /flights/{name}/review — Finance clears the flag; body {"modified"} must match the booking
  POST  /flights/sync          — Finance runs the pipeline now
"""
import copy
import json
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from typing import Literal
from urllib.parse import quote
from zoneinfo import ZoneInfo

import requests
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from webhook_v2.auth import FINANCE, PLANNER, has_roles, require_roles
from webhook_v2.core.database import Database
from webhook_v2.core.logging import get_logger
from webhook_v2.processors.flight_merge import REVIEWED_RE, booking_total
from webhook_v2.processors.flight_checks import normalise_name
from webhook_v2.processors.flights import FlightProcessor, SyncAlreadyRunning, missing_config, sync_lock
from webhook_v2.services.erpnext import ERPNextClient, _extract_erp_message

log = get_logger(__name__)
router = APIRouter(prefix="/flights", tags=["flights"])

PLANNER_OR_FINANCE = tuple(set(PLANNER) | set(FINANCE))
DOCTYPE_URL = "/api/resource/Flight Booking"
LIST_LIMIT = 500
STAFF_REASON = "no staff match for "  # the merge's reason for a passenger it could not link
START_WAIT_STEPS = 150  # x 0.1 s: how long POST /flights/sync waits to learn whether the run got the lock


class PassengerPatch(BaseModel):
    ticket_number: str
    employee: str | None = None        # null or "" unlinks; the sync then never re-matches this passenger
    total: float | None = Field(default=None, ge=0)


class ReviewRequest(BaseModel):
    modified: str  # the booking's `modified` as the page showed it; a later change means unseen reasons


class FlightPatch(BaseModel):
    project: str | None = None
    note: str | None = None
    status: Literal["Confirmed", "Changed", "Cancelled", "Refunded"] | None = None
    passengers: list[PassengerPatch] | None = None


def _lines(text) -> list[str]:
    return [line for line in (text or "").splitlines() if line.strip()]


def _json_list(value) -> list:
    return json.loads(value) if value else []


def _employees(client: ERPNextClient, active_only: bool) -> list[dict]:
    params = {"fields": json.dumps(["name", "employee_name"]), "limit_page_length": 0}
    if active_only:
        params["filters"] = json.dumps([["status", "=", "Active"]])
    return client._get("/api/resource/Employee", params=params).get("data", [])


def _route(segments: list[dict]) -> str:
    stops: list[str] = []
    for s in sorted(segments, key=lambda s: s.get("departure") or ""):
        if not stops or stops[-1] != s.get("origin"):
            stops.append(s.get("origin") or "?")
        stops.append(s.get("destination") or "?")
    return " → ".join(stops)


def _drop_staff_reason(doc: dict, passenger_name: str) -> None:
    """A person linked the passenger: their "no staff match" reason (reviewed or not) is resolved.

    The flag clears only when every remaining reason has been reviewed.
    """
    target = normalise_name(passenger_name)

    def resolved(line: str) -> bool:
        text = REVIEWED_RE.sub("", line)
        return bool(target) and text.startswith(STAFF_REASON) and normalise_name(text[len(STAFF_REASON):]) == target

    lines = [line for line in _lines(doc.get("review_reasons")) if not resolved(line)]
    doc["review_reasons"] = "\n".join(lines)
    if not any(not REVIEWED_RE.match(line) for line in lines):
        doc["needs_review"] = 0


def _get_doc(client: ERPNextClient, name: str) -> dict:
    try:
        return client._get(f"{DOCTYPE_URL}/{quote(name, safe='')}")["data"]
    except requests.HTTPError as exc:
        if exc.response is not None and exc.response.status_code == 404:
            raise HTTPException(status_code=404, detail=f"Flight Booking {name} not found")
        log.error("flight_get_failed", name=name, error=repr(exc))
        raise


def _put_doc(client: ERPNextClient, doc: dict) -> dict:
    """Full-doc PUT; ERPNext rejects it if the booking changed since it was read (e.g. a sync ran meanwhile)."""
    try:
        return client._put(f"{DOCTYPE_URL}/{quote(doc['name'], safe='')}", doc)["data"]
    except requests.HTTPError as exc:
        message = _extract_erp_message(exc.response) if exc.response is not None else repr(exc)
        log.error("flight_put_failed", name=doc["name"], error=message)
        if "TimestampMismatchError" in (exc.response.text if exc.response is not None else ""):
            raise HTTPException(status_code=409, detail="The booking changed meanwhile; reload and try again")
        if exc.response is not None and exc.response.status_code == 417:
            raise HTTPException(status_code=400, detail=message)
        raise


def _detail(doc: dict, names: dict[str, str]) -> dict:
    doc = dict(doc)
    doc["source_emails"] = _json_list(doc.get("source_emails"))
    doc["manual_fields"] = _json_list(doc.get("manual_fields"))
    doc["review_reasons"] = _lines(doc.get("review_reasons"))
    doc["passengers"] = [{**p, "employee_name": names.get(p.get("employee"))} for p in doc.get("passengers") or []]
    doc["route"] = _route(doc.get("segments") or [])
    return doc


def _project_names(client: ERPNextClient, docs: list[dict]) -> dict[str, str]:
    linked = sorted({d["project"] for d in docs if d.get("project")})
    if not linked:
        return {}
    rows = client._get("/api/resource/Project", params={
        "filters": json.dumps([["name", "in", linked]]), "fields": json.dumps(["name", "project_name"]),
        "limit_page_length": 0}).get("data", [])
    return {r["name"]: r.get("project_name") for r in rows}


def _summary(doc: dict, names: dict[str, str], projects: dict[str, str]) -> dict:
    keys = ("name", "booking_code", "airline", "status", "first_departure", "qty", "total_amount", "currency",
            "project", "needs_review", "modified")
    return {**{k: doc.get(k) for k in keys}, "project_name": projects.get(doc.get("project")),
            "route": _route(doc.get("segments") or []),
            "passengers": [{"passenger_name": p.get("passenger_name"), "employee": p.get("employee"),
                            "employee_name": names.get(p.get("employee")), "ticket_number": p.get("ticket_number")}
                           for p in doc.get("passengers") or []],
            "segments": [{k: s.get(k) for k in ("flight_no", "origin", "destination", "departure", "arrival",
                                                 "original_departure")} for s in doc.get("segments") or []]}


def sync_status(_client: ERPNextClient | None = None, _db: Database | None = None) -> dict:
    client, db = _client or ERPNextClient(), _db or Database()
    needs_review = client._get("/api/method/frappe.client.get_count", params={
        "doctype": "Flight Booking", "filters": json.dumps([["needs_review", "=", 1]])}).get("message", 0)
    return {"last_run": db.last_flight_run(), "failed_emails": db.count_flight_emails("failed"),
            "unmatched_emails": db.count_flight_emails("unmatched"), "needs_review_count": needs_review}


# ---------------------------------------------------------------------------
# Core functions (client/db injectable for tests)
# ---------------------------------------------------------------------------

def list_flights(date_from: str | None = None, date_to: str | None = None, airline: str | None = None,
                 project: str | None = None, employee: str | None = None, status: str | None = None,
                 needs_review: bool | None = None, _client: ERPNextClient | None = None,
                 _db: Database | None = None) -> dict:
    client, db = _client or ERPNextClient(), _db or Database()
    filters = []
    if date_from:
        filters.append(["first_departure", ">=", f"{date_from} 00:00:00"])
    if date_to:
        filters.append(["first_departure", "<=", f"{date_to} 23:59:59"])
    for field, value in (("airline", airline), ("project", project), ("status", status)):
        if value:
            filters.append([field, "=", value])
    if needs_review is not None:
        filters.append(["needs_review", "=", int(needs_review)])
    names = [r["name"] for r in client._get(DOCTYPE_URL, params={
        "filters": json.dumps(filters), "fields": json.dumps(["name"]),
        "order_by": "first_departure desc", "limit_page_length": LIST_LIMIT + 1}).get("data", [])]
    truncated = len(names) > LIST_LIMIT
    names = names[:LIST_LIMIT]
    with ThreadPoolExecutor(max_workers=10) as pool:
        docs = list(pool.map(lambda n: _get_doc(client, n), names))
    if employee:
        docs = [d for d in docs if any(p.get("employee") == employee for p in d.get("passengers") or [])]
    staff = {e["name"]: e.get("employee_name") for e in _employees(client, active_only=False)}
    log.info("flight_list", count=len(docs), filters=filters, employee=employee, truncated=truncated)
    projects = _project_names(client, docs)
    return {"bookings": [_summary(d, staff, projects) for d in docs], "truncated": truncated,
            "sync": sync_status(_client=client, _db=db)}


def list_staff(_client: ERPNextClient | None = None) -> list[dict]:
    staff = [{"id": e["name"], "name": e.get("employee_name") or e["name"]}
             for e in _employees(_client or ERPNextClient(), active_only=True)]
    return sorted(staff, key=lambda e: e["name"].lower())


def get_flight(name: str, _client: ERPNextClient | None = None) -> dict:
    client = _client or ERPNextClient()
    staff = {e["name"]: e.get("employee_name") for e in _employees(client, active_only=False)}
    return _detail(_get_doc(client, name), staff)


def patch_flight(name: str, req: FlightPatch, user: str, is_finance: bool,
                 _client: ERPNextClient | None = None) -> dict:
    client = _client or ERPNextClient()
    doc = _get_doc(client, name)
    original = copy.deepcopy(doc)
    sent = req.model_fields_set
    changed: list[str] = []

    if "project" in sent and (req.project or None) != (doc.get("project") or None):
        doc["project"] = req.project or None
        changed.append("project")
    if "note" in sent and (req.note or "") != (doc.get("note") or ""):
        doc["note"] = req.note or ""
        changed.append("note")
    if req.status is not None and req.status != doc.get("status"):
        doc["status"] = req.status
        changed.append("status")

    by_ticket = {p.get("ticket_number"): p for p in doc.get("passengers") or []}
    for patch in req.passengers or []:
        passenger = by_ticket.get(patch.ticket_number)
        if passenger is None:
            raise HTTPException(status_code=400, detail=f"No passenger with ticket {patch.ticket_number} on {name}")
        if "employee" in patch.model_fields_set:  # a person's choice, even "no one": pinned against the sync
            passenger["employee"] = patch.employee or None
            changed.append(f"passengers.{patch.ticket_number}.employee")
            if passenger["employee"]:
                _drop_staff_reason(doc, passenger.get("passenger_name") or "")
        if "total" in patch.model_fields_set:
            if patch.total is None:
                raise HTTPException(status_code=400, detail="A passenger total cannot be emptied")
            if patch.total != (passenger.get("total") or 0):
                if not is_finance:
                    log.warning("flight_patch_total_forbidden", name=name, user=user, ticket=patch.ticket_number)
                    raise HTTPException(status_code=403, detail="Only Finance can change a ticket total")
                passenger["total"] = patch.total
                changed.append(f"passengers.{patch.ticket_number}.total")

    manual = _json_list(doc.get("manual_fields"))
    pinned = [p for p in changed if p not in manual]
    if not changed or (not pinned and doc == original):
        log.info("flight_patch", name=name, user=user, fields=[])
        return get_flight(name, _client=client)
    doc["manual_fields"] = json.dumps(manual + pinned)
    doc["total_amount"] = booking_total(doc.get("passengers") or [])
    _put_doc(client, doc)
    log.info("flight_patch", name=name, user=user, fields=changed)
    return get_flight(name, _client=client)


def review_flight(name: str, user: str, modified: str, _client: ERPNextClient | None = None) -> dict:
    """Clear the flag. Each reason gets a "Reviewed by" prefix that the merge strips, so it won't re-flag.

    Refused when the booking changed after the reviewer loaded it: they would clear reasons they never saw.
    """
    client = _client or ERPNextClient()
    doc = _get_doc(client, name)
    if str(doc.get("modified")) != modified:
        log.warning("flight_review_stale", name=name, user=user, shown=modified, current=doc.get("modified"))
        raise HTTPException(status_code=409, detail="Booking changed since you opened it; reload")
    today = datetime.now(ZoneInfo("Asia/Ho_Chi_Minh")).date().isoformat()
    prefix = f"Reviewed by {user} {today}: "
    doc["review_reasons"] = "\n".join(line if REVIEWED_RE.match(line) else prefix + line
                                      for line in _lines(doc.get("review_reasons")))
    doc["needs_review"] = 0
    _put_doc(client, doc)
    log.info("flight_review", name=name, user=user)
    return get_flight(name, _client=client)


def start_sync(user: str, _processor_factory=FlightProcessor) -> dict:
    """Start a run in the background; answers once the run holds the advisory lock (409 if another run has it)."""
    missing = missing_config()
    if missing:
        log.error("flight_sync_not_configured", user=user, missing=missing)
        raise HTTPException(status_code=503, detail="Flight sync is not configured")
    if not sync_lock.acquire(blocking=False):
        log.warning("flight_sync_already_running", user=user, where="this process")
        raise HTTPException(status_code=409, detail="A flight sync is already running")
    processor = _processor_factory()
    finished = threading.Event()
    outcome: dict = {}

    def _run():
        try:
            stats = processor.run()
            log.info("flight_sync_manual_done", user=user, **stats)
        except SyncAlreadyRunning as exc:
            outcome["busy"] = str(exc)
        except Exception as exc:
            outcome["error"] = repr(exc)
            log.error("flight_sync_manual_failed", user=user, error=repr(exc))
        finally:
            sync_lock.release()
            finished.set()

    try:
        threading.Thread(target=_run, name="flight-sync", daemon=True).start()
    except Exception as exc:
        sync_lock.release()
        log.error("flight_sync_start_failed", user=user, error=repr(exc))
        raise
    for _ in range(START_WAIT_STEPS):  # taking the lock is one quick query
        if processor.lock_acquired.wait(0.1) or finished.is_set():
            break
    if "busy" in outcome:
        log.warning("flight_sync_already_running", user=user, where="another process")
        raise HTTPException(status_code=409, detail="A flight sync is already running")
    if "error" in outcome and not processor.lock_acquired.is_set():
        # The error can carry DB host/port/user; it is in the log (flight_sync_manual_failed), not the response.
        raise HTTPException(status_code=500, detail="Could not start the flight sync; see server logs")
    log.info("flight_sync_requested", user=user)
    return {"started": True}


# ---------------------------------------------------------------------------
# Routes (static paths before /{name})
# ---------------------------------------------------------------------------

@router.get("", dependencies=[Depends(require_roles(*PLANNER_OR_FINANCE))])
def get_flights(date_from: str | None = None, date_to: str | None = None, airline: str | None = None,
                project: str | None = None, employee: str | None = None, status: str | None = None,
                needs_review: bool | None = None):
    return list_flights(date_from, date_to, airline, project, employee, status, needs_review)


@router.get("/staff", dependencies=[Depends(require_roles(*PLANNER_OR_FINANCE))])
def get_staff():
    return list_staff()


@router.get("/sync-status", dependencies=[Depends(require_roles(*PLANNER_OR_FINANCE))])
def get_sync_status():
    return sync_status()


@router.post("/sync")
def post_sync(user: str = Depends(require_roles(*FINANCE))):
    return start_sync(user)


@router.get("/{name}", dependencies=[Depends(require_roles(*PLANNER_OR_FINANCE))])
def get_flight_route(name: str):
    return get_flight(name)


@router.patch("/{name}")
def patch_flight_route(name: str, req: FlightPatch, request: Request,
                       user: str = Depends(require_roles(*PLANNER_OR_FINANCE))):
    return patch_flight(name, req, user, is_finance=has_roles(request, FINANCE))


@router.post("/{name}/review")
def post_review(name: str, req: ReviewRequest, user: str = Depends(require_roles(*FINANCE))):
    return review_flight(name, user, req.modified)
