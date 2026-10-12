"""Wedding Expense Manager role (MWP-78).

Holders can view and add expenses on ALL weddings (enforced in the React app;
the backend expense routes only need a planner role). No desk access, no DocPerms,
no approve rights. First holder: Ly (lilydinh@merakiwp.com).
Idempotent: creates the role and grants it only when missing.
"""

ROLE = "Wedding Expense Manager"
FIRST_HOLDER = "lilydinh@merakiwp.com"


def run(client):
    if client.exists("Role", {"name": ROLE}):
        print(f"  Role '{ROLE}' already exists, skipping")
    else:
        client.create("Role", {"role_name": ROLE, "desk_access": 0})
        print(f"  Created Role: {ROLE}")

    user = client.get("User", FIRST_HOLDER)
    if not user:
        print(f"  User {FIRST_HOLDER} not found, skipping role grant")
        return
    roles = [r["role"] for r in user.get("roles", [])]
    if ROLE in roles:
        print(f"  {FIRST_HOLDER} already has '{ROLE}', skipping")
        return
    client.update("User", FIRST_HOLDER, {"roles": [{"role": r} for r in roles + [ROLE]]})
    print(f"  Granted '{ROLE}' to {FIRST_HOLDER}")
