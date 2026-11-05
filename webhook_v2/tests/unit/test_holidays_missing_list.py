"""Adding/removing a holiday in a year with no 'Vietnam {year}' list is a clear 404, not a 500 (MWP-125)."""

from unittest.mock import MagicMock, patch

import pytest
import requests
from fastapi import HTTPException

from webhook_v2.routers import holidays as h


def _client(status):
    resp = MagicMock(status_code=status)
    c = MagicMock()
    c._get.side_effect = requests.HTTPError(response=resp)
    return c


def test_add_in_year_without_list_is_404_and_writes_nothing():
    c = _client(404)
    with patch.object(h, "ERPNextClient", return_value=c), pytest.raises(HTTPException) as err:
        h.add_holiday(h.HolidayCreate(holiday_date="2031-03-03", description="X"))
    assert err.value.status_code == 404
    assert "Vietnam 2031" in err.value.detail and "2031" in err.value.detail
    c._put.assert_not_called()


def test_other_erpnext_errors_still_propagate():
    c = _client(500)
    with patch.object(h, "ERPNextClient", return_value=c), pytest.raises(requests.HTTPError):
        h.add_holiday(h.HolidayCreate(holiday_date="2031-03-03", description="X"))


def test_delete_in_year_without_list_is_404():
    c = _client(404)
    with patch.object(h, "ERPNextClient", return_value=c), pytest.raises(HTTPException) as err:
        h.delete_holiday("2031-03-03")
    assert err.value.status_code == 404
