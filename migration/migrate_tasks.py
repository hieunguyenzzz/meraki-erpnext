"""
Migrate tasks to ERPNext Tasks linked to Projects.

Creates:
- Custom Field for Meraki task ID
- Tasks linked to wedding Projects
"""

from erpnext_client import ERPNextClient
from pg_client import MerakiPGClient


def setup_custom_fields(erp: ERPNextClient) -> bool:
    """Create custom fields on Task."""
    custom_fields = [
        {
            'dt': 'Task',
            'fieldname': 'custom_meraki_task_id',
            'label': 'Meraki Task ID',
            'fieldtype': 'Int',
            'insert_after': 'subject',
            'description': 'Original task ID from Meraki system',
            'unique': 1,
        },
        {
            'dt': 'Task',
            'fieldname': 'custom_assigned_employee',
            'label': 'Assigned Employee',
            'fieldtype': 'Link',
            'options': 'Employee',
            'insert_after': 'custom_meraki_task_id',
        },
    ]

    for field in custom_fields:
        fieldname = field['fieldname']
        if erp.exists('Custom Field', {'dt': 'Task', 'fieldname': fieldname}):
            print(f"    Custom field exists: Task.{fieldname}")
            continue

        result = erp.create_custom_field(field)
        if result:
            print(f"    Created: Task.{fieldname}")
        else:
            print(f"    Failed: Task.{fieldname}")

    return True


def get_project_by_wedding_id(erp: ERPNextClient, wedding_id: int) -> str:
    """Get ERPNext Project name by Meraki wedding ID."""
    if not wedding_id:
        return ''
    project = erp.find_one('Project', {'custom_meraki_wedding_id': wedding_id})
    return project.get('name', '') if project else ''


def get_employee_by_meraki_id(erp: ERPNextClient, staff_id: int) -> str:
    """Get ERPNext Employee name by Meraki staff ID."""
    if not staff_id:
        return ''
    employee = erp.find_one('Employee', {'custom_meraki_id': staff_id})
    return employee.get('name', '') if employee else ''


def migrate_tasks(pg: MerakiPGClient, erp: ERPNextClient) -> dict:
    """Main migration function for tasks."""
    results = {'created': 0, 'skipped': 0, 'failed': 0}

    # Setup custom fields
    print("  Setting up Custom Fields...")
    setup_custom_fields(erp)

    # Migrate tasks
    tasks = pg.get_all_tasks()
    print(f"  Found {len(tasks)} tasks to migrate")

    for task in tasks:
        # Check if task already exists
        if erp.exists('Task', {'custom_meraki_task_id': task['id']}):
            print(f"  Skipped (exists): Task {task['id']} - {task['title']}")
            results['skipped'] += 1
            continue

        # Get project for this task
        project_name = get_project_by_wedding_id(erp, task.get('wedding_id'))

        # Get assigned employee
        employee_name = get_employee_by_meraki_id(erp, task.get('staff_id'))

        # Prepare task data
        data = {
            'subject': task['title'] or 'Untitled Task',
            'description': task.get('content', ''),
            'project': project_name if project_name else None,
            'status': 'Completed',  # Historical tasks are completed
            'custom_meraki_task_id': task['id'],
            'custom_assigned_employee': employee_name if employee_name else None,
        }

        result = erp.create_task(data)
        if result:
            print(f"  Created: Task {task['id']} - {task['title']}")
            results['created'] += 1
        else:
            print(f"  Failed: Task {task['id']} - {task['title']}")
            results['failed'] += 1

    return results
