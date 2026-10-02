"""Unit tests for flight extraction safety checks (MWP-72). Cases come from real eval findings."""

import pytest

from webhook_v2.processors.flight_checks import (
    format_errors,
    grounding_errors,
    is_change_fee,
    match_employee,
    normalise_name,
)


def _seg(**overrides):
    seg = {"flight_no": "VN1340", "origin": "SGN", "destination": "HAN",
           "departure": "2026-10-10T08:00", "arrival": "2026-10-10T10:10"}
    return {**seg, **overrides}


def _extraction(**overrides):
    base = {"email_type": "ticket", "booking_code": "ABC123", "segments": [_seg()],
            "original_segments": [], "documents": [], "invoice": {}}
    return {**base, **overrides}


def _doc(**overrides):
    doc = {"doc_type": "ticket", "document_number": "7381234567890", "related_ticket_number": None,
           "fare_amount": 801000, "total_amount": 49000, "has_previously_paid_items": False}
    return {**doc, **overrides}


# Grounding
def test_ticket_number_missing_from_source_is_reported():
    extraction = _extraction(documents=[_doc(fare_amount=None, total_amount=None)])
    errors = grounding_errors(extraction, "Booking ref: ABC123 VN1340 ticket 7381234567000")
    assert any("7381234567890" in e for e in errors)


def test_grounded_extraction_has_no_errors():
    extraction = _extraction(documents=[_doc()])
    source = "Booking ref: ABC 123\nVN1340\nTicket 738 1234 567890\nFare: 801.000 Total: 49,000"
    assert grounding_errors(extraction, source) == []


def test_negative_invoice_total_is_grounded_against_dotted_source():
    extraction = _extraction(email_type="airline_invoice", segments=[],
                             invoice={"invoice_number": None, "invoice_date": None, "invoice_total": -1930000})
    assert grounding_errors(extraction, "ABC123 Tổng tiền thanh toán: -1.930.000") == []


def test_booking_code_missing_from_source_is_reported():
    assert grounding_errors(_extraction(segments=[]), "nothing here")


def test_truncated_amount_is_not_grounded():
    extraction = _extraction(documents=[_doc(fare_amount=None, total_amount=80100)])
    assert any("80100" in e for e in grounding_errors(extraction, "ABC123 VN1340 Total: 801.000"))


def test_partial_group_of_thousands_is_not_grounded():
    extraction = _extraction(email_type="airline_invoice", segments=[],
                             invoice={"invoice_number": None, "invoice_date": None, "invoice_total": 930000})
    assert grounding_errors(extraction, "ABC123 Total 1.930.000")


def test_decimal_suffix_and_spaced_groups_are_grounded():
    extraction = _extraction(segments=[], documents=[_doc(document_number="738-1234567890", fare_amount=None,
                                                          total_amount=1930000)])
    assert grounding_errors(extraction, "ABC123 Ticket 738-1234567890 Total 1,930,000.00") == []
    assert grounding_errors(_extraction(segments=[], documents=[_doc(fare_amount=None, total_amount=1930000)]),
                            "ABC123 7381234567890 Total 1 930 000") == []


def test_negative_value_needs_minus_sign_in_source():
    extraction = _extraction(email_type="airline_invoice", segments=[],
                             invoice={"invoice_number": None, "invoice_date": None, "invoice_total": -1930000})
    assert grounding_errors(extraction, "ABC123 Total 1.930.000")
    assert grounding_errors(extraction, "ABC123 Total \u22121.930.000") == []
    assert grounding_errors(extraction, "ABC123 Total (1.930.000)") == []


def test_parenthesised_amount_with_trailing_text_is_not_negative():
    extraction = _extraction(email_type="airline_invoice", segments=[],
                             invoice={"invoice_number": None, "invoice_date": None, "invoice_total": -1930000})
    assert grounding_errors(extraction, "ABC123 Tổng tiền (1.930.000 VND)")
    assert grounding_errors(extraction, "ABC123 Total (1.930.000)") == []
    assert grounding_errors(extraction, "ABC123 Total  -1.930.000") == []


def test_hyphen_joined_to_a_word_or_digit_is_not_a_minus():
    extraction = _extraction(email_type="airline_invoice", segments=[],
                             invoice={"invoice_number": None, "invoice_date": None, "invoice_total": -1930000})
    assert grounding_errors(extraction, "ABC123 Ref VN-1.930.000")
    assert grounding_errors(extraction, "ABC123 2026-1.930.000")


def test_number_at_start_of_source_is_not_negative():
    extraction = _extraction(email_type="airline_invoice", segments=[], booking_code=None,
                             invoice={"invoice_number": None, "invoice_date": None, "invoice_total": -1930000})
    assert grounding_errors(extraction, "1.930.000 total")


def test_positive_value_needs_unsigned_occurrence():
    extraction = _extraction(email_type="airline_invoice", segments=[],
                             invoice={"invoice_number": None, "invoice_date": None, "invoice_total": 1930000})
    assert grounding_errors(extraction, "ABC123 Total -1.930.000")


# Format
@pytest.mark.parametrize("flight_no", ["BL/VN6151", "VN", "vn1340"])
def test_bad_flight_numbers_fail(flight_no):
    assert format_errors(_extraction(segments=[_seg(flight_no=flight_no)]))


def test_city_code_nha_is_not_an_airport():
    assert format_errors(_extraction(segments=[_seg(destination="NHA")]))


def test_arrival_before_departure_fails():
    seg = _seg(departure="2026-10-10T10:00", arrival="2026-10-10T08:00")
    assert format_errors(_extraction(segments=[seg]))


@pytest.mark.parametrize("seg", [_seg(), _seg(flight_no="9G1955"), _seg(destination="CXR"), _seg(origin="TBB")])
def test_valid_segments_pass(seg):
    assert format_errors(_extraction(segments=[seg])) == []


def test_non_positive_amount_fails_but_negative_invoice_total_allowed():
    assert format_errors(_extraction(documents=[_doc(total_amount=0)]))
    ok = _extraction(email_type="airline_invoice", segments=[],
                     invoice={"invoice_number": "1", "invoice_date": None, "invoice_total": -1930000})
    assert format_errors(ok) == []


# Change fee
def test_change_fee_detected():
    assert is_change_fee(_doc(fare_amount=801000, total_amount=49000, has_previously_paid_items=True))


def test_normal_ticket_is_not_change_fee():
    assert not is_change_fee(_doc(fare_amount=1196000, total_amount=2430000, has_previously_paid_items=True))


def test_lower_total_without_previously_paid_is_not_change_fee():
    assert not is_change_fee(_doc(fare_amount=801000, total_amount=49000, has_previously_paid_items=False))


def test_emd_is_not_change_fee():
    assert not is_change_fee(_doc(doc_type="emd", has_previously_paid_items=True))


# Names
def test_eth_character_maps_to_d():
    assert normalise_name("Nguyễn Văn Ðức") == frozenset({"nguyen", "van", "duc"})


def test_normalise_name_strips_accents_titles_and_d_bar():
    assert normalise_name("Mr. Đỗ Thị  Hà-Linh") == frozenset({"do", "thi", "ha", "linh"})


EMPLOYEES = [
    {"name": "HR-EMP-0001", "employee_name": "Trần Thụy Minh Anh"},
    {"name": "HR-EMP-0002", "employee_name": "Đỗ Thị Thu Hà"},
]


def test_reordered_passenger_name_matches():
    assert match_employee("Minh Anh Tran Thuy", EMPLOYEES) == "HR-EMP-0001"


def test_d_bar_name_matches():
    assert match_employee("Do Thi Thu Ha", EMPLOYEES) == "HR-EMP-0002"


def test_ambiguous_names_return_none():
    twins = EMPLOYEES + [{"name": "HR-EMP-0003", "employee_name": "Anh Minh Trần Thụy"}]
    assert match_employee("Minh Anh Tran Thuy", twins) is None


def test_no_match_returns_none():
    assert match_employee("Nguyen Van A", EMPLOYEES) is None
