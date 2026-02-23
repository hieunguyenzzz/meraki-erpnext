"""
Create ERPNext Server Scripts required by the Meraki Manager frontend.
Run via: docker compose exec backend python /scripts/setup_server_scripts.py
Or via bench: bench execute meraki_manager.setup.setup_server_scripts
"""
import frappe


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
            'total = frappe.db.count("PWA Notification", {"to_user": user, "read": 0})\n'
            '\n'
            'frappe.response["message"] = {"notifications": notifications, "total": total}\n'
        ),
    },
    {
        "name": "handle_notification_action",
        "script_type": "API",
        "api_method": "handle_notification_action",
        "allow_guest": 0,
        "script": (
            'notif_name = frappe.form_dict.notif_name\n'
            'action = frappe.form_dict.action  # "read" | "approve" | "reject"\n'
            '\n'
            'notif = frappe.db.get_value(\n'
            '    "PWA Notification",\n'
            '    {"name": notif_name, "to_user": frappe.session.user},\n'
            '    ["name", "reference_document_type", "reference_document_name"],\n'
            '    as_dict=True\n'
            ')\n'
            'if not notif:\n'
            '    frappe.throw("Notification not found", frappe.DoesNotExistError)\n'
            '\n'
            'if action in ("approve", "reject"):\n'
            '    if notif.reference_document_type != "Leave Application":\n'
            '        frappe.throw("Invalid document type for this action")\n'
            '    status = "Approved" if action == "approve" else "Rejected"\n'
            '    frappe.db.set_value("Leave Application", notif.reference_document_name, "status", status)\n'
            '\n'
            'frappe.db.set_value("PWA Notification", notif_name, "read", 1)\n'
            'frappe.db.commit()\n'
            '\n'
            'frappe.response["message"] = {"success": True}\n'
        ),
    },
]


def create_server_scripts():
    for spec in SERVER_SCRIPTS:
        name = spec["name"]
        if frappe.db.exists("Server Script", name):
            print(f"Server Script '{name}' already exists, skipping")
            continue
        doc = frappe.get_doc({"doctype": "Server Script", **spec})
        doc.insert()
        print(f"Created Server Script: {name}")
    frappe.db.commit()


if __name__ == "__main__":
    create_server_scripts()
