#!/usr/bin/env python3
"""Add custom fields to Communication doctype for AI suggestion persistence."""

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

def add_communication_custom_fields():
    """Add custom_ai_suggestion and custom_ai_tone fields to Communication doctype."""

    custom_fields = {
        'Communication': [
            {
                'fieldname': 'custom_ai_suggestion',
                'label': 'AI Suggested Response',
                'fieldtype': 'Text',
                'insert_after': 'content',
                'description': 'AI-generated response suggestion for this communication',
            },
            {
                'fieldname': 'custom_ai_tone',
                'label': 'Suggestion Tone',
                'fieldtype': 'Select',
                'options': '\nprofessional\nwarm\nconcise\ndetailed',
                'insert_after': 'custom_ai_suggestion',
                'description': 'Tone used for the AI suggestion',
            }
        ]
    }

    print("Creating custom fields for Communication doctype...")
    create_custom_fields(custom_fields)
    frappe.db.commit()
    print("Custom fields created successfully!")

    # Verify fields exist
    print("\nVerifying custom fields:")
    fields = frappe.get_all(
        "Custom Field",
        filters={"dt": "Communication", "fieldname": ["in", ["custom_ai_suggestion", "custom_ai_tone"]]},
        fields=["fieldname", "label", "fieldtype"]
    )
    for field in fields:
        print(f"  - {field.fieldname}: {field.label} ({field.fieldtype})")

if __name__ == "__main__":
    add_communication_custom_fields()
