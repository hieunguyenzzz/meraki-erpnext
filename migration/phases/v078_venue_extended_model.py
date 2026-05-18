"""
v078: Extended venue model for the MERAKI - VENUE Google Sheet import.

Creates:
- DocType: Venue Wedding Area (child table for Supplier)
- Custom fields on Supplier for venue metadata (only visible when
  supplier_group == "Wedding Venues")

See docs/plans/2026-05-17-venue-import-from-sheet-design.md
"""

AREA_TYPE_OPTIONS = "\n".join([
    "Ballroom/Indoor",
    "Lawn",
    "Beach",
    "Restaurant/Café/Bar",
    "Pool",
    "Other",
])

PRICE_RANGE_OPTIONS = "\n".join([
    "",
    "LOW",
    "MID",
    "HIGH",
    "LUXURY",
    "UNKNOWN",
])

WEDDING_VENUE_DEPENDS_ON = 'eval:doc.supplier_group=="Wedding Venues"'


def _venue_field(fieldname, fieldtype, label, insert_after, **extra):
    field = {
        "dt": "Supplier",
        "fieldname": fieldname,
        "fieldtype": fieldtype,
        "label": label,
        "insert_after": insert_after,
        "depends_on": WEDDING_VENUE_DEPENDS_ON,
    }
    field.update(extra)
    return field


def run(client):
    # 1. Child DocType: Venue Wedding Area
    if not client.exists("DocType", {"name": "Venue Wedding Area"}):
        client.create("DocType", {
            "name": "Venue Wedding Area",
            "module": "Buying",
            "istable": 1,
            "editable_grid": 1,
            "custom": 1,
            "fields": [
                {
                    "fieldname": "area_name",
                    "fieldtype": "Data",
                    "label": "Area Name",
                    "reqd": 1,
                    "in_list_view": 1,
                    "columns": 3,
                },
                {
                    "fieldname": "area_type",
                    "fieldtype": "Select",
                    "label": "Type",
                    "options": AREA_TYPE_OPTIONS,
                    "in_list_view": 1,
                    "columns": 2,
                },
                {
                    "fieldname": "function",
                    "fieldtype": "Small Text",
                    "label": "Function",
                    "in_list_view": 1,
                    "columns": 3,
                },
                {
                    "fieldname": "capacity_min",
                    "fieldtype": "Int",
                    "label": "Capacity Min",
                    "in_list_view": 1,
                    "columns": 1,
                },
                {
                    "fieldname": "capacity_max",
                    "fieldtype": "Int",
                    "label": "Capacity Max",
                    "in_list_view": 1,
                    "columns": 1,
                },
                {
                    "fieldname": "capacity_notes",
                    "fieldtype": "Small Text",
                    "label": "Capacity Notes",
                },
                {
                    "fieldname": "policy_min_spend",
                    "fieldtype": "Small Text",
                    "label": "Policy / Min Spend",
                },
                {
                    "fieldname": "setup_notes",
                    "fieldtype": "Small Text",
                    "label": "Setup Notes",
                },
                {
                    "fieldname": "meraki_weddings",
                    "fieldtype": "Small Text",
                    "label": "Meraki's Past Weddings",
                },
                {
                    "fieldname": "photos_url",
                    "fieldtype": "Data",
                    "label": "Photos URL",
                    "options": "URL",
                },
            ],
            "permissions": [
                {"role": "System Manager", "read": 1, "write": 1, "create": 1, "delete": 1},
                {"role": "Purchase Manager", "read": 1, "write": 1, "create": 1, "delete": 1},
                {"role": "Purchase User", "read": 1, "write": 1, "create": 1, "delete": 1},
            ],
        })
        print("  Created DocType: Venue Wedding Area")
    else:
        print("  DocType exists: Venue Wedding Area")

    # 2. Custom fields on Supplier (ordered — each insert_after refs the previous)
    # custom_meraki_venue_id and custom_venue_city already exist from v001/suppliers module.
    custom_fields = [
        _venue_field(
            "custom_venue_external_key", "Data", "Venue External Key",
            insert_after="custom_venue_city",
            unique=1,
            read_only=1,
            description="Slug key from MERAKI - VENUE sheet import (city-venue-name).",
        ),
        _venue_field(
            "custom_venue_type", "Data", "Venue Type",
            insert_after="custom_venue_external_key",
            description="e.g. Resort/Retreat, City Hotel, Beach Resort.",
        ),
        _venue_field(
            "custom_venue_price_range", "Select", "Price Range",
            insert_after="custom_venue_type",
            options=PRICE_RANGE_OPTIONS,
        ),
        _venue_field(
            "custom_venue_location_subarea", "Data", "Location Subarea",
            insert_after="custom_venue_price_range",
            description="Column-A value from non-HCM tabs in the source sheet.",
        ),
        _venue_field(
            "custom_venue_wedding_package_text", "Long Text", "Wedding Package",
            insert_after="custom_venue_location_subarea",
        ),
        _venue_field(
            "custom_venue_wedding_package_url", "Data", "Wedding Package URL",
            insert_after="custom_venue_wedding_package_text",
            options="URL",
        ),
        _venue_field(
            "custom_venue_insights", "Long Text", "Insights from Meraki",
            insert_after="custom_venue_wedding_package_url",
        ),
        _venue_field(
            "custom_venue_accommodation", "Long Text", "Accommodation",
            insert_after="custom_venue_insights",
        ),
        _venue_field(
            "custom_venue_fnb", "Long Text", "Food & Beverage",
            insert_after="custom_venue_accommodation",
        ),
        _venue_field(
            "custom_venue_av_policy", "Long Text", "AV Policy",
            insert_after="custom_venue_fnb",
        ),
        _venue_field(
            "custom_venue_facility", "Long Text", "Facility",
            insert_after="custom_venue_av_policy",
        ),
        _venue_field(
            "custom_venue_after_party", "Long Text", "After Party",
            insert_after="custom_venue_facility",
        ),
        _venue_field(
            "custom_venue_contact_raw", "Long Text", "Contact (raw)",
            insert_after="custom_venue_after_party",
            description="Original unparsed Address & Contact blob — fallback only.",
        ),
        _venue_field(
            "custom_venue_source", "Data", "Import Source",
            insert_after="custom_venue_contact_raw",
            read_only=1,
            description="google-sheet:<sheet>:<tab>:<row>",
        ),
        _venue_field(
            "custom_venue_wedding_areas", "Table", "Wedding Areas",
            insert_after="custom_venue_source",
            options="Venue Wedding Area",
        ),
    ]

    for cf in custom_fields:
        cf_name = f"Supplier-{cf['fieldname']}"
        if not client.exists("Custom Field", {"name": cf_name}):
            client.create_custom_field(cf)
            print(f"  Created Custom Field: {cf_name}")
        else:
            print(f"  Custom Field exists: {cf_name}")

    print("  v078 venue extended model complete.")
