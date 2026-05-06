"""
v070: Extend Meraki Review for outcome recording.

Order matters: Meraki Review Criterion must exist before Meraki Review Rating
(which has a Link field pointing to it).

Creates:
- DocType: Meraki Review Criterion (reference list — no dependencies)
- DocType: Meraki Review Rating (child table — links to Criterion)
- Custom Fields on Meraki Review: period, reviewer, overall_score, average_rating, ratings
"""


def run(client):
    # 1. Reference DocType: Meraki Review Criterion (no dependencies — create first)
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

    # 2. Child DocType: Meraki Review Rating (links to Criterion — create after)
    if not client.exists("DocType", {"name": "Meraki Review Rating"}):
        client.create("DocType", {
            "name": "Meraki Review Rating",
            "module": "HR",
            "istable": 1,
            "editable_grid": 1,
            "custom": 1,
            "fields": [
                {
                    "fieldname": "criterion",
                    "fieldtype": "Link",
                    "label": "Criterion",
                    "options": "Meraki Review Criterion",
                    "reqd": 1,
                    "in_list_view": 1,
                    "columns": 4,
                },
                {
                    "fieldname": "score",
                    "fieldtype": "Int",
                    "label": "Score",
                    "reqd": 1,
                    "in_list_view": 1,
                    "columns": 2,
                },
            ],
            "permissions": [
                {"role": "System Manager", "read": 1, "write": 1, "create": 1, "delete": 1},
                {"role": "HR Manager", "read": 1, "write": 1, "create": 1, "delete": 1},
                {"role": "HR User", "read": 1, "write": 1, "create": 1, "delete": 1},
            ],
        })
        print("  Created DocType: Meraki Review Rating")
    else:
        print("  DocType exists: Meraki Review Rating")

    # 3. Custom Fields on Meraki Review
    custom_fields = [
        {
            "dt": "Meraki Review",
            "fieldname": "period",
            "fieldtype": "Data",
            "label": "Period",
            "insert_after": "review_date",
        },
        {
            "dt": "Meraki Review",
            "fieldname": "reviewer",
            "fieldtype": "Link",
            "label": "Reviewer",
            "options": "User",
            "insert_after": "period",
        },
        {
            "dt": "Meraki Review",
            "fieldname": "overall_score",
            "fieldtype": "Float",
            "label": "Overall Score (override)",
            "insert_after": "reviewer",
            "description": "Optional. If blank, the average of per-criterion scores is shown.",
        },
        {
            "dt": "Meraki Review",
            "fieldname": "average_rating",
            "fieldtype": "Float",
            "label": "Average Rating",
            "insert_after": "overall_score",
            "read_only": 1,
            "description": "Computed from criterion scores.",
        },
        {
            "dt": "Meraki Review",
            "fieldname": "ratings",
            "fieldtype": "Table",
            "label": "Ratings",
            "options": "Meraki Review Rating",
            "insert_after": "average_rating",
        },
    ]

    for cf in custom_fields:
        cf_name = f"Meraki Review-{cf['fieldname']}"
        if not client.exists("Custom Field", {"name": cf_name}):
            client.create_custom_field(cf)
            print(f"  Created Custom Field: {cf_name}")
        else:
            print(f"  Custom Field exists: {cf_name}")

    print("  v070 meraki review outcome fields complete.")
