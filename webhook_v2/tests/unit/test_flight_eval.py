"""Unit tests for the flight_eval scoring helpers (MWP-72). Synthetic text only: no real emails in the repo."""

from webhook_v2.tools.flight_eval import differences, expected_types, is_eval_candidate, parse_doc, score_email

TICKET = """\
    Passenger: Test Person Ms (ADT)                                                   Issuing office:
    Booking ref: ABC123
    Ticket number: 738 1234567890                                                     Telephone: 1900
                                                                                      Date: 06Aug2026
    ELECTRONIC TICKET RECEIPT
    From                                      To                                    Flight              Departure             Arrival

    TUY HOA DONG TAC, VN                      HO CHI MINH CITY TAN SON NHAT         VN8441       18:50                        20:20
                                              INTL, VN                                           18Aug2026                    18Aug2026

    Class: Economy Lite, L                    Operated by: VIETNAM AIR SERVICE
    FARE DETAILS
    Fare: VND 801000
    Total amount: VND 1000000
"""
EMD = """\
    Passenger: Test Person Ms (ADT)
    Booking ref: ABC123
    Document Number: 738 1234567891
    In connection with: 738 1234567890
    Date: 07Aug2026
    Total amount: VND 81000
"""


def test_parse_ticket_receipt():
    doc = parse_doc(TICKET)
    assert doc["doc_type"] == "ticket"
    assert doc["passenger_name"] == "Test Person"
    assert doc["document_number"] == "7381234567890"
    assert doc["issue_date"] == "2026-08-06"
    assert (doc["fare_amount"], doc["total_amount"]) == (801000, 1000000)
    assert doc["_pnr"] == "ABC123"
    assert doc["_segments"] == [{"flight_no": "VN8441", "origin": "TBB", "destination": "SGN",
                                 "departure": "2026-08-18T18:50", "arrival": "2026-08-18T20:20",
                                 "fare_family": "Economy Lite", "booking_class": "L"}]


def test_parse_emd_and_non_receipt():
    emd = parse_doc(EMD)
    assert emd["doc_type"] == "emd" and emd["related_ticket_number"] == "7381234567890"
    assert parse_doc("Thank you for flying with us") is None


def test_expected_types_from_subject_and_sender():
    assert expected_types("Boarding Pass for X", "a@b.c", []) == {"boarding_pass"}
    assert expected_types("Travel Reservation", "a@b.c", [{"doc_type": "emd"}]) == {"emd"}
    assert expected_types("Travel Reservation", "a@b.c", [{"doc_type": "emd"}, {"doc_type": "ticket"}]) == {"ticket"}
    assert expected_types("Hoá đơn", "x@vietjetair.com", []) == {"airline_invoice"}
    assert expected_types("Hello", "x@y.z", []) == {"not_flight"}


def _result(**overrides):
    base = {"email_type": "ticket", "booking_code": "ABC123", "invoice": {},
            "segments": [{"flight_no": "VN8441", "origin": "TBB", "destination": "SGN", "departure": "2026-08-18T18:50",
                          "arrival": "2026-08-18T20:20", "fare_family": "Economy Lite", "booking_class": "L"}],
            "original_segments": [],
            "documents": [{"doc_type": "ticket", "passenger_name": "Test Person", "document_number": "7381234567890",
                           "related_ticket_number": None, "issue_date": "2026-08-06", "fare_amount": 801000,
                           "total_amount": 1000000, "has_previously_paid_items": False}]}
    return {**base, **overrides}


def test_score_email_perfect_and_wrong_amount():
    truth = [parse_doc(TICKET)]
    counters, errs = score_email("Đặt chỗ vào 30MAR - ABC123 cho X", "a@vietnamairlines.com", TICKET, _result(), truth)
    assert errs == [] and counters["docs_all_fields_ok"] == 1 and counters["type_ok"] == 1
    bad = _result()
    bad["documents"][0]["total_amount"] = 1000001
    counters, errs = score_email("Đặt chỗ vào 30MAR - ABC123 cho X", "a@vietnamairlines.com", TICKET, bad, truth)
    assert counters["docs_all_fields_ok"] == 0 and counters["ungrounded"] == 1
    assert any("total_amount" in e for e in errs)


def test_differences_ignore_note_and_boarding_pass():
    a = {"1": {"email_type": "ticket", "note": "x"}, "2": {"email_type": "boarding_pass", "segments": [1]},
         "3": {"email_type": "refund", "booking_code": "AAAAAA"}}
    b = {"1": {"email_type": "ticket", "note": "y"}, "2": {"email_type": "boarding_pass", "segments": []},
         "3": {"email_type": "refund", "booking_code": "BBBBBB"}}
    assert differences(a, b) == ["3"]


def test_eval_candidate_is_broader_than_production():
    assert is_eval_candidate("Shop <noreply@einvoice.com.vn>", "Hóa đơn điện tử số 1")
    assert not is_eval_candidate("Friend <friend@example.com>", "Lunch?")


def test_parse_doc_ignores_invoice_pdf_without_ticket_digits():
    assert parse_doc("HÓA ĐƠN\nSố vé: n/a\nTổng tiền: VND 100000") is None
