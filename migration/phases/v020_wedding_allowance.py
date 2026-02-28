"""
Set up Wedding Allowance system:
1. Create "Wedding Allowance" Salary Component
2. Add 4 allowance rate fields to Employee doctype
3. Add 3 audit fields to Additional Salary doctype
4. Update Server Script to allow custom_display_order updates
"""

SCRIPT_NAME = "meraki-set-employee-fields"
API_METHOD = "meraki_set_employee_fields"

SCRIPT_BODY = '''\
ALLOWED_FIELDS = {
    "first_name", "middle_name", "last_name", "gender", "date_of_birth",
    "company_email", "cell_phone", "designation", "department",
    "date_of_joining", "custom_staff_roles", "ctc", "custom_insurance_salary",
    "custom_lead_commission_pct", "custom_support_commission_pct",
    "custom_assistant_commission_pct", "custom_sales_commission_pct",
    "user_id", "custom_last_review_date",
    "custom_allowance_hcm_full", "custom_allowance_hcm_partial",
    "custom_allowance_dest_full", "custom_allowance_dest_partial",
    "custom_display_order",
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
    print("v020: Setting up Wedding Allowance system...")

    # 1. Create "Wedding Allowance" Salary Component
    existing_sc = client.get("Salary Component", "Wedding Allowance")
    if not existing_sc:
        client.create("Salary Component", {
            "salary_component": "Wedding Allowance",
            "salary_component_abbr": "WA",
            "type": "Earning",
            "is_tax_applicable": 0,
            "depends_on_payment_days": 0,
        })
        print("  Created Salary Component: Wedding Allowance")
    else:
        print("  Salary Component 'Wedding Allowance' already exists")

    # 2. Add allowance rate fields to Employee
    allowance_fields = [
        ("custom_allowance_hcm_full", "HCM - Full Package Allowance"),
        ("custom_allowance_hcm_partial", "HCM - Partial Allowance"),
        ("custom_allowance_dest_full", "Destination - Full Package Allowance"),
        ("custom_allowance_dest_partial", "Destination - Partial Allowance"),
    ]
    for fieldname, label in allowance_fields:
        existing = client.get_list("Custom Field", filters={"dt": "Employee", "fieldname": fieldname}, limit=1)
        if not existing:
            client.create("Custom Field", {
                "dt": "Employee",
                "fieldname": fieldname,
                "label": label,
                "fieldtype": "Currency",
                "default": "0",
                "hidden": 0,
            })
            print(f"  Created Employee field: {fieldname}")
        else:
            print(f"  Employee field exists: {fieldname}")

    # 3. Add custom_display_order field to Employee
    existing_order = client.get_list("Custom Field", filters={"dt": "Employee", "fieldname": "custom_display_order"}, limit=1)
    if not existing_order:
        client.create("Custom Field", {
            "dt": "Employee",
            "fieldname": "custom_display_order",
            "label": "Display Order",
            "fieldtype": "Int",
            "default": "0",
            "hidden": 1,
        })
        print("  Created Employee field: custom_display_order")
    else:
        print("  Employee field exists: custom_display_order")

    # 4. Add audit fields to Additional Salary
    add_sal_fields = [
        ("custom_wedding_project", "Wedding Project", "Link", "Project"),
        ("custom_wedding_type", "Wedding Type", "Select", "HCM\nDestination"),
        ("custom_service_type", "Service Type", "Select", "Full Package\nPartial\nCoordinator"),
    ]
    for fieldname, label, fieldtype, options in add_sal_fields:
        existing = client.get_list("Custom Field", filters={"dt": "Additional Salary", "fieldname": fieldname}, limit=1)
        if not existing:
            field_data = {
                "dt": "Additional Salary",
                "fieldname": fieldname,
                "label": label,
                "fieldtype": fieldtype,
                "hidden": 0,
            }
            if options:
                field_data["options"] = options
            client.create("Custom Field", field_data)
            print(f"  Created Additional Salary field: {fieldname}")
        else:
            print(f"  Additional Salary field exists: {fieldname}")

    # 5. Update Server Script to include new ALLOWED_FIELDS
    existing_script = client.get("Server Script", SCRIPT_NAME)
    if existing_script:
        client.update("Server Script", SCRIPT_NAME, {"script": SCRIPT_BODY, "disabled": 0})
        print("  Updated Server Script with new ALLOWED_FIELDS")
    else:
        client.create("Server Script", {
            "name": SCRIPT_NAME,
            "script_type": "API",
            "api_method": API_METHOD,
            "allow_guest": 0,
            "disabled": 0,
            "script": SCRIPT_BODY,
        })
        print("  Created Server Script")

    print("v020: Done.")
