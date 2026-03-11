"""
Public job endpoints.

GET  /jobs           — list open Job Openings (no auth required)
POST /jobs/apply     — submit a job application (no auth required)

Rate limiting mirrors ERPNext's native web form: 10 submissions / 60 s per IP.
Duplicate applications are intentionally allowed, matching ERPNext's autoname
behaviour (email_id, email_id-1, email_id-2, …) per HRMS issue #4187.
"""

import os
import re
import time
from collections import defaultdict
from threading import Lock
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException, Request, UploadFile, File, Form

from webhook_v2.services.erpnext import ERPNextClient
from webhook_v2.core.logging import get_logger

# ── constants ─────────────────────────────────────────────────────────────────

_ALLOWED_EXTENSIONS = {".pdf", ".doc", ".docx"}
_CV_MAX_BYTES = 10 * 1024 * 1024        # 10 MB
_PORTFOLIO_MAX_BYTES = 20 * 1024 * 1024  # 20 MB
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

# Rate limit: 10 submissions per 60 s per client IP (matches ERPNext web form)
_RATE_WINDOW = 60
_RATE_MAX = 10
_rate_store: dict[str, list[float]] = defaultdict(list)
_rate_lock = Lock()

log = get_logger(__name__)
router = APIRouter()


# ── helpers ───────────────────────────────────────────────────────────────────

def _check_rate_limit(ip: str) -> bool:
    """Sliding-window rate limiter. Returns False when the IP is over limit."""
    now = time.monotonic()
    with _rate_lock:
        timestamps = [t for t in _rate_store[ip] if now - t < _RATE_WINDOW]
        if len(timestamps) >= _RATE_MAX:
            return False
        timestamps.append(now)
        _rate_store[ip] = timestamps
    return True


async def _upload_file(
    client: ERPNextClient,
    content: bytes,
    filename: str,
    content_type: str | None,
    doctype: str,
    docname: str,
) -> bool:
    """Upload pre-read bytes to ERPNext asynchronously. Returns True on success."""
    async with httpx.AsyncClient(timeout=60) as hc:
        resp = await hc.post(
            client.url + "/api/method/upload_file",
            files={"file": (filename, content, content_type or "application/octet-stream")},
            data={"is_private": "1", "doctype": doctype, "docname": docname, "folder": "Home/Attachments"},
            headers=client._auth_headers,
        )
    if resp.status_code not in (200, 201):
        log.warning("file_upload_failed", filename=filename, status=resp.status_code)
        return False
    return True


# ── endpoints ─────────────────────────────────────────────────────────────────

@router.get("/jobs")
def list_jobs():
    """Return open Job Openings (public, no auth)."""
    client = ERPNextClient()
    result = client._get("/api/resource/Job Opening", params={
        "filters": '[["status","=","Open"]]',
        "fields": '["name","job_title","description","location","closes_on","designation","custom_application_level"]',
        "limit_page_length": 50,
    })
    return {"data": result.get("data", [])}


@router.post("/jobs/apply")
async def apply_for_job(
    request: Request,
    applicant_name: str = Form(...),
    email_id: str = Form(...),
    job_title: str = Form(...),
    phone_number: Optional[str] = Form(None),
    custom_city: Optional[str] = Form(None),
    cover_letter: Optional[str] = Form(None),
    custom_education_degree: Optional[str] = Form(None),
    custom_education_institution: Optional[str] = Form(None),
    custom_education_graduation_year: Optional[int] = Form(None),
    custom_work_experience: Optional[str] = Form(None),
    custom_linkedin_url: Optional[str] = Form(None),
    lower_range: Optional[float] = Form(None),
    cv_file: UploadFile = File(...),
    portfolio_file: Optional[UploadFile] = File(None),
):
    """Create a Job Applicant from a public form submission."""

    # Rate limit (matches ERPNext web form: 10 req / 60 s per IP)
    client_ip = request.client.host if request.client else "unknown"
    if not _check_rate_limit(client_ip):
        raise HTTPException(
            status_code=429,
            detail="Too many requests. Please wait a moment before trying again.",
        )

    # Validate email
    if not _EMAIL_RE.match(email_id):
        raise HTTPException(status_code=422, detail="Invalid email address.")

    # Validate CV
    cv_ext = os.path.splitext(cv_file.filename or "")[1].lower()
    if cv_ext not in _ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=422, detail="CV must be a PDF, DOC, or DOCX file.")
    cv_content = await cv_file.read()
    if len(cv_content) > _CV_MAX_BYTES:
        raise HTTPException(status_code=422, detail="CV file must be under 10 MB.")

    # Validate portfolio (if provided)
    portfolio_content = None
    if portfolio_file and portfolio_file.filename:
        port_ext = os.path.splitext(portfolio_file.filename)[1].lower()
        if port_ext not in _ALLOWED_EXTENSIONS:
            raise HTTPException(status_code=422, detail="Portfolio must be a PDF, DOC, or DOCX file.")
        portfolio_content = await portfolio_file.read()
        if len(portfolio_content) > _PORTFOLIO_MAX_BYTES:
            raise HTTPException(status_code=422, detail="Portfolio file must be under 20 MB.")

    client = ERPNextClient()

    # Build applicant doc — only non-empty optional fields
    doc: dict = {
        "applicant_name": applicant_name,
        "email_id": email_id,
        "job_title": job_title,
        "status": "Open",
        "custom_recruiting_stage": "Screening",
    }
    if phone_number:                        doc["phone_number"] = phone_number
    if custom_city:                         doc["custom_city"] = custom_city
    if cover_letter:                        doc["cover_letter"] = cover_letter
    if custom_education_degree:             doc["custom_education_degree"] = custom_education_degree
    if custom_education_institution:        doc["custom_education_institution"] = custom_education_institution
    if custom_education_graduation_year:    doc["custom_education_graduation_year"] = custom_education_graduation_year
    if custom_work_experience:              doc["custom_work_experience"] = custom_work_experience
    if custom_linkedin_url:                 doc["custom_linkedin_url"] = custom_linkedin_url
    if lower_range:                         doc["lower_range"] = lower_range

    try:
        applicant = client._post("/api/resource/Job Applicant", doc)
        applicant_docname = applicant["data"]["name"]
    except Exception as e:
        log.error("create_applicant_failed", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to submit application. Please try again.")

    # Upload CV — required; roll back if it fails
    cv_ok = await _upload_file(client, cv_content, cv_file.filename, cv_file.content_type, "Job Applicant", applicant_docname)
    if not cv_ok:
        log.error("cv_upload_failed", applicant=applicant_docname)
        try:
            client._delete(f"/api/resource/Job Applicant/{applicant_docname}")
        except Exception:
            pass
        raise HTTPException(status_code=500, detail="CV upload failed. Please try again.")

    # Upload portfolio (optional — failure is non-fatal)
    if portfolio_content is not None:
        await _upload_file(client, portfolio_content, portfolio_file.filename, portfolio_file.content_type, "Job Applicant", applicant_docname)

    log.info("applicant_created", name=applicant_docname, job=job_title, ip=client_ip)
    return {"success": True, "name": applicant_docname}
