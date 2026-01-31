"""
Module: accounting
ERPNext Doctypes: Journal Entry, Sales Invoice
Source: costs table, staff salaries (calculated), weddings (for invoices)

Handles all financial data migration:
- Cost records as Journal Entries
- Monthly salary expenses (calculated from active staff)
- Revenue invoices for completed weddings
"""

import time
from datetime import datetime, date
from dateutil.relativedelta import relativedelta
from collections import defaultdict
from core.erpnext_client import ERPNextClient
from core.pg_client import MerakiPGClient


COMPANY = 'Meraki Wedding Planner'

# Account mappings
EXPENSE_ACCOUNT = 'Expenses - MWP'
SALARY_EXPENSE_ACCOUNT = 'Salary - MWP'
BANK_ACCOUNT = 'Cash - MWP'
INCOME_ACCOUNT = 'Sales - MWP'
RECEIVABLE_ACCOUNT = 'Debtors - MWP'

# Cost category to expense account mapping
COST_CATEGORY_ACCOUNTS = {
    'Office': 'Office Expenses - MWP',
    'Marketing': 'Marketing Expenses - MWP',
    'Travel': 'Travel Expenses - MWP',
    'Software': 'Software Expenses - MWP',
    'default': 'Miscellaneous Expenses - MWP',
}


def setup_expense_accounts(erp: ERPNextClient) -> bool:
    """Create expense accounts if they don't exist."""
    accounts_to_create = [
        {'account_name': 'Salary', 'parent_account': 'Expenses - MWP', 'account_type': 'Expense Account'},
        {'account_name': 'Office Expenses', 'parent_account': 'Expenses - MWP', 'account_type': 'Expense Account'},
        {'account_name': 'Marketing Expenses', 'parent_account': 'Expenses - MWP', 'account_type': 'Expense Account'},
        {'account_name': 'Travel Expenses', 'parent_account': 'Expenses - MWP', 'account_type': 'Expense Account'},
        {'account_name': 'Software Expenses', 'parent_account': 'Expenses - MWP', 'account_type': 'Expense Account'},
        {'account_name': 'Miscellaneous Expenses', 'parent_account': 'Expenses - MWP', 'account_type': 'Expense Account'},
    ]

    for acc in accounts_to_create:
        full_name = f"{acc['account_name']} - MWP"
        if erp.exists('Account', {'name': full_name}):
            print(f"    Account exists: {full_name}")
            continue

        data = {
            'account_name': acc['account_name'],
            'parent_account': acc['parent_account'],
            'company': COMPANY,
            'account_type': acc['account_type'],
            'is_group': 0,
        }
        result = erp.create('Account', data)
        if result:
            print(f"    Created: {full_name}")
        else:
            print(f"    Warning: Could not create {full_name}")

    return True


def _get_expense_account(category: str) -> str:
    """Get expense account based on cost category."""
    if not category:
        return COST_CATEGORY_ACCOUNTS['default']
    return COST_CATEGORY_ACCOUNTS.get(category, COST_CATEGORY_ACCOUNTS['default'])


def migrate_costs(pg: MerakiPGClient, erp: ERPNextClient, dry_run: bool = False) -> dict:
    """Migrate cost records as Journal Entries."""
    results = {'created': 0, 'skipped': 0, 'failed': 0}

    costs = pg.get_all_costs()
    print(f"  Found {len(costs)} costs to migrate")

    for cost in costs:
        # Check if journal entry exists for this cost
        existing = erp.find_one('Journal Entry', {'user_remark': f'Cost ID: {cost["id"]}'})
        if existing:
            print(f"    Skipped (exists): {cost['title']}")
            results['skipped'] += 1
            continue

        if dry_run:
            print(f"    [DRY RUN] Would create JE for: {cost['title']}")
            continue

        expense_account = _get_expense_account(cost.get('categories'))
        cost_date = str(cost['date']) if cost.get('date') else datetime.now().strftime('%Y-%m-%d')
        amount = float(cost.get('amount', 0))

        if amount <= 0:
            print(f"    Skipped (zero amount): {cost['title']}")
            results['skipped'] += 1
            continue

        data = {
            'voucher_type': 'Journal Entry',
            'company': COMPANY,
            'posting_date': cost_date,
            'user_remark': f"Cost ID: {cost['id']} - {cost['title']}",
            'accounts': [
                {
                    'account': expense_account,
                    'debit_in_account_currency': amount,
                    'credit_in_account_currency': 0,
                },
                {
                    'account': BANK_ACCOUNT,
                    'debit_in_account_currency': 0,
                    'credit_in_account_currency': amount,
                },
            ],
        }

        result = erp.create('Journal Entry', data)
        if result:
            print(f"    Created: {cost['title']} - {amount:,.0f} VND")
            results['created'] += 1
        else:
            print(f"    Failed: {cost['title']}")
            results['failed'] += 1

    return results


def migrate_salary_history(pg: MerakiPGClient, erp: ERPNextClient, dry_run: bool = False,
                           start_date: str = '2020-01-01') -> dict:
    """Calculate and create monthly salary expense Journal Entries.

    For each month from start_date to today:
    1. Get employees active during that month (based on join_date)
    2. Sum their monthly salaries
    3. Create Journal Entry: Debit Salary Expense, Credit Bank
    """
    results = {'created': 0, 'skipped': 0, 'failed': 0}

    staff_with_salary = pg.get_staff_with_salary()
    print(f"  Found {len(staff_with_salary)} staff with salary data")

    start = datetime.strptime(start_date, '%Y-%m-%d').date()
    end = date.today()
    current = start.replace(day=1)

    while current <= end:
        month_str = current.strftime('%Y-%m')
        posting_date = current.strftime('%Y-%m-%d')

        # Check if JE exists for this month
        existing = erp.find_one('Journal Entry', {'user_remark': f'Monthly Salary: {month_str}'})
        if existing:
            print(f"    Skipped (exists): {month_str}")
            results['skipped'] += 1
            current += relativedelta(months=1)
            continue

        # Calculate total salary for active employees this month
        total_salary = 0
        active_count = 0

        for staff in staff_with_salary:
            join_date = staff.get('join_date')
            if join_date:
                if isinstance(join_date, str):
                    join_date = datetime.strptime(join_date, '%Y-%m-%d').date()
                elif isinstance(join_date, datetime):
                    join_date = join_date.date()

                # Employee is active if they joined before or during this month
                if join_date <= current.replace(day=28):
                    total_salary += float(staff.get('salary', 0))
                    active_count += 1

        if total_salary <= 0:
            print(f"    Skipped (no salary): {month_str}")
            results['skipped'] += 1
            current += relativedelta(months=1)
            continue

        if dry_run:
            print(f"    [DRY RUN] Would create salary JE for {month_str}: {total_salary:,.0f} VND ({active_count} employees)")
            current += relativedelta(months=1)
            continue

        data = {
            'voucher_type': 'Journal Entry',
            'company': COMPANY,
            'posting_date': posting_date,
            'user_remark': f'Monthly Salary: {month_str} ({active_count} employees)',
            'accounts': [
                {
                    'account': SALARY_EXPENSE_ACCOUNT,
                    'debit_in_account_currency': total_salary,
                    'credit_in_account_currency': 0,
                },
                {
                    'account': BANK_ACCOUNT,
                    'debit_in_account_currency': 0,
                    'credit_in_account_currency': total_salary,
                },
            ],
        }

        result = erp.create('Journal Entry', data)
        if result:
            print(f"    Created: {month_str} - {total_salary:,.0f} VND ({active_count} employees)")
            results['created'] += 1
        else:
            print(f"    Failed: {month_str}")
            results['failed'] += 1

        current += relativedelta(months=1)

    return results


def migrate_revenue_invoices(pg: MerakiPGClient, erp: ERPNextClient, dry_run: bool = False) -> dict:
    """Create Sales Invoices for completed weddings to record revenue.

    For each wedding:
    - Date = wedding date
    - Amount = 100% of wedding value (treat as fully paid)
    - Links to existing Sales Order
    """
    results = {'created': 0, 'skipped': 0, 'failed': 0}

    weddings = pg.get_all_weddings()
    past_weddings = [w for w in weddings if w.get('date') and w['date'] < date.today()]
    print(f"  Found {len(past_weddings)} past weddings for revenue invoices")

    for wedding in past_weddings:
        # Check if invoice already exists
        existing = erp.find_one('Sales Invoice', {'po_no': str(wedding['id'])})
        if existing:
            print(f"    Skipped (exists): Wedding {wedding['id']}")
            results['skipped'] += 1
            continue

        # Get corresponding Sales Order
        sales_order = erp.find_one('Sales Order', {'custom_meraki_wedding_id': wedding['id']})
        if not sales_order:
            print(f"    Skipped (no SO): Wedding {wedding['id']}")
            results['skipped'] += 1
            continue

        if dry_run:
            print(f"    [DRY RUN] Would create invoice for Wedding {wedding['id']}")
            continue

        wedding_date = str(wedding['date'])
        amount = float(wedding.get('amount', 0))

        if amount <= 0:
            print(f"    Skipped (zero amount): Wedding {wedding['id']}")
            results['skipped'] += 1
            continue

        customer = wedding.get('client', '').strip()
        if not customer:
            print(f"    Skipped (no customer): Wedding {wedding['id']}")
            results['skipped'] += 1
            continue

        # Determine item code
        service_type = wedding.get('service', 'Full Package')
        item_map = {'Full Package': 'SVC-FULL', 'Partial': 'SVC-PARTIAL', 'Coordinator': 'SVC-COORDINATOR'}
        item_code = item_map.get(service_type, 'SVC-FULL')

        # Get SO detail for item linkage
        so_detail = erp.get('Sales Order', sales_order['name'])
        so_items = so_detail.get('items', []) if so_detail else []

        invoice_items = []
        if so_items:
            for si in so_items:
                invoice_items.append({
                    'item_code': si['item_code'],
                    'qty': si['qty'],
                    'rate': si['rate'],
                    'sales_order': sales_order['name'],
                    'so_detail': si['name'],
                })
        else:
            invoice_items.append({
                'item_code': item_code,
                'qty': 1,
                'rate': amount,
            })

        data = {
            'customer': customer,
            'company': COMPANY,
            'set_posting_time': 1,
            'posting_date': wedding_date,
            'due_date': wedding_date,
            'currency': 'VND',
            'selling_price_list': 'Standard Selling VND',
            'po_no': str(wedding['id']),
            'items': invoice_items,
            'docstatus': 1,  # Submit immediately
        }

        result = erp.create('Sales Invoice', data)
        if result:
            print(f"    Created: Wedding {wedding['id']} - {amount:,.0f} VND")
            results['created'] += 1
        else:
            print(f"    Failed: Wedding {wedding['id']}")
            results['failed'] += 1

    return results


def migrate_payments(erp: ERPNextClient, dry_run: bool = False) -> dict:
    """Create Payment Entries for all submitted Sales Invoices.

    For each unpaid Sales Invoice:
    - Payment type: Receive
    - Amount = invoice grand_total
    - Date = invoice posting_date (wedding date)
    - Marks invoices as Paid (outstanding = 0)
    """
    results = {'created': 0, 'skipped': 0, 'failed': 0}

    invoices = erp.get_list('Sales Invoice', filters={'docstatus': 1},
                            fields=['name', 'customer', 'grand_total', 'outstanding_amount',
                                    'posting_date', 'currency', 'po_no'])
    print(f"  Found {len(invoices)} submitted Sales Invoices")

    for inv in invoices:
        # Skip if already paid
        outstanding = float(inv.get('outstanding_amount', 0))
        if outstanding <= 0:
            print(f"    Skipped (paid): {inv['name']}")
            results['skipped'] += 1
            continue

        if dry_run:
            print(f"    [DRY RUN] Would create payment for {inv['name']}")
            continue

        data = {
            'payment_type': 'Receive',
            'party_type': 'Customer',
            'party': inv['customer'],
            'company': COMPANY,
            'set_posting_time': 1,
            'posting_date': str(inv['posting_date']),
            'paid_from': RECEIVABLE_ACCOUNT,
            'paid_to': BANK_ACCOUNT,
            'paid_amount': float(inv['grand_total']),
            'received_amount': float(inv['grand_total']),
            'reference_no': inv.get('po_no', inv['name']),
            'reference_date': str(inv['posting_date']),
            'references': [
                {
                    'reference_doctype': 'Sales Invoice',
                    'reference_name': inv['name'],
                    'allocated_amount': float(inv['grand_total']),
                }
            ],
            'docstatus': 1,
        }

        result = erp.create('Payment Entry', data)
        if result:
            print(f"    Created: Payment for {inv['name']} - {float(inv['grand_total']):,.0f} VND")
            results['created'] += 1
        else:
            print(f"    Failed: Payment for {inv['name']}")
            results['failed'] += 1

    return results


def migrate_delivery_notes(erp: ERPNextClient, dry_run: bool = False) -> dict:
    """Create Delivery Notes for all submitted Sales Orders.

    For each Sales Order with per_delivered < 100:
    - Items match the Sales Order items
    - Posting date = wedding date (delivery_date from SO)
    - Sets per_delivered=100% on Sales Orders
    """
    results = {'created': 0, 'skipped': 0, 'failed': 0}

    sales_orders = erp.get_list('Sales Order',
                                filters={'docstatus': 1, 'custom_meraki_wedding_id': ['is', 'set']},
                                fields=['name', 'customer', 'transaction_date', 'delivery_date',
                                        'per_delivered', 'custom_meraki_wedding_id'])
    print(f"  Found {len(sales_orders)} submitted Sales Orders")

    for so in sales_orders:
        # Skip if already delivered
        per_delivered = float(so.get('per_delivered', 0))
        if per_delivered >= 100:
            print(f"    Skipped (delivered): {so['name']}")
            results['skipped'] += 1
            continue

        if dry_run:
            print(f"    [DRY RUN] Would create delivery note for {so['name']}")
            continue

        # Get SO items
        so_detail = erp.get('Sales Order', so['name'])
        if not so_detail or not so_detail.get('items'):
            print(f"    Failed (no items): {so['name']}")
            results['failed'] += 1
            continue

        dn_items = []
        for item in so_detail['items']:
            dn_items.append({
                'item_code': item['item_code'],
                'qty': item['qty'],
                'rate': item['rate'],
                'against_sales_order': so['name'],
                'so_detail': item['name'],
            })

        posting_date = str(so.get('delivery_date') or so.get('transaction_date'))

        data = {
            'customer': so['customer'],
            'company': COMPANY,
            'set_posting_time': 1,
            'posting_date': posting_date,
            'currency': 'VND',
            'selling_price_list': 'Standard Selling VND',
            'items': dn_items,
            'docstatus': 1,
        }

        result = erp.create('Delivery Note', data)
        if result:
            print(f"    Created: DN for {so['name']}")
            results['created'] += 1
        else:
            print(f"    Failed: DN for {so['name']}")
            results['failed'] += 1

    return results


def setup(erp: ERPNextClient) -> bool:
    """Create prerequisites (expense accounts)."""
    print("  Setting up Expense Accounts...")
    return setup_expense_accounts(erp)


def migrate(pg: MerakiPGClient, erp: ERPNextClient, dry_run: bool = False) -> dict:
    """Run all accounting migrations."""
    results = {'created': 0, 'updated': 0, 'skipped': 0, 'failed': 0}

    setup(erp)

    print("\n  Migrating cost records...")
    cost_results = migrate_costs(pg, erp, dry_run)
    results['created'] += cost_results['created']
    results['skipped'] += cost_results['skipped']
    results['failed'] += cost_results['failed']

    print("\n  Migrating salary history...")
    salary_results = migrate_salary_history(pg, erp, dry_run)
    results['created'] += salary_results['created']
    results['skipped'] += salary_results['skipped']
    results['failed'] += salary_results['failed']

    print("\n  Migrating revenue invoices...")
    invoice_results = migrate_revenue_invoices(pg, erp, dry_run)
    results['created'] += invoice_results['created']
    results['skipped'] += invoice_results['skipped']
    results['failed'] += invoice_results['failed']

    print("\n  Migrating payment entries...")
    payment_results = migrate_payments(erp, dry_run)
    results['created'] += payment_results['created']
    results['skipped'] += payment_results['skipped']
    results['failed'] += payment_results['failed']

    print("\n  Migrating delivery notes...")
    dn_results = migrate_delivery_notes(erp, dry_run)
    results['created'] += dn_results['created']
    results['skipped'] += dn_results['skipped']
    results['failed'] += dn_results['failed']

    return results


def verify(erp: ERPNextClient) -> dict:
    """Verify accounting migration results."""
    journal_entries = erp.get_list('Journal Entry', fields=['name', 'user_remark', 'docstatus'])
    sales_invoices = erp.get_list('Sales Invoice', fields=['name', 'po_no', 'docstatus', 'outstanding_amount'])
    payment_entries = erp.get_list('Payment Entry', filters={'docstatus': 1}, fields=['name'])
    delivery_notes = erp.get_list('Delivery Note', filters={'docstatus': 1}, fields=['name'])

    cost_jes = [j for j in journal_entries if j.get('user_remark', '').startswith('Cost ID:')]
    salary_jes = [j for j in journal_entries if j.get('user_remark', '').startswith('Monthly Salary:')]
    paid_invoices = [i for i in sales_invoices if float(i.get('outstanding_amount', 0)) <= 0]

    issues = []

    return {
        'journal_entries': len(journal_entries),
        'cost_entries': len(cost_jes),
        'salary_entries': len(salary_jes),
        'sales_invoices': len(sales_invoices),
        'paid_invoices': len(paid_invoices),
        'payment_entries': len(payment_entries),
        'delivery_notes': len(delivery_notes),
        'issues': issues,
    }


if __name__ == "__main__":
    from core.config import get_config, validate_config

    print("=" * 60)
    print("ACCOUNTING MIGRATION")
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
