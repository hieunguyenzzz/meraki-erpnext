"""Update notification server scripts to resolve HR-EMP-XXXXX IDs to employee names."""
import json


# The two notification scripts that need updating
SCRIPTS = {
    "get_my_notifications": (
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
        '            emp = frappe.db.get_value("Employee", emp_id, ["first_name", "last_name"], as_dict=True)\n'
        '            if emp:\n'
        '                parts = [emp.get("last_name") or "", emp.get("first_name") or ""]\n'
        '                emp_cache[emp_id] = " ".join(p for p in parts if p) or emp_id\n'
        '            else:\n'
        '                emp_cache[emp_id] = emp_id\n'
        '        msg = msg[:idx] + emp_cache[emp_id] + msg[end:]\n'
        '        pos = idx + len(emp_cache[emp_id])\n'
        '    n["message"] = msg\n'
        '\n'
        'total = frappe.db.count("PWA Notification", {"to_user": user, "read": 0})\n'
        '\n'
        'frappe.response["message"] = {"notifications": notifications, "total": total}\n'
    ),
    "get_all_notifications": (
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
        '            emp = frappe.db.get_value("Employee", emp_id, ["first_name", "last_name"], as_dict=True)\n'
        '            if emp:\n'
        '                parts = [emp.get("last_name") or "", emp.get("first_name") or ""]\n'
        '                emp_cache[emp_id] = " ".join(p for p in parts if p) or emp_id\n'
        '            else:\n'
        '                emp_cache[emp_id] = emp_id\n'
        '        msg = msg[:idx] + emp_cache[emp_id] + msg[end:]\n'
        '        pos = idx + len(emp_cache[emp_id])\n'
        '    n["message"] = msg\n'
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
}


def run(client):
    """Update Server Scripts via ERPNext API to resolve employee IDs in notification messages."""
    for script_name, script_body in SCRIPTS.items():
        existing = client.get("Server Script", script_name)
        if not existing:
            print(f"  Server Script '{script_name}' not found, skipping")
            continue

        client.update("Server Script", script_name, {"script": script_body})
        print(f"  Updated Server Script: {script_name}")
