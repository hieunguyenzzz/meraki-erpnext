"""Add custom_number_of_dependents field on Employee for PIT calculation display."""


def run(client):
    existing = client.get_list(
        "Custom Field",
        filters={"dt": "Employee", "fieldname": "custom_number_of_dependents"},
        fields=["name"],
        limit=1,
    )
    if not existing:
        client.create("Custom Field", {
            "dt": "Employee",
            "fieldname": "custom_number_of_dependents",
            "fieldtype": "Int",
            "label": "Number of Dependents (PIT)",
            "insert_after": "custom_insurance_salary",
            "default": "0",
            "description": "Number of registered tax dependents for PIT deduction calculation",
        })
        print("  Created Employee.custom_number_of_dependents")
    else:
        print("  Already exists: Employee.custom_number_of_dependents (skip)")

    # Update Server Script to include new field in ALLOWED_FIELDS
    script_name = "meraki-set-employee-fields"
    existing_script = client.get("Server Script", script_name)
    if existing_script:
        old_body = existing_script.get("script", "")
        if "custom_number_of_dependents" not in old_body:
            new_body = old_body.replace(
                '"custom_display_order",',
                '"custom_display_order",\n    "custom_number_of_dependents",',
            )
            client.update("Server Script", script_name, {
                "script": new_body,
                "disabled": 0,
            })
            print("  Updated Server Script ALLOWED_FIELDS with custom_number_of_dependents")
        else:
            print("  Server Script already has custom_number_of_dependents (skip)")
