"""Wedding Expense Manager role (MWP-78).

Holders can view and add expenses on ALL weddings (enforced in the React app).
No desk access, no DocPerms, no approve rights.

This role is an ADD-ON for planners: it only works together with a planner role
(Projects User), because the expense routes and the Weddings module require one.
First holder: Ly (lilydinh@merakiwp.com), who has Projects User.

Idempotent, and fails loudly: the client's get/create/update swallow errors and
return None, and the runner records a phase as applied once run() returns, so
every step here is verified and raises RuntimeError on failure.
"""

ROLE = "Wedding Expense Manager"
FIRST_HOLDER = "lilydinh@merakiwp.com"


def _user_roles(client, user):
    """Return the user's role names, or None if the user genuinely does not exist.

    Uses a direct request (client.get cannot tell 404 from a failed request).
    """
    response = client.session.get(
        f"{client.url}/api/resource/User/{user}",
        headers=client._get_headers(),
        timeout=30,
    )
    if response.status_code == 404:
        return None
    if response.status_code != 200:
        raise RuntimeError(f"Could not read User {user}: {response.status_code} {response.text[:200]}")
    return [r["role"] for r in response.json()["data"].get("roles", [])]


def run(client):
    if client.exists("Role", {"name": ROLE}):
        print(f"  Role '{ROLE}' already exists, skipping")
    else:
        if client.create("Role", {"role_name": ROLE, "desk_access": 0}) is None:
            raise RuntimeError(f"Failed to create Role '{ROLE}'")
        if not client.exists("Role", {"name": ROLE}):
            raise RuntimeError(f"Role '{ROLE}' not found after creation")
        print(f"  Created Role: {ROLE}")

    roles = _user_roles(client, FIRST_HOLDER)
    if roles is None:
        print(f"  User {FIRST_HOLDER} does not exist, skipping role grant")
        return
    if ROLE in roles:
        print(f"  {FIRST_HOLDER} already has '{ROLE}', skipping")
        return

    if client.update("User", FIRST_HOLDER, {"roles": [{"role": r} for r in roles + [ROLE]]}) is None:
        raise RuntimeError(f"Failed to grant '{ROLE}' to {FIRST_HOLDER}")
    after = _user_roles(client, FIRST_HOLDER) or []
    missing = (set(roles) | {ROLE}) - set(after)
    if missing:
        raise RuntimeError(f"Roles missing on {FIRST_HOLDER} after update: {sorted(missing)}")
    print(f"  Granted '{ROLE}' to {FIRST_HOLDER}")
