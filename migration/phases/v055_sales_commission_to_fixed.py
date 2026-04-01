"""Change Full/Partial Package Commission fields from Percent to Currency (fixed VND amounts)."""


def run(client):
    for fieldname, new_label in [
        ("custom_full_package_commission_pct", "Full Package Commission (VND)"),
        ("custom_partial_package_commission_pct", "Partial Package Commission (VND)"),
    ]:
        cf = client.exists("Custom Field", {"dt": "Employee", "fieldname": fieldname})
        if not cf:
            print(f"  Custom Field '{fieldname}' not found, skipping")
            continue
        # Get the actual Custom Field name (e.g. "Employee-custom_full_package_commission_pct")
        cf_name = cf if isinstance(cf, str) else f"Employee-{fieldname}"
        client.update("Custom Field", cf_name, {
            "fieldtype": "Currency",
            "label": new_label,
        })
        print(f"  Updated {fieldname}: Percent -> Currency, label -> '{new_label}'")
