"""Update handle_notification_action Server Script to support Attendance Request approve/reject."""


SCRIPT = (
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
    '        elif dt == "Attendance Request":\n'
    '            if action == "approve":\n'
    '                doc = frappe.get_doc("Attendance Request", dn)\n'
    '                doc.submit()\n'
    '            else:\n'
    '                frappe.db.set_value("Attendance Request", dn, "workflow_state", "Rejected")\n'
    '                doc = frappe.get_doc("Attendance Request", dn)\n'
    '                doc.submit()\n'
    '        else:\n'
    '            frappe.throw("Invalid document type for this action")\n'
    '    frappe.db.set_value("PWA Notification", notif_name, "read", 1)\n'
    '    frappe.db.commit()\n'
    '    frappe.response["message"] = {"success": True}\n'
)


def run(client):
    """Update handle_notification_action Server Script to support Attendance Request."""
    script_name = "handle_notification_action"
    existing = client.get("Server Script", script_name)
    if not existing:
        print(f"  Server Script '{script_name}' not found, skipping")
        return

    client.update("Server Script", script_name, {"script": SCRIPT})
    print(f"  Updated Server Script: {script_name}")
