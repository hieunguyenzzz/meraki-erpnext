"""Add custom_probation_end_date Date field on Employee (for mid-month probation split)."""


def run(client):
    fieldname = "custom_probation_end_date"
    if client.exists("Custom Field", {"dt": "Employee", "fieldname": fieldname}):
        print(f"  Custom Field '{fieldname}' on Employee already exists, skipping")
    else:
        client.create_custom_field({
            "dt": "Employee",
            "fieldname": fieldname,
            "fieldtype": "Date",
            "label": "Probation End Date",
            "insert_after": "custom_is_probation",
        })
        print(f"  Created Custom Field: {fieldname} on Employee")
