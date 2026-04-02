"""Shared helpers for leave and WFH routers."""

from datetime import date
from webhook_v2.services.erpnext import ERPNextClient


def fmt_days(d) -> str:
    """Format days: 2.0 → '2', 1.5 → '1.5'."""
    return str(int(d)) if float(d) == int(float(d)) else str(d)


def format_date_range(from_str: str, to_str: str) -> str:
    """Format date range for notification messages, e.g. 'Apr 7 – Apr 11'."""
    fd = date.fromisoformat(from_str)
    td = date.fromisoformat(to_str)
    months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
              "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    if fd == td:
        return f"{months[fd.month - 1]} {fd.day}"
    return f"{months[fd.month - 1]} {fd.day} – {months[td.month - 1]} {td.day}"


def get_employee_name(client: ERPNextClient, identifier: str) -> str:
    """Get employee's display name. Accepts Employee ID (HR-EMP-00001) or user email."""
    try:
        if identifier.startswith("HR-EMP-"):
            emp = client._get(f"/api/resource/Employee/{identifier}").get("data", {})
        else:
            emps = client._get("/api/resource/Employee", params={
                "filters": f'[["user_id","=","{identifier}"]]',
                "fields": '["first_name","last_name"]',
                "limit_page_length": 1,
            }).get("data", [])
            emp = emps[0] if emps else {}
        first = emp.get("first_name", "")
        last = emp.get("last_name", "")
        return f"{first} {last}".strip() or identifier
    except Exception:
        return identifier


def submit_doc(client: ERPNextClient, doctype: str, name: str) -> None:
    """Fetch full doc and submit."""
    full_doc = client._get(f"/api/resource/{doctype}/{name}").get("data", {})
    client._post("/api/method/frappe.client.submit", {"doc": full_doc})
