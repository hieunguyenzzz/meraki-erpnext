"""Expense rejection reasons, stored as standard ERPNext Comments on the Purchase Invoice (MWP-117, MWP-97).

A reason is a plain-text Comment, HTML-escaped, whose content starts with REASON_PREFIX so it can be
found among any other comments. History is kept: a later rejection adds a new Comment and the newest wins.

Only Comments owned by the backend's own API user count. Frappe stamps `owner` with the session user on
insert and a normal user cannot override it, so a staff member typing "Rejected: ..." as a comment is ignored.
"""

import html
import json

from webhook_v2.core.logging import get_logger

log = get_logger(__name__)

REASON_PREFIX = "Rejected: "
_BATCH = 50  # long `in` filters break GET URLs
_api_user: str | None = None


def api_user(client) -> str:
    """The ERPNext user the backend's API key acts as (the owner of every Comment it writes). Cached."""
    global _api_user
    if _api_user is None:
        _api_user = client._get("/api/method/frappe.auth.get_logged_user")["message"]
    return _api_user


def add_rejection_comment(client, pi_name: str, reason: str) -> None:
    """Add the reason Comment. Raises on failure: the caller decides how to tell the user."""
    client._post("/api/resource/Comment", {
        "comment_type": "Comment",
        "reference_doctype": "Purchase Invoice",
        "reference_name": pi_name,
        "content": REASON_PREFIX + html.escape(reason, quote=False),
    })
    log.info("expense_rejection_comment_added", pi=pi_name, length=len(reason))


def rejection_reasons(client, pi_names: list[str]) -> dict[str, str]:
    """Latest rejection reason per invoice, as plain text. One Comment query per 50 names, newest first."""
    out: dict[str, str] = {}
    names = sorted(set(pi_names))
    if not names:
        return out
    owner = api_user(client)
    for i in range(0, len(names), _BATCH):
        rows = client._get("/api/resource/Comment", params={
            "filters": json.dumps([
                ["comment_type", "=", "Comment"],
                ["reference_doctype", "=", "Purchase Invoice"],
                ["reference_name", "in", names[i:i + _BATCH]],
                ["content", "like", f"{REASON_PREFIX}%"],
                ["owner", "=", owner],
            ]),
            "fields": json.dumps(["reference_name", "content", "creation"]),
            "order_by": "creation desc",
            "limit_page_length": 0,
        }).get("data", [])
        for row in rows:
            content = row.get("content") or ""
            if row["reference_name"] not in out and content.startswith(REASON_PREFIX):
                out[row["reference_name"]] = html.unescape(content[len(REASON_PREFIX):]).strip()
    return out


def reason_if_rejected(client, rows: list[dict]) -> dict[str, str]:
    """Reasons only for the Draft invoices flagged custom_rejected; everything else shows no reason."""
    rejected = [r["name"] for r in rows if r.get("docstatus") == 0 and r.get("custom_rejected")]
    return rejection_reasons(client, rejected) if rejected else {}
