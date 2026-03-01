from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from webhook_v2.services.erpnext import ERPNextClient
from webhook_v2.core.logging import get_logger

log = get_logger(__name__)
router = APIRouter()


class TestNotificationRequest(BaseModel):
    notification_name: str
    recipient_email: str


@router.post("/test-notification")
async def send_test_notification(request: TestNotificationRequest):
    client = ERPNextClient()

    try:
        data = client._get(f"/api/resource/Notification/{request.notification_name}")
        notif = data.get("data", {})
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Notification not found: {e}")

    subject = notif.get("subject", "(no subject)")
    message = notif.get("message", "")

    test_banner = (
        '<div style="background:#fff3cd;border-left:4px solid #ffc107;padding:10px 14px;'
        'margin-bottom:16px;font-family:sans-serif;font-size:13px;">'
        '<strong>TEST EMAIL PREVIEW</strong> \u2014 Template variables (e.g. '
        '<code>{{ doc.employee_name }}</code>) are shown as-is and will be replaced '
        'with real values when triggered automatically.'
        '</div>'
    )

    try:
        client._post("/api/resource/Communication", {
            "communication_type": "Communication",
            "communication_medium": "Email",
            "subject": f"[TEST] {subject}",
            "content": test_banner + message,
            "sent_or_received": "Sent",
            "send_email": 1,
            "recipients": request.recipient_email,
            "reference_doctype": "Notification",
            "reference_name": request.notification_name,
        })
    except Exception as e:
        log.error("test_notification_failed", notification=request.notification_name, error=str(e))
        raise HTTPException(status_code=500, detail=f"Failed to send: {e}")

    log.info("test_notification_sent", notification=request.notification_name, recipient=request.recipient_email)
    return {"status": "ok", "recipient": request.recipient_email}
