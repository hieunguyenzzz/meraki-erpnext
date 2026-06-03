"""PWA Notification management endpoints."""

from fastapi import APIRouter, HTTPException
from webhook_v2.services.erpnext import ERPNextClient
from webhook_v2.core.logging import get_logger

log = get_logger(__name__)
router = APIRouter()


@router.post("/notification/{name}/read")
def mark_notification_read(name: str):
    """Mark a PWA Notification as read."""
    client = ERPNextClient()
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


@router.post("/notification/read-all")
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
