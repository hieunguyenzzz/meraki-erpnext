#!/usr/bin/env python3
"""
Re-process follow-up emails for leads that had their conversations missed.

These leads were successfully created but the backfill script falsely reported
them as failures due to a response parsing issue. As a result, their follow-up
emails (stage updates and conversations) were NOT processed.

This script:
1. Skips lead creation (already exists)
2. Only processes conversations for the specific emails listed
3. Updates CRM stage based on email classification

Usage:
    python reprocess_missed_conversations.py [--dry-run]
"""

import argparse
import logging
import os
from datetime import datetime, timedelta

from psycopg2.extras import Json

from email_utils import (
    get_db_connection,
    classify_email,
    get_body_from_dict,
    format_html_content,
    determine_sent_or_received,
    call_conversation_webhook,
)
from email_backfill import (
    call_crm_contact_webhook,
    mark_email_processed,
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Leads that need follow-up email re-processing
# Format: (email, lead_name)
MISSED_LEADS = [
    ("nhi.quach001@gmail.com", "CRM-LEAD-2026-00147"),
    ("macielmeetsmonkey@gmail.com", "CRM-LEAD-2026-00193"),
    ("amanderzv@yahoo.com", "CRM-LEAD-2026-00185"),
    ("aprilymlim@gmail.com", "CRM-LEAD-2026-00186"),
    ("ediandra.cayabyab@gmail.com", "CRM-LEAD-2026-00190"),
    ("ngodi125@gmail.com", "CRM-LEAD-2026-00191"),
    ("philandsally94@gmail.com", "CRM-LEAD-2026-00195"),
    ("diepthethinh@gmail.com", "CRM-LEAD-2026-00198"),
    ("domaiphuong272@gmail.com", "CRM-LEAD-2026-00200"),
    ("jonathanphame@gmail.com", "CRM-LEAD-2026-00202"),
    ("zmayne.lkerrigan@gmail.com", "CRM-LEAD-2026-00204"),
]


def get_emails_for_contact(conn, contact_email: str) -> list[dict]:
    """Fetch all unprocessed emails for a specific contact."""
    with conn.cursor() as cur:
        cur.execute("""
            SELECT id, message_id, folder, subject, sender, recipient,
                   body_plain, body_html, email_date, has_attachments
            FROM staged_emails
            WHERE processed = FALSE
              AND (sender ILIKE %s OR recipient ILIKE %s)
            ORDER BY email_date ASC
        """, (f"%{contact_email}%", f"%{contact_email}%"))

        columns = [desc[0] for desc in cur.description]
        return [dict(zip(columns, row)) for row in cur.fetchall()]


def reprocess_conversations(dry_run: bool = False):
    """Re-process follow-up emails for leads that had conversations missed."""
    logger.info(f"Starting conversation re-processing (dry_run={dry_run})")
    logger.info(f"Processing {len(MISSED_LEADS)} leads")

    conn = get_db_connection()
    emails_processed = 0
    conversations_created = 0

    try:
        for contact_email, lead_name in MISSED_LEADS:
            logger.info(f"\n{'='*60}")
            logger.info(f"Processing: {contact_email} ({lead_name})")

            # Get all unprocessed emails for this contact
            emails = get_emails_for_contact(conn, contact_email)

            if not emails:
                logger.info(f"  No unprocessed emails found for {contact_email}")
                continue

            logger.info(f"  Found {len(emails)} unprocessed emails")

            for email_data in emails:
                email_date = email_data.get('email_date')
                if not email_date:
                    if not dry_run:
                        mark_email_processed(conn, email_data['id'], 'irrelevant', {})
                    continue

                body = get_body_from_dict(email_data)
                subject = email_data.get('subject', '')[:40]
                logger.info(f"  Processing: {subject}...")

                result = classify_email(
                    email_data.get('subject') or '',
                    body,
                    email_data.get('sender') or '',
                    email_data.get('recipient') or ''
                )
                result['email'] = contact_email
                classification = result.get('classification', 'irrelevant')

                if not dry_run:
                    mark_email_processed(conn, email_data['id'], classification, result)

                if classification == 'irrelevant':
                    logger.info(f"    Skipping irrelevant email")
                    continue

                timestamp = email_date.isoformat()

                if not dry_run:
                    # Update CRM stage
                    call_crm_contact_webhook(result, classification, timestamp)

                    # Create Communication record
                    call_conversation_webhook(
                        email=contact_email,
                        content=format_html_content(body[:3000] if body else ''),
                        sent_or_received=determine_sent_or_received(email_data),
                        subject=email_data.get('subject') or '',
                        timestamp=timestamp
                    )
                    conversations_created += 1

                emails_processed += 1

        # Summary
        logger.info(f"\n{'='*60}")
        logger.info("RE-PROCESSING COMPLETE")
        logger.info(f"  Emails processed: {emails_processed}")
        logger.info(f"  Conversations created: {conversations_created}")
        if dry_run:
            logger.info("  (DRY RUN - no actual changes made)")

    finally:
        conn.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Re-process follow-up emails for leads that had conversations missed"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Run without making changes"
    )
    args = parser.parse_args()

    reprocess_conversations(dry_run=args.dry_run)
