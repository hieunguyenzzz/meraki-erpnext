"""Half-day note and OOO title for Google Calendar leave events (MWP-85)."""

from unittest.mock import patch

from webhook_v2.services import google_calendar as gcal
from webhook_v2.services.leave_calendar import half_day_note

DAY = {"from_date": "2026-10-20", "to_date": "2026-10-20"}


def test_full_day_has_no_note():
    assert half_day_note({**DAY, "half_day": 0, "description": "Holiday"}) == ""


def test_half_day_am():
    assert half_day_note({**DAY, "half_day": 1, "description": "Half Day (AM)"}) == "half day AM"


def test_half_day_pm_with_text():
    assert half_day_note({**DAY, "half_day": 1, "description": "Half Day (PM) — dentist"}) == "half day PM"


def test_half_day_unknown_period():
    assert half_day_note({**DAY, "half_day": 1, "description": None}) == "half day"


def test_multi_day_half_day_appends_date():
    leave = {"from_date": "2026-10-20", "to_date": "2026-10-22", "half_day": 1,
             "half_day_date": "2026-10-22", "description": "Half Day (PM)"}
    assert half_day_note(leave) == "half day PM 22 Oct"


def test_titles():
    with patch.object(gcal, "_insert") as insert:
        gcal.add_ooo_event("Nguyên Trần", "2026-10-20", "2026-10-22", "HR-LAP-1")
        gcal.add_ooo_event("Nguyên Trần", "2026-10-20", "2026-10-20", "HR-LAP-2", "half day AM")
        gcal.add_ooo_event("Nguyên Trần", "2026-10-20", "2026-10-22", "HR-LAP-3", "half day PM 22 Oct")
    titles = [c.args[0] for c in insert.call_args_list]
    assert titles == [
        "OOO - Nguyên Trần",
        "OOO - Nguyên Trần (half day AM)",
        "OOO - Nguyên Trần (half day PM 22 Oct)",
    ]


def test_backfill_title_words_handle_no_parens():
    from webhook_v2.scripts.backfill_leave_calendar import _title_words
    assert _title_words("OOO - Nguyên Trần") == ["Nguyên", "Trần"]
    assert _title_words("OOO - Nguyên Trần (half day AM)") == ["Nguyên", "Trần"]
