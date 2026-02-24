BH_ACCOUNTS = [
    "BHXH Payable - Employee - MWP",
    "BHXH Payable - Employer - MWP",
    "BHYT Payable - Employee - MWP",
    "BHYT Payable - Employer - MWP",
    "BHTN Payable - Employee - MWP",
    "BHTN Payable - Employer - MWP",
]


def run(client):
    # Fix 1: Remove unique constraint from Journal Entry custom_meraki_cost_id.
    # New payroll JVs have no Meraki cost ID so they default to 0, which collides
    # with the unique constraint on the second JV. Same issue as v004 for Sales
    # Order and Project.
    field_name = "Journal Entry-custom_meraki_cost_id"
    result = client.update("Custom Field", field_name, {"unique": 0})
    if result:
        print(f"  Removed unique constraint from {field_name}")
    else:
        print(f"  Warning: could not update {field_name} (may already be correct)")

    # Fix 2: Clear account_type on BH* payable accounts.
    # These accounts were created with account_type="Payable" which forces every
    # JV line posting to them to include a Party (supplier/employee). They are
    # aggregate insurance liability accounts so no party should be required.
    for account in BH_ACCOUNTS:
        result = client.update("Account", account, {"account_type": ""})
        if result:
            print(f"  Cleared account_type on {account}")
        else:
            print(f"  Warning: could not update account {account} (may not exist or already correct)")
