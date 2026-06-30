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


def _insert(summary: str, from_date: str, to_date: str) -> str | None:
    svc = _service()
    if not svc:
        return None
    try:
        # Google Calendar all-day events: end date is exclusive
        end_exclusive = (date.fromisoformat(to_date) + timedelta(days=1)).isoformat()
        event = svc.events().insert(calendarId=_CALENDAR_ID, body={
            "summary": summary,
            "start": {"date": from_date},
            "end": {"date": end_exclusive},
        }).execute()
        event_id = event.get("id")
        log.info("calendar_event_added", summary=summary, event_id=event_id)
        return event_id
    except Exception as e:
        log.warning("calendar_event_failed", summary=summary, error=str(e))
        return None


def add_ooo_event(first_name: str, from_date: str, to_date: str) -> str | None:
    return _insert(f"OOO - {first_name} ({_fmt_range(from_date, to_date)})", from_date, to_date)


def add_wfh_event(first_name: str, from_date: str, to_date: str) -> str | None:
    return _insert(f"WFH - {first_name} ({_fmt_range(from_date, to_date)})", from_date, to_date)


def delete_ooo_events(from_date: str, to_date: str, name_tokens: list[str]) -> int:
    """Delete OOO events overlapping [from_date, to_date] whose summary starts with
    'OOO - ' and contains any of the employee's name tokens. Returns count deleted.

    Matches on any name token (not just first_name) so events created under the older
    'OOO - <last token>' title format are cleaned up too. The exact date window keeps
    matching safe. No-op when the calendar is not configured.
    """
    svc = _service()
    if not svc:
        return 0
    try:
        # All-day events end on an exclusive date, so widen the window by a day.
        # The API requires RFC3339 timestamps, not bare dates.
        time_max = (date.fromisoformat(to_date) + timedelta(days=1)).isoformat()
        events = svc.events().list(
            calendarId=_CALENDAR_ID,
            timeMin=f"{from_date}T00:00:00Z",
            timeMax=f"{time_max}T00:00:00Z",
            singleEvents=True,
        ).execute()
    except Exception as e:
        log.warning("calendar_list_failed", from_date=from_date, to_date=to_date, error=str(e))
        return 0

    deleted = 0
    for ev in events.get("items", []):
        summary = ev.get("summary", "")
        if not summary.startswith("OOO - "):
            continue
        if not any(tok and tok in summary for tok in name_tokens):
            continue
        event_id = ev.get("id")
        try:
            svc.events().delete(calendarId=_CALENDAR_ID, eventId=event_id).execute()
            deleted += 1
            log.info("calendar_event_deleted", summary=summary, event_id=event_id)
        except Exception as e:
            log.warning("calendar_event_delete_failed", event_id=event_id, error=str(e))
    return deleted
