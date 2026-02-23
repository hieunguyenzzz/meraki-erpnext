def run(client):
    # Ensure Wedding Services item group exists
    if not client.exists("Item Group", {"item_group_name": "Wedding Services"}):
        client.create("Item Group", {
            "item_group_name": "Wedding Services",
            "is_group": 0,
        })
        print("  Created Item Group: Wedding Services")

    # Create the item used by the React frontend when creating new weddings
    # stock_uom is mandatory in ERPNext even for non-stock service items
    if not client.exists("Item", {"item_code": "Wedding Planning Service"}):
        result = client.create("Item", {
            "item_code": "Wedding Planning Service",
            "item_name": "Wedding Planning Service",
            "item_group": "Wedding Services",
            "stock_uom": "Nos",
            "is_stock_item": 0,
            "is_sales_item": 1,
            "is_service_item": 1,
        })
        if result:
            print("  Created item: Wedding Planning Service")
        else:
            raise Exception("Failed to create item: Wedding Planning Service")
    else:
        print("  Item already exists: Wedding Planning Service")
