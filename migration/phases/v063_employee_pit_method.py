"""Add custom_pit_method (Select) on Employee for per-employee tax calculation."""


def run(client):
    fieldname = "custom_pit_method"
    if client.exists("Custom Field", {"dt": "Employee", "fieldname": fieldname}):
        print(f"  Custom Field '{fieldname}' on Employee already exists, skipping")
    else:
        client.create_custom_field({
            "dt": "Employee",
            "fieldname": fieldname,
            "fieldtype": "Select",
            "label": "PIT Method",
            "options": "\nFlat 10%",
            "insert_after": "custom_number_of_dependents",
            "description": "Empty = Progressive (brackets + deductions). Flat 10% = freelancer rate on gross.",
        })
        print(f"  Created Custom Field: {fieldname} on Employee")

    # Set Tu Anh to Flat 10%
    emps = client.get_list("Employee",
        filters=[["employee_name", "like", "%Tu Anh%"]],
        fields=["name", "employee_name"],
        limit=10,
    )

    if not emps:
        emps = client.get_list("Employee",
            filters=[["employee_name", "like", "%Anh Tu%"]],
            fields=["name", "employee_name"],
            limit=10,
        )

    for emp in emps:
        try:
            client.update("Employee", emp["name"], {"custom_pit_method": "Flat 10%"})
            print(f"  Set {emp['employee_name']} ({emp['name']}) to Flat 10% PIT")
        except Exception as e:
            print(f"  WARNING: Could not set PIT method for {emp['name']}: {e}")
