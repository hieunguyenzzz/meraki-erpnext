"""
Migrate costs to ERPNext Journal Entries.

Creates:
- Expense accounts for each category
- Journal Entries for cost records
"""

from erpnext_client import ERPNextClient
from pg_client import MerakiPGClient


COMPANY = 'Meraki Wedding Planner'
COMPANY_ABBR = 'MWP'

# Map cost categories to expense accounts
CATEGORY_ACCOUNT_MAP = {
    'Salary': 'Salary',
    'Marketing': 'Marketing Expenses',
    'Office': 'Office Expenses',
    'Travel': 'Travel Expenses',
    'Equipment': 'Equipment Expenses',
    'Other': 'Miscellaneous Expenses',
}


def setup_expense_accounts(erp: ERPNextClient) -> dict:
    """Create expense accounts and return mapping."""
    account_map = {}

    # Get parent expense account
    parent_account = f"Indirect Expenses - {COMPANY_ABBR}"

    for category, account_name in CATEGORY_ACCOUNT_MAP.items():
        full_name = f"{account_name} - {COMPANY_ABBR}"

        # Check if account exists
        existing = erp.find_one('Account', {'account_name': account_name, 'company': COMPANY})
        if existing:
            account_map[category] = existing.get('name')
            print(f"    Account exists: {full_name}")
            continue

        # Create account
        data = {
            'account_name': account_name,
            'parent_account': parent_account,
            'company': COMPANY,
            'root_type': 'Expense',
            'account_type': 'Expense Account',
            'is_group': 0,
        }

        result = erp.create_account(data)
        if result:
            account_map[category] = result.get('name')
            print(f"    Created: {full_name}")
        else:
            print(f"    Failed: {full_name}")

    return account_map


def setup_custom_fields(erp: ERPNextClient) -> bool:
    """Create custom fields on Journal Entry."""
    custom_fields = [
        {
            'dt': 'Journal Entry',
            'fieldname': 'custom_meraki_cost_id',
            'label': 'Meraki Cost ID',
            'fieldtype': 'Int',
            'insert_after': 'voucher_type',
            'description': 'Original cost ID from Meraki system',
            'unique': 1,
        },
    ]

    for field in custom_fields:
        fieldname = field['fieldname']
        if erp.exists('Custom Field', {'dt': 'Journal Entry', 'fieldname': fieldname}):
            print(f"    Custom field exists: {fieldname}")
            continue

        result = erp.create_custom_field(field)
        if result:
            print(f"    Created: {fieldname}")
        else:
            print(f"    Failed: {fieldname}")

    return True


def migrate_costs(pg: MerakiPGClient, erp: ERPNextClient) -> dict:
    """Main migration function for costs."""
    results = {'created': 0, 'skipped': 0, 'failed': 0}

    # Setup custom fields
    print("  Setting up Custom Fields...")
    setup_custom_fields(erp)

    # Setup expense accounts
    print("  Setting up Expense Accounts...")
    account_map = setup_expense_accounts(erp)

    if not account_map:
        print("  WARNING: No expense accounts created, skipping cost migration")
        return results

    # Get default cash/bank account
    cash_account = f"Cash - {COMPANY_ABBR}"

    # Migrate costs
    costs = pg.get_all_costs()
    print(f"  Found {len(costs)} costs to migrate")

    for cost in costs:
        # Check if cost already exists
        if erp.exists('Journal Entry', {'custom_meraki_cost_id': cost['id']}):
            print(f"  Skipped (exists): Cost {cost['id']} - {cost['title']}")
            results['skipped'] += 1
            continue

        # Get expense account for category
        category = cost.get('categories', 'Other')
        expense_account = account_map.get(category, account_map.get('Other'))

        if not expense_account:
            print(f"  Failed (no account): Cost {cost['id']} - {cost['title']}")
            results['failed'] += 1
            continue

        # Prepare Journal Entry data
        amount = float(cost.get('amount', 0))
        posting_date = str(cost['date']) if cost.get('date') else '2024-01-01'

        data = {
            'voucher_type': 'Journal Entry',
            'company': COMPANY,
            'posting_date': posting_date,
            'user_remark': cost.get('title', ''),
            'custom_meraki_cost_id': cost['id'],
            'accounts': [
                {
                    'account': expense_account,
                    'debit_in_account_currency': amount,
                    'credit_in_account_currency': 0,
                },
                {
                    'account': cash_account,
                    'debit_in_account_currency': 0,
                    'credit_in_account_currency': amount,
                },
            ],
        }

        result = erp.create_journal_entry(data)
        if result:
            print(f"  Created: Cost {cost['id']} - {cost['title']} ({category}: {amount:,.0f} VND)")
            results['created'] += 1
        else:
            print(f"  Failed: Cost {cost['id']} - {cost['title']}")
            results['failed'] += 1

    return results
