"""
Database repository for email storage.

Provides async PostgreSQL operations for storing and retrieving emails.
"""

from contextlib import contextmanager
from datetime import datetime
from typing import Generator, Any

import psycopg
from psycopg.rows import dict_row

from webhook_v2.config import settings
from webhook_v2.core.logging import get_logger
from webhook_v2.core.models import (
    Email,
    Attachment,
    Classification,
    DocType,
    ProcessingLog,
)

log = get_logger(__name__)


class Database:
    """PostgreSQL database operations for email storage."""

    def __init__(self, connection_string: str | None = None):
        """
        Initialize database connection.

        Args:
            connection_string: PostgreSQL connection URL. Uses settings if not provided.
        """
        self.connection_string = connection_string or settings.database_url

    @contextmanager
    def get_connection(self) -> Generator[psycopg.Connection, None, None]:
        """Get a database connection as a context manager."""
        conn = psycopg.connect(self.connection_string, row_factory=dict_row)
        try:
            yield conn
        finally:
            conn.close()

    def init_schema(self) -> None:
        """Initialize database schema (create tables if not exist)."""
        schema_sql = """
        -- emails: Raw email storage (fetched from IMAP)
        CREATE TABLE IF NOT EXISTS emails (
            id SERIAL PRIMARY KEY,
            message_id VARCHAR(255) UNIQUE NOT NULL,
            mailbox VARCHAR(100) NOT NULL,
            folder VARCHAR(100) NOT NULL,
            subject TEXT,
            sender VARCHAR(255),
            recipient VARCHAR(255),
            cc TEXT,
            email_date TIMESTAMPTZ,
            body_plain TEXT,
            body_html TEXT,
            has_attachments BOOLEAN DEFAULT FALSE,
            raw_headers JSONB,
            fetched_at TIMESTAMPTZ DEFAULT NOW(),

            -- Processing tracking
            doctype VARCHAR(50) DEFAULT 'lead',
            processed BOOLEAN DEFAULT FALSE,
            processed_at TIMESTAMPTZ,
            classification VARCHAR(50),
            classification_data JSONB,

            -- Error handling
            error_message TEXT,
            retry_count INTEGER DEFAULT 0,
            last_retry_at TIMESTAMPTZ
        );

        CREATE INDEX IF NOT EXISTS idx_emails_mailbox ON emails(mailbox);
        CREATE INDEX IF NOT EXISTS idx_emails_processed ON emails(processed, doctype);
        CREATE INDEX IF NOT EXISTS idx_emails_date ON emails(email_date DESC);
        CREATE INDEX IF NOT EXISTS idx_emails_sender ON emails(sender);
        CREATE INDEX IF NOT EXISTS idx_emails_message_id ON emails(message_id);

        -- attachments: Email attachment metadata
        CREATE TABLE IF NOT EXISTS attachments (
            id SERIAL PRIMARY KEY,
            email_id INTEGER REFERENCES emails(id) ON DELETE CASCADE,
            message_id VARCHAR(255),
            filename VARCHAR(255),
            content_type VARCHAR(100),
            size_bytes INTEGER,
            storage_url TEXT,
            fetched_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_attachments_email ON attachments(email_id);

        -- processing_logs: Audit trail
        CREATE TABLE IF NOT EXISTS processing_logs (
            id SERIAL PRIMARY KEY,
            email_id INTEGER REFERENCES emails(id),
            action VARCHAR(50),
            doctype VARCHAR(50),
            result_id VARCHAR(100),
            details JSONB,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_logs_email ON processing_logs(email_id);
        CREATE INDEX IF NOT EXISTS idx_logs_action ON processing_logs(action);
        """

        with self.get_connection() as conn:
            conn.execute(schema_sql)
            conn.commit()
            log.info("database_schema_initialized")

    def email_exists(self, message_id: str) -> bool:
        """Check if email already exists by message_id."""
        with self.get_connection() as conn:
            result = conn.execute(
                "SELECT 1 FROM emails WHERE message_id = %s LIMIT 1",
                (message_id,)
            ).fetchone()
            return result is not None

    def insert_email(self, email: Email) -> int:
        """
        Insert a new email record.

        Args:
            email: Email object to insert

        Returns:
            The inserted email's ID
        """
        sql = """
        INSERT INTO emails (
            message_id, mailbox, folder, subject, sender, recipient, cc,
            email_date, body_plain, body_html, has_attachments, raw_headers,
            doctype, processed
        ) VALUES (
            %(message_id)s, %(mailbox)s, %(folder)s, %(subject)s, %(sender)s,
            %(recipient)s, %(cc)s, %(email_date)s, %(body_plain)s, %(body_html)s,
            %(has_attachments)s, %(raw_headers)s, %(doctype)s, %(processed)s
        )
        ON CONFLICT (message_id) DO NOTHING
        RETURNING id
        """

        params = {
            "message_id": email.message_id,
            "mailbox": email.mailbox,
            "folder": email.folder,
            "subject": email.subject,
            "sender": email.sender,
            "recipient": email.recipient,
            "cc": email.cc,
            "email_date": email.email_date,
            "body_plain": email.body_plain,
            "body_html": email.body_html,
            "has_attachments": email.has_attachments,
            "raw_headers": psycopg.types.json.Json(email.raw_headers),
            "doctype": email.doctype.value,
            "processed": email.processed,
        }

        with self.get_connection() as conn:
            result = conn.execute(sql, params).fetchone()
            conn.commit()

            if result:
                email_id = result["id"]
                log.info("email_inserted", email_id=email_id, message_id=email.message_id)
                return email_id

            # Email already exists, fetch existing ID
            existing = conn.execute(
                "SELECT id FROM emails WHERE message_id = %s",
                (email.message_id,)
            ).fetchone()
            if not existing:
                raise RuntimeError(f"Failed to insert or fetch email: {email.message_id}")
            return existing["id"]

    def insert_attachment(self, attachment: Attachment) -> int:
        """Insert an attachment record."""
        sql = """
        INSERT INTO attachments (
            email_id, message_id, filename, content_type, size_bytes, storage_url
        ) VALUES (
            %(email_id)s, %(message_id)s, %(filename)s, %(content_type)s,
            %(size_bytes)s, %(storage_url)s
        )
        RETURNING id
        """

        with self.get_connection() as conn:
            result = conn.execute(sql, {
                "email_id": attachment.email_id,
                "message_id": "",  # Can be set later
                "filename": attachment.filename,
                "content_type": attachment.content_type,
                "size_bytes": attachment.size_bytes,
                "storage_url": attachment.storage_url,
            }).fetchone()
            conn.commit()
            if not result:
                raise RuntimeError(f"Failed to insert attachment: {attachment.filename}")
            return result["id"]

    def get_unprocessed_emails(
        self,
        doctype: DocType = DocType.LEAD,
        limit: int = 50,
        since_date: datetime | None = None,
        order: str = "asc",
    ) -> list[Email]:
        """
        Fetch unprocessed emails for a given doctype.

        Args:
            doctype: Document type to filter by
            limit: Maximum number of emails to return
            since_date: Only return emails from this date onwards (optional)
            order: Sort order for email_date ('asc' or 'desc')

        Returns:
            List of Email objects
        """
        order_sql = "DESC" if order.lower() == "desc" else "ASC"

        if since_date:
            sql = f"""
            SELECT id, message_id, mailbox, folder, subject, sender, recipient, cc,
                   email_date, body_plain, body_html, has_attachments, raw_headers,
                   doctype, processed, processed_at, classification, classification_data,
                   error_message, retry_count
            FROM emails
            WHERE processed = FALSE
              AND doctype = %s
              AND (retry_count < %s OR retry_count IS NULL)
              AND email_date >= %s
            ORDER BY email_date {order_sql}
            LIMIT %s
            """
            params = (doctype.value, settings.max_retries, since_date, limit)
        else:
            sql = f"""
            SELECT id, message_id, mailbox, folder, subject, sender, recipient, cc,
                   email_date, body_plain, body_html, has_attachments, raw_headers,
                   doctype, processed, processed_at, classification, classification_data,
                   error_message, retry_count
            FROM emails
            WHERE processed = FALSE
              AND doctype = %s
              AND (retry_count < %s OR retry_count IS NULL)
            ORDER BY email_date {order_sql}
            LIMIT %s
            """
            params = (doctype.value, settings.max_retries, limit)

        with self.get_connection() as conn:
            rows = conn.execute(sql, params).fetchall()

            emails = []
            for row in rows:
                classification = None
                if row["classification"]:
                    try:
                        classification = Classification(row["classification"])
                    except ValueError:
                        pass

                email = Email(
                    id=row["id"],
                    message_id=row["message_id"],
                    mailbox=row["mailbox"],
                    folder=row["folder"],
                    subject=row["subject"] or "",
                    sender=row["sender"] or "",
                    recipient=row["recipient"] or "",
                    cc=row["cc"] or "",
                    email_date=row["email_date"],
                    body_plain=row["body_plain"] or "",
                    body_html=row["body_html"] or "",
                    has_attachments=row["has_attachments"] or False,
                    raw_headers=row["raw_headers"] or {},
                    doctype=DocType(row["doctype"]) if row["doctype"] else DocType.LEAD,
                    processed=row["processed"],
                    processed_at=row["processed_at"],
                    classification=classification,
                    classification_data=row["classification_data"] or {},
                    error_message=row["error_message"],
                    retry_count=row["retry_count"] or 0,
                )
                emails.append(email)

            log.info("fetched_unprocessed_emails", count=len(emails), doctype=doctype.value)
            return emails

    def mark_processed(
        self,
        email_id: int,
        classification: Classification,
        classification_data: dict[str, Any],
    ) -> None:
        """Mark an email as successfully processed."""
        sql = """
        UPDATE emails
        SET processed = TRUE,
            processed_at = NOW(),
            classification = %s,
            classification_data = %s,
            error_message = NULL
        WHERE id = %s
        """

        with self.get_connection() as conn:
            conn.execute(sql, (
                classification.value,
                psycopg.types.json.Json(classification_data),
                email_id,
            ))
            conn.commit()
            log.info("email_marked_processed", email_id=email_id, classification=classification.value)

    def mark_error(self, email_id: int, error_message: str) -> None:
        """Mark an email as failed with error message."""
        sql = """
        UPDATE emails
        SET error_message = %s,
            retry_count = COALESCE(retry_count, 0) + 1,
            last_retry_at = NOW()
        WHERE id = %s
        """

        with self.get_connection() as conn:
            conn.execute(sql, (error_message, email_id))
            conn.commit()
            log.warning("email_marked_error", email_id=email_id, error=error_message)

    def add_processing_log(self, log_entry: ProcessingLog) -> int:
        """Add an entry to the processing audit log."""
        sql = """
        INSERT INTO processing_logs (email_id, action, doctype, result_id, details)
        VALUES (%s, %s, %s, %s, %s)
        RETURNING id
        """

        with self.get_connection() as conn:
            result = conn.execute(sql, (
                log_entry.email_id,
                log_entry.action,
                log_entry.doctype.value,
                log_entry.result_id,
                psycopg.types.json.Json(log_entry.details),
            )).fetchone()
            conn.commit()
            return result["id"] if result else 0

    def get_email_by_id(self, email_id: int) -> Email | None:
        """Fetch a single email by ID."""
        sql = """
        SELECT id, message_id, mailbox, folder, subject, sender, recipient, cc,
               email_date, body_plain, body_html, has_attachments, raw_headers,
               doctype, processed, processed_at, classification, classification_data,
               error_message, retry_count
        FROM emails
        WHERE id = %s
        """

        with self.get_connection() as conn:
            row = conn.execute(sql, (email_id,)).fetchone()
            if not row:
                return None

            classification = None
            if row["classification"]:
                try:
                    classification = Classification(row["classification"])
                except ValueError:
                    pass

            return Email(
                id=row["id"],
                message_id=row["message_id"],
                mailbox=row["mailbox"],
                folder=row["folder"],
                subject=row["subject"] or "",
                sender=row["sender"] or "",
                recipient=row["recipient"] or "",
                cc=row["cc"] or "",
                email_date=row["email_date"],
                body_plain=row["body_plain"] or "",
                body_html=row["body_html"] or "",
                has_attachments=row["has_attachments"] or False,
                raw_headers=row["raw_headers"] or {},
                doctype=DocType(row["doctype"]) if row["doctype"] else DocType.LEAD,
                processed=row["processed"],
                processed_at=row["processed_at"],
                classification=classification,
                classification_data=row["classification_data"] or {},
                error_message=row["error_message"],
                retry_count=row["retry_count"] or 0,
            )

    def get_emails_by_date(
        self,
        since_date: datetime,
        until_date: datetime | None = None,
        limit: int = 100,
        order: str = "asc",
    ) -> list[Email]:
        """
        Fetch emails by date range (ignores processed flag).

        Used by --force mode to re-process or re-preview already processed emails.

        Args:
            since_date: Start date (inclusive)
            until_date: End date (exclusive, optional)
            limit: Maximum number of emails to return
            order: Sort order for email_date ('asc' or 'desc')

        Returns:
            List of Email objects
        """
        order_sql = "DESC" if order.lower() == "desc" else "ASC"

        if until_date:
            sql = f"""
            SELECT id, message_id, mailbox, folder, subject, sender, recipient, cc,
                   email_date, body_plain, body_html, has_attachments, raw_headers,
                   doctype, processed, processed_at, classification, classification_data,
                   error_message, retry_count
            FROM emails
            WHERE email_date >= %s AND email_date < %s
            ORDER BY email_date {order_sql}
            LIMIT %s
            """
            params = (since_date, until_date, limit)
        else:
            sql = f"""
            SELECT id, message_id, mailbox, folder, subject, sender, recipient, cc,
                   email_date, body_plain, body_html, has_attachments, raw_headers,
                   doctype, processed, processed_at, classification, classification_data,
                   error_message, retry_count
            FROM emails
            WHERE email_date >= %s
            ORDER BY email_date {order_sql}
            LIMIT %s
            """
            params = (since_date, limit)

        with self.get_connection() as conn:
            rows = conn.execute(sql, params).fetchall()

            emails = []
            for row in rows:
                classification = None
                if row["classification"]:
                    try:
                        classification = Classification(row["classification"])
                    except ValueError:
                        pass

                email = Email(
                    id=row["id"],
                    message_id=row["message_id"],
                    mailbox=row["mailbox"],
                    folder=row["folder"],
                    subject=row["subject"] or "",
                    sender=row["sender"] or "",
                    recipient=row["recipient"] or "",
                    cc=row["cc"] or "",
                    email_date=row["email_date"],
                    body_plain=row["body_plain"] or "",
                    body_html=row["body_html"] or "",
                    has_attachments=row["has_attachments"] or False,
                    raw_headers=row["raw_headers"] or {},
                    doctype=DocType(row["doctype"]) if row["doctype"] else DocType.LEAD,
                    processed=row["processed"],
                    processed_at=row["processed_at"],
                    classification=classification,
                    classification_data=row["classification_data"] or {},
                    error_message=row["error_message"],
                    retry_count=row["retry_count"] or 0,
                )
                emails.append(email)

            log.info("fetched_emails_by_date", count=len(emails), since=since_date.isoformat())
            return emails

    def get_attachments(self, email_id: int) -> list[Attachment]:
        """Fetch attachments for an email."""
        sql = """
        SELECT id, email_id, filename, content_type, size_bytes, storage_url
        FROM attachments
        WHERE email_id = %s
        """

        with self.get_connection() as conn:
            rows = conn.execute(sql, (email_id,)).fetchall()
            attachments = []
            for row in rows:
                attachments.append(Attachment(
                    filename=row["filename"],
                    content_type=row["content_type"],
                    size_bytes=row["size_bytes"],
                    storage_url=row["storage_url"],
                    email_id=row["email_id"],
                ))
            return attachments

    def get_stats(self) -> dict[str, Any]:
        """Get processing statistics."""
        sql = """
        SELECT
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE processed = TRUE) as processed,
            COUNT(*) FILTER (WHERE processed = FALSE) as pending,
            COUNT(*) FILTER (WHERE error_message IS NOT NULL) as errors,
            COUNT(*) FILTER (WHERE classification = 'new_lead') as new_leads,
            COUNT(*) FILTER (WHERE classification = 'client_message') as client_messages,
            COUNT(*) FILTER (WHERE classification = 'staff_message') as staff_messages,
            COUNT(*) FILTER (WHERE classification = 'irrelevant') as irrelevant
        FROM emails
        """

        with self.get_connection() as conn:
            row = conn.execute(sql).fetchone()
            return dict(row) if row else {}
