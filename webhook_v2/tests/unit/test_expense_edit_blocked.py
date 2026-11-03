"""PUT /expense/{pi} must refuse approved expenses instead of deleting and re-creating them (MWP-117)."""

from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from webhook_v2.routers import expenses as ex


def _edit(docstatus):
    client = MagicMock()
    client._get.return_value = {"data": {
        "name": "PI-1", "docstatus": docstatus, "posting_date": "2026-11-01", "project": "PROJ-1",
        "items": [{"name": "row1", "item_name": "Fabric", "expense_account": "Khác - MWP"}],
    }}
    with patch.object(ex, "ERPNextClient", return_value=client):
        result = ex.edit_expense("PI-1", ex.EditExpenseRequest(amount=1000), MagicMock())
    return client, result


@pytest.mark.parametrize("docstatus", [1, 2])
def test_submitted_expense_is_refused_and_nothing_is_touched(docstatus):
    client = MagicMock()
    client._get.return_value = {"data": {"docstatus": docstatus, "items": []}}
    with patch.object(ex, "ERPNextClient", return_value=client), pytest.raises(HTTPException) as err:
        ex.edit_expense("PI-1", ex.EditExpenseRequest(amount=1000), MagicMock())
    assert err.value.status_code == 409
    assert "can't be edited" in err.value.detail
    client._put.assert_not_called()
    client._post.assert_not_called()
    client._delete.assert_not_called()


def test_draft_is_still_updated_in_place():
    client, result = _edit(0)
    assert result == {"success": True, "name": "PI-1"}
    client._put.assert_called_once()
    client._delete.assert_not_called()
