from webhook_v2.services.payroll_bonus import drop_bonus_rows, has_submitted_slip


def test_drop_bonus_rows_keeps_other_earnings():
    earnings = [
        {"salary_component": "Basic Salary", "amount": 10},
        {"salary_component": "Bonus", "amount": 5, "additional_salary": "HR-ADS-1"},
        {"salary_component": "Wedding Allowance", "amount": 3},
    ]
    assert [e["salary_component"] for e in drop_bonus_rows(earnings)] == ["Basic Salary", "Wedding Allowance"]


def test_has_submitted_slip():
    assert has_submitted_slip([{"docstatus": 0}, {"docstatus": 1}])
    assert not has_submitted_slip([{"docstatus": 0}])
    assert not has_submitted_slip([])
