#!/usr/bin/env python3
"""
Script to update skip_delivery_note on all submitted Sales Orders
Uses db_set to bypass validation
"""

import frappe

def update_skip_delivery_note():
    # Get all submitted Sales Orders
    sales_orders = frappe.get_all('Sales Order',
                                   filters={'docstatus': 1},
                                   fields=['name', 'skip_delivery_note'],
                                   order_by='name')

    print(f"Found {len(sales_orders)} submitted Sales Orders")

    updated_count = 0
    already_set_count = 0

    for so in sales_orders:
        if so.skip_delivery_note == 1:
            already_set_count += 1
            continue

        # Use db_set to bypass validation
        frappe.db.set_value('Sales Order', so.name, 'skip_delivery_note', 1,
                           update_modified=False)
        updated_count += 1

        if updated_count % 10 == 0:
            print(f"Updated {updated_count} Sales Orders...")

    frappe.db.commit()

    print(f"\nCompleted:")
    print(f"  - Already had skip_delivery_note=1: {already_set_count}")
    print(f"  - Updated to skip_delivery_note=1: {updated_count}")
    print(f"  - Total: {len(sales_orders)}")

if __name__ == '__main__':
    update_skip_delivery_note()
