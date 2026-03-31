"""
Create ERPNext Server Scripts required by the Meraki Manager frontend.
Run via: docker compose exec backend python /scripts/setup_server_scripts.py
Or via bench: bench execute meraki_manager.setup.setup_server_scripts
"""
import frappe


# Shared snippet: resolve HR-EMP-XXXXX in notification messages to employee names.
# No imports allowed in Frappe server scripts, so uses plain string ops.
_RESOLVE_EMP_IDS = (
    '# Resolve HR-EMP-XXXXX to employee names in messages\n'
    'emp_cache = {}\n'
    'for n in notifications:\n'
    '    msg = n.get("message") or ""\n'
    '    pos = 0\n'
    '    while True:\n'
    '        idx = msg.find("HR-EMP-", pos)\n'
    '        if idx == -1:\n'
    '            break\n'
    '        end = idx + 7\n'
    '        while end < len(msg) and msg[end].isdigit():\n'
    '            end += 1\n'
    '        emp_id = msg[idx:end]\n'
    '        if emp_id not in emp_cache:\n'
    '            emp_cache[emp_id] = frappe.db.get_value("Employee", emp_id, "employee_name") or emp_id\n'
    '        msg = msg[:idx] + emp_cache[emp_id] + msg[end:]\n'
    '        pos = idx + len(emp_cache[emp_id])\n'
    '    n["message"] = msg\n'
)

SERVER_SCRIPTS = [
    {
        "name": "update_leave_status",
        "script_type": "API",
        "api_method": "update_leave_status",
        "allow_guest": 0,
        "script": (
            'name = frappe.form_dict.name\n'
            'status = frappe.form_dict.status\n'
            'if status not in {"Approved", "Rejected"}:\n'
            '    frappe.throw("Invalid status")\n'
            'frappe.db.set_value("Leave Application", name, "status", status)\n'
            'frappe.db.commit()\n'
            'frappe.response["message"] = {"success": True, "name": name, "status": status}\n'
        ),
    },
    {
        "name": "get_my_notifications",
        "script_type": "API",
        "api_method": "get_my_notifications",
        "allow_guest": 0,
        "script": (
            'user = frappe.session.user\n'
            '\n'
            'notifications = frappe.db.get_all(\n'
            '    "PWA Notification",\n'
            '    filters={"to_user": user, "read": 0},\n'
            '    fields=["name", "message", "read", "reference_document_type",\n'
            '            "reference_document_name", "creation", "from_user"],\n'
            '    order_by="creation desc",\n'
            '    limit=20\n'
            ')\n'
            '\n'
            + _RESOLVE_EMP_IDS +
            '\n'
            'total = frappe.db.count("PWA Notification", {"to_user": user, "read": 0})\n'
            '\n'
            'frappe.response["message"] = {"notifications": notifications, "total": total}\n'
        ),
    },
    {
        "name": "get_all_notifications",
        "script_type": "API",
        "api_method": "get_all_notifications",
        "allow_guest": 0,
        "script": (
            'page = int(frappe.form_dict.get("page", 1))\n'
            'page_size = int(frappe.form_dict.get("page_size", 50))\n'
            'offset = (page - 1) * page_size\n'
            '\n'
            'notifications = frappe.get_all(\n'
            '    "PWA Notification",\n'
            '    filters={"to_user": frappe.session.user},\n'
            '    fields=["name", "from_user", "message", "read", "reference_document_type", "reference_document_name", "creation"],\n'
            '    order_by="creation desc",\n'
            '    limit_start=offset,\n'
            '    limit_page_length=page_size,\n'
            ')\n'
            '\n'
            + _RESOLVE_EMP_IDS +
            '\n'
            'total = frappe.db.count("PWA Notification", {"to_user": frappe.session.user})\n'
            'unread = frappe.db.count("PWA Notification", {"to_user": frappe.session.user, "read": 0})\n'
            '\n'
            'frappe.response["message"] = {\n'
            '    "notifications": notifications,\n'
            '    "total": total,\n'
            '    "unread": unread,\n'
            '    "page": page,\n'
            '    "page_size": page_size,\n'
            '}\n'
        ),
    },
    {
        "name": "handle_notification_action",
        "script_type": "API",
        "api_method": "handle_notification_action",
        "allow_guest": 0,
        "script": (
            'notif_name = frappe.form_dict.get("notif_name", "")\n'
            'action = frappe.form_dict.get("action", "")  # "read" | "approve" | "reject" | "read_all"\n'
            '\n'
            'if action == "read_all":\n'
            '    frappe.db.sql(\n'
            '        "UPDATE `tabPWA Notification` SET `read`=1 WHERE to_user=%s AND `read`=0",\n'
            '        frappe.session.user\n'
            '    )\n'
            '    frappe.db.commit()\n'
            '    frappe.response["message"] = {"success": True}\n'
            'else:\n'
            '    notif = frappe.db.get_value(\n'
            '        "PWA Notification",\n'
            '        {"name": notif_name, "to_user": frappe.session.user},\n'
            '        ["name", "reference_document_type", "reference_document_name"],\n'
            '        as_dict=True\n'
            '    )\n'
            '    if not notif:\n'
            '        frappe.throw("Notification not found", frappe.DoesNotExistError)\n'
            '    if action in ("approve", "reject"):\n'
            '        dt = notif.reference_document_type\n'
            '        dn = notif.reference_document_name\n'
            '        if dt == "Leave Application":\n'
            '            status = "Approved" if action == "approve" else "Rejected"\n'
            '            frappe.db.set_value("Leave Application", dn, "status", status)\n'
            '        elif dt == "Purchase Invoice":\n'
            '            if action == "approve":\n'
            '                doc = frappe.get_doc("Purchase Invoice", dn)\n'
            '                doc.submit()\n'
            '            else:\n'
            '                frappe.db.set_value("Purchase Invoice", dn, "custom_rejected", 1)\n'
            '        else:\n'
            '            frappe.throw("Invalid document type for this action")\n'
            '    frappe.db.set_value("PWA Notification", notif_name, "read", 1)\n'
            '    frappe.db.commit()\n'
            '    frappe.response["message"] = {"success": True}\n'
        ),
    },
]


def create_server_scripts():
    for spec in SERVER_SCRIPTS:
        name = spec["name"]
        if frappe.db.exists("Server Script", name):
            doc = frappe.get_doc("Server Script", name)
            doc.script = spec["script"]
            doc.save()
            print(f"Updated Server Script: {name}")
        else:
            doc = frappe.get_doc({"doctype": "Server Script", **spec})
            doc.insert()
            print(f"Created Server Script: {name}")
    frappe.db.commit()


if __name__ == "__main__":
    create_server_scripts()
