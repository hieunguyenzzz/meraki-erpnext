"""Create WFH Approved and WFH Rejected email notifications for Attendance Request."""

APPROVED_MESSAGE = (
    "<p>Your work-from-home request has been approved.</p>"
    '<table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse;">'
    "<tr><td><strong>From Date</strong></td><td>{{ doc.from_date }}</td></tr>"
    "<tr><td><strong>To Date</strong></td><td>{{ doc.to_date }}</td></tr>"
    "<tr><td><strong>Notes</strong></td><td>{{ doc.explanation or \"N/A\" }}</td></tr>"
    "</table>"
)

REJECTED_MESSAGE = (
    "<p>Your work-from-home request was not approved. "
    "Please speak with your manager if you have questions.</p>"
    '<table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse;">'
    "<tr><td><strong>From Date</strong></td><td>{{ doc.from_date }}</td></tr>"
    "<tr><td><strong>To Date</strong></td><td>{{ doc.to_date }}</td></tr>"
    "<tr><td><strong>Notes</strong></td><td>{{ doc.explanation or \"N/A\" }}</td></tr>"
    "</table>"
)

NOTIFICATIONS = [
    {
        "name": "WFH Approved",
        "document_type": "Attendance Request",
        "event": "Submit",
        "enabled": 1,
        "channel": "Email",
        "condition": 'doc.reason == "Work From Home" and doc.custom_status == "Approved"',
        "subject": "Your WFH request has been approved",
        "message": APPROVED_MESSAGE,
        "recipients": [{"receiver_by_document_field": "custom_employee_user_id"}],
    },
    {
        "name": "WFH Rejected",
        "document_type": "Attendance Request",
        "event": "Submit",
        "enabled": 1,
        "channel": "Email",
        "condition": 'doc.reason == "Work From Home" and doc.custom_status == "Rejected"',
        "subject": "Your WFH request was not approved",
        "message": REJECTED_MESSAGE,
        "recipients": [{"receiver_by_document_field": "custom_employee_user_id"}],
    },
]


def run(client):
    """Create or update WFH Approved and WFH Rejected Notification docs (idempotent)."""
    for notif in NOTIFICATIONS:
        name = notif["name"]
        existing = client.get("Notification", name)
        if existing:
            client.update("Notification", name, notif)
            print(f"  Updated Notification: {name}")
        else:
            client.create("Notification", notif)
            print(f"  Created Notification: {name}")
