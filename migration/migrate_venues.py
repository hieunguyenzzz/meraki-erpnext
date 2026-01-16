"""
Migrate venues to ERPNext Suppliers.

Creates:
- Supplier Group: "Wedding Venues"
- Custom Field for Meraki ID
- Suppliers from venue table
- Addresses linked to suppliers
"""

from erpnext_client import ERPNextClient
from pg_client import MerakiPGClient


def setup_supplier_group(erp: ERPNextClient) -> bool:
    """Create Wedding Venues supplier group."""
    group_name = 'Wedding Venues'

    if erp.exists('Supplier Group', {'supplier_group_name': group_name}):
        print(f"  Supplier Group exists: {group_name}")
        return True

    data = {
        'supplier_group_name': group_name,
        'parent_supplier_group': 'All Supplier Groups',
    }

    result = erp.create_supplier_group(data)
    if result:
        print(f"  Created Supplier Group: {group_name}")
        return True
    else:
        print(f"  Failed to create Supplier Group: {group_name}")
        return False


def setup_custom_fields(erp: ERPNextClient) -> bool:
    """Create custom fields for Supplier."""
    custom_fields = [
        {
            'dt': 'Supplier',
            'fieldname': 'custom_meraki_venue_id',
            'label': 'Meraki Venue ID',
            'fieldtype': 'Int',
            'insert_after': 'supplier_name',
            'description': 'Original ID from Meraki system',
            'unique': 1,
        },
        {
            'dt': 'Supplier',
            'fieldname': 'custom_venue_city',
            'label': 'City',
            'fieldtype': 'Data',
            'insert_after': 'custom_meraki_venue_id',
            'description': 'Venue city/location',
        },
    ]

    for field in custom_fields:
        fieldname = field['fieldname']
        if erp.exists('Custom Field', {'dt': 'Supplier', 'fieldname': fieldname}):
            print(f"  Custom field exists: {fieldname}")
            continue

        result = erp.create_custom_field(field)
        if result:
            print(f"  Created Custom Field: {fieldname}")
        else:
            print(f"  Failed to create Custom Field: {fieldname}")
            continue

    return True


def create_address(erp: ERPNextClient, venue: dict, supplier_name: str) -> bool:
    """Create address linked to supplier."""
    if not venue.get('address'):
        return True  # No address to create

    address_title = f"{venue['title']} - {venue.get('city', 'Vietnam')}"

    # Check if address exists
    if erp.exists('Address', {'address_title': address_title}):
        return True

    data = {
        'address_title': address_title,
        'address_type': 'Billing',
        'address_line1': venue.get('address', ''),
        'city': venue.get('city', ''),
        'country': 'Vietnam',
        'links': [
            {
                'link_doctype': 'Supplier',
                'link_name': supplier_name,
            }
        ]
    }

    result = erp.create('Address', data)
    return result is not None


def create_contact(erp: ERPNextClient, venue: dict, supplier_name: str) -> bool:
    """Create contact linked to supplier."""
    if not venue.get('contact_person') and not venue.get('email') and not venue.get('phone'):
        return True  # No contact info to create

    first_name = venue.get('contact_person', venue['title'])

    # Check if contact exists
    if erp.exists('Contact', {'first_name': first_name, 'company_name': venue['title']}):
        return True

    data = {
        'first_name': first_name,
        'company_name': venue['title'],
        'links': [
            {
                'link_doctype': 'Supplier',
                'link_name': supplier_name,
            }
        ]
    }

    # Add email if present
    if venue.get('email'):
        data['email_ids'] = [{'email_id': venue['email'], 'is_primary': 1}]

    # Add phone if present
    if venue.get('phone'):
        data['phone_nos'] = [{'phone': venue['phone'], 'is_primary_phone': 1}]

    result = erp.create('Contact', data)
    return result is not None


def migrate_venues(pg: MerakiPGClient, erp: ERPNextClient) -> dict:
    """Main migration function for venues."""
    results = {'created': 0, 'skipped': 0, 'failed': 0}

    # Setup
    print("  Setting up Supplier Group...")
    setup_supplier_group(erp)

    print("  Setting up Custom Fields...")
    setup_custom_fields(erp)

    # Migrate venues
    venues = pg.get_all_venues()
    print(f"  Found {len(venues)} venues to migrate")

    for venue in venues:
        # Check if venue already exists by Meraki ID
        existing = erp.find_one('Supplier', {'custom_meraki_venue_id': venue['id']})
        if existing:
            print(f"  Skipped (exists): {venue['title']} (ID: {venue['id']})")
            results['skipped'] += 1
            continue

        # Prepare supplier data
        data = {
            'supplier_name': venue['title'],
            'supplier_group': 'Wedding Venues',
            'supplier_type': 'Company',
            'country': 'Vietnam',
            'custom_meraki_venue_id': venue['id'],
            'custom_venue_city': venue.get('city', ''),
        }

        result = erp.create_supplier(data)
        if result:
            supplier_name = result.get('name')
            print(f"  Created: {venue['title']} (ID: {venue['id']})")
            results['created'] += 1

            # Create address and contact
            create_address(erp, venue, supplier_name)
            create_contact(erp, venue, supplier_name)
        else:
            print(f"  Failed: {venue['title']} (ID: {venue['id']})")
            results['failed'] += 1

    return results
