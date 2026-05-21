"""Auto-share Projects with assigned planners/assistants.

Two parts:

1. Server Script (DocType Event "After Save" on Project)
   Reads custom_lead_planner / custom_support_planner / custom_assistant_1..5,
   resolves each Employee to a user_id, and calls frappe.share.add so the user
   gets read+write access to the project. Runs automatically on every save.

2. Backfill
   Iterates every existing Project, computes the same set of users, and creates
   DocShare rows directly. Idempotent — DocShares are uniquely keyed on
   (share_doctype, share_name, user), so re-running just no-ops.

Background: ERPNext's standard "Projects User" role only grants access to
projects the user owns or is shared on. Custom planner fields don't trigger
DocShare creation, so users assigned via those fields got 403 on the detail
page (page was hanging on skeleton — see frontend fix shipped alongside).
"""


SCRIPT_NAME = "meraki-share-project-with-planners"

PLANNER_FIELDS = [
    "custom_lead_planner",
    "custom_support_planner",
    "custom_assistant_1",
    "custom_assistant_2",
    "custom_assistant_3",
    "custom_assistant_4",
    "custom_assistant_5",
]


SCRIPT_BODY = '''# Auto-share Project with assigned planners/assistants on save.
# Notes on the sandbox:
#  - RestrictedPython doesn't pass `doc` into comprehension scopes (use loops)
#  - `frappe.share` is not exposed (insert DocShare doc directly)
emp_ids = []
for field in ("custom_lead_planner", "custom_support_planner",
              "custom_assistant_1", "custom_assistant_2", "custom_assistant_3",
              "custom_assistant_4", "custom_assistant_5"):
    val = doc.get(field)
    if val and val not in emp_ids:
        emp_ids.append(val)

for emp_id in emp_ids:
    user_id = frappe.db.get_value("Employee", emp_id, "user_id")
    if not user_id:
        continue
    if frappe.db.exists("DocShare", {
        "share_doctype": "Project",
        "share_name": doc.name,
        "user": user_id,
    }):
        continue
    share = frappe.get_doc({
        "doctype": "DocShare",
        "share_doctype": "Project",
        "share_name": doc.name,
        "user": user_id,
        "read": 1,
        "write": 1,
        "share": 0,
        "notify_by_email": 0,
    })
    share.flags.ignore_permissions = True
    share.insert(ignore_permissions=True)
'''


def _ensure_server_script(client) -> None:
    existing = client.get("Server Script", SCRIPT_NAME)
    if existing:
        current = (existing.get("script") or "").strip()
        if current == SCRIPT_BODY.strip() and not existing.get("disabled"):
            print("  Server Script up to date, skipping")
            return
        result = client.update("Server Script", SCRIPT_NAME, {
            "script": SCRIPT_BODY,
            "disabled": 0,
        })
        print("  Updated planner-share Server Script" if result else "  ERROR: update failed")
        return

    result = client.create("Server Script", {
        "name": SCRIPT_NAME,
        "script_type": "DocType Event",
        "reference_doctype": "Project",
        "doctype_event": "After Save",
        "disabled": 0,
        "script": SCRIPT_BODY,
    })
    print("  Created planner-share Server Script" if result else "  ERROR: create failed")


def _backfill_shares(client) -> None:
    projects = client.get_list(
        "Project",
        fields=["name"] + PLANNER_FIELDS,
        limit=0,
    )
    if not projects:
        print("  No projects to backfill")
        return

    referenced_emps = set()
    for p in projects:
        for f in PLANNER_FIELDS:
            v = p.get(f)
            if v:
                referenced_emps.add(v)

    user_by_emp: dict[str, str] = {}
    if referenced_emps:
        emps = client.get_list(
            "Employee",
            filters=[["name", "in", list(referenced_emps)]],
            fields=["name", "user_id"],
            limit=0,
        )
        user_by_emp = {e["name"]: e["user_id"] for e in emps if e.get("user_id")}

    created = 0
    skipped = 0
    failed = 0
    for p in projects:
        users = {user_by_emp[p[f]] for f in PLANNER_FIELDS if p.get(f) and p[f] in user_by_emp}
        if not users:
            continue
        for user in users:
            if client.exists("DocShare", {
                "share_doctype": "Project",
                "share_name": p["name"],
                "user": user,
            }):
                skipped += 1
                continue
            result = client.create("DocShare", {
                "share_doctype": "Project",
                "share_name": p["name"],
                "user": user,
                "read": 1,
                "write": 1,
                "share": 0,
                "notify_by_email": 0,
            })
            if result:
                created += 1
            else:
                failed += 1

    print(f"  Backfill: {created} DocShares created, {skipped} already existed, {failed} failed")


def run(client):
    _ensure_server_script(client)
    _backfill_shares(client)
