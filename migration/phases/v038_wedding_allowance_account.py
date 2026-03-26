def run(client):
    """Map Wedding Allowance salary component to 'Salary - MWP' account.

    Without this mapping, Payroll Entry's make_accrual_jv_entry() fails
    because it cannot determine which GL account to debit for this component.
    """
    comp_name = "Wedding Allowance"
    company = "Meraki Wedding Planner"
    account = "Salary - MWP"

    # Fetch current accounts
    doc = client._get(f"/api/resource/Salary Component/{comp_name}").get("data", {})
    existing = doc.get("accounts", [])

    # Check if already mapped
    for row in existing:
        if row.get("company") == company:
            print(f"✓ {comp_name} already mapped to {row.get('account')} for {company}")
            return

    # Add account mapping
    existing.append({"company": company, "account": account})
    client._put(f"/api/resource/Salary Component/{comp_name}", {"accounts": existing})
    print(f"✓ Mapped {comp_name} → {account} for {company}")
