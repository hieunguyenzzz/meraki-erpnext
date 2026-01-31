"""
Module: employees
ERPNext Doctypes: Employee, Department, Designation, Gender
Source: staff table

Migrates staff members to ERPNext employees with custom fields for
commission percentages and Meraki ID tracking.
"""

from typing import Optional
from core.config import COMPANY, COMPANY_ABBR
from core.erpnext_client import ERPNextClient
from core.pg_client import MerakiPGClient


def setup_genders(erp: ERPNextClient) -> bool:
    """Create gender entries if they don't exist."""
    genders = ['Male', 'Female', 'Other']

    for gender in genders:
        if erp.exists('Gender', {'name': gender}):
            print(f"    Gender exists: {gender}")
            continue

        result = erp.create('Gender', {'gender': gender})
        if result:
            print(f"    Created Gender: {gender}")
        else:
            print(f"    Failed to create Gender: {gender}")
            return False

    return True


def setup_department(erp: ERPNextClient) -> bool:
    """Create Wedding Planning department."""
    dept_name = f"Wedding Planning - {COMPANY_ABBR}"

    if erp.exists('Department', {'department_name': 'Wedding Planning'}):
        print(f"    Department exists: {dept_name}")
        return True

    data = {
        'department_name': 'Wedding Planning',
        'company': COMPANY,
        'is_group': 0,
    }

    result = erp.create_department(data)
    if result:
        print(f"    Created Department: {dept_name}")
        return True
    else:
        print(f"    Failed to create Department: {dept_name}")
        return False


def setup_designations(erp: ERPNextClient) -> bool:
    """Create designations for wedding staff."""
    designations = ['Lead Planner', 'Support Planner', 'Assistant', 'Coordinator']

    for designation in designations:
        if erp.exists('Designation', {'designation_name': designation}):
            print(f"    Designation exists: {designation}")
            continue

        result = erp.create_designation({'designation_name': designation})
        if result:
            print(f"    Created Designation: {designation}")
        else:
            print(f"    Failed to create Designation: {designation}")
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
            print(f"    Custom field exists: {fieldname}")
            continue

        result = erp.create_custom_field(field)
        if result:
            print(f"    Created Custom Field: {fieldname}")
        else:
            print(f"    Failed to create Custom Field: {fieldname}")

    return True


def _map_title_to_designation(title: str) -> str:
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


def _map_status(pg_status: str) -> str:
    """Map PostgreSQL status to ERPNext status."""
    return 'Active' if pg_status == 'Active' else 'Left'


def setup(erp: ERPNextClient) -> bool:
    """Create prerequisites (departments, custom fields, etc.)."""
    print("  Setting up Genders...")
    setup_genders(erp)

    print("  Setting up Department...")
    setup_department(erp)

    print("  Setting up Designations...")
    setup_designations(erp)

    print("  Setting up Custom Fields...")
    setup_custom_fields(erp)

    return True


def migrate(pg: MerakiPGClient, erp: ERPNextClient, dry_run: bool = False) -> dict:
    """Main migration function for employees.

    Args:
        pg: PostgreSQL client for source data.
        erp: ERPNext API client.
        dry_run: If True, don't make any changes.

    Returns:
        dict: Migration results with created, updated, skipped, failed counts.
    """
    results = {'created': 0, 'updated': 0, 'skipped': 0, 'failed': 0}

    # Setup prerequisites
    setup(erp)

    # Migrate staff
    staff_list = pg.get_all_staff()
    print(f"  Found {len(staff_list)} staff to migrate")

    for staff in staff_list:
        # Check if employee already exists by Meraki ID
        existing = erp.find_one('Employee', {'custom_meraki_id': staff['id']})

        # Also check by name in case custom_meraki_id wasn't set before
        if not existing:
            existing = erp.find_one('Employee', {'employee_name': staff['name']})

        # Prepare employee data
        status = _map_status(staff.get('Status', 'Active'))
        data = {
            'employee_name': staff['name'],
            'first_name': staff['name'].split()[0] if staff['name'] else 'Unknown',
            'last_name': ' '.join(staff['name'].split()[1:]) if staff['name'] and len(staff['name'].split()) > 1 else '',
            'company': COMPANY,
            'status': status,
            'gender': 'Female',  # Default, can be updated later
            'date_of_birth': '1990-01-01',  # Placeholder
            'date_of_joining': str(staff['join_date']) if staff.get('join_date') else '2020-01-01',
            'department': f'Wedding Planning - {COMPANY_ABBR}',
            'designation': _map_title_to_designation(staff.get('title')),
            'company_email': staff.get('email') or '',
            'custom_meraki_id': staff['id'],
            'custom_lead_commission_pct': float(staff.get('lead_commission') or 0),
            'custom_support_commission_pct': float(staff.get('support_commission') or 0),
            'custom_assistant_commission_pct': float(staff.get('assistant_commission') or 0),
            'custom_sales_commission_pct': float(staff.get('sales_commission') or 0),
        }

        # ERPNext requires relieving_date for employees with status "Left"
        if status == 'Left':
            data['relieving_date'] = '2024-01-01'

        if dry_run:
            print(f"  [DRY RUN] Would {'update' if existing else 'create'}: {staff['name']}")
            continue

        if existing:
            employee_name = existing.get('name')
            result = erp.update('Employee', employee_name, data)
            if result:
                print(f"    Updated: {staff['name']} (ID: {staff['id']}) -> ERPNext: {employee_name}")
                results['updated'] += 1
            else:
                print(f"    Failed to update: {staff['name']} (ID: {staff['id']})")
                results['failed'] += 1
        else:
            result = erp.create_employee(data)
            if result:
                print(f"    Created: {staff['name']} (ID: {staff['id']})")
                results['created'] += 1
            else:
                print(f"    Failed: {staff['name']} (ID: {staff['id']})")
                results['failed'] += 1

    return results


def verify(erp: ERPNextClient) -> dict:
    """Verify migration results.

    Returns:
        dict: Verification results with expected, actual, issues.
    """
    employees = erp.get_list('Employee', fields=['name', 'custom_meraki_id'])
    with_meraki_id = [e for e in employees if e.get('custom_meraki_id')]

    return {
        'expected': 16,
        'actual': len(with_meraki_id),
        'issues': [] if len(with_meraki_id) == 16 else ['Employee count mismatch'],
    }


if __name__ == "__main__":
    from core.config import get_config, validate_config

    print("=" * 60)
    print("EMPLOYEE MIGRATION")
    print("=" * 60)

    config = get_config()
    if not validate_config(config):
        print("\nMigration aborted due to configuration errors.")
        exit(1)

    pg = MerakiPGClient(config['postgres'])
    erp = ERPNextClient(config['erpnext'])

    results = migrate(pg, erp)

    print("\n" + "=" * 60)
    print("MIGRATION COMPLETE")
    print("=" * 60)
    print(f"Created: {results['created']}")
    print(f"Updated: {results['updated']}")
    print(f"Skipped: {results['skipped']}")
    print(f"Failed: {results['failed']}")
    print("=" * 60)
