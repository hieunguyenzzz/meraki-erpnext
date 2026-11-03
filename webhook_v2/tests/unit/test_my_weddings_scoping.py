"""Scoping rules for staff access to weddings (MWP-97)."""

from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from webhook_v2.routers import my_weddings as mw

PROJECT = {"name": "PROJ-1", "project_name": "A & B", "status": "Open",
           "custom_lead_planner": "HR-EMP-1", "custom_assistant_2": "HR-EMP-2"}


def _client():
    client = MagicMock()
    client._get.return_value = {"data": PROJECT}
    return client


def _check(employee, privileged):
    request = MagicMock()
    with patch.object(mw, "has_roles", return_value=privileged), \
         patch.object(mw, "ERPNextClient", return_value=_client()), \
         patch.object(mw, "get_current_user", return_value="u@example.com"):
        mw.require_assigned_unless_privileged(request, "PROJ-1", employee=employee)


def test_role_on_project():
    assert mw.role_on_project(PROJECT, "HR-EMP-1") == "lead"
    assert mw.role_on_project(PROJECT, "HR-EMP-2") == "assistant"
    assert mw.role_on_project(PROJECT, "HR-EMP-9") is None


def test_assigned_staff_allowed():
    _check("HR-EMP-2", privileged=False)


def test_unassigned_staff_forbidden():
    with pytest.raises(HTTPException) as exc:
        _check("HR-EMP-9", privileged=False)
    assert exc.value.status_code == 403


def test_finance_or_planner_unaffected_even_if_unassigned():
    _check("HR-EMP-9", privileged=True)


def test_detail_forbidden_when_not_assigned():
    request = MagicMock()
    with patch.object(mw, "ERPNextClient", return_value=_client()), \
         patch.object(mw, "get_current_user", return_value="u@example.com"), \
         patch.object(mw, "resolve_employee", return_value="HR-EMP-9"):
        with pytest.raises(HTTPException) as exc:
            mw.my_wedding_detail("PROJ-1", request)
    assert exc.value.status_code == 403
