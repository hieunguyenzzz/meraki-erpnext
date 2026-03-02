import urllib.request
import urllib.error
import json
import os

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from webhook_v2.services.erpnext import ERPNextClient
from webhook_v2.core.logging import get_logger

log = get_logger(__name__)
router = APIRouter()

SENDGRID_API_KEY = os.environ.get("SENDGRID_API_KEY", "")
FROM_EMAIL = "contact@merakiweddingplanner.com"
FROM_NAME = "Meraki Wedding Planner"


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

    payload = json.dumps({
        "personalizations": [{"to": [{"email": request.recipient_email}]}],
        "from": {"email": FROM_EMAIL, "name": FROM_NAME},
        "subject": f"[TEST] {subject}",
        "content": [{"type": "text/html", "value": test_banner + message}],
    }).encode()

    req = urllib.request.Request(
        "https://api.sendgrid.com/v3/mail/send",
        data=payload,
        headers={
            "Authorization": f"Bearer {SENDGRID_API_KEY}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req) as resp:
            status_code = resp.status
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        log.error("test_notification_failed", notification=request.notification_name, error=body)
        raise HTTPException(status_code=500, detail=f"SendGrid error: {body}")
    except Exception as e:
        log.error("test_notification_failed", notification=request.notification_name, error=str(e))
        raise HTTPException(status_code=500, detail=f"Failed to send: {e}")

    log.info("test_notification_sent", notification=request.notification_name, recipient=request.recipient_email, sg_status=status_code)
    return {"status": "ok", "recipient": request.recipient_email}
