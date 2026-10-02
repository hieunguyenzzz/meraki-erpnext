"""Unit tests for the Flight Booking router (MWP-72), with an in-memory ERPNext and Postgres."""

import copy
import json
import threading

import pytest
from fastapi import HTTPException

from webhook_v2.processors.flight_merge import merge
from webhook_v2.processors.flights import sync_lock
from webhook_v2.config import settings
from webhook_v2.routers import flights as flights_router
from webhook_v2.routers.flights import (FlightPatch, get_flight, list_flights, list_staff, patch_flight, review_flight,
                                        start_sync, sync_status)

@pytest.fixture(autouse=True)
def _configured(monkeypatch):
    monkeypatch.setattr(settings, "openai_api_key", "sk-test")
    monkeypatch.setattr(settings, "hoadon_imap_password", "imap-test")


EMPLOYEES = [{"name": "HR-EMP-0002", "employee_name": "Trần Thị Bình", "status": "Active"},
             {"name": "HR-EMP-0001", "employee_name": "Nguyễn Văn An", "status": "Active"},
             {"name": "HR-EMP-0009", "employee_name": "Old Leaver", "status": "Left"}]


def _booking(name="FB-00001", code="ABC123", needs_review=0, employee="HR-EMP-0001", reasons=""):
    return {"name": name, "doctype": "Flight Booking", "booking_code": code, "airline": "Vietnam Airlines",
            "status": "Confirmed", "first_departure": "2026-03-30 07:00:00", "qty": 1, "total_amount": 2430000.0,
            "currency": "VND", "modified": "2026-10-02 06:00:00.000001", "project": None, "note": "", "needs_review": needs_review, "review_reasons": reasons,
            "invoice_total": 0.0, "manual_fields": "[]",
            "source_emails": json.dumps([{"message_id": "<m1@vna>", "subject": "s", "date": "2026-03-16",
                                          "email_type": "ticket"}]),
            "segments": [{"name": "s1", "flight_no": "VN1340", "origin": "SGN", "destination": "CXR",
                          "departure": "2026-03-30 07:00:00", "arrival": "2026-03-30 08:05:00",
                          "original_departure": None},
                         {"name": "s2", "flight_no": "VN6151", "origin": "CXR", "destination": "SGN",
                          "departure": "2026-04-01 20:55:00", "arrival": "2026-04-01 22:00:00",
                          "original_departure": None}],
            "passengers": [{"name": "p1", "passenger_name": "Nguyen Van An", "employee": employee,
                            "ticket_number": "7381234076735", "previous_ticket_numbers": "", "fare": 1196000.0,
                            "total": 2430000.0, "change_fees": 0.0, "extras": 0.0, "extras_detail": ""}]}


class FakeERPNext:
    def __init__(self, *docs):
        self.docs = {d["name"]: copy.deepcopy(d) for d in docs}
        self.calls, self.puts = [], []

    def _get(self, endpoint, params=None):
        self.calls.append((endpoint, params))
        if endpoint == "/api/resource/Employee":
            filters = json.loads((params or {}).get("filters") or "[]")
            active = ["status", "=", "Active"] in filters
            return {"data": [{"name": e["name"], "employee_name": e["employee_name"]} for e in EMPLOYEES
                             if not active or e["status"] == "Active"]}
        if endpoint == "/api/resource/Project":
            wanted = json.loads(params["filters"])[0][2]
            return {"data": [{"name": n, "project_name": f"Wedding {n}"} for n in wanted]}
        if endpoint == "/api/method/frappe.client.get_count":
            return {"message": sum(1 for d in self.docs.values() if d["needs_review"])}
        if endpoint == "/api/resource/Flight Booking":
            filters = json.loads(params["filters"])
            rows = [d for d in self.docs.values() if all(d.get(f) == v for f, op, v in filters if op == "=")]
            return {"data": [{"name": d["name"]} for d in rows]}
        return {"data": copy.deepcopy(self.docs[endpoint.rsplit("/", 1)[1]])}

    def _put(self, endpoint, data):
        self.puts.append(copy.deepcopy(data))
        self.docs[data["name"]] = copy.deepcopy(data)
        return {"data": copy.deepcopy(data)}


class FakeDB:
    def last_flight_run(self, statuses=None):
        return {"id": 3, "status": "ok", "started_at": "2026-10-02T06:00:00+07:00",
                "finished_at": "2026-10-02T06:04:00+07:00", "stats": {}, "error": None}

    def count_flight_emails(self, status):
        return {"failed": 2, "unmatched": 1}.get(status, 0)


def _list_filters(client):
    params = next(p for e, p in client.calls if e == "/api/resource/Flight Booking")
    return json.loads(params["filters"])


# Required (Task 10)
def test_list_filters_by_needs_review_and_returns_route_staff_and_sync_status():
    client = FakeERPNext(_booking(), _booking("FB-00002", "XYZ789", needs_review=1))
    result = list_flights(needs_review=True, _client=client, _db=FakeDB())
    assert ["needs_review", "=", 1] in _list_filters(client)
    assert [b["booking_code"] for b in result["bookings"]] == ["XYZ789"]
    booking = result["bookings"][0]
    assert booking["route"] == "SGN → CXR → SGN"
    assert booking["passengers"] == [{"passenger_name": "Nguyen Van An", "employee": "HR-EMP-0001",
                                      "employee_name": "Nguyễn Văn An", "ticket_number": "7381234076735"}]
    assert [s["flight_no"] for s in booking["segments"]] == ["VN1340", "VN6151"]
    assert result["sync"] == {"last_run": FakeDB().last_flight_run(), "failed_emails": 2, "unmatched_emails": 1,
                              "needs_review_count": 1}


def test_list_date_range_and_employee_filter():
    client = FakeERPNext(_booking(), _booking("FB-00002", "XYZ789", employee="HR-EMP-0002"))
    result = list_flights(date_from="2026-03-01", date_to="2026-03-31", employee="HR-EMP-0002",
                          _client=client, _db=FakeDB())
    filters = _list_filters(client)
    assert ["first_departure", ">=", "2026-03-01 00:00:00"] in filters
    assert ["first_departure", "<=", "2026-03-31 23:59:59"] in filters
    assert [b["booking_code"] for b in result["bookings"]] == ["XYZ789"]


def test_patch_project_records_project_in_manual_fields():
    client = FakeERPNext(_booking())
    result = patch_flight("FB-00001", FlightPatch(project="PROJ-0042"), "planner@x", False, _client=client)
    assert result["project"] == "PROJ-0042" and result["manual_fields"] == ["project"]
    assert json.loads(client.docs["FB-00001"]["manual_fields"]) == ["project"]


def test_planner_changing_a_total_gets_403_and_nothing_is_saved():
    client = FakeERPNext(_booking())
    req = FlightPatch.model_validate({"passengers": [{"ticket_number": "7381234076735", "total": 1}]})
    with pytest.raises(HTTPException) as exc:
        patch_flight("FB-00001", req, "planner@x", False, _client=client)
    assert exc.value.status_code == 403 and client.puts == []


def test_review_clears_the_flag_and_prefixes_each_reason():
    client = FakeERPNext(_booking(needs_review=1, reasons="no staff match for Nguyen Van An\n"
                                                           "Reviewed by a@x 2026-09-01: older reason"))
    result = review_flight("FB-00001", "finance@x", "2026-10-02 06:00:00.000001", _client=client)
    assert result["needs_review"] == 0
    assert result["review_reasons"][0].startswith("Reviewed by finance@x 20")
    assert result["review_reasons"][0].endswith(": no staff match for Nguyen Van An")
    assert result["review_reasons"][1] == "Reviewed by a@x 2026-09-01: older reason"  # not re-prefixed


# Merge round-trips: the router writes exactly what flight_merge reads
def _ticket_email(name="Nguyen Van An", number="7381234076735", message_id="<m2@vna>"):
    extraction = {"email_type": "ticket", "airline": "Vietnam Airlines", "booking_code": "ABC123",
                  "segments": [{"flight_no": "VN1340", "origin": "SGN", "destination": "CXR",
                                "departure": "2026-03-30T07:00", "arrival": "2026-03-30T08:05",
                                "fare_family": None, "booking_class": None},
                               {"flight_no": "VN6151", "origin": "CXR", "destination": "SGN",
                                "departure": "2026-04-01T20:55", "arrival": "2026-04-01T22:00",
                                "fare_family": None, "booking_class": None}],
                  "original_segments": [], "invoice": {"invoice_number": None, "invoice_date": None,
                                                       "invoice_total": None}, "note": "",
                  "documents": [{"doc_type": "ticket", "passenger_name": name, "document_number": number,
                                 "related_ticket_number": None, "issue_date": "2026-03-16", "fare_amount": 1196000,
                                 "total_amount": 2430000, "currency": "VND", "has_previously_paid_items": False,
                                 "service": None}]}
    meta = {"message_id": message_id, "subject": "s", "date": "2026-03-20T08:00:00+00:00"}
    return extraction, meta, json.dumps(extraction)


def test_review_then_merge_with_only_known_state_reasons_keeps_needs_review_0():
    # "Mr Stranger" matches no employee: a standing (state) reason.
    client = FakeERPNext(_booking(needs_review=1, employee=None, reasons="no staff match for Mr Stranger"))
    client.docs["FB-00001"]["passengers"][0]["passenger_name"] = "Mr Stranger"
    review_flight("FB-00001", "finance@x", "2026-10-02 06:00:00.000001", _client=client)
    extraction, meta, src = _ticket_email(name="Mr Stranger")
    result = merge(client.docs["FB-00001"], extraction, meta, EMPLOYEES, src)
    assert result.action == "updated" and result.review_reasons == []
    assert result.doc["needs_review"] == 0


def test_finance_total_change_is_kept_by_the_next_merge():
    client = FakeERPNext(_booking())
    req = FlightPatch.model_validate({"passengers": [{"ticket_number": "7381234076735", "total": 2500000}]})
    result = patch_flight("FB-00001", req, "finance@x", True, _client=client)
    assert result["total_amount"] == 2500000 and result["manual_fields"] == ["passengers.7381234076735.total"]
    extraction, meta, src = _ticket_email()
    merged = merge(client.docs["FB-00001"], extraction, meta, EMPLOYEES, src)
    assert merged.doc["passengers"][0]["total"] == 2500000


def test_unlinking_an_employee_is_manual_and_the_sync_never_relinks_it():
    client = FakeERPNext(_booking(reasons="Reviewed by f@x 2026-09-01: something else"))
    for unlink in (None, ""):
        client.docs["FB-00001"]["passengers"][0]["employee"] = "HR-EMP-0001"
        client.docs["FB-00001"]["manual_fields"] = "[]"
        req = FlightPatch.model_validate({"passengers": [{"ticket_number": "7381234076735", "employee": unlink}]})
        result = patch_flight("FB-00001", req, "planner@x", False, _client=client)
        assert result["passengers"][0]["employee"] is None
        assert result["manual_fields"] == ["passengers.7381234076735.employee"]
        assert result["review_reasons"] == ["Reviewed by f@x 2026-09-01: something else"]  # reasons untouched
    extraction, meta, src = _ticket_email()  # "Nguyen Van An" would match HR-EMP-0001
    merged = merge(client.docs["FB-00001"], extraction, meta, EMPLOYEES, src)
    assert merged.doc["passengers"][0]["employee"] is None


def test_unlinking_an_already_empty_employee_still_pins_it():
    client = FakeERPNext(_booking(employee=None))
    req = FlightPatch.model_validate({"passengers": [{"ticket_number": "7381234076735", "employee": None}]})
    result = patch_flight("FB-00001", req, "planner@x", False, _client=client)
    assert result["manual_fields"] == ["passengers.7381234076735.employee"] and len(client.puts) == 1
    patch_flight("FB-00001", req, "planner@x", False, _client=client)  # already pinned and unchanged: no save
    assert len(client.puts) == 1


def test_patch_with_unknown_ticket_is_400_and_noop_patch_does_not_save():
    client = FakeERPNext(_booking())
    req = FlightPatch.model_validate({"passengers": [{"ticket_number": "1", "employee": "HR-EMP-0002"}]})
    with pytest.raises(HTTPException) as exc:
        patch_flight("FB-00001", req, "planner@x", False, _client=client)
    assert exc.value.status_code == 400
    patch_flight("FB-00001", FlightPatch(project=None, note=""), "planner@x", False, _client=client)
    assert client.puts == []


def test_staff_lists_active_employees_sorted_by_name():
    assert list_staff(_client=FakeERPNext()) == [{"id": "HR-EMP-0001", "name": "Nguyễn Văn An"},
                                                 {"id": "HR-EMP-0002", "name": "Trần Thị Bình"}]


def test_detail_parses_json_fields():
    result = get_flight("FB-00001", _client=FakeERPNext(_booking(reasons="a\nb")))
    assert result["review_reasons"] == ["a", "b"] and result["source_emails"][0]["message_id"] == "<m1@vna>"
    assert result["passengers"][0]["employee_name"] == "Nguyễn Văn An"


# Sync now
def test_sync_returns_409_while_a_run_holds_the_lock():
    assert sync_lock.acquire(blocking=False)
    try:
        with pytest.raises(HTTPException) as exc:
            start_sync("finance@x", _processor_factory=lambda: pytest.fail("must not run"))
        assert exc.value.status_code == 409
    finally:
        sync_lock.release()


def test_sync_runs_in_the_background_and_releases_the_lock():
    ran, release = threading.Event(), threading.Event()

    class Processor:
        def __init__(self):
            self.lock_acquired = threading.Event()

        def run(self):
            self.lock_acquired.set()
            ran.set()
            release.wait(5)
            return {"processed": 0}

    assert start_sync("finance@x", _processor_factory=Processor) == {"started": True}
    assert ran.wait(5) and sync_lock.locked()
    with pytest.raises(HTTPException):
        start_sync("finance@x", _processor_factory=Processor)  # concurrent request refused
    release.set()
    for _ in range(100):
        if not sync_lock.locked():
            break
        threading.Event().wait(0.05)
    assert not sync_lock.locked()


def test_patch_racing_a_sync_returns_409():
    import requests

    client = FakeERPNext(_booking())
    response = requests.Response()
    response.status_code, response._content = 417, b'{"exception": "frappe.exceptions.TimestampMismatchError: x"}'

    def stale_put(endpoint, data):
        raise requests.HTTPError(response=response)

    client._put = stale_put
    with pytest.raises(HTTPException) as exc:
        patch_flight("FB-00001", FlightPatch(note="x"), "planner@x", False, _client=client)
    assert exc.value.status_code == 409


# Review round 3
def test_review_of_a_booking_changed_since_the_page_loaded_is_409_and_nothing_is_cleared():
    client = FakeERPNext(_booking(needs_review=1, reasons="new reason the reviewer never saw"))
    with pytest.raises(HTTPException) as exc:
        review_flight("FB-00001", "finance@x", "2026-10-01 09:00:00.000000", _client=client)
    assert exc.value.status_code == 409 and "reload" in exc.value.detail and client.puts == []


def test_list_and_detail_return_modified_for_the_review_guard():
    client = FakeERPNext(_booking())
    assert list_flights(_client=client, _db=FakeDB())["bookings"][0]["modified"] == "2026-10-02 06:00:00.000001"
    assert get_flight("FB-00001", _client=client)["modified"] == "2026-10-02 06:00:00.000001"


def test_sync_status_alone_does_not_fetch_bookings():
    client = FakeERPNext(_booking(needs_review=1))
    assert sync_status(_client=client, _db=FakeDB()) == {
        "last_run": FakeDB().last_flight_run(), "failed_emails": 2, "unmatched_emails": 1, "needs_review_count": 1}
    assert not any(e.startswith("/api/resource/Flight Booking") for e, _ in client.calls)


def test_list_reports_truncated_when_the_cap_is_hit(monkeypatch):
    monkeypatch.setattr(flights_router, "LIST_LIMIT", 2)
    client = FakeERPNext(_booking(), _booking("FB-00002", "B2"), _booking("FB-00003", "B3"))
    result = list_flights(_client=client, _db=FakeDB())
    assert result["truncated"] is True and len(result["bookings"]) == 2
    assert list_flights(_client=FakeERPNext(_booking()), _db=FakeDB())["truncated"] is False



def test_sync_returns_409_when_another_process_holds_the_advisory_lock():
    from webhook_v2.processors.flights import SyncAlreadyRunning

    class Busy:
        lock_acquired = threading.Event()

        def run(self):
            raise SyncAlreadyRunning("held by another process")

    with pytest.raises(HTTPException) as exc:
        start_sync("finance@x", _processor_factory=Busy)
    assert exc.value.status_code == 409
    for _ in range(100):
        if not sync_lock.locked():
            break
        threading.Event().wait(0.05)
    assert not sync_lock.locked()


def test_sync_start_failure_hides_the_raw_error_from_the_caller(capsys):
    class DbDown:
        lock_acquired = threading.Event()

        def run(self):
            raise RuntimeError('connection to server at "10.0.0.5", port 5432 failed for user "meraki"')

    with pytest.raises(HTTPException) as exc:
        start_sync("finance@x", _processor_factory=DbDown)
    assert exc.value.status_code == 500
    assert exc.value.detail == "Could not start the flight sync; see server logs"
    assert "10.0.0.5" in capsys.readouterr().out  # the full error is still logged


def _link(client, employee):
    req = FlightPatch.model_validate({"passengers": [{"ticket_number": "7381234076735", "employee": employee}]})
    return patch_flight("FB-00001", req, "planner@x", False, _client=client)


def test_linking_an_employee_drops_their_no_staff_match_reason_and_clears_the_flag():
    client = FakeERPNext(_booking(needs_review=1, employee=None, reasons=(
        "no staff match for Nguyen Van An\n"
        "Reviewed by f@x 2026-09-01: no staff match for Nguyen Van An\n"
        "Reviewed by f@x 2026-09-01: ticket totals 1 ≠ invoice 2\n"
        "no staff match for Someone Else Entirely")))
    client.docs["FB-00001"]["passengers"].append({**client.docs["FB-00001"]["passengers"][0], "name": "p2",
                                                  "passenger_name": "Someone Else Entirely",
                                                  "ticket_number": "7381234076736"})
    result = _link(client, "HR-EMP-0001")
    assert result["review_reasons"] == ["Reviewed by f@x 2026-09-01: ticket totals 1 ≠ invoice 2",
                                        "no staff match for Someone Else Entirely"]
    assert result["needs_review"] == 1  # another passenger is still unmatched

    req = FlightPatch.model_validate({"passengers": [{"ticket_number": "7381234076736", "employee": "HR-EMP-0002"}]})
    result = patch_flight("FB-00001", req, "planner@x", False, _client=client)
    assert result["review_reasons"] == ["Reviewed by f@x 2026-09-01: ticket totals 1 ≠ invoice 2"]
    assert result["needs_review"] == 0  # only reviewed lines remain


def test_linking_keeps_the_flag_when_other_unreviewed_reasons_remain():
    client = FakeERPNext(_booking(needs_review=1, employee=None,
                                  reasons="no staff match for Nguyen Van An\nrefund email: check amount"))
    result = _link(client, "HR-EMP-0001")
    assert result["review_reasons"] == ["refund email: check amount"] and result["needs_review"] == 1


def test_unlinking_leaves_reasons_and_flag_as_they_are():
    reasons = "no staff match for Nguyen Van An\nReviewed by f@x 2026-09-01: no staff match for Nguyen Van An"
    client = FakeERPNext(_booking(needs_review=1, reasons=reasons))
    result = _link(client, None)
    assert result["review_reasons"] == reasons.splitlines() and result["needs_review"] == 1



def test_sync_is_503_when_not_configured(monkeypatch):
    monkeypatch.setattr(settings, "openai_api_key", "")
    with pytest.raises(HTTPException) as exc:
        start_sync("finance@x", _processor_factory=lambda: pytest.fail("must not run"))
    assert (exc.value.status_code, exc.value.detail) == (503, "Flight sync is not configured")
    assert not sync_lock.locked()


def test_list_includes_the_project_name():
    linked = _booking("FB-00002", "XYZ789")
    linked["project"] = "PROJ-0042"
    result = list_flights(_client=FakeERPNext(_booking(), linked), _db=FakeDB())
    names = {b["name"]: b["project_name"] for b in result["bookings"]}
    assert names == {"FB-00001": None, "FB-00002": "Wedding PROJ-0042"}


def test_linking_matches_the_reason_by_name_tokens_not_exact_text():
    client = FakeERPNext(_booking(needs_review=1, employee=None,
                                  reasons="no staff match for MR NGUYEN VAN AN\nno staff match for Nguyen Van Anh"))
    result = _link(client, "HR-EMP-0001")  # passenger printed as "Nguyen Van An"
    assert result["review_reasons"] == ["no staff match for Nguyen Van Anh"] and result["needs_review"] == 1
