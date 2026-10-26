"""Google Calendar integration for leave and WFH events."""

import json
import os
from datetime import date, timedelta

from webhook_v2.core.logging import get_logger

log = get_logger(__name__)

_CALENDAR_ID = os.getenv("GOOGLE_CALENDAR_ID", "")
# Use the domain-wide-delegation service account and impersonate the organiser,
# matching review.py. The external read-only SA cannot be granted writer access
# to the Workspace calendar, so direct sharing fails with 403.
_KEY_JSON = os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON", "")
_ORGANIZER = os.getenv("GOOGLE_ORGANIZER_EMAIL", "")

_LEAVE_TAG = "leave_application"

_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
           "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def _service():
    if not _KEY_JSON or not _CALENDAR_ID or not _ORGANIZER:
        return None
    try:
        from google.oauth2 import service_account
        from googleapiclient.discovery import build
        creds = service_account.Credentials.from_service_account_info(
            json.loads(_KEY_JSON),
            scopes=["https://www.googleapis.com/auth/calendar"],
        ).with_subject(_ORGANIZER)
        return build("calendar", "v3", credentials=creds)
    except Exception as e:
        log.warning("calendar_init_failed", error=str(e))
        return None


def _fmt_range(from_date: str, to_date: str) -> str:
    """Format like the existing calendar style: '19 Jan', '23-25 Apr', '24 Feb - 2 Mar'."""
    try:
        fd = date.fromisoformat(from_date)
        td = date.fromisoformat(to_date)
        if fd == td:
            return f"{fd.day} {_MONTHS[fd.month - 1]}"
        if fd.month == td.month:
            return f"{fd.day}-{td.day} {_MONTHS[fd.month - 1]}"
        return f"{fd.day} {_MONTHS[fd.month - 1]} - {td.day} {_MONTHS[td.month - 1]}"
    except Exception:
        return f"{from_date} - {to_date}"


def is_configured() -> bool:
    return bool(_KEY_JSON and _CALENDAR_ID and _ORGANIZER)


def _insert(summary: str, from_date: str, to_date: str, leave_id: str | None = None) -> str | None:
    svc = _service()
    if not svc:
        return None
    try:
        # Google Calendar all-day events: end date is exclusive
        end_exclusive = (date.fromisoformat(to_date) + timedelta(days=1)).isoformat()
        body = {
            "summary": summary,
            "start": {"date": from_date},
            "end": {"date": end_exclusive},
        }
        if leave_id:
            # Lets us find and delete exactly this leave's event later.
            body["extendedProperties"] = {"private": {_LEAVE_TAG: leave_id}}
        event = svc.events().insert(calendarId=_CALENDAR_ID, body=body).execute()
        event_id = event.get("id")
        log.info("calendar_event_added", summary=summary, event_id=event_id, leave=leave_id)
        return event_id
    except Exception as e:
        log.warning("calendar_event_failed", summary=summary, leave=leave_id, error=str(e))
        return None


def add_ooo_event(first_name: str, from_date: str, to_date: str, leave_id: str) -> str | None:
    return _insert(f"OOO - {first_name} ({_fmt_range(from_date, to_date)})", from_date, to_date, leave_id)


def add_wfh_event(first_name: str, from_date: str, to_date: str) -> str | None:
    return _insert(f"WFH - {first_name} ({_fmt_range(from_date, to_date)})", from_date, to_date)


def find_leave_events(leave_id: str) -> list[dict]:
    """Events tagged with this leave application. Raises on API failure so callers
    never mistake 'could not look' for 'none exist' (which would duplicate events)."""
    svc = _service()
    if not svc:
        return []
    result = svc.events().list(
        calendarId=_CALENDAR_ID,
        privateExtendedProperty=f"{_LEAVE_TAG}={leave_id}",
    ).execute()
    return result.get("items", [])


def delete_leave_events(leave_id: str) -> int:
    """Delete every event tagged with this leave application. Returns count deleted."""
    svc = _service()
    if not svc:
        return 0
    deleted = 0
    for ev in find_leave_events(leave_id):
        event_id = ev.get("id")
        try:
            svc.events().delete(calendarId=_CALENDAR_ID, eventId=event_id).execute()
            deleted += 1
            log.info("calendar_event_deleted", summary=ev.get("summary"), event_id=event_id, leave=leave_id)
        except Exception as e:
            log.warning("calendar_event_delete_failed", event_id=event_id, leave=leave_id, error=str(e))
    return deleted


def list_untagged_ooo_events(from_date: str, to_date: str) -> list[dict]:
    """'OOO - ' events overlapping [from_date, to_date] that carry no leave tag (pre-MWP-84)."""
    svc = _service()
    if not svc:
        return []
    # All-day events end on an exclusive date, so widen the window by a day.
    # The API requires RFC3339 timestamps, not bare dates.
    time_max = (date.fromisoformat(to_date) + timedelta(days=1)).isoformat()
    result = svc.events().list(
        calendarId=_CALENDAR_ID,
        timeMin=f"{from_date}T00:00:00Z",
        timeMax=f"{time_max}T00:00:00Z",
        singleEvents=True,
    ).execute()
    return [
        ev for ev in result.get("items", [])
        if ev.get("summary", "").startswith("OOO - ")
        and _LEAVE_TAG not in ev.get("extendedProperties", {}).get("private", {})
    ]


def tag_event(event_id: str, leave_id: str) -> None:
    svc = _service()
    if not svc:
        return
    svc.events().patch(
        calendarId=_CALENDAR_ID,
        eventId=event_id,
        body={"extendedProperties": {"private": {_LEAVE_TAG: leave_id}}},
    ).execute()
    log.info("calendar_event_tagged", event_id=event_id, leave=leave_id)
