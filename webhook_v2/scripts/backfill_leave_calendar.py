"""One-off backfill for MWP-84: give every current/future approved leave a tagged calendar event.

    python -m webhook_v2.scripts.backfill_leave_calendar [--dry-run]

Per Approved, submitted Leave Application with to_date >= today:
  - tagged event exists          -> skip
  - untagged 'OOO - ' event overlapping the dates that names the employee -> tag it
  - otherwise                    -> create via sync_leave_calendar
Idempotent: a second run skips everything.
"""

import argparse
import json
from datetime import date

from webhook_v2.core.logging import get_logger
from webhook_v2.services import google_calendar as gcal
from webhook_v2.services.erpnext import ERPNextClient
from webhook_v2.services.leave_calendar import sync_leave_calendar

log = get_logger(__name__)


def _approved_future_leaves(client: ERPNextClient) -> list[dict]:
    return client._get("/api/resource/Leave Application", params={
        "filters": json.dumps([
            ["status", "=", "Approved"], ["docstatus", "=", 1],
            ["to_date", ">=", date.today().isoformat()],
        ]),
        "fields": json.dumps(["name", "employee", "from_date", "to_date"]),
        "limit_page_length": 1000,
    }).get("data", [])


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="print actions, change nothing")
    dry_run = parser.parse_args().dry_run

    if not gcal.is_configured():
        raise SystemExit("Google Calendar is not configured (GOOGLE_SERVICE_ACCOUNT_JSON / GOOGLE_CALENDAR_ID / GOOGLE_ORGANIZER_EMAIL)")

    client = ERPNextClient()
    counts = {"skip": 0, "tag": 0, "create": 0}
    for leave in _approved_future_leaves(client):
        leave_id, from_d, to_d = leave["name"], leave["from_date"][:10], leave["to_date"][:10]
        if gcal.find_leave_events(leave_id):
            counts["skip"] += 1
            print(f"skip    {leave_id} (already tagged)")
            continue
        emp = client._get(f"/api/resource/Employee/{leave['employee']}").get("data", {})
        tokens = f"{emp.get('first_name', '')} {emp.get('last_name', '')}".split()
        match = next(
            (ev for ev in gcal.list_untagged_ooo_events(from_d, to_d)
             if any(tok in ev["summary"] for tok in tokens)),
            None,
        )
        if match:
            counts["tag"] += 1
            print(f"tag     {leave_id} -> {match['summary']!r} ({match['id']})")
            if not dry_run:
                gcal.tag_event(match["id"], leave_id)
        else:
            counts["create"] += 1
            print(f"create  {leave_id} {leave['employee']} {from_d}..{to_d}")
            if not dry_run:
                sync_leave_calendar(leave_id)
    print(f"{'DRY RUN ' if dry_run else ''}done: {counts}")


if __name__ == "__main__":
    main()
