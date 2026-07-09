"""Daily Scheduler Event: auto-clear custom_is_probation once the end date has passed.

Probation affects insurance (BHXH/BHYT/BHTN skipped) via the Salary Structure
formula, which only checks the flag — not the end date. Nothing was un-ticking the
flag when probation ended, so insurance stayed skipped. This scheduler flips the
flag off the day after custom_probation_end_date, keeping the end date for history.
"""


SCRIPT_NAME = "meraki-clear-expired-probation"

# No imports allowed in the Frappe Server Script sandbox.
# NULL custom_probation_end_date is excluded automatically (NULL < today is false in SQL).
SCRIPT_BODY = """today = frappe.utils.today()
expired = frappe.get_all(
    "Employee",
    filters={
        "custom_is_probation": 1,
        "custom_probation_end_date": ["<", today],
    },
    fields=["name"],
)
for row in expired:
    frappe.db.set_value("Employee", row["name"], "custom_is_probation", 0)
if expired:
    frappe.db.commit()
"""


def run(client):
    existing = client.get("Server Script", SCRIPT_NAME)
    if existing:
        if (existing.get("script") or "").strip() == SCRIPT_BODY.strip() and not existing.get("disabled"):
            print("  Probation auto-clear Server Script up to date, skipping")
            return
        result = client.update("Server Script", SCRIPT_NAME, {
            "script": SCRIPT_BODY,
            "event_frequency": "Daily",
            "disabled": 0,
        })
        print("  Updated probation auto-clear Server Script" if result else "  ERROR: update failed")
        return

    result = client.create("Server Script", {
        "name": SCRIPT_NAME,
        "script_type": "Scheduler Event",
        "event_frequency": "Daily",
        "disabled": 0,
        "script": SCRIPT_BODY,
    })
    print("  Created probation auto-clear Server Script" if result else "  ERROR: create failed")
