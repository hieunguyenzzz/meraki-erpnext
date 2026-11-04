from unittest.mock import MagicMock, patch

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


def test_days_left_after_uses_the_shared_pool_balance_for_pending_requests_only():
    pool = MagicMock()
    leaves = {
        "L1": {"employee": "E1", "leave_type": "Annual Leave", "from_date": "2026-12-21", "status": "Open"},
        "L2": {"employee": "E1", "leave_type": "Annual Leave", "from_date": "2026-12-21", "status": "Approved"},
        "L3": {"employee": "E1", "leave_type": "Unpaid", "from_date": "2026-12-21", "status": "Open"},
    }
    with patch.object(n, "_employee_pools", return_value={"Annual Leave": [pool]}) as pools, \
         patch.object(n, "available_on", return_value=6.5) as avail:
        out = n._days_left_after(MagicMock(), leaves)

    assert out == {"L1": 6.5, "L2": None, "L3": None}
    assert avail.call_args.args[0] == [pool]
    assert pools.call_count == 2  # one per (employee, leave type); the Approved one is skipped


def test_endpoint_only_looks_up_the_callers_own_notifications():
    client = MagicMock()
    client._get.return_value = {"data": []}
    with patch.object(n, "ERPNextClient", return_value=client), \
         patch.object(n, "get_current_user", return_value="me@example.com"):
        n.notification_details(DetailsRequest(names=[1, "2"]), MagicMock())

    first = client._get.call_args_list[0]
    assert first.args[0] == "/api/resource/PWA Notification"
    assert ["to_user", "=", "me@example.com"] in __import__("json").loads(first.kwargs["params"]["filters"])
