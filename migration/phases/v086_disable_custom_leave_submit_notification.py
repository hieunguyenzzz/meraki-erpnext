"""Disable the custom 'Leave Application Submitted for Approval' notification.

The approver received TWO emails per leave request:
  1. Custom Notification "Leave Application Submitted for Approval"
     (subject "Leave Request from {{ doc.employee_name }}") — branded.
  2. HRMS built-in leave approval notification, gated by
     HR Settings.send_leave_notification (subject "Leave Approval Notification").

We keep the built-in generic one (it also drives the employee's
approve/reject status email, so it must stay on) and disable this
custom duplicate. Idempotent: only acts when the notification exists
and is still enabled.
"""

NOTIFICATION_NAME = "Leave Application Submitted for Approval"


def run(client):
    existing = client.get("Notification", NOTIFICATION_NAME)
    if not existing:
        print(f"  Notification not found, nothing to disable: {NOTIFICATION_NAME}")
        return
    if existing.get("enabled") == 0:
        print(f"  Already disabled: {NOTIFICATION_NAME}")
        return
    result = client.update("Notification", NOTIFICATION_NAME, {"enabled": 0})
    if not result:
        raise Exception(f"Failed to disable Notification: {NOTIFICATION_NAME}")
    print(f"  Disabled Notification: {NOTIFICATION_NAME}")
