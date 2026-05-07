"""Add relieving_date to meraki-set-employee-fields Server Script allowlist.

Lets the Employee Detail edit sheet record an end-of-employment date via the
existing PATCH /inquiry-api/employee/{id} endpoint without bypassing the
allowlist.
"""


ALLOWED_FIELDS_SET = """{
    "employee_name",
    "first_name", "middle_name", "last_name", "gender", "date_of_birth",
    "company_email", "cell_phone", "designation", "department",
    "date_of_joining", "custom_staff_roles", "ctc", "custom_insurance_salary",
    "custom_lead_commission_pct", "custom_support_commission_pct",
    "custom_assistant_commission_pct", "custom_sales_commission_pct",
    "custom_full_package_commission_pct", "custom_partial_package_commission_pct",
    "user_id",
    "custom_last_review_date", "custom_review_notes",
    "custom_allowance_hcm_full", "custom_allowance_hcm_partial",
    "custom_allowance_dest_full", "custom_allowance_dest_partial",
    "custom_display_order",
    "custom_number_of_dependents",
    "custom_pit_method",
    "custom_is_probation",
    "relieving_date",
}"""

DATE_FIELDS_SET = """{
    "date_of_joining", "date_of_birth", "relieving_date",
    "custom_last_review_date",
}"""

FULL_SCRIPT = f"""# No imports in Frappe Server Script sandbox.
# Fields are sent as flat POST params alongside employee_id.

ALLOWED_FIELDS = {ALLOWED_FIELDS_SET}
DATE_FIELDS = {DATE_FIELDS_SET}

# Accept both 'employee_id' (new) and 'employee_name' (legacy) as identifier
emp_id = frappe.form_dict.get("employee_id") or frappe.form_dict.get("employee_name")
if not emp_id:
    frappe.throw("employee_id is required")

updates = {{k: v for k, v in frappe.form_dict.items() if k in ALLOWED_FIELDS}}
for field, value in updates.items():
    # Empty string in a date column triggers MariaDB "Incorrect date value" — clear with None instead.
    if field in DATE_FIELDS and (value is None or value == ""):
        frappe.db.set_value("Employee", emp_id, field, None)
    else:
        frappe.db.set_value("Employee", emp_id, field, value)

if updates:
    frappe.db.commit()

frappe.response["updated"] = list(updates.keys())"""


SCRIPT_NAME = "meraki-set-employee-fields"


def run(client):
    script = client.get("Server Script", SCRIPT_NAME)
    if not script:
        print(f"  ERROR: Server Script '{SCRIPT_NAME}' not found")
        return

    current = (script.get("script") or "").strip()
    desired = FULL_SCRIPT.strip()
    if current == desired:
        print("  Server Script already up to date, skipping")
        return

    result = client.update("Server Script", SCRIPT_NAME, {"script": FULL_SCRIPT})
    if result:
        print("  Updated meraki-set-employee-fields (relieving_date + date-field clearing)")
    else:
        print("  ERROR: Failed to update Server Script")
