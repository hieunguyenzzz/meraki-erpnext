"""Rename 'Casual Leave' to 'Annual Leave' and delete 'Privilege Leave'."""


def run(client):
    # Rename Casual Leave -> Annual Leave
    has_casual = client.get("Leave Type", "Casual Leave")
    has_annual = client.get("Leave Type", "Annual Leave")

    if has_casual and not has_annual:
        print("  Renaming 'Casual Leave' to 'Annual Leave'...")
        resp = client.session.post(
            f"{client.url}/api/method/frappe.client.rename_doc",
            headers=client._get_headers(),
            data={
                "doctype": "Leave Type",
                "old_name": "Casual Leave",
                "new_name": "Annual Leave",
            },
            timeout=30,
        )
        resp.raise_for_status()
        print("  Done — all references updated by ERPNext cascade")
    elif has_annual:
        print("  'Annual Leave' already exists, skipping rename")
    else:
        print("  WARNING: Neither 'Casual Leave' nor 'Annual Leave' found")

    # Delete Privilege Leave (unused)
    if client.get("Leave Type", "Privilege Leave"):
        print("  Deleting 'Privilege Leave'...")
        client.delete("Leave Type", "Privilege Leave")
        print("  Done")
    else:
        print("  'Privilege Leave' already deleted, skipping")
