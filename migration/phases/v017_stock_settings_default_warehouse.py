"""
Set a default warehouse in Stock Settings so that ERPNext's
update_child_qty_rate API can add service/add-on items to Sales Orders
without throwing a warehouse validation error.
"""


def run(client):
    client._post(
        "/api/method/frappe.client.set_value",
        {
            "doctype": "Stock Settings",
            "name": "Stock Settings",
            "fieldname": "default_warehouse",
            "value": "Stores - MWP",
        },
    )
