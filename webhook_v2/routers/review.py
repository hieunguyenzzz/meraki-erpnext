"""
Performance review endpoints.

POST /review/{employee_name}     — Schedule a review meeting (Google Calendar integration).
GET  /reviews/criteria           — List active review criteria.
POST /reviews                    — Create a review with ratings.
PATCH /reviews/{name}            — Update a review (replaces ratings child rows).
DELETE /reviews/{name}           — Delete a review.
GET  /reviews/employee/{employee}/history — Per-employee review history + sparkline data.
"""

import json
from datetime import datetime, timedelta
from statistics import mean
from typing import Optional
from urllib.parse import quote

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


class RatingItem(BaseModel):
    criterion: str
    score: int


class CreateReviewRequest(BaseModel):
    employee: str
    review_date: str  # YYYY-MM-DD
    period: Optional[str] = None
    notes: Optional[str] = ""
    overall_score: Optional[float] = None
    ratings: list[RatingItem] = []


class UpdateReviewRequest(BaseModel):
    review_date: Optional[str] = None
    period: Optional[str] = None
    notes: Optional[str] = None
    overall_score: Optional[float] = None
    ratings: Optional[list[RatingItem]] = None


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


# ---------------------------------------------------------------------------
# Review outcome endpoints (plural /reviews prefix)
# ---------------------------------------------------------------------------

def _validate_ratings(ratings: list[RatingItem], client: ERPNextClient) -> None:
    """Validate all rating items. Raises HTTPException on any violation."""
    if not ratings:
        return

    # Check scores in range
    for item in ratings:
        if not (1 <= item.score <= 10):
            raise HTTPException(
                status_code=400,
                detail=f"Score for criterion '{item.criterion}' must be between 1 and 10, got {item.score}.",
            )

    # Check no duplicate criteria
    criteria_names = [item.criterion for item in ratings]
    if len(criteria_names) != len(set(criteria_names)):
        raise HTTPException(status_code=400, detail="Duplicate criteria in ratings — each criterion may appear only once.")

    # Check all criteria exist and are active
    try:
        active_result = client._get(
            "/api/resource/Meraki Review Criterion",
            params={
                "filters": json.dumps([["active", "=", 1]]),
                "fields": json.dumps(["name"]),
                "limit_page_length": 0,
            },
        )
        active_names = {r["name"] for r in active_result.get("data", [])}
    except Exception as e:
        log.error("fetch_criteria_error", error=str(e))
        raise HTTPException(status_code=500, detail=f"Could not fetch criteria list: {e}")

    for item in ratings:
        if item.criterion not in active_names:
            raise HTTPException(
                status_code=400,
                detail=f"Criterion '{item.criterion}' does not exist or is not active.",
            )


def _compute_average_rating(ratings: list[RatingItem]) -> float:
    if not ratings:
        return 0.0
    return round(mean(item.score for item in ratings), 2)


@router.get("/reviews/criteria")
def get_criteria():
    """Return all active review criteria sorted by sort_order, then name."""
    client = ERPNextClient()
    try:
        result = client._get(
            "/api/resource/Meraki Review Criterion",
            params={
                "filters": json.dumps([["active", "=", 1]]),
                "fields": json.dumps(["name", "criterion_name", "sort_order"]),
                "order_by": "sort_order asc, criterion_name asc",
                "limit_page_length": 0,
            },
        )
    except Exception as e:
        log.error("get_criteria_error", error=str(e))
        raise HTTPException(status_code=500, detail=f"Failed to fetch criteria: {e}")

    return {"criteria": result.get("data", [])}


@router.post("/reviews")
def create_review(request: CreateReviewRequest):
    """Create a new Meraki Review with optional ratings."""
    client = ERPNextClient()

    # Validate overall_score
    if request.overall_score is not None and not (1.0 <= request.overall_score <= 10.0):
        raise HTTPException(status_code=400, detail="overall_score must be between 1.0 and 10.0.")

    # Validate ratings
    _validate_ratings(request.ratings, client)

    average_rating = _compute_average_rating(request.ratings)

    payload = {
        "employee": request.employee,
        "review_date": request.review_date,
        "notes": request.notes or "",
        "average_rating": average_rating,
        "ratings": [{"criterion": r.criterion, "score": r.score} for r in request.ratings],
    }
    if request.period is not None:
        payload["period"] = request.period
    if request.overall_score is not None:
        payload["overall_score"] = request.overall_score

    try:
        result = client._post("/api/resource/Meraki Review", payload)
    except Exception as e:
        log.error("create_review_error", employee=request.employee, error=str(e))
        raise HTTPException(status_code=500, detail=f"Failed to create review: {e}")

    created = result.get("data", {})
    review_name = created.get("name", "")

    log.info("review_created", name=review_name, employee=request.employee, average_rating=average_rating)

    # Best-effort: update employee's last review date
    try:
        client._post("/api/method/meraki_set_employee_fields", {
            "employee_name": request.employee,
            "custom_last_review_date": request.review_date,
        })
    except Exception as e:
        log.warning("review_date_update_failed", employee=request.employee, error=str(e))

    return created


@router.patch("/reviews/{name}")
def update_review(name: str, request: UpdateReviewRequest):
    """Update an existing Meraki Review. Replaces ratings child rows when provided."""
    client = ERPNextClient()

    if request.overall_score is not None and not (1.0 <= request.overall_score <= 10.0):
        raise HTTPException(status_code=400, detail="overall_score must be between 1.0 and 10.0.")

    if request.ratings is not None:
        _validate_ratings(request.ratings, client)

    # Fetch current doc to merge non-updated fields
    try:
        current = client._get(f"/api/resource/Meraki Review/{quote(name)}").get("data", {})
    except Exception as e:
        log.error("fetch_review_error", name=name, error=str(e))
        raise HTTPException(status_code=404, detail=f"Review not found: {name}")

    payload: dict = {}
    if request.review_date is not None:
        payload["review_date"] = request.review_date
    if request.period is not None:
        payload["period"] = request.period
    if request.notes is not None:
        payload["notes"] = request.notes
    if request.overall_score is not None:
        payload["overall_score"] = request.overall_score

    if request.ratings is not None:
        payload["ratings"] = [{"criterion": r.criterion, "score": r.score} for r in request.ratings]
        payload["average_rating"] = _compute_average_rating(request.ratings)

    try:
        result = client._put(f"/api/resource/Meraki Review/{quote(name)}", payload)
    except Exception as e:
        log.error("update_review_error", name=name, error=str(e))
        raise HTTPException(status_code=500, detail=f"Failed to update review: {e}")

    updated = result.get("data", {})
    log.info("review_updated", name=name)
    return updated


@router.delete("/reviews/{name}")
def delete_review(name: str):
    """Delete a Meraki Review record."""
    client = ERPNextClient()
    try:
        client._delete(f"/api/resource/Meraki Review/{quote(name)}")
    except Exception as e:
        log.error("delete_review_error", name=name, error=str(e))
        raise HTTPException(status_code=500, detail=f"Failed to delete review: {e}")

    log.info("review_deleted", name=name)
    return {"status": "ok"}


@router.get("/reviews/employee/{employee}/history")
def get_employee_review_history(employee: str):
    """Return all reviews for an employee, sorted descending by review_date."""
    client = ERPNextClient()
    try:
        result = client._get(
            "/api/resource/Meraki Review",
            params={
                "filters": json.dumps([["employee", "=", employee]]),
                "fields": json.dumps([
                    "name", "review_date", "period", "average_rating",
                    "overall_score", "reviewer", "notes",
                ]),
                "order_by": "review_date desc",
                "limit_page_length": 0,
            },
        )
    except Exception as e:
        log.error("get_employee_history_error", employee=employee, error=str(e))
        raise HTTPException(status_code=500, detail=f"Failed to fetch review history: {e}")

    reviews = result.get("data", [])

    # Build chronological sparkline data (oldest first)
    average_trend = [
        {
            "date": r["review_date"],
            "score": r.get("overall_score") or r.get("average_rating") or 0,
        }
        for r in reversed(reviews)
    ]

    log.info("employee_history_fetched", employee=employee, count=len(reviews))
    return {"reviews": reviews, "average_trend": average_trend}
