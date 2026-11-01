"""Manual one-off Bonus stored as a submitted ERPNext Additional Salary."""

import json

from webhook_v2.core.logging import get_logger
from webhook_v2.services.erpnext import ERPNextClient

log = get_logger(__name__)

BONUS_COMPONENT = "Bonus"
COMPANY = "Meraki Wedding Planner"


def drop_bonus_rows(earnings: list[dict]) -> list[dict]:
    """Earning rows without Bonus (ERPNext re-adds it from active Additional Salary on save)."""
    return [e for e in earnings if e.get("salary_component") != BONUS_COMPONENT]


def has_submitted_slip(slips: list[dict]) -> bool:
    return any(s.get("docstatus") == 1 for s in slips)


def upsert_bonus(client: ERPNextClient, employee: str, amount: float, start_date: str, end_date: str) -> None:
    """Cancel the employee's Bonus Additional Salary in the period, then create a new one if amount > 0."""
    existing = client._get("/api/resource/Additional Salary", params={
        "filters": json.dumps([
            ["employee", "=", employee],
            ["salary_component", "=", BONUS_COMPONENT],
            ["docstatus", "=", 1],
            ["payroll_date", "between", [start_date, end_date]],
        ]),
        "fields": json.dumps(["name"]),
        "limit_page_length": 50,
    }).get("data", [])

    for ads in existing:
        client._post("/api/method/frappe.client.cancel", {"doctype": "Additional Salary", "name": ads["name"]})
        log.info("bonus_additional_salary_cancelled", employee=employee, name=ads["name"])

    if amount <= 0:
        return

    created = client._post("/api/resource/Additional Salary", {
        "employee": employee,
        "salary_component": BONUS_COMPONENT,
        "amount": amount,
        "payroll_date": end_date,
        "company": COMPANY,
    })["data"]
    client._post("/api/method/frappe.client.submit", {"doc": json.dumps(created)})
    log.info("bonus_additional_salary_created", employee=employee, name=created["name"], amount=amount)
