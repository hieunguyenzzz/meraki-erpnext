def run(client):
    """Create per-wedding commission rate override fields on Project.

    These allow setting a custom commission % per wedding that overrides
    the employee's default rate. Null = use employee default.
    """
    fields = [
        {
            "dt": "Project",
            "fieldname": "custom_lead_commission_pct",
            "fieldtype": "Percent",
            "label": "Lead Commission %",
            "insert_after": "custom_lead_planner",
        },
        {
            "dt": "Project",
            "fieldname": "custom_support_commission_pct",
            "fieldtype": "Percent",
            "label": "Support Commission %",
            "insert_after": "custom_support_planner",
        },
        {
            "dt": "Project",
            "fieldname": "custom_assistant_commission_pct",
            "fieldtype": "Percent",
            "label": "Assistant Commission %",
            "insert_after": "custom_assistant_5",
        },
    ]

    for field in fields:
        # Check if already exists
        existing = client._get("/api/resource/Custom Field", params={
            "filters": f'[["dt","=","{field["dt"]}"],["fieldname","=","{field["fieldname"]}"]]',
            "fields": '["name"]',
            "limit_page_length": 1,
        }).get("data", [])

        if existing:
            print(f"  ✓ {field['fieldname']} already exists on {field['dt']}")
            continue

        client._post("/api/resource/Custom Field", field)
        print(f"  ✓ Created {field['fieldname']} on {field['dt']}")
