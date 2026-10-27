from webhook_v2.routers.payroll import COMMISSION_COMPONENTS, _has_nonzero, _strip_employer_lines

EARN = [("Basic Salary", 10_000_000), ("BHXH Employer Expense", 1_750_000), ("Support Planner Commission", 2_000_000)]
DED = [("BHXH (Employee)", 1_050_000), ("BHXH Employer Payable", 1_750_000)]


def _lines(rows, flagged):
    return [
        {"salary_component": n, "amount": a, "do_not_include_in_total": int(flagged and "Employer" in n)}
        for n, a in rows
    ]


def _run(flagged):
    gross = 12_000_000 if flagged else 13_750_000
    total_ded = 1_050_000 if flagged else 2_800_000
    slip = {
        "gross_pay": gross, "total_deduction": total_ded, "net_pay": gross - total_ded,
        "earnings": [{"salary_component": n, "amount": a} for n, a in EARN],
        "deductions": [{"salary_component": n, "amount": a} for n, a in DED],
    }
    net = slip["net_pay"]
    _strip_employer_lines(slip, {"earnings": _lines(EARN, flagged), "deductions": _lines(DED, flagged)})
    return slip, net


def test_flagged_employer_lines_removed_totals_unchanged():
    slip, net = _run(flagged=True)
    assert [e["salary_component"] for e in slip["earnings"]] == ["Basic Salary", "Support Planner Commission"]
    assert [d["salary_component"] for d in slip["deductions"]] == ["BHXH (Employee)"]
    assert slip["gross_pay"] == sum(e["amount"] for e in slip["earnings"])
    assert slip["gross_pay"] - sum(d["amount"] for d in slip["deductions"]) == slip["net_pay"] == net


def test_counted_employer_lines_are_subtracted_from_totals():
    slip, net = _run(flagged=False)
    assert slip["gross_pay"] == 12_000_000
    assert slip["total_deduction"] == 1_050_000
    assert slip["net_pay"] == net


def test_has_nonzero_commission():
    slip, _ = _run(flagged=True)
    assert _has_nonzero([slip], COMMISSION_COMPONENTS)
    assert not _has_nonzero([slip], ["Wedding Allowance"])
