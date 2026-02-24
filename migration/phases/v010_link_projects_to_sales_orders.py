"""
Link migrated Projects to their Sales Orders.

The original migration created Projects and Sales Orders independently without
linking them. This phase matches them by (customer_name, wedding_date) and sets
Project.sales_order so the React frontend can show Venue, Package, and other SO
data on the weddings board.
"""


def run(client):
    # Fetch all projects that have no sales_order linked yet
    projects = client.get_list(
        "Project",
        filters=[["sales_order", "is", "not set"]],
        fields=["name", "customer", "expected_end_date"],
        limit=0,
    )

    # Fetch all sales orders that have no project linked yet
    sales_orders = client.get_list(
        "Sales Order",
        filters=[["project", "is", "not set"]],
        fields=["name", "customer_name", "transaction_date"],
        limit=0,
    )

    # Build a lookup: (customer_name, date) → SO name
    so_by_customer_date = {}
    for so in sales_orders:
        key = (so["customer_name"], so["transaction_date"])
        so_by_customer_date[key] = so["name"]

    linked = 0
    skipped = 0

    for proj in projects:
        customer = proj.get("customer")
        date = proj.get("expected_end_date")
        if not customer or not date:
            skipped += 1
            continue

        so_name = so_by_customer_date.get((customer, date))
        if not so_name:
            skipped += 1
            continue

        result = client.update("Project", proj["name"], {"sales_order": so_name})
        if result:
            linked += 1
        else:
            print(f"  Warning: failed to link {proj['name']} → {so_name}")

    print(f"  Linked {linked} projects to sales orders ({skipped} skipped — no match or missing data)")
