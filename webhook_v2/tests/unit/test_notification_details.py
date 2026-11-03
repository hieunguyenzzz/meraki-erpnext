from webhook_v2.routers.notifications import build_details


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
    assert out["2"]["days"] == 3 and out["2"]["half_day"] is False
    assert out["3"] == {"kind": "expense", "submitter": "Bao"}
    assert set(out) == {"1", "2", "3"}
