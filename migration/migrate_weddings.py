"""
Migrate weddings to ERPNext Sales Orders + Projects.

Creates:
- Custom Fields on Sales Order and Project
- Sales Order for each wedding (revenue tracking)
- Project for each wedding (task/planning management)
- Links between Sales Order and Project
"""

from datetime import datetime
from erpnext_client import ERPNextClient
from pg_client import MerakiPGClient


COMPANY = 'Meraki Wedding Planner'

# Map service type to item code
SERVICE_ITEM_MAP = {
    'Full Package': 'SVC-FULL',
    'Partial': 'SVC-PARTIAL',
    'Coordinator': 'SVC-COORDINATOR',
}


def setup_custom_fields_sales_order(erp: ERPNextClient) -> bool:
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


def setup_custom_fields_project(erp: ERPNextClient) -> bool:
    """Create custom fields on Project."""
    custom_fields = [
        {
            'dt': 'Project',
            'fieldname': 'custom_meraki_wedding_id',
            'label': 'Meraki Wedding ID',
            'fieldtype': 'Int',
            'insert_after': 'project_name',
            'description': 'Original wedding ID from Meraki system',
            'unique': 1,
        },
        {
            'dt': 'Project',
            'fieldname': 'custom_wedding_sales_order',
            'label': 'Wedding Sales Order',
            'fieldtype': 'Link',
            'options': 'Sales Order',
            'insert_after': 'custom_meraki_wedding_id',
        },
        {
            'dt': 'Project',
            'fieldname': 'custom_lead_planner',
            'label': 'Lead Planner',
            'fieldtype': 'Link',
            'options': 'Employee',
            'insert_after': 'custom_wedding_sales_order',
        },
        {
            'dt': 'Project',
            'fieldname': 'custom_support_planner',
            'label': 'Support Planner',
            'fieldtype': 'Link',
            'options': 'Employee',
            'insert_after': 'custom_lead_planner',
        },
        {
            'dt': 'Project',
            'fieldname': 'custom_assistant_1',
            'label': 'Assistant 1',
            'fieldtype': 'Link',
            'options': 'Employee',
            'insert_after': 'custom_support_planner',
        },
        {
            'dt': 'Project',
            'fieldname': 'custom_assistant_2',
            'label': 'Assistant 2',
            'fieldtype': 'Link',
            'options': 'Employee',
            'insert_after': 'custom_assistant_1',
        },
    ]

    for field in custom_fields:
        fieldname = field['fieldname']
        if erp.exists('Custom Field', {'dt': 'Project', 'fieldname': fieldname}):
            print(f"    Custom field exists: Project.{fieldname}")
            continue

        result = erp.create_custom_field(field)
        if result:
            print(f"    Created: Project.{fieldname}")
        else:
            print(f"    Failed: Project.{fieldname}")

    return True


def get_employee_name_by_meraki_id(erp: ERPNextClient, meraki_id: int) -> str:
    """Get ERPNext Employee name by Meraki staff ID."""
    if not meraki_id:
        return ''
    employee = erp.find_one('Employee', {'custom_meraki_id': meraki_id})
    return employee.get('name', '') if employee else ''


def get_venue_name_by_meraki_id(erp: ERPNextClient, meraki_id: int) -> str:
    """Get ERPNext Supplier name by Meraki venue ID."""
    if not meraki_id:
        return ''
    supplier = erp.find_one('Supplier', {'custom_meraki_venue_id': meraki_id})
    return supplier.get('name', '') if supplier else ''


def get_customer_name(erp: ERPNextClient, client_name: str) -> str:
    """Get ERPNext Customer name."""
    if not client_name:
        return ''
    customer = erp.find_one('Customer', {'customer_name': client_name.strip()})
    return customer.get('name', '') if customer else ''


def create_sales_order(erp: ERPNextClient, wedding: dict, customer_name: str,
                       venue_name: str) -> dict:
    """Create Sales Order for a wedding."""
    # Get item code based on service type
    service_type = wedding.get('service', 'Full Package')
    item_code = SERVICE_ITEM_MAP.get(service_type, 'SVC-FULL')

    # Prepare Sales Order data
    wedding_date = str(wedding['date']) if wedding.get('date') else datetime.now().strftime('%Y-%m-%d')

    data = {
        'customer': customer_name,
        'company': COMPANY,
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

    return erp.create_sales_order(data)


def create_project(erp: ERPNextClient, wedding: dict, customer_name: str,
                   sales_order_name: str, staff_map: dict) -> dict:
    """Create Project for a wedding."""
    wedding_date = str(wedding['date']) if wedding.get('date') else datetime.now().strftime('%Y-%m-%d')
    project_name = f"Wedding - {wedding['client']} - {wedding_date}"

    # Get employee names for staff assignments
    lead_planner = staff_map.get(wedding.get('lead_planner_id'), '')
    support_planner = staff_map.get(wedding.get('support_planner_id'), '')
    assistant_1 = staff_map.get(wedding.get('assistant1_id'), '')
    assistant_2 = staff_map.get(wedding.get('assistant2_id'), '')

    data = {
        'project_name': project_name,
        'company': COMPANY,
        'customer': customer_name,
        'expected_end_date': wedding_date,
        'status': 'Completed' if wedding['date'] and wedding['date'] < datetime.now().date() else 'Open',
        'custom_meraki_wedding_id': wedding['id'],
        'custom_wedding_sales_order': sales_order_name,
        'custom_lead_planner': lead_planner if lead_planner else None,
        'custom_support_planner': support_planner if support_planner else None,
        'custom_assistant_1': assistant_1 if assistant_1 else None,
        'custom_assistant_2': assistant_2 if assistant_2 else None,
    }

    return erp.create_project(data)


def build_staff_map(erp: ERPNextClient) -> dict:
    """Build a map of Meraki staff ID to ERPNext Employee name."""
    employees = erp.get_list('Employee', fields=['name', 'custom_meraki_id'])
    return {emp.get('custom_meraki_id'): emp.get('name') for emp in employees if emp.get('custom_meraki_id')}


def migrate_weddings(pg: MerakiPGClient, erp: ERPNextClient) -> dict:
    """Main migration function for weddings."""
    results = {'created': 0, 'skipped': 0, 'failed': 0}

    # Setup custom fields
    print("  Setting up Custom Fields on Sales Order...")
    setup_custom_fields_sales_order(erp)

    print("  Setting up Custom Fields on Project...")
    setup_custom_fields_project(erp)

    # Build staff map for quick lookups
    print("  Building staff mapping...")
    staff_map = build_staff_map(erp)
    print(f"    Found {len(staff_map)} employees with Meraki IDs")

    # Migrate weddings
    weddings = pg.get_all_weddings()
    print(f"  Found {len(weddings)} weddings to migrate")

    for wedding in weddings:
        # Check if wedding already exists
        existing_so = erp.find_one('Sales Order', {'custom_meraki_wedding_id': wedding['id']})
        if existing_so:
            print(f"  Skipped (exists): Wedding {wedding['id']} - {wedding['client']}")
            results['skipped'] += 1
            continue

        # Get related entities
        customer_name = get_customer_name(erp, wedding.get('client'))
        if not customer_name:
            print(f"  Failed (no customer): Wedding {wedding['id']} - {wedding['client']}")
            results['failed'] += 1
            continue

        venue_name = get_venue_name_by_meraki_id(erp, wedding.get('venue_id'))

        # Create Sales Order
        sales_order = create_sales_order(erp, wedding, customer_name, venue_name)
        if not sales_order:
            print(f"  Failed (SO): Wedding {wedding['id']} - {wedding['client']}")
            results['failed'] += 1
            continue

        sales_order_name = sales_order.get('name')

        # Create Project
        project = create_project(erp, wedding, customer_name, sales_order_name, staff_map)
        if not project:
            print(f"  Failed (Project): Wedding {wedding['id']} - {wedding['client']}")
            results['failed'] += 1
            continue

        project_name = project.get('name')

        # Update Sales Order with Project link
        erp.update('Sales Order', sales_order_name, {'custom_wedding_project': project_name})

        print(f"  Created: Wedding {wedding['id']} - {wedding['client']} (SO: {sales_order_name}, Project: {project_name})")
        results['created'] += 1

    return results
