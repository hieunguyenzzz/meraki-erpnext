"""
v105: Holiday List "Vietnam 2027".

Vietnam 2026 ends on 2026-12-31, so 2027 holidays could not be added and leave
requests would not skip them. Creates the 2027 list (weekends + public holidays).
Does not touch Company.default_holiday_list or "Vietnam 2026".
Idempotent: returns early if the list already exists.
"""
from datetime import date, timedelta

LIST_NAME = "Vietnam 2027"

# Source: Bo Noi vu Notification 11483/TB-BNV (2026-10-09) for Tet/National Day; Resolution 28/2026/QH16 for 24 Nov.
PUBLIC_HOLIDAYS = {
    "2027-01-01": "New Year Day",
    "2027-02-04": "Tet Holiday (Lunar New Year)",
    "2027-02-05": "Tet Holiday (Lunar New Year)",
    "2027-02-06": "Tet Holiday (Lunar New Year)",
    "2027-02-07": "Tet Holiday (Lunar New Year)",
    "2027-02-08": "Tet Holiday (Lunar New Year)",
    "2027-02-09": "Tet Holiday (compensatory day)",
    "2027-02-10": "Tet Holiday (compensatory day)",
    "2027-04-16": "Hung Kings Commemoration Day",
    "2027-04-30": "Reunification Day",
    "2027-05-01": "International Labour Day",
    "2027-05-03": "International Labour Day (compensatory day)",
    "2027-09-02": "National Day",
    "2027-09-03": "National Day Holiday",
    "2027-11-24": "Vietnam Culture Day",
}


def build_holidays() -> list[dict]:
    rows = [
        {"holiday_date": d, "description": desc, "weekly_off": 0}
        for d, desc in PUBLIC_HOLIDAYS.items()
    ]
    day = date(2027, 1, 1)
    while day.year == 2027:
        iso = day.isoformat()
        if day.weekday() >= 5 and iso not in PUBLIC_HOLIDAYS:
            rows.append({
                "holiday_date": iso,
                "description": day.strftime("%A"),
                "weekly_off": 1,
            })
        day += timedelta(days=1)
    return sorted(rows, key=lambda r: r["holiday_date"])


def run(client):
    if client.exists("Holiday List", {"name": LIST_NAME}):
        print(f"  Holiday List exists: {LIST_NAME}")
        return
    created = client.create("Holiday List", {
        "holiday_list_name": LIST_NAME,
        "from_date": "2027-01-01",
        "to_date": "2027-12-31",
        "weekly_off": "Sunday",
        "country": "Vietnam",
        "holidays": build_holidays(),
    })
    if not created:
        raise RuntimeError(f"Failed to create Holiday List {LIST_NAME}")
    print(f"  Created Holiday List: {LIST_NAME}")
