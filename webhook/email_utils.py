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
# Communication Helpers
# =============================================================================

def format_html_content(text: str) -> str:
    """Convert plain text to HTML with proper line breaks.

    ERPNext Communication content field expects HTML, not plain text.
    """
    escaped = html.escape(text)
    return escaped.replace("\n", "<br>\n")


def determine_sent_or_received(email_dict: dict) -> str:
    """Determine if email should be logged as Sent or Received.

    For contact forms, the form is FROM the client
    even though it's forwarded by info@merakiweddingplanner.com.
    """
    if email_dict.get('is_contact_form'):
        return "Received"
    sender_email = extract_email_address(email_dict.get('sender') or '')
    return "Sent" if is_meraki_email(sender_email) else "Received"


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
