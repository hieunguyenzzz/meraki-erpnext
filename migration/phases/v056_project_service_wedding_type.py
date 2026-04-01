"""Add custom_service_type and custom_wedding_type fields to Project doctype,
then backfill values from linked Sales Orders."""


def run(client):
    # 1. Create custom fields on Project
    for fieldname, label, options, insert_after in [
        ("custom_service_type", "Service Type", "\nFull Package\nPartial\nCoordinator", "custom_booking_date"),
        ("custom_wedding_type", "Wedding Type", "\nHCM\nDestination", "custom_service_type"),
    ]:
        existing = client.exists("Custom Field", {"dt": "Project", "fieldname": fieldname})
        if existing:
            print(f"  Custom Field Project.{fieldname} already exists, skipping creation")
        else:
            client.create("Custom Field", {
                "dt": "Project",
                "fieldname": fieldname,
                "fieldtype": "Select",
                "label": label,
                "options": options,
                "insert_after": insert_after,
            })
            print(f"  Created Custom Field Project.{fieldname}")

    # 2. Backfill from linked Sales Orders
    projects = client.get_list("Project", filters=[["sales_order", "is", "set"]], fields=["name", "sales_order"], limit=500)
    updated = 0
    for proj in projects:
        so_name = proj.get("sales_order")
        if not so_name:
            continue
        try:
            so = client.get("Sales Order", so_name)
        except Exception:
            continue
        svc = so.get("custom_service_type") or ""
        wt = so.get("custom_wedding_type") or ""
        if svc or wt:
            updates = {}
            if svc:
                updates["custom_service_type"] = svc
            if wt:
                updates["custom_wedding_type"] = wt
            client.update("Project", proj["name"], updates)
            updated += 1
    print(f"  Backfilled {updated}/{len(projects)} projects from Sales Order data")
