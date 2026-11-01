import pymupdf

from webhook_v2.services.payroll_pdf import build_report, format_vnd, render_pdf


def _slip(name, gross, net, earnings, deductions, **extra):
    return {
        "employee": name, "employee_display_name": name, "gross_pay": gross, "net_pay": net,
        "docstatus": 1, "designation": "Planner", "payment_days": 22, "tax_reduction": 15_500_000,
        "taxable_income": 0, "pit_method": "", "is_probation": False,
        "earnings": [{"salary_component": n, "amount": a} for n, a in earnings],
        "deductions": [{"salary_component": n, "amount": a} for n, a in deductions],
        **extra,
    }


NORMAL = _slip(
    "An Nguyen", 30_000_000, 26_000_000,
    [("Basic Salary", 20_000_000), ("Lead Planner Commission", 6_000_000), ("Support Planner Commission", 1_000_000),
     ("Wedding Allowance", 2_000_000), ("Bonus", 1_000_000)],
    [("BHXH (Employee)", 1_600_000), ("BHYT (Employee)", 300_000), ("BHTN (Employee)", 200_000),
     ("BHXH Employer Payable", 3_500_000), ("BHYT Employer Payable", 600_000), ("BHTN Employer Payable", 200_000),
     ("Income Tax", 500_000)],
    taxable_income=11_900_000,
)
PROBATION_FLAT = _slip(
    "Binh Tran", 10_000_000, 9_000_000, [("Basic Salary", 10_000_000)], [("Income Tax", 1_000_000)],
    is_probation=True, pit_method="Flat 10%", tax_reduction=0, taxable_income=10_000_000, docstatus=0,
)
ZERO_INSURANCE = _slip("Chi Le", 5_000_000, 5_000_000, [("Basic Salary", 5_000_000)], [], taxable_income=-10_500_000)
ZERO_GROSS = _slip("Test Account", 0, 0, [], [])
CANCELLED = _slip("Old Slip", 9_000_000, 9_000_000, [("Basic Salary", 9_000_000)], [], docstatus=2)


def _report():
    return build_report([NORMAL, PROBATION_FLAT, ZERO_INSURANCE, ZERO_GROSS, CANCELLED], "2026-10")


def test_format_vnd_uses_dot_thousands():
    assert format_vnd(29_228_500) == "29.228.500"
    assert format_vnd(0) == "0"


def test_hidden_slips_and_header():
    r = _report()
    assert [row["name"] for row in r["rows"]][0] == "An Nguyen"
    assert len(r["rows"]) == 3
    assert r["subtitle"] == "Tháng 10/2026"
    assert r["is_draft"] is True


def test_normal_row_columns():
    row = _report()["rows"][0]
    assert (row["basic"], row["commission"], row["wedding"], row["bonus"]) == (20_000_000, 7_000_000, 2_000_000, 1_000_000)
    assert (row["bhxh"], row["bhyt"], row["bhtn"], row["pit"]) == (1_600_000, 300_000, 200_000, 500_000)
    assert row["total_deduction"] == 2_600_000
    assert row["taxable"] == 11_900_000


def test_probation_flat_markers_and_no_deduction():
    row = _report()["rows"][1]
    assert row["name"] == "Binh Tran (TNCN 10%)"
    assert row["designation"] == "Planner (Thử việc)"
    assert row["tax_reduction"] == 0 and row["total_deduction"] == 1_000_000


def test_zero_insurance_row_and_taxable_floor():
    row = _report()["rows"][2]
    assert row["bhxh"] == row["bhyt"] == row["bhtn"] == 0
    assert row["taxable"] == 0 and row["total_deduction"] == 0


def test_totals_and_si_split():
    r = _report()
    assert r["totals"]["gross"] == 45_000_000
    assert r["totals"]["net"] == 40_000_000
    assert r["totals"]["total_deduction"] == 3_600_000
    assert r["si_employee"] == {"BHXH": 1_600_000, "BHYT": 300_000, "BHTN": 200_000}
    assert r["si_employer"] == {"BHXH": 3_500_000, "BHYT": 600_000, "BHTN": 200_000}


def test_no_draft_flag_when_all_submitted():
    assert build_report([NORMAL], "2026-10")["is_draft"] is False


def test_render_pdf_is_landscape_a4_with_vietnamese_text():
    pdf = render_pdf(_report())
    doc = pymupdf.open(stream=pdf, filetype="pdf")
    page = doc[0]
    assert page.rect.width > page.rect.height
    text = page.get_text()
    for expected in ("BÁO CÁO TỔNG HỢP LƯƠNG", "BẢN NHÁP", "TỔNG CỘNG", "Tổng nộp BHXH (NLĐ + DN)", "45.000.000"):
        assert expected in text
