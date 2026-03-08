"""
Transition leave year from Jan-Dec to Jul-Jun cycle.

1. Shorten current Leave Period to end Jun 30, 2026
2. Shorten current Leave Allocations to end Jun 30, 2026 (direct DB update)
3. Create new Leave Period Jul 1 2026 - Jun 30 2027
4. Create new Leave Allocations for all active employees
5. Configure Casual Leave: is_carry_forward=0, earning_component set
6. Enable auto_leave_encashment in HR Settings
"""

HELPER_SCRIPT_NAME = "meraki-leave-db-update"
HELPER_API_METHOD = "meraki_leave_db_update"

HELPER_SCRIPT = '''\
doctype = frappe.form_dict.get("doctype")
name = frappe.form_dict.get("name")
fieldname = frappe.form_dict.get("fieldname")
value = frappe.form_dict.get("value")
action = frappe.form_dict.get("action")

if action == "submit":
    if not all([doctype, name]):
        frappe.throw("doctype and name are required for submit")
    doc = frappe.get_doc(doctype, name)
    doc.submit()
    frappe.response["message"] = "submitted"
else:
    if not all([doctype, name, fieldname]):
        frappe.throw("doctype, name, and fieldname are required")

    ALLOWED = {
        "Leave Allocation": {"to_date"},
        "Leave Period": {"to_date", "is_active"},
    }

    if doctype not in ALLOWED or fieldname not in ALLOWED[doctype]:
        frappe.throw(f"Not allowed: {doctype}.{fieldname}")

    frappe.db.set_value(doctype, name, fieldname, value)
    frappe.db.commit()
    frappe.response["message"] = "ok"
'''

OLD_PERIOD = "HR-LPR-2026-00001"
OLD_END = "2026-06-30"
NEW_START = "2026-07-01"
NEW_END = "2027-06-30"
COMPANY = "Meraki Wedding Planner"


def _call_helper(client, doctype, name, fieldname, value):
    """Call the temporary server script to do frappe.db.set_value."""
    resp = client.session.post(
        f"{client.url}/api/method/{HELPER_API_METHOD}",
        headers=client._get_headers(),
        json={"doctype": doctype, "name": name, "fieldname": fieldname, "value": value},
        timeout=30,
    )
    if resp.status_code != 200:
        raise RuntimeError(f"Failed to set {doctype}/{name}.{fieldname}: {resp.status_code} {resp.text}")


def _call_helper_submit(client, doctype, name):
    """Call the temporary server script to submit a document (avoids timestamp mismatch)."""
    resp = client.session.post(
        f"{client.url}/api/method/{HELPER_API_METHOD}",
        headers=client._get_headers(),
        json={"action": "submit", "doctype": doctype, "name": name},
        timeout=30,
    )
    if resp.status_code != 200:
        raise RuntimeError(f"Failed to submit {doctype}/{name}: {resp.status_code} {resp.text}")


def run(client):
    print("v031: Transitioning leave year to Jul-Jun cycle...")

    # 0. Create temporary helper Server Script for direct DB updates
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
    print("  Created helper Server Script")

    # 1. Shorten current Leave Period to end Jun 30
    period = client.get("Leave Period", OLD_PERIOD)
    if not period:
        raise RuntimeError(f"Leave Period {OLD_PERIOD} not found")

    if period["to_date"] != OLD_END:
        _call_helper(client, "Leave Period", OLD_PERIOD, "to_date", OLD_END)
        print(f"  Shortened Leave Period {OLD_PERIOD} to end {OLD_END}")
    else:
        print(f"  Leave Period {OLD_PERIOD} already ends {OLD_END}")

    # 2. Shorten existing Leave Allocations to end Jun 30
    allocations = client.get_list("Leave Allocation", filters={
        "leave_type": "Casual Leave",
        "docstatus": 1,
        "from_date": "2026-01-01",
    }, fields=["name", "employee", "employee_name", "to_date", "new_leaves_allocated"])

    for alloc in allocations:
        if alloc["to_date"] != OLD_END:
            _call_helper(client, "Leave Allocation", alloc["name"], "to_date", OLD_END)
            print(f"  Shortened allocation {alloc['name']} ({alloc['employee_name']}) to {OLD_END}")
        else:
            print(f"  Allocation {alloc['name']} ({alloc['employee_name']}) already ends {OLD_END}")

    # 3. Create new Leave Period Jul 2026 - Jun 2027
    existing_new_period = client.get_list("Leave Period", filters={
        "from_date": NEW_START,
        "to_date": NEW_END,
        "company": COMPANY,
    }, limit=1)

    if existing_new_period:
        new_period_name = existing_new_period[0]["name"]
        print(f"  New Leave Period already exists: {new_period_name}")
    else:
        result = client.create("Leave Period", {
            "from_date": NEW_START,
            "to_date": NEW_END,
            "company": COMPANY,
            "is_active": 1,
        })
        if not result:
            raise RuntimeError("Failed to create new Leave Period")
        new_period_name = result["name"]
        print(f"  Created new Leave Period: {new_period_name} ({NEW_START} to {NEW_END})")

    # 4. Deactivate old Leave Period
    _call_helper(client, "Leave Period", OLD_PERIOD, "is_active", "0")
    print(f"  Deactivated old Leave Period {OLD_PERIOD}")

    # 5. Create new Leave Allocations for active employees
    active_employees = client.get_list("Employee", filters={
        "status": "Active",
        "company": COMPANY,
    }, fields=["name", "employee_name"])

    for emp in active_employees:
        existing_alloc = client.get_list("Leave Allocation", filters={
            "employee": emp["name"],
            "leave_type": "Casual Leave",
            "from_date": NEW_START,
            "to_date": NEW_END,
        }, limit=1)

        if existing_alloc:
            print(f"  Allocation already exists for {emp['employee_name']}")
            continue

        # Find their old allocation to match days
        old_alloc = [a for a in allocations if a["employee"] == emp["name"]]
        days = old_alloc[0]["new_leaves_allocated"] if old_alloc else 12

        # Check if draft allocation already exists (from previous run)
        draft_alloc = client.get_list("Leave Allocation", filters={
            "employee": emp["name"],
            "leave_type": "Casual Leave",
            "from_date": NEW_START,
            "to_date": NEW_END,
            "docstatus": 0,
        }, limit=1)

        if draft_alloc:
            # Submit existing draft
            alloc_name = draft_alloc[0]["name"]
        else:
            result = client.create("Leave Allocation", {
                "employee": emp["name"],
                "leave_type": "Casual Leave",
                "from_date": NEW_START,
                "to_date": NEW_END,
                "new_leaves_allocated": days,
                "leave_period": new_period_name,
            })
            if not result:
                print(f"  WARNING: Failed to create allocation for {emp['employee_name']}")
                continue
            alloc_name = result["name"]

        # Submit via helper script (avoids timestamp mismatch)
        _call_helper_submit(client, "Leave Allocation", alloc_name)
        print(f"  Created & submitted allocation for {emp['employee_name']} ({days} days)")

    # 6. Configure Casual Leave type
    client.update("Leave Type", "Casual Leave", {
        "is_carry_forward": 0,
        "allow_encashment": 1,
        "earning_component": "Basic Salary",
    })
    print("  Configured Casual Leave: is_carry_forward=0, earning_component=Basic Salary")

    # 7. Enable auto leave encashment in HR Settings
    resp = client.session.put(
        f"{client.url}/api/resource/HR Settings/HR Settings",
        headers=client._get_headers(),
        json={"auto_leave_encashment": 1},
        timeout=30,
    )
    if resp.status_code == 200:
        print("  Enabled auto_leave_encashment in HR Settings")
    else:
        print(f"  WARNING: Could not update HR Settings: {resp.status_code}")

    # 8. Clean up: disable helper script
    client.update("Server Script", HELPER_SCRIPT_NAME, {"disabled": 1})
    print("  Disabled helper Server Script")

    print("v031: Leave year transition complete!")
    print(f"  Old period: Jan 1 - Jun 30, 2026 (inactive)")
    print(f"  New period: Jul 1, 2026 - Jun 30, 2027 (active)")
    print(f"  Allocations shortened: {len(allocations)}")
    print(f"  New allocations created for {len(active_employees)} employees")
