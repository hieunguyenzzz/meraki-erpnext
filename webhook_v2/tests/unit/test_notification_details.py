from datetime import date
from unittest.mock import MagicMock, patch

import pytest

from webhook_v2.routers import notifications as n
from webhook_v2.routers.notifications import DetailsRequest, build_details


def _n(i, kind, ref, msg="x for approval: y"):
    return {"name": i, "reference_document_type": kind, "reference_document_name": ref, "message": msg}


def test_build_details_builds_titles_facts_and_state():
    notifs = [
        _n(1, "Leave Application", "L1"),
        _n(2, "Attendance Request", "A1"),
        _n(3, "Purchase Invoice", "P1", "New expense pending approval: x"),
        _n("4", "Purchase Invoice", "P2", "New expense pending approval: x"),
        _n("5", "Lead", "X"),
        _n(6, "Leave Application", "L1", "Your leave L1 was Approved"),
        _n(7, "Purchase Invoice", "GONE", "New expense pending approval: x"),
    ]
    leaves = {"L1": {"employee_name": "Thu", "leave_type": "Annual Leave", "from_date": "2026-12-21",
                     "to_date": "2026-12-22", "total_leave_days": 1.5, "half_day": 1, "status": "Open"}}
    wfh = {"A1": {"employee_name": "An", "from_date": "2026-12-22", "to_date": "2026-12-24", "half_day": 0,
                  "explanation": " Waiting for a contractor ", "docstatus": 1, "custom_status": "Rejected"}}
    invoices = {"P1": {"custom_expense_staff": "E1", "grand_total": 3400000, "project": "PROJ-1", "docstatus": 0},
                "P2": {"custom_expense_staff": None, "owner": "o@x.com", "grand_total": 10, "docstatus": 1}}
    out = build_details(notifs, leaves, wfh, invoices, {"E1": {"employee_name": "Bao"}},
                        {"PROJ-1": {"project_name": "Lan & Minh"}}, {"P1"}, {"L1": 6.5}, {"o@x.com": "Owner Name"})

    assert out["1"]["state"] == "pending" and out["1"]["days_left_after"] == 6.5
    assert out["1"]["title"] == [{"text": "Thu", "bold": True}, {"text": " asked for leave", "bold": False}]
    assert out["1"]["compact"][1]["text"] == " · annual leave, 2026-12-21 → 2026-12-22 (half day)"
    assert out["2"]["state"] == "rejected" and out["2"]["days"] == 3 and out["2"]["reason"] == "Waiting for a contractor"
    assert out["2"]["title"][1]["text"] == " wants to work from home"
    assert out["2"]["compact"][1]["text"] == " · WFH on 2026-12-22 → 2026-12-24"
    assert out["3"]["submitter"] == "Bao" and out["3"]["has_bill"] is True and out["3"]["state"] == "pending"
    assert out["3"]["compact"][1]["text"] == " added VND 3.400.000 to Lan & Minh"
    assert out["3"]["title"][1]["text"] == " submitted an expense"
    # no custom_expense_staff -> falls back to the invoice owner's name
    assert out["4"]["submitter"] == "Owner Name" and out["4"]["state"] == "approved"
    assert out["7"] == {"kind": "expense", "state": "removed"}
    assert set(out) == {"1", "2", "3", "4", "7"}  # lead and outcome notice are left alone


class FakeErp:
    """Answers the three pool lookups from fixed rows, so the real build_pools does the arithmetic."""

    def __init__(self, allocs, apps, employees=None):
        self.rows = {"Leave Allocation": allocs, "Leave Application": apps,
                     "Employee": employees or [{"name": "E1", "date_of_joining": "2020-01-01"}]}
        self.calls = []

    def _get(self, path, params=None):
        doctype = path.rsplit("/", 1)[-1]
        self.calls.append(doctype)
        return {"data": self.rows[doctype]}


ANNUAL = {"name": "A1", "employee": "E1", "leave_type": "Annual Leave", "from_date": "2026-01-01",
          "to_date": "2027-07-31", "new_leaves_allocated": 12, "total_leaves_allocated": 12}


def _open_leave(name, days, start="2026-12-30"):
    return {"name": name, "employee": "E1", "leave_type": "Annual Leave", "from_date": start,
            "to_date": start, "total_leave_days": days, "status": "Open", "docstatus": 0}


def _days_left(apps, leaves):
    client = FakeErp([ANNUAL], apps)
    # 2026-11-04: ten months into the 12-day annual pool -> ceil(12 * 10 / 12) = 10 usable
    return n._days_left_after(client, leaves, today=date(2026, 11, 4)), client


def test_days_left_after_charges_the_open_request_once_using_real_pools():
    leave = _open_leave("L1", 0.5)
    out, client = _days_left([leave], {"L1": {**leave, "status": "Open"}})
    assert out == {"L1": 9.5}  # 10 accrued - 0.5 pending; a double count would give 9.0
    assert client.calls == ["Employee", "Leave Allocation", "Leave Application"]  # one set of requests


def test_days_left_after_counts_other_leave_but_only_for_open_requests():
    taken = {**_open_leave("T1", 3, "2026-03-02"), "status": "Approved", "docstatus": 1}
    cancelled = {**_open_leave("C1", 5, "2026-04-01"), "docstatus": 2}
    mine = _open_leave("L1", 2)
    done = {**_open_leave("L2", 1, "2026-12-01"), "status": "Approved", "docstatus": 1}
    out, _ = _days_left([taken, cancelled, mine, done], {"L1": mine, "L2": done})
    assert out == {"L1": 10 - 3 - 2 - 1, "L2": None}


def test_days_left_after_goes_negative_when_a_request_overdraws_or_uses_unaccrued_days():
    big = _open_leave("L1", 11.5)
    out, _ = _days_left([big], {"L1": big})
    assert out == {"L1": -1.5}  # 10 accrued but 11.5 requested


def test_days_left_after_batches_employees_and_skips_types_without_allocation():
    sick = {**_open_leave("L2", 1), "leave_type": "Unpaid"}
    out, client = _days_left([_open_leave("L1", 1), sick], {"L1": _open_leave("L1", 1), "L2": sick})
    assert out == {"L1": 9.0, "L2": None}
    assert client.calls.count("Leave Allocation") == 1


@pytest.mark.parametrize("row,expected", [
    ({"docstatus": 0}, "pending"),
    ({"docstatus": 0, "custom_rejected": 1}, "rejected"),
    ({"docstatus": 1}, "approved"),
    ({"docstatus": 2}, "cancelled"),
    (None, "removed"),
])
def test_expense_state(row, expected):
    assert n._expense_state(row) == expected


@pytest.mark.parametrize("row,expected", [
    ({"docstatus": 0}, "pending"),
    ({"docstatus": 1, "custom_status": "Approved"}, "approved"),
    ({"docstatus": 1, "custom_status": "Rejected"}, "rejected"),
    ({"docstatus": 2}, "cancelled"),
    (None, "removed"),
])
def test_wfh_state(row, expected):
    assert n._wfh_state(row) == expected


def test_wfh_half_day_counts_as_half_a_day():
    assert n._wfh_days({"from_date": "2026-12-22", "to_date": "2026-12-22", "half_day": 1}) == 0.5
    assert n._wfh_days({"from_date": "2026-12-22", "to_date": "2026-12-23", "half_day": 0}) == 2


def test_owner_names_prefers_the_employee_name_then_the_user_full_name():
    client = MagicMock()
    client._get.side_effect = [
        {"data": [{"user_id": "a@x.com", "employee_name": "Anh Employee"}]},
        {"data": [{"name": "b@x.com", "full_name": "Bee User"}]},
    ]
    assert n._owner_names(client, ["a@x.com", "b@x.com", "c@x.com"]) == {
        "a@x.com": "Anh Employee", "b@x.com": "Bee User"}
    assert n._owner_names(client, []) == {}


def test_endpoint_only_looks_up_the_callers_own_notifications():
    client = MagicMock()
    client._get.return_value = {"data": []}
    with patch.object(n, "ERPNextClient", return_value=client), \
         patch.object(n, "get_current_user", return_value="me@example.com"):
        n.notification_details(DetailsRequest(names=[1, "2"]), MagicMock())

    first = client._get.call_args_list[0]
    assert first.args[0] == "/api/resource/PWA Notification"
    assert ["to_user", "=", "me@example.com"] in __import__("json").loads(first.kwargs["params"]["filters"])
