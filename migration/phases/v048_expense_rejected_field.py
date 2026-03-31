"""Add custom_rejected Check field on Purchase Invoice for expense rejection tracking."""


def run(client):
    """Create custom_rejected field on Purchase Invoice if it doesn't exist."""
    if client.exists("Custom Field", {"dt": "Purchase Invoice", "fieldname": "custom_rejected"}):
        print("  Custom Field 'custom_rejected' on Purchase Invoice already exists, skipping")
        return

    client.create_custom_field({
        "dt": "Purchase Invoice",
        "fieldname": "custom_rejected",
        "fieldtype": "Check",
        "label": "Rejected",
        "insert_after": "status",
        "default": "0",
        "hidden": 1,
        "read_only": 1,
    })
    print("  Created Custom Field: custom_rejected on Purchase Invoice")
