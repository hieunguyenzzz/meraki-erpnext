#!/usr/bin/env python3
"""
Meraki Manager Migration CLI

Main entry point for running migrations, setup, and verification.

Usage:
    python run.py --all              # Run everything
    python run.py --setup            # Run setup only
    python run.py --module employees # Run specific module
    python run.py --verify           # Run verification only
    python run.py --dry-run          # Preview changes without applying
"""

import argparse
import sys
import time

from core.config import get_config, validate_config
from core.erpnext_client import ERPNextClient
from core.pg_client import MerakiPGClient


# Migration order matters - dependencies must be created first
MIGRATION_ORDER = [
    'items',      # Items needed for orders
    'employees',  # Staff for assignments
    'suppliers',  # Venues for orders
    'customers',  # Customers for orders
    'sales',      # Sales orders
    'projects',   # Projects linked to orders
    'accounting', # Journal entries
]


def print_banner(text: str):
    """Print a banner."""
    print("\n" + "=" * 60)
    print(f"  {text}")
    print("=" * 60 + "\n")


def run_setup(erp: ERPNextClient) -> bool:
    """Run all setup steps."""
    print_banner("RUNNING SETUP")

    from setup.company import create_company
    from setup.currency import setup_currency
    from setup.base_data import seed_base_data

    print("[1/3] Creating Company...")
    create_company(erp)
    time.sleep(1)

    print("\n[2/3] Setting up Currency...")
    setup_currency(erp)
    time.sleep(1)

    print("\n[3/3] Seeding Base Data...")
    seed_base_data(erp)

    print("\n✓ Setup complete")
    return True


def run_module(module_name: str, pg: MerakiPGClient, erp: ERPNextClient, dry_run: bool = False) -> dict:
    """Run a specific migration module."""
    print_banner(f"RUNNING MODULE: {module_name.upper()}")

    # Import the module dynamically
    module = __import__(f'modules.{module_name}', fromlist=[module_name])

    # Run migration
    results = module.migrate(pg, erp, dry_run=dry_run)

    print(f"\nModule {module_name} complete:")
    print(f"  Created: {results.get('created', 0)}")
    print(f"  Updated: {results.get('updated', 0)}")
    print(f"  Skipped: {results.get('skipped', 0)}")
    print(f"  Failed: {results.get('failed', 0)}")

    return results


def run_all(pg: MerakiPGClient, erp: ERPNextClient, dry_run: bool = False) -> dict:
    """Run all migrations in order."""
    print_banner("RUNNING FULL MIGRATION")

    total_results = {'created': 0, 'updated': 0, 'skipped': 0, 'failed': 0}

    # Run setup first
    run_setup(erp)
    time.sleep(2)

    # Run each module in order
    for idx, module_name in enumerate(MIGRATION_ORDER, 1):
        print(f"\n[{idx}/{len(MIGRATION_ORDER)}] Running {module_name}...")

        try:
            results = run_module(module_name, pg, erp, dry_run)
            total_results['created'] += results.get('created', 0)
            total_results['updated'] += results.get('updated', 0)
            total_results['skipped'] += results.get('skipped', 0)
            total_results['failed'] += results.get('failed', 0)
        except Exception as e:
            print(f"Error in {module_name}: {e}")
            total_results['failed'] += 1

        time.sleep(2)

    print_banner("MIGRATION COMPLETE")
    print(f"Total Created: {total_results['created']}")
    print(f"Total Updated: {total_results['updated']}")
    print(f"Total Skipped: {total_results['skipped']}")
    print(f"Total Failed: {total_results['failed']}")

    return total_results


def run_verify(pg: MerakiPGClient, erp: ERPNextClient) -> bool:
    """Run verification."""
    print_banner("RUNNING VERIFICATION")

    from verify.qa import run_verification
    results = run_verification(erp, pg)

    return results['all_passed']


def main():
    parser = argparse.ArgumentParser(
        description='Meraki Manager Migration CLI',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python run.py --all              Run complete migration
  python run.py --setup            Run setup only
  python run.py --module employees Run employee migration
  python run.py --module sales     Run sales order migration
  python run.py --verify           Run verification only
  python run.py --all --dry-run    Preview migration without changes
        """
    )

    parser.add_argument('--all', action='store_true', help='Run complete migration')
    parser.add_argument('--setup', action='store_true', help='Run setup only')
    parser.add_argument('--module', type=str, choices=MIGRATION_ORDER, help='Run specific module')
    parser.add_argument('--verify', action='store_true', help='Run verification only')
    parser.add_argument('--dry-run', action='store_true', help='Preview changes without applying')
    parser.add_argument('--invoices', action='store_true', help='Run revenue invoices only')
    parser.add_argument('--payments', action='store_true', help='Run payment entries only')
    parser.add_argument('--delivery-notes', action='store_true', help='Run delivery notes only')

    args = parser.parse_args()

    # Validate at least one action is specified
    if not (args.all or args.setup or args.module or args.verify
            or args.invoices or args.payments or args.delivery_notes):
        parser.print_help()
        print("\nError: Specify at least one action (--all, --setup, --module, or --verify)")
        return 1

    # Load and validate config
    print("Loading configuration...")
    config = get_config()
    if not validate_config(config):
        print("\nMigration aborted due to configuration errors.")
        return 1

    # Initialize clients
    print("Connecting to ERPNext...")
    erp = ERPNextClient(config['erpnext'])

    pg = None
    if args.all or args.module or args.verify or args.invoices:
        print("Connecting to PostgreSQL...")
        try:
            pg = MerakiPGClient(config['postgres'])
        except Exception as e:
            if args.verify:
                print(f"Warning: Could not connect to PostgreSQL: {e}")
                print("Running verification without source data comparison...")
            else:
                print(f"Error connecting to PostgreSQL: {e}")
                return 1

    # Execute requested actions
    try:
        if args.setup:
            run_setup(erp)

        if args.module:
            run_module(args.module, pg, erp, dry_run=args.dry_run)

        if args.all:
            run_all(pg, erp, dry_run=args.dry_run)

        if args.invoices:
            from modules.accounting import migrate_revenue_invoices
            print_banner("RUNNING REVENUE INVOICES")
            r = migrate_revenue_invoices(pg, erp, dry_run=args.dry_run)
            print(f"\nCreated: {r['created']}  Skipped: {r['skipped']}  Failed: {r['failed']}")

        if args.payments:
            from modules.accounting import migrate_payments
            print_banner("RUNNING PAYMENT ENTRIES")
            r = migrate_payments(erp, dry_run=args.dry_run)
            print(f"\nCreated: {r['created']}  Skipped: {r['skipped']}  Failed: {r['failed']}")

        if args.delivery_notes:
            from modules.accounting import migrate_delivery_notes
            print_banner("RUNNING DELIVERY NOTES")
            r = migrate_delivery_notes(erp, dry_run=args.dry_run)
            print(f"\nCreated: {r['created']}  Skipped: {r['skipped']}  Failed: {r['failed']}")

        if args.verify:
            passed = run_verify(pg, erp)
            return 0 if passed else 1

    except KeyboardInterrupt:
        print("\n\nMigration interrupted by user.")
        return 130
    except Exception as e:
        print(f"\nError during migration: {e}")
        import traceback
        traceback.print_exc()
        return 1
    finally:
        if pg:
            pg.close()

    return 0


if __name__ == '__main__':
    sys.exit(main())
