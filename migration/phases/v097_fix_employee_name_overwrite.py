"""Stop meraki_set_employee_fields overwriting Employee.employee_name (MWP-74).

Root cause: the Server Script read the employee identifier from
`employee_id` OR `employee_name`, while also allowing `employee_name` as a
writable field. Callers that sent the Employee ID as `employee_name` therefore
overwrote the real name with the ID (e.g. "HR-EMP-00010"), and Leave
Applications copied the bad value into their notification emails.

1. Server Script: read the identifier from `employee_id` only.
2. Employee: rebuild employee_name (as ERPNext's set_employee_name does) where
   it equals the ID.
3. Backfill employee_name on documents that copied the bad value. Many are
   submitted, so this is done with frappe.db.set_value row by row in a
   temporary Administrator-guarded Server Script that is deleted at the end.
"""

import time

SCRIPT_NAME = "meraki-set-employee-fields"
OLD_LINE = 'emp_id = frappe.form_dict.get("employee_id") or frappe.form_dict.get("employee_name")'
NEW_LINE = 'emp_id = frappe.form_dict.get("employee_id")'
OLD_COMMENT = "# Accept both 'employee_id' (new) and 'employee_name' (legacy) as identifier"
NEW_COMMENT = "# Identifier is 'employee_id' only; 'employee_name' is a writable field, never an identifier (MWP-74)."

TMP_SCRIPT_NAME = "meraki-tmp-fix-employee-name"
TMP_API_METHOD = "meraki_tmp_fix_employee_name"

BACKFILL_DOCTYPES = [
    "Leave Application", "Leave Allocation", "Leave Ledger Entry", "Attendance",
    "Attendance Request", "Salary Slip", "Salary Structure Assignment",
    "Additional Salary", "Payroll Employee Detail", "Meraki Review",
]

TMP_SCRIPT = '''if frappe.session.user != "Administrator":
    frappe.throw("Not permitted", frappe.PermissionError)

DOCTYPES = %r
counts = {}
real_names = {}

# Same rule as ERPNext's Employee.set_employee_name.
for e in frappe.get_all("Employee", fields=["name", "employee_name", "first_name", "middle_name", "last_name"]):
    full_name = " ".join([p for p in [e.first_name, e.middle_name, e.last_name] if p])
    if e.employee_name == e.name and full_name:
        frappe.db.set_value("Employee", e.name, "employee_name", full_name, update_modified=False)
        counts["Employee"] = counts.get("Employee", 0) + 1
        real_names[e.name] = full_name
    elif e.employee_name != e.name:
        real_names[e.name] = e.employee_name

for dt in DOCTYPES:
    counts[dt] = 0
    if not frappe.db.exists("DocType", dt):
        continue
    for row in frappe.get_all(dt, fields=["name", "employee", "employee_name"]):
        if row.employee_name == row.employee and row.employee in real_names:
            frappe.db.set_value(dt, row.name, "employee_name", real_names[row.employee], update_modified=False)
            counts[dt] = counts[dt] + 1

frappe.db.commit()
frappe.response["counts"] = counts
''' % (BACKFILL_DOCTYPES,)


def _fix_server_script(client):
    script = client.get("Server Script", SCRIPT_NAME)
    if not script:
        raise Exception(f"Server Script '{SCRIPT_NAME}' not found")
    current = script.get("script") or ""
    if OLD_LINE not in current:
        if NEW_LINE in current:
            print(f"  {SCRIPT_NAME} already reads employee_id only, skipping")
            return
        raise Exception(f"Expected identifier line not found in {SCRIPT_NAME}")
    updated = current.replace(OLD_LINE, NEW_LINE).replace(OLD_COMMENT, NEW_COMMENT)
    if not client.update("Server Script", SCRIPT_NAME, {"script": updated}):
        raise Exception(f"Failed to update {SCRIPT_NAME}")
    print(f"  {SCRIPT_NAME}: identifier now read from employee_id only")


def _run_tmp_script(client):
    if client.get("Server Script", TMP_SCRIPT_NAME):
        client.delete("Server Script", TMP_SCRIPT_NAME)
    if not client.create("Server Script", {
        "name": TMP_SCRIPT_NAME,
        "script_type": "API",
        "api_method": TMP_API_METHOD,
        "allow_guest": 0,
        "disabled": 0,
        "script": TMP_SCRIPT,
    }):
        raise Exception("Failed to create temporary Server Script")
    try:
        last_err = None
        for _ in range(3):
            # Server Scripts are cached per worker; a fresh one can 500 once.
            resp = client.session.post(
                f"{client.url}/api/method/{TMP_API_METHOD}",
                headers=client._get_headers(),
                json={},
                timeout=120,
            )
            if resp.status_code == 200:
                counts = resp.json().get("counts", {})
                for name, n in counts.items():
                    print(f"  {name}: {n} row(s) fixed")
                return
            last_err = f"{resp.status_code} {resp.text[:300]}"
            time.sleep(3)
        raise Exception(f"Backfill failed: {last_err}")
    finally:
        client.delete("Server Script", TMP_SCRIPT_NAME)
        print(f"  Deleted temporary Server Script {TMP_SCRIPT_NAME}")


def run(client):
    _fix_server_script(client)
    _run_tmp_script(client)
