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
    }
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
