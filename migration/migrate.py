#!/usr/bin/env python3
"""
Meraki Wedding Planner - ERPNext Migration

Main entry point for migrating data from Meraki NocoDB to ERPNext.

Usage:
    python migration/migrate.py
"""

import sys
from datetime import datetime

from config import get_config, validate_config
from erpnext_client import ERPNextClient
from pg_client import MerakiPGClient

# Import migration modules
from migrate_items import migrate_items
from migrate_employees import migrate_employees
from migrate_venues import migrate_venues
from migrate_customers import migrate_customers
from migrate_weddings import migrate_weddings
from migrate_tasks import migrate_tasks
from migrate_costs import migrate_costs
from migrate_payroll import migrate_payroll


def print_header(text: str):
    """Print a section header."""
    print("\n" + "=" * 60)
    print(f"  {text}")
    print("=" * 60)


def print_summary(results: dict):
    """Print migration summary."""
    print_header("MIGRATION SUMMARY")
    total_created = 0
    total_failed = 0

    for module, stats in results.items():
        created = stats.get('created', 0)
        failed = stats.get('failed', 0)
        total_created += created
        total_failed += failed
        status = "✓" if failed == 0 else "✗"
        print(f"  {status} {module}: {created} created, {failed} failed")

    print("-" * 60)
    print(f"  TOTAL: {total_created} created, {total_failed} failed")


def run_migration():
    """Run the full migration."""
    start_time = datetime.now()
    print_header("MERAKI → ERPNEXT MIGRATION")
    print(f"  Started at: {start_time.strftime('%Y-%m-%d %H:%M:%S')}")

    # Load and validate config
    print("\n[1/10] Loading configuration...")
    config = get_config()
    if not validate_config(config):
        print("ERROR: Invalid configuration. Please check .env file.")
        sys.exit(1)

    # Initialize clients
    print("[2/10] Connecting to databases...")
    try:
        pg = MerakiPGClient(config['postgres'])
        print("  ✓ Connected to PostgreSQL (Meraki NocoDB)")
    except Exception as e:
        print(f"  ✗ Failed to connect to PostgreSQL: {e}")
        sys.exit(1)

    try:
        erp = ERPNextClient(config['erpnext'])
        print("  ✓ Connected to ERPNext")
    except Exception as e:
        print(f"  ✗ Failed to connect to ERPNext: {e}")
        pg.close()
        sys.exit(1)

    # Show source data summary
    print("\n[3/10] Source data summary:")
    summary = pg.get_summary()
    for table, count in summary.items():
        print(f"  - {table}: {count}")

    # Run migrations
    results = {}

    print("\n[4/10] Migrating Items (wedding services)...")
    results['items'] = migrate_items(pg, erp)

    print("\n[5/10] Migrating Employees (staff)...")
    results['employees'] = migrate_employees(pg, erp)

    print("\n[6/10] Migrating Venues (suppliers)...")
    results['venues'] = migrate_venues(pg, erp)

    print("\n[7/10] Migrating Customers (wedding clients)...")
    results['customers'] = migrate_customers(pg, erp)

    print("\n[8/10] Migrating Weddings (Sales Orders + Projects)...")
    results['weddings'] = migrate_weddings(pg, erp)

    print("\n[9/10] Migrating Tasks...")
    results['tasks'] = migrate_tasks(pg, erp)

    print("\n[10/10] Migrating Costs and Payroll...")
    results['costs'] = migrate_costs(pg, erp)
    results['payroll'] = migrate_payroll(pg, erp)

    # Cleanup
    pg.close()

    # Show summary
    print_summary(results)

    end_time = datetime.now()
    duration = end_time - start_time
    print(f"\n  Completed at: {end_time.strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"  Duration: {duration}")

    # Return exit code based on failures
    total_failed = sum(r.get('failed', 0) for r in results.values())
    return 0 if total_failed == 0 else 1


if __name__ == '__main__':
    sys.exit(run_migration())
