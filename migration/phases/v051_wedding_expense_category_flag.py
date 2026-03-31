"""Add custom_is_wedding_expense Check field on Account to tag wedding expense categories."""


# Accounts that planners already use — tag them as wedding expense
WEDDING_EXPENSE_ACCOUNTS = [
    "Travel Expenses - MWP",
    "Entertainment Expenses - MWP",
    "Miscellaneous Expenses - MWP",
    "Vé máy bay - MWP",
    "Site check - MWP",
]


def run(client):
    """Create custom_is_wedding_expense field on Account and tag existing wedding accounts."""
    # 1. Create the custom field
    if client.exists("Custom Field", {"dt": "Account", "fieldname": "custom_is_wedding_expense"}):
        print("  Custom Field 'custom_is_wedding_expense' on Account already exists, skipping creation")
    else:
        client.create_custom_field({
            "dt": "Account",
            "fieldname": "custom_is_wedding_expense",
            "fieldtype": "Check",
            "label": "Wedding Expense",
            "insert_after": "account_type",
            "default": "0",
            "hidden": 1,
        })
        print("  Created Custom Field: custom_is_wedding_expense on Account")

    # 2. Tag existing wedding expense accounts
    for acct in WEDDING_EXPENSE_ACCOUNTS:
        try:
            client.update("Account", acct, {"custom_is_wedding_expense": 1})
            print(f"  Tagged: {acct}")
        except Exception as e:
            print(f"  Skip {acct}: {e}")
