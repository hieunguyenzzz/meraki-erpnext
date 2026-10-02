"""Unit tests for merging flight extractions into Flight Booking docs (MWP-72).

Shapes and amounts mirror real eval outputs; booking codes, ticket numbers, invoice numbers and names are synthetic.
"""

import copy
import json

import pytest

from webhook_v2.processors.flight_merge import invoice_ticket_numbers, merge, normalise_airline

EMPLOYEES = [
    {"name": "HR-EMP-0001", "employee_name": "Nguyễn Văn An"},
    {"name": "HR-EMP-0002", "employee_name": "Trần Thị Bình"},
    {"name": "HR-EMP-0003", "employee_name": "Lê Minh Châu"},
    {"name": "HR-EMP-0004", "employee_name": "Phạm Thu Dung"},
    {"name": "HR-EMP-0005", "employee_name": "Đỗ Quang Em"},
]
NAMES = ["Nguyen Van An", "Tran Thi Binh", "Le Minh Chau", "Pham Thu Dung", "Do Quang Em"]
_counter = iter(range(1, 10_000))


def _seg(flight_no="VN1340", origin="SGN", destination="CXR", departure="2026-03-30T07:00",
         arrival="2026-03-30T08:05", **extra):
    return {"flight_no": flight_no, "origin": origin, "destination": destination, "departure": departure,
            "arrival": arrival, "fare_family": "Economy Lite", "booking_class": "X", **extra}


FIVE_PAX_SEGS = [_seg(), _seg("VN6151", "CXR", "SGN", "2026-04-01T20:55", "2026-04-01T22:00")]


def _ticket(number, name, fare=1196000, total=2430000, pd=False):
    return {"doc_type": "ticket", "passenger_name": name, "document_number": number, "related_ticket_number": None,
            "issue_date": "2026-03-16", "fare_amount": fare, "total_amount": total, "currency": "VND",
            "has_previously_paid_items": pd, "service": None}


def _emd(number, related, total, service="Seat Assignment, Seat: 20E", name="Nguyen Van An"):
    return {"doc_type": "emd", "passenger_name": name, "document_number": number, "related_ticket_number": related,
            "issue_date": "2026-03-29", "fare_amount": total - 6000, "total_amount": total, "currency": "VND",
            "has_previously_paid_items": False, "service": service}


def _x(email_type="ticket", code="ABC123", segments=None, original=None, documents=None, invoice_total=None,
       note="", airline="Vietnam Airlines"):
    return {"email_type": email_type, "airline": airline, "booking_code": code,
            "segments": FIVE_PAX_SEGS if segments is None else segments,
            "original_segments": original or [], "documents": documents or [],
            "invoice": {"invoice_number": "512345" if invoice_total is not None else None,
                        "invoice_date": None, "invoice_total": invoice_total},
            "note": note}


def _meta(date="2026-03-16T08:52:17+00:00", message_id=None):
    return {"message_id": message_id or f"<msg-{next(_counter)}@airline>", "subject": "Đặt chỗ", "date": date}


def _src(extraction, extra=""):
    """Source text that grounds every value of the extraction (the JSON itself carries every token)."""
    return json.dumps(extraction, ensure_ascii=False) + "\n" + extra


def _merge(existing, extraction, meta=None, employees=EMPLOYEES, source=None):
    return merge(existing, extraction, meta or _meta(), employees, _src(extraction) if source is None else source)


def _saved(doc):
    """What ERPNext gives back after a save: names on rows, Currency None stored as 0.0."""
    doc = copy.deepcopy(doc)
    doc.setdefault("name", "FB-00001")
    for table in ("segments", "passengers"):
        for i, row in enumerate(doc[table], 1):
            row.setdefault("name", f"{table}-row-{i}")
            row.update(idx=i, doctype=table)
    for p in doc["passengers"]:
        for f in ("fare", "total", "change_fees", "extras"):
            p[f] = float(p.get(f) or 0)
    return doc


def _apply(existing, extraction, **kw):
    result = _merge(existing, extraction, **kw)
    return _saved(result.doc) if result.doc is not None else existing, result


def _five_pax():
    doc = None
    for i, name in enumerate(NAMES):
        doc, _ = _apply(doc, _x(documents=[_ticket(f"738123007673{5 + i}", name)]))
    return doc


def _pax(doc, ticket):
    return next(p for p in doc["passengers"] if p["ticket_number"] == ticket)


def _reasons(doc):
    return (doc.get("review_reasons") or "").splitlines()


# Rule 1: skipped
@pytest.mark.parametrize("extraction", [_x("boarding_pass"), _x("not_flight", code=None, segments=[]),
                                        _x(code=None, documents=[_ticket("7381230076735", "Nguyen Van An")])])
def test_boarding_pass_not_flight_and_missing_code_are_skipped(extraction):
    result = _merge(None, extraction)
    assert (result.action, result.doc) == ("skipped", None)


def test_non_ticket_email_without_a_booking_is_unmatched():
    result = _merge(None, _x("emd", code="XYZ789", segments=[], documents=[_emd("7381205743298", "7381230299050", 81000)]))
    assert (result.action, result.doc) == ("unmatched", None)
    assert result.review_reasons


# ABC123
def test_five_tickets_then_matching_invoice():
    doc = _five_pax()
    assert doc["qty"] == 5
    assert doc["total_amount"] == 12150000
    assert doc["needs_review"] == 0 and _reasons(doc) == []
    assert doc["airline"] == "Vietnam Airlines" and doc["status"] == "Confirmed"
    assert doc["first_departure"] == "2026-03-30 07:00:00"
    assert doc["segments"][0]["departure"] == "2026-03-30 07:00:00"
    assert _pax(doc, "7381230076735")["employee"] == "HR-EMP-0001"

    invoice = _x("airline_invoice", code=None, segments=[], invoice_total=12150000)
    tickets = "\n".join(f"738123007673{5 + i} SGNVNCXRVNSGN 1 1.196.000" for i in range(5))
    doc, result = _apply(doc, invoice, source=_src(invoice, tickets))
    assert result.action == "updated"
    assert result.review_reasons == []
    assert doc["invoice_total"] == 12150000 and doc["total_amount"] == 12150000 and doc["needs_review"] == 0


def test_invoice_total_mismatch_is_flagged():
    invoice = _x("airline_invoice", code=None, segments=[], invoice_total=12000000)
    tickets = "\n".join(f"738123007673{5 + i}" for i in range(5))
    doc, result = _apply(_five_pax(), invoice, source=_src(invoice, tickets))
    assert "ticket totals 12,150,000 ≠ invoice 12,000,000" in result.review_reasons
    assert doc["needs_review"] == 1


def test_invoice_without_booking_code_needs_its_tickets_on_the_booking():
    invoice = _x("airline_invoice", code=None, segments=[], invoice_total=2430000)
    assert _merge(None, invoice, source=_src(invoice, "7381230076735")).action == "unmatched"
    foreign = _merge(_five_pax(), invoice, source=_src(invoice, "7381230076735 7381239999999"))
    assert (foreign.action, foreign.doc) == ("unmatched", None)
    assert invoice_ticket_numbers("x 7381230076735 y 12345 7381230299050z") == {"7381230076735", "7381230299050"}


@pytest.mark.parametrize("invoice_total,flagged", [(2808000, False), (2960000, False), (2900000, True)])
def test_invoice_may_cover_tickets_with_or_without_extras(invoice_total, flagged):
    doc = _apply(None, _x(code="XYZ789", documents=[_ticket("7381230299050", "Nguyen Van An", 1546000, 2808000)]))[0]
    for number, amount in (("7381205743298", 81000), ("7381205754495", 71000)):
        doc, _ = _apply(doc, _x("emd", code="XYZ789", segments=[], documents=[_emd(number, "7381230299050", amount)]))
    invoice = _x("airline_invoice", code=None, segments=[], invoice_total=invoice_total)
    doc, result = _apply(doc, invoice, source=_src(invoice, "7381230299050"))
    assert doc["total_amount"] == 2960000
    expected = [f"ticket totals 2,960,000 ≠ invoice {invoice_total:,}"] if flagged else []
    assert result.review_reasons == expected


def test_resent_invoice_with_same_number_is_not_added_twice():
    invoice = _x("airline_invoice", code=None, segments=[], invoice_total=12150000)
    tickets = "\n".join(f"738123007673{5 + i}" for i in range(5))
    doc, _ = _apply(_five_pax(), invoice, source=_src(invoice, tickets))
    doc, _ = _apply(doc, invoice, source=_src(invoice, tickets))
    assert doc["invoice_total"] == 12150000


# QWE456: re-issue with change fee
F6_SEG = [_seg("VN8441", "TBB", "SGN", "2026-08-18T15:20", "2026-08-18T16:20")]


def _reissue_original():
    return _apply(None, _x(code="QWE456", segments=F6_SEG,
                           documents=[_ticket("7381232558119", "Nguyen Van An", 756000, 1364181)]))[0]


def test_reissue_with_change_fee_keeps_original_total():
    original = _reissue_original()
    reissue = _x(code="QWE456", segments=F6_SEG, documents=[_ticket("7381232763844", "Nguyen Van An", 801000, 49000, pd=True)])
    doc, result = _apply(original, reissue)
    p = doc["passengers"][0]
    assert result.action == "updated"
    assert p["name"] == original["passengers"][0]["name"]
    assert (p["ticket_number"], p["previous_ticket_numbers"]) == ("7381232763844", "7381232558119")
    assert (p["fare"], p["total"], p["change_fees"]) == (756000, 1364181, 49000)
    assert doc["qty"] == 1 and doc["total_amount"] == 1364181 + 49000
    assert result.review_reasons == []


def test_resent_reissue_and_resent_original_change_nothing():
    doc, _ = _apply(_reissue_original(), _x(code="QWE456", segments=F6_SEG,
                                      documents=[_ticket("7381232763844", "Nguyen Van An", 801000, 49000, pd=True)]))
    again, _ = _apply(doc, _x(code="QWE456", segments=F6_SEG,
                              documents=[_ticket("7381232763844", "Nguyen Van An", 801000, 49000, pd=True)]))
    old, _ = _apply(again, _x(code="QWE456", segments=F6_SEG,
                              documents=[_ticket("7381232558119", "Nguyen Van An", 756000, 1364181)]))
    for d in (again, old):
        assert d["passengers"] == doc["passengers"] and d["total_amount"] == doc["total_amount"]


def test_reissue_whose_original_was_never_seen_is_flagged():
    reissue = _x(code="RTY234", segments=[_seg("VN7353", "CXR", "SGN", "2026-08-19T15:20", "2026-08-19T16:25")],
                 documents=[_ticket("7381232763864", "Nguyen Van An", 999000, 282000, pd=True)])
    doc, result = _apply(None, reissue)
    p = doc["passengers"][0]
    assert result.action == "created"
    assert p["total"] == 0 and p["change_fees"] == 282000  # 0.0 = how ERPNext stores None
    assert any("original ticket price unknown" in r for r in result.review_reasons)
    assert doc["needs_review"] == 1 and doc["total_amount"] == 282000

    # after the ERPNext round-trip the 0.0 total must still read as unknown on the next email
    second = _x(code="RTY234", segments=reissue["segments"],
                documents=[_ticket("7381232763863", "Tran Thi Binh", 999000, 282000, pd=True)])
    doc, result = _apply(doc, second)
    unknown = [r for r in _reasons(doc) if "original ticket price unknown" in r]
    assert len(unknown) == 2 and doc["total_amount"] == 564000
    assert [r for r in result.review_reasons if "unknown" in r] == [  # only the new passenger's line is new
        "original ticket price unknown for Tran Thi Binh (ticket 7381232763863)"]


def test_full_price_ticket_for_a_known_name_is_added_and_flagged_not_replaced():
    doc, result = _apply(_reissue_original(), _x(code="QWE456", segments=F6_SEG,
                                            documents=[_ticket("7381232763844", "Nguyen Van An", 801000, 1500000)]))
    assert _pax(doc, "7381232558119")["total"] == 1364181
    assert _pax(doc, "7381232763844")["total"] == 1500000
    assert doc["total_amount"] == 1364181 + 1500000
    assert any("7381232558119" in r and "7381232763844" in r for r in result.review_reasons)


def test_original_arriving_after_its_reissue_fills_the_unknown_price():
    doc, _ = _apply(None, _x(code="QWE456", segments=F6_SEG,
                             documents=[_ticket("7381232763844", "Nguyen Van An", 801000, 49000, pd=True)]))
    doc, result = _apply(doc, _x(code="QWE456", segments=F6_SEG,
                                 documents=[_ticket("7381232558119", "Nguyen Van An", 756000, 1364181)]))
    p = doc["passengers"][0]
    assert len(doc["passengers"]) == 1
    assert (p["ticket_number"], p["previous_ticket_numbers"]) == ("7381232763844", "7381232558119")
    assert (p["total"], p["change_fees"]) == (1364181, 49000) and doc["total_amount"] == 1364181 + 49000
    assert not any("unknown" in r for r in result.review_reasons)


def test_two_passengers_with_the_same_name_are_not_guessed():
    doc = None
    for number in ("7381232558119", "7381232558120"):
        doc, _ = _apply(doc, _x(code="QWE456", segments=F6_SEG,
                                documents=[_ticket(number, "Nguyen Van An", 756000, 1364181)]))
    doc, result = _apply(doc, _x(code="QWE456", segments=F6_SEG,
                                 documents=[_ticket("7381232763844", "Nguyen Van An", 801000, 49000, pd=True)]))
    assert {p["ticket_number"] for p in doc["passengers"]} == {"7381232558119", "7381232558120"}
    assert doc["total_amount"] == 2 * 1364181
    assert result.review_reasons and doc["needs_review"] == 1


def test_changed_price_on_a_known_ticket_is_flagged():
    doc, result = _apply(_reissue_original(), _x(code="QWE456", segments=F6_SEG,
                                            documents=[_ticket("7381232558119", "Nguyen Van An", 756000, 1400000)]))
    assert any("1,364,181" in r and "1,400,000" in r for r in result.review_reasons)


# Segments and schedule changes
def test_schedule_change_updates_departure_and_status():
    booking = _apply(None, _x(code="QWE456", segments=[_seg("VN8441", "TBB", "SGN", "2026-08-18T18:50", "2026-08-18T19:50")],
                              documents=[_ticket("7381232558119", "Nguyen Van An", 756000, 1364181)]))[0]
    change = _x("schedule_change", code="QWE456", documents=[],
                segments=[_seg("VN8441", "TBB", "SGN", "2026-08-18T19:20", "2026-08-18T20:20")],
                original=[_seg("VN8441", "TBB", "SGN", "2026-08-18T18:50", "2026-08-18T19:50")])
    doc, result = _apply(booking, change, meta=_meta("2026-08-18T06:40:03+00:00"))
    seg = doc["segments"][0]
    assert (seg["departure"], seg["arrival"], seg["original_departure"]) == (
        "2026-08-18 19:20:00", "2026-08-18 20:20:00", "2026-08-18 18:50:00")
    assert seg["name"] == booking["segments"][0]["name"]
    assert doc["status"] == "Changed" and doc["first_departure"] == "2026-08-18 19:20:00"
    assert "Schedule change 2026-08-18: VN8441 2026-08-18 18:50→2026-08-18 19:20" in doc["note"]
    assert result.review_reasons == []

    repeat, result = _apply(doc, change)  # airline re-sends the same notice
    assert repeat["segments"] == doc["segments"] and repeat["note"] == doc["note"] and result.review_reasons == []


def test_second_schedule_change_keeps_the_first_original_departure():
    doc = _reissue_original()
    for old, new in (("15:20", "18:50"), ("18:50", "19:20")):
        doc, _ = _apply(doc, _x("schedule_change", code="QWE456",
                                segments=[_seg("VN8441", "TBB", "SGN", f"2026-08-18T{new}", None)],
                                original=[_seg("VN8441", "TBB", "SGN", f"2026-08-18T{old}", None)]))
    seg = doc["segments"][0]
    assert (seg["departure"], seg["original_departure"]) == ("2026-08-18 19:20:00", "2026-08-18 15:20:00")
    assert doc["note"].count("Schedule change") == 2


def test_schedule_change_not_matching_the_booking_is_flagged_not_applied():
    doc, result = _apply(_reissue_original(), _x("schedule_change", code="QWE456",
                                            segments=[_seg("VN8441", "TBB", "SGN", "2026-08-18T21:00", None)],
                                            original=[_seg("VN8441", "TBB", "SGN", "2026-08-18T10:00", None)]))
    assert doc["segments"][0]["departure"] == "2026-08-18 15:20:00"
    assert doc["status"] == "Confirmed" and result.review_reasons


def test_ticket_issued_before_a_schedule_change_does_not_revert_it():
    doc, _ = _apply(_reissue_original(), _x("schedule_change", code="QWE456",
                                       segments=[_seg("VN8441", "TBB", "SGN", "2026-08-18T18:50", None)],
                                       original=[_seg("VN8441", "TBB", "SGN", "2026-08-18T15:20", None)]))
    stale, result = _apply(doc, _x(code="QWE456", segments=F6_SEG,
                                   documents=[_ticket("7381232558119", "Nguyen Van An", 756000, 1364181)]))
    assert stale["segments"] == doc["segments"] and stale["note"] == doc["note"] and result.review_reasons == []

    third, result = _apply(doc, _x(code="QWE456", documents=[_ticket("7381232558119", "Nguyen Van An", 756000, 1364181)],
                                   segments=[_seg("VN8441", "TBB", "SGN", "2026-08-18T21:00", "2026-08-18T22:00")]))
    assert third["segments"] == doc["segments"] and result.review_reasons


def test_ticket_with_moved_departure_records_original():
    moved = _x(documents=[_ticket("7381230076735", "Nguyen Van An")],
               segments=[_seg(departure="2026-03-30T07:05", arrival="2026-03-30T08:10"), FIVE_PAX_SEGS[1]])
    doc, _ = _apply(_five_pax(), moved)
    seg = doc["segments"][0]
    assert (seg["departure"], seg["original_departure"]) == ("2026-03-30 07:05:00", "2026-03-30 07:00:00")
    assert "VN1340" in doc["note"] and len(doc["segments"]) == 2


# EMD
def _one_pax():
    return _apply(None, _x(code="XYZ789", documents=[_ticket("7381230299050", "Nguyen Van An", 1546000, 2808000)]))[0]


def test_emd_seat_is_added_to_extras_of_the_related_ticket():
    doc, result = _apply(_one_pax(), _x("emd", code="XYZ789", segments=[],
                                       documents=[_emd("7381205743298", "7381230299050", 81000)]))
    p = doc["passengers"][0]
    assert p["extras"] == 81000 and "Seat Assignment, Seat: 20E" in p["extras_detail"]
    assert doc["total_amount"] == 2808000 + 81000 and result.review_reasons == []

    emd2 = _x("emd", code="XYZ789", segments=[], documents=[_emd("7381205754495", "7381230299050", 71000, "Seat: 3C")])
    doc, _ = _apply(doc, emd2)
    doc, _ = _apply(doc, emd2)  # re-sent with another Message-ID
    assert doc["passengers"][0]["extras"] == 152000


def test_emd_matches_a_previous_ticket_number():
    doc, _ = _apply(_reissue_original(), _x(code="QWE456", segments=F6_SEG,
                                       documents=[_ticket("7381232763844", "Nguyen Van An", 801000, 49000, pd=True)]))
    doc, _ = _apply(doc, _x("emd", code="QWE456", segments=[], documents=[_emd("7381205700001", "7381232558119", 81000)]))
    assert doc["passengers"][0]["extras"] == 81000


def test_emd_for_unknown_ticket_is_flagged():
    result = _merge(_one_pax(), _x("emd", code="XYZ789", segments=[],
                                  documents=[_emd("7381205743298", "7381230000000", 81000)]))
    assert (result.action, result.doc) == ("unmatched", None)  # not consumed: retried on a later run
    assert any("7381230000000" in r for r in result.review_reasons)


# Refund / booking summary
def _refund_booking():
    return _apply(None, _x(code="UIO567", documents=[_ticket("7381230076739", "Nguyen Van An")]))[0]


def test_completed_refund_sets_refunded_and_notes_once():
    pending = _x("refund", code="UIO567", segments=[], note="Airline quoted a 1930000 VND refund, pending passenger confirmation.")
    doc, _ = _apply(_refund_booking(), pending)
    assert doc["status"] == "Confirmed" and "pending passenger confirmation" in doc["note"]
    done = _x("refund", code="UIO567", segments=[], note="Refund completed for ticket 7381230076739.")
    doc, _ = _apply(doc, done)
    assert doc["status"] == "Refunded"
    assert len(doc["passengers"]) == 1 and doc["total_amount"] == 2430000  # nothing deleted
    assert doc["note"].count("Refund completed") == 1


def test_completed_refund_on_a_multi_passenger_booking_is_flagged():
    doc, result = _apply(_five_pax(), _x("refund", segments=[], note="Refund completed for ticket 7381230076739."))
    assert doc["status"] == "Confirmed" and result.review_reasons


def test_refund_suppresses_the_totals_cross_check():
    doc, _ = _apply(_refund_booking(), _x("refund", code="UIO567", segments=[], note="Refund completed."))
    invoice = _x("airline_invoice", code=None, segments=[], invoice_total=-1930000)
    doc, result = _apply(doc, invoice, source=_src(invoice, "7381230076739 -1.196.000"))
    assert doc["invoice_total"] == -1930000 and result.review_reasons == []


def test_booking_summary_only_adds_a_note():
    before = _five_pax()
    summary = _x("booking_summary", segments=[_seg("VN9999", "SGN", "HAN", "2026-05-01T10:00", "2026-05-01T12:00")],
                 note="VND 12.150.000 paid via Visa Card for 5 adults.")
    doc, result = _apply(before, summary)
    assert doc["segments"] == before["segments"] and doc["passengers"] == before["passengers"]
    assert "12.150.000" in doc["note"] and result.action == "updated"


# Idempotency, manual fields, project
def test_same_email_merged_twice_changes_nothing():
    extraction, meta = _x(documents=[_ticket("7381230076735", "Nguyen Van An")]), _meta()
    first = _merge(None, extraction, meta)
    assert _merge(None, extraction, meta).doc == first.doc  # deterministic
    saved = _saved(first.doc)
    second = _merge(saved, extraction, meta)
    assert (second.action, second.doc, second.review_reasons) == ("skipped", None, [])
    assert json.loads(saved["source_emails"])[0]["message_id"] == meta["message_id"]


def test_manual_employee_override_survives_remerge_and_reissue():
    doc = _reissue_original()
    doc["passengers"][0]["employee"] = "HR-EMP-0005"
    doc["manual_fields"] = json.dumps(["passengers.7381232558119.employee"])
    doc, _ = _apply(doc, _x(code="QWE456", segments=F6_SEG,
                            documents=[_ticket("7381232558119", "Nguyen Van An", 756000, 1364181)]))
    assert doc["passengers"][0]["employee"] == "HR-EMP-0005"
    doc, _ = _apply(doc, _x(code="QWE456", segments=F6_SEG,
                            documents=[_ticket("7381232763844", "Nguyen Van An", 801000, 49000, pd=True)]))
    assert doc["passengers"][0]["employee"] == "HR-EMP-0005"


def test_manual_total_wins_and_a_different_email_value_is_flagged():
    doc = _reissue_original()
    doc["passengers"][0]["total"] = 1300000
    doc["manual_fields"] = json.dumps(["passengers.7381232558119.total", "note"])
    doc["note"] = "Paid by card ending 1234"
    doc, result = _apply(doc, _x(code="QWE456", segments=F6_SEG,
                                 documents=[_ticket("7381232558119", "Nguyen Van An", 756000, 1364181)]))
    assert doc["passengers"][0]["total"] == 1300000
    assert any("passengers.7381232558119.total" in r for r in result.review_reasons)
    assert json.loads(doc["manual_fields"]) == ["passengers.7381232558119.total", "note"]


def test_pipeline_never_writes_project():
    created = _merge(None, _x(documents=[_ticket("7381230076735", "Nguyen Van An")])).doc
    assert "project" not in created
    existing = _five_pax()
    existing["project"] = "PROJ-0001"
    doc, _ = _apply(existing, _x(documents=[_ticket("7381230076735", "Nguyen Van An")]))
    assert doc["project"] == "PROJ-0001"


# Safety checks and staff match
def test_ungrounded_ticket_number_needs_review():
    extraction = _x(documents=[_ticket("7381230076735", "Nguyen Van An")])
    source = _src(extraction).replace("7381230076735", "7381230076000")
    result = _merge(None, extraction, source=source)
    assert result.doc["needs_review"] == 1
    assert any("7381230076735" in r for r in result.review_reasons)


def test_no_staff_match_is_flagged_and_reasons_are_deduplicated():
    doc, result = _apply(None, _x(documents=[_ticket("7381230076735", "Hoang Van Khach")]))
    assert result.review_reasons == ["no staff match for Hoang Van Khach"]
    doc, result = _apply(doc, _x(documents=[_ticket("7381230076735", "Hoang Van Khach")]))
    assert _reasons(doc) == ["no staff match for Hoang Van Khach"]
    assert doc["passengers"][0]["employee"] is None


def test_existing_booking_with_another_code_is_rejected():
    with pytest.raises(ValueError):
        _merge(_five_pax(), _x(code="XYZ789", documents=[_ticket("7381230299050", "Nguyen Van An")]))


@pytest.mark.parametrize("raw,expected", [("VietJetAir", "Vietjet Air"), ("  vietnam   airlines ", "Vietnam Airlines"),
                                          ("Sun PhuQuoc Airways", "Sun PhuQuoc Airways"),
                                          ("Pacific Airlines", "Pacific Airlines"), (None, "")])
def test_normalise_airline(raw, expected):
    assert normalise_airline(raw) == expected


# Review round 2: each case reproduces a money bug found by an adversarial review
def test_emd_listed_before_its_ticket_in_the_same_email_is_kept():
    x = _x(code="XYZ789", documents=[_emd("7381205743298", "7381230299050", 81000),
                                     _ticket("7381230299050", "Nguyen Van An", 1546000, 2808000)])
    doc, result = _apply(None, x)
    assert doc["passengers"][0]["extras"] == 81000 and doc["total_amount"] == 2889000
    assert result.review_reasons == []


def test_emd_for_a_ticket_not_yet_on_the_booking_is_unmatched_then_placed_on_retry():
    emd = _x("emd", code="XYZ789", segments=[],
             documents=[_emd("7381205743298", "7381230299051", 81000, name="Tran Thi Binh")])
    meta = _meta()
    early = _merge(_one_pax(), emd, meta)
    assert (early.action, early.doc) == ("unmatched", None) and early.review_reasons
    doc, _ = _apply(_one_pax(), _x(code="XYZ789", documents=[_ticket("7381230299051", "Tran Thi Binh", 1546000, 2808000)]))
    doc, retry = _apply(doc, emd, meta=meta)
    assert retry.action == "updated" and _pax(doc, "7381230299051")["extras"] == 81000
    doc, _ = _apply(doc, emd)  # a second delivery is not counted again
    assert doc["total_amount"] == 2 * 2808000 + 81000


@pytest.mark.parametrize("doc_type", ["emd", "ticket"])
def test_document_in_another_currency_is_not_added(doc_type):
    if doc_type == "emd":
        d = dict(_emd("7381205743298", "7381230299050", 25), currency="USD", fare_amount=20)
    else:
        d = dict(_ticket("7381230299051", "Tran Thi Binh", 100, 120), currency="USD")
    doc, result = _apply(_one_pax(), _x(doc_type, code="XYZ789", segments=[] if doc_type == "emd" else None, documents=[d]))
    assert doc["total_amount"] == 2808000 and len(doc["passengers"]) == 1
    assert any("USD" in r for r in result.review_reasons)


def test_previously_paid_ticket_at_or_above_fare_is_flagged():
    doc, result = _apply(None, _x(code="QWE456", segments=F6_SEG,
                                  documents=[_ticket("7381232763899", "Nguyen Van An", 200000, 350000, pd=True)]))
    assert doc["total_amount"] == 350000
    assert any("previously-paid" in r and "7381232763899" in r for r in result.review_reasons)


def test_full_receipt_for_a_reissued_number_keeps_the_original_total():
    doc, _ = _apply(_reissue_original(), _x(code="QWE456", segments=F6_SEG,
                                       documents=[_ticket("7381232763844", "Nguyen Van An", 801000, 49000, pd=True)]))
    doc, result = _apply(doc, _x(code="QWE456", segments=F6_SEG,
                                 documents=[_ticket("7381232763844", "Nguyen Van An", 801000, 1413181)]))
    p = doc["passengers"][0]
    assert (p["fare"], p["total"], p["change_fees"]) == (756000, 1364181, 49000)
    assert doc["total_amount"] == 1364181 + 49000
    assert any("1,364,181" in r and "1,413,181" in r for r in result.review_reasons)


def test_same_flight_number_on_two_dates_listed_later_first():
    out = _seg("VN1340", "SGN", "CXR", "2026-03-30T07:00", "2026-03-30T08:05")
    back = _seg("VN1340", "CXR", "SGN", "2026-04-05T07:00", "2026-04-05T08:05")
    doc, _ = _apply(None, _x(code="AAAAAA", segments=[out], documents=[_ticket("7381230000001", "Nguyen Van An")]))
    doc, result = _apply(doc, _x(code="AAAAAA", segments=[back, out], documents=[_ticket("7381230000001", "Nguyen Van An")]))
    rows = sorted((s["departure"], s["original_departure"], s["origin"]) for s in doc["segments"])
    assert rows == [("2026-03-30 07:00:00", None, "SGN"), ("2026-04-05 07:00:00", None, "CXR")]
    assert not doc["note"] and result.review_reasons == []


def test_per_passenger_invoices_only_cross_check_once_every_ticket_is_invoiced():
    doc = _five_pax()
    for i in range(5):
        invoice = _x("airline_invoice", code=None, segments=[], invoice_total=2430000)
        invoice["invoice"]["invoice_number"] = f"51234{i}"
        doc, result = _apply(doc, invoice, source=_src(invoice, f"738123007673{5 + i}"))
        assert result.review_reasons == []
    assert doc["invoice_total"] == 12150000 and doc["needs_review"] == 0

    doc = _five_pax()
    for i, amount in enumerate([2430000] * 4 + [2000000]):
        invoice = _x("airline_invoice", code=None, segments=[], invoice_total=amount)
        invoice["invoice"]["invoice_number"] = f"51234{i}"
        doc, result = _apply(doc, invoice, source=_src(invoice, f"738123007673{5 + i}"))
    assert result.review_reasons == ["ticket totals 12,150,000 ≠ invoice 11,720,000"]


def test_invoice_listing_emd_numbers_matches_the_booking():
    doc, _ = _apply(_one_pax(), _x("emd", code="XYZ789", segments=[],
                                  documents=[_emd("7381205743298", "7381230299050", 81000)]))
    invoice = _x("airline_invoice", code=None, segments=[], invoice_total=2889000)
    doc, result = _apply(doc, invoice, source=_src(invoice, "7381230299050 2.808.000\n7381205743298 81.000"))
    assert result.action == "updated" and result.review_reasons == [] and doc["invoice_total"] == 2889000


def test_redelivered_older_notices_after_a_second_change_raise_no_flag():
    doc = _reissue_original()
    reissue = _x(code="QWE456", segments=[_seg("VN8441", "TBB", "SGN", "2026-08-18T18:50", None)],
                 documents=[_ticket("7381232763844", "Nguyen Van An", 801000, 49000, pd=True)])
    first = _x("schedule_change", code="QWE456", segments=[_seg("VN8441", "TBB", "SGN", "2026-08-18T18:50", None)],
               original=[_seg("VN8441", "TBB", "SGN", "2026-08-18T15:20", None)])
    second = _x("schedule_change", code="QWE456", segments=[_seg("VN8441", "TBB", "SGN", "2026-08-18T19:20", None)],
                original=[_seg("VN8441", "TBB", "SGN", "2026-08-18T18:50", None)])
    for x in (first, reissue, second):
        doc, _ = _apply(doc, x)
    for x in (first, reissue):  # delivered again with new Message-IDs
        again, result = _apply(doc, x)
        assert result.review_reasons == [] and again["segments"] == doc["segments"] and again["note"] == doc["note"]
        assert again["total_amount"] == doc["total_amount"]


def test_format_error_becomes_a_review_reason():
    x = _x(documents=[_ticket("7381230076735", "Nguyen Van An")],
           segments=[_seg(destination="NHA"), FIVE_PAX_SEGS[1]])
    result = _merge(None, x)
    assert any("NHA" in r for r in result.review_reasons) and result.doc["needs_review"] == 1


# A reviewed booking is re-flagged only by a reason it doesn't already carry
def _reviewed_fee_only(prefix):
    doc, _ = _apply(None, _x(code="RTY234", segments=[_seg("VN7353", "CXR", "SGN", "2026-08-19T15:20", "2026-08-19T16:25")],
                             documents=[_ticket("7381232763864", "Nguyen Van An", 999000, 282000, pd=True)]))
    assert any("original ticket price unknown" in r for r in _reasons(doc))
    doc["needs_review"] = 0
    doc["review_reasons"] = prefix + doc["review_reasons"]
    return doc


@pytest.mark.parametrize("prefix", ["", "Reviewed by finance@merakiwp.com 2026-10-02: ",
                                    "Reviewed by Le Thi Ha 2026-10-03T09:15:00+07:00: Reviewed by a@b.com 2026-10-02: "])
def test_known_reason_does_not_reflag_a_reviewed_booking(prefix):
    doc = _reviewed_fee_only(prefix)
    before = doc["review_reasons"]
    doc, result = _apply(doc, _x("booking_summary", code="RTY234", segments=[], note="Paid VND 282.000"))
    assert (doc["needs_review"], result.review_reasons, doc["review_reasons"]) == (0, [], before)

    doc, result = _apply(doc, _x("emd", code="RTY234", segments=[],
                                 documents=[_emd("7381205743298", "7381230000000", 81000)]))
    assert result.action == "unmatched" and doc["needs_review"] == 0  # unmatched saves nothing
    doc, result = _apply(doc, _x(code="RTY234", segments=[_seg("VN7353", "CXR", "SGN", "2026-08-19T15:20", "2026-08-19T16:25")],
                                 documents=[_ticket("7381232763864", "Nguyen Van An", 999000, 282000, pd=True),
                                            _ticket("7381232763865", "Hoang Van Khach", 999000, 282000, pd=True)]))
    assert doc["needs_review"] == 1
    assert "no staff match for Hoang Van Khach" in result.review_reasons
    assert not any("Nguyen Van An" in r for r in result.review_reasons)


# Review round 3: event reasons always re-flag; state reasons are deduplicated
def _review(doc):
    doc = dict(doc, needs_review=0)
    if doc["review_reasons"]:
        doc["review_reasons"] = "Reviewed by finance@merakiwp.com 2026-10-02: " + doc["review_reasons"]
    return doc


def test_emd_in_a_ticket_email_for_an_unbooked_ticket_is_unmatched():
    x = _x(code="XYZ789", documents=[_ticket("7381230299050", "Nguyen Van An", 1546000, 2808000),
                                     _emd("7381205743299", "7381230299051", 71000, name="Tran Thi Binh")])
    result = _merge(_one_pax(), x)
    assert (result.action, result.doc) == ("unmatched", None) and result.review_reasons


def test_invoice_with_booking_code_and_no_ticket_numbers_is_cross_checked():
    invoice = _x("airline_invoice", code="XYZ789", segments=[], invoice_total=1000000)
    doc, result = _apply(_one_pax(), invoice, source=_src(invoice).replace("7381230299050", ""))
    assert "ticket totals 2,808,000 ≠ invoice 1,000,000" in result.review_reasons and doc["needs_review"] == 1


def test_second_refund_on_a_reviewed_booking_reflags():
    doc, _ = _apply(_five_pax(), _x("refund", segments=[], note="Refund completed for ticket 7381230076739."))
    doc, result = _apply(_review(doc), _x("refund", segments=[], note="Refund completed for ticket 7381230076735."))
    assert doc["needs_review"] == 1 and result.review_reasons


@pytest.mark.parametrize("make", [
    lambda: _x("schedule_change", code="QWE456", segments=[_seg("VN8441", "TBB", "SGN", "2026-08-18T21:00", None)],
               original=[]),
    lambda: _x("emd", code="QWE456", segments=[],
               documents=[dict(_emd(None, "7381232558119", 81000), total_amount=None)]),
    lambda: _x(code="QWE456", segments=F6_SEG, documents=[_ticket(None, "Le Van Khach", 1546000, 2808000)]),
], ids=["unapplied-schedule-change", "emd-without-total", "ticket-without-number"])
def test_repeated_event_from_a_new_email_reflags_a_reviewed_booking(make):
    doc, first = _apply(_reissue_original(), make())
    assert first.review_reasons
    meta = _meta("2026-08-20T10:00:00+00:00")
    doc, second = _apply(_review(doc), make(), meta=meta)
    assert doc["needs_review"] == 1 and second.review_reasons
    assert all(r.endswith(f"(2026-08-20, {meta['message_id'].strip('<>')})") for r in second.review_reasons)


def test_schedule_change_back_and_forth_applies_every_change():
    doc = _reissue_original()
    for old, new in (("15:20", "18:50"), ("18:50", "15:20"), ("15:20", "18:50")):
        doc, result = _apply(doc, _x("schedule_change", code="QWE456",
                                     segments=[_seg("VN8441", "TBB", "SGN", f"2026-08-18T{new}", None)],
                                     original=[_seg("VN8441", "TBB", "SGN", f"2026-08-18T{old}", None)]))
        assert doc["segments"][0]["departure"] == f"2026-08-18 {new}:00" and result.review_reasons == []


def test_full_receipt_for_a_fee_only_row_does_not_fill_the_total():
    doc, _ = _apply(None, _x(code="QWE456", segments=F6_SEG,
                             documents=[_ticket("7381232763844", "Nguyen Van An", 801000, 49000, pd=True)]))
    doc, result = _apply(doc, _x(code="QWE456", segments=F6_SEG,
                                 documents=[_ticket("7381232763844", "Nguyen Van An", 801000, 1413181)]))
    p = doc["passengers"][0]
    assert (p["total"], p["change_fees"]) == (0, 49000) and doc["total_amount"] == 49000
    assert any("may include its change fee" in r for r in result.review_reasons) and doc["needs_review"] == 1


def test_new_booking_takes_its_currency_from_the_ticket_not_an_emd():
    x = _x(code="GGGGGG", documents=[dict(_emd("7381205700001", "7381230000009", 25), currency="USD", fare_amount=20),
                                     _ticket("7381230000009", "Nguyen Van An")])
    doc, result = _apply(None, x)
    assert doc["currency"] == "VND" and doc["total_amount"] == 2430000
    assert any("USD" in r for r in result.review_reasons)


@pytest.mark.parametrize("note", ["Refund confirmed for ticket 7381230076739, refund 1930000 VND.",
                                  "Automatic reply to a refund request.", "Refund completed for ticket 7381230076739."])
def test_every_refund_email_is_flagged_for_finance_whatever_the_note_says(note):
    meta = dict(_meta("2026-03-30T02:09:20+00:00"), subject="Re: Yêu cầu hoàn vé UIO567 " + "x" * 100)
    doc, result = _apply(_review(_refund_booking()), _x("refund", code="UIO567", segments=[], note=note), meta=meta)
    expected = f"refund email: {meta['subject'][:80]}"
    if "7381230076739" in note:
        expected += " (ticket 7381230076739)"
    expected += f" — check refund amount and fee (2026-03-30, {meta['message_id'].strip('<>')})"
    assert expected in result.review_reasons and doc["needs_review"] == 1
    assert doc["status"] == ("Refunded" if "completed" in note else "Confirmed")


def test_event_suffix_has_no_angle_brackets_so_stored_text_is_stable():
    meta = _meta("2026-08-20T10:00:00+00:00", message_id="<CAB123@mail.gmail.com>")
    _, result = _apply(_reissue_original(), _x(code="QWE456", segments=F6_SEG,
                                          documents=[_ticket(None, "Le Van Khach", 1546000, 2808000)]), meta=meta)
    assert result.review_reasons == ["ticket for Le Van Khach has no ticket number; not merged "
                                     "(2026-08-20, CAB123@mail.gmail.com)"]


def test_html_escaped_legacy_reason_is_still_known():
    doc, result = _apply(None, _x(documents=[_ticket("7381230076735", "Hoang & Khach")]))
    assert result.review_reasons == ["no staff match for Hoang & Khach"]
    doc = dict(doc, needs_review=0,
               review_reasons="Reviewed by finance@merakiwp.com 2026-10-02: no staff match for Hoang &amp; Khach")
    doc, result = _apply(doc, _x(documents=[_ticket("7381230076735", "Hoang & Khach")]))
    assert (result.review_reasons, doc["needs_review"]) == ([], 0)


@pytest.mark.parametrize("subject", ["Automatic reply: Online support UIO567 - Yêu cầu hoàn vé",
                                     "AUTO-REPLY: refund request UIO567", "Tự động trả lời: Yêu cầu hoàn vé UIO567",
                                     "TỰ ĐỘNG TRẢ LỜI: Yêu cầu hoàn vé UIO567"])
def test_automatic_reply_to_a_refund_request_raises_no_reason(subject):
    meta = dict(_meta(), subject=subject)
    doc, result = _apply(_review(_refund_booking()), _x("refund", code="UIO567", segments=[],
                                                note="Automatic acknowledgement of a refund request."), meta=meta)
    assert result.action == "updated" and result.review_reasons == [] and doc["needs_review"] == 0
    assert json.loads(doc["source_emails"])[-1]["message_id"] == meta["message_id"]
