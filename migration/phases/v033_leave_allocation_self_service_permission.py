"""Grant Employee Self Service role read access to Leave Allocation.

Employees need this to see their leave allocation balances on the My Leaves page.
"""


def run(client):
    print("v033: Granting Employee Self Service read access to Leave Allocation...")

    existing = client.exists(
        "Custom DocPerm",
        {"parent": "Leave Allocation", "role": "Employee Self Service", "permlevel": 0},
    )
    if not existing:
        client.create("Custom DocPerm", {
            "parent": "Leave Allocation",
            "parenttype": "DocType",
            "parentfield": "permissions",
            "role": "Employee Self Service",
            "permlevel": 0,
            "read": 1,
            "write": 0,
            "create": 0,
            "submit": 0,
            "cancel": 0,
            "delete": 0,
        })
        print("  Granted Employee Self Service read on Leave Allocation")
    else:
        print("  Permission already exists, skipping")

    print("v033: Done.")
