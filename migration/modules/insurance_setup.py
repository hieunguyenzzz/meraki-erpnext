"""
Module: insurance_setup
ERPNext Doctypes: Custom Field, Salary Component, Salary Structure

Setup script for Vietnamese Social Insurance (BHXH) deductions.
- Adds custom_insurance_salary field to Employee
- Creates 3 deduction salary components (BHXH, BHYT, BHTN)
- Amends the active Salary Structure to include deduction rows
- Populates custom_insurance_salary on existing employees from their assignment base
"""

from core.config import COMPANY
from core.erpnext_client import ERPNextClient


INSURANCE_COMPONENTS = [
    {
        'salary_component': 'BHXH (Employee)',
        'salary_component_abbr': 'BHXH',
        'formula': 'custom_insurance_salary * 0.08',
    },
    {
        'salary_component': 'BHYT (Employee)',
        'salary_component_abbr': 'BHYT',
        'formula': 'custom_insurance_salary * 0.015',
    },
    {
        'salary_component': 'BHTN (Employee)',
        'salary_component_abbr': 'BHTN',
        'formula': 'custom_insurance_salary * 0.01',
    },
]


def _get_active_salary_structure(erp: ERPNextClient) -> dict | None:
    """Return the currently submitted salary structure derived from 'Monthly Salary'.

    After amendment, the original 'Monthly Salary' is cancelled and a new doc
    (amended_from='Monthly Salary') becomes active. We look for either.
    """
    # Check for an amended version first (docstatus=1, amended_from='Monthly Salary')
    amended = erp.get_list(
        'Salary Structure',
        filters=[['amended_from', '=', 'Monthly Salary'], ['docstatus', '=', 1]],
        fields=['name', 'docstatus', 'amended_from'],
    )
    if amended:
        return erp.get('Salary Structure', amended[-1]['name'])

    # Fall back to the original
    original = erp.get('Salary Structure', 'Monthly Salary')
    if original and original.get('docstatus') == 1:
        return original

    return None


def _cancel_document(erp: ERPNextClient, doctype: str, name: str) -> bool:
    """Cancel a submitted document via frappe.client.cancel."""
    try:
        response = erp.session.post(
            f"{erp.url}/api/method/frappe.client.cancel",
            headers=erp._get_headers(),
            json={'doctype': doctype, 'name': name},
            timeout=30,
        )
        if response.status_code == 200:
            return True
        print(f"    Error cancelling {doctype}/{name}: {response.status_code} - {response.text}")
        return False
    except Exception as e:
        print(f"    Error cancelling {doctype}/{name}: {e}")
        return False


def _amend_document(erp: ERPNextClient, doctype: str, name: str) -> dict | None:
    """Amend a cancelled document and return the new draft doc."""
    try:
        response = erp.session.post(
            f"{erp.url}/api/method/frappe.client.amend_doc",
            headers=erp._get_headers(),
            json={'doc': {'doctype': doctype, 'name': name}},
            timeout=30,
        )
        if response.status_code == 200:
            return response.json().get('message')
        print(f"    Error amending {doctype}/{name}: {response.status_code} - {response.text}")
        return None
    except Exception as e:
        print(f"    Error amending {doctype}/{name}: {e}")
        return None


def _structure_has_deductions(ss: dict) -> bool:
    """Return True if all 3 insurance components are already in the deductions table."""
    existing_abbrs = {row.get('abbr') for row in (ss.get('deductions') or [])}
    required = {'BHXH', 'BHYT', 'BHTN'}
    return required.issubset(existing_abbrs)


def setup(erp: ERPNextClient) -> bool:
    """Configure ERPNext for BHXH insurance deductions."""

    # 1. Custom field: custom_insurance_salary on Employee
    if erp.exists('Custom Field', {'dt': 'Employee', 'fieldname': 'custom_insurance_salary'}):
        print("    Custom Field exists: Employee.custom_insurance_salary")
    else:
        result = erp.create('Custom Field', {
            'dt': 'Employee',
            'fieldname': 'custom_insurance_salary',
            'fieldtype': 'Currency',
            'label': 'Insurance Salary (BHXH)',
            'insert_after': 'ctc',
            'options': 'VND',
        })
        if result:
            print("    Created Custom Field: Employee.custom_insurance_salary")
        else:
            print("    Failed to create Custom Field: Employee.custom_insurance_salary")
            return False

    # 2. Deduction salary components
    for comp in INSURANCE_COMPONENTS:
        name = comp['salary_component']
        if erp.exists('Salary Component', {'name': name}):
            print(f"    Salary Component exists: {name}")
        else:
            result = erp.create('Salary Component', {
                'salary_component': name,
                'salary_component_abbr': comp['salary_component_abbr'],
                'type': 'Deduction',
                'formula': comp['formula'],
                'amount_based_on_formula': 1,
                'depends_on_payment_days': 0,
            })
            if result:
                print(f"    Created Salary Component: {name}")
            else:
                print(f"    Failed to create Salary Component: {name}")
                return False

    # 3. Amend Salary Structure to add deduction rows
    active_ss = _get_active_salary_structure(erp)
    if not active_ss:
        print("    ERROR: No active Salary Structure found (expected 'Monthly Salary')")
        return False

    active_name = active_ss['name']

    if _structure_has_deductions(active_ss):
        print(f"    Salary Structure already has insurance deductions: {active_name}")
    else:
        print(f"    Amending Salary Structure: {active_name}")

        # Cancel the active structure
        cancelled = _cancel_document(erp, 'Salary Structure', active_name)
        if not cancelled:
            print(f"    Failed to cancel Salary Structure: {active_name}")
            return False
        print(f"    Cancelled Salary Structure: {active_name}")

        # Amend to get a new draft
        amended_doc = _amend_document(erp, 'Salary Structure', active_name)
        if not amended_doc:
            print(f"    Failed to amend Salary Structure: {active_name}")
            return False

        new_name = amended_doc.get('name')
        print(f"    Amended Salary Structure: {new_name}")

        # Build deduction rows from the amended doc's existing deductions + new ones
        existing_deductions = amended_doc.get('deductions') or []
        new_deductions = existing_deductions + [
            {
                'salary_component': comp['salary_component'],
                'abbr': comp['salary_component_abbr'],
                'formula': comp['formula'],
                'amount_based_on_formula': 1,
                'depends_on_payment_days': 0,
            }
            for comp in INSURANCE_COMPONENTS
        ]

        updated = erp.update('Salary Structure', new_name, {'deductions': new_deductions})
        if not updated:
            print(f"    Failed to update deductions on: {new_name}")
            return False
        print(f"    Updated deductions on: {new_name}")

        submitted = erp.submit_document('Salary Structure', new_name)
        if not submitted:
            print(f"    Failed to submit Salary Structure: {new_name}")
            return False
        print(f"    Submitted Salary Structure: {new_name}")

    # 4. Populate custom_insurance_salary for all employees
    assignments = erp.get_list(
        'Salary Structure Assignment',
        filters=[['salary_structure', 'like', 'Monthly Salary%'], ['docstatus', '=', 1]],
        fields=['name', 'employee', 'base'],
    )
    print(f"    Found {len(assignments)} salary structure assignments to process")

    for assignment in assignments:
        emp_name = assignment['employee']
        base = assignment.get('base') or 0

        employee = erp.get('Employee', emp_name)
        if not employee:
            print(f"    Employee not found: {emp_name}, skipping")
            continue

        if employee.get('custom_insurance_salary'):
            print(f"    Employee {emp_name} already has insurance salary, skipping")
            continue

        result = erp.update('Employee', emp_name, {'custom_insurance_salary': base})
        if result:
            print(f"    Set insurance salary for {emp_name}: {base:,.0f}")
        else:
            print(f"    Failed to set insurance salary for {emp_name}")

    return True


def verify(erp: ERPNextClient) -> dict:
    """Verify BHXH insurance setup.

    Returns:
        dict: Verification results.
    """
    issues = []

    # Custom field
    custom_field_exists = erp.exists(
        'Custom Field',
        {'dt': 'Employee', 'fieldname': 'custom_insurance_salary'},
    )
    if not custom_field_exists:
        issues.append("Missing Custom Field: Employee.custom_insurance_salary")

    # Salary components
    missing_components = []
    for comp in INSURANCE_COMPONENTS:
        if not erp.exists('Salary Component', {'name': comp['salary_component']}):
            missing_components.append(comp['salary_component'])
    if missing_components:
        issues.append(f"Missing Salary Components: {', '.join(missing_components)}")

    # Active salary structure with deductions
    active_ss = _get_active_salary_structure(erp)
    if not active_ss:
        issues.append("No active Salary Structure found")
        has_deductions = False
        active_name = 'None'
    else:
        active_name = active_ss['name']
        has_deductions = _structure_has_deductions(active_ss)
        if not has_deductions:
            issues.append(f"Salary Structure '{active_name}' is missing insurance deduction rows")

    # Employees with insurance salary set
    employees_with_insurance = erp.get_list(
        'Employee',
        filters=[['custom_insurance_salary', '>', 0]],
        fields=['name'],
    )

    return {
        'custom_field': 'OK' if custom_field_exists else 'Missing',
        'salary_components': 'OK' if not missing_components else f"Missing: {missing_components}",
        'active_salary_structure': active_name,
        'deductions_configured': has_deductions,
        'employees_with_insurance_salary': len(employees_with_insurance),
        'issues': issues,
    }


if __name__ == "__main__":
    from core.config import get_config, validate_config

    print("=" * 60)
    print("BHXH INSURANCE SETUP")
    print("=" * 60)

    config = get_config()
    if not validate_config(config):
        print("\nSetup aborted due to configuration errors.")
        exit(1)

    erp = ERPNextClient(config['erpnext'])

    print("\nRunning setup...")
    success = setup(erp)

    print("\nRunning verification...")
    results = verify(erp)

    print("\n" + "=" * 60)
    print("VERIFICATION RESULTS")
    print("=" * 60)
    for key, value in results.items():
        if key != 'issues':
            print(f"  {key}: {value}")

    if results['issues']:
        print("\nISSUES:")
        for issue in results['issues']:
            print(f"  - {issue}")
    else:
        print("\nAll checks passed.")

    print("=" * 60)
    exit(0 if success and not results['issues'] else 1)
