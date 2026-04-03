"""Create 'Income Tax Payable' account and assign it to the Income Tax salary component."""

ACCOUNT_NAME = "Income Tax Payable - MWP"
PARENT_ACCOUNT = "Current Liabilities - MWP"
COMPANY = "Meraki Wedding Planner"
COMPONENT = "Income Tax"


def run(client):
    # 1. Create the account if it doesn't exist
    if not client.get("Account", ACCOUNT_NAME):
        client.create("Account", {
            "account_name": "Income Tax Payable",
            "parent_account": PARENT_ACCOUNT,
            "company": COMPANY,
            "root_type": "Liability",
            "account_type": "",
            "is_group": 0,
        })
        print(f"  Created account '{ACCOUNT_NAME}'")
    else:
        print(f"  Account '{ACCOUNT_NAME}' already exists")

    # 2. Add company account mapping to Salary Component
    comp = client.get("Salary Component", COMPONENT)
    if not comp:
        print(f"  Salary Component '{COMPONENT}' not found!")
        return
    accounts = comp.get("accounts", [])
    already_mapped = any(a.get("company") == COMPANY for a in accounts)
    if already_mapped:
        print(f"  '{COMPONENT}' already has account for {COMPANY}")
        return

    accounts.append({"company": COMPANY, "account": ACCOUNT_NAME})
    client.update("Salary Component", COMPONENT, {"accounts": accounts})
    print(f"  Mapped '{COMPONENT}' → '{ACCOUNT_NAME}'")
