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

        -- flight_emails: per-email state for the flight bookings pipeline (MWP-72)
        CREATE TABLE IF NOT EXISTS flight_emails (
            message_id VARCHAR(512) PRIMARY KEY,
            imap_uid BIGINT,
            subject TEXT,
            received_at TIMESTAMPTZ,
            status VARCHAR(20) NOT NULL,          -- done | skipped | unmatched | failed
            email_type VARCHAR(30),
            booking VARCHAR(40),                  -- Flight Booking name
            attempts INT NOT NULL DEFAULT 0,
            error TEXT,
            extraction JSONB,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        -- where imap_uid is valid: retries by UID are only safe in the same folder and UIDVALIDITY
        ALTER TABLE flight_emails ADD COLUMN IF NOT EXISTS imap_folder TEXT;
        ALTER TABLE flight_emails ADD COLUMN IF NOT EXISTS uidvalidity BIGINT;

        -- flight_sync_runs: one row per pipeline run
        CREATE TABLE IF NOT EXISTS flight_sync_runs (
            id SERIAL PRIMARY KEY,
            started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            finished_at TIMESTAMPTZ,
            status VARCHAR(20),
            stats JSONB,
            error TEXT
        );
        """

        with self.get_connection() as conn:
            conn.execute(schema_sql)
            conn.commit()
            log.info("database_schema_initialized")

    # ---- Flight bookings (MWP-72) ----

    FLIGHT_EMAIL_COLUMNS = (
        "imap_uid", "subject", "received_at", "status", "email_type",
        "booking", "error", "extraction", "imap_folder", "uidvalidity",
    )

    def get_flight_email(self, message_id: str) -> dict | None:
        with self.get_connection() as conn:
            return conn.execute(
                "SELECT * FROM flight_emails WHERE message_id = %s", (message_id,)
            ).fetchone()

    def upsert_flight_email(self, message_id: str, **fields: Any) -> None:
        """Insert or update a flight email's state; attempts is incremented on each 'failed' write."""
        unknown = set(fields) - set(self.FLIGHT_EMAIL_COLUMNS)
        if unknown:
            raise ValueError(f"Unknown flight_emails columns: {sorted(unknown)}")
        if "status" not in fields:
            raise ValueError("status is required")
        if fields.get("extraction") is not None:
            fields["extraction"] = psycopg.types.json.Json(fields["extraction"])

        columns = ", ".join(fields)
        placeholders = ", ".join(f"%({name})s" for name in fields)
        updates = ", ".join(f"{name} = EXCLUDED.{name}" for name in fields)
        sql = f"""
        INSERT INTO flight_emails (message_id, {columns}, attempts)
        VALUES (%(message_id)s, {placeholders}, %(initial_attempts)s)
        ON CONFLICT (message_id) DO UPDATE SET
            {updates},
            attempts = flight_emails.attempts + %(initial_attempts)s,
            updated_at = now()
        """
        params = {
            **fields,
            "message_id": message_id,
            "initial_attempts": 1 if fields["status"] == "failed" else 0,
        }
        with self.get_connection() as conn:
            conn.execute(sql, params)
            conn.commit()
        log.info("flight_email_upserted", message_id=message_id, status=fields["status"])

    def start_flight_run(self) -> int:
        with self.get_connection() as conn:
            row = conn.execute(
                "INSERT INTO flight_sync_runs (status) VALUES ('running') RETURNING id"
            ).fetchone()
            conn.commit()
        log.info("flight_run_started", run_id=row["id"])
        return row["id"]

    FLIGHT_RUN_LOCK_KEY = 720_072  # pg advisory lock id for the flight sync (MWP-72)

    @contextmanager
    def flight_run_lock(self) -> Generator[bool, None, None]:
        """Cross-process flight sync lock: yields True if granted, held until the block exits.

        A session-level advisory lock on its own connection, so it is also released if the process dies.
        """
        conn = psycopg.connect(self.connection_string, row_factory=dict_row, autocommit=True)
        granted = False
        try:
            granted = conn.execute("SELECT pg_try_advisory_lock(%s) AS ok", (self.FLIGHT_RUN_LOCK_KEY,)).fetchone()["ok"]
            log.info("flight_run_lock", granted=granted)
            yield granted
        finally:
            try:
                if granted:
                    conn.execute("SELECT pg_advisory_unlock(%s)", (self.FLIGHT_RUN_LOCK_KEY,))
            except psycopg.Error as exc:
                log.error("flight_run_unlock_failed", error=repr(exc))  # closing the session releases it anyway
            finally:
                conn.close()

    def interrupt_flight_runs(self) -> int:
        """Close runs left 'running' by a restart. Call only while holding flight_run_lock (no run can be live)."""
        with self.get_connection() as conn:
            cursor = conn.execute(
                "UPDATE flight_sync_runs SET status = 'error', error = 'interrupted', finished_at = now() "
                "WHERE status = 'running'"
            )
            conn.commit()
        if cursor.rowcount:
            log.warning("flight_runs_interrupted", count=cursor.rowcount)
        return cursor.rowcount

    def finish_flight_run(self, run_id: int, status: str, stats: dict, error: str | None = None) -> None:
        with self.get_connection() as conn:
            conn.execute(
                """
                UPDATE flight_sync_runs
                SET finished_at = now(), status = %s, stats = %s, error = %s
                WHERE id = %s
                """,
                (status, psycopg.types.json.Json(stats), error, run_id),
            )
            conn.commit()
        log.info("flight_run_finished", run_id=run_id, status=status, error=error)

    def last_flight_run(self, statuses: tuple[str, ...] | None = None) -> dict | None:
        """The latest run, or the latest run with one of `statuses`."""
        with self.get_connection() as conn:
            if statuses:
                return conn.execute(
                    "SELECT * FROM flight_sync_runs WHERE status = ANY(%s) ORDER BY id DESC LIMIT 1",
                    (list(statuses),),
                ).fetchone()
            return conn.execute(
                "SELECT * FROM flight_sync_runs ORDER BY id DESC LIMIT 1"
            ).fetchone()

    def flight_emails_to_retry(self, max_attempts: int) -> list[dict]:
        """Unmatched emails (always retried) and failed ones with attempts left."""
        with self.get_connection() as conn:
            return conn.execute(
                """
                SELECT * FROM flight_emails
                WHERE status = 'unmatched' OR (status = 'failed' AND attempts < %s)
                ORDER BY received_at NULLS LAST, imap_uid
                """,
                (max_attempts,),
            ).fetchall()

    def count_flight_emails(self, status: str) -> int:
        with self.get_connection() as conn:
            row = conn.execute(
                "SELECT count(*) AS n FROM flight_emails WHERE status = %s", (status,)
            ).fetchone()
            return row["n"]

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

    def get_skipped_followups(
        self,
        since_date: datetime,
        until_date: datetime | None = None,
        limit: int = 100,
    ) -> list[Email]:
        """
        Fetch follow-up emails that were skipped because lead didn't exist.

        These are emails that:
        - Have a follow-up classification (quote_sent, client_message, etc.)
        - Have a processing_log entry with action='skipped_no_lead'
        - Have NOT been successfully processed since (no 'communication_added' log)

        Used by backfill to retry follow-ups after leads are created.
        """
        if until_date:
            sql = """
            SELECT DISTINCT e.id, e.message_id, e.mailbox, e.folder, e.subject, e.sender,
                   e.recipient, e.cc, e.email_date, e.body_plain, e.body_html,
                   e.has_attachments, e.raw_headers, e.doctype, e.processed, e.processed_at,
                   e.classification, e.classification_data, e.error_message, e.retry_count
            FROM emails e
            JOIN processing_logs pl ON e.id = pl.email_id
            WHERE pl.action = 'skipped_no_lead'
              AND e.email_date >= %s AND e.email_date < %s
              AND NOT EXISTS (
                SELECT 1 FROM processing_logs pl2
                WHERE pl2.email_id = e.id
                AND pl2.action = 'communication_added'
              )
            ORDER BY e.email_date ASC
            LIMIT %s
            """
            params = (since_date, until_date, limit)
        else:
            sql = """
            SELECT DISTINCT e.id, e.message_id, e.mailbox, e.folder, e.subject, e.sender,
                   e.recipient, e.cc, e.email_date, e.body_plain, e.body_html,
                   e.has_attachments, e.raw_headers, e.doctype, e.processed, e.processed_at,
                   e.classification, e.classification_data, e.error_message, e.retry_count
            FROM emails e
            JOIN processing_logs pl ON e.id = pl.email_id
            WHERE pl.action = 'skipped_no_lead'
              AND e.email_date >= %s
              AND NOT EXISTS (
                SELECT 1 FROM processing_logs pl2
                WHERE pl2.email_id = e.id
                AND pl2.action = 'communication_added'
              )
            ORDER BY e.email_date ASC
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

            log.info("fetched_skipped_followups", count=len(emails))
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
