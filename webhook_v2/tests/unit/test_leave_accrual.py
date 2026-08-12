"""Unit tests for Annual Leave accrual (MWP-57).

An allocation's `to_date` is an expiry deadline, not an earning window: year N's
entitlement is earned over calendar year N and stays usable until 31 Jul N+1.
Accrual must therefore stop at the end of the entitlement year.
"""

from datetime import date

from webhook_v2.services.leave_balance import compute_accrued as _compute_accrued


class TestAccrualWithinEntitlementYear:
    """Behaviour during the entitlement year itself — must not change."""

    def test_full_year_employee_accrues_monthly(self):
        # Yến: joined 2023, 19-day allocation, evaluated 2026-08-01.
        # 7 completed months → ceil(19 * 7/12) = 12
        assert _compute_accrued(19, date(2026, 1, 1), date(2026, 8, 1), None, 2026) == 12

    def test_mid_year_joiner_accrues_from_joining_date(self):
        # Minh: joined 2026-03-02, 14-day allocation, evaluated 2026-08-01.
        # 5 completed months → ceil(14 * 5/12) = 6
        assert _compute_accrued(14, date(2026, 3, 2), date(2026, 8, 1), None, 2026) == 6

    def test_no_accrual_before_period_starts(self):
        assert _compute_accrued(14, date(2026, 3, 2), date(2026, 2, 1), None, 2026) == 0

    def test_relieving_date_stops_accrual(self):
        # Leaver stops earning on their last working day: 3 completed months
        # to 2026-04-30 → ceil(19 * 3/12) = 5, not the 12 they'd reach by August.
        assert _compute_accrued(
            19, date(2026, 1, 1), date(2026, 8, 1), date(2026, 4, 30), 2026
        ) == 5


class TestAccrualStopsAtEntitlementYearEnd:
    """The clamp added by MWP-57 — accrual freezes on 31 Dec of the entitlement year."""

    def test_full_year_employee_reaches_full_allocation_and_holds(self):
        # 12 completed months by 2027-01-01 → full 19, flat thereafter.
        for at in [date(2027, 1, 1), date(2027, 3, 1), date(2027, 7, 1)]:
            assert _compute_accrued(19, date(2026, 1, 1), at, None, 2026) == 19

    def test_mid_year_joiner_freezes_at_prorated_share(self):
        # Minh worked Mar–Dec 2026 = 10 months → ceil(14 * 10/12) = 12.
        # Without the clamp he would keep earning to the full 14 by Mar 2027.
        for at in [date(2027, 1, 1), date(2027, 3, 1), date(2027, 7, 1)]:
            assert _compute_accrued(14, date(2026, 3, 2), at, None, 2026) == 12

    def test_late_joiner_freezes_at_prorated_share(self):
        # Tú Anh: joined 2026-03-26, 12-day allocation → ceil(12 * 10/12) = 10.
        for at in [date(2027, 1, 1), date(2027, 3, 1), date(2027, 7, 1)]:
            assert _compute_accrued(12, date(2026, 3, 26), at, None, 2026) == 10

    def test_clamp_lands_on_jan_1_not_dec_31(self):
        # `elapsed` counts completed months, so 2026-12-31 reads as 11 months.
        # Clamping there would under-award a full-year employee (18, not 19).
        assert _compute_accrued(19, date(2026, 1, 1), date(2026, 12, 1), None, 2026) == 18
        assert _compute_accrued(19, date(2026, 1, 1), date(2027, 1, 1), None, 2026) == 19

    def test_omitting_entitlement_year_keeps_legacy_behaviour(self):
        # Back-compat: callers that don't pass the year are unclamped.
        assert _compute_accrued(14, date(2026, 3, 2), date(2027, 3, 1), None, None) == 14
