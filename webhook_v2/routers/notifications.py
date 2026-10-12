"""PWA Notification management endpoints."""

import json

from fastapi import APIRouter, Depends, HTTPException, Request
from webhook_v2.services.erpnext import ERPNextClient
from webhook_v2.core.logging import get_logger
from webhook_v2.auth import get_current_user, require_roles, DIRECTOR

log = get_logger(__name__)
router = APIRouter()


@router.post("/notification/{name}/read")
def mark_notification_read(name: str, request: Request):
    """Mark a PWA Notification as read — only the notification's own recipient may."""
    session_user = get_current_user(request)
    client = ERPNextClient()
    try:
        notif = client._get(f"/api/resource/PWA Notification/{name}").get("data", {})
    except Exception:
        notif = None
    if not notif or notif.get("to_user") != session_user:
        raise HTTPException(status_code=404, detail="Notification not found")
    try:
        client._post("/api/method/frappe.client.set_value", {
            "doctype": "PWA Notification",
            "name": name,
            "fieldname": "read",
            "value": 1,
        })
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    log.info("notification_read", name=name)
    return {"success": True}


@router.post("/notification/read-all", dependencies=[Depends(require_roles(*DIRECTOR))])
def mark_all_notifications_read(user: str):
    """Mark all unread PWA Notifications as read for a given user."""
    client = ERPNextClient()
    try:
        client._post("/api/method/frappe.db.sql", {
            "query": "UPDATE `tabPWA Notification` SET `read`=1 WHERE to_user=%(user)s AND `read`=0",
            "values": {"user": user},
            "as_dict": 0,
        })
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    log.info("notifications_read_all", user=user)
    return {"success": True}


BULK_CHUNK = 100


@router.post("/notifications/read-all")
def mark_own_notifications_read(request: Request, doc_type: str | None = None):
    """Mark the caller's own unread notifications as read, optionally only one reference type."""
    user = get_current_user(request)
    filters = {"to_user": user, "read": 0}
    if doc_type:
        filters["reference_document_type"] = doc_type

    client = ERPNextClient()
    try:
        rows = client._get("/api/resource/PWA Notification", {
            "filters": json.dumps(filters),
            "fields": json.dumps(["name"]),
            "limit_page_length": 0,
        }).get("data", [])
        names = [r["name"] for r in rows]
        failed = 0
        for i in range(0, len(names), BULK_CHUNK):
            docs = [
                {"doctype": "PWA Notification", "docname": n, "read": 1}
                for n in names[i:i + BULK_CHUNK]
            ]
            result = client._post("/api/method/frappe.client.bulk_update", {"docs": json.dumps(docs)})
            failed += len((result.get("message") or {}).get("failed_docs") or [])
    except Exception as e:
        log.error("notifications_read_all_failed", user=user, doc_type=doc_type, error=str(e))
        raise HTTPException(status_code=400, detail=str(e))

    marked = len(names) - failed
    log.info("notifications_read_all", user=user, doc_type=doc_type, count=marked, failed=failed)
    if failed:
        raise HTTPException(status_code=500, detail=f"{failed} of {len(names)} notifications could not be marked read")
    return {"success": True, "marked": marked}
