"""Home "My tasks": which tasks count as the caller's, and the order they come back in (MWP-98)."""

from datetime import date

from webhook_v2.routers import home


def test_is_mine_matches_assignee_owner_and_shared_exactly():
    me, emp = "a@x.com", "HR-EMP-00001"
    assert home._is_mine({"_assign": '["a@x.com"]'}, me, emp)
    assert home._is_mine({"owner": "a@x.com"}, me, emp)
    assert home._is_mine({"custom_shared_with": "HR-EMP-00009, HR-EMP-00001"}, me, emp)
    # The SQL `like` pre-filter also matches these; the exact check must reject them.
    assert not home._is_mine({"_assign": '["aa@x.com"]'}, me, emp)
    assert not home._is_mine({"custom_shared_with": "HR-EMP-000010"}, me, emp)
    assert not home._is_mine({"_assign": "not json"}, me, emp)


class FakeClient:
    def __init__(self, tasks):
        self.tasks = tasks

    def _get(self, endpoint, params=None):
        if endpoint == "/api/resource/Task":
            return {"data": self.tasks}
        return {"data": [{"name": "P1", "project_name": "Lan & Minh"}]}


def test_open_tasks_sorted_soonest_first_undated_last_and_capped():
    base = {"owner": "a@x.com", "project": "P1"}
    tasks = [{**base, "name": f"T{i}", "subject": f"s{i}", "exp_end_date": d} for i, d in
             enumerate([None, "2026-11-09", "2026-11-01", "2026-11-05", "2026-11-07", "2026-11-03", "2026-11-02"])]
    out = home._my_open_tasks(FakeClient(tasks), "a@x.com", None, date(2026, 11, 4))
    assert out["open_count"] == 7
    assert [t["exp_end_date"] for t in out["items"]] == ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-05", "2026-11-07"]
    assert out["items"][0]["due_in_days"] == -3
    assert out["items"][0]["project_name"] == "Lan & Minh"


# --- set_task_done: ownership and status rules ---------------------------------------------

import pytest
from fastapi import HTTPException
from unittest.mock import MagicMock

TODAY = date(2026, 11, 4)


class TaskClient:
    """Returns `rows` whatever the filters say (like a loose pre-filter), records every _put."""

    def __init__(self, rows, put_error=None):
        self.rows, self.puts, self.put_error = rows, [], put_error

    def _get(self, endpoint, params=None):
        return {"data": self.rows}

    def _put(self, endpoint, data):
        if self.put_error:
            raise self.put_error
        self.puts.append((endpoint, data))
        return {}


def _call(monkeypatch, client, done, rows_owner="a@x.com"):
    monkeypatch.setattr(home, "ERPNextClient", lambda: client)
    monkeypatch.setattr(home, "get_current_user", lambda r: "a@x.com")
    monkeypatch.setattr(home, "resolve_employee", lambda r, e: "HR-EMP-00001")
    monkeypatch.setattr(home, "bind_correlation_id", lambda *a, **k: None)
    monkeypatch.setattr(home, "local_today", lambda: TODAY)
    return home.set_task_done("T1", home.TaskDoneRequest(done=done), MagicMock(), MagicMock())


def _row(status, due=None, owner="a@x.com"):
    return {"name": "T1", "status": status, "owner": owner, "exp_end_date": due}


def test_task_not_found_is_403_and_never_written(monkeypatch):
    client = TaskClient([])
    with pytest.raises(HTTPException) as e:
        _call(monkeypatch, client, True)
    assert e.value.status_code == 403 and client.puts == []


def test_someone_elses_task_is_403_even_if_the_sql_prefilter_returned_it(monkeypatch):
    client = TaskClient([_row("Open", owner="b@x.com")])
    with pytest.raises(HTTPException) as e:
        _call(monkeypatch, client, True)
    assert e.value.status_code == 403 and client.puts == []


@pytest.mark.parametrize("status,done", [("Cancelled", True), ("Cancelled", False), ("Completed", True), ("Open", False), ("Working", False)])
def test_disallowed_transitions_are_400_and_never_written(monkeypatch, status, done):
    client = TaskClient([_row(status)])
    with pytest.raises(HTTPException) as e:
        _call(monkeypatch, client, done)
    assert e.value.status_code == 400 and client.puts == []


@pytest.mark.parametrize("status", ["Open", "Working", "Pending Review", "Overdue"])
def test_ticking_open_work_completes_it(monkeypatch, status):
    client = TaskClient([_row(status)])
    assert _call(monkeypatch, client, True)["status"] == "Completed"
    assert client.puts[0][1] == {"status": "Completed"}


def test_unticking_restores_overdue_when_past_due_else_open(monkeypatch):
    assert _call(monkeypatch, TaskClient([_row("Completed", "2026-11-03")]), False)["status"] == "Overdue"
    assert _call(monkeypatch, TaskClient([_row("Completed", "2026-11-04")]), False)["status"] == "Open"
    assert _call(monkeypatch, TaskClient([_row("Completed", None)]), False)["status"] == "Open"


def test_update_failure_returns_fixed_message_without_the_raw_error(monkeypatch):
    client = TaskClient([_row("Open")], put_error=RuntimeError("http://backend:8000/api/resource/Task boom"))
    with pytest.raises(HTTPException) as e:
        _call(monkeypatch, client, True)
    assert e.value.status_code == 400 and "backend" not in e.value.detail


# --- planner_home: each role-null case -------------------------------------------------------

def _home(monkeypatch, roles, employee="HR-EMP-00001"):
    monkeypatch.setattr(home, "ERPNextClient", lambda: MagicMock())
    monkeypatch.setattr(home, "get_current_user", lambda r: "a@x.com")
    monkeypatch.setattr(home, "bind_correlation_id", lambda *a, **k: None)
    monkeypatch.setattr(home, "local_today", lambda: TODAY)
    monkeypatch.setattr(home, "has_roles", lambda r, group: bool(set(group) & roles))

    def resolve(r, e):
        if employee is None:
            raise HTTPException(status_code=403)
        return employee

    monkeypatch.setattr(home, "resolve_employee", resolve)
    monkeypatch.setattr(home, "_weddings_section", lambda c, e, t: ({"id": "P1"}, [{"id": "P2"}]))
    monkeypatch.setattr(home, "_leave_rows", lambda r, e, t: ([{"leave_type": "Annual Leave"}], False))
    monkeypatch.setattr(home, "_count", lambda c, d, f: 7)
    monkeypatch.setattr(home, "_latest_payslip", lambda c, e: {"name": "S1"})
    monkeypatch.setattr(home, "_my_open_tasks", lambda c, u, e, t: {"open_count": 0, "items": []})
    return home.planner_home(MagicMock(), MagicMock())


def test_home_full_access_has_every_section(monkeypatch):
    out = _home(monkeypatch, {"System Manager"})
    assert out["has_weddings"] and out["next_wedding"] and out["upcoming"] and out["leave"]
    assert out["open_leads"] == 7 and out["active_staff"] == 7 and out["latest_payslip"]


def test_home_without_employee_has_no_weddings_leave_or_payslip(monkeypatch):
    out = _home(monkeypatch, {"System Manager"}, employee=None)
    assert not out["has_weddings"] and out["next_wedding"] is None and out["upcoming"] == []
    assert out["leave"] is None and out["latest_payslip"] is None
    assert out["open_leads"] == 7  # roles still apply


def test_home_without_planner_role_has_no_weddings_or_leave(monkeypatch):
    out = _home(monkeypatch, {"HR User"})
    assert not out["has_weddings"] and out["next_wedding"] is None and out["leave"] is None
    assert out["latest_payslip"]  # a payslip only needs an Employee record


def test_home_without_crm_role_has_no_lead_count(monkeypatch):
    assert _home(monkeypatch, {"Projects User"})["open_leads"] is None


def test_home_without_hr_role_has_no_staff_count(monkeypatch):
    assert _home(monkeypatch, {"Sales User"})["active_staff"] is None
