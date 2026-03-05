"""
Update the meraki-set-employee-fields Server Script:
- Rename the identifier param from 'employee_name' to 'employee_id'
  to free 'employee_name' for use as a settable field.
- Add 'employee_name' to ALLOWED_FIELDS so the display name
  can be updated when first_name/last_name change.
- Add fields from later migrations (custom_allowance_*, custom_display_order,
  custom_last_review_date, custom_review_notes).
"""

SCRIPT_NAME = "meraki-set-employee-fields"
API_METHOD = "meraki_set_employee_fields"

SCRIPT_BODY = '''\
# No imports in Frappe Server Script sandbox.
# Fields are sent as flat POST params alongside employee_id.

ALLOWED_FIELDS = {
    "employee_name",
    "first_name", "middle_name", "last_name", "gender", "date_of_birth",
    "company_email", "cell_phone", "designation", "department",
    "date_of_joining", "custom_staff_roles", "ctc", "custom_insurance_salary",
    "custom_lead_commission_pct", "custom_support_commission_pct",
    "custom_assistant_commission_pct", "custom_sales_commission_pct",
    "user_id",
    "custom_last_review_date", "custom_review_notes",
    "custom_allowance_hcm_full", "custom_allowance_hcm_partial",
    "custom_allowance_dest_full", "custom_allowance_dest_partial",
    "custom_display_order",
}

# Accept both 'employee_id' (new) and 'employee_name' (legacy) as identifier
emp_id = frappe.form_dict.get("employee_id") or frappe.form_dict.get("employee_name")
if not emp_id:
    frappe.throw("employee_id is required")

updates = {k: v for k, v in frappe.form_dict.items() if k in ALLOWED_FIELDS}
for field, value in updates.items():
    frappe.db.set_value("Employee", emp_id, field, value)

if updates:
    frappe.db.commit()

frappe.response["updated"] = list(updates.keys())
'''


def run(client):
    print("v030: Adding employee_name to Server Script ALLOWED_FIELDS...")

    existing = client.get("Server Script", SCRIPT_NAME)
    if existing:
        client.update("Server Script", SCRIPT_NAME, {
            "script": SCRIPT_BODY,
            "disabled": 0,
        })
        print(f"  Updated Server Script '{SCRIPT_NAME}'")
    else:
        client.create("Server Script", {
            "name": SCRIPT_NAME,
            "script_type": "API",
            "api_method": API_METHOD,
            "allow_guest": 0,
            "disabled": 0,
            "script": SCRIPT_BODY,
        })
        print(f"  Created Server Script '{SCRIPT_NAME}' → /api/method/{API_METHOD}")

    print("v030: Done.")
