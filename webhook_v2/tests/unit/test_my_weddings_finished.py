"""Finished / 30-day cutoff rule and business-timezone 'today' for My weddings (MWP-97)."""

from datetime import date, datetime, timezone
from unittest.mock import MagicMock, patch

from webhook_v2.routers import my_weddings as mw

TODAY = date(2026, 11, 4)


def _projects(*rows):
    client = MagicMock()
    client._get.return_value = {"data": list(rows)}
    return client


def _p(name, status, wedding_date):
    return {"name": name, "status": status, "expected_end_date": wedding_date}


def _names(rows):
    return [p["name"] for p in rows]


def test_is_finished():
    assert mw.is_finished("Completed", 5)          # completed even if the date is ahead
    assert mw.is_finished("Open", -1)              # date has passed
    assert not mw.is_finished("Open", 0)           # wedding day itself is not finished
    assert not mw.is_finished("Open", None)


def test_past_dated_open_wedding_is_finished_and_cut_off_after_30_days():
    client = _projects(
        _p("upcoming", "Open", "2026-11-20"),
        _p("today", "Open", "2026-11-04"),
        _p("past-recent", "Open", "2026-10-20"),      # 15 days ago -> kept
        _p("past-edge", "Open", "2026-10-05"),        # exactly 30 days ago -> kept
        _p("past-old", "Open", "2026-10-04"),         # 31 days ago -> dropped
        _p("done-recent", "Completed", "2026-10-25"),
        _p("done-old", "Completed", "2026-01-11"),
        _p("done-undated", "Completed", None),
        _p("undated-open", "Open", None),
    )
    kept = mw.list_assigned_projects(client, "HR-EMP-1", TODAY)
    assert _names(kept) == ["upcoming", "today", "past-recent", "past-edge", "done-recent", "undated-open"]


def test_without_recent_completed_every_open_wedding_is_returned():
    client = _projects(_p("past-old", "Open", "2026-01-01"))
    assert _names(mw.list_assigned_projects(client, "HR-EMP-1", TODAY, recent_completed=False)) == ["past-old"]


def test_local_today_uses_vietnam_time():
    # 20:00 UTC on 3 Nov is already 4 Nov 03:00 in Ho Chi Minh City.
    fake_now = datetime(2026, 11, 3, 20, 0, tzinfo=timezone.utc)
    with patch.object(mw, "datetime") as dt:
        dt.now.side_effect = lambda tz: fake_now.astimezone(tz)
        assert mw.local_today() == date(2026, 11, 4)
        dt.now.assert_called_once_with(mw.BUSINESS_TZ)


def test_couple_label_drops_trailing_wedding_only():
    assert mw.couple_label("Erika & Gary Wedding") == "Erika & Gary"
    assert mw.couple_label("Wedding Planners & Co") == "Wedding Planners & Co"
