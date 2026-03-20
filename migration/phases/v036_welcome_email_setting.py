"""Add custom field on HR Settings for welcome email toggle + default Email Template."""


def run(client):
    # 1. Add custom field on HR Settings
    existing = client.get_list(
        "Custom Field",
        filters={"dt": "HR Settings", "fieldname": "custom_send_welcome_email_on_invite"},
        fields=["name"],
        limit=1,
    )
    if not existing:
        client.create("Custom Field", {
            "dt": "HR Settings",
            "fieldname": "custom_send_welcome_email_on_invite",
            "fieldtype": "Check",
            "label": "Send Welcome Email on Staff Invite",
            "insert_after": "send_leave_notification",
            "default": "0",
        })

    # 2. Create default Email Template for welcome email (if not exists)
    existing_tpl = client.get_list(
        "Email Template",
        filters={"name": "Welcome New Staff"},
        fields=["name"],
        limit=1,
    )
    if not existing_tpl:
        client.create("Email Template", {
            "name": "Welcome New Staff",
            "subject": "Welcome to Meraki Wedding Planner",
            "response": (
                "<p>Hi {{ first_name }},</p>"
                "<p>Welcome to Meraki Wedding Planner! Your account has been created.</p>"
                "<p>Please click the link below to set your password and get started:</p>"
                "<p><a href=\"{{ link }}\">Complete Registration</a></p>"
                "<p>Your login email: <strong>{{ user }}</strong></p>"
                "<p>Best regards,<br>Meraki Wedding Planner</p>"
            ),
            "use_html": 1,
        })

    # 3. Set as welcome_email_template in System Settings (if not already set)
    sys_settings = client.get("System Settings", "System Settings")
    if not sys_settings.get("welcome_email_template"):
        client.update("System Settings", "System Settings", {
            "welcome_email_template": "Welcome New Staff",
        })
