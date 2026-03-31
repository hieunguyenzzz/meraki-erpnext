"""Create Income Tax salary component and fix is_tax_applicable flags."""

TAXABLE_EARNINGS = [
    "Basic Salary",
    "Lead Planner Commission", "Support Planner Commission", "Assistant Commission",
    "Full Package Commission", "Partial Package Commission",
    "Wedding Allowance",
]

def run(client):
    # 1. Create Income Tax deduction component
    if client.exists("Salary Component", {"name": "Income Tax"}):
        print("  Salary Component exists: Income Tax")
    else:
        client.create("Salary Component", {
            "salary_component": "Income Tax",
            "salary_component_abbr": "PIT",
            "type": "Deduction",
            "depends_on_payment_days": 0,
            "is_tax_applicable": 0,
        })
        print("  Created Salary Component: Income Tax")

    # 2. Fix is_tax_applicable on earning components
    for name in TAXABLE_EARNINGS:
        try:
            comp = client.get("Salary Component", name)
            if not comp:
                continue
            if comp.get("is_tax_applicable") == 1:
                continue
            client.update("Salary Component", name, {"is_tax_applicable": 1})
            print(f"  Fixed is_tax_applicable=1 on: {name}")
        except Exception as e:
            print(f"  Warning: {name}: {e}")
