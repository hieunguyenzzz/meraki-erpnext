"""Unit tests for the flight bookings run (MWP-72): mailbox, extractor, Postgres and ERPNext are in-memory fakes."""

import copy
import json
from contextlib import contextmanager
from datetime import date, datetime, timedelta, timezone
from email.message import EmailMessage

import pytest
import requests

from webhook_v2.processors import flights
from webhook_v2.processors.flights import FlightProcessor, SyncAlreadyRunning, email_key
from webhook_v2.services.flight_extractor import ExtractionError, build_input
from webhook_v2.services.flight_mailbox import RawEmail, UidValidityChanged

@pytest.fixture(autouse=True)
def _configured(monkeypatch):
    monkeypatch.setattr(flights.settings, "openai_api_key", "sk-test")
    monkeypatch.setattr(flights.settings, "hoadon_imap_password", "imap-test")


EMPLOYEES = [{"name": "HR-EMP-0001", "employee_name": "Nguyễn Văn An"},
             {"name": "HR-EMP-0002", "employee_name": "Trần Thị Bình"}]
SEGS = [{"flight_no": "VN1340", "origin": "SGN", "destination": "CXR", "departure": "2026-03-30T07:00",
         "arrival": "2026-03-30T08:05", "fare_family": "Economy", "booking_class": "X"}]


def _ticket(number, name="Nguyen Van An", fare=1196000, total=2430000):
    return {"doc_type": "ticket", "passenger_name": name, "document_number": number, "related_ticket_number": None,
            "issue_date": "2026-03-16", "fare_amount": fare, "total_amount": total, "currency": "VND",
            "has_previously_paid_items": False, "service": None}


def _emd(number, related, total=81000):
    return {"doc_type": "emd", "passenger_name": "Nguyen Van An", "document_number": number,
            "related_ticket_number": related, "issue_date": "2026-03-29", "fare_amount": total, "total_amount": total,
            "currency": "VND", "has_previously_paid_items": False, "service": "Seat"}


def _x(email_type="ticket", code="ABC123", documents=(), invoice=None, segments=None):
    return {"email_type": email_type, "airline": "Vietnam Airlines", "booking_code": code,
            "segments": SEGS if segments is None else segments, "original_segments": [], "documents": list(documents),
            "invoice": invoice or {"invoice_number": None, "invoice_date": None, "invoice_total": None}, "note": ""}


def _email(uid, extraction, day=1, message_id=None):
    """A raw .eml whose body carries the extraction JSON, so every extracted value is grounded."""
    msg = EmailMessage()
    msg["From"], msg["Subject"] = "no-reply@vietnamairlines.com", f"Booking {uid}"
    msg.set_content(json.dumps(extraction, ensure_ascii=False))
    when = datetime(2026, 3, day, 8, 0, tzinfo=timezone.utc)
    return RawEmail(uid=uid, message_id=f"<m{uid}@vna>" if message_id is None else message_id,
                    subject=f"Booking {uid}", sender="no-reply@vietnamairlines.com", date=when, raw=msg.as_bytes(),
                    folder="[Gmail]/All Mail", uidvalidity=1)


class FakeDB:
    def __init__(self):
        self.emails, self.runs = {}, []
        self.held_elsewhere, self.holding = False, False  # the Postgres advisory lock

    @contextmanager
    def flight_run_lock(self):
        granted = not self.held_elsewhere
        self.holding = granted
        try:
            yield granted
        finally:
            self.holding = False

    def start_flight_run(self):
        self.runs.append({"id": len(self.runs) + 1, "status": "running",
                          "started_at": datetime(2026, 10, 2, tzinfo=timezone.utc)})
        return len(self.runs)

    def finish_flight_run(self, run_id, status, stats, error=None):
        self.runs[run_id - 1].update(status=status, stats=stats, error=error)

    def interrupt_flight_runs(self):
        assert self.holding, "only while holding the advisory lock"
        for r in self.runs:
            if r["status"] == "running":
                r.update(status="error", error="interrupted")

    def last_flight_run(self, statuses=None):
        runs = [r for r in self.runs if not statuses or r["status"] in statuses]
        return runs[-1] if runs else None

    def get_flight_email(self, message_id):
        return copy.deepcopy(self.emails.get(message_id))

    def upsert_flight_email(self, message_id, **fields):
        row = self.emails.setdefault(message_id, {"message_id": message_id, "attempts": 0})
        row.update(copy.deepcopy(fields))
        row["attempts"] += fields["status"] == "failed"

    def flight_emails_to_retry(self, max_attempts):
        return [copy.deepcopy(r) for r in self.emails.values()
                if r["status"] == "unmatched" or (r["status"] == "failed" and r["attempts"] < max_attempts)]


class FakeMailbox:
    def __init__(self, emails, uidvalidity=1):
        self.emails = list(emails)
        self.by_uid_calls, self.bodies_skipped, self.uidvalidity = [], [], uidvalidity

    def fetch_since(self, since, skip=None):
        self.since = since
        for e in self.emails:
            if skip and e.message_id and skip(e.message_id):
                self.bodies_skipped.append(e.message_id)
                continue
            yield e

    def fetch_by_uid(self, uids, folder=None, uidvalidity=None):
        if uidvalidity is not None and uidvalidity != self.uidvalidity:
            raise UidValidityChanged(f"UIDVALIDITY of {folder} is now {self.uidvalidity}, was {uidvalidity}")
        self.by_uid_calls.append(list(uids))
        return iter([e for e in self.emails if e.uid in uids])


class FakeERPNext:
    """Flight Booking + Employee resources, saving like ERPNext: names on docs and child rows."""

    def __init__(self):
        self.docs, self.puts, self.posts = {}, [], []

    def _get(self, endpoint, params=None):
        if endpoint == "/api/resource/Employee":
            return {"data": EMPLOYEES}
        if endpoint == "/api/resource/Flight Booking":
            filters = json.loads((params or {}).get("filters") or "[]")
            return {"data": [{"name": n} for n, d in self.docs.items() if all(d.get(f) == v for f, _, v in filters)]}
        name = endpoint.rsplit("/", 1)[1].replace("%20", " ")
        return {"data": copy.deepcopy(self.docs[name])}

    def _store(self, doc):
        doc = copy.deepcopy(doc)
        for table in ("segments", "passengers"):
            for i, row in enumerate(doc.get(table) or [], 1):
                row.setdefault("name", f"{doc['name']}-{table}-{i}")
        self.docs[doc["name"]] = doc
        return {"data": copy.deepcopy(doc)}

    def _post(self, endpoint, data):
        self.posts.append(data)
        return self._store({**data, "name": f"FB-{len(self.docs) + 1:05d}"})

    def _put(self, endpoint, data):
        self.puts.append(data)
        return self._store(data)


class FakeExtractor:
    def __init__(self):
        self.calls, self.fail_raws = [], set()

    def __call__(self, raw):
        self.calls.append(raw)
        _, source_text = build_input(raw)
        extraction = json.JSONDecoder().raw_decode(source_text.split("===== Email body =====\n", 1)[1])[0]
        if extraction.get("_fail") or raw in self.fail_raws:
            raise ExtractionError("model timed out")
        return extraction, source_text


def _processor(emails, erp=None, db=None, extractor=None):
    return FlightProcessor(db=db or FakeDB(), mailbox=FakeMailbox(emails), client=erp or FakeERPNext(),
                           extractor=extractor or FakeExtractor())


def _only(erp):
    assert len(erp.docs) == 1
    return next(iter(erp.docs.values()))


# Required (Task 8)
def test_second_run_skips_done_emails():
    emails = [_email(1, _x(documents=[_ticket("7381234076735")]))]
    erp, db, extractor = FakeERPNext(), FakeDB(), FakeExtractor()
    first = _processor(emails, erp, db, extractor).run(since=date(2026, 1, 1))
    second = _processor(emails, erp, db, extractor).run(since=date(2026, 1, 1))
    assert first["created"] == 1 and second["processed"] == 0
    assert len(extractor.calls) == 1 and len(erp.docs) == 1 and erp.puts == []


def test_failure_is_recorded_and_next_email_still_processed():
    bad = _x(documents=[_ticket("7381234076735")]) | {"_fail": True}
    emails = [_email(1, bad, day=1), _email(2, _x(documents=[_ticket("7381234076736")]), day=2)]
    db, erp = FakeDB(), FakeERPNext()
    stats = _processor(emails, erp, db).run(since=date(2026, 1, 1))
    assert stats["failed"] == 1 and stats["created"] == 1
    assert db.emails["<m1@vna>"]["status"] == "failed" and "model timed out" in db.emails["<m1@vna>"]["error"]
    assert db.emails["<m1@vna>"]["attempts"] == 1
    assert db.emails["<m2@vna>"]["status"] == "done" and db.emails["<m2@vna>"]["error"] is None
    assert db.runs[-1]["status"] == "partial"


def test_failed_email_stops_after_three_attempts():
    emails = [_email(1, _x(documents=[_ticket("7381234076735")]) | {"_fail": True})]
    db, extractor = FakeDB(), FakeExtractor()
    for _ in range(4):
        _processor(emails, db=db, extractor=extractor).run(since=date(2026, 1, 1))
    assert len(extractor.calls) == 3 and db.emails["<m1@vna>"]["attempts"] == 3


def test_emails_are_processed_oldest_first():
    # The EMD is listed first by the mailbox but dated after its ticket: it must attach, not go unmatched.
    ticket = _email(1, _x(documents=[_ticket("7381234299050")]), day=1)
    emd = _email(2, _x("emd", segments=[], documents=[_emd("7389990000001", "7381234299050")]), day=5)
    erp = FakeERPNext()
    stats = _processor([emd, ticket], erp).run(since=date(2026, 1, 1))
    assert stats["unmatched"] == 0 and stats["created"] == 1 and stats["updated"] == 1
    assert _only(erp)["passengers"][0]["extras"] == 81000


def test_existing_booking_is_updated_not_duplicated():
    emails = [_email(1, _x(documents=[_ticket("7381234076735")]), day=1),
              _email(2, _x(documents=[_ticket("7381234076736", "Tran Thi Binh")]), day=2)]
    erp = FakeERPNext()
    stats = _processor(emails, erp).run(since=date(2026, 1, 1))
    doc = _only(erp)
    assert (stats["created"], stats["updated"]) == (1, 1)
    assert doc["qty"] == 2 and doc["total_amount"] == 4860000
    assert erp.puts[0]["name"] == "FB-00001" and erp.puts[0]["passengers"][0]["name"] == "FB-00001-passengers-1"


# Decisions B, C, D, E, G
def test_unmatched_is_retried_next_run_with_the_stored_extraction():
    # Run 1: the ticket extraction fails, so its EMD (dated later) has no passenger to attach to.
    ticket = _email(1, _x(documents=[_ticket("7381234299050")]), day=1)
    emd = _email(5, _x("emd", segments=[], documents=[_emd("7389990000001", "7381234299050")]), day=5)
    db, erp, extractor = FakeDB(), FakeERPNext(), FakeExtractor()
    extractor.fail_raws = {ticket.raw}
    first = _processor([ticket, emd], erp, db, extractor).run(since=date(2026, 3, 1))
    assert (first["failed"], first["unmatched"]) == (1, 1)
    assert db.emails["<m5@vna>"]["status"] == "unmatched" and db.emails["<m5@vna>"]["extraction"]["email_type"] == "emd"

    # Run 2: both are outside the window, so they are re-fetched by UID; the EMD reuses its stored extraction.
    extractor.fail_raws, extractor.calls = set(), []
    mailbox = FakeMailbox([ticket, emd])
    mailbox.fetch_since = lambda since, skip=None: iter([])
    stats = FlightProcessor(db=db, mailbox=mailbox, client=erp, extractor=extractor).run(since=date(2026, 3, 6))
    assert sorted(mailbox.by_uid_calls[0]) == [1, 5] and stats["retried"] == 2
    assert extractor.calls == [ticket.raw]  # the unmatched EMD did not go back to the model
    assert db.emails["<m1@vna>"]["status"] == db.emails["<m5@vna>"]["status"] == "done"
    assert _only(erp)["passengers"][0]["extras"] == 81000


def _invoice_email(uid, tickets, total, day=9):
    extraction = _x("airline_invoice", code=None, segments=[],
                    invoice={"invoice_number": f"INV{uid}", "invoice_date": None, "invoice_total": total})
    email = _email(uid, extraction, day=day)
    msg = EmailMessage()
    msg["From"], msg["Subject"] = "einvoice@vietnamairlines.com", "Hoa don"
    msg.set_content(json.dumps(extraction) + "\nTickets: " + " ".join(tickets))
    email.raw = msg.as_bytes()
    return email


def test_invoice_without_code_is_matched_by_its_ticket_numbers():
    emails = [_email(1, _x(documents=[_ticket("7381234076735")]), day=1),
              _email(2, _x(code="XYZ789", documents=[_ticket("7381234076799")]), day=2),
              _invoice_email(3, ["7381234076735"], 2430000)]
    erp = FakeERPNext()
    stats = _processor(emails, erp).run(since=date(2026, 1, 1))
    assert stats["unmatched"] == 0 and stats["updated"] == 1
    dlobbe = next(d for d in erp.docs.values() if d["booking_code"] == "ABC123")
    assert dlobbe["invoice_total"] == 2430000 and dlobbe["needs_review"] == 0


def test_invoice_without_code_and_no_matching_booking_is_unmatched():
    db = FakeDB()
    stats = _processor([_invoice_email(3, ["7381234000001"], 2430000)], db=db).run(since=date(2026, 1, 1))
    assert stats["unmatched"] == 1 and db.emails["<m3@vna>"]["status"] == "unmatched"


def test_invoice_whose_tickets_fit_two_bookings_is_unmatched():
    erp, db = FakeERPNext(), FakeDB()
    # The same ticket number on two bookings (bad data): the invoice must not be guessed onto either.
    _processor([_email(1, _x(documents=[_ticket("7381234076735")]), day=1),
                _email(2, _x(code="XYZ789", documents=[_ticket("7381234076735")]), day=2)], erp, db).run(
        since=date(2026, 1, 1))
    stats = _processor([_invoice_email(3, ["7381234076735"], 2430000)], erp, db).run(since=date(2026, 1, 1))
    assert stats["unmatched"] == 1
    assert "fit several bookings: FB-00001, FB-00002" in db.emails["<m3@vna>"]["error"]
    assert all(not d.get("invoice_total") for d in erp.docs.values())


def test_ticket_on_two_bookings_flags_both():
    erp = FakeERPNext()
    _processor([_email(1, _x(documents=[_ticket("7381234076735")]), day=1),
                _email(2, _x(code="XYZ789", documents=[_ticket("7381234076735")]), day=2)], erp).run(
        since=date(2026, 1, 1))
    docs = {d["booking_code"]: d for d in erp.docs.values()}
    assert docs["ABC123"]["needs_review"] == 1 and docs["XYZ789"]["needs_review"] == 1
    assert "ticket 7381234076735 also appears on booking XYZ789 — check it is not counted twice" in docs[
        "ABC123"]["review_reasons"].splitlines()
    assert "ticket 7381234076735 also appears on booking ABC123 — check it is not counted twice" in docs[
        "XYZ789"]["review_reasons"].splitlines()

    # Once reviewed, the same standing duplicate does not re-flag on the next run.
    for d in erp.docs.values():
        d["needs_review"] = 0
        d["review_reasons"] = "\n".join(f"Reviewed by finance@x 2026-10-02: {r}" for r in d["review_reasons"].splitlines())
    puts_before = len(erp.puts)
    _processor([], erp).run(since=date(2026, 1, 1))
    assert len(erp.puts) == puts_before and all(d["needs_review"] == 0 for d in erp.docs.values())


def test_missing_message_id_gets_a_stable_uid_key():
    email = _email(7, _x(documents=[_ticket("7381234076735")]), message_id="")
    key = email_key(email)
    assert key.startswith("uid:7:") and len(key) == len("uid:7:") + 16 and key == email_key(email)
    db = FakeDB()
    _processor([email], db=db).run(since=date(2026, 1, 1))
    assert db.emails[key]["status"] == "done"


def test_since_defaults_to_last_successful_run_minus_three_days_else_backfill(monkeypatch):
    db = FakeDB()
    proc = _processor([], db=db)
    proc.run()
    assert proc.mailbox.since == date.fromisoformat(flights.settings.flight_backfill_since)
    db.runs.append({"id": 9, "status": "error", "started_at": datetime(2026, 10, 9, tzinfo=timezone.utc)})
    proc = _processor([], db=db)
    proc.run()
    assert proc.mailbox.since == date(2026, 10, 2) - timedelta(days=3)  # the error run is ignored


def test_skipped_email_types_are_recorded_as_skipped():
    db = FakeDB()
    stats = _processor([_email(1, _x("boarding_pass"))], db=db).run(since=date(2026, 1, 1))
    assert stats["skipped"] == 1 and db.emails["<m1@vna>"]["status"] == "skipped"


def test_processor_saves_the_merge_review_flag_as_returned():
    # Ungrounded ticket number: merge flags it; the processor saves exactly that.
    extraction = _x(documents=[_ticket("7381234076735")])
    email = _email(1, extraction)
    msg = EmailMessage()
    msg["From"], msg["Subject"] = "no-reply@vietnamairlines.com", "x"
    msg.set_content(json.dumps(extraction).replace("7381234076735", "7381234000000"))
    email.raw = msg.as_bytes()

    def extractor(raw):
        return extraction, build_input(raw)[1]

    erp = FakeERPNext()
    stats = _processor([email], erp, extractor=extractor).run(since=date(2026, 1, 1))
    doc = _only(erp)
    assert stats["needs_review"] == 1 and doc["needs_review"] == 1 and "7381234076735" in doc["review_reasons"]


def test_run_error_marks_the_run_and_reraises():
    db, erp = FakeDB(), FakeERPNext()
    erp._get = lambda *a, **k: (_ for _ in ()).throw(RuntimeError("ERPNext down"))
    with pytest.raises(RuntimeError):
        _processor([], erp, db).run(since=date(2026, 1, 1))
    assert db.runs[-1]["status"] == "error" and "ERPNext down" in db.runs[-1]["error"]


# Review round 3 (repros from the adversarial review)
class FlakyPost(FakeERPNext):
    """The first POST commits server-side but the response times out."""

    def __init__(self):
        super().__init__()
        self.n = 0

    def _post(self, endpoint, data):
        response = super()._post(endpoint, data)
        self.n += 1
        if self.n == 1:
            raise requests.Timeout("read timed out")
        return response


def test_post_timeout_does_not_create_a_second_booking_for_the_same_pnr():
    erp, db = FlakyPost(), FakeDB()
    a = _email(1, _x(documents=[_ticket("7381234076735")]), day=1)
    b = _email(2, _x(documents=[_ticket("7381234076736", "Tran Thi Binh")]), day=2)
    _processor([a, b], erp, db).run(since=date(2026, 1, 1))
    assert len(erp.docs) == 1  # b found the committed booking live instead of POSTing a twin
    _processor([a, b], erp, db).run(since=date(2026, 1, 1))  # a is retried and merges into it
    doc = _only(erp)
    # a's retry finds its Message-ID already on the committed booking, so it is not merged twice
    assert (db.emails["<m1@vna>"]["status"], db.emails["<m2@vna>"]["status"]) == ("skipped", "done")
    assert sorted(p["ticket_number"] for p in doc["passengers"]) == ["7381234076735", "7381234076736"]


def test_duplicate_bookings_for_one_code_are_flagged_on_each_and_the_email_unmatched():
    erp, db = FakeERPNext(), FakeDB()
    for name in ("FB-00001", "FB-00002"):
        erp._store({"name": name, "doctype": "Flight Booking", "booking_code": "ABC123", "airline": "Vietnam Airlines",
                    "needs_review": 0, "review_reasons": "", "segments": [], "passengers": [], "source_emails": "[]"})
    stats = _processor([_email(3, _x(documents=[_ticket("7381234076735")]))], erp, db).run(since=date(2026, 1, 1))
    assert stats["unmatched"] == 1 and db.emails["<m3@vna>"]["status"] == "unmatched"
    reason = ("booking code ABC123 (Vietnam Airlines) exists on several bookings: FB-00001, FB-00002 — merge or "
              "delete the duplicate")
    for doc in erp.docs.values():
        assert doc["needs_review"] == 1 and reason in doc["review_reasons"].splitlines()


def test_retry_uid_now_holding_another_email_marks_the_row_failed_without_extracting_it():
    db, erp, extractor = FakeDB(), FakeERPNext(), FakeExtractor()
    emd = _email(7, _x("emd", segments=[], documents=[_emd("7389990000001", "7381234299050")]), day=5)
    _processor([emd], erp, db, extractor).run(since=date(2026, 1, 1))
    assert db.emails["<m7@vna>"]["status"] == "unmatched"
    other = _email(7, _x("not_flight", code=None, segments=[]), day=1, message_id="<private@bank>")
    mailbox = FakeMailbox([other])
    mailbox.fetch_since = lambda since, skip=None: iter([])
    FlightProcessor(db=db, mailbox=mailbox, client=erp, extractor=extractor).run(since=date(2026, 9, 1))
    assert "<private@bank>" not in db.emails and len(extractor.calls) == 1
    row = db.emails["<m7@vna>"]
    # still unmatched: a fetch miss costs no attempt and keeps the stored extraction
    assert row["status"] == "unmatched" and row["attempts"] == 0 and "UID 7" in row["error"]
    assert row["extraction"]["email_type"] == "emd"


def test_retry_is_skipped_and_failed_when_the_folder_uidvalidity_changed():
    db, erp = FakeDB(), FakeERPNext()
    emd = _email(7, _x("emd", segments=[], documents=[_emd("7389990000001", "7381234299050")]), day=5)
    _processor([emd], erp, db).run(since=date(2026, 1, 1))
    assert (db.emails["<m7@vna>"]["imap_folder"], db.emails["<m7@vna>"]["uidvalidity"]) == ("[Gmail]/All Mail", 1)
    mailbox = FakeMailbox([emd], uidvalidity=2)
    mailbox.fetch_since = lambda since, skip=None: iter([])
    FlightProcessor(db=db, mailbox=mailbox, client=erp, extractor=FakeExtractor()).run(since=date(2026, 9, 1))
    row = db.emails["<m7@vna>"]
    assert mailbox.by_uid_calls == [] and row["status"] == "unmatched" and "UIDVALIDITY" in row["error"]
    assert row["attempts"] == 0 and row["extraction"]["email_type"] == "emd"


def test_retry_uid_that_is_gone_marks_the_row_failed():
    db, erp = FakeDB(), FakeERPNext()
    emd = _email(7, _x("emd", segments=[], documents=[_emd("7389990000001", "7381234299050")]), day=5)
    _processor([emd], erp, db).run(since=date(2026, 1, 1))
    mailbox = FakeMailbox([])
    FlightProcessor(db=db, mailbox=mailbox, client=erp, extractor=FakeExtractor()).run(since=date(2026, 9, 1))
    row = db.emails["<m7@vna>"]
    assert row["status"] == "unmatched" and row["attempts"] == 0 and "not found" in row["error"]


def test_bodies_of_finished_emails_are_not_downloaded():
    emails = [_email(1, _x(documents=[_ticket("7381234076735")]))]
    db, erp = FakeDB(), FakeERPNext()
    _processor(emails, erp, db).run(since=date(2026, 1, 1))
    proc = _processor(emails, erp, db)
    proc.run(since=date(2026, 1, 1))
    assert proc.mailbox.bodies_skipped == ["<m1@vna>"]


def test_a_run_left_running_by_a_restart_is_marked_interrupted():
    db = FakeDB()
    db.runs.append({"id": 1, "status": "running", "started_at": datetime(2026, 10, 1, tzinfo=timezone.utc)})
    _processor([], db=db).run(since=date(2026, 1, 1))
    assert db.runs[0]["status"] == "error" and db.runs[0]["error"] == "interrupted"
    assert db.runs[1]["status"] == "ok"


# Re-review (repros from review3/test_repro2.py and the advisory lock)
def test_failed_row_whose_uid_is_gone_consumes_an_attempt():
    db, erp = FakeDB(), FakeERPNext()
    ticket = _email(1, _x(documents=[_ticket("7381234076735")]) | {"_fail": True})
    _processor([ticket], erp, db).run(since=date(2026, 1, 1))
    assert db.emails["<m1@vna>"]["attempts"] == 1
    _processor([], erp, db).run(since=date(2026, 9, 1))
    row = db.emails["<m1@vna>"]
    assert row["status"] == "failed" and row["attempts"] == 2 and "not found" in row["error"]


def test_legacy_row_without_folder_is_still_retried():
    db, erp, extractor = FakeDB(), FakeERPNext(), FakeExtractor()
    ticket = _email(1, _x(documents=[_ticket("7381234299050")]), day=1)
    emd = _email(7, _x("emd", segments=[], documents=[_emd("7389990000001", "7381234299050")]), day=5)
    _processor([emd], erp, db, extractor).run(since=date(2026, 1, 1))
    db.emails["<m7@vna>"].update(imap_folder=None, uidvalidity=None)  # written before the columns existed
    _processor([ticket], erp, db, extractor).run(since=date(2026, 1, 1))
    mailbox = FakeMailbox([emd])
    mailbox.fetch_since = lambda since, skip=None: iter([])
    FlightProcessor(db=db, mailbox=mailbox, client=erp, extractor=extractor).run(since=date(2026, 9, 1))
    assert db.emails["<m7@vna>"]["status"] == "done"


def _no_airline(extraction):
    return extraction | {"airline": None}


def test_email_without_airline_matches_the_only_booking_with_its_code():
    erp, db = FakeERPNext(), FakeDB()
    ticket = _email(1, _x(documents=[_ticket("7381234299050")]), day=1)
    emd = _email(2, _no_airline(_x("emd", segments=[], documents=[_emd("7389990000001", "7381234299050")])), day=2)
    stats = _processor([ticket, emd], erp, db).run(since=date(2026, 1, 1))
    assert stats["unmatched"] == 0 and _only(erp)["passengers"][0]["extras"] == 81000


def test_email_without_airline_stays_unmatched_when_two_airlines_share_the_code():
    erp, db = FakeERPNext(), FakeDB()
    _processor([_email(1, _x(documents=[_ticket("7381234299050")]), day=1),
                _email(2, _x(documents=[_ticket("7381234299051")]) | {"airline": "Vietjet Air"}, day=2)], erp, db).run(
        since=date(2026, 1, 1))
    emd = _email(3, _no_airline(_x("emd", segments=[], documents=[_emd("7389990000001", "7381234299050")])), day=3)
    stats = _processor([emd], erp, db).run(since=date(2026, 1, 1))
    assert stats["unmatched"] == 1 and db.emails["<m3@vna>"]["status"] == "unmatched"
    assert all(not any(p.get("extras") for p in d["passengers"]) for d in erp.docs.values())
    assert not any(d.get("needs_review") for d in erp.docs.values())  # two airlines is not a duplicate


def test_email_without_airline_finds_its_booking_live_when_not_cached():
    erp, db = FakeERPNext(), FakeDB()
    _processor([_email(1, _x(documents=[_ticket("7381234299050")]), day=1)], erp, db).run(since=date(2026, 1, 1))
    proc = _processor([], erp, db)
    proc.bookings = {}
    assert proc._find(_no_airline(_x("emd", segments=[])), "")["name"] == "FB-00001"


def test_run_refuses_while_another_process_holds_the_advisory_lock():
    db = FakeDB()
    db.held_elsewhere = True
    db.runs.append({"id": 1, "status": "running", "started_at": datetime(2026, 10, 1, tzinfo=timezone.utc)})
    with pytest.raises(SyncAlreadyRunning):
        _processor([], db=db).run(since=date(2026, 1, 1))
    assert len(db.runs) == 1 and db.runs[0]["status"] == "running"  # the other process's run is left alone


# Final review: configuration and OpenAI outages
@pytest.mark.parametrize("missing", ["openai_api_key", "hoadon_imap_password"])
def test_unconfigured_sync_returns_without_opening_a_run(monkeypatch, missing):
    monkeypatch.setattr(flights.settings, missing, "")
    db = FakeDB()
    proc = _processor([_email(1, _x(documents=[_ticket("7381234076735")]))], db=db)
    assert proc.run(since=date(2026, 1, 1)) == {"not_configured": [missing.upper()]}
    assert db.runs == [] and db.emails == {}


class OpenAIDown:
    def __init__(self, error):
        self.error, self.calls = error, []

    def __call__(self, raw):
        self.calls.append(raw)
        raise self.error


def _http_error(status):
    import httpx

    request = httpx.Request("POST", "https://api.openai.com/v1/responses")
    response = httpx.Response(status, request=request, text="Incorrect API key provided: sk-****abcd")
    try:
        response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        error = ExtractionError(f"{exc!r} body={response.text}", status_code=status)
        error.__cause__ = exc
        return error


def _timeout():
    import httpx

    error = ExtractionError("ReadTimeout('timed out')")
    error.__cause__ = httpx.ReadTimeout("timed out")
    return error


@pytest.mark.parametrize("error", [_http_error(401), _http_error(403), _http_error(429), _timeout()],
                         ids=["401", "403", "429", "timeout"])
def test_openai_outage_stops_the_run_without_using_up_attempts(error):
    emails = [_email(1, _x(documents=[_ticket("7381234076735")]), day=1),
              _email(2, _x(documents=[_ticket("7381234076736")]), day=2)]
    db, extractor = FakeDB(), OpenAIDown(error)
    with pytest.raises(flights.OpenAIUnavailable):
        _processor(emails, db=db, extractor=extractor).run(since=date(2026, 1, 1))
    assert len(extractor.calls) == 1  # stopped at the first email
    assert db.emails == {}  # no attempt used, nothing recorded
    run = db.runs[-1]
    assert run["status"] == "error" and "OpenAI" in run["error"] and "sk-" not in run["error"]


def test_other_extraction_errors_still_fail_only_that_email():
    emails = [_email(1, _x(documents=[_ticket("7381234076735")]), day=1)]
    db = FakeDB()
    stats = _processor(emails, db=db, extractor=OpenAIDown(_http_error(500))).run(since=date(2026, 1, 1))
    assert stats["failed"] == 1 and db.emails["<m1@vna>"]["attempts"] == 1 and db.runs[-1]["status"] == "partial"
