"""
v071: Ensure Meraki Review Criterion doctype exists.

The doctype is created by v070, but this phase is kept as an idempotent guard
so the migration sequence remains intact for environments where v070 ran before
the ordering fix.
"""


def run(client):
    if not client.exists("DocType", {"name": "Meraki Review Criterion"}):
        client.create("DocType", {
            "name": "Meraki Review Criterion",
            "module": "HR",
            "istable": 0,
            "custom": 1,
            "autoname": "field:criterion_name",
            "fields": [
                {
                    "fieldname": "criterion_name",
                    "fieldtype": "Data",
                    "label": "Criterion Name",
                    "reqd": 1,
                    "unique": 1,
                    "in_list_view": 1,
                },
                {
                    "fieldname": "sort_order",
                    "fieldtype": "Int",
                    "label": "Sort Order",
                    "default": "0",
                    "in_list_view": 1,
                },
                {
                    "fieldname": "active",
                    "fieldtype": "Check",
                    "label": "Active",
                    "default": "1",
                    "in_list_view": 1,
                },
            ],
            "permissions": [
                {"role": "System Manager", "read": 1, "write": 1, "create": 1, "delete": 1},
                {"role": "HR Manager", "read": 1, "write": 1, "create": 1, "delete": 1},
                {"role": "HR User", "read": 1, "write": 0, "create": 0, "delete": 0},
            ],
        })
        print("  Created DocType: Meraki Review Criterion")
    else:
        print("  DocType exists: Meraki Review Criterion")

    print("  v071 meraki review criterion doctype complete.")
