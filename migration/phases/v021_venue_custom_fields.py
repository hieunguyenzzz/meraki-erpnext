"""
Add 7 custom fields to Supplier doctype for venue details:
location, capacity_min, capacity_max, price_range, features, contact_person, notes
"""

VENUE_FIELDS = [
    ("custom_location", "Location", "Data", None, "custom_venue_city"),
    ("custom_capacity_min", "Capacity Min", "Int", None, "custom_location"),
    ("custom_capacity_max", "Capacity Max", "Int", None, "custom_capacity_min"),
    ("custom_price_range", "Price Range", "Data", None, "custom_capacity_max"),
    ("custom_features", "Features", "Text", None, "custom_price_range"),
    ("custom_contact_person", "Contact Person", "Data", None, "custom_features"),
    ("custom_notes", "Notes", "Text", None, "custom_contact_person"),
]


def run(client):
    print("v021: Adding venue custom fields to Supplier...")

    for fieldname, label, fieldtype, options, insert_after in VENUE_FIELDS:
        existing = client.get_list("Custom Field", filters={"dt": "Supplier", "fieldname": fieldname}, limit=1)
        if not existing:
            field_data = {
                "dt": "Supplier",
                "fieldname": fieldname,
                "label": label,
                "fieldtype": fieldtype,
                "insert_after": insert_after,
                "hidden": 0,
            }
            if options:
                field_data["options"] = options
            client.create("Custom Field", field_data)
            print(f"  Created Supplier field: {fieldname}")
        else:
            print(f"  Supplier field exists: {fieldname}")

    print("v021: Done.")
