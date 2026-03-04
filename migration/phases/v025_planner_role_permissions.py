"""Grant Projects User read access to Sales Order, Sales Invoice, Customer, Supplier for the wedding kanban page."""

DOCTYPES = ["Sales Order", "Sales Invoice", "Customer", "Supplier"]


def run(client):
    print("v025: Granting Projects User read access for wedding kanban...")
    for doctype in DOCTYPES:
        existing = client.exists(
            "Custom DocPerm",
            {"parent": doctype, "role": "Projects User", "permlevel": 0},
        )
        if not existing:
            client.create("Custom DocPerm", {
                "parent": doctype,
                "parenttype": "DocType",
                "parentfield": "permissions",
                "role": "Projects User",
                "permlevel": 0,
                "read": 1,
                "write": 0,
                "create": 0,
                "submit": 0,
                "cancel": 0,
                "delete": 0,
            })
            print(f"  Granted Projects User read on {doctype}")
        else:
            print(f"  Projects User read on {doctype} already exists, skipping")
    print("v025: Done.")
