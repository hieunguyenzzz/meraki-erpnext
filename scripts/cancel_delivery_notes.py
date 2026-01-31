#!/usr/bin/env python3
"""
Script to cancel all submitted Delivery Notes
"""

import frappe

def cancel_delivery_notes():
    # Get all submitted Delivery Notes
    delivery_notes = frappe.get_all('Delivery Note',
                                     filters={'docstatus': 1},
                                     fields=['name'],
                                     order_by='name')

    print(f"Found {len(delivery_notes)} submitted Delivery Notes to cancel")

    cancelled_count = 0
    failed = []

    for dn in delivery_notes:
        try:
            doc = frappe.get_doc('Delivery Note', dn.name)
            doc.cancel()
            cancelled_count += 1

            if cancelled_count % 10 == 0:
                print(f"Cancelled {cancelled_count} Delivery Notes...")
                frappe.db.commit()
        except Exception as e:
            print(f"Failed to cancel {dn.name}: {str(e)}")
            failed.append((dn.name, str(e)))

    frappe.db.commit()

    print(f"\nCompleted:")
    print(f"  - Successfully cancelled: {cancelled_count}")
    print(f"  - Failed: {len(failed)}")

    if failed:
        print("\nFailed Delivery Notes:")
        for name, error in failed:
            print(f"  - {name}: {error}")

if __name__ == '__main__':
    cancel_delivery_notes()
