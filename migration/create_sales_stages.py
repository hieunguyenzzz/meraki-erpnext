#!/usr/bin/env python3
"""Create standard CRM Sales Stage records."""

import frappe

def create_sales_stages():
    """Create the 6 standard Sales Stage records."""
    stages = [
        "Prospecting",
        "Qualification",
        "Needs Analysis",
        "Value Proposition",
        "Proposal/Price Quote",
        "Negotiation/Review"
    ]

    for stage_name in stages:
        # Check if already exists
        if frappe.db.exists("Sales Stage", {"stage_name": stage_name}):
            print(f"Sales Stage '{stage_name}' already exists, skipping...")
            continue

        doc = frappe.get_doc({
            "doctype": "Sales Stage",
            "stage_name": stage_name
        })
        doc.insert()
        frappe.db.commit()
        print(f"Created Sales Stage: {stage_name}")

    print("\nVerifying all stages exist:")
    all_stages = frappe.get_all("Sales Stage", fields=["stage_name"])
    for stage in all_stages:
        print(f"  - {stage.stage_name}")

if __name__ == "__main__":
    create_sales_stages()
