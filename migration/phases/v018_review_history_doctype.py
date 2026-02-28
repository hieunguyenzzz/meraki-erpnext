"""
Create the Meraki Review DocType for tracking employee performance review history.
Also update the meraki_set_employee_fields Server Script to allow setting
custom_last_review_date on Employee records.
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
    "user_id", "custom_last_review_date",
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
    print("v018: Creating Meraki Review DocType and updating Server Script...")

    # 1. Create Meraki Review DocType if it doesn't exist
    existing_dt = client.get_list(
        "DocType", filters={"name": "Meraki Review"}, fields=["name"], limit=1
    )
    if not existing_dt:
        client.create("DocType", {
            "name": "Meraki Review",
            "module": "HR",
            "custom": 1,
            "is_submittable": 0,
            "quick_entry": 1,
            "track_changes": 1,
            "fields": [
                {
                    "fieldname": "employee",
                    "fieldtype": "Link",
                    "options": "Employee",
                    "label": "Employee",
                    "reqd": 1,
                    "in_list_view": 1,
                },
                {
                    "fieldname": "employee_name",
                    "fieldtype": "Data",
                    "label": "Employee Name",
                    "fetch_from": "employee.employee_name",
                    "read_only": 1,
                    "in_list_view": 1,
                },
                {
                    "fieldname": "review_date",
                    "fieldtype": "Date",
                    "label": "Review Date",
                    "reqd": 1,
                    "in_list_view": 1,
                },
                {
                    "fieldname": "review_time",
                    "fieldtype": "Time",
                    "label": "Review Time",
                },
                {
                    "fieldname": "notes",
                    "fieldtype": "Long Text",
                    "label": "Notes",
                },
                {
                    "fieldname": "participants",
                    "fieldtype": "Small Text",
                    "label": "Participants (JSON)",
                },
                {
                    "fieldname": "google_event_id",
                    "fieldtype": "Small Text",
                    "label": "Google Event ID",
                },
            ],
            "permissions": [
                {"role": "HR Manager", "read": 1, "write": 1, "create": 1, "delete": 1},
                {"role": "HR User", "read": 1, "write": 1, "create": 1},
                {"role": "System Manager", "read": 1, "write": 1, "create": 1, "delete": 1},
            ],
        })
        print("  Created DocType 'Meraki Review'")
    else:
        print("  DocType 'Meraki Review' already exists — skipping")

    # 2. Update Server Script to include custom_last_review_date
    existing_script = client.get("Server Script", SCRIPT_NAME)
    if existing_script:
        client.update("Server Script", SCRIPT_NAME, {
            "script": SCRIPT_BODY,
            "disabled": 0,
        })
        print(f"  Updated Server Script '{SCRIPT_NAME}' with custom_last_review_date field")
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

    print("v018: Done.")
