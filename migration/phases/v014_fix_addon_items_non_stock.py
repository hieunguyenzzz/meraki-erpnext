def run(client):
    """Set is_stock_item=0 on all Add-on Services items so they don't require a delivery warehouse on Sales Orders."""
    print("v014: Fixing Add-on Services items to be non-stock...")

    items = client.get_list("Item", filters={"item_group": "Add-on Services"}, fields=["name", "is_stock_item"], limit=500)

    fixed = 0
    for item in items:
        if item.get("is_stock_item"):
            client.update("Item", item["name"], {"is_stock_item": 0})
            print(f"  Fixed: {item['name']}")
            fixed += 1

    print(f"v014: Done. Fixed {fixed} item(s) out of {len(items)} total.")
