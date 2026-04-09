"""Create 'Salary Proration Adj' deduction component for /26 working day correction."""

import json


def run(client):
    comp_name = "Salary Proration Adj"
    existing = client.get_list("Salary Component",
        filters=[["name", "=", comp_name]],
        fields=["name"],
        limit=1,
    )
    if existing:
        print(f"  Salary Component '{comp_name}' already exists, skipping")
        return

    # Use the same account as Income Tax deduction
    sc = client.get_list("Salary Component",
        filters=[["name", "=", "Income Tax"]],
        fields=["name"],
        limit=1,
    )
    # Create the component as a deduction
    payload = {
        "doctype": "Salary Component",
        "salary_component": comp_name,
        "salary_component_abbr": "SPA",
        "type": "Deduction",
        "depends_on_payment_days": 0,
        "is_tax_applicable": 0,
        "is_flexible_benefit": 0,
        "description": "Adjusts partial-month salary from ERPNext working days to Vietnam standard /26.",
    }
    try:
        resp = client.session.post(
            f"{client.url}/api/resource/Salary Component",
            headers=client._get_headers(),
            json=payload,
            timeout=30,
        )
        if resp.status_code in (200, 201):
            print(f"  Created Salary Component: {comp_name}")
        else:
            print(f"  WARNING: Could not create {comp_name}: {resp.status_code} {resp.text[:200]}")
    except Exception as e:
        print(f"  WARNING: Could not create {comp_name}: {e}")
