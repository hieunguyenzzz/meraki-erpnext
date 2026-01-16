"""
Migrate staff to ERPNext Employees.

Creates:
- Department: "Wedding Planning - MWP"
- Designations: Planner, Assistant
- Custom Fields for commission percentages
- Employees from staff table
"""

from erpnext_client import ERPNextClient
from pg_client import MerakiPGClient


COMPANY = 'Meraki Wedding Planner'
COMPANY_ABBR = 'MWP'


def setup_department(erp: ERPNextClient) -> bool:
    """Create Wedding Planning department."""
    dept_name = f"Wedding Planning - {COMPANY_ABBR}"

    if erp.exists('Department', {'department_name': 'Wedding Planning'}):
        print(f"  Department exists: {dept_name}")
        return True

    data = {
        'department_name': 'Wedding Planning',
        'company': COMPANY,
        'parent_department': f'All Departments - {COMPANY_ABBR}',
    }

    result = erp.create_department(data)
    if result:
        print(f"  Created Department: {dept_name}")
        return True
    else:
        print(f"  Failed to create Department: {dept_name}")
        return False


def setup_designations(erp: ERPNextClient) -> bool:
    """Create designations for wedding staff."""
    designations = ['Lead Planner', 'Support Planner', 'Assistant', 'Coordinator']

    for designation in designations:
        if erp.exists('Designation', {'designation_name': designation}):
            print(f"  Designation exists: {designation}")
            continue

        result = erp.create_designation({'designation_name': designation})
        if result:
            print(f"  Created Designation: {designation}")
        else:
            print(f"  Failed to create Designation: {designation}")
            return False

    return True


def setup_custom_fields(erp: ERPNextClient) -> bool:
    """Create custom fields for commission percentages on Employee."""
    custom_fields = [
        {
            'dt': 'Employee',
            'fieldname': 'custom_lead_commission_pct',
            'label': 'Lead Commission %',
            'fieldtype': 'Percent',
            'insert_after': 'company_email',
            'description': 'Commission percentage when assigned as lead planner',
        },
        {
            'dt': 'Employee',
            'fieldname': 'custom_support_commission_pct',
            'label': 'Support Commission %',
            'fieldtype': 'Percent',
            'insert_after': 'custom_lead_commission_pct',
            'description': 'Commission percentage when assigned as support planner',
        },
        {
            'dt': 'Employee',
            'fieldname': 'custom_assistant_commission_pct',
            'label': 'Assistant Commission %',
            'fieldtype': 'Percent',
            'insert_after': 'custom_support_commission_pct',
            'description': 'Commission percentage when assigned as assistant',
        },
        {
            'dt': 'Employee',
            'fieldname': 'custom_sales_commission_pct',
            'label': 'Sales Commission %',
            'fieldtype': 'Percent',
            'insert_after': 'custom_assistant_commission_pct',
            'description': 'Commission percentage for sales',
        },
        {
            'dt': 'Employee',
            'fieldname': 'custom_meraki_id',
            'label': 'Meraki ID',
            'fieldtype': 'Int',
            'insert_after': 'employee_number',
            'description': 'Original ID from Meraki system',
            'unique': 1,
        },
    ]

    for field in custom_fields:
        fieldname = field['fieldname']
        if erp.exists('Custom Field', {'dt': 'Employee', 'fieldname': fieldname}):
            print(f"  Custom field exists: {fieldname}")
            continue

        result = erp.create_custom_field(field)
        if result:
            print(f"  Created Custom Field: {fieldname}")
        else:
            print(f"  Failed to create Custom Field: {fieldname}")
            # Don't fail migration if custom field exists with different config
            continue

    return True


def map_title_to_designation(title: str) -> str:
    """Map staff title to ERPNext designation."""
    if not title:
        return 'Lead Planner'

    title_lower = title.lower()
    if 'assistant' in title_lower:
        return 'Assistant'
    elif 'coordinator' in title_lower:
        return 'Coordinator'
    elif 'support' in title_lower:
        return 'Support Planner'
    else:
        return 'Lead Planner'


def map_status(pg_status: str) -> str:
    """Map PostgreSQL status to ERPNext status."""
    return 'Active' if pg_status == 'Active' else 'Left'


def migrate_employees(pg: MerakiPGClient, erp: ERPNextClient) -> dict:
    """Main migration function for employees."""
    results = {'created': 0, 'skipped': 0, 'failed': 0}

    # Setup
    print("  Setting up Department...")
    setup_department(erp)

    print("  Setting up Designations...")
    setup_designations(erp)

    print("  Setting up Custom Fields...")
    setup_custom_fields(erp)

    # Migrate staff
    staff_list = pg.get_all_staff()
    print(f"  Found {len(staff_list)} staff to migrate")

    for staff in staff_list:
        # Check if employee already exists by Meraki ID
        existing = erp.find_one('Employee', {'custom_meraki_id': staff['id']})
        if existing:
            print(f"  Skipped (exists): {staff['name']} (ID: {staff['id']})")
            results['skipped'] += 1
            continue

        # Prepare employee data
        data = {
            'employee_name': staff['name'],
            'first_name': staff['name'].split()[0] if staff['name'] else 'Unknown',
            'last_name': ' '.join(staff['name'].split()[1:]) if staff['name'] and len(staff['name'].split()) > 1 else '',
            'company': COMPANY,
            'status': map_status(staff.get('Status', 'Active')),
            'gender': 'Female',  # Default, can be updated later
            'date_of_birth': '1990-01-01',  # Placeholder
            'date_of_joining': str(staff['join_date']) if staff.get('join_date') else '2020-01-01',
            'department': f'Wedding Planning - {COMPANY_ABBR}',
            'designation': map_title_to_designation(staff.get('title')),
            'company_email': staff.get('email') or '',
            'custom_meraki_id': staff['id'],
            'custom_lead_commission_pct': float(staff.get('lead_commission') or 0),
            'custom_support_commission_pct': float(staff.get('support_commission') or 0),
            'custom_assistant_commission_pct': float(staff.get('assistant_commission') or 0),
            'custom_sales_commission_pct': float(staff.get('sales_commission') or 0),
        }

        result = erp.create_employee(data)
        if result:
            print(f"  Created: {staff['name']} (ID: {staff['id']})")
            results['created'] += 1
        else:
            print(f"  Failed: {staff['name']} (ID: {staff['id']})")
            results['failed'] += 1

    return results
