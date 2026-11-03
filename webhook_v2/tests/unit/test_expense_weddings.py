"""Which weddings /expense/weddings offers each kind of caller (MWP-100)."""

from unittest.mock import MagicMock, patch

from webhook_v2.routers import expense_weddings as ew

EMP = "HR-EMP-1"
MINE = {"name": "P1", "project_name": "Mine", "status": "Open", "expected_end_date": "2026-12-01",
        "sales_order": "SO-1", "custom_lead_planner": EMP}
OTHER = {"name": "P2", "project_name": "Other", "status": "Open", "expected_end_date": "2026-12-02",
         "sales_order": None, "custom_lead_planner": "HR-EMP-9"}


def _call(roles: set[str], employee=EMP, assigned=(MINE,), listed=None):
    client = MagicMock()
    client._get.return_value = {"data": [MINE, OTHER]}
    request = MagicMock()
    request.headers = {}
    with patch.object(ew, "has_roles", side_effect=lambda r, wanted: bool(roles & set(wanted))), \
         patch.object(ew, "get_current_user", return_value="u@example.com"), \
         patch.object(ew, "_my_employee", return_value=employee), \
         patch.object(ew, "ERPNextClient", return_value=client), \
         patch.object(ew, "venue_names", return_value={"SO-1": "An Lâm"}), \
         patch.object(ew, "list_assigned_projects", return_value=list(assigned)) as listing:
        data = ew.expense_weddings(request, MagicMock())["data"]
    if listed is not None:
        listed.append(listing)
    return data


def test_finance_sees_all_open_with_assigned_flag_and_venue():
    data = _call({"Accounts Manager"})
    assert [w["id"] for w in data] == ["P1", "P2"]
    assert [w["assigned"] for w in data] == [True, False]
    assert data[0]["venue_name"] == "An Lâm" and data[0]["wedding_date"] == "2026-12-01"


def test_planner_sees_only_assigned_open():
    listed = []
    data = _call({"Projects User"}, listed=listed)
    assert [w["id"] for w in data] == ["P1"]
    assert data[0]["assigned"] is True
    assert listed[0].call_args.kwargs == {"recent_completed": False}


def test_hr_only_gets_open_assigned_not_recent_completed():
    listed = []
    data = _call({"HR User"}, listed=listed)
    assert [w["id"] for w in data] == ["P1"]
    assert listed[0].call_args.kwargs == {"recent_completed": False}


def test_planner_without_employee_sees_nothing():
    assert _call({"Projects User"}, employee=None) == []


def test_employee_only_includes_recent_completed():
    listed = []
    data = _call({"Employee"}, listed=listed)
    assert [w["id"] for w in data] == ["P1"]
    assert data[0]["assigned"] is True
    assert listed[0].call_args.kwargs == {}
