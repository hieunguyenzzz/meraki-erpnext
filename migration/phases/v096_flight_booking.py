"""
v096: Flight Booking model (MWP-72).

Creates:
- DocType: Flight Booking Segment (child table)
- DocType: Flight Booking Passenger (child table)
- DocType: Flight Booking (one row per airline booking code)

Departure/arrival are Datetime fields. A Time field would be seeded with
nowtime() by frappe.new_doc() (see v092), which is why Time is avoided.
"""

ACCESS_ROLES = ["System Manager", "Accounts Manager", "Accounts User", "Projects User", "Sales Manager"]


def _field(fieldname, fieldtype, label, **extra):
    return {"fieldname": fieldname, "fieldtype": fieldtype, "label": label, **extra}


def _permissions():
    """System Manager has full access; everyone else is read-only.

    All writes go through webhook_v2 (Administrator API key) so the Finance-only
    total rule and manual-edit pinning cannot be bypassed via /api.
    """
    return [
        {"role": role, "read": 1, "write": 1, "create": 1, "delete": 1}
        if role == "System Manager" else {"role": role, "read": 1}
        for role in ACCESS_ROLES
    ]


SEGMENT_FIELDS = [
    _field("flight_no", "Data", "Flight No", reqd=1, in_list_view=1),
    _field("origin", "Data", "Origin", in_list_view=1),
    _field("destination", "Data", "Destination", in_list_view=1),
    _field("departure", "Datetime", "Departure", in_list_view=1),
    _field("arrival", "Datetime", "Arrival"),
    _field("fare_family", "Data", "Fare Family"),
    _field("booking_class", "Data", "Booking Class"),
    _field("original_departure", "Datetime", "Original Departure"),
]

PASSENGER_FIELDS = [
    _field("passenger_name", "Data", "Passenger Name", reqd=1, in_list_view=1),
    _field("employee", "Link", "Employee", options="Employee", in_list_view=1),
    _field("ticket_number", "Data", "Ticket Number", in_list_view=1),
    _field("previous_ticket_numbers", "Small Text", "Previous Ticket Numbers"),
    _field("fare", "Currency", "Fare"),
    _field("total", "Currency", "Total", in_list_view=1),
    _field("change_fees", "Currency", "Change Fees"),
    _field("extras", "Currency", "Extras"),
    _field("extras_detail", "Small Text", "Extras Detail"),
]

BOOKING_FIELDS = [
    _field("booking_code", "Data", "Booking Code", reqd=1, in_list_view=1, in_standard_filter=1),
    _field("airline", "Data", "Airline", reqd=1, in_list_view=1),
    _field("status", "Select", "Status", options="Confirmed\nChanged\nCancelled\nRefunded", default="Confirmed"),
    _field("first_departure", "Datetime", "First Departure", in_list_view=1),
    _field("qty", "Int", "Passengers", read_only=1),
    _field("total_amount", "Currency", "Total Amount", read_only=1),
    _field("currency", "Data", "Currency", default="VND"),
    _field("project", "Link", "Wedding", options="Project"),
    _field("note", "Small Text", "Note"),
    _field("needs_review", "Check", "Needs Review"),
    _field("review_reasons", "Small Text", "Review Reasons"),
    _field("invoice_total", "Currency", "Invoice Total"),
    _field("manual_fields", "Small Text", "Manual Fields", hidden=1,
           description="JSON list of field paths edited by people"),
    _field("source_emails", "Long Text", "Source Emails", hidden=1, description="JSON list"),
    _field("segments", "Table", "Segments", options="Flight Booking Segment"),
    _field("passengers", "Table", "Passengers", options="Flight Booking Passenger"),
]


def _ensure(client, name, **props):
    if client.exists("DocType", {"name": name}):
        print(f"  DocType exists: {name}")
        return
    client.create("DocType", {"name": name, "module": "Accounts", "custom": 1, **props,
                              "permissions": _permissions()})
    print(f"  Created DocType: {name}")


def run(client):
    # Child tables first: the parent's Table fields reference them.
    _ensure(client, "Flight Booking Segment", istable=1, editable_grid=1, fields=SEGMENT_FIELDS)
    _ensure(client, "Flight Booking Passenger", istable=1, editable_grid=1, fields=PASSENGER_FIELDS)
    _ensure(client, "Flight Booking", istable=0, naming_rule="Expression", autoname="format:FB-{#####}",
            title_field="booking_code", fields=BOOKING_FIELDS)
    print("  v096 flight booking model complete.")
