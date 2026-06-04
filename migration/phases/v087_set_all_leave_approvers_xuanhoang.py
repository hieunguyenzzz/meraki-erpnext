"""Set leave_approver = xuanhoang@merakiwp.com for all active employees.

The WFH in-app PWA notification (webhook_v2/routers/wfh.py::apply_wfh_request)
routes to the employee's `leave_approver`. Employees with no leave_approver
(e.g. HR-EMP-00027) produced no in-app notification, so HR could not
approve/reject from the Notifications page even though the email arrived.

Fix: backfill every active employee's leave_approver to the HR approver.
Uses frappe.db.set_value via the meraki-leave-db-update Server Script
(extended here to allow Employee.leave_approver) to avoid frappe.client.set_value's
doc.save() validation, which throws 417 when any other link field is broken.
"""

import time

TARGET_APPROVER = "xuanhoang@merakiwp.com"
SCRIPT_NAME = "meraki-leave-db-update"   # doc name (hyphens)
SCRIPT_METHOD = "meraki_leave_db_update"  # api_method (underscores)

FULL_SCRIPT = '''doctype = frappe.form_dict.get("doctype")
name = frappe.form_dict.get("name")
fieldname = frappe.form_dict.get("fieldname")
value = frappe.form_dict.get("value")

if not all([doctype, name, fieldname]):
    frappe.throw("doctype, name, and fieldname are required")

ALLOWED = {
    "Leave Allocation": {"from_date", "new_leaves_allocated", "total_leaves_allocated", "unused_leaves"},
    "Leave Ledger Entry": {"from_date", "leaves"},
    "Employee": {"leave_approver"},
}

if doctype not in ALLOWED or fieldname not in ALLOWED[doctype]:
    frappe.throw(f"Not allowed: {doctype}.{fieldname}")

frappe.db.set_value(doctype, name, fieldname, value)
frappe.db.commit()
frappe.response["message"] = "ok"
'''


def run(client):
    # 1. Ensure the Server Script allows Employee.leave_approver.
    script = client.get("Server Script", SCRIPT_NAME)
    if not script:
        raise Exception(f"Server Script '{SCRIPT_NAME}' not found")
    if '"Employee"' not in (script.get("script") or ""):
        result = client.update("Server Script", SCRIPT_NAME, {"script": FULL_SCRIPT})
        if not result:
            raise Exception(f"Failed to extend Server Script: {SCRIPT_NAME}")
        print(f"  Extended {SCRIPT_NAME} to allow Employee.leave_approver")
        # Frappe caches Server Scripts per worker; the first call after a change
        # can hit a stale cache (500). Give the cache a moment to refresh.
        time.sleep(3)
    else:
        print(f"  {SCRIPT_NAME} already allows Employee.leave_approver")

    # 2. Backfill leave_approver for every active employee that differs.
    employees = client.get_list(
        "Employee",
        filters={"status": "Active"},
        fields=["name", "leave_approver"],
        limit=0,
    )
    updated = 0
    for emp in employees:
        if emp.get("leave_approver") == TARGET_APPROVER:
            continue
        # Retry to absorb the post-update Server Script cache race (transient 500).
        last_err = None
        for attempt in range(3):
            resp = client.session.post(
                f"{client.url}/api/method/{SCRIPT_METHOD}",
                headers=client._get_headers(),  # Content-Type: application/json
                json={
                    "doctype": "Employee",
                    "name": emp["name"],
                    "fieldname": "leave_approver",
                    "value": TARGET_APPROVER,
                },
                timeout=30,
            )
            if resp.status_code == 200:
                last_err = None
                break
            last_err = f"{resp.status_code} {resp.text[:200]}"
            time.sleep(3)
        if last_err:
            raise Exception(f"Failed to set leave_approver for {emp['name']}: {last_err}")
        updated += 1
        print(f"  Set leave_approver for {emp['name']} (was {emp.get('leave_approver')!r})")

    print(f"  Done — {updated} employee(s) updated, {len(employees)} active total")
