"""Reconcile a Leave Application's Google Calendar OOO event with ERPNext (MWP-84).

Driven by ERPNext webhooks (submit/cancel/trash) and the HR auto-approve path.
Only the leave name is trusted; the desired state is always read from ERPNext.
"""

import re
import threading

import requests

from webhook_v2.core.logging import get_logger
from webhook_v2.routers.helpers import calendar_name
from webhook_v2.services import google_calendar as gcal
from webhook_v2.services.erpnext import ERPNextClient

log = get_logger(__name__)

# One lock per leave id: webhook retries, amends and the backfill can overlap, and
# find-then-insert would otherwise create duplicate events.
_locks: dict[str, threading.Lock] = {}


def _fetch_leave(client: ERPNextClient, leave_id: str) -> dict | None:
    try:
        return client._get(f"/api/resource/Leave Application/{leave_id}").get("data") or None
    except requests.HTTPError as e:
        # A wrong Host/site also returns 404, so only a genuine DoesNotExistError means "deleted".
        if e.response is not None and e.response.status_code == 404:
            try:
                if e.response.json().get("exc_type") == "DoesNotExistError":
                    return None
            except ValueError:
                pass
        raise


def half_day_note(leave: dict) -> str:
    """'half day AM' / 'half day PM 22 Oct' for half-day leaves, else ''. AM/PM lives in the
    description prefix written by /leave/apply, not in a field."""
    if not leave.get("half_day"):
        return ""
    match = re.match(r"^Half Day \((AM|PM)\)", leave.get("description") or "")
    note = f"half day {match.group(1)}" if match else "half day"
    from_date, to_date, half_date = leave["from_date"][:10], leave["to_date"][:10], leave.get("half_day_date")
    if half_date and from_date != to_date:
        note += f" {gcal._fmt_range(half_date[:10], half_date[:10])}"
    return note


def sync_leave_calendar(leave_id: str) -> str:
    """Make the calendar match ERPNext for one leave. Idempotent. Returns the decision."""
    with _locks.setdefault(leave_id, threading.Lock()):
        return _sync(leave_id)


def _sync(leave_id: str) -> str:
    if not gcal.is_configured():
        log.info("leave_calendar_sync", leave=leave_id, decision="not_configured")
        return "not_configured"
    try:
        client = ERPNextClient()
        leave = _fetch_leave(client, leave_id)
        if not leave or leave.get("docstatus") != 1 or leave.get("status") != "Approved":
            count = gcal.delete_leave_events(leave_id)
            log.info("leave_calendar_sync", leave=leave_id, decision="delete", deleted=count)
            return "delete"
        if gcal.find_leave_events(leave_id):
            log.info("leave_calendar_sync", leave=leave_id, decision="skip")
            return "skip"
        emp = client._get(f"/api/resource/Employee/{leave['employee']}").get("data", {})
        event_id = gcal.add_ooo_event(
            calendar_name(emp.get("first_name", ""), emp.get("last_name", "")),
            leave["from_date"][:10], leave["to_date"][:10], leave_id,
            half_day_note(leave),
        )
        decision = "create" if event_id else "create_failed"
        log.info("leave_calendar_sync", leave=leave_id, decision=decision, event_id=event_id)
        return decision
    except Exception as e:
        log.error("leave_calendar_sync_failed", leave=leave_id, error=str(e))
        return "error"
