def run(client):
    """
    Fix the unique constraint issue on Supplier.custom_meraki_venue_id.

    The v001 phase set unique=0 on the Custom Field metadata, but the
    DB-level index only gets dropped after bench migrate runs. Until then,
    new Suppliers fail with a duplicate-entry error because the field
    defaults to integer 0.

    Fix: set both unique=0 AND default="" so new Suppliers get NULL
    instead of 0, bypassing the unique constraint entirely — no bench
    migrate required.
    """
    field_name = "Supplier-custom_meraki_venue_id"

    if not client.exists("Custom Field", {"dt": "Supplier", "fieldname": "custom_meraki_venue_id"}):
        print("  custom_meraki_venue_id field not found — skipping")
        return

    result = client.update("Custom Field", field_name, {
        "unique": 0,
        "default": "",
    })
    if result:
        print("  Fixed Supplier-custom_meraki_venue_id: unique=0, default=empty")
    else:
        print("  Warning: could not update Supplier-custom_meraki_venue_id")
