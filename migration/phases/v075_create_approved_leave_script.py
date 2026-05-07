"""Add meraki-create-approved-leave Server Script.

Creates a submitted Leave Application + matching Leave Ledger Entry directly
via DB writes, bypassing ERPNext's `validate_leave_balance`. Needed because
ERPNext's get_leave_balance_on misbehaves with overlapping allocations
(e.g. when a carry-over allocation and an annual allocation share from_date),
returning a balance lower than the actual entitlement.

Our backend (`webhook_v2/routers/leaves.py::_available_for_leave_date`) is the
authoritative balance check; this script trusts that and skips ERPNext's
validation.
"""


SCRIPT_NAME = "meraki-create-approved-leave"
API_METHOD = "meraki_create_approved_leave"


FULL_SCRIPT = '''emp = frappe.form_dict.get("employee")
leave_type = frappe.form_dict.get("leave_type")
from_date = frappe.form_dict.get("from_date")
to_date = frappe.form_dict.get("to_date")
status = frappe.form_dict.get("status") or "Approved"
half_day = int(frappe.form_dict.get("half_day") or 0)
half_day_period = frappe.form_dict.get("half_day_period") or ""
description = frappe.form_dict.get("description") or ""
leave_approver = frappe.form_dict.get("leave_approver") or ""
total_leave_days = float(frappe.form_dict.get("total_leave_days") or 0)

if not (emp and leave_type and from_date and to_date):
    frappe.throw("employee, leave_type, from_date, to_date are required")
if total_leave_days <= 0:
    frappe.throw("total_leave_days must be > 0")

emp_doc = frappe.db.get_value(
    "Employee", emp,
    ["company", "department", "leave_approver", "employee_name"],
    as_dict=True,
)
if not emp_doc:
    frappe.throw("Employee not found: " + emp)
if not leave_approver:
    leave_approver = emp_doc.leave_approver or ""

# Pick the shortest-span allocation containing from_date (carry-over before annual).
allocs = frappe.db.sql(
    """
    SELECT name, from_date, to_date
    FROM `tabLeave Allocation`
    WHERE employee=%s AND leave_type=%s AND docstatus=1
      AND from_date <= %s AND to_date >= %s
    ORDER BY DATEDIFF(to_date, from_date) ASC, from_date ASC
    LIMIT 1
    """,
    (emp, leave_type, from_date, from_date),
    as_dict=True,
)

new_doc = frappe.get_doc({
    "doctype": "Leave Application",
    "employee": emp,
    "employee_name": emp_doc.employee_name,
    "leave_type": leave_type,
    "from_date": from_date,
    "to_date": to_date,
    "total_leave_days": total_leave_days,
    "status": status,
    "half_day": half_day,
    "half_day_period": half_day_period if half_day else "",
    "half_day_date": from_date if half_day else None,
    "description": description,
    "leave_approver": leave_approver,
    "company": emp_doc.company,
    "department": emp_doc.department,
    "posting_date": frappe.utils.today(),
    "docstatus": 1,
})
new_doc.flags.ignore_validate = True
new_doc.flags.ignore_mandatory = True
new_doc.flags.ignore_permissions = True
new_doc.db_insert()

is_lwp = 1 if leave_type == "Leave Without Pay" else 0
allocation_name = allocs[0].name if (allocs and not is_lwp) else None

ledger = frappe.get_doc({
    "doctype": "Leave Ledger Entry",
    "employee": emp,
    "leave_type": leave_type,
    "transaction_type": "Leave Application",
    "transaction_name": new_doc.name,
    "leaves": -total_leave_days,
    "from_date": from_date,
    "to_date": to_date,
    "is_carry_forward": 0,
    "is_lwp": is_lwp,
    "leave_allocation": allocation_name,
    "company": emp_doc.company,
    "docstatus": 1,
})
ledger.flags.ignore_validate = True
ledger.flags.ignore_permissions = True
ledger.db_insert()

frappe.db.commit()
frappe.response["leave_application"] = new_doc.name
'''


def run(client):
    existing = client.get("Server Script", SCRIPT_NAME)

    if existing:
        current_script = (existing.get("script") or "").strip()
        needs_script = current_script != FULL_SCRIPT.strip()
        needs_method = (existing.get("api_method") or "") != API_METHOD
        needs_enable = bool(existing.get("disabled"))
        if not (needs_script or needs_method or needs_enable):
            print("  Server Script already up to date, skipping")
            return
        update_payload = {}
        if needs_script:
            update_payload["script"] = FULL_SCRIPT
        if needs_method:
            update_payload["api_method"] = API_METHOD
        if needs_enable:
            update_payload["disabled"] = 0
        result = client.update("Server Script", SCRIPT_NAME, update_payload)
        if result:
            print(f"  Updated meraki-create-approved-leave Server Script ({', '.join(update_payload.keys())})")
        else:
            print("  ERROR: Failed to update Server Script")
        return

    result = client.create("Server Script", {
        "name": SCRIPT_NAME,
        "script_type": "API",
        "api_method": API_METHOD,
        "allow_guest": 0,
        "disabled": 0,
        "script": FULL_SCRIPT,
    })
    if result:
        print("  Created meraki-create-approved-leave Server Script")
    else:
        print("  ERROR: Failed to create Server Script")
