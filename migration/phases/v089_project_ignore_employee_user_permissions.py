"""Stop Project from being filtered by staff Employee User Permissions.

Background: Each staff User has a User Permission `allow="Employee",
for_value=<their own employee>, apply_to_all_doctypes=1`. This cascades to the
Project doctype through its Employee-link custom fields (custom_lead_planner,
custom_support_planner, custom_assistant_1..5, custom_sales_person), so
Project list/read gets filtered to rows referencing their employee.

Fix: set ignore_user_permissions=1 on every Link->Employee Custom Field on
Project. This does NOT touch the User Permission records themselves (HR
self-service still relies on them) and does NOT touch the `company` field.
"""


def run(client):
    fields = client.get_list(
        "Custom Field",
        filters={"dt": "Project", "fieldtype": "Link", "options": "Employee"},
        fields=["name", "fieldname", "ignore_user_permissions"],
    )

    if not fields:
        print("  No Link->Employee Custom Fields found on Project, nothing to do")
        return

    changed = []
    skipped = []
    for f in fields:
        if f.get("ignore_user_permissions") == 1:
            skipped.append(f["fieldname"])
            continue
        client.update("Custom Field", f["name"], {"ignore_user_permissions": 1})
        changed.append(f["fieldname"])
        print(f"  Set ignore_user_permissions=1 on Project.{f['fieldname']}")

    for fieldname in skipped:
        print(f"  Project.{fieldname} already has ignore_user_permissions=1, skipping")

    print(f"  Summary: {len(changed)} field(s) updated, {len(skipped)} already set")
