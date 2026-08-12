"""Unit tests for shared leave balance arithmetic (MWP-56)."""

from datetime import date

from webhook_v2.services.leave_balance import (
    Pool,
    available_on,
    build_pools,
    compute_accrued,
)

CARRY = {"name": "CARRY", "leave_type": "Annual Leave",
         "from_date": "2026-01-01", "to_date": "2026-07-31"}
ANNUAL = {"name": "ANNUAL", "leave_type": "Annual Leave",
          "from_date": "2026-01-01", "to_date": "2027-07-31"}


def carry(days):
    return {**CARRY, "new_leaves_allocated": days}


def annual(days):
    return {**ANNUAL, "new_leaves_allocated": days}


def app(name, from_date, days, status="Approved", docstatus=1):
    return {"name": name, "leave_type": "Annual Leave", "from_date": from_date,
            "total_leave_days": days, "status": status, "docstatus": docstatus}


class TestAttributionIsStableAcrossExpiry:
    """The MWP-56 regression: an expiring pool must not re-attribute its leave."""

    def test_carry_over_leave_stays_charged_after_the_pool_expires(self):
        # Yến: 16 carry-over days, all used Apr-Jul; 19-day annual pool (12 accrued).
        apps = [app("A1", "2026-04-09", 0.5), app("A2", "2026-04-13", 1.0),
                app("A3", "2026-04-23", 2.0), app("A4", "2026-05-18", 5.0),
                app("A5", "2026-06-04", 2.0), app("A6", "2026-07-23", 2.0),
                app("A7", "2026-07-27", 0.5), app("A8", "2026-07-28", 1.0),
                app("A9", "2026-07-30", 2.0)]
        pools = build_pools([carry(16), annual(19)], apps,
                            today=date(2026, 8, 12),
                            date_of_joining=date(2023, 11, 27))["Annual Leave"]

        by_name = {p.name: p for p in pools}
        assert by_name["CARRY"].taken == 16.0
        assert by_name["ANNUAL"].taken == 0.0
        # Was returning 0.0 before the fix — the 16 days were charged twice.
        assert available_on(pools, date(2026, 8, 24)) == 12.0

    def test_same_answer_either_side_of_the_expiry_date(self):
        apps = [app("A1", "2026-03-02", 16.0)]
        pools = build_pools([carry(16), annual(19)], apps,
                            today=date(2026, 8, 12),
                            date_of_joining=date(2023, 11, 27))["Annual Leave"]
        # July asks while both pools are live; August asks after one expired.
        # The annual pool's balance must not differ.
        assert available_on(pools, date(2026, 7, 20)) == 12.0
        assert available_on(pools, date(2026, 8, 24)) == 12.0

    def test_expired_pool_forfeits_its_own_unused_days(self):
        # 16-day carry-over, only 4 used: the other 12 lapse on 31 Jul.
        pools = build_pools([carry(16), annual(19)], [app("A1", "2026-03-02", 4.0)],
                            today=date(2026, 8, 12),
                            date_of_joining=date(2023, 11, 27))["Annual Leave"]
        assert available_on(pools, date(2026, 7, 20)) == 24.0  # 12 carry + 12 annual
        assert available_on(pools, date(2026, 8, 24)) == 12.0  # carry-over gone


class TestOverflowSpill:
    """Leave beyond the carry-over pool spills to the annual pool, once."""

    def test_overflow_spills_to_the_next_pool(self):
        # Nguyên: 9 carry-over days, 10 taken -> 1 day spills onto the annual pool.
        pools = build_pools([carry(9), annual(14)], [app("A1", "2026-02-02", 10.0)],
                            today=date(2026, 8, 12),
                            date_of_joining=date(2025, 4, 1))["Annual Leave"]
        by_name = {p.name: p for p in pools}
        assert by_name["CARRY"].taken == 9.0
        assert by_name["ANNUAL"].taken == 1.0
        assert available_on(pools, date(2026, 8, 24)) == 8.0  # 9 accrued - 1

    def test_overflow_beyond_every_pool_lands_on_the_last(self):
        pools = build_pools([carry(2), annual(3)], [app("A1", "2026-02-02", 99.0)],
                            today=date(2026, 8, 12))["Annual Leave"]
        by_name = {p.name: p for p in pools}
        assert by_name["CARRY"].taken == 2.0
        assert by_name["ANNUAL"].taken == 97.0
        assert available_on(pools, date(2026, 8, 24)) == 0.0

    def test_earliest_expiry_is_spent_first(self):
        pools = build_pools([carry(5), annual(12)], [app("A1", "2026-02-02", 3.0)],
                            today=date(2026, 8, 12))["Annual Leave"]
        by_name = {p.name: p for p in pools}
        assert by_name["CARRY"].taken == 3.0
        assert by_name["ANNUAL"].taken == 0.0


class TestPendingDays:
    """Unapproved requests are reserved, so they can't be spent twice."""

    def test_pending_reduces_availability(self):
        apps = [app("A1", "2026-09-01", 2.0, status="Open", docstatus=0)]
        pools = build_pools([annual(12)], apps, today=date(2026, 8, 12))["Annual Leave"]
        assert pools[0].pending == 2.0
        assert pools[0].taken == 0.0
        assert available_on(pools, date(2026, 8, 24)) == 5.0  # 7 accrued - 2 pending

    def test_rejected_and_cancelled_are_ignored(self):
        apps = [app("A1", "2026-09-01", 2.0, status="Rejected", docstatus=1),
                app("A2", "2026-09-05", 3.0, status="Approved", docstatus=2)]
        pools = build_pools([annual(12)], apps, today=date(2026, 8, 12))["Annual Leave"]
        assert pools[0].consumed == 0.0


class TestPoolMechanics:
    def test_short_pools_do_not_accrue(self):
        pools = build_pools([carry(16)], [], today=date(2026, 3, 1))["Annual Leave"]
        assert pools[0].is_accruing is False
        assert pools[0].usable == 16.0

    def test_long_pools_accrue_and_clamp_to_joining_date(self):
        # Joined 2026-03-02, evaluated 2026-08-01: 5 completed months of a 14-day pool.
        pools = build_pools([annual(14)], [], today=date(2026, 8, 1),
                            date_of_joining=date(2026, 3, 2))["Annual Leave"]
        assert pools[0].is_accruing is True
        assert pools[0].usable == 6.0

    def test_leaver_stops_accruing(self):
        pools = build_pools([annual(19)], [], today=date(2026, 8, 12),
                            relieving_date=date(2026, 4, 30))["Annual Leave"]
        assert pools[0].usable == 5.0

    def test_leave_types_are_kept_separate(self):
        allocs = [annual(12), {"name": "SICK", "leave_type": "Sick Leave",
                               "from_date": "2026-01-01", "to_date": "2027-07-31",
                               "new_leaves_allocated": 365}]
        apps = [{**app("A1", "2026-02-02", 3.0), "leave_type": "Sick Leave"}]
        pools = build_pools(allocs, apps, today=date(2026, 8, 12))
        assert pools["Annual Leave"][0].taken == 0.0
        assert pools["Sick Leave"][0].taken == 3.0

    def test_application_outside_every_pool_is_not_charged(self):
        pools = build_pools([annual(12)], [app("A1", "2024-02-02", 3.0)],
                            today=date(2026, 8, 12))["Annual Leave"]
        assert pools[0].consumed == 0.0

    def test_no_allocations_means_no_days(self):
        assert build_pools([], [app("A1", "2026-02-02", 3.0)],
                           today=date(2026, 8, 12)) == {}
        assert available_on([], date(2026, 8, 24)) == 0.0


class TestComputeAccrued:
    """Guards the MWP-57 clamp that this module inherited."""

    def test_accrues_monthly_within_the_entitlement_year(self):
        assert compute_accrued(19, date(2026, 1, 1), date(2026, 8, 1), None, 2026) == 12

    def test_freezes_at_the_end_of_the_entitlement_year(self):
        for at in [date(2027, 1, 1), date(2027, 3, 1), date(2027, 7, 1)]:
            assert compute_accrued(14, date(2026, 3, 2), at, None, 2026) == 12
