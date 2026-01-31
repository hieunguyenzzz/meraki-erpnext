"""
Module: customers
ERPNext Doctypes: Customer, Customer Group
Source: weddings.client (unique values)

Migrates unique wedding clients to ERPNext customers.
"""

from core.config import COMPANY
from core.erpnext_client import ERPNextClient
from core.pg_client import MerakiPGClient


def setup_customer_group(erp: ERPNextClient) -> bool:
    """Create Wedding Clients customer group."""
    group_name = 'Wedding Clients'

    if erp.exists('Customer Group', {'customer_group_name': group_name}):
        print(f"    Customer Group exists: {group_name}")
        return True

    data = {
        'customer_group_name': group_name,
        'parent_customer_group': 'All Customer Groups',
    }

    result = erp.create_customer_group(data)
    if result:
        print(f"    Created Customer Group: {group_name}")
        return True
    else:
        print(f"    Failed to create Customer Group: {group_name}")
        return False


def setup(erp: ERPNextClient) -> bool:
    """Create prerequisites (customer groups)."""
    print("  Setting up Customer Group...")
    return setup_customer_group(erp)


def migrate(pg: MerakiPGClient, erp: ERPNextClient, dry_run: bool = False) -> dict:
    """Main migration function for customers.

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

    # Get unique clients
    clients = pg.get_unique_clients()
    print(f"  Found {len(clients)} unique clients to migrate")

    for client_row in clients:
        client_name = client_row['client']

        if not client_name or not client_name.strip():
            continue

        client_name = client_name.strip()

        # Check if customer already exists
        if erp.exists('Customer', {'customer_name': client_name}):
            print(f"    Skipped (exists): {client_name}")
            results['skipped'] += 1
            continue

        if dry_run:
            print(f"  [DRY RUN] Would create: {client_name}")
            continue

        # Prepare customer data
        data = {
            'customer_name': client_name,
            'customer_type': 'Individual',
            'customer_group': 'Wedding Clients',
            'territory': 'Vietnam',
        }

        result = erp.create_customer(data)
        if result:
            print(f"    Created: {client_name}")
            results['created'] += 1
        else:
            print(f"    Failed: {client_name}")
            results['failed'] += 1

    return results


def verify(erp: ERPNextClient) -> dict:
    """Verify migration results.

    Returns:
        dict: Verification results with expected, actual, issues.
    """
    customers = erp.get_list('Customer', fields=['name'])

    # Expected is approximately 131-132 unique clients
    actual = len(customers)
    issues = []

    if actual < 131:
        issues.append(f'Customer count ({actual}) is less than expected (131-132)')
    elif actual > 150:
        issues.append(f'Customer count ({actual}) is higher than expected - may have duplicates')

    return {
        'expected': '131-132',
        'actual': actual,
        'issues': issues,
    }


if __name__ == "__main__":
    from core.config import get_config, validate_config

    print("=" * 60)
    print("CUSTOMER MIGRATION")
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
