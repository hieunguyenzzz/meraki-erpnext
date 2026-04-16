"""Map missing Salary Component accounts to 'Salary - MWP'."""

COMPANY = "Meraki Wedding Planner"
DEFAULT_ACCOUNT = "Salary - MWP"

COMPONENTS = [
    "Company Insurance Contribution",
    "Full Package Commission",
    "Partial Package Commission",
    "Salary Proration Adj",
]


def run(client):
    for comp_name in COMPONENTS:
        comp = client.get("Salary Component", comp_name)
        if not comp:
            print(f"  '{comp_name}' not found, skipping")
            continue
        accounts = comp.get("accounts", [])
        if any(a.get("company") == COMPANY for a in accounts):
            print(f"  '{comp_name}' already has account for {COMPANY}")
            continue
        accounts.append({"company": COMPANY, "account": DEFAULT_ACCOUNT})
        client.update("Salary Component", comp_name, {"accounts": accounts})
        print(f"  Mapped '{comp_name}' → '{DEFAULT_ACCOUNT}'")
