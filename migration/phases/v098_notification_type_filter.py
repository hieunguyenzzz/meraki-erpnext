"""Notifications page type filter (MWP-76).

Patches the live `get_all_notifications` Server Script (kept in sync by v044/v060):
- optional `doc_type` param filters `reference_document_type`
- `total` / `unread` follow the active filter
- new `type_counts` = [{type, total, unread}] across ALL the user's notifications,
  unfiltered, so the page can always show every type chip

The live script is patched in place (anchored string replacements) so the rest of
it stays untouched. A marker comment makes reruns a no-op. No `import` here or in
the script: the Server Script sandbox forbids it.
"""

SCRIPT_NAME = "get_all_notifications"
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


def patch(script: str) -> str:
    for old in (FILTERS_OLD, COUNTS_OLD, RESPONSE_OLD):
        if script.count(old) != 1:
            raise RuntimeError(f"{SCRIPT_NAME}: expected anchor not found exactly once:\n{old}")
    return (
        script.replace(FILTERS_OLD, FILTERS_NEW)
        .replace(COUNTS_OLD, COUNTS_NEW)
        .replace(RESPONSE_OLD, RESPONSE_NEW)
    )


def run(client):
    existing = client.get("Server Script", SCRIPT_NAME)
    if not existing:
        print(f"  Server Script '{SCRIPT_NAME}' not found, skipping")
        return

    current = existing.get("script") or ""
    if MARKER in current:
        print(f"  {SCRIPT_NAME} already has the type filter, skipping")
        return

    client.update("Server Script", SCRIPT_NAME, {"script": patch(current)})
    print(f"  Updated Server Script: {SCRIPT_NAME}")
