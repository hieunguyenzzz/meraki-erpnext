"""
Grant Sales Manager and Sales User roles unrestricted read access to Project and
Sales Order by creating Permission Query server scripts that bypass Employee-based
User Permission filtering for those roles.

Background: Project has custom Employee link fields (custom_lead_planner,
custom_assistant_1-5, custom_support_planner). Employee User Permissions with
apply_to_all_doctypes=1 cause Frappe to filter Projects to only those where the
user's Employee appears in one of those fields. Sales staff who aren't assigned
to a wedding see zero projects.

The Permission Query script approach: when the current user has Sales Manager or
Sales User role, return "" (empty conditions = no filter). Frappe applies this
instead of the default User Permission filtering.
"""
import os
import json as json_lib

SALES_ROLES = ["Sales Manager", "Sales User"]

PERMISSION_QUERY_SCRIPT = """\
sales_roles = {"Sales Manager", "Sales User"}
user_roles = set(frappe.get_roles(frappe.session.user))
if user_roles & sales_roles:
    conditions = ""
"""

DOCTYPES = ["Project", "Sales Order"]


def run(client):
    site_name = os.environ.get("SITE_NAME", "")
    headers = dict(client._get_headers())
    if site_name:
        headers["Host"] = site_name
        print(f"v027: Using site name '{site_name}' for Frappe routing")
    else:
        print("v027: WARNING — SITE_NAME not set, Host header not overridden")

    for doctype in DOCTYPES:
        script_name = f"sales-bypass-user-permissions-{doctype.lower().replace(' ', '-')}"

        # Check if script already exists
        r = client.session.get(
            f"{client.url}/api/resource/Server%20Script/{script_name}",
            headers=headers,
            timeout=30,
        )
        if r.status_code == 200:
            print(f"  {doctype}: Permission Query script already exists, skipping")
            continue

        # Create Permission Query server script
        r = client.session.post(
            f"{client.url}/api/resource/Server%20Script",
            headers=headers,
            json={
                "name": script_name,
                "script_type": "Permission Query",
                "reference_doctype": doctype,
                "script": PERMISSION_QUERY_SCRIPT,
                "enabled": 1,
            },
            timeout=30,
        )
        if r.status_code in (200, 201):
            print(f"  Created Permission Query script for {doctype}")
        else:
            raise RuntimeError(
                f"Failed to create Permission Query for {doctype}: "
                f"{r.status_code} - {r.text[:300]}"
            )

    print("v027: Done.")
