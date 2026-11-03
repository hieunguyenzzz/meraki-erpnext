"""A missing employee is a 404 with a clear message, not a 500."""

from unittest.mock import MagicMock, patch

import pytest
import requests
from fastapi import HTTPException

from webhook_v2.routers.leaves import get_leave_employee_detail


def _http_error(status):
    resp = MagicMock()
    resp.status_code = status
    return requests.HTTPError(response=resp)


def test_missing_employee_returns_404():
    client = MagicMock()
    client._get.side_effect = _http_error(404)
    with patch("webhook_v2.routers.leaves.ERPNextClient", return_value=client):
        with pytest.raises(HTTPException) as exc:
            get_leave_employee_detail(employee="HR-EMP-00003")
    assert exc.value.status_code == 404
    assert "HR-EMP-00003" in exc.value.detail


def test_other_upstream_errors_are_not_masked():
    client = MagicMock()
    client._get.side_effect = _http_error(500)
    with patch("webhook_v2.routers.leaves.ERPNextClient", return_value=client):
        with pytest.raises(requests.HTTPError):
            get_leave_employee_detail(employee="HR-EMP-00001")
