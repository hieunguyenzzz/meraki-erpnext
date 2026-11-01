from datetime import date

from webhook_v2.routers.payroll import _calc_flat_pit, _effective_pit_method, _enrich_slip

SLIP_END = date(2026, 10, 31)


def _emp(prob, end=None, method=""):
    return {"custom_is_probation": prob, "custom_probation_end_date": end, "custom_pit_method": method}


def test_probation_without_end_date_is_flat():
    assert _effective_pit_method(_emp(1), SLIP_END) == "Flat 10%"


def test_probation_ending_on_or_after_slip_end_is_flat():
    assert _effective_pit_method(_emp(1, "2026-10-31"), SLIP_END) == "Flat 10%"
    assert _effective_pit_method(_emp(1, "2026-12-01"), SLIP_END) == "Flat 10%"


def test_probation_ended_before_or_mid_period_uses_own_method():
    assert _effective_pit_method(_emp(1, "2026-10-15"), SLIP_END) == ""
    assert _effective_pit_method(_emp(1, "2026-09-30", "Flat 10%"), SLIP_END) == "Flat 10%"


def test_non_probation_keeps_own_method():
    assert _effective_pit_method(_emp(0, method="Flat 10%"), SLIP_END) == "Flat 10%"
    assert _effective_pit_method(_emp(0), SLIP_END) == ""
    assert _effective_pit_method({}, SLIP_END) == ""


def test_flat_pit_below_minimum_gross_is_zero():
    assert _calc_flat_pit(1_999_999) == 0
    assert _calc_flat_pit(0) == 0


def test_flat_pit_is_ten_percent_of_gross():
    assert _calc_flat_pit(2_000_000) == 200_000
    assert _calc_flat_pit(12_345_678) == 1_234_568


def test_enrich_slip_reports_effective_method_and_flat_taxable_income():
    info = {"E1": {"display_name": "A", "dependents": 2, "is_probation": True, "emp": _emp(1, "2026-11-30")}}
    slip = {"employee": "E1", "end_date": "2026-10-31", "gross_pay": 10_000_000,
            "deductions": [{"salary_component": "BHXH (Employee)", "amount": 800_000}]}
    out = _enrich_slip(slip, info)
    assert out["pit_method"] == "Flat 10%"
    assert out["tax_reduction"] == 0
    assert out["taxable_income"] == 10_000_000
