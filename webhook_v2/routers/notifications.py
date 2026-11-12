"""PWA Notification management endpoints."""

import json
import re
from datetime import date
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, Request
from webhook_v2.services.erpnext import ERPNextClient
from webhook_v2.core.logging import get_logger
from webhook_v2.services.leave_balance import Pool, build_pools, net_balance_on
from webhook_v2.auth import get_current_user, require_roles, DIRECTOR

log = get_logger(__name__)
router = APIRouter()


@router.post("/notification/{name}/read")
def mark_notification_read(name: str, request: Request):
    """Mark a PWA Notification as read — only the notification's own recipient may."""
    session_user = get_current_user(request)
    client = ERPNextClient()
    try:
        notif = client._get(f"/api/resource/PWA Notification/{name}").get("data", {})
    except Exception:
        notif = None
    if not notif or notif.get("to_user") != session_user:
        raise HTTPException(status_code=404, detail="Notification not found")
    try:
        client._post("/api/method/frappe.client.set_value", {
            "doctype": "PWA Notification",
            "name": name,
            "fieldname": "read",
            "value": 1,
        })
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    log.info("notification_read", name=name)
    return {"success": True}


@router.post("/notification/read-all", dependencies=[Depends(require_roles(*DIRECTOR))])
def mark_all_notifications_read(user: str):
    """Mark all unread PWA Notifications as read for a given user."""
    client = ERPNextClient()
    try:
        client._post("/api/method/frappe.db.sql", {
            "query": "UPDATE `tabPWA Notification` SET `read`=1 WHERE to_user=%(user)s AND `read`=0",
            "values": {"user": user},
            "as_dict": 0,
        })
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    log.info("notifications_read_all", user=user)
    return {"success": True}


class DetailsRequest(BaseModel):
    # PWA Notification names are autoincrement ints, so they arrive as numbers
    names: list[int | str] = Field(default_factory=list, max_length=100)


def _rows(client: ERPNextClient, doctype: str, names: list[str], fields: list[str]) -> dict[str, dict]:
    """One list call for many records of a doctype, keyed by name."""
    if not names:
        return {}
    rows = client._get(f"/api/resource/{doctype}", params={
        "filters": json.dumps([["name", "in", names]]),
        "fields": json.dumps(["name", *fields]),
        "limit_page_length": 0,
    }).get("data", [])
    return {r["name"]: r for r in rows}


def _wfh_days(r: dict) -> float | None:
    """Inclusive calendar days of an Attendance Request (less half a day when it is a half day)."""
    try:
        days = (date.fromisoformat(str(r["to_date"])[:10]) - date.fromisoformat(str(r["from_date"])[:10])).days + 1
        return days - 0.5 if r.get("half_day") else days
    except (KeyError, TypeError, ValueError):
        return None


_REQUEST_SUBJECT = re.compile(r"for approval|pending approval", re.I)


def _vnd(amount) -> str:
    """'VND 3.400.000' (ISO prefix, dot thousands)."""
    return "VND " + f"{round(float(amount)):,}".replace(",", ".")


def _day(value) -> str:
    return str(value or "")[:10]


def _date_range(r: dict) -> str:
    frm, to = _day(r.get("from_date")), _day(r.get("to_date"))
    return f"{frm} → {to}" if to and to != frm else frm


def _weekday_date(value) -> str:
    """'Wed 2026-11-11'."""
    iso = _day(value)
    try:
        return f"{date.fromisoformat(iso):%a} {iso}"
    except ValueError:
        return iso


def _wfh_when(r: dict) -> str:
    frm, to = _day(r.get("from_date")), _day(r.get("to_date"))
    return _weekday_date(frm) if not to or to == frm else _date_range(r)


def _parts(name: str | None, rest: str) -> list[dict] | None:
    """Title parts the frontend renders as-is: a bold name then plain text. None without a name, so the original subject shows."""
    return [{"text": name, "bold": True}, {"text": rest, "bold": False}] if name else None


def _leave_state(r: dict | None) -> str:
    if r is None:
        return "removed"
    return {"Open": "pending", "Approved": "approved", "Rejected": "rejected"}.get(r.get("status"), "cancelled")


def _wfh_state(r: dict | None) -> str:
    if r is None:
        return "removed"
    if r.get("docstatus") == 2:
        return "cancelled"
    if r.get("docstatus") == 0:
        return "pending"
    return "rejected" if r.get("custom_status") == "Rejected" else "approved"


def _expense_state(r: dict | None) -> str:
    if r is None:
        return "removed"
    if r.get("docstatus") == 0 and r.get("custom_rejected"):
        return "rejected"  # a rejected expense stays a draft, flagged custom_rejected
    return {0: "pending", 1: "approved"}.get(r.get("docstatus"), "cancelled")


def build_details(
    notifs: list[dict], leaves: dict, wfh: dict, invoices: dict, employees: dict,
    projects: dict | None = None, bills: set | None = None, days_left: dict | None = None,
    owner_names: dict | None = None,
) -> dict[str, dict]:
    """Per-notification facts, titles and request state, keyed by notification name. Pure, so it is unit-testable.

    Only approval requests are described; outcome notices and other types keep their own message.
    """
    projects, bills, days_left, owner_names = projects or {}, bills or set(), days_left or {}, owner_names or {}
    out: dict[str, dict] = {}
    for n in notifs:
        ref, kind = n.get("reference_document_name"), n.get("reference_document_type")
        if kind not in ("Leave Application", "Attendance Request", "Purchase Invoice"):
            continue
        if not _REQUEST_SUBJECT.search(n.get("message") or ""):
            continue
        key = str(n["name"])
        if kind == "Leave Application":
            r = leaves.get(ref)
            if r is None:
                out[key] = {"kind": "leave", "state": "removed"}
                continue
            who = r.get("employee_name")
            what = ", ".join(x for x in [(r.get("leave_type") or "leave").lower(), _date_range(r)] if x)
            out[key] = {
                "kind": "leave", "state": _leave_state(r), "employee_name": who, "leave_type": r.get("leave_type"),
                "from_date": r.get("from_date"), "to_date": r.get("to_date"),
                "days": r.get("total_leave_days"), "half_day": bool(r.get("half_day")),
                "days_left_after": days_left.get(ref),
                "title": _parts(who, " asked for leave"),
                "compact": _parts(who, f" · {what}{' (half day)' if r.get('half_day') else ''}"),
            }
        elif kind == "Attendance Request":
            r = wfh.get(ref)
            if r is None:
                out[key] = {"kind": "wfh", "state": "removed"}
                continue
            who = r.get("employee_name")
            out[key] = {
                "kind": "wfh", "state": _wfh_state(r), "employee_name": who,
                "from_date": r.get("from_date"), "to_date": r.get("to_date"), "half_day": bool(r.get("half_day")),
                "days": _wfh_days(r), "reason": (r.get("explanation") or "").strip() or None,
                "title": _parts(who, " wants to work from home"),
                "compact": _parts(who, f" · WFH on {_wfh_when(r)}"),
            }
        else:
            inv = invoices.get(ref)
            if inv is None:
                out[key] = {"kind": "expense", "state": "removed"}
                continue
            staff = inv.get("custom_expense_staff")
            who = (employees.get(staff) or {}).get("employee_name") or owner_names.get(inv.get("owner"))
            wedding = (projects.get(inv.get("project")) or {}).get("project_name")
            amount = inv.get("grand_total")
            added = f" added {_vnd(amount)}" + (f" to {wedding}" if wedding else "") if amount is not None else " submitted an expense"
            out[key] = {
                "kind": "expense", "state": _expense_state(inv), "submitter": who, "amount": amount,
                "wedding": wedding, "has_bill": ref in bills,
                "title": _parts(who, " submitted an expense"),
                "compact": _parts(who, added),
            }
    return out


def _owner_names(client: ERPNextClient, users: list[str]) -> dict[str, str]:
    """Full name for each user id: their Employee name when they have one, else the User's full name."""
    if not users:
        return {}
    emps = client._get("/api/resource/Employee", params={
        "filters": json.dumps([["user_id", "in", users]]),
        "fields": json.dumps(["user_id", "employee_name"]),
        "limit_page_length": 0,
    }).get("data", [])
    names = {e["user_id"]: e["employee_name"] for e in emps if e.get("employee_name")}
    rest = [u for u in users if u not in names]
    for u in _rows(client, "User", rest, ["full_name"]).values():
        if u.get("full_name"):
            names[u["name"]] = u["full_name"]
    return names


def _pools_by_employee(client: ERPNextClient, employees: list[str], today: date) -> dict[str, dict[str, list[Pool]]]:
    """Leave pools for several employees in three requests total (employees, allocations, applications).

    Same inputs and the same `build_pools` as the leave balance endpoints, just fetched for everyone at once.
    """
    emps = _rows(client, "Employee", employees, ["date_of_joining", "relieving_date"])
    emp_filter = ["employee", "in", employees]
    allocs = client._get("/api/resource/Leave Allocation", params={
        "filters": json.dumps([emp_filter, ["docstatus", "=", 1]]),
        "fields": json.dumps(["name", "employee", "leave_type", "from_date", "to_date",
                              "new_leaves_allocated", "total_leaves_allocated"]),
        "limit_page_length": 0,
    }).get("data", [])
    apps = client._get("/api/resource/Leave Application", params={
        "filters": json.dumps([emp_filter, ["docstatus", "!=", 2], ["status", "!=", "Rejected"]]),
        "fields": json.dumps(["name", "employee", "leave_type", "from_date", "to_date",
                              "total_leave_days", "status", "docstatus"]),
        "limit_page_length": 0,
    }).get("data", [])

    out = {}
    for emp in employees:
        info = emps.get(emp) or {}
        joined, left = str(info.get("date_of_joining") or "")[:10], str(info.get("relieving_date") or "")[:10]
        out[emp] = build_pools(
            [a for a in allocs if a.get("employee") == emp],
            [a for a in apps if a.get("employee") == emp],
            today=today,
            date_of_joining=date.fromisoformat(joined) if joined else None,
            relieving_date=date.fromisoformat(left) if left else None,
        )
    return out


def _days_left_after(client: ERPNextClient, leaves: dict, today: date | None = None) -> dict[str, float | None]:
    """Days of the leave type left on each pending application's start date, after that application.

    A pending application is already charged against its pool, so the unclamped pool balance on its from_date is
    the figure "after this request"; negative means the request overdraws (or uses days not yet accrued).
    Anything not pending, or of a type without allocations (e.g. unpaid), gets None.
    """
    pending = {n: r for n, r in leaves.items()
               if r.get("status") == "Open" and r.get("employee") and r.get("leave_type") and r.get("from_date")}
    out: dict[str, float | None] = {n: None for n in leaves}
    if not pending:
        return out
    try:
        pools = _pools_by_employee(client, sorted({r["employee"] for r in pending.values()}), today or date.today())
    except Exception as e:
        # A missing balance only removes one line from the cards; the requests themselves are unaffected
        log.warning("notification_days_left_failed", error=str(e))
        return out
    for name, r in pending.items():
        group = pools.get(r["employee"], {}).get(r["leave_type"], [])
        if group:
            out[name] = net_balance_on(group, date.fromisoformat(str(r["from_date"])[:10]))
    return out


@router.post("/notification/details")
def notification_details(body: DetailsRequest, request: Request):
    """Leave / WFH / expense facts for the caller's own notifications, in one batched lookup per doctype.

    Reference types and names come from the notifications themselves (owned by the caller), never from the client.
    """
    session_user = get_current_user(request)
    if not body.names:
        return {"details": {}}
    client = ERPNextClient()
    try:
        notifs = client._get("/api/resource/PWA Notification", params={
            "filters": json.dumps([["name", "in", [str(n) for n in body.names]], ["to_user", "=", session_user]]),
            "fields": json.dumps(["name", "reference_document_type", "reference_document_name", "message"]),
            "limit_page_length": 0,
        }).get("data", [])

        def refs(kind: str) -> list[str]:
            return [n["reference_document_name"] for n in notifs
                    if n.get("reference_document_type") == kind and _REQUEST_SUBJECT.search(n.get("message") or "")]

        leaves = _rows(client, "Leave Application", refs("Leave Application"),
                       ["employee", "employee_name", "leave_type", "from_date", "to_date", "total_leave_days", "half_day", "status"])
        wfh = _rows(client, "Attendance Request", refs("Attendance Request"),
                    ["employee_name", "from_date", "to_date", "half_day", "explanation", "docstatus", "custom_status"])
        invoices = _rows(client, "Purchase Invoice", refs("Purchase Invoice"),
                         ["custom_expense_staff", "grand_total", "project", "docstatus", "custom_rejected", "owner"])
        staff_ids = sorted({i["custom_expense_staff"] for i in invoices.values() if i.get("custom_expense_staff")})
        employees = _rows(client, "Employee", staff_ids, ["employee_name"])
        owner_names = _owner_names(client, sorted({
            i["owner"] for i in invoices.values() if i.get("owner") and not i.get("custom_expense_staff")
        }))
        project_ids = sorted({i["project"] for i in invoices.values() if i.get("project")})
        projects = _rows(client, "Project", project_ids, ["project_name"])
        bills = set()
        if invoices:
            bills = {f["attached_to_name"] for f in client._get("/api/resource/File", params={
                "filters": json.dumps([["attached_to_doctype", "=", "Purchase Invoice"],
                                       ["attached_to_name", "in", list(invoices)]]),
                "fields": json.dumps(["attached_to_name"]),
                "limit_page_length": 0,
            }).get("data", [])}
        days_left = _days_left_after(client, leaves)
    except Exception as e:
        log.error("notification_details_failed", error=str(e))
        raise HTTPException(status_code=502, detail="Could not load notification details")
    details = build_details(notifs, leaves, wfh, invoices, employees, projects, bills, days_left, owner_names)
    log.info("notification_details", requested=len(body.names), resolved=len(details))
    return {"details": details}
