#!/usr/bin/env python3
"""
Add custom_ai_summary field to Lead doctype
"""
import frappe

def add_custom_field():
    frappe.init(site='erp.merakiwp.com')
    frappe.connect()

    # Check if field already exists
    if frappe.db.exists('Custom Field', {'dt': 'Lead', 'fieldname': 'custom_ai_summary'}):
        print("Custom field 'custom_ai_summary' already exists on Lead doctype")
        return

    # Create the custom field
    custom_field = frappe.get_doc({
        'doctype': 'Custom Field',
        'dt': 'Lead',
        'fieldname': 'custom_ai_summary',
        'fieldtype': 'Text Editor',
        'label': 'AI Summary',
        'read_only': 1,
        'insert_after': 'notes'
    })

    custom_field.insert()
    frappe.db.commit()

    print(f"Successfully created custom field: {custom_field.name}")
    print(f"Fieldname: {custom_field.fieldname}")
    print(f"Fieldtype: {custom_field.fieldtype}")
    print(f"Label: {custom_field.label}")
    print(f"Read Only: {custom_field.read_only}")

if __name__ == '__main__':
    add_custom_field()
