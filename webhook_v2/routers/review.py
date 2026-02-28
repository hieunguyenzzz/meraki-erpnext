"""
Performance review endpoints.

POST /review/{employee_name} — Creates a Meraki Review record in ERPNext,
updates the employee's custom_last_review_date, and creates a Google Calendar
event for all participants.
"""

import json
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from webhook_v2.config import settings
from webhook_v2.services.erpnext import ERPNextClient
from webhook_v2.core.logging import get_logger

log = get_logger(__name__)
router = APIRouter()


class ScheduleReviewRequest(BaseModel):
    review_date: str  # YYYY-MM-DD
    review_time: Optional[str] = "09:00"  # HH:MM
    notes: Optional[str] = ""
    participants: list[str] = []  # List of employee IDs


def _create_calendar_event(
    organizer_email: str,
    employee_name: str,
    employee_display: str,
    review_date: str,
    review_time: str,
    attendee_emails: list[str],
    notes: str,
) -> Optional[str]:
    """Create a Google Calendar event using service account credentials.

    Returns the event ID, or None if calendar integration is not configured.
    """
    if not settings.google_service_account_json or not settings.google_organizer_email:
        log.info("google_calendar_skipped", reason="credentials not configured")
        return None

    try:
        from google.oauth2 import service_account
        from googleapiclient.discovery import build

        sa_info = json.loads(settings.google_service_account_json)
        credentials = service_account.Credentials.from_service_account_info(
            sa_info,
            scopes=["https://www.googleapis.com/auth/calendar"],
        ).with_subject(organizer_email)

        service = build("calendar", "v3", credentials=credentials)

        # Parse date and time
        time_parts = (review_time or "09:00").split(":")
        hour = int(time_parts[0]) if len(time_parts) > 0 else 9
        minute = int(time_parts[1]) if len(time_parts) > 1 else 0

        start_dt = datetime.strptime(review_date, "%Y-%m-%d").replace(hour=hour, minute=minute)
        end_dt = start_dt + timedelta(hours=1)

        tz = "Asia/Ho_Chi_Minh"
        fmt = "%Y-%m-%dT%H:%M:%S"

        attendees = [{"email": email} for email in attendee_emails if email]

        event_body = {
            "summary": f"Performance Review – {employee_display}",
            "description": notes or "",
            "start": {"dateTime": start_dt.strftime(fmt), "timeZone": tz},
            "end": {"dateTime": end_dt.strftime(fmt), "timeZone": tz},
            "attendees": attendees,
        }

        created = (
            service.events()
            .insert(calendarId="primary", body=event_body, sendUpdates="all")
            .execute()
        )
        event_id = created.get("id")
        log.info("google_calendar_event_created", event_id=event_id, employee=employee_name)
        return event_id

    except Exception as e:
        log.error("google_calendar_error", error=str(e), employee=employee_name)
        return None


@router.post("/review/{employee_name}")
async def schedule_review(employee_name: str, request: ScheduleReviewRequest):
    """
    Schedule a performance review for an employee.

    1. Creates a Meraki Review record in ERPNext
    2. Updates employee's custom_last_review_date
    3. Creates a Google Calendar event (if credentials configured)
    """
    client = ERPNextClient()

    # Fetch the employee record to get display name and email
    try:
        emp_data = client._get(f"/api/resource/Employee/{employee_name}")
        employee = emp_data.get("data", {})
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Employee not found: {employee_name}")

    employee_display = employee.get("employee_name") or employee_name

    # Collect participant emails for Calendar invites
    all_participant_ids = list({employee_name} | set(request.participants))
    attendee_emails = []

    for emp_id in all_participant_ids:
        try:
            if emp_id == employee_name:
                email = employee.get("company_email") or employee.get("personal_email")
            else:
                data = client._get(f"/api/resource/Employee/{emp_id}")
                emp = data.get("data", {})
                email = emp.get("company_email") or emp.get("personal_email")
            if email:
                attendee_emails.append(email)
        except Exception:
            pass  # Skip employees we can't fetch

    # Create Google Calendar event
    google_event_id = _create_calendar_event(
        organizer_email=settings.google_organizer_email,
        employee_name=employee_name,
        employee_display=employee_display,
        review_date=request.review_date,
        review_time=request.review_time or "09:00",
        attendee_emails=attendee_emails,
        notes=request.notes or "",
    )

    # Create Meraki Review record in ERPNext
    participants_json = json.dumps(request.participants)
    try:
        review_result = client._post("/api/resource/Meraki Review", {
            "employee": employee_name,
            "review_date": request.review_date,
            "review_time": request.review_time or "",
            "notes": request.notes or "",
            "participants": participants_json,
            "google_event_id": google_event_id or "",
        })
        review_name = review_result.get("data", {}).get("name", "")
    except Exception as e:
        log.error("review_create_failed", employee=employee_name, error=str(e))
        raise HTTPException(status_code=500, detail=f"Failed to create review record: {e}")

    # Update employee's custom_last_review_date via Server Script
    try:
        client._post("/api/method/meraki_set_employee_fields", {
            "employee_name": employee_name,
            "custom_last_review_date": request.review_date,
        })
    except Exception as e:
        log.warning("review_date_update_failed", employee=employee_name, error=str(e))
        # Non-fatal — review record is already created

    log.info(
        "review_scheduled",
        employee=employee_name,
        review_name=review_name,
        review_date=request.review_date,
        google_event_id=google_event_id,
    )

    return {
        "status": "ok",
        "review_name": review_name,
        "google_event_id": google_event_id,
    }
