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
    wfh = {"A1": {"employee_name": "An", "from_date": "2026-12-22", "to_date": "2026-12-24", "half_day": 0}}
    invoices = {"P1": {"custom_expense_staff": "E1"}, "P2": {"custom_expense_staff": None}}
    out = build_details(notifs, leaves, wfh, invoices, {"E1": {"employee_name": "Bao"}})

    assert out["1"] == {"kind": "leave", "employee_name": "Thu", "leave_type": "Annual Leave",
                        "from_date": "2026-12-21", "to_date": "2026-12-22", "days": 1.5, "half_day": True}
    assert out["2"] == {"kind": "wfh", "employee_name": "An", "from_date": "2026-12-22",
                      "to_date": "2026-12-24", "half_day": False}
    assert out["3"] == {"kind": "expense", "submitter": "Bao"}
    assert set(out) == {"1", "2", "3"}


def test_endpoint_only_looks_up_the_callers_own_notifications():
    client = MagicMock()
    client._get.return_value = {"data": []}
    with patch.object(n, "ERPNextClient", return_value=client), \
         patch.object(n, "get_current_user", return_value="me@example.com"):
        n.notification_details(DetailsRequest(names=[1, "2"]), MagicMock())

    first = client._get.call_args_list[0]
    assert first.args[0] == "/api/resource/PWA Notification"
    assert ["to_user", "=", "me@example.com"] in __import__("json").loads(first.kwargs["params"]["filters"])
