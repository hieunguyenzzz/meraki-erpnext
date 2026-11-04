"""Rejection reason: required, saved as a Comment by the API user, read back batched, hidden once reopened (MWP-117, MWP-97)."""

import json
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from webhook_v2.routers import expenses as ex
from webhook_v2.routers import my_weddings as mw
from webhook_v2.services import expense_rejection as er
from webhook_v2.services.expense_rejection import REASON_PREFIX, reason_if_rejected, rejection_reasons

API_USER = "api@example.com"


@pytest.fixture(autouse=True)
def _fresh_api_user_cache(monkeypatch):
    monkeypatch.setattr(er, "_api_user", None)


def _client(pi=None, comments=None):
    """Fake ERPNext: answers get_logged_user, the PI doc and Comment queries (applying the owner / reference filters)."""
    client = MagicMock()
    client.order = []

    def fake_get(url, params=None):
        if url == "/api/method/frappe.auth.get_logged_user":
            return {"message": API_USER}
        if url == "/api/resource/Comment":
            flt = json.loads(params["filters"])
            names = next(f[2] for f in flt if f[0] == "reference_name")
            owner = next(f[2] for f in flt if f[0] == "owner")
            rows = [c for c in (comments or []) if c["reference_name"] in names and c.get("owner", API_USER) == owner]
            return {"data": sorted(rows, key=lambda c: c["creation"], reverse=True)}
        return {"data": pi if pi is not None else {}}

    client._get.side_effect = fake_get
    client._put.side_effect = lambda *a, **k: client.order.append("put")
    client._post.side_effect = lambda *a, **k: client.order.append("post")
    return client


def _reject(client, reason="No bill"):
    with patch.object(ex, "ERPNextClient", return_value=client):
        return ex.reject_expense("PI-1", ex.RejectExpenseRequest(reason=reason))


def test_reject_saves_escaped_comment_after_flagging():
    client = _client({"name": "PI-1", "docstatus": 0})
    assert _reject(client, "  No <b>bill</b> & photo ") == {"success": True}
    client._put.assert_called_once_with("/api/resource/Purchase Invoice/PI-1", {"custom_rejected": 1})
    endpoint, body = client._post.call_args.args
    assert endpoint == "/api/resource/Comment"
    assert body == {
        "comment_type": "Comment", "reference_doctype": "Purchase Invoice", "reference_name": "PI-1",
        "content": "Rejected: No &lt;b&gt;bill&lt;/b&gt; &amp; photo",
    }


@pytest.mark.parametrize("req", [None, ex.RejectExpenseRequest(), ex.RejectExpenseRequest(reason="   ")])
def test_reject_without_reason_is_400_and_touches_nothing(req):
    client = _client({"name": "PI-1", "docstatus": 0})
    with patch.object(ex, "ERPNextClient", return_value=client), pytest.raises(HTTPException) as err:
        ex.reject_expense("PI-1", req)
    assert err.value.status_code == 400
    client._put.assert_not_called()
    client._post.assert_not_called()


def test_reject_twice_adds_no_second_comment():
    client = _client({"name": "PI-1", "docstatus": 0, "custom_rejected": 1})
    assert _reject(client) == {"success": True}
    client._put.assert_not_called()
    client._post.assert_not_called()


def test_flag_is_set_before_the_comment_and_comment_failure_is_502():
    client = _client({"name": "PI-1", "docstatus": 0})
    client._post.side_effect = RuntimeError("boom")
    with patch.object(ex, "ERPNextClient", return_value=client), pytest.raises(HTTPException) as err:
        ex.reject_expense("PI-1", ex.RejectExpenseRequest(reason="x"))
    assert err.value.status_code == 502
    assert "rejected" in err.value.detail.lower()
    client._put.assert_called_once()  # the flag was written even though the comment failed
    ok = _client({"name": "PI-1", "docstatus": 0})
    _reject(ok)
    assert ok.order == ["put", "post"]


def test_newest_reason_per_invoice_in_one_query():
    client = _client(comments=[
        {"reference_name": "PI-1", "content": REASON_PREFIX + "first", "creation": "2026-11-01"},
        {"reference_name": "PI-1", "content": REASON_PREFIX + "second &amp; final", "creation": "2026-11-02"},
        {"reference_name": "PI-2", "content": REASON_PREFIX + "only one", "creation": "2026-11-01"},
    ])
    assert rejection_reasons(client, ["PI-1", "PI-2", "PI-1"]) == {"PI-1": "second & final", "PI-2": "only one"}
    comment_calls = [c for c in client._get.call_args_list if c.args[0] == "/api/resource/Comment"]
    assert len(comment_calls) == 1
    filters = json.loads(comment_calls[0].kwargs["params"]["filters"])
    assert ["content", "like", "Rejected: %"] in filters and ["owner", "=", API_USER] in filters


def test_more_than_50_invoices_are_split_into_batches_without_losing_any():
    names = [f"PI-{i:03d}" for i in range(120)]
    client = _client(comments=[{"reference_name": n, "content": REASON_PREFIX + n, "creation": "2026-11-01"} for n in names])
    out = rejection_reasons(client, names)
    assert out == {n: n for n in names}
    sizes = [len(json.loads(c.kwargs["params"]["filters"])[2][2]) for c in client._get.call_args_list if c.args[0] == "/api/resource/Comment"]
    assert sizes == [50, 50, 20]


def test_exactly_50_is_one_query():
    names = [f"PI-{i:03d}" for i in range(50)]
    client = _client(comments=[])
    rejection_reasons(client, names)
    assert len([c for c in client._get.call_args_list if c.args[0] == "/api/resource/Comment"]) == 1


def test_a_comment_from_a_normal_user_is_ignored():
    client = _client(comments=[
        {"reference_name": "PI-1", "content": REASON_PREFIX + "real", "creation": "2026-11-01"},
        {"reference_name": "PI-1", "content": REASON_PREFIX + "spoof", "creation": "2026-11-02", "owner": "staff@example.com"},
    ])
    assert rejection_reasons(client, ["PI-1"]) == {"PI-1": "real"}


def test_no_reason_for_non_rejected_expenses_and_no_query_when_none_rejected():
    client = _client()
    rows = [
        {"name": "PI-P", "docstatus": 0, "custom_rejected": 0},   # pending, e.g. just edited back to Pending
        {"name": "PI-A", "docstatus": 1, "custom_rejected": 1},   # stale flag on an approved expense
    ]
    assert reason_if_rejected(client, rows) == {}
    client._get.assert_not_called()


def test_reason_asked_only_for_rejected_drafts():
    client = _client(comments=[{"reference_name": "PI-R", "content": REASON_PREFIX + "why", "creation": "x"}])
    rows = [{"name": "PI-R", "docstatus": 0, "custom_rejected": 1}, {"name": "PI-P", "docstatus": 0, "custom_rejected": 0}]
    assert reason_if_rejected(client, rows) == {"PI-R": "why"}
    flt = json.loads(next(c for c in client._get.call_args_list if c.args[0] == "/api/resource/Comment").kwargs["params"]["filters"])
    assert ["reference_name", "in", ["PI-R"]] in flt


def _edit(pi):
    client = _client({"name": "PI-1", "posting_date": "2026-11-01", "project": "PROJ-1",
                      "items": [{"name": "row1", "item_name": "Fabric", "expense_account": "Khác - MWP"}], **pi})
    with patch.object(ex, "ERPNextClient", return_value=client):
        ex.edit_expense("PI-1", ex.EditExpenseRequest(amount=1000), MagicMock())
    return client


def test_editing_a_rejected_expense_clears_the_flag():
    values = _edit({"docstatus": 0, "custom_rejected": 1})._put.call_args.args[1]
    assert values["custom_rejected"] == 0


def test_editing_a_pending_expense_does_not_touch_the_flag():
    values = _edit({"docstatus": 0, "custom_rejected": 0})._put.call_args.args[1]
    assert "custom_rejected" not in values


def test_reason_is_hidden_once_the_expense_is_back_to_pending():
    comments = [{"reference_name": "PI-1", "content": REASON_PREFIX + "no bill", "creation": "2026-11-01"}]
    client = _client(comments=comments)
    assert reason_if_rejected(client, [{"name": "PI-1", "docstatus": 0, "custom_rejected": 1}]) == {"PI-1": "no bill"}
    assert reason_if_rejected(client, [{"name": "PI-1", "docstatus": 0, "custom_rejected": 0}]) == {}  # after the edit


def test_my_wedding_shows_only_the_callers_own_rejected_reason():
    pis = [
        {"name": "PI-MINE", "posting_date": "2026-11-01", "grand_total": 1, "docstatus": 0, "custom_rejected": 1,
         "custom_expense_staff": "HR-EMP-2", "idx": 1, "item_name": "mine"},
        {"name": "PI-THEIRS", "posting_date": "2026-11-01", "grand_total": 1, "docstatus": 0, "custom_rejected": 1,
         "custom_expense_staff": "HR-EMP-1", "idx": 1, "item_name": "theirs"},
    ]
    comments = [
        {"reference_name": "PI-MINE", "content": REASON_PREFIX + "my reason", "creation": "1"},
        {"reference_name": "PI-THEIRS", "content": REASON_PREFIX + "colleague reason", "creation": "1"},
    ]
    client = _client(comments=comments)
    base = client._get.side_effect

    def route(url, params=None):
        if url == "/api/resource/Purchase Invoice":
            staff = next(f[2] for f in json.loads(params["filters"]) if f[0] == "custom_expense_staff")
            return {"data": [p for p in pis if p["custom_expense_staff"] == staff]}
        return base(url, params)

    client._get.side_effect = route
    out = mw._my_expenses(client, "PROJ-1", "HR-EMP-2")
    assert [(e["name"], e["rejected_reason"]) for e in out] == [("PI-MINE", "my reason")]
    asked = json.loads(next(c for c in client._get.call_args_list if c.args[0] == "/api/resource/Comment").kwargs["params"]["filters"])
    assert ["reference_name", "in", ["PI-MINE"]] in asked
