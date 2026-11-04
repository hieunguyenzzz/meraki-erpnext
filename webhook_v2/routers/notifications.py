"""PWA Notification management endpoints."""

import json
from datetime import date
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, Request
from webhook_v2.services.erpnext import ERPNextClient
from webhook_v2.core.logging import get_logger
from webhook_v2.routers.leaves import _employee_pools
from webhook_v2.services.leave_balance import available_on
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


def _wfh_days(r: dict) -> int | None:
    """Inclusive calendar days of an Attendance Request, same count as the WFH approve/reject notices."""
    try:
        return (date.fromisoformat(str(r["to_date"])[:10]) - date.fromisoformat(str(r["from_date"])[:10])).days + 1
    except (KeyError, TypeError, ValueError):
        return None


def build_details(
    notifs: list[dict], leaves: dict, wfh: dict, invoices: dict, employees: dict,
    projects: dict | None = None, bills: set | None = None, days_left: dict | None = None,
) -> dict[str, dict]:
    """Per-notification facts an approver needs, keyed by notification name. Pure, so it is unit-testable."""
    projects, bills, days_left = projects or {}, bills or set(), days_left or {}
    out: dict[str, dict] = {}
    for n in notifs:
        ref, kind = n.get("reference_document_name"), n.get("reference_document_type")
        if kind == "Leave Application" and ref in leaves:
            r = leaves[ref]
            out[str(n["name"])] = {
                "kind": "leave", "employee_name": r.get("employee_name"), "leave_type": r.get("leave_type"),
                "from_date": r.get("from_date"), "to_date": r.get("to_date"),
                "days": r.get("total_leave_days"), "half_day": bool(r.get("half_day")),
                "days_left_after": days_left.get(ref),
            }
        elif kind == "Attendance Request" and ref in wfh:
            r = wfh[ref]
            out[str(n["name"])] = {
                "kind": "wfh", "employee_name": r.get("employee_name"),
                "from_date": r.get("from_date"), "to_date": r.get("to_date"), "half_day": bool(r.get("half_day")),
                "days": _wfh_days(r), "reason": (r.get("explanation") or "").strip() or None,
            }
        elif kind == "Purchase Invoice" and ref in invoices:
            inv = invoices[ref]
            staff = inv.get("custom_expense_staff")
            out[str(n["name"])] = {
                "kind": "expense",
                "submitter": (employees.get(staff) or {}).get("employee_name"),
                "amount": inv.get("grand_total"),
                "wedding": (projects.get(inv.get("project")) or {}).get("project_name"),
                "has_bill": ref in bills,
            }
    return out


def _days_left_after(client: ERPNextClient, leaves: dict) -> dict[str, float | None]:
    """Days of the leave type still bookable after each pending application, using the app's own balance logic.

    A pending application is already charged against its pool, so the pool balance on its from_date is the
    figure "after this request". Anything not pending, or of a type without allocations (e.g. unpaid), gets None.
    """
    pools_cache: dict[tuple[str, str], dict] = {}
    out: dict[str, float | None] = {}
    for name, r in leaves.items():
        out[name] = None
        emp, lt, start = r.get("employee"), r.get("leave_type"), str(r.get("from_date") or "")[:10]
        if r.get("status") != "Open" or not (emp and lt and start):
            continue
        try:
            key = (emp, lt)
            if key not in pools_cache:
                pools_cache[key] = _employee_pools(client, emp, date.today(), lt)
            group = pools_cache[key].get(lt, [])
            if group:
                out[name] = available_on(group, date.fromisoformat(start))
        except Exception as e:
            # A missing balance only removes one line from the card; the request itself is unaffected
            log.warning("notification_days_left_failed", leave=name, error=str(e))
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
            "fields": json.dumps(["name", "reference_document_type", "reference_document_name"]),
            "limit_page_length": 0,
        }).get("data", [])

        def refs(kind: str) -> list[str]:
            return [n["reference_document_name"] for n in notifs if n.get("reference_document_type") == kind]

        leaves = _rows(client, "Leave Application", refs("Leave Application"),
                       ["employee", "employee_name", "leave_type", "from_date", "to_date", "total_leave_days", "half_day", "status"])
        wfh = _rows(client, "Attendance Request", refs("Attendance Request"),
                    ["employee_name", "from_date", "to_date", "half_day", "explanation"])
        invoices = _rows(client, "Purchase Invoice", refs("Purchase Invoice"),
                         ["custom_expense_staff", "grand_total", "project"])
        staff_ids = sorted({i["custom_expense_staff"] for i in invoices.values() if i.get("custom_expense_staff")})
        employees = _rows(client, "Employee", staff_ids, ["employee_name"])
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
    details = build_details(notifs, leaves, wfh, invoices, employees, projects, bills, days_left)
    log.info("notification_details", requested=len(body.names), resolved=len(details))
    return {"details": details}
