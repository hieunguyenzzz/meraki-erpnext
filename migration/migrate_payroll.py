"""
Migrate payroll records to ERPNext Salary Slips.

Creates:
- Salary Components for different earning types
- Salary Structure for wedding staff
- Salary Slips for historical payroll records
"""

from datetime import datetime
from erpnext_client import ERPNextClient
from pg_client import MerakiPGClient


COMPANY = 'Meraki Wedding Planner'
COMPANY_ABBR = 'MWP'


def setup_salary_components(erp: ERPNextClient) -> bool:
    """Create salary components for payroll."""
    components = [
        {'salary_component': 'Basic Salary', 'type': 'Earning', 'abbr': 'BS'},
        {'salary_component': 'Lead Planner Commission', 'type': 'Earning', 'abbr': 'LPC'},
        {'salary_component': 'Support Planner Commission', 'type': 'Earning', 'abbr': 'SPC'},
        {'salary_component': 'Assistant Commission', 'type': 'Earning', 'abbr': 'AC'},
        {'salary_component': 'Bonus', 'type': 'Earning', 'abbr': 'BON'},
    ]

    for comp in components:
        name = comp['salary_component']
        if erp.exists('Salary Component', {'salary_component': name}):
            print(f"    Component exists: {name}")
            continue

        data = {
            'salary_component': name,
            'salary_component_abbr': comp['abbr'],
            'type': comp['type'],
            'company': COMPANY,
        }

        result = erp.create_salary_component(data)
        if result:
            print(f"    Created: {name}")
        else:
            print(f"    Failed: {name}")

    return True


def setup_custom_fields(erp: ERPNextClient) -> bool:
    """Create custom fields on Salary Slip."""
    custom_fields = [
        {
            'dt': 'Salary Slip',
            'fieldname': 'custom_meraki_payroll_id',
            'label': 'Meraki Payroll ID',
            'fieldtype': 'Int',
            'insert_after': 'employee_name',
            'description': 'Original payroll ID from Meraki system',
            'unique': 1,
        },
    ]

    for field in custom_fields:
        fieldname = field['fieldname']
        if erp.exists('Custom Field', {'dt': 'Salary Slip', 'fieldname': fieldname}):
            print(f"    Custom field exists: {fieldname}")
            continue

        result = erp.create_custom_field(field)
        if result:
            print(f"    Created: {fieldname}")
        else:
            print(f"    Failed: {fieldname}")

    return True


def get_employee_by_meraki_id(erp: ERPNextClient, staff_id: int) -> dict:
    """Get ERPNext Employee by Meraki staff ID."""
    if not staff_id:
        return None
    return erp.find_one('Employee', {'custom_meraki_id': staff_id})


def create_salary_slip(erp: ERPNextClient, payroll: dict, employee: dict) -> dict:
    """Create Salary Slip for a payroll record."""
    posting_date = str(payroll['date']) if payroll.get('date') else datetime.now().strftime('%Y-%m-%d')

    # Build earnings list
    earnings = []

    if payroll.get('salary'):
        earnings.append({
            'salary_component': 'Basic Salary',
            'amount': float(payroll['salary']),
        })

    if payroll.get('lead_commission'):
        earnings.append({
            'salary_component': 'Lead Planner Commission',
            'amount': float(payroll['lead_commission']),
        })

    if payroll.get('support_commission'):
        earnings.append({
            'salary_component': 'Support Planner Commission',
            'amount': float(payroll['support_commission']),
        })

    if payroll.get('assistant_commission'):
        earnings.append({
            'salary_component': 'Assistant Commission',
            'amount': float(payroll['assistant_commission']),
        })

    if payroll.get('bonus'):
        earnings.append({
            'salary_component': 'Bonus',
            'amount': float(payroll['bonus']),
        })

    # Calculate totals
    gross_pay = sum(e['amount'] for e in earnings)

    data = {
        'employee': employee.get('name'),
        'employee_name': employee.get('employee_name'),
        'company': COMPANY,
        'posting_date': posting_date,
        'start_date': posting_date[:8] + '01',  # First day of month
        'end_date': posting_date,
        'custom_meraki_payroll_id': payroll['id'],
        'earnings': earnings,
        'gross_pay': gross_pay,
        'net_pay': gross_pay,
    }

    return erp.create_salary_slip(data)


def migrate_payroll(pg: MerakiPGClient, erp: ERPNextClient) -> dict:
    """Main migration function for payroll."""
    results = {'created': 0, 'skipped': 0, 'failed': 0}

    # Setup salary components
    print("  Setting up Salary Components...")
    setup_salary_components(erp)

    # Setup custom fields
    print("  Setting up Custom Fields...")
    setup_custom_fields(erp)

    # Migrate payroll records
    payroll_records = pg.get_all_payroll()
    print(f"  Found {len(payroll_records)} payroll records to migrate")

    for payroll in payroll_records:
        # Check if payroll already exists
        if erp.exists('Salary Slip', {'custom_meraki_payroll_id': payroll['id']}):
            print(f"  Skipped (exists): Payroll {payroll['id']} - {payroll.get('staff_name', 'Unknown')}")
            results['skipped'] += 1
            continue

        # Get employee
        employee = get_employee_by_meraki_id(erp, payroll.get('staff_id'))
        if not employee:
            print(f"  Failed (no employee): Payroll {payroll['id']} - staff_id {payroll.get('staff_id')}")
            results['failed'] += 1
            continue

        # Create salary slip
        result = create_salary_slip(erp, payroll, employee)
        if result:
            total = float(payroll.get('amount', 0))
            print(f"  Created: Payroll {payroll['id']} - {payroll.get('staff_name')} ({total:,.0f} VND)")
            results['created'] += 1
        else:
            print(f"  Failed: Payroll {payroll['id']} - {payroll.get('staff_name')}")
            results['failed'] += 1

    return results
