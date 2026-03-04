"""
Fix for v025 which silently failed on production due to Frappe multi-site Host header mismatch.
The data-migrator calls http://meraki-backend:8000 but Frappe needs Host: erp.merakiwp.com.
This phase sets the correct Host header via SITE_NAME env var.
"""
import os
import json as json_lib

DOCTYPES = ["Sales Order", "Sales Invoice", "Customer", "Supplier"]


def run(client):
    # In Frappe multi-site, Host header determines the site.
    # The internal URL (meraki-backend:8000) doesn't match any site name,
    # so we override Host with the actual site name from SITE_NAME env var.
    site_name = os.environ.get("SITE_NAME", "")
    headers = dict(client._get_headers())
    if site_name:
        headers["Host"] = site_name
        print(f"v026: Using site name '{site_name}' for Frappe routing")
    else:
        print("v026: WARNING — SITE_NAME not set, Host header not overridden")

    print("v026: Granting Projects User read access for wedding kanban...")
    for doctype in DOCTYPES:
        # Check existence with correct Host header
        r = client.session.get(
            f"{client.url}/api/resource/Custom%20DocPerm",
            headers=headers,
            params={
                "filters": json_lib.dumps({"parent": doctype, "role": "Projects User", "permlevel": 0}),
                "limit_page_length": 1,
            },
            timeout=30,
        )
        if r.status_code == 200 and r.json().get("data"):
            print(f"  {doctype}: already exists, skipping")
            continue

        # Create with correct Host header
        r = client.session.post(
            f"{client.url}/api/resource/Custom%20DocPerm",
            headers=headers,
            json={
                "parent": doctype,
                "parenttype": "DocType",
                "parentfield": "permissions",
                "role": "Projects User",
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
            print(f"  Granted Projects User read on {doctype}")
        else:
            raise RuntimeError(f"Failed to grant read on {doctype}: {r.status_code} - {r.text[:300]}")

    print("v026: Done.")
