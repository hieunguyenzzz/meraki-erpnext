"""
v042: Add amount field to Wedding Vendor and total budget field on Project.
"""


def run(client):
    # 1. Add 'amount' field to Wedding Vendor doctype
    if not client.exists("Custom Field", {"name": "Wedding Vendor-amount"}):
        client.create("Custom Field", {
            "dt": "Wedding Vendor",
            "fieldname": "amount",
            "fieldtype": "Currency",
            "label": "Amount",
            "insert_after": "supplier",
            "in_list_view": 1,
            "columns": 2,
        })
        print("  Created field: Wedding Vendor.amount")
    else:
        print("  Field exists: Wedding Vendor.amount")

    # 2. Add custom_total_budget on Project
    if not client.exists("Custom Field", {"name": "Project-custom_total_budget"}):
        client.create("Custom Field", {
            "dt": "Project",
            "fieldname": "custom_total_budget",
            "fieldtype": "Currency",
            "label": "Total Wedding Budget",
            "insert_after": "custom_wedding_vendors",
        })
        print("  Created field: Project.custom_total_budget")
    else:
        print("  Field exists: Project.custom_total_budget")

    print("  v042 vendor budget fields complete.")
