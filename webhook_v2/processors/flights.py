"""
Flight bookings pipeline run (MWP-72): mailbox -> extractor -> merge -> ERPNext, with per-email state in Postgres.

Email states: done | skipped (final), unmatched (retried every run, reusing the stored extraction),
failed (retried with a fresh extraction until MAX_ATTEMPTS). merge() decides needs_review; this module only adds
cross-booking reasons through the same add_review_reasons() helper.
"""
import hashlib
import json
import threading
from datetime import date, datetime, timedelta, timezone
from urllib.parse import quote

import httpx

from webhook_v2.config import settings
from webhook_v2.core.database import Database
from webhook_v2.core.logging import bind_context, clear_context, get_logger
from webhook_v2.processors.flight_merge import (add_review_reasons, booking_numbers, invoice_ticket_numbers, merge,
                                                normalise_airline)
from webhook_v2.services.erpnext import ERPNextClient
from webhook_v2.services.flight_extractor import ExtractionError, build_input, extract
from webhook_v2.services.flight_mailbox import FlightMailbox, RawEmail, UidValidityChanged

log = get_logger(__name__)

# In-process first check shared by the cron job and POST /flights/sync (non-blocking acquire in both).
# The authority is the Postgres advisory lock run() holds, which also covers a run started from another process.
sync_lock = threading.Lock()

MAX_ATTEMPTS = 3
LOOKBACK_DAYS = 3
FINAL_STATES = {"done", "skipped"}
DOCTYPE_URL = "/api/resource/Flight Booking"


def email_key(email: RawEmail) -> str:
    """Message-ID, or a stable stand-in when the header is missing."""
    return email.message_id or f"uid:{email.uid}:{hashlib.sha1(email.raw).hexdigest()[:16]}"


def _sort_key(email: RawEmail):
    when = email.date
    if when is None:
        when = datetime.max.replace(tzinfo=timezone.utc)
    elif when.tzinfo is None:
        when = when.replace(tzinfo=timezone.utc)
    return when, email.uid


FATAL_OPENAI_STATUSES = {401, 403, 429}  # key, permission, quota/rate: every later email would fail the same way
REQUIRED_SETTINGS = {"OPENAI_API_KEY": "openai_api_key", "HOADON_IMAP_PASSWORD": "hoadon_imap_password"}


def missing_config() -> list[str]:
    """Names (never values) of the settings a sync needs that are empty."""
    return [name for name, attr in REQUIRED_SETTINGS.items() if not getattr(settings, attr)]


class OpenAIUnavailable(Exception):
    """OpenAI refused or could not be reached; the run stops so no email burns an attempt on it."""


def _openai_unavailable(exc: ExtractionError) -> bool:
    return exc.status_code in FATAL_OPENAI_STATUSES or isinstance(exc.__cause__, httpx.TransportError)


class SyncAlreadyRunning(Exception):
    """Another run (in this or another process) holds the flight sync lock."""


class _Ambiguous(Exception):
    """More than one booking fits the email; it is left unmatched rather than guessed."""


class FlightProcessor:
    def __init__(self, db=None, mailbox=None, client=None, extractor=extract):
        self.db = db or Database()
        self.mailbox = mailbox or FlightMailbox()
        self.client = client or ERPNextClient()
        self.extractor = extractor
        self.bookings: dict[str, dict] = {}  # name -> full doc, kept current after each save
        self.lock_acquired = threading.Event()  # set once run() holds the advisory lock

    def run(self, since: date | None = None) -> dict:
        """One sync, holding the Postgres advisory lock throughout. Raises SyncAlreadyRunning if another run has it.

        Returns {"not_configured": [...]} without opening a run when credentials are missing.
        """
        missing = missing_config()
        if missing:
            log.error("flight_sync_not_configured", missing=missing)
            return {"not_configured": missing}
        with self.db.flight_run_lock() as granted:
            if not granted:
                log.warning("flight_run_already_running")
                raise SyncAlreadyRunning("another flight sync is running (Postgres advisory lock is held)")
            self.lock_acquired.set()
            self.db.interrupt_flight_runs()  # with the lock held, a run still 'running' was cut off by a restart
            return self._run(since)

    def _run(self, since: date | None) -> dict:
        run_id = self.db.start_flight_run()
        stats = dict.fromkeys(("fetched", "candidates", "retried", "processed", "created", "updated", "skipped",
                               "unmatched", "failed", "needs_review"), 0)
        try:
            since = since or self._default_since()
            log.info("flight_run_begin", flight_run=run_id, since=since.isoformat())
            employees = self._employees()
            self._load_bookings()
            for email in self._emails(since, stats):
                self._process(email, run_id, employees, stats)
            stats["failed"] += self._flag_shared_tickets()
        except Exception as exc:
            # OpenAIUnavailable's own text is safe to show; the raw OpenAI body (it may echo the key) is only logged.
            message = str(exc) if isinstance(exc, OpenAIUnavailable) else repr(exc)
            log.error("flight_run_error", flight_run=run_id, error=message, **stats)
            self.db.finish_flight_run(run_id, "error", stats, error=message[:2000])
            raise
        status = "partial" if stats["failed"] else "ok"
        self.db.finish_flight_run(run_id, status, stats)
        log.info("flight_run_done", flight_run=run_id, status=status, **stats)
        return stats

    def _default_since(self) -> date:
        last = self.db.last_flight_run(statuses=("ok", "partial"))
        if last and last.get("started_at"):
            return last["started_at"].date() - timedelta(days=LOOKBACK_DAYS)
        return date.fromisoformat(settings.flight_backfill_since)

    def _employees(self) -> list[dict]:
        employees = self.client._get("/api/resource/Employee", params={
            "fields": json.dumps(["name", "employee_name"]),
            "filters": json.dumps([["status", "=", "Active"]]),
            "limit_page_length": 0,
        }).get("data", [])
        log.info("flight_employees_loaded", count=len(employees))
        return employees

    def _load_bookings(self) -> None:
        names = [b["name"] for b in self.client._get(DOCTYPE_URL, params={
            "fields": json.dumps(["name"]), "limit_page_length": 0}).get("data", [])]
        self.bookings = {name: self._get_doc(name) for name in names}
        log.info("flight_bookings_loaded", count=len(self.bookings))

    def _get_doc(self, name: str) -> dict:
        return self.client._get(f"{DOCTYPE_URL}/{quote(name, safe='')}")["data"]

    def _finished(self, message_id: str) -> bool:
        """No more work for this email: its body need not be downloaded."""
        state = self.db.get_flight_email(message_id) or {}
        return state.get("status") in FINAL_STATES or (
            state.get("status") == "failed" and state.get("attempts", 0) >= MAX_ATTEMPTS)

    def _emails(self, since: date, stats: dict) -> list[RawEmail]:
        """Emails in the window plus earlier ones awaiting a retry, oldest first by Date header."""
        emails = {email_key(e): e for e in self.mailbox.fetch_since(since, skip=self._finished)}
        stats["candidates"] = len(emails)
        groups: dict[tuple, list[dict]] = {}
        for row in self.db.flight_emails_to_retry(MAX_ATTEMPTS):
            if row["message_id"] not in emails:
                groups.setdefault((row.get("imap_folder"), row.get("uidvalidity")), []).append(row)
        for (folder, uidvalidity), rows in groups.items():
            by_uid = {r["imap_uid"]: r for r in rows if r.get("imap_uid") is not None}
            for row in rows:
                if row.get("imap_uid") is None:
                    self._retry_missed(row, stats, "no IMAP UID stored; cannot be re-fetched")
            try:
                fetched = {e.uid: e for e in self.mailbox.fetch_by_uid(list(by_uid), folder=folder,
                                                                       uidvalidity=uidvalidity)}
            except UidValidityChanged as exc:
                for row in by_uid.values():
                    self._retry_missed(row, stats, f"not retried: {exc}")
                continue
            for uid, row in by_uid.items():
                email = fetched.get(uid)
                if email is None:
                    self._retry_missed(
                        row, stats, f"UID {uid} not found in the mailbox, or no longer an airline email; not retried")
                elif email_key(email) != row["message_id"]:
                    log.error("flight_retry_uid_mismatch", message_id=row["message_id"], uid=uid,
                              fetched=email_key(email))
                    self._retry_missed(
                        row, stats, f"UID {uid} now holds another email ({email_key(email)}); not retried")
                else:
                    emails[row["message_id"]] = email
                    stats["retried"] += 1
        stats["fetched"] = len(emails)
        log.info("flight_emails_fetched", candidates=stats["candidates"], retried=stats["retried"])
        return sorted(emails.values(), key=_sort_key)

    def _retry_missed(self, row: dict, stats: dict, error: str) -> None:
        """A retry whose email could not be re-fetched. Unmatched rows stay unmatched (no attempt used, stored
        extraction kept); failed rows use up an attempt."""
        bind_context(message_id=row["message_id"])
        status = "unmatched" if row.get("status") == "unmatched" else "failed"
        try:
            log.error("flight_retry_missed", status=status, error=error)
            self.db.upsert_flight_email(row["message_id"], status=status, error=f"retry fetch failed: {error}"[:2000])
        finally:
            clear_context()
        stats[status] += 1

    def _process(self, email: RawEmail, run_id: int, employees: list[dict], stats: dict) -> None:
        key = email_key(email)
        bind_context(message_id=key, flight_run=run_id)
        record = {"imap_uid": email.uid, "subject": email.subject, "received_at": email.date,
                  "imap_folder": email.folder, "uidvalidity": email.uidvalidity}
        try:
            state = self.db.get_flight_email(key) or {}
            if state.get("status") in FINAL_STATES:
                return
            if state.get("status") == "failed" and state.get("attempts", 0) >= MAX_ATTEMPTS:
                log.warning("flight_email_gave_up", attempts=state["attempts"], error=state.get("error"))
                return
            stats["processed"] += 1
            if state.get("status") == "unmatched" and state.get("extraction"):
                extraction, source_text = state["extraction"], build_input(email.raw)[1]
                log.info("flight_email_retry_unmatched")
            else:
                try:
                    extraction, source_text = self.extractor(email.raw)
                except ExtractionError as exc:
                    if not _openai_unavailable(exc):
                        raise
                    status = f"HTTP {exc.status_code}" if exc.status_code else type(exc.__cause__).__name__
                    log.error("flight_openai_unavailable", status=status, error=str(exc))
                    raise OpenAIUnavailable(f"OpenAI unavailable ({status}): check the API key, quota and network; "
                                            f"stopped before this email, the rest are retried next run") from exc
            record.update(email_type=extraction.get("email_type"), extraction=extraction)
            try:
                existing = self._find(extraction, source_text)
            except _Ambiguous as exc:
                return self._unmatched(key, record, [str(exc)], stats)
            meta = {"message_id": key, "subject": email.subject, "date": email.date}
            result = merge(existing, extraction, meta, employees, source_text)
            log.info("flight_email_merged", action=result.action, booking=(existing or {}).get("name"),
                     new_reasons=result.review_reasons)
            if result.action == "unmatched":
                return self._unmatched(key, record, result.review_reasons, stats)
            if result.action == "skipped":
                self.db.upsert_flight_email(key, status="skipped", booking=(existing or {}).get("name"),
                                            error=None, **record)
                stats["skipped"] += 1
                return
            saved = self._save(result.doc)
            self.db.upsert_flight_email(key, status="done", booking=saved["name"], error=None, **record)
            stats[result.action] += 1
            stats["needs_review"] += bool(result.review_reasons)
        except OpenAIUnavailable:
            raise  # run-level: no attempt recorded for this email
        except Exception as exc:
            log.error("flight_email_failed", error=repr(exc))
            self.db.upsert_flight_email(key, status="failed", error=repr(exc)[:2000], **record)
            stats["failed"] += 1
        finally:
            clear_context()

    def _unmatched(self, key: str, record: dict, reasons: list[str], stats: dict) -> None:
        log.warning("flight_email_unmatched", reasons=reasons)
        self.db.upsert_flight_email(key, status="unmatched", error="; ".join(reasons)[:2000], **record)
        stats["unmatched"] += 1

    def _find(self, extraction: dict, source_text: str) -> dict | None:
        """The booking the email belongs to, fetched fresh; None when there is none yet.

        More than one candidate is never guessed: each is flagged and the email stays unmatched.
        """
        code = (extraction.get("booking_code") or "").strip().upper()
        airline = normalise_airline(extraction.get("airline"))
        if code:
            # No airline in the email: the code alone decides, but only if exactly one booking has it.
            matches = [n for n, b in self.bookings.items()
                       if b.get("booking_code") == code and (not airline or b.get("airline") == airline)]
            if not matches:  # the cache can miss a booking whose save timed out after ERPNext committed it
                matches = self._live_matches(code, airline)
            if not airline and len(matches) > 1:
                reason = f"booking code {code} with no airline in the email fits {len(matches)} bookings: " \
                         f"{', '.join(sorted(matches))}"
                log.warning("flight_booking_ambiguous", reason=reason)
                raise _Ambiguous(reason)  # different airlines may reuse a code: not a duplicate, nothing flagged
            label = f"booking code {code} ({airline})"
            action = "exists on several bookings: {names} — merge or delete the duplicate"
        elif extraction.get("email_type") == "airline_invoice":
            # Invoices print ticket numbers but no booking code: the booking must hold every listed number.
            listed = invoice_ticket_numbers(source_text)
            matches = [n for n, b in self.bookings.items() if listed and listed <= booking_numbers(b)]
            label = f"invoice tickets {', '.join(sorted(listed)) or 'none'}"
            action = "fit several bookings: {names} — check which booking the invoice belongs to"
        else:
            return None
        if len(matches) > 1:
            reason = f"{label} {action.format(names=', '.join(sorted(matches)))}"
            log.error("flight_booking_ambiguous", reason=reason)
            for name in matches:
                self._add_reasons(name, [reason])
            raise _Ambiguous(reason)
        return self._get_doc(matches[0]) if matches else None

    def _live_matches(self, code: str, airline: str) -> list[str]:
        filters = [["booking_code", "=", code]] + ([["airline", "=", airline]] if airline else [])
        names = [r["name"] for r in self.client._get(DOCTYPE_URL, params={
            "filters": json.dumps(filters),
            "fields": json.dumps(["name"]), "limit_page_length": 0}).get("data", [])]
        for name in names:
            if name not in self.bookings:
                log.warning("flight_booking_found_live", booking=name, booking_code=code)
                self.bookings[name] = self._get_doc(name)
        return names

    def _save(self, doc: dict) -> dict:
        """POST a new booking or PUT the whole doc (child rows keep their `name`); `modified` guards lost updates."""
        name = doc.get("name")
        try:
            if name:
                saved = self.client._put(f"{DOCTYPE_URL}/{quote(name, safe='')}", doc)["data"]
            else:
                saved = self.client._post(DOCTYPE_URL, doc)["data"]
        except Exception as exc:
            # The save may have committed anyway (e.g. a timeout): forget the cached copy; _find re-reads ERPNext.
            if name:
                self.bookings.pop(name, None)
            log.error("flight_booking_save_failed", booking=name, booking_code=doc.get("booking_code"), error=repr(exc))
            raise
        self.bookings[saved["name"]] = saved
        log.info("flight_booking_saved", booking=saved["name"], booking_code=saved.get("booking_code"),
                 created=not name, needs_review=saved.get("needs_review"), total_amount=saved.get("total_amount"))
        return saved

    def _add_reasons(self, name: str, reasons: list[str]) -> None:
        """Add state reasons to a booking (fresh copy) and save it if any are new."""
        doc = self._get_doc(name)
        new = add_review_reasons(doc, reasons)
        if new:
            log.warning("flight_booking_flagged", booking=name, reasons=new)
            self._save(doc)

    def _flag_shared_tickets(self) -> int:
        """Flag both bookings when a ticket/EMD number is on two of them, so it is not counted twice.

        Runs over every booking after each run (state reasons: a reviewed pair stays reviewed). Returns failures.
        """
        owners: dict[str, list[str]] = {}
        for name, doc in self.bookings.items():
            for number in booking_numbers(doc):
                owners.setdefault(number, []).append(name)
        reasons: dict[str, list[str]] = {}
        for number, names in sorted(owners.items()):
            for name in names:
                for other in names:
                    if other != name:
                        reasons.setdefault(name, []).append(
                            f"ticket {number} also appears on booking {self.bookings[other].get('booking_code')} "
                            f"— check it is not counted twice")
        failures = 0
        for name, lines in reasons.items():
            bind_context(booking=name)
            try:
                self._add_reasons(name, lines)
            except Exception as exc:
                log.error("flight_shared_ticket_flag_failed", error=repr(exc))
                failures += 1
            finally:
                clear_context()
        return failures
