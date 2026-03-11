"""
Fix New (annual) Casual Leave allocation from_date from Aug 1 → Jan 1.

Before: New alloc from_date = 2026-08-01, to_date = 2027-07-31
After:  New alloc from_date = 2026-01-01, to_date = 2027-07-31

This allows ERPNext to recognise the New allocation for H1 (Jan–Jul)
leave dates, enabling employees to draw from both carry-over and accrued
annual balance in a single CL application.

Also fixes the corresponding Leave Ledger Entry records so the balance
engine sees consistent from_date values.

Only updates records where from_date == 2026-08-01.
"""

HELPER_SCRIPT_NAME = "meraki-leave-db-update"
HELPER_API_METHOD = "meraki_leave_db_update"

HELPER_SCRIPT = '''\
doctype = frappe.form_dict.get("doctype")
name = frappe.form_dict.get("name")
fieldname = frappe.form_dict.get("fieldname")
value = frappe.form_dict.get("value")

if not all([doctype, name, fieldname]):
    frappe.throw("doctype, name, and fieldname are required")

ALLOWED = {
    "Leave Allocation": {"from_date"},
    "Leave Ledger Entry": {"from_date"},
}

if doctype not in ALLOWED or fieldname not in ALLOWED[doctype]:
    frappe.throw(f"Not allowed: {doctype}.{fieldname}")

frappe.db.set_value(doctype, name, fieldname, value)
frappe.db.commit()
frappe.response["message"] = "ok"
'''

OLD_FROM_DATE = "2026-08-01"
NEW_FROM_DATE = "2026-01-01"


def _call_helper(client, doctype, name, fieldname, value):
    resp = client.session.post(
        f"{client.url}/api/method/{HELPER_API_METHOD}",
        headers=client._get_headers(),
        json={"doctype": doctype, "name": name, "fieldname": fieldname, "value": value},
        timeout=30,
    )
    if resp.status_code != 200:
        raise RuntimeError(f"Failed to set {doctype}/{name}.{fieldname}: {resp.status_code} {resp.text}")


def run(client):
    print("v034: Fixing New CL allocation from_date: Aug 1 → Jan 1...")

    # 0. Ensure helper Server Script exists and is enabled
    existing = client.get("Server Script", HELPER_SCRIPT_NAME)
    if existing:
        client.update("Server Script", HELPER_SCRIPT_NAME, {
            "script": HELPER_SCRIPT, "disabled": 0,
        })
    else:
        client.create("Server Script", {
            "name": HELPER_SCRIPT_NAME,
            "script_type": "API",
            "api_method": HELPER_API_METHOD,
            "allow_guest": 0,
            "disabled": 0,
            "script": HELPER_SCRIPT,
        })
    print("  Helper Server Script ready")

    # 1. Fix Leave Allocations: from_date Aug 1 → Jan 1
    allocations = client.get_list("Leave Allocation", filters={
        "leave_type": "Casual Leave",
        "docstatus": 1,
        "from_date": OLD_FROM_DATE,
    }, fields=["name", "employee", "employee_name", "from_date", "to_date"], limit=100)

    alloc_updated = 0
    for alloc in allocations:
        _call_helper(client, "Leave Allocation", alloc["name"], "from_date", NEW_FROM_DATE)
        print(f"  Allocation {alloc['name']} ({alloc['employee_name']}): {OLD_FROM_DATE} → {NEW_FROM_DATE}")
        alloc_updated += 1

    # 2. Fix Leave Ledger Entries: from_date Aug 1 → Jan 1
    ledger_entries = client.get_list("Leave Ledger Entry", filters={
        "leave_type": "Casual Leave",
        "from_date": OLD_FROM_DATE,
    }, fields=["name", "employee", "employee_name", "from_date", "to_date"], limit=100)

    ledger_updated = 0
    for entry in ledger_entries:
        _call_helper(client, "Leave Ledger Entry", entry["name"], "from_date", NEW_FROM_DATE)
        print(f"  Ledger entry {entry['name']} ({entry['employee_name']}): {OLD_FROM_DATE} → {NEW_FROM_DATE}")
        ledger_updated += 1

    # 3. Disable helper script
    client.update("Server Script", HELPER_SCRIPT_NAME, {"disabled": 1})
    print("  Disabled helper Server Script")

    print(f"v034 done: {alloc_updated} allocations updated, {ledger_updated} ledger entries updated")
