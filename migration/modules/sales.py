"""
Module: sales
ERPNext Doctypes: Sales Order, Sales Invoice
Source: weddings table

Creates Sales Orders for each wedding with proper status handling.
Past weddings are created as submitted (docstatus=1).
"""

import time
from datetime import datetime
from core.erpnext_client import ERPNextClient
from core.pg_client import MerakiPGClient


COMPANY = 'Meraki Wedding Planner'

SERVICE_ITEM_MAP = {
    'Full Package': 'SVC-FULL',
    'Partial': 'SVC-PARTIAL',
    'Coordinator': 'SVC-COORDINATOR',
}


def setup_custom_fields(erp: ERPNextClient) -> bool:
    """Create custom fields on Sales Order."""
    custom_fields = [
        {
            'dt': 'Sales Order',
            'fieldname': 'custom_meraki_wedding_id',
            'label': 'Meraki Wedding ID',
            'fieldtype': 'Int',
            'insert_after': 'po_no',
            'description': 'Original wedding ID from Meraki system',
            'unique': 1,
        },
        {
            'dt': 'Sales Order',
            'fieldname': 'custom_service_type',
            'label': 'Service Type',
            'fieldtype': 'Select',
            'options': '\nFull Package\nPartial\nCoordinator',
            'insert_after': 'custom_meraki_wedding_id',
        },
        {
            'dt': 'Sales Order',
            'fieldname': 'custom_wedding_type',
            'label': 'Wedding Type',
            'fieldtype': 'Select',
            'options': '\nHCM\nDestination',
            'insert_after': 'custom_service_type',
        },
        {
            'dt': 'Sales Order',
            'fieldname': 'custom_venue',
            'label': 'Venue',
            'fieldtype': 'Link',
            'options': 'Supplier',
            'insert_after': 'custom_wedding_type',
        },
        {
            'dt': 'Sales Order',
            'fieldname': 'custom_wedding_project',
            'label': 'Wedding Project',
            'fieldtype': 'Link',
            'options': 'Project',
            'insert_after': 'custom_venue',
        },
    ]

    for field in custom_fields:
        fieldname = field['fieldname']
        if erp.exists('Custom Field', {'dt': 'Sales Order', 'fieldname': fieldname}):
            print(f"    Custom field exists: Sales Order.{fieldname}")
            continue

        result = erp.create_custom_field(field)
        if result:
            print(f"    Created: Sales Order.{fieldname}")
        else:
            print(f"    Failed: Sales Order.{fieldname}")

    return True


def _get_customer_name(erp: ERPNextClient, client_name: str) -> str:
    """Get ERPNext Customer name."""
    if not client_name:
        return ''
    client_name = client_name.strip()
    customer = erp.get('Customer', client_name)
    return customer.get('name', '') if customer else ''


def _get_venue_name(erp: ERPNextClient, meraki_id: int) -> str:
    """Get ERPNext Supplier name by Meraki venue ID."""
    if not meraki_id:
        return ''
    supplier = erp.find_one('Supplier', {'custom_meraki_venue_id': meraki_id})
    return supplier.get('name', '') if supplier else ''


def _create_sales_order(erp: ERPNextClient, wedding: dict, customer_name: str,
                        venue_name: str, submit: bool = True) -> dict:
    """Create Sales Order for a wedding."""
    service_type = wedding.get('service', 'Full Package')
    item_code = SERVICE_ITEM_MAP.get(service_type, 'SVC-FULL')
    wedding_date = str(wedding['date']) if wedding.get('date') else datetime.now().strftime('%Y-%m-%d')

    data = {
        'customer': customer_name,
        'company': COMPANY,
        'currency': 'VND',
        'selling_price_list': 'Standard Selling VND',
        'transaction_date': wedding_date,
        'delivery_date': wedding_date,
        'po_no': str(wedding['id']),
        'custom_meraki_wedding_id': wedding['id'],
        'custom_service_type': service_type,
        'custom_wedding_type': wedding.get('type', ''),
        'custom_venue': venue_name if venue_name else None,
        'items': [
            {
                'item_code': item_code,
                'qty': 1,
                'rate': float(wedding.get('amount', 0)),
                'delivery_date': wedding_date,
            }
        ],
    }

    if submit:
        data['docstatus'] = 1

    return erp.create_sales_order(data)


def setup(erp: ERPNextClient) -> bool:
    """Create prerequisites (custom fields)."""
    print("  Setting up Custom Fields on Sales Order...")
    return setup_custom_fields(erp)


def migrate(pg: MerakiPGClient, erp: ERPNextClient, dry_run: bool = False, delay: float = 1.5) -> dict:
    """Main migration function for sales orders.

    Args:
        pg: PostgreSQL client for source data.
        erp: ERPNext API client.
        dry_run: If True, don't make any changes.
        delay: Delay between API calls to avoid rate limiting.

    Returns:
        dict: Migration results.
    """
    results = {'created': 0, 'updated': 0, 'skipped': 0, 'failed': 0}

    setup(erp)
    time.sleep(delay)

    weddings = pg.get_all_weddings()
    print(f"  Found {len(weddings)} weddings to migrate as Sales Orders")

    for idx, wedding in enumerate(weddings, 1):
        print(f"  [{idx}/{len(weddings)}] Processing wedding {wedding['id']} - {wedding['client']}")

        existing_so = erp.find_one('Sales Order', {'custom_meraki_wedding_id': wedding['id']})
        time.sleep(delay)

        if existing_so:
            print(f"    Skipped (exists)")
            results['skipped'] += 1
            continue

        if dry_run:
            print(f"    [DRY RUN] Would create Sales Order")
            continue

        customer_name = _get_customer_name(erp, wedding.get('client'))
        time.sleep(delay)

        if not customer_name:
            print(f"    Failed (no customer)")
            results['failed'] += 1
            continue

        venue_name = _get_venue_name(erp, wedding.get('venue_id'))
        time.sleep(delay)

        sales_order = _create_sales_order(erp, wedding, customer_name, venue_name, submit=True)
        time.sleep(delay)

        if not sales_order:
            print(f"    Failed (SO creation)")
            results['failed'] += 1
            continue

        print(f"    Created: {sales_order.get('name')}")
        results['created'] += 1

    return results


def verify(erp: ERPNextClient) -> dict:
    """Verify migration results."""
    sales_orders = erp.get_list('Sales Order',
                                 filters={'custom_meraki_wedding_id': ['is', 'set']},
                                 fields=['name', 'docstatus', 'custom_meraki_wedding_id'])

    submitted = [so for so in sales_orders if so.get('docstatus') == 1]
    draft = [so for so in sales_orders if so.get('docstatus') == 0]

    issues = []
    if len(sales_orders) < 134:
        issues.append(f'Sales Order count ({len(sales_orders)}) is less than expected (134)')
    if draft:
        issues.append(f'{len(draft)} Sales Orders still in Draft status')

    return {
        'expected': 134,
        'actual': len(sales_orders),
        'submitted': len(submitted),
        'draft': len(draft),
        'issues': issues,
    }


if __name__ == "__main__":
    from core.config import get_config, validate_config

    print("=" * 60)
    print("SALES ORDER MIGRATION")
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
