"""Add custom_status and custom_employee_user_id fields to Attendance Request."""


def run(client):
    """Create custom_status and custom_employee_user_id on Attendance Request (idempotent)."""
    if client.exists("Custom Field", {"dt": "Attendance Request", "fieldname": "custom_status"}):
        print("  Custom Field 'custom_status' on Attendance Request already exists, skipping")
    else:
        result = client.create_custom_field({
            "dt": "Attendance Request",
            "fieldname": "custom_status",
            "fieldtype": "Select",
            "label": "Status",
            "options": "Pending\nApproved\nRejected",
            "default": "Pending",
            "insert_after": "explanation",
            "allow_on_submit": 1,
        })
        if not result:
            raise Exception("Failed to create custom_status on Attendance Request")
        print("  Created Custom Field: custom_status on Attendance Request")

    if client.exists("Custom Field", {"dt": "Attendance Request", "fieldname": "custom_employee_user_id"}):
        print("  Custom Field 'custom_employee_user_id' on Attendance Request already exists, skipping")
    else:
        result = client.create_custom_field({
            "dt": "Attendance Request",
            "fieldname": "custom_employee_user_id",
            "fieldtype": "Link",
            "options": "User",
            "label": "Employee User",
            "fetch_from": "employee.user_id",
            "read_only": 1,
            "hidden": 1,
            "insert_after": "custom_status",
        })
        if not result:
            raise Exception("Failed to create custom_employee_user_id on Attendance Request")
        print("  Created Custom Field: custom_employee_user_id on Attendance Request")
