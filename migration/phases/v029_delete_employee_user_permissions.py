"""Delete Employee User Permissions that block Project/SO visibility.

Frappe enforces User Permissions at document-read level regardless of
apply_to_all_doctypes or applicable_for settings. The Employee User Permission
causes Projects with planner fields set to be invisible to non-matching employees.
Deleting these is safe — Company User Permission still scopes data correctly.
"""
import os
import json as json_lib


def run(client):
    site_name = os.environ.get("SITE_NAME", "")
    headers = dict(client._get_headers())
    if site_name:
        headers["Host"] = site_name

    print("v029: Deleting Employee User Permissions...")

    # Find all Employee User Permissions
    r = client.session.get(
        f"{client.url}/api/resource/User%20Permission",
        headers=headers,
        params={
            "filters": json_lib.dumps({"allow": "Employee"}),
            "fields": json_lib.dumps(["name", "user", "for_value"]),
            "limit_page_length": 0,
        },
        timeout=30,
    )
    if r.status_code != 200:
        raise RuntimeError(f"Failed to list: {r.status_code} - {r.text[:300]}")

    perms = r.json().get("data", [])
    print(f"  Found {len(perms)} Employee User Permissions to delete")

    for perm in perms:
        name = perm["name"]
        user = perm["user"]
        r2 = client.session.delete(
            f"{client.url}/api/resource/User%20Permission/{name}",
            headers=headers,
            timeout=30,
        )
        if r2.status_code in (200, 202):
            print(f"  Deleted {name} for {user}")
        else:
            raise RuntimeError(f"Failed to delete {name}: {r2.status_code} - {r2.text[:300]}")

    print("v029: Done.")
