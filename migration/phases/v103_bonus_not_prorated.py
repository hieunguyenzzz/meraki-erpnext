"""Manual Bonus is a flat one-off amount: do not prorate it by payment days."""

COMPONENT = "Bonus"


def run(client):
    comp = client.get("Salary Component", COMPONENT)
    if not comp:
        print(f"  ERROR: Salary Component '{COMPONENT}' not found")
        return

    if not comp.get("depends_on_payment_days"):
        print("  Bonus already independent of payment days, skipping")
        return

    client.update("Salary Component", COMPONENT, {"depends_on_payment_days": 0})
    print("  Bonus set to depends_on_payment_days=0")
