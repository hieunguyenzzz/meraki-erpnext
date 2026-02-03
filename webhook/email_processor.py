#!/usr/bin/env python3
"""
Email Inbox Processor for Meraki CRM.

Fetches emails from Zoho IMAP, classifies them using Gemini,
and triggers appropriate CRM webhook actions.

Reference: /home/hieunguyen/projects-miniforums/meraki/email-fetching/python-scanner/fetch_to_db.py
"""

import imaplib
import json
import logging
import os
import re
import sqlite3
from datetime import datetime, timedelta
from email import policy
from email.parser import BytesParser
from email.utils import parseaddr
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

WEBHOOK_URL = os.environ.get('WEBHOOK_URL', 'http://webhook:8000')

# Database for tracking processed emails
DB_PATH = Path('/app/data/processed_emails.db')


def init_db() -> sqlite3.Connection:
    """Initialize SQLite database for tracking processed emails."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()

    c.execute('''CREATE TABLE IF NOT EXISTS processed_emails (
        id INTEGER PRIMARY KEY,
        message_id TEXT UNIQUE,
        folder TEXT,
        subject TEXT,
        classification TEXT,
        processed_at TEXT DEFAULT CURRENT_TIMESTAMP
    )''')

    conn.commit()
    return conn


def get_processed_ids(conn: sqlite3.Connection) -> set:
    """Get set of already processed message IDs."""
    c = conn.cursor()
    c.execute("SELECT message_id FROM processed_emails")
    return {row[0] for row in c.fetchall()}


def mark_processed(conn: sqlite3.Connection, msg_id: str, folder: str,
                   subject: str, classification: str):
    """Store message ID as processed."""
    c = conn.cursor()
    c.execute('''INSERT OR REPLACE INTO processed_emails
                 (message_id, folder, subject, classification, processed_at)
                 VALUES (?, ?, ?, ?, ?)''',
              (msg_id, folder, subject, classification, datetime.now().isoformat()))
    conn.commit()


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
                # Strip HTML tags for basic text extraction
                html = payload.decode('utf-8', errors='ignore')
                text_content = re.sub(r'<[^>]+>', ' ', html)
                text_content = re.sub(r'\s+', ' ', text_content).strip()

    return text_content


def extract_email_address(header_value: str) -> str:
    """Extract email address from header like 'Name <email@example.com>'."""
    _, email_addr = parseaddr(header_value)
    return email_addr.lower() if email_addr else ''


def parse_gemini_response(response_text: str) -> dict:
    """Parse JSON from Gemini response, handling markdown code blocks."""
    text = response_text.strip()

    # Remove markdown code blocks if present
    if text.startswith('```'):
        lines = text.split('\n')
        # Remove first line (```json or ```)
        lines = lines[1:]
        # Remove last line if it's just ```
        if lines and lines[-1].strip() == '```':
            lines = lines[:-1]
        text = '\n'.join(lines)

    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse Gemini response: {e}")
        logger.error(f"Response text: {text[:500]}")
        return {"classification": "irrelevant", "is_client_related": False}


def classify_email(subject: str, body: str, sender: str, recipient: str) -> dict:
    """Use Gemini to classify email and extract lead data."""
    if not GEMINI_API_KEY:
        logger.warning("GEMINI_API_KEY not set, skipping classification")
        return {"classification": "irrelevant", "is_client_related": False}

    # Determine if this is an outgoing email (from info@)
    sender_email = extract_email_address(sender)
    is_outgoing = 'merakiweddingplanner.com' in sender_email or 'merakiwp.com' in sender_email

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
- staff_message: Sent BY Meraki staff (info@merakiweddingplanner.com) TO a client
- meeting_confirmed: Meeting, visit, or consultation date/time is mentioned or confirmed
- irrelevant: Spam, newsletters, vendor emails, automated notifications, not wedding-client-related

IMPORTANT CLASSIFICATION RULES:
- If sender contains "merakiweddingplanner.com" or "merakiwp.com", classify as "staff_message"
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


def call_lead_webhook(data: dict) -> bool:
    """Create a new lead via the lead webhook."""
    # Build payload matching the contact form fields
    payload = {
        "firstname": data.get("firstname") or "Unknown",
        "email": data.get("email") or "",
    }

    # Add optional fields if present
    optional_fields = [
        "lastname", "phone", "address", "coupleName", "weddingVenue",
        "approximate", "budget", "weddingDate", "position", "ref", "moreDetails"
    ]
    for field in optional_fields:
        if data.get(field):
            payload[field] = data[field]

    # Add source indicator
    payload["ref"] = payload.get("ref") or "email"
    if data.get("moreDetails"):
        payload["moreDetails"] = f"[From Email] {data['moreDetails']}"

    try:
        url = f"{WEBHOOK_URL}/api/webhook/lead"
        logger.info(f"Creating lead via {url}: {payload.get('firstname')} <{payload.get('email')}>")

        response = httpx.post(url, json=payload, timeout=30)
        if response.status_code in (200, 201):
            logger.info(f"Lead created successfully")
            return True
        else:
            logger.error(f"Lead webhook failed: {response.status_code} - {response.text}")
            return False
    except Exception as e:
        logger.error(f"Lead webhook error: {e}")
        return False


def call_crm_contact_webhook(data: dict, classification: str) -> bool:
    """Update CRM contact stage via the CRM webhook."""
    email = data.get("email")
    if not email:
        logger.warning("No email address found, cannot update CRM contact")
        return False

    # Map classification to stage and message type
    stage_mapping = {
        "client_message": ("current", "client"),
        "staff_message": ("engaged", "staff"),
        "meeting_confirmed": ("meeting", "staff"),
    }

    stage, message_type = stage_mapping.get(classification, ("current", "client"))

    payload = {
        "email": email,
        "stage": stage,
        "message_type": message_type,
    }

    # Add meeting date if available
    if classification == "meeting_confirmed" and data.get("meeting_date"):
        payload["meeting_date"] = data["meeting_date"]

    # Add message summary as note
    if data.get("message_summary"):
        payload["note"] = data["message_summary"]

    try:
        url = f"{WEBHOOK_URL}/api/crm/contact"
        logger.info(f"Updating CRM contact via {url}: {email} -> stage={stage}")

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


def process_inbox():
    """Process emails from Zoho IMAP."""
    if not ZOHO_PASSWORD:
        logger.error("ZOHO_PASSWORD or ZOHO_APP_PASSWORD environment variable is required")
        return

    conn = init_db()
    processed_ids = get_processed_ids(conn)
    mail = None

    try:
        logger.info(f"Connecting to {ZOHO_IMAP_HOST}...")
        mail = imaplib.IMAP4_SSL(ZOHO_IMAP_HOST, ZOHO_IMAP_PORT)
        mail.login(ZOHO_EMAIL, ZOHO_PASSWORD)
        logger.info(f"Connected as {ZOHO_EMAIL}")

        # Process both INBOX and Sent folders
        folders = ["INBOX", "Sent"]

        for folder in folders:
            try:
                status, _ = mail.select(folder)
                if status != 'OK':
                    logger.warning(f"Could not select folder {folder}")
                    continue

                logger.info(f"Processing {folder}...")

                # Search emails from last 24 hours
                since_date = (datetime.now() - timedelta(days=1)).strftime('%d-%b-%Y')
                _, message_ids = mail.search(None, f'(SINCE {since_date})')

                email_ids = message_ids[0].split() if message_ids[0] else []
                logger.info(f"Found {len(email_ids)} emails in {folder} since {since_date}")

                processed_count = 0
                skipped_count = 0

                for email_id in email_ids:
                    msg_id_str = f"{folder}:{email_id.decode()}"

                    if msg_id_str in processed_ids:
                        skipped_count += 1
                        continue

                    try:
                        _, msg_data = mail.fetch(email_id, '(RFC822)')
                        raw_email = msg_data[0][1]
                        msg = BytesParser(policy=policy.default).parsebytes(raw_email)

                        subject = msg.get('subject', '(No Subject)')
                        sender = msg.get('from', 'Unknown')
                        recipient = msg.get('to', '')
                        body = get_email_body(msg)

                        logger.info(f"Processing: {subject[:50]}...")

                        # Classify with Gemini
                        result = classify_email(subject, body, sender, recipient)
                        classification = result.get("classification", "irrelevant")

                        logger.info(f"Classification: {classification}")

                        # Call appropriate webhook
                        if classification == "new_lead":
                            call_lead_webhook(result)
                        elif classification in ("client_message", "staff_message", "meeting_confirmed"):
                            call_crm_contact_webhook(result, classification)
                        # Skip irrelevant emails

                        # Mark as processed regardless of webhook success
                        # (to avoid reprocessing on next run)
                        mark_processed(conn, msg_id_str, folder, subject, classification)
                        processed_count += 1

                    except Exception as e:
                        logger.error(f"Error processing email {email_id}: {e}")
                        continue

                logger.info(f"{folder}: Processed {processed_count}, Skipped {skipped_count} (already processed)")

            except Exception as e:
                logger.error(f"Error processing folder {folder}: {e}")
                continue

    finally:
        if mail:
            try:
                mail.logout()
            except Exception:
                pass
        conn.close()

    logger.info("Email processing completed")


if __name__ == "__main__":
    process_inbox()
