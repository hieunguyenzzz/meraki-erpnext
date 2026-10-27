from webhook_v2.routers.payroll import COMMISSION_COMPONENTS, _has_nonzero, _strip_employer_lines


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
    _strip_employer_lines(slip)
    assert [e["salary_component"] for e in slip["earnings"]] == ["Basic Salary", "Support Planner Commission"]
    assert [d["salary_component"] for d in slip["deductions"]] == ["BHXH (Employee)"]
    assert "employer_bhxh" not in slip
    assert slip["gross_pay"] == sum(e["amount"] for e in slip["earnings"])
    assert slip["gross_pay"] - sum(d["amount"] for d in slip["deductions"]) == slip["net_pay"]


def test_has_nonzero_commission():
    slip = _slip()
    assert _has_nonzero([slip], COMMISSION_COMPONENTS)
    assert not _has_nonzero([slip], ["Wedding Allowance"])


def test_negative_taxable_income_clamped_to_zero():
    slip = _slip()
    slip["taxable_income"] = -15_500_000
    _strip_employer_lines(slip)
    assert slip["taxable_income"] == 0


def test_positive_taxable_income_unchanged():
    slip = _slip()
    slip["taxable_income"] = 4_200_000
    _strip_employer_lines(slip)
    assert slip["taxable_income"] == 4_200_000
