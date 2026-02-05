#!/usr/bin/env python3
"""
Email Inbox Processor for Meraki CRM.

Reads emails from PostgreSQL staging database (populated by email_staging.py),
classifies them using Gemini, and triggers appropriate CRM webhook actions.
"""

import logging

from email_utils import (
    get_db_connection,
    extract_email_address,
    classify_email,
    get_body_from_dict,
    is_meraki_email,
    format_html_content,
    determine_sent_or_received,
    call_conversation_webhook,
    extract_new_message,
    # Consolidated functions
    mark_email_processed,
    call_lead_webhook,
    call_crm_contact_webhook,
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


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
        emails = []
        for row in cur.fetchall():
            email_dict = dict(zip(columns, row))
            # Contact form emails have subject "Meraki Contact Form"
            email_dict['is_contact_form'] = (email_dict.get('subject') or '').strip() == 'Meraki Contact Form'
            emails.append(email_dict)
        return emails


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

            # Validate target_email is not empty
            if not target_email:
                logger.warning(f"No valid target email found for: {subject[:50]}")
                mark_email_processed(conn, email['id'], 'irrelevant', result)
                continue

            # 1. Create Communication for the email (ALWAYS, for non-irrelevant)
            if classification != "irrelevant":
                email_timestamp = email['email_date'].isoformat() if email.get('email_date') else None
                # For follow-up emails, extract only the new message (strip quoted replies)
                if classification in ("client_message", "staff_message", "meeting_confirmed", "quote_sent"):
                    extracted_body = extract_new_message(body)
                    comm_content = format_html_content(extracted_body[:3000] if extracted_body else subject)
                else:
                    # new_lead - use full body since it's the first message
                    comm_content = format_html_content(body[:3000] if body else subject)
                call_conversation_webhook(
                    email=target_email,
                    content=comm_content,
                    sent_or_received=determine_sent_or_received(email),
                    subject=subject,
                    timestamp=email_timestamp
                )

            # 2. THEN handle lead creation or stage update
            if classification == "new_lead":
                call_lead_webhook(result)  # No timestamp for real-time processing
            elif classification in ("client_message", "staff_message", "meeting_confirmed", "quote_sent"):
                call_crm_contact_webhook(result, classification)  # No timestamp for real-time
            # Skip irrelevant emails

            # Mark as processed regardless of webhook success
            # (to avoid reprocessing on next run)
            mark_email_processed(conn, email['id'], classification, result)

        logger.info("Email processing completed")

    finally:
        conn.close()


if __name__ == "__main__":
    process_inbox()
