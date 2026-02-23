def run(client):
    # The custom_meraki_wedding_id field was created with unique=1 for migrated
    # PostgreSQL records. New weddings created from the UI have no PostgreSQL ID
    # and get 0 as default, which collides. Remove the unique constraint so the
    # field only serves as an identifier for migrated records.
    for doctype in ["Sales Order", "Project"]:
        field_name = f"{doctype}-custom_meraki_wedding_id"
        result = client.update("Custom Field", field_name, {"unique": 0})
        if result:
            print(f"  Removed unique constraint from {field_name}")
        else:
            print(f"  Warning: could not update {field_name} (may already be correct)")
