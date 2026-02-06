"""
IMAP client for fetching emails from Zoho.
"""

import imaplib
from datetime import datetime, timedelta
from email import message_from_bytes
from email.header import decode_header as email_decode_header
from email.utils import parsedate_to_datetime
from typing import Iterator

from webhook_v2.config import settings
from webhook_v2.core.logging import get_logger
from webhook_v2.core.models import Email, Attachment, DocType

log = get_logger(__name__)


class IMAPClient:
    """IMAP client for Zoho email."""

    def __init__(
        self,
        host: str | None = None,
        email: str | None = None,
        password: str | None = None,
    ):
        self.host = host or settings.zoho_host
        self.email = email or settings.zoho_email
        self.password = password or settings.zoho_password
        self._conn: imaplib.IMAP4_SSL | None = None

    def connect(self) -> None:
        """Connect and authenticate to IMAP server."""
        log.info("imap_connecting", host=self.host, email=self.email)
        conn = None
        try:
            conn = imaplib.IMAP4_SSL(self.host)
            conn.login(self.email, self.password)
            self._conn = conn  # Only set if login succeeds
            log.info("imap_connected")
        except Exception:
            # Clean up partial connection if login fails
            if conn:
                try:
                    conn.logout()
                except Exception:
                    pass
            raise

    def disconnect(self) -> None:
        """Close IMAP connection."""
        if self._conn:
            try:
                self._conn.logout()
            except Exception:
                pass
            self._conn = None
            log.info("imap_disconnected")

    def __enter__(self):
        self.connect()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.disconnect()

    def fetch_emails(
        self,
        folder: str = "INBOX",
        since_date: datetime | None = None,
        limit: int | None = None,
    ) -> Iterator[Email]:
        """
        Fetch emails from a folder.

        Args:
            folder: IMAP folder name (INBOX, Sent, etc.)
            since_date: Only fetch emails after this date
            limit: Maximum number of emails to fetch

        Yields:
            Email objects
        """
        if not self._conn:
            raise RuntimeError("Not connected to IMAP server")

        self._conn.select(folder)

        # Build search criteria
        if since_date:
            date_str = since_date.strftime("%d-%b-%Y")
            search_criteria = f'(SINCE {date_str})'
        else:
            search_criteria = "ALL"

        _, message_numbers = self._conn.search(None, search_criteria)
        msg_nums = message_numbers[0].split()

        if limit:
            msg_nums = msg_nums[-limit:]  # Get most recent

        log.info("imap_fetching", folder=folder, count=len(msg_nums))

        for num in msg_nums:
            try:
                _, msg_data = self._conn.fetch(num, "(RFC822)")
                if not msg_data or not msg_data[0]:
                    continue

                raw_email = msg_data[0][1]
                msg = message_from_bytes(raw_email)

                email = self._parse_email(msg, folder)
                if email:
                    yield email

            except Exception as e:
                log.error("imap_fetch_error", error=str(e), message_num=num.decode())

    def _decode_header(self, header: str) -> str:
        """Decode MIME-encoded email header.

        Handles headers like '=?UTF-8?B?...?=' for Vietnamese and other non-ASCII text.
        """
        if not header:
            return ""
        decoded_parts = []
        for part, charset in email_decode_header(header):
            if isinstance(part, bytes):
                decoded_parts.append(part.decode(charset or 'utf-8', errors='replace'))
            else:
                decoded_parts.append(part)
        return ''.join(decoded_parts).replace('\r\n', '').replace('\n', '')

    def _parse_email(self, msg, folder: str) -> Email | None:
        """Parse email message into Email object."""
        message_id = msg.get("Message-ID", "")
        if not message_id:
            return None

        # Parse date
        email_date = None
        date_str = msg.get("Date")
        if date_str:
            try:
                email_date = parsedate_to_datetime(date_str)
            except Exception:
                pass

        # Get body
        body_plain, body_html = self._get_body(msg)

        # Check for attachments
        has_attachments = False
        attachments = []
        if msg.is_multipart():
            for part in msg.walk():
                disposition = part.get("Content-Disposition", "")
                if "attachment" in disposition:
                    has_attachments = True
                    filename = part.get_filename() or "unnamed"
                    attachments.append(Attachment(
                        filename=filename,
                        content_type=part.get_content_type(),
                        size_bytes=len(part.get_payload(decode=True) or b""),
                    ))

        return Email(
            message_id=message_id,
            mailbox=self.email,
            folder=folder,
            subject=self._decode_header(msg.get("Subject", "")),
            sender=self._decode_header(msg.get("From", "")),
            recipient=self._decode_header(msg.get("To", "")),
            cc=self._decode_header(msg.get("Cc", "")),
            email_date=email_date,
            body_plain=body_plain,
            body_html=body_html,
            has_attachments=has_attachments,
            attachments=attachments,
            raw_headers={
                "reply-to": msg.get("Reply-To", ""),
                "in-reply-to": msg.get("In-Reply-To", ""),
                "references": msg.get("References", ""),
            },
            doctype=DocType.LEAD,
        )

    def _get_body(self, msg) -> tuple[str, str]:
        """Extract plain text and HTML body from message."""
        text_plain = ""
        text_html = ""

        if msg.is_multipart():
            for part in msg.walk():
                content_type = part.get_content_type()
                disposition = part.get("Content-Disposition", "")

                if "attachment" in disposition:
                    continue

                payload = part.get_payload(decode=True)
                if not payload:
                    continue

                text = payload.decode("utf-8", errors="ignore")

                if content_type == "text/plain":
                    text_plain += text
                elif content_type == "text/html":
                    text_html += text
        else:
            payload = msg.get_payload(decode=True)
            if payload:
                text = payload.decode("utf-8", errors="ignore")
                if msg.get_content_type() == "text/plain":
                    text_plain = text
                elif msg.get_content_type() == "text/html":
                    text_html = text

        return text_plain, text_html

    def get_folders(self) -> list[str]:
        """List available IMAP folders."""
        if not self._conn:
            raise RuntimeError("Not connected to IMAP server")

        _, folders = self._conn.list()
        result = []
        for folder in folders:
            # Parse folder name from response
            parts = folder.decode().split(' "/" ')
            if len(parts) >= 2:
                result.append(parts[-1].strip('"'))
        return result
