"""Rejection reason is stored as a Comment and read back batched, newest first, only while rejected (MWP-117, MWP-97)."""

import json
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from webhook_v2.routers import expenses as ex
from webhook_v2.services.expense_rejection import REASON_PREFIX, reason_if_rejected, rejection_reasons


def test_reject_with_reason_saves_escaped_comment_after_flagging():
    client = MagicMock()
    client._get.return_value = {"data": {"name": "PI-1", "docstatus": 0}}
    with patch.object(ex, "ERPNextClient", return_value=client):
        assert ex.reject_expense("PI-1", ex.RejectExpenseRequest(reason="  No <b>bill</b> & photo ")) == {"success": True}
    client._put.assert_called_once_with("/api/resource/Purchase Invoice/PI-1", {"custom_rejected": 1})
    endpoint, body = client._post.call_args.args
    assert endpoint == "/api/resource/Comment"
    assert body == {
        "comment_type": "Comment", "reference_doctype": "Purchase Invoice", "reference_name": "PI-1",
        "content": "Rejected: No &lt;b&gt;bill&lt;/b&gt; &amp; photo",
    }


@pytest.mark.parametrize("req", [None, ex.RejectExpenseRequest(), ex.RejectExpenseRequest(reason="   ")])
def test_reject_without_reason_still_works_and_adds_no_comment(req):
    client = MagicMock()
    client._get.return_value = {"data": {"name": "PI-1", "docstatus": 0}}
    with patch.object(ex, "ERPNextClient", return_value=client):
        assert ex.reject_expense("PI-1", req) == {"success": True}
    client._post.assert_not_called()


def test_comment_failure_is_reported_not_swallowed():
    client = MagicMock()
    client._get.return_value = {"data": {"name": "PI-1", "docstatus": 0}}
    client._post.side_effect = RuntimeError("boom")
    with patch.object(ex, "ERPNextClient", return_value=client), pytest.raises(HTTPException) as err:
        ex.reject_expense("PI-1", ex.RejectExpenseRequest(reason="x"))
    assert err.value.status_code == 502


def test_newest_reason_per_invoice_in_one_query():
    client = MagicMock()
    # Server returns creation desc: the first row seen per invoice is the newest.
    client._get.return_value = {"data": [
        {"reference_name": "PI-1", "content": REASON_PREFIX + "second &amp; final", "creation": "2026-11-02"},
        {"reference_name": "PI-2", "content": REASON_PREFIX + "only one", "creation": "2026-11-01"},
        {"reference_name": "PI-1", "content": REASON_PREFIX + "first", "creation": "2026-11-01"},
    ]}
    assert rejection_reasons(client, ["PI-1", "PI-2", "PI-1"]) == {"PI-1": "second & final", "PI-2": "only one"}
    assert client._get.call_count == 1
    params = client._get.call_args.kwargs["params"]
    assert params["order_by"] == "creation desc"
    filters = json.loads(params["filters"])
    assert ["reference_name", "in", ["PI-1", "PI-2"]] in filters
    assert ["content", "like", "Rejected: %"] in filters


def test_no_reason_for_non_rejected_expenses_and_no_query_when_none_rejected():
    client = MagicMock()
    rows = [
        {"name": "PI-P", "docstatus": 0, "custom_rejected": 0},
        {"name": "PI-A", "docstatus": 1, "custom_rejected": 1},  # stale flag on an approved expense
    ]
    assert reason_if_rejected(client, rows) == {}
    client._get.assert_not_called()


def test_reason_asked_only_for_rejected_drafts():
    client = MagicMock()
    client._get.return_value = {"data": [{"reference_name": "PI-R", "content": REASON_PREFIX + "why", "creation": "x"}]}
    rows = [{"name": "PI-R", "docstatus": 0, "custom_rejected": 1}, {"name": "PI-P", "docstatus": 0, "custom_rejected": 0}]
    assert reason_if_rejected(client, rows) == {"PI-R": "why"}
    assert ["reference_name", "in", ["PI-R"]] in json.loads(client._get.call_args.kwargs["params"]["filters"])
