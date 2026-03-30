"""Create 'Company Expense' supplier and ensure Purchase Invoice prerequisites."""


def run(client):
    # Check if supplier already exists
    if client.exists("Supplier", {"supplier_name": "Company Expense"}):
        print("  Supplier 'Company Expense' already exists — skipping")
    else:
        client.create_supplier({
            "supplier_name": "Company Expense",
            "supplier_group": "Wedding Vendors",
            "supplier_type": "Company",
        })
        print("  Created Supplier 'Company Expense'")

    # Ensure EXPENSE-ITEM exists
    if client.exists("Item", {"item_code": "EXPENSE-ITEM"}):
        print("  Item 'EXPENSE-ITEM' already exists — skipping")
    else:
        client.create_item({
            "item_name": "Expense Item",
            "item_code": "EXPENSE-ITEM",
            "item_group": "All Item Groups",
            "is_stock_item": 0,
            "stock_uom": "Nos",
        })
        print("  Created Item 'EXPENSE-ITEM'")

    # Set "Stock Received But Not Billed" on Company (required for Purchase Invoices
    # when perpetual inventory is enabled)
    company = client.get_list("Company", filters={"name": "Meraki Wedding Planner"},
                              fields=["name", "stock_received_but_not_billed"])
    if company and not company[0].get("stock_received_but_not_billed"):
        client.update("Company", "Meraki Wedding Planner", {
            "stock_received_but_not_billed": "Stock Received But Not Billed - MWP",
        })
        print("  Set 'Stock Received But Not Billed' on Company")
    else:
        print("  Company already has 'Stock Received But Not Billed' set — skipping")
