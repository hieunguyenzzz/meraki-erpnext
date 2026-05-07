"""Extend meraki-leave-db-update Server Script to allow updating allocation amounts.

ERPNext's `frappe.client.set_value` on a submitted Leave Allocation triggers
`doc.save()` → full validation including the buggy HRMS `before_submit` chain
that crashes with `int - NoneType`. Bypass by using `frappe.db.set_value`
through this allowlisted Server Script.
"""


SCRIPT_NAME = "meraki-leave-db-update"


FULL_SCRIPT = '''doctype = frappe.form_dict.get("doctype")
name = frappe.form_dict.get("name")
fieldname = frappe.form_dict.get("fieldname")
value = frappe.form_dict.get("value")

if not all([doctype, name, fieldname]):
    frappe.throw("doctype, name, and fieldname are required")

ALLOWED = {
    "Leave Allocation": {"from_date", "new_leaves_allocated", "total_leaves_allocated", "unused_leaves"},
    "Leave Ledger Entry": {"from_date", "leaves"},
}

if doctype not in ALLOWED or fieldname not in ALLOWED[doctype]:
    frappe.throw(f"Not allowed: {doctype}.{fieldname}")

frappe.db.set_value(doctype, name, fieldname, value)
frappe.db.commit()
frappe.response["message"] = "ok"
'''


def run(client):
    script = client.get("Server Script", SCRIPT_NAME)
    if not script:
        print(f"  ERROR: Server Script '{SCRIPT_NAME}' not found")
        return

    current = (script.get("script") or "").strip()
    needs_script_update = not ("new_leaves_allocated" in current and "total_leaves_allocated" in current)
    needs_enable = bool(script.get("disabled"))

    if not needs_script_update and not needs_enable:
        print("  Server Script already enabled and allows allocation field updates, skipping")
        return

    payload = {}
    if needs_script_update:
        payload["script"] = FULL_SCRIPT
    if needs_enable:
        payload["disabled"] = 0

    result = client.update("Server Script", SCRIPT_NAME, payload)
    if result:
        msgs = []
        if needs_script_update:
            msgs.append("allowlist with allocation fields")
        if needs_enable:
            msgs.append("enabled (was disabled)")
        print(f"  Updated meraki-leave-db-update: {', '.join(msgs)}")
    else:
        print("  ERROR: Failed to update Server Script")
