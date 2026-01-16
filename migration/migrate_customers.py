"""
Migrate wedding clients to ERPNext Customers.

Creates:
- Customer Group: "Wedding Clients"
- Customers from unique wedding.client values
"""

from erpnext_client import ERPNextClient
from pg_client import MerakiPGClient


def setup_customer_group(erp: ERPNextClient) -> bool:
    """Create Wedding Clients customer group."""
    group_name = 'Wedding Clients'

    if erp.exists('Customer Group', {'customer_group_name': group_name}):
        print(f"  Customer Group exists: {group_name}")
        return True

    data = {
        'customer_group_name': group_name,
        'parent_customer_group': 'All Customer Groups',
    }

    result = erp.create_customer_group(data)
    if result:
        print(f"  Created Customer Group: {group_name}")
        return True
    else:
        print(f"  Failed to create Customer Group: {group_name}")
        return False


def migrate_customers(pg: MerakiPGClient, erp: ERPNextClient) -> dict:
    """Main migration function for customers."""
    results = {'created': 0, 'skipped': 0, 'failed': 0}

    # Setup
    print("  Setting up Customer Group...")
    setup_customer_group(erp)

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
            print(f"  Skipped (exists): {client_name}")
            results['skipped'] += 1
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
            print(f"  Created: {client_name}")
            results['created'] += 1
        else:
            print(f"  Failed: {client_name}")
            results['failed'] += 1

    return results
