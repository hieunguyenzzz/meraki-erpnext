"""
v079: Gallery metadata fields for venues.

Adds three custom fields enabling the heavy-use venue gallery:
- File.custom_caption          — per-photo caption text
- File.custom_venue_area       — tag photo with one of the venue's wedding areas
- Supplier.custom_cover_photo  — pointer to the venue's hero/cover photo

See docs/plans/2026-05-18-venue-ui-design.md (Section 4).
"""

WEDDING_VENUE_DEPENDS_ON = 'eval:doc.supplier_group=="Wedding Venues"'


def run(client):
    fields = [
        {
            "dt": "File",
            "fieldname": "custom_caption",
            "fieldtype": "Small Text",
            "label": "Caption",
            "insert_after": "file_name",
        },
        {
            "dt": "File",
            "fieldname": "custom_venue_area",
            "fieldtype": "Data",
            "label": "Venue Area",
            "insert_after": "custom_caption",
            "description": "Name of the venue wedding area this photo belongs to (e.g. 'Lawn', 'Main Ballroom').",
        },
        {
            "dt": "Supplier",
            "fieldname": "custom_cover_photo",
            "fieldtype": "Link",
            "options": "File",
            "label": "Cover Photo",
            "insert_after": "custom_venue_external_key",
            "depends_on": WEDDING_VENUE_DEPENDS_ON,
        },
    ]

    for spec in fields:
        existing = client.get_list(
            "Custom Field",
            filters=[["dt", "=", spec["dt"]], ["fieldname", "=", spec["fieldname"]]],
            fields=["name"],
            limit=1,
        )
        if existing:
            continue
        client.create("Custom Field", spec)
