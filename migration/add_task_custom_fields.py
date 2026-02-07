#!/usr/bin/env python3
"""Add custom fields to Task doctype for wedding phase tracking and multi-user assignment."""

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

def add_task_custom_fields():
    """Add custom_wedding_phase and custom_shared_with fields to Task doctype."""

    custom_fields = {
        'Task': [
            {
                'fieldname': 'custom_wedding_phase',
                'label': 'Wedding Phase',
                'fieldtype': 'Select',
                'options': '\nOnboarding\nPlanning\nFinal Details\nWedding Week\nDay-of\nCompleted',
                'insert_after': 'project',
                'description': 'The wedding planning phase this task belongs to',
            },
            {
                'fieldname': 'custom_shared_with',
                'label': 'Shared With',
                'fieldtype': 'Small Text',
                'insert_after': 'custom_wedding_phase',
                'description': 'Additional users who can see this task (comma-separated employee IDs)',
            }
        ]
    }

    print("Creating custom fields for Task doctype...")
    create_custom_fields(custom_fields)
    frappe.db.commit()
    print("Custom fields created successfully!")

    # Verify fields exist
    print("\nVerifying custom fields:")
    fields = frappe.get_all(
        "Custom Field",
        filters={"dt": "Task", "fieldname": ["in", ["custom_wedding_phase", "custom_shared_with"]]},
        fields=["fieldname", "label", "fieldtype"]
    )
    for field in fields:
        print(f"  - {field.fieldname}: {field.label} ({field.fieldtype})")

if __name__ == "__main__":
    add_task_custom_fields()
