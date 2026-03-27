"""
v041: Wedding Vendor child doctype, custom field on Project, and Supplier Group.

Creates:
- DocType: Wedding Vendor (child table for Project)
- Custom Field: custom_wedding_vendors (Table → Wedding Vendor) on Project
- Supplier Group: Wedding Vendors
"""

CATEGORY_OPTIONS = "\n".join([
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


def run(client):
    # 1. Child DocType: Wedding Vendor
    if not client.exists("DocType", {"name": "Wedding Vendor"}):
        client.create("DocType", {
            "name": "Wedding Vendor",
            "module": "Projects",
            "istable": 1,
            "editable_grid": 1,
            "custom": 1,
            "fields": [
                {
                    "fieldname": "category",
                    "fieldtype": "Select",
                    "label": "Category",
                    "options": CATEGORY_OPTIONS,
                    "reqd": 1,
                    "in_list_view": 1,
                    "columns": 3,
                },
                {
                    "fieldname": "supplier",
                    "fieldtype": "Link",
                    "label": "Supplier",
                    "options": "Supplier",
                    "reqd": 1,
                    "in_list_view": 1,
                    "columns": 4,
                },
                {
                    "fieldname": "notes",
                    "fieldtype": "Small Text",
                    "label": "Notes",
                    "in_list_view": 1,
                    "columns": 5,
                },
            ],
            "permissions": [
                {"role": "System Manager", "read": 1, "write": 1, "create": 1, "delete": 1},
                {"role": "Projects Manager", "read": 1, "write": 1, "create": 1, "delete": 1},
                {"role": "Projects User", "read": 1, "write": 1, "create": 1, "delete": 1},
            ],
        })
        print("  Created DocType: Wedding Vendor")
    else:
        print("  DocType exists: Wedding Vendor")

    # 2. Custom Field on Project
    if not client.exists("Custom Field", {"name": "Project-custom_wedding_vendors"}):
        client.create("Custom Field", {
            "dt": "Project",
            "fieldname": "custom_wedding_vendors",
            "fieldtype": "Table",
            "label": "Wedding Vendors",
            "options": "Wedding Vendor",
            "insert_after": "notes",
        })
        print("  Created Custom Field: Project.custom_wedding_vendors")
    else:
        print("  Custom Field exists: Project.custom_wedding_vendors")

    # 3. Supplier Group
    if not client.exists("Supplier Group", {"name": "Wedding Vendors"}):
        client.create("Supplier Group", {
            "supplier_group_name": "Wedding Vendors",
            "parent_supplier_group": "Venues",
            "is_group": 0,
        })
        print("  Created Supplier Group: Wedding Vendors")
    else:
        print("  Supplier Group exists: Wedding Vendors")

    print("  v041 wedding vendors setup complete.")
