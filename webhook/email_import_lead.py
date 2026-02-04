#!/usr/bin/env python3
"""
Single Lead Email Import for Meraki CRM.

Imports ALL emails for a specific email address (no time limit),
creates a Lead, logs all Communications, and determines the correct
CRM stage based on conversation history.

Usage:
    python email_import_lead.py <email_address>
    python email_import_lead.py hdkw2027@gmail.com
    python email_import_lead.py hdkw2027@gmail.com --dry-run
"""

import argparse
import imaplib
import json
import logging
import os
import re
import sqlite3
from datetime import datetime
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

# Meraki email domains
MERAKI_DOMAINS = ['merakiweddingplanner.com', 'merakiwp.com']

# Stage progression order (for tracking highest stage reached)
STAGE_ORDER = ['new', 'engaged', 'meeting', 'quoted', 'won']

# SQLite cache path
DB_PATH = Path('/app/data/import_emails.db')


# =============================================================================
# SQLite Cache Functions
# =============================================================================

def init_db() -> sqlite3.Connection:
    """Initialize SQLite database for caching fetched emails."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS cached_emails (
        id INTEGER PRIMARY KEY,
        target_email TEXT,
        message_id TEXT,
        folder TEXT,
        subject TEXT,
        sender TEXT,
        recipient TEXT,
        body TEXT,
        date TEXT,
        is_internal INTEGER DEFAULT 0,
        fetched_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(target_email, message_id)
    )''')
    c.execute('''CREATE INDEX IF NOT EXISTS idx_target_email ON cached_emails(target_email)''')
    conn.commit()
    return conn


def get_cached_emails(conn: sqlite3.Connection, target_email: str) -> list[dict]:
    """Get cached emails for a target email address."""
    c = conn.cursor()
    c.execute('''SELECT message_id, folder, subject, sender, recipient, body, date, is_internal
                 FROM cached_emails WHERE target_email = ? ORDER BY date''', (target_email.lower(),))
    rows = c.fetchall()

    emails = []
    for row in rows:
        message_id, folder, subject, sender, recipient, body, date_str, is_internal = row
        email_date = None
        if date_str:
            try:
                email_date = datetime.fromisoformat(date_str)
            except ValueError:
                pass
        emails.append({
            'message_id': message_id,
            'folder': folder,
            'subject': subject,
            'sender': sender,
            'recipient': recipient,
            'body': body,
            'date': email_date,
            'is_internal': bool(is_internal),
        })
    return emails


def cache_emails(conn: sqlite3.Connection, target_email: str, emails: list[dict]):
    """Cache fetched emails."""
    c = conn.cursor()
    for email in emails:
        date_str = email['date'].isoformat() if email.get('date') else None
        c.execute('''INSERT OR REPLACE INTO cached_emails
                     (target_email, message_id, folder, subject, sender, recipient, body, date, is_internal)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                  (target_email.lower(), email['message_id'], email['folder'], email['subject'],
                   email['sender'], email['recipient'], email['body'], date_str, 1 if email.get('is_internal') else 0))
    conn.commit()
    logger.info(f"Cached {len(emails)} emails for {target_email}")


# =============================================================================
# Email Utility Functions
# =============================================================================

def extract_email_address(header_value: str) -> str:
    """Extract email address from header like 'Name <email@example.com>'."""
    _, email_addr = parseaddr(header_value)
    return email_addr.lower() if email_addr else ''


def is_meraki_email(email: str) -> bool:
    """Check if email is from Meraki domain."""
    email_lower = email.lower()
    return any(domain in email_lower for domain in MERAKI_DOMAINS)


def get_email_body(msg) -> str:
    """Extract text content from email message.

    Prefers text/plain, but falls back to text/html if no plain text is available.
    """
    text_content = ''
    html_content = ''

    if msg.is_multipart():
        for part in msg.walk():
            content_type = part.get_content_type()
            if content_type == 'text/plain':
                payload = part.get_payload(decode=True)
                if payload:
                    text_content += payload.decode('utf-8', errors='ignore')
            elif content_type == 'text/html' and not html_content:
                # Store HTML as fallback if no plain text
                payload = part.get_payload(decode=True)
                if payload:
                    html = payload.decode('utf-8', errors='ignore')
                    html_content = re.sub(r'<[^>]+>', ' ', html)
                    html_content = re.sub(r'\s+', ' ', html_content).strip()
    else:
        payload = msg.get_payload(decode=True)
        if payload:
            if msg.get_content_type() == 'text/plain':
                text_content = payload.decode('utf-8', errors='ignore')
            elif msg.get_content_type() == 'text/html':
                html = payload.decode('utf-8', errors='ignore')
                text_content = re.sub(r'<[^>]+>', ' ', html)
                text_content = re.sub(r'\s+', ' ', text_content).strip()

    # Use HTML content as fallback if no plain text was found
    return text_content if text_content else html_content


def parse_email_date(msg) -> datetime | None:
    """Parse email date from headers."""
    date_str = msg.get('date')
    if not date_str:
        return None
    try:
        return parsedate_to_datetime(date_str)
    except Exception:
        return None


def body_contains_email(body: str, target_email: str) -> bool:
    """Check if email body contains the target email address."""
    return target_email.lower() in body.lower()


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


# =============================================================================
# Gemini Classification
# =============================================================================

def classify_email(subject: str, body: str, sender: str, recipient: str) -> dict:
    """Use Gemini to classify email and extract lead data.

    Classifications:
    - new_lead: First inquiry from potential client
    - client_message: Reply/follow-up from client
    - staff_message: Email FROM Meraki staff (general follow-up)
    - meeting_confirmed: Meeting/consultation date mentioned
    - quote_sent: Email FROM Meraki staff containing quotation/pricing/proposal
    - irrelevant: Spam, newsletters, vendor emails
    """
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
- If it's a first-time wedding inquiry = "new_lead"
- If discussing existing wedding plans or is a reply = "client_message"
- Newsletters, promotions, vendor invoices, job applications = "irrelevant"

EXTRACT these fields - preserve raw text EXACTLY as written:

- firstname, lastname: Client's name (NOT Meraki staff)
- email: Client's email address (NOT info@merakiweddingplanner.com)
- phone: Phone number
- address: City/country (e.g., "Australia", "Vietnam", "USA")
- coupleName: Both names together like "Mai & Duc" or "Sarah and John" or "Zoe and Liam"
- weddingVenue: Venue EXACTLY as written (e.g., "Saigon", "Flexible (currently browsing Phu Quoc)", "Hoi An or Da Nang")
- approximate: Guest count EXACTLY as written (e.g., "90-110", "150-250", "TBA")
- budget: Budget EXACTLY as written (e.g., "TBA", "50000-70000", "100000usd") - do NOT convert
- weddingDate: Date EXACTLY as written (e.g., "Flexible- would like to aim for end of 2026", "TBA end of 2027", "March-April 2026")
- position: Client's relationship - Bride, Groom, Family, or Friend
- ref: How they found Meraki - google, facebook, instagram, referral, or other
- moreDetails: The client's full message EXACTLY as written - preserve ALL text, newlines, and formatting. This is their inquiry/story.
- message_summary: Brief 1-sentence summary for activity log
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


# =============================================================================
# IMAP Functions
# =============================================================================

def fetch_emails_for_address(target_email: str, db_conn: sqlite3.Connection = None) -> list[dict]:
    """Fetch ALL emails to/from a specific email address (no time limit).

    Uses SQLite cache to avoid re-fetching from IMAP on subsequent runs.

    Searches:
    1. INBOX: FROM <target_email> (direct messages)
    2. INBOX: FROM info@merakiweddingplanner.com (check body for forwards)
    3. Sent: TO <target_email> (replies to lead)
    """
    # Check cache first
    if db_conn:
        cached = get_cached_emails(db_conn, target_email)
        if cached:
            logger.info(f"Using {len(cached)} cached emails for {target_email}")
            return cached

    if not ZOHO_PASSWORD:
        logger.error("ZOHO_PASSWORD or ZOHO_APP_PASSWORD environment variable is required")
        return []

    emails = []
    seen_message_ids = set()

    try:
        logger.info(f"Connecting to {ZOHO_IMAP_HOST}...")
        mail = imaplib.IMAP4_SSL(ZOHO_IMAP_HOST, ZOHO_IMAP_PORT)
        mail.login(ZOHO_EMAIL, ZOHO_PASSWORD)
        logger.info(f"Connected as {ZOHO_EMAIL}")

        # 1. Search INBOX for direct messages FROM target
        logger.info(f"Searching INBOX for emails FROM {target_email}...")
        mail.select("INBOX")
        _, message_ids = mail.search(None, f'(FROM "{target_email}")')
        inbox_from_ids = message_ids[0].split() if message_ids[0] else []
        logger.info(f"  Found {len(inbox_from_ids)} direct emails from target")

        # 2. Search INBOX for forwards (FROM info@merakiweddingplanner.com)
        logger.info(f"Searching INBOX for forwarded messages...")
        _, message_ids = mail.search(None, f'(FROM "info@merakiweddingplanner.com")')
        inbox_forward_ids = message_ids[0].split() if message_ids[0] else []
        logger.info(f"  Found {len(inbox_forward_ids)} potential forwards to check")

        # 3. Search Sent for replies TO target
        logger.info(f"Searching Sent for emails TO {target_email}...")
        mail.select("Sent")
        _, message_ids = mail.search(None, f'(TO "{target_email}")')
        sent_ids = message_ids[0].split() if message_ids[0] else []
        logger.info(f"  Found {len(sent_ids)} sent emails to target")

        # Process INBOX direct messages
        mail.select("INBOX")
        for email_id in inbox_from_ids:
            email_data = fetch_single_email(mail, email_id, "INBOX")
            if email_data and email_data['message_id'] not in seen_message_ids:
                emails.append(email_data)
                seen_message_ids.add(email_data['message_id'])

        # Process emails from info@ - check body for target email (contact forms, forwards)
        for email_id in inbox_forward_ids:
            email_data = fetch_single_email(mail, email_id, "INBOX")
            if not email_data or email_data['message_id'] in seen_message_ids:
                continue

            # Check if target email appears in the body (contact form or forward)
            if body_contains_email(email_data['body'], target_email):
                email_data['is_internal'] = True  # From info@ but about this lead
                emails.append(email_data)
                seen_message_ids.add(email_data['message_id'])
                logger.info(f"    Found related message: {email_data['subject'][:50]}...")

        # Process Sent folder
        mail.select("Sent")
        for email_id in sent_ids:
            email_data = fetch_single_email(mail, email_id, "Sent")
            if email_data and email_data['message_id'] not in seen_message_ids:
                emails.append(email_data)
                seen_message_ids.add(email_data['message_id'])

        mail.logout()

    except Exception as e:
        logger.error(f"IMAP error: {e}")
        return []

    # Sort by date (oldest first)
    emails.sort(key=lambda x: x.get('date') or datetime.min)

    logger.info(f"Total emails found: {len(emails)}")

    # Cache emails for future runs
    if db_conn and emails:
        cache_emails(db_conn, target_email, emails)

    return emails


def fetch_single_email(mail, email_id, folder: str) -> dict | None:
    """Fetch and parse a single email."""
    try:
        _, msg_data = mail.fetch(email_id, '(RFC822)')
        raw_email = msg_data[0][1]
        msg = BytesParser(policy=policy.default).parsebytes(raw_email)

        message_id = msg.get('message-id', f'{folder}:{email_id.decode()}')
        subject = msg.get('subject', '(No Subject)')
        sender = msg.get('from', 'Unknown')
        recipient = msg.get('to', '')
        body = get_email_body(msg)
        email_date = parse_email_date(msg)

        return {
            'message_id': message_id,
            'folder': folder,
            'subject': subject,
            'sender': sender,
            'recipient': recipient,
            'body': body,
            'date': email_date,
            'is_internal': False,  # True if from info@ but contains target email
        }

    except Exception as e:
        logger.error(f"Error fetching email {email_id}: {e}")
        return None


# =============================================================================
# Webhook Functions
# =============================================================================

def call_lead_webhook(data: dict, timestamp: str, target_email: str) -> str | None:
    """Create a new lead via the lead webhook.

    Returns the lead name on success, None on failure.
    """
    payload = {
        "firstname": data.get("firstname") or "Unknown",
        "email": data.get("email") or target_email,
        "timestamp": timestamp,
    }

    optional_fields = [
        "lastname", "phone", "address", "coupleName", "weddingVenue",
        "approximate", "budget", "weddingDate", "position", "ref", "moreDetails"
    ]
    for field in optional_fields:
        if data.get(field):
            payload[field] = data[field]

    payload["ref"] = payload.get("ref") or "email"

    details = data.get("moreDetails") or ""
    if details:
        payload["moreDetails"] = f"[Email Import] {details}"

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


def call_conversation_webhook(email: str, content: str, sent_or_received: str,
                               subject: str = "", timestamp: str = None) -> bool:
    """Create a Communication record via the conversation webhook."""
    payload = {
        "email": email,
        "content": content,
        "sent_or_received": sent_or_received,
        "subject": subject,
    }

    if timestamp:
        payload["timestamp"] = timestamp

    try:
        url = f"{WEBHOOK_URL}/api/webhook/conversation"
        logger.info(f"Creating conversation: {sent_or_received} - {subject[:40]}...")

        response = httpx.post(url, json=payload, timeout=30)
        if response.status_code in (200, 201):
            logger.info(f"Conversation created successfully")
            return True
        else:
            logger.error(f"Conversation webhook failed: {response.status_code} - {response.text}")
            return False
    except Exception as e:
        logger.error(f"Conversation webhook error: {e}")
        return False


def call_crm_contact_webhook(email: str, stage: str, message: str,
                             message_type: str, timestamp: str = None,
                             meeting_date: str = None) -> bool:
    """Update CRM contact stage via the CRM webhook."""
    payload = {
        "email": email,
        "stage": stage,
        "payload": {
            "message": message,
            "message_type": message_type,
        }
    }

    if timestamp:
        payload["payload"]["timestamp"] = timestamp

    if meeting_date:
        payload["payload"]["meeting_date"] = meeting_date

    try:
        url = f"{WEBHOOK_URL}/api/crm/contact"
        logger.info(f"Updating CRM contact: {email} -> stage={stage}")

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
# Stage Determination
# =============================================================================

def get_stage_from_classification(classification: str) -> str | None:
    """Map email classification to CRM stage."""
    mapping = {
        "new_lead": "new",
        "client_message": "engaged",
        "staff_message": "engaged",
        "meeting_confirmed": "meeting",
        "quote_sent": "quoted",
    }
    return mapping.get(classification)


def get_message_type(classification: str) -> str:
    """Get message type (client/staff) from classification."""
    staff_classifications = ["staff_message", "meeting_confirmed", "quote_sent"]
    return "staff" if classification in staff_classifications else "client"


def is_higher_stage(new_stage: str, current_stage: str) -> bool:
    """Check if new_stage is higher in the funnel than current_stage."""
    try:
        new_idx = STAGE_ORDER.index(new_stage)
        current_idx = STAGE_ORDER.index(current_stage)
        return new_idx > current_idx
    except ValueError:
        return False


# =============================================================================
# Communication Content Formatting
# =============================================================================

def format_html_content(text: str) -> str:
    """Convert plain text to HTML with proper line breaks.

    ERPNext Communication content field expects HTML, not plain text.
    """
    import html
    # Escape HTML entities first
    escaped = html.escape(text)
    # Convert newlines to <br> tags
    return escaped.replace("\n", "<br>\n")


def format_initial_communication(data: dict, original_message: str) -> str:
    """Format the initial Communication content with ALL extracted info.

    This gives staff the complete context at a glance in the Lead Activity timeline.
    Returns HTML-formatted content for ERPNext Communication.
    """
    lines = ["--- Contact Form Submission ---"]

    # Name
    name_parts = []
    if data.get('firstname'):
        name_parts.append(data['firstname'])
    if data.get('lastname'):
        name_parts.append(data['lastname'])
    if name_parts:
        lines.append(f"Name: {' '.join(name_parts)}")

    # Email
    if data.get('email'):
        lines.append(f"Email: {data['email']}")

    # Phone
    if data.get('phone'):
        lines.append(f"Phone: {data['phone']}")

    # Position/Relationship
    if data.get('position'):
        lines.append(f"Position: {data['position']}")

    # Couple name
    if data.get('coupleName'):
        lines.append(f"Couple: {data['coupleName']}")

    # Address/Location
    if data.get('address'):
        lines.append(f"Address: {data['address']}")

    # Wedding date (raw text)
    if data.get('weddingDate'):
        lines.append(f"Wedding Date: {data['weddingDate']}")

    # Wedding venue (raw text)
    if data.get('weddingVenue'):
        lines.append(f"Wedding Venue: {data['weddingVenue']}")

    # Guest count (raw text)
    if data.get('approximate'):
        lines.append(f"Guest Count: {data['approximate']}")

    # Budget (raw text)
    if data.get('budget'):
        lines.append(f"Budget: {data['budget']}")

    # Source/Referral
    if data.get('ref'):
        lines.append(f"Source: {data['ref']}")

    # Add the full message
    message = data.get('moreDetails') or original_message
    if message:
        lines.append("")
        lines.append("--- Message ---")
        lines.append(message)

    # Convert to HTML with proper line breaks
    return format_html_content("\n".join(lines))


# =============================================================================
# Main Import Function
# =============================================================================

def determine_sent_or_received(email: dict) -> str:
    """Determine if email should be logged as Sent or Received.

    For contact forms (is_internal=True), the form is FROM the client
    even though it's forwarded by info@merakiweddingplanner.com.
    """
    if email.get('is_internal'):
        # Contact form or forwarded message = client submission
        return "Received"
    sender_email = extract_email_address(email['sender'])
    return "Sent" if is_meraki_email(sender_email) else "Received"


def import_lead_emails(target_email: str, dry_run: bool = False):
    """Import all emails for a specific email address."""
    logger.info(f"{'='*60}")
    logger.info(f"IMPORTING LEAD: {target_email}")
    logger.info(f"Dry run: {dry_run}")
    logger.info(f"{'='*60}")

    # Initialize SQLite cache
    db_conn = init_db()

    # 1. Fetch all emails (uses cache if available)
    emails = fetch_emails_for_address(target_email, db_conn)
    if not emails:
        logger.error("No emails found for this address")
        return

    logger.info(f"\nFound {len(emails)} emails:")
    for i, email in enumerate(emails):
        date_str = email['date'].strftime('%Y-%m-%d %H:%M') if email['date'] else 'Unknown'
        sender_email = extract_email_address(email['sender'])
        direction = "→" if is_meraki_email(sender_email) else "←"
        internal_flag = " [contact form]" if email.get('is_internal') else ""
        logger.info(f"  {i+1}. [{date_str}] {direction} {email['subject'][:50]}{internal_flag}")

    if not emails[0].get('date'):
        logger.error("First email has no date, cannot proceed")
        return

    # 2. Classify first email and create Lead
    first_email = emails[0]
    logger.info(f"\n{'='*60}")
    logger.info(f"PROCESSING FIRST EMAIL (creating Lead)")
    logger.info(f"Subject: {first_email['subject']}")
    logger.info(f"Date: {first_email['date']}")

    # Use Gemini to classify and extract data
    first_result = classify_email(
        first_email['subject'],
        first_email['body'],
        first_email['sender'],
        first_email['recipient']
    )

    # Ensure email field is set
    first_result['email'] = first_result.get('email') or target_email

    logger.info(f"Classification: {first_result.get('classification')}")
    logger.info(f"Extracted name: {first_result.get('firstname')} {first_result.get('lastname')}")

    timestamp = first_email['date'].isoformat()

    if not dry_run:
        lead_name = call_lead_webhook(first_result, timestamp, target_email)
        if not lead_name:
            logger.error("Failed to create lead, aborting")
            return
        logger.info(f"Created Lead: {lead_name}")

        # Create initial Communication with ALL extracted info for staff visibility
        initial_message = format_initial_communication(first_result, first_email['body'][:2000])
        sent_or_received = determine_sent_or_received(first_email)

        call_conversation_webhook(
            target_email,
            content=initial_message,
            sent_or_received=sent_or_received,
            subject=first_email['subject'],
            timestamp=timestamp
        )
        logger.info(f"Created initial Communication ({sent_or_received}) with full context")
    else:
        logger.info("[DRY RUN] Would create lead and initial communication")

    # 3. Process remaining emails - track stage progression
    current_stage = "new"
    emails_processed = 1
    stage_transitions = []

    for email in emails[1:]:
        if not email.get('date'):
            logger.warning(f"Skipping email without date: {email['subject'][:40]}")
            continue

        logger.info(f"\n{'-'*40}")
        logger.info(f"Processing: {email['subject'][:50]}")

        result = classify_email(
            email['subject'],
            email['body'],
            email['sender'],
            email['recipient']
        )

        classification = result.get('classification', 'irrelevant')
        logger.info(f"Classification: {classification}")

        if classification == 'irrelevant':
            logger.info("Skipping irrelevant email")
            continue

        timestamp = email['date'].isoformat()
        sent_or_received = determine_sent_or_received(email)

        # Determine stage from classification
        email_stage = get_stage_from_classification(classification)
        message_type = get_message_type(classification)

        # Use actual email body for Communication content (not Gemini summary)
        # Truncate if too long and format as HTML
        email_body = email['body'][:3000] if email['body'] else email['subject']
        formatted_content = format_html_content(email_body)

        # Gemini summary still used for stage transition messages
        stage_message = result.get('message_summary') or email['subject']

        if not dry_run:
            # Create Communication record with actual email body
            call_conversation_webhook(
                target_email,
                content=formatted_content,
                sent_or_received=sent_or_received,
                subject=email['subject'],
                timestamp=timestamp
            )

            # Update stage if this classification represents a higher stage
            if email_stage and is_higher_stage(email_stage, current_stage):
                meeting_date = result.get('meeting_date') if classification == 'meeting_confirmed' else None

                call_crm_contact_webhook(
                    email=target_email,
                    stage=email_stage,
                    message=stage_message,
                    message_type=message_type,
                    timestamp=timestamp,
                    meeting_date=meeting_date
                )

                stage_transitions.append({
                    'from': current_stage,
                    'to': email_stage,
                    'date': timestamp,
                    'email_subject': email['subject'][:40]
                })
                current_stage = email_stage
                logger.info(f"Stage transition: {stage_transitions[-1]['from']} -> {email_stage}")

        else:
            logger.info(f"[DRY RUN] Would create conversation ({sent_or_received}) and potentially update stage to {email_stage}")
            if email_stage and is_higher_stage(email_stage, current_stage):
                current_stage = email_stage

        emails_processed += 1

    # 4. Summary
    logger.info(f"\n{'='*60}")
    logger.info("IMPORT COMPLETE")
    logger.info(f"{'='*60}")
    logger.info(f"Emails processed: {emails_processed}")
    logger.info(f"Final stage: {current_stage}")

    if stage_transitions:
        logger.info(f"\nStage transitions:")
        for t in stage_transitions:
            logger.info(f"  {t['from']} -> {t['to']} ({t['date'][:10]})")

    if dry_run:
        logger.info("\n[DRY RUN] No actual changes were made")

    # Close database connection
    db_conn.close()


# =============================================================================
# Main
# =============================================================================

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Import all emails for a specific lead into the CRM",
        epilog="Example: python email_import_lead.py hdkw2027@gmail.com"
    )
    parser.add_argument("email", help="The email address to import")
    parser.add_argument("--dry-run", action="store_true",
                       help="Run without making any changes")
    args = parser.parse_args()

    import_lead_emails(args.email, dry_run=args.dry_run)
