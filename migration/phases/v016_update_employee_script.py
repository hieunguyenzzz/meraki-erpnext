"""
Update the meraki-set-employee-fields Server Script to add 'user_id'
to ALLOWED_FIELDS so it can be updated after a User rename.
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
    "user_id",
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
    print("v016: Adding user_id to Server Script ALLOWED_FIELDS...")

    existing = client.get("Server Script", SCRIPT_NAME)
    if existing:
        client.update("Server Script", SCRIPT_NAME, {
            "script": SCRIPT_BODY,
            "disabled": 0,
        })
        print(f"  Updated Server Script '{SCRIPT_NAME}' with user_id field")
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

    print("v016: Done.")
