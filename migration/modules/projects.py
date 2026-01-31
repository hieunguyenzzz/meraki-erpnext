"""
Module: projects
ERPNext Doctypes: Project, Task
Source: weddings table (for projects), task table (for tasks)

Creates Projects linked to Sales Orders and Tasks linked to Projects.
"""

import time
from datetime import datetime
from core.erpnext_client import ERPNextClient
from core.pg_client import MerakiPGClient


COMPANY = 'Meraki Wedding Planner'


def setup_custom_fields(erp: ERPNextClient) -> bool:
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


def _build_staff_map(erp: ERPNextClient) -> dict:
    """Build a map of Meraki staff ID to ERPNext Employee name."""
    employees = erp.get_list('Employee', fields=['name', 'custom_meraki_id'], limit=100)
    return {emp.get('custom_meraki_id'): emp.get('name') for emp in employees if emp.get('custom_meraki_id')}


def _get_sales_order_name(erp: ERPNextClient, wedding_id: int) -> str:
    """Get Sales Order name by wedding ID."""
    so = erp.find_one('Sales Order', {'custom_meraki_wedding_id': wedding_id})
    return so.get('name', '') if so else ''


def _create_project(erp: ERPNextClient, wedding: dict, customer_name: str,
                    sales_order_name: str, staff_map: dict) -> dict:
    """Create Project for a wedding."""
    wedding_date = str(wedding['date']) if wedding.get('date') else datetime.now().strftime('%Y-%m-%d')
    project_name = f"Wedding - {wedding['client']} - {wedding_date}"

    lead_planner = staff_map.get(wedding.get('lead_planner_id'), '')
    support_planner = staff_map.get(wedding.get('support_planner_id'), '')
    assistant_1 = staff_map.get(wedding.get('assistant1_id'), '')
    assistant_2 = staff_map.get(wedding.get('assistant2_id'), '')

    # Determine project status based on wedding date
    today = datetime.now().date()
    wedding_date_obj = wedding.get('date')

    if wedding_date_obj:
        if isinstance(wedding_date_obj, str):
            try:
                wedding_date_obj = datetime.strptime(wedding_date_obj, '%Y-%m-%d').date()
            except:
                wedding_date_obj = None
        elif isinstance(wedding_date_obj, datetime):
            wedding_date_obj = wedding_date_obj.date()

    project_status = 'Completed' if (wedding_date_obj and wedding_date_obj < today) else 'Open'

    data = {
        'project_name': project_name,
        'company': COMPANY,
        'customer': customer_name,
        'expected_end_date': wedding_date,
        'status': project_status,
        'custom_meraki_wedding_id': wedding['id'],
        'custom_wedding_sales_order': sales_order_name,
        'custom_lead_planner': lead_planner if lead_planner else None,
        'custom_support_planner': support_planner if support_planner else None,
        'custom_assistant_1': assistant_1 if assistant_1 else None,
        'custom_assistant_2': assistant_2 if assistant_2 else None,
    }

    return erp.create_project(data)


def setup(erp: ERPNextClient) -> bool:
    """Create prerequisites (custom fields)."""
    print("  Setting up Custom Fields on Project...")
    return setup_custom_fields(erp)


def migrate(pg: MerakiPGClient, erp: ERPNextClient, dry_run: bool = False, delay: float = 1.5) -> dict:
    """Main migration function for projects.

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

    print("  Building staff mapping...")
    staff_map = _build_staff_map(erp)
    print(f"    Found {len(staff_map)} employees with Meraki IDs")
    time.sleep(delay)

    weddings = pg.get_all_weddings()
    print(f"  Found {len(weddings)} weddings to create Projects for")

    for idx, wedding in enumerate(weddings, 1):
        print(f"  [{idx}/{len(weddings)}] Processing wedding {wedding['id']} - {wedding['client']}")

        existing_project = erp.find_one('Project', {'custom_meraki_wedding_id': wedding['id']})
        time.sleep(delay)

        if existing_project:
            print(f"    Skipped (exists)")
            results['skipped'] += 1
            continue

        if dry_run:
            print(f"    [DRY RUN] Would create Project")
            continue

        sales_order_name = _get_sales_order_name(erp, wedding['id'])
        time.sleep(delay)

        customer_name = wedding.get('client', '').strip() if wedding.get('client') else ''

        project = _create_project(erp, wedding, customer_name, sales_order_name, staff_map)
        time.sleep(delay)

        if not project:
            print(f"    Failed (Project creation)")
            results['failed'] += 1
            continue

        project_name = project.get('name')

        # Update Sales Order with Project link
        if sales_order_name:
            erp.update('Sales Order', sales_order_name, {'custom_wedding_project': project_name})
            time.sleep(delay)

        print(f"    Created: {project_name}")
        results['created'] += 1

    return results


def migrate_tasks(pg: MerakiPGClient, erp: ERPNextClient, dry_run: bool = False) -> dict:
    """Migrate tasks from source database."""
    results = {'created': 0, 'skipped': 0, 'failed': 0}

    tasks = pg.get_all_tasks()
    print(f"  Found {len(tasks)} tasks to migrate")

    # Build project map (wedding_id -> project_name)
    projects = erp.get_list('Project', fields=['name', 'custom_meraki_wedding_id'], limit=500)
    project_map = {p.get('custom_meraki_wedding_id'): p.get('name') for p in projects if p.get('custom_meraki_wedding_id')}

    for task in tasks:
        project_name = project_map.get(task.get('wedding_id'))
        if not project_name:
            print(f"    Skipped (no project): Task {task['id']}")
            results['skipped'] += 1
            continue

        if dry_run:
            print(f"    [DRY RUN] Would create Task: {task['title']}")
            continue

        data = {
            'subject': task['title'],
            'project': project_name,
            'description': task.get('content', ''),
            'status': 'Completed',
        }

        result = erp.create('Task', data)
        if result:
            print(f"    Created: {task['title']}")
            results['created'] += 1
        else:
            print(f"    Failed: {task['title']}")
            results['failed'] += 1

    return results


def verify(erp: ERPNextClient) -> dict:
    """Verify migration results."""
    projects = erp.get_list('Project',
                            filters={'custom_meraki_wedding_id': ['is', 'set']},
                            fields=['name', 'status', 'custom_meraki_wedding_id'])

    completed = [p for p in projects if p.get('status') == 'Completed']
    open_projects = [p for p in projects if p.get('status') == 'Open']

    issues = []
    if len(projects) < 134:
        issues.append(f'Project count ({len(projects)}) is less than expected (134)')

    return {
        'expected': 134,
        'actual': len(projects),
        'completed': len(completed),
        'open': len(open_projects),
        'issues': issues,
    }


if __name__ == "__main__":
    from core.config import get_config, validate_config

    print("=" * 60)
    print("PROJECT MIGRATION")
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
