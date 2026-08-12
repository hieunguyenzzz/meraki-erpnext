"""Shared leave balance arithmetic — one implementation for every surface.

Two questions must not be conflated (MWP-56):

  * Which pool funded application X?  -> every pool covering X's own from_date
  * How many days are free on date D? -> the pools covering D

Deriving the first from the second is what broke in August 2026: a carry-over
pool expiring dropped out of the "pools covering D" set, so the Jan-Jul leave it
had funded re-attached to the annual pool and was charged a second time.

Attribution here depends only on an application's own from_date and the full set
of allocations, so it cannot change when a pool expires.

Annual Leave runs two deliberately overlapping pools:

  * carry-over  Jan 1 N -> Jul 31 N       leftover from N-1, forfeited 31 Jul N
  * annual      Jan 1 N -> Jul 31 N+1     year N's entitlement, accrues monthly

Both are live Jan-Jul; that overlap is how the 7-month grace period is expressed.
Staff draw from the carry-over pool first because it expires first.
"""

import math
from dataclasses import dataclass
from datetime import date


def _parse(value) -> date | None:
    """ERPNext dates arrive as 'YYYY-MM-DD' or 'YYYY-MM-DD HH:MM:SS'."""
    if isinstance(value, date):
        return value
    if not value:
        return None
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def compute_accrued(
    allocation: float,
    period_from: date,
    today: date,
    relieving_date: date | None = None,
    entitlement_year: int | None = None,
) -> float:
    """Months fully completed since period start -> ceil(allocation x elapsed / 12).

    Accrual stops at whichever comes first: today, the relieving_date, or the end
    of the entitlement year. An allocation's to_date is an expiry deadline, not an
    earning window — year N's entitlement is earned over calendar year N but stays
    usable until 31 Jul N+1 (MWP-57).

    The year-end clamp lands on 1 Jan N+1 rather than 31 Dec N because `elapsed`
    counts *completed* months: 31 Dec N reads as 11, which would under-award a
    full-year employee.
    """
    if allocation <= 0:
        return 0.0
    accrual_end = today
    if relieving_date is not None and relieving_date < accrual_end:
        accrual_end = relieving_date
    if entitlement_year is not None:
        year_end = date(entitlement_year + 1, 1, 1)
        if year_end < accrual_end:
            accrual_end = year_end
    if accrual_end < period_from:
        return 0.0
    elapsed = (accrual_end.year - period_from.year) * 12 + (accrual_end.month - period_from.month)
    if elapsed <= 0:
        return 0.0
    return min(allocation, math.ceil(allocation * elapsed / 12))


@dataclass
class Pool:
    """One Leave Allocation, plus the leave charged against it."""

    name: str
    leave_type: str
    from_date: date
    to_date: date
    allocated: float           # the pool's full entitlement
    usable: float = 0.0        # allocated, or the accrued portion so far
    taken: float = 0.0         # approved/submitted days charged here
    pending: float = 0.0       # unapproved days reserved here

    @property
    def is_accruing(self) -> bool:
        """Long-span pools (an annual entitlement) accrue monthly; short ones don't."""
        return (self.to_date - self.from_date).days > 365

    @property
    def consumed(self) -> float:
        return self.taken + self.pending

    @property
    def balance(self) -> float:
        """Days still bookable from this pool."""
        return max(0.0, self.usable - self.consumed)

    def covers(self, day: date) -> bool:
        return self.from_date <= day <= self.to_date


def _order(pool: Pool) -> tuple:
    """Earliest-expiry first — the pool that lapses soonest is spent first."""
    return (pool.to_date, pool.from_date, pool.name)


def build_pools(
    allocations: list[dict],
    applications: list[dict],
    *,
    today: date,
    date_of_joining: date | None = None,
    relieving_date: date | None = None,
) -> dict[str, list[Pool]]:
    """Build per-leave-type pools with applications charged against them.

    `allocations` are submitted Leave Allocations; `applications` are Leave
    Applications excluding cancelled and rejected ones. Both are raw ERPNext dicts.

    Returns {leave_type: [Pool, ...]} ordered earliest-expiry first.
    """
    pools: dict[str, list[Pool]] = {}
    for alloc in allocations:
        frm, to = _parse(alloc.get("from_date")), _parse(alloc.get("to_date"))
        if not frm or not to:
            continue
        allocated = float(
            alloc.get("total_leaves_allocated")
            or alloc.get("new_leaves_allocated")
            or 0
        )
        pool = Pool(
            name=alloc.get("name", ""),
            leave_type=alloc.get("leave_type", ""),
            from_date=frm,
            to_date=to,
            allocated=allocated,
        )
        if pool.is_accruing:
            start = pool.from_date
            if date_of_joining and date_of_joining > start:
                start = date_of_joining
            pool.usable = compute_accrued(
                allocated, start, today, relieving_date, pool.from_date.year
            )
        else:
            pool.usable = allocated
        pools.setdefault(pool.leave_type, []).append(pool)

    for group in pools.values():
        group.sort(key=_order)

    _charge(pools, applications)
    return pools


def _charge(pools: dict[str, list[Pool]], applications: list[dict]) -> None:
    """Charge each application to the pool(s) covering its own from_date.

    Pools fill earliest-expiry first against their *full* allocation — accrual
    governs when days become bookable, not which pool owns them. Days beyond
    every covering pool's capacity land on the last pool, so over-consumption
    stays visible rather than silently vanishing.
    """
    ordered = sorted(
        applications,
        key=lambda a: (str(a.get("from_date") or ""), str(a.get("name") or "")),
    )
    for app in ordered:
        if app.get("status") == "Rejected" or app.get("docstatus") == 2:
            continue
        start = _parse(app.get("from_date"))
        if not start:
            continue
        group = pools.get(app.get("leave_type", ""), [])
        candidates = [p for p in group if p.covers(start)]
        if not candidates:
            continue

        remaining = float(app.get("total_leave_days") or 0)
        if remaining <= 0:
            continue
        is_taken = app.get("status") == "Approved" or app.get("docstatus") == 1

        for pool in candidates:
            if remaining <= 0:
                break
            free = max(0.0, pool.allocated - pool.consumed)
            charge = min(free, remaining)
            if charge <= 0:
                continue
            if is_taken:
                pool.taken += charge
            else:
                pool.pending += charge
            remaining -= charge

        if remaining > 0:
            last = candidates[-1]
            if is_taken:
                last.taken += remaining
            else:
                last.pending += remaining


def available_on(pools: list[Pool], day: date) -> float:
    """Days of this leave type bookable on `day`.

    Only pools covering `day` contribute, so an expired pool's unused days are
    correctly forfeited — while the leave it funded stays charged to it.
    """
    return sum(pool.balance for pool in pools if pool.covers(day))
