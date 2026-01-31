"""
Verify: qa
Comprehensive QA verification of ERPNext migration.

Consolidates all verification logic into a single source of truth.
"""

import sys
from core.erpnext_client import ERPNextClient
from core.pg_client import MerakiPGClient


def print_section(title: str):
    """Print a section header."""
    print(f"\n{'='*80}")
    print(f"  {title}")
    print(f"{'='*80}\n")


def verify_counts(erp: ERPNextClient, pg: MerakiPGClient) -> dict:
    """Verify entity counts match expected values."""
    print_section("1. ENTITY COUNT VERIFICATION")

    # Get source counts
    source_counts = pg.get_summary()

    checks = [
        ("Employee", 16, "Staff with custom_meraki_id"),
        ("Supplier", source_counts['venues'], "Venues"),
        ("Customer", source_counts['unique_clients'], "Unique wedding clients"),
        ("Sales Order", source_counts['weddings'], "All weddings"),
        ("Project", source_counts['weddings'], "Linked to Sales Orders"),
        ("Item", 3 + source_counts['addons'], "Services + Addons"),
    ]

    results = {'passed': 0, 'failed': 0, 'warnings': 0, 'issues': []}

    for doctype, expected, notes in checks:
        items = erp.get_list(doctype, fields=["name"])
        actual = len(items)

        # Allow some variance for customers
        if doctype == "Customer":
            if abs(actual - expected) <= 5:
                status = "PASS"
                results['passed'] += 1
            else:
                status = "WARN"
                results['warnings'] += 1
        else:
            if actual >= expected:
                status = "PASS"
                results['passed'] += 1
            else:
                status = "FAIL"
                results['failed'] += 1
                results['issues'].append(f"{doctype}: expected {expected}, got {actual}")

        icon = "✅" if status == "PASS" else ("⚠️" if status == "WARN" else "❌")
        print(f"{icon} {status:4} | {doctype:15} | Expected: {expected:3} | Actual: {actual:3} | {notes}")

    return results


def verify_sales_orders(erp: ERPNextClient) -> dict:
    """Verify Sales Orders are properly submitted."""
    print_section("2. SALES ORDERS VERIFICATION")

    sales_orders = erp.get_list('Sales Order',
                                 filters={'custom_meraki_wedding_id': ['is', 'set']},
                                 fields=['name', 'docstatus', 'status', 'per_delivered', 'per_billed'])

    results = {'total': len(sales_orders), 'passed': 0, 'failed': 0, 'issues': []}

    print(f"Checking {len(sales_orders)} Sales Orders...")

    for so in sales_orders:
        problems = []

        if so.get('docstatus') != 1:
            problems.append(f"docstatus={so.get('docstatus')} (expected 1)")

        if problems:
            results['failed'] += 1
            results['issues'].append({'name': so['name'], 'problems': problems})
        else:
            results['passed'] += 1

    if results['failed'] == 0:
        print(f"✅ PASS | All {results['total']} Sales Orders are submitted (docstatus=1)")
    else:
        print(f"❌ FAIL | {results['failed']} Sales Orders have issues:")
        for issue in results['issues'][:5]:
            print(f"    {issue['name']}: {', '.join(issue['problems'])}")
        if len(results['issues']) > 5:
            print(f"    ... and {len(results['issues']) - 5} more")

    return results


def verify_projects(erp: ERPNextClient) -> dict:
    """Verify Projects are linked to Sales Orders."""
    print_section("3. PROJECTS VERIFICATION")

    projects = erp.get_list('Project',
                            filters={'custom_meraki_wedding_id': ['is', 'set']},
                            fields=['name', 'status', 'custom_wedding_sales_order'])

    results = {'total': len(projects), 'passed': 0, 'failed': 0, 'issues': []}

    print(f"Checking {len(projects)} Projects...")

    for proj in projects:
        problems = []

        if not proj.get('custom_wedding_sales_order'):
            problems.append("Missing Sales Order link")

        if problems:
            results['failed'] += 1
            results['issues'].append({'name': proj['name'], 'problems': problems})
        else:
            results['passed'] += 1

    if results['failed'] == 0:
        print(f"✅ PASS | All {results['total']} Projects are linked to Sales Orders")
    else:
        print(f"❌ FAIL | {results['failed']} Projects have issues:")
        for issue in results['issues'][:5]:
            print(f"    {issue['name']}: {', '.join(issue['problems'])}")

    return results


def verify_employees(erp: ERPNextClient) -> dict:
    """Verify Employees have Meraki IDs."""
    print_section("4. EMPLOYEES VERIFICATION")

    employees = erp.get_list('Employee',
                              filters={'custom_meraki_id': ['is', 'set']},
                              fields=['name', 'employee_name', 'status', 'custom_meraki_id'])

    results = {
        'total': len(employees),
        'active': len([e for e in employees if e.get('status') == 'Active']),
        'left': len([e for e in employees if e.get('status') == 'Left']),
        'issues': []
    }

    expected = 16

    if results['total'] == expected:
        print(f"✅ PASS | {results['total']} Employees with Meraki ID (expected {expected})")
        print(f"    Active: {results['active']}, Left: {results['left']}")
    else:
        print(f"❌ FAIL | {results['total']} Employees with Meraki ID (expected {expected})")
        results['issues'].append(f"Employee count mismatch: expected {expected}, got {results['total']}")

    return results


def verify_suppliers(erp: ERPNextClient) -> dict:
    """Verify Suppliers (venues) have Meraki IDs."""
    print_section("5. SUPPLIERS (VENUES) VERIFICATION")

    suppliers = erp.get_list('Supplier',
                              filters={'custom_meraki_venue_id': ['is', 'set']},
                              fields=['name', 'custom_meraki_venue_id'])

    results = {'total': len(suppliers), 'issues': []}

    expected = 35

    if results['total'] >= expected:
        print(f"✅ PASS | {results['total']} Suppliers with Meraki Venue ID (expected {expected})")
    else:
        print(f"❌ FAIL | {results['total']} Suppliers with Meraki Venue ID (expected {expected})")
        results['issues'].append(f"Supplier count mismatch")

    return results


def verify_data_integrity(erp: ERPNextClient) -> dict:
    """Spot check data integrity on sample records."""
    print_section("6. DATA INTEGRITY SPOT CHECKS")

    sales_orders = erp.get_list('Sales Order',
                                 filters={'custom_meraki_wedding_id': ['is', 'set']},
                                 fields=['name'],
                                 limit=5)

    results = {'checked': len(sales_orders), 'passed': 0, 'failed': 0, 'issues': []}

    print(f"Checking {len(sales_orders)} sample Sales Orders...\n")

    for so in sales_orders:
        so_detail = erp.get('Sales Order', so['name'])
        if not so_detail:
            results['failed'] += 1
            results['issues'].append(f"{so['name']}: Could not fetch")
            continue

        problems = []

        if not so_detail.get('customer'):
            problems.append("Missing customer")

        if not so_detail.get('items'):
            problems.append("No items")

        if not so_detail.get('grand_total') or so_detail.get('grand_total') <= 0:
            problems.append("Invalid grand_total")

        if problems:
            results['failed'] += 1
            results['issues'].append({'name': so['name'], 'problems': problems})
        else:
            results['passed'] += 1
            print(f"✅ {so['name']}")
            print(f"    Customer: {so_detail.get('customer')}")
            print(f"    Grand Total: {so_detail.get('grand_total'):,.0f} VND")
            print(f"    Date: {so_detail.get('transaction_date')}")
            print()

    return results


def run_verification(erp: ERPNextClient, pg: MerakiPGClient = None) -> dict:
    """Run all QA verifications.

    Args:
        erp: ERPNext API client.
        pg: Optional PostgreSQL client for source data comparison.

    Returns:
        dict: Overall verification results.
    """
    print("\n" + "="*80)
    print("  MERAKI MANAGER - ERPNext MIGRATION QA VERIFICATION")
    print("="*80)

    all_results = {
        'counts': None,
        'sales_orders': None,
        'projects': None,
        'employees': None,
        'suppliers': None,
        'data_integrity': None,
        'all_passed': True,
    }

    # 1. Count verification
    if pg:
        all_results['counts'] = verify_counts(erp, pg)
        if all_results['counts']['failed'] > 0:
            all_results['all_passed'] = False

    # 2. Sales Orders verification
    all_results['sales_orders'] = verify_sales_orders(erp)
    if all_results['sales_orders']['failed'] > 0:
        all_results['all_passed'] = False

    # 3. Projects verification
    all_results['projects'] = verify_projects(erp)
    if all_results['projects']['failed'] > 0:
        all_results['all_passed'] = False

    # 4. Employees verification
    all_results['employees'] = verify_employees(erp)
    if all_results['employees']['issues']:
        all_results['all_passed'] = False

    # 5. Suppliers verification
    all_results['suppliers'] = verify_suppliers(erp)
    if all_results['suppliers']['issues']:
        all_results['all_passed'] = False

    # 6. Data integrity spot checks
    all_results['data_integrity'] = verify_data_integrity(erp)
    if all_results['data_integrity']['failed'] > 0:
        all_results['all_passed'] = False

    # Final summary
    print_section("FINAL SUMMARY")

    if all_results['all_passed']:
        print("🎉 ALL CRITICAL CHECKS PASSED!")
        print("\nMigration Health: GOOD")
    else:
        print("⚠️  ISSUES FOUND - Review failed checks above")
        print("\nFailed areas:")
        if all_results['sales_orders']['failed'] > 0:
            print(f"  - {all_results['sales_orders']['failed']} Sales Orders have issues")
        if all_results['projects']['failed'] > 0:
            print(f"  - {all_results['projects']['failed']} Projects have issues")
        if all_results['employees']['issues']:
            print(f"  - Employee verification failed")
        if all_results['suppliers']['issues']:
            print(f"  - Supplier verification failed")
        if all_results['data_integrity']['failed'] > 0:
            print(f"  - {all_results['data_integrity']['failed']} data integrity issues")

    print("\n" + "="*80 + "\n")

    return all_results


if __name__ == "__main__":
    from core.config import get_config, validate_config

    print("=" * 60)
    print("MIGRATION QA VERIFICATION")
    print("=" * 60)

    config = get_config()
    if not validate_config(config):
        print("\nAborted due to configuration errors.")
        sys.exit(1)

    erp = ERPNextClient(config['erpnext'])

    try:
        pg = MerakiPGClient(config['postgres'])
    except Exception as e:
        print(f"Warning: Could not connect to PostgreSQL: {e}")
        print("Running verification without source data comparison...")
        pg = None

    results = run_verification(erp, pg)

    sys.exit(0 if results['all_passed'] else 1)
