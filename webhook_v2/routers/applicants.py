"""
Job applicant management endpoints.

GET  /applicants/available-tags       — list all tags used on Job Applicant doctype
GET  /applicants/{name}/tags          — get tags for a specific applicant
POST /applicants/{name}/tags          — add a tag to an applicant
DELETE /applicants/{name}/tags        — remove a tag from an applicant
POST /applicants/batch-stage          — update recruiting stage for multiple applicants
"""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from webhook_v2.services.erpnext import ERPNextClient
from webhook_v2.core.logging import get_logger

log = get_logger(__name__)
router = APIRouter()


class TagRequest(BaseModel):
    tag: str


class BatchStageRequest(BaseModel):
    applicant_names: list[str]
    stage: str


@router.get("/applicants/available-tags")
def get_available_tags():
    """Get all tags used on Job Applicant doctype."""
    client = ERPNextClient()
    result = client._get("/api/method/frappe.desk.tags.get_tags", params={"doctype": "Job Applicant", "txt": ""})
    tags = result.get("message", []) if isinstance(result, dict) else []
    return {"tags": tags}


@router.get("/applicants/{name}/tags")
def get_applicant_tags(name: str):
    """Get tags for a specific Job Applicant."""
    client = ERPNextClient()
    result = client._get(f"/api/resource/Job Applicant/{name}", params={"fields": '["_user_tags"]'})
    raw = (result.get("data") or {}).get("_user_tags") or ""
    tags = [t.strip() for t in raw.split(",") if t.strip()]
    return {"tags": tags}


@router.post("/applicants/{name}/tags")
def add_applicant_tag(name: str, req: TagRequest):
    """Add a tag to a Job Applicant."""
    client = ERPNextClient()
    client._post("/api/method/frappe.desk.tags.add_tag", {"dt": "Job Applicant", "dn": name, "tag": req.tag})
    return {"ok": True}


@router.delete("/applicants/{name}/tags")
def remove_applicant_tag(name: str, tag: str = Query(...)):
    """Remove a tag from a Job Applicant."""
    client = ERPNextClient()
    client._post("/api/method/frappe.desk.tags.remove_tag", {"dt": "Job Applicant", "dn": name, "tag": tag})
    return {"ok": True}


@router.post("/applicants/batch-stage")
def batch_update_stage(req: BatchStageRequest):
    """
    Update custom_recruiting_stage for multiple Job Applicants.
    Loops frappe.client.set_value for each applicant ID.
    Returns {updated: int}
    """
    client = ERPNextClient()
    updated = 0
    errors: list[str] = []

    for name in req.applicant_names:
        try:
            client._post("/api/method/frappe.client.set_value", {
                "doctype": "Job Applicant",
                "name": name,
                "fieldname": "custom_recruiting_stage",
                "value": req.stage,
            })
            updated += 1
        except Exception as e:
            errors.append(f"{name}: {e}")

    if errors:
        log.warning("batch_stage_partial_failure", errors=errors)

    log.info("batch_stage_updated", count=updated, stage=req.stage)
    return {"updated": updated, "errors": errors}
