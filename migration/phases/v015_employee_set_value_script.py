"""
Create a Frappe Server Script API that updates Employee fields using
frappe.db.set_value — bypasses full-document link validation (e.g. invalid
leave_approver) that causes 417 errors when saving via frappe.client.set_value.
"""

SCRIPT_NAME = "meraki-set-employee-fields"
API_METHOD = "meraki_set_employee_fields"

SCRIPT_BODY = '''\
# No imports in Frappe Server Script sandbox.
# Fields are sent as flat POST params alongside employee_name.

ALLOWED_FIELDS = {
    "first_name", "middle_name", "last_name", "gender", "date_of_birth",
    "company_email", "cell_phone", "designation", "department",
    "date_of_joining", "custom_staff_roles", "ctc", "custom_insurance_salary",
    "custom_lead_commission_pct", "custom_support_commission_pct",
    "custom_assistant_commission_pct", "custom_sales_commission_pct",
}

employee_name = frappe.form_dict.get("employee_name")
if not employee_name:
    frappe.throw("employee_name is required")

updates = {k: v for k, v in frappe.form_dict.items() if k in ALLOWED_FIELDS}
for field, value in updates.items():
    frappe.db.set_value("Employee", employee_name, field, value)

if updates:
    frappe.db.commit()

frappe.response["updated"] = list(updates.keys())
'''


def run(client):
    print("v015: Creating Server Script for employee field updates...")

    # 1. Enable server scripts in System Settings (required for scripts to run)
    sys_settings = client.get("System Settings", "System Settings")
    if sys_settings and not sys_settings.get("server_script_enabled"):
        client.update("System Settings", "System Settings", {"server_script_enabled": 1})
        print("  Enabled server scripts in System Settings")
    else:
        print("  Server scripts already enabled")

    # 2. Create (or update) the Server Script
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

    print("v015: Done.")
