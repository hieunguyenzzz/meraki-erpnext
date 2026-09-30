"""Stop staff from reading everyone's Salary Slip.

Background: Custom DocPerm rows on Salary Slip grant the `Employee` and
`Employee Self Service` roles read=1 with if_owner=0. Since Salary Slip has
no `employee_user` owner-matching field wired to those roles, this lets any
staff member with either role list/read every employee's salary slip via the
REST API (MWP-62).

Fix: for the Custom DocPerm rows on Salary Slip belonging to those two roles,
set read=0 and disable print/email/export (which are meaningless without
read). HR Manager/HR User perms are untouched. Custom DocPerm.on_update()
calls frappe.clear_cache(doctype="Salary Slip") automatically, so no manual
cache clear is needed.
"""

TARGET_ROLES = ("Employee", "Employee Self Service")


def run(client):
    rows = client.get_list(
        "Custom DocPerm",
        filters={"parent": "Salary Slip", "role": ["in", list(TARGET_ROLES)]},
        fields=["name", "role", "read", "print", "email", "export"],
    )

    if not rows:
        print("  No Employee/Employee Self Service Custom DocPerm rows found on Salary Slip, nothing to do")
        return

    changed = []
    skipped = []
    for row in rows:
        wants = {"read": 0, "print": 0, "email": 0, "export": 0}
        diff = {k: v for k, v in wants.items() if row.get(k) != v}
        if not diff:
            skipped.append(row["role"])
            continue
        client.update("Custom DocPerm", row["name"], diff)
        changed.append(row["role"])
        print(f"  Set {diff} on Salary Slip Custom DocPerm for role {row['role']!r}")

    for role in skipped:
        print(f"  Salary Slip Custom DocPerm for role {role!r} already locked down, skipping")

    print(f"  Summary: {len(changed)} row(s) updated, {len(skipped)} already correct")
