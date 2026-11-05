"""
v104: Contact person and notes custom fields on Supplier.

The Vendors pages read custom_contact_person and custom_notes, but production
only had custom_contact_email / custom_contact_phone (v043), so the list 417'd.
Idempotent: skips fields that already exist.
"""

FIELDS = [
    {
        "dt": "Supplier",
        "fieldname": "custom_contact_person",
        "fieldtype": "Data",
        "label": "Contact Person",
        "insert_after": "custom_vendor_category",
    },
    {
        "dt": "Supplier",
        "fieldname": "custom_notes",
        "fieldtype": "Small Text",
        "label": "Vendor Notes",
        "insert_after": "custom_contact_email",
    },
]


def run(client):
    for field in FIELDS:
        cf_name = f"Supplier-{field['fieldname']}"
        if not client.exists("Custom Field", {"name": cf_name}):
            client.create("Custom Field", field)
            print(f"  Created Custom Field: {cf_name}")
        else:
            print(f"  Custom Field exists: {cf_name}")
