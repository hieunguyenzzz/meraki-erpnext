"""Google Calendar integration for leave and WFH events."""

import json
import os
from datetime import date, timedelta

from webhook_v2.core.logging import get_logger

log = get_logger(__name__)

_CALENDAR_ID = os.getenv("GOOGLE_CALENDAR_ID", "")
_KEY_JSON = os.getenv("GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON", "")

_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
           "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def _service():
    if not _KEY_JSON or not _CALENDAR_ID:
        return None
    try:
        from google.oauth2 import service_account
        from googleapiclient.discovery import build
        creds = service_account.Credentials.from_service_account_info(
            json.loads(_KEY_JSON),
            scopes=["https://www.googleapis.com/auth/calendar"],
        )
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
