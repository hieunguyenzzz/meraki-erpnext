"""
Fetches raw airline emails from the invoice Gmail mailbox (MWP-72).

Kept separate from services/imap.py, which discards attachment bytes.
Read-only: messages are fetched with BODY.PEEK and never flagged.
"""

import imaplib
import re
import unicodedata
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import date, datetime
from email import message_from_bytes
from email.header import decode_header, make_header
from email.utils import parseaddr, parsedate_to_datetime
from typing import Callable, Iterator

from webhook_v2.config import settings
from webhook_v2.core.logging import get_logger

log = get_logger(__name__)

AIRLINE_DOMAINS = {
    "vietnamairlines.com",
    "vietjetair.com",
    "sunphuquocairways.com",
    "bambooairways.com",
    "vietravelairlines.com",
    "pacificairlines.com.vn",
}
FORWARDER = "hoadon.merakiwp@gmail.com"
FORWARDED_SUBJECT_RE = re.compile(
    r"hoàn vé|hoàn tiền|hủy vé|refund|vé máy bay|boarding pass|e-ticket|itinerary|schedule change|đặt chỗ|hành trình",
    re.IGNORECASE,
)
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


@dataclass
class RawEmail:
    uid: int
    message_id: str
    subject: str
    sender: str
    date: datetime | None
    raw: bytes
    folder: str | None = None
    uidvalidity: int | None = None


class UidValidityChanged(Exception):
    """The folder's UIDs were renumbered (or another folder is open), so stored UIDs point at other emails."""


def is_candidate(sender: str, subject: str) -> bool:
    """Cheap pre-filter so only plausible airline emails are downloaded in full."""
    # sender must be the raw From header: decoding first can put commas/quotes in the display name
    address = parseaddr(sender)[1].lower()
    domain = address.rpartition("@")[2]
    if domain in AIRLINE_DOMAINS or any(domain.endswith("." + d) for d in AIRLINE_DOMAINS):
        return True
    return address == FORWARDER and bool(FORWARDED_SUBJECT_RE.search(unicodedata.normalize("NFC", subject or "")))


def _decode(value: str | None) -> str:
    try:
        return str(make_header(decode_header(value or "")))
    except (UnicodeDecodeError, LookupError) as exc:
        log.warning("flight_mailbox_header_decode_failed", error=str(exc))
        return value or ""


def _parse_date(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return parsedate_to_datetime(value)
    except (TypeError, ValueError) as exc:
        log.warning("flight_mailbox_date_parse_failed", value=value, error=str(exc))
        return None


class FlightMailbox:
    def __init__(self, host=None, port=None, user=None, password=None):
        self.host = host or settings.hoadon_imap_host
        self.port = port or settings.hoadon_imap_port
        self.user = user or settings.hoadon_imap_user
        self.password = password or settings.hoadon_imap_password

    def _all_mail_folder(self, conn: imaplib.IMAP4_SSL) -> str:
        status, lines = conn.list()
        if status == "OK":
            for line in lines or []:
                text = line.decode(errors="replace") if isinstance(line, bytes) else str(line)
                match = re.match(r'\((?P<flags>[^)]*)\)\s+"?[^"\s]*"?\s+(?P<name>.+)$', text)
                if match and "\\All" in match.group("flags"):
                    return match.group("name").strip().strip('"')
        log.warning("flight_mailbox_all_mail_not_found_using_inbox")
        return "INBOX"

    @contextmanager
    def _open(self) -> Iterator[tuple[imaplib.IMAP4_SSL, str, int | None]]:
        """Logged in, with the All Mail folder selected read-only. Yields (conn, folder, uidvalidity)."""
        conn = imaplib.IMAP4_SSL(self.host, self.port, timeout=60)
        try:
            conn.login(self.user, self.password)
            folder = self._all_mail_folder(conn)
            status, _ = conn.select(f'"{folder}"', readonly=True)
            if status != "OK":
                raise imaplib.IMAP4.error(f"cannot select folder {folder}")
            _, data = conn.response("UIDVALIDITY")
            uidvalidity = int(data[0]) if data and data[0] else None
            log.info("flight_mailbox_opened", folder=folder, uidvalidity=uidvalidity)
            yield conn, folder, uidvalidity
        finally:
            try:
                conn.logout()
            except (imaplib.IMAP4.error, OSError) as exc:
                log.warning("flight_mailbox_logout_failed", error=str(exc))

    def fetch_since(self, since: date, skip: Callable[[str], bool] | None = None) -> Iterator[RawEmail]:
        """Candidate emails since `since`. `skip(message_id)` True = already handled: its body is not downloaded."""
        with self._open() as (conn, folder, uidvalidity):
            criterion = f"{since.day:02d}-{MONTHS[since.month - 1]}-{since.year}"
            status, data = conn.uid("SEARCH", None, "SINCE", criterion)
            if status != "OK":
                raise imaplib.IMAP4.error(f"SEARCH failed: {status}")
            uids = data[0].split() if data and data[0] else []
            log.info("flight_mailbox_search_done", since=criterion, found=len(uids))
            for uid in uids:
                email_obj = self._fetch_candidate(conn, uid, folder, uidvalidity, skip)
                if email_obj:
                    yield email_obj

    def fetch_by_uid(self, uids: list[int], folder: str | None = None,
                     uidvalidity: int | None = None) -> Iterator[RawEmail]:
        """Re-fetch emails seen on an earlier run (for retries).

        Raises UidValidityChanged, before fetching anything, when the stored folder/UIDVALIDITY no longer apply.
        """
        if not uids:
            return
        with self._open() as (conn, current_folder, current_validity):
            if (folder and folder != current_folder) or (uidvalidity and uidvalidity != current_validity):
                raise UidValidityChanged(f"stored UIDs are for {folder} UIDVALIDITY {uidvalidity}; the mailbox now "
                                         f"has {current_folder} UIDVALIDITY {current_validity}")
            for uid in uids:
                email_obj = self._fetch_candidate(conn, str(uid).encode(), current_folder, current_validity)
                if email_obj:
                    yield email_obj
                else:
                    log.warning("flight_mailbox_uid_not_found", uid=uid)

    def _fetch_candidate(self, conn: imaplib.IMAP4_SSL, uid: bytes, folder: str, uidvalidity: int | None,
                         skip: Callable[[str], bool] | None = None) -> RawEmail | None:
        status, data = conn.uid(
            "FETCH", uid, "(BODY.PEEK[HEADER.FIELDS (FROM SUBJECT DATE MESSAGE-ID)])"
        )
        if status != "OK" or not data or not isinstance(data[0], tuple):
            log.warning("flight_mailbox_header_fetch_failed", uid=uid.decode(), status=status)
            return None
        headers = message_from_bytes(data[0][1])
        sender, subject = _decode(headers["From"]), _decode(headers["Subject"])
        if not is_candidate(str(headers["From"] or ""), subject):
            return None
        message_id = (headers["Message-ID"] or "").strip()
        if skip and message_id and skip(message_id):
            return None
        status, data = conn.uid("FETCH", uid, "(BODY.PEEK[])")
        if status != "OK" or not data or not isinstance(data[0], tuple):
            log.warning("flight_mailbox_body_fetch_failed", uid=uid.decode(), status=status)
            return None
        return RawEmail(
            uid=int(uid),
            message_id=message_id,
            subject=subject,
            sender=sender,
            date=_parse_date(headers["Date"]),
            raw=data[0][1],
            folder=folder,
            uidvalidity=uidvalidity,
        )
