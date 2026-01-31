"""
Module: items
ERPNext Doctypes: Item, Item Group
Source: wedding_addon table + standard service types

Creates item groups and items for wedding services and addons.
"""

from core.erpnext_client import ERPNextClient
from core.pg_client import MerakiPGClient


# Standard wedding service items
SERVICE_ITEMS = [
    {'item_code': 'SVC-FULL', 'item_name': 'Full Package', 'description': 'Complete wedding planning service'},
    {'item_code': 'SVC-PARTIAL', 'item_name': 'Partial Package', 'description': 'Partial wedding planning service'},
    {'item_code': 'SVC-COORDINATOR', 'item_name': 'Coordinator', 'description': 'Day-of wedding coordination'},
]


def setup_item_groups(erp: ERPNextClient) -> bool:
    """Create required Item Groups."""
    if not erp.exists('Item Group', {'item_group_name': 'Wedding Services'}):
        result = erp.create_item_group({'item_group_name': 'Wedding Services', 'is_group': 1})
        if result:
            print(f"    Created Item Group: Wedding Services")
        else:
            print(f"    Warning: Failed to create Item Group: Wedding Services (may already exist)")
    else:
        print(f"    Item Group exists: Wedding Services")

    if not erp.exists('Item Group', {'item_group_name': 'Add-on Services'}):
        result = erp.create_item_group({
            'item_group_name': 'Add-on Services',
            'parent_item_group': 'Wedding Services',
            'is_group': 0
        })
        if result:
            print(f"    Created Item Group: Add-on Services")
        else:
            print(f"    Warning: Failed to create Item Group: Add-on Services (may already exist)")
    else:
        print(f"    Item Group exists: Add-on Services")

    return True


def _migrate_service_items(erp: ERPNextClient, dry_run: bool = False) -> dict:
    """Create standard service items."""
    results = {'created': 0, 'skipped': 0, 'failed': 0}

    for item in SERVICE_ITEMS:
        if erp.exists('Item', {'item_code': item['item_code']}):
            print(f"    Skipped (exists): {item['item_code']}")
            results['skipped'] += 1
            continue

        if dry_run:
            print(f"    [DRY RUN] Would create: {item['item_code']}")
            continue

        data = {
            'item_code': item['item_code'],
            'item_name': item['item_name'],
            'item_group': 'Wedding Services',
            'description': item['description'],
            'is_stock_item': 0,
            'is_sales_item': 1,
            'include_item_in_manufacturing': 0,
            'stock_uom': 'Nos',
        }

        result = erp.create_item(data)
        if result:
            print(f"    Created: {item['item_code']} - {item['item_name']}")
            results['created'] += 1
        else:
            print(f"    Failed: {item['item_code']}")
            results['failed'] += 1

    return results


def _migrate_addon_items(pg: MerakiPGClient, erp: ERPNextClient, dry_run: bool = False) -> dict:
    """Migrate wedding addons as Items."""
    results = {'created': 0, 'skipped': 0, 'failed': 0}

    addons = pg.get_all_addons()
    print(f"  Found {len(addons)} addons to migrate")

    for addon in addons:
        item_code = f"ADDON-{addon['id']}"

        if erp.exists('Item', {'item_code': item_code}):
            print(f"    Skipped (exists): {item_code}")
            results['skipped'] += 1
            continue

        if dry_run:
            print(f"    [DRY RUN] Would create: {item_code}")
            continue

        data = {
            'item_code': item_code,
            'item_name': addon['title'],
            'item_group': 'Add-on Services',
            'description': addon['title'],
            'standard_rate': float(addon['price'] or 0),
            'is_stock_item': 0,
            'is_sales_item': 1,
            'include_item_in_manufacturing': 0,
            'stock_uom': 'Nos',
        }

        result = erp.create_item(data)
        if result:
            print(f"    Created: {item_code} - {addon['title']}")
            results['created'] += 1
        else:
            print(f"    Failed: {item_code} - {addon['title']}")
            results['failed'] += 1

    return results


def setup(erp: ERPNextClient) -> bool:
    """Create prerequisites (item groups)."""
    print("  Setting up Item Groups...")
    return setup_item_groups(erp)


def migrate(pg: MerakiPGClient, erp: ERPNextClient, dry_run: bool = False) -> dict:
    """Main migration function for items."""
    results = {'created': 0, 'updated': 0, 'skipped': 0, 'failed': 0}

    setup(erp)

    print("  Migrating service items...")
    service_results = _migrate_service_items(erp, dry_run)
    results['created'] += service_results['created']
    results['skipped'] += service_results['skipped']
    results['failed'] += service_results['failed']

    print("  Migrating addon items...")
    addon_results = _migrate_addon_items(pg, erp, dry_run)
    results['created'] += addon_results['created']
    results['skipped'] += addon_results['skipped']
    results['failed'] += addon_results['failed']

    return results


def verify(erp: ERPNextClient) -> dict:
    """Verify migration results."""
    service_items = erp.get_list('Item', filters={'item_group': 'Wedding Services'}, fields=['name'])
    addon_items = erp.get_list('Item', filters={'item_group': 'Add-on Services'}, fields=['name'])

    issues = []
    if len(service_items) < 3:
        issues.append(f'Service items count ({len(service_items)}) is less than expected (3)')

    return {
        'expected': '3 services + addons',
        'actual': f'{len(service_items)} services, {len(addon_items)} addons',
        'issues': issues,
    }


if __name__ == "__main__":
    from core.config import get_config, validate_config

    print("=" * 60)
    print("ITEM MIGRATION")
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
