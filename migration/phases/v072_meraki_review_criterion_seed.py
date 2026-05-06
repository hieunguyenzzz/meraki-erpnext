"""
v072: Seed default Meraki Review Criteria.

Only inserts if no criteria exist yet (safe to skip on re-run).
"""

DEFAULT_CRITERIA = [
    {"criterion_name": "Punctuality", "sort_order": 10, "active": 1},
    {"criterion_name": "Teamwork", "sort_order": 20, "active": 1},
    {"criterion_name": "Communication", "sort_order": 30, "active": 1},
    {"criterion_name": "Quality of Work", "sort_order": 40, "active": 1},
]


def run(client):
    existing = client.get_list("Meraki Review Criterion", fields=["name"])
    if existing:
        print(f"  Criteria already exist ({len(existing)} found), skipping seed.")
        return

    for criterion in DEFAULT_CRITERIA:
        client.create("Meraki Review Criterion", criterion)
        print(f"  Created criterion: {criterion['criterion_name']}")

    print("  v072 meraki review criterion seed complete.")
