#!/usr/bin/env python3
"""
Email Inbox Processor for Meraki CRM.

Reads emails from PostgreSQL staging database (populated by email_staging.py),
classifies them using Gemini, and triggers appropriate CRM webhook actions.

Reference: /home/hieunguyen/projects-miniforums/meraki/email-fetching/python-scanner/fetch_to_db.py
"""

import logging
import os

import httpx
import psycopg2
from psycopg2.extras import Json

from email_utils import (
    get_db_connection,
    extract_email_address,
    parse_gemini_response,
    classify_email,
    get_body_from_dict,
    is_meraki_email,
    format_html_content,
    determine_sent_or_received,
    call_conversation_webhook,
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

WEBHOOK_URL = os.environ.get('WEBHOOK_URL', 'http://webhook:8000')


# =============================================================================
# Database Functions
# =============================================================================

def get_unprocessed_emails(conn, limit: int = 50) -> list[dict]:
    """Fetch unprocessed emails from the staging database."""
    with conn.cursor() as cur:
        cur.execute("""
            SELECT id, message_id, folder, subject, sender, recipient,
                   body_plain, body_html, email_date
            FROM staged_emails
            WHERE processed = FALSE
            ORDER BY email_date ASC
            LIMIT %s
        """, (limit,))

        columns = [desc[0] for desc in cur.description]
        return [dict(zip(columns, row)) for row in cur.fetchall()]


def mark_email_processed(conn, email_id: int, classification: str, data: dict):
    """Mark an email as processed and store classification data."""
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
        "client_message": ("engaged", "client"),
        "staff_message": ("engaged", "staff"),
        "meeting_confirmed": ("meeting", "staff"),
        "quote_sent": ("quoted", "staff"),
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
    """Process unprocessed emails from the PostgreSQL staging database."""
    conn = get_db_connection()

    try:
        emails = get_unprocessed_emails(conn, limit=50)
        logger.info(f"Found {len(emails)} unprocessed emails")

        for email in emails:
            subject = email['subject'] or '(No Subject)'
            body = get_body_from_dict(email)

            sender = email['sender'] or ''
            recipient = email['recipient'] or ''

            logger.info(f"Processing: {subject[:50]}...")

            # Classify with Gemini
            result = classify_email(subject, body, sender, recipient)
            classification = result.get("classification", "irrelevant")

            logger.info(f"Classification: {classification}")

            # Determine target email (client email, not Meraki's)
            sender_email = extract_email_address(sender)
            recipient_email = extract_email_address(recipient)
            if is_meraki_email(sender_email):
                target_email = recipient_email
            else:
                target_email = sender_email

            # Override with extracted email if available
            if result.get("email"):
                target_email = result["email"]

            # 1. Create Communication for the email (ALWAYS, for non-irrelevant)
            if classification != "irrelevant" and target_email:
                email_timestamp = email['email_date'].isoformat() if email.get('email_date') else None
                call_conversation_webhook(
                    email=target_email,
                    content=format_html_content(body[:3000] if body else subject),
                    sent_or_received=determine_sent_or_received(email),
                    subject=subject,
                    timestamp=email_timestamp
                )

            # 2. THEN handle lead creation or stage update
            if classification == "new_lead":
                call_lead_webhook(result)
            elif classification in ("client_message", "staff_message", "meeting_confirmed", "quote_sent"):
                call_crm_contact_webhook(result, classification)
            # Skip irrelevant emails

            # Mark as processed regardless of webhook success
            # (to avoid reprocessing on next run)
            mark_email_processed(conn, email['id'], classification, result)

        logger.info("Email processing completed")

    finally:
        conn.close()


if __name__ == "__main__":
    process_inbox()
