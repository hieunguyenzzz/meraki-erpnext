"""
Pure merge of one flight-email extraction into a Flight Booking doc (MWP-72). No I/O.

The doc has the ERPNext shape: scalar fields, child lists `segments` and `passengers`, and the
JSON strings `manual_fields` and `source_emails`. Existing child rows are edited in place, so their
`name` survives and a PUT updates them rather than recreating them. `project` is never written.
"""
import copy
import html
import json
import re
import unicodedata
from dataclasses import dataclass
from datetime import datetime
from email.utils import parsedate_to_datetime

from webhook_v2.processors.flight_checks import (format_errors, grounding_errors, is_change_fee, match_employee,
                                                 normalise_name)

AIRLINE_ALIASES = {"vietjetair": "Vietjet Air", "vietjet": "Vietjet Air", "vietnam airlines": "Vietnam Airlines",
                   "sun phuquoc airways": "Sun PhuQuoc Airways", "bamboo airways": "Bamboo Airways"}
SKIPPED_TYPES = {"boarding_pass", "not_flight"}
TICKET_NO_RE = re.compile(r"(?<!\d)\d{13}(?!\d)")
AUTO_REPLY_RE = re.compile(r"^\s*(automatic reply|auto-reply|tự động trả lời)", re.I)
EMD_TAG_RE = re.compile(r"EMD (\d{13})")
# The review endpoint prefixes the reasons text with "Reviewed by {user} {iso date}: " (possibly more than once).
REVIEWED_RE = re.compile(r"^(?:Reviewed by .*? \d{4}-\d{2}-\d{2}(?:[T ][0-9:.+\-Z]+)?: )+")
COPIED_SEGMENT_FIELDS = ("origin", "destination", "fare_family", "booking_class")


def normalise_airline(s) -> str:
    name = " ".join(str(s or "").split())
    return AIRLINE_ALIASES.get(name.lower(), name)


def invoice_ticket_numbers(source_text: str) -> set[str]:
    """13-digit ticket numbers printed in an email. Airline invoices carry no booking code, only these."""
    return set(TICKET_NO_RE.findall(source_text))


@dataclass
class MergeResult:
    doc: dict | None            # Flight Booking dict to save (None = nothing to save)
    review_reasons: list[str]   # reasons new to the booking; non-empty => needs_review=1
    action: str                 # "created" | "updated" | "skipped" | "unmatched"


def _dt(value) -> str | None:
    """Extraction "YYYY-MM-DDTHH:MM" and ERPNext "YYYY-MM-DD HH:MM:SS" both become the ERPNext form."""
    return datetime.fromisoformat(str(value).strip()).strftime("%Y-%m-%d %H:%M:%S") if value else None


def _short(value) -> str:
    return value[:16] if value else "?"


def _email_date(value) -> str:
    if isinstance(value, datetime):
        return value.isoformat()
    if not value:
        return ""
    try:
        return datetime.fromisoformat(str(value)).isoformat()
    except ValueError:
        return parsedate_to_datetime(str(value)).isoformat()


def _json_list(value) -> list:
    if not value:
        return []
    parsed = value if isinstance(value, list) else json.loads(value)
    if not isinstance(parsed, list):
        raise ValueError(f"expected a JSON list, got {type(parsed).__name__}")
    return parsed


def _lines(text) -> list[str]:
    return [line for line in (text or "").splitlines() if line.strip()]


def _tickets(passenger: dict) -> list[str]:
    return [t for t in [passenger.get("ticket_number")] + _lines(passenger.get("previous_ticket_numbers")) if t]


def booking_numbers(doc: dict) -> set[str]:
    """Every ticket (current or previous) and EMD number the booking has recorded; invoices list both."""
    passengers = doc.get("passengers") or []
    return ({t for p in passengers for t in _tickets(p)}
            | {n for p in passengers for n in EMD_TAG_RE.findall(p.get("extras_detail") or "")})


def _money(value) -> str:
    return f"{value or 0:,.0f}"


def booking_total(passengers: list[dict]) -> float:
    return sum((p.get("total") or 0) + (p.get("change_fees") or 0) + (p.get("extras") or 0) for p in passengers)


def add_review_reasons(doc: dict, reasons: list[str]) -> list[str]:
    """Append the reasons the booking doesn't already carry (reviewed or not) and flag it if any are new.

    Only a new reason re-flags, so a reviewed known issue stays reviewed. Returns the new reasons.
    """
    lines = _lines(doc.get("review_reasons"))
    # Frappe HTML-escapes Small Text on save, so older lines may hold &lt; / &amp;: compare unescaped.
    known = {html.unescape(REVIEWED_RE.sub("", line)) for line in lines}
    new = list(dict.fromkeys(r for r in reasons if r not in known))
    doc["review_reasons"] = "\n".join(lines + new)
    doc["needs_review"] = 1 if new else (doc.get("needs_review") or 0)
    return new


def merge(existing: dict | None, extraction: dict, email_meta: dict, employees: list[dict],
          source_text: str) -> MergeResult:
    if not email_meta.get("message_id"):
        raise ValueError("email_meta.message_id is required: it is what makes the merge idempotent")
    kind = extraction.get("email_type")
    code = (extraction.get("booking_code") or "").strip().upper()
    # Airline invoices print ticket numbers but no booking code; the caller finds their booking by ticket number.
    if kind in SKIPPED_TYPES or not (code or kind == "airline_invoice"):
        return MergeResult(None, [], "skipped")
    if existing is not None and code and existing.get("booking_code") != code:
        raise ValueError(f"extraction for {code} cannot merge into booking {existing.get('booking_code')}")
    if existing is not None and any(e.get("message_id") == email_meta["message_id"]
                                    for e in _json_list(existing.get("source_emails"))):
        return MergeResult(None, [], "skipped")
    if existing is None and kind != "ticket":
        return MergeResult(None, [f"no booking {code or 'found'} for {kind} email"], "unmatched")
    if existing is None and not normalise_airline(extraction.get("airline")):
        return MergeResult(None, [f"ticket email for {code} has no airline"], "unmatched")
    if kind == "airline_invoice" and not code:
        listed = invoice_ticket_numbers(source_text)
        if not listed or not listed <= booking_numbers(existing):
            return MergeResult(None, [f"invoice tickets {', '.join(sorted(listed)) or 'none'} are not all on "
                                      f"booking {existing.get('booking_code')}"], "unmatched")

    doc = copy.deepcopy(existing) if existing is not None else _new_doc(code, extraction)
    merger = _Merger(doc, _email_date(email_meta.get("date")), email_meta, employees)
    for reason in grounding_errors(extraction, source_text) + format_errors(extraction):
        merger.flag_event(reason)
    airline = normalise_airline(extraction.get("airline"))
    if airline and airline != doc["airline"]:
        merger.flag_event(f"email airline {airline} differs from booking airline {doc['airline']}")
    handlers = {"ticket": merger.ticket, "emd": merger.emd, "schedule_change": merger.schedule_change,
                "refund": merger.refund, "booking_summary": merger.booking_summary,
                "airline_invoice": merger.airline_invoice}
    handlers[kind](extraction, source_text)
    if merger.unplaced:  # nothing saved and the Message-ID not recorded, so the caller retries on a later run
        return MergeResult(None, merger.reasons, "unmatched")
    merger.finish(email_meta, kind, extraction.get("invoice") or {}, source_text)
    return MergeResult(doc, merger.new_reasons, "updated" if existing is not None else "created")


def _new_doc(code: str, extraction: dict) -> dict:
    documents = sorted(extraction.get("documents") or [], key=lambda d: d.get("doc_type") != "ticket")
    currency = next((d["currency"] for d in documents if d.get("currency")), "VND")
    return {"doctype": "Flight Booking", "booking_code": code, "airline": normalise_airline(extraction.get("airline")),
            "status": "Confirmed", "currency": currency, "note": "", "needs_review": 0, "review_reasons": "",
            "invoice_total": 0, "manual_fields": "[]", "source_emails": "[]", "segments": [], "passengers": []}


class _Merger:
    def __init__(self, doc: dict, email_date: str, email_meta: dict, employees: list[dict]):
        self.doc, self.employees = doc, employees
        self.message_id, self.subject = email_meta["message_id"], email_meta.get("subject") or ""
        self.day = email_date[:10] or "undated"
        self.manual = set(_json_list(doc.get("manual_fields")))
        self.reasons: list[str] = []
        self.unplaced = False
        self.new_reasons: list[str] = []
        doc["airline"] = normalise_airline(doc.get("airline"))
        doc["segments"] = doc.get("segments") or []
        doc["passengers"] = doc.get("passengers") or []
        for seg in doc["segments"]:
            for field in ("departure", "arrival", "original_departure"):
                seg[field] = _dt(seg.get(field))

    def flag_state(self, reason: str) -> None:
        """A standing condition of the booking: once reviewed, the same text does not re-flag it."""
        if reason not in self.reasons:
            self.reasons.append(reason)

    def flag_event(self, reason: str) -> None:
        """Something this email did or failed to do: tagged with the email, so every new email re-flags."""
        # No angle brackets: Frappe would store them HTML-escaped and the text would no longer match.
        self.flag_state(f"{reason} ({self.day}, {self.message_id.strip('<>')})")

    def note(self, line: str) -> None:
        # Appended even when staff edited the note ("note" in manual_fields): their text is kept verbatim.
        note = self.doc.get("note") or ""
        if line not in _lines(note):
            self.doc["note"] = f"{note}\n{line}" if note else line

    def was_departure(self, flight: str, departure: str) -> bool:
        """True if an earlier change moved this flight from or to this time (per the pipeline's note lines)."""
        short = _short(departure)
        return any(f"{flight} {short}→" in line or (f"{flight} " in line and line.endswith(f"→{short}"))
                   for line in _lines(self.doc.get("note")))

    def foreign_currency(self, d: dict) -> bool:
        currency, booking = d.get("currency"), self.doc.get("currency")
        if currency and booking and currency != booking:
            self.flag_event(f"{d.get('doc_type')} {d.get('document_number')} is in {currency}, booking is in {booking}; "
                      f"not added")
            return True
        return False

    def set_status(self, status: str) -> None:
        if "status" not in self.manual:
            self.doc["status"] = status

    def _manual_path(self, passenger: dict, field: str) -> str | None:
        # Keyed by every number the passenger has held, so an override survives a re-issue.
        return next((p for t in _tickets(passenger) if (p := f"passengers.{t}.{field}") in self.manual), None)

    def set_pax(self, passenger: dict, field: str, value) -> None:
        path = self._manual_path(passenger, field)
        if path is None:
            passenger[field] = value
        elif (value or 0) != (passenger.get(field) or 0):
            self.flag_state(f"{path} kept the manual value {_money(passenger.get(field))}; email says {_money(value)}")

    # ticket
    def ticket(self, extraction: dict, _source_text: str) -> None:
        self.upsert_segments(extraction.get("segments") or [])
        documents = extraction.get("documents") or []
        if not any(d.get("doc_type") == "ticket" for d in documents):
            self.flag_event("ticket email without a ticket receipt")
        for d in sorted(documents, key=lambda d: d.get("doc_type") != "ticket"):  # tickets first: EMDs attach to them
            if d.get("doc_type") == "ticket":
                self.ticket_doc(d)
            elif not self.emd_doc(d):
                self.unplaced = True

    def upsert_segments(self, segments: list[dict]) -> None:
        is_new = not self.doc["segments"]
        used: list[dict] = []
        for new in segments:
            flight, departure = new.get("flight_no"), _dt(new.get("departure"))
            unused = [s for s in self.doc["segments"] if s.get("flight_no") == flight and all(s is not u for u in used)]
            exact = [s for s in unused if s.get("departure") == departure]
            # Same flight number twice in this email (e.g. on two dates): only an exact departure identifies a row.
            twin = sum(1 for o in segments if o.get("flight_no") == flight) > 1
            if exact:
                row = exact[0]
            elif len(unused) == 1 and not twin:
                row = unused[0]
            elif not unused or twin:
                row = None
            else:
                self.flag_event(f"{flight} appears more than once on the booking; segment not updated")
                continue
            existed = row is not None
            if not existed:
                row = {"flight_no": flight, "original_departure": None}
                self.doc["segments"].append(row)
            used.append(row)
            if existed and departure and row.get("departure") and departure != row["departure"]:
                if departure == row.get("original_departure") or self.was_departure(flight, departure):
                    continue  # a ticket issued before a schedule change (re-sent or retried): keep the newer time
                if row.get("original_departure"):
                    self.flag_event(f"ticket shows {flight} at {_short(departure)} but the booking has {_short(row['departure'])} "
                              f"after an earlier change; not updated")
                    continue
                row["original_departure"] = row["departure"]
                self.note(f"Ticket {self.day}: {flight} {_short(row['departure'])}→{_short(departure)}")
            if departure:
                row["departure"] = departure
            if new.get("arrival"):
                row["arrival"] = _dt(new["arrival"])
            for field in COPIED_SEGMENT_FIELDS:
                if new.get(field) is not None:
                    row[field] = new[field]
        missing = [s.get("flight_no") for s in self.doc["segments"] if all(s is not u for u in used)]
        if missing and not is_new:
            self.flag_event(f"ticket does not list flight(s) {', '.join(missing)} on the booking; check the itinerary")

    def ticket_doc(self, d: dict) -> None:
        number, name = d.get("document_number"), d.get("passenger_name") or ""
        if not number:
            self.flag_event(f"ticket for {name} has no ticket number; not merged")
            return
        if self.foreign_currency(d):
            return
        passengers = self.doc["passengers"]
        current = next((p for p in passengers if p.get("ticket_number") == number), None)
        if current is None and any(number in _tickets(p) for p in passengers):
            return  # an older ticket of a re-issued passenger: its amounts are already on the row
        fee = is_change_fee(d)
        fare, total = d.get("fare_amount"), d.get("total_amount")
        if d.get("has_previously_paid_items") and not fee and fare is not None and total is not None:
            self.flag_event(f"ticket {number} has previously-paid items but total ≥ fare; original price may be missing")
        if current is not None:
            # A change fee is counted once, when its number is first seen. A recorded total is never replaced:
            # on a re-issued number it is the original price, and change_fees already holds the difference.
            if not fee and self._manual_path(current, "total"):
                self.set_pax(current, "total", total)  # kept; flagged if the email disagrees
            elif not fee and current.get("total"):
                if total != current["total"]:
                    self.flag_event(f"ticket {number} total {_money(total)} differs from the recorded "
                              f"{_money(current['total'])}; kept {_money(current['total'])}")
            elif not fee and current.get("change_fees"):
                self.flag_event(f"receipt for reissued ticket {number} may include its change fee; original price "
                                f"still unknown")
            elif not fee:
                if not current.get("fare"):
                    self.set_pax(current, "fare", fare)
                self.set_pax(current, "total", total)
            self.link_employee(current, name)
            return

        target = normalise_name(name)
        same_name = [p for p in passengers if target and normalise_name(p.get("passenger_name") or "") == target]
        if len(same_name) > 1:
            self.flag_event(f"{len(same_name)} passengers named {name}; ticket {number} not merged")
            return
        p = same_name[0] if same_name else None
        if p is not None and fee:  # re-issue: the new number replaces the old, the difference is a change fee
            p["previous_ticket_numbers"] = "\n".join(_tickets(p))
            p["ticket_number"] = number
            self.set_pax(p, "change_fees", (p.get("change_fees") or 0) + d["total_amount"])
        elif p is not None and not p.get("total"):  # the original arrived after its re-issue
            p["previous_ticket_numbers"] = "\n".join(_lines(p.get("previous_ticket_numbers")) + [number])
            self.set_pax(p, "fare", d.get("fare_amount"))
            self.set_pax(p, "total", d.get("total_amount"))
        else:
            if p is not None:
                # A full-price ticket for a known name may be a re-issue or a second ticket; keep both, never guess.
                self.flag_event(f"{name} has tickets {p.get('ticket_number')} and {number}; check whether one was "
                          f"re-issued or refunded")
            p = {"passenger_name": name, "employee": None, "ticket_number": number, "previous_ticket_numbers": "",
                 "fare": None, "total": None, "change_fees": d["total_amount"] if fee else 0, "extras": 0,
                 "extras_detail": ""}
            if not fee:
                p["fare"], p["total"] = d.get("fare_amount"), d.get("total_amount")
            passengers.append(p)
        self.link_employee(p, name)

    def link_employee(self, passenger: dict, name: str) -> None:
        if self._manual_path(passenger, "employee"):
            return
        match = match_employee(name, self.employees)
        if match:
            passenger["employee"] = match
        elif not passenger.get("employee"):  # keep an earlier link, e.g. after the employee left
            self.flag_state(f"no staff match for {name}")

    # emd
    def emd(self, extraction: dict, _source_text: str) -> None:
        documents = [d for d in extraction.get("documents") or [] if d.get("doc_type") == "emd"]
        if not documents:
            self.flag_event("EMD email without an EMD receipt")
        placed = [self.emd_doc(d) for d in documents]  # every EMD is tried, so all reasons are reported
        self.unplaced = not all(placed)

    def emd_doc(self, d: dict) -> bool:
        """False when the related ticket isn't on the booking yet (worth a retry); True once handled."""
        number, related, amount = d.get("document_number"), d.get("related_ticket_number"), d.get("total_amount")
        passenger = next((p for p in self.doc["passengers"] if related and related in _tickets(p)), None)
        if passenger is None:
            self.flag_event(f"EMD {number} for ticket {related}: no passenger with that ticket on the booking")
            return False
        if self.foreign_currency(d):
            return True
        if not number or not amount:
            self.flag_event(f"EMD {number} for ticket {related} has no document number or total; not added")
            return True
        tag = f"EMD {number}"
        detail = passenger.get("extras_detail") or ""
        if tag in detail:
            return True  # already counted (the same EMD re-sent)
        self.set_pax(passenger, "extras", (passenger.get("extras") or 0) + amount)
        line = f"{d.get('service') or 'Extra'} ({tag}, {_money(amount)})"
        passenger["extras_detail"] = f"{detail}\n{line}" if detail else line
        return True

    # schedule_change
    def schedule_change(self, extraction: dict, _source_text: str) -> None:
        news, originals = extraction.get("segments") or [], extraction.get("original_segments") or []
        if not originals:
            self.flag_event("schedule change without the original flights; not applied")
        original_flights = {o.get("flight_no") for o in originals}
        for new in news:
            if new.get("flight_no") not in original_flights:
                self.flag_event(f"schedule change lists {new.get('flight_no')} with no original flight; not applied")
        changed = False
        for old in originals:
            flight, old_departure = old.get("flight_no"), _dt(old.get("departure"))
            new = next((s for s in news if s.get("flight_no") == flight), None)
            new_departure = _dt(new.get("departure")) if new else None
            rows = [s for s in self.doc["segments"] if s.get("flight_no") == flight]
            row = next((s for s in rows if s.get("departure") == old_departure), None)
            # No flight at the old time: already applied if it is at the new time, or the note shows this exact change
            # (the airline re-sent it after a later change).
            applied = row is None and new_departure and (any(s.get("departure") == new_departure for s in rows) or any(
                f"{flight} {_short(old_departure)}→{_short(new_departure)}" in line for line in _lines(self.doc.get("note"))))
            if rows and applied:
                changed = True
                continue
            if row is None or not new_departure:
                self.flag_event(f"schedule change for {flight} {_short(old_departure)} does not match the booking; not applied")
                continue
            if not row.get("original_departure"):
                row["original_departure"] = old_departure
            row["departure"] = new_departure
            if new.get("arrival"):
                row["arrival"] = _dt(new["arrival"])
            self.note(f"Schedule change {self.day}: {flight} {_short(old_departure)}→{_short(new_departure)}")
            changed = True
        if changed and self.doc.get("status") in (None, "", "Confirmed"):  # never turn Refunded back into Changed
            self.set_status("Changed")

    # refund
    def refund(self, extraction: dict, _source_text: str) -> None:
        note = (extraction.get("note") or "").strip()
        self.note(f"Refund {self.day}: {note or 'refund email received'}")
        # Every refund email except an auto-reply is reviewed: the note wording is no money signal.
        tickets = ", ".join(sorted(TICKET_NO_RE.findall(f"{self.subject} {note}")))
        if not AUTO_REPLY_RE.match(unicodedata.normalize("NFC", self.subject)):  # auto-replies carry no amounts
            self.flag_event(f"refund email: {self.subject[:80]}{f' (ticket {tickets})' if tickets else ''} — check refund "
                            f"amount and fee")
        completed = re.search(r"\bcompleted\b", note, re.I) and not re.search(r"\b(not|pending|yet|awaiting)\b", note, re.I)
        if not completed:
            return
        count = len(self.doc["passengers"])
        if count <= 1:
            self.set_status("Refunded")
        else:
            self.flag_event(f"refund completed on a booking with {count} passengers; check which tickets were refunded")

    # booking_summary
    def booking_summary(self, extraction: dict, _source_text: str) -> None:
        if (extraction.get("note") or "").strip():
            self.note(f"Booking summary {self.day}: {extraction['note'].strip()}")

    # airline_invoice
    def airline_invoice(self, extraction: dict, source_text: str) -> None:
        invoice = extraction.get("invoice") or {}
        number, total = invoice.get("invoice_number"), invoice.get("invoice_total")
        foreign = invoice_ticket_numbers(source_text) - booking_numbers(self.doc)
        if foreign:
            self.flag_event(f"invoice {number} lists tickets not on this booking: {', '.join(sorted(foreign))}")
        if not total:
            self.flag_event(f"invoice {number} has no total; not added")
            return
        if not number:
            self.flag_event("invoice without an invoice number; a re-sent copy could be counted twice")
        elif any(e.get("invoice_number") == number for e in _json_list(self.doc.get("source_emails"))):
            return  # the same invoice re-sent
        self.doc["invoice_total"] = (self.doc.get("invoice_total") or 0) + total

    def finish(self, email_meta: dict, kind: str, invoice: dict, source_text: str) -> None:
        doc, passengers = self.doc, self.doc["passengers"]
        for p in passengers:
            if not p.get("total"):  # None, or 0.0: ERPNext stores an empty Currency as 0
                self.flag_state(f"original ticket price unknown for {p.get('passenger_name')} (ticket {p.get('ticket_number')})")
        doc["qty"] = len(passengers)
        doc["total_amount"] = booking_total(passengers)
        departures = [s["departure"] for s in doc["segments"] if s.get("departure")]
        doc["first_departure"] = min(departures) if departures else None

        entry = {"message_id": email_meta["message_id"], "subject": email_meta.get("subject") or "",
                 "date": _email_date(email_meta.get("date")), "email_type": kind}
        if kind == "airline_invoice":
            entry.update(invoice_number=invoice.get("invoice_number"), invoice_total=invoice.get("invoice_total"),
                         listed_tickets=sorted(invoice_ticket_numbers(source_text)))
        sources = _json_list(doc.get("source_emails")) + [entry]
        doc["source_emails"] = json.dumps(sources, ensure_ascii=False)

        invoiced = doc.get("invoice_total") or 0
        refunded = doc.get("status") == "Refunded" or any(
            e.get("email_type") == "refund" or (e.get("invoice_total") or 0) < 0 for e in sources)
        # VAT invoices often cover the ticket only; seat/bag EMDs are invoiced separately or not at all.
        without_extras = doc["total_amount"] - sum(p.get("extras") or 0 for p in passengers)
        # Per-passenger invoices: only compare once the invoices seen so far cover every passenger's ticket.
        invoiced_tickets = {t for e in sources for t in e.get("listed_tickets") or []}
        # An invoice listing no ticket numbers (matched by booking code) is taken to cover the whole booking.
        invoices = [e for e in sources if e.get("email_type") == "airline_invoice"]
        covered = bool(passengers) and (any(not e.get("listed_tickets") for e in invoices)
                                        or all(set(_tickets(p)) & invoiced_tickets for p in passengers))
        if invoiced and covered and not refunded and all(abs(t - invoiced) >= 0.5 for t in (doc["total_amount"], without_extras)):
            self.flag_state(f"ticket totals {_money(doc['total_amount'])} ≠ invoice {_money(invoiced)}")

        self.new_reasons = add_review_reasons(doc, self.reasons)
