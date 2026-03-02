"""
Leave application and WFH (Attendance Request) approve/reject endpoints.

POST /leave/{leave_id}/approve    — set status=Approved + submit
POST /leave/{leave_id}/reject     — set status=Rejected + submit
POST /wfh/{req_id}/approve        — submit Attendance Request
POST /wfh/{req_id}/reject         — set workflow_state=Rejected + submit
"""

from fastapi import APIRouter, HTTPException
from webhook_v2.services.erpnext import ERPNextClient
from webhook_v2.core.logging import get_logger

log = get_logger(__name__)
router = APIRouter()


def _submit_doc(client: ERPNextClient, doctype: str, name: str) -> None:
    """Fetch full doc and submit."""
    full_doc = client._get(f"/api/resource/{doctype}/{name}").get("data", {})
    client._post("/api/method/frappe.client.submit", {"doc": full_doc})


@router.post("/leave/{leave_id}/approve")
def approve_leave(leave_id: str):
    """Set Leave Application status to Approved and submit."""
    client = ERPNextClient()
    try:
        client._post("/api/method/frappe.client.set_value", {
            "doctype": "Leave Application",
            "name": leave_id,
            "fieldname": "status",
            "value": "Approved",
        })
        _submit_doc(client, "Leave Application", leave_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to approve leave: {e}")

    log.info("leave_approved", leave=leave_id)
    return {"success": True}


@router.post("/leave/{leave_id}/reject")
def reject_leave(leave_id: str):
    """Set Leave Application status to Rejected and submit."""
    client = ERPNextClient()
    try:
        client._post("/api/method/frappe.client.set_value", {
            "doctype": "Leave Application",
            "name": leave_id,
            "fieldname": "status",
            "value": "Rejected",
        })
        _submit_doc(client, "Leave Application", leave_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to reject leave: {e}")

    log.info("leave_rejected", leave=leave_id)
    return {"success": True}


@router.post("/wfh/{req_id}/approve")
def approve_wfh(req_id: str):
    """Submit Attendance Request (approve WFH)."""
    client = ERPNextClient()
    try:
        _submit_doc(client, "Attendance Request", req_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to approve WFH request: {e}")

    log.info("wfh_approved", request=req_id)
    return {"success": True}


@router.post("/wfh/{req_id}/reject")
def reject_wfh(req_id: str):
    """Set Attendance Request workflow_state to Rejected and submit."""
    client = ERPNextClient()
    try:
        client._post("/api/method/frappe.client.set_value", {
            "doctype": "Attendance Request",
            "name": req_id,
            "fieldname": "workflow_state",
            "value": "Rejected",
        })
        _submit_doc(client, "Attendance Request", req_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to reject WFH request: {e}")

    log.info("wfh_rejected", request=req_id)
    return {"success": True}
