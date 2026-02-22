"""
Module: payroll
ERPNext Doctypes: Salary Component, Salary Structure, Salary Structure Assignment
Source: staff table (salary field)

Sets up the payroll prerequisites (Salary Component, Salary Structure)
and creates Salary Structure Assignments for each employee with a salary.
"""

from core.config import COMPANY
from core.erpnext_client import ERPNextClient
from core.pg_client import MerakiPGClient


def setup(erp: ERPNextClient) -> bool:
    """Create Salary Component and Salary Structure."""

    # 1. Salary Component: Basic Salary
    if erp.exists('Salary Component', {'name': 'Basic Salary'}):
        print("    Salary Component exists: Basic Salary")
    else:
        result = erp.create('Salary Component', {
            'salary_component': 'Basic Salary',
            'salary_component_abbr': 'BS',
            'type': 'Earning',
        })
        if result:
            print("    Created Salary Component: Basic Salary")
        else:
            print("    Failed to create Salary Component: Basic Salary")
            return False

    # 2-4. Commission Salary Components
    commission_components = [
        {"salary_component": "Lead Planner Commission",    "salary_component_abbr": "LPC"},
        {"salary_component": "Support Planner Commission", "salary_component_abbr": "SPC"},
        {"salary_component": "Assistant Commission",       "salary_component_abbr": "AC"},
    ]
    for comp in commission_components:
        if erp.exists('Salary Component', {'name': comp['salary_component']}):
            print(f"    Salary Component exists: {comp['salary_component']}")
        else:
            result = erp.create('Salary Component', {
                **comp,
                'type': 'Earning',
                'is_tax_applicable': 0,
                'depends_on_payment_days': 0,
            })
            if result:
                print(f"    Created Salary Component: {comp['salary_component']}")
            else:
                print(f"    Failed to create Salary Component: {comp['salary_component']}")
                return False

    # 3. Salary Structure: Monthly Salary
    existing_ss = erp.find_one('Salary Structure', {'name': 'Monthly Salary'})
    if existing_ss:
        print("    Salary Structure exists: Monthly Salary")
        # Submit if still draft
        if existing_ss.get('docstatus') == 0:
            print("    Submitting Salary Structure: Monthly Salary")
            erp.submit_document('Salary Structure', 'Monthly Salary')
    else:
        result = erp.create('Salary Structure', {
            'name': 'Monthly Salary',
            'payroll_frequency': 'Monthly',
            'currency': 'VND',
            'company': COMPANY,
            'is_active': 'Yes',
            'earnings': [{
                'salary_component': 'Basic Salary',
                'abbr': 'BS',
                'formula': 'base',
                'amount_based_on_formula': 1,
            }],
        })
        if result:
            ss_name = result.get('name', 'Monthly Salary')
            print(f"    Created Salary Structure: {ss_name}")
            # Submit it
            sub = erp.submit_document('Salary Structure', ss_name)
            if sub:
                print(f"    Submitted Salary Structure: {ss_name}")
            else:
                print(f"    Failed to submit Salary Structure: {ss_name}")
                return False
        else:
            print("    Failed to create Salary Structure: Monthly Salary")
            return False

    return True


def migrate(pg: MerakiPGClient, erp: ERPNextClient, dry_run: bool = False) -> dict:
    """Create Salary Structure Assignments for employees with salary data.

    Args:
        pg: PostgreSQL client for source data.
        erp: ERPNext API client.
        dry_run: If True, don't make any changes.

    Returns:
        dict: Migration results with created, skipped, failed counts.
    """
    results = {'created': 0, 'skipped': 0, 'failed': 0}

    # Setup prerequisites first
    setup(erp)

    staff_list = pg.get_staff_with_salary()
    print(f"  Found {len(staff_list)} staff with salary data")

    for staff in staff_list:
        meraki_id = staff['id']
        staff_name = staff['name']

        # Find matching ERPNext employee
        employee = erp.find_one('Employee', {'custom_meraki_id': meraki_id})
        if not employee:
            print(f"    No ERPNext employee for Meraki ID {meraki_id} ({staff_name}), skipping")
            results['skipped'] += 1
            continue

        emp_id = employee['name']

        # Check if assignment already exists
        existing = erp.find_one('Salary Structure Assignment', {
            'employee': emp_id,
            'salary_structure': 'Monthly Salary',
            'docstatus': 1,
        })
        if existing:
            print(f"    Assignment exists for {staff_name} ({emp_id}), skipping")
            results['skipped'] += 1
            continue

        if dry_run:
            print(f"  [DRY RUN] Would create assignment for {staff_name} ({emp_id})")
            continue

        from_date = str(staff['join_date']) if staff.get('join_date') else '2020-01-01'
        base = float(staff['salary'])

        data = {
            'employee': emp_id,
            'salary_structure': 'Monthly Salary',
            'company': COMPANY,
            'currency': 'VND',
            'from_date': from_date,
            'base': base,
        }

        result = erp.create('Salary Structure Assignment', data)
        if result:
            ssa_name = result.get('name')
            print(f"    Created assignment for {staff_name} ({emp_id}), base={base:,.0f}")
            # Submit the assignment
            sub = erp.submit_document('Salary Structure Assignment', ssa_name)
            if sub:
                print(f"    Submitted assignment: {ssa_name}")
                results['created'] += 1
            else:
                print(f"    Failed to submit assignment: {ssa_name}")
                results['failed'] += 1
        else:
            print(f"    Failed to create assignment for {staff_name} ({emp_id})")
            results['failed'] += 1

    return results


def verify(erp: ERPNextClient) -> dict:
    """Verify payroll setup.

    Returns:
        dict: Verification results.
    """
    issues = []

    # Check Salary Component
    if not erp.exists('Salary Component', {'name': 'Basic Salary'}):
        issues.append('Missing Salary Component: Basic Salary')

    # Check Salary Structure
    ss = erp.find_one('Salary Structure', {'name': 'Monthly Salary'})
    if not ss:
        issues.append('Missing Salary Structure: Monthly Salary')
    elif ss.get('docstatus') != 1:
        issues.append('Salary Structure "Monthly Salary" is not submitted')

    # Count assignments
    assignments = erp.get_list('Salary Structure Assignment',
                               filters=[['docstatus', '=', 1]],
                               fields=['name'])
    assignment_count = len(assignments) if assignments else 0

    return {
        'salary_component': 'Basic Salary' if not any('Component' in i for i in issues) else 'Missing',
        'salary_structure': 'Monthly Salary (submitted)' if ss and ss.get('docstatus') == 1 else 'Missing/Draft',
        'assignments': assignment_count,
        'issues': issues,
    }


if __name__ == "__main__":
    from core.config import get_config, validate_config

    print("=" * 60)
    print("PAYROLL MIGRATION")
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
    print(f"Skipped: {results['skipped']}")
    print(f"Failed: {results['failed']}")
    print("=" * 60)
