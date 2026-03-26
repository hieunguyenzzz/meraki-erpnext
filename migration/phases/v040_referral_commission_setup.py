"""
v040: Referral Commission setup.

Creates the income account, customer group, and service item needed
to record partner referral commissions as Sales Invoices.
"""

COMPANY = "Meraki Wedding Planner"
COMPANY_ABBR = "MWP"


def run(client):
    # 1. Income Account
    account_name = f"Referral Commission Income - {COMPANY_ABBR}"
    if not client.exists("Account", {"name": account_name}):
        client.create("Account", {
            "account_name": "Referral Commission Income",
            "account_type": "Income Account",
            "root_type": "Income",
            "parent_account": f"Indirect Income - {COMPANY_ABBR}",
            "company": COMPANY,
            "is_group": 0,
        })
        print(f"  Created account: {account_name}")
    else:
        print(f"  Account exists: {account_name}")

    # 2. Customer Group
    if not client.exists("Customer Group", {"name": "Referral Partners"}):
        client.create("Customer Group", {
            "customer_group_name": "Referral Partners",
            "parent_customer_group": "All Customer Groups",
            "is_group": 0,
        })
        print("  Created Customer Group: Referral Partners")
    else:
        print("  Customer Group exists: Referral Partners")

    # 3. Service Item
    if not client.exists("Item", {"item_code": "REFERRAL-COMMISSION"}):
        result = client.create("Item", {
            "item_code": "REFERRAL-COMMISSION",
            "item_name": "Referral Commission",
            "item_group": "Wedding Services",
            "stock_uom": "Nos",
            "is_stock_item": 0,
            "is_sales_item": 1,
            "is_service_item": 1,
        })
        if result:
            print("  Created item: REFERRAL-COMMISSION")
        else:
            print("  Warning: item creation may have failed")
    else:
        print("  Item exists: REFERRAL-COMMISSION")

    print("  v040 referral commission setup complete.")
