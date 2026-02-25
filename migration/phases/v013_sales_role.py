ROLE_NAME = "Sales"
SALES_USER_EMAILS = ["xuanhoang@mobelaris.info"]

# Roles to assign to sales users in addition to Sales (all desk-access roles)
EXTRA_ROLES = [
    "Finance Manager",
    "Accounts User",
    "Accounts Manager",
    "HR Manager",
    "HR User",
    "Leave Approver",
    "Project Manager",
    "Projects User",
    "Purchase Manager",
    "Purchase User",
    "Sales Manager",
    "Sales User",
    "Stock Manager",
    "Stock User",
]

# Wedding management only — NO financial doctypes (those belong to Finance role)
DOCTYPES = [
    ("Supplier", {"read": 1, "write": 1, "create": 1, "submit": 0}),      # venue listing + creation
    ("Customer", {"read": 1, "write": 1, "create": 1, "submit": 0}),      # couple creation
    ("Contact", {"read": 1, "write": 1, "create": 1, "submit": 0}),       # extra emails
    ("Sales Order", {"read": 1, "write": 1, "create": 1, "submit": 1}),   # booking
    ("Item", {"read": 1, "write": 1, "create": 1, "submit": 0}),          # add-ons
    ("Project", {"read": 1, "write": 1, "create": 1, "submit": 0}),       # wedding project
]


def run(client):
    print(f"v013: Setting up '{ROLE_NAME}' role...")

    # 1. Create Sales role if not exists
    if not client.get("Role", ROLE_NAME):
        client.create("Role", {"role_name": ROLE_NAME, "desk_access": 1})
        print(f"  Created role: {ROLE_NAME}")
    else:
        print(f"  Role '{ROLE_NAME}' already exists")

    # 2. Grant DocType permissions via Custom DocPerm
    for doctype, perms in DOCTYPES:
        existing = client.exists("Custom DocPerm", {"parent": doctype, "role": ROLE_NAME, "permlevel": 0})
        if not existing:
            client.create("Custom DocPerm", {
                "parent": doctype,
                "parenttype": "DocType",
                "parentfield": "permissions",
                "role": ROLE_NAME,
                "permlevel": 0,
                **perms,
            })
            print(f"  Granted permissions on {doctype}")
        else:
            print(f"  Permissions on {doctype} already exist, skipping")

    # 3. Assign roles to Sales users
    # Collect all roles that exist in ERPNext
    all_roles = [ROLE_NAME]
    for role_name in EXTRA_ROLES:
        if client.get("Role", role_name):
            all_roles.append(role_name)

    for email in SALES_USER_EMAILS:
        user = client.get("User", email)
        if not user:
            print(f"  User {email} not found — assign roles manually after user is created")
            continue

        existing_roles = {r["role"] for r in user.get("roles", [])}
        new_roles = list(user.get("roles", []))  # keep existing entries
        added = []
        for role in all_roles:
            if role not in existing_roles:
                new_roles.append({"role": role})
                added.append(role)

        if added:
            client.update("User", email, {"roles": new_roles})
            print(f"  Assigned roles to {email}: {', '.join(added)}")
        else:
            print(f"  {email} already has all roles")

    print("v013: Done.")
