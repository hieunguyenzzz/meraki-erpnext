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


def test_missing_project_is_403_not_500():
    import requests

    client = MagicMock()
    err = requests.HTTPError(response=MagicMock(status_code=404))
    client._get.side_effect = err
    with patch.object(mw, "ERPNextClient", return_value=client), \
         patch.object(mw, "get_current_user", return_value="u@example.com"), \
         patch.object(mw, "resolve_employee", return_value="HR-EMP-1"):
        with pytest.raises(HTTPException) as exc:
            mw.my_wedding_detail("NOPE", MagicMock())
    assert exc.value.status_code == 403
    assert exc.value.detail == "You are not assigned to this wedding"


def _post_expense(employee):
    """Call the real POST /expense/wedding-with-receipt handler as an employee-only caller."""
    import asyncio
    from webhook_v2.routers import expenses as ex

    request = MagicMock()
    request.headers = {}
    with patch.object(ex, "resolve_employee", return_value=employee), \
         patch.object(mw, "has_roles", return_value=False), \
         patch.object(mw, "ERPNextClient", return_value=_client()), \
         patch.object(mw, "get_current_user", return_value="u@example.com"), \
         patch.object(ex, "_create_wedding_expense_core", return_value={"name": "PI-1", "status": "Pending"}) as core:
        result = asyncio.run(ex.create_wedding_expense_with_receipt(
            request, project="PROJ-1", date="2026-11-03", description="taxi", amount=1000.0,
            category="Di chuyển - MWP", supplier="Company Expense", staff="", note="", receipt=None,
        ))
    return result, core


def test_expense_endpoint_rejects_unassigned_employee():
    with pytest.raises(HTTPException) as exc:
        _post_expense("HR-EMP-9")
    assert exc.value.status_code == 403


def test_expense_endpoint_allows_assigned_employee():
    result, core = _post_expense("HR-EMP-2")
    assert result["name"] == "PI-1"
    core.assert_called_once()


def test_my_weddings_list_filter():
    from datetime import date, timedelta

    today = date.today()
    d = lambda n: (today + timedelta(days=n)).isoformat()
    rows = [
        {"name": "OPEN-FUTURE", "status": "Open", "expected_end_date": d(20), "custom_lead_planner": "HR-EMP-1"},
        {"name": "OPEN-OLD", "status": "Open", "expected_end_date": d(-90), "custom_assistant_3": "HR-EMP-1"},
        {"name": "DONE-RECENT", "status": "Completed", "expected_end_date": d(-10), "custom_support_planner": "HR-EMP-1"},
        {"name": "DONE-OLD", "status": "Completed", "expected_end_date": d(-45), "custom_lead_planner": "HR-EMP-1"},
        {"name": "OTHER", "status": "Open", "expected_end_date": d(5), "custom_lead_planner": "HR-EMP-9"},
        {"name": "CANCELLED", "status": "Cancelled", "expected_end_date": d(5), "custom_lead_planner": "HR-EMP-1"},
    ]

    def fake_get(url, params=None):
        import json
        if url != "/api/resource/Project":
            return {"data": []}
        or_f = json.loads(params["or_filters"])
        statuses = json.loads(params["filters"])[0][2]
        keep = [r for r in rows if r["status"] in statuses and any(r.get(f) == v for f, _, v in or_f)]
        return {"data": [{"project_name": r["name"], **r} for r in keep]}

    client = MagicMock()
    client._get.side_effect = fake_get
    request = MagicMock()
    request.headers = {}
    with patch.object(mw, "ERPNextClient", return_value=client), \
         patch.object(mw, "get_current_user", return_value="u@example.com"), \
         patch.object(mw, "resolve_employee", return_value="HR-EMP-1"):
        ids = [i["id"] for i in mw.my_weddings(request)["data"]]

    # Open always kept; Completed only within 30 days; unassigned and other statuses excluded.
    assert ids == ["OPEN-FUTURE", "DONE-RECENT", "OPEN-OLD"]
