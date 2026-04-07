"""Add custom_is_probation checkbox on Employee."""


def run(client):
    fieldname = "custom_is_probation"
    if client.exists("Custom Field", {"dt": "Employee", "fieldname": fieldname}):
        print(f"  Custom Field '{fieldname}' on Employee already exists, skipping")
    else:
        client.create_custom_field({
            "dt": "Employee",
            "fieldname": fieldname,
            "fieldtype": "Check",
            "label": "Probation",
            "insert_after": "status",
            "default": "0",
        })
        print(f"  Created Custom Field: {fieldname} on Employee")
