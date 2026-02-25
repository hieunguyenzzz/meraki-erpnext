"""
v012 - Add custom fields for add-on services
- Item.custom_include_in_commission (Check) - default commission flag for add-on types
- Sales Order.custom_commission_base (Currency) - package + commission-included add-ons total
"""

def run(client):
    print("v012: Adding custom fields for add-on services...")

    # Add custom_include_in_commission checkbox on Item doctype
    item_field = {
        "doctype": "Custom Field",
        "dt": "Item",
        "fieldname": "custom_include_in_commission",
        "fieldtype": "Check",
        "label": "Include in Commission",
        "description": "Default: whether this add-on type counts toward team commission",
        "insert_after": "description",
        "default": "0",
    }
    try:
        existing = client.get_doc("Custom Field", "Item-custom_include_in_commission")
        print("  custom_include_in_commission already exists on Item, skipping")
    except Exception:
        client.create_doc("Custom Field", item_field)
        print("  Created custom_include_in_commission on Item")

    # Add custom_commission_base currency field on Sales Order doctype
    so_field = {
        "doctype": "Custom Field",
        "dt": "Sales Order",
        "fieldname": "custom_commission_base",
        "fieldtype": "Currency",
        "label": "Commission Base",
        "description": "Package amount + commission-included add-ons; used by payroll commission calc",
        "insert_after": "base_net_total",
        "options": "currency",
    }
    try:
        existing = client.get_doc("Custom Field", "Sales Order-custom_commission_base")
        print("  custom_commission_base already exists on Sales Order, skipping")
    except Exception:
        client.create_doc("Custom Field", so_field)
        print("  Created custom_commission_base on Sales Order")

    print("v012: Done.")
