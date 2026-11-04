from unittest.mock import MagicMock, patch

from webhook_v2.routers import notifications as n
from webhook_v2.routers.notifications import DetailsRequest, build_details


def test_build_details_covers_leave_wfh_expense_and_skips_unknown():
    notifs = [
        {"name": 1, "reference_document_type": "Leave Application", "reference_document_name": "L1"},
        {"name": 2, "reference_document_type": "Attendance Request", "reference_document_name": "A1"},
        {"name": 3, "reference_document_type": "Purchase Invoice", "reference_document_name": "P1"},
        {"name": "4", "reference_document_type": "Purchase Invoice", "reference_document_name": "P2"},
        {"name": "5", "reference_document_type": "Lead", "reference_document_name": "X"},
    ]
    leaves = {"L1": {"employee_name": "Thu", "leave_type": "Annual Leave", "from_date": "2026-12-21",
                     "to_date": "2026-12-22", "total_leave_days": 1.5, "half_day": 1}}
    wfh = {"A1": {"employee_name": "An", "from_date": "2026-12-22", "to_date": "2026-12-24", "half_day": 0,
                  "explanation": " Waiting for a contractor "}}
    invoices = {"P1": {"custom_expense_staff": "E1", "grand_total": 3400000, "project": "PROJ-1"},
                "P2": {"custom_expense_staff": None, "grand_total": 10, "project": None}}
    out = build_details(notifs, leaves, wfh, invoices, {"E1": {"employee_name": "Bao"}},
                        {"PROJ-1": {"project_name": "Lan & Minh"}}, {"P1"}, {"L1": 6.5})

    assert out["1"] == {"kind": "leave", "employee_name": "Thu", "leave_type": "Annual Leave",
                        "from_date": "2026-12-21", "to_date": "2026-12-22", "days": 1.5, "half_day": True,
                        "days_left_after": 6.5}
    assert out["2"] == {"kind": "wfh", "employee_name": "An", "from_date": "2026-12-22",
                        "to_date": "2026-12-24", "half_day": False, "days": 3, "reason": "Waiting for a contractor"}
    assert out["3"] == {"kind": "expense", "submitter": "Bao", "amount": 3400000, "wedding": "Lan & Minh",
                        "has_bill": True}
    assert out["4"] == {"kind": "expense", "submitter": None, "amount": 10, "wedding": None, "has_bill": False}
    assert set(out) == {"1", "2", "3", "4"}


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
