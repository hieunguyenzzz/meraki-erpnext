"""
Job applicant management endpoints.

GET  /applicants/available-tags       — list all tags used on Job Applicant doctype
GET  /applicants/{name}/tags          — get tags for a specific applicant
POST /applicants/{name}/tags          — add a tag to an applicant
DELETE /applicants/{name}/tags        — remove a tag from an applicant
POST /applicants/batch-stage          — update recruiting stage for multiple applicants
POST /applicants/{name}/comment       — add comment with @mention → Communication + email
"""

import re
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


class CommentRequest(BaseModel):
    content: str  # raw HTML with <span class="mention" data-id="email"> tags


@router.get("/applicants/available-tags")
def get_available_tags():
    """Get all tags used on Job Applicant doctype."""
    client = ERPNextClient()
    result = client._get("/api/method/frappe.desk.doctype.tag.tag.get_tags", params={"doctype": "Job Applicant", "txt": ""})
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
    client._post("/api/method/frappe.desk.doctype.tag.tag.add_tag", {"dt": "Job Applicant", "dn": name, "tag": req.tag})
    return {"ok": True}


@router.delete("/applicants/{name}/tags")
def remove_applicant_tag(name: str, tag: str = Query(...)):
    """Remove a tag from a Job Applicant."""
    client = ERPNextClient()
    client._post("/api/method/frappe.desk.doctype.tag.tag.remove_tag", {"dt": "Job Applicant", "dn": name, "tag": tag})
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


def _extract_mentions(html: str) -> list[dict]:
    """Extract mentioned user emails and display names from Frappe mention HTML."""
    pattern = r'<span class="mention"[^>]*data-id="([^"]+)"[^>]*data-value="([^"]+)"'
    return [{"email": m[0], "display": m[1]} for m in re.findall(pattern, html)]


@router.post("/applicants/{name}/comment")
def add_applicant_comment(name: str, req: CommentRequest):
    """
    Add a comment to a Job Applicant and create Communications for @mentions.

    1. Creates a Comment doc (triggers Frappe's notify_mentions for Notification Log)
    2. For each @mention, creates a Communication doc (shows in timeline + sends email)
    """
    client = ERPNextClient()

    # 1. Create the Comment
    client._post("/api/resource/Comment", {
        "reference_doctype": "Job Applicant",
        "reference_name": name,
        "comment_type": "Comment",
        "content": req.content,
    })

    # 2. Extract mentions and create Communications
    mentions = _extract_mentions(req.content)
    comms_created = 0

    if mentions:
        # Get applicant name for the subject line
        applicant = client._get(f"/api/resource/Job Applicant/{name}", params={
            "fields": '["applicant_name"]',
        })
        applicant_name = (applicant.get("data") or {}).get("applicant_name", name)

        for mention in mentions:
            try:
                client._post("/api/method/frappe.core.doctype.communication.email.make", {
                    "doctype": "Job Applicant",
                    "name": name,
                    "subject": f"You were mentioned in a comment on {applicant_name}",
                    "content": req.content,
                    "recipients": mention["email"],
                    "send_email": 1,
                    "communication_medium": "Email",
                    "sent_or_received": "Sent",
                })
                comms_created += 1
            except Exception as e:
                log.warning("mention_communication_failed", email=mention["email"], error=str(e))

            # Create PWA Notification (shows in React frontend bell icon)
            try:
                client._post("/api/resource/PWA Notification", {
                    "to_user": mention["email"],
                    "from_user": "Administrator",
                    "message": f"<b>{mention['display']}</b> you were mentioned in a comment on <b>{applicant_name}</b>",
                    "read": 0,
                    "reference_document_type": "Job Applicant",
                    "reference_document_name": name,
                })
            except Exception as e:
                log.warning("mention_pwa_notification_failed", email=mention["email"], error=str(e))

    log.info("applicant_comment_created", applicant=name, mentions=len(mentions), communications=comms_created)
    return {"ok": True, "mentions": len(mentions), "communications": comms_created}
