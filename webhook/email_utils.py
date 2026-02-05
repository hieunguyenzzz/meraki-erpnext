#!/usr/bin/env python3
"""
Shared utilities for email processing scripts.

This module contains common functions used across:
- email_staging.py (IMAP -> PostgreSQL)
- email_processor.py (process unprocessed emails)
- email_import_lead.py (import emails for specific lead)
- email_backfill.py (historical backfill)
"""

import html
import json
import logging
import os
import re
from datetime import datetime
from email.utils import parseaddr, parsedate_to_datetime

import google.generativeai as genai
import httpx
import psycopg2
from psycopg2.extras import Json

# =============================================================================
# Configuration
# =============================================================================

# PostgreSQL Config
DB_HOST = os.environ.get('STAGING_DB_HOST', 'staging-db')
DB_PORT = int(os.environ.get('STAGING_DB_PORT', '5432'))
DB_NAME = os.environ.get('STAGING_DB_NAME', 'email_staging')
DB_USER = os.environ.get('STAGING_DB_USER', 'meraki')
DB_PASSWORD = os.environ.get('STAGING_DB_PASSWORD', 'meraki_staging')

# Gemini Config
GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY')
GEMINI_MODEL = os.environ.get('GEMINI_MODEL', 'gemini-2.0-flash')

# Constants
MERAKI_DOMAINS = ['merakiweddingplanner.com', 'merakiwp.com']

# Webhook URL
WEBHOOK_URL = os.environ.get('WEBHOOK_URL', 'http://webhook:8000')

# ERPNext Config (for duplicate checking)
ERPNEXT_URL = os.environ.get('ERPNEXT_URL', 'http://frontend:8080')
ERPNEXT_API_KEY = os.environ.get('ERPNEXT_API_KEY', '')
ERPNEXT_API_SECRET = os.environ.get('ERPNEXT_API_SECRET', '')

logger = logging.getLogger(__name__)

# =============================================================================
# Database Functions
# =============================================================================

def get_db_connection():
    """Create a new PostgreSQL connection."""
    return psycopg2.connect(
        host=DB_HOST,
        port=DB_PORT,
        dbname=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD
    )

# =============================================================================
# Email Utilities
# =============================================================================

def extract_email_address(header_value: str) -> str:
    """Extract email address from header like 'Name <email@example.com>'."""
    if not header_value:
        return ''
    _, email_addr = parseaddr(header_value)
    return email_addr.lower() if email_addr else ''


def is_meraki_email(email: str) -> bool:
    """Check if email is from Meraki domain."""
    email_lower = email.lower()
    return any(domain in email_lower for domain in MERAKI_DOMAINS)


def parse_email_date(msg) -> datetime | None:
    """Parse email date from headers."""
    date_str = msg.get('date')
    if not date_str:
        return None
    try:
        return parsedate_to_datetime(date_str)
    except Exception:
        return None


def get_body_from_dict(email: dict) -> str:
    """Get body text from email dict, preferring plain text over HTML.

    Used for emails fetched from the PostgreSQL staging database.
    """
    body = email.get('body_plain') or email.get('body_html') or ''

    if not email.get('body_plain') and email.get('body_html'):
        body = strip_html_tags(body)

    return body


def get_body_from_msg(msg) -> tuple[str, str]:
    """Extract text content from email message object.

    Used for parsing raw email messages from IMAP.

    Returns (plain_text, html_text).
    """
    text_plain = ''
    text_html = ''

    if msg.is_multipart():
        for part in msg.walk():
            content_type = part.get_content_type()
            if content_type == 'text/plain':
                payload = part.get_payload(decode=True)
                if payload:
                    text_plain += payload.decode('utf-8', errors='ignore')
            elif content_type == 'text/html':
                payload = part.get_payload(decode=True)
                if payload:
                    text_html += payload.decode('utf-8', errors='ignore')
    else:
        payload = msg.get_payload(decode=True)
        if payload:
            if msg.get_content_type() == 'text/plain':
                text_plain = payload.decode('utf-8', errors='ignore')
            elif msg.get_content_type() == 'text/html':
                text_html = payload.decode('utf-8', errors='ignore')

    return text_plain, text_html


def strip_html_tags(html: str) -> str:
    """Strip HTML tags from text."""
    text = re.sub(r'<[^>]+>', ' ', html)
    return re.sub(r'\s+', ' ', text).strip()

# =============================================================================
# Gemini Classification
# =============================================================================

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
        logger.error(f"Response text: {text[:500]}")
        return {"classification": "irrelevant", "is_client_related": False}


def extract_new_message(body: str) -> str:
    """Extract the new message content from an email reply, removing auto-quoted previous emails.

    Removes ONLY the automatic email client quote (the previous email thread), such as:
    - "On [date], [person] wrote:" followed by the quoted previous email
    - "> " prefixed lines (automatic quote markers)
    - "----Original Message----" blocks
    - "From: ... Sent: ... To: ... Subject: ..." forwarded headers

    Keeps:
    - The person's actual new message content
    - Their email signature (if part of the new message)

    Returns the extracted new message content, or original body if extraction fails.
    """
    if not body or not body.strip():
        return body

    if not GEMINI_API_KEY:
        logger.warning("GEMINI_API_KEY not set, returning original body")
        return body

    prompt = f"""Extract the NEW message content from this email reply.

REMOVE ONLY the automatic email client quote - the previous email thread that gets auto-appended when replying:
- Text after "On [date], [person] wrote:" (the quoted reply)
- Lines starting with ">" (automatic quote markers)
- "----Original Message----" blocks
- "From: ... Sent: ... To: ..." forwarded message headers

KEEP:
- The person's actual new message they wrote
- Their signature (name, regards, etc.) if it's part of their message
- Any content before the automatic quote marker

Example:
INPUT:
"Hi Phung! Thanks for the info. Zoe

On 2 Feb 2026, Meraki Wedding Planner wrote:
Warmest greetings..."

OUTPUT:
"Hi Phung! Thanks for the info. Zoe"

Email content:
{body[:4000]}

Return ONLY the new message content (before the automatic quote), nothing else:"""

    try:
        genai.configure(api_key=GEMINI_API_KEY)
        model = genai.GenerativeModel(GEMINI_MODEL)
        response = model.generate_content(prompt)
        extracted = response.text.strip()

        # Sanity check - if Gemini returns empty or very short, use original
        if not extracted or len(extracted) < 10:
            logger.warning("Gemini returned empty/short response, using original body")
            return body[:3000]

        return extracted
    except genai.types.BlockedPromptException as e:
        logger.warning(f"Gemini blocked message extraction (safety filter): {e}")
        return body[:3000]
    except Exception as e:
        error_str = str(e).lower()
        # Rate limits should be surfaced for retry logic
        if 'rate' in error_str or '429' in error_str or 'quota' in error_str:
            logger.warning(f"Gemini rate limit during message extraction: {e}")
        else:
            logger.error(f"Gemini message extraction failed: {e}")
        return body[:3000]


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
        logger.error("GEMINI_API_KEY not set - this is required for email classification")
        raise RuntimeError("GEMINI_API_KEY environment variable is required but not set")

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
    except genai.types.BlockedPromptException as e:
        logger.warning(f"Gemini blocked prompt (safety filter): {e}")
        return {"classification": "irrelevant", "is_client_related": False}
    except genai.types.StopCandidateException as e:
        logger.warning(f"Gemini stopped generation: {e}")
        return {"classification": "irrelevant", "is_client_related": False}
    except Exception as e:
        error_str = str(e).lower()
        # Check for rate limit errors
        if 'rate' in error_str or '429' in error_str or 'quota' in error_str:
            logger.error(f"Gemini rate limit/quota exceeded: {e}")
            raise  # Re-raise so caller can implement backoff/retry
        # Check for authentication errors
        if 'api key' in error_str or 'auth' in error_str or '401' in error_str or '403' in error_str:
            logger.error(f"Gemini authentication error: {e}")
            raise RuntimeError(f"Gemini API authentication failed: {e}")
        # Other errors - log and return safe default
        logger.error(f"Gemini classification failed: {e}")
        return {"classification": "irrelevant", "is_client_related": False}


# =============================================================================
# Communication Helpers
# =============================================================================

def format_html_content(text: str) -> str:
    """Convert plain text to HTML with proper line breaks.

    ERPNext Communication content field expects HTML, not plain text.
    """
    escaped = html.escape(text)
    return escaped.replace("\n", "<br>\n")


def format_initial_communication(data: dict, original_message: str, is_contact_form: bool = False) -> str:
    """Format the initial Communication content with ALL extracted info.

    This gives staff the complete context at a glance in the Lead Activity timeline.
    Returns HTML-formatted content for ERPNext Communication.

    Args:
        data: Dictionary with extracted lead data (firstname, lastname, email, etc.)
        original_message: The original email/form message body
        is_contact_form: If True, formats as "Contact Form Submission" instead of "Email Inquiry"
    """
    if is_contact_form:
        lines = ["--- Contact Form Submission ---"]
    else:
        lines = ["--- Email Inquiry ---"]

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


def determine_sent_or_received(email_dict: dict) -> str:
    """Determine if email should be logged as Sent or Received.

    For contact forms, the form is FROM the client
    even though it's forwarded by info@merakiweddingplanner.com.
    """
    if email_dict.get('is_contact_form'):
        return "Received"
    sender_email = extract_email_address(email_dict.get('sender') or '')
    return "Sent" if is_meraki_email(sender_email) else "Received"


def check_communication_exists(email: str, subject: str, timestamp: str = None) -> str | None:
    """
    Check if a Communication already exists for this email/subject/timestamp.
    Returns the Communication name if found, None otherwise.
    """
    if not ERPNEXT_API_KEY or not ERPNEXT_API_SECRET:
        logger.warning("ERPNext API keys not set, skipping duplicate check")
        return None

    headers = {
        "Authorization": f"token {ERPNEXT_API_KEY}:{ERPNEXT_API_SECRET}",
    }

    try:
        # First find the Lead by email
        lead_resp = httpx.get(
            f"{ERPNEXT_URL}/api/resource/Lead",
            params={
                "filters": json.dumps([["email_id", "=", email]]),
                "fields": json.dumps(["name"]),
                "limit_page_length": 1,
            },
            headers=headers,
            timeout=30,
        )

        if lead_resp.status_code != 200 or not lead_resp.json().get("data"):
            return None

        lead_name = lead_resp.json()["data"][0]["name"]

        # Check for existing communication
        filters = [
            ["reference_doctype", "=", "Lead"],
            ["reference_name", "=", lead_name],
            ["subject", "=", subject],
        ]

        if timestamp:
            # Convert timestamp to ERPNext datetime format and match exactly
            try:
                from datetime import datetime as dt
                parsed = dt.fromisoformat(timestamp.replace('Z', '+00:00'))
                erpnext_ts = parsed.strftime('%Y-%m-%d %H:%M:%S')
                filters.append(["communication_date", "=", erpnext_ts])
            except Exception:
                # Fallback to date-only match
                filters.append(["communication_date", "like", f"{timestamp[:10]}%"])

        comm_resp = httpx.get(
            f"{ERPNEXT_URL}/api/resource/Communication",
            params={
                "filters": json.dumps(filters),
                "fields": json.dumps(["name"]),
                "limit_page_length": 1,
            },
            headers=headers,
            timeout=30,
        )

        if comm_resp.status_code == 200 and comm_resp.json().get("data"):
            return comm_resp.json()["data"][0]["name"]

        return None
    except Exception as e:
        logger.error(f"Error checking for duplicate communication: {e}")
        return None


def call_conversation_webhook(email: str, content: str, sent_or_received: str,
                               subject: str = "", timestamp: str = None) -> bool:
    """Create a Communication record via the conversation webhook."""
    # Check for duplicate before creating
    existing = check_communication_exists(email, subject, timestamp)
    if existing:
        logger.info(f"Skipping duplicate communication: {existing}")
        return True  # Return success since the communication already exists

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
        logger.info(f"Creating conversation: {sent_or_received} - {subject[:40] if subject else '(no subject)'}...")

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


# =============================================================================
# Database Operations (consolidated from email_backfill.py, email_processor.py)
# =============================================================================

def mark_email_processed(conn, email_id: int, classification: str, data: dict):
    """Mark an email as processed in the staging database.

    Args:
        conn: PostgreSQL connection
        email_id: ID of the email in staged_emails table
        classification: Classification result (new_lead, client_message, etc.)
        data: Classification data dict to store as JSON
    """
    with conn.cursor() as cur:
        cur.execute("""
            UPDATE staged_emails
            SET processed = TRUE,
                processed_at = NOW(),
                classification = %s,
                classification_data = %s
            WHERE id = %s
        """, (classification, Json(data), email_id))
        conn.commit()


# =============================================================================
# Lead/CRM Webhook Functions (consolidated from email_backfill.py, email_processor.py)
# =============================================================================

def search_lead_by_email(email: str) -> str | None:
    """Search for a Lead in ERPNext by email address.

    Args:
        email: Email address to search for

    Returns:
        Lead name (e.g., 'CRM-LEAD-2026-00013') on success, None if not found.
    """
    if not ERPNEXT_API_KEY or not ERPNEXT_API_SECRET:
        logger.warning("ERPNext API credentials not configured, cannot search for lead")
        return None

    try:
        response = httpx.get(
            f"{ERPNEXT_URL}/api/resource/Lead",
            params={
                "filters": json.dumps([["email_id", "=", email]]),
                "fields": json.dumps(["name"]),
                "limit_page_length": 1,
            },
            headers={
                "Authorization": f"token {ERPNEXT_API_KEY}:{ERPNEXT_API_SECRET}",
            },
            timeout=30,
        )
        if response.status_code == 200:
            data = response.json().get("data", [])
            if data:
                lead_name = data[0].get("name")
                logger.info(f"Found existing lead by email search: {lead_name}")
                return lead_name
        return None
    except Exception as e:
        logger.error(f"Error searching for lead by email: {e}")
        return None


def call_lead_webhook(data: dict, timestamp: str = None, attachments: list[dict] = None) -> str | None:
    """Create a new lead via the lead webhook.

    Args:
        data: Lead data dict with fields like firstname, email, etc.
        timestamp: Optional ISO timestamp for historical backfill
        attachments: Optional list of attachment dicts with 'filename' key

    Returns:
        Lead name (e.g., 'CRM-LEAD-2026-00013') on success, None on failure.
    """
    payload = {
        "firstname": data.get("firstname") or "Unknown",
        "email": data.get("email") or "",
    }

    if timestamp:
        payload["timestamp"] = timestamp

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
        email = payload.get('email')
        ts_info = f" @ {timestamp}" if timestamp else ""
        logger.info(f"Creating lead via {url}: {payload.get('firstname')} <{email}>{ts_info}")

        response = httpx.post(url, json=payload, timeout=30)
        if response.status_code in (200, 201):
            result = response.json()
            lead_name = result.get('lead')

            # Fallback: search by email if response parsing failed
            if not lead_name and email:
                logger.warning(f"Empty lead name in response, searching by email: {email}")
                lead_name = search_lead_by_email(email)

            if lead_name:
                logger.info(f"Lead created/found: {lead_name}")
                return lead_name
            else:
                logger.error(f"Failed to get lead name from response or search for {email}")
                return None
        else:
            logger.error(f"Lead webhook failed: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        logger.error(f"Lead webhook error: {e}")
        return None


def call_crm_contact_webhook(data: dict, classification: str, timestamp: str = None) -> bool:
    """Update CRM contact stage via the CRM webhook.

    Args:
        data: Data dict with email and message_summary
        classification: Email classification (client_message, staff_message, etc.)
        timestamp: Optional ISO timestamp for historical backfill

    Returns:
        True on success, False on failure.
    """
    email = data.get("email")
    if not email:
        logger.warning("No email address found, cannot update CRM contact")
        return False

    stage_mapping = {
        "client_message": ("engaged", "client"),
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
        }
    }

    if timestamp:
        payload["payload"]["timestamp"] = timestamp

    if classification == "meeting_confirmed" and data.get("meeting_date"):
        payload["payload"]["meeting_date"] = data["meeting_date"]

    try:
        url = f"{WEBHOOK_URL}/api/crm/contact"
        ts_info = f" @ {timestamp}" if timestamp else ""
        logger.info(f"Updating CRM contact via {url}: {email} -> stage={stage}{ts_info}")

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
