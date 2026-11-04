"""POST /expense/{pi}/approve must refuse a rejected draft, so a stale page cannot submit it (MWP-116)."""

from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from webhook_v2.routers import expenses as ex


def _client(**fields):
    client = MagicMock()
    client._get.return_value = {"data": {"name": "PI-1", "docstatus": 0, **fields}}
    return client


def test_rejected_draft_is_refused_and_not_submitted():
    client = _client(custom_rejected=1)
    with patch.object(ex, "ERPNextClient", return_value=client), pytest.raises(HTTPException) as err:
        ex.approve_expense("PI-1")
    assert err.value.status_code == 400
    assert "was rejected" in err.value.detail
    client._post.assert_not_called()


def test_pending_draft_is_still_approved():
    client = _client(custom_rejected=0)
    with patch.object(ex, "ERPNextClient", return_value=client), patch.object(ex, "_mark_pi_paid") as paid:
        assert ex.approve_expense("PI-1") == {"success": True}
    client._post.assert_called_once()
    paid.assert_called_once_with(client, "PI-1")
