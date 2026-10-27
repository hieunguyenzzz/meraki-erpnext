from webhook_v2.routers.payroll import _to_staff_view


def _slip():
    earn = [("Basic Salary", 10_000_000), ("BHXH Employer Expense", 1_750_000), ("Support Planner Commission", 2_000_000)]
    ded = [("BHXH (Employee)", 1_050_000), ("BHXH Employer Payable", 1_750_000)]
    return {
        "gross_pay": 12_000_000, "total_deduction": 1_050_000, "net_pay": 10_950_000, "employer_bhxh": 1_750_000,
        "earnings": [{"salary_component": n, "amount": a} for n, a in earn],
        "deductions": [{"salary_component": n, "amount": a} for n, a in ded],
    }


def test_employer_lines_and_employer_bhxh_removed_totals_unchanged():
    slip = _slip()
    _to_staff_view(slip)
    assert [e["salary_component"] for e in slip["earnings"]] == ["Basic Salary", "Support Planner Commission"]
    assert [d["salary_component"] for d in slip["deductions"]] == ["Social Insurance (10.5%)", "Income Tax"]
    assert "employer_bhxh" not in slip
    assert slip["gross_pay"] == sum(e["amount"] for e in slip["earnings"])
    assert slip["gross_pay"] - sum(d["amount"] for d in slip["deductions"]) == slip["net_pay"]


def test_employee_insurance_lines_collapse_into_one_in_place():
    slip = _slip()
    slip["deductions"] = [{"salary_component": n, "amount": a} for n, a in [
        ("Advance", 100_000), ("BHXH (Employee)", 800_000), ("BHYT (Employee)", 150_000),
        ("BHXH Employer Payable", 1_750_000), ("BHTN (Employee)", 100_000), ("Income Tax", 50_000)]]
    slip["gross_pay"], slip["net_pay"] = 12_000_000, 12_000_000 - 1_200_000
    _to_staff_view(slip)
    assert slip["deductions"] == [
        {"salary_component": "Advance", "amount": 100_000},
        {"salary_component": "Social Insurance (10.5%)", "amount": 1_050_000},
        {"salary_component": "Income Tax", "amount": 50_000},
    ]
    assert slip["gross_pay"] - sum(d["amount"] for d in slip["deductions"]) == slip["net_pay"]


def test_income_tax_zero_line_appended_when_absent():
    slip = _slip()
    _to_staff_view(slip)
    assert slip["deductions"][-1] == {"salary_component": "Income Tax", "amount": 0}
    assert [d["salary_component"] for d in slip["deductions"]].count("Income Tax") == 1
    assert slip["gross_pay"] - sum(d["amount"] for d in slip["deductions"]) == slip["net_pay"]


def test_existing_income_tax_line_not_duplicated():
    slip = _slip()
    slip["deductions"].append({"salary_component": "Income Tax", "amount": 5})
    _to_staff_view(slip)
    assert [d for d in slip["deductions"] if d["salary_component"] == "Income Tax"] == [
        {"salary_component": "Income Tax", "amount": 5}]
