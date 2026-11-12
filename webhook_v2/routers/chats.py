"""
Chats inbox summaries (MWP-102).

GET /chats/summaries — one row per lead that has email/messages: stage, last message
(plain-text preview, time, direction) and message count. Replaces the client-side
"fetch 500 communications with full HTML and group them" approach, which cut off old
leads and shipped every message body just to show a one-line preview.

Same audience as the Chats screen in the app (CRM roles).
"""

import re
import uuid
from html import unescape
from html.parser import HTMLParser
from typing import Any

from fastapi import APIRouter, Depends, Request, Response

from webhook_v2.auth import CRM, require_roles
from webhook_v2.core.logging import bind_context, get_logger
from webhook_v2.services.erpnext import ERPNextClient

log = get_logger(__name__)
router = APIRouter(prefix="/chats", tags=["chats"], dependencies=[Depends(require_roles(*CRM))])

PREVIEW_CHARS = 120
# Raw content fetched per message: enough to survive leading markup/styles, far less than a full email.
SNIPPET_CHARS = 2000
_HIDDEN_TAGS = {"style", "script", "head", "title"}
_BLOCK_TAGS = {"br", "p", "div", "li", "tr", "blockquote"}

_COMM_FILTERS = [["reference_doctype", "=", "Lead"], ["communication_type", "=", "Communication"]]
_LEAD_FIELDS = [
    "name", "lead_name", "email_id", "status", "creation",
    "custom_wedding_date", "custom_wedding_date_raw",
]


class _TextExtractor(HTMLParser):
    """Visible text only. Tags are dropped and style/script content ignored, so the result can't carry markup."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self._hidden = 0

    def handle_starttag(self, tag, attrs):
        if tag in _HIDDEN_TAGS:
            self._hidden += 1
        elif tag in _BLOCK_TAGS:
            self.parts.append(" ")

    def handle_endtag(self, tag):
        if tag in _HIDDEN_TAGS and self._hidden:
            self._hidden -= 1

    def handle_data(self, data):
        if not self._hidden:
            self.parts.append(data)


def preview_text(html: str | None, limit: int = PREVIEW_CHARS) -> str:
    """Plain-text one-liner from an HTML snippet (possibly cut mid-tag), at most `limit` characters."""
    if not html:
        return ""
    parser = _TextExtractor()
    try:
        parser.feed(html)
        parser.close()
    except Exception as e:  # malformed markup: fall back to a crude strip rather than failing the inbox
        log.warning("chat_preview_parse_failed", error=str(e))
        parser.parts = [re.sub(r"<[^>]*>?", " ", html)]
    text = re.sub(r"\s+", " ", unescape("".join(parser.parts))).strip()
    text = text.replace("<", "").replace(">", "")  # a cut-off tag must never reach the client as markup
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "…"


def _stamp(row: dict) -> str:
    return row.get("communication_date") or row.get("creation") or ""


def _get_list(client: ERPNextClient, doctype: str, **kwargs: Any) -> list[dict]:
    """frappe.client.get_list over POST (long `in` filters would overflow a GET URL)."""
    body = {"doctype": doctype, **kwargs}
    return client._post("/api/method/frappe.client.get_list", body).get("message") or []


def build_summaries(client: ERPNextClient) -> list[dict]:
    """One row per non-"Do Not Contact" lead that has communications, newest conversation first."""
    # 1. count + last time per lead, in the database.
    aggregates = _get_list(
        client, "Communication",
        fields=["reference_name", "count(name) as message_count", "max(communication_date) as last_at"],
        filters=_COMM_FILTERS,
        group_by="reference_name",
        limit_page_length=0,
    )
    by_lead = {a["reference_name"]: a for a in aggregates if a.get("reference_name")}
    if not by_lead:
        return []

    # 2. the lead records (stage, name, wedding date) - all of them, no row cap.
    leads = _get_list(
        client, "Lead",
        fields=_LEAD_FIELDS,
        filters=[["status", "not in", ["Do Not Contact"]]],
        limit_page_length=0,
    )
    leads = [l for l in leads if l["name"] in by_lead]
    if not leads:
        return []

    # 3. the last message of every lead in one batched query: rows at each lead's max timestamp.
    last_times = sorted({by_lead[l["name"]]["last_at"] for l in leads if by_lead[l["name"]].get("last_at")})
    latest_rows = _get_list(
        client, "Communication",
        fields=["name", "reference_name", "sent_or_received", "communication_date", "creation",
                f"substr(content,1,{SNIPPET_CHARS}) as snippet"],
        filters=_COMM_FILTERS + [
            ["reference_name", "in", [l["name"] for l in leads]],
            ["communication_date", "in", last_times],
        ],
        limit_page_length=0,
    ) if last_times else []

    last_by_lead: dict[str, dict] = {}
    for row in latest_rows:
        agg = by_lead.get(row["reference_name"])
        if not agg or row.get("communication_date") != agg.get("last_at"):
            continue  # another lead's timestamp that happened to match
        current = last_by_lead.get(row["reference_name"])
        if current is None or (row.get("creation") or "") > (current.get("creation") or ""):
            last_by_lead[row["reference_name"]] = row

    out = []
    for lead in leads:
        agg = by_lead[lead["name"]]
        last = last_by_lead.get(lead["name"])
        if last is None:
            log.warning("chat_last_message_missing", lead=lead["name"], last_at=agg.get("last_at"))
        out.append({
            **lead,
            "message_count": agg["message_count"],
            "last_at": agg.get("last_at") or (last and _stamp(last)) or lead.get("creation"),
            "last_direction": last["sent_or_received"] if last else None,
            "last_preview": preview_text(last.get("snippet")) if last else "",
        })
    out.sort(key=lambda r: r["last_at"] or "", reverse=True)
    return out


@router.get("/summaries")
def chat_summaries(request: Request, response: Response) -> dict[str, Any]:
    cid = request.headers.get("x-request-id") or uuid.uuid4().hex[:12]
    bind_context(correlation_id=cid)
    response.headers["X-Request-ID"] = cid
    rows = build_summaries(ERPNextClient())
    log.info("chat_summaries_built", leads=len(rows))
    return {"data": rows}
