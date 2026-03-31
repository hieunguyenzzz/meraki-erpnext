"""Add Full/Partial Package Commission fields on Employee, Sales Information fields on Project, and salary components."""


def run(client):
    # 1. Employee custom fields: Full Package Commission % and Partial Package Commission %
    for fieldname, label, insert_after in [
        ("custom_full_package_commission_pct", "Full Package Commission %", "custom_sales_commission_pct"),
        ("custom_partial_package_commission_pct", "Partial Package Commission %", "custom_full_package_commission_pct"),
    ]:
        if client.exists("Custom Field", {"dt": "Employee", "fieldname": fieldname}):
            print(f"  Custom Field '{fieldname}' on Employee already exists, skipping")
        else:
            client.create_custom_field({
                "dt": "Employee",
                "fieldname": fieldname,
                "fieldtype": "Percent",
                "label": label,
                "insert_after": insert_after,
            })
            print(f"  Created Custom Field: {fieldname} on Employee")

    # 2. Project custom fields: Sold By + Booking Date
    for fieldname, label, fieldtype, insert_after, options in [
        ("custom_sales_person", "Sold By", "Link", "custom_assistant_5", "Employee"),
        ("custom_booking_date", "Booking Date", "Date", "custom_sales_person", None),
    ]:
        if client.exists("Custom Field", {"dt": "Project", "fieldname": fieldname}):
            print(f"  Custom Field '{fieldname}' on Project already exists, skipping")
        else:
            field_def = {
                "dt": "Project",
                "fieldname": fieldname,
                "fieldtype": fieldtype,
                "label": label,
                "insert_after": insert_after,
            }
            if options:
                field_def["options"] = options
            client.create_custom_field(field_def)
            print(f"  Created Custom Field: {fieldname} on Project")

    # 3. Salary Components: Full Package Commission + Partial Package Commission
    for comp_name, abbr in [
        ("Full Package Commission", "FPC"),
        ("Partial Package Commission", "PPC"),
    ]:
        if client.exists("Salary Component", {"name": comp_name}):
            print(f"  Salary Component exists: {comp_name}")
        else:
            client.create("Salary Component", {
                "salary_component": comp_name,
                "salary_component_abbr": abbr,
                "type": "Earning",
                "is_tax_applicable": 0,
                "depends_on_payment_days": 0,
            })
            print(f"  Created Salary Component: {comp_name}")

    # 4. Update Server Script allowlist to include new fields
    try:
        script = client.get("Server Script", "meraki_set_employee_fields")
        if not script:
            print("  Warning: Server Script 'meraki_set_employee_fields' not found")
            return
        current_script = script.get("script", "")
        if "custom_full_package_commission_pct" not in current_script:
            updated_script = current_script.replace(
                '"custom_sales_commission_pct"',
                '"custom_sales_commission_pct", "custom_full_package_commission_pct", "custom_partial_package_commission_pct"'
            )
            if updated_script != current_script:
                client.update("Server Script", "meraki_set_employee_fields", {
                    "script": updated_script,
                })
                print("  Updated Server Script allowlist with new commission fields")
            else:
                print("  Server Script: could not find insertion point, please update manually")
        else:
            print("  Server Script already has new commission fields")
    except Exception as e:
        print(f"  Warning: Could not update Server Script: {e}")
