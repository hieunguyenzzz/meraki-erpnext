"""Grant Employee role read access to Supplier so all app users can view the Venues page."""

DOCTYPES_TO_ADD = [
    "Supplier",
    "Contact",
    "Customer",
]


def run(client):
    print("v024: Granting Employee role read access to Supplier/Contact/Customer...")

    for doctype in DOCTYPES_TO_ADD:
        existing = client.exists(
            "Custom DocPerm",
            {"parent": doctype, "role": "Employee", "permlevel": 0},
        )
        if not existing:
            client.create("Custom DocPerm", {
                "parent": doctype,
                "parenttype": "DocType",
                "parentfield": "permissions",
                "role": "Employee",
                "permlevel": 0,
                "read": 1,
                "write": 0,
                "create": 0,
                "submit": 0,
                "cancel": 0,
                "delete": 0,
            })
            print(f"  Granted Employee read on {doctype}")
        else:
            print(f"  Employee read on {doctype} already exists, skipping")

    print("v024: Done.")
