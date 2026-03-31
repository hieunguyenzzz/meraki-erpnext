"""Add custom_invoice_category Select field on Sales Invoice and backfill existing invoices."""


def run(client):
    # 1. Create Custom Field if it doesn't exist
    existing = client.get_list("Custom Field", filters={
        "dt": "Sales Invoice",
        "fieldname": "custom_invoice_category",
    }, fields=["name"])
    if existing:
        print("  Custom Field 'custom_invoice_category' already exists — skipping creation")
    else:
        client.create_custom_field({
            "dt": "Sales Invoice",
            "fieldname": "custom_invoice_category",
            "fieldtype": "Select",
            "options": "\nWedding Payment\nReferral Commission",
            "label": "Invoice Category",
            "insert_after": "customer_name",
            "translatable": 0,
        })
        print("  Created Custom Field 'custom_invoice_category' on Sales Invoice")

    # 2. Backfill: Referral Commission invoices (have REFERRAL-COMMISSION item)
    referral_invoices = client.get_list("Sales Invoice Item", filters={
        "item_code": "REFERRAL-COMMISSION",
    }, fields=["parent"], limit=0)
    referral_parents = list({r["parent"] for r in referral_invoices})
    updated_referral = 0
    for inv_name in referral_parents:
        inv = client.get_list("Sales Invoice", filters={"name": inv_name},
                              fields=["name", "custom_invoice_category"])
        if inv and not inv[0].get("custom_invoice_category"):
            client.update("Sales Invoice", inv_name, {
                "custom_invoice_category": "Referral Commission",
            })
            updated_referral += 1
    print(f"  Backfilled {updated_referral} Referral Commission invoices")

    # 3. Backfill: Wedding Payment invoices (have Wedding Planning Service item)
    wedding_invoices = client.get_list("Sales Invoice Item", filters={
        "item_code": "Wedding Planning Service",
    }, fields=["parent"], limit=0)
    wedding_parents = list({w["parent"] for w in wedding_invoices})
    updated_wedding = 0
    for inv_name in wedding_parents:
        inv = client.get_list("Sales Invoice", filters={"name": inv_name},
                              fields=["name", "custom_invoice_category"])
        if inv and not inv[0].get("custom_invoice_category"):
            client.update("Sales Invoice", inv_name, {
                "custom_invoice_category": "Wedding Payment",
            })
            updated_wedding += 1
    print(f"  Backfilled {updated_wedding} Wedding Payment invoices")
