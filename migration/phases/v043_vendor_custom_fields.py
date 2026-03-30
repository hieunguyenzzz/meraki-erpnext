"""
v043: Vendor-specific custom fields on Supplier.

Creates custom fields for wedding vendor info:
- custom_vendor_category (Select)
- custom_contact_phone (Data)
- custom_contact_email (Data)
"""

VENDOR_CATEGORIES = "\n".join([
    "Decoration / Floral",
    "Photography",
    "Videography",
    "Makeup & Hair",
    "MC / Emcee",
    "Music / DJ / Band",
    "Catering",
    "Wedding Cake",
    "Invitation / Stationery",
    "Bridal Attire",
    "Transportation",
    "Lighting / Effects",
])

FIELDS = [
    {
        "dt": "Supplier",
        "fieldname": "custom_vendor_category",
        "fieldtype": "Select",
        "label": "Vendor Category",
        "options": VENDOR_CATEGORIES,
        "insert_after": "supplier_group",
        "depends_on": 'eval:doc.supplier_group=="Wedding Vendors"',
    },
    {
        "dt": "Supplier",
        "fieldname": "custom_contact_phone",
        "fieldtype": "Data",
        "label": "Contact Phone",
        "insert_after": "custom_contact_person",
    },
    {
        "dt": "Supplier",
        "fieldname": "custom_contact_email",
        "fieldtype": "Data",
        "label": "Contact Email",
        "options": "Email",
        "insert_after": "custom_contact_phone",
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

    print("  v043 vendor custom fields complete.")
