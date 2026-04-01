"""
Dashboard data endpoints — pre-joined, pre-filtered data for the dashboard.

GET /dashboard/my-interviews?email=...  — upcoming interviews for the given interviewer
"""

import json
from datetime import date
from fastapi import APIRouter, Query
from webhook_v2.services.erpnext import ERPNextClient
from webhook_v2.core.logging import get_logger

log = get_logger(__name__)
router = APIRouter()


@router.get("/dashboard/my-interviews")
def my_interviews(email: str = Query(..., description="Interviewer email")):
    """Return upcoming interviews where the given email is an interviewer."""
    client = ERPNextClient()
    today = date.today().isoformat()

    # Fetch all upcoming interviews
    interviews = client._get("/api/resource/Interview", params={
        "filters": json.dumps([
            ["scheduled_on", ">=", today],
            ["status", "not in", ["Cleared", "Rejected"]],
        ]),
        "fields": json.dumps([
            "name", "job_applicant", "job_opening",
            "scheduled_on", "from_time", "to_time", "status",
        ]),
        "order_by": "scheduled_on asc",
        "limit_page_length": 200,
    }).get("data", [])

    if not interviews:
        return {"data": []}

    # Batch-fetch interview details (child table) for all interviews
    result = []
    for iv in interviews:
        try:
            full = client._get(f"/api/resource/Interview/{iv['name']}").get("data", {})
            details = full.get("interview_details", [])
            interviewers = [d.get("interviewer") for d in details if d.get("interviewer")]
            if email in interviewers:
                iv["interviewers"] = interviewers
                result.append(iv)
        except Exception:
            continue

    return {"data": result}
