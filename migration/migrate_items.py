"""
Migrate wedding service items to ERPNext.

Creates:
- Item Group: "Wedding Services"
- Items for each wedding addon and service type
"""

from erpnext_client import ERPNextClient
from pg_client import MerakiPGClient


# Standard wedding service items
SERVICE_ITEMS = [
    {'item_code': 'SVC-FULL', 'item_name': 'Full Package', 'description': 'Complete wedding planning service'},
    {'item_code': 'SVC-PARTIAL', 'item_name': 'Partial Package', 'description': 'Partial wedding planning service'},
    {'item_code': 'SVC-COORDINATOR', 'item_name': 'Coordinator', 'description': 'Day-of wedding coordination'},
]


def setup_item_groups(erp: ERPNextClient) -> bool:
    """Create required Item Groups."""
    groups = [
        {'item_group_name': 'Wedding Services', 'parent_item_group': 'All Item Groups'},
        {'item_group_name': 'Add-on Services', 'parent_item_group': 'Wedding Services'},
    ]

    for group in groups:
        if not erp.exists('Item Group', {'item_group_name': group['item_group_name']}):
            result = erp.create_item_group(group)
            if result:
                print(f"  Created Item Group: {group['item_group_name']}")
            else:
                print(f"  Failed to create Item Group: {group['item_group_name']}")
                return False
        else:
            print(f"  Item Group exists: {group['item_group_name']}")

    return True


def migrate_service_items(erp: ERPNextClient) -> dict:
    """Create standard service items."""
    results = {'created': 0, 'skipped': 0, 'failed': 0}

    for item in SERVICE_ITEMS:
        if erp.exists('Item', {'item_code': item['item_code']}):
            print(f"  Skipped (exists): {item['item_code']}")
            results['skipped'] += 1
            continue

        data = {
            'item_code': item['item_code'],
            'item_name': item['item_name'],
            'item_group': 'Wedding Services',
            'description': item['description'],
            'is_stock_item': 0,
            'is_sales_item': 1,
            'include_item_in_manufacturing': 0,
        }

        result = erp.create_item(data)
        if result:
            print(f"  Created: {item['item_code']} - {item['item_name']}")
            results['created'] += 1
        else:
            print(f"  Failed: {item['item_code']}")
            results['failed'] += 1

    return results


def migrate_addon_items(pg: MerakiPGClient, erp: ERPNextClient) -> dict:
    """Migrate wedding addons as Items."""
    results = {'created': 0, 'skipped': 0, 'failed': 0}

    addons = pg.get_all_addons()
    print(f"  Found {len(addons)} addons to migrate")

    for addon in addons:
        item_code = f"ADDON-{addon['id']}"

        if erp.exists('Item', {'item_code': item_code}):
            print(f"  Skipped (exists): {item_code}")
            results['skipped'] += 1
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
        }

        result = erp.create_item(data)
        if result:
            print(f"  Created: {item_code} - {addon['title']}")
            results['created'] += 1
        else:
            print(f"  Failed: {item_code} - {addon['title']}")
            results['failed'] += 1

    return results


def migrate_items(pg: MerakiPGClient, erp: ERPNextClient) -> dict:
    """Main migration function for items."""
    results = {'created': 0, 'skipped': 0, 'failed': 0}

    # Setup item groups
    print("  Setting up Item Groups...")
    if not setup_item_groups(erp):
        results['failed'] += 1
        return results

    # Migrate service items
    print("  Migrating service items...")
    service_results = migrate_service_items(erp)
    results['created'] += service_results['created']
    results['skipped'] += service_results['skipped']
    results['failed'] += service_results['failed']

    # Migrate addon items
    print("  Migrating addon items...")
    addon_results = migrate_addon_items(pg, erp)
    results['created'] += addon_results['created']
    results['skipped'] += addon_results['skipped']
    results['failed'] += addon_results['failed']

    return results
