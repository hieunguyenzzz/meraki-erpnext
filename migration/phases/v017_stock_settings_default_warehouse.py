"""
Set a default warehouse in Stock Settings so that ERPNext's
update_child_qty_rate API can add service/add-on items to Sales Orders
without throwing a warehouse validation error.
"""


def run(client):
    client.update("Stock Settings", "Stock Settings", {
        "default_warehouse": "Stores - MWP",
    })
