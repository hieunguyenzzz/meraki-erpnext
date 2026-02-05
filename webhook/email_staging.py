#!/usr/bin/env python3
"""
Email Staging Script for Meraki CRM.

Fetches emails from Zoho IMAP and stages them into PostgreSQL for later processing.
This script focuses on reliably downloading and storing emails without any
classification or webhook calls - those happen in a separate processing step.

Features:
- PostgreSQL staging database for reliable storage
- MinIO upload for attachments
- Idempotent: skips already-fetched emails based on message_id
- Configurable date range

Usage:
    python email_staging.py [--days 90] [--folder INBOX] [--dry-run]
"""

import argparse
import imaplib
import io
import json
import logging
import os
import re
from datetime import datetime, timedelta
from email import policy
from email.parser import BytesParser
from pathlib import Path

import psycopg2
from email_utils import extract_email_address, parse_email_date, get_body_from_msg
from psycopg2.extras import Json
from minio import Minio
from minio.error import S3Error

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# =============================================================================
# Configuration from Environment
# =============================================================================

# IMAP Config
ZOHO_IMAP_HOST = os.environ.get('ZOHO_IMAP_HOST', 'imappro.zoho.com')
ZOHO_IMAP_PORT = 993
ZOHO_EMAIL = os.environ.get('ZOHO_EMAIL', 'info@merakiweddingplanner.com')
ZOHO_PASSWORD = os.environ.get('ZOHO_PASSWORD') or os.environ.get('ZOHO_APP_PASSWORD')

# PostgreSQL Config
DB_HOST = os.environ.get('STAGING_DB_HOST', 'staging-db')
DB_PORT = int(os.environ.get('STAGING_DB_PORT', '5432'))
DB_NAME = os.environ.get('STAGING_DB_NAME', 'email_staging')
DB_USER = os.environ.get('STAGING_DB_USER', 'meraki')
DB_PASSWORD = os.environ.get('STAGING_DB_PASSWORD', 'meraki_staging')

# MinIO Config
MINIO_ENDPOINT = os.environ.get('MINIO_ENDPOINT', 'minio-api.hieunguyen.dev')
MINIO_ACCESS_KEY = os.environ.get('MINIO_ACCESS_KEY', '')
MINIO_SECRET_KEY = os.environ.get('MINIO_SECRET_KEY', '')
MINIO_BUCKET = os.environ.get('MINIO_BUCKET', 'merakiweddingplanner')
MINIO_PATH = os.environ.get('MINIO_PATH', 'crm/attachments')
MINIO_SECURE = os.environ.get('MINIO_SECURE', 'true').lower() == 'true'

# MinIO client (lazy initialization)
_minio_client = None


def get_minio_client() -> Minio | None:
    """Get or create MinIO client."""
    global _minio_client

    if _minio_client is not None:
        return _minio_client

    if not MINIO_ACCESS_KEY or not MINIO_SECRET_KEY:
        logger.warning("MinIO credentials not configured (MINIO_ACCESS_KEY/MINIO_SECRET_KEY)")
        return None

    try:
        _minio_client = Minio(
            MINIO_ENDPOINT,
            access_key=MINIO_ACCESS_KEY,
            secret_key=MINIO_SECRET_KEY,
            secure=MINIO_SECURE
        )
        return _minio_client
    except Exception as e:
        logger.error(f"Failed to create MinIO client: {e}")
        return None


# =============================================================================
# Database Functions
# =============================================================================

def get_db_connection():
    """Create a new database connection."""
    return psycopg2.connect(
        host=DB_HOST,
        port=DB_PORT,
        dbname=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD
    )


def init_db():
    """Initialize the database schema."""
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # Create staged_emails table
            cur.execute("""
                CREATE TABLE IF NOT EXISTS staged_emails (
                    id BIGSERIAL PRIMARY KEY,
                    message_id TEXT UNIQUE NOT NULL,
                    folder TEXT NOT NULL,
                    subject TEXT,
                    sender TEXT,
                    recipient TEXT,
                    cc TEXT,
                    email_date TIMESTAMPTZ,
                    body_plain TEXT,
                    body_html TEXT,
                    has_attachments BOOLEAN DEFAULT FALSE,
                    raw_headers JSONB,
                    fetched_at TIMESTAMPTZ DEFAULT NOW(),
                    processed BOOLEAN DEFAULT FALSE,
                    processed_at TIMESTAMPTZ,
                    classification TEXT,
                    classification_data JSONB
                )
            """)

            # Create staged_attachments table
            cur.execute("""
                CREATE TABLE IF NOT EXISTS staged_attachments (
                    id BIGSERIAL PRIMARY KEY,
                    email_id BIGINT REFERENCES staged_emails(id) ON DELETE CASCADE,
                    message_id TEXT NOT NULL,
                    filename TEXT,
                    content_type TEXT,
                    size_bytes INTEGER,
                    minio_url TEXT,
                    fetched_at TIMESTAMPTZ DEFAULT NOW()
                )
            """)

            # Create indexes
            cur.execute("CREATE INDEX IF NOT EXISTS idx_staged_emails_date ON staged_emails(email_date)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_staged_emails_sender ON staged_emails(sender)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_staged_emails_processed ON staged_emails(processed)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_staged_emails_folder ON staged_emails(folder)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_staged_emails_classification ON staged_emails(classification)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_staged_emails_message_id ON staged_emails(message_id)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_staged_attachments_message_id ON staged_attachments(message_id)")

            conn.commit()
            logger.info("Database schema initialized successfully")

    finally:
        conn.close()


def get_existing_message_ids(conn) -> set:
    """Get set of already-fetched message IDs."""
    with conn.cursor() as cur:
        cur.execute("SELECT message_id FROM staged_emails")
        return {row[0] for row in cur.fetchall()}


def stage_email(conn, email_data: dict) -> int | None:
    """
    Insert email into staged_emails table.
    Returns the email id on success, None if already exists.
    """
    with conn.cursor() as cur:
        try:
            cur.execute("""
                INSERT INTO staged_emails
                    (message_id, folder, subject, sender, recipient, cc,
                     email_date, body_plain, body_html, has_attachments, raw_headers)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (message_id) DO NOTHING
                RETURNING id
            """, (
                email_data['message_id'],
                email_data['folder'],
                email_data.get('subject'),
                email_data.get('sender'),
                email_data.get('recipient'),
                email_data.get('cc'),
                email_data.get('email_date'),
                email_data.get('body_plain'),
                email_data.get('body_html'),
                email_data.get('has_attachments', False),
                Json(email_data.get('raw_headers', {}))
            ))

            result = cur.fetchone()
            conn.commit()

            if result:
                return result[0]
            return None

        except Exception as e:
            conn.rollback()
            logger.error(f"Error staging email {email_data.get('message_id')}: {e}")
            return None


def stage_attachment(conn, email_id: int, message_id: str, attachment_data: dict):
    """Insert attachment record into staged_attachments table."""
    with conn.cursor() as cur:
        try:
            cur.execute("""
                INSERT INTO staged_attachments
                    (email_id, message_id, filename, content_type, size_bytes, minio_url)
                VALUES (%s, %s, %s, %s, %s, %s)
            """, (
                email_id,
                message_id,
                attachment_data['filename'],
                attachment_data['content_type'],
                attachment_data['size_bytes'],
                attachment_data.get('minio_url')
            ))
            conn.commit()
        except Exception as e:
            conn.rollback()
            logger.error(f"Error staging attachment: {e}")


# =============================================================================
# MinIO Functions
# =============================================================================

def upload_to_minio(data: bytes, remote_path: str, content_type: str = 'application/octet-stream') -> str | None:
    """Upload data to MinIO and return the URL."""
    client = get_minio_client()
    if client is None:
        return None

    try:
        # Upload using bytes directly
        client.put_object(
            MINIO_BUCKET,
            remote_path,
            io.BytesIO(data),
            length=len(data),
            content_type=content_type
        )

        # Build the public URL
        protocol = 'https' if MINIO_SECURE else 'http'
        return f"{protocol}://{MINIO_ENDPOINT}/{MINIO_BUCKET}/{remote_path}"

    except S3Error as e:
        logger.warning(f"MinIO S3 error: {e}")
        return None
    except Exception as e:
        logger.warning(f"MinIO upload error: {e}")
        return None


# =============================================================================
# Email Parsing Functions
# =============================================================================

def extract_headers(msg) -> dict:
    """Extract relevant headers as a dictionary."""
    headers = {}
    for key in ['from', 'to', 'cc', 'subject', 'date', 'reply-to', 'in-reply-to', 'references']:
        value = msg.get(key)
        if value:
            headers[key] = str(value)
    return headers


def parse_email(msg, folder: str) -> dict:
    """Parse email message into a dictionary."""
    message_id = msg.get('message-id', f'{folder}:{id(msg)}')
    subject = msg.get('subject', '(No Subject)')
    sender = msg.get('from', '')
    recipient = msg.get('to', '')
    cc = msg.get('cc', '')
    email_date = parse_email_date(msg)
    body_plain, body_html = get_body_from_msg(msg)
    headers = extract_headers(msg)

    # Check if there are attachments
    has_attachments = False
    if msg.is_multipart():
        for part in msg.walk():
            if part.get_filename():
                has_attachments = True
                break

    return {
        'message_id': message_id,
        'folder': folder,
        'subject': subject,
        'sender': sender,
        'recipient': recipient,
        'cc': cc,
        'email_date': email_date,
        'body_plain': body_plain,
        'body_html': body_html,
        'has_attachments': has_attachments,
        'raw_headers': headers,
        'raw_msg': msg,  # Keep for attachment extraction
    }


def extract_attachments(msg, message_id: str) -> list[dict]:
    """Extract attachment metadata and upload to MinIO."""
    attachments = []

    if not msg.is_multipart():
        return attachments

    # Create safe directory name from message_id
    safe_id = re.sub(r'[<>@/\\:]', '_', message_id)[:50]

    for part in msg.walk():
        if part.get_content_maintype() == 'multipart':
            continue

        filename = part.get_filename()
        if not filename:
            continue

        content = part.get_payload(decode=True)
        if not content:
            continue

        # Upload directly to MinIO (no local file needed)
        safe_filename = re.sub(r'[/\\:]', '_', filename)
        remote_path = f"{MINIO_PATH}/{safe_id}/{safe_filename}"
        content_type = part.get_content_type()
        minio_url = upload_to_minio(content, remote_path, content_type)

        attachments.append({
            'filename': filename,
            'content_type': content_type,
            'size_bytes': len(content),
            'minio_url': minio_url,
        })

        logger.info(f"    Attachment: {filename} ({len(content)} bytes) -> {minio_url or 'upload failed'}")

    return attachments


# =============================================================================
# IMAP Functions
# =============================================================================

def connect_imap():
    """Create IMAP connection to Zoho."""
    if not ZOHO_PASSWORD:
        raise ValueError("ZOHO_PASSWORD or ZOHO_APP_PASSWORD environment variable is required")

    logger.info(f"Connecting to {ZOHO_IMAP_HOST}...")
    mail = imaplib.IMAP4_SSL(ZOHO_IMAP_HOST, ZOHO_IMAP_PORT)
    mail.login(ZOHO_EMAIL, ZOHO_PASSWORD)
    return mail


def _fetch_from_current_folder(mail, folder: str, days: int, existing_ids: set,
                                batch_size: int = 20) -> list[dict]:
    """Fetch emails from the currently selected folder using existing connection."""
    emails = []

    # Calculate date range
    since_date = (datetime.now() - timedelta(days=days)).strftime('%d-%b-%Y')
    _, message_ids = mail.search(None, f'(SINCE {since_date})')

    email_ids = message_ids[0].split() if message_ids[0] else []
    logger.info(f"Found {len(email_ids)} emails in {folder} since {since_date}")

    skipped = 0

    # Process in batches
    for i in range(0, len(email_ids), batch_size):
        batch = email_ids[i:i + batch_size]
        logger.info(f"  Fetching batch {i // batch_size + 1} ({len(batch)} emails)...")

        for email_id in batch:
            try:
                _, msg_data = mail.fetch(email_id, '(RFC822)')
                raw_email = msg_data[0][1]
                msg = BytesParser(policy=policy.default).parsebytes(raw_email)

                message_id = msg.get('message-id', f'{folder}:{email_id.decode()}')

                # Skip if already in database
                if message_id in existing_ids:
                    skipped += 1
                    continue

                email_data = parse_email(msg, folder)
                emails.append(email_data)

            except Exception as e:
                logger.error(f"Error fetching email {email_id}: {e}")
                continue

        # Send NOOP to keep connection alive
        try:
            mail.noop()
        except Exception:
            pass

    if skipped > 0:
        logger.info(f"  Skipped {skipped} already-fetched emails")

    return emails


def fetch_emails_from_folders(folders: list[str], days: int, existing_ids: set,
                               batch_size: int = 20) -> list[dict]:
    """Fetch emails from multiple folders using ONE IMAP connection."""
    all_emails = []
    mail = None

    try:
        mail = connect_imap()

        for folder in folders:
            logger.info(f"\n{'='*60}")
            logger.info(f"Processing folder: {folder}")

            status, _ = mail.select(folder)
            if status != 'OK':
                logger.warning(f"Could not select folder {folder}")
                continue

            emails = _fetch_from_current_folder(mail, folder, days, existing_ids, batch_size)
            all_emails.extend(emails)
            logger.info(f"  Fetched {len(emails)} new emails from {folder}")

    except Exception as e:
        logger.error(f"Error during IMAP fetch: {e}")

    finally:
        if mail:
            try:
                mail.logout()
            except Exception:
                pass

    return all_emails


# =============================================================================
# Main Staging Function
# =============================================================================

def run_staging(days: int = 90, folders: list[str] = None, dry_run: bool = False):
    """Main staging function."""
    if folders is None:
        folders = ["INBOX", "Sent"]

    logger.info(f"Starting email staging for last {days} days")
    logger.info(f"Folders: {folders}")
    logger.info(f"Dry run: {dry_run}")

    # Initialize database
    if not dry_run:
        init_db()

    # Get existing message IDs
    existing_ids = set()
    if not dry_run:
        conn = get_db_connection()
        try:
            existing_ids = get_existing_message_ids(conn)
            logger.info(f"Found {len(existing_ids)} existing emails in database")
        finally:
            conn.close()

    # Fetch from all folders using single IMAP connection
    emails = fetch_emails_from_folders(folders, days, existing_ids)
    total_fetched = len(emails)

    if dry_run:
        logger.info(f"\n{'='*60}")
        logger.info(f"Would stage {total_fetched} emails (dry run)")
        logger.info("STAGING COMPLETE (DRY RUN)")
        return

    # Stats
    total_staged = 0
    total_attachments = 0

    # Stage each email
    conn = get_db_connection()
    try:
        for email_data in emails:
            email_id = stage_email(conn, email_data)

            if email_id is None:
                continue  # Already exists or error

            total_staged += 1
            logger.info(f"  Staged: {email_data.get('subject', '')[:50]}...")

            # Extract and stage attachments
            if email_data.get('has_attachments') and email_data.get('raw_msg'):
                attachments = extract_attachments(
                    email_data['raw_msg'],
                    email_data['message_id']
                )

                for att in attachments:
                    stage_attachment(conn, email_id, email_data['message_id'], att)
                    total_attachments += 1

    finally:
        conn.close()

    # Summary
    logger.info(f"\n{'='*60}")
    logger.info("STAGING COMPLETE")
    logger.info(f"  Total emails fetched: {total_fetched}")
    logger.info(f"  Total emails staged: {total_staged}")
    logger.info(f"  Total attachments: {total_attachments}")


def get_stats():
    """Print database statistics."""
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM staged_emails")
            total_emails = cur.fetchone()[0]

            cur.execute("SELECT COUNT(*) FROM staged_emails WHERE processed = TRUE")
            processed = cur.fetchone()[0]

            cur.execute("SELECT COUNT(*) FROM staged_attachments")
            attachments = cur.fetchone()[0]

            cur.execute("""
                SELECT folder, COUNT(*) FROM staged_emails GROUP BY folder
            """)
            folder_counts = dict(cur.fetchall())

            cur.execute("""
                SELECT DATE(email_date) as d, COUNT(*)
                FROM staged_emails
                WHERE email_date IS NOT NULL
                GROUP BY d
                ORDER BY d DESC
                LIMIT 10
            """)
            recent_dates = cur.fetchall()

        print(f"\nEmail Staging Database Statistics:")
        print(f"  Total emails: {total_emails}")
        print(f"  Processed: {processed}")
        print(f"  Unprocessed: {total_emails - processed}")
        print(f"  Attachments: {attachments}")
        print(f"\nBy folder:")
        for folder, count in folder_counts.items():
            print(f"  {folder}: {count}")
        print(f"\nRecent dates:")
        for date, count in recent_dates:
            print(f"  {date}: {count} emails")

    finally:
        conn.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Stage emails from Zoho IMAP to PostgreSQL")
    parser.add_argument("--days", type=int, default=90, help="Number of days to fetch (default: 90)")
    parser.add_argument("--folder", type=str, action="append", help="Folder(s) to fetch (default: INBOX, Sent)")
    parser.add_argument("--dry-run", action="store_true", help="Run without making changes")
    parser.add_argument("--stats", action="store_true", help="Show database statistics and exit")
    parser.add_argument("--init-db", action="store_true", help="Initialize database only and exit")
    args = parser.parse_args()

    if args.stats:
        get_stats()
    elif args.init_db:
        init_db()
        print("Database initialized successfully")
    else:
        folders = args.folder if args.folder else None
        run_staging(days=args.days, folders=folders, dry_run=args.dry_run)
