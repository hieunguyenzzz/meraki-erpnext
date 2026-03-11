"""
Public job endpoints.

GET  /jobs           — list open Job Openings (no auth required)
POST /jobs/apply     — submit a job application (no auth required)
"""

from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from typing import Optional
import requests

from webhook_v2.services.erpnext import ERPNextClient
from webhook_v2.core.logging import get_logger

log = get_logger(__name__)
router = APIRouter()


@router.get("/jobs")
def list_jobs():
    """Return open Job Openings."""
    client = ERPNextClient()
    result = client._get("/api/resource/Job Opening", params={
        "filters": '[["status","=","Open"]]',
        "fields": '["name","job_title","description","location","closes_on","posted_on","designation","custom_application_level"]',
        "limit_page_length": 50,
    })
    return {"data": result.get("data", [])}


@router.post("/jobs/apply")
async def apply_for_job(
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
    """Create a Job Applicant from public form submission."""
    client = ERPNextClient()

    doc = {
        "applicant_name": applicant_name,
        "email_id": email_id,
        "job_title": job_title,
        "status": "Open",
        "custom_recruiting_stage": "Screening",
    }
    if phone_number:
        doc["phone_number"] = phone_number
    if custom_city:
        doc["custom_city"] = custom_city
    if cover_letter:
        doc["cover_letter"] = cover_letter
    if custom_education_degree:
        doc["custom_education_degree"] = custom_education_degree
    if custom_education_institution:
        doc["custom_education_institution"] = custom_education_institution
    if custom_education_graduation_year:
        doc["custom_education_graduation_year"] = custom_education_graduation_year
    if custom_work_experience:
        doc["custom_work_experience"] = custom_work_experience
    if custom_linkedin_url:
        doc["custom_linkedin_url"] = custom_linkedin_url
    if lower_range:
        doc["lower_range"] = lower_range

    try:
        applicant = client._post("/api/resource/Job Applicant", doc)
        applicant_docname = applicant["data"]["name"]
    except Exception as e:
        log.error("create_applicant_failed", error=str(e))
        raise HTTPException(status_code=500, detail=f"Failed to create applicant: {e}")

    await _upload_file(client, cv_file, "Job Applicant", applicant_docname)

    if portfolio_file and portfolio_file.filename:
        await _upload_file(client, portfolio_file, "Job Applicant", applicant_docname)

    log.info("applicant_created", name=applicant_docname, job=job_title)
    return {"success": True, "name": applicant_docname}


async def _upload_file(client: ERPNextClient, upload_file: UploadFile, doctype: str, docname: str):
    """Upload a file attachment to an ERPNext document."""
    content = await upload_file.read()
    resp = requests.post(
        client.url + "/api/method/upload_file",
        files={"file": (upload_file.filename, content, upload_file.content_type or "application/octet-stream")},
        data={"is_private": 1, "doctype": doctype, "docname": docname, "folder": "Home/Attachments"},
        headers={k: v for k, v in client._auth_headers.items() if k != "Content-Type"},
        timeout=60,
    )
    if resp.status_code not in (200, 201):
        log.warning("file_upload_failed", filename=upload_file.filename, status=resp.status_code)
