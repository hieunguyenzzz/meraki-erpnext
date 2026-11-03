"""Unit tests for the Chats inbox summaries router (MWP-102)."""

from unittest.mock import MagicMock

from webhook_v2.auth import CRM


def test_preview_is_plain_text_and_truncated():
    from webhook_v2.routers.chats import PREVIEW_CHARS, preview_text

    html = ("<style>p{color:red}</style><div>Hi&nbsp;Mai,<br>Thanks <b>so</b> much &amp; "
            "<img src=x onerror=alert(1)>" + "word " * 100 + "</div>")
    out = preview_text(html)
    assert out.startswith("Hi Mai, Thanks so much & ")
    assert "color:red" not in out and "<" not in out and ">" not in out
    assert len(out) <= PREVIEW_CHARS and out.endswith("…")


def test_preview_survives_a_snippet_cut_mid_tag():
    from webhook_v2.routers.chats import preview_text

    out = preview_text("<p>Hello there</p><a href='http://x.com/very/long")
    assert "<" not in out and out.startswith("Hello there")


def test_router_requires_crm_roles():
    from webhook_v2.routers.chats import router

    assert router.dependencies, "router must be role-guarded"
    assert CRM == ("System Manager", "Sales Manager", "Sales User")


def _fake_client(aggregates, leads, latest):
    client = MagicMock()

    def post(endpoint, data):
        assert endpoint == "/api/method/frappe.client.get_list"
        if data["doctype"] == "Lead":
            return {"message": leads}
        return {"message": aggregates if data.get("group_by") else latest}

    client._post.side_effect = post
    return client


def test_summaries_pick_latest_message_per_lead_and_skip_leadless_comms():
    from webhook_v2.routers.chats import build_summaries

    aggregates = [
        {"reference_name": "L1", "message_count": 3, "last_at": "2026-04-02 14:53:59"},
        {"reference_name": "L2", "message_count": 1, "last_at": "2026-04-03 09:00:00"},
        {"reference_name": "L3", "message_count": 2, "last_at": "2026-04-02 14:53:59"},  # Do Not Contact
    ]
    leads = [
        {"name": "L1", "lead_name": "Mai & Khoa", "status": "Replied", "creation": "2026-04-01"},
        {"name": "L2", "lead_name": "Hà & Đức", "status": "Lead", "creation": "2026-04-03"},
    ]
    latest = [
        {"reference_name": "L1", "sent_or_received": "Received", "communication_date": "2026-04-02 14:53:59",
         "creation": "2026-04-02 14:53:59", "snippet": "<p>Older at same stamp</p>"},
        {"reference_name": "L1", "sent_or_received": "Sent", "communication_date": "2026-04-02 14:53:59",
         "creation": "2026-04-02 14:54:00", "snippet": "<p>Winner</p>"},
        {"reference_name": "L2", "sent_or_received": "Received", "communication_date": "2026-04-03 09:00:00",
         "creation": "2026-04-03 09:00:01", "snippet": "<div>Hello</div>"},
        {"reference_name": "L2", "sent_or_received": "Sent", "communication_date": "2026-04-02 14:53:59",
         "creation": "x", "snippet": "other lead's timestamp"},
    ]

    rows = build_summaries(_fake_client(aggregates, leads, latest))

    assert [r["name"] for r in rows] == ["L2", "L1"]  # newest conversation first
    l1 = rows[1]
    assert (l1["last_preview"], l1["last_direction"], l1["message_count"]) == ("Winner", "Sent", 3)
    assert l1["status"] == "Replied"
    assert rows[0]["last_preview"] == "Hello"


def test_summaries_empty_when_no_communications():
    from webhook_v2.routers.chats import build_summaries

    assert build_summaries(_fake_client([], [], [])) == []
