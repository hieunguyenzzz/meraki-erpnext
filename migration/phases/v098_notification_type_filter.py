"""Notifications page type filter (MWP-76).

Patches two live Server Scripts in place (anchored replacements; each has its own
marker, so a partially applied earlier run cannot double-patch).

1. `get_all_notifications` (kept in sync by v044/v060):
- optional `doc_type` param filters `reference_document_type`
- `total` / `unread` follow the active filter
- new `type_counts` = [{type, total, unread}] across ALL the user's notifications,
  unfiltered, so the page can always show every type chip

The live script is patched in place (anchored string replacements) so the rest of
it stays untouched.

2. `handle_notification_action` (last rewritten by v085): its `read_all` branch accepts an
optional `doc_type` and then only marks that reference type read, for the session user.

No `import` in either script: the Server Script sandbox forbids it.
"""

MARKER = "# MWP-76 type filter"

FILTERS_OLD = (
    'notifications = frappe.get_all(\n'
    '    "PWA Notification",\n'
    '    filters={"to_user": frappe.session.user},\n'
)
FILTERS_NEW = (
    f'{MARKER}\n'
    'doc_type = frappe.form_dict.get("doc_type") or ""\n'
    'filters = {"to_user": frappe.session.user}\n'
    'if doc_type:\n'
    '    filters["reference_document_type"] = doc_type\n'
    '\n'
    'notifications = frappe.get_all(\n'
    '    "PWA Notification",\n'
    '    filters=filters,\n'
)

COUNTS_OLD = (
    'total = frappe.db.count("PWA Notification", {"to_user": frappe.session.user})\n'
    'unread = frappe.db.count("PWA Notification", {"to_user": frappe.session.user, "read": 0})\n'
)
COUNTS_NEW = (
    'total = frappe.db.count("PWA Notification", filters)\n'
    'unread = frappe.db.count("PWA Notification", dict(filters, read=0))\n'
    '\n'
    '# Per-type counts, always unfiltered (the chips)\n'
    'own = {"to_user": frappe.session.user}\n'
    'total_rows = frappe.get_all(\n'
    '    "PWA Notification", filters=own,\n'
    '    fields=["reference_document_type as type", "count(name) as c"],\n'
    '    group_by="reference_document_type",\n'
    ')\n'
    'unread_rows = frappe.get_all(\n'
    '    "PWA Notification", filters=dict(own, read=0),\n'
    '    fields=["reference_document_type as type", "count(name) as c"],\n'
    '    group_by="reference_document_type",\n'
    ')\n'
    'unread_by_type = {r.get("type"): r.get("c") for r in unread_rows}\n'
    'type_counts = [\n'
    '    {"type": r.get("type"), "total": r.get("c"), "unread": unread_by_type.get(r.get("type"), 0)}\n'
    '    for r in total_rows if r.get("type")\n'
    ']\n'
)

RESPONSE_OLD = '    "unread": unread,\n'
RESPONSE_NEW = '    "unread": unread,\n    "type_counts": type_counts,\n'


READ_ALL_OLD = (
    '    frappe.db.sql(\n'
    '        "UPDATE `tabPWA Notification` SET `read`=1 WHERE to_user=%s AND `read`=0",\n'
    '        frappe.session.user\n'
    '    )\n'
)
# The sandbox rejects write SQL ("Query must be of SELECT or read-only WITH type"), so the
# original frappe.db.sql UPDATE never worked from this script. set_value with a filter dict
# updates every matching row in one query and is allowed.
READ_ALL_NEW = (
    f'    {MARKER}\n'
    '    read_filters = {"to_user": frappe.session.user, "read": 0}\n'
    '    doc_type = frappe.form_dict.get("doc_type") or ""\n'
    '    if doc_type:\n'
    '        read_filters["reference_document_type"] = doc_type\n'
    '    frappe.db.set_value("PWA Notification", read_filters, "read", 1)\n'
)

# script name -> [(anchor, replacement), ...]
PATCHES = {
    "get_all_notifications": [
        (FILTERS_OLD, FILTERS_NEW),
        (COUNTS_OLD, COUNTS_NEW),
        (RESPONSE_OLD, RESPONSE_NEW),
    ],
    "handle_notification_action": [(READ_ALL_OLD, READ_ALL_NEW)],
}


def patch(name: str, script: str) -> str:
    for old, new in PATCHES[name]:
        if script.count(old) != 1:
            raise RuntimeError(f"{name}: expected anchor not found exactly once:\n{old}")
        script = script.replace(old, new)
    return script


def run(client):
    for name in PATCHES:
        existing = client.get("Server Script", name)
        if not existing:
            print(f"  Server Script '{name}' not found, skipping")
            continue

        current = existing.get("script") or ""
        if MARKER in current:
            print(f"  {name} already has the type filter, skipping")
            continue

        client.update("Server Script", name, {"script": patch(name, current)})
        print(f"  Updated Server Script: {name}")
