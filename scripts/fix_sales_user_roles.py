#!/usr/bin/env python3
"""
Fix Sales User roles to include email communication access.

Sales Users need these additional roles to view email communications:
- Inbox User: Read access to Communication doctype
- Super Email User: Bypass email-only filter on Communications

Run this script on both local and production:
  docker compose exec backend bench --site erp.merakiwp.com execute scripts.fix_sales_user_roles.run

Or via console:
  docker compose exec backend bench --site erp.merakiwp.com console
  >>> exec(open('/home/frappe/frappe-bench/apps/scripts/fix_sales_user_roles.py').read())
"""
import frappe


def run():
    """Main entry point for bench execute."""
    fix_sales_user_roles()


def fix_sales_user_roles():
    """Ensure all Sales Users have proper email communication roles."""

    # 1. Ensure Super Email User role exists
    if not frappe.db.exists("Role", "Super Email User"):
        role = frappe.get_doc({
            "doctype": "Role",
            "role_name": "Super Email User",
            "desk_access": 1
        })
        role.insert()
        print("Created 'Super Email User' role")

    # 2. Find all users with Sales User role
    sales_users = frappe.get_all(
        "Has Role",
        filters={"role": "Sales User", "parenttype": "User"},
        fields=["parent"],
        distinct=True
    )

    print(f"Found {len(sales_users)} users with Sales User role")

    # 3. Required additional roles for email access
    required_roles = ["Inbox User", "Super Email User"]

    updated_count = 0
    for row in sales_users:
        user_id = row.parent
        user = frappe.get_doc("User", user_id)
        existing_roles = {r.role for r in user.roles}

        roles_to_add = [r for r in required_roles if r not in existing_roles]

        if roles_to_add:
            for role in roles_to_add:
                user.append("roles", {"role": role})
            user.save()
            updated_count += 1
            print(f"  Updated {user_id}: added {roles_to_add}")

    frappe.db.commit()
    print(f"\nDone. Updated {updated_count} users.")


if __name__ == "__main__":
    # For direct execution in bench console
    fix_sales_user_roles()
