"""Add custom_expense_staff Link field on Purchase Invoice to track which staff member incurred the expense."""


def run(client):
    """Create custom_expense_staff field on Purchase Invoice if it doesn't exist."""
    if client.exists("Custom Field", {"dt": "Purchase Invoice", "fieldname": "custom_expense_staff"}):
        print("  Custom Field 'custom_expense_staff' on Purchase Invoice already exists, skipping")
        return

    client.create_custom_field({
        "dt": "Purchase Invoice",
        "fieldname": "custom_expense_staff",
        "fieldtype": "Link",
        "options": "Employee",
        "label": "Expense Staff",
        "insert_after": "custom_rejected",
        "hidden": 1,
        "read_only": 1,
    })
    print("  Created Custom Field: custom_expense_staff on Purchase Invoice")
