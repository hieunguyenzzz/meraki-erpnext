#!/usr/bin/env python3
"""
One-time email history backfill for Meraki CRM.

Fetches 90 days of email history, groups by contact, and populates the CRM
with historical data including proper timestamps.

Features:
- SQLite database to track processed emails (avoids re-downloading)
- MinIO upload for attachments
- Historical timestamp support for leads and communications

Usage:
    python email_backfill.py [--days 90] [--dry-run]
"""

import argparse
import imaplib
import json
import logging
import os
import re
import sqlite3
import subprocess
from collections import defaultdict
from datetime import datetime, timedelta
from email import policy
from email.parser import BytesParser
from email.utils import parseaddr, parsedate_to_datetime
from pathlib import Path

import google.generativeai as genai
import httpx

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Config from environment
ZOHO_IMAP_HOST = os.environ.get('ZOHO_IMAP_HOST', 'imappro.zoho.com')
ZOHO_IMAP_PORT = 993
ZOHO_EMAIL = os.environ.get('ZOHO_EMAIL', 'info@merakiweddingplanner.com')
ZOHO_PASSWORD = os.environ.get('ZOHO_PASSWORD') or os.environ.get('ZOHO_APP_PASSWORD')

GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY')
GEMINI_MODEL = os.environ.get('GEMINI_MODEL', 'gemini-2.0-flash')

WEBHOOK_URL = os.environ.get('WEBHOOK_URL', 'http://localhost:8091')

# MinIO Config
MINIO_ALIAS = os.environ.get('MINIO_ALIAS', 'quickshare')
MINIO_BUCKET = os.environ.get('MINIO_BUCKET', 'merakiweddingplanner')
MINIO_PATH = os.environ.get('MINIO_PATH', 'crm/attachments')
MINIO_BASE_URL = os.environ.get('MINIO_BASE_URL', 'https://minio-api.hieunguyen.dev')

# Database and attachments paths
DB_PATH = Path('/app/data/backfill_emails.db')
ATTACHMENTS_DIR = Path('/app/data/attachments')

# Meraki email domains - emails FROM these are staff/system messages
MERAKI_DOMAINS = ['merakiweddingplanner.com', 'merakiwp.com']

# System email that sends auto-replies (indicates first contact)
SYSTEM_EMAIL = 'contact@merakiweddingplanner.com'


# =============================================================================
# Database Functions
# =============================================================================

def init_db() -> sqlite3.Connection:
    """Initialize SQLite database for tracking processed emails."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    ATTACHMENTS_DIR.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()

    c.execute('''CREATE TABLE IF NOT EXISTS emails (
        id INTEGER PRIMARY KEY,
        message_id TEXT UNIQUE,
        folder TEXT,
        subject TEXT,
        from_addr TEXT,
        to_addr TEXT,
        date TEXT,
        external_email TEXT,
        classification TEXT,
        processed INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )''')

    c.execute('''CREATE TABLE IF NOT EXISTS attachments (
        id INTEGER PRIMARY KEY,
        message_id TEXT,
        filename TEXT,
        content_type TEXT,
        size INTEGER,
        file_path TEXT,
        minio_url TEXT,
        FOREIGN KEY (message_id) REFERENCES emails(message_id)
    )''')

    c.execute('''CREATE INDEX IF NOT EXISTS idx_emails_message_id ON emails(message_id)''')
    c.execute('''CREATE INDEX IF NOT EXISTS idx_emails_external ON emails(external_email)''')

    conn.commit()
    return conn


def get_processed_message_ids(conn: sqlite3.Connection) -> set:
    """Get set of already processed message IDs."""
    c = conn.cursor()
    c.execute("SELECT message_id FROM emails WHERE processed = 1")
    return {row[0] for row in c.fetchall()}


def save_email_to_db(conn: sqlite3.Connection, email_data: dict, classification: str = None):
    """Save email metadata to database."""
    c = conn.cursor()
    c.execute('''INSERT OR REPLACE INTO emails
                 (message_id, folder, subject, from_addr, to_addr, date, external_email, classification, processed)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)''',
              (email_data.get('message_id'),
               email_data.get('folder'),
               email_data.get('subject'),
               email_data.get('sender'),
               email_data.get('recipient'),
               email_data.get('date').isoformat() if email_data.get('date') else None,
               email_data.get('external_email'),
               classification,
              ))
    conn.commit()


def save_attachment_to_db(conn: sqlite3.Connection, message_id: str, filename: str,
                          content_type: str, size: int, file_path: str, minio_url: str):
    """Save attachment metadata to database."""
    c = conn.cursor()
    c.execute('''INSERT INTO attachments
                 (message_id, filename, content_type, size, file_path, minio_url)
                 VALUES (?, ?, ?, ?, ?, ?)''',
              (message_id, filename, content_type, size, file_path, minio_url))
    conn.commit()


# =============================================================================
# MinIO Functions
# =============================================================================

def upload_to_minio(local_path: str, remote_path: str) -> str | None:
    """Upload file to MinIO and return the URL."""
    try:
        minio_dest = f"{MINIO_ALIAS}/{MINIO_BUCKET}/{remote_path}"
        result = subprocess.run(
            ['mc', 'cp', local_path, minio_dest],
            capture_output=True, text=True, timeout=60
        )
        if result.returncode == 0:
            return f"{MINIO_BASE_URL}/{MINIO_BUCKET}/{remote_path}"
        else:
            logger.warning(f"MinIO upload error: {result.stderr}")
            return None
    except FileNotFoundError:
        logger.warning("MinIO mc client not found, skipping upload")
        return None
    except Exception as e:
        logger.warning(f"MinIO upload error: {e}")
        return None


def save_attachments(msg, message_id: str, conn: sqlite3.Connection) -> list[dict]:
    """Save attachments to disk, upload to MinIO, and store in database."""
    attachments = []

    # Create safe directory name from message_id
    safe_id = re.sub(r'[<>@/\\:]', '_', message_id)[:50]
    email_dir = ATTACHMENTS_DIR / safe_id
    email_dir.mkdir(exist_ok=True)

    for part in msg.walk():
        if part.get_content_maintype() == 'multipart':
            continue

        filename = part.get_filename()
        if not filename:
            continue

        content = part.get_payload(decode=True)
        if not content:
            continue

        # Save file locally first
        safe_filename = re.sub(r'[/\\:]', '_', filename)
        file_path = email_dir / safe_filename
        file_path.write_bytes(content)

        # Upload to MinIO
        remote_path = f"{MINIO_PATH}/{safe_id}/{safe_filename}"
        minio_url = upload_to_minio(str(file_path), remote_path)

        # Save to database
        save_attachment_to_db(
            conn,
            message_id,
            filename,
            part.get_content_type(),
            len(content),
            str(file_path),
            minio_url
        )

        attachments.append({
            'filename': filename,
            'content_type': part.get_content_type(),
            'size': len(content),
            'minio_url': minio_url,
        })

        logger.info(f"    Attachment: {filename} ({len(content)} bytes) -> {minio_url or 'local only'}")

    return attachments


# =============================================================================
# Email Processing Functions
# =============================================================================

def extract_email_address(header_value: str) -> str:
    """Extract email address from header like 'Name <email@example.com>'."""
    _, email_addr = parseaddr(header_value)
    return email_addr.lower() if email_addr else ''


def is_meraki_email(email: str) -> bool:
    """Check if email is from Meraki domain."""
    email_lower = email.lower()
    return any(domain in email_lower for domain in MERAKI_DOMAINS)


def get_external_email(sender: str, recipient: str) -> str | None:
    """Get the external (non-Meraki) email address from sender/recipient."""
    sender_email = extract_email_address(sender)
    recipient_email = extract_email_address(recipient)

    if not is_meraki_email(sender_email):
        return sender_email
    if not is_meraki_email(recipient_email):
        return recipient_email
    return None


def get_email_body(msg) -> str:
    """Extract text content from email message."""
    text_content = ''

    if msg.is_multipart():
        for part in msg.walk():
            content_type = part.get_content_type()
            if content_type == 'text/plain':
                payload = part.get_payload(decode=True)
                if payload:
                    text_content += payload.decode('utf-8', errors='ignore')
    else:
        payload = msg.get_payload(decode=True)
        if payload:
            if msg.get_content_type() == 'text/plain':
                text_content = payload.decode('utf-8', errors='ignore')
            elif msg.get_content_type() == 'text/html':
                html = payload.decode('utf-8', errors='ignore')
                text_content = re.sub(r'<[^>]+>', ' ', html)
                text_content = re.sub(r'\s+', ' ', text_content).strip()

    return text_content


def parse_email_date(msg) -> datetime | None:
    """Parse email date from headers."""
    date_str = msg.get('date')
    if not date_str:
        return None
    try:
        return parsedate_to_datetime(date_str)
    except Exception:
        return None


def parse_gemini_response(response_text: str) -> dict:
    """Parse JSON from Gemini response, handling markdown code blocks."""
    text = response_text.strip()

    if text.startswith('```'):
        lines = text.split('\n')
        lines = lines[1:]
        if lines and lines[-1].strip() == '```':
            lines = lines[:-1]
        text = '\n'.join(lines)

    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse Gemini response: {e}")
        return {"classification": "irrelevant", "is_client_related": False}


def classify_email(subject: str, body: str, sender: str, recipient: str) -> dict:
    """Use Gemini to classify email and extract lead data."""
    if not GEMINI_API_KEY:
        logger.warning("GEMINI_API_KEY not set, skipping classification")
        return {"classification": "irrelevant", "is_client_related": False}

    sender_email = extract_email_address(sender)
    is_outgoing = is_meraki_email(sender_email)

    direction = "SENT BY Meraki staff TO client" if is_outgoing else "RECEIVED FROM potential client"

    prompt = f"""Analyze this email for Meraki Wedding Planner (Vietnam wedding planning company).

Direction: {direction}
From: {sender}
To: {recipient}
Subject: {subject}
Body:
{body[:3000]}

CLASSIFY as one of:
- new_lead: First inquiry about wedding services from a potential client (create new lead)
- client_message: Reply or follow-up from an existing/potential client
- staff_message: Sent BY Meraki staff (info@merakiweddingplanner.com) TO a client - general follow-up or response
- meeting_confirmed: Meeting, visit, or consultation date/time is mentioned or confirmed
- quote_sent: Sent BY Meraki staff containing quotation, pricing details, proposal, package information, or cost breakdown
- irrelevant: Spam, newsletters, vendor emails, automated notifications, not wedding-client-related

IMPORTANT CLASSIFICATION RULES:
- If sender contains "merakiweddingplanner.com" or "merakiwp.com":
  - If email contains pricing, costs, packages, quotation, proposal = "quote_sent"
  - Otherwise = "staff_message"
- If it's a first-time wedding inquiry, classify as "new_lead"
- If discussing existing wedding plans or is a reply, classify as "client_message"
- Newsletters, promotions, vendor invoices, job applications = "irrelevant"

EXTRACT these fields (leave null if not clearly found in the email):
- firstname, lastname: Client's name (NOT Meraki staff)
- email: Client's email address (NOT info@merakiweddingplanner.com)
- phone: Phone number
- address: City/location in Vietnam or elsewhere
- coupleName: Both names together like "Mai & Duc" or "Sarah and John"
- weddingVenue: Venue name if mentioned
- approximate: Guest count estimate (just the number)
- budget: Budget amount in VND (just the number, no currency symbol)
- weddingDate: Wedding date in MM/DD/YY format if mentioned
- position: Client's relationship - Bride, Groom, Family, or Friend
- ref: How they found Meraki - google, facebook, instagram, referral, or other
- moreDetails: Key points from the email (1-2 sentences)
- message_summary: Brief summary of email content
- meeting_date: If a meeting is mentioned, date/time in YYYY-MM-DDTHH:MM format

Return ONLY valid JSON (no markdown, no explanation):
{{
  "classification": "...",
  "is_client_related": true/false,
  "firstname": "..." or null,
  "lastname": "..." or null,
  "email": "..." or null,
  "phone": "..." or null,
  "address": "..." or null,
  "coupleName": "..." or null,
  "weddingVenue": "..." or null,
  "approximate": "..." or null,
  "budget": "..." or null,
  "weddingDate": "..." or null,
  "position": "..." or null,
  "ref": "..." or null,
  "moreDetails": "..." or null,
  "message_summary": "...",
  "meeting_date": "..." or null
}}"""

    try:
        genai.configure(api_key=GEMINI_API_KEY)
        model = genai.GenerativeModel(GEMINI_MODEL)
        response = model.generate_content(prompt)
        return parse_gemini_response(response.text)
    except Exception as e:
        logger.error(f"Gemini classification failed: {e}")
        return {"classification": "irrelevant", "is_client_related": False}


def is_first_contact_email(email_data: dict) -> bool:
    """
    Determine if this email represents the first contact in a conversation.

    First contact is either:
    - A new_lead classification (client's first inquiry)
    - System auto-reply from contact@merakiweddingplanner.com
    """
    classification = email_data.get('classification', '')
    sender = email_data.get('sender', '')
    sender_email = extract_email_address(sender)

    # New lead inquiry from client
    if classification == 'new_lead':
        return True

    # System auto-reply (indicates response to first contact)
    if sender_email == SYSTEM_EMAIL:
        return True

    return False


# =============================================================================
# Email Fetching Functions
# =============================================================================

def fetch_emails_from_folder(folder: str, days: int, conn: sqlite3.Connection,
                             batch_size: int = 20) -> list[dict]:
    """Fetch emails from a single folder with fresh connection and batching."""
    emails = []
    mail = None
    processed_ids = get_processed_message_ids(conn)

    try:
        logger.info(f"Connecting to {ZOHO_IMAP_HOST} for {folder}...")
        mail = imaplib.IMAP4_SSL(ZOHO_IMAP_HOST, ZOHO_IMAP_PORT)
        mail.login(ZOHO_EMAIL, ZOHO_PASSWORD)

        status, _ = mail.select(folder)
        if status != 'OK':
            logger.warning(f"Could not select folder {folder}")
            return emails

        since_date = (datetime.now() - timedelta(days=days)).strftime('%d-%b-%Y')
        _, message_ids = mail.search(None, f'(SINCE {since_date})')

        email_ids = message_ids[0].split() if message_ids[0] else []
        logger.info(f"Found {len(email_ids)} emails in {folder} since {since_date}")

        skipped = 0

        # Process in batches to avoid connection timeout
        for i in range(0, len(email_ids), batch_size):
            batch = email_ids[i:i + batch_size]
            logger.info(f"  Fetching batch {i // batch_size + 1} ({len(batch)} emails)...")

            for email_id in batch:
                try:
                    _, msg_data = mail.fetch(email_id, '(RFC822)')
                    raw_email = msg_data[0][1]
                    msg = BytesParser(policy=policy.default).parsebytes(raw_email)

                    message_id = msg.get('message-id', f'{folder}:{email_id.decode()}')

                    # Skip if already processed
                    if message_id in processed_ids:
                        skipped += 1
                        continue

                    subject = msg.get('subject', '(No Subject)')
                    sender = msg.get('from', 'Unknown')
                    recipient = msg.get('to', '')
                    body = get_email_body(msg)
                    email_date = parse_email_date(msg)

                    # Get external contact email
                    external_email = get_external_email(sender, recipient)
                    if not external_email:
                        continue  # Skip internal emails

                    email_data = {
                        'message_id': message_id,
                        'folder': folder,
                        'subject': subject,
                        'sender': sender,
                        'recipient': recipient,
                        'body': body,
                        'date': email_date,
                        'external_email': external_email,
                        'raw_msg': msg,  # Keep for attachment extraction
                    }

                    emails.append(email_data)

                except Exception as e:
                    logger.error(f"Error fetching email {email_id}: {e}")
                    continue

            # Send NOOP to keep connection alive between batches
            try:
                mail.noop()
            except Exception:
                pass

        if skipped > 0:
            logger.info(f"  Skipped {skipped} already processed emails")

    except Exception as e:
        logger.error(f"Error processing folder {folder}: {e}")

    finally:
        if mail:
            try:
                mail.logout()
            except Exception:
                pass

    return emails


def fetch_emails(days: int, conn: sqlite3.Connection) -> list[dict]:
    """Fetch all emails from last N days from both INBOX and Sent folders."""
    if not ZOHO_PASSWORD:
        logger.error("ZOHO_PASSWORD or ZOHO_APP_PASSWORD environment variable is required")
        return []

    emails = []

    # Fetch from each folder with separate connection to avoid timeout
    for folder in ["INBOX", "Sent"]:
        folder_emails = fetch_emails_from_folder(folder, days, conn)
        emails.extend(folder_emails)
        logger.info(f"Fetched {len(folder_emails)} new emails from {folder}")

    logger.info(f"Total new emails fetched: {len(emails)}")
    return emails


def group_by_contact(emails: list[dict]) -> dict[str, list[dict]]:
    """Group emails by external contact email, sorted oldest-first within each group."""
    groups = defaultdict(list)

    for email in emails:
        contact_email = email.get('external_email')
        if contact_email:
            groups[contact_email].append(email)

    # Sort each group by date (oldest first)
    for contact_email in groups:
        groups[contact_email].sort(key=lambda x: x.get('date') or datetime.min)

    logger.info(f"Grouped into {len(groups)} unique contacts")
    return dict(groups)


# =============================================================================
# Webhook Functions
# =============================================================================

def call_lead_webhook(data: dict, timestamp: str, attachments: list[dict] = None) -> str | None:
    """Create a new lead via the lead webhook with historical timestamp.

    Returns the lead name (e.g., 'CRM-LEAD-2026-00013') on success, None on failure.
    """
    payload = {
        "firstname": data.get("firstname") or "Unknown",
        "email": data.get("email") or "",
        "timestamp": timestamp,  # Historical timestamp
    }

    optional_fields = [
        "lastname", "phone", "address", "coupleName", "weddingVenue",
        "approximate", "budget", "weddingDate", "position", "ref", "moreDetails"
    ]
    for field in optional_fields:
        if data.get(field):
            payload[field] = data[field]

    payload["ref"] = payload.get("ref") or "email"

    # Add attachment info to moreDetails
    details = data.get("moreDetails") or ""
    if attachments:
        attachment_info = ", ".join([a['filename'] for a in attachments])
        details = f"[From Email] {details}\n\nAttachments: {attachment_info}"
    elif details:
        details = f"[From Email] {details}"
    if details:
        payload["moreDetails"] = details

    try:
        url = f"{WEBHOOK_URL}/api/webhook/lead"
        logger.info(f"Creating lead via {url}: {payload.get('firstname')} <{payload.get('email')}> @ {timestamp}")

        response = httpx.post(url, json=payload, timeout=30)
        if response.status_code in (200, 201):
            result = response.json()
            lead_name = result.get('lead')
            logger.info(f"Lead created: {lead_name or 'unknown'}")
            return lead_name
        else:
            logger.error(f"Lead webhook failed: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        logger.error(f"Lead webhook error: {e}")
        return None


def call_crm_contact_webhook(data: dict, classification: str, timestamp: str) -> bool:
    """Update CRM contact stage via the CRM webhook with historical timestamp."""
    email = data.get("email")
    if not email:
        logger.warning("No email address found, cannot update CRM contact")
        return False

    stage_mapping = {
        "client_message": ("engaged", "client"),  # Client replied = engaged
        "staff_message": ("engaged", "staff"),
        "meeting_confirmed": ("meeting", "staff"),
        "quote_sent": ("quoted", "staff"),
    }

    stage, message_type = stage_mapping.get(classification, ("engaged", "client"))

    payload = {
        "email": email,
        "stage": stage,
        "payload": {
            "message": data.get("message_summary") or "(Email content)",
            "message_type": message_type,
            "timestamp": timestamp,  # Historical timestamp
        }
    }

    if classification == "meeting_confirmed" and data.get("meeting_date"):
        payload["payload"]["meeting_date"] = data["meeting_date"]

    try:
        url = f"{WEBHOOK_URL}/api/crm/contact"
        logger.info(f"Updating CRM contact via {url}: {email} -> stage={stage} @ {timestamp}")

        response = httpx.put(url, json=payload, timeout=30)
        if response.status_code in (200, 201):
            logger.info(f"CRM contact updated successfully")
            return True
        else:
            logger.error(f"CRM webhook failed: {response.status_code} - {response.text}")
            return False
    except Exception as e:
        logger.error(f"CRM webhook error: {e}")
        return False


# =============================================================================
# Main Backfill Function
# =============================================================================

def run_backfill(days: int = 90, dry_run: bool = False):
    """Main backfill function."""
    logger.info(f"Starting email backfill for last {days} days (dry_run={dry_run})")

    # Initialize database
    conn = init_db()

    try:
        # 1. Fetch all emails (skips already processed)
        emails = fetch_emails(days, conn)
        if not emails:
            logger.warning("No new emails found")
            return

        # 2. Group by contact
        contacts = group_by_contact(emails)

        # Stats
        leads_created = 0
        leads_skipped = 0
        emails_processed = 0
        attachments_uploaded = 0

        # Track leads with timestamps for post-processing
        # (ERPNext doesn't allow setting 'creation' via API)
        lead_timestamps = []  # List of (lead_name, timestamp_str)

        # 3. Process each contact
        for contact_email, contact_emails in contacts.items():
            logger.info(f"\n{'='*60}")
            logger.info(f"Processing contact: {contact_email} ({len(contact_emails)} emails)")

            if not contact_emails:
                continue

            # Get oldest email for this contact
            oldest_email = contact_emails[0]
            oldest_date = oldest_email.get('date')

            if not oldest_date:
                logger.warning(f"  Skipping {contact_email}: no date on oldest email")
                leads_skipped += 1
                continue

            # Classify the oldest email to determine if it's first contact
            logger.info(f"  Classifying oldest email: {oldest_email.get('subject', '')[:50]}...")
            oldest_result = classify_email(
                oldest_email['subject'],
                oldest_email['body'],
                oldest_email['sender'],
                oldest_email['recipient']
            )
            oldest_result['sender'] = oldest_email['sender']
            oldest_result['email'] = oldest_result.get('email') or contact_email

            # Check if this is the first contact
            if not is_first_contact_email(oldest_result):
                logger.warning(f"  Skipping {contact_email}: oldest email is not first contact "
                              f"(classification={oldest_result.get('classification')})")
                # Still save to DB so we don't re-process
                save_email_to_db(conn, oldest_email, oldest_result.get('classification'))
                leads_skipped += 1
                continue

            # Extract and upload attachments
            attachments = []
            if oldest_email.get('raw_msg'):
                attachments = save_attachments(
                    oldest_email['raw_msg'],
                    oldest_email['message_id'],
                    conn
                )
                attachments_uploaded += len(attachments)

            # This IS the first contact - create lead
            timestamp = oldest_date.isoformat()
            logger.info(f"  First contact found! Creating lead with timestamp: {timestamp}")

            if not dry_run:
                lead_name = call_lead_webhook(oldest_result, timestamp, attachments)
                if not lead_name:
                    logger.error(f"  Failed to create lead for {contact_email}")
                    save_email_to_db(conn, oldest_email, oldest_result.get('classification'))
                    leads_skipped += 1
                    continue

                # Track for post-processing timestamp update
                # Convert ISO timestamp to MySQL datetime format
                try:
                    dt = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
                    mysql_ts = dt.strftime('%Y-%m-%d %H:%M:%S')
                    lead_timestamps.append((lead_name, mysql_ts))
                except Exception as e:
                    logger.warning(f"  Could not parse timestamp {timestamp}: {e}")

            # Save to database
            save_email_to_db(conn, oldest_email, oldest_result.get('classification'))

            leads_created += 1
            emails_processed += 1

            # Process remaining emails for this contact (oldest to newest)
            for email_data in contact_emails[1:]:
                email_date = email_data.get('date')
                if not email_date:
                    continue

                logger.info(f"  Processing follow-up: {email_data.get('subject', '')[:40]}...")

                result = classify_email(
                    email_data['subject'],
                    email_data['body'],
                    email_data['sender'],
                    email_data['recipient']
                )
                result['email'] = contact_email

                classification = result.get('classification', 'irrelevant')

                # Save attachments for all emails
                if email_data.get('raw_msg'):
                    email_attachments = save_attachments(
                        email_data['raw_msg'],
                        email_data['message_id'],
                        conn
                    )
                    attachments_uploaded += len(email_attachments)

                # Save to database
                save_email_to_db(conn, email_data, classification)

                if classification == 'irrelevant':
                    logger.info(f"    Skipping irrelevant email")
                    continue

                timestamp = email_date.isoformat()

                if not dry_run:
                    call_crm_contact_webhook(result, classification, timestamp)

                emails_processed += 1

        # Summary
        logger.info(f"\n{'='*60}")
        logger.info("BACKFILL COMPLETE")
        logger.info(f"  Leads created: {leads_created}")
        logger.info(f"  Leads skipped (incomplete history): {leads_skipped}")
        logger.info(f"  Total emails processed: {emails_processed}")
        logger.info(f"  Attachments uploaded: {attachments_uploaded}")
        if dry_run:
            logger.info("  (DRY RUN - no actual changes made)")

        # Generate timestamp update script if leads were created
        if lead_timestamps and not dry_run:
            logger.info(f"\n{'='*60}")
            logger.info("POST-PROCESSING: Update Lead Creation Timestamps")
            logger.info("ERPNext doesn't allow setting 'creation' via API.")
            logger.info("Run the following command to update timestamps:")
            logger.info(f"\n{'='*60}")

            # Generate Python code for bench console
            script_lines = [
                "# Update creation timestamps for backfilled leads",
                "updates = [",
            ]
            for lead_name, ts in lead_timestamps:
                script_lines.append(f"    ('{lead_name}', '{ts}'),")
            script_lines.extend([
                "]",
                "",
                "for lead_name, creation in updates:",
                "    frappe.db.set_value('Lead', lead_name, 'creation', creation)",
                "    print(f'Updated {lead_name} to {creation}')",
                "",
                "frappe.db.commit()",
                "print('All updates committed')",
            ])

            script = "\n".join(script_lines)
            logger.info("\n" + script)
            logger.info(f"\n{'='*60}")
            logger.info("To run: docker compose exec backend bash -c \"bench --site erp.merakiwp.com console << 'EOF'")
            logger.info(script)
            logger.info("EOF\"")

    finally:
        conn.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Backfill CRM with email history")
    parser.add_argument("--days", type=int, default=90, help="Number of days to fetch (default: 90)")
    parser.add_argument("--dry-run", action="store_true", help="Run without making changes")
    args = parser.parse_args()

    run_backfill(days=args.days, dry_run=args.dry_run)
