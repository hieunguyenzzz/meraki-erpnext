"""
Grant Sales Manager and Sales User roles unrestricted read access to Project and
Sales Order.

Background: Project has custom Employee link fields (custom_lead_planner,
custom_assistant_1-5, custom_support_planner). Employee User Permissions with
apply_to_all_doctypes=1 cause Frappe to filter Projects to only those where the
user's Employee appears in one of those fields. Sales staff not assigned to a
wedding see zero projects.

Additionally, when Custom DocPerm exists for a doctype, it REPLACES all base
permissions. The existing Custom DocPerm for Sales Order only covers "Projects
User" and "Sales" - so standard "Sales User" / "Sales Manager" roles lost their
default read access.

This phase:
1. Adds Custom DocPerm read=1 for Sales User and Sales Manager on Project and SO.
2. Creates Permission Query server scripts that return empty conditions (no filter)
   when the current user has Sales Manager or Sales User role, bypassing the
   Employee User Permission filtering.

Note: frappe.get_roles() is NOT in the safe_exec sandbox. We query tabHas Role
directly via frappe.db.sql (available as read_sql in safe_exec).
"""
import os
import json as json_lib

# frappe.get_roles() is not in safe_exec globals.
# frappe.db.sql is available (SELECT only).
PERMISSION_QUERY_SCRIPT = """\
sales_roles = ("Sales Manager", "Sales User")
user = frappe.session.user
has_sales_role = frappe.db.sql(
    "SELECT 1 FROM `tabHas Role` WHERE parent=%s AND role IN %s LIMIT 1",
    (user, sales_roles),
)
if has_sales_role:
    conditions = ""
"""

ROLES = ["Sales Manager", "Sales User"]
DOCTYPES = ["Project", "Sales Order"]


def _ensure_custom_docperm(client, headers, doctype, role):
    r = client.session.get(
        f"{client.url}/api/resource/Custom%20DocPerm",
        headers=headers,
        params={
            "filters": json_lib.dumps({"parent": doctype, "role": role, "permlevel": 0}),
            "limit_page_length": 1,
        },
        timeout=30,
    )
    if r.status_code == 200 and r.json().get("data"):
        print(f"    Custom DocPerm {role}/{doctype}: already exists, skipping")
        return

    r = client.session.post(
        f"{client.url}/api/resource/Custom%20DocPerm",
        headers=headers,
        json={
            "parent": doctype,
            "parenttype": "DocType",
            "parentfield": "permissions",
            "role": role,
            "permlevel": 0,
            "read": 1,
            "write": 0,
            "create": 0,
            "submit": 0,
            "cancel": 0,
            "delete": 0,
        },
        timeout=30,
    )
    if r.status_code in (200, 201):
        print(f"    Created Custom DocPerm read=1 for {role} on {doctype}")
    else:
        raise RuntimeError(
            f"Failed to create DocPerm for {role}/{doctype}: "
            f"{r.status_code} - {r.text[:300]}"
        )


def _ensure_permission_query_script(client, headers, doctype):
    script_name = f"sales-bypass-user-permissions-{doctype.lower().replace(' ', '-')}"

    r = client.session.get(
        f"{client.url}/api/resource/Server%20Script/{script_name}",
        headers=headers,
        timeout=30,
    )
    if r.status_code == 200:
        # Update existing script (fixes any earlier broken version)
        r2 = client.session.put(
            f"{client.url}/api/resource/Server%20Script/{script_name}",
            headers=headers,
            json={"script": PERMISSION_QUERY_SCRIPT, "disabled": 0},
            timeout=30,
        )
        if r2.status_code == 200:
            print(f"    Updated Permission Query script for {doctype}")
        else:
            raise RuntimeError(
                f"Failed to update script for {doctype}: "
                f"{r2.status_code} - {r2.text[:300]}"
            )
        return

    r = client.session.post(
        f"{client.url}/api/resource/Server%20Script",
        headers=headers,
        json={
            "name": script_name,
            "script_type": "Permission Query",
            "reference_doctype": doctype,
            "script": PERMISSION_QUERY_SCRIPT,
            "disabled": 0,
        },
        timeout=30,
    )
    if r.status_code in (200, 201):
        print(f"    Created Permission Query script for {doctype}")
    else:
        raise RuntimeError(
            f"Failed to create Permission Query for {doctype}: "
            f"{r.status_code} - {r.text[:300]}"
        )


def run(client):
    site_name = os.environ.get("SITE_NAME", "")
    headers = dict(client._get_headers())
    if site_name:
        headers["Host"] = site_name
        print(f"v027: Using site name '{site_name}' for Frappe routing")
    else:
        print("v027: WARNING — SITE_NAME not set, Host header not overridden")

    print("v027: Granting Sales Manager/User read access on Project and Sales Order...")
    for doctype in DOCTYPES:
        print(f"  {doctype}:")
        for role in ROLES:
            _ensure_custom_docperm(client, headers, doctype, role)
        _ensure_permission_query_script(client, headers, doctype)

    print("v027: Done.")
