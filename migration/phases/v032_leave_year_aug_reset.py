"""
Fix leave year from Jul-Jun to Aug-Jul cycle, disable encashment.

1. Re-enable helper Server Script with extended ALLOWED fields
2. Fix old Leave Period: to_date → Jul 31, is_active → 1
3. Fix old 13 allocations: to_date → Jul 31
4. Fix old 13 ledger entries: to_date → Jul 31
5. Fix new Leave Period: from_date → Aug 1, to_date → Jul 31 2027
6. Fix new 14 allocations: from_date → Aug 1, to_date → Jul 31 2027
7. Fix new 14 ledger entries: from_date → Aug 1, to_date → Jul 31 2027
8. Casual Leave: allow_encashment=0, clear earning_component
9. HR Settings: auto_leave_encashment=0
10. Disable helper script
"""

HELPER_SCRIPT_NAME = "meraki-leave-db-update"
HELPER_API_METHOD = "meraki_leave_db_update"

# Extended script: supports from_date and Leave Ledger Entry
HELPER_SCRIPT = '''\
doctype = frappe.form_dict.get("doctype")
name = frappe.form_dict.get("name")
fieldname = frappe.form_dict.get("fieldname")
value = frappe.form_dict.get("value")

if not all([doctype, name, fieldname]):
    frappe.throw("doctype, name, and fieldname are required")

ALLOWED = {
    "Leave Allocation": {"to_date", "from_date"},
    "Leave Period": {"to_date", "from_date", "is_active"},
    "Leave Ledger Entry": {"to_date", "from_date"},
}

if doctype not in ALLOWED or fieldname not in ALLOWED[doctype]:
    frappe.throw(f"Not allowed: {doctype}.{fieldname}")

frappe.db.set_value(doctype, name, fieldname, value)
frappe.db.commit()
frappe.response["message"] = "ok"
'''

OLD_PERIOD = "HR-LPR-2026-00001"
OLD_TO_DATE_WRONG = "2026-06-30"
OLD_TO_DATE_CORRECT = "2026-07-31"

NEW_FROM_DATE_WRONG = "2026-07-01"
NEW_TO_DATE_WRONG = "2027-06-30"
NEW_FROM_DATE_CORRECT = "2026-08-01"
NEW_TO_DATE_CORRECT = "2027-07-31"

COMPANY = "Meraki Wedding Planner"


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
    print("v032: Fixing leave year to Aug-Jul cycle, disabling encashment...")

    # 0. Re-enable helper Server Script with extended ALLOWED fields
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
    print("  Re-enabled helper Server Script with extended fields")

    # 1. Fix old Leave Period: to_date → Jul 31, is_active → 1
    period = client.get("Leave Period", OLD_PERIOD)
    if not period:
        raise RuntimeError(f"Leave Period {OLD_PERIOD} not found")

    if period["to_date"] != OLD_TO_DATE_CORRECT:
        _call_helper(client, "Leave Period", OLD_PERIOD, "to_date", OLD_TO_DATE_CORRECT)
        print(f"  Fixed old Leave Period to_date → {OLD_TO_DATE_CORRECT}")
    else:
        print(f"  Old Leave Period to_date already correct")

    if not period.get("is_active"):
        _call_helper(client, "Leave Period", OLD_PERIOD, "is_active", "1")
        print(f"  Re-activated old Leave Period")
    else:
        print(f"  Old Leave Period already active")

    # 2. Fix old allocations: to_date → Jul 31
    old_allocations = client.get_list("Leave Allocation", filters={
        "leave_type": "Casual Leave",
        "docstatus": 1,
        "from_date": "2026-01-01",
    }, fields=["name", "employee_name", "to_date"], limit=50)

    for alloc in old_allocations:
        if alloc["to_date"] != OLD_TO_DATE_CORRECT:
            _call_helper(client, "Leave Allocation", alloc["name"], "to_date", OLD_TO_DATE_CORRECT)
            print(f"  Fixed old allocation {alloc['name']} ({alloc['employee_name']}) to_date → {OLD_TO_DATE_CORRECT}")

    # 3. Fix old ledger entries: to_date → Jul 31
    old_ledger = client.get_list("Leave Ledger Entry", filters={
        "leave_type": "Casual Leave",
        "from_date": "2026-01-01",
    }, fields=["name", "employee_name", "to_date"], limit=50)

    for entry in old_ledger:
        if entry["to_date"] != OLD_TO_DATE_CORRECT:
            _call_helper(client, "Leave Ledger Entry", entry["name"], "to_date", OLD_TO_DATE_CORRECT)
            print(f"  Fixed old ledger {entry['name']} ({entry['employee_name']}) to_date → {OLD_TO_DATE_CORRECT}")

    # 4. Fix new Leave Period: from_date → Aug 1, to_date → Jul 31 2027
    new_periods = client.get_list("Leave Period", filters={
        "company": COMPANY,
        "from_date": ["in", [NEW_FROM_DATE_WRONG, NEW_FROM_DATE_CORRECT]],
    }, fields=["name", "from_date", "to_date"], limit=5)

    new_period = None
    for p in new_periods:
        if p["from_date"] in [NEW_FROM_DATE_WRONG, NEW_FROM_DATE_CORRECT]:
            new_period = p
            break

    if new_period:
        if new_period["from_date"] != NEW_FROM_DATE_CORRECT:
            _call_helper(client, "Leave Period", new_period["name"], "from_date", NEW_FROM_DATE_CORRECT)
            print(f"  Fixed new Leave Period from_date → {NEW_FROM_DATE_CORRECT}")
        if new_period["to_date"] != NEW_TO_DATE_CORRECT:
            _call_helper(client, "Leave Period", new_period["name"], "to_date", NEW_TO_DATE_CORRECT)
            print(f"  Fixed new Leave Period to_date → {NEW_TO_DATE_CORRECT}")
    else:
        print("  WARNING: New Leave Period not found")

    # 5. Fix new allocations: from_date → Aug 1, to_date → Jul 31 2027
    new_allocations = client.get_list("Leave Allocation", filters={
        "leave_type": "Casual Leave",
        "docstatus": 1,
        "from_date": ["in", [NEW_FROM_DATE_WRONG, NEW_FROM_DATE_CORRECT]],
    }, fields=["name", "employee_name", "from_date", "to_date"], limit=50)

    for alloc in new_allocations:
        if alloc["from_date"] != NEW_FROM_DATE_CORRECT:
            _call_helper(client, "Leave Allocation", alloc["name"], "from_date", NEW_FROM_DATE_CORRECT)
            print(f"  Fixed new allocation {alloc['name']} ({alloc['employee_name']}) from_date → {NEW_FROM_DATE_CORRECT}")
        if alloc["to_date"] != NEW_TO_DATE_CORRECT:
            _call_helper(client, "Leave Allocation", alloc["name"], "to_date", NEW_TO_DATE_CORRECT)
            print(f"  Fixed new allocation {alloc['name']} ({alloc['employee_name']}) to_date → {NEW_TO_DATE_CORRECT}")

    # 6. Fix new ledger entries: from_date → Aug 1, to_date → Jul 31 2027
    new_ledger = client.get_list("Leave Ledger Entry", filters={
        "leave_type": "Casual Leave",
        "from_date": ["in", [NEW_FROM_DATE_WRONG, NEW_FROM_DATE_CORRECT]],
    }, fields=["name", "employee_name", "from_date", "to_date"], limit=50)

    for entry in new_ledger:
        if entry["from_date"] != NEW_FROM_DATE_CORRECT:
            _call_helper(client, "Leave Ledger Entry", entry["name"], "from_date", NEW_FROM_DATE_CORRECT)
            print(f"  Fixed new ledger {entry['name']} ({entry['employee_name']}) from_date → {NEW_FROM_DATE_CORRECT}")
        if entry["to_date"] != NEW_TO_DATE_CORRECT:
            _call_helper(client, "Leave Ledger Entry", entry["name"], "to_date", NEW_TO_DATE_CORRECT)
            print(f"  Fixed new ledger {entry['name']} ({entry['employee_name']}) to_date → {NEW_TO_DATE_CORRECT}")

    # 7. Casual Leave: disable encashment, clear earning_component
    client.update("Leave Type", "Casual Leave", {
        "allow_encashment": 0,
        "earning_component": "",
    })
    print("  Disabled encashment on Casual Leave, cleared earning_component")

    # 8. HR Settings: disable auto leave encashment
    resp = client.session.put(
        f"{client.url}/api/resource/HR Settings/HR Settings",
        headers=client._get_headers(),
        json={"auto_leave_encashment": 0},
        timeout=30,
    )
    if resp.status_code == 200:
        print("  Disabled auto_leave_encashment in HR Settings")
    else:
        print(f"  WARNING: Could not update HR Settings: {resp.status_code}")

    # 9. Disable helper script
    client.update("Server Script", HELPER_SCRIPT_NAME, {"disabled": 1})
    print("  Disabled helper Server Script")

    print("v032: Leave year fix complete!")
    print(f"  Old period: Jan 1 - Jul 31, 2026 (active)")
    print(f"  New period: Aug 1, 2026 - Jul 31, 2027")
    print(f"  Encashment: disabled")
    print(f"  Old allocations fixed: {len(old_allocations)}")
    print(f"  New allocations fixed: {len(new_allocations)}")
    print(f"  Old ledger entries fixed: {len(old_ledger)}")
    print(f"  New ledger entries fixed: {len(new_ledger)}")
