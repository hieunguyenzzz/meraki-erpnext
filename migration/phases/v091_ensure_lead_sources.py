"""
v091: Ensure the Lead Source records used by the public inquiry / website
contact form exist.

`_map_referral` in webhook_v2/routers/inquiry.py can emit any of these sources.
A missing Lead Source causes ERPNext to reject Lead creation with a 417
("Could not find Source: ..."), which breaks the contact-form -> Lead flow.
Idempotent: only creates sources that are missing.
"""

REQUIRED_SOURCES = ["Facebook", "Instagram", "Referral", "Website", "Other"]


def run(client):
    existing = {s["name"] for s in client.get_list("Lead Source", fields=["name"])}
    created = 0
    for source in REQUIRED_SOURCES:
        if source in existing:
            continue
        client.create("Lead Source", {"source_name": source})
        print(f"  Created Lead Source: {source}")
        created += 1
    print(f"  v091 lead source seed complete ({created} created).")
