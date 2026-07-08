"""Re-point the leave-submission notification to HR staff (thanhkhuu).

Background: v086 disabled "Leave Application Submitted for Approval" because
its recipient (`leave_approver`) duplicated the HRMS built-in leave email that
already goes to the approver. Side effect: HR staff who are NOT the approver
(thanhkhuu) stopped receiving ANY leave-request email, while WFH requests still
reach them (the "WFH Request Submitted" notification CCs HR directly).

Fix (mirrors WFH's cc-only pattern): re-enable this notification and change its
recipient from the `leave_approver` field to CC thanhkhuu only. The approver
(xuanhoang) stays covered by the HRMS built-in "Leave Approval Notification",
so no duplicate. Idempotent: create-or-update with the full definition.
"""

NOTIFICATION_NAME = "Leave Application Submitted for Approval"

MESSAGE = (
    "<h3>New Leave Request</h3>"
    "<p>{{ doc.employee_name }} has submitted a leave request:</p>"
    '<table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse;">'
    "<tr><td><strong>Leave Type</strong></td><td>{{ doc.leave_type }}</td></tr>"
    "<tr><td><strong>From Date</strong></td><td>{{ doc.from_date }}</td></tr>"
    "<tr><td><strong>To Date</strong></td><td>{{ doc.to_date }}</td></tr>"
    "<tr><td><strong>Total Days</strong></td><td>{{ doc.total_leave_days }}</td></tr>"
    "<tr><td><strong>Reason</strong></td><td>{{ doc.description or \"N/A\" }}</td></tr>"
    "</table>"
    "<p>Please review and approve/reject in ERPNext.</p>"
)

NOTIFICATION = {
    "name": NOTIFICATION_NAME,
    "document_type": "Leave Application",
    "event": "New",
    "enabled": 1,
    "channel": "Email",
    "subject": "Leave Request from {{ doc.employee_name }}",
    "message": MESSAGE,
    "recipients": [{"cc": "thanhkhuu@merakiwp.com"}],
}


def run(client):
    existing = client.get("Notification", NOTIFICATION_NAME)
    if existing:
        client.update("Notification", NOTIFICATION_NAME, NOTIFICATION)
        print(f"  Updated Notification: {NOTIFICATION_NAME}")
    else:
        client.create("Notification", NOTIFICATION)
        print(f"  Created Notification: {NOTIFICATION_NAME}")
