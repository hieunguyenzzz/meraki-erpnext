"""
Job applicant management endpoints.

POST /applicants/batch-stage — update recruiting stage for multiple applicants
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from webhook_v2.services.erpnext import ERPNextClient
from webhook_v2.core.logging import get_logger

log = get_logger(__name__)
router = APIRouter()


class BatchStageRequest(BaseModel):
    applicant_names: list[str]
    stage: str


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
