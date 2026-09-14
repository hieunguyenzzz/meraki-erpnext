"""
v092: Wedding Event model — cross-wedding event calendar.

Creates:
- DocType: Wedding Event Staff (child table for Wedding Event)
- DocType: Wedding Event (standalone — one row per ceremony/event within a wedding)

A wedding (Project) can have multiple events (Tea Ceremony, Ceremony, Reception,
etc.), each potentially at a different venue/date/time with its own staff
assignments. Wedding Event is standalone (not a child of Project) so it can be
queried directly across all weddings for a combined events calendar.

Why start_time/end_time/call_time are "Data", not "Time":
frappe.new_doc() unconditionally seeds every Time-fieldtype field with
nowtime() (frappe/model/create_new.py, set_dynamic_default_values) whenever a
document object is instantiated — independent of any "default" DocField
property, and before the caller's own payload is applied on top. This is core
Frappe behaviour (reproduced on the stock Project.to_time/from_time fields
too, not something this migration configured), so a field left out of a
create/update payload comes back as "now" instead of empty.

A "Before Save" Server Script was tried to correct this in-memory before the
write, but it regressed on partial updates: Frappe reloads existing documents
from the database on update (nothing to reseed), so "field absent from this
request" can't be distinguished from "field intentionally left unchanged" —
a PUT that only touches guest_count would wipe every already-saved time.
Making these fields "Data" instead sidesteps the seeding path entirely (it
only fires for Time/Datetime fieldtypes), for every write path present and
future, with no script and no doc-event ordering to reason about. The cost is
losing the Desk time-picker widget, which doesn't matter since this data is
only ever written through the React UI via the standard resource API.
"""

EVENT_TYPE_OPTIONS = "\n".join([
    "Tea Ceremony",
    "Pre-wedding Photoshoot",
    "Welcome Dinner",
    "Ceremony",
    "Buddhist Wedding",
    "Reception",
    "After Party",
    "Farewell Brunch",
    "Other",
])

STAFF_ROLE_OPTIONS = "\n".join([
    "",
    "Lead Planner",
    "Support Planner",
    "Coordinator",
    "Assistant",
    "Photographer Liaison",
    "Other",
])

TIME_FORMAT_DESCRIPTION = "24h HH:MM:SS, e.g. 18:00:00. Plain text — not a Time field, see v092 for why."

OBSOLETE_TIME_FIX_SCRIPT_NAME = "meraki-wedding-event-clear-empty-times"


def _upgrade_fieldtype(client, doctype: str, fieldname: str, description: str) -> None:
    """Idempotent upgrade path: if an earlier run of this phase created
    `fieldname` as a Time field, convert it to Data. No-ops once already Data."""
    doc = client.get("DocType", doctype)
    if not doc:
        return
    fields = doc.get("fields") or []
    changed = False
    for f in fields:
        if f.get("fieldname") == fieldname and f.get("fieldtype") != "Data":
            f["fieldtype"] = "Data"
            f["description"] = description
            changed = True
    if changed:
        client.update("DocType", doctype, {"fields": fields})
        print(f"  Upgraded {doctype}.{fieldname} from Time to Data")


def _remove_obsolete_time_fix_script(client) -> None:
    """Delete the Before-Save Server Script from the earlier (reverted) fix attempt."""
    if client.exists("Server Script", {"name": OBSOLETE_TIME_FIX_SCRIPT_NAME}):
        client.delete("Server Script", OBSOLETE_TIME_FIX_SCRIPT_NAME)
        print(f"  Removed obsolete Server Script: {OBSOLETE_TIME_FIX_SCRIPT_NAME}")


def run(client):
    # 1. Child DocType: Wedding Event Staff (created first — referenced by the Table field below)
    if not client.exists("DocType", {"name": "Wedding Event Staff"}):
        client.create("DocType", {
            "name": "Wedding Event Staff",
            "module": "Projects",
            "istable": 1,
            "editable_grid": 1,
            "custom": 1,
            "fields": [
                {
                    "fieldname": "employee",
                    "fieldtype": "Link",
                    "label": "Employee",
                    "options": "Employee",
                    "reqd": 1,
                    "in_list_view": 1,
                    "columns": 4,
                },
                {
                    "fieldname": "role",
                    "fieldtype": "Select",
                    "label": "Role",
                    "options": STAFF_ROLE_OPTIONS,
                    "in_list_view": 1,
                    "columns": 3,
                },
                {
                    "fieldname": "call_time",
                    "fieldtype": "Data",
                    "label": "Call Time",
                    "description": TIME_FORMAT_DESCRIPTION,
                    "in_list_view": 1,
                    "columns": 2,
                },
                {
                    "fieldname": "notes",
                    "fieldtype": "Small Text",
                    "label": "Notes",
                    "in_list_view": 1,
                    "columns": 3,
                },
            ],
            "permissions": [
                {"role": "System Manager", "read": 1, "write": 1, "create": 1, "delete": 1},
                {"role": "Projects Manager", "read": 1, "write": 1, "create": 1, "delete": 1},
                {"role": "Projects User", "read": 1, "write": 1, "create": 1, "delete": 1},
            ],
        })
        print("  Created DocType: Wedding Event Staff")
    else:
        print("  DocType exists: Wedding Event Staff")
        _upgrade_fieldtype(client, "Wedding Event Staff", "call_time", TIME_FORMAT_DESCRIPTION)

    # 2. Standalone DocType: Wedding Event
    if not client.exists("DocType", {"name": "Wedding Event"}):
        client.create("DocType", {
            "name": "Wedding Event",
            "module": "Projects",
            "istable": 0,
            "custom": 1,
            "naming_rule": "Expression",
            "autoname": "format:WE-{#####}",
            "title_field": "event_type",
            "fields": [
                {
                    "fieldname": "project",
                    "fieldtype": "Link",
                    "label": "Wedding",
                    "options": "Project",
                    "reqd": 1,
                    "in_list_view": 1,
                },
                {
                    "fieldname": "event_type",
                    "fieldtype": "Select",
                    "label": "Event Type",
                    "options": EVENT_TYPE_OPTIONS,
                    "reqd": 1,
                    "in_list_view": 1,
                },
                {
                    "fieldname": "event_date",
                    "fieldtype": "Date",
                    "label": "Date",
                    "reqd": 1,
                    "in_list_view": 1,
                },
                {
                    "fieldname": "start_time",
                    "fieldtype": "Data",
                    "label": "Start Time",
                    "description": TIME_FORMAT_DESCRIPTION,
                },
                {
                    "fieldname": "end_time",
                    "fieldtype": "Data",
                    "label": "End Time",
                    "description": TIME_FORMAT_DESCRIPTION,
                },
                {
                    "fieldname": "venue",
                    "fieldtype": "Link",
                    "label": "Venue",
                    "options": "Supplier",
                },
                {
                    "fieldname": "venue_area",
                    "fieldtype": "Data",
                    "label": "Venue Area",
                    "description": "Matches an area_name from the venue's Wedding Areas table.",
                },
                {
                    "fieldname": "guest_count",
                    "fieldtype": "Int",
                    "label": "Guest Count",
                },
                {
                    "fieldname": "notes",
                    "fieldtype": "Small Text",
                    "label": "Notes",
                },
                {
                    "fieldname": "staff",
                    "fieldtype": "Table",
                    "label": "Staff",
                    "options": "Wedding Event Staff",
                },
            ],
            "permissions": [
                {"role": "System Manager", "read": 1, "write": 1, "create": 1, "delete": 1},
                {"role": "Projects Manager", "read": 1, "write": 1, "create": 1, "delete": 1},
                {"role": "Projects User", "read": 1, "write": 1, "create": 1, "delete": 1},
            ],
        })
        print("  Created DocType: Wedding Event")
    else:
        print("  DocType exists: Wedding Event")
        _upgrade_fieldtype(client, "Wedding Event", "start_time", TIME_FORMAT_DESCRIPTION)
        _upgrade_fieldtype(client, "Wedding Event", "end_time", TIME_FORMAT_DESCRIPTION)

    # 3. Remove the Server Script from the earlier (reverted) fix attempt, if present
    _remove_obsolete_time_fix_script(client)

    print("  v092 wedding event model complete.")
